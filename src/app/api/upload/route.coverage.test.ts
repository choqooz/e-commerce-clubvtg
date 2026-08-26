/* eslint-disable import/order -- Route dependencies must be mocked before import. */
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), requireAdmin: vi.fn() }));
vi.mock("@/lib/actions/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { storage: { from: mocks.from } } }));
import { POST } from "./route";

afterEach(() => vi.clearAllMocks());

describe("upload authorization boundary", () => {
  it.each([["unauthenticated", "No autenticado. Iniciá sesión para continuar.", 401], ["non-admin", "No tenés permisos de administrador.", 403]])("denies a %s request before parsing or accessing privileged storage", async (_name, error, status) => {
    mocks.requireAdmin.mockResolvedValue({ error });
    const formData = vi.fn();
    const request = new Request("http://localhost/api/upload", { method: "POST" });
    Object.defineProperty(request, "formData", { value: formData });

    const response = await POST(request);

    expect(response.status).toBe(status);
    expect(formData).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
