import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import Image from "next/image";
import Link from "next/link";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { compile } from "tailwindcss";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CheckoutFailurePage from "@/app/(shop)/checkout/failure/page";
import CheckoutPage from "@/app/(shop)/checkout/page";
import CheckoutPendingPage from "@/app/(shop)/checkout/pending/page";
import CheckoutSuccessPage from "@/app/(shop)/checkout/success/page";
import { formatPrice, SHIPPING_FEE } from "@/lib/config";
import { quoteRequestKey } from "@/lib/coupon-choice";
import { checkoutSchema, type CheckoutFormValues } from "@/lib/validations/checkout";
import { CartClearOnAuthoritativePayment } from "./cart-clear-on-authoritative-payment";
import { CheckoutForm } from "./checkout-form";
import { CouponSelection } from "./coupon-selection";
import { PaymentReconciliationHandoff } from "./payment-reconciliation-handoff";

// Shallow React trees and isolated boundaries only: no DOM, browser navigation,
// auth, payment service or database. Errors come from the unchanged real schema.
const probe = vi.hoisted(() => ({
  cart: {
    items: [] as {
      product: {
        id: string;
        title: string;
        category: string;
        size: string | null;
        price: number;
        image_urls: string[];
      };
      quantity: number;
    }[],
    totalPrice: 34567,
    couponCode: "",
    couponSource: null as "coupon" | null,
    clearCouponSelection: vi.fn(),
    getCouponQuoteVersion: vi.fn(() => 1),
    isCouponQuoteVersionCurrent: vi.fn(() => true),
    selectCoupon: vi.fn(),
    setCouponCode: vi.fn(),
  },
  submitting: false,
  errors: {} as Record<string, { message: string }>,
  setSubmitting: vi.fn(),
  quoteState: null as unknown,
  setQuoteState: vi.fn(),
  quote: vi.fn(),
  preference: vi.fn(),
  capture: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
  register: vi.fn((name: string) => ({ name })),
  formOptions: vi.fn(),
  handleSubmit: vi.fn((handler: (data: unknown) => Promise<void>) => handler),
  bfcache: vi.fn(() => vi.fn()),
  effects: [] as (() => unknown)[],
  refs: [] as { current: unknown }[],
  ownedOrder: vi.fn(),
  outcome: "success",
  paid: true,
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  assign: vi.fn(),
  fetch: vi.fn(() => {
    throw new Error("Unexpected network request");
  }),
}));
vi.mock("@/contexts/cart-context", () => ({ useCart: () => probe.cart }));
vi.mock("@/lib/actions/checkout", () => ({ createCheckoutPreference: probe.preference }));
vi.mock("@/lib/actions/coupon-quote", () => ({ quoteCouponCheckout: probe.quote }));
vi.mock("@/lib/checkout-bfcache", () => ({ registerCheckoutBfcacheReset: probe.bfcache }));
vi.mock("posthog-js/react", () => ({ usePostHog: () => ({ capture: probe.capture }) }));
vi.mock("sonner", () => ({ toast: { error: probe.toastError, info: probe.toastInfo } }));
vi.mock("react-hook-form", () => ({
  useForm: (options: unknown) => {
    probe.formOptions(options);
    return {
      register: probe.register,
      handleSubmit: probe.handleSubmit,
      formState: { errors: probe.errors },
    };
  },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) =>
    typeof initial === "boolean"
      ? [probe.submitting, probe.setSubmitting]
      : [probe.quoteState ?? initial, probe.setQuoteState],
  useEffect: (effect: () => unknown) => {
    probe.effects.push(effect);
  },
  useRef: (initial: unknown) => {
    const ref = { current: initial };
    probe.refs.push(ref);
    return ref;
  },
}));
vi.mock("@/components/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("@/components/cart-clear-on-authoritative-payment", () => ({
  CartClearOnAuthoritativePayment: () => null,
}));
vi.mock("next/navigation", () => ({ redirect: probe.redirect }));
vi.mock("@/lib/payments/return-authority", () => ({
  PRODUCT_RETURN_OUTCOME: { SUCCESS: "success" },
  getOwnedProductReturnOrderForCurrentUser: probe.ownedOrder,
  getProductReturnOutcome: () => probe.outcome,
  isAuthoritativelyPaidProductReturn: () => probe.paid,
}));
type Element = ReactElement<{ children?: ReactNode; className?: string; [key: string]: unknown }>;
const descendants = (node: ReactNode): Element[] =>
  Children.toArray(node).flatMap((child) =>
    isValidElement(child)
      ? [child as Element, ...descendants((child as Element).props.children)]
      : [],
  );
const elements = (tree: ReactNode, type: unknown) =>
  descendants(tree).filter((element) => element.type === type);
const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const paths = [
  "src/app/(shop)/checkout/page.tsx",
  "src/app/(shop)/checkout/success/page.tsx",
  "src/app/(shop)/checkout/failure/page.tsx",
  "src/app/(shop)/checkout/pending/page.tsx",
  "src/components/checkout-form.tsx",
  "src/components/coupon-selection.tsx",
  "src/components/payment-reconciliation-handoff.tsx",
];
const validData: CheckoutFormValues = {
  fullName: "Ada Lovelace",
  email: "buyer@example.test",
  dni: "12345678",
  phone: "1144445555",
  street: "Rivadavia",
  number: "123",
  floorOrApt: "4B",
  city: "CABA",
  province: "Buenos Aires",
  zipCode: "1000",
};
const filledCart = () => {
  probe.cart.items = [
    {
      product: {
        id: "v3-garment",
        title: "Camisa de lino natural con un título extenso para pantallas pequeñas",
        category: "hombre",
        size: "M",
        price: 10000,
        image_urls: ["/front.jpg", "/back.jpg"],
      },
      quantity: 2,
    },
  ];
};
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(probe.cart, { items: [], totalPrice: 34567, couponCode: "", couponSource: null });
  Object.assign(probe, {
    submitting: false,
    errors: {},
    quoteState: null,
    effects: [],
    refs: [],
    outcome: "success",
    paid: true,
  });
  probe.preference.mockReset().mockResolvedValue({
    success: true,
    initPoint: "https://payment.example.test",
    sandboxInitPoint: "https://unused.example.test",
  });
  probe.ownedOrder.mockResolvedValue({ id: "fixture-order" });
  vi.stubGlobal("window", { location: { assign: probe.assign } });
  vi.stubGlobal("fetch", probe.fetch);
});
afterEach(() => {
  try {
    expect(probe.fetch).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});

// V3 began with all seven sources clean at this fixed commit, not a moving HEAD.
// Keep the complete AST, including JSX guards/copy/props, rather than a shortlist
// of business expressions. Only exact intentional presentation changes normalize.
const PRETASK_COMMIT = "41679236782abed3b2de9503075195e5e2b90ff3";
function restorePresentation(text: string, path: string) {
  if (path === paths[4]) {
    text = text.replace(/<(\/?)fieldset\b/g, "<$1div").replace(/<(\/?)legend\b/g, "<$1h3");
    for (const field of Object.keys(validData)) {
      for (const attribute of [
        `id="checkout-${field}"`,
        `htmlFor="checkout-${field}"`,
        `id="checkout-${field}-error"`,
        `aria-invalid={Boolean(form.formState.errors.${field})}`,
      ])
        text = text.replace(attribute, "");
      // Formatting may wrap the exact existing expression inside its braces.
      // The field, error ID and conditional remain an exact allowlist match.
      text = text.replace(
        new RegExp(
          `aria-describedby=\\{\\s*form\\.formState\\.errors\\.${field}\\s*\\?\\s*"checkout-${field}-error"\\s*:\\s*undefined\\s*\\}`,
        ),
        "",
      );
    }
    text = text.replaceAll('aria-live="polite"', "").replace("aria-busy={isSubmitting}", "");
  }
  if (path === paths[0])
    text = text
      .replace(/<(\/?)aside\b/g, "<$1div")
      .replace('aria-labelledby="checkout-summary-heading"', "")
      .replace('id="checkout-summary-heading"', "")
      .replace('sizes="(min-width: 1280px) 104px, 88px"', 'sizes="64px"');
  return text;
}
function isRenderedText(value: unknown): value is [ts.SyntaxKind.JsxText, string] {
  return Array.isArray(value) && value[0] === ts.SyntaxKind.JsxText && typeof value[1] === "string";
}
function behavior(node: ts.Node): unknown {
  if (ts.isParenthesizedExpression(node)) return behavior(node.expression);
  // Prettier's explicit single-space child is equivalent to inline JSX text,
  // but must not be discarded: missing/extra spaces still change the signature.
  if (
    ts.isJsxExpression(node) &&
    node.expression &&
    ts.isStringLiteral(node.expression) &&
    node.expression.text === " " &&
    (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
  )
    return [ts.SyntaxKind.JsxText, " "];
  if (ts.isJsxAttribute(node) && node.name.getText() === "className") return undefined;
  if (ts.isJsxText(node)) {
    const lines = node.text.split(/\r\n|\n|\r/);
    const last = lines.findLastIndex((line) => /[^ \t]/.test(line));
    const text = lines
      .map((line, index) => {
        let content = line.replace(/\t/g, " ");
        if (index !== 0) content = content.replace(/^ +/, "");
        if (index !== lines.length - 1) content = content.replace(/ +$/, "");
        return content && index !== last ? `${content} ` : content;
      })
      .join("");
    return text ? [node.kind, text] : undefined;
  }
  const children: unknown[] = [];
  ts.forEachChild(node, (child) => {
    const value = behavior(child);
    if (value === undefined) return;
    const previous = children.at(-1);
    if (isRenderedText(previous) && isRenderedText(value)) previous[1] += value[1];
    else children.push(value);
  });
  return [
    node.kind,
    ts.isIdentifier(node) ||
    ts.isLiteralExpression(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
      ? node.text
      : null,
    children,
  ];
}
const signature = (text: string, path: string) =>
  behavior(
    ts.createSourceFile(
      "surface.tsx",
      restorePresentation(text, path),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    ),
  );

describe("V3 immutable pretask preservation", () => {
  it.each(paths)("retains every nonpresentation AST node in %s", (path) => {
    const baseline = execFileSync("git", ["show", `${PRETASK_COMMIT}:${path}`], {
      encoding: "utf8",
    });
    expect(signature(source(path), path)).toEqual(signature(baseline, path));
  });
  it("normalizes only wrapping of the exact permitted error association", () => {
    const singleLine =
      '<input aria-describedby={form.formState.errors.fullName ? "checkout-fullName-error" : undefined} disabled={isSubmitting} />';
    const wrapped =
      '<input aria-describedby={\n form.formState.errors.fullName ? "checkout-fullName-error" : undefined\n} disabled={isSubmitting} />';
    expect(signature(wrapped, paths[4])).toEqual(signature(singleLine, paths[4]));
    for (const [before, after] of [
      ["errors.fullName", "errors.email"],
      ["checkout-fullName-error", "checkout-email-error"],
      ["undefined", '"other-description"'],
      ["disabled={isSubmitting}", "disabled={false}"],
    ])
      expect(signature(wrapped.replace(before, after), paths[4])).not.toEqual(
        signature(singleLine, paths[4]),
      );
  });
  it("normalizes explicit JSX spaces without erasing copy, amounts or meaningful whitespace", () => {
    const inline = "<span>Descuento: {amount} · Total con envío: {total}</span>";
    const wrapped = '<span>\n Descuento: {amount} · Total con envío:{" "}\n {total}\n</span>';
    expect(signature(wrapped, paths[5])).toEqual(signature(inline, paths[5]));
    for (const [before, after] of [
      ['{" "}', ""],
      ['{" "}', '{"  "}'],
      ["Descuento:", "Precio:"],
      ["{total}", "{subtotal}"],
    ])
      expect(signature(wrapped.replace(before, after), paths[5])).not.toEqual(
        signature(inline, paths[5]),
      );
    expect(signature('<p>A{" "}B</p>', paths[5])).toEqual(signature("<p>A B</p>", paths[5]));
    expect(signature('<p>A{" "}{" "}B</p>', paths[5])).not.toEqual(
      signature("<p>A B</p>", paths[5]),
    );
  });
  it("rejects submission, validation, pricing, preference, recovery, redirect and coupon mutations", () => {
    for (const [path, before, after] of [
      [paths[4], "zodResolver(checkoutSchema)", "zodResolver(otherSchema)"],
      [paths[4], "items.length === 0", "items.length === 1"],
      [paths[4], "isSubmitting || items.length === 0", "isSubmitting"],
      [paths[4], "registerCheckoutBfcacheReset", "ignoreCheckoutBfcacheReset"],
      [paths[4], "res.resumed", "false"],
      [paths[4], "res.initPoint", "res.sandboxInitPoint"],
      [paths[4], "window.location.assign(url)", "window.location.replace(url)"],
      [paths[4], "toCouponCheckoutSelection", "ignoreCouponSelection"],
      [paths[0], "totalPrice + SHIPPING_FEE", "totalPrice"],
      [paths[0], "item.product.price", "item.product.current_price"],
      [paths[5], "isCurrentCouponQuoteResponse", "ignoreQuoteResponse"],
      [paths[5], "quantity: 1 as const", "quantity: 2 as const"],
      [paths[6], 'method="post"', 'method="get"'],
      [paths[6], "submitted.current = true", "submitted.current = false"],
      [paths[1], "isAuthoritativelyPaidProductReturn", "ignorePaymentAuthority"],
      [paths[2], 'href="/checkout"', 'href="/"'],
      [paths[3], "Pago Pendiente", "Pago Exitoso"],
    ]) {
      const text = source(path);
      expect(text, before).toContain(before);
      expect(signature(text.replace(before, after), path), before).not.toEqual(
        signature(text, path),
      );
    }
  });
});

describe("V3 comfortable accessible form and summary", () => {
  it.each([false, true])(
    "retains all registrations, grouping and pending guards with submitting=%s",
    (submitting) => {
      filledCart();
      probe.submitting = submitting;
      const tree = CheckoutForm();
      expect(tree.props["aria-busy"]).toBe(submitting);
      expect(probe.register.mock.calls.map(([name]) => name)).toEqual(Object.keys(validData));
      expect(probe.formOptions.mock.calls[0][0]).toMatchObject({
        defaultValues: Object.fromEntries(Object.keys(validData).map((key) => [key, ""])),
        resolver: expect.any(Function),
      });
      expect(elements(tree, "legend").map((legend) => legend.props.children)).toEqual([
        "Datos de Contacto",
        "Datos de Envío (Correo Argentino)",
      ]);
      expect(elements(tree, "fieldset")).toHaveLength(2);
      const inputs = elements(tree, "input");
      expect(inputs).toHaveLength(10);
      for (const input of inputs) {
        expect(input.props.disabled).toBe(submitting);
        expect(input.props.className).toContain("h-[48px]");
        expect(input.props.className).toContain("text-[16px]");
        expect(input.props.className).toContain("focus-visible:outline-2");
        expect(
          elements(tree, "label").some((label) => label.props.htmlFor === input.props.id),
        ).toBe(true);
        expect(input.props["aria-describedby"]).toBeUndefined();
        if (input.props.name !== "floorOrApt") expect(input.props["aria-invalid"]).toBe(false);
      }
      const button = elements(tree, "button")[0];
      expect(button.props).toMatchObject({ type: "submit", disabled: submitting });
      expect(button.props.className).toContain("min-h-[48px]");
      expect(elements(tree, CouponSelection)).toHaveLength(1);
      expect(button.props.children === "Pagar con MercadoPago").toBe(!submitting);
      expect(
        elements(tree, "div").some((group) =>
          group.props.className?.includes("grid-cols-1 sm:grid-cols-2 md:grid-cols-4"),
        ),
      ).toBe(true);
      expect(probe.preference).not.toHaveBeenCalled();
    },
  );
  it("keeps the empty submit guard and registers BFCache reset through the existing effect", () => {
    expect(elements(CheckoutForm(), "button")[0].props.disabled).toBe(true);
    expect(probe.effects).toHaveLength(1);
    probe.effects[0]();
    expect(probe.bfcache).toHaveBeenCalledExactlyOnceWith(window, probe.setSubmitting);
  });
  it("associates each unchanged schema message with a readable invalid field, not optional apartment", () => {
    const result = checkoutSchema.safeParse(
      Object.fromEntries(Object.keys(validData).map((key) => [key, ""])),
    );
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected the real empty-input validation errors");
    probe.errors = Object.fromEntries(
      result.error.issues.map((issue) => [issue.path[0], { message: issue.message }]),
    );
    const tree = CheckoutForm();
    for (const [name, error] of Object.entries(probe.errors)) {
      const input = elements(tree, "input").find((element) => element.props.name === name)!;
      expect(input.props["aria-invalid"]).toBe(true);
      expect(input.props["aria-describedby"]).toBe(`${input.props.id}-error`);
      const message = elements(tree, "p").find(
        (element) => element.props.id === input.props["aria-describedby"],
      )!;
      expect(message.props.children).toBe(error.message);
      expect(message.props["aria-live"]).toBe("polite");
      expect(message.props.className).toContain("text-[15px] leading-[1.5]");
    }
    const optional = elements(tree, "input").find((input) => input.props.name === "floorOrApt")!;
    expect(optional.props["aria-invalid"]).toBeUndefined();
    expect(optional.props["aria-describedby"]).toBeUndefined();
  });
  it("composes a named, desktop-sticky summary without truncating products or recomputing prices", () => {
    filledCart();
    const tree = CheckoutPage();
    const summary = elements(tree, "aside")[0];
    expect(summary.props["aria-labelledby"]).toBe(elements(summary, "h2")[0].props.id);
    expect(summary.props.className).toContain("lg:sticky lg:top-[156px]");
    expect(summary.props.className).not.toMatch(/(?:^| )sticky|fixed/);
    expect(elements(tree, "h1")[0].props.className).toContain("text-[42px] sm:text-[60px]");
    const title = elements(summary, "h4")[0];
    expect(title.props.children).toBe(probe.cart.items[0].product.title);
    expect(title.props.className).toContain("break-words");
    expect(title.props.className).not.toMatch(/truncate|line-clamp/);
    expect(elements(summary, Image)[0].props).toMatchObject({
      src: "/front.jpg",
      alt: title.props.children,
      fill: true,
      sizes: "(min-width: 1280px) 104px, 88px",
    });
    expect(elements(summary, "span").map((span) => span.props.children)).toEqual([
      "Subtotal",
      formatPrice(34567),
      "Envío (Correo Argentino)",
      formatPrice(SHIPPING_FEE),
      "Total",
      formatPrice(34567 + SHIPPING_FEE),
    ]);
    expect(elements(tree, CheckoutForm)).toHaveLength(1);
  });
  it("retains empty checkout and truthful image/size fallback without adding a purchase action", () => {
    const empty = CheckoutPage();
    expect(elements(empty, CheckoutForm)).toHaveLength(0);
    expect(elements(empty, Link).map((link) => link.props.href)).toEqual(["/", "/", "/"]);
    filledCart();
    Object.assign(probe.cart.items[0].product, { image_urls: [], size: null });
    const summary = elements(CheckoutPage(), "aside")[0];
    expect(elements(summary, Image)).toHaveLength(0);
    expect(elements(summary, "span")[0].props.children).toBe("hombre");
    expect(elements(summary, "p")[0].props.children).toEqual(["Talle ", "Único"]);
  });
});

describe("Existing checkout submission with mocked services, never a purchase", () => {
  const submit = () => CheckoutForm().props.onSubmit(validData);
  it("passes unchanged data/items/coupon selection and redirects only to initPoint", async () => {
    filledCart();
    Object.assign(probe.cart, { couponCode: "AHORRO20", couponSource: "coupon" });
    await submit();
    expect(probe.preference).toHaveBeenCalledExactlyOnceWith(validData, probe.cart.items, {
      couponCode: "AHORRO20",
      source: "coupon",
    });
    expect(probe.setSubmitting).toHaveBeenCalledExactlyOnceWith(true);
    expect(probe.assign).toHaveBeenCalledExactlyOnceWith("https://payment.example.test");
    expect(probe.capture).toHaveBeenCalledOnce();
  });
  it("keeps the no-items guard before telemetry and the preference request", async () => {
    await submit();
    expect(probe.toastError).toHaveBeenCalledExactlyOnceWith("Tu carrito está vacío");
    expect(probe.preference).not.toHaveBeenCalled();
    expect(probe.capture).not.toHaveBeenCalled();
  });
  it.each(["rejected", "missing-url", "exception"])(
    "restores interactivity on %s without redirecting",
    async (kind) => {
      filledCart();
      if (kind === "exception") probe.preference.mockRejectedValue(new Error("fixture failure"));
      else
        probe.preference.mockResolvedValue(
          kind === "rejected" ? { success: false, error: "fixture error" } : { success: true },
        );
      await submit();
      expect(probe.setSubmitting.mock.calls).toEqual([[true], [false]]);
      expect(probe.toastError).toHaveBeenCalledOnce();
      expect(probe.assign).not.toHaveBeenCalled();
    },
  );
  it("retains the resumed-order notification and 1500ms delay before handing off", async () => {
    vi.useFakeTimers();
    filledCart();
    probe.preference.mockResolvedValue({
      success: true,
      resumed: true,
      initPoint: "https://payment.example.test",
    });
    const pending = submit();
    await Promise.resolve();
    expect(probe.toastInfo).toHaveBeenCalledExactlyOnceWith(
      "Hay un pago pendiente. Retomaremos la misma orden con los datos de envío, contacto y precio originales.",
    );
    await vi.advanceTimersByTimeAsync(1499);
    expect(probe.assign).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(probe.assign).toHaveBeenCalledExactlyOnceWith("https://payment.example.test");
  });
});

describe("Shared coupon presentation retains its existing API and actions", () => {
  it("keeps touch-sized quote/remove buttons as non-submit actions and preserves editing", () => {
    filledCart();
    probe.cart.couponCode = "AHORRO20";
    const tree = CouponSelection();
    const input = elements(tree, "input")[0];
    expect(input.props.className).toContain("h-[48px]");
    for (const button of elements(tree, "button")) {
      expect(button.props.type).toBe("button");
      expect(button.props.className).toContain("min-h-[48px]");
    }
    (input.props.onChange as (event: unknown) => void)({ target: { value: "nuevo" } });
    expect(probe.cart.setCouponCode).toHaveBeenCalledExactlyOnceWith("nuevo");
    (elements(tree, "button")[0].props.onClick as () => void)();
    expect(probe.cart.setCouponCode).toHaveBeenLastCalledWith("");
    expect(probe.quote).not.toHaveBeenCalled();
  });
  it("keeps quote choices, money and explicit coupon selection behind the same server action", async () => {
    filledCart();
    probe.cart.couponCode = "AHORRO20";
    const quote = {
      promotionDiscountCents: 1000,
      promotionsPayableCents: 9000,
      couponDiscountCents: 2000,
      couponPayableCents: 8000,
    };
    probe.quote.mockResolvedValue({ success: true, quote });
    const tree = CouponSelection();
    (elements(tree, "button").at(-1)!.props.onClick as () => void)();
    await vi.waitFor(() =>
      expect(probe.setQuoteState).toHaveBeenLastCalledWith({
        error: null,
        key: quoteRequestKey("AHORRO20", ["v3-garment"]),
        quote,
        status: "success",
      }),
    );
    expect(probe.quote).toHaveBeenCalledExactlyOnceWith(
      [{ product: { id: "v3-garment" }, quantity: 1 }],
      "AHORRO20",
      undefined,
    );
    probe.quoteState = probe.setQuoteState.mock.calls.at(-1)![0];
    const quoted = CouponSelection();
    const choices = elements(quoted, "input").filter((input) => input.props.type === "radio");
    expect(choices.map((choice) => choice.props.checked)).toEqual([true, false]);
    expect(elements(quoted, "fieldset")[0].props["aria-describedby"]).toBe("coupon-selection-note");
    for (const label of elements(quoted, "label").filter((label) =>
      label.props.className?.includes("cursor-pointer"),
    ))
      expect(label.props.className).toContain("min-h-[48px]");
    (choices[1].props.onChange as () => void)();
    await vi.waitFor(() => expect(probe.cart.selectCoupon).toHaveBeenCalledOnce());
    expect(probe.quote).toHaveBeenLastCalledWith(
      [{ product: { id: "v3-garment" }, quantity: 1 }],
      "AHORRO20",
      "coupon",
    );
    expect(probe.cart.clearCouponSelection).toHaveBeenCalledTimes(2);
    expect(probe.preference).not.toHaveBeenCalled();
  });
  it("keeps readable quote errors and existing loading/empty-code guards", () => {
    filledCart();
    probe.cart.couponCode = "AHORRO20";
    const key = quoteRequestKey(probe.cart.couponCode, ["v3-garment"]);
    probe.quoteState = { key, quote: null, error: "Cupón inválido", status: "error" };
    const error = elements(CouponSelection(), "p").find(
      (element) => element.props.role === "alert",
    )!;
    expect(error.props.children).toBe("Cupón inválido");
    expect(error.props.className).toContain("text-[15px] leading-[1.5]");
    probe.quoteState = { key, quote: null, error: null, status: "loading" };
    const loading = CouponSelection();
    expect(elements(loading, "input")[0].props.disabled).toBe(true);
    expect(elements(loading, "button").every((button) => button.props.disabled)).toBe(true);
    probe.cart.couponCode = " ";
    probe.quoteState = null;
    expect(elements(CouponSelection(), "button").at(-1)!.props.disabled).toBe(true);
  });
});

describe("Consistent payment outcome and manual handoff panels", () => {
  it("composes the same sand panel, restrained display and touch actions for every outcome", async () => {
    const trees = [
      CheckoutFailurePage(),
      CheckoutPendingPage(),
      await CheckoutSuccessPage({ searchParams: Promise.resolve({ order_id: "fixture-order" }) }),
    ];
    expect(trees.map((tree) => elements(tree, "h1")[0].props.children)).toEqual([
      "Pago Rechazado",
      "Pago Pendiente",
      "¡Pago Exitoso!",
    ]);
    const panelClasses = trees.map(
      (tree) => elements(elements(tree, "main")[0], "div")[0].props.className,
    );
    expect(new Set(panelClasses).size).toBe(1);
    for (const tree of trees) {
      expect(elements(tree, "h1")[0].props.className).toContain("text-[42px] sm:text-[60px]");
      expect(elements(tree, "p")[0].props.className).toContain("max-w-[48ch]");
      for (const link of elements(tree, Link)) {
        expect(link.props.className).toContain("min-h-[48px]");
        expect(link.props.className).toContain("focus-visible:outline-2");
      }
    }
    expect(elements(trees[0], Link).map((link) => link.props.href)).toEqual(["/checkout", "/"]);
    expect(elements(trees[2], CartClearOnAuthoritativePayment)[0].props.orderId).toBe(
      "fixture-order",
    );
  });
  it.each(["failure", "pending"])(
    "retains the server-authority redirect for %s instead of showing success",
    async (outcome) => {
      probe.outcome = outcome;
      await expect(
        CheckoutSuccessPage({ searchParams: Promise.resolve({ order_id: "fixture-order" }) }),
      ).rejects.toThrow(`redirect:/checkout/${outcome}`);
      expect(probe.ownedOrder).toHaveBeenCalledExactlyOnceWith("fixture-order");
    },
  );
  it("does not clear the cart without authoritative payment and rejects non-string order ids", async () => {
    probe.paid = false;
    const tree = await CheckoutSuccessPage({
      searchParams: Promise.resolve({ order_id: "fixture-order" }),
    });
    expect(elements(tree, CartClearOnAuthoritativePayment)).toHaveLength(0);
    await expect(
      CheckoutSuccessPage({ searchParams: Promise.resolve({ order_id: ["fixture-order"] }) }),
    ).rejects.toThrow("redirect:/checkout/success");
    expect(probe.ownedOrder).toHaveBeenLastCalledWith(null);
  });
  it("keeps the native POST, hidden order and usable manual fallback; auto-submits once only", () => {
    const tree = PaymentReconciliationHandoff({ orderId: "fixture-order" });
    const form = elements(tree, "form")[0];
    expect(form.props).toMatchObject({
      action: "/api/mp-return/reconcile",
      method: "post",
      ref: probe.refs[0],
    });
    expect(elements(form, "input")[0].props).toMatchObject({
      name: "order_id",
      type: "hidden",
      value: "fixture-order",
    });
    const button = elements(form, "button")[0];
    expect(button.props).toMatchObject({ type: "submit", children: "Verificar pago" });
    expect(button.props.disabled).toBeUndefined();
    expect(button.props.className).toContain("min-h-[48px]");
    expect(form.props.className).toContain("bg-warm-sand p-[24px] sm:p-[48px] text-left");
    probe.effects[0]();
    expect(probe.refs[1].current).toBe(false);
    const requestSubmit = vi.fn(() => expect(probe.refs[1].current).toBe(true));
    probe.refs[0].current = { requestSubmit };
    probe.effects[0]();
    probe.effects[0]();
    expect(requestSubmit).toHaveBeenCalledExactlyOnceWith();
  });
});

describe("Actual V3 responsive utilities compiled in memory, not simulated viewports", () => {
  it("proves form/summary breakpoints, touch bounds, neutral panels and visible focus", async () => {
    const classes = new Set<string>();
    for (const path of paths)
      for (const match of source(path).matchAll(/className="([^"]*)"/g))
        match[1].split(/\s+/).forEach((value) => classes.add(value));
    expect([...classes].join(" ")).not.toMatch(
      /shadow|blur|rounded-(?!none)|font-(?:bold|semibold|medium|light)|(?:bg|text|border)-(?:red|blue|green)-/,
    );
    const themes = source("src/app/globals.css").match(/@theme[^\{]*\{[^}]*\}/g) ?? [];
    const compiler = await compile(
      `${source("node_modules/tailwindcss/theme.css")}\n${themes.join("\n")}\n@tailwind utilities;`,
    );
    const css = compiler.build([...classes]);
    const utility = (name: string) => {
      expect(classes.has(name), name).toBe(true);
      const selector = `.${name.replace(/[^a-zA-Z0-9_-]/g, "\\$&")} {`;
      const start = css.indexOf(selector);
      expect(start, name).toBeGreaterThanOrEqual(0);
      let depth = 0;
      for (let index = start + selector.length - 1; index < css.length; index++) {
        if (css[index] === "{") depth++;
        if (css[index] === "}" && --depth === 0) return css.slice(start, index + 1);
      }
      throw new Error(`Unbalanced utility: ${name}`);
    };
    for (const [name, declaration] of [
      ["h-[48px]", "height: 48px;"],
      ["min-h-[48px]", "min-height: 48px;"],
      ["text-[16px]", "font-size: 16px;"],
      ["leading-[1.5]", "line-height: 1.5;"],
      ["sm:grid-cols-2", "repeat(2, minmax(0, 1fr))"],
      ["md:grid-cols-4", "repeat(4, minmax(0, 1fr))"],
      ["lg:grid-cols-12", "repeat(12, minmax(0, 1fr))"],
      ["lg:sticky", "position: sticky;"],
      ["lg:col-span-7", "grid-column: span 7 / span 7;"],
      ["lg:col-span-5", "grid-column: span 5 / span 5;"],
      ["sm:p-[48px]", "padding: 48px;"],
      ["xl:w-[104px]", "width: 104px;"],
      ["xl:h-[130px]", "height: 130px;"],
      ["sm:text-[60px]", "font-size: 60px;"],
      ["focus-visible:outline-2", "outline-width: 2px;"],
      ["rounded-none", "border-radius: 0;"],
      ["bg-warm-sand", "background-color: var(--color-warm-sand);"],
    ])
      expect(utility(name), name).toContain(declaration);
    for (const [name, width] of [
      ["sm:grid-cols-2", "40rem"],
      ["md:grid-cols-4", "48rem"],
      ["lg:sticky", "64rem"],
      ["xl:w-[104px]", "80rem"],
    ])
      expect(utility(name)).toContain(`@media (width >= ${width})`);
    expect(utility("focus-visible:outline-2")).toContain("&:focus-visible");
  });
});
