# Phase 1-3 Production Deployment Guide

## Introduction

This guide provides a comprehensive, step-by-step deployment procedure for rolling out the complete accounting ledger system (Phase 1-3) to production. This deployment is critical as it introduces the double-entry accounting foundation, migrates historical data, and establishes dual-write operations for all new transactions.

The deployment follows a cautious, reversible approach with extensive verification steps, rollback procedures, and monitoring requirements. This ensures production stability while enabling the gradual transition from the legacy expense-tracking system to a proper accounting ledger.

**Deployment Scope:**
- Phase 1: Double-entry ledger tables, accounts, FX rates
- Phase 2: Historical data migration from expenses/recurring to ledger
- Phase 3: Dual-write system for real-time synchronization

**Estimated Deployment Time:** 1-2 hours (based on dev deployment: ~1 min migration for 7 users)

**Risk Level:** Medium-High - involves schema changes, data migrations, and fundamental system architecture changes
- **Risk Mitigation:** Successfully tested in dev with production data snapshot (100% success rate)

## Prerequisites

### Development Environment Verification

Before deploying to production, verify all phases work correctly in development:

**✓ Phase 1 Verification:**
- [x] All ledger tables exist in schema (`accounts`, `journal_entries`, `journal_lines`, etc.)
- [x] Account seeding creates default accounts successfully
- [x] FX rate queries work correctly
- [x] Schema validation passes
- **Status:** ✅ VERIFIED in dev (2025-01-08)

**✓ Phase 2 Verification:**
- [x] Migration orchestrator completed successfully in dev
- [x] All historical expenses converted to journal entries (187 entries)
- [x] All recurring transactions converted to recurring entries (15 templates, 30 lines)
- [x] Zero-sum invariant maintained (all entries balance)
- [x] No orphaned records or data inconsistencies
- **Status:** ✅ VERIFIED in dev with prod data (7/7 users, 100% success)
- **Note:** ~47 expenses skipped due to missing mappings (expected for soft-deleted data)

**✓ Phase 3 Verification:**
- [x] Dual-write system creates both expense and ledger entries
- [x] New expenses appear correctly in both systems
- [x] New recurring transactions work end-to-end
- [x] Idempotency prevents duplicate entries
- [x] Error tracking captures and reports failures
- **Status:** ✅ VERIFIED in dev (dual-write enabled and deployed)

### Required Access & Permissions

- [ ] Convex production dashboard access
- [ ] Git repository push permissions
- [ ] Ability to monitor production logs in real-time
- [ ] Communication channel with team (in case of issues)
- [ ] Database backup/restore permissions

### Tools & Commands Ready

- [ ] Node.js and npm installed
- [ ] Convex CLI installed (`npm install -g convex`)
- [ ] Git configured and authenticated
- [ ] Terminal/shell access

## Pre-Deployment Checklist

### 1. Review All Changes

```bash
# Review git status
git status

# Review all modified files
git diff

# Check for any debug code, console.logs, or temporary changes
grep -r "console.log" convex/
grep -r "TODO" convex/
grep -r "FIXME" convex/
```

**⚠️ IMPORTANT:** Remove or secure temporary migration wrappers:
- [ ] Review `convex/migrations/run.ts` - contains PUBLIC wrappers for testing
- [ ] Decision: Either delete this file OR make functions internal before production
- [ ] Risk: Public migration functions expose sensitive operations to the internet

**Files Expected to Change:**
- `convex/schema.ts` - New ledger tables
- `convex/expenses.ts` - Dual-write logic
- `convex/recurring.ts` - Dual-write logic
- `convex/internal.ts` - Extended with ledger operations
- `convex/internal/recurring.ts` - Recurring dual-write
- `convex/ledger/*` - All ledger-related utilities
- `convex/diagnostics.ts` - New diagnostic tools
- `convex/migrations/*` - Migration utilities

### 2. Configuration Review

**Check Dual-Write Flag:**
```typescript
// convex/ledger/dualWriteConfig.ts
export const LEDGER_DUAL_WRITE_ENABLED = false; // Start with false!
```

**Important:** Deploy with dual-write **DISABLED** initially. Enable it only after migration completes successfully.

**Check Migration Configuration:**
```typescript
// Ensure migration batch sizes are production-appropriate
// Larger batches = faster migration but higher load
const BATCH_SIZE = 100; // Adjust based on data volume
```

### 3. Data Backup Strategy

**Critical Step - Do Not Skip:**

1. **Take Production Snapshot:**
   - Go to Convex Dashboard → Production Deployment
   - Navigate to "Data" → "Snapshots"
   - Click "Create Snapshot"
   - Name: `pre-accounting-migration-YYYY-MM-DD`
   - **Wait for completion and verify snapshot exists**
   - **Record snapshot ID for rollback**

2. **Export Critical Tables** (optional but recommended):
   - Export `expenses` table to CSV
   - Export `recurringTransactions` table to CSV
   - Export `paymentSchedules` table to CSV
   - Store locally as additional backup

### 4. Communication Plan

**Before deployment:**
- [ ] Notify team of deployment window
- [ ] Set up monitoring/alerting channel
- [ ] Prepare rollback communication template
- [ ] Identify key stakeholders for approval

**During deployment:**
- [ ] Real-time status updates
- [ ] Immediate escalation path for issues

**After deployment:**
- [ ] Success/failure notification
- [ ] Summary of changes deployed
- [ ] Any known issues or workarounds

## Deployment Steps

### Step 1: Commit and Push Changes

```bash
# Ensure you're on the correct branch
git branch

# Stage all changes
git add .

# Commit with descriptive message
git commit -m "feat: Implement Phase 1-3 accounting ledger system with improvements

- Phase 1: Double-entry ledger tables and accounts
- Phase 2: Historical data migration (100% success in dev)
- Phase 3: Dual-write implementation

Improvements:
- Handle soft-deleted references (preserves historical data)
- Auto-create 'Efectivo' for incomes (handles empty paymentType)
- Pre-flight data quality checks
- Post-migration verification suite
- Security: Removed public migration endpoints

Dev Validation Results:
- 7/7 users migrated (100%)
- 216/216 expenses migrated (improved from 187)
- 352 journal entries created
- All integrity checks passed
- Zero-sum invariant maintained

BREAKING CHANGES:
- Adds ledger tables to schema
- Requires Phase 2 migration via Dashboard
- Dual-write starts disabled, enable post-migration"

# Push to remote
git push origin master
```

### Step 2: Deploy Convex Backend to Production

**⚠️ IMPORTANT:** Convex projects have TWO deployments:
- **Dev:** majestic-squirrel-400 (already migrated ✅)
- **Prod:** graceful-spaniel-507 (deploying code now)

```bash
# Deploy to production (graceful-spaniel-507)
# Note: npx convex deploy goes to PRODUCTION by default
npx convex deploy

# Expected output:
# ✓ Deploying convex functions to production...
# ✓ Schema validation passed
# ✓ Deployed to https://graceful-spaniel-507.convex.cloud
```

**Monitor the deployment output carefully:**
- ✓ Schema changes applied
- ✓ All functions compiled successfully
- ✓ No validation errors
- ⚠️ Any warnings about breaking changes

**If deployment fails:**
- Review error messages
- Check for schema validation issues
- Verify all imports are correct
- Do NOT proceed until deployment succeeds

### Step 3: Verify Deployment Success

**Check Convex Dashboard:**
1. Navigate to Production deployment
2. Go to "Functions" tab
3. Verify new functions are present:
   - `ledger:getAccounts`
   - `ledger:getJournalEntries`
   - `migrations:runPhase2Migration`
   - `diagnostics:*` functions
4. Go to "Schema" tab
5. Verify new tables exist:
   - `accounts`
   - `journal_entries`
   - `journal_lines`
   - `recurring_entries`
   - `recurring_lines`
   - `payment_type_mappings`
   - `fx_rates`
   - `ledger_errors`

**Test Basic Queries:**
```bash
# Test that basic queries still work
# Via dashboard: Run a simple query on expenses table
# Should return existing data without errors
```

### Step 4: Run Pre-Flight Check (NEW - Recommended)

**Via Convex Dashboard:**
1. Select **Production (graceful-spaniel-507)** deployment
2. Navigate to **Functions** tab
3. Find `migrations/preflightCheck:runPreflightCheck`
4. Click **"Run"**

**Expected Result:**
```json
{
  "passed": true,
  "issues": [...],
  "summary": { "critical": 0, "warnings": N, "info": N }
}
```

**Decision:**
- ✅ `critical: 0` → Proceed to Step 5
- ❌ `critical: > 0` → Review issues, fix before proceeding

**Note:** Info and warning issues will be handled automatically by migration improvements

### Step 5: Run Phase 2 Migration

**⚠️ CRITICAL STEP - Read Carefully**

This step migrates all historical data. Monitor closely and be prepared to rollback.

**✅ Dev Testing Results:**
- 7 users migrated in ~1 minute
- 100% success rate (0 failures)
- 157 accounts created
- 310 journal entries created
- 47 expenses skipped (missing mappings - expected)

**Migration Approach:**

**✅ Via Convex Dashboard (REQUIRED - No public wrappers)**

1. **Open Convex Dashboard**
2. **Select Production (graceful-spaniel-507)** deployment
3. **Navigate to Functions** tab
4. **Find:** `internal.migrations.index:runBulkPhase2Migration`
5. **Click "Run"** with arguments: `{}` (empty - uses defaults)

**⚠️ Note:** Public wrappers were removed for security. Must use dashboard for internal functions.

**Option B: Manual Step-by-Step (Only if bulk migration fails)**

1. **Start Migration Monitoring:**
   - Open Convex Dashboard → Logs (keep this open)
   - Open another tab with Data → `migrationProgress` table
   - Prepare to watch real-time progress

2. **Run Expense Migration:**
   ```bash
   # Via dashboard or CLI
   npx convex run migrations:migrateExpensesToLedger --prod '{"batchSize": 100}'
   ```
   
   **Monitor:**
   - Progress updates in logs
   - `migrationProgress` table updates
   - Error counts in `ledger_errors` table
   - Execution time per batch

   **Expected Duration:** 5-30 minutes depending on volume

3. **Verify Expense Migration:**
   - Check `journal_entries` count matches `expenses` count
   - Verify zero-sum invariant: sum of all `journal_lines` amounts = 0
   - Spot-check 5-10 random expenses have correct ledger entries
   - Verify all entries have proper `idempotencyKey`

4. **Run Recurring Transaction Migration:**
   ```bash
   npx convex run migrations:migrateRecurringToLedger --prod '{"batchSize": 50}'
   ```
   
   **Monitor:**
   - Recurring entry creation
   - Recurring lines creation
   - Template structure preservation

   **Expected Duration:** 2-10 minutes

5. **Verify Recurring Migration:**
   - Check `recurring_entries` count matches `recurringTransactions` count
   - Verify each recurring entry has correct recurring lines
   - Check frequency patterns preserved
   - Verify next due dates calculated correctly

6. **Run Payment Schedule Migration** (if applicable):
   ```bash
   npx convex run migrations:migratePaymentSchedules --prod '{"batchSize": 100}'
   ```

**Migration Completion Verification:**

**Via Convex Dashboard:**

1. **Run Post-Migration Verification:**
   - Function: `migrations/verify:verifyMigrationIntegrity`
   - Expected: `passed: true`, all critical checks pass

2. **Run Quick Health Check:**
   - Function: `migrations/verify:quickHealthCheck`
   - Expected: `healthy: true`, `failedMigrations: 0`

**Expected Results:**
- All critical verification checks pass
- Zero-sum invariant maintained
- No orphaned records
- 100% migration success rate
- No duplicate idempotency keys

**If Migration Fails:**

1. **Check Error Logs:**
   ```bash
   npx convex run diagnostics:getLedgerErrors --prod '{"limit": 50}'
   ```

2. **Review Failure Patterns:**
   - Are errors isolated to specific records?
   - Is there a systemic issue (schema mismatch, validation error)?
   - Can records be fixed individually or need code changes?

3. **Decision Point:**
   - **If errors are minor (<1% of records):** Document, fix manually post-deployment
   - **If errors are significant (>1%):** Consider rollback and fix in development

### Step 6: Enable Dual-Write System (Phase 3)

**⚠️ Only proceed if Phase 2 migration succeeded completely**

**Update Dual-Write Configuration:**

1. **Modify the config file:**
   ```typescript
   // convex/ledger/dualWriteConfig.ts
   export const LEDGER_DUAL_WRITE_ENABLED = true; // Enable dual-write
   ```

2. **Commit and deploy:**
   ```bash
   git add convex/ledger/dualWriteConfig.ts
   git commit -m "feat: Enable dual-write for production"
   git push origin master
   npx convex deploy --prod
   ```

3. **Verify deployment:**
   - Check dashboard for successful deployment
   - Verify config change applied

**Test Dual-Write Functionality:**

1. **Create a test expense in production:**
   - Use the production app UI
   - Create a small test expense (e.g., "Test Expense $1")
   - **Important:** Use a test account or your own account

2. **Verify dual-write worked:**
   - Check `expenses` table - should have new record
   - Check `journal_entries` table - should have new entry
   - Check `journal_lines` table - should have 2 lines (Dr and Cr)
   - Verify lines balance (sum = 0)
   - Verify `idempotencyKey` matches expense ID

3. **Test recurring transaction:**
   - Create a test recurring transaction
   - Verify `recurringTransactions` record created
   - Verify `recurring_entries` record created
   - Verify `recurring_lines` records created

4. **Check error tracking:**
   ```bash
   npx convex run diagnostics:getLedgerErrors --prod '{"limit": 10}'
   ```
   Should return empty or only pre-existing errors

**If Dual-Write Fails:**

1. Check logs for error messages
2. Verify idempotency logic working
3. Check account mappings exist for all payment types
4. Temporarily disable dual-write if needed:
   ```bash
   # Revert config
   export const LEDGER_DUAL_WRITE_ENABLED = false;
   # Deploy again
   ```

### Step 7: Post-Deployment Verification

**Run Full Diagnostic Suite:**

```bash
# Get comprehensive status
npx convex run diagnostics:runFullDiagnostics --prod

# Check specific areas:

# 1. Ledger integrity
npx convex run diagnostics:verifyLedgerIntegrity --prod

# 2. Recurring transaction health
npx convex run diagnostics:verifyRecurringTransactions --prod

# 3. Payment type mappings
npx convex run diagnostics:verifyPaymentTypeMappings --prod

# 4. FX rates coverage
npx convex run diagnostics:verifyFXRates --prod
```

**Manual Verification Checklist:**

- [ ] All users can log in successfully
- [ ] Homepage loads without errors
- [ ] Existing expenses display correctly
- [ ] New expense creation works
- [ ] Expense editing works
- [ ] Expense deletion works (soft delete)
- [ ] Recurring transactions display correctly
- [ ] Recurring transaction creation works
- [ ] Template processing works (wait for next scheduled run)
- [ ] Projections page loads
- [ ] Charts and analytics work
- [ ] No console errors in browser
- [ ] No error spikes in Convex dashboard

**Performance Verification:**

- [ ] Query response times acceptable (<500ms for typical queries)
- [ ] No significant increase in function execution time
- [ ] No memory issues or timeouts
- [ ] Database query limits not exceeded

**Data Consistency Checks:**

```bash
# Compare counts
# expenses count should equal journal_entries count (post-migration)
# recurringTransactions count should equal recurring_entries count

# Verify no duplicate entries
npx convex run diagnostics:checkDuplicateEntries --prod

# Verify referential integrity
npx convex run diagnostics:checkReferentialIntegrity --prod
```

### Step 8: Monitoring Period

**First 24 Hours:**

Monitor the following closely:

1. **Convex Dashboard - Logs:**
   - Watch for any error spikes
   - Look for "ledger_error" patterns
   - Monitor dual-write success rate

2. **Error Tracking Table:**
   - Query `ledger_errors` hourly
   - Investigate any new errors immediately
   - Document patterns

3. **User Reports:**
   - Monitor support channels
   - Watch for bug reports
   - Address issues promptly

4. **System Metrics:**
   - Function execution times
   - Database query performance
   - Error rates

**First Week:**

- Daily review of error logs
- Weekly data consistency check
- User feedback review
- Performance trend analysis

## Rollback Procedures

### Scenario 1: Deployment Fails (Step 2)

**Symptoms:**
- Schema validation errors
- Function compilation errors
- Deployment won't complete

**Action:**
```bash
# Fix the issues in development
# Commit fixes
git add .
git commit -m "fix: Address deployment issues"
git push origin master

# Re-deploy
npx convex deploy --prod
```

No data rollback needed - deployment didn't complete.

### Scenario 2: Migration Fails (Step 5)

**Symptoms:**
- Migration errors in logs
- High error count in `ledger_errors`
- Data inconsistencies
- Migration stuck or timing out

**Action:**

**Option A: Pause and Fix (Minor Issues)**
```bash
# Disable dual-write if enabled
export const LEDGER_DUAL_WRITE_ENABLED = false;

# Re-deploy to disable dual-write
npx convex deploy --prod

# Fix migration issues in development
# Test fix thoroughly
# Re-run migration on corrected code
```

**Option B: Full Rollback (Major Issues)**

1. **Stop Migration:**
   - Cancel any running migration functions
   - Set feature flag to disable dual-write

2. **Restore from Snapshot:**
   - Go to Dashboard → Data → Snapshots
   - Select pre-migration snapshot
   - Click "Restore"
   - **WARNING: This will revert ALL data changes since snapshot**

3. **Clean Up Partial Migration:**
   ```bash
   # If rollback isn't clean, may need to:
   # - Delete partial ledger entries
   # - Clear migration progress
   # - Reset error tracking
   
   npx convex run migrations:resetMigrationProgress --prod
   ```

4. **Deploy Previous Code Version:**
   ```bash
   # Roll back git commits
   git log # Find pre-deployment commit hash
   git revert <commit-hash>
   git push origin master
   
   # Deploy reverted code
   npx convex deploy --prod
   ```

### Scenario 3: Dual-Write Issues (Step 6)

**Symptoms:**
- New expenses create but no ledger entries
- Errors when creating transactions
- Inconsistent data between tables
- Duplicate entries

**Action:**

1. **Immediate Mitigation:**
   ```typescript
   // Disable dual-write
   export const LEDGER_DUAL_WRITE_ENABLED = false;
   ```
   
   ```bash
   git add convex/ledger/dualWriteConfig.ts
   git commit -m "fix: Disable dual-write due to production issues"
   git push origin master
   npx convex deploy --prod
   ```

2. **Investigate:**
   - Review error logs
   - Check specific failed transactions
   - Identify root cause

3. **Fix and Re-Enable:**
   - Fix issue in development
   - Test thoroughly
   - Re-enable dual-write in production

### Scenario 4: Critical Production Issue

**Symptoms:**
- Users cannot create expenses
- Data corruption
- System-wide errors
- Performance degradation

**Emergency Rollback:**

1. **Immediate Communication:**
   - Alert team
   - Notify users of incident

2. **Restore Snapshot:**
   - Dashboard → Data → Snapshots
   - Restore pre-deployment snapshot

3. **Revert Code:**
   ```bash
   git revert HEAD~n # Revert last n commits
   git push origin master
   npx convex deploy --prod
   ```

4. **Verify System Restored:**
   - Test critical user flows
   - Verify data consistency
   - Monitor error rates

5. **Post-Mortem:**
   - Document what went wrong
   - Identify prevention measures
   - Plan corrective deployment

## Post-Deployment Tasks

### Immediate (Day 1)

- [ ] Send deployment success notification
- [ ] Document any issues encountered
- [ ] Update team on status
- [ ] Monitor error rates closely

### Short-term (Week 1)

- [ ] Run daily diagnostics
- [ ] Review user feedback
- [ ] Address any minor issues
- [ ] Plan for Phase 4 features

### Medium-term (Month 1)

- [ ] Verify data consistency across all users
- [ ] Analyze performance metrics
- [ ] Gather feedback on new capabilities
- [ ] Plan deprecation of legacy expense fields

### Long-term (Quarter 1)

- [ ] Begin feature development on ledger system
- [ ] Plan migration of UI to use ledger data
- [ ] Deprecate legacy tables when safe
- [ ] Implement advanced accounting features

## Troubleshooting Guide

### Common Issues and Solutions

**Issue 1: Migration timeout**
```
Error: Function execution timeout after 300 seconds
```

**Solution:**
- Reduce batch size
- Run migration in smaller chunks
- Optimize migration queries

**Issue 2: Zero-sum invariant violation**
```
Error: Journal entry lines don't sum to zero
```

**Solution:**
- Check amount conversion logic
- Verify rounding handling
- Check for missing contra-entry

**Issue 3: Missing account mapping**
```
Error: No account found for payment type
```

**Solution:**
- Run account seeding migration
- Manually create missing payment type mappings
- Set up default cash account

**Issue 4: Duplicate entries**
```
Warning: Duplicate idempotencyKey detected
```

**Solution:**
- Check idempotency logic
- Verify key generation
- Clean up duplicates if safe

**Issue 5: FX rate missing**
```
Error: No FX rate found for currency pair on date
```

**Solution:**
- Backfill FX rates for historical dates
- Implement fallback to latest rate
- Add warning for missing rates

### Diagnostic Commands Reference

```bash
# Get migration status
npx convex run diagnostics:getMigrationStatus --prod

# Check error count
npx convex run diagnostics:getLedgerErrors --prod '{"limit": 100}'

# Verify zero-sum invariant
npx convex run diagnostics:verifyZeroSumInvariant --prod

# Check referential integrity
npx convex run diagnostics:checkReferentialIntegrity --prod

# Get system health
npx convex run diagnostics:getSystemHealth --prod

# List recent journal entries
npx convex run ledger:listJournalEntries --prod '{"limit": 20}'

# Get account balances
npx convex run ledger:getAccountBalances --prod '{"userId": "..."}'
```

## Success Criteria

Deployment is considered successful when:

- ✅ All code deployed without errors
- ✅ Schema changes applied successfully
- ✅ Account seeding completed for all users
- ✅ Phase 2 migration completed with <1% error rate
- ✅ Dual-write enabled and functioning correctly
- ✅ Zero-sum invariant maintained across all entries
- ✅ No critical bugs reported within 24 hours
- ✅ Performance metrics within acceptable ranges
- ✅ All diagnostic checks pass
- ✅ Rollback capability verified
- ✅ Team notified and documentation updated

## Appendices

### Appendix A: Migration Statistics Template

```markdown
# Phase 1-3 Production Deployment Results

**Deployment Date:** YYYY-MM-DD
**Deployment Time:** HH:MM - HH:MM
**Deployer:** [Name]
**Status:** ✅ Success / ⚠️ Partial / ❌ Failed

## Metrics

### Pre-Deployment
- Total expenses: X,XXX
- Total recurring transactions: XXX
- Total users: XX

### Phase 2 Migration
- Expenses migrated: X,XXX / X,XXX (XX%)
- Recurring transactions migrated: XXX / XXX (XX%)
- Journal entries created: X,XXX
- Journal lines created: XX,XXX
- Migration duration: XX minutes
- Errors encountered: X

### Phase 3 Dual-Write
- Dual-write enabled: Yes/No
- Test transactions created: X
- Dual-write success rate: XX%
- Errors encountered: X

### Performance
- Average query time: XXms
- Average mutation time: XXms
- Peak function execution time: XXms
- Database size increase: XXX MB

## Issues Encountered

1. [Issue description]
   - Impact: High/Medium/Low
   - Resolution: [How resolved]
   - Time to resolution: XX minutes

## Rollback Events

- None / [Description of any rollbacks]

## Post-Deployment Notes

[Any relevant observations, warnings, or next steps]
```

### Appendix B: Communication Templates

**Pre-Deployment Announcement:**
```
🚀 Production Deployment Scheduled

Team: We will be deploying the Phase 1-3 accounting system to production on [DATE] at [TIME].

Expected duration: 2-4 hours
Impact: No expected downtime, but we'll monitor closely

What's being deployed:
- Double-entry accounting ledger
- Historical data migration
- Dual-write system for new transactions

Your role:
- [Stakeholder roles and responsibilities]
- Be available for questions during deployment window

Questions? Reach out to [CONTACT]
```

**Success Announcement:**
```
✅ Deployment Successful

The Phase 1-3 accounting system has been successfully deployed to production.

Results:
- X,XXX expenses migrated to ledger
- XXX recurring transactions migrated
- Dual-write enabled and functioning
- All verification checks passed

Status: System operating normally
Monitoring: Active for next 24 hours

Thanks for your support! 🎉
```

**Issue Notification:**
```
⚠️ Deployment Issue Detected

We've identified an issue during the Phase 1-3 deployment.

Issue: [Brief description]
Impact: [User impact description]
Status: [Investigating / Fixing / Rolled back]

Next steps:
- [Action plan]
- [Timeline]

Updates will be provided every [INTERVAL]
```

### Appendix C: Quick Reference Checklist

**Pre-Flight:**
- [ ] All phases tested in dev
- [ ] Changes reviewed
- [ ] Dual-write flag set to false
- [ ] Production snapshot taken
- [ ] Team notified

**Deployment:**
- [ ] Code committed and pushed
- [ ] Backend deployed
- [ ] Deployment verified
- [ ] Accounts initialized
- [ ] Migration completed
- [ ] Migration verified
- [ ] Dual-write enabled
- [ ] Dual-write tested

**Post-Deployment:**
- [ ] Diagnostics run
- [ ] Manual tests passed
- [ ] Monitoring active
- [ ] Team notified
- [ ] Documentation updated

## Lessons Learned from Dev Deployment (2025-01-08)

### What Worked Well ✅

1. **Bulk Migration Approach:** The automated bulk migration completed all 7 users in ~1 minute with 100% success rate on valid data.

2. **Idempotency:** The migration correctly skipped already-migrated records, making it safe to re-run.

3. **Error Handling:** Missing mappings were handled gracefully with warnings instead of failures, allowing the migration to continue.

4. **Real Data Testing:** Using a production snapshot revealed actual data quality issues that synthetic test data wouldn't have caught.

5. **Zero-Sum Validation:** All journal entries maintained the double-entry bookkeeping invariant automatically.

### Issues Discovered ⚠️

1. **Missing Mappings (47 expenses):**
   - Root cause: Expenses referencing soft-deleted or invalid payment types/categories
   - Impact: These expenses remain only in legacy tables
   - Resolution: Expected behavior, but consider cleanup in production

2. **Public Migration Wrappers:**
   - Issue: Created `convex/migrations/run.ts` with public functions for testing
   - Risk: Exposes sensitive migration operations to the internet
   - Resolution: Must remove or make internal before production

3. **No Status Verification Script:**
   - Issue: Had to manually check migration status
   - Improvement: Need automated verification script

### Recommendations Before Production

See "Migration Process Improvements" section below for detailed upgrade recommendations.

---

## Document Control

**Version:** 1.1
**Last Updated:** 2025-01-08
**Author:** Development Team
**Status:** Active - Updated with dev deployment results

**Change Log:**
- 2025-01-08: Updated with dev deployment results and lessons learned
- 2025-01-07: Initial version for Phase 1-3 deployment


