## Project Analysis Report

### 1. Project Overview
Expense Vibe is a mobile-first personal finance tracker built on Convex (serverless backend with TypeScript) and a Vite + React + Tailwind frontend. It supports expenses and incomes, recurring transactions, credit card schedules, category/payment type management, and a projections view. Auth is handled via Auth0.

### 2. Technology Stack
- Frontend: React 18, Vite, TailwindCSS, Radix UI, shadcn/ui patterns, Recharts and Chart.js for charts
- Backend: Convex 1.21 alpha, TypeScript, Convex Auth integration, CRON via Convex actions
- Auth: Auth0 via `@auth0/auth0-react` and `convex/react-auth0`
- Testing: Playwright for e2e (minimal coverage)
- Tooling: ESLint (TS rules relaxed), Prettier, npm-run-all

### 3. Strengths
- Robust domain model in Convex schema: users, categories, expenses, paymentTypes, recurringTransactions, and paymentSchedules with helpful indexes.
- Clear separation of concerns: modules for expenses, recurring, projections, migrations, and internal helpers.
- Recurring transactions and installment schedules are implemented end-to-end with internal mutations and daily cron.
- Mobile-first UI with bottom nav, drawers for forms, and virtualized lists for scalability.
- Projections feature that aggregates installment schedules and recurring items into forward-looking cash flow.
- Category and payment type management UIs, including validation for credit card day fields.
- Safe defaults on first login: default categories and payment types; create-or-link user logic.
- Planning docs present and helpful for understanding direction.

### 4. Weaknesses
- Inconsistent Auth0 identity usage: some modules use `identity.subject` while `auth.loggedInUser` uses `identity.tokenIdentifier`; risk of mismatches.
- Mixed default initialization paths: defaults are created both in `auth.createUser` and via expense helpers (`initializeDefault*`), leading to possible duplication and drift.
- Caching utility (`convex/cache.ts`) is unused and has mismatched user-scoped key semantics; dead code creates confusion.
- Payment schedule generators duplicated with slightly different logic between `convex/expenses.ts` and `convex/internal/expenses.ts` (soft-delete vs insert logic, amount rounding, start date logic).
- Migration scripts use different env conventions (`NEXT_PUBLIC_CONVEX_URL`) vs Vite `.env` (`VITE_*`) and rely on browser client from Node; fragile.
- Tailwind config has duplicate keys for animation/keyframes (overridden entries), indicating config drift.
- ESLint rules are very permissive around `any` and unsafe assignments, which can hide defects.
- Limited tests: only one visual-ish Playwright test; no unit tests for Convex functions or UI components.
- Some code smells: UI directly logs in many places; formatting/amount parsing duplicates; large React components doing many responsibilities.
- HTTP router empty; `README.md` references `app` dir (project uses `src`), and mentions router split that doesn’t exist.
- Generated Convex `_generated` committed changes and out of sync in git status; risk of merge noise.
- Mixed providers: `src/providers/Auth0Provider.tsx` is unused and uses `NEXT_PUBLIC_*` vars; duplicate of actual usage in `src/main.tsx` with `VITE_*`.

### 5. Actionable Recommendations
1. Align Auth identity usage and user querying
   - Why: Prevent subtle auth bugs and duplicated accounts.
   - How: Standardize to `identity.subject` everywhere; update `auth.loggedInUser` to use `subject`. Add a small helper `getAuthenticatedUser(ctx)` in a shared util and reuse across modules.

2. Consolidate default data initialization
   - Why: Avoid divergence and duplicate inserts.
   - How: Keep all defaults in `auth.createUser` only; remove `initializeDefaultCategories`/`initializeDefaultPaymentTypes` or limit to maintenance tasks invoked manually.

3. Deduplicate and harden payment schedule generation
   - Why: Two implementations increase drift risk and bugs with edits/deletes.
   - How: Make a single internal mutation the source of truth (`internal/expenses.generatePaymentSchedules`). Update `convex/expenses.ts` to call only the internal version; unify soft-delete semantics and rounding.

4. Fix environment and provider inconsistencies
   - Why: Prevent env misconfig and deployment issues.
   - How: Remove `src/providers/Auth0Provider.tsx` or refactor it to mirror `VITE_*` usage. Update scripts to use `VITE_CONVEX_URL`. Ensure `.env.example` is added with `VITE_*` and Auth0 vars.

5. Clean Tailwind config
   - Why: Duplicate keys reduce clarity and may mask changes.
   - How: Remove duplicated `accordion-down`/`accordion-up` definitions; keep a single definition per keyframe/animation.

6. Introduce unit tests for Convex logic and core UI
   - Why: Catch regressions in scheduling, recurring, and projections.
   - How: Add tests for: (a) `calculateNextDueDate`, (b) schedule generation for 1 and N installments, (c) recurring generation path, (d) projections aggregation. Add React tests for transaction edit flow. Place in `tests/` mirroring structure.

7. Strengthen ESLint settings gradually
   - Why: Improve type safety and reliability.
   - How: Turn on `@typescript-eslint/no-unsafe-*` rules in CI with warnings first; reduce broad `any` usage by tightening function signatures in Convex handlers.

8. Remove unused caching utility or integrate properly
   - Why: Reduce cognitive load and dead code.
   - How: Either delete `convex/cache.ts`, or apply to projections and category/payment queries with user-aware keys and invalidation on writes.

9. Migrations hardening
   - Why: Ensure safe and repeatable data migrations.
   - How: Replace `scripts/migrate.ts` with Convex CLI calls or server-side internal mutations; stop using browser client in Node. Align env variables and document migration commands in `README.md`.

10. Documentation refresh
   - Why: Avoid confusion for contributors.
   - How: Update `README.md` sections: actual `src` app path, how auth works, env setup, how CRON runs, and http router status. Add architecture overview diagram and feature map.

11. Generated code hygiene
   - Why: Reduce noisy diffs.
   - How: Add `_generated/` to `.gitignore` or ensure deterministic generation on CI; avoid manual edits.

12. UI/UX polish and componentization
   - Why: Improve maintainability and consistency.
   - How: Extract shared money formatting/parser into `src/lib/money.ts`. Extract transaction list item into a component. Add loading/skeleton states consistently. Keep files <500 lines by splitting large pages.

13. HTTP API clarity
   - Why: Future-proof external integrations.
   - How: Either implement real routes via `httpRouter` or remove references from `README.md` until needed.

14. Data integrity guards
   - Why: Prevent orphaned schedules and mismatched states.
   - How: Add invariants: ensure `paymentSchedules.softdelete` set consistently on deletes/updates; add checks for `cuotas >= 1`; coerce float64 to cents or unify on numbers with rounding.

15. Performance housekeeping
   - Why: Keep UX smooth on larger datasets.
   - How: Add pagination to expense list queries, and limit projections to a chosen horizon with a parameter. Ensure indexes back all compound filters (already good, but verify access patterns).

### Ordered Fix/Upgrade Plan
1) Auth and identity alignment (quick win; high impact)
2) Default data initialization consolidation (quick; stops drift)
3) Payment schedules dedup + delete/update semantics (core logic correctness)
4) Env/provider consistency; remove unused provider; scripts use `VITE_*` (confirmed `.env.local` already includes required vars; no new env files needed)
5) Tailwind config cleanup (easy hygiene)
6) Tests: unit tests for Convex functions and key UI flows; keep Playwright
7) Remove or integrate caching; if integrate, start with projections (guard with invalidations on writes)
8) Documentation refresh (README + `.env.example`)
9) Generated code hygiene (`_generated` ignore or regenerate in CI)
10) UI refactors: extract money utils and transaction components; ensure file size limit
11) Migrations: switch to internal mutation flow and CLI run scripts; remove browser client in Node
12) HTTP API status: implement or remove references
13) Add pagination and additional indexes if needed based on usage metrics

### Phased Implementation Plan

Phase 0 — Baseline alignment and cleanup (completed/in progress)
- Align auth identity usage to `identity.subject` and fix `auth.loggedInUser`.
- Deduplicate schedule generation to use `internal/expenses.generatePaymentSchedules` only.
- Remove unused provider and cache; clean Tailwind duplicate keyframes/animations.
- Update README (structure, HTTP status, env setup) and ignore `convex/_generated/`.
- Switch migrations invocation to Convex CLI; document usage.

Phase 1 — Defaults and data integrity (Day 1–2)
- Remove `initializeDefaultCategories` and `initializeDefaultPaymentTypes` from `convex/expenses.ts` and any references; keep defaults only in `auth.createUser`.
- Remove the unused `defaultPaymentTypes` array in `convex/expenses.ts`.
- Add light invariants in write paths: enforce `cuotas >= 1` and round schedule amounts to pennies consistently when generating schedules.

Phase 2 — Testing foundation (Day 2–4)
- Add Vitest + React Testing Library setup and scripts.
- Backend tests: `calculateNextDueDate`, schedule generation (1 vs N installments), recurring-to-expense generation, projections aggregation.
- Frontend tests: transaction edit/verify flow; basic smoke tests for Home/Manage/Projections pages.

Phase 3 — Linting hardening and CI (Day 4–5)
- Introduce CI (GitHub Actions or Vercel/other) to run lint and tests on PRs.
- Gradually enable `@typescript-eslint/no-unsafe-*` as warnings; reduce implicit `any` in Convex handlers where straightforward.

Phase 4 — UI refactors and utilities (Day 5–6)
- Create `src/lib/money.ts` for common formatting/parsing and reuse where duplicated (keep current currency format behavior).
- Extract a reusable transaction list item component to reduce page complexity; add consistent loading/skeleton states.

Phase 5 — Docs and context (Day 6)
- Add a simple architecture diagram and feature map to `README.md`.
- Create `planning/context/` with concise notes: auth flow, data model, schedules/recurring, projections. Link from README.

Phase 6 — Tooling and migrations housekeeping (Day 7)
- Archive or remove `scripts/run-migration.ts` if redundant; rely on CLI commands.
- Confirm no remaining references to removed helpers; ensure no drift in defaults.

Optional follow-ups (future)
- Caching: profile projections/queries and reintroduce a scoped cache only if needed (with proper invalidations).
- HTTP API: implement external endpoints in `convex/http.ts` if required and update docs.
- Pagination and projection horizon: revisit once datasets grow (left unchanged for now by request).

### Notes on AI Context/Repo Hygiene
- Create `planning/context/` with small, targeted context files (auth flow, data model, schedules/recurring, projections). Link to them in `README.md`.
- Keep `planning/summary.md` updated after structural changes and major domain decisions.

