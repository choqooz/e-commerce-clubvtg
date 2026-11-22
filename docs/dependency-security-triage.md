# Dependency security triage — isolated candidate

The candidate has passed scoped independent functional verification against a sealed, read-only source snapshot. After reviewing the fresh audit counts and bounded reachability evidence, the owner explicitly accepted the documented low/moderate advisories temporarily to continue compatible-upgrade review and the launch roadmap. This disposition is not production, deployment or release approval. The candidate is not adopted or deployed. The original workspace and its installed dependencies are unchanged.

## Candidate

| Package                               | Original | Candidate |
| ------------------------------------- | -------- | --------- |
| Next / @next/env / eslint-config-next | 16.3.3   | 16.4.5    |
| Sharp                                 | 0.35.4   | 0.35.5    |
| Zod (application)                     | 3.25.76  | 4.6.7     |
| Vitest                                | 4.1.11   | 4.1.12    |
| @sentry/nextjs (lock resolution)      | 10.71.0  | 10.78.0   |
| DOMPurify (lock resolution)           | 3.4.14   | 3.4.17    |
| shadcn                                | 4.1.0    | 4.23.0    |

Zod compatibility changes preserve the existing GUID-shaped identifiers and custom quantity message. The owner explicitly approved rejecting non-finite product prices. No new cart limits, image-format policy, authentication behavior, or provider calls are introduced.

## Audits

The recorded baseline and candidate scopes used Node 26.13.0/npm 11.20.0, public npm, an empty private HOME/config/cache, and no lifecycle scripts. Each audit exited 1 for findings; the orchestration exit does not mean the audit passed. Fresh audits of the sealed lock completed on 2026-11-07 at 19:53 UTC, reproducing the candidate counts below. Both npm audit commands exited 1 for residual findings, with valid JSON and no transport error; the lock stayed unchanged. Evidence: `odd/evidence/dependency-candidate-runtime/sealed-20261107T193510Z-final/runtime/fresh-audit/results.json` and its separate stdout/stderr files.

| Scope            | Original                                   | Candidate                                  |
| ---------------- | ------------------------------------------ | ------------------------------------------ |
| Full             | 36: 4 low, 21 moderate, 7 high, 4 critical | 20: 5 low, 15 moderate, 0 high, 0 critical |
| Omit development | 16: 4 low, 6 moderate, 3 high, 3 critical  | 9: 4 low, 5 moderate, 0 high, 0 critical   |

These are affected-package counts, not a count of proven remote exploits. Production dependency membership includes build tooling.

## Residual findings and boundaries

- **Generator/Zod:** shadcn 4.23.0 is installed and uses patched Zod 4. The application imports `shadcn/tailwind.css`: its original 1669 bytes are preserved exactly, with appended utilities/properties (16340 bytes total). Existing in-memory Tailwind/source-preservation checks and the production build pass independently on the sealed source. This does not constitute a new browser/hosted visual review.
- **Sentry/glob:** the latest observed Sentry 10 release is 10.78.0, whose bundler package requires `glob ^13.0.6`. Audited glob remains affected through 14.0.1. Sentry 11.11.0 uses `glob ^14.0.3`, but is a major SDK upgrade, not an already verified fix for this candidate. Inspected plugin globs receive build-configuration or detected-artifact patterns, not observed request parameters; inspected calls do not pass an AbortSignal. [Glob cancellation bypass](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) and [minimatch globparts amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249) therefore require input/control conditions not established on the inspected application paths. This bounded trace is not exhaustive proof of non-exploitability.
- **Sentry 11 evaluation only:** the [official Next.js migration guide](https://docs.sentry.io/platforms/javascript/guides/nextjs/migration/v10-to-v11/) moves `withSentryConfig` to `@sentry/nextjs/config`. It also changes tracing to streamed spans and replaces restrictive unset `sendDefaultPii` behavior with broader default `dataCollection`, including user/cookie/body categories. A future migration must explicitly preserve the intended privacy boundary in client/server/edge initialization, not merely change an import. Runtime floors are compatible with Node 26/Next 16/TypeScript 5, but Safari 14 support is dropped and live SDK/callback/source-map compatibility is unproven. Current `init`, request/router capture callbacks, exception and redacted-message capture need verification under separately authorized SDK 11 installation. No Sentry 11 code/configuration change was made.
- **Minimatch:** glob, TypeScript ESLint and ts-morph have affected minimatch 10 copies; the reported fix is 11.0.1. Latest inspected TypeScript ESLint and ts-morph parent metadata still constrains minimatch to major 10. Do not force major overrides or follow npm's suggested framework/generator downgrades.
- **Email/deepmerge:** the captured React Email → html-to-text → deepmerge 4.3.1 chain has no reported npm fix for [returned-object prototype poisoning](https://github.com/advisories/GHSA-gcqx-w48m-w2h4). In inspected receipt/dispatch paths, Resend 6.24.0 calls `render(node)` without options; React Email takes its HTML branch and does not call html-to-text/deepmerge plain-text conversion. Customer values become React text children, not rendering/merge-option keys. Evidence: `node_modules/resend/dist/index.mjs:219-226,866-873`, `node_modules/@react-email/render/dist/node/index.mjs:145-180`, and the receipt/dispatch callers and templates. This bounded input trace does not certify every caller or future plain-text rendering; retain the advisory until fixed or explicitly accepted.
- **DOMPurify:** the resolved package is updated; the deployed PostHog product-tour bundle and advisory-specific execution paths have not been independently certified.

## Observed verification

| Check                                                       | Result                                                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Original schemas with compatibility tests                   | 54/54 pass                                                                                |
| Newly authorized non-finite-price rule against original Zod | RED: 2 fail, 54 pass                                                                      |
| Corrected candidate focused tests                           | GREEN: 136/136 pass, including the authorized check reconciliation                        |
| Nonincremental TypeScript                                   | Pass                                                                                      |
| Lint                                                        | Pass: 0 errors, 65 warnings                                                               |
| Full unit suite                                             | Pass: 1421 pass, 1 conditional skip                                                       |
| Payment contracts                                           | 72/72 pass                                                                                |
| Production build with CI placeholders                       | Pass; expected `ci.invalid` catalog fetch failure and absent Sentry upload-token warnings |
| Diff whitespace check                                       | Pass                                                                                      |
| LSP probe                                                   | Inconclusive; not clean-file proof                                                        |

Earlier failures were reconciled under explicit owner scope: the public committed `.env.local.example` was restored only after verifying blank credential fields and loopback/numeric defaults; header/footer hashes were refreshed after reproducing the old hashes from the pre-credits source and proving the accepted credits-only delta and unchanged candidate components. The cart test keeps its per-provider mock-effect reset in a helper; assertions and lint rules remain enabled.

Evidence fixtures were excluded from candidate test discovery after an initial runner also selected the deliberately failing original-schema copy. Original transcripts are retained. The conditional skip requires a separately provisioned home-query-attribution origin; no hosted benchmark was run.

## Independent verification

### Initial run: BLOCKED, preserved

The initial run checked a 306-file public manifest, then aborted copying when this report, `src/lib/validations/checkout.ts`, and `src/lib/validations/product.test.ts` changed. Reversing formatting alone exactly reproduced all three original hashes; the writing process was not identified. No functional checks ran in that initial attempt. Its manifest, partial scratch and terminal result remain preserved, not repaired or reused.

### Newly authorized sealed run: PASS

After explicit owner approval of the immutable-capture proposal, source files were sealed read-only and executed in a read-only bwrap mount with no network, existing dependencies read-only, synthetic CI values, and separate writable build/cache/HOME paths. Preparation failures and their bounded corrections remain recorded: separate empty npm user/global configs were required, and the source capture had initially omitted versioned SQL migration/proof fixtures. The final capture adds those public files only as text inputs; no SQL, database migration or hosted test ran, and no test assertion was weakened.

The independent verifier used a fresh isolated scratch and validated **367/367** frozen-source and scratch hashes before and after its checks, with no source write bits or unexpected source files. A source write-open preflight was rejected. Every authorized check ran once: build exit 0; nonincremental types exit 0; focused tests 136/136; lint 0 errors/65 warnings; full tests 1421 pass/1 conditional skip; payment contracts 72/72; synthetic Sharp resize/PNG/metadata/pixel assertions pass. A later parent Sharp spot check also passed with all source hashes unchanged.

- Source: `odd/evidence/dependency-candidate-runtime/sealed-20261107T193510Z-final/source/`
- Manifest SHA-256: `b05855cb4a95f19bf42cededca4deb76c7c9c88d5b44574b1ed6ec4d4ad72aba`
- Launcher SHA-256: `6a67d6a6c5cc67b6db0374d438f0acffa7717634232fb4db6a07d9f022f6dd09`
- Independent transcripts/binding: `odd/evidence/dependency-candidate-runtime/sealed-20261107T193510Z-final/runtime/independent-toXff87o/`

The conditional skip needs a separately provisioned `HOME_QUERY_ORIGIN` and local SQL. Browser/hosted behavior was not revalidated. These results certify the bound source snapshot, not later report edits, advisory acceptance, native review authority or delivery.

## Remaining work

The authorized compatibility/check reconciliation and scoped independent high-risk verification are complete. The public audit refresh is complete. The owner selected "Continuar con riesgo documentado (recomendado)": retain the validated compatible upgrades, document the bounded build/email reachability above, and track upstream fixes rather than force unsupported major overrides. This temporary acceptance covers the fresh 20 full / 9 production low–moderate affected-package findings, not unknown future advisories. Reassess if package versions, build glob inputs or email rendering options change. Continue the ordinary local work-unit/native-review policy before progressing through the roadmap; do not treat this as deployment authority.

The public committed example template is distinct from private runtime environment files; no private environment file may be read or copied. Sentry 11 remains evaluation-only; its migration is not authorized. No native review approval exists; native assessment was unassessable because untracked scope was undeclared. Independent functional PASS does not create or burn native review authority. Local work-unit commits and any later publication remain separate from this evidence report.

Recovery preserves the original manifest/lock backup (lock SHA-256 `20924a8d0ac1c4cc324f71ebf64eb99166877458865a64894ba342edd4da33c0`). Only task-owned dependency/schema/test/documentation changes in the isolated candidate are in the rollback boundary; never reset or restore unrelated workspace edits.
