import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { render } from "@react-email/render";
import * as React from "react";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DispatchEmail } from "./dispatch-email";
import { EmailBrand } from "./email-brand";
import { ReceiptEmail } from "./receipt-email";

vi.mock("server-only", () => ({}));

beforeEach(() => {
  // Keep React's lazy server renderer on the same build as Vitest's JSX runtime.
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://brand-mail.example.com/");
});
afterEach(() => vi.unstubAllEnvs());

const receipt = (
  <ReceiptEmail customerName="Cliente de prueba" orderId="order-fixture-123" totalAmount={12345} />
);
const dispatch = (
  <DispatchEmail
    customerName="Cliente de prueba"
    orderId="order-fixture-123"
    trackingNumber="TRACK-FIXTURE-123"
    items={[
      { title: "Campera vintage", price: 12345 },
      { title: "Remera vintage", price: 2500 },
    ]}
  />
);

const cases = [
  [
    "receipt",
    receipt,
    [
      "¡Tu pago en ClubVTG ha sido confirmado!",
      "¡Gracias por tu compra, Cliente de prueba!",
      "Tu pago ha sido procesado exitosamente",
      "Nº de Orden:",
      "order-fixture-123",
      "Total Pagado:",
      "$12.345",
      "Correo Argentino",
      "respondé a este correo",
    ],
  ],
  [
    "dispatch",
    dispatch,
    [
      "Tu pedido #order-fi está en camino",
      "¡Tu pedido está en camino!",
      "Hola Cliente de prueba, tu pedido ya fue despachado.",
      "Nº de Orden:",
      "#order-fi",
      "Tracking:",
      "TRACK-FIXTURE-123",
      "correoargentino.com.ar",
      "Productos en tu pedido:",
      "Campera vintage — $12.345",
      "Remera vintage — $2.500",
      "Gracias por tu compra",
    ],
  ],
] as const;

// Strip images and hidden preview text without retaining alt attributes as a fallback.
function visibleTextWithoutImages(html: string) {
  return html
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<div[^>]*data-skip-in-text[^>]*>[\s\S]*?<\/div>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
}

describe("Approved transactional email branding", () => {
  it("uses the byte-exact transparent 512 × 179 approved PNG", async () => {
    const asset = readFileSync(
      new URL("../../../public/branding/clubvtg/clubvtg-horizontal-black-512.png", import.meta.url),
    );
    // Pinned after byte-for-byte verification against the approved transparent master;
    // no historical kit or generator is required at test runtime.
    expect(createHash("sha256").update(asset).digest("hex")).toBe(
      "bafe998539f9dbd9443500c0eac1461b01def783f9f84f03c247afbe1ccf7ed4",
    );
    expect(await sharp(asset).metadata()).toMatchObject({
      width: 512,
      height: 179,
      hasAlpha: true,
    });
    expect((await sharp(asset).stats()).isOpaque).toBe(false);
  });

  it.each(cases)(
    "renders the %s email with one absolute PNG and intrinsic dimensions",
    async (_name, email, content) => {
      const html = await render(email);
      const images = html.match(/<img\b[^>]*>/g) ?? [];
      expect(images).toHaveLength(1);
      expect(images[0]).toContain(
        'src="https://brand-mail.example.com/branding/clubvtg/clubvtg-horizontal-black-512.png"',
      );
      expect(images[0]).toContain('alt="ClubVTG"');
      expect(images[0]).toContain('width="512"');
      expect(images[0]).toContain('height="179"');
      expect(images[0]).toContain("width:180px");
      expect(images[0]).toContain("height:auto");
      expect(html).not.toMatch(/<svg\b|\.svg(?:["?])|_next\/image|data:image/);
      const text = visibleTextWithoutImages(html);
      expect(text).toContain("ClubVTG — Información de tu pedido");
      expect(html).toContain(content[0]);
      for (const expected of content.slice(1)) expect(text).toContain(expected);
      expect(html).toMatch(/<h1\b/);
      expect(html).toContain("<strong>Nº de Orden:</strong>");
      expect(await render(email, { plainText: true })).toContain(
        "ClubVTG — Información de tu pedido",
      );
    },
  );

  it("resolves the current public origin at render time, not at module initialization", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://alternate-mail.example.com/");
    expect(await render(<EmailBrand />)).toContain(
      'src="https://alternate-mail.example.com/branding/clubvtg/clubvtg-horizontal-black-512.png"',
    );
  });

  it.each(["", "http://brand-mail.example.com", "https://brand-mail.example.com/path"])(
    "keeps the existing fail-closed production origin policy for %j",
    (origin) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PUBLIC_APP_URL", origin);
      expect(() => EmailBrand()).toThrow(
        "NEXT_PUBLIC_APP_URL must be an absolute HTTPS origin in production.",
      );
    },
  );
});
