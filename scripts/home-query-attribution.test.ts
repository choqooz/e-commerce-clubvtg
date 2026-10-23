import { expect, it, vi } from "vitest";
import {
  assertSuccessfulCalls,
  localOrigin,
  observedFetch,
  statementDeltas,
} from "./run-home-query-attribution.mjs";

it("detects per-item nested SQL even with constant top-level calls", () => {
  const before = [
    { queryid: "outer", toplevel: true, calls: 5, query: "select outer_rpc()" },
    { queryid: "inner", toplevel: false, calls: 8, query: "select * from public.products" },
  ];
  const after = [
    { ...before[0], calls: 6 },
    { ...before[1], calls: 58 },
  ];
  expect(statementDeltas(before, after)).toEqual([
    { ...before[0], calls: 1 },
    { ...before[1], calls: 50 },
  ]);
});

it("separates top-level and role identities and omits unchanged counters", () => {
  const row = { queryid: "same", userid: 1, toplevel: true, calls: 7, query: "select 1" };
  expect(
    statementDeltas(
      [row],
      [row, { ...row, toplevel: false, calls: 10 }, { ...row, userid: 2, calls: 1 }],
    ),
  ).toEqual([
    { ...row, toplevel: false, calls: 10 },
    { ...row, userid: 2, calls: 1 },
  ]);
});

it.each([
  "https://127.0.0.1:1234",
  "http://localhost:1234",
  "http://example.invalid:1234",
  "http://127.0.0.1",
  "http://user:pass@127.0.0.1:1234",
  "http://127.0.0.1:1234/path",
])("rejects non-disposable origins: %s", (origin) => expect(() => localOrigin(origin)).toThrow());

it("forbids remote requests before the transport and disables redirects", async () => {
  const transport = vi.fn().mockResolvedValue(Response.json([]));
  const calls: { path: string; status: number; body: unknown }[] = [];
  const fetcher = observedFetch("http://127.0.0.1:1234", calls, transport);
  await expect(fetcher("http://example.invalid/rest/v1/products")).rejects.toThrow("Remote");
  expect(transport).not.toHaveBeenCalled();
  await fetcher("http://127.0.0.1:1234/rest/v1/products");
  expect(String(transport.mock.calls[0][0])).toBe("http://127.0.0.1:1234/products");
  expect(transport.mock.calls[0][1].redirect).toBe("error");
  expect(calls).toEqual([{ path: "/rest/v1/products", status: 200, body: [] }]);
});

it("keeps HTTP and transport failures observable even when Home swallows them", async () => {
  const calls: { path: string; status: number; body: unknown }[] = [];
  expect(() => assertSuccessfulCalls(calls)).toThrow("No HTTP evidence");
  const failed = observedFetch(
    "http://127.0.0.1:1234",
    calls,
    vi.fn().mockResolvedValue(Response.json({ error: "synthetic" }, { status: 500 })),
  );
  await failed("http://127.0.0.1:1234/rest/v1/products");
  expect(() => assertSuccessfulCalls(calls)).toThrow("HTTP failure");
  const offline = observedFetch(
    "http://127.0.0.1:1234",
    calls,
    vi.fn().mockRejectedValue(new Error("offline")),
  );
  await expect(offline("http://127.0.0.1:1234/rest/v1/products")).rejects.toThrow("offline");
  expect(calls[1].status).toBe(0);
});
