import { readFileSync } from "node:fs";
import postcss, { type Rule } from "postcss";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Dialog as DialogPrimitive } from "radix-ui";
import { compile } from "tailwindcss";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem, SelectTrigger } from "@/components/ui/select";
import { TableBody } from "@/components/ui/table";
import type { OrderHistoryOrder } from "@/lib/actions/orders";
import { formatPrice } from "@/lib/config";

// Node SSR and shallow element callbacks only: no DOM, portals, network or order writes.
const probe = vi.hoisted(() => ({
  direct: false,
  pending: false,
  shippingId: null as string | null,
  tracking: "",
  setShippingId: vi.fn(),
  setTracking: vi.fn(),
  work: undefined as (() => Promise<void>) | undefined,
}));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) =>
      probe.direct
        ? initial === null
          ? [probe.shippingId, probe.setShippingId]
          : [probe.tracking, probe.setTracking]
        : actual.useState(initial),
    useTransition: () => [
      probe.pending,
      (work: () => Promise<void>) => {
        probe.work = work;
      },
    ],
  };
});
vi.mock("@/lib/actions/orders", () => ({ shipOrder: vi.fn(), updateOrderStatus: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
import { toast } from "sonner";
import { shipOrder, updateOrderStatus } from "@/lib/actions/orders";
import { OrdersTable } from "./orders-table";
import {
  OrderPricingHistory,
  formatHistoricalOrderTotal,
} from "@/components/orders/order-pricing-history";

type Element = ReactElement<{ children?: ReactNode; className?: string; [key: string]: unknown }>;
function descendants(node: ReactNode): Element[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement(child)
      ? [child as Element, ...descendants((child as Element).props.children)]
      : [],
  );
}
const find = (node: ReactNode, type: unknown) =>
  descendants(node).find((child) => child.type === type)!;
const tokens = (html: string) =>
  [...html.matchAll(/class="([^"]*)"/g)].flatMap((match) => match[1].split(" "));
const order: OrderHistoryOrder = {
  id: "order-12345678",
  status: "paid",
  customer_name: "Cliente original",
  customer_email: "cliente@example.com",
  created_at: "2026-08-30T12:00:00Z",
  updated_at: "2026-08-30T12:00:00Z",
  user_id: "user-123",
  clerk_anonymized_at: null,
  mp_payment_id: null,
  mp_preference_id: null,
  shipping_info: null,
  shipped_at: null,
  tracking_number: null,
  order_items: [],
  promotion_ids: [],
  coupon_definitions: [{ code: "AHORRO20" }],
  merchandise_original_cents: 1000000,
  merchandise_discount_cents: 200000,
  merchandise_final_cents: 800000,
  shipping_cents: 50000,
  total_cents: 850000,
  payment_amount_cents: 850000,
  total_amount: 99999,
  shipping_fee: 500,
  pricing_source: "coupon",
  product_payment_reversal_evidence: [],
};
const render = (orders = [order]) => renderToStaticMarkup(<OrdersTable orders={orders} />);
function row(value = order): Element {
  const component = Children.toArray(
    find(OrdersTable({ orders: [value] }), TableBody).props.children,
  )[0] as ReactElement<{ order: OrderHistoryOrder }>;
  probe.direct = true;
  try {
    return (component.type as (props: typeof component.props) => Element)(component.props);
  } finally {
    probe.direct = false;
  }
}
function shipping(value = order) {
  const tree = row(value);
  const dialog = find(tree, Dialog);
  const content = find(dialog, DialogContent);
  const input = find(content, Input);
  const buttons = descendants(content).filter((element) => element.type === Button);
  const html = renderToStaticMarkup(<Dialog>{content.props.children}</Dialog>);
  const panel = find(DialogContent(content.props), DialogPrimitive.Content);
  return { tree, dialog, content, input, buttons, html, panel };
}
const changeStatus = (tree: Element, status: string) =>
  (find(tree, Select).props.onValueChange as (value: string) => void)(status);
const click = (button: Element) => (button.props.onClick as () => void)();

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(probe, {
    direct: false,
    pending: false,
    shippingId: null,
    tracking: "",
    work: undefined,
  });
  vi.mocked(shipOrder).mockResolvedValue({ success: true });
  // The server currently rejects every direct update; still preserve the existing UI success branch.
  vi.mocked(updateOrderStatus).mockResolvedValue({ success: true } as unknown as Awaited<
    ReturnType<typeof updateOrderStatus>
  >);
});

describe("Orders presentation and preserved callbacks (Node SSR)", () => {
  it.each([
    ["pending", "Pendiente"],
    ["paid", "Pagado"],
    ["shipped", "Enviado"],
    ["cancelled", "Cancelado"],
  ] as const)("keeps %s identity, readable status and all four choices", (status, label) => {
    const value = { ...order, status, tracking_number: "RR123456789AR" };
    const html = render([value]);
    for (const text of [
      "#order-12",
      value.customer_name,
      value.customer_email,
      label,
      value.tracking_number,
      new Date(value.created_at).toLocaleDateString("es-AR"),
      formatPrice(8500),
    ])
      expect(html).toContain(text);
    expect(html).not.toContain(formatPrice(value.total_amount));
    expect(html).toContain('role="combobox"');
    expect(html).toContain('data-state="closed"');
    expect(html.match(/<th\b/g)).toHaveLength(7);
    const tree = row(value);
    expect(find(tree, Select).props.defaultValue).toBe(status);
    expect(
      descendants(tree)
        .filter((child) => child.type === SelectItem)
        .map((item) => [item.props.value, item.props.children]),
    ).toEqual([
      ["pending", "Pendiente"],
      ["paid", "Pagado"],
      ["shipped", "Enviado"],
      ["cancelled", "Cancelado"],
    ]);
    expect(shipOrder).not.toHaveBeenCalled();
    expect(updateOrderStatus).not.toHaveBeenCalled();
  });

  it("keeps empty tables, missing tracking and legacy total fallback", () => {
    expect(render([])).toContain("Acción");
    expect(render([])).not.toContain("<td");
    const legacy = { ...order, total_cents: null };
    const html = render([legacy]);
    expect(html).toContain(formatPrice(legacy.total_amount));
    expect(html).toMatch(/<td[^>]*>-<\/td>/);
    expect(html).not.toContain('data-testid="order-pricing-history"');
    expect(formatHistoricalOrderTotal({ total_cents: 0, total_amount: 999 })).toBe(formatPrice(0));
  });

  it.each([false, true])(
    "preserves pending=%s availability and dialog field semantics",
    (pending) => {
      probe.pending = pending;
      const { tree, dialog, input, buttons, html } = shipping();
      expect(find(tree, Select).props.disabled).toBe(pending);
      expect(find(tree, SelectTrigger).props.size).toBe("sm");
      expect(dialog.props.open).toBe(false);
      expect(input.props).toMatchObject({
        id: "tracking",
        placeholder: "Ej: RR123456789AR",
        value: "",
      });
      expect(input.props.disabled).toBeUndefined(); // Existing availability: buttons/select only.
      expect(input.props.required).toBeUndefined();
      buttons.forEach((button) => expect(button.props.disabled).toBe(pending));
      for (const text of [
        "Confirmar envío",
        "Orden #order-12",
        "Número de tracking",
        "Cancelar",
        "Se enviará un email al cliente con el número de seguimiento.",
        pending ? "Enviando..." : "Confirmar envío",
      ])
        expect(html).toContain(text);
      expect(html).toMatch(/<label[^>]*for="tracking"[^>]*>Número de tracking<\/label>/);
      expect(tokens(render()).includes("opacity-50")).toBe(pending);
    },
  );

  it("opens shipping, resets tracking and never dispatches a direct shipped status", () => {
    changeStatus(row(), "shipped");
    expect(probe.setShippingId).toHaveBeenCalledWith(order.id);
    expect(probe.setTracking).toHaveBeenCalledWith("");
    expect(probe.work).toBeUndefined();
    expect(updateOrderStatus).not.toHaveBeenCalled();
    probe.shippingId = order.id;
    expect(shipping().dialog.props.open).toBe(true);
  });

  it.each(["pending", "paid", "cancelled"])(
    "retains mocked direct %s dispatch and feedback",
    async (status) => {
      changeStatus(row(), status);
      expect(probe.setShippingId).not.toHaveBeenCalled();
      await probe.work!();
      expect(updateOrderStatus).toHaveBeenCalledWith(order.id, status);
      expect(toast.success).toHaveBeenCalledWith("Estado actualizado");
      vi.mocked(updateOrderStatus).mockResolvedValue({ error: "Rechazo original" });
      await probe.work!();
      expect(toast.error).toHaveBeenCalledWith("Error al actualizar", {
        description: "Rechazo original",
      });
      expect(shipOrder).not.toHaveBeenCalled();
    },
  );

  it.each(["", "   "])("retains trim-nonempty validation for %j", (tracking) => {
    probe.tracking = tracking;
    click(shipping().buttons[1]);
    expect(toast.error).toHaveBeenCalledWith("Ingresá un número de tracking");
    expect(probe.work).toBeUndefined();
    expect(shipOrder).not.toHaveBeenCalled();
  });

  it.each([true, false])("trims mocked shipping and clears only on success=%s", async (success) => {
    probe.tracking = "  RR123456789AR  ";
    vi.mocked(shipOrder).mockResolvedValue(
      success ? { success: true } : { error: "Error original" },
    );
    click(shipping().buttons[1]);
    await probe.work!();
    expect(shipOrder).toHaveBeenCalledWith(order.id, "RR123456789AR");
    if (success) {
      expect(toast.success).toHaveBeenCalledWith("Pedido marcado como enviado");
      expect(probe.setShippingId).toHaveBeenCalledWith(null);
      expect(probe.setTracking).toHaveBeenCalledWith("");
    } else {
      expect(toast.error).toHaveBeenCalledWith("Error al enviar", {
        description: "Error original",
      });
      expect(probe.setShippingId).not.toHaveBeenCalled();
      expect(probe.setTracking).not.toHaveBeenCalled();
    }
  });

  it("keeps input, Enter, cancel and close callbacks", () => {
    const { input, buttons, dialog } = shipping();
    (input.props.onChange as (event: unknown) => void)({ target: { value: "tracking original" } });
    expect(probe.setTracking).toHaveBeenCalledWith("tracking original");
    const keyDown = input.props.onKeyDown as (event: unknown) => void;
    keyDown({ key: "Escape" });
    expect(toast.error).not.toHaveBeenCalled();
    keyDown({ key: "Enter" });
    expect(toast.error).toHaveBeenCalledWith("Ingresá un número de tracking");
    click(buttons[0]);
    expect(probe.setShippingId).toHaveBeenCalledWith(null);
    expect(probe.setTracking).toHaveBeenCalledWith("");
    vi.clearAllMocks();
    (dialog.props.onOpenChange as (open: boolean) => void)(true);
    expect(probe.setTracking).not.toHaveBeenCalled();
    (dialog.props.onOpenChange as (open: boolean) => void)(false);
    expect(probe.setShippingId).toHaveBeenCalledWith(null);
    expect(probe.setTracking).toHaveBeenCalledWith("");
    expect(shipOrder).not.toHaveBeenCalled();
  });
});

describe("Shared authoritative pricing presentation", () => {
  it.each([
    "merchandise_original_cents",
    "merchandise_discount_cents",
    "merchandise_final_cents",
    "shipping_cents",
    "total_cents",
    "payment_amount_cents",
  ] as const)("omits details when %s is not numeric", (field) => {
    expect(renderToStaticMarkup(<OrderPricingHistory order={{ ...order, [field]: null }} />)).toBe(
      "",
    );
    expect(
      renderToStaticMarkup(<OrderPricingHistory order={{ ...order, [field]: 0 }} />),
    ).toContain('data-testid="order-pricing-history"');
  });

  it.each([
    ["coupon", [{ code: "AHORRO20" }], "Cupón AHORRO20"],
    ["coupon", [], "Cupón"],
    ["promotions", [], "Promociones"],
    [null, [], "Sin fuente registrada"],
  ] as const)("keeps source %s and coupon evidence", (pricing_source, coupons, source) => {
    const html = renderToStaticMarkup(
      <OrderPricingHistory
        order={{ ...order, pricing_source, coupon_definitions: [...coupons] }}
      />,
    );
    expect(html).toContain(`Fuente aplicada: ${source}`);
    for (const [label, cents, prefix] of [
      ["Subtotal de productos", 1000000, ""],
      ["Descuento", 200000, "-"],
      ["Productos con descuento", 800000, ""],
      ["Envío", 50000, ""],
      ["Total a pagar", 850000, ""],
      ["Monto cobrado", 850000, ""],
    ] as const)
      expect(html).toContain(
        `${label}</dt><dd class="text-right">${prefix}${formatPrice(cents / 100)}</dd>`,
      );
    expect(html).not.toContain('data-testid="order-reversal-evidence"');
  });

  it("shows both reversal labels/amounts only with recorded evidence", () => {
    const html = renderToStaticMarkup(
      <OrderPricingHistory
        order={{
          ...order,
          product_payment_reversal_evidence: [
            { event_class: "refunded", reversal_total_cents: 10000, created_at: order.created_at },
            {
              event_class: "charged_back",
              reversal_total_cents: 25000,
              created_at: order.created_at,
            },
          ],
        }}
      />,
    );
    expect(html).toContain(
      'data-testid="order-reversal-evidence" aria-label="Reversiones registradas"',
    );
    expect(html).toContain(`Reintegro registrado: ${formatPrice(100)}`);
    expect(html).toContain(`Contracargo registrado: ${formatPrice(250)}`);
    expect(html).not.toMatch(/fingerprint|authorization|provider_payload|identity_key_version/);
  });
});

describe("Redesigned UI presentation CSS (in memory)", () => {
  it("compiles flatness, responsive dimensions, typography and crisp focus against project themes", async () => {
    const { html, panel } = shipping();
    const candidates = [
      ...new Set([...tokens(render()), ...tokens(html), ...panel.props.className!.split(" ")]),
    ];
    expect(candidates.join(" ")).not.toMatch(
      /shadow|blur|rounded-(?!none)|font-(bold|semibold|medium)|(?:text|bg)-(?:red|green|blue|yellow)/,
    );
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
    const css = postcss.parse(compiler.build(candidates));
    const utility = (name: string): Rule => {
      let found: Rule | undefined;
      css.walkRules((rule) => {
        if (rule.selector === `.${name.replace(/[^a-zA-Z0-9_-]/g, "\\$&")}`) found = rule;
      });
      expect(found, name).toBeDefined();
      return found!;
    };
    for (const [name, property, value] of [
      ["min-w-[920px]", "min-width", "920px"],
      ["max-w-[240px]", "max-width", "240px"],
      ["max-w-[560px]", "max-width", "560px"],
      ["min-w-[130px]", "min-width", "130px"],
      ["h-[36px]", "height", "36px"],
      ["gap-[13px]", "gap", "13px"],
      ["gap-[6px]", "gap", "6px"],
      ["p-[13px]", "padding", "13px"],
      ["py-[6px]", "padding-block", "6px"],
      ["rounded-none", "border-radius", "0"],
      ["border", "border-width", "1px"],
      ["border-midnight-ink", "border-color", "var(--color-midnight-ink)"],
      ["bg-warm-sand", "background-color", "var(--color-warm-sand)"],
      ["bg-bone-white", "background-color", "var(--color-bone-white)"],
      ["font-sans", "font-family", "var(--font-inter)"],
      ["font-mono", "font-family", "var(--font-ibm-plex-mono)"],
      ["font-normal", "font-weight", "var(--font-weight-normal)"],
      ["text-[13px]", "font-size", "13px"],
      ["text-[15px]", "font-size", "15px"],
      ["text-[20px]", "font-size", "20px"],
      ["w-full", "width", "100%"],
      ["sm:w-auto", "width", "auto"],
      ["overflow-x-auto", "overflow-x", "auto"],
      ["max-w-[calc(100vw-32px)]", "max-width", "calc(100vw - 32px)"],
      ["max-h-[calc(100dvh-32px)]", "max-height", "calc(100dvh - 32px)"],
      ["overflow-y-auto", "overflow-y", "auto"],
      ["focus-visible:outline-2", "outline-width", "2px"],
      ["focus-visible:outline-solid", "outline-style", "solid"],
      ["focus-visible:outline-midnight-ink", "outline-color", "var(--color-midnight-ink)"],
      ["focus-visible:outline-offset-2", "outline-offset", "2px"],
    ]) {
      const values: string[] = [];
      utility(name).walkDecls(property, (decl) => {
        values.push(decl.value);
      });
      expect(values, `${name}: ${property}`).toContain(value);
    }
    const media: string[] = [];
    utility("sm:w-auto").walkAtRules("media", (rule) => {
      media.push(rule.params);
    });
    expect(media).toContain("(width >= 40rem)");
    const focus: string[] = [];
    utility("focus-visible:outline-2").walkRules((rule) => {
      focus.push(rule.selector);
    });
    expect(focus).toContain("&:focus-visible");
    const colors = new Map<string, string>();
    globals.walkDecls((decl) => {
      colors.set(decl.prop, decl.value);
    });
    expect(colors.get("--color-midnight-ink")).toBe("#000000");
    expect(colors.get("--color-bone-white")).toBe("#ffffff");
    expect(colors.get("--color-warm-sand")).toBe("#ebe6dc");
    const luminance = (hex: string) =>
      hex
        .slice(1)
        .match(/../g)!
        .map((part) => parseInt(part, 16) / 255)
        .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
        .reduce((total, value, i) => total + value * [0.2126, 0.7152, 0.0722][i], 0);
    for (const surface of ["#ffffff", "#ebe6dc"])
      expect((luminance(surface) + 0.05) / 0.05).toBeGreaterThan(7);
  });
});
