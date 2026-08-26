/* eslint-disable import/order -- Route dependencies must be mocked before import. */
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- The route boundary is exercised with focused Vitest doubles.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), captureException: vi.fn(), createSignedUrl: vi.fn(), currentUser: vi.fn(), from: vi.fn(), generateTryOn: vi.fn(), getPostHogServer: vi.fn(),
  logUpdate: vi.fn(), processUserImage: vi.fn(), profileSingle: vi.fn(), rateLimit: vi.fn(), rpc: vi.fn(), runContentGuard: vi.fn(), validateImage: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth, currentUser: mocks.currentUser }));
vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));
vi.mock("@/lib/ai/content-guard", () => ({ runContentGuard: mocks.runContentGuard }));
vi.mock("@/lib/ai/image-processing", () => ({ processUserImage: mocks.processUserImage, validateImage: mocks.validateImage }));
vi.mock("@/lib/ai/openai", () => ({ generateTryOn: mocks.generateTryOn, getOpenAI: vi.fn() }));
vi.mock("@/lib/ai/prompts", () => ({ buildTryOnPrompt: vi.fn(() => "prompt") }));
vi.mock("@/lib/posthog", () => ({ getPostHogServer: mocks.getPostHogServer }));
vi.mock("@/lib/rate-limit", () => ({ rateLimiter: { limit: mocks.rateLimit } }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: mocks.from, rpc: mocks.rpc, storage: { from: vi.fn(() => ({ createSignedUrl: mocks.createSignedUrl, upload: vi.fn().mockResolvedValue({ error: null }) })) } } }));

import { POST } from "./route";

function request() {
  const form = new FormData();
  form.set("productSlug", "vintage-coat");
  form.set("image", new Blob(["image"], { type: "image/jpeg" }), "portrait.jpg");
  return new Request("http://localhost/api/ai/process", { body: form, method: "POST" });
}

function prepare() {
  mocks.auth.mockResolvedValue({ userId: "user_123" });
  mocks.currentUser.mockResolvedValue({ emailAddresses: [{ id: "email_123", verification: { status: "verified" } }], primaryEmailAddressId: "email_123" });
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.validateImage.mockResolvedValue({ valid: true });
  mocks.processUserImage.mockResolvedValue({ buffer: Buffer.from("image"), height: 100, width: 100 });
  mocks.runContentGuard.mockResolvedValue({ approved: true });
  mocks.profileSingle.mockResolvedValue({ data: { credits: 2 }, error: null });
  mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://signed.test/image" }, error: null });
  mocks.logUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  mocks.from.mockImplementation((table) => {
    if (table === "profiles") return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: mocks.profileSingle }) }) };
    if (table === "products") return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { category: "outerwear", id: "product_123", image_urls: ["https://image.test/product.jpg"], status: "available", title: "Coat" }, error: null }) }) }) };
    return { update: mocks.logUpdate };
  });
  mocks.rpc.mockImplementation((name) => Promise.resolve({ data: name === "use_ai_credit" ? "log_123" : "refunded", error: null }));
}

beforeEach(() => { vi.clearAllMocks(); prepare(); });
afterEach(() => vi.restoreAllMocks());

describe("AI process failure and analytics runtime boundary", () => {
  it("records failure before the idempotent refund RPC and replays the same log without a second applied refund", async () => {
    const outcomes = ["refunded", "already_refunded"];
    const refundResults: string[] = [];
    mocks.generateTryOn.mockRejectedValue(new Error("provider unavailable"));
    mocks.captureException.mockImplementation(() => {
      throw new Error("Sentry unavailable");
    });
    mocks.rpc.mockImplementation((name) => {
      const data = name === "use_ai_credit" ? "log_123" : outcomes.shift();
      if (name === "refund_ai_credit") refundResults.push(data);
      return Promise.resolve({ data, error: null });
    });

    await expect((await POST(request())).text()).resolves.toContain('"code":"generation_failed"');
    await expect((await POST(request())).text()).resolves.toContain('"code":"generation_failed"');

    const refunds = mocks.rpc.mock.calls.filter(([name]) => name === "refund_ai_credit");
    expect(mocks.logUpdate.mock.invocationCallOrder[0]).toBeLessThan(mocks.rpc.mock.invocationCallOrder[mocks.rpc.mock.calls.findIndex(([name]) => name === "refund_ai_credit")]);
    expect(refunds).toHaveLength(2);
    expect(refunds.every(([, args]) => args.p_log_id === "log_123")).toBe(true);
    expect(refundResults).toEqual(["refunded", "already_refunded"]);
  });

  it("keeps a completed generation intact when PostHog throws", async () => {
    const shutdown = vi.fn().mockRejectedValue(new Error("analytics unavailable"));
    mocks.generateTryOn.mockResolvedValue({ imageBase64: Buffer.from("result").toString("base64") });
    mocks.getPostHogServer.mockReturnValue({ capture: vi.fn(), shutdown });

    await expect((await POST(request())).text()).resolves.toContain('"type":"complete"');

    expect(mocks.logUpdate).toHaveBeenCalledWith({ result_image_url: "user_123/log_123.jpg", status: "completed" });
    expect(mocks.rpc).not.toHaveBeenCalledWith("refund_ai_credit", expect.anything());
    expect(shutdown).toHaveBeenCalledOnce();
  });
});
