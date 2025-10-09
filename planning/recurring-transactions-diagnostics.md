## Recurring Transactions: Dual-Write and Template Diagnostics

### Context
- We observed that some recurring transactions did not post records to `recurring_entries` and `recurring_lines`, and therefore later generations only created legacy `expenses` without corresponding ledger templates/lines.
- Example legacy ID to investigate: `kn74a2r1kj3vef2jt3x696xted7s0ydp` (from `recurringTransactions`).

### Current Implementation (relevant pieces)
- Public `recurring.generateTransactionFromRecurring` now delegates to `internal.generateTransactionFromRecurring` which:
  - Creates legacy `expenses` with idempotency.
  - Dual-writes to ledger `journal_entries`/`journal_lines` (with default cash fallback when payment mapping is missing).
- Recurring templates (Phase 2) are expected to be materialized in `recurring_entries` and `recurring_lines` via migration from legacy `recurringTransactions`.
- If a legacy template wasn’t migrated, there will be no `recurring_template_mappings` row linking legacy → ledger template.

### Root Cause Hypothesis
1) The legacy recurring template was never migrated to `recurring_entries`/`recurring_lines` (missing `recurring_template_mappings`).
2) Category mapping is missing for the template’s `categoryId` (blocks template creation).
3) Payment type mapping is missing; default cash fallback wasn’t previously applied at the template level.

### Diagnostics
We added a diagnostic internal query to verify the state of a legacy recurring template:

- `internal.verifyRecurringTemplateStatus`
  - Input: `{ recurringTransactionId: Id<'recurringTransactions'> }`
  - Returns:
    - `exists`: if the legacy row exists
    - `mappingExists`: if there is a row in `recurring_template_mappings`
    - `recurringEntryId`: the linked `recurring_entries` id (if any)
    - `recurringLinesCount`: number of `recurring_lines` for that entry
    - `hasCategoryMapping` / `hasPaymentTypeMapping`
    - `notes`: free-form hints on what’s missing

Example (for the provided id):
```json
{
  "exists": true,
  "mappingExists": false,
  "recurringLinesCount": 0,
  "hasCategoryMapping": true,
  "hasPaymentTypeMapping": false,
  "notes": ["No recurring template mapping found (recurring_template_mappings)", "Missing payment type mapping; default cash will be used if backfilled"]
}
```

How to run:
1) Open Convex Dashboard → Functions → `internal.verifyRecurringTemplateStatus`.
2) Pass `{ "recurringTransactionId": "kn74a2r1kj3vef2jt3x696xted7s0ydp" }`.
3) Inspect `mappingExists`, `recurringEntryId`, `recurringLinesCount`, and `notes`.

### Remediation Plan (One-off Backfill)
If `mappingExists` is false or `recurringLinesCount` is 0:

- Run `internal.backfillRecurringTemplateForLegacyId`:
  - Input: `{ recurringTransactionId }`
  - Behavior:
    - Ensures a default cash account mapping ("Efectivo o Transferencia") exists for the user.
    - Requires the category mapping to exist; fails early if missing (actionable signal).
    - Inserts `recurring_entries` and two `recurring_lines` (Dr/Cr based on income vs expense).
    - Inserts `recurring_template_mappings` for idempotency on re-runs.

After a successful backfill, `verifyRecurringTemplateStatus` should report `mappingExists: true` and `recurringLinesCount: 2`.

### Post-Backfill Verification
1) Re-run `internal.verifyRecurringTemplateStatus` and confirm:
   - `mappingExists: true`
   - `recurringLinesCount: 2`
2) Trigger generation for a due date via `recurring.generateTransactionFromRecurring` (public), which now delegates to the dual-write internal path.
3) Inspect ledger structures:
   - A `journal_entries` record is created with sourceType `"recurring"` and `idempotencyKey: recurring_dual_write_<legacyId>_<date>`.
   - Two `journal_lines` created with correct Dr/Cr based on `transactionType` (income vs expense).

### What We Changed (Summary)
- Delegation: Public `recurring.generateTransactionFromRecurring` → internal dual-write implementation.
- Fallbacks: Default cash mapping (`ensureDefaultCashMapping`) added for missing payment type mapping at generation time.
- Diagnostics & Repair:
  - `internal.verifyRecurringTemplateStatus` - Single template diagnostic
  - `internal.backfillRecurringTemplateForLegacyId` - Single template repair
  - `internal.scanAllRecurringTemplates` - Batch diagnostic for all user templates
  - `internal.repairAllRecurringTemplates` - Batch repair with dry-run support
- Code Quality:
  - Added missing return validators (Convex best practices)
  - Improved type safety by removing unnecessary `as any` casts
  - Better error messages and structured output

### Edge Cases & Notes
- If category mapping is missing, backfill will not proceed — fix the mappings first.
- If payment type mapping is missing, default cash is created/reactivated and mapped automatically.
- Recurring generation remains idempotent per (legacyId, targetDate).

### Batch Diagnostics & Repair (New Functions)

For users with multiple broken templates, we've added batch operations:

#### 1. Scan All Templates (`internal.scanAllRecurringTemplates`)
Scans all active recurring transactions for a user and reports comprehensive status.

**Input:** `{ userId: Id<"users"> }`

**Returns:**
```json
{
  "total": 15,
  "withMappings": 10,
  "withoutMappings": 5,
  "missingCategoryMappings": 2,
  "missingPaymentMappings": 3,
  "brokenTemplates": [
    {
      "recurringTransactionId": "...",
      "description": "Netflix Subscription",
      "issues": ["No recurring template mapping found", "Missing payment type mapping (will use default cash)"]
    }
  ]
}
```

**Usage:**
1. Open Convex Dashboard → Functions → `internal.scanAllRecurringTemplates`
2. Pass `{ "userId": "YOUR_USER_ID" }`
3. Review the `brokenTemplates` array for issues

#### 2. Repair All Templates (`internal.repairAllRecurringTemplates`)
Automatically backfills all broken recurring templates for a user.

**Input:** 
```json
{
  "userId": "YOUR_USER_ID",
  "dryRun": true  // Optional: set to false to actually repair
}
```

**Returns:**
```json
{
  "scanned": 15,
  "repaired": 5,
  "failed": 0,
  "skipped": 10,
  "failures": []
}
```

**Behavior:**
- Scans all active recurring transactions for the user
- Skips templates that already have mappings and lines
- Creates missing `recurring_entries`, `recurring_lines`, and `recurring_template_mappings`
- Ensures default cash mapping exists for templates missing payment type mappings
- Reports detailed failures for templates that can't be repaired (e.g., missing category mappings)

**Safety Features:**
- Dry-run mode to preview changes without modifying data
- Idempotent: safe to run multiple times
- Skips already-migrated templates
- Detailed error reporting

**Usage:**
1. First, run with `dryRun: true` to preview repairs
2. Review the results
3. Run with `dryRun: false` to execute repairs
4. Re-run `scanAllRecurringTemplates` to verify

### Action Checklist

#### Single Template Diagnostic:
- [ ] Run `internal.verifyRecurringTemplateStatus` for the provided id.
- [ ] If missing mapping/lines, run `internal.backfillRecurringTemplateForLegacyId` and re-verify.
- [ ] Trigger a generation for a target date; confirm both legacy `expenses` and ledger `journal_entries`/`journal_lines` are created.

#### Batch Diagnostic & Repair:
- [ ] Run `internal.scanAllRecurringTemplates` with your userId to get an overview.
- [ ] Review the `brokenTemplates` array to identify issues.
- [ ] Run `internal.repairAllRecurringTemplates` with `dryRun: true` to preview repairs.
- [ ] Run `internal.repairAllRecurringTemplates` with `dryRun: false` to execute repairs.
- [ ] Re-run `scanAllRecurringTemplates` to verify all templates are fixed.
- [ ] Monitor the next scheduled cron run to ensure generations work correctly.


