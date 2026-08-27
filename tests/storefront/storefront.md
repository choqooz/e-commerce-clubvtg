### E2E Tests: Storefront checkout boundary

**Suite ID:** `STOREFRONT-E2E`
**Feature:** Unauthenticated checkout routing.

## Test Case: `STOREFRONT-E2E-001` - Guest checkout redirects to Clerk

**Priority:** `critical`

**Tags:**
- type → @e2e
- feature → @storefront

**Description/Objective:** Verify a catalog product can be added to the cart before checkout requires Clerk authentication.

**Preconditions:**
- The local storefront has at least one catalog product.
- Clerk development sign-in is reachable.

### Flow Steps:
1. Open the catalog and choose the first semantic product link.
2. Add the product to the cart and open checkout.
3. Verify the hosted Clerk sign-in URL, heading, and email field.

### Expected Result:
- The cart dialog shows one item.
- Clerk receives a redirect URL targeting `/checkout`.
