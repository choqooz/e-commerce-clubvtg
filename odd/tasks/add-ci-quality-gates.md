# Add CI quality gates

## Goal

Add a minimal, secret-free GitHub Actions quality gate for pull requests and updates to `main`.

## Scope

- Add one GitHub Actions workflow using the repository's Node and npm contract.
- Run install, lint, type checking, unit tests, explicit payment contracts, production build, and disposable database tests without provider credentials.
- Preserve all unrelated tracked and untracked workspace content.
- Defer E2E jobs until their Clerk/Supabase secret and runtime boundaries are made hermetic.

## Tasks

- [x] Add and verify the secret-free CI workflow.
  - Create `.github/workflows/ci.yml`.
  - Trigger on pull requests and pushes to `main`.
  - Grant read-only repository contents permission.
  - Use Node 22 from `.nvmrc` with npm caching.
  - Run `npm ci`, `npm run lint`, `npm run type-check`, and `npm test`.
  - Validate workflow syntax and run the exact quality commands locally.
  - Commit the verified work unit with a Conventional Commit message.

- [ ] Add and verify the remaining hermetic CI gates.
  - Run the payment webhook contract suite explicitly in the quality job.
  - Add a production-build job with literal non-secret `.invalid` configuration and telemetry disabled.
  - Add a Docker-backed database job for all 22 disposable PostgreSQL suites.
  - Keep every job fork-safe with no `secrets.*`, `pull_request_target`, hosted database, or provider mutation.
  - Revalidate workflow syntax, build, database cleanup, and exact commands locally.
  - Commit and push the verified work unit.

## Deferred work

- Playwright/Clerk E2E: existing suites require hosted Clerk development credentials, dedicated users, and reachable Supabase state; keep them out of untrusted PR workflows until isolated secret handling exists.

## Constraints

- Do not expose or consume provider secrets.
- Do not run provider, hosted database, or production operations.
- Do not modify `package.json`, lockfiles, application source, or unrelated local files.
- Do not stage with broad pathspecs.

## Evidence

- Workflow parsing: installed `js-yaml` parser and explicit semantic assertions passed.
- Node/runtime: Node `v22.23.2`, npm `10.9.8` through the existing nvm runtime.
- Locked install: `nvm exec 22 npm ci` passed; dependency audit output reported 16 vulnerabilities for separate issue #58.
- Lint: `nvm exec 22 npm run lint` passed with one pre-existing import-order warning in `src/lib/ai/openai.test.ts:1`.
- Type checking: `nvm exec 22 npm run type-check` passed.
- Unit tests: `nvm exec 22 npm test` passed, 40 files and 325 tests.
- Workspace parity: tracked and visible untracked status matched before and after verification.
- Runtime harness: actual GitHub-hosted execution remains pending until the branch is pushed or a PR is opened.
- Native review: approved and acknowledged for the isolated two-file candidate under lineage `review-975be020e4c1e5df`; one informational task-status warning was recorded.
- Pre-commit receipt validation: after acknowledgement, reported `delivery: unmanaged`; delivery followed ordinary repository policy as required by the native closure.
- Rollback boundary: revert commit `2685f4d` to remove the workflow and its task record without touching unrelated work.
- Commit: `2685f4d` (`ci: add secret-free quality gate`).

### Remaining-gates evidence

- Workflow parsing: Python PyYAML 6.0.1 and explicit semantic assertions passed for three jobs, fork-safe permissions/triggers, exact commands, timeouts, and literal build configuration.
- Runtime: Node `v22.23.2`, npm `10.9.8`, Vitest `4.1.11`, Next.js `16.3.3`, Docker client/server `29.8.1`.
- Payment contracts: `npm run test:payment-webhook` passed, 2 files and 72 tests.
- Production build: `npm run build` passed with only workflow literal placeholders; TypeScript passed and 25/25 static pages generated. The expected `ci.invalid` product-fetch lookup failed closed without failing the build.
- Database: `npm run test:database` passed all 22 suites; all 22 disposable PostgreSQL containers were removed and no matching containers remained.
- Hygiene: `git diff --check` passed and the candidate diff hash remained unchanged through verification.
- Install advisory: `npm ci` still reports 16 vulnerabilities for issue #58; no dependency change belongs to this work unit.
- E2E boundary: deferred because current suites require Clerk development secrets/users and reachable Supabase state; they are not safe for untrusted fork PRs.
- Rollback boundary: revert the pending remaining-gates commit to remove the explicit payment step plus build/database jobs while retaining the initial quality gate.
- Commit: pending.
