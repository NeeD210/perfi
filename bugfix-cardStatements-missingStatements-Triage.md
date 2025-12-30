# 🐞 Bugfix Triage Report: Card Statements Not Calculated for All Credit Cards

**Triage Specialist:** Triage Specialist
**Date of Report:** 2025-01-27
**Issue ID:** cardStatements-missingStatements-001
**Priority:** HIGH (Data Integrity Issue)

## I. Issue Description and Reproduction

### Reported Bug:
Card statements are not being calculated for all credit cards. For example, accountId `ks7epnvgsb0qxer1bhw5ne4xd57s4c7x` didn't get a statement in December 2024.

### Steps to Reproduce:
1. Check card statements for a credit card account
2. Verify that statements are missing for certain months (e.g., December 2024)
3. Confirm the card exists and has valid metadata (closingDay, baseCurrency, createdAt)
4. Verify the card's closing day should have triggered statement calculation

## II. Root Cause Analysis

### A. Core Diagnosis:
**Scheduled Job Limitations and Filtering Issues** - The daily job `processClosingStatements` only processes cards on the day when their `closingDay` matches the current UTC date. Cards can miss statements if:
1. The job didn't run on the card's closing day
2. The card was filtered out due to missing required fields (`baseCurrency` or `createdAt`)
3. The job failed for that specific card (errors are logged but don't trigger retries)
4. The card was created after its closing day passed for that month

### B. Technical Root Cause:

**Failing File/Module:** 
- `convex/ledger/cardStatements.ts` - `getCardsWithClosingToday` function (line 246-279)
- `convex/ledger/cardStatements.ts` - `processClosingStatements` function (line 671-719)

**Root Cause Statement:** 
The `getCardsWithClosingToday` function filters out cards missing `baseCurrency` or `createdAt` fields (line 268), which prevents them from being processed. Additionally, the daily job only runs once per day and only processes cards whose `closingDay` matches the current UTC date. If a card's closing day is the 5th and the job didn't run on the 5th (or failed), that month's statement won't be created. There's no automatic retry mechanism for missed statements.

**Investigation Findings:**
- `getCardsWithClosingToday` filters cards with: `.filter(card => card.baseCurrency && card.createdAt)` (line 268)
- Cards missing these fields are silently excluded from processing
- The daily job uses `getStartOfDay(Date.now())` which means it only processes statements for "today"
- If the job fails for a specific card, it logs an error but doesn't retry
- There's no mechanism to detect and backfill missing statements automatically
- The backfill functions exist (`backfillCardStatementsForUser`, `backfillAllCardStatements`) but aren't automatically triggered

**Index Definition:**
```typescript
.index("by_closingDay", ["closingDay"])
```

**Current Query Pattern:**
```typescript
const cards = await ctx.db
  .query("cards")
  .withIndex("by_closingDay", (q) => q.eq("closingDay", todayDay))
  .filter((q) => q.eq(q.field("softdelete"), false))
  .collect();

return cards
  .filter(card => card.baseCurrency && card.createdAt) // Filters out cards missing required fields
  .map(card => ({...}));
```

## III. Hotfix Requirements

### Technical Fix Requirements (Required Changes)

**Change 1:** Improve error handling and logging in `getCardsWithClosingToday`
- **Location:** `convex/ledger/cardStatements.ts`, `getCardsWithClosingToday` function (line 246-279)
- **Current:** Cards missing `baseCurrency` or `createdAt` are silently filtered out
- **Required Fix:** Log warnings when cards are filtered out due to missing fields:
  ```typescript
  const cards = await ctx.db
    .query("cards")
    .withIndex("by_closingDay", (q) => q.eq("closingDay", todayDay))
    .filter((q) => q.eq(q.field("softdelete"), false))
    .collect();

  // Log cards that are filtered out
  const filteredOut = cards.filter(card => !card.baseCurrency || !card.createdAt);
  if (filteredOut.length > 0) {
    console.warn(`[Card Statement Processing] Filtered out ${filteredOut.length} cards missing required fields:`, 
      filteredOut.map(c => ({ accountId: c.accountId, missingBaseCurrency: !c.baseCurrency, missingCreatedAt: !c.createdAt }))
    );
  }

  return cards
    .filter(card => card.baseCurrency && card.createdAt)
    .map(card => ({...}));
  ```
- **Rationale:** Better visibility into why cards aren't being processed

**Change 2:** Add diagnostic query to investigate missing statements
- **Location:** `convex/diagnostics/cardStatementDiagnostics.ts` (NEW FILE - already created)
- **Action:** The diagnostic query `diagnoseCardStatements` has been created to help investigate specific accounts
- **Usage:** Can be called to check why a specific account didn't get statements for a given month

**Change 3:** Create manual backfill action for specific account/month
- **Location:** `convex/migrations/cardStatementsBackfill.ts` (or create new file)
- **Action:** Add a function to backfill statements for a specific account and month:
  ```typescript
  export const backfillStatementForAccount = internalAction({
    args: {
      accountId: v.id("accounts"),
      year: v.number(),
      month: v.number(), // 0-11
    },
    returns: v.object({
      success: v.boolean(),
      statementId: v.optional(v.id("card_statements")),
      error: v.optional(v.string()),
    }),
    handler: async (ctx, args) => {
      // Get card
      // Calculate closing date for the month
      // Call calculateStatement
      // Return result
    },
  });
  ```

**Change 4:** (Optional) Improve daily job to handle edge cases
- **Location:** `convex/ledger/cardStatements.ts`, `processClosingStatements` function
- **Action:** Consider adding logic to detect and log cards that should have been processed but weren't
- **Note:** This is a future improvement, not required for immediate fix

### Immediate Action Required

**For the specific account `ks7epnvgsb0qxer1bhw5ne4xd57s4c7x` missing December statement:**

1. **Run diagnostic query** to understand why:
   ```bash
   npx convex run diagnostics/cardStatementDiagnostics:diagnoseCardStatements '{"accountId": "ks7epnvgsb0qxer1bhw5ne4xd57s4c7x", "year": 2024, "month": 11}'
   ```

2. **If card is missing required fields**, fix them using existing migration:
   ```bash
   npx convex run migrations/fixCardData:fixAndBackfillStatements '{"userId": "USER_ID"}'
   ```

3. **Backfill the missing December statement**:
   - Use existing `backfillCardStatementsForUser` with appropriate date range
   - Or create and use `backfillStatementForAccount` for specific account/month

### Non-Functional Constraints
* **Code Style:** Must adhere to the rules defined in `planning/summary.md` and `.cursor/rules/convex_rules.mdc`
* **Scope:** Focus on diagnostic tools and backfill capabilities. The daily job logic itself is correct but has limitations that need to be addressed through backfill processes.
* **Backward Compatibility:** All changes should be additive (new functions, improved logging) and not break existing functionality.

## IV. Validation Protocol

### Manual Validation Steps (Functional Test)
1. Run diagnostic query for the specific account to identify the issue
2. If card is missing fields, fix them and verify card appears in `getCardsWithClosingToday` results
3. Backfill the missing December statement for the account
4. Verify the statement was created successfully
5. Check that the statement has correct periodStart, periodEnd, and totalAmount
6. Verify the statement appears in upcoming obligations queries

### Technical Validation Checks
* **Check 1:** Verify diagnostic query returns accurate information about the card's status
* **Check 2:** Verify cards with missing `baseCurrency` or `createdAt` are properly identified
* **Check 3:** Verify backfill successfully creates the missing statement
* **Check 4:** Verify the created statement has correct metadata (closingDate, periodStart, periodEnd)
* **Check 5:** Verify the statement totalAmount matches expected value from journal_lines
* **Check 6:** Check logs for any warnings about filtered cards
* **Check 7:** Verify the statement appears in `card_statements` table with correct status

### Data Verification
* Query `cards` table for the account and verify:
  - `baseCurrency` is set (not null/undefined)
  - `createdAt` is set (not null/undefined)
  - `closingDay` is valid (1-31)
  - `softdelete` is false
* Query `card_statements` table and verify:
  - Statement exists for December 2024 closing date
  - Statement has correct `periodStart` and `periodEnd`
  - Statement `totalAmount` is calculated correctly
  - Statement `status` is "pending" or "posted"

