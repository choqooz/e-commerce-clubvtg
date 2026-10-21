import { flushSync } from "react-dom";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
type Capture = { owner: Document; commit: () => void; cancel: () => void; cleanup: () => void };
let active: Capture | undefined;

/** Settle before reading the URL, including when the next intent appears to be a no-op. */
export function finishPendingCatalogTransition(): void {
  const previous = active;
  if (!previous) return;
  previous.cancel();
  previous.cleanup();
  // Skipping a capture must not discard a still-pending history mutation.
  if (typeof document !== "undefined" && previous.owner === document) previous.commit();
}

/** Only synchronous external-store mutations belong here; never router.push or async work. */
export function runCatalogTransition(update: () => void): void {
  finishPendingCatalogTransition();
  if (typeof document === "undefined") {
    update();
    return;
  }
  const motion = typeof window !== "undefined" ? window.matchMedia?.(REDUCED_MOTION) : undefined;
  if (
    !document.startViewTransition ||
    typeof CSS === "undefined" ||
    !CSS.supports("selector(:active-view-transition-type(storefront-catalog))") ||
    motion?.matches ||
    !document.querySelector("[data-storefront-catalog]")
  ) {
    update();
    return;
  }

  let attempted = false;
  let mutationFailed = false;
  let mutationError: unknown;
  const commit = () => {
    if (attempted) return;
    attempted = true;
    try {
      // useSyncExternalStore subscribers and their DOM must commit before the new snapshot.
      flushSync(update);
    } catch (error) {
      mutationFailed = true;
      mutationError = error;
      throw error;
    }
  };
  let transition: ViewTransition | undefined;
  const cancel = () => {
    try {
      transition?.skipTransition();
    } catch {
      /* Cancellation cannot block navigation. */
    }
  };
  const reduce = () => {
    if (motion?.matches) cancel();
  };
  const capture: Capture = {
    owner: document,
    commit,
    cancel,
    cleanup: () => {
      motion?.removeEventListener("change", reduce);
      if (active === capture) active = undefined;
    },
  };
  try {
    transition = document.startViewTransition({ update: commit, types: ["storefront-catalog"] });
    active = capture;
    motion?.addEventListener("change", reduce);
    // All three promises may reject on skip/capture failure. None can strand a mutation.
    void transition.ready.catch(() => {});
    void transition.updateCallbackDone.catch(() => {});
    const settle = () => {
      capture.cleanup();
      commit();
    };
    void transition.finished.then(settle, settle).catch(() => {});
  } catch {
    capture.cleanup();
    if (mutationFailed) throw mutationError;
    commit();
  }
}
