# Production Deployment Status

**Date:** 2025-01-08  
**Production:** graceful-spaniel-507.convex.cloud  
**Dev:** majestic-squirrel-400.convex.cloud

---

## ✅ Completed Steps

- [x] **Step 1:** Code committed and pushed
- [x] **Step 2:** Backend deployed to production
- [x] **Step 3:** Deployment verified (graceful-spaniel-507)

---

## ⏳ Steps Requiring Dashboard Access

You need to complete these in the **Convex Dashboard**:

### **Step 4: Take Production Snapshot** 🔴 CRITICAL

**Dashboard:** https://dashboard.convex.dev  
**Deployment:** Production (graceful-spaniel-507)  
**Action:**
1. Data → Snapshots → Create Snapshot
2. Name: `pre-accounting-migration-2025-01-08-prod`
3. **Wait for completion**
4. Record snapshot ID: `______________________`

---

### **Step 5: Pre-Flight Check**

**Function:** `migrations/preflightCheck:runPreflightCheck`  
**Arguments:** `{}`

**Must see:** `"passed": true, "critical": 0`

---

### **Step 6: Run Migration** ⚡

**Function:** `internal.migrations.index:runBulkPhase2Migration`  
**Arguments:** `{}`  
**Duration:** ~1 minute

**Must see:** `"totalFailed": 0`

---

### **Step 7: Verify Migration**

**Function:** `migrations/verify:verifyMigrationIntegrity`  
**Arguments:** `{}`

**Must see:** `"passed": true`

---

### **Step 8: Enable Dual-Write**

**After all checks pass**, run this command locally:

```bash
# Update config
# Edit convex/ledger/dualWriteConfig.ts
# Change: LEDGER_DUAL_WRITE_ENABLED = false → true

# Then commit and deploy
git add convex/ledger/dualWriteConfig.ts
git commit -m "feat: Enable dual-write in production"
git push origin master
npx convex deploy
```

---

## Expected Results

Based on dev testing:
- Users: 7
- Accounts: ~173
- Journal Entries: ~352
- Migration Success: 100%
- Duration: ~1 minute

---

## ⚠️ If Issues Arise

**Rollback:**
1. Dashboard → Data → Snapshots
2. Restore: `pre-accounting-migration-2025-01-08-prod`

**Disable dual-write:**
```bash
# Edit: LEDGER_DUAL_WRITE_ENABLED = false
git add convex/ledger/dualWriteConfig.ts
git commit -m "hotfix: Disable dual-write"
npx convex deploy
```

---

**Current Status:** ⏸️ Waiting for dashboard steps 4-7

