# Phase 4.2: Budget System (Schema & Logic) PRD

## Introduction

This PRD covers the implementation of PerFi's core budget tracking system, building on the double-entry ledger foundation established in Phases 1-3. The budget system enables users to define spending limits with flexible scoping (single accounts, multiple accounts, or account types) and frequency-based periods (daily, weekly, monthly, quarterly, semestrally, yearly). This feature provides the foundation for users to proactively manage their expenses and stay within financial limits.

This implementation focuses exclusively on budget creation, scope management, and real-time execution calculation. Historical tracking and pre-aggregation optimizations are deferred to subsequent phases (4.3 and 4.4 respectively).

This is Phase 4.2 of the PerFi accounting core migration, representing a critical step in delivering user-facing financial planning features.

## Required Schema Changes

**PREREQUISITE:** The following schema modifications must be completed in `convex/schema.ts` **before** implementation begins:

### budgets Table Modifications

**Current State (convex/schema.ts lines 198-212):**
```typescript
budgets: defineTable({
  userId: v.id("users"),
  accountId: v.id("accounts"),  // ❌ Currently required
  amount: v.number(),
  frequency: frequencyValidator,
  nextDueDate: v.number(),
  endDate: v.optional(v.number()),
  creationTime: v.number(),
  softdelete: v.boolean(),
  deletedAt: v.optional(v.number()),
  scopeType: scopeTypeValidator,
  scopeRefs: v.optional(v.array(v.id("accounts"))),
})
  .index("by_user", ["userId"])
  .index("by_accountId", ["accountId"]),  // ❌ Needs updating
```

**Required Changes:**

1. **Make `accountId` optional** (required only for `singleAccount` scope):
   ```typescript
   accountId: v.optional(v.id("accounts")),
   ```

2. **Add `scopeAccountType` field** for `accountType` scope:
   ```typescript
   scopeAccountType: v.optional(v.union(v.literal("expense"), v.literal("income"))),
   ```

3. **Add missing indexes**:
   ```typescript
   .index("by_user_active", ["userId", "softdelete", "creationTime"])
   .index("by_nextDueDate", ["nextDueDate"])
   ```

4. **Update `by_accountId` index** to handle optional field:
   ```typescript
   .index("by_accountId", ["accountId"])  // Keep existing, will handle undefined
   ```

**Final budgets Table Schema:**
```typescript
budgets: defineTable({
  userId: v.id("users"),
  accountId: v.optional(v.id("accounts")),
  amount: v.number(),
  frequency: frequencyValidator,
  nextDueDate: v.number(),
  endDate: v.optional(v.number()),
  creationTime: v.number(),
  softdelete: v.boolean(),
  deletedAt: v.optional(v.number()),
  scopeType: scopeTypeValidator,
  scopeRefs: v.optional(v.array(v.id("accounts"))),
  scopeAccountType: v.optional(v.union(v.literal("expense"), v.literal("income"))),
})
  .index("by_user", ["userId"])
  .index("by_accountId", ["accountId"])
  .index("by_user_active", ["userId", "softdelete", "creationTime"])
  .index("by_nextDueDate", ["nextDueDate"]),
```

### accounts Table - Add Composite Index

**Add index for efficient account type filtering:**
```typescript
.index("by_user_type_active", ["userId", "accountType", "softdelete"])
```

This index optimizes the `accountType` scope query when retrieving all accounts of a specific type for budget execution.

### Validators - Verify Exports

**Ensure the following validators are exported from `convex/ledger/validators.ts`:**
- `frequencyValidator` ✅ (already exists, line 34-41)
- `scopeTypeValidator` ✅ (already exists, line 44-48)
- `accountTypeValidator` ✅ (already exists, line 5-11)

**Deployment Notes:**
- Schema changes are **backward compatible** (all new fields are optional)
- No data migration needed (budgets table currently empty in production)
- Deploy schema changes before deploying implementation code
- Verify schema changes in dev environment before production deployment

## Context & Background

### Current System
- Complete double-entry ledger system with `accounts`, `journal_entries`, and `journal_lines` tables (Phases 1-2)
- Historical transaction backfill complete with zero-sum validation (Phase 2)
- Dual-write synchronization between legacy and ledger tables operational (Phase 3)
- Transfer functionality for account-to-account movements implemented (Phase 4.1)
- `budgets` and `budget_lines` tables defined in schema but no implementation
- No current budget tracking capability for users
- Dashboard reads directly from `journal_lines` without budget context

### Target System
- Flexible budget system with three scope types:
  - **Single Account**: Budget for one specific account (e.g., groceries expense category)
  - **Multiple Accounts**: Budget for selected accounts (e.g., all food-related expenses)
  - **Account Type**: Budget for all accounts of a type (e.g., all expense accounts)
- Frequency-based period calculation supporting six intervals: daily, weekly, monthly, quarterly, semestrally, yearly
- No carryover between periods (each period resets to zero spent)
- Real-time budget execution calculation aggregating from `journal_lines`
- Budget scoping respects account hierarchy and direction (debit for expenses, credit for income)
- One-shot budgets with optional end dates for temporary spending limits

### Technology Stack
- **Backend**: Convex (TypeScript) with existing ledger infrastructure
- **Database**: Convex NoSQL with established `journal_entries`, `journal_lines`, `accounts` tables
- **Validation**: Convex `v` validators with existing enum definitions for `accountType` and new enums for budget `frequency` and `scopeType`
- **Queries**: Real-time aggregation from `journal_lines` with proper indexing

## User Stories

**US1:** *As a user, I want to set spending budgets for specific expense categories, so I can control my expenses and stay within my financial limits.*

**US2:** *As a user, I want to create budgets for multiple related accounts (e.g., all food expenses), so I can manage complex spending scenarios without creating separate budgets.*

**US3:** *As a user, I want to see my budget execution in real-time, so I know exactly how much I have left to spend in each category right now.*

**US4:** *As a user, I want budgets with different time periods (weekly groceries, monthly entertainment, yearly vacation), so I can match my budgets to my actual spending patterns.*

**US5:** *As a developer, I need budget calculations to be accurate and performant, so users get reliable feedback without system slowdowns.*

**US6:** *As a developer, I need comprehensive budget validation, so invalid budget configurations are prevented and users receive clear error messages.*

## Acceptance Criteria

### For US1 (Single Account Budget Creation):

**Budget Setup:**
- [ ] `createBudget` mutation accepts budget parameters and creates budget record
- [ ] Budget amount is positive integer in minor units (pesos for ARS, cents for USD)
- [ ] Budget frequency supports enum: `daily`, `weekly`, `monthly`, `quarterly`, `semestrally`, `yearly`
- [ ] Budget automatically calculates `nextDueDate` based on frequency and current date
- [ ] Budget can have optional `endDate` for one-shot budgets (e.g., holiday spending limit)
- [ ] Budget belongs to authenticated user (validated via `userId`)
- [ ] Budget starts active by default (`softdelete = false`)
- [ ] Single account budget requires valid `accountId` parameter

**Validation:**
- [ ] Amount must be positive integer (> 0)
- [ ] Frequency must be one of six valid enum values
- [ ] scopeType set to `"singleAccount"` for this use case
- [ ] accountId must reference existing account
- [ ] Account must belong to authenticated user
- [ ] Account must be active (`softdelete = false`)
- [ ] Account must be expense or income type (not asset/liability/equity)
- [ ] endDate must be after current date if provided

**Error Conditions:**
- [ ] Throws `ConvexError("INVALID_AMOUNT")` when amount <= 0
- [ ] Throws `ConvexError("ACCOUNT_NOT_FOUND")` when accountId invalid or inaccessible
- [ ] Throws `ConvexError("INVALID_ACCOUNT_TYPE")` when account is asset/liability/equity
- [ ] Throws `ConvexError("INVALID_FREQUENCY")` when frequency not in enum
- [ ] Throws `ConvexError("INVALID_END_DATE")` when endDate is in past

### For US2 (Multiple Accounts Budget Creation):

**Budget Setup:**
- [ ] Budget supports `scopeType = "multipleAccounts"`
- [ ] Budget requires `scopeRefs` array containing account IDs
- [ ] `scopeRefs` array must be non-empty (at least one account)
- [ ] All accounts in `scopeRefs` must exist and belong to user
- [ ] All accounts in `scopeRefs` must be same type (all expense or all income)
- [ ] Budget execution aggregates spending across all specified accounts

**Validation:**
- [ ] scopeRefs required when scopeType = "multipleAccounts"
- [ ] scopeRefs must be array of valid account IDs
- [ ] All referenced accounts validated individually
- [ ] All accounts must have same accountType
- [ ] All accounts must be active

**Error Conditions:**
- [ ] Throws `ConvexError("INVALID_SCOPE")` when scopeRefs empty or missing
- [ ] Throws `ConvexError("MIXED_ACCOUNT_TYPES")` when accounts have different types
- [ ] Throws `ConvexError("ACCOUNT_NOT_FOUND")` for any invalid account in array

**Example Use Case:**
```typescript
// Create "Food Budget" covering groceries, restaurants, and coffee
createBudget({
  scopeType: "multipleAccounts",
  scopeRefs: [groceriesId, restaurantsId, coffeeId],
  amount: 120000, // $120,000 ARS monthly food budget
  frequency: "monthly"
});
```

### For US3 (Real-Time Budget Execution Calculation):

**Execution Query:**
- [ ] `getBudgetExecution` query accepts budgetId
- [ ] Query calculates current period boundaries from frequency
- [ ] Query aggregates transactions from `journal_lines` within current period
- [ ] Query respects budget scope (single account, multiple accounts, or account type)
- [ ] Query handles expense accounts: sum debit lines (positive direction)
- [ ] Query handles income accounts: sum credit lines (negative direction, flipped for display)
- [ ] Query uses `journal_lines.entryDate` for period filtering (denormalized from entries)
- [ ] Query filters by `journal_lines.accountId` matching scope
- [ ] Query returns structured execution object

**Return Values:**
- [ ] `budgetAmount`: Budget limit in minor units
- [ ] `spentAmount`: Amount spent/earned in current period in minor units
- [ ] `remainingAmount`: `budgetAmount - spentAmount`
- [ ] `percentUsed`: `(spentAmount / budgetAmount) * 100`
- [ ] `periodStart`: Epoch milliseconds of current period start
- [ ] `periodEnd`: Epoch milliseconds of current period end
- [ ] `status`: `"under_budget"` | `"at_budget"` | `"over_budget"`

**Status Calculation:**
- [ ] `"under_budget"`: spentAmount < budgetAmount
- [ ] `"at_budget"`: spentAmount >= budgetAmount && spentAmount < budgetAmount * 1.05 (within 5%)
- [ ] `"over_budget"`: spentAmount >= budgetAmount * 1.05

**Performance:**
- [ ] Query completes in < 200ms for datasets with thousands of transactions
- [ ] Query uses proper indexes: `by_user_accountId_date` on journal_lines
- [ ] Query only scans current period data (not full history)

### For US4 (Frequency-Based Period Calculation):

**Period Boundaries:**
- [ ] Daily budgets: period = current day 00:00 UTC to 23:59:59 UTC
- [ ] Weekly budgets: period = current week Monday 00:00 to Sunday 23:59:59 UTC
- [ ] Monthly budgets: period = 1st of month 00:00 to last day 23:59:59 UTC
- [ ] Quarterly budgets: period = quarter start to end (Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec)
- [ ] Semestral budgets: period = semester start to end (H1: Jan-Jun, H2: Jul-Dec)
- [ ] Yearly budgets: period = Jan 1 00:00 to Dec 31 23:59:59 UTC

**Next Due Date Calculation:**
- [ ] `nextDueDate` calculated from creation date and frequency
- [ ] Daily: tomorrow 00:00 UTC
- [ ] Weekly: next Monday 00:00 UTC
- [ ] Monthly: 1st of next month 00:00 UTC
- [ ] Quarterly: 1st of next quarter 00:00 UTC
- [ ] Semestral: 1st of next semester (Jan 1 or Jul 1) 00:00 UTC
- [ ] Yearly: Jan 1 of next year 00:00 UTC

**Carryover Policy:**
- [ ] No carryover between periods (explicit requirement)
- [ ] Each period starts at zero spent
- [ ] Unused budget from previous period is NOT added to next period
- [ ] Budget execution calculation only considers current period transactions

**Mid-Period Budget Creation:**
- [ ] When budget created mid-period (e.g., on 15th of month), period boundaries align to standard period start (e.g., 1st of month)
- [ ] Budget execution includes all transactions from period start, not from creation date
- [ ] Example: Monthly budget created on Jan 15 includes transactions from Jan 1-31, not Jan 15-31
- [ ] Rationale: Consistent period boundaries simplify calculations and user understanding
- [ ] User sees spending from period start, enabling accurate budget assessment

**Edge Cases:**
- [ ] Weekly periods start on Monday (ISO 8601 standard)
- [ ] Months with different day counts handled correctly (28/29/30/31 days)
- [ ] Leap years handled for yearly budgets
- [ ] Timezone: all calculations use UTC

### For US5 (Account Type Scope):

**Budget Setup:**
- [ ] Budget supports `scopeType = "accountType"`
- [ ] Budget requires `scopeAccountType` parameter: `"expense"` or `"income"`
- [ ] Budget execution dynamically includes ALL accounts of specified type
- [ ] New accounts of the type automatically included in budget
- [ ] Deleted accounts (softdelete = true) excluded from budget execution

**Validation:**
- [ ] scopeAccountType required when scopeType = "accountType"
- [ ] scopeAccountType must be "expense" or "income" (not asset/liability/equity)
- [ ] At least one account of specified type must exist for user

**Dynamic Inclusion:**
- [ ] Budget execution queries all accounts with accountType = scopeAccountType
- [ ] Budget automatically picks up newly created accounts
- [ ] Budget excludes soft-deleted accounts

**Example Use Case:**
```typescript
// Create "Total Expenses" budget covering all expense accounts
createBudget({
  scopeType: "accountType",
  scopeAccountType: "expense",
  amount: 500000, // $500,000 ARS monthly total expenses
  frequency: "monthly"
});
```

### For US6 (Comprehensive Validation):

**Input Validation:**
- [ ] All required fields validated for presence
- [ ] Field types validated (string, number, enum, ID)
- [ ] String lengths validated (description max 500 chars)
- [ ] Numeric ranges validated (amount > 0)
- [ ] Enum values validated against allowed literals

**Business Rule Validation:**
- [ ] User authentication checked before any operation
- [ ] Account ownership validated for all referenced accounts
- [ ] Account existence validated before creating budget
- [ ] Account status validated (must be active)
- [ ] Account type validated (must be expense or income for budgets)
- [ ] Scope configuration validated for internal consistency

**Error Messages:**
- [ ] Clear, actionable error messages for all validation failures
- [ ] Error messages indicate which field failed validation
- [ ] Error messages suggest corrective action when applicable
- [ ] Errors use consistent format: `ConvexError(CODE, message)`

## Detailed Specifications

### budgets Table Schema

**Purpose**: Store budget definitions with flexible scoping and frequency

**Fields:**
```typescript
{
  id: v.id("budgets"),
  userId: v.id("users"), // Budget owner (multi-tenancy)
  accountId: v.optional(v.id("accounts")), // For singleAccount scope only
  amount: v.number(), // Budget limit in minor units (must be positive)
  frequency: v.union(
    v.literal("daily"),
    v.literal("weekly"),
    v.literal("monthly"),
    v.literal("quarterly"),
    v.literal("semestrally"),
    v.literal("yearly")
  ),
  nextDueDate: v.number(), // Epoch ms of next period start (auto-calculated)
  endDate: v.optional(v.number()), // Epoch ms for one-shot budgets (optional)
  creationTime: v.number(), // Epoch milliseconds when budget created
  softdelete: v.boolean(), // False = active, true = deleted
  deletedAt: v.optional(v.number()), // Epoch ms when soft-deleted (required if softdelete = true)
  scopeType: v.union(
    v.literal("singleAccount"),
    v.literal("multipleAccounts"),
    v.literal("accountType")
  ),
  scopeRefs: v.optional(v.array(v.id("accounts"))), // For multipleAccounts scope (required if scopeType = multipleAccounts)
  scopeAccountType: v.optional(v.string()), // "expense" or "income" for accountType scope (required if scopeType = accountType)
}
```

**Indexes:**
- `by_user`: Query all budgets for a user, sorted by creation time
  - Fields: `(userId, creationTime desc)`
  - Usage: List user's budgets on dashboard
- `by_user_active`: Filter active budgets (exclude soft-deleted)
  - Fields: `(userId, softdelete, creationTime desc)`
  - Usage: Show only active budgets in UI
- `by_nextDueDate`: Find budgets due for period rollover (future use in Phase 4.3)
  - Fields: `(nextDueDate asc)`
  - Usage: Background job to create budget_lines at period end

**Business Rules:**
- `amount` must be positive integer (validated on creation and update)
- `nextDueDate` auto-calculated based on `frequency` and creation date
- `scopeType` determines which scope fields are required:
  - `singleAccount`: requires `accountId`
  - `multipleAccounts`: requires `scopeRefs` array
  - `accountType`: requires `scopeAccountType`
- No carryover between periods (explicit design decision)
- Soft-deleted budgets preserve data but excluded from active queries
- Budget can have `endDate` for temporary budgets (e.g., vacation spending limit ending after trip)
- **Soft-Deleted Account Handling**: When an account referenced in a budget scope is soft-deleted:
  - Budget remains active and is NOT automatically deleted
  - Budget execution excludes soft-deleted accounts from aggregation
  - For `singleAccount` scope: execution returns zero spent if account deleted (budget effectively inactive)
  - For `multipleAccounts` scope: execution aggregates only active accounts, excludes deleted ones
  - For `accountType` scope: execution dynamically excludes soft-deleted accounts via `softdelete = false` filter
  - UI should show warning: "Budget includes deleted accounts" when applicable
  - User can update budget scope to remove deleted accounts or delete the budget entirely

**Validation Rules:**
- If `scopeType = "singleAccount"`: `accountId` required, `scopeRefs` and `scopeAccountType` must be undefined
- If `scopeType = "multipleAccounts"`: `scopeRefs` required and non-empty, `accountId` and `scopeAccountType` must be undefined
- If `scopeType = "accountType"`: `scopeAccountType` required, `accountId` and `scopeRefs` must be undefined
- If `softdelete = true`: `deletedAt` required
- If `softdelete = false`: `deletedAt` must be undefined

### createBudget Mutation

**Purpose**: Creates a new budget with comprehensive validation

**Input Validator:**
```typescript
{
  scopeType: v.union(
    v.literal("singleAccount"),
    v.literal("multipleAccounts"),
    v.literal("accountType")
  ),
  amount: v.number(), // Budget limit in minor units
  frequency: v.union(
    v.literal("daily"),
    v.literal("weekly"),
    v.literal("monthly"),
    v.literal("quarterly"),
    v.literal("semestrally"),
    v.literal("yearly")
  ),
  accountId: v.optional(v.id("accounts")), // Required for singleAccount
  scopeRefs: v.optional(v.array(v.id("accounts"))), // Required for multipleAccounts
  scopeAccountType: v.optional(v.string()), // Required for accountType ("expense" or "income")
  endDate: v.optional(v.number()), // Optional epoch ms for one-shot budgets
  description: v.optional(v.string()), // Optional budget description (validated max 500 chars in handler)
}
```

**Output:**
```typescript
{
  budgetId: Id<"budgets">,
  status: "success",
}
```

**Business Logic Flow:**
```typescript
async function createBudget(ctx, args) {
  // 1. Authenticate user
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("UNAUTHORIZED", "User not authenticated");
  const user = await getUserByAuth0Id(ctx, identity.subject);
  
  // 2. Validate amount
  if (args.amount <= 0) {
    throw new ConvexError("INVALID_AMOUNT", "Budget amount must be positive");
  }
  
  // 2b. Validate description length if provided
  if (args.description && args.description.length > 500) {
    throw new ConvexError("INVALID_DESCRIPTION", "Description must be 500 characters or less");
  }
  
  // 3. Validate scope configuration based on scopeType
  if (args.scopeType === "singleAccount") {
    if (!args.accountId) {
      throw new ConvexError("INVALID_SCOPE", "accountId required for singleAccount scope");
    }
    // Validate account exists, belongs to user, is active, is expense/income type
    const account = await ctx.db.get(args.accountId);
    if (!account || account.userId !== user._id) {
      throw new ConvexError("ACCOUNT_NOT_FOUND", "Account not found or access denied");
    }
    if (account.softdelete) {
      throw new ConvexError("ACCOUNT_DELETED", "Cannot create budget for deleted account");
    }
    if (!["expense", "income"].includes(account.accountType)) {
      throw new ConvexError("INVALID_ACCOUNT_TYPE", "Budget accounts must be expense or income type");
    }
  } else if (args.scopeType === "multipleAccounts") {
    if (!args.scopeRefs || args.scopeRefs.length === 0) {
      throw new ConvexError("INVALID_SCOPE", "scopeRefs array required for multipleAccounts scope");
    }
    // Validate all accounts exist, belong to user, same type, active
    const accounts = await Promise.all(
      args.scopeRefs.map(id => ctx.db.get(id))
    );
    const firstAccountType = accounts[0]?.accountType;
    for (const account of accounts) {
      if (!account || account.userId !== user._id) {
        throw new ConvexError("ACCOUNT_NOT_FOUND", "One or more accounts not found or access denied");
      }
      if (account.softdelete) {
        throw new ConvexError("ACCOUNT_DELETED", "Cannot create budget with deleted accounts");
      }
      if (!["expense", "income"].includes(account.accountType)) {
        throw new ConvexError("INVALID_ACCOUNT_TYPE", "Budget accounts must be expense or income type");
      }
      if (account.accountType !== firstAccountType) {
        throw new ConvexError("MIXED_ACCOUNT_TYPES", "All accounts in budget must have same type");
      }
    }
  } else if (args.scopeType === "accountType") {
    if (!args.scopeAccountType) {
      throw new ConvexError("INVALID_SCOPE", "scopeAccountType required for accountType scope");
    }
    if (!["expense", "income"].includes(args.scopeAccountType)) {
      throw new ConvexError("INVALID_SCOPE", "scopeAccountType must be 'expense' or 'income'");
    }
    // Verify at least one account of this type exists
    const accountsOfType = await ctx.db
      .query("accounts")
      .withIndex("by_user_type", q => 
        q.eq("userId", user._id).eq("accountType", args.scopeAccountType)
      )
      .filter(q => q.eq(q.field("softdelete"), false))
      .first();
    if (!accountsOfType) {
      throw new ConvexError("NO_ACCOUNTS", `No ${args.scopeAccountType} accounts found`);
    }
  }
  
  // 4. Validate endDate if provided
  if (args.endDate && args.endDate <= Date.now()) {
    throw new ConvexError("INVALID_END_DATE", "endDate must be in the future");
  }
  
  // 5. Calculate nextDueDate from frequency
  const nextDueDate = calculateNextDueDate(Date.now(), args.frequency);
  
  // 6. Insert budget record
  const budgetId = await ctx.db.insert("budgets", {
    userId: user._id,
    accountId: args.accountId,
    amount: args.amount,
    frequency: args.frequency,
    nextDueDate,
    endDate: args.endDate,
    creationTime: Date.now(),
    softdelete: false,
    scopeType: args.scopeType,
    scopeRefs: args.scopeRefs,
    scopeAccountType: args.scopeAccountType,
  });
  
  // 7. Return success
  return { budgetId, status: "success" };
}
```

**Error Conditions:**
- `UNAUTHORIZED`: User not authenticated
- `INVALID_AMOUNT`: Amount not positive integer
- `INVALID_DESCRIPTION`: Description exceeds 500 characters
- `INVALID_SCOPE`: Scope configuration invalid for scopeType
- `ACCOUNT_NOT_FOUND`: Account reference invalid or inaccessible
- `ACCOUNT_DELETED`: Account is soft-deleted
- `INVALID_ACCOUNT_TYPE`: Account type not expense or income
- `MIXED_ACCOUNT_TYPES`: Multiple accounts have different types
- `NO_ACCOUNTS`: No accounts exist for accountType scope
- `INVALID_END_DATE`: endDate is in past

### getBudgetExecution Query

**Purpose**: Calculate real-time budget execution from journal lines

**Input Validator:**
```typescript
{
  budgetId: v.id("budgets"),
}
```

**Output:**
```typescript
{
  budgetId: Id<"budgets">,
  budgetAmount: number, // Budget limit in minor units
  spentAmount: number, // Amount spent in current period in minor units
  remainingAmount: number, // budgetAmount - spentAmount (can be negative)
  percentUsed: number, // (spentAmount / budgetAmount) * 100 (capped at 999 if extreme)
  periodStart: number, // Epoch ms of current period start
  periodEnd: number, // Epoch ms of current period end
  status: "under_budget" | "at_budget" | "over_budget",
  accounts: Array<{ // Breakdown by account (useful for multipleAccounts scope)
    accountId: Id<"accounts">,
    accountDescription: string,
    spentAmount: number,
  }>,
}
```

**Business Logic Flow:**
```typescript
async function getBudgetExecution(ctx, args) {
  // 1. Authenticate user
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("UNAUTHORIZED");
  const user = await getUserByAuth0Id(ctx, identity.subject);
  
  // 2. Retrieve budget
  const budget = await ctx.db.get(args.budgetId);
  if (!budget || budget.userId !== user._id) {
    throw new ConvexError("BUDGET_NOT_FOUND");
  }
  if (budget.softdelete) {
    throw new ConvexError("BUDGET_DELETED");
  }
  
  // 3. Calculate current period boundaries
  const { periodStart, periodEnd } = calculatePeriodBoundaries(
    budget.frequency,
    Date.now()
  );
  
  // 4. Determine accounts in scope (exclude soft-deleted accounts)
  let accountIds: Id<"accounts">[];
  if (budget.scopeType === "singleAccount") {
    // For single account, verify account exists and is active
    const account = await ctx.db.get(budget.accountId!);
    if (!account || account.softdelete) {
      // Account deleted: return zero execution (budget effectively inactive)
      accountIds = [];
    } else {
      accountIds = [budget.accountId!];
    }
  } else if (budget.scopeType === "multipleAccounts") {
    // For multiple accounts, filter out soft-deleted accounts
    const accountPromises = budget.scopeRefs!.map(id => ctx.db.get(id));
    const accounts = await Promise.all(accountPromises);
    accountIds = accounts
      .filter(a => a && !a.softdelete)
      .map(a => a!._id);
  } else if (budget.scopeType === "accountType") {
    // Query all active accounts of specified type for user
    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_user_type_active", q =>
        q.eq("userId", user._id)
         .eq("accountType", budget.scopeAccountType)
         .eq("softdelete", false)
      )
      .collect();
    accountIds = accounts.map(a => a._id);
  }
  
  // 5. Aggregate journal_lines for accounts in period
  let spentAmount = 0;
  const accountBreakdown = [];
  
  for (const accountId of accountIds) {
    const account = await ctx.db.get(accountId);
    if (!account || account.softdelete) continue;
    
    // Query journal_lines for this account in period
    const lines = await ctx.db
      .query("journal_lines")
      .withIndex("by_accountId_date", q =>
        q.eq("accountId", accountId)
         .gte("entryDate", periodStart)
         .lte("entryDate", periodEnd)
      )
      .collect();
    
    // Sum amounts based on account type and direction
    let accountSpent = 0;
    for (const line of lines) {
      if (account.accountType === "expense" && line.direction === "debit") {
        // Expense account: debits increase spending (positive amount)
        accountSpent += line.amountBaseCurrency;
      } else if (account.accountType === "income" && line.direction === "credit") {
        // Income account: credits increase earning (stored as positive in amountBaseCurrency)
        // Budget tracks "how much income earned" as positive value
        accountSpent += line.amountBaseCurrency;
      }
    }
    
    spentAmount += accountSpent;
    accountBreakdown.push({
      accountId: account._id,
      accountDescription: account.description,
      spentAmount: accountSpent,
    });
  }
  
  // 6. Calculate derived values
  const remainingAmount = budget.amount - spentAmount;
  const percentUsed = (spentAmount / budget.amount) * 100;
  
  // 7. Determine status
  let status: "under_budget" | "at_budget" | "over_budget";
  if (spentAmount < budget.amount) {
    status = "under_budget";
  } else if (spentAmount >= budget.amount && spentAmount < budget.amount * 1.05) {
    status = "at_budget";
  } else {
    status = "over_budget";
  }
  
  // 8. Return execution summary
  return {
    budgetId: budget._id,
    budgetAmount: budget.amount,
    spentAmount,
    remainingAmount,
    percentUsed: Math.min(percentUsed, 999), // Cap at 999% for display
    periodStart,
    periodEnd,
    status,
    accounts: accountBreakdown,
  };
}
```

**Performance Optimization:**
- Use `by_accountId_date` index on `journal_lines` for efficient period queries
- Filter by `entryDate` (denormalized from entry) to avoid joins
- **Critical**: For accountType and multipleAccounts scopes, parallelize journal_lines queries using `Promise.all()` instead of sequential loop
- Example parallelization pattern:
  ```typescript
  const linePromises = accountIds.map(accountId => 
    ctx.db.query("journal_lines")
      .withIndex("by_accountId_date", q => 
        q.eq("accountId", accountId)
         .gte("entryDate", periodStart)
         .lte("entryDate", periodEnd)
      )
      .collect()
  );
  const linesArrays = await Promise.all(linePromises);
  ```
- Implement query timeout (5 seconds) for accountType scope with many accounts (>50)
- Consider pagination if total lines exceed 50K across all accounts

### Period Calculation Utilities

**Purpose**: Centralized period boundary calculation for all frequencies

**calculatePeriodBoundaries Function:**
```typescript
interface PeriodBoundaries {
  periodStart: number; // Epoch ms (inclusive)
  periodEnd: number; // Epoch ms (inclusive)
}

function calculatePeriodBoundaries(
  frequency: Frequency,
  referenceDate: number = Date.now()
): PeriodBoundaries {
  const date = new Date(referenceDate);
  date.setUTCHours(0, 0, 0, 0); // Start of day in UTC
  
  switch (frequency) {
    case "daily":
      const periodStart = date.getTime();
      const periodEnd = date.getTime() + (24 * 60 * 60 * 1000) - 1; // End of day
      return { periodStart, periodEnd };
      
    case "weekly":
      // Week starts on Monday (ISO 8601)
      const dayOfWeek = date.getUTCDay();
      const daysToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek); // Sunday = 0
      const weekStart = new Date(date);
      weekStart.setUTCDate(date.getUTCDate() + daysToMonday);
      weekStart.setUTCHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
      weekEnd.setUTCHours(23, 59, 59, 999);
      return { periodStart: weekStart.getTime(), periodEnd: weekEnd.getTime() };
      
    case "monthly":
      const monthStart = new Date(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0);
      const monthEnd = new Date(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999);
      return { periodStart: monthStart.getTime(), periodEnd: monthEnd.getTime() };
      
    case "quarterly":
      const quarter = Math.floor(date.getUTCMonth() / 3);
      const quarterStartMonth = quarter * 3;
      const quarterStart = new Date(date.getUTCFullYear(), quarterStartMonth, 1, 0, 0, 0, 0);
      const quarterEnd = new Date(date.getUTCFullYear(), quarterStartMonth + 3, 0, 23, 59, 59, 999);
      return { periodStart: quarterStart.getTime(), periodEnd: quarterEnd.getTime() };
      
    case "semestrally":
      const semester = date.getUTCMonth() < 6 ? 0 : 1;
      const semesterStartMonth = semester * 6;
      const semesterStart = new Date(date.getUTCFullYear(), semesterStartMonth, 1, 0, 0, 0, 0);
      const semesterEnd = new Date(date.getUTCFullYear(), semesterStartMonth + 6, 0, 23, 59, 59, 999);
      return { periodStart: semesterStart.getTime(), periodEnd: semesterEnd.getTime() };
      
    case "yearly":
      const yearStart = new Date(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0);
      const yearEnd = new Date(date.getUTCFullYear(), 11, 31, 23, 59, 59, 999);
      return { periodStart: yearStart.getTime(), periodEnd: yearEnd.getTime() };
      
    default:
      throw new Error(`Unknown frequency: ${frequency}`);
  }
}
```

**calculateNextDueDate Function:**
```typescript
function calculateNextDueDate(
  currentDate: number,
  frequency: Frequency
): number {
  const date = new Date(currentDate);
  
  switch (frequency) {
    case "daily":
      date.setUTCDate(date.getUTCDate() + 1);
      date.setUTCHours(0, 0, 0, 0);
      return date.getTime();
      
    case "weekly":
      // Next Monday
      const daysUntilNextMonday = (8 - date.getUTCDay()) % 7 || 7;
      date.setUTCDate(date.getUTCDate() + daysUntilNextMonday);
      date.setUTCHours(0, 0, 0, 0);
      return date.getTime();
      
    case "monthly":
      date.setUTCMonth(date.getUTCMonth() + 1);
      date.setUTCDate(1);
      date.setUTCHours(0, 0, 0, 0);
      return date.getTime();
      
    case "quarterly":
      const nextQuarterMonth = Math.floor(date.getUTCMonth() / 3) * 3 + 3;
      if (nextQuarterMonth >= 12) {
        date.setUTCFullYear(date.getUTCFullYear() + 1);
        date.setUTCMonth(0);
      } else {
        date.setUTCMonth(nextQuarterMonth);
      }
      date.setUTCDate(1);
      date.setUTCHours(0, 0, 0, 0);
      return date.getTime();
      
    case "semestrally":
      const nextSemesterMonth = date.getUTCMonth() < 6 ? 6 : 0;
      if (nextSemesterMonth === 0) {
        date.setUTCFullYear(date.getUTCFullYear() + 1);
      }
      date.setUTCMonth(nextSemesterMonth);
      date.setUTCDate(1);
      date.setUTCHours(0, 0, 0, 0);
      return date.getTime();
      
    case "yearly":
      date.setUTCFullYear(date.getUTCFullYear() + 1);
      date.setUTCMonth(0);
      date.setUTCDate(1);
      date.setUTCHours(0, 0, 0, 0);
      return date.getTime();
      
    default:
      throw new Error(`Unknown frequency: ${frequency}`);
  }
}
```

### listBudgets Query

**Purpose**: Retrieve all budgets for a user with filtering

**Input Validator:**
```typescript
{
  includeDeleted: v.optional(v.boolean()), // Include soft-deleted budgets (default: false)
}
```

**Output:**
```typescript
Array<{
  id: Id<"budgets">,
  amount: number,
  frequency: Frequency,
  scopeType: ScopeType,
  scopeDescription: string, // Human-readable scope (e.g., "Groceries", "Food (3 accounts)", "All Expenses")
  currentExecution: {
    spentAmount: number,
    remainingAmount: number,
    percentUsed: number,
    status: "under_budget" | "at_budget" | "over_budget",
  },
  creationTime: number,
  endDate?: number,
}>
```

**Business Logic:**
- Query budgets by user
- Filter by softdelete status based on includeDeleted parameter
- For each budget, call getBudgetExecution to get current status
- Format scope description based on scopeType
- Sort by creation time descending (newest first)

### updateBudget Mutation

**Purpose**: Update existing budget configuration

**Input Validator:**
```typescript
{
  budgetId: v.id("budgets"),
  amount: v.optional(v.number()), // New budget limit
  frequency: v.optional(Frequency), // New frequency (recalculates nextDueDate)
  endDate: v.optional(v.number()), // New or updated endDate
  // Note: Cannot change scope (scopeType, accountId, scopeRefs, scopeAccountType)
}
```

**Output:**
```typescript
{
  budgetId: Id<"budgets">,
  status: "success",
}
```

**Business Logic:**
- Validate user owns budget
- Validate new values (amount > 0, endDate in future)
- If frequency changed, recalculate nextDueDate
- Update budget record
- Cannot change scope configuration (must delete and recreate)

### deleteBudget Mutation

**Purpose**: Soft-delete a budget (preserves historical data)

**Input Validator:**
```typescript
{
  budgetId: v.id("budgets"),
}
```

**Output:**
```typescript
{
  budgetId: Id<"budgets">,
  status: "success",
}
```

**Business Logic:**
- Validate user owns budget
- Set softdelete = true
- Set deletedAt = Date.now()
- Budget excluded from active queries but data preserved

## Technical Implementation Details

### File Structure

**Budget System Implementation:**
```
convex/
  ledger/
    budgets.ts          # Budget CRUD mutations (createBudget, updateBudget, deleteBudget)
    budgetExecution.ts  # Execution calculation queries (getBudgetExecution, listBudgets)
    budgetUtils.ts      # Period calculation utilities (calculatePeriodBoundaries, calculateNextDueDate)
    validators.ts       # Shared validators for budget types
```

**Schema Updates:**
- Budget tables already defined in `convex/schema.ts` (Phase 1)
- No schema changes required
- Add indexes if not present: `by_user`, `by_user_active`, `by_nextDueDate`

### Integration Points

**Account Management:**
- Query `accounts` table for scope resolution
- Validate account ownership via `userId`
- Filter by account status (`softdelete = false`)
- Respect account type for budget eligibility (expense/income only)

**Journal System:**
- Read `journal_lines` for budget execution calculation
- Use `by_accountId_date` index for efficient period queries
- Filter by `entryDate` within period boundaries
- Aggregate `amountBaseCurrency` by account and direction
- Handle expense accounts (sum debits) and income accounts (sum credits)

**UI Components:**
- Budget creation form in Add Transaction drawer (3rd tab)
- Budget overview card on Home dashboard
- Budget detail view showing execution and history (Phase 4.3)
- Budget list screen in Plan tab

### Type Definitions

**Enumerations:**
```typescript
type Frequency = "daily" | "weekly" | "monthly" | "quarterly" | "semestrally" | "yearly";
type ScopeType = "singleAccount" | "multipleAccounts" | "accountType";
type BudgetStatus = "under_budget" | "at_budget" | "over_budget";
```

**Validators:**
```typescript
import { v } from "convex/values";

export const frequencyValidator = v.union(
  v.literal("daily"),
  v.literal("weekly"),
  v.literal("monthly"),
  v.literal("quarterly"),
  v.literal("semestrally"),
  v.literal("yearly")
);

export const scopeTypeValidator = v.union(
  v.literal("singleAccount"),
  v.literal("multipleAccounts"),
  v.literal("accountType")
);

export const budgetStatusValidator = v.union(
  v.literal("under_budget"),
  v.literal("at_budget"),
  v.literal("over_budget")
);
```

### Testing Requirements

**Unit Tests:**
- Budget creation with all scope types (singleAccount, multipleAccounts, accountType)
- Budget validation for invalid inputs (amount, frequency, scope)
- Period boundary calculation for all frequencies
- Next due date calculation for all frequencies
- Budget execution calculation with various account types and directions
- Budget execution aggregation accuracy

**Integration Tests:**
- Budget creation end-to-end with database persistence
- Budget execution with real journal_lines data
- Multi-account scope aggregation across multiple accounts
- Account type scope dynamic inclusion of new accounts
- Budget soft-delete and reactivation workflows

**Edge Case Boundary Testing:**

The following boundary conditions must be tested systematically to ensure correctness:

1. **Temporal Boundaries:**
   - **Period transitions**: Test budget execution immediately before, at, and after period boundaries (23:59:59, 00:00:00, 00:00:01)
   - **Week boundaries**: Test weekly budgets created on each day of week (Sunday=0 through Saturday=6), verify Monday start
   - **Month boundaries**: Test monthly budgets for all month lengths (28, 29, 30, 31 days)
   - **Quarter boundaries**: Test Q1→Q2, Q2→Q3, Q3→Q4, Q4→Q1 transitions
   - **Year boundaries**: Test Dec 31 → Jan 1 transitions, verify yearly budget period reset
   - **Leap year boundaries**: Test Feb 28→Feb 29 (leap year) and Feb 28→Mar 1 (non-leap year)

2. **Mid-Period Budget Creation:**
   - Budget created on day 1 of period (includes full period)
   - Budget created mid-period (day 15 of month)
   - Budget created on last day of period
   - Verify period boundaries always align to standard period start (e.g., 1st of month), not creation date

3. **Numeric Boundaries:**
   - **Amount validation**: Test amount = 0 (invalid), amount = 1 (minimum valid), amount = MAX_SAFE_INTEGER
   - **Zero spending**: Budget with no transactions in period (spentAmount = 0)
   - **Exact budget match**: spentAmount exactly equals budgetAmount
   - **Budget overrun**: spentAmount > budgetAmount by 1 unit, by 5%, by 100%
   - **Negative amounts**: Verify rejection of negative budget amounts
   - **Large numbers**: Test budgets with amounts > 1 billion (common for ARS)

4. **Scope Boundaries:**
   - **Single account**: 1 account (valid), 0 accounts (invalid)
   - **Multiple accounts**: 1 account (edge case, prefer singleAccount), 2 accounts, 50 accounts, 100 accounts
   - **Account type scope**: 0 accounts of type (invalid), 1 account, 50 accounts, verify dynamic inclusion
   - **Mixed account ownership**: Verify rejection when user tries to include accounts they don't own
   - **Soft-deleted accounts**: Verify exclusion from budget execution after account soft-delete

5. **Frequency Boundaries:**
   - Test each frequency (daily, weekly, monthly, quarterly, semestrally, yearly) with:
     - Creation at period start
     - Creation at period end
     - Execution query at period boundaries
   - **Daily**: Test across midnight UTC boundary
   - **Weekly**: Test ISO 8601 week numbering (week 1, week 52, week 53 in leap years)
   - **Monthly**: Test all 12 months
   - **Quarterly**: Test all 4 quarters
   - **Semestrally**: Test H1 (Jan-Jun) and H2 (Jul-Dec)
   - **Yearly**: Test across year boundaries

6. **Direction & Account Type Boundaries:**
   - **Expense accounts**: Test debit increases (positive direction), credit decreases (negative)
   - **Income accounts**: Test credit increases (positive for budget), debit decreases
   - **Mixed types**: Verify rejection when multipleAccounts contains mixed expense/income
   - **Invalid types**: Verify rejection of asset/liability/equity accounts in budgets

7. **Timezone Boundaries:**
   - All calculations in UTC (verify no DST impact)
   - Test user in UTC-12 (earliest timezone)
   - Test user in UTC+14 (latest timezone)
   - Verify period boundaries consistent regardless of user timezone

8. **Concurrency Boundaries:**
   - Two users creating budgets simultaneously (no conflict)
   - Same user creating two budgets simultaneously (should succeed)
   - Concurrent budget updates to same budget (last write wins or optimistic lock)
   - Budget execution query during transaction insertion (eventual consistency acceptable)

**Performance Testing Requirements:**

Performance tests must validate the system meets NFRs under realistic and stress conditions:

1. **Budget Creation Performance:**
   - **Target**: < 100ms for all scope types
   - **Test Scenarios**:
     - Single account budget: measure creation latency (target: < 50ms)
     - Multiple accounts budget with 10 accounts: measure creation latency (target: < 80ms)
     - Account type budget: measure creation latency (target: < 100ms)
   - **Pass Criteria**: P95 latency < 100ms, P99 < 150ms

2. **Budget Execution Performance - Single Account:**
   - **Target**: < 200ms for typical datasets
   - **Test Scenarios**:
     - 100 journal_lines in period (typical): measure execution query latency
     - 1,000 journal_lines in period (heavy user): measure execution query latency
     - 10,000 journal_lines in period (stress test): measure execution query latency
   - **Pass Criteria**: 
     - P95 < 200ms for ≤1K lines
     - P95 < 500ms for ≤10K lines
     - Graceful degradation beyond 10K (timeout at 5s, return partial results or error)

3. **Budget Execution Performance - Multiple Accounts:**
   - **Target**: < 300ms for typical multi-account budgets
   - **Test Scenarios**:
     - 5 accounts, 100 lines each (500 total): measure aggregation latency
     - 10 accounts, 500 lines each (5,000 total): measure aggregation latency
     - 50 accounts, 200 lines each (10,000 total): stress test
   - **Pass Criteria**: P95 < 300ms for ≤10 accounts, P95 < 1s for ≤50 accounts

4. **Budget Execution Performance - Account Type Scope:**
   - **Target**: < 500ms for typical account type budgets (most critical performance risk)
   - **Test Scenarios**:
     - 10 expense accounts, 100 lines each (1,000 total): baseline
     - 50 expense accounts, 200 lines each (10,000 total): realistic heavy usage
     - 100 expense accounts, 100 lines each (10,000 total): stress test (max accounts)
   - **Pass Criteria**:
     - P95 < 500ms for ≤50 accounts
     - P95 < 1s for ≤100 accounts
     - Implement query timeout at 5s, return error if exceeded
   - **Optimization Requirements**:
     - Parallelize journal_lines queries using `Promise.all()` (not sequential loop)
     - Use `by_user_type_active` index for account filtering
     - Consider pagination if total lines > 50K

5. **List Budgets Performance:**
   - **Target**: < 500ms including all execution calculations
   - **Test Scenarios**:
     - 5 budgets, each with 100 transactions: measure total latency
     - 20 budgets, mixed scope types, 500 transactions each: stress test
   - **Pass Criteria**: P95 < 500ms for ≤10 budgets, P95 < 1s for ≤20 budgets
   - **Note**: If performance inadequate, implement lazy loading (fetch execution on-demand)

6. **Index Usage Validation:**
   - Verify `by_accountId_date` index used for journal_lines queries (check query plan)
   - Verify `by_user_active` index used for budget filtering (check query plan)
   - Verify `by_user_type_active` index used for accountType scope (check query plan)
   - Measure query performance with vs. without indexes (should be 10x+ faster with indexes)

7. **Concurrent Load Testing:**
   - **Test Scenarios**:
     - 10 users creating budgets simultaneously: measure throughput and latency
     - 50 users querying budget execution simultaneously: measure query latency distribution
     - Mixed load: 20 users creating + 30 users querying simultaneously
   - **Pass Criteria**: No degradation beyond 2x for P95 latency under concurrent load

8. **Memory & Resource Usage:**
   - **Test Scenarios**:
     - Account type budget with 100 accounts: measure memory consumption during execution
     - List 50 budgets with execution: measure total memory footprint
   - **Pass Criteria**: No memory leaks, heap usage < 100MB per query

**Performance Testing Methodology:**
- Use production-like data volumes (based on actual user data from Phase 1-3 migration)
- Run each test scenario 100 times, collect P50/P95/P99 latencies
- Test in Convex dev environment first, then staging with production data copy
- Monitor Convex dashboard metrics: query duration, function invocations, database scans
- Identify slow queries and optimize (add indexes, refactor aggregation logic)

**Performance Failure Protocol:**
- If accountType scope fails performance tests (P95 > 1s):
  - Implement query parallelization with `Promise.all()`
  - Add hard cap: limit to first 100 accounts sorted by creation time
  - Show warning in UI: "Budget includes >50 accounts, execution may be slow"
  - Consider deferring accountType scope to Phase 4.4 (with pre-aggregation)
- If any scenario exceeds 5s: implement timeout and return user-friendly error
- Document performance characteristics in user-facing documentation

## Constraints & Non-Functional Requirements

### Performance
- Budget creation must complete in < 100ms for typical cases
- Budget execution queries must complete in < 200ms for datasets with thousands of transactions
- listBudgets query must complete in < 500ms including all execution calculations
- Period boundary calculations must complete in < 5ms
- Index usage required for all account and date filtering

### Data Integrity
- Budget amounts must be positive integers (validation enforced)
- Budget scope configuration must be internally consistent (scopeType determines required fields)
- Account references must be valid and accessible (ownership validated)
- Period calculations must be deterministic and consistent
- No carryover logic (explicit requirement)

### Security
- Users can only create budgets for their own accounts (ownership validated)
- Budget queries filtered by userId (multi-tenancy enforced)
- Account access validated on every budget operation
- Soft-deleted budgets excluded from active queries but data preserved

### Compatibility
- Budgets work with existing account hierarchy
- Budget execution integrates with Phase 4.1 transfer transactions
- Budget system compatible with Phase 4.3 historical tracking
- Budget data structure supports Phase 4.4 pre-aggregation optimization
- No changes to existing expense/income transaction logic

### Observability
- Budget creation logs with userId and scopeType
- Budget execution calculation logs performance metrics
- Validation errors logged with context for debugging
- Period calculation errors logged with frequency and reference date

## Out of Scope

The following are explicitly **NOT** included in Phase 4.2:

- **Budget Historical Tracking**: `budget_lines` table population and history queries (deferred to Phase 4.3)
- **Background Jobs**: Scheduled job for period rollover and budget_lines creation (Phase 4.3)
- **Pre-Aggregation**: `monthly_rollups` table and performance optimization (Phase 4.4)
- **Budget Alerts**: Email/push notifications when budget exceeded (Phase 8.3)
- **Budget Carryover**: Carrying unused budget to next period (not planned, may be future enhancement)
- **Budget Sharing**: Multi-user budget collaboration (Phase 11.3)
- **Budget Templates**: Pre-defined budget suggestions based on user patterns (future UX)
- **Budget Adjustments**: Mid-period budget amount changes with prorating (future enhancement)
- **Budget Forecasting**: Predictive budget recommendations using ML (future AI feature)
- **Budget Approval**: Workflow for budget creation approval (future)
- **Budget Categories**: Grouping budgets into categories/folders (future UX)
- **Budget Dashboard**: Dedicated full-screen budget analytics page (future reporting)

## Success Metrics

- [ ] `createBudget` mutation successfully creates budgets with all three scope types
- [ ] Budget creation validates all inputs and rejects invalid configurations
- [ ] Budget execution calculation accurate to the penny compared to manual verification
- [ ] Period boundary calculation correct for all six frequencies across all edge cases
- [ ] Next due date calculation correct for all frequencies
- [ ] Budget execution queries use proper indexes (verify with query performance monitoring)
- [ ] Budget execution completes in < 200ms for datasets with 10,000+ journal lines
- [ ] `listBudgets` query returns all user budgets with current execution status
- [ ] `updateBudget` mutation successfully updates budget configuration
- [ ] `deleteBudget` mutation soft-deletes budgets preserving data
- [ ] Comprehensive test coverage (>90%) for budget creation, validation, and execution
- [ ] Budget system documentation complete with examples
- [ ] Budget functionality integrated with Home dashboard UI (showing budget cards)
- [ ] No regressions in existing expense/income transaction workflows

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Budget calculation errors leading to incorrect spending limits | High | Comprehensive testing with manual verification, use exact integer arithmetic, validate against test data |
| Period boundary calculation edge cases (leap years, DST, month boundaries) | High | Thorough testing of all frequencies, use UTC exclusively, test with specific edge case dates |
| Performance degradation with large transaction volumes | Medium | Proper indexing on journal_lines, query optimization, consider pagination for large periods |
| Account type scope including too many accounts affecting performance | Medium | Batch processing, consider account limits for accountType scope, monitor query performance |
| Timezone confusion (user local time vs UTC) | Medium | All calculations in UTC, document explicitly, UI shows UTC with conversion |
| Scope configuration complexity confusing users | Medium | Clear validation messages, in-app examples, scope description helper text |
| Budget execution calculation direction errors (debit vs credit) | Medium | Test with both expense and income accounts, validate direction logic, code review |
| No carryover causing user confusion (expected carryover) | Low | Document clearly, consider adding explanation in UI, monitor user feedback |

## Appendix

### Glossary
- **Budget**: Spending or earning limit for a defined time period, scoped to specific accounts or account types
- **Budget Scope**: Defines which accounts a budget tracks (singleAccount, multipleAccounts, accountType)
- **Budget Execution**: Calculation of actual spending/earning compared to budget limit for current period
- **Period**: Time range for budget calculation (day, week, month, quarter, semester, year)
- **Frequency**: How often budget periods reset (daily, weekly, monthly, quarterly, semestrally, yearly)
- **Carryover**: (Not implemented) Transferring unused budget to next period
- **One-Shot Budget**: Budget with endDate, used for temporary spending limits
- **Account Type Scope**: Budget dynamically tracking all accounts of a specific type
- **Minor Units**: Smallest currency denomination (cents for USD, pesos for ARS with no decimals)
- **Zero-Sum Invariant**: Accounting principle where debits equal credits (not directly related to budgets but relevant for journal_lines aggregation)

### References
- Convex Docs: https://docs.convex.dev/database/schemas
- Convex Queries: https://docs.convex.dev/database/reading-data
- Convex Mutations: https://docs.convex.dev/database/writing-data
- Double-Entry Bookkeeping: https://en.wikipedia.org/wiki/Double-entry_bookkeeping
- Budget Planning: https://www.investopedia.com/terms/b/budget.asp
- ISO 8601 Week Dates: https://en.wikipedia.org/wiki/ISO_week_date

### Related PRDs
- Phase 1.1: Schema Definition & Validators (foundation)
- Phase 4.1: Transfer Implementation (prior phase)
- Phase 4.3: Budget Lines & Historical Tracking (next phase)
- Phase 4.4: Pre-Aggregation System (performance optimization)
- Phase 6.2: Home Screen Dashboard Migration (UI integration)

### Code Examples

**Example 1: Create Monthly Groceries Budget**
```typescript
// Single account budget for groceries
const result = await createBudget({
  scopeType: "singleAccount",
  accountId: groceriesAccountId, // ID<"accounts"> for groceries expense account
  amount: 50000, // $50,000 ARS monthly limit
  frequency: "monthly",
  description: "Monthly groceries budget"
});
// Returns: { budgetId: "j123...", status: "success" }
```

**Example 2: Create Multi-Account Food Budget**
```typescript
// Budget covering multiple food-related accounts
const result = await createBudget({
  scopeType: "multipleAccounts",
  scopeRefs: [
    groceriesAccountId,    // ID<"accounts"> for groceries
    restaurantsAccountId,  // ID<"accounts"> for restaurants
    coffeeAccountId,       // ID<"accounts"> for coffee shops
  ],
  amount: 120000, // $120,000 ARS total food budget
  frequency: "monthly",
  description: "All food expenses"
});
```

**Example 3: Create Total Expenses Budget**
```typescript
// Budget tracking all expense accounts dynamically
const result = await createBudget({
  scopeType: "accountType",
  scopeAccountType: "expense",
  amount: 500000, // $500,000 ARS total monthly expenses
  frequency: "monthly",
  description: "Total monthly expenses"
});
// Automatically includes all current and future expense accounts
```

**Example 4: Create Vacation Budget with End Date**
```typescript
// One-shot budget ending after vacation
const vacationEndDate = new Date("2025-12-31").getTime();
const result = await createBudget({
  scopeType: "singleAccount",
  accountId: travelAccountId,
  amount: 200000, // $200,000 ARS vacation budget
  frequency: "monthly", // Still need frequency for period calculation
  endDate: vacationEndDate, // Budget expires after vacation
  description: "December vacation spending limit"
});
```

**Example 5: Get Budget Execution**
```typescript
// Retrieve current execution status
const execution = await getBudgetExecution({
  budgetId: "j123..." // ID<"budgets">
});
// Returns:
// {
//   budgetId: "j123...",
//   budgetAmount: 50000,
//   spentAmount: 32500,
//   remainingAmount: 17500,
//   percentUsed: 65,
//   periodStart: 1728000000000, // Oct 1, 2025 00:00 UTC
//   periodEnd: 1730678399999,   // Oct 31, 2025 23:59:59 UTC
//   status: "under_budget",
//   accounts: [
//     { accountId: "j456...", accountDescription: "Groceries", spentAmount: 32500 }
//   ]
// }
```

**Example 6: List All Active Budgets**
```typescript
// Get all budgets for user with current execution
const budgets = await listBudgets({
  includeDeleted: false // Only active budgets
});
// Returns array of budget summaries with current execution status
```

**Example 7: Period Boundary Calculation**
```typescript
// Calculate current monthly period
const boundaries = calculatePeriodBoundaries("monthly", Date.now());
// Returns:
// {
//   periodStart: 1728000000000, // Oct 1, 2025 00:00:00 UTC
//   periodEnd: 1730678399999    // Oct 31, 2025 23:59:59 UTC
// }

// Calculate current weekly period (Monday-Sunday)
const weekBoundaries = calculatePeriodBoundaries("weekly", Date.now());
// Returns current week boundaries starting Monday 00:00 UTC
```

**Example 8: Next Due Date Calculation**
```typescript
// Calculate when monthly budget period rolls over
const nextDue = calculateNextDueDate(Date.now(), "monthly");
// Returns: Epoch ms of 1st of next month 00:00:00 UTC

// Calculate when weekly budget period rolls over
const nextWeekDue = calculateNextDueDate(Date.now(), "weekly");
// Returns: Epoch ms of next Monday 00:00:00 UTC
```

---

## Implementation Checklist

**Pre-Implementation:**
- [ ] Review existing `budgets` table schema in `convex/schema.ts`
- [ ] Verify indexes exist: `by_user`, `by_user_active`, `by_nextDueDate`
- [ ] Review Phase 4.1 Transfer Implementation for patterns
- [ ] Set up test data: create test accounts (expense and income types)

**Core Implementation:**
- [ ] Create `convex/ledger/budgetUtils.ts` with period calculation utilities
- [ ] Create `convex/ledger/budgets.ts` with CRUD mutations
- [ ] Create `convex/ledger/budgetExecution.ts` with execution queries
- [ ] Add validators in `convex/ledger/validators.ts`
- [ ] Implement `createBudget` mutation with all validation
- [ ] Implement `getBudgetExecution` query with aggregation logic
- [ ] Implement `listBudgets` query with execution summaries
- [ ] Implement `updateBudget` mutation
- [ ] Implement `deleteBudget` mutation (soft-delete)

**Testing:**
- [ ] Unit tests for period boundary calculation (all frequencies)
- [ ] Unit tests for next due date calculation (all frequencies)
- [ ] Unit tests for budget creation validation
- [ ] Integration tests for budget execution calculation
- [ ] Integration tests for all scope types
- [ ] Edge case tests (leap years, month boundaries, etc.)
- [ ] Performance tests with large transaction datasets

**Integration:**
- [ ] Update Home dashboard to show budget overview card
- [ ] Add budget creation form to UI (Plan tab or Add Transaction drawer)
- [ ] Add budget list screen showing all budgets with execution
- [ ] Add budget detail view (basic, history in Phase 4.3)

**Documentation:**
- [ ] Add JSDoc comments to all public functions
- [ ] Document period calculation logic and edge cases
- [ ] Create usage examples in code comments
- [ ] Update user-facing documentation

**Validation:**
- [ ] Manual testing of budget creation with all scope types
- [ ] Manual verification of budget execution calculations
- [ ] Performance benchmarking of execution queries
- [ ] User acceptance testing of budget UI



