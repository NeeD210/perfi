## Recurring Transactions Analysis

### 1. Overview
This document analyzes how recurring transactions are modeled and processed across the stack, including creation, scheduling, and cron-driven generation. It highlights strengths, issues, and concrete recommendations to improve correctness, performance, and extensibility.

### 2. Data Model
- **Table**: `recurringTransactions`
  - Fields: `userId`, `description`, `amount`, `categoryId`, `paymentTypeId?`, `transactionType`, `frequency`, `startDate`, `endDate?`, `lastProcessedDate?`, `nextDueDateCalculationDay?`, `isActive`, `softdelete?`, `cuotas?`
  - Indexes: `by_user_isActive_startDate`, `by_isActive_lastProcessedDate`, `by_user_softdelete`, `by_user_isActive_softdelete`, `by_user_isActive_startDate_softdelete`
- **Table**: `expenses`
  - Has optional `recurringTransactionId` and indexes including `by_recurringTransactionId`
- **Table**: `paymentSchedules`
  - Used for installment plans (credit-like flows)

### 3. Backend Logic
- File: `convex/recurring.ts`
  - `addRecurringTransaction` (mutation)
    - Validates input, inserts `recurringTransactions` row, then attempts to generate all past-due occurrences in a loop from `startDate` to now, calling `internal.internal.generateTransactionFromRecurring` with `{ recurringTransactionId, targetDate }`.
    - Frequency increment uses calendar ops per unit (daily/weekly/monthly/semestrally/yearly).
  - `updateRecurringTransaction`, `deleteRecurringTransaction` (soft-delete), `toggleRecurringTransactionStatus`, `listRecurringTransactions`.
  - `getRecurringTransactionsToProcess` (query)
    - Determines a threshold based on `frequency` and returns active, non-deleted rows with `lastProcessedDate < threshold`.
  - `generateTransactionFromRecurring` (mutation)
    - Creates an `expenses` row and updates `lastProcessedDate = Date.now()`. If `cuotas > 1` and `paymentTypeId` is set, generates `paymentSchedules` via `internal.internal.expenses.generatePaymentSchedules`.

- File: `convex/internal/recurring.ts`
  - `processRecurringTransactions` (internalAction)
    - Fetches due items via `getRecurringTransactionsToProcess` and calls `generateTransactionFromRecurring` for each.

- File: `convex/crons.ts`
  - Schedules `processRecurringTransactions` daily at midnight ("0 0 * * *").

### 4. Frontend Integration
- `src/components/recurring/RecurringTransactionForm.tsx`
  - Submits `addRecurringTransaction` or `updateRecurringTransaction` with fields including `nextDueDateCalculationDay` for monthly/yearly.
- `src/components/recurring/RecurringTransactionList.tsx`
  - Lists, edits, toggles active status, and deletes recurring items using the queries/mutations above.

### 5. Strengths
- **Clear separation of concerns**: CRUD vs. processing/cron in separate modules.
- **Validation coverage**: Frequency and transaction type validated; optional `nextDueDateCalculationDay` bounds checked.
- **Installment support**: Automatic generation of `paymentSchedules` for multi-installment expenses.
- **Useful indexes**: Support listing and filtering by user/active dates.

### 6. Issues and Risks
- **Argument mismatch in generation call (bug)**:
  - `addRecurringTransaction` calls `internal.internal.generateTransactionFromRecurring` with a `targetDate` argument, but `generateTransactionFromRecurring` only accepts `recurringTransactionId`. This likely fails validation or silently ignores intended due dates.
- **Generated expense date correctness**:
  - `generateTransactionFromRecurring` uses `Date.now()` for the expense `date` and for `firstDueDate` in schedules, ignoring the intended due date or the provided `startDate`/iteration `targetDate`.
- **Detection logic is coarse**:
  - `getRecurringTransactionsToProcess` compares `lastProcessedDate` to a coarse threshold per frequency. It does not consider `startDate`, `endDate`, multiple missed periods, or `nextDueDateCalculationDay` nuances.
- **No idempotency**:
  - Re-running cron or retries can create duplicate expenses because there is no unique constraint or idempotency key for a specific recurring occurrence (e.g., per recurringId+dueDate).
- **Backfill loop scalability**:
  - Initial generation loops from `startDate` to now, performing N sequential mutations; this is slow for long histories and risks timeouts.
- **End-date handling**:
  - The backfill loop and cron detection do not enforce `endDate` boundaries when deciding whether to generate.
- **Observability**:
  - Minimal structured logging/metrics to understand how many were due, generated, or failed.

### 7. Recommendations (Prioritized)
1) Fix generation API to accept a due date and use it consistently
   - Why: Ensures generated expenses reflect the correct scheduled date; unblocks proper backfill and cron processing.
   - How:
     - Update `generateTransactionFromRecurring` args to include `targetDate: number` and use it for expense `date`, `firstDueDate`, and to set `lastProcessedDate = targetDate`.
     - Update all callers (backfill loop, cron) to pass `targetDate` appropriately.

2) Add idempotency to prevent duplicates
   - Why: Retries and multiple cron runs must not duplicate expenses.
   - How:
     - Compute an idempotency key `(recurringTransactionId, targetDate)` and either:
       - Check for existing expense with the same key before insert, or
       - Add a UNIQUE index on `(recurringTransactionId, date)` and handle duplicate-key errors as no-ops.

3) Introduce `nextDueDate` caching and batch detection
   - Why: O(1) detection of due items and better performance under load.
   - How:
     - Add `nextDueDate` to `recurringTransactions` and index it.
     - Cron query: active, not deleted, and `nextDueDate <= now` LIMIT batchSize (e.g., 50–200).
     - After generating for `targetDate = nextDueDate`, advance `nextDueDate` using frequency rules.

4) Respect `startDate` and `endDate` boundaries everywhere
   - Why: Prevents over-generation and aligns with user intent.
   - How:
     - Backfill loop and cron should skip if `targetDate < startDate` or `endDate` is defined and `targetDate > endDate`.

5) Make frequency logic pluggable and unit-tested
   - Why: Simplifies adding new frequencies and reduces bugs.
   - How:
     - Extract a frequency strategy (Daily/Weekly/Monthly/Semestral/Yearly) with a common interface `getNext(date, anchorDay?)`.
     - Unit-test each frequency across month-end and leap-year boundaries.

6) Optimize backfill and cron processing
   - Why: Avoid timeouts and reduce DB round-trips.
   - How:
     - Limit per-run items (batching), stream through batches.
     - Consider bulk-like operations where possible; otherwise keep per-item mutations but cap concurrency.

7) Improve observability
   - Why: Faster debugging and safer operations.
   - How:
     - Structured logs (counts, timings, failures) per cron run; optionally store last run summary in an internal table.

### 8. Quick Wins to Implement First
- Add `targetDate` to `generateTransactionFromRecurring` and use it for both `expenses.date` and `paymentSchedules.firstDueDate`.
- In `addRecurringTransaction` backfill loop, pass and use `targetDate`; stop when exceeding `endDate` if present.
- In cron, compute `targetDate` deterministically (e.g., last processed + 1 period repeatedly until now), generating multiple occurrences if behind.
- Add a uniqueness guard to avoid duplicates until full idempotency is in place.

### 9. Validation/Edge Cases to Cover in Tests
- Month-end rollovers (Jan 31 → Feb 28/29 → Mar 31) with `nextDueDateCalculationDay`.
- Switching frequency or pausing/resuming (`isActive`) mid-stream.
- `endDate` in the past and exactly on a due day.
- Installments with rounding distribution across schedules.

### 10. References
- Backend: `convex/recurring.ts`, `convex/internal/recurring.ts`, `convex/crons.ts`, `convex/internal/expenses.ts`, `convex/schema.ts`
- Frontend: `src/components/recurring/RecurringTransactionForm.tsx`, `src/components/recurring/RecurringTransactionList.tsx`


### 11. nextDueDate vs. nextDueDateCalculationDay
Problem: `nextDueDateCalculationDay` is only relevant for monthly/yearly anchors and is meaningless for daily/weekly. This causes confusion and inconsistent scheduling semantics, especially when the cron runs: daily items do not use it, and monthly/yearly items need additional logic to determine the exact next run date.

Recommendation: Replace `nextDueDateCalculationDay` with a single timestamp field `nextDueDate` on `recurringTransactions`.

- Why this is more robust
  - One source of truth for when the next occurrence is due, regardless of frequency.
  - Cron logic becomes trivial: process rows where `isActive && !softdelete && nextDueDate <= now`.
  - Daily/weekly/monthly/yearly are unified; no frequency-specific special casing to determine the next run date.
  - Clear semantics for backfill and catch-up: repeatedly generate for `nextDueDate` and advance until `nextDueDate > now`.

- How to implement
  1) Schema changes
     - Add `nextDueDate: float64` on `recurringTransactions`.
     - Add index: e.g., `by_isActive_nextDueDate` on `(isActive, nextDueDate)` (and optionally `(userId, isActive, nextDueDate)`).
     - Deprecate `nextDueDateCalculationDay` (keep temporarily for migration; remove later).

  2) Backfill migration
     - For each recurring row, compute `anchorDay = day(startDate)`.
     - Compute `lastRun = lastProcessedDate ?? undefined`.
     - Compute `candidate = lastRun ? step(lastRun, frequency, anchorDay) : startDate`.
     - While `candidate < now && (!endDate || candidate <= endDate)`, keep stepping forward; set `nextDueDate = candidate` (first due at or after now within end date).
     - If all past, set to the next future occurrence after the latest possible date.

  3) Runtime changes
     - On create: initialize `nextDueDate` to the first due occurrence >= now (or simply `startDate` if in the future), respecting `endDate`.
     - Cron detection: query by `nextDueDate <= now` in small batches.
     - Generation: use `targetDate = nextDueDate` for `expenses.date` and payment schedules; then advance `nextDueDate = step(nextDueDate, frequency, anchorDay)`.
     - Respect `endDate`: if advancing surpasses `endDate`, either deactivate or stop advancing.

  4) Frequency stepping rules
     - Daily: `addDays(date, 1)`.
     - Weekly: `addWeeks(date, 1)`.
     - Monthly/Yearly: prefer anchoring to the original `startDate` day-of-month; when the month lacks that day, clamp intelligently (e.g., Feb → 28/29), preserving anchor for subsequent months.

  5) Cleanup
     - UI: remove the need to send `nextDueDateCalculationDay`.
     - API: remove the `nextDueDateCalculationDay` argument from create/update.
     - Data: remove the field after migration is fully deployed and verified.

Result: Daily frequencies work naturally, and all frequencies share the same deterministic, testable scheduling model centered on `nextDueDate`.

### 12. Migration Plan: nextDueDateCalculationDay → nextDueDate
Goal: Backfill `nextDueDate` for all active recurring transactions using `lastProcessedDate` and `frequency` (with `startDate` as fallback), then switch detection/cron to rely on `nextDueDate`.

Scope
- Affects table: `recurringTransactions`
- Adds field: `nextDueDate: float64`
- Adds index: `by_isActive_nextDueDate` on `(isActive, nextDueDate)` (optionally `(userId, isActive, nextDueDate)`)

Algorithm (Backfill)
- For each row `rt` where `isActive === true` and `softdelete !== true`:
  - `base = rt.lastProcessedDate ?? rt.startDate`.
  - `candidate = addPeriod(base, rt.frequency)` where:
    - daily: `addDays(base, 1)`
    - weekly: `addWeeks(base, 1)`
    - monthly: `addMonths(base, 1)`
    - semestrally: `addMonths(base, 6)`
    - yearly: `addYears(base, 1)`
  - If `rt.endDate` is defined and `candidate > rt.endDate`, then either set `isActive = false` or leave `isActive` and set `nextDueDate = undefined` (recommend: deactivate).
  - Otherwise set `rt.nextDueDate = candidate`.

Notes and Options
- Optional fast-forward: To avoid large backlogs, you can advance `candidate` until it is the first occurrence > now (or the last occurrence <= now) while respecting `endDate`:
  - `while (candidate <= now && (!rt.endDate || candidate <= rt.endDate)) candidate = addPeriod(candidate, rt.frequency)`
  - Choose policy:
    - Immediate processing: set `nextDueDate` to the earliest occurrence <= now (cron will pick it up right away), or
    - Future scheduling: set `nextDueDate` to the first occurrence > now.
- Anchoring for monthly/yearly: If you need strict day-of-month anchoring during migration, anchor to the day-of-month from `base` (preferred) or `startDate`. This replaces the prior `nextDueDateCalculationDay` concept.

Rollout Steps
1) Schema: add `nextDueDate` field and `by_isActive_nextDueDate` index; deploy.
2) Backfill job (Convex migration or internal action): implement the algorithm above in batches (e.g., 200–500 per run) to avoid timeouts.
3) Switch detection: update cron/query logic to read `nextDueDate <= now` with batching; stop using `lastProcessedDate`-threshold logic.
4) Engine change: when generating, use `targetDate = nextDueDate`; after a successful generation, advance `nextDueDate = addPeriod(nextDueDate, frequency)` (respect `endDate`, deactivate if exceeded).
5) UI/API cleanup: stop sending `nextDueDateCalculationDay`; hide/remove from forms. Keep the field during rollout for safety.
6) Remove legacy: after verifying stability (e.g., 1–2 weeks), remove `nextDueDateCalculationDay` from schema and code.

Verification
- Spot-check a sample per frequency to ensure `nextDueDate` aligns with expectations.
- Run cron manually in a sandbox and confirm: due items are picked, generated with `expenses.date = targetDate`, and `nextDueDate` advances correctly.
- Monitor counts and error logs; ensure no duplicates (idempotency in place) and no items get stuck.


