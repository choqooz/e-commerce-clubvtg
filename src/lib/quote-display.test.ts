import { describe, expect, it } from "vitest";
import { formatPrice } from "./config";
import { formatQuoteCents } from "./quote-display";

describe("formatQuoteCents", () => {
  it("converts quote cents to ARS major units before project currency formatting", () => {
    expect(formatQuoteCents("500000")).toBe(formatPrice(5000));
    expect(formatQuoteCents("1000000")).toBe(formatPrice(10000));
    expect(formatQuoteCents("1200000")).toBe(formatPrice(12000));
    expect(formatQuoteCents("500000")).not.toBe(formatPrice(500000));
  });
});
