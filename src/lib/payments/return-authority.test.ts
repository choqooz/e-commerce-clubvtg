import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOwnedCreditReturnIntent, isCreditIntentId } from "./return-authority";

const mocks = vi.hoisted(() => ({ from: vi.fn(), maybeSingle: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: mocks.from } }));

const intentId = "123e4567-e89b-12d3-a456-426614174000";

function ownedIntent(status: "applied" | "cancelled" | "pending" = "pending") {
  mocks.maybeSingle.mockResolvedValue({
    data: { id: intentId, reference: `credits:${intentId}`, status, user_id: "owner" },
    error: null,
  });
  const query = { eq: vi.fn(), maybeSingle: mocks.maybeSingle, select: vi.fn() };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  mocks.from.mockReturnValue(query);
  return query;
}

describe("credit return authority", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts only a UUID locator and resolves ownership through id and user_id", async () => {
    const query = ownedIntent();

    await expect(getOwnedCreditReturnIntent(intentId, "owner")).resolves.toMatchObject({
      id: intentId,
      reference: `credits:${intentId}`,
      status: "pending",
      user_id: "owner",
    });

    expect(isCreditIntentId(intentId)).toBe(true);
    expect(query.eq).toHaveBeenNthCalledWith(1, "id", intentId);
    expect(query.eq).toHaveBeenNthCalledWith(2, "user_id", "owner");
  });

  it("fails closed for malformed, foreign, and unavailable credit intents", async () => {
    await expect(getOwnedCreditReturnIntent("forged", "owner")).resolves.toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();

    ownedIntent();
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(getOwnedCreditReturnIntent(intentId, "attacker")).resolves.toBeNull();
  });
});
