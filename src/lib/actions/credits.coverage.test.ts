/* eslint-disable import/order -- Server-only dependencies must be mocked before import. */
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), from: vi.fn(), storageFrom: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/mercadopago", () => ({ mpClient: {} }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: mocks.from, storage: { from: mocks.storageFrom } } }));
import { getTryOnHistory } from "./credits";

afterEach(() => vi.clearAllMocks());

it("returns the canonical user and signed source media for history", async () => {
  const log = { created_at: "2026-01-01", credits_charged: 1, error_message: null, id: "log_123", product_id: "product_123", products: { image_urls: ["https://image.test/product.jpg"], title: "Coat" }, result_image_url: "user_123/log_123.jpg", status: "completed", updated_at: "2026-01-01", user_id: "user_123", user_image_url: "user_123/source.jpg" };
  mocks.auth.mockResolvedValue({ userId: "user_123" });
  mocks.from.mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: [log], error: null }) }) }) });
  mocks.storageFrom.mockImplementation((bucket) => ({ createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: `https://signed.test/${bucket}` }, error: null }) }));

  await expect(getTryOnHistory()).resolves.toEqual([expect.objectContaining({ user_id: "user_123", user_image_url: "https://signed.test/user-uploads" })]);
  expect(mocks.storageFrom).toHaveBeenCalledWith("user-uploads");
});
