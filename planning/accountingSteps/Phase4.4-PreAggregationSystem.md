# Phase 4.4: Pre-Aggregation System PRD

## Introduction

This PRD covers the implementation of PerFi's pre-aggregation system for performance optimization, building on the budget system and ledger infrastructure established in Phases 1-4.3. This system maintains monthly rollups of journal line data to ensure the Home dashboard and budget calculations remain fast as transaction volumes grow, while providing eventual consistency guarantees and graceful degradation to direct calculation when needed.

The pre-aggregation system creates a `monthly_rollups` table containing pre-calculated monthly aggregates by account, updated through both background reconciliation jobs and best-effort synchronous updates on transaction mutations. This foundation enables sub-second Home dashboard load times and efficient budget execution queries while maintaining data accuracy through drift detection and reconciliation.

This is Phase 4.4 of the PerFi accounting core migration, building directly on the budget historical tracking delivered in Phase 4.3 and preparing for the UI integration optimizations planned in Phase 4.5.

## Context & Background

### Current System
- Complete budget system with three scope types and real-time execution calculation (Phase 4.2)
- Budget historical tracking with automated period rollover and cron jobs (Phase 4.3)
- Transfer functionality for account-to-account movements (Phase 4.1)
- Home dashboard reads directly from `journal_lines` aggregation (performance bottleneck at scale)
- Budget execution queries aggregate from `journal_lines` in real-time (acceptable for current scale)
- No pre-aggregated data available for performance optimization
- No background reconciliation system for data consistency

### Target System
- `monthly_rollups` table containing pre-calculated monthly aggregates by account
- Background reconciliation job running daily to compute/update rollups with drift detection
- Best-effort synchronous rollup updates on transaction mutations (addExpense, addTransfer, etc.)
- Idempotent upsert operations keyed by `(userId, accountId, month)` for consistency
- Query functions optimized to use rollups when available, fallback to direct calculation
- Home dashboard queries leveraging pre-aggregated data for sub-second performance
- Budget execution queries using rollups for improved response times
- Monitoring and alerting for rollup health and consistency

### Technology Stack
- **Backend**: Convex (TypeScript) with existing ledger and budget infrastructure
- **Database**: Convex NoSQL with existing `journal_entries`, `journal_lines`, `accounts` tables
- **Scheduled Jobs**: Convex cron system for daily reconciliation
- **Validation**: Convex `v` validators with existing account and currency enums
- **Queries**: Optimized aggregation using rollups with fallback to direct calculation

### Key Concepts

**Monthly Rollups**: Pre-calculated monthly aggregates stored in `monthly_rollups` table, containing total debits, credits, and net amounts by account and month.

**Best-Effort Synchronous Updates**: Transaction mutations attempt to update rollups immediately, but failures don't block the transaction (graceful degradation).

**Background Reconciliation**: Daily cron job that recalculates all rollups and fixes any drift between rollup data and actual journal_lines aggregation.

**Drift Detection**: Comparison between rollup values and direct calculation from journal_lines to identify inconsistencies requiring reconciliation.

**Eventual Consistency**: Rollup data may be temporarily stale (up to 24 hours) but will be corrected by background reconciliation.

## User Stories

**US1:** *As a user, I want the Home dashboard to load quickly even with thousands of transactions, so I can access my financial overview without waiting.*

**US2:** *As a user, I want budget execution queries to be fast and responsive, so I can track my spending limits in real-time without performance delays.*

**US3:** *As a developer, I need rollup data to be eventually consistent with source data, so financial calculations remain accurate even with background processing.*

**US4:** *As a developer, I need the system to gracefully handle rollup failures, so transaction processing continues even if rollup updates fail.*

**US5:** *As a system administrator, I need monitoring and alerting for rollup health, so I can detect and resolve data consistency issues proactively.*

**US6:** *As a developer, I need efficient rollup queries that scale with account count, so the system performs well as users add more accounts and categories.*

## Acceptance Criteria

### For US1 (Fast Home Dashboard):

**Performance Targets:**
- [ ] Home dashboard loads in < 1 second for users with 1000+ transactions
- [ ] Monthly summary card uses rollup data (not direct journal_lines aggregation)
- [ ] Budget overview card uses rollup data for execution calculations
- [ ] Top spending categories derived from rollup data
- [ ] Query uses `by_user_month` index for efficient rollup lookups

**Rollup Integration:**
- [ ] `getMonthlySummary` query checks rollups first, falls back to direct calculation
- [ ] Rollup data includes all account types (expense, income, asset, liability)
- [ ] Rollup data includes currency breakdown for multi-currency accounts
- [ ] Query handles missing rollup data gracefully (recalculates on demand)

**Example Performance:**
```typescript
// Before rollups: 2.5 seconds (1000 transactions, 50 accounts)
// After rollups: 0.3 seconds (same data, pre-aggregated)
const summary = await getMonthlySummary({ userId, month: currentMonth });
// Returns: { totalIncome: 150000, totalExpenses: 120000, netBalance: 30000 }
```

### For US2 (Fast Budget Execution):

**Performance Targets:**
- [ ] Budget execution queries complete in < 200ms (vs 500ms without rollups)
- [ ] Multi-account budget execution uses rollup aggregation
- [ ] Account-type budget execution leverages rollup data
- [ ] Query scales linearly with account count (not transaction count)

**Rollup Usage:**
- [ ] `getBudgetExecution` checks rollups for account-level data
- [ ] Rollup data filtered by account scope (singleAccount, multipleAccounts, accountType)
- [ ] Period filtering applied to rollup data (current month, custom ranges)
- [ ] Fallback to direct calculation if rollup data unavailable

**Example Performance:**
```typescript
// Budget with 10 accounts, 500 transactions each
// Before rollups: 450ms (aggregate 5000 journal_lines)
// After rollups: 120ms (aggregate 10 rollup records)
const execution = await getBudgetExecution({ budgetId });
// Returns: { spentAmount: 45000, remainingAmount: 5000, status: "at_budget" }
```

### For US3 (Eventual Consistency):

**Consistency Model:**
- [ ] Rollup data guaranteed to be consistent within 24 hours (daily reconciliation)
- [ ] Best-effort synchronous updates provide near-real-time consistency
- [ ] Drift detection identifies discrepancies > 0.01% between rollup and direct calculation
- [ ] Reconciliation job corrects all identified drift automatically

**Data Integrity:**
- [ ] Rollup values match direct calculation from journal_lines (within rounding tolerance)
- [ ] No missing rollup records for active accounts and recent months
- [ ] Rollup data includes all transaction types (expenses, income, transfers)
- [ ] Currency conversion handled consistently in rollups and direct calculation

**Validation:**
- [ ] Spot-check validation comparing rollup vs direct calculation (1% of records)
- [ ] Reconciliation job logs drift detection results
- [ ] Alert if drift exceeds 1% of total rollup value
- [ ] Manual reconciliation utility for emergency corrections

### For US4 (Graceful Degradation):

**Transaction Processing:**
- [ ] Transaction mutations (addExpense, addTransfer) attempt rollup updates
- [ ] Rollup update failures don't block transaction completion
- [ ] Failed rollup updates logged for reconciliation job processing
- [ ] Transaction succeeds even if all rollup updates fail

**Query Fallback:**
- [ ] All rollup-dependent queries have direct calculation fallback
- [ ] Fallback triggered when rollup data missing or stale (>24 hours)
- [ ] Fallback performance acceptable (same as current system)
- [ ] Fallback results cached briefly to avoid repeated expensive calculations

**Error Handling:**
- [ ] Rollup update errors logged with transaction ID and account details
- [ ] Reconciliation job processes failed rollup updates
- [ ] No user-facing errors due to rollup failures
- [ ] System continues operating normally during rollup outages

### For US5 (Monitoring & Alerting):

**Health Monitoring:**
- [ ] Daily reconciliation job completion status tracked
- [ ] Rollup update success rate monitored (target: >95%)
- [ ] Drift detection results logged and summarized
- [ ] Rollup data freshness tracked (last update timestamp)

**Alerting:**
- [ ] Alert if reconciliation job fails for >24 hours
- [ ] Alert if rollup update success rate <90%
- [ ] Alert if drift exceeds 1% of total rollup value
- [ ] Alert if rollup data older than 48 hours

**Observability:**
- [ ] Rollup metrics exposed via Convex dashboard
- [ ] Query performance metrics tracked (rollup vs direct calculation)
- [ ] Rollup table size and growth rate monitored
- [ ] Reconciliation job duration and resource usage tracked

### For US6 (Scalable Queries):

**Query Optimization:**
- [ ] Rollup queries use composite indexes for efficient filtering
- [ ] Pagination support for large rollup result sets
- [ ] Query plans optimized for rollup table access patterns
- [ ] Index usage monitored and optimized based on query patterns

**Scalability:**
- [ ] Rollup queries scale O(accounts) not O(transactions)
- [ ] Home dashboard performance independent of transaction volume
- [ ] Budget execution performance scales with account count only
- [ ] Rollup table growth rate manageable (1 record per account per month)

**Index Requirements:**
- [ ] `by_user_month`: `(userId, month desc)` for user monthly summaries
- [ ] `by_account_month`: `(accountId, month desc)` for account-specific queries
- [ ] `by_user_account_month`: `(userId, accountId, month desc)` for budget execution
- [ ] `by_month`: `(month desc)` for system-wide reconciliation

## Detailed Specifications

### monthly_rollups Table Schema

**Purpose**: Store pre-calculated monthly aggregates by account for performance optimization

**Fields:**
```typescript
{
  id: v.id("monthly_rollups"),
  userId: v.id("users"), // User partition for multi-tenancy
  accountId: v.id("accounts"), // Account reference
  month: v.number(), // Epoch ms of month start (1st day 00:00:00 UTC)
  totalDebits: v.number(), // Sum of debit lines in month (minor units)
  totalCredits: v.number(), // Sum of credit lines in month (minor units)
  netAmount: v.number(), // totalCredits - totalDebits (can be negative)
  transactionCount: v.number(), // Number of journal_lines in month
  lastUpdated: v.number(), // Epoch ms when rollup was last updated
  lastReconciled: v.number(), // Epoch ms when rollup was last reconciled
  createdAt: v.number(), // Epoch ms when rollup record was created
}
```

**Business Rules:**
- One rollup record per account per month (composite uniqueness: `userId + accountId + month`)
- `totalDebits` and `totalCredits` are sums of `amountBaseCurrency` from `journal_lines`
- `netAmount` calculated as `totalCredits - totalDebits` (positive = net credit, negative = net debit)
- `transactionCount` tracks number of `journal_lines` for the account in the month
- `lastUpdated` tracks when rollup was last modified (transaction or reconciliation)
- `lastReconciled` tracks when rollup was last verified by background job

**Indexes:**
- `by_user_month`: `(userId, month desc)` - Home dashboard monthly summaries
- `by_account_month`: `(accountId, month desc)` - Account-specific historical queries
- `by_user_account_month`: `(userId, accountId, month desc)` - Budget execution queries
- `by_month`: `(month desc)` - System-wide reconciliation jobs
- `by_last_reconciled`: `(lastReconciled asc)` - Find stale rollups for reconciliation

**Validation Rules:**
- `month` must be start of month (1st day 00:00:00 UTC)
- `totalDebits` and `totalCredits` must be non-negative
- `transactionCount` must be non-negative
- `lastUpdated` must be >= `lastReconciled`
- `lastReconciled` must be <= current time

### upsertMonthlyRollup Internal Mutation

**Purpose**: Create or update monthly rollup record (idempotent operation)

**Registration**: This is registered as an internal mutation using `internalMutation` from `./_generated/server` in `convex/ledger/rollups.ts` and callable via `internal.ledger.rollups.upsertMonthlyRollup`.

**Input Validator:**
```typescript
{
  userId: v.id("users"),
  accountId: v.id("accounts"),
  month: v.number(), // Epoch ms of month start
  totalDebits: v.number(),
  totalCredits: v.number(),
  netAmount: v.number(),
  transactionCount: v.number(),
  updateType: v.union(
    v.literal("transaction"), // Updated by transaction mutation
    v.literal("reconciliation") // Updated by background job
  ),
}
```

**Output:**
```typescript
{
  rollupId: Id<"monthly_rollups">,
  status: "created" | "updated" | "already_current",
  previousValues?: {
    totalDebits: number,
    totalCredits: number,
    netAmount: number,
    transactionCount: number,
  }
}
```

**Business Logic Flow:**
```typescript
async function upsertMonthlyRollup(ctx, args) {
  const currentTime = Date.now();
  
  // 1. Check for existing rollup
  const existingRollup = await ctx.db
    .query("monthly_rollups")
    .withIndex("by_user_account_month", q =>
      q.eq("userId", args.userId)
       .eq("accountId", args.accountId)
       .eq("month", args.month)
    )
    .first();
  
  if (existingRollup) {
    // 2. Check if update is needed
    const valuesChanged = 
      existingRollup.totalDebits !== args.totalDebits ||
      existingRollup.totalCredits !== args.totalCredits ||
      existingRollup.netAmount !== args.netAmount ||
      existingRollup.transactionCount !== args.transactionCount;
    
    if (!valuesChanged && args.updateType === "transaction") {
      // Values unchanged, just update lastUpdated timestamp
      await ctx.db.patch(existingRollup._id, { lastUpdated: currentTime });
      return { rollupId: existingRollup._id, status: "already_current" };
    }
    
    if (valuesChanged) {
      // 3. Update existing rollup
      const previousValues = {
        totalDebits: existingRollup.totalDebits,
        totalCredits: existingRollup.totalCredits,
        netAmount: existingRollup.netAmount,
        transactionCount: existingRollup.transactionCount,
      };
      
      await ctx.db.patch(existingRollup._id, {
        totalDebits: args.totalDebits,
        totalCredits: args.totalCredits,
        netAmount: args.netAmount,
        transactionCount: args.transactionCount,
        lastUpdated: currentTime,
        lastReconciled: args.updateType === "reconciliation" ? currentTime : existingRollup.lastReconciled,
      });
      
      console.log(`Updated rollup ${existingRollup._id}: ${args.transactionCount} transactions, net: ${args.netAmount}`);
      return { rollupId: existingRollup._id, status: "updated", previousValues };
    }
  } else {
    // 4. Create new rollup
    const rollupId = await ctx.db.insert("monthly_rollups", {
      userId: args.userId,
      accountId: args.accountId,
      month: args.month,
      totalDebits: args.totalDebits,
      totalCredits: args.totalCredits,
      netAmount: args.netAmount,
      transactionCount: args.transactionCount,
      lastUpdated: currentTime,
      lastReconciled: args.updateType === "reconciliation" ? currentTime : 0,
      createdAt: currentTime,
    });
    
    console.log(`Created rollup ${rollupId}: ${args.transactionCount} transactions, net: ${args.netAmount}`);
    return { rollupId, status: "created" };
  }
}
```

**Error Conditions:**
- `INVALID_MONTH`: Month timestamp not at start of month
- `ACCOUNT_NOT_FOUND`: Account reference is invalid
- `USER_NOT_FOUND`: User reference is invalid

**Idempotency**: Function safely handles duplicate calls with same data, updating only timestamps when values unchanged.

### calculateMonthlyRollup Internal Query

**Purpose**: Calculate monthly rollup data for an account from journal_lines (used by reconciliation and on-demand updates)

**Input Validator:**
```typescript
{
  userId: v.id("users"),
  accountId: v.id("accounts"),
  month: v.number(), // Epoch ms of month start
}
```

**Output:**
```typescript
{
  totalDebits: number,
  totalCredits: number,
  netAmount: number,
  transactionCount: number,
  monthStart: number,
  monthEnd: number,
} | null
```

**Business Logic Flow:**
```typescript
async function calculateMonthlyRollup(ctx, args) {
  // 1. Validate account exists and belongs to user
  const account = await ctx.db.get(args.accountId);
  if (!account || account.userId !== args.userId || account.softdelete) {
    return null;
  }
  
  // 2. Calculate month boundaries
  const monthStart = args.month;
  const monthEnd = getMonthEnd(monthStart); // Last day 23:59:59.999 UTC
  
  // 3. Query journal_lines for the month
  const lines = await ctx.db
    .query("journal_lines")
    .withIndex("by_accountId_date", q =>
      q.eq("accountId", args.accountId)
       .gte("entryDate", monthStart)
       .lte("entryDate", monthEnd)
    )
    .collect();
  
  // 4. Aggregate data
  let totalDebits = 0;
  let totalCredits = 0;
  
  for (const line of lines) {
    if (line.direction === "debit") {
      totalDebits += line.amountBaseCurrency;
    } else if (line.direction === "credit") {
      totalCredits += line.amountBaseCurrency;
    }
  }
  
  const netAmount = totalCredits - totalDebits;
  const transactionCount = lines.length;
  
  return {
    totalDebits,
    totalCredits,
    netAmount,
    transactionCount,
    monthStart,
    monthEnd,
  };
}
```

**Performance**: Query uses `by_accountId_date` index for efficient month-range filtering.

### reconcileMonthlyRollups Internal Action

**Purpose**: Background job that reconciles all monthly rollups to ensure consistency with journal_lines

**Trigger**: Convex cron job runs daily at 02:00 UTC (after transaction processing peak)

**Business Logic Flow:**
```typescript
async function reconcileMonthlyRollups(ctx) {
  const startTime = Date.now();
  let processed = 0;
  let updated = 0;
  let created = 0;
  let errors = 0;
  let driftDetected = 0;
  
  console.log(`[Rollup Reconciliation] Job started at ${new Date(startTime).toISOString()}`);
  
  try {
    // 1. Get all active accounts
    const accounts = await ctx.runQuery(internal.ledger.accounts.listActiveAccounts);
    console.log(`[Rollup Reconciliation] Found ${accounts.length} active accounts`);
    
    // 2. Process accounts in batches of 100
    const BATCH_SIZE = 100;
    for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
      const batch = accounts.slice(i, i + BATCH_SIZE);
      
      // Process batch in parallel
      const results = await Promise.allSettled(
        batch.map(account => reconcileAccountRollups(ctx, account))
      );
      
      // Count results
      for (const result of results) {
        processed++;
        if (result.status === "fulfilled") {
          const accountResult = result.value;
          updated += accountResult.updated;
          created += accountResult.created;
          driftDetected += accountResult.driftDetected;
        } else if (result.status === "rejected") {
          errors++;
          console.error(`[Rollup Reconciliation] Error processing account: ${result.reason}`);
        }
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`[Rollup Reconciliation] Job completed: ${processed} accounts processed, ${updated} updated, ${created} created, ${driftDetected} drift detected, ${errors} errors, ${duration}ms`);
  } catch (error) {
    console.error(`[Rollup Reconciliation] Job failed: ${error}`);
    // Don't throw - allow job to complete even if partially failed
  }
}

async function reconcileAccountRollups(ctx, account) {
  let updated = 0;
  let created = 0;
  let driftDetected = 0;
  
  // 1. Get last 12 months of rollups for this account
  const twelveMonthsAgo = getMonthStart(Date.now() - (365 * 24 * 60 * 60 * 1000));
  
  const existingRollups = await ctx.db
    .query("monthly_rollups")
    .withIndex("by_account_month", q =>
      q.eq("accountId", account._id)
       .gte("month", twelveMonthsAgo)
    )
    .collect();
  
  // 2. Create map of existing rollups by month
  const rollupMap = new Map();
  for (const rollup of existingRollups) {
    rollupMap.set(rollup.month, rollup);
  }
  
  // 3. Process each month in the last 12 months
  const currentMonth = getMonthStart(Date.now());
  let workingMonth = twelveMonthsAgo;
  
  while (workingMonth <= currentMonth) {
    // Calculate rollup from journal_lines
    const calculatedRollup = await ctx.runQuery(internal.ledger.rollups.calculateMonthlyRollup, {
      userId: account.userId,
      accountId: account._id,
      month: workingMonth,
    });
    
    if (calculatedRollup) {
      const existingRollup = rollupMap.get(workingMonth);
      
      if (existingRollup) {
        // Check for drift
        const drift = Math.abs(existingRollup.netAmount - calculatedRollup.netAmount);
        const driftPercent = drift / Math.max(Math.abs(existingRollup.netAmount), 1) * 100;
        
        if (driftPercent > 0.01) { // 0.01% tolerance
          driftDetected++;
          console.warn(`[Rollup Reconciliation] Drift detected for account ${account._id} month ${workingMonth}: ${driftPercent.toFixed(4)}%`);
        }
        
        // Update rollup
        await ctx.runMutation(internal.ledger.rollups.upsertMonthlyRollup, {
          userId: account.userId,
          accountId: account._id,
          month: workingMonth,
          totalDebits: calculatedRollup.totalDebits,
          totalCredits: calculatedRollup.totalCredits,
          netAmount: calculatedRollup.netAmount,
          transactionCount: calculatedRollup.transactionCount,
          updateType: "reconciliation",
        });
        updated++;
      } else {
        // Create missing rollup
        await ctx.runMutation(internal.ledger.rollups.upsertMonthlyRollup, {
          userId: account.userId,
          accountId: account._id,
          month: workingMonth,
          totalDebits: calculatedRollup.totalDebits,
          totalCredits: calculatedRollup.totalCredits,
          netAmount: calculatedRollup.netAmount,
          transactionCount: calculatedRollup.transactionCount,
          updateType: "reconciliation",
        });
        created++;
      }
    }
    
    // Move to next month
    workingMonth = getNextMonthStart(workingMonth);
  }
  
  return { updated, created, driftDetected };
}
```

**Cron Configuration:**
```typescript
// In convex/crons.ts
export default {
  rollupReconciliation: {
    schedule: "0 2 * * *", // Daily at 02:00 UTC
    handler: internal.ledger.rollups.reconcileMonthlyRollups,
  },
};
```

**Performance**: Job processes 100 accounts per batch, completes in < 5 minutes for 1000 accounts.

### getMonthlySummary Query (Optimized)

**Purpose**: Retrieve monthly financial summary using rollup data with fallback to direct calculation

**Input Validator:**
```typescript
{
  month: v.optional(v.number()), // Default: current month
}
```

**Output:**
```typescript
{
  month: number,
  totalIncome: number,
  totalExpenses: number,
  netBalance: number,
  accountBreakdown: Array<{
    accountId: Id<"accounts">,
    accountName: string,
    accountType: AccountType,
    totalDebits: number,
    totalCredits: number,
    netAmount: number,
    transactionCount: number,
  }>,
  dataSource: "rollups" | "direct_calculation",
  lastUpdated: number,
}
```

**Business Logic Flow:**
```typescript
async function getMonthlySummary(ctx, args) {
  // 1. Authenticate user
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("UNAUTHORIZED");
  const user = await getUserByAuth0Id(ctx, identity.subject);
  
  // 2. Determine month
  const month = args.month ?? getMonthStart(Date.now());
  
  // 3. Try to get rollup data first
  const rollups = await ctx.db
    .query("monthly_rollups")
    .withIndex("by_user_month", q =>
      q.eq("userId", user._id).eq("month", month)
    )
    .collect();
  
  if (rollups.length > 0) {
    // 4. Use rollup data
    let totalIncome = 0;
    let totalExpenses = 0;
    const accountBreakdown = [];
    
    for (const rollup of rollups) {
      const account = await ctx.db.get(rollup.accountId);
      if (!account || account.softdelete) continue;
      
      accountBreakdown.push({
        accountId: rollup.accountId,
        accountName: account.description,
        accountType: account.accountType,
        totalDebits: rollup.totalDebits,
        totalCredits: rollup.totalCredits,
        netAmount: rollup.netAmount,
        transactionCount: rollup.transactionCount,
      });
      
      if (account.accountType === "income") {
        totalIncome += rollup.totalCredits;
      } else if (account.accountType === "expense") {
        totalExpenses += rollup.totalDebits;
      }
    }
    
    const netBalance = totalIncome - totalExpenses;
    const lastUpdated = Math.max(...rollups.map(r => r.lastUpdated));
    
    return {
      month,
      totalIncome,
      totalExpenses,
      netBalance,
      accountBreakdown,
      dataSource: "rollups",
      lastUpdated,
    };
  } else {
    // 5. Fallback to direct calculation
    return await calculateMonthlySummaryDirect(ctx, user._id, month);
  }
}

async function calculateMonthlySummaryDirect(ctx, userId, month) {
  // Direct calculation from journal_lines (existing logic)
  // Returns same structure but with dataSource: "direct_calculation"
  // This is the current implementation without rollups
}
```

**Performance**: Query completes in < 300ms using rollups vs 2.5s with direct calculation.

### getBudgetExecution Query (Optimized)

**Purpose**: Retrieve budget execution using rollup data for improved performance

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
  budgetAmount: number,
  spentAmount: number,
  remainingAmount: number,
  percentUsed: number,
  status: "under_budget" | "at_budget" | "over_budget",
  periodStart: number,
  periodEnd: number,
  accountBreakdown: Array<{
    accountId: Id<"accounts">,
    accountName: string,
    spentAmount: number,
    transactionCount: number,
  }>,
  dataSource: "rollups" | "direct_calculation",
}
```

**Business Logic Flow:**
```typescript
async function getBudgetExecution(ctx, args) {
  // 1. Get budget and validate ownership (existing logic)
  const budget = await getBudgetWithValidation(ctx, args.budgetId);
  
  // 2. Calculate current period boundaries (existing logic)
  const { periodStart, periodEnd } = calculatePeriodBoundaries(budget.frequency, Date.now());
  
  // 3. Determine accounts in scope (existing logic)
  const accountIds = await getBudgetScopeAccounts(ctx, budget);
  
  // 4. Try to get rollup data for current month
  const currentMonth = getMonthStart(periodStart);
  const rollups = await ctx.db
    .query("monthly_rollups")
    .withIndex("by_user_account_month", q =>
      q.eq("userId", budget.userId)
       .eq("month", currentMonth)
       .in("accountId", accountIds)
    )
    .collect();
  
  if (rollups.length > 0) {
    // 5. Use rollup data (approximate for current period)
    let spentAmount = 0;
    const accountBreakdown = [];
    
    for (const rollup of rollups) {
      const account = await ctx.db.get(rollup.accountId);
      if (!account || account.softdelete) continue;
      
      // For current month, use rollup data as approximation
      // For exact period calculation, would need to adjust for partial month
      let accountSpent = 0;
      if (account.accountType === "expense") {
        accountSpent = rollup.totalDebits;
      } else if (account.accountType === "income") {
        accountSpent = rollup.totalCredits;
      }
      
      spentAmount += accountSpent;
      accountBreakdown.push({
        accountId: rollup.accountId,
        accountName: account.description,
        spentAmount: accountSpent,
        transactionCount: rollup.transactionCount,
      });
    }
    
    // 6. Calculate derived values
    const remainingAmount = budget.amount - spentAmount;
    const percentUsed = Math.min((spentAmount / budget.amount) * 100, 999);
    
    let status: "under_budget" | "at_budget" | "over_budget";
    if (spentAmount < budget.amount) {
      status = "under_budget";
    } else if (spentAmount >= budget.amount && spentAmount < budget.amount * 1.05) {
      status = "at_budget";
    } else {
      status = "over_budget";
    }
    
    return {
      budgetId: budget._id,
      budgetAmount: budget.amount,
      spentAmount,
      remainingAmount,
      percentUsed,
      status,
      periodStart,
      periodEnd,
      accountBreakdown,
      dataSource: "rollups",
    };
  } else {
    // 7. Fallback to direct calculation (existing logic)
    return await calculateBudgetExecutionDirect(ctx, budget, periodStart, periodEnd);
  }
}
```

**Performance**: Query completes in < 200ms using rollups vs 500ms with direct calculation.

### updateRollupsOnTransaction Internal Mutation

**Purpose**: Update rollups when transactions are created/modified (best-effort synchronous updates)

**Input Validator:**
```typescript
{
  journalEntryId: v.id("journal_entries"),
  updateType: v.union(
    v.literal("create"),
    v.literal("update"),
    v.literal("delete")
  ),
}
```

**Business Logic Flow:**
```typescript
async function updateRollupsOnTransaction(ctx, args) {
  try {
    // 1. Get journal entry and lines
    const entry = await ctx.db.get(args.journalEntryId);
    if (!entry) return { status: "entry_not_found" };
    
    const lines = await ctx.db
      .query("journal_lines")
      .withIndex("by_entryId", q => q.eq("journalEntryId", args.journalEntryId))
      .collect();
    
    // 2. Group lines by account and month
    const accountMonths = new Map();
    
    for (const line of lines) {
      const month = getMonthStart(line.entryDate);
      const key = `${line.accountId}-${month}`;
      
      if (!accountMonths.has(key)) {
        accountMonths.set(key, {
          accountId: line.accountId,
          month,
          totalDebits: 0,
          totalCredits: 0,
          transactionCount: 0,
        });
      }
      
      const data = accountMonths.get(key);
      if (line.direction === "debit") {
        data.totalDebits += line.amountBaseCurrency;
      } else if (line.direction === "credit") {
        data.totalCredits += line.amountBaseCurrency;
      }
      data.transactionCount++;
    }
    
    // 3. Update rollups for each account-month combination
    const results = [];
    for (const [key, data] of accountMonths) {
      try {
        // Get current rollup
        const existingRollup = await ctx.db
          .query("monthly_rollups")
          .withIndex("by_user_account_month", q =>
            q.eq("userId", entry.userId)
             .eq("accountId", data.accountId)
             .eq("month", data.month)
          )
          .first();
        
        let newTotalDebits = data.totalDebits;
        let newTotalCredits = data.totalCredits;
        let newTransactionCount = data.transactionCount;
        
        if (existingRollup) {
          if (args.updateType === "create") {
            // Add to existing rollup
            newTotalDebits = existingRollup.totalDebits + data.totalDebits;
            newTotalCredits = existingRollup.totalCredits + data.totalCredits;
            newTransactionCount = existingRollup.transactionCount + data.transactionCount;
          } else if (args.updateType === "delete") {
            // Subtract from existing rollup
            newTotalDebits = existingRollup.totalDebits - data.totalDebits;
            newTotalCredits = existingRollup.totalCredits - data.totalCredits;
            newTransactionCount = existingRollup.transactionCount - data.transactionCount;
          }
          // For "update", recalculate entire month (handled by reconciliation)
        }
        
        const result = await ctx.runMutation(internal.ledger.rollups.upsertMonthlyRollup, {
          userId: entry.userId,
          accountId: data.accountId,
          month: data.month,
          totalDebits: newTotalDebits,
          totalCredits: newTotalCredits,
          netAmount: newTotalCredits - newTotalDebits,
          transactionCount: newTransactionCount,
          updateType: "transaction",
        });
        
        results.push({ accountId: data.accountId, month: data.month, status: "success" });
      } catch (error) {
        console.error(`[Rollup Update] Failed to update rollup for account ${data.accountId} month ${data.month}: ${error}`);
        results.push({ accountId: data.accountId, month: data.month, status: "error", error: error.message });
      }
    }
    
    return { status: "completed", results };
  } catch (error) {
    console.error(`[Rollup Update] Failed to update rollups for entry ${args.journalEntryId}: ${error}`);
    return { status: "failed", error: error.message };
  }
}
```

**Integration**: This function is called by transaction mutations (addExpense, addTransfer, etc.) as best-effort updates.

## Technical Implementation Details

### File Structure

**Pre-Aggregation System Implementation:**
```
convex/
  ledger/
    rollups.ts              # Rollup CRUD operations and reconciliation job
    monthlySummary.ts       # Optimized monthly summary queries
    budgetExecution.ts      # [UPDATE] Add rollup-optimized execution
    accounts.ts            # [UPDATE] Add listActiveAccounts internal query
  
  crons.ts                  # [UPDATE] Add rollupReconciliation job
```

**Schema:**
- Add `monthly_rollups` table to `convex/schema.ts`
- Add required indexes: `by_user_month`, `by_account_month`, `by_user_account_month`, `by_month`, `by_last_reconciled`

### Integration Points

**Transaction Mutations:**
- Update `addExpense`, `addTransfer`, `updateExpense`, `deleteExpense` to call `updateRollupsOnTransaction`
- Rollup updates are best-effort (failures don't block transactions)
- Failed rollup updates logged for reconciliation job processing

**Budget System:**
- Update `getBudgetExecution` to use rollup data when available
- Fallback to direct calculation for exact period boundaries
- Maintain same API contract (no breaking changes)

**Home Dashboard:**
- Update `getMonthlySummary` to use rollup data
- Fallback to direct calculation when rollups unavailable
- Performance improvement from 2.5s to 0.3s for large datasets

**Cron System:**
- Add `rollupReconciliation` job running daily at 02:00 UTC
- Process accounts in batches of 100 for scalability
- Log reconciliation results and drift detection

### Cron Job Configuration

**Job Definition:**
```typescript
// In convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "rollup reconciliation",
  { hours: 24 }, // Every 24 hours
  internal.ledger.rollups.reconcileMonthlyRollups,
  { schedule: "0 2 * * *" } // 02:00 UTC daily
);

export default crons;
```

**Monitoring:**
- Job execution visible in Convex dashboard logs
- Alert if job fails to run for >24 hours
- Track job duration and success rate
- Monitor drift detection results

### Testing Requirements

**Unit Tests:**
- `upsertMonthlyRollup` idempotency and correctness
- `calculateMonthlyRollup` accuracy vs manual calculation
- `updateRollupsOnTransaction` for create/update/delete operations
- Rollup data consistency validation

**Integration Tests:**
- End-to-end rollup creation via transaction mutations
- Reconciliation job processing multiple accounts
- Query performance with rollup data vs direct calculation
- Fallback behavior when rollup data unavailable

**Performance Tests:**
- Home dashboard load time with 1000+ transactions (< 1s target)
- Budget execution query time with 10+ accounts (< 200ms target)
- Reconciliation job completion time with 1000+ accounts (< 5min target)
- Rollup update performance on transaction mutations (< 100ms target)

**Edge Case Tests:**
- Rollup updates during month boundary transitions
- Reconciliation with missing journal_lines
- Rollup updates for soft-deleted accounts
- Drift detection with various tolerance levels

## Constraints & Non-Functional Requirements

### Performance
- **Home Dashboard Target**: Load in < 1 second for users with 1000+ transactions
- **Budget Execution Target**: Complete in < 200ms for budgets with 10+ accounts
- **Reconciliation Job Target**: Complete in < 5 minutes for 1000+ accounts
- **Rollup Update Target**: Complete in < 100ms per transaction mutation
- **Query Optimization**: All rollup queries MUST use appropriate indexes
- **Scalability**: Performance scales O(accounts) not O(transactions)

### Data Integrity
- Rollup values match direct calculation within 0.01% tolerance
- No missing rollup records for active accounts and recent months
- Rollup updates are atomic and consistent
- Reconciliation corrects all identified drift automatically

### Reliability
- Transaction mutations succeed even if rollup updates fail
- Reconciliation job never throws unhandled errors
- Failed rollup updates automatically retried by reconciliation
- System gracefully degrades to direct calculation when needed

### Security
- Rollup queries filtered by user ownership
- Internal mutations not exposed to client
- Cron job operates with system-level privileges
- No sensitive data exposed in rollup records

### Compatibility
- Rollup system compatible with existing budget and transaction systems
- No breaking changes to existing APIs
- Fallback to direct calculation maintains current functionality
- Rollup data supports future analytics features

### Observability
- Rollup update success rate monitored (target: >95%)
- Drift detection results logged and summarized
- Query performance metrics tracked (rollup vs direct)
- Reconciliation job completion status tracked

## Out of Scope

The following are explicitly **NOT** included in Phase 4.4:

- **Real-Time Rollups**: Rollups updated synchronously with every transaction (future optimization)
- **Multi-Currency Rollups**: Rollup data in multiple currencies (Phase 8)
- **Historical Rollup Backfill**: Creating rollups for months before implementation (future utility)
- **Rollup Analytics**: Advanced analytics using rollup data (future reporting)
- **Rollup Compression**: Archiving old rollup data (future optimization)
- **Rollup Validation UI**: User-facing rollup health dashboard (future admin feature)
- **Rollup Export**: CSV/PDF export of rollup data (future reporting)
- **Rollup API**: External API access to rollup data (future integration)
- **Rollup Notifications**: Alerts for rollup inconsistencies (future monitoring)
- **Rollup Backup**: Rollup data backup and recovery (future infrastructure)

## Success Metrics

- [ ] Home dashboard loads in < 1 second for users with 1000+ transactions
- [ ] Budget execution queries complete in < 200ms for budgets with 10+ accounts
- [ ] Rollup update success rate >95% on transaction mutations
- [ ] Reconciliation job completes in < 5 minutes for 1000+ accounts
- [ ] Drift detection identifies discrepancies > 0.01% between rollup and direct calculation
- [ ] Rollup data consistency verified through spot-check validation
- [ ] Query performance improvement: 5x faster for Home dashboard, 2.5x faster for budget execution
- [ ] No performance degradation in existing transaction or budget operations
- [ ] Reconciliation job runs successfully daily without failures
- [ ] Rollup system handles graceful degradation to direct calculation
- [ ] Comprehensive test coverage: Line coverage >90%, branch coverage >85% for rollups.ts and related functions
- [ ] Rollup metrics visible in Convex dashboard with clear success/error indicators

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Rollup data becomes inconsistent with journal_lines | High | **MITIGATED**: Daily reconciliation job with drift detection. Spot-check validation. Alert if drift >1%. Manual reconciliation utility available. |
| Rollup updates fail frequently, degrading performance | High | **MITIGATED**: Best-effort updates don't block transactions. Reconciliation job processes failed updates. Fallback to direct calculation maintains functionality. |
| Reconciliation job timeout with large account counts | Medium | **MITIGATED**: Batch processing (100 accounts per batch). Realistic 5-minute target. Parallel processing within batches. Monitor job duration trends. |
| Rollup queries return stale data affecting user decisions | Medium | **MITIGATED**: 24-hour maximum staleness. Best-effort synchronous updates. Clear dataSource indicator in query responses. |
| Rollup table growth causes storage issues | Low | **MITIGATED**: One record per account per month. Manageable growth rate. Future archiving strategy for old data. |
| Rollup system complexity increases maintenance burden | Medium | **MITIGATED**: Comprehensive logging and monitoring. Clear error messages. Fallback to direct calculation. Well-documented architecture. |
| Rollup updates cause transaction mutations to slow down | Low | **MITIGATED**: Best-effort updates in background. 100ms target per update. Failed updates don't block transactions. |
| Reconciliation job fails silently for extended periods | Medium | **MITIGATED**: External monitoring alerts for job failures. Manual trigger utility for testing. Comprehensive logging. |
| Rollup data corruption due to concurrent updates | Low | **MITIGATED**: Idempotent upsert operations. Atomic rollup updates. Reconciliation job corrects inconsistencies. |
| Rollup system adds complexity to debugging | Low | **MITIGATED**: Clear dataSource indicators. Comprehensive logging. Fallback to direct calculation for debugging. |

## Appendix

### Glossary
- **Monthly Rollup**: Pre-calculated monthly aggregate stored in monthly_rollups table
- **Best-Effort Update**: Rollup update that doesn't block transaction completion if it fails
- **Background Reconciliation**: Daily cron job that recalculates rollups and fixes drift
- **Drift Detection**: Comparison between rollup values and direct calculation to identify inconsistencies
- **Eventual Consistency**: Rollup data may be temporarily stale but will be corrected by reconciliation
- **Idempotent Upsert**: Operation that safely handles duplicate calls with same data
- **Rollup Fallback**: Query behavior when rollup data is unavailable or stale
- **Spot-Check Validation**: Random sampling of rollup data to verify consistency

### References
- Convex Cron Jobs: https://docs.convex.dev/scheduling/cron-jobs
- Convex Indexes: https://docs.convex.dev/database/indexes
- Convex Internal Functions: https://docs.convex.dev/functions/internal-functions
- Database Pre-Aggregation Patterns: https://docs.convex.dev/database/pre-aggregation
- Eventual Consistency Models: https://en.wikipedia.org/wiki/Eventual_consistency

### Related PRDs
- Phase 4.2: Budget System (Schema & Logic) - prerequisite
- Phase 4.3: Budget Historical Tracking - prerequisite
- Phase 4.5: UI Integration - next phase
- Phase 6.2: Home Screen Dashboard Migration - UI integration

### Code Examples

**Example 1: Query Monthly Summary with Rollups**
```typescript
// Get current month summary using rollup data
const summary = await getMonthlySummary({ month: getMonthStart(Date.now()) });

console.log(`Data source: ${summary.dataSource}`); // "rollups" or "direct_calculation"
console.log(`Total income: ${summary.totalIncome / 100}`); // Convert to currency units
console.log(`Total expenses: ${summary.totalExpenses / 100}`);
console.log(`Net balance: ${summary.netBalance / 100}`);
console.log(`Last updated: ${new Date(summary.lastUpdated).toISOString()}`);
```

**Example 2: Query Budget Execution with Rollups**
```typescript
// Get budget execution using rollup data
const execution = await getBudgetExecution({ budgetId: "j123..." });

console.log(`Data source: ${execution.dataSource}`); // "rollups" or "direct_calculation"
console.log(`Spent: ${execution.spentAmount / 100}`);
console.log(`Remaining: ${execution.remainingAmount / 100}`);
console.log(`Status: ${execution.status}`);
console.log(`Account breakdown: ${execution.accountBreakdown.length} accounts`);
```

**Example 3: Manual Rollup Reconciliation**
```typescript
// Trigger reconciliation job manually for testing
import { internal } from "./_generated/api";

export const testRollupReconciliation = internalMutation({
  handler: async (ctx) => {
    console.log("Manually triggering rollup reconciliation...");
    await ctx.scheduler.runAfter(0, internal.ledger.rollups.reconcileMonthlyRollups);
  },
});

// Call via Convex dashboard: testRollupReconciliation()
```

**Example 4: Check Rollup Health**
```typescript
// Check rollup data freshness and consistency
const rollups = await ctx.db
  .query("monthly_rollups")
  .withIndex("by_last_reconciled", q => q.lt("lastReconciled", Date.now() - (24 * 60 * 60 * 1000)))
  .collect();

console.log(`Stale rollups: ${rollups.length}`);
rollups.forEach(rollup => {
  console.log(`Account ${rollup.accountId} month ${rollup.month} last reconciled: ${new Date(rollup.lastReconciled).toISOString()}`);
});
```

**Example 5: Calculate Rollup for Specific Account**
```typescript
// Calculate rollup data for an account manually
const rollup = await calculateMonthlyRollup({
  userId: "u123...",
  accountId: "a456...",
  month: getMonthStart(Date.now()),
});

if (rollup) {
  console.log(`Total debits: ${rollup.totalDebits}`);
  console.log(`Total credits: ${rollup.totalCredits}`);
  console.log(`Net amount: ${rollup.netAmount}`);
  console.log(`Transaction count: ${rollup.transactionCount}`);
} else {
  console.log("Account not found or no transactions in month");
}
```

**Example 6: Update Rollups on Transaction**
```typescript
// Update rollups when transaction is created
const result = await updateRollupsOnTransaction({
  journalEntryId: "j789...",
  updateType: "create",
});

console.log(`Rollup update status: ${result.status}`);
result.results?.forEach(r => {
  console.log(`Account ${r.accountId} month ${r.month}: ${r.status}`);
});
```

---

## Implementation Checklist

**Pre-Implementation:**
- [ ] Review Phase 4.2 and 4.3 implementations for context
- [ ] Verify existing budget and transaction systems are working correctly
- [ ] Add `monthly_rollups` table to `convex/schema.ts` with all required indexes
- [ ] Review Convex platform constraints (cron job limits, timeout behavior)
- [ ] Set up test accounts with various transaction volumes for performance testing
- [ ] Review existing query performance baselines for comparison

**Core Implementation:**
- [ ] Create `convex/ledger/rollups.ts` with rollup CRUD operations
- [ ] Create `convex/ledger/monthlySummary.ts` with optimized summary queries
- [ ] Update `convex/ledger/budgetExecution.ts` with rollup-optimized execution
- [ ] Update `convex/ledger/accounts.ts` with `listActiveAccounts` internal query
- [ ] Implement `upsertMonthlyRollup` internal mutation with idempotency
- [ ] Implement `calculateMonthlyRollup` internal query for reconciliation
- [ ] Implement `reconcileMonthlyRollups` internal action (cron job handler)
- [ ] Implement `updateRollupsOnTransaction` internal mutation for best-effort updates
- [ ] Update `getMonthlySummary` query with rollup integration and fallback
- [ ] Update `getBudgetExecution` query with rollup integration and fallback

**Cron Job Setup:**
- [ ] Add `rollupReconciliation` job to `convex/crons.ts`
- [ ] Configure schedule: "0 2 * * *" (daily at 02:00 UTC)
- [ ] Test cron job manually via utility mutation
- [ ] Verify cron job appears in Convex dashboard scheduled jobs

**Transaction Integration:**
- [ ] Update `addExpense` mutation to call `updateRollupsOnTransaction`
- [ ] Update `addTransfer` mutation to call `updateRollupsOnTransaction`
- [ ] Update `updateExpense` mutation to call `updateRollupsOnTransaction`
- [ ] Update `deleteExpense` mutation to call `updateRollupsOnTransaction`
- [ ] Ensure rollup update failures don't block transaction completion

**Testing:**
- [ ] Unit tests for `upsertMonthlyRollup` idempotency and correctness
- [ ] Unit tests for `calculateMonthlyRollup` accuracy
- [ ] Unit tests for `updateRollupsOnTransaction` for all operation types
- [ ] Integration test: rollup creation via transaction mutations
- [ ] Integration test: reconciliation job processing multiple accounts
- [ ] Integration test: query performance with rollup data vs direct calculation
- [ ] Integration test: fallback behavior when rollup data unavailable
- [ ] Performance test: Home dashboard with 1000+ transactions (< 1s)
- [ ] Performance test: Budget execution with 10+ accounts (< 200ms)
- [ ] Performance test: Reconciliation job with 1000+ accounts (< 5min)

**Integration:**
- [ ] Update Home dashboard to use optimized `getMonthlySummary` query
- [ ] Update budget execution display to use optimized `getBudgetExecution` query
- [ ] Add data source indicators to UI (rollups vs direct calculation)
- [ ] Add rollup health monitoring to admin dashboard (optional)

**Documentation:**
- [ ] Add JSDoc comments to all public functions
- [ ] Document rollup system architecture and consistency model
- [ ] Document reconciliation job schedule and behavior
- [ ] Document performance improvements and fallback behavior
- [ ] Update user-facing documentation with performance improvements

**Validation:**
- [ ] Manual testing: create transactions, verify rollup updates
- [ ] Manual testing: run reconciliation job, verify drift detection
- [ ] Manual testing: query performance with rollup data
- [ ] Spot check: compare rollup values with direct calculation
- [ ] Monitor rollup system for 1 week post-deployment

**Deployment:**
- [ ] Deploy to dev environment first
- [ ] Verify rollup system works correctly in dev
- [ ] Deploy to production
- [ ] Monitor rollup system for first 3 days post-production deployment
- [ ] Verify performance improvements in production

---

## Document Revision History

**Version 1.0 - January 15, 2025**

Initial PRD for Phase 4.4 Pre-Aggregation System:

**Key Features:**
1. **Monthly Rollups Table**: Pre-calculated monthly aggregates by account for performance optimization
2. **Background Reconciliation**: Daily cron job ensuring rollup consistency with journal_lines
3. **Best-Effort Updates**: Transaction mutations attempt rollup updates without blocking completion
4. **Query Optimization**: Home dashboard and budget execution queries use rollups with fallback
5. **Performance Targets**: Home dashboard < 1s, budget execution < 200ms for large datasets
6. **Eventual Consistency**: Rollup data may be stale up to 24 hours but corrected by reconciliation
7. **Graceful Degradation**: System falls back to direct calculation when rollups unavailable
8. **Comprehensive Monitoring**: Rollup health, drift detection, and performance metrics

**Technical Implementation:**
- `monthly_rollups` table with composite indexes for efficient querying
- `upsertMonthlyRollup` internal mutation with idempotency guarantees
- `reconcileMonthlyRollups` internal action for daily reconciliation
- `updateRollupsOnTransaction` internal mutation for best-effort updates
- Optimized queries with rollup integration and fallback mechanisms
- Cron job configuration for daily reconciliation at 02:00 UTC

**Performance Improvements:**
- Home dashboard: 2.5s → 0.3s (5x improvement)
- Budget execution: 500ms → 200ms (2.5x improvement)
- Query scalability: O(transactions) → O(accounts)
- Reconciliation job: < 5 minutes for 1000+ accounts

**All acceptance criteria, technical specifications, and implementation details included.**
