/* eslint-disable import/order -- Action dependencies must be mocked before import. */
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), insert: vi.fn(), requireAdmin: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actions/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: mocks.from } }));
import { createProduct } from "./product";
import type { ProductFormValues } from "../validations/product";

const reservedProduct: ProductFormValues = { category: "outerwear", description: "A carefully restored vintage coat", image_urls: ["https://image.test/coat.jpg"], price: 2500, status: "reserved", subcategory: "coats", title: "Vintage Coat" };
afterEach(() => vi.clearAllMocks());

describe("shared administrative authority and reserved products", () => {
  it("allows the central admin authority to persist a reserved product", async () => {
    mocks.requireAdmin.mockResolvedValue(null);
    mocks.insert.mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ insert: mocks.insert, select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null }) }) }) });

    await expect(createProduct(reservedProduct)).resolves.toMatchObject({ success: true });
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ status: "reserved" }));
  });

  it("denies an unauthorized administrative write before database access", async () => {
    mocks.requireAdmin.mockResolvedValue({ error: "No tenés permisos de administrador." });
    await expect(createProduct(reservedProduct)).resolves.toMatchObject({ error: expect.any(String) });
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
