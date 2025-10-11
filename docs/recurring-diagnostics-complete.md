# Recurring Transactions Diagnostics - Complete Guide

**Last Updated:** December 16, 2024  
**Status:** ✅ ALL ISSUES RESOLVED

---

## Executive Summary

Successfully diagnosed and repaired recurring transaction templates that were missing ledger structures. All templates now properly create dual-write entries to both legacy `expenses` and ledger tables (`journal_entries`/`journal_lines`).

**Key Achievements:**
- ✅ Fixed 4/17 broken templates for initial user
- ✅ Implemented automatic ledger template creation for new recurring transactions
- ✅ Created diagnostic and repair tools
- ✅ All new templates now automatically include ledger structures

---

## Table of Contents

1. [Original Problem](#original-problem)
2. [Root Cause](#root-cause)
3. [Solution Implemented](#solution-implemented)
4. [Diagnostic Process](#diagnostic-process)
5. [Testing & Verification](#testing-verification)
6. [Preventive Measures](#preventive-measures)
7. [Tools & Commands](#tools-commands)

---

## Original Problem

### What Was Broken

When users created new recurring transactions via `recurring.addRecurringTransaction`, only the legacy `recurringTransactions` record was created. The ledger structures were **not** created, causing:

1. ❌ No dual-write to ledger on generation
2. ❌ Ledger queries missing recurring data
3. ❌ Inconsistent state between legacy and ledger systems
4. ❌ Templates requiring manual backfill after creation

### Impact

- Recurring templates existed in legacy system only
- Generated expenses had no corresponding journal entries
- Financial data was inconsistent
- Future ledger-only queries would miss transactions

---

## Root Cause

The `addRecurringTransaction` mutation in `convex/recurring.ts` was missing critical ledger template creation:

```typescript
// BEFORE (Broken)
const recurringTransactionId = await ctx.db.insert("recurringTransactions", {...});

// Backfill past transactions
while (targetDate <= now) {
  await ctx.runMutation(internal.internal.generateTransactionFromRecurring, {...});
}

return recurringTransactionId; // ❌ No ledger template created!
```

**Problems:**
1. ✅ Created legacy `recurringTransactions` record
2. ✅ Backfilled past-due expense records
3. ❌ **Skipped creating ledger template structures**
4. ❌ Future generations only created legacy records

---

## Solution Implemented

### Primary Fix: Automatic Template Creation

Added automatic ledger template creation immediately after inserting the legacy record:

```typescript
// AFTER (Fixed)
const recurringTransactionId = await ctx.db.insert("recurringTransactions", {...});

// ✅ Create ledger template structures immediately
await ctx.runMutation(internal.internal.backfillRecurringTemplateForLegacyId, {
  recurringTransactionId,
});

// Backfill past transactions (now with dual-write!)
while (targetDate <= now) {
  await ctx.runMutation(internal.internal.generateTransactionFromRecurring, {...});
}

return recurringTransactionId;
```

### What `backfillRecurringTemplateForLegacyId` Does

1. **Verifies category mapping** exists (required, fails if missing)
2. **Ensures default cash account** exists (creates if missing)
3. **Creates `recurring_entries`** record with proper scheduling
4. **Creates 2 `recurring_lines`** records (debit and credit)
5. **Creates `recurring_template_mappings`** linking legacy ↔ ledger
6. **Idempotent:** Safe to run multiple times

---

## Diagnostic Process

### Initial Scan Results

**User ID:** `k579d0k5gh9wq3x817k2mdty2s7g4mhy`

```bash
npx convex run diagnostics:scanUserRecurringTemplates '{"userId":"k579d0k5gh9wq3x817k2mdty2s7g4mhy"}'
```

**Results:**
- Total templates: 17
- Healthy: 13
- Need repair: 4
- Missing category mappings: 0
- Missing payment mappings: 0

**Broken Templates:**
1. `testrecurring` (ID: `kn7068d80xq75jfcb69cbtfv717s1zp9`)
2. `test R` (ID: `kn7fksq1jq1gxmp7jv9c37sqr57s0jbe`)
3. `test` (ID: `kn74a2r1kj3vef2jt3x696xted7s0ydp`) ⭐ Original problem template
4. `aa` (ID: `kn7c61v43q51jxp60aj30tzm457s12g3`)

**Common Issue:** All missing `recurring_template_mappings`

### Repair Process

**Dry Run:**
```bash
npx convex run diagnostics:repairAllUserTemplates '{"userId":"...","dryRun":true}'
```

**Execute Repairs:**
```bash
npx convex run diagnostics:repairAllUserTemplates '{"userId":"...","dryRun":false}'
```

**Results:**
- ✅ Repaired: 4 templates
- ❌ Failed: 0
- ⏭️ Skipped: 13 (already healthy)

### Post-Repair Verification

```bash
npx convex run diagnostics:scanUserRecurringTemplates '{"userId":"..."}'
```

**Final Results:**
- Total templates: 17
- Healthy: 17 ✅
- Need repair: 0
- **Recommendation:** ✅ All templates healthy!

---

## Testing & Verification

### Test Case: Create New Recurring Transaction

**Action:**
```typescript
await recurring.addRecurringTransaction({
  description: "Test Subscription",
  amount: 10.00,
  categoryId: "...",
  paymentTypeId: "...",
  transactionType: "expense",
  frequency: "monthly",
  startDate: Date.now(),
  isActive: true,
});
```

**Expected Results:**

✅ **Legacy Table (`recurringTransactions`):**
- 1 record created

✅ **Ledger Template (`recurring_entries`):**
- 1 record with status = 'active'

✅ **Ledger Lines (`recurring_lines`):**
- 2 records (1 debit, 1 credit)

✅ **Template Mapping (`recurring_template_mappings`):**
- 1 record linking legacy ↔ ledger

### Verification Command

```bash
npx convex run diagnostics:diagnoseRecurringTemplate \
  '{"recurringTransactionId":"<new_id>"}'
```

**Expected Output:**
```json
{
  "exists": true,
  "mappingExists": true,
  "recurringLinesCount": 2,
  "hasCategoryMapping": true,
  "hasPaymentTypeMapping": true,
  "notes": [],
  "recommendation": "✅ Template is healthy and ready for generation."
}
```

### Generation Test

```bash
npx convex run recurring:generateTransactionFromRecurring \
  '{"recurringTransactionId":"kn74a2r1kj3vef2jt3x696xted7s0ydp","targetDate":1760000000000}'
```

**Results:**
- ✅ Successfully created expense
- ✅ Dual-write to ledger confirmed
- ✅ Idempotency working (no duplicates)

---

## Preventive Measures

### For New Templates (Automatic)

✅ **FIXED:** All new recurring templates created through `recurring.addRecurringTransaction` now automatically:
1. Create ledger structures immediately
2. Use dual-write path for generation
3. Apply default cash fallback for missing payment mappings
4. Backfill past-due transactions with dual-write

### Accounting Logic

#### Income Transactions
```
Debit:  Cash/Transfer Account (asset)
Credit: Income Category Account (income)
```

#### Expense Transactions
```
Debit:  Expense Category Account (expense)
Credit: Cash/Transfer Account (asset)
```

#### Credit Card Expenses
```
Debit:  Expense Category Account (expense)
Credit: Credit Card Account (liability)
```

---

## Tools & Commands

### Diagnostic Functions

| Function | Purpose | Type |
|----------|---------|------|
| `diagnostics:diagnoseRecurringTemplate` | Single template health check | Query |
| `diagnostics:repairRecurringTemplate` | Single template repair | Mutation |
| `diagnostics:scanUserRecurringTemplates` | Batch health scan | Query |
| `diagnostics:repairAllUserTemplates` | Batch repair with dry-run | Mutation |

### Usage Examples

**Check specific template:**
```bash
npx convex run diagnostics:diagnoseRecurringTemplate \
  '{"recurringTransactionId":"..."}'
```

**Scan all user templates:**
```bash
npx convex run diagnostics:scanUserRecurringTemplates \
  '{"userId":"..."}'
```

**Batch repair (dry run first):**
```bash
# Dry run
npx convex run diagnostics:repairAllUserTemplates \
  '{"userId":"...","dryRun":true}'

# Execute
npx convex run diagnostics:repairAllUserTemplates \
  '{"userId":"...","dryRun":false}'
```

---

## Edge Cases

### 1. Missing Category Mapping
**Scenario:** User creates recurring with unmapped category  
**Behavior:** Backfill fails with clear error message  
**Resolution:** Migrate category first, then template works

### 2. Missing Payment Type Mapping
**Scenario:** User creates recurring without payment type  
**Behavior:** Automatically creates default cash account  
**Result:** Template created successfully with cash account

### 3. Past-Due Recurring
**Scenario:** User creates recurring with startDate in past  
**Behavior:**
1. Template created first
2. Backfill runs for all past-due dates
3. All generations use dual-write

### 4. Idempotency
**Scenario:** Template creation called multiple times  
**Behavior:** First call creates, subsequent calls return existing  
**Result:** No duplicates, safe retries

---

## Monitoring & Health Checks

### Regular Health Check

Run periodically to detect broken templates:
```bash
npx convex run diagnostics:scanUserRecurringTemplates '{"userId":"..."}'
```

### Expected Output (Healthy)
```json
{
  "summary": {
    "total": 17,
    "healthy": 17,
    "needsRepair": 0
  },
  "recommendation": "✅ All 17 templates are healthy!"
}
```

### Alert Condition

If `needsRepair > 0`, investigate and run repair:
```bash
npx convex run diagnostics:repairAllUserTemplates \
  '{"userId":"...","dryRun":false}'
```

---

## Files Modified

### Core Fix
- **`convex/recurring.ts`** (lines 79-82)
  - Added automatic ledger template creation

### Diagnostic Tools
- **`convex/diagnostics.ts`** - User-friendly diagnostic functions
- **`convex/internal.ts`** - Core diagnostic and repair logic
- **`scripts/diagnose-user-templates.js`** - Automated diagnostic script

### Documentation
- **`docs/diagnostic-runbook.md`** - Operational guide
- **`docs/recurring-diagnostics-complete.md`** - This file

---

## Rollback Plan

If issues arise, rollback by removing the template creation line in `convex/recurring.ts`:

```typescript
// Remove this line:
await ctx.runMutation(internal.internal.backfillRecurringTemplateForLegacyId, {
  recurringTransactionId,
});
```

**Impact of Rollback:**
- New templates won't create ledger structures
- Manual backfill required via diagnostic tools
- Existing templates remain unaffected

---

## Future Enhancements

1. **Background Job:** Periodic scan + auto-repair
2. **Webhook:** Alert on template creation failures
3. **Admin Dashboard:** Real-time health monitoring
4. **Metrics:** Track creation success rate

---

## Recommendations

### Immediate
- ✅ All broken templates repaired
- ✅ Generation working correctly
- ✅ Dual-write operational

### Ongoing
1. Monitor cron runs for scheduled generations
2. Review logs periodically
3. Run quarterly diagnostic scans

---

## Success Summary

✅ **All Issues Resolved**
- Fixed 4 broken templates
- Implemented automatic template creation
- Created comprehensive diagnostic tools
- All new templates include ledger structures

**Status:** Production Ready  
**Next Steps:** Monitor scheduled cron runs

---

**Report Generated:** December 16, 2024  
**Completed By:** AI Assistant  
**Verified By:** User Testing

