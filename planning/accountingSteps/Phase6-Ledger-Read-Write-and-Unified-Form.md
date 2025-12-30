# Phase 6: Ledger Read + Write (No Flags) with Unified Transaction Form - Product Requirements Document

## Introduction

This PRD defines Phase 6 of PerFi’s accounting migration: moving Home and Transactions screens to read directly from the ledger, enforcing full dual-write (no flags) for expense/income flows, and unifying transaction entry into a single, modern Transaction Form supporting Expense, Income, and Transfer.

This phase launches as default (no feature flags). It ensures immediate rollup consistency and consolidates user input into one coherent UX while maintaining backward compatibility via a journal→compat adapter.

## Context & Background

### Current System
- Home and Transactions read legacy queries (e.g., expenses list)
- Mutations already dual-write in many paths but may be gated/conditional
- Separate drawers for Expense and Income; Transfer form exists independently
- Mixed sources for Upcoming bills (planned, recurring, statements) not unified

### Target System
- Reads: Home and Transactions screens use ledger queries exclusively
- Writes: Expense/Income (and Transfer) perform immediate dual-write with rollup updates and idempotency
- UI: One Transaction Form with type switcher (Expense | Income | Transfer), smart presets, and installment/recurring options
- Compat adapter for journal entries to preserve existing Transactions list UI without redesigns

### Technology Stack
- Backend: Convex (TypeScript)
- Database: Convex NoSQL
- Validation: Convex `v` validator library
- Frontend: React + Vite + shadcn/ui

### Key Concepts
- Double-entry ledger: `journal_entries` + `journal_lines`
- Zero-sum invariant on base currency per entry
- Rollups for Home metrics; best‑effort synchronous update on write
- Compat adapter: transforms ledger rows to legacy-friendly shape for the UI

## User Stories

**US1 (Read - Home):** As a user, I want the Home dashboard to reflect my real‑time ledger balances, spending categories, and upcoming obligations so I can quickly understand my financial status.

**US2 (Read - Transactions):** As a user, I want the Transactions list to load quickly and show all my entries from the ledger with the same familiar presentation and basic actions.

**US3 (Write - Dual-Write):** As a user, when I create, edit, verify, or delete a transaction, I want the ledger and legacy data to be updated immediately so that indicators remain accurate without delays.

**US4 (Unified Form):** As a user, I want a single Transaction Form where I can switch between Expense, Income, and Transfer, so adding and editing transactions is fast and consistent.

**US5 (Installments & Recurring):** As a user, I want installments and recurring settings available from the same form so I don’t have to navigate multiple places.

**US6 (Performance):** As a user, I want Home to load in under 1s and the first page of Transactions in under 500ms so the app feels snappy.

## Acceptance Criteria

### For US1 (Home reads from ledger)
- [ ] Home uses:
  - `api.ledger.monthlySummary.getMonthlySummary` for Net Balance and income/expense bars
  - `api.ledger.monthlySummary.getTopSpendingCategories({limit:3})` for Top 3 categories
  - `api.ledger.upcoming.getUpcomingObligations({limit:3})` for Próximos pagos
- [ ] Existing chart components are reused; only data sources change
- [ ] No legacy queries are invoked by Home

### For US2 (Transactions list via ledger compat)
- [ ] `src/pages/ManageTransactionsPage.tsx` uses `api.ledger.journal.listJournalEntriesCompat` with pagination
- [ ] Visual layout remains unchanged for typical Expense/Income entries
- [ ] Entries without legacy source mapping render read-only detail view (no edit/delete/verify)
- [ ] Pagination and filters respect `(date desc, id desc)` ordering and index usage

### For US3 (Write paths and rollups)
- [ ] Expense/Income mutations are immediate dual-write (no flags) and call `internal.ledger.rollups.updateRollupsOnTransaction` with `create|update|delete`
- [ ] Verify flow updates both legacy and ledger; rollups refresh immediately
- [ ] Installment transactions create planned child entries linked via `parentEntryId`, `linkType='installment'`
- [ ] Idempotency is enforced where retries are possible
- [ ] Error handling is best‑effort; failures are logged without breaking the UI

### For US4 (Unified Transaction Form)
- [ ] One form component supports types: `Expense`, `Income`, `Transfer`
- [ ] Shared inputs: `amount`, `date`, `description`, `category/account`, `payment/fromAccount`, `toAccount (transfer)`, `currency`
- [ ] Smart defaults: prefill last used category/payment accounts; preserve on type switch when possible and safe
- [ ] Editing existing items loads the form with correct type and fields
- [ ] Validation prevents incomplete or contradictory inputs (e.g., same account for transfer)

### For US5 (Installments & Recurring from the form)
- [ ] Installments: `totalInstallments`, `installmentNumber?` autocreated; planned ledger entries created and linked
- [ ] Recurring: `frequency` and start date; creation routes to existing scheduler-backed flows
- [ ] Both options available for Expense and Income; Transfer excludes installments (no fees in this phase)

### For US6 (Performance)
- [ ] Home initial render < 1s for typical dataset
- [ ] Transactions first page < 500ms server time for typical dataset
- [ ] Queries index-first and cursor-based; no full scans for primary views

## Detailed Specifications

### Backend Queries (Ledger Reads)

#### listJournalEntriesCompat
**Purpose:** Paginated listing of journal entries transformed to legacy-friendly UI shape.

**Input (examples):**
```typescript
{
  startDate?: number; // epoch ms
  endDate?: number;   // epoch ms
  status?: "planned" | "posted" | "voided";
  accountId?: Id<"accounts">;
  accountType?: "asset"|"liability"|"equity"|"income"|"expense";
  pagination: { cursor?: string; pageSize: number };
}
```

**Output (compat items include):**
```typescript
{
  entryId: Id<"journal_entries">;
  date: number; // epoch ms
  description: string;
  transactionType: "expense" | "income" | "transfer" | "other";
  amount: number; // signed integer in base currency minor units
  paymentAccountId?: Id<"accounts">;
  paymentAccountName?: string;
  categoryId?: Id<"accounts">; // expense/income account
  installmentNumber?: number;
  totalInstallments?: number;
  linkType?: "accrual" | "installment" | "settlement";
  status: "planned" | "posted" | "voided";
  sourceType?: "expense" | "income" | "transfer" | "installment" | "recurring" | "statement" | "other";
  sourceId?: string; // opaque origin id
}
```

**Business Rules:**
1. Expense: debit to an `expense` account determines amount/category; credit side is paying account → expose payment account info
2. Income: credit to an `income` account determines amount/category; debit side is receiving account
3. Transfer: infer `fromAccount` and `toAccount`; show directional amount (sign normalized by UI convention)
4. Editing guard: enable legacy edit/delete/verify only when `sourceType in {"expense","income"}` and `sourceId` exists

#### getUpcomingObligations
**Purpose:** Mixed feed of upcoming planned entries and due statements/recurrings.

**Input:** `{ days?: number = 30, limit?: number = 3 }`

**Items:** `{ type, date, description, amount, accountName, link }`

**Sources:**
- Planned `journal_entries` (installments/recurring, `status='planned'`)
- `card_statements` with `status='pending'` and `dueDate` within window
- `recurring_entries.nextDueDate` simulated without persisting next instances

#### Home rollups
- Reuse `getMonthlySummary`, `getTopSpendingCategories`, optionally `getMonthlyTrends`
- Optional wrapper `getHomeDashboard` aggregates summary + categories + upcoming

### Backend Mutations (Write + Rollups)

#### Expense/Income Mutations (existing paths)
**Requirements:**
1. Ensure dual-write to `journal_entries` + `journal_lines` unconditionally (remove any gating)
2. After add/update/delete/verify → call `internal.ledger.rollups.updateRollupsOnTransaction` with `updateType`
3. Installments: create planned child entries linked via `parentEntryId`, `linkType='installment'`, `installmentNumber`, `totalInstallments`
4. Enforce idempotency for retryable operations
5. Defensive error handling; log and proceed to keep UI responsive

#### Optional cleanup
- `internal.ledger.deleteEntryBySource({ sourceType, sourceId })` for consistency when legacy rows are removed

### Unified Transaction Form (UI)

#### Component: TransactionForm
**Purpose:** Single form for Expense, Income, and Transfer with shared UX.

**Props (example):**
```typescript
interface TransactionFormProps {
  mode: "create" | "edit";
  initialType?: "expense" | "income" | "transfer";
  initialValues?: Partial<{
    amount: number;
    date: number;
    description: string;
    categoryAccountId: Id<"accounts">; // expense/income account
    fromAccountId: Id<"accounts">;     // paying account (expense, transfer)
    toAccountId: Id<"accounts">;       // receiving account (income, transfer)
    currencyCode: string;                // ISO 4217
    totalInstallments?: number;          // expense/income only
    recurring?: { frequency: "daily"|"weekly"|"monthly"|"quarterly"|"semestrally"|"yearly"; startDate: number };
  }>;
  onSubmit: (payload) => Promise<void>;
  onCancel: () => void;
}
```

**Behavior:**
- Type switcher tabs (Expense | Income | Transfer)
- Smart defaults: last used category and payment accounts per type
- Validations:
  - Amount > 0
  - Transfer: `fromAccountId !== toAccountId`
  - Expense requires `categoryAccountId` (expense type) and `fromAccountId`
  - Income requires `categoryAccountId` (income type) and `toAccountId`
- Installments (expense/income): enabling prompts for `totalInstallments`; creates planned children
- Recurring (expense/income): enabling captures `frequency` and start date and triggers existing recurring flow
- Edit mode loads existing values based on compat item; disables editing when item is read-only (no legacy source mapping)

**Submission Logic:**
- Expense/Income submit through existing mutations that dual-write and refresh rollups
- Transfer submit through existing/new transfer mutation (from Phase 4.1)
- On success, allow queries to revalidate via Convex reactivity; optionally trigger client invalidate if needed

### Technical Implementation Details

#### File Structure
- Backend:
  - `convex/ledger/compat.ts` (transformers)
  - `convex/ledger/journal.ts` (list + filters + pagination)
  - `convex/ledger/upcoming.ts` (mixed feed)
  - `convex/ledger/monthlySummary.ts` (reuse)
  - Ensure rollup update calls in `convex/expenses.ts`, `convex/recurring.ts`
- Frontend:
  - `src/pages/HomePage.tsx` (swap to ledger queries)
  - `src/pages/ManageTransactionsPage.tsx` (use compat list)
  - `src/components/TransactionForm.tsx` (new unified form)

#### Index-First Design
- `journal_entries`: `by_user_date`, `by_user_status_date`, `by_sourceType_sourceId`
- `journal_lines`: `by_entryId`, `by_accountId_date`, `by_user_accountId_date`
- Cursor pagination with `(date desc, id desc)` ordering

#### Function Reference Discipline
- Use `api.*` from client/queries; use `internal.*` only from server where appropriate
- Validate Convex context objects in all handlers

#### Defensive Programming
- Strict validators for inputs; explicit enums and numeric types
- Runtime checks for undefined/null and cross-field consistency

## Constraints & Non-Functional Requirements

### Performance
- Home: < 1s for typical dataset
- Transactions (first page): < 500ms server time
- Queries must leverage indexes; avoid full scans

### Data Integrity
- Zero-sum invariant for ledger entries
- Idempotency for retryable writes
- Referential integrity for `sourceType/sourceId` mapping where available

### Compatibility & Rollout
- Launch as default; no feature flags
- Read-only fallback for ledger-only entries without legacy mapping

### Security & Audit
- All operations tenant-scoped (`userId`)
- Maintain `createdBy/updatedBy` and `updateTime` on writes

## Out of Scope
- Advanced Transfer fees and multi-leg transfers (future phase)
- New reporting widgets beyond those specified for Home
- Bulk edit flows in Transactions

## Success Metrics
- [ ] Home switched to ledger queries only (no legacy reads)
- [ ] Transactions list uses `listJournalEntriesCompat` with pagination
- [ ] Dual-write enforced on expense/income with immediate rollup updates
- [ ] Unified Transaction Form shipped and used for create/edit
- [ ] Installments/recurring options available within the form
- [ ] Performance targets met (Home < 1s, Transactions < 500ms)
- [ ] Unit and integration tests (>85% coverage for new/changed code paths)

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Missing mappings lead to edit buttons for unsupported entries | Medium | Compat marks such entries as read-only; UI hides edit/delete/verify |
| Rollup drift if update call fails | High | Best‑effort sync on write + scheduled reconciliation job |
| Pagination/regression performance | High | Enforce index-first queries; add cursors; test under load |
| Unified form complexity | Medium | Strict validations, type-driven props, shared field components |
| Installment edge cases | Medium | Link via `parentEntryId` with `installment` metadata; idempotency on creation |

## Appendix

### Glossary
- Compat Adapter: Transformer that maps ledger entries to legacy-friendly UI shape
- Planned Entry: Entry with `status='planned'` representing future obligations
- Rollup: Pre-aggregated monthly sums to power fast Home metrics

### References
- Phase plan: Phase 6 – Ledger Read + Write (No Flags)
- Prior phases: Transfer (4.1), Budgets (4.2/4.3), Pre-aggregations (4.4), Card Statements (5)










