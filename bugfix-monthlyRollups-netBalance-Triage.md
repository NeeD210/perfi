# 🐞 Bugfix Triage Report: Monthly Rollups netBalance Incorrectly Sums totalCredits and totalDebits

**Triage Specialist:** Triage Specialist
**Date of Report:** 2025-12-19
**Issue ID:** monthlyRollups-netBalance-001
**Priority:** HIGH (Production Hotfix)

## I. Issue Description and Reproduction

### Reported Bug:
The `monthlyRollups[netBalance]` calculation incorrectly sums `totalCredits` and `totalDebits`, causing income to appear as negative net balance instead of positive.

### Steps to Reproduce:
1. Navigate to the Home dashboard
2. View the Monthly Summary component
3. Observe that income accounts display with negative net balance values
4. Verify that income transactions have credits but netBalance shows negative values

## II. Root Cause Analysis

### A. Core Diagnosis:
**Display/UI Layer Issue** - In double-entry accounting, income accounts are credit-normal accounts where credits increase income. Credits are stored as negative `amountBaseCurrency` values (per zero-sum convention), so `netAmount = totalCredits - totalDebits` being negative for income accounts is **correct from an accounting perspective**. However, the UI aggregation layer incorrectly uses these negative `totalCredits` values directly when calculating `totalIncome` for display, resulting in negative income values being shown to users. The fix is to use `Math.abs()` when aggregating income for display purposes, while preserving the correct accounting representation in the underlying data.

### B. Technical Root Cause:

**Failing File/Module:** 
- Primary: `convex/ledger/rollups.ts` (line 235)
- Secondary: `convex/ledger/monthlySummary.ts` (lines 147-154)
- Display: `convex/ledger/home.ts` (lines 214-219, 386)

**Root Cause Statement:** 
The bug is in the **display/aggregation layer**, not the accounting storage. In double-entry accounting:
- Income accounts are credit-normal (credits increase income)
- Credits are stored as negative `amountBaseCurrency` values (per zero-sum convention in `convex/ledger/dualWriteUtils.ts` line 96)
- `netAmount = totalCredits - totalDebits` being negative for income accounts is **accounting-correct**

However, when aggregating income for UI display, the code incorrectly uses negative `totalCredits` directly:
```typescript
totalIncome += rollup.totalCredits;  // BUG: Adding negative values for display!
```

The `netAmount` field in rollups is correctly negative (accounting perspective), but for user-facing `totalIncome` calculations, we need to use `Math.abs(rollup.totalCredits)` to convert the accounting representation to a positive display value.

**Investigation Findings:**
- `createDoubleEntryLines` stores credits as: `amountBaseCurrency: -amountARS` (line 96)
- `calculateMonthlyRollup` sums these correctly: `totalCredits += line.amountBaseCurrency` (line 231), resulting in negative `totalCredits`
- `getMonthlySummary` incorrectly uses: `totalIncome += rollup.totalCredits` (line 148) - should use absolute value
- `getHomeDashboard` incorrectly uses: `totalIncome += rollup.totalCredits` (line 215) - should use absolute value
- `netBalance` calculation is correct: `totalIncome - totalExpenses` (lines 154, 386), but receives negative `totalIncome`

## III. Hotfix Requirements

### Technical Fix Requirements (Required Changes)

**Change 1:** Fix income aggregation in `convex/ledger/monthlySummary.ts` (rollup path)
- **Location:** `getMonthlySummary` function, line 148
- **Current:** `totalIncome += rollup.totalCredits;` (uses negative values)
- **Required Fix:** Use absolute value for display purposes (accounting data remains correctly negative):
  ```typescript
  if (account.accountType === "income") {
    totalIncome += Math.abs(rollup.totalCredits);
  }
  ```
- **Note:** The `netAmount` field in rollups correctly remains negative (accounting perspective), but UI display needs positive values.

**Change 1b:** Fix income aggregation in `convex/ledger/monthlySummary.ts` (direct calculation fallback)
- **Location:** `calculateMonthlySummaryDirect` function, line 244
- **Current:** `totalIncome += totalCredits;` (uses negative values)
- **Required Fix:** Use absolute value for display:
  ```typescript
  if (account.accountType === "income") {
    totalIncome += Math.abs(totalCredits);
  }
  ```

**Change 2:** Fix income aggregation in `convex/ledger/home.ts`
- **Location:** `getHomeDashboard` function, line 215
- **Current:** `totalIncome += rollup.totalCredits;` (uses negative values)
- **Required Fix:** Use absolute value for display purposes:
  ```typescript
  if (account.accountType === "income") {
    totalIncome += Math.abs(rollup.totalCredits);
  }
  ```

**Change 3:** Fix income aggregation in `convex/ledger/monthlySummary.ts` (getMonthlySummaryWithStalenessCheck)
- **Location:** `getMonthlySummaryWithStalenessCheck` function, line 372
- **Current:** `totalIncome += rollup.totalCredits;` (uses negative values)
- **Required Fix:** Use absolute value for display:
  ```typescript
  if (account.accountType === "income") {
    totalIncome += Math.abs(rollup.totalCredits);
  }
  ```

**Change 4:** Fix income aggregation in `convex/ledger/monthlySummary.ts` (getMonthlyTrends)
- **Location:** `getMonthlyTrends` function, line 576
- **Current:** `totalIncome += rollup.totalCredits;` (uses negative values)
- **Required Fix:** Use absolute value for display:
  ```typescript
  if (account.accountType === "income") {
    totalIncome += Math.abs(rollup.totalCredits);
  }
  ```

**Change 5:** Verify expense aggregation is correct (should remain unchanged)
- **Location:** All expense aggregation points
- **Current:** `totalExpenses += rollup.totalDebits;` (correct - debits are stored as positive for expense accounts)
- **Action Required:** No change needed for expenses

**Important Note:** The `netAmount` field in `monthly_rollups` table is **correctly negative** for income accounts from an accounting perspective. This fix only affects the UI display layer where we aggregate `totalIncome` for user-facing calculations. The underlying accounting data structure remains correct.

### Non-Functional Constraints
* **Code Style:** Must adhere to the rules defined in `planning/summary.md` and `.cursor/rules/convex_rules.mdc`
* **Scope:** Strictly limited to files necessary to implement the fix (likely `convex/ledger/rollups.ts`, potentially `convex/ledger/monthlySummary.ts` and `convex/ledger/home.ts`)
* **Backward Compatibility:** No data migration needed - the fix only affects display/aggregation logic, not stored rollup data. The `netAmount` field correctly remains negative for income accounts (accounting perspective).

## IV. Validation Protocol

### Manual Validation Steps (Functional Test)
1. Navigate to the Home dashboard
2. Verify that income accounts show positive values in the Monthly Summary component
3. Create a test income transaction (e.g., $1000 salary)
4. Verify that the netBalance calculation shows: `totalIncome - totalExpenses` with income as a positive value
5. Check that income appears in green/positive styling, not red/negative

### Technical Validation Checks
* **Check 1:** Verify `getMonthlySummary` query returns `totalIncome` as a **positive** number when income transactions exist (previously was negative)
* **Check 2:** Verify `getHomeDashboard` query returns `monthSummary.netChange` as `totalIncome - totalExpenses` with `totalIncome` as a **positive** value
* **Check 3:** Verify `getMonthlySummaryWithStalenessCheck` returns positive `totalIncome` values
* **Check 4:** Verify `getMonthlyTrends` returns positive `totalIncome` values for all months
* **Check 5:** Inspect database rollups to confirm `totalCredits` values are negative (as expected from storage convention) and that aggregation uses `Math.abs()` correctly
* **Check 6:** Verify no console errors or warnings related to negative income values
* **Check 7:** Manually verify that income transactions display as positive values in the Monthly Summary component

### Data Verification
* Query `monthly_rollups` table for income accounts and verify:
  - `totalCredits` < 0 for accounts with income (negative due to storage convention where credits are stored as negative)
  - `Math.abs(totalCredits)` represents the actual income amount
  - `netAmount` = `totalCredits - totalDebits` (will be negative for income accounts due to negative credits)
  - `totalDebits` values are typically 0 or small positive numbers (refunds/returns)

