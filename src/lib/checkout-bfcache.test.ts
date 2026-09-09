import { describe, expect, it, vi } from "vitest";
import { registerCheckoutBfcacheReset } from "./checkout-bfcache";

function pageShowEvent(persisted: boolean): Event {
  const event = new Event("pageshow");
  Object.defineProperty(event, "persisted", { value: persisted });
  return event;
}

describe("registerCheckoutBfcacheReset", () => {
  it("re-enables checkout only after a persisted pageshow and removes its listener during cleanup", () => {
    const target = new EventTarget();
    const setIsSubmitting = vi.fn();
    const cleanup = registerCheckoutBfcacheReset(target, setIsSubmitting);

    target.dispatchEvent(pageShowEvent(false));
    expect(setIsSubmitting).not.toHaveBeenCalled();

    target.dispatchEvent(pageShowEvent(true));
    expect(setIsSubmitting).toHaveBeenCalledExactlyOnceWith(false);

    cleanup();
    target.dispatchEvent(pageShowEvent(true));
    expect(setIsSubmitting).toHaveBeenCalledExactlyOnceWith(false);
  });
});
