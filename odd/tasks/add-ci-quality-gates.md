# Add CI quality gates

## Goal

Add a minimal, secret-free GitHub Actions quality gate for pull requests and updates to `main`.

## Scope

- Add one GitHub Actions workflow using the repository's Node and npm contract.
- Run install, lint, type checking, and unit tests without provider credentials.
- Preserve all unrelated tracked and untracked workspace content.
- Defer build, database, and E2E jobs until their environment and runtime boundaries are made hermetic.

## Tasks

- [ ] Add and verify the secret-free CI workflow.
  - Create `.github/workflows/ci.yml`.
  - Trigger on pull requests and pushes to `main`.
  - Grant read-only repository contents permission.
  - Use Node 22 from `.nvmrc` with npm caching.
  - Run `npm ci`, `npm run lint`, `npm run type-check`, and `npm test`.
  - Validate workflow syntax and run the exact quality commands locally.
  - Commit the verified work unit with a Conventional Commit message.

## Deferred work

- Production build: needs a documented secret-free build environment contract.
- Database tests: require Docker and 23 disposable PostgreSQL suites.
- Playwright/Clerk E2E: requires isolated test credentials and a hermetic environment.

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
- Native review: unavailable because the installed `gentle-pi` package-local `gentle-ai` binary is missing; no lineage was created.
- Pre-commit receipt validation: exited 0 with `status: invalidated`, `allowed: false`, because no review authority governs this candidate.
- Rollback boundary: remove `.github/workflows/ci.yml`; retain this task record only if historical evidence is desired.
- Commit: blocked pending explicit maintainer authorization to repair the package-local Gentle AI binary and rerun review/validation.
