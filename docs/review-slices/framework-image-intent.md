# Compatible framework and image dependency updates

The business requirement is to remediate compatible dependency security exposure while preserving existing application behavior. This review slice updates Next.js, `@next/env` and `eslint-config-next` together from 16.3.3 to 16.4.5, Sharp from 0.35.4 to 0.35.5, and Vitest from 4.1.11 to 4.1.12.

Application Zod remains on `^3` and shadcn on `^4.1.0`; their compatibility work is deferred to the next slice. No production source or test behavior is intentionally changed here. The resulting lockfile is a partial dependency graph, not the final original integration payload.

On this graph, the full unit suite passed with one conditional SQL-related skip; the isolated build and TypeScript check passed, as did the Sharp synthetic check and lint with 65 warnings. The fresh audit is not clean: full dependencies report 25 findings (1 low, 18 moderate, 4 high, 2 critical), and production dependencies report 9 (1 low, 6 moderate, 1 high, 1 critical); both npm audits exited 1.

The reported severe root versions also existed in the baseline, including Sentry, proxy-addr, MCP SDK, body-parser and Zod, with a propagated shadcn finding. Version equality alone does not establish unchanged reachability or exploitability. The later Zod/shadcn slice is not assumed to fix the other severe findings. No residual-risk acceptance or release readiness is inferred.
