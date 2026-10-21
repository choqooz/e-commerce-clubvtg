import { writeFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

type Snapshot = {
  pseudo: string;
  name: string;
  duration: number | string;
  delay: number;
  easing: string;
  loading: boolean;
  typed: boolean;
  path: string;
};
type Participant = { tag: string; chrome: number; path: string };
type Frame = {
  path: string;
  loading: boolean;
  incoming: number;
  outgoing: number;
  chrome: { tag: string; opacity: string[] }[];
  body: string;
  root: string;
  owned: boolean;
  bootstrap: boolean;
  rootSnapshots: { pseudo: string; display: string; opacity: string; blend: string }[];
};
declare global {
  interface Window {
    storefrontEvidence: {
      animations: Snapshot[];
      loadingSeen: boolean;
      entries: number;
      participants: Participant[];
      frames: Frame[];
    };
  }
}

// Passive sampling only: never replace startViewTransition, its receiver, or promises.
async function observe(page: Page) {
  await page.addInitScript(() => {
    const evidence = {
      animations: [] as Snapshot[],
      loadingSeen: false,
      entries: 0,
      participants: [] as Participant[],
      frames: [] as Frame[],
    };
    window.storefrontEvidence = evidence;
    const seen = new WeakSet<Animation>();
    // React assigns then clears names around capture. Attribute records retain the
    // actual old snapshot owner even after it unmounts; never patch native APIs.
    new MutationObserver((records) => {
      for (const record of records) {
        const node = record.target as HTMLElement;
        const styles = `${record.oldValue ?? ""};${node.getAttribute("style") ?? ""}`;
        if (!/view-transition-name:\s*storefront-page\b/.test(styles)) continue;
        evidence.participants.push({
          tag: node.tagName,
          chrome: node.querySelectorAll("header.sticky, footer").length,
          path: location.pathname,
        });
      }
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
      attributeOldValue: true,
    });
    const sample = () => {
      const loading = !!document.querySelector('main[aria-busy="true"]');
      evidence.loadingSeen ||= loading;
      evidence.entries = Math.max(
        evidence.entries,
        document.querySelectorAll(".storefront-entry:not([hidden])").length,
      );
      for (const animation of document.getAnimations()) {
        if (seen.has(animation)) continue;
        seen.add(animation);
        const effect = animation.effect as KeyframeEffect | null;
        if (!effect) continue;
        const pseudo = effect.pseudoElement ?? "";
        if (!pseudo.startsWith("::view-transition")) continue;
        const timing = effect.getTiming();
        evidence.animations.push({
          pseudo,
          name: animation instanceof CSSAnimation ? animation.animationName : "WAAPI",
          duration: typeof timing.duration === "number" ? timing.duration : String(timing.duration),
          delay: timing.delay ?? 0,
          // CSS easing lives on each keyframe segment, not the effect's global timing.
          easing: effect.getKeyframes()[0]?.easing ?? timing.easing ?? "linear",
          loading,
          typed: document.documentElement.matches(
            ":active-view-transition-type(storefront-navigation)",
          ),
          path: location.pathname,
        });
      }
      if (
        loading ||
        document
          .getAnimations()
          .some((animation) =>
            (animation.effect as KeyframeEffect | null)?.pseudoElement?.startsWith(
              "::view-transition",
            ),
          )
      ) {
        const chrome = [...document.querySelectorAll<HTMLElement>("header.sticky, footer")]
          .filter((node) => node.getClientRects().length > 0)
          .map((node) => {
            const opacity: string[] = [];
            for (let current: HTMLElement | null = node; current; current = current.parentElement)
              opacity.push(getComputedStyle(current).opacity);
            return { tag: node.tagName, opacity };
          });
        evidence.frames.push({
          path: location.pathname,
          loading,
          incoming: Number(
            getComputedStyle(document.documentElement, "::view-transition-new(storefront-page)")
              .opacity,
          ),
          outgoing: Number(
            getComputedStyle(document.documentElement, "::view-transition-old(storefront-page)")
              .opacity,
          ),
          chrome,
          body: getComputedStyle(document.body).opacity,
          root: getComputedStyle(document.documentElement).opacity,
          owned: document.documentElement.hasAttribute("data-storefront-transition"),
          bootstrap: document.documentElement.matches(
            ":root:not([data-storefront-transition-ready]):has([data-storefront-scope])",
          ),
          rootSnapshots: ["group", "image-pair", "old", "new"].map((kind) => {
            const pseudo = `::view-transition-${kind}(root)`;
            const style = getComputedStyle(document.documentElement, pseudo);
            return {
              pseudo,
              display: style.display,
              opacity: style.opacity,
              blend: style.mixBlendMode,
            };
          }),
        });
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}

async function coldCatalog(page: Page) {
  const session = await page.context().newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.setCacheDisabled", { cacheDisabled: true });
  await observe(page);
  await page.goto("/#catalog");
  const products = page.locator('#catalog [data-collection-products] a[href^="/product/"]');
  await expect(products.first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-storefront-transition", "");
  const href = await products.first().getAttribute("href");
  expect(href).toMatch(/^\/product\//);
  // Delay only the read-only product transport; Next still owns streaming and commits.
  await page.route("**/product/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.continue();
  });
  await page.evaluate(() => {
    window.storefrontEvidence.animations = [];
    window.storefrontEvidence.loadingSeen = false;
    window.storefrontEvidence.participants = [];
    window.storefrontEvidence.frames = [];
  });
  return { products, href: href! };
}

function assertSequentialFade(animations: Snapshot[]) {
  const old = animations.filter((item) => item.name === "storefront-fade-out");
  const incoming = animations.filter((item) => item.name === "storefront-fade-in");
  expect(old.length).toBeGreaterThan(0);
  expect(incoming.length).toBeGreaterThan(0);
  for (const item of old) {
    expect(item.duration).toBe(100);
    expect(item.delay).toBe(0);
    expect(item.easing).toBe("ease-in-out");
    expect(item.pseudo).toBe("::view-transition-old(storefront-page)");
  }
  for (const item of incoming) {
    expect(item.duration).toBe(100);
    expect(item.delay).toBe(100);
    expect(item.easing).toBe("ease-in-out");
    expect(item.pseudo).toBe("::view-transition-new(storefront-page)");
  }
  // React may emit a zero-duration root geometry effect; it must never crossfade.
  expect(
    animations.filter((item) => item.pseudo.endsWith("(root)") && Number(item.duration) > 0),
  ).toEqual([]);
}

async function evidence(page: Page) {
  const result = await page.evaluate(() => window.storefrontEvidence);
  const path = test.info().outputPath("native-animation-evidence.json");
  await writeFile(path, JSON.stringify(result, null, 2));
  await test.info().attach("native-animation-evidence", { path, contentType: "application/json" });
  console.log(
    "Native animation evidence counts:",
    JSON.stringify({
      animations: result.animations.length,
      participants: result.participants.length,
      frames: result.frames.length,
      loadingSeen: result.loadingSeen,
      rootNonzero: result.animations.filter(
        (item) => item.pseudo.endsWith("(root)") && Number(item.duration) > 0,
      ).length,
      bootstrapFrames: result.frames.filter((frame) => frame.bootstrap && !frame.owned).length,
    }),
  );
  return result;
}

// Image checks use only public GET pages/assets. Never seed or mutate products.
const fullPhoto = ":scope > img[data-nimg]";
const tinyPhoto = ":scope > img[data-image-preview]";

async function photoPresentation(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((frames) =>
    frames.map((frame) => {
      const main = frame.querySelector<HTMLImageElement>(":scope > img[data-nimg]")!;
      const tiny = frame.querySelector<HTMLImageElement>(":scope > img[data-image-preview]");
      return {
        state: frame.getAttribute("data-state"),
        complete: main.complete,
        width: main.naturalWidth,
        opacity: getComputedStyle(main).opacity,
        duration: getComputedStyle(main).transitionDuration,
        preview: tiny && {
          src: tiny.currentSrc || tiny.src,
          complete: tiny.complete,
          width: tiny.naturalWidth,
          opacity: getComputedStyle(tiny).opacity,
          display: getComputedStyle(tiny).display,
          pointer: getComputedStyle(tiny).pointerEvents,
          alt: tiny.alt,
          hidden: tiny.getAttribute("aria-hidden"),
        },
      };
    }),
  );
}

test("first document shows decoded tiny SSR previews with scripts held, then every cold catalog photo stays covered until ready", async ({
  page,
}) => {
  let releaseScripts!: () => void;
  let releaseMain!: () => void;
  const scripts = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });
  const mains = new Promise<void>((resolve) => {
    releaseMain = resolve;
  });
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.resourceType() === "script") await scripts;
    if (
      request.resourceType() === "image" &&
      ((url.pathname === "/_next/image" && Number(url.searchParams.get("w")) > 32) ||
        url.pathname.startsWith("/storage/v1/object/"))
    )
      await mains;
    await route.continue();
  });
  try {
    await page.goto("/#catalog", { waitUntil: "commit" });
    const ssr = page.locator("#category-entry [data-progressive-image]");
    await expect(ssr.first()).toBeVisible();
    const scope = page.locator("[data-storefront-scope]").first();
    expect(await scope.evaluate((node) => getComputedStyle(node).display)).toBe("contents");
    expect(await scope.evaluate((node) => node.getClientRects().length)).toBe(0);
    expect(await page.locator("html").getAttribute("data-storefront-transition-ready")).toBeNull();
    expect(
      await page.locator("html").evaluate((node) => getComputedStyle(node).viewTransitionName),
    ).toBe("none");
    await expect
      .poll(async () => {
        const images = await photoPresentation(page, "#category-entry [data-progressive-image]");
        return (
          images.length > 0 &&
          images.every((image) => image.preview?.complete && image.preview.width > 0)
        );
      })
      .toBe(true);
    const firstDocument = await photoPresentation(page, "#category-entry [data-progressive-image]");
    for (const image of firstDocument) {
      expect(image.state).toBe("initial");
      expect(image.complete).toBe(false);
      expect(image.opacity).toBe("0");
      expect(image.preview).toMatchObject({
        opacity: "1",
        pointer: "none",
        alt: "",
        hidden: "true",
      });
      expect(new URL(image.preview!.src).searchParams.get("w")).toBe("32");
      expect(image.preview!.width).toBeLessThanOrEqual(32);
    }
    await page.screenshot({ path: test.info().outputPath("first-document-preview.png") });
    releaseScripts();
    const catalog = page.locator("#catalog [data-progressive-image]");
    await expect(catalog.first()).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-storefront-transition-ready", "");
    await expect
      .poll(async () => {
        const images = await photoPresentation(page, "#catalog [data-progressive-image]");
        return (
          images.length > 0 &&
          images.every((image) => image.preview?.complete && image.preview.width > 0)
        );
      })
      .toBe(true);
    const cold = await photoPresentation(page, "#catalog [data-progressive-image]");
    for (const image of cold) {
      expect(image.state).toBe("pending");
      expect(image.complete).toBe(false);
      expect(image.opacity).toBe("0");
      expect(image.preview?.opacity).toBe("1");
      expect(new URL(image.preview!.src).searchParams.get("w")).toBe("32");
    }
    releaseMain();
    await expect
      .poll(async () =>
        (await photoPresentation(page, "#catalog [data-progressive-image]")).every(
          (image) => image.complete && image.width > 0 && image.opacity === "1",
        ),
      )
      .toBe(true);
    const path = test.info().outputPath("first-document-image-evidence.json");
    await writeFile(path, JSON.stringify({ firstDocument, cold }, null, 2));
    await test.info().attach("first-document-images", { path, contentType: "application/json" });
  } finally {
    releaseScripts();
    releaseMain();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("actual no-JS home photos remain visible rather than permanently hidden behind previews", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await expect(page.locator("#category-entry [data-progressive-image]").first()).toBeVisible();
    await expect
      .poll(async () => {
        const images = await photoPresentation(page, "#category-entry [data-progressive-image]");
        return images.length > 0 && images.every((image) => image.complete && image.width > 0);
      })
      .toBe(true);
    expect(await page.evaluate(() => matchMedia("(scripting: none)").matches)).toBe(true);
    for (const image of await photoPresentation(page, "#category-entry [data-progressive-image]")) {
      expect(image.opacity).toBe("1");
      expect(image.preview?.display).toBe("none");
    }
  } finally {
    await context.close();
  }
});

test("maps every existing catalog/gallery product source to a genuine 32px preview or an honest unsupported fallback", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/#catalog");
  const links = page.locator('#catalog [data-collection-products] a[href^="/product/"]');
  await expect(links.first()).toBeVisible();
  const hrefs = [
    ...new Set(await links.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("href")!))),
  ];
  expect(hrefs.length).toBeGreaterThan(0);
  const mapping: { page: string; source: string; preview: string | null; supported: boolean }[] =
    [];
  for (const href of hrefs) {
    const response = await page.request.get(href);
    expect(response.ok()).toBe(true);
    const html = await response.text();
    const sources = await page.evaluate(
      ({ html, fullPhoto, tinyPhoto }) => {
        const doc = new DOMParser().parseFromString(html, "text/html");
        return [...doc.querySelectorAll("#product-active-image [data-progressive-image]")].map(
          (frame) => {
            const main = frame.querySelector<HTMLImageElement>(fullPhoto)!;
            const tiny = frame.querySelector<HTMLImageElement>(tinyPhoto);
            const url = new URL(main.getAttribute("src")!, location.origin);
            return {
              source:
                url.pathname === "/_next/image"
                  ? url.searchParams.get("url")!
                  : main.getAttribute("src")!,
              preview: tiny?.getAttribute("src") ?? null,
            };
          },
        );
      },
      { html, fullPhoto, tinyPhoto },
    );
    expect(sources.length, `all main gallery photos in ${href}`).toBeGreaterThan(0);
    for (const image of sources) {
      const url = new URL(image.source, "https://storefront.invalid");
      const supported =
        /\.(?:jpe?g|png|webp|avif)$/i.test(url.pathname) &&
        (image.source.startsWith("/") ||
          (url.protocol === "https:" &&
            !url.port &&
            !url.username &&
            !url.password &&
            (url.hostname === "img.clerk.com" ||
              (url.hostname.endsWith(".supabase.co") &&
                url.pathname.startsWith("/storage/v1/object/")))));
      mapping.push({ page: href, ...image, supported });
      if (!supported) {
        expect(image.preview).toBeNull();
        continue;
      }
      expect(image.preview).not.toBeNull();
      const tiny = new URL(image.preview!, page.url());
      expect(tiny.pathname).toBe("/_next/image");
      expect(tiny.searchParams.get("url")).toBe(image.source);
      expect(tiny.searchParams.get("w")).toBe("32");
      const asset = await page.request.get(tiny.href);
      expect(asset.ok(), tiny.href).toBe(true);
      // Decode actual optimizer bytes, not just URL heuristics or response labels.
      const dimensions = await page.evaluate(async (src) => {
        const image = new Image();
        image.src = src;
        await image.decode();
        return { width: image.naturalWidth, height: image.naturalHeight };
      }, tiny.href);
      expect(dimensions.width).toBeGreaterThan(0);
      expect(dimensions.width).toBeLessThanOrEqual(32);
      expect(dimensions.height).toBeGreaterThan(0);
    }
  }
  const path = test.info().outputPath("actual-product-preview-map.json");
  await writeFile(path, JSON.stringify(mapping, null, 2));
  await test.info().attach("actual-product-preview-map", { path, contentType: "application/json" });
});

test("a warm browser-complete photo settles cached immediately without a new opacity animation", async ({
  page,
}) => {
  // No routing: Playwright request interception disables the browser HTTP cache.
  await page.goto("/");
  const selector = "#category-entry [data-progressive-image]";
  await expect
    .poll(async () => {
      const images = await photoPresentation(page, selector);
      return (
        images.length > 0 &&
        images.every((image) => image.complete && image.width > 0 && image.opacity === "1")
      );
    })
    .toBe(true);
  await page.reload();
  await expect
    .poll(async () =>
      (await photoPresentation(page, selector)).some((image) => image.state === "cached"),
    )
    .toBe(true);
  const cached = (await photoPresentation(page, selector)).filter(
    (image) => image.state === "cached",
  );
  for (const image of cached) {
    expect(image.opacity).toBe("1");
    expect(image.duration).toBe("0s");
    expect(image.preview).toBeNull();
  }
  const cachedAnimations = await page
    .locator(`${selector}[data-state="cached"]`)
    .evaluateAll((frames) =>
      frames.flatMap((frame) =>
        frame
          .querySelector("img[data-nimg]")!
          .getAnimations()
          .map((animation) => animation.playState),
      ),
    );
  expect(cachedAnimations).toEqual([]);
});

// Each test gets a fresh context. Observe before the very first document commit:
// a root captured before scope ownership cannot be ruled out by live chrome opacity.
for (const [width, repeat] of [
  [390, 1],
  [1440, 1],
  [1440, 2],
  [1440, 3],
]) {
  test(`cold direct product suppresses captured root snapshots at ${width}px (run ${repeat})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await observe(page);
    let result: Awaited<ReturnType<typeof evidence>>;
    try {
      await page.goto("/product/campera-nike-vintage-00-s", { waitUntil: "commit" });
      await expect(
        page.getByRole("button", { name: "Agregar al carrito", exact: true }),
      ).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("data-storefront-transition", "");
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.storefrontEvidence.animations.some((item) => item.name === "storefront-fade-in"),
          ),
        )
        .toBe(true);
      // Include the full native 250ms window, not only the first named-main sample.
      await page.waitForFunction(
        () =>
          !document
            .getAnimations()
            .some((animation) =>
              (animation.effect as KeyframeEffect | null)?.pseudoElement?.startsWith(
                "::view-transition",
              ),
            ),
      );
    } finally {
      // Preserve first-commit evidence even when no named animation was observed.
      result = await evidence(page);
    }
    assertSequentialFade(result.animations);
    expect(result.participants.length).toBeGreaterThan(0);
    expect(result.participants.every((owner) => owner.tag === "MAIN" && owner.chrome === 0)).toBe(
      true,
    );
    const frames = result.frames.filter((frame) => frame.owned || frame.bootstrap);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.some((frame) => frame.bootstrap && !frame.owned)).toBe(true);
    expect(frames.some((frame) => frame.incoming > 0 && frame.incoming < 1)).toBe(true);
    for (const frame of frames) {
      for (const snapshot of frame.rootSnapshots) {
        expect(
          snapshot,
          "no captured root surface may cover the live chrome or named MAIN",
        ).toMatchObject({
          display: "none",
          opacity: "1",
          blend: "normal",
        });
      }
    }
  });
}

test("cold streaming product navigation uses the same named 100ms out/in boundary, including untyped reveal", async ({
  page,
}) => {
  const { products, href } = await coldCatalog(page);
  await products.first().click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.getByRole("button", { name: "Agregar al carrito", exact: true })).toBeVisible();
  await expect(page.locator('main[aria-busy="true"]')).toHaveCount(0);
  // DOM visibility can precede native snapshot readiness (React waits for images).
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.storefrontEvidence.animations.some(
            (item) => !item.typed && !item.loading && item.name === "storefront-fade-in",
          ),
        ),
      { timeout: 10000 },
    )
    .toBe(true);
  const result = await evidence(page);
  expect(result.loadingSeen).toBe(true);
  expect(result.entries).toBe(1);
  assertSequentialFade(result.animations);
  expect(result.animations.some((item) => item.typed)).toBe(true);
  expect(result.animations.some((item) => !item.typed && item.name === "storefront-fade-in")).toBe(
    true,
  );
  await expect(page.locator(".storefront-entry:visible")).toHaveCount(1);
  expect(
    await page
      .locator(".storefront-entry:visible")
      .evaluate((node) => getComputedStyle(node).animationName),
  ).toBe("none");
});

for (const width of [390, 1440]) {
  test(`only main fades through category → cold product → header logo at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const { products } = await coldCatalog(page);
    const category = page.locator("#collection-category");
    const values = await category
      .locator('option[value^="type:"]')
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
    let selected = false;
    for (const value of values) {
      await category.selectOption(value);
      if (await products.count()) {
        selected = true;
        break;
      }
    }
    expect(selected, "a public category containing an existing product").toBe(true);
    await products.first().evaluate((node: HTMLAnchorElement) => node.click());
    await expect(page.locator('main[aria-busy="true"]')).toBeVisible();
    // Opening the existing cart changes no business data. It must remain live,
    // outside the snapshot, even while the route is still streaming.
    await page
      .getByRole("button", { name: "Carrito", exact: true })
      .evaluate((node: HTMLButtonElement) => node.click());
    await expect(page.getByRole("dialog")).toBeVisible();
    // Radix correctly hides the background from the accessibility tree while
    // modal; inspect its rendered main without weakening the modal contract.
    await expect(
      page.locator("main button").filter({ hasText: /^Agregar al carrito$/ }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .locator('header.sticky a[aria-label="clubvtg — Inicio"]')
      .evaluate((node: HTMLAnchorElement) => node.click());
    await page.waitForFunction(() =>
      window.storefrontEvidence.frames.some(
        (frame) => frame.path === "/" && frame.incoming > 0 && frame.incoming < 1,
      ),
    );
    // Screenshot is corroborating viewport evidence; RAF samples, not screenshot
    // latency or fixed sleeps, establish the short intermediate opacity window.
    await page.screenshot({ path: test.info().outputPath(`main-only-${width}.png`) });
    await expect(page.locator("#category-entry")).toBeVisible();
    const result = await evidence(page);
    expect(result.loadingSeen).toBe(true);
    expect(result.participants.length).toBeGreaterThan(0);
    expect(result.participants.every((owner) => owner.tag === "MAIN" && owner.chrome === 0)).toBe(
      true,
    );
    expect(
      result.frames.some(
        (frame) => frame.path.startsWith("/product/") && frame.incoming > 0 && frame.incoming < 1,
      ),
    ).toBe(true);
    expect(
      result.frames.some((frame) => frame.path === "/" && frame.incoming > 0 && frame.incoming < 1),
    ).toBe(true);
    for (const frame of result.frames) {
      expect(frame.body).toBe("1");
      expect(frame.root).toBe("1");
      expect(frame.chrome.map((node) => node.tag).sort()).toEqual(["FOOTER", "HEADER"]);
      expect(frame.chrome.every((node) => node.opacity.every((opacity) => opacity === "1"))).toBe(
        true,
      );
    }
    assertSequentialFade(result.animations);
  });
}

test("initial reduced motion suppresses both cold navigation and streamed reveal snapshots", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { products } = await coldCatalog(page);
  await products.first().click();
  await expect(page.getByRole("button", { name: "Agregar al carrito", exact: true })).toBeVisible();
  await page.waitForTimeout(300);
  const result = await evidence(page);
  expect(result.loadingSeen).toBe(true);
  expect(result.animations.filter((item) => Number(item.duration) > 0)).toEqual([]);
  expect(
    await page
      .locator(".storefront-entry:visible")
      .evaluate((node) => getComputedStyle(node).opacity),
  ).toBe("1");
});

test("live reduced motion settles an active route snapshot immediately", async ({ page }) => {
  const { products } = await coldCatalog(page);
  // Trigger the real React Link handler without Playwright waiting for animation stability.
  await products.first().evaluate((node: HTMLAnchorElement) => node.click());
  const interrupted = await page.waitForFunction(
    () => {
      const opacity = Number(
        getComputedStyle(document.documentElement, "::view-transition-new(storefront-page)")
          .opacity,
      );
      const running = document.getAnimations().some((animation) => {
        const effect = animation.effect as KeyframeEffect | null;
        return (
          animation instanceof CSSAnimation &&
          animation.animationName === "storefront-fade-in" &&
          effect?.pseudoElement === "::view-transition-new(storefront-page)" &&
          typeof animation.currentTime === "number" &&
          animation.currentTime > 110 &&
          animation.currentTime < 180 &&
          animation.playState === "running"
        );
      });
      return running && opacity > 0 && opacity < 1 ? { opacity } : false;
    },
    undefined,
    { polling: "raf" },
  );
  expect(await interrupted.jsonValue()).toMatchObject({ opacity: expect.any(Number) });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const settled = await page.evaluate(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return {
      running: document
        .getAnimations()
        .filter(
          (animation) =>
            (animation.effect as KeyframeEffect | null)?.pseudoElement?.includes(
              "(storefront-page)",
            ) && animation.playState === "running",
        ).length,
      // A reduced, zero-duration streamed reveal can already be active. What must
      // settle immediately is snapshot opacity, not React's transition lifecycle.
      incomingOpacity: getComputedStyle(
        document.documentElement,
        "::view-transition-new(storefront-page)",
      ).opacity,
    };
  });
  expect(settled).toEqual({ running: 0, incomingOpacity: "1" });
  await expect(page.getByRole("button", { name: "Agregar al carrito", exact: true })).toBeVisible();
  expect(
    await page
      .locator(".storefront-entry:visible")
      .evaluate((node) => getComputedStyle(node).opacity),
  ).toBe("1");
  const result = await evidence(page);
  expect(
    result.animations.filter((item) => item.pseudo.endsWith("(root)") && Number(item.duration) > 0),
  ).toEqual([]);
});

test("browser history restores the catalog and product without an unrelated root fade", async ({
  page,
}) => {
  const { products, href } = await coldCatalog(page);
  const count = await products.count();
  await products.first().click();
  await expect(page.getByRole("button", { name: "Agregar al carrito", exact: true })).toBeVisible();
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.storefrontEvidence.animations = [];
  });
  await page.goBack();
  await expect(page).toHaveURL(/\/#catalog$/);
  await expect(page.locator("#catalog")).toBeVisible();
  await page.waitForTimeout(300);
  const result = await evidence(page);
  await expect(products).toHaveCount(count);
  await expect(products.first()).toHaveAttribute("href", href);
  expect(
    result.animations.filter((item) => item.pseudo.endsWith("(root)") && Number(item.duration) > 0),
  ).toEqual([]);
  expect(result.animations.every((item) => !item.typed)).toBe(true);
  await page.goForward();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  await expect(page.getByRole("button", { name: "Agregar al carrito", exact: true })).toBeVisible();
});
