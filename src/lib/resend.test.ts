import { afterEach, describe, expect, it, vi } from "vitest";
import { getResendMailer } from "./resend";
const resendDouble = vi.hoisted(() => ({ construct: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("resend", () => ({
  Resend: class {
    constructor(apiKey: string) {
      resendDouble.construct(apiKey);
    }
  },
}));

const originalApiKey = process.env.RESEND_API_KEY;
const originalFromEmail = process.env.RESEND_FROM_EMAIL;

function restoreEnvironment() {
  if (originalApiKey === undefined) {
    delete process.env.RESEND_API_KEY;
  } else {
    process.env.RESEND_API_KEY = originalApiKey;
  }

  if (originalFromEmail === undefined) {
    delete process.env.RESEND_FROM_EMAIL;
  } else {
    process.env.RESEND_FROM_EMAIL = originalFromEmail;
  }
}

afterEach(() => {
  restoreEnvironment();
  resendDouble.construct.mockReset();
});

describe("getResendMailer", () => {
  it("loads lazily and returns the configured server-only client and sender", () => {
    expect(resendDouble.construct).not.toHaveBeenCalled();

    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM_EMAIL = "ClubVTG <orders@example.com>";

    expect(getResendMailer()).toMatchObject({ from: "ClubVTG <orders@example.com>" });
    expect(resendDouble.construct).toHaveBeenCalledOnce();
    expect(resendDouble.construct).toHaveBeenCalledWith("re_test_key");
  });

  it.each([
    [undefined, "ClubVTG <orders@example.com>"],
    ["re_test_key", undefined],
    ["re_test_key", "not-an-email"],
  ])("rejects missing or invalid configuration without constructing a client", (apiKey, from) => {
    if (apiKey === undefined) {
      delete process.env.RESEND_API_KEY;
    } else {
      process.env.RESEND_API_KEY = apiKey;
    }

    if (from === undefined) {
      delete process.env.RESEND_FROM_EMAIL;
    } else {
      process.env.RESEND_FROM_EMAIL = from;
    }

    expect(() => getResendMailer()).toThrow("Invalid Resend email configuration");
    expect(resendDouble.construct).not.toHaveBeenCalled();
  });

  it("does not substitute a development sender when configuration is unavailable", () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;

    expect(() => getResendMailer()).toThrow("Invalid Resend email configuration");
    expect(resendDouble.construct).not.toHaveBeenCalled();
  });
});
