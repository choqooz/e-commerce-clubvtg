# Scheduled Promotions and Coupons Operations Guide

This guide records the implemented operational boundaries for scheduled promotions,
coupon checkout, settlement, and user deletion. It is a review aid, not a deployment
script: it names current behavior, separates manual procedures, and does not contain
credentials, customer data, payment references, or identity fingerprints.

## Quick operational path

1. Treat the database migrations and narrow server-side RPCs as the pricing and
   settlement authority; do not repair coupon counters or order states directly.
2. Use the signals below to classify a failure, then preserve redacted evidence and
   investigate the authoritative audit or reversal record with an approved role.
3. For a deployment concern, stop writes on uncertainty and use an approved additive
   corrective migration. This change has no feature-specific kill switch.

## Implemented operational signals

| Signal | Implemented behavior | Operator response |
|---|---|---|
| Payment webhook returns `503` with `Retry-After: 60` | The verified payment processor could not complete a retryable operation. | Keep the provider retry path intact; investigate the processor issue and downstream database availability before any manual action. |
| Payment webhook returns `400` or `401` | The notification is malformed, unsupported, conflicts with its request data, or fails signature verification. | Treat it as rejected input. Do not reconstruct a settlement from a request body or change an order directly. |
| Sentry warning: `MercadoPago payment processing issue` | The webhook records a warning when payment processing exposes a classified issue, using only its category, result, and a secret-keyed redacted payment reference. | Inspect the issue category and result in the approved Sentry project; correlate through approved internal tooling only. |
| Checkout action error | Checkout logs the failed intent operation and reports the exception through the existing Sentry helper. | Reproduce with a disposable local environment and inspect the returned safe error, not a customer cart or provider response. |
| Coupon or promotion mutation rejects | The database validates dates, capacity, overlap, one-use identity, term immutability, and authorized state transitions. | Preserve the safe error category and audit the attempted business action; do not bypass the RPC or mutate tables. |

The repository supplies `npm run test:database` for isolated migration and SQL authority
coverage, and `npm run test:e2e:promotions-coupons` for the disposable local
customer/admin journeys. These are verification commands, not production repair
commands. The E2E runner requires an explicit disposable-local opt-in and tears down
the local stack it owns.

## Audit evidence and redaction boundary

### Implemented audit data

| Record | Retained facts | Access and presentation boundary |
|---|---|---|
| `promotion_audit_events` | Actor, action, optional reason, immutable before/after state, and timestamp. | RLS is enabled and public, anonymous, and authenticated roles are revoked. Query only through approved administrative procedures. |
| `coupon_audit_events` | Actor, lifecycle action, required replacement/deactivation reason where applicable, and timestamp. | The administrative coupon projection reads only coupon lifecycle actions; it does not return audit actor or reason. The audit table is RLS-protected and not publicly granted. |
| `product_payment_reversal_evidence` | Refund/chargeback class, ARS reversal total, and creation time. | `get_order_history_reversal_evidence` exposes the safe history projection; order UI renders only class, amount, and time-derived display data. |
| `coupon_reservation_release_evidence` and coupon identity/reservation tables | Reservation/release and one-use enforcement facts. | These are internal RLS-protected authority tables. They are not customer or administrative display data. |

The following are mandatory redaction boundaries in tickets, dashboards, exports, and
this document: secrets; raw HMAC material; identity fingerprints or key versions;
Clerk identities, emails, names, addresses, or shipping information; provider payment
identifiers, references, signatures, and payloads; and internal authorization rows.
Use aggregate counts, event class, status, timestamp, and monetary cents only when the
audience is authorized for them. Webhook Sentry telemetry uses a deterministic, truncated
HMAC-SHA256 reference prefixed with `mp_`; it supports correlation without exposing the
provider payment identifier or the signing secret.

## Privacy lifecycle, retention, and coupon identity

### Implemented lifecycle

- Coupon quoting and coupon checkout require a signed-in user with a verified primary
  email. The server derives an HMAC-SHA256 fingerprint from the normalized email with
  `COUPON_IDENTITY_HMAC_KEY_V1` and sends only the fingerprint plus key version `v1`
  to the coupon RPCs.
- Coupon one-use enforcement retains the fingerprint and version in protected,
  immutable identity and reservation records. Quotes are non-reserving; a successful
  approved settlement consumes the reservation and persists the identity use.
- A Clerk `user.deleted` webhook verifies the event, removes scoped objects from
  `user-uploads` and `ai-results`, then calls `anonymize_clerk_user`.
- Anonymization removes the profile and AI try-on records, clears relational and
  operational personal data from retained financial rows, and records an irreversible
  anonymization marker. Financial facts and checkout snapshots remain unchanged.

### Rotation and retention limits

Only the `v1` identity-key configuration is implemented. There is no automated HMAC
rotation, dual-key lookup, key-retirement job, coupon-identity deletion job, or
retention-duration scheduler in this change. Do not rotate by changing the existing
environment value or rewriting stored fingerprints: doing so can break one-use
enforcement and historical attribution.

Any future rotation or retention policy is a manual product/security decision and must
be delivered as an approved additive design and migration. It must preserve the stored
key-version contract, protect existing immutable evidence, define an authorized
deletion basis, and include regression coverage before it is enabled.

## Rollout and kill-switch status

No feature-specific rollout flag or kill switch is implemented for promotions or
coupons. In particular, `COUPON_IDENTITY_HMAC_KEY_V1` is secret configuration, and the
`E2E_LOCAL_*` variables are disposable-local test controls; neither is a production
rollout control. Do not use an environment change as an undocumented way to disable
commerce authority.

The safe rollout sequence is an operator procedure, not automatic behavior:

1. Capture current target, function, ACL, RLS, and migration-history evidence with an
   approved read-only role. The existing privileged-RPC preflight is a useful pattern,
    but it does not itself validate migrations `023` through `029`.
2. Apply the reviewed migrations in their existing order: `023_scheduled_promotions_foundation.sql`,
   `024_promotion_authority.sql`, `025_coupon_checkout_authority.sql`,
   `026_discount_settlement_refunds.sql`, `027_discount_settlement_authority.sql`, and
    `028_coupon_admin_lifecycle_authority.sql`, and
    `20260901172015_promotion_revision_authority.sql`.
3. Verify ACL/RLS and the affected migration suites in a disposable environment, then
   deploy the matching server actions and UI. Keep protected RPCs server-only.
4. Observe the payment, checkout, and audit signals above. Stop the rollout on drift,
   unassessed security findings, or failed authority checks; do not delete evidence to
   recover service.

## Migration compatibility and rollback boundary

The migrations are additive and preserve existing commerce evidence. Order and item
snapshot fields coexist with legacy rows: integrity-version-zero rows remain outside
the new snapshot constraint, while integrity-version-one rows require the authoritative
pricing fields. The legacy four-argument `create_product_checkout` RPC remains and
delegates to the promotions source, preserving base checkout callers during the
transition.

There is no implemented destructive down migration or rollback command for this
feature. Applied history, append-only audits, immutable versions, reservations, and
financial evidence must not be rewritten or removed. The repository's deployed-state
preflight documents the applicable rule: retain catalog evidence and reverse only by
an approved additive corrective migration. A corrective migration must preserve the
existing RPC signatures and ACL boundaries until all callers have moved safely.

## Refund and capacity boundary

Pending checkout cancellation, rejection, and expiry can release an unconsumed coupon
reservation through the authorized cancellation path. That is distinct from a settled
coupon use. Once an approved settlement consumes the coupon reservation and records
the one-use identity, a refund or chargeback only appends reversal evidence and returns
the case for manual review. It does not decrement `used_count`, restore capacity,
remove the identity use, re-reserve stock, reactivate the coupon, or create a
replacement. Replacement remains a deliberate administrator action with a reason.

## Review checklist

- [x] Operational signals map to existing webhook, checkout, audit, and test paths.
- [x] Audit records and mandatory redaction boundaries are stated without sensitive data.
- [x] Privacy lifecycle, current `v1` HMAC limitation, retention, and deletion are explicit.
- [x] Absence of rollout flags and the manual safe rollout sequence are explicit.
- [x] Additive rollback and compatibility limits are explicit.
- [x] Refunds are explicitly non-restorative for coupon use and capacity.
