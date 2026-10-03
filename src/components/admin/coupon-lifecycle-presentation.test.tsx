import { readFileSync } from "node:fs";
import postcss, { type Rule } from "postcss";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "tailwindcss";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminCoupon } from "@/lib/actions/coupon-admin";

// SSR fixtures cover rendered pending/feedback states, not transition execution,
// native browser validation, FormData submission, or interactive focus behavior.
const probe = vi.hoisted(() => ({ pending: false, message: "", refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: probe.refresh }) }));
vi.mock("@/lib/actions/coupon-admin", () => ({
  createCoupon: vi.fn(),
  deactivateCoupon: vi.fn(),
  replaceCoupon: vi.fn(),
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useTransition: () => [probe.pending, vi.fn()],
    useState: (initial: unknown) => {
      const [value, setter] = actual.useState(initial);
      return [initial === "" ? probe.message : value, setter];
    },
  };
});
import { CouponLifecycle } from "./coupon-lifecycle";
import { createCoupon, deactivateCoupon, replaceCoupon } from "@/lib/actions/coupon-admin";

const states = ["active", "deactivated", "replaced", "replacement"] as const;
const coupons: AdminCoupon[] = states.map((state, i) => ({
  id: `coupon-${i}`,
  code: `SAVE-${i}`,
  state,
  capacity: 12,
  usedCount: i,
  startsAt: "2026-09-01T13:15:00Z",
  endsAt: "2026-09-02T20:45:00Z",
}));
const render = (items = coupons) => renderToStaticMarkup(<CouponLifecycle coupons={items} />);
const classes = (html: string) =>
  [...html.matchAll(/class="([^"]*)"/g)].flatMap((match) => match[1].split(" "));
const control = (html: string, name: string) =>
  html.match(new RegExp(`<(?:input|select)\\b[^>]*name="${name}"[^>]*>`))![0];
const article = (html: string, id: string) =>
  html.match(new RegExp(`<article[^>]*data-testid="coupon-${id}"[^>]*>[\\s\\S]*?</article>`))![0];

beforeEach(() => {
  vi.clearAllMocks();
  probe.pending = false;
  probe.message = "";
});
afterEach(() => {
  expect(createCoupon).not.toHaveBeenCalled();
  expect(replaceCoupon).not.toHaveBeenCalled();
  expect(deactivateCoupon).not.toHaveBeenCalled();
  expect(probe.refresh).not.toHaveBeenCalled();
});

describe("Coupon lifecycle presentation (Node SSR)", () => {
  it("preserves every named control, visible label, and native constraint", () => {
    const html = render();
    const labels = {
      code: "Código",
      capacity: "Capacidad",
      startsAt: "Inicio UTC",
      endsAt: "Fin UTC",
      discountKind: "Tipo de descuento",
      discountValue: "Descuento",
      replacementCouponId: "Cupón a reemplazar",
      replacementReason: "Motivo de reemplazo",
    };
    for (const [name, label] of Object.entries(labels)) {
      const tag = control(html, name);
      expect(tag).toContain(`id="coupon-${name}"`);
      expect(tag).toContain(`aria-label="${label}"`);
      expect(html).toMatch(new RegExp(`<label[^>]*for="coupon-${name}"[^>]*>${label}</label>`));
      expect(tag.includes("required")).toBe(
        !["discountKind", "replacementCouponId", "replacementReason"].includes(name),
      );
      expect(tag).not.toMatch(/\s(?:disabled|readonly|step|value)=/);
    }
    expect(control(html, "code")).toContain('pattern="[A-Z0-9-]{3,64}"');
    expect(control(html, "code")).toContain('placeholder="CÓDIGO"');
    expect(control(html, "capacity")).toContain('type="number"');
    expect(control(html, "capacity")).toContain('min="1" max="2147483647"');
    for (const name of ["startsAt", "endsAt"]) {
      expect(control(html, name)).toContain('type="datetime-local"');
      expect(control(html, name)).not.toMatch(/min=|max=/);
    }
    expect(control(html, "discountValue")).toContain('placeholder="1 a 50 o ARS"');
    expect(control(html, "replacementReason")).toContain(
      'placeholder="Motivo requerido al reemplazar"',
    );
    expect(control(html, "replacementReason")).not.toContain("maxLength");
    expect(html.match(/<input\b/g)).toHaveLength(7);
    expect(html.match(/<select\b/g)).toHaveLength(2);
    expect(html).not.toMatch(/role="combobox"|fingerprint|hmac|identity/i);
  });

  it("retains discount choices/default and active-only replacement choices/default", () => {
    const html = render();
    const selects = html.match(/<select\b[\s\S]*?<\/select>/g)!;
    expect(selects[0]).toContain('<option value="percentage" selected="">Porcentaje</option>');
    expect(selects[0]).toContain('<option value="fixed_ars">Monto fijo ARS</option>');
    expect(selects[0].match(/<option\b/g)).toHaveLength(2);
    expect(selects[1]).toContain('<option value="" selected="">Crear cupón nuevo</option>');
    expect(selects[1]).toContain('<option value="coupon-0">Reemplazar SAVE-0</option>');
    expect(selects[1].match(/<option\b/g)).toHaveLength(2);
    for (const coupon of coupons.slice(1)) expect(selects[1]).not.toContain(coupon.id);
  });

  it("shows all four states, original usage and es-AR date formatting", () => {
    const html = render();
    const labels = ["Activo", "Desactivado", "Reemplazado", "Reemplazo creado"];
    coupons.forEach((coupon, i) => {
      const item = article(html, coupon.id);
      expect(item).toContain(coupon.code);
      expect(item).toContain(`data-testid="coupon-state-${coupon.id}">${labels[i]}</span>`);
      expect(item).toContain(`${coupon.usedCount}/${coupon.capacity} usos · `);
      expect(item).toContain(
        `${new Date(coupon.startsAt).toLocaleString("es-AR")} a ${new Date(coupon.endsAt).toLocaleString("es-AR")}`,
      );
      expect(item.includes("<form")).toBe(coupon.state === "active");
    });
    const reason = control(html, "deactivationReason");
    expect(reason).toContain('id="coupon-deactivation-coupon-0"');
    expect(reason).toContain('aria-label="Motivo de desactivación SAVE-0"');
    expect(reason).toContain('placeholder="Motivo de desactivación"');
    expect(reason).toContain('maxLength="500" required=""');
    expect(html).toMatch(
      /<label[^>]*for="coupon-deactivation-coupon-0"[^>]*>Motivo de desactivación SAVE-0<\/label>/,
    );
    expect(html.match(/<form\b/g)).toHaveLength(2);
    expect(html).not.toContain("<strong");
  });

  it.each([{ items: [] }, { items: coupons.slice(1) }])(
    "keeps no-active native form/list behavior",
    ({ items }) => {
      const html = render(items);
      expect(html.match(/<form\b/g)).toHaveLength(1);
      expect(html).toContain('data-testid="coupon-list"');
      expect(html.match(/<article\b/g) ?? []).toHaveLength(items.length);
      expect(html).not.toContain('name="deactivationReason"');
      expect(html).not.toContain("Desactivar");
      expect(html).not.toContain("Reemplazar SAVE");
      expect(html.match(/<option\b/g)).toHaveLength(3);
    },
  );

  it.each([false, true])("keeps submit-only buttons and pending=%s", (pending) => {
    probe.pending = pending;
    const html = render();
    const buttons = html.match(/<button\b[^>]*>/g)!;
    expect(buttons).toHaveLength(2);
    buttons.forEach((button) => {
      expect(button).toContain('type="submit"');
      expect(button.includes('disabled=""')).toBe(pending);
    });
    expect(html).toContain(pending ? "Guardando..." : "Guardar cupón");
    expect(html).toContain("Desactivar");
    for (const tag of html.match(/<(?:input|select)\b[^>]*>/g)!) {
      expect(tag).not.toContain('disabled=""'); // Existing pending semantics disable buttons only.
    }
  });

  it.each(["", "Cambios guardados.", "Error original de cupón"])(
    "keeps polite, verbatim, neutral feedback: %s",
    (message) => {
      probe.message = message;
      expect(render()).toMatch(
        new RegExp(
          `<p[^>]*data-testid="coupon-feedback"[^>]*aria-live="polite"[^>]*>${message.replaceAll(".", "\\.")}</p>`,
        ),
      );
    },
  );

  it("retains lifecycle dispatch and success-only refresh without executing actions", () => {
    const source = readFileSync(new URL("./coupon-lifecycle.tsx", import.meta.url), "utf8");
    const structure = (text: string) => {
      const file = ts.createSourceFile("methods.ts", text, ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node): unknown => {
        // Ignore formatting parentheses, but retain every statement, operator and argument.
        if (ts.isParenthesizedExpression(node)) return visit(node.expression);
        const children = node.getChildren(file);
        return children.length
          ? [node.kind, ...children.map(visit)]
          : [node.kind, node.getText(file)];
      };
      return visit(file);
    };
    const methods = source.slice(source.indexOf("  function run("), source.indexOf("  return ("));
    expect(structure(methods)).toEqual(
      structure(`
      function run(action: () => Promise<{ error: string } | { success: boolean }>) {
        startTransition(async () => {
          const result = await action();
          setMessage("error" in result ? result.error : "Cambios guardados.");
          if ("success" in result) router.refresh();
        });
      }
      function submitCoupon(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const replacementId = String(formData.get("replacementCouponId") ?? "");
        run(() => replacementId ? replaceCoupon(replacementId, formData) : createCoupon(formData));
      }
    `),
    );
    expect(source).toContain("onSubmit={submitCoupon}");
    expect(source).toMatch(/coupon\.state\s*===\s*"active"\s*&&\s*\(?\s*<form\b/);
    expect(source).toMatch(
      /event\.preventDefault\(\);\s*run\(\s*\(\)\s*=>\s*deactivateCoupon\(\s*coupon\.id,\s*new FormData\(event\.currentTarget\),?\s*\)\s*\);/,
    );
  });

  it("renders flat hairlines, explicit gaps, regular typography and focus targets", () => {
    const tokens = classes(render());
    expect(tokens.join(" ")).not.toMatch(
      /shadow|blur|rounded-(?!none)|font-(bold|semibold|medium)|(?:text|bg|border)-(?:red|green|blue|primary|destructive)/,
    );
    expect(tokens).toEqual(
      expect.arrayContaining([
        "grid",
        "gap-[24px]",
        "gap-[13px]",
        "gap-[6px]",
        "p-[13px]",
        "min-w-0",
        "rounded-none",
        "border",
        "border-midnight-ink",
        "bg-warm-sand",
        "bg-bone-white",
        "font-sans",
        "font-mono",
        "font-normal",
        "text-[13px]",
        "text-[15px]",
        "text-[16px]",
        "md:text-[15px]",
        "h-[36px]",
        "px-[6px]",
        "py-[2px]",
        "flex-col",
        "md:flex-row",
        "md:grid-cols-2",
        "w-full",
        "md:w-auto",
        "focus-visible:outline-2",
        "focus-visible:outline-solid",
        "focus-visible:outline-midnight-ink",
        "focus-visible:outline-offset-2",
        "break-all",
        "break-words",
      ]),
    );
    for (const tag of render().match(/<(?:input|select|button)\b[^>]*>/g)!) {
      expect(classes(tag)).toEqual(
        expect.arrayContaining([
          "rounded-none",
          "border",
          "border-midnight-ink",
          "h-[36px]",
          "focus-visible:outline-2",
          "focus-visible:outline-midnight-ink",
        ]),
      );
    }
    for (const label of render().match(/<label\b[^>]*>/g)!) {
      expect(classes(label)).toEqual(
        expect.arrayContaining(["font-mono", "text-[13px]", "font-normal"]),
      );
    }
  });

  it("compiles actual native-select/responsive utilities in memory with project themes", async () => {
    const globals = postcss.parse(
      readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8"),
    );
    const themes: string[] = [];
    globals.walkAtRules("theme", (rule) => {
      themes.push(rule.toString());
    });
    const theme = readFileSync(
      new URL("../../../node_modules/tailwindcss/theme.css", import.meta.url),
      "utf8",
    );
    const compiler = await compile(`${theme}\n${themes.join("\n")}\n@tailwind utilities;`);
    const css = postcss.parse(compiler.build([...new Set(classes(render()))]));
    const utility = (name: string): Rule => {
      const selector = `.${name.replace(/[^a-zA-Z0-9_-]/g, "\\$&")}`;
      let found: Rule | undefined;
      css.walkRules((rule) => {
        if (rule.selector === selector) found = rule;
      });
      expect(found, name).toBeDefined();
      return found!;
    };
    const declaration = (name: string, property: string, value: string) => {
      const values: string[] = [];
      utility(name).walkDecls(property, (decl) => {
        values.push(decl.value);
      });
      expect(values, `${name}: ${property}`).toContain(value);
    };
    for (const [name, property, value] of [
      ["h-[36px]", "height", "36px"],
      ["gap-[24px]", "gap", "24px"],
      ["gap-[13px]", "gap", "13px"],
      ["gap-[6px]", "gap", "6px"],
      ["p-[13px]", "padding", "13px"],
      ["px-[6px]", "padding-inline", "6px"],
      ["py-[2px]", "padding-block", "2px"],
      ["rounded-none", "border-radius", "0"],
      ["border", "border-width", "1px"],
      ["border-midnight-ink", "border-color", "var(--color-midnight-ink)"],
      ["bg-bone-white", "background-color", "var(--color-bone-white)"],
      ["bg-warm-sand", "background-color", "var(--color-warm-sand)"],
      ["font-sans", "font-family", "var(--font-inter)"],
      ["font-mono", "font-family", "var(--font-ibm-plex-mono)"],
      ["font-normal", "font-weight", "var(--font-weight-normal)"],
      ["text-[13px]", "font-size", "13px"],
      ["text-[15px]", "font-size", "15px"],
      ["text-[16px]", "font-size", "16px"],
      ["md:text-[15px]", "font-size", "15px"],
      ["flex-col", "flex-direction", "column"],
      ["md:flex-row", "flex-direction", "row"],
      ["w-full", "width", "100%"],
      ["md:w-auto", "width", "auto"],
      ["md:grid-cols-2", "grid-template-columns", "repeat(2, minmax(0, 1fr))"],
      ["focus-visible:outline-2", "outline-width", "2px"],
      ["focus-visible:outline-solid", "outline-style", "solid"],
      ["focus-visible:outline-offset-2", "outline-offset", "2px"],
      ["focus-visible:outline-midnight-ink", "outline-color", "var(--color-midnight-ink)"],
    ])
      declaration(name, property, value);
    for (const name of ["md:grid-cols-2", "md:flex-row", "md:w-auto", "md:text-[15px]"]) {
      const media: string[] = [];
      utility(name).walkAtRules("media", (rule) => {
        media.push(rule.params);
      });
      expect(media).toContain("(width >= 48rem)");
    }
    const focus: string[] = [];
    utility("focus-visible:outline-2").walkRules((rule) => {
      focus.push(rule.selector);
    });
    expect(focus).toContain("&:focus-visible");
    const selects = render().match(/<select\b[^>]*>/g)!;
    expect(classes(selects[0])).toEqual(classes(selects[1]));
    expect(classes(selects[0])).not.toContain("appearance-none"); // Keep native arrow/popup.
  });
});
