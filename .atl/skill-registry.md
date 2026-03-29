# Skill Registry — e-commerce-clubvtg

Generated: 2026-03-27  
Project: ClubVTG E-Commerce  
Stack: Next.js 16.2.1 + React 19 + TypeScript 5 + Tailwind CSS 4 + Supabase + Clerk v7

---

## Active Skills (sorted by relevance to this project)

| Skill | Trigger | Path |
|-------|---------|------|
| `nextjs-15` | Working with Next.js routing, Server Actions, data fetching, App Router | `~/.claude/skills/nextjs-15/SKILL.md` |
| `react-19` | Writing React components (no useMemo/useCallback with React Compiler) | `~/.claude/skills/react-19/SKILL.md` |
| `tailwind-4` | Styling with Tailwind — cn(), theme variables, no var() in className | `~/.claude/skills/tailwind-4/SKILL.md` |
| `typescript` | Writing TypeScript — types, interfaces, generics, strict mode | `~/.claude/skills/typescript/SKILL.md` |
| `playwright` | Writing E2E tests — Page Objects, selectors (Phase 5 testing) | `~/.claude/skills/playwright/SKILL.md` |
| `context7-mcp` | Library/framework questions, API references, code examples (Supabase, Clerk, MercadoPago, etc.) | `~/.claude/skills/context7-mcp/SKILL.md` |
| `branch-pr` | Creating pull requests or preparing changes for review | `~/.claude/skills/branch-pr/SKILL.md` |
| `github-pr` | Writing PR descriptions, conventional commits, gh CLI | `~/.claude/skills/github-pr/SKILL.md` |
| `issue-creation` | Creating GitHub issues, reporting bugs, requesting features | `~/.claude/skills/issue-creation/SKILL.md` |
| `judgment-day` | Adversarial review — "judgment day", "que lo juzguen", "dual review" | `~/.claude/skills/judgment-day/SKILL.md` |
| `skill-creator` | Creating new AI skills or documenting patterns | `~/.claude/skills/skill-creator/SKILL.md` |

---

## SDD Lifecycle Skills (auto-loaded by orchestrator)

| Skill | Phase |
|-------|-------|
| `sdd-explore` | Investigate/clarify before committing |
| `sdd-propose` | Create change proposal |
| `sdd-spec` | Write requirements & scenarios |
| `sdd-design` | Technical design document |
| `sdd-tasks` | Implementation task checklist |
| `sdd-apply` | Write actual code |
| `sdd-verify` | Validate implementation vs specs |
| `sdd-archive` | Sync delta specs, archive change |

---

## Excluded Skills (not relevant to this stack)

| Skill | Reason |
|-------|--------|
| `zod-4` | Project uses Zod **v3** (^3) — v4 skill would cause breaking-change confusion |
| `zustand-5` | No Zustand in this project (no global client state library) |
| `ai-sdk-5` | Using OpenAI SDK directly, not Vercel AI SDK |
| `pytest` / `django-drf` / `go-testing` | Python/Go stack — not applicable |
| `jira-task` / `jira-epic` | Project uses GitHub Issues, not Jira |

---

## Project Convention Files

| File | Purpose |
|------|---------|
| `AGENTS.md` | Agent rules — Next.js breaking changes warning (read before writing code) |
| `CLAUDE.md` | Points to `@AGENTS.md` |
| `prd.md` | Full technical PRD — single source of truth for business rules |

---

## Critical Warnings

- ⚠️ **Next.js 16.2.1** — This is NOT the standard Next.js 15 your training knows. Read `node_modules/next/dist/docs/` before writing any Next.js code.
- ⚠️ **Zod ^3** — Do NOT apply Zod 4 patterns. The zod-4 skill is intentionally excluded.
- ⚠️ **Clerk v7** — `@clerk/nextjs ^7.0.6` — API may differ from Clerk v5/v6 patterns.
- ⚠️ **shadcn radix-nova** — Style is `radix-nova`, not `default` or `new-york`.
- ⚠️ **supabaseAdmin** for writes, `createClient` (SSR anon) for reads — never mix them.
