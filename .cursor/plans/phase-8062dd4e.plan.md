<!-- 8062dd4e-f85b-4d3f-ab8f-2a005f2fb2f2 385f595c-b70c-4c52-8791-b8c8719606cb -->
# Phase 6 – Ledger Read + Write (No Flags)

## Scope
- Replace Home and Transactions reads to use the ledger directly.
- Keep writes via existing mutations but guarantee full, immediate dual-write to ledger (no flags) so rollups stay in sync.
- Launch as default (no feature flags/A-B toggles).

## Backend (Convex)

### 1) Compat transformer for journal entries
- File: `convex/ledger/compat.ts`
- Map `journal_entries` + `journal_lines` → UI-friendly shape (backwards-compatible with current transaction card):
  - Expense: debit to `expense` account gives `categoryId` and amount; credit side is the paying `asset`/`liability` account → expose `paymentAccountId`, `paymentAccountName`.
  - Income: credit to `income` account gives `categoryId` and amount; debit side is receiving account.
  - Include: `entryId`, `date`, `description`, `transactionType`, `installmentNumber`, `totalInstallments`, `linkType`, `status`, `sourceType`, `sourceId`.
  - Editing guard: enable legacy edit/delete/verify only when `sourceType in {"expense","income"}` AND `sourceId` exists.

### 2) Journal listing (compat, paginated)
- File: `convex/ledger/journal.ts`
- Query: `listJournalEntriesCompat` with `{ startDate?, endDate?, status?, accountId?, accountType?, paginationOpts }` using `by_user_date.paginate()`; hydrate lines with `by_entryId`, transform with compat.

### 3) Upcoming obligations (mixed feed)
- File: `convex/ledger/upcoming.ts`
- Query: `getUpcomingObligations({ days=30, limit=3 })` combining:
  - Planned `journal_entries` (installments/recurring, `status='planned'`).
  - `card_statements` with `status='pending'` and `dueDate` in window.
  - `recurring_entries.nextDueDate` in window (simulate next occurrence without persisting).
- Normalize items: `{ type, date, description, amount, accountName, link }`.

### 4) Home rollup queries (reuse)
- Keep `convex/ledger/monthlySummary.ts`:
  - `getMonthlySummary` → Net Balance.
  - `getTopSpendingCategories(limit=3)` → Top 3 Categorías.
  - `getMonthlyTrends` → small trend bars (optional).
- Optional wrapper: `getHomeDashboard` to aggregate all sections in 1 call including upcoming.

### 5) Write operations (no flags, immediate rollup sync)
- Ensure all expense/income mutations dual-write to ledger and update rollups:
  - Files: `convex/expenses.ts`, `convex/recurring.ts`.
  - Confirm `LEDGER_DUAL_WRITE_ENABLED = true` and remove any conditional branching in write paths that would skip ledger.
  - After add/update/delete/verify: call `internal.ledger.rollups.updateRollupsOnTransaction` with `updateType: 'create'|'update'|'delete'` and best-effort error handling.
  - For installments: keep planned child entries and link via `parentEntryId`, `linkType='installment'`, `installmentNumber`, `totalInstallments`.
- Optional: Add mutation `ledger.deleteEntryBySource({ sourceType, sourceId })` for cleanup if legacy rows are removed.

## Frontend (React)

### 6) Home screen – ledger data
- File: `src/pages/HomePage.tsx`
- Replace legacy reads with:
  - `api.ledger.monthlySummary.getMonthlySummary` → Balance Neto and small income/expense bars.
  - `api.ledger.monthlySummary.getTopSpendingCategories({limit:3})` → Top 3 Categorías.
  - `api.ledger.upcoming.getUpcomingObligations({limit:3})` → Próximos pagos.
- Maintain existing chart components; swap data sources only.

### 7) Transactions screen – compat list
- File: `src/pages/ManageTransactionsPage.tsx`
- Replace `listAllTransactions` with `ledger.journal.listJournalEntriesCompat` (paginated).
- Render same UI. Editing flow:
  - If compat item has `sourceType in {'expense','income'}` and `sourceId`, keep existing edit/delete/verify mutations.
  - Otherwise present read-only detail dialog (no edit/delete buttons).

### 8) Add Transaction drawers (write UX)
- Files: `src/pages/AddExpensePage.tsx`, `src/pages/AddIncomePage.tsx` (already implemented per screenshots).
- Keep using `api.expenses.addExpense` which dual-writes to ledger.
- Ensure on success the queries that power Home and Transactions revalidate (Convex `useQuery` auto-reactivity suffices; if needed, add tiny client-side invalidate).

## Acceptance criteria
- Home shows ledger-based Balance Neto, Top 3 Categorías, Próximos pagos.
- Transactions list is served from ledger and visually unchanged.
- Creating/editing/deleting/verifying a transaction updates both ledger and legacy rows; Home metrics reflect changes immediately (rollups updated).
- Installments create planned ledger entries linked correctly and appear in Upcoming when within the horizon.
- Performance targets: Home < 1s; Transactions first page < 500ms.

## Risks / Notes
- Some ledger-only entries (e.g., transfers/statements) will be read-only in Transactions until their edit flows are added.
- Where account→legacy mappings are missing, compat returns display names; IDs may be undefined in the UI (no editing).

## To-dos
- [ ] Add compat transformer and types in `convex/ledger/compat.ts`
- [ ] Implement `listJournalEntriesCompat` with pagination
- [ ] Implement `getUpcomingObligations` mixed feed
- [ ] Optional `getHomeDashboard` wrapper
- [ ] Verify/add rollup update calls for add/update/delete/verify in write paths
- [ ] Switch `HomePage.tsx` to ledger queries
- [ ] Switch `ManageTransactionsPage.tsx` to ledger compat list
- [ ] Validate new Add Expense/Income drawers end-to-end with instant Home refresh

### To-dos

- [ ] Add compat transformer and types in convex/ledger/compat.ts
- [ ] Implement listJournalEntriesCompat with pagination
- [ ] Implement getUpcomingObligations mixed feed
- [ ] Optional getHomeDashboard wrapper composing summary + top categories + upcoming
- [ ] Verify/add rollup update calls in dual-write paths
- [ ] Switch HomePage.tsx to ledger queries and map UI
- [ ] Switch ManageTransactionsPage.tsx to ledger compat list with read-only fallback
- [ ] Verify performance and correctness under typical dataset