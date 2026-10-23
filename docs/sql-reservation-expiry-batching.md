# Reservation expiry batching was not adopted

**Keep the production baseline.** Local multi-item cancellation improved, but
single-item (M1) non-regression was not established. The candidate was retired
from active scripts, not deployed. This closeout retains diagnostic tooling and
proofs; it does not fix application SQL, change Home's await, or add a scheduler.

## Quick path: retained checks

Run from the repository root with dependencies already provisioned:

```sh
# Local direct-SQL baseline; requires an already-local postgres:17 Docker image.
node scripts/sql-cancellation-benchmark.mjs

# Utilities/protocol; Home live integration skips without a disposable origin.
npm test -- scripts/sql-cancellation-benchmark.test.ts scripts/database-test-suite-selection.test.ts scripts/home-query-attribution.test.ts src/app/home-query-attribution.test.tsx --exclude 'odd/**' --config scripts/run-home-query-attribution.mjs --configLoader runner

# Existing isolated payment/expiry/checkout concurrency proof only.
npm run test:database -- --suite 036_expire_product_reservations_concurrency
```

The baseline uses `unix:///var/run/docker.sock`, an owned network-disabled tmpfs
PostgreSQL container, read-only SQL mounts, synthetic buyers, and current checkout
functions. It needs no production connection, real credentials, or `.env` file.
Protected Home/selector/concurrency source files, support SQL, the fixture and
numbered migrations are required; missing or unreadable inputs fail preflight.
Only local `fonts/` and the two ignored task files
`odd/tasks/sql-query-attribution.md` and
`odd/tasks/sql-reservation-expiry-batching.md` are optional. A fresh checkout needs
none of those optional inputs. Missing optional roots are recorded as `null` and
reported in `PRESERVED_SHA256.optionalAbsent`; existing files retain SHA256 checks.
The final resnapshot detects changed/removed bytes, added font files, and absent
inputs being created, including an empty fonts tree. Only optional-root `ENOENT`
is accepted; other I/O errors and nested font-read failures still fail closed.
Neither the baseline nor its unit tests depend on the ignored archive.

No-argument invocation is the only supported CLI. Unknown arguments and retired
`--compare` / `--verify-candidate` flags fail with baseline-only usage **before
Docker access**. Their historical commands must not be used as current checks.
The recommended Vitest invocation explicitly excludes `odd/**`, so ignored
historical copies are neither selected nor counted. No archive or default project
configuration was changed to achieve this.

## What was attributed, and what was timed

| Experiment                                | Observed result                                                               | Boundary                                                                               |
| ----------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Earlier catalog cardinality N=1/10/50     | 3 HTTP calls, 3 top-level SQL statements, 2 nested SQL calls in each scenario | Actual unchanged Home invocation via real SDK/local PostgREST; not a Next HTTP request |
| Earlier expired one-item orders N=1/10/50 | Same 3 HTTP/top-level calls; 12/102/502 nested SQL calls (`10N+2`)            | Exercised cleanup branch, not per-product catalog statement growth                     |
| Cancellation baseline                     | Default `N(7+3M)`; coupon `N(23+3M)` nested calls                             | Direct SQL cancellation loop, not Home/PostgREST latency                               |
| Retired candidate                         | Default `N(9+M)`; coupon `N(25+M)`                                            | Fewer inventory UPDATE statements for M>1; locks and row triggers remain O(M)          |

N is cancelled orders; M is products per order. Constant catalog statement counts
do not mean constant row work or prove absence of N+1 in every branch. Cleanup's
linear nested-call growth does not establish a production latency bottleneck.
At M1 the candidate saves no nested calls. At M10, default/coupon counts fall
37→19 / 53→35; at M50, 157→59 / 173→75. Counts are not latency proxies.

### Original measurement protocol

- PostgreSQL 17.11, all 35 numbered SQL migrations, production authority triggers
  enabled, warm local tmpfs storage. The default promotions branch has no active
  campaign; the other branch uses a real coupon checkout.
- Ten cells: `(N,M)=(1,1),(10,1),(50,1),(1,10),(1,50)` for each branch.
  Each cell/arm discards exactly 3 warmups and measures 30 samples. Median is the
  midpoint of sorted samples 15/16; empirical nearest-rank p95 is sample 29.
- The retained baseline commits real checkout fixtures, then uses 33 rollback
  transactions plus one representative counter sample per fresh cell database.
  Timed `clock_timestamp` intervals surround only the ordered cancellation loop,
  including loop/clock overhead. Setup, fingerprints, assertions, counter snapshots,
  Docker startup, and client batch wall time are outside that server interval.
- Historical A/B used identical committed-template clones, checkout UUIDs and
  timestamps, matched starting size fingerprints, persistent backends, and
  alternating AB/BA pairs. Timed A/B samples used tracking off; representative
  counters were separate. Coordinator round-trip and batch wall time were not
  reported as cancellation SQL latency.
- Every sample must cancel N orders, release N×M owned reservations, make N×M
  products available, retain N×M valid items, and produce N coupon evidence rows
  only in the coupon branch. No coupon reservation, used count, identity use, or
  transient authorization may leak. Logical fingerprints must restore after each
  rollback. Nested point-read controls must detect exactly 1/10/50 calls.

### Historical independent A/B results

Server-loop medians in milliseconds; A is baseline, B is the rejected candidate.
These are recorded experimental measurements, not a new A/B run during closeout.

| Branch  | N/M  | A median | B median | Median change |
| ------- | ---- | -------: | -------: | ------------: |
| Default | 1/1  |   0.4020 |   0.3240 |       -19.40% |
| Default | 10/1 |   4.5425 |   3.0375 |       -33.13% |
| Default | 50/1 |  17.5040 |  17.7875 |        +1.62% |
| Default | 1/10 |   0.9745 |   0.6170 |       -36.69% |
| Default | 1/50 |   5.7290 |   2.3420 |       -59.12% |
| Coupon  | 1/1  |   0.6620 |   0.6710 |        +1.36% |
| Coupon  | 10/1 |   9.4965 |   9.6290 |        +1.40% |
| Coupon  | 50/1 |  43.3130 |  44.0685 |        +1.74% |
| Coupon  | 1/10 |   1.3075 |   0.9135 |       -30.13% |
| Coupon  | 1/50 |   5.9565 |   2.9885 |       -49.83% |

Multi-item wins reproduced at roughly 30–60%. M1 remained mixed: default 1/1
p95 worsened **0.547→0.759 ms** despite its median improvement; a writer run also
regressed default 1/1 median **0.4055→0.488 ms**. Several independent M1 medians
regressed as shown above. There is no general no-regression or production speedup
claim, and the failed M1 gate is not reopened by preserving the experiment.

## Correctness evidence and its limits

| Area                    | Historical A/B proof retained as evidence                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ownership and locks     | Same pending versioned-order lock, active owned reservations ordered by product ID, interleaved product locks; no prelock-all or cross-order batching; partial/zero-active release preserves replacement ownership |
| Authority and security  | Signature, boolean return, owner, ACL, SECURITY DEFINER and empty search path preserved via captured `pg_proc` metadata; actual anon/authenticated role denials checked                                            |
| Atomicity               | Idempotent and unknown-order no-ops; injected second-UPDATE and later coupon faults roll back logical inventory, order and evidence changes                                                                        |
| Payment and concurrency | Actual blocker PIDs; payment winner/expiry skip, expiry winner/late approval/manual review, coupon-capacity replacement, end-product hold/first-product checkout, uncommitted checkout versus expiry               |
| Coupon accounting       | Exact release identity/version evidence, used-count decrement, preserved replacement capacity, no consumed identity use or leaked transition/counter authority                                                     |

Historical `node scripts/sql-cancellation-benchmark.mjs --verify-candidate`
**exited 1: 10 passes, 4 failures** against the current schema. Both unchanged A
and candidate B passed suites 026/030/031/036 and the new sequential/fault/security/
multi-item proofs. Both arms failed the same two legacy inputs:

- **017:** duplicate-product validation raised SQLSTATE `22023`, while the old
  handler expected `P0001`. Later guest validation was **not reached**.
- **018:** the expired-pending fixture lacked the current discount snapshot,
  raising `23514` / `orders_discount_snapshot_check`.

Historically, the existing database runner passed those two suites **2/2 at their
intended migration cutoff 17**; they were not rerun during closeout. That does not
establish current-schema historical equivalence or repair the failing A/B command. No fixture, constraint, handler,
exit code, or original failure evidence was rewritten or suppressed.

## Current retained checks

The [baseline runner](../scripts/sql-cancellation-benchmark.mjs),
[protocol tests](../scripts/sql-cancellation-benchmark.test.ts), and unchanged
[checkout fixture](../scripts/sql-cancellation-benchmark-fixtures.sql) retain
useful-work, timing, nested-control, rollback, signal/finally, and protected-hash
checks. The [036 proof](../supabase/tests/database/036_expire_product_reservations_concurrency.test.sql)
and selector/Home attribution files remain unchanged.

Closeout observed meaningful retired-flag RED then GREEN using a guarded child
process that intercepts spawn; no Docker binary can execute in that regression.
An initial complete baseline reached all ten cells and controls but caught an
asynchronous Docker `--rm` removal race after stop. A second behavior-level
RED/GREEN added bounded absence polling (50 checks, 100 ms between retries), still
failing for a persistent exact-owned resource. Ownership-label checks remain.
Final local checks passed: all ten baseline cells (3 warmups + 30 measured each),
1/10/50 controls, useful work, rollback restoration, signal handling and exact-owned
cleanup; suite 036 passed 1/1 before this preflight-only correction and was not
rerun for it. Active-only focused Vitest reported 91 passes and one skipped Home
integration: 69 benchmark tests (32 retained + 37 guard tests), 12 selector tests,
and 10 attribution utilities, with no archived tests counted. Type-check without
incremental output, targeted ESLint, syntax, and tracked/untracked changed-file
whitespace checks passed. This is not a full-suite result.

A separate clean-root preflight test first failed on missing `fonts/`, then passed
with explicit optional-absence markers. The correction also tests present-byte
immutability, creation/removal, required-file failures and non-ENOENT errors.
Both the normal checkout and a fresh minimal disposable root subsequently passed
all ten baseline cells and controls. The copied root contained an exact current
runner copy, ten source-input symlinks and the read-only-mounted migrations; it
contained no `odd/`, fonts, archive, real credentials, or fabricated guard files. All
45 required hashes matched between roots. The normal snapshot had 67 entries;
the portable snapshot had 48, including three explicit absent-input markers.
Both final snapshots and exact-owned cleanup checks passed. This verifies current
baseline portability, not historical candidate adoption or a new native review.

The focused invocation including `src/app/home-query-attribution.test.tsx` skips
its one live integration without an explicitly configured disposable Home origin.
No Home runtime reproduction, Next HTTP/browser run, full suite, cold-cache test,
crash/multiworker proof, production workload, current guest-validation equivalence,
or actual-clock expired-pending approval/replay was run for this closeout.
Rollback restores logical rows in ten enumerated tables, not physical pages;
physical fingerprints compare relation sizes, not page bytes. Cache/plan history,
aborted tuple growth, host variance and row-trigger costs remain. Table statistics
are approximate, not exact bloat. Experimental review approval was **not deployment
approval**; this baseline-only closeout requires its own fresh parent-owned review.

## Local preservation and manual reproduction

An ignored, local-only snapshot exists at
`odd/evidence/sql-reservation-expiry-batching/`: five exact original copies,
1,364 lines / 65,735 bytes, plus `SHA256SUMS` and a restoration README. It is not
committed, shipped, available remotely, or required to understand this report.
The manifest uses `<SHA256><two spaces><original relative path>` with LF endings;
its SHA256 is `26eaeaf035f07d092a73c37289925c08515ec6bae40153018ffcea19bbfaa16f`.

1. Verify the five archived copies against `SHA256SUMS` before any restoration.
   Stop on a mismatch; never overwrite different existing evidence.
2. In a separately authorized clean, isolated worktree, restore the original paths:
   `scripts/sql-cancellation-benchmark.mjs`,
   `scripts/sql-cancellation-benchmark.test.ts`,
   `scripts/sql-cancellation-benchmark-fixtures.sql`,
   `scripts/sql-cancellation-candidate.sql`, and
   `scripts/sql-cancellation-candidate.test.sql`.
3. Supply matching Node/npm dependencies, the dedicated Vitest config, local
   Docker/PG17 image/extensions, support SQL, all historical migrations including
   authority 027, suites 017/018/026/030/031/036, all Home/selector/concurrency
   protected inputs. The archived historical runner additionally requires the two
   local task files and `fonts/`; the current portable baseline does not. HEAD
   `61e476b33ad20ae61553e85aa7002120dbd407d2` alone does not recover the then-untracked
   local inputs. Do not fabricate missing dependencies or weaken guard checks.
4. Inspect every destination first: reuse identical bytes, copy only to absent
   destinations, and stop on differences. Compare restored bytes/hashes again.
   **Do not run directly from the archive** or automatically overwrite active files.
   Executing the historical experiment requires separate local authorization;
   restoration is not renewed optimization or production authority.

No migration, application behavior change, commit, staging, push, PR, or deployment
is part of this result. Preserve the baseline decision; do not interpret retained
proofs as a delivered optimization.
