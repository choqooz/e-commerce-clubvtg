import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), createClient: vi.fn(), currentUser: vi.fn(), mercadoPagoConfig: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth, currentUser: mocks.currentUser }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("mercadopago", () => ({ MercadoPagoConfig: mocks.mercadoPagoConfig }));

const saved = Object.fromEntries(["ADMIN_EMAIL", "MP_ACCESS_TOKEN", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].map((key) => [key, process.env[key]]));
function absent(key: string) { delete process.env[key]; vi.resetModules(); }
afterEach(() => { Object.entries(saved).forEach(([key, value]) => value === undefined ? delete process.env[key] : process.env[key] = value); vi.clearAllMocks(); vi.resetModules(); });

describe("privileged configuration boundary", () => {
  it("rejects missing Supabase configuration before client construction", async () => {
    absent("NEXT_PUBLIC_SUPABASE_URL");
    await expect(import("./supabase/admin")).rejects.toThrow("Missing required Supabase env vars");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it("rejects missing MercadoPago configuration before client construction", async () => {
    absent("MP_ACCESS_TOKEN");
    await expect(import("./mercadopago")).rejects.toThrow("Missing required env var: MP_ACCESS_TOKEN");
    expect(mocks.mercadoPagoConfig).not.toHaveBeenCalled();
  });
  it("rejects missing administrative configuration before auth or a partial write", async () => {
    absent("ADMIN_EMAIL");
    await expect(import("./actions/auth")).rejects.toThrow("Missing required env var ADMIN_EMAIL");
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it("uses configured payment and admin authorities while accepting reserved products", async () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    process.env.MP_ACCESS_TOKEN = "mp_test_configured";
    vi.resetModules();
    mocks.auth.mockResolvedValue({ userId: "user_123" });
    mocks.currentUser.mockResolvedValue({ emailAddresses: [{ emailAddress: "admin@example.com", id: "email_123" }], primaryEmailAddressId: "email_123" });

    const [{ mpClient }, { requireAdmin }, { productSchema }] = await Promise.all([import("./mercadopago"), import("./actions/auth"), import("./validations/product")]);

    expect(mpClient).toBeDefined();
    expect(mocks.mercadoPagoConfig).toHaveBeenCalledWith({ accessToken: "mp_test_configured", options: { timeout: 10000 } });
    await expect(requireAdmin()).resolves.toBeNull();
    expect(productSchema.safeParse({ category: "outerwear", description: "A carefully restored vintage coat", image_urls: ["https://image.test/coat.jpg"], price: 2500, status: "reserved", subcategory: "coats", title: "Vintage Coat" }).success).toBe(true);
  });
});
