# Monthly Rollups Verification Guide

## Overview

This guide provides step-by-step instructions to verify that the monthly rollups system was properly deployed to the development environment. The test validates rollup accuracy by comparing pre-calculated rollup values against manual calculations from source journal_lines data.

## Test Objective

Verify that 5 sample rollup records in the `monthly_rollups` table contain accurate aggregated data by manually calculating the same values from the `journal_lines` table and comparing results.

## Prerequisites

- Access to Convex development environment
- Convex dashboard or CLI access
- Understanding of the rollup system architecture
- Basic knowledge of journal_lines table structure

## Test Data Requirements

### Rollup Records to Test
Select 5 rollup records from `monthly_rollups` table with the following criteria:
- Different account types (expense, income, asset, liability)
- Different months (preferably recent months with transaction activity)
- Records with `transactionCount > 0` (to ensure meaningful data)
- Records with `lastUpdated` within the last 30 days

### Sample Selection Query
```sql
-- Use this query to identify good test candidates
SELECT 
  _id,
  userId,
  accountId,
  month,
  totalDebits,
  totalCredits,
  netAmount,
  transactionCount,
  lastUpdated,
  lastReconciled
FROM monthly_rollups 
WHERE transactionCount > 0 
  AND lastUpdated > (Date.now() - 30 * 24 * 60 * 60 * 1000)
ORDER BY lastUpdated DESC
LIMIT 10;
```

## Step-by-Step Verification Process

### Step 1: Identify Test Rollup Records

1. **Access Convex Dashboard**
   - Navigate to your development environment
   - Go to Data tab
   - Select `monthly_rollups` table

2. **Select 5 Test Records**
   - Choose records meeting the criteria above
   - Note down the following for each record:
     - `_id` (rollup ID)
     - `userId` (user ID)
     - `accountId` (account ID)
     - `month` (month timestamp)
     - `totalDebits` (rollup value)
     - `totalCredits` (rollup value)
     - `netAmount` (rollup value)
     - `transactionCount` (rollup value)

3. **Document Test Cases**
   - Create a test log with the 5 selected records
   - Include account descriptions for context

### Step 2: Calculate Month Boundaries

For each selected rollup record, calculate the month boundaries:

```javascript
// Convert month timestamp to Date object
const monthStart = new Date(rollup.month);
const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999);

// monthStart: First day of month 00:00:00 UTC
// monthEnd: Last day of month 23:59:59.999 UTC
```

### Step 3: Query Source Journal Lines

For each rollup record, query the corresponding journal_lines:

```sql
-- Query journal_lines for the specific account and month
SELECT 
  _id,
  journalEntryId,
  accountId,
  direction,
  amountBaseCurrency,
  currencyCode,
  entryDate
FROM journal_lines 
WHERE accountId = '<ACCOUNT_ID>'
  AND entryDate >= <MONTH_START_TIMESTAMP>
  AND entryDate <= <MONTH_END_TIMESTAMP>
ORDER BY entryDate;
```

### Step 4: Manual Calculation

For each rollup record, manually calculate:

1. **Total Debits**
   ```javascript
   let totalDebits = 0;
   journalLines.forEach(line => {
     if (line.direction === 'debit') {
       totalDebits += line.amountBaseCurrency;
     }
   });
   ```

2. **Total Credits**
   ```javascript
   let totalCredits = 0;
   journalLines.forEach(line => {
     if (line.direction === 'credit') {
       totalCredits += line.amountBaseCurrency;
     }
   });
   ```

3. **Net Amount**
   ```javascript
   const netAmount = totalCredits - totalDebits;
   ```

4. **Transaction Count**
   ```javascript
   const transactionCount = journalLines.length;
   ```

### Step 5: Compare Results

For each rollup record, compare:

| Field | Rollup Value | Manual Calculation | Match? | Difference |
|-------|--------------|-------------------|---------|------------|
| totalDebits | | | | |
| totalCredits | | | | |
| netAmount | | | | |
| transactionCount | | | | |

### Step 6: Validate Account Context

For each rollup record, verify:

1. **Account Exists and is Active**
   ```sql
   SELECT _id, description, accountType, softdelete
   FROM accounts 
   WHERE _id = '<ACCOUNT_ID>';
   ```

2. **Account Belongs to Correct User**
   ```sql
   SELECT _id, description, userId
   FROM accounts 
   WHERE _id = '<ACCOUNT_ID>' AND userId = '<USER_ID>';
   ```

3. **Account Type Consistency**
   - Verify account type matches expected debit/credit patterns
   - Expense accounts: typically debit transactions
   - Income accounts: typically credit transactions
   - Asset accounts: debit increases, credit decreases
   - Liability accounts: credit increases, debit decreases

## Expected Results

### Success Criteria
- **Perfect Match**: All 5 rollup records should match manual calculations exactly
- **Zero Tolerance**: Differences of 0.01% or less are acceptable (rounding errors)
- **Account Consistency**: All accounts should exist and belong to correct users
- **Transaction Count**: Should match exactly (no missing or extra transactions)

### Acceptable Variations
- **Rounding Differences**: ±1 minor unit (0.01 currency unit)
- **Timezone Edge Cases**: Transactions exactly at month boundaries
- **Soft-Deleted Transactions**: Should be excluded from rollup calculations

## Test Documentation Template

### Test Case 1: [Account Description] - [Month]
```
Rollup ID: _______________
Account ID: _______________
User ID: _______________
Month: _______________

Rollup Values:
- totalDebits: _______________
- totalCredits: _______________
- netAmount: _______________
- transactionCount: _______________

Manual Calculation:
- totalDebits: _______________
- totalCredits: _______________
- netAmount: _______________
- transactionCount: _______________

Result: ✅ PASS / ❌ FAIL
Notes: _______________
```

[Repeat for Test Cases 2-5]

## Troubleshooting Common Issues

### Issue 1: Transaction Count Mismatch
**Possible Causes:**
- Soft-deleted transactions included in rollup
- Transactions outside month boundaries
- Missing journal_lines due to data corruption

**Investigation Steps:**
1. Check for soft-deleted journal_lines
2. Verify month boundary calculations
3. Check for missing journal entries

### Issue 2: Amount Mismatch
**Possible Causes:**
- Currency conversion errors
- Rounding differences
- Missing transactions
- Incorrect debit/credit direction

**Investigation Steps:**
1. Verify currency conversion logic
2. Check for rounding errors
3. Validate transaction directions
4. Compare individual transaction amounts

### Issue 3: Missing Rollup Records
**Possible Causes:**
- Rollup creation failed
- Account not active
- No transactions in month
- Rollup deletion

**Investigation Steps:**
1. Check account status
2. Verify transaction existence
3. Check rollup creation logs
4. Verify user permissions

## Rollup System Health Checks

### Additional Verification Steps

1. **Check Rollup Freshness**
   ```sql
   SELECT 
     COUNT(*) as total_rollups,
     AVG(lastUpdated) as avg_last_updated,
     MIN(lastUpdated) as oldest_update,
     MAX(lastUpdated) as newest_update
   FROM monthly_rollups;
   ```

2. **Verify Reconciliation Status**
   ```sql
   SELECT 
     COUNT(*) as total_rollups,
     AVG(lastReconciled) as avg_last_reconciled,
     MIN(lastReconciled) as oldest_reconciliation,
     MAX(lastReconciled) as newest_reconciliation
   FROM monthly_rollups;
   ```

3. **Check for Stale Rollups**
   ```sql
   SELECT COUNT(*) as stale_rollups
   FROM monthly_rollups 
   WHERE lastUpdated < (Date.now() - 7 * 24 * 60 * 60 * 1000);
   ```

## Success Metrics

### Test Results Summary
- **Total Test Cases**: 5
- **Passed**: ___
- **Failed**: ___
- **Success Rate**: ___%

### Performance Validation
- **Rollup Query Time**: < 100ms
- **Manual Calculation Time**: < 500ms
- **Data Accuracy**: 100% match (within tolerance)

### System Health Indicators
- **Rollup Freshness**: All rollups updated within last 7 days
- **Reconciliation Status**: All rollups reconciled within last 24 hours
- **Account Coverage**: Rollups exist for all active accounts with transactions

## Conclusion

This verification test confirms that the monthly rollups system is:
1. **Accurate**: Rollup values match source data exactly
2. **Complete**: All transactions are properly aggregated
3. **Fresh**: Rollups are updated in real-time
4. **Reliable**: System maintains data consistency

A successful test indicates the rollup system is ready for production use and will provide the expected performance improvements for dashboard and budget calculations.

## Next Steps

After successful verification:
1. Document test results
2. Update deployment checklist
3. Proceed with production deployment
4. Monitor rollup performance in production
5. Set up automated rollup health monitoring

---

**Test Date**: _______________
**Tester**: _______________
**Environment**: Development
**Rollup System Version**: Phase 4.4
