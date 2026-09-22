# Resolve dependency advisories

Issue: #58
Branch: `fix/dependency-advisories`

## Scope

Resolve the currently audited npm dependency vulnerabilities through compatible dependency or lockfile updates without forced major upgrades, broad unrelated churn, or provider/database operations.

## Baseline

- Runtime: Node `v22.23.2`, npm `10.9.8` from `.nvmrc`.
- Full audit: 16 vulnerable packages — 3 low, 6 moderate, 7 high.
- Production audit: 5 vulnerable packages — 1 low, 2 moderate, 2 high.
- Production findings currently include `@babel/core`, `baseline-browser-mapping`, `browserslist`, `fast-uri`, and `fflate`.
- The original issue description is stale: the vulnerable dependency set has expanded since it was written.

## Tasks

- [x] Determine the smallest compatible dependency update set.
  - Compared lockfile-only remediation with explicit parent-package updates.
  - Selected a targeted lockfile refresh because every vulnerable transitive range admits a compatible patch/minor; no root manifest change or override is required.
- [x] Apply and inspect the selected dependency remediation.
  - Refreshed only the 16 vulnerable transitive packages and dependency-coupled packages using npm 12, preserving npm lock metadata that npm 10 would otherwise normalize away.
  - Confirmed Node 22/npm 10 can install the resulting lockfile and reports zero full and production vulnerabilities.
- [x] Verify the remediated dependency graph.
  - Ran clean install, full and production audits, lint, typecheck, unit tests, payment contracts, production build, and all disposable database tests under Node 22.
- [x] Review and prepare the work unit for delivery.
  - Native review lineage `review-abde12ac058cdd6d` could not inspect the generated lockfile because Gentle omitted its content from the immutable reviewer prompt.
  - Two reviewer runs independently returned incomplete inspection and were rejected without consuming the lens slot or correction budget.
  - The user explicitly chose to proceed without native review for this candidate after the full independent regression suite passed.
  - Work-unit commit: `d3d43a4` (`fix(deps): resolve transitive advisories`).
  - Evidence commit: `7ba3bb4` (`docs(odd): record dependency remediation evidence`).
  - Pushed `fix/dependency-advisories` and opened PR #84 linked to issue #58 with `type:bug`.
  - Hosted checks passed: Quality, Production build, Disposable database migrations, and GitGuardian Security Checks; GitHub reports the PR mergeable and clean.

## Remediation evidence

- Targeted command: `npm update --package-lock-only --ignore-scripts --no-audit --no-fund @babel/core @hono/node-server @humanfs/node baseline-browser-mapping body-parser brace-expansion browserslist express-rate-limit fast-uri fflate hono ip-address js-yaml path-to-regexp postcss-selector-parser qs`.
- Root manifest: `package.json` unchanged; no overrides and no forced or direct major upgrades.
- Full audit: 16 vulnerable packages before (3 low, 6 moderate, 7 high); 0 after.
- Production audit: 5 vulnerable packages before (1 low, 2 moderate, 2 high); 0 after.
- Representative production-path updates: `@babel/core` 7.29.0 → 7.29.7, `baseline-browser-mapping` 2.10.10 → 2.11.25, `browserslist` 4.28.1 → 4.29.0, `fast-uri` 3.1.0 → 3.1.8, and `fflate` 0.4.8 → 0.4.9.
- Tooling-path updates include `@hono/node-server` 1.19.11 → 1.19.17, `@humanfs/node` 0.16.7 → 0.16.8, `body-parser` 2.2.2 → 2.3.0, `express-rate-limit` 8.3.1 → 8.7.0, `hono` 4.12.9 → 4.13.8, `ip-address` 10.1.0 → 10.7.2, `js-yaml` 4.1.1 → 4.3.2, `postcss-selector-parser` 7.1.1 → 7.1.6, and `qs` 6.15.0 → 6.16.0.
- Clean-install check: Node `v22.23.2` / npm `10.9.8` completed `npm ci`; the lockfile hash remained unchanged.
- `npm ls --all` still reports optional-platform metadata errors, but an isolated install of exact `origin/main` reproduced them. They are pre-existing and not caused by this remediation; the candidate removes several baseline extraneous bundled packages while retaining the existing `@emnapi/runtime` and Lightning CSS musl diagnostics.
- Regression suite: lint passed with one pre-existing import-order warning; typecheck passed; 40 files / 325 unit tests passed; 2 files / 72 payment tests passed; production build generated 25/25 pages; 22/22 disposable database suites passed and removed all containers.
- Build advisories: expected `ci.invalid` product-fetch failure was handled without failing the build; Next.js printed its existing experimental-feature notice.
- Hygiene: `git diff --check` passed and package-lock SHA-256 `74d09a55a21feb9a2844127f8cbdbfc7704f921fb138e74f2a54eece097c1813` remained unchanged through verification.
- Native review limitation: local decoder compatibility was repaired and START succeeded, but Gentle classified `package-lock.json` as generated and omitted its content from the provider-materialized reviewer evidence. Two exact reviewer attempts correctly declined to claim inspection; both results were rejected, the slot remains pending, and no approval receipt exists.
- Review disposition: the user explicitly authorized proceeding without native review for this candidate; this exception does not change the global review policy.

## Non-goals

- No `npm audit fix --force`.
- No application behavior changes.
- No hosted provider, production, or secret-dependent E2E operations.
- No mutation of the original dirty worktree.

## Rollback

Revert the dependency-remediation work-unit commit to restore the merged `main` lockfile and dependency declarations.
