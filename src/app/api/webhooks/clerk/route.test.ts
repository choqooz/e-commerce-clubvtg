/* eslint-disable import/order -- The route import follows dependency mocks. */
import { Webhook } from "svix";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  headers: new Headers(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: mocks.from },
}));

vi.mock("next/headers", () => ({
  headers: async () => mocks.headers,
}));

import { POST } from "./route";

const SIGNING_SECRET = "whsec_dGVzdF9jbGVya193ZWJob29rX3NpZ25pbmdfc2VjcmV0";
const TEST_TIME = new Date("2026-08-24T12:00:00.000Z");

const CREATED_EVENT = {
  data: {
    email_addresses: [{ email_address: "ada@example.com", id: "idn_123" }],
    first_name: "Ada",
    id: "user_123",
    last_name: "Lovelace",
  },
  object: "event",
  type: "user.created",
};

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

describe("Clerk webhook request-verification boundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(TEST_TIME);
    process.env.CLERK_WEBHOOK_SECRET = SIGNING_SECRET;
    mocks.from.mockReset();
    mocks.upsert.mockReset();
    mocks.from.mockReturnValue({ upsert: mocks.upsert });
    mocks.upsert.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    delete process.env.CLERK_WEBHOOK_SECRET;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

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
