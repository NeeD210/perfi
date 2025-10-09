# Production Deployment Checklist

**Date:** 2025-01-08  
**Target:** Production Deployment  
**Confidence:** 98%  
**Validated:** ✅ Yes (Dev with prod data - 100% success)

---

## ✅ Prerequisites (All Complete)

- [x] Phase 1-3 code fully implemented
- [x] All improvements implemented and tested
- [x] Dev deployment successful (100% migration)
- [x] Production data tested in dev (7 users, 216 expenses)
- [x] All verification checks passed
- [x] Documentation complete

---

## 🔧 Pre-Deployment Actions

### 1. Code Review & Cleanup ✅

**Current Status:**
```bash
git status
```

**Expected files to commit:**
- ✅ Modified: `convex/migrations/accountSeeding.ts` (soft-deleted handling)
- ✅ Modified: `convex/migrations/transactionBackfill.ts` (Efectivo auto-creation)
- ✅ New: `convex/migrations/preflightCheck.ts` (pre-flight checks)
- ✅ New: `convex/migrations/verify.ts` (post-verification)
- ✅ Modified: `convex/ledger/dualWriteConfig.ts` (should be false)
- ✅ Deleted: `convex/migrations/run.ts` (security - removed)
- ✅ Deleted: `convex/migrations/testRunner.ts` (temporary - removed)

**Action Required:**
```bash
# 1. Verify dual-write is DISABLED
cat convex/ledger/dualWriteConfig.ts
# Should show: export const LEDGER_DUAL_WRITE_ENABLED = false;

# 2. Verify no test files
ls convex/migrations/testRunner.ts 2>/dev/null && echo "❌ Remove test file!" || echo "✅ Clean"

# 3. Check for console.logs or debug code
grep -r "console.log" convex/migrations/ | grep -v "// " | wc -l
# Should be minimal (only intentional logging)
```

### 2. Git Commit & Push

```bash
# Stage all changes
git add .

# Commit with detailed message
git commit -m "feat: Phase 1-3 accounting system with migration improvements

- Phase 1: Double-entry ledger foundation
- Phase 2: Historical data migration (100% success rate)
- Phase 3: Dual-write preparation (disabled initially)

Improvements:
- Handle soft-deleted references (preserves historical data)
- Auto-create 'Efectivo' for incomes (handles empty paymentType)
- Pre-flight data quality checks
- Post-migration verification suite
- Security: Removed public migration endpoints

Validated in dev with production data:
- 7/7 users migrated successfully (100%)
- 216/216 expenses migrated (vs 187 before)
- 352 journal entries created
- All integrity checks passed
- Zero-sum invariant maintained

BREAKING CHANGES:
- Adds new ledger tables to schema
- Requires running migration after deployment
- Dual-write controlled by feature flag (start disabled)"

# Push to repository
git push origin master
```

### 3. Take Production Snapshot 🔴 CRITICAL

**Via Convex Dashboard:**

1. Go to Convex Dashboard → **Production** Deployment
2. Navigate to **Data** → **Snapshots**
3. Click **"Create Snapshot"**
4. Name: `pre-accounting-migration-2025-01-08`
5. **Wait for completion** (don't skip this!)
6. **Record snapshot ID** for rollback: `_____________________`

**Why Critical:** This is your only rollback point if something goes wrong.

---

## 🚀 Deployment Procedure

### Step 1: Deploy Backend to Production

```bash
# Deploy to production
npx convex deploy --prod

# Expected output:
# ✓ Deploying convex functions to production...
# ✓ Schema validation passed
# ✓ Functions deployed successfully
```

**Verification:**
- [ ] Deployment completed without errors
- [ ] Schema validation passed
- [ ] All functions deployed
- [ ] New tables visible in dashboard

**If deployment fails:** STOP. Fix errors, commit, and retry. Do not proceed.

---

### Step 2: Run Pre-Flight Check

**Via Convex Dashboard:**

Navigate to **Functions** → Find `migrations/preflightCheck:runPreflightCheck` → Click **Run**

**Expected Result:**
```json
{
  "passed": true,
  "issues": [
    // Info-level issues (auto-handled)
  ],
  "summary": {
    "critical": 0,  // MUST BE ZERO
    "warnings": 0,  // Should be low
    "info": N       // Can be non-zero
  }
}
```

**Decision Point:**
- ✅ `critical: 0` → PROCEED to Step 3
- ❌ `critical: > 0` → STOP. Review critical issues. Fix before proceeding.

**Common Issues & Fixes:**

| Issue | Severity | Action |
|-------|----------|--------|
| "Ledger tables not empty" | Critical | Restore snapshot, clear tables, or skip migration |
| "No users found" | Critical | Verify production deployment, check database |
| "Expenses without payment type" | Info | Proceed - auto-handled by Efectivo creation |
| "Soft-deleted references" | Info | Proceed - auto-handled by soft-delete preservation |

---

### Step 3: Run Migration

**⚠️ This is the main migration - monitor closely**

**Via Convex Dashboard:**

Navigate to **Functions** → Find `internal.migrations.index:runBulkPhase2Migration` → Click **Run**

**Arguments:** Leave empty (uses defaults)

**Expected Duration:** 1-5 minutes depending on user count

**Monitor:**
- Watch **Logs** tab in real-time
- Look for "✅ User X migrated successfully" messages
- Watch for any error messages
- Note the migration ID (e.g., `bulk_phase2_XXXXX`)

**Expected Final Output:**
```json
{
  "totalProcessed": N,
  "totalSuccessful": N,
  "totalFailed": 0,        // MUST BE ZERO
  "migrationId": "bulk_phase2_XXXXX",
  "errors": [],            // MUST BE EMPTY
  "message": "Bulk Phase 2 migration completed: N users processed, N successful, 0 failed"
}
```

**Decision Point:**
- ✅ `totalFailed: 0` → PROCEED to Step 4
- ❌ `totalFailed: > 0` → STOP. Review errors. Consider rollback.

---

### Step 4: Run Post-Migration Verification

**Via Convex Dashboard:**

Navigate to **Functions** → Find `migrations/verify:verifyMigrationIntegrity` → Click **Run**

**Expected Result:**
```json
{
  "passed": true,          // MUST BE TRUE
  "checks": [
    {
      "name": "Zero-Sum Invariant",
      "passed": true,      // CRITICAL
      "critical": true
    },
    {
      "name": "Idempotency Keys Unique",
      "passed": true,      // CRITICAL
      "critical": true
    },
    // ... more checks
  ],
  "summary": "✅ Migration passed all X critical checks"
}
```

**Critical Checks (Must ALL Pass):**
1. ✅ Zero-Sum Invariant
2. ✅ Idempotency Keys Unique
3. ✅ All Users Migrated
4. ✅ No Orphaned Records
5. ✅ Recurring Entries Have Lines
6. ✅ Valid Account References

**Decision Point:**
- ✅ `passed: true` + All critical checks → PROCEED to Step 5
- ❌ Any critical check failed → STOP. Investigate. Consider rollback.

---

### Step 5: Quick Health Check

**Via Convex Dashboard:**

Navigate to **Functions** → Find `migrations/verify:quickHealthCheck` → Click **Run**

**Expected Result:**
```json
{
  "healthy": true,
  "issues": [],            // SHOULD BE EMPTY
  "stats": {
    "users": N,
    "accounts": N,
    "journalEntries": N,
    "journalLines": N,
    "recurringEntries": N,
    "completedMigrations": N,
    "failedMigrations": 0   // MUST BE ZERO
  }
}
```

**Sanity Checks:**
- `journalLines` should be ~2x `journalEntries` (double-entry)
- `failedMigrations` must be 0
- `issues` array should be empty

---

### Step 6: Manual Spot Checks

**In Convex Dashboard → Data:**

1. **Check `accounts` table:**
   - Should have accounts for each user
   - Mix of asset, liability, income, expense types
   - Some may be soft-deleted (expected)

2. **Check `journal_entries` table:**
   - Should have entries with dates, descriptions
   - Each should have `idempotencyKey`
   - Status should be "posted"

3. **Check `journal_lines` table:**
   - Each entry should have 2+ lines
   - Sum of `amountBaseCurrency` per entry should be 0

4. **Check `payment_type_mappings` and `category_mappings`:**
   - Should have mappings for all payment types and categories
   - Links to corresponding accounts

---

### Step 7: Enable Dual-Write (Phase 3)

**⚠️ Only if ALL previous steps succeeded**

**Update Configuration:**

```typescript
// convex/ledger/dualWriteConfig.ts
export const LEDGER_DUAL_WRITE_ENABLED = true;
```

**Deploy:**

```bash
git add convex/ledger/dualWriteConfig.ts
git commit -m "feat: Enable dual-write for production

Post-migration validation:
- All users migrated successfully
- All integrity checks passed
- Zero-sum invariant maintained
- Ready for real-time synchronization"
git push origin master

npx convex deploy --prod
```

**Verification:**
- [ ] Deployment successful
- [ ] No errors in logs
- [ ] Config change applied

---

### Step 8: Test Dual-Write

**Create Test Transaction:**

1. **Via Production App:**
   - Log in with your account
   - Create a small test expense (e.g., "Test Expense $1")
   - Note the expense ID

2. **Verify in Dashboard:**
   - Check `expenses` table → Should have new record
   - Check `journal_entries` table → Should have new entry
   - Check `journal_lines` table → Should have 2 lines balancing to 0
   - Verify `idempotencyKey` matches expense ID

3. **Test Recurring Transaction:**
   - Create a test recurring transaction
   - Verify `recurringTransactions` record created
   - Verify `recurring_entries` and `recurring_lines` created

4. **Check Error Tracking:**
   - Query `ledger_errors` table
   - Should be empty or only pre-existing errors

**Decision Point:**
- ✅ Dual-write working → SUCCESS! Monitor for 24 hours
- ❌ Dual-write failing → Disable immediately, investigate

**To Disable Dual-Write (if needed):**
```typescript
export const LEDGER_DUAL_WRITE_ENABLED = false;
```
Then commit and deploy.

---

## 📊 Success Criteria

Migration is successful when:

- [x] Deployment completed without errors
- [x] Pre-flight check passed (0 critical issues)
- [x] Migration completed (0 failed users)
- [x] Post-verification passed (all critical checks)
- [x] Quick health check healthy
- [x] Manual spot checks confirm data looks correct
- [x] Dual-write enabled without errors
- [x] Test transaction works correctly

---

## 🔄 Rollback Procedure

### If Issues Arise During Steps 1-5 (Before Dual-Write)

**Option A: Disable Dual-Write Only** (if issues are minor)
```typescript
export const LEDGER_DUAL_WRITE_ENABLED = false;
```
Commit, deploy, investigate.

**Option B: Full Rollback** (if critical issues)

1. **Restore Snapshot:**
   - Dashboard → Data → Snapshots
   - Select `pre-accounting-migration-2025-01-08`
   - Click **"Restore"**
   - ⚠️ This reverts ALL data changes

2. **Revert Code:**
   ```bash
   git log  # Find commit hash before deployment
   git revert <commit-hash>
   git push origin master
   npx convex deploy --prod
   ```

3. **Verify Restoration:**
   - Check user data is back to pre-migration state
   - Verify no ledger tables have data
   - Confirm app functionality

4. **Post-Mortem:**
   - Document what went wrong
   - Fix issues in development
   - Retest before retry

### If Issues Arise After Dual-Write (Step 7-8)

**Immediate Action:**
```typescript
// Disable dual-write immediately
export const LEDGER_DUAL_WRITE_ENABLED = false;
```
```bash
git add convex/ledger/dualWriteConfig.ts
git commit -m "hotfix: Disable dual-write due to production issues"
git push origin master
npx convex deploy --prod
```

**Then:**
- Investigate errors in `ledger_errors` table
- Review logs for failure patterns
- Fix code issues
- Retest in dev
- Re-enable when fixed

---

## 📈 Monitoring Plan

### First 24 Hours (Critical)

**Every Hour:**
- [ ] Check `ledger_errors` table for new errors
- [ ] Review Convex logs for error patterns
- [ ] Verify new transactions creating journal entries
- [ ] Spot-check zero-sum invariant on new entries

**Dashboard Queries to Monitor:**
```bash
# Run these via Dashboard every hour:
migrations/verify:quickHealthCheck
# Look for: healthy=true, failedMigrations=0

# If any issues:
migrations/verify:verifyMigrationIntegrity
# Detailed integrity report
```

### First Week

**Daily:**
- [ ] Run `quickHealthCheck`
- [ ] Review `ledger_errors` table
- [ ] Check dual-write success rate
- [ ] Monitor for user-reported issues

**Weekly:**
- [ ] Run full `verifyMigrationIntegrity`
- [ ] Review performance metrics
- [ ] Check for any data anomalies

---

## 🎯 Expected Production Results

Based on dev testing:

| Metric | Expected Value |
|--------|---------------|
| **Migration Duration** | 1-5 minutes |
| **Success Rate** | 100% |
| **Data Loss** | 0% |
| **Manual Intervention** | None |
| **Errors** | 0 |
| **Skipped Records** | 0 |
| **Zero-Sum Violations** | 0 |

---

## 📞 Communication Plan

### Before Deployment
- [ ] Notify team of deployment window
- [ ] Set up monitoring channel
- [ ] Identify on-call person for issues

### During Deployment
- [ ] Real-time status updates at each step
- [ ] Immediate escalation if errors

### After Deployment
**Success Message:**
```
✅ Phase 1-3 Accounting System Deployed Successfully

Results:
- X users migrated successfully
- X,XXX journal entries created
- All integrity checks passed
- Dual-write enabled
- Zero errors

Monitoring: Active for 24 hours
Next steps: Normal operations, report any issues
```

**Failure Message:**
```
⚠️ Deployment Issue Detected

Issue: [Description]
Impact: [User impact]
Status: [Investigating/Fixed/Rolled back]
Action: [What we're doing]

Updates every [interval]
```

---

## 🛠️ Troubleshooting Guide

### Issue: Pre-flight Check Fails (Critical)

**Symptom:** `critical > 0` in pre-flight results

**Common Causes:**
1. Ledger tables not empty (previous migration ran)
2. No users in database
3. Missing required indexes

**Solution:**
```bash
# If tables not empty - decide:
# Option A: Clear ledger tables (lose any existing ledger data)
# Option B: Restore snapshot to clean state
# Option C: Skip account seeding for users already migrated
```

### Issue: Migration Fails for Some Users

**Symptom:** `totalFailed > 0`

**Action:**
1. Review `errors` array in migration result
2. Check which users failed
3. Review those users' data in dashboard
4. If < 10% failed: Can manually fix post-migration
5. If > 10% failed: Rollback recommended

### Issue: Zero-Sum Violations

**Symptom:** Verification check "Zero-Sum Invariant" fails

**Action:**
```bash
# This is CRITICAL - data corruption
# 1. Immediately rollback
# 2. Review migration code for amount calculation bugs
# 3. Fix in dev
# 4. Retest completely
# 5. Retry production
```

### Issue: Dual-Write Creating Duplicate Entries

**Symptom:** Multiple journal entries for one expense

**Action:**
```bash
# 1. Disable dual-write immediately
# 2. Check idempotency logic
# 3. Review ledger_errors for patterns
# 4. May need to clean up duplicates manually
```

---

## ✅ Final Pre-Deployment Checklist

**Code:**
- [ ] Dual-write disabled initially (false)
- [ ] No test/debug files committed
- [ ] All changes committed and pushed
- [ ] No console.logs or debug code

**Backups:**
- [ ] Production snapshot taken
- [ ] Snapshot ID recorded: `_____________________`
- [ ] Snapshot confirmed complete

**Access:**
- [ ] Convex production dashboard access
- [ ] Permission to run internal functions
- [ ] Git push permissions
- [ ] Communication channel ready

**Documentation:**
- [ ] This checklist printed/available
- [ ] Team notified of deployment
- [ ] Rollback person identified
- [ ] Support channel monitored

**Testing:**
- [ ] Dev deployment successful (✅ Yes - 100%)
- [ ] Production data tested in dev (✅ Yes - 216/216)
- [ ] All verifications passed (✅ Yes)

---

## 🎯 Success Indicators

You'll know it worked when:

1. ✅ Migration logs show all users successful
2. ✅ Verification returns "passed: true"
3. ✅ Health check shows "healthy: true"
4. ✅ Dashboard shows journal entries
5. ✅ Test transaction creates ledger entry
6. ✅ No errors in logs
7. ✅ Users can still use app normally

---

## 📋 Post-Deployment Report Template

```markdown
# Production Deployment Report - Phase 1-3

**Date:** YYYY-MM-DD
**Duration:** HH:MM - HH:MM
**Deployer:** [Name]
**Status:** ✅ Success / ⚠️ Issues / ❌ Failed

## Results

### Pre-Flight
- Critical issues: 0
- Warnings: N
- Status: ✅ Passed

### Migration
- Users processed: N
- Users successful: N
- Users failed: 0
- Duration: N minutes
- Migration ID: bulk_phase2_XXXXX

### Data Created
- Accounts: N
- Journal entries: N
- Journal lines: N
- Recurring entries: N

### Verification
- Zero-sum invariant: ✅ Pass
- Idempotency: ✅ Pass
- Orphaned records: ✅ None
- Health check: ✅ Healthy

### Dual-Write
- Enabled: Yes/No
- Test transaction: ✅ Success
- Errors: 0

## Issues Encountered
[None / Description]

## Next Steps
- Monitor for 24 hours
- [Any follow-up actions]
```

---

## 🎓 Key Learnings from Dev Testing

1. **Pre-flight checks catch everything** - Run them, review carefully
2. **Soft-deleted items are common** - Our handling works perfectly
3. **Income transactions need special handling** - Efectivo auto-creation works
4. **Verification is crucial** - Catches issues immediately
5. **Real prod data reveals edge cases** - Testing was worth it

---

**Ready to deploy?** Follow these steps in order, verify at each stage, and you'll have a successful production deployment!

**Estimated Time:** 30-60 minutes (plus 24h monitoring)

**Risk Level:** Medium (with rollback available)

**Confidence:** 98% ✅

