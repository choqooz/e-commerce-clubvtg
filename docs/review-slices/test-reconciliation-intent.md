# Navigation and cart test reconciliation

S4 authorizes “reconciling `src/contexts/cart-header-context.test.tsx` without disabling lint” and “reconciling `src/components/navigation-storefront-presentation.test.tsx` with accepted credits navigation without weakening checks.” S45 selects “Preparar unidades más pequeñas (recomendado)”: “Preservo el commit verificado original y preparo una división revisable sin quitar pruebas ni publicar. Los nuevos candidatos necesitarán verificación propia.”

This smaller candidate starts at `9ee3205ade3ccd2b408e5d55f75bfe202ca0a6e3` and takes only the two test payloads from `5eb65f4e5758ec0dfbaa29675d6e90af7a6394a7`:

- Navigation retains full-byte preservation pins, updated to the accepted credits-anchor bytes; header normalization for the previously accepted cart-hook split remains unchanged.
- Cart resets the mock effect queue through a helper on each provider invocation, including SSR retries, without changing the assertions.

There are no dependency, lockfile or production-code changes in this slice. It is a new candidate, not approval or publication of the preserved original.
