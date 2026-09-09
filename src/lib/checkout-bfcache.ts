export function registerCheckoutBfcacheReset(target: EventTarget, setSubmitting: (submitting: boolean) => void): () => void {
  const onPageShow = (event: Event) => {
    if ((event as PageTransitionEvent).persisted) setSubmitting(false);
  };

  target.addEventListener("pageshow", onPageShow);
  return () => target.removeEventListener("pageshow", onPageShow);
}
