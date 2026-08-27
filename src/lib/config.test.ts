import { afterEach, describe, expect, it, vi } from "vitest";

const CONFIG_KEYS = [
  "SHIPPING_FLAT_FEE",
  "CREDIT_PACK_BASIC_AMOUNT",
  "CREDIT_PACK_BASIC_PRICE",
  "CREDIT_PACK_POPULAR_AMOUNT",
  "CREDIT_PACK_POPULAR_PRICE",
  "CREDIT_PACK_PRO_AMOUNT",
  "CREDIT_PACK_PRO_PRICE",
] as const;

const savedEnvironment = Object.fromEntries(
  CONFIG_KEYS.map((key) => [key, process.env[key]]),
);

function resetConfigEnvironment() {
  for (const key of CONFIG_KEYS) delete process.env[key];
  vi.resetModules();
}

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
});

describe("business configuration", () => {
  it("uses the existing defaults when optional numeric environment variables are absent", async () => {
    resetConfigEnvironment();

    const { CREDIT_PACKS, SHIPPING_FEE } = await import("./config");

    expect(SHIPPING_FEE).toBe(5000);
    expect(CREDIT_PACKS).toMatchObject([
      { credits: 3, price: 1500 },
      { credits: 7, price: 3000 },
      { credits: 15, price: 5500 },
    ]);
  });

  it("accepts zero only for the shipping fee", async () => {
    resetConfigEnvironment();
    process.env.SHIPPING_FLAT_FEE = "0";
    process.env.CREDIT_PACK_BASIC_AMOUNT = "1";
    process.env.CREDIT_PACK_BASIC_PRICE = "1";

    const { CREDIT_PACKS, SHIPPING_FEE } = await import("./config");

    expect(SHIPPING_FEE).toBe(0);
    expect(CREDIT_PACKS[0]).toMatchObject({ credits: 1, price: 1 });
  });

  it.each(CONFIG_KEYS)("rejects a fractional value for %s", async (key) => {
    resetConfigEnvironment();
    process.env[key] = "1.5";

    await expect(import("./config")).rejects.toThrow(`Invalid environment variable ${key}`);
  });

  it.each(["", "NaN", "Infinity", "9007199254740992"])(
    "rejects malformed or unsafe shipping values: %s",
    async (value) => {
      resetConfigEnvironment();
      process.env.SHIPPING_FLAT_FEE = value;

      await expect(import("./config")).rejects.toThrow(
        "Invalid environment variable SHIPPING_FLAT_FEE",
      );
    },
  );

  it("rejects values below each variable's allowed minimum", async () => {
    resetConfigEnvironment();
    process.env.SHIPPING_FLAT_FEE = "-1";

    await expect(import("./config")).rejects.toThrow(
      "Invalid environment variable SHIPPING_FLAT_FEE",
    );

    resetConfigEnvironment();
    process.env.CREDIT_PACK_BASIC_AMOUNT = "0";

    await expect(import("./config")).rejects.toThrow(
      "Invalid environment variable CREDIT_PACK_BASIC_AMOUNT",
    );

    resetConfigEnvironment();
    process.env.CREDIT_PACK_BASIC_PRICE = "0";

    await expect(import("./config")).rejects.toThrow(
      "Invalid environment variable CREDIT_PACK_BASIC_PRICE",
    );
  });
});
