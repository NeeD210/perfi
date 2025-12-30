# Testing Income Fix - Quick Guide

## Automated Test Results

✅ **All tests passing** - The fix has been verified with unit tests.

## Manual Testing Steps

### 1. Start the Development Server

```bash
npm run dev
```

This will start both the frontend and backend.

### 2. Verify in the UI

1. **Navigate to Home Dashboard**
   - Open the app in your browser
   - Log in if needed
   - You should see the Home page with Monthly Summary

2. **Check Income Display**
   - Look at the Monthly Summary component
   - **Income should show as a POSITIVE green value** (not negative/red)
   - The income bar should display correctly

3. **Verify Net Balance Calculation**
   - Net Balance = Total Income - Total Expenses
   - If you have income, net balance should be positive (or less negative)
   - Income should contribute positively to the net balance

### 3. Test with Real Data

If you have existing income transactions:

1. **Check Current Month Summary**
   - Income should appear as positive values
   - Net balance should be calculated correctly

2. **Create a Test Income Transaction** (if needed)
   - Add a new income transaction (e.g., $1000 salary)
   - Verify it appears as positive in the Monthly Summary
   - Check that net balance increases correctly

### 4. Verify in Convex Dashboard (Optional)

1. **Check Rollup Data**
   - Go to Convex Dashboard → Data → `monthly_rollups`
   - Find an income account rollup
   - Verify `totalCredits` is **negative** (correct accounting storage)
   - Verify `netAmount` is **negative** (correct accounting perspective)

2. **Check Query Results**
   - Go to Convex Dashboard → Functions
   - Run `ledger.monthlySummary.getMonthlySummary`
   - Verify `totalIncome` is **positive** (correct display value)
   - Verify `netBalance` = `totalIncome - totalExpenses`

## Expected Behavior

### Before Fix (Bug)
- ❌ Income displayed as negative values
- ❌ Net balance incorrectly calculated
- ❌ Income appeared in red/negative styling

### After Fix (Correct)
- ✅ Income displayed as positive values
- ✅ Net balance correctly calculated: `totalIncome - totalExpenses`
- ✅ Income appears in green/positive styling
- ✅ Underlying accounting data remains correct (negative credits in storage)

## Quick Verification Query

You can test the fix directly in Convex Dashboard:

```javascript
// Run this in Convex Dashboard → Functions → Run Function
// Function: ledger.monthlySummary.getMonthlySummary
// Args: {} (uses current month)

// Expected result:
{
  totalIncome: 15000,  // ✅ Positive (was negative before fix)
  totalExpenses: 10000,
  netBalance: 5000,    // ✅ Correct calculation
  dataSource: "rollups"
}
```

## Test Coverage

The fix has been tested in:
- ✅ `getMonthlySummary` (rollup path)
- ✅ `calculateMonthlySummaryDirect` (direct calculation fallback)
- ✅ `getHomeDashboard` (home page)
- ✅ `getMonthlySummaryWithStalenessCheck`
- ✅ `getMonthlyTrends`

All 5 locations now correctly use `Math.abs()` for income aggregation.

