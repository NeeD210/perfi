# 🐞 Bugfix Triage Report: Card Statements Index Query Field Order Error

**Triage Specialist:** Triage Specialist
**Date of Report:** 2025-01-27
**Issue ID:** cardStatements-indexFieldOrder-001
**Priority:** HIGH (Production Hotfix)

## I. Issue Description and Reproduction

### Reported Bug:
```
Uncaught Error: [CONVEX Q(ledger/home:getHomeDashboard)] [Request ID: b91fc10fdab5c5a9] Server Error
Uncaught Error: Tried to query index card_statements.by_dueDate_status but the query didn't use the index fields in order.
Index fields: ["dueDate", "status", "_creationTime"]
Query fields: ["status", "dueDate"]
First incorrect field: "status"
```

The `getHomeDashboard` query fails when attempting to query `card_statements` using the `by_dueDate_status` index because the query fields are used in the wrong order.

### Steps to Reproduce:
1. Navigate to the Home dashboard page
2. The page fails to load with the above error in the browser console
3. The error occurs when `getHomeDashboard` query executes and attempts to fetch pending card statements

## II. Root Cause Analysis

### A. Core Diagnosis:
**Index Query Field Order Violation** - Convex requires that when using an index, query fields must be used in the exact order they are defined in the index. The query is attempting to use `status` before `dueDate`, but the index `by_dueDate_status` is defined with `dueDate` as the first field.

### B. Technical Root Cause:

**Failing File/Module:** 
- `convex/ledger/home.ts` (line 579-580) in the `getUpcomingObligations` function

**Root Cause Statement:** 
The query at line 579-580 uses the `by_dueDate_status` index but constructs the query incorrectly. While the code appears to call `q.gte("dueDate", now).eq("status", "pending")` which should be correct, Convex is detecting that the query fields are being used as `["status", "dueDate"]` instead of the required `["dueDate", "status"]`.

**Index Definition:**
```typescript
.index("by_dueDate_status", ["dueDate", "status"])
```

**Current Query (Incorrect):**
```typescript
const pendingStatements = await ctx.db
  .query("card_statements")
  .withIndex("by_dueDate_status", (q: any) =>
    q.gte("dueDate", now).eq("status", "pending")
  )
```

**Investigation Findings:**
- The index `by_dueDate_status` is correctly defined in `convex/schema.ts` (line 377) as `["dueDate", "status"]`
- Convex automatically includes `_creationTime` as a third field in indexes for ordering
- The error indicates Convex is detecting the query fields as `["status", "dueDate"]` despite the code appearing to use `dueDate` first
- This suggests the query builder may be interpreting the method calls in a different order, or there's a subtle issue with how the query is constructed
- The same pattern is used in `convex/ledger/cardStatements.ts` (line 299-300) which may also need verification

**Note:** In Convex, when using an index, you must query fields in the exact order they appear in the index definition. You cannot skip fields or use them out of order.

## III. Hotfix Requirements

### Technical Fix Requirements (Required Changes)

**Change 1:** Fix index query field order in `convex/ledger/home.ts`
- **Location:** `getUpcomingObligations` function, line 579-580
- **Current (Incorrect):** 
  ```typescript
  .withIndex("by_dueDate_status", (q: any) =>
    q.gte("dueDate", now).eq("status", "pending")
  )
  ```
- **Root Cause:** Convex is detecting the query fields as `["status", "dueDate"]` instead of the required `["dueDate", "status"]`. This may be due to how the query builder interprets method chaining when using range queries (`gte`) on the first field.
- **Required Fix:** Use the `by_user_status` index pattern (already successfully used in `getHomeDashboard` at line 329-340) and filter by `dueDate` in the filter clause:
  ```typescript
  const pendingStatements = await ctx.db
    .query("card_statements")
    .withIndex("by_user_status", (q: any) =>
      q.eq("userId", user._id).eq("status", "pending")
    )
    .filter((q: any) =>
      q.and(
        q.gte(q.field("dueDate"), now),
        q.lte(q.field("dueDate"), windowEnd)
      )
    )
    .take(10);
  ```
- **Rationale:** This approach uses an index that matches the query pattern (`userId` and `status` are both equality filters) and applies the `dueDate` range filter in the filter clause, which is a proven pattern already used elsewhere in the same file.

**Change 2:** Verify and fix similar query in `convex/ledger/cardStatements.ts` (if needed)
- **Location:** `getStatementsDueToday` function, line 299-300
- **Action:** Review the query to ensure it follows the same pattern and fix if necessary:
  ```typescript
  .withIndex("by_dueDate_status", (q) =>
    q.eq("dueDate", today).eq("status", "pending")
  )
  ```
- **Note:** This query uses `eq` for both fields, which should be correct, but verify it works as expected

**Note:** The `getHomeDashboard` function (line 329-340) already uses the correct pattern with `by_user_status` index. The `getUpcomingObligations` function should use the same pattern for consistency and correctness.

### Non-Functional Constraints
* **Code Style:** Must adhere to the rules defined in `planning/summary.md` and `.cursor/rules/convex_rules.mdc`
* **Scope:** Strictly limited to files necessary to implement the fix (`convex/ledger/home.ts` and potentially `convex/ledger/cardStatements.ts`)
* **Performance:** The fix should maintain or improve query performance. Using `by_user_status` index with a filter may be less efficient than using `by_dueDate_status` directly, but it's a valid workaround if the index order issue cannot be resolved

## IV. Validation Protocol

### Manual Validation Steps (Functional Test)
1. Navigate to the Home dashboard page
2. Verify the page loads without console errors
3. Verify that upcoming card statements appear in the "Upcoming Payments" section (if any exist)
4. Verify that the dashboard displays all expected data (net balance, monthly summary, top categories, upcoming obligations)
5. Test with a user account that has pending card statements with due dates in the next 30 days

### Technical Validation Checks
* **Check 1:** Verify `read-console-logs` shows no `Error` related to index field order when loading the Home dashboard
* **Check 2:** Verify `getHomeDashboard` query executes successfully and returns data without errors
* **Check 3:** Verify `getUpcomingObligations` query (if called separately) executes successfully
* **Check 4:** Verify network requests show successful `200` response codes for Convex queries
* **Check 5:** Verify that card statements are correctly filtered by `dueDate` range (between `now` and `windowEnd`)
* **Check 6:** Verify that only pending card statements are returned (status = "pending")
* **Check 7:** Verify that the query respects the `userId` filter to only return statements for the authenticated user

### Query Performance Validation
* Verify that the query completes in reasonable time (< 1 second as per performance targets)
* If using `by_user_status` index with filter, verify performance is acceptable (may be slightly slower than direct index use but should still be fast)
* Monitor Convex dashboard for query execution times and ensure no performance regressions

