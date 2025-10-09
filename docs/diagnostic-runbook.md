# Recurring Transactions Diagnostic Runbook

This guide walks you through diagnosing and fixing broken recurring transaction templates.

## Quick Start: Single Template Diagnostic

### Step 1: Diagnose the Template

Go to your Convex Dashboard → Functions → `internal.diagnoseRecurringTemplate`

**Input:**
```json
{
  "recurringTransactionId": "kn74a2r1kj3vef2jt3x696xted7s0ydp"
}
```

**Expected Output:**
```json
{
  "exists": true,
  "mappingExists": false,
  "recurringLinesCount": 0,
  "hasCategoryMapping": true,
  "hasPaymentTypeMapping": false,
  "notes": [...],
  "recommendation": "⚠️  NEEDS REPAIR: Run internal.backfillRecurringTemplateForLegacyId..."
}
```

### Step 2: Repair the Template (if needed)

If the recommendation says "NEEDS REPAIR", run:

Convex Dashboard → Functions → `internal.repairRecurringTemplate`

**Input:**
```json
{
  "recurringTransactionId": "kn74a2r1kj3vef2jt3x696xted7s0ydp"
}
```

**Expected Output:**
```json
{
  "success": true,
  "recurringEntryId": "...",
  "createdLines": 2,
  "message": "✅ Successfully created recurring template with 2 lines"
}
```

### Step 3: Verify the Fix

Re-run Step 1 to confirm:
```json
{
  "mappingExists": true,
  "recurringLinesCount": 2,
  "recommendation": "✅ Template is healthy and ready for generation."
}
```

---

## Batch Operations: Fix All Templates for a User

### Step 1: Scan All Templates

Convex Dashboard → Functions → `internal.scanUserRecurringTemplates`

**Input:**
```json
{
  "userId": "YOUR_USER_ID"
}
```

**Expected Output:**
```json
{
  "summary": {
    "total": 15,
    "healthy": 10,
    "needsRepair": 5,
    "missingCategoryMappings": 0,
    "missingPaymentMappings": 3
  },
  "brokenTemplates": [...],
  "recommendation": "⚠️  Found 5 templates needing repair..."
}
```

### Step 2: Preview Repairs (Dry Run)

Convex Dashboard → Functions → `internal.repairAllUserTemplates`

**Input:**
```json
{
  "userId": "YOUR_USER_ID",
  "dryRun": true
}
```

**Expected Output:**
```json
{
  "summary": {
    "scanned": 15,
    "repaired": 5,
    "failed": 0,
    "skipped": 10
  },
  "failures": [],
  "message": "🔍 DRY RUN: Would repair 5 of 15 templates..."
}
```

### Step 3: Execute Repairs

If the dry run looks good, run with `dryRun: false`:

**Input:**
```json
{
  "userId": "YOUR_USER_ID",
  "dryRun": false
}
```

**Expected Output:**
```json
{
  "summary": {
    "scanned": 15,
    "repaired": 5,
    "failed": 0,
    "skipped": 10
  },
  "failures": [],
  "message": "✅ Repaired 5 templates. Failed: 0. Skipped: 10."
}
```

### Step 4: Verify All Fixed

Re-run `internal.scanUserRecurringTemplates` to confirm all templates are healthy.

---

## Testing Transaction Generation

After repairs, test that generation works correctly:

### Option 1: Manual Generation

Convex Dashboard → Functions → `recurring.generateTransactionFromRecurring`

**Input:**
```json
{
  "recurringTransactionId": "kn74a2r1kj3vef2jt3x696xted7s0ydp",
  "targetDate": 1704067200000
}
```

This should create:
- A legacy `expenses` record
- A `journal_entries` record with `sourceType: "recurring"`
- Two `journal_lines` records (debit and credit)

### Option 2: Monitor Cron Job

The `processRecurringTransactions` cron job runs automatically and will process all due recurring transactions.

Check the logs after the next scheduled run to confirm successful generation.

---

## Troubleshooting

### Error: "Missing category mapping"

**Cause:** The category used by the recurring transaction has not been migrated to the ledger.

**Fix:** Run the category migration first:
1. Ensure the category exists in the `categories` table
2. Run the Phase 2 migration to create `category_mappings`

### Error: "Missing payment type mapping"

**Cause:** The payment type has not been migrated.

**Solution:** The system will automatically create a default cash mapping ("Efectivo o Transferencia") when backfilling or generating. This is safe and expected.

### Template exists but generation fails

**Symptoms:** 
- `mappingExists: true`
- `recurringLinesCount: 2`
- But generation still fails

**Diagnosis:**
1. Check if the category mapping was deleted after template creation
2. Check if the account IDs in `recurring_lines` are valid
3. Review error logs in `dual_write_errors` table

**Fix:** Re-run the backfill to recreate the template with current mappings.

---

## Quick Reference

| Function | Purpose | Type |
|----------|---------|------|
| `internal.diagnoseRecurringTemplate` | Check single template status | Query |
| `internal.repairRecurringTemplate` | Fix single template | Mutation |
| `internal.scanUserRecurringTemplates` | Scan all user templates | Query |
| `internal.repairAllUserTemplates` | Fix all user templates | Mutation |
| `recurring.generateTransactionFromRecurring` | Generate transaction | Mutation |

---

## Implementation Checklist

- [x] Diagnostic functions created
- [x] Batch repair functions created
- [x] Documentation complete
- [ ] Run diagnostics on problem ID: `kn74a2r1kj3vef2jt3x696xted7s0ydp`
- [ ] Backfill broken templates
- [ ] Verify generation works
- [ ] Monitor first cron run
- [ ] Document any edge cases found

