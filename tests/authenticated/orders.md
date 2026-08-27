### E2E Tests: Authenticated empty orders

**Suite ID:** `ORDERS-E2E`
**Feature:** Authenticated orders access.

## Test Case: `ORDERS-E2E-001` - Authenticated user sees empty orders

**Priority:** `critical`

**Tags:**
- type → @e2e
- feature → @orders

**Description/Objective:** Verify an authenticated user reaches orders without Hosted Sign-in and can return to the catalog.

**Preconditions:**
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are Clerk development test credentials.
- `E2E_CLERK_USER_EMAIL` identifies a dedicated Clerk development test user with no orders.

### Flow Steps:
1. Reuse the Clerk authentication state created by the serial setup project.
2. Open `/orders`.
3. Verify the empty-orders heading and catalog action.

### Expected Result:
- The browser remains on `/orders`, not Hosted Sign-in.
- The empty-orders heading and catalog action are visible.
