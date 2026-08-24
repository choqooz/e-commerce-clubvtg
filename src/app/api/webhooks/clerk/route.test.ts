/* eslint-disable import/order -- The route import follows dependency mocks. */
import { createHash } from "node:crypto";
import { Webhook } from "svix";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  headers: new Headers(),
  listV2: vi.fn(),
  remove: vi.fn(),
  rpc: vi.fn(),
  storageFrom: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: mocks.from, rpc: mocks.rpc, storage: { from: mocks.storageFrom } },
}));

vi.mock("next/headers", () => ({
  headers: async () => mocks.headers,
}));

import { POST } from "./route";

const SIGNING_SECRET = `whsec_${createHash("sha256").update("clerk-webhook-route-test-signing-key").digest("base64")}`;
const TEST_TIME = new Date("2026-08-24T12:00:00.000Z");

const CREATED_EVENT = {
  data: {
    created_at: TEST_TIME.getTime(),
    email_addresses: [{ email_address: "ada@example.com", id: "idn_123" }],
    first_name: "Ada",
    id: "user_123",
    last_name: "Lovelace",
    primary_email_address_id: "idn_123",
  },
  object: "event",
  type: "user.created",
};

const DELETED_EVENT = { data: { id: "user_123" }, object: "event", type: "user.deleted" };

function storagePage(names: string[] = [], hasNext = false, nextCursor?: string) {
  return {
    data: {
      folders: [],
      hasNext,
      nextCursor,
      objects: names.map((name) => ({ key: `user_123/${name}`, name })),
    },
    error: null,
  };
}

function signedRequest({
  event = CREATED_EVENT,
  body,
  signatureBody,
}: {
  event?: object;
  body?: string;
  signatureBody?: string;
} = {}) {
  const originalBody = JSON.stringify(event, null, 2);
  const deliveredBody = body ?? originalBody;
  const signedBody = signatureBody ?? originalBody;
  const messageId = "msg_123";
  const timestamp = String(Math.floor(TEST_TIME.getTime() / 1_000));
  const signature = new Webhook(SIGNING_SECRET).sign(messageId, TEST_TIME, signedBody);
  const headers = new Headers({
    "content-type": "application/json",
    "svix-id": messageId,
    "svix-signature": signature,
    "svix-timestamp": timestamp,
  });

  mocks.headers = headers;
  return new Request("http://localhost/api/webhooks/clerk", {
    body: deliveredBody,
    headers,
    method: "POST",
  });
}

function expectNoLifecycleMutation() {
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.upsert).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TEST_TIME);
  process.env.CLERK_WEBHOOK_SECRET = SIGNING_SECRET;
  mocks.from.mockReset();
  mocks.listV2.mockReset();
  mocks.remove.mockReset();
  mocks.rpc.mockReset();
  mocks.storageFrom.mockReset();
  mocks.upsert.mockReset();
  mocks.from.mockReturnValue({ upsert: mocks.upsert });
  mocks.listV2.mockResolvedValue(storagePage());
  mocks.remove.mockResolvedValue({ data: [], error: null });
  mocks.rpc.mockResolvedValue({ data: "inactive", error: null });
  mocks.storageFrom.mockReturnValue({ listV2: mocks.listV2, remove: mocks.remove });
  mocks.upsert.mockResolvedValue({ error: null });
});

afterEach(() => {
  delete process.env.CLERK_WEBHOOK_SECRET;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Clerk webhook request-verification boundary", () => {
  it("dispatches a recognized event only after Clerk accepts its untouched signed request", async () => {
    const response = await POST(signedRequest());

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["tampered body", { body: `${JSON.stringify(CREATED_EVENT, null, 2)}\n ` }],
    ["reserialized body", { body: JSON.stringify(CREATED_EVENT) }],
  ])("rejects a %s without lifecycle mutation", async (_name, requestOptions) => {
    const response = await POST(signedRequest(requestOptions));

    expect(response.status).toBeGreaterThanOrEqual(400);
    expectNoLifecycleMutation();
  });

  it.each([
    ["invalid signature", (request: Request) => request.headers.set("svix-signature", "v1,bad")],
    ["missing required header", (request: Request) => request.headers.delete("svix-id")],
  ])("rejects an %s before parsing or dispatch", async (_name, alter) => {
    const request = signedRequest();
    const json = vi.fn(() => Promise.reject(new Error("route must not parse before verification")));
    Object.defineProperty(request, "json", { value: json });
    alter(request);

    const response = await POST(request);

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(json).not.toHaveBeenCalled();
    expectNoLifecycleMutation();
  });

  it("acknowledges a signed unsupported type without mutation and logs only its type", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const response = await POST(
      signedRequest({ event: { data: { id: "sess_123" }, object: "event", type: "session.created" } }),
    );

    expect(response.status).toBe(200);
    expectNoLifecycleMutation();
    expect(info).toHaveBeenCalledWith("[webhook] Unsupported Clerk event", { eventType: "session.created" });
  });

  it("keeps a verified supported processing failure retryable", async () => {
    mocks.upsert.mockResolvedValueOnce({ error: { message: "database unavailable" } });

    const response = await POST(signedRequest());

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
});

describe("Clerk lifecycle synchronization", () => {
  it.each([
    ["missing primary ID", { ...CREATED_EVENT, data: { ...CREATED_EVENT.data, primary_email_address_id: null } }],
    [
      "unmatched primary ID",
      { ...CREATED_EVENT, data: { ...CREATED_EVENT.data, primary_email_address_id: "idn_missing" } },
    ],
    [
      "ambiguous primary ID",
      {
        ...CREATED_EVENT,
        data: {
          ...CREATED_EVENT.data,
          email_addresses: [
            { email_address: "ada@example.com", id: "idn_123" },
            { email_address: "other@example.com", id: "idn_123" },
          ],
        },
      },
    ],
    [
      "missing primary address",
      { ...CREATED_EVENT, data: { ...CREATED_EVENT.data, email_addresses: [{ email_address: "", id: "idn_123" }] } },
    ],
  ])("rejects %s without mutation", async (_name, event) => {
    const response = await POST(signedRequest({ event }));

    expect(response.status).toBeGreaterThanOrEqual(500);
    expectNoLifecycleMutation();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(["user.created", "user.updated"])("synchronizes %s identity without credits", async (type) => {
    const event = {
      ...CREATED_EVENT,
      type,
      data: { ...CREATED_EVENT.data, email_addresses: [{ email_address: " ADA@Example.COM ", id: "idn_123" }] },
    };

    const response = await POST(signedRequest({ event }));

    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      { email: "ada@example.com", full_name: "Ada Lovelace", id: "user_123" },
      { onConflict: "id" },
    );
    expect(mocks.upsert.mock.calls[0][0]).not.toHaveProperty("credits");
    expect(mocks.rpc).toHaveBeenCalledWith("apply_clerk_registration_bonus", {
      p_event_time: expect.any(String),
      p_user_id: "user_123",
    });
  });

  it("converges an update delivered before creation to a neutral profile", async () => {
    const updated = { ...CREATED_EVENT, type: "user.updated" };

    await expect(POST(signedRequest({ event: updated }))).resolves.toMatchObject({ status: 200 });
    await expect(POST(signedRequest())).resolves.toMatchObject({ status: 200 });

    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.upsert.mock.calls.every(([profile]) => !("credits" in profile))).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it("keeps inactive bonus authority and RPC failures retryable without application-side grants", async () => {
    mocks.rpc.mockResolvedValue({ data: "inactive", error: null });

    expect((await POST(signedRequest())).status).toBe(200);
    expect((await POST(signedRequest())).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.from).toHaveBeenCalledWith("profiles");
    expect(mocks.from).not.toHaveBeenCalledWith("credit_transactions");

    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
    expect((await POST(signedRequest())).status).toBeGreaterThanOrEqual(500);
  });

  it("acknowledges active granted and already-granted database outcomes without direct credits", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: "granted", error: null }).mockResolvedValueOnce({ data: "already_granted", error: null });

    expect((await POST(signedRequest())).status).toBe(200);
    expect((await POST(signedRequest())).status).toBe(200);
    expect(mocks.upsert.mock.calls.every(([profile]) => !("credits" in profile))).toBe(true);
  });
});

describe("Clerk lifecycle deletion", () => {
  it("paginates exact scoped Storage paths, verifies cleanup, then anonymizes", async () => {
    mocks.listV2
      .mockResolvedValueOnce(storagePage(["one.png", "two.png"], true, "uploads-next"))
      .mockResolvedValueOnce(storagePage(["nested/three.png"]))
      .mockResolvedValueOnce(storagePage())
      .mockResolvedValueOnce(storagePage(["result.png"], true, "results-next"))
      .mockResolvedValueOnce(storagePage(["nested/final.png"]))
      .mockResolvedValueOnce(storagePage());
    mocks.rpc.mockResolvedValue({ data: "anonymized", error: null });

    expect((await POST(signedRequest({ event: DELETED_EVENT }))).status).toBe(200);

    expect(mocks.storageFrom).toHaveBeenCalledWith("user-uploads");
    expect(mocks.storageFrom).toHaveBeenCalledWith("ai-results");
    expect(mocks.listV2).toHaveBeenCalledWith({ limit: 100, prefix: "user_123/" });
    expect(mocks.listV2).toHaveBeenCalledWith({ cursor: "uploads-next", limit: 100, prefix: "user_123/" });
    expect(mocks.remove).toHaveBeenNthCalledWith(1, ["user_123/one.png", "user_123/two.png", "user_123/nested/three.png"]);
    expect(mocks.remove).toHaveBeenNthCalledWith(2, ["user_123/result.png", "user_123/nested/final.png"]);
    expect(mocks.remove.mock.invocationCallOrder.at(-1)).toBeLessThan(mocks.rpc.mock.invocationCallOrder[0]);
    expect(mocks.rpc).toHaveBeenCalledWith("anonymize_clerk_user", { p_user_id: "user_123" });
  });

  it.each([
    ["listing", () => mocks.listV2.mockResolvedValueOnce({ data: null, error: { message: "offline" } })],
    ["removal", () => {
      mocks.listV2.mockResolvedValueOnce(storagePage(["one.png"]));
      mocks.remove.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
    }],
    ["residual objects", () => {
      mocks.listV2.mockResolvedValueOnce(storagePage(["one.png"])).mockResolvedValueOnce(storagePage(["one.png"]));
    }],
    ["database anonymization", () => mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "offline" } })],
    ["inactive anonymization", () => mocks.rpc.mockResolvedValueOnce({ data: "inactive", error: null })],
    ["malformed anonymization", () => mocks.rpc.mockResolvedValueOnce({ data: "done", error: null })],
  ])("keeps %s failures retryable without false completion", async (_name, arrange) => {
    arrange();

    expect((await POST(signedRequest({ event: DELETED_EVENT }))).status).toBeGreaterThanOrEqual(500);
  });

  it("acknowledges successful cleanup retries and already-clean anonymized deliveries without financial deletes", async () => {
    mocks.listV2.mockResolvedValueOnce(storagePage(["one.png"]));
    mocks.remove.mockResolvedValueOnce({ data: null, error: { message: "offline" } });
    expect((await POST(signedRequest({ event: DELETED_EVENT }))).status).toBeGreaterThanOrEqual(500);

    mocks.rpc.mockResolvedValue({ data: "already_anonymized", error: null });
    expect((await POST(signedRequest({ event: DELETED_EVENT }))).status).toBe(200);
    expect((await POST(signedRequest({ event: DELETED_EVENT }))).status).toBe(200);
    expect(mocks.from).not.toHaveBeenCalledWith("orders");
    expect(mocks.from).not.toHaveBeenCalledWith("credit_transactions");
    expect(mocks.from).not.toHaveBeenCalledWith("order_items");
  });

  it.each([null, "", "profile_123"])('rejects deleted user identity %s without mutation', async (id) => {
    const event = { ...DELETED_EVENT, data: { id } };

    expect((await POST(signedRequest({ event }))).status).toBeGreaterThanOrEqual(400);
    expect(mocks.storageFrom).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
