/* eslint-disable import/order -- Sentry must be mocked before its helper imports. */
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => ({ captureException: mocks.captureException }));

import { captureExceptionSafely } from "./sentry";

afterEach(() => vi.clearAllMocks());

describe("captureExceptionSafely", () => {
  it("discards a Sentry transport failure", () => {
    mocks.captureException.mockImplementation(() => {
      throw new Error("transport unavailable");
    });

    expect(() => captureExceptionSafely(new Error("business failure"))).not.toThrow();
  });

  it("is non-throwing when Sentry is uninitialized", () => {
    mocks.captureException.mockReturnValue(undefined);

    expect(() => captureExceptionSafely(new Error("business failure"))).not.toThrow();
  });
});
