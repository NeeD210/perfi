# Phase 4.3: Budget Lines & Historical Tracking PRD

## ⚠️ CRITICAL PREREQUISITE

**Schema Migration Required**: This phase requires updating the existing `budget_lines` schema in production. Before implementation:
1. Verify `budget_lines` table is empty (expected state from Phase 4.2)
2. Update `convex/schema.ts` with new schema definition
3. Deploy schema changes to production

See [Schema Migration Strategy](#schema-migration-strategy) section for full details.

---

## Introduction

This PRD covers the implementation of historical budget tracking for PerFi's budget system. While Phase 4.2 established real-time budget execution calculation from `journal_lines`, this phase adds persistent historical records through the `budget_lines` table, enabling users to analyze budget performance trends over time and understand their spending patterns across multiple periods.

The historical tracking system captures budget execution snapshots at period boundaries, creating a time-series record of budget performance. This foundation enables future features like budget trend analysis, spending pattern recognition, and predictive budget recommendations.

This is Phase 4.3 of the PerFi accounting core migration, building directly on the budget system delivered in Phase 4.2 and preparing for the pre-aggregation optimizations planned in Phase 4.4.

## Context & Background

### Current System
- Complete budget system with three scope types (singleAccount, multipleAccounts, accountType) implemented in Phase 4.2
- Real-time budget execution calculation from `journal_lines` aggregation (current period only)
- `budget_lines` table defined in schema but empty and unused
- No historical budget performance data available
- Users can only see current period execution, not historical trends
- No automated period rollover mechanism
- No scheduled background jobs for budget processing

### Target System
- Automated background job capturing budget execution at period boundaries
- `budget_lines` table populated with historical execution snapshots
- Historical query endpoints showing budget performance over time
- Time-series data enabling trend analysis and pattern recognition
- Mid-period budget line creation on demand for historical queries
- Support for all six budget frequencies (daily, weekly, monthly, quarterly, semestrally, yearly)
- Graceful handling of budget modifications (amount changes, soft-deletes)
- Foundation for future budget analytics and forecasting features

### Technology Stack
- **Backend**: Convex (TypeScript) with existing ledger and budget infrastructure
- **Database**: Convex NoSQL with existing `budgets`, `journal_entries`, `journal_lines` tables
- **Scheduled Jobs**: Convex cron system for automated period rollover processing
- **Validation**: Convex `v` validators with existing budget enums
- **Queries**: Time-series aggregation from `budget_lines` with proper indexing

### Key Concepts

**Budget Lines**: Historical execution records capturing budget performance at specific period boundaries. Each line represents one period's execution for one budget.

**Period Rollover**: The transition from one budget period to the next (e.g., midnight on the 1st of the month for monthly budgets). At rollover, the system creates a `budget_lines` record capturing the previous period's execution.

**Historical Tracking**: The ability to query past budget performance across multiple periods, enabling trend analysis and pattern recognition.

**On-Demand Line Creation**: When querying historical execution for periods without existing `budget_lines` records (e.g., after budget creation mid-period), the system can calculate and optionally persist historical lines on demand.

## User Stories

**US1:** *As a user, I want to see my budget performance history over the past 6 months, so I can understand my spending trends and adjust my budgets accordingly.*

**US2:** *As a user, I want my budget history to automatically update each period without manual intervention, so I can focus on managing my finances rather than tracking data.*

**US3:** *As a user, I want to see if I stayed within budget in previous periods, so I can assess whether my budget limits are realistic or need adjustment.*

**US4:** *As a developer, I need budget history to be captured reliably at period boundaries, so historical data is complete and accurate for analytics.*

**US5:** *As a developer, I need efficient historical queries that don't recalculate execution from raw journal_lines every time, so the system remains performant as data grows.*

**US6:** *As a system administrator, I need the background job to handle failures gracefully and retry, so budget tracking continues working reliably in production.*

## Acceptance Criteria

### For US1 (Historical Budget Performance Query):

**Query Functionality:**
- [ ] `getBudgetHistory` query accepts budgetId and optional date range parameters
- [ ] Query returns array of historical execution records sorted by period start (most recent first)
- [ ] Each record includes: periodStart, periodEnd, budgetAmount, spentAmount, remainingAmount, percentUsed, status
- [ ] Query supports pagination for budgets with many historical periods (e.g., daily budgets over years)
- [ ] Query filters by date range when specified (e.g., "last 6 months", "2024 only")
- [ ] Query defaults to last 12 periods if no date range specified
- [ ] Query handles budgets created mid-period by including partial first period

**Data Completeness:**
- [ ] Historical data available for all periods since budget creation
- [ ] Missing periods (pre-cron implementation) can be backfilled on demand
- [ ] Current period execution calculated in real-time (not from budget_lines)
- [ ] Historical execution read from budget_lines (not recalculated from journal_lines)

**Performance:**
- [ ] Query completes in < 100ms for typical datasets (12 periods)
- [ ] Query uses `by_budgetId_periodStart` index for efficient filtering
- [ ] Pagination prevents memory issues for budgets with hundreds of periods

**Example Response:**
```typescript
[
  {
    periodStart: 1727740800000, // Oct 1, 2025 00:00 UTC
    periodEnd: 1730419199999,   // Oct 31, 2025 23:59:59 UTC
    budgetAmount: 50000,        // Budget amount at time of period (snapshot)
    spentAmount: 48200,
    remainingAmount: 1800,
    percentUsed: 96.4,
    status: "under_budget"
  },
  {
    periodStart: 1725148800000, // Sep 1, 2025 00:00 UTC
    periodEnd: 1727740799999,   // Sep 30, 2025 23:59:59 UTC
    budgetAmount: 45000,        // User increased budget to 50000 in Oct, but Sep was 45000
    spentAmount: 43100,
    remainingAmount: 1900,
    percentUsed: 95.8,          // Accurate: 43100/45000, not recalculated with new amount
    status: "under_budget"
  },
  // ... more periods
]
```

### For US2 (Automated Period Rollover):

**Background Job Configuration:**
- [ ] Cron job runs daily at 00:05 UTC (5 minutes after midnight to ensure day rollover)
- [ ] Job queries all active budgets (`softdelete = false`)
- [ ] Job checks each budget's `nextDueDate` to determine if period rolled over
- [ ] Job processes budgets in batches (50 budgets per batch) to prevent timeouts
- [ ] Job updates `nextDueDate` to next period start after creating budget_lines record

**Budget Line Creation Logic:**
- [ ] For each budget with `nextDueDate <= currentTime`:
  - [ ] Calculate previous period boundaries from `nextDueDate - 1ms`
  - [ ] Aggregate journal_lines for previous period using existing execution logic
  - [ ] Insert `budget_lines` record with execution snapshot
  - [ ] Update `budget.nextDueDate` to next period start
  - [ ] Log successful processing
- [ ] Skip budgets with `endDate` in the past (expired budgets)
- [ ] Handle soft-deleted budgets: If current period has ended (`nextDueDate <= currentTime`), create final budget_lines record for that period, then stop processing. Never process future periods for soft-deleted budgets.

**Multi-Period Catchup Logic:**
- [ ] If cron job fails for multiple days, catch up all missed periods in single run
- [ ] Loop: While `nextDueDate <= currentTime` AND `periodsCreated < MAX_CATCHUP_PERIODS`, create budget_line for that period and advance `nextDueDate`
- [ ] Safety limit: `MAX_CATCHUP_PERIODS = 100` to prevent runaway loops
- [ ] If catchup limit reached, log warning and continue in next cron run
- [ ] Example: If cron fails for 7 days, a daily budget creates 7 budget_lines in single run

**Idempotency & Error Handling:**
- [ ] Idempotency: check if budget_lines record exists for period before creating
- [ ] Use composite key: `(budgetId, periodStart)` to prevent duplicates
- [ ] If budget_lines exists for period, skip creation but still update `nextDueDate`
- [ ] Log warnings for budgets where execution calculation fails (e.g., deleted accounts)
- [ ] Continue processing remaining budgets if individual budget fails
- [ ] Retry failed budgets in next cron run (idempotent by design)

**Observability:**
- [ ] Log job start with timestamp and budget count
- [ ] Log successful budget line creation (budgetId, period, spentAmount)
- [ ] Log warnings for skipped budgets (reason: expired, deleted, etc.)
- [ ] Log errors for failed executions (budgetId, error message)
- [ ] Log job completion with summary: processed count, created count, error count, duration
- [ ] Expose metrics via Convex dashboard: job run frequency, success rate, duration

### For US3 (Historical Status Indicators):

**Status Persistence:**
- [ ] Each `budget_lines` record includes `status` field
- [ ] Status values: `"under_budget"`, `"at_budget"`, `"over_budget"`
- [ ] Status calculated using same logic as real-time execution:
  - [ ] `"under_budget"`: spentAmount < budgetAmount
  - [ ] `"at_budget"`: spentAmount >= budgetAmount && spentAmount < budgetAmount * 1.05
  - [ ] `"over_budget"`: spentAmount >= budgetAmount * 1.05

**Trend Analysis Support:**
- [ ] `getBudgetHistory` includes status for each period
- [ ] UI can display status indicators (green/yellow/red) for historical periods
- [ ] Query supports filtering by status (e.g., "show only periods I went over budget")
- [ ] Calculate success rate: `(periods under budget) / (total periods) * 100`

### For US4 (Reliable Historical Capture):

**Data Integrity:**
- [ ] Budget lines capture all execution metrics at period boundary
- [ ] Snapshot includes budgetAmount at time of period end (handles budget updates mid-period)
- [ ] Execution calculation matches real-time calculation for same period
- [ ] No missing periods (cron runs daily, catches all budget frequencies)
- [ ] Budget modifications (amount changes) reflected in subsequent budget_lines

**Validation:**
- [ ] Verify budget_lines execution matches recalculation from journal_lines (spot checks)
- [ ] Verify period boundaries align with budget frequency (daily, weekly, monthly, etc.)
- [ ] Verify no duplicate budget_lines for same budgetId + periodStart
- [ ] Verify `nextDueDate` correctly updated to next period start

**Audit Trail:**
- [ ] `budget_lines` includes `createdAt` timestamp (when snapshot was captured)
- [ ] Track whether line was created by cron job vs. on-demand calculation
- [ ] Log all budget_lines insertions with budgetId and period for debugging

### For US5 (Performant Historical Queries):

**Query Optimization:**
- [ ] Historical queries read from `budget_lines` table (not recalculating from journal_lines)
- [ ] Only current period execution recalculated in real-time
- [ ] Use `by_budgetId_periodStart` index for efficient filtering
- [ ] Pagination for large result sets (>100 periods)
- [ ] Limit default query to last 12 periods to prevent overwhelming UI

**Performance Benchmarks:**
- [ ] `getBudgetHistory` query completes in < 100ms for 12 periods
- [ ] `getBudgetHistory` query completes in < 200ms for 50 periods
- [ ] Query scales linearly with period count (no N+1 queries)
- [ ] Cron job completes in < 30 seconds for 100 active budgets

### For US6 (Reliable Background Job):

**Error Handling:**
- [ ] Job catches errors per budget, continues processing remaining budgets
- [ ] Failed budget executions logged with error details
- [ ] Job always completes (never throws unhandled error crashing the job)
- [ ] Retry logic: failed budgets automatically retried in next job run (idempotent)

**Monitoring:**
- [ ] Job execution visible in Convex dashboard logs
- [ ] Alert if job fails to run for >24 hours (indicates critical failure)
- [ ] Alert if error rate > 10% (indicates systemic issue)
- [ ] Track job duration trend (increasing duration may indicate scaling issue)

**Graceful Degradation:**
- [ ] If cron job fails, users can still view current period execution (Phase 4.2)
- [ ] Historical data remains accessible even if current cron run fails
- [ ] Manual backfill utility available for recovering missing periods

## Detailed Specifications

### Schema Migration Strategy

**CRITICAL PREREQUISITE**: The existing `budget_lines` schema in production must be migrated before implementing this phase.

**Current Production Schema (convex/schema.ts):**
```typescript
budget_lines: defineTable({
  budgetId: v.id("budgets"),
  userId: v.id("users"),
  accountId: v.id("accounts"),
  amount: v.number(),
  startDate: v.number(),
  endDate: v.number(),
  softdelete: v.boolean(),
  deletedAt: v.optional(v.number()),
})
```

**Required Schema for Phase 4.3:**
```typescript
budget_lines: defineTable({
  budgetId: v.id("budgets"),
  periodStart: v.number(), // Epoch ms (inclusive) of period start
  periodEnd: v.number(), // Epoch ms (inclusive) of period end
  spentAmount: v.number(), // Amount spent/earned in period (minor units)
  remainingAmount: v.number(), // budgetAmount - spentAmount (can be negative)
  percentUsed: v.number(), // (spentAmount / budgetAmount) * 100, capped at 999
  budgetAmount: v.number(), // Budget amount at time of period end (snapshot for historical accuracy)
  status: v.union(
    v.literal("under_budget"),
    v.literal("at_budget"),
    v.literal("over_budget")
  ),
  createdAt: v.number(), // Epoch ms when this record was created (audit trail)
})
```

**Migration Steps:**
1. **Verification**: Confirm `budget_lines` table is empty in production (expected state based on Phase 4.2)
2. **Schema Update**: Update `convex/schema.ts` with new schema definition
3. **Deploy**: Push schema changes to production (safe operation if table is empty)
4. **Validation**: Verify schema update successful via Convex dashboard

**If Budget_Lines Table Is Not Empty:**
- Create migration script to transform existing records (unlikely scenario)
- Map fields: `startDate → periodStart`, `endDate → periodEnd`
- Backfill new fields by recalculating execution from journal_lines for each period
- Keep original `createdAt` timestamp for audit trail

### budget_lines Table Schema

**Purpose**: Store historical budget execution snapshots at period boundaries

**Fields:**
```typescript
{
  id: v.id("budget_lines"),
  budgetId: v.id("budgets"), // Parent budget reference
  periodStart: v.number(), // Epoch ms (inclusive) of period start
  periodEnd: v.number(), // Epoch ms (inclusive) of period end
  spentAmount: v.number(), // Amount spent/earned in period (minor units)
  remainingAmount: v.number(), // budgetAmount - spentAmount (can be negative)
  percentUsed: v.number(), // (spentAmount / budgetAmount) * 100, capped at 999
  budgetAmount: v.number(), // Budget amount at time of period end (SNAPSHOT for historical accuracy)
  status: v.union(
    v.literal("under_budget"),
    v.literal("at_budget"),
    v.literal("over_budget")
  ),
  createdAt: v.number(), // Epoch ms when this record was created (audit trail)
}
```

**Budget Amount Storage Decision**: Store `budgetAmount` as snapshot in each budget_lines record.

**Rationale:**
- **Historical Accuracy**: If a user changes their budget amount mid-period, historical "percent used" calculations remain accurate. Example: User has $500/month budget in January (spends $450 = 90%), then increases to $800/month in February. Historical data should show January as 90% used, not recalculated as 56% with new budget amount.
- **Query Simplicity**: No join required with budgets table for historical queries. All data is denormalized in budget_lines.
- **Data Integrity**: Historical records are immutable snapshots, not dependent on mutable budget records.
- **Storage Cost**: Minimal - one additional number field per record (8 bytes). For 1000 budgets × 12 months = 12,000 records × 8 bytes = 96 KB total.
- **User Research**: While budget amount changes may be "rare", the impact of inaccurate historical data is HIGH. Users need trustworthy trends to make financial decisions.

**Trade-off**: Slight schema complexity (one extra field) for significantly improved historical accuracy and query performance.

**Indexes:**
- `by_budgetId_periodStart`: `(budgetId, periodStart desc)`
  - **Usage**: Query historical lines for a specific budget, sorted by period (most recent first)
  - **Performance**: Critical for `getBudgetHistory` query efficiency
  - **Cardinality**: Typical budget has 12-24 periods (monthly over 1-2 years). Index must efficiently support up to 1000 periods (daily budgets over 3 years).
- `by_budgetId`: `(budgetId)`
  - **Usage**: Retrieve all historical lines for a budget (e.g., for analytics, trend charts)
  - **Performance**: Efficient for queries without date filtering

**Status Validator (convex/ledger/validators.ts):**
```typescript
export const budgetStatusValidator = v.union(
  v.literal("under_budget"),
  v.literal("at_budget"),
  v.literal("over_budget")
);
```

**Business Rules:**
- Each budget can have many budget_lines (one per period)
- `periodStart` and `periodEnd` must align with budget frequency boundaries
- Composite uniqueness constraint: `(budgetId, periodStart)` must be unique (enforced via idempotency check in code)
- `spentAmount` must be non-negative for expense budgets, can be negative for income budgets (if income falls short of target)
- `remainingAmount` can be negative when over budget
- `percentUsed` capped at 999 for display purposes (e.g., 1000% over budget shows as 999%)
- `status` calculated deterministically from spentAmount and budgetAmount using Phase 4.2 logic
- `createdAt` tracks when snapshot was captured (not when period ended)

**Validation Rules:**
- `periodStart` must be < `periodEnd`
- `periodEnd` must be < current time (cannot create lines for future periods)
- `budgetId` must reference existing budget
- `status` must match calculated status from spentAmount and budgetAmount (validated before insert)

### createBudgetLine Internal Mutation

**Purpose**: Create a historical budget execution snapshot (internal function, not exposed to clients)

**Registration**: This is registered as an internal mutation using `internalMutation` from `./_generated/server` in `convex/ledger/budgetLines.ts` and callable via `internal.ledger.budgetLines.createBudgetLine`.

**Input Validator:**
```typescript
{
  budgetId: v.id("budgets"),
  periodStart: v.number(), // Epoch ms
  periodEnd: v.number(), // Epoch ms
  spentAmount: v.number(), // Amount in minor units
  remainingAmount: v.number(), // Can be negative
  percentUsed: v.number(), // 0-999
  budgetAmount: v.number(), // Budget amount at time of period end (snapshot)
  status: budgetStatusValidator, // Extracted validator for reuse
}
```

**Output:**
```typescript
{
  budgetLineId: Id<"budget_lines">,
  status: "success",
}
```

**Business Logic Flow:**
```typescript
async function createBudgetLine(ctx, args) {
  // 1. Validate budget exists
  const budget = await ctx.db.get(args.budgetId);
  if (!budget) {
    throw new ConvexError("BUDGET_NOT_FOUND", "Budget does not exist");
  }
  
  // 2. Check for existing budget_line (idempotency)
  const existingLine = await ctx.db
    .query("budget_lines")
    .withIndex("by_budgetId_periodStart", q =>
      q.eq("budgetId", args.budgetId).eq("periodStart", args.periodStart)
    )
    .first();
  
  if (existingLine) {
    // Line already exists, return existing ID
    console.log(`Budget line already exists for budget ${args.budgetId} period ${args.periodStart}`);
    return { budgetLineId: existingLine._id, status: "already_exists" };
  }
  
  // 3. Validate period boundaries
  if (args.periodStart >= args.periodEnd) {
    throw new ConvexError("INVALID_PERIOD", "periodStart must be before periodEnd");
  }
  if (args.periodEnd >= Date.now()) {
    throw new ConvexError("INVALID_PERIOD", "Cannot create budget line for future period");
  }
  
  // 4. Insert budget_lines record
  const budgetLineId = await ctx.db.insert("budget_lines", {
    budgetId: args.budgetId,
    periodStart: args.periodStart,
    periodEnd: args.periodEnd,
    spentAmount: args.spentAmount,
    remainingAmount: args.remainingAmount,
    percentUsed: args.percentUsed,
    budgetAmount: args.budgetAmount,
    status: args.status,
    createdAt: Date.now(),
  });
  
  console.log(`Created budget line ${budgetLineId} for budget ${args.budgetId}: ${args.status}, ${args.percentUsed}% used`);
  
  return { budgetLineId, status: "success" };
}
```

**Error Conditions:**
- `BUDGET_NOT_FOUND`: Budget reference is invalid
- `INVALID_PERIOD`: Period boundaries are invalid or in the future

**Idempotency**: Function checks for existing budget_lines record with same `(budgetId, periodStart)` before inserting. If found, returns existing record ID without error.

### processBudgetRollover Internal Action

**Purpose**: Scheduled background job that processes period rollovers for all active budgets

**Trigger**: Convex cron job runs daily at 00:05 UTC

**Convex Platform Constraints:**
- **Cron Timeout**: Convex cron jobs have no hard timeout limit, but jobs should complete within reasonable time (target: <60 seconds)
- **Batch Size**: Process 50 budgets per batch to ensure responsive processing and avoid memory pressure
- **Concurrency**: Batches process in parallel using `Promise.allSettled`
- **Retry Strategy**: Failed budgets automatically retried in next cron run (idempotent design)

**Timezone Policy:**
- **All period boundaries calculated in UTC**: Budget periods align to UTC day/week/month boundaries
- **Rationale**: Consistent behavior across all users regardless of geographic location. Simplifies period calculation and prevents ambiguity during DST transitions.
- **User Impact**: A "monthly" budget resets at 00:00 UTC on the 1st of each month. Weekly budgets follow ISO 8601 (Monday 00:00 UTC = week start).

**Business Logic Flow:**
```typescript
async function processBudgetRollover(ctx) {
  const startTime = Date.now();
  let processed = 0;
  let created = 0;
  let errors = 0;
  
  console.log(`[Budget Rollover] Job started at ${new Date(startTime).toISOString()}`);
  
  try {
    // 1. Query all active budgets
    const budgets = await ctx.runQuery(internal.ledger.budgets.listActiveBudgets);
    console.log(`[Budget Rollover] Found ${budgets.length} active budgets`);
    
    // 2. Process budgets in batches of 50 to prevent timeout
    const BATCH_SIZE = 50;
    for (let i = 0; i < budgets.length; i += BATCH_SIZE) {
      const batch = budgets.slice(i, i + BATCH_SIZE);
      
      // Process batch in parallel
      const results = await Promise.allSettled(
        batch.map(budget => processSingleBudget(ctx, budget))
      );
      
      // Count results
      for (const result of results) {
        processed++;
        if (result.status === "fulfilled") {
          created += result.value.periodsCreated;
        } else if (result.status === "rejected") {
          errors++;
          console.error(`[Budget Rollover] Error processing budget: ${result.reason}`);
        }
      }
    }
    
    const duration = Date.now() - startTime;
    console.log(`[Budget Rollover] Job completed: ${processed} processed, ${created} lines created, ${errors} errors, ${duration}ms`);
  } catch (error) {
    console.error(`[Budget Rollover] Job failed: ${error}`);
    // Don't throw - allow job to complete even if partially failed
  }
}

async function processSingleBudget(ctx, budget) {
  const currentTime = Date.now();
  let periodsCreated = 0;
  const MAX_CATCHUP_PERIODS = 100; // Safety limit to prevent runaway loops
  
  // Skip if budget hasn't reached nextDueDate yet
  if (budget.nextDueDate > currentTime) {
    return { budgetId: budget._id, periodsCreated: 0, reason: "not_due" };
  }
  
  // Handle soft-deleted budgets: create final period if current period has ended, then stop
  if (budget.softdelete) {
    console.log(`[Budget Rollover] Budget ${budget._id} is soft-deleted, creating final period if due`);
    if (budget.nextDueDate <= currentTime) {
      // Create final period, then skip
      const previousPeriodEnd = budget.nextDueDate - 1;
      const { periodStart } = calculatePeriodBoundaries(budget.frequency, previousPeriodEnd);
      const execution = await ctx.runQuery(internal.ledger.budgetExecution.calculateExecutionForPeriod, {
        budgetId: budget._id,
        periodStart,
        periodEnd: previousPeriodEnd,
      });
      
      if (execution) {
        await ctx.runMutation(internal.ledger.budgetLines.createBudgetLine, {
          budgetId: budget._id,
          periodStart,
          periodEnd: previousPeriodEnd,
          spentAmount: execution.spentAmount,
          remainingAmount: execution.remainingAmount,
          percentUsed: execution.percentUsed,
          budgetAmount: budget.amount, // Snapshot budget amount at period end
          status: execution.status,
        });
        periodsCreated++;
      }
    }
    return { budgetId: budget._id, periodsCreated, reason: "soft_deleted_final_period" };
  }
  
  // Skip if budget has expired (endDate in past)
  if (budget.endDate && budget.endDate < currentTime) {
    console.log(`[Budget Rollover] Skipping expired budget ${budget._id}`);
    return { budgetId: budget._id, periodsCreated: 0, reason: "expired" };
  }
  
  // Multi-period catchup loop: process all periods from nextDueDate to currentTime
  let workingNextDueDate = budget.nextDueDate;
  
  while (workingNextDueDate <= currentTime && periodsCreated < MAX_CATCHUP_PERIODS) {
  // Calculate previous period boundaries
    const previousPeriodEnd = workingNextDueDate - 1; // 1ms before new period starts
  const { periodStart } = calculatePeriodBoundaries(
    budget.frequency,
    previousPeriodEnd
  );
  
  // Calculate execution for previous period
  const execution = await ctx.runQuery(internal.ledger.budgetExecution.calculateExecutionForPeriod, {
    budgetId: budget._id,
    periodStart,
    periodEnd: previousPeriodEnd,
  });
  
  if (!execution) {
      console.warn(`[Budget Rollover] Could not calculate execution for budget ${budget._id} period ${periodStart}`);
      break; // Stop processing this budget, will retry in next cron run
  }
  
  // Create budget_lines record (idempotent)
  const result = await ctx.runMutation(internal.ledger.budgetLines.createBudgetLine, {
    budgetId: budget._id,
    periodStart,
    periodEnd: previousPeriodEnd,
    spentAmount: execution.spentAmount,
    remainingAmount: execution.remainingAmount,
    percentUsed: execution.percentUsed,
      budgetAmount: budget.amount, // Snapshot budget amount at period end
    status: execution.status,
  });
  
    if (result.status === "success") {
      periodsCreated++;
    }
    
    // Advance to next period
    workingNextDueDate = calculateNextDueDate(workingNextDueDate, budget.frequency);
  }
  
  // Update budget.nextDueDate to caught-up date
  if (periodsCreated > 0) {
  await ctx.runMutation(internal.ledger.budgets.updateNextDueDate, {
    budgetId: budget._id,
      nextDueDate: workingNextDueDate,
    });
  }
  
  if (periodsCreated >= MAX_CATCHUP_PERIODS) {
    console.warn(`[Budget Rollover] Budget ${budget._id} hit catchup limit (${MAX_CATCHUP_PERIODS} periods). Will continue in next run.`);
  }
  
  return { budgetId: budget._id, periodsCreated, reason: "success" };
}
```

**Cron Configuration:**
```typescript
// In convex/crons.ts
export default {
  budgetRollover: {
    schedule: "5 0 * * *", // Daily at 00:05 UTC (5 minutes after midnight)
    handler: internal.ledger.budgetLines.processBudgetRollover,
  },
};
```

**Error Handling Strategy:**
- Catch errors at individual budget level, continue processing remaining budgets
- Log all errors with budget ID and error message for debugging
- Failed budgets automatically retried in next cron run (idempotent design)
- Job never throws unhandled error (prevents cron failure cascade)

**Performance Considerations:**
- Batch processing (50 budgets per batch) prevents timeout for large budget counts
- Parallel processing within batches (Promise.allSettled) for speed
- Idempotency check prevents duplicate budget_lines creation
- Job completes in < 30 seconds for 100 active budgets (benchmark)

### getBudgetHistory Query

**Purpose**: Retrieve historical budget execution records for a budget

**Input Validator:**
```typescript
{
  budgetId: v.id("budgets"),
  startDate: v.optional(v.number()), // Filter: only periods after this date
  endDate: v.optional(v.number()), // Filter: only periods before this date
  limit: v.optional(v.number()), // Pagination: max records to return (default 12)
}
```

**Output:**
```typescript
{
  budgetId: Id<"budgets">,
  currentBudgetAmount: number, // Current budget amount from budgets table
  history: Array<{
    periodStart: number,
    periodEnd: number,
    budgetAmount: number, // Budget amount at time of period (snapshot from budget_lines)
    spentAmount: number,
    remainingAmount: number,
    percentUsed: number,
    status: "under_budget" | "at_budget" | "over_budget",
    createdAt: number,
  }>,
  hasMore: boolean, // True if more records available beyond limit
}
```

**Business Logic Flow:**
```typescript
async function getBudgetHistory(ctx, args) {
  // 1. Authenticate user
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("UNAUTHORIZED");
  const user = await getUserByAuth0Id(ctx, identity.subject);
  
  // 2. Retrieve budget and validate ownership
  const budget = await ctx.db.get(args.budgetId);
  if (!budget || budget.userId !== user._id) {
    throw new ConvexError("BUDGET_NOT_FOUND", "Budget not found or access denied");
  }
  
  // 3. Build query with filters
  const limit = args.limit ?? 12;
  let query = ctx.db
    .query("budget_lines")
    .withIndex("by_budgetId_periodStart", q => q.eq("budgetId", args.budgetId))
    .order("desc"); // Most recent first
  
  // 4. Collect budget lines with pagination
  const allLines = await query.collect();
  
  // 5. Apply date filters if provided
  let filteredLines = allLines;
  if (args.startDate) {
    filteredLines = filteredLines.filter(line => line.periodStart >= args.startDate!);
  }
  if (args.endDate) {
    filteredLines = filteredLines.filter(line => line.periodEnd <= args.endDate!);
  }
  
  // 6. Apply pagination
  const hasMore = filteredLines.length > limit;
  const history = filteredLines.slice(0, limit);
  
  // 7. Return results
  return {
    budgetId: budget._id,
    currentBudgetAmount: budget.amount,
    history: history.map(line => ({
      periodStart: line.periodStart,
      periodEnd: line.periodEnd,
      budgetAmount: line.budgetAmount, // Historical budget amount snapshot
      spentAmount: line.spentAmount,
      remainingAmount: line.remainingAmount,
      percentUsed: line.percentUsed,
      status: line.status,
      createdAt: line.createdAt,
    })),
    hasMore,
  };
}
```

**Performance:**
- Uses `by_budgetId_periodStart` index for efficient query
- Default limit of 12 periods prevents overwhelming UI
- Pagination support for budgets with many periods (e.g., daily budgets over years)
- Query completes in < 100ms for typical datasets

**Error Conditions:**
- `UNAUTHORIZED`: User not authenticated
- `BUDGET_NOT_FOUND`: Budget does not exist or user lacks access

### getBudgetHistoryWithCurrent Query

**Purpose**: Retrieve historical budget execution PLUS current period (real-time calculation)

**Input Validator:**
```typescript
{
  budgetId: v.id("budgets"),
  startDate: v.optional(v.number()),
  endDate: v.optional(v.number()),
  limit: v.optional(v.number()), // Default 12
}
```

**Output:**
```typescript
{
  budgetId: Id<"budgets">,
  currentBudgetAmount: number,
  history: Array<BudgetLineRecord>, // Historical periods from budget_lines
  currentPeriod: { // Real-time calculation for current period
    periodStart: number,
    periodEnd: number,
    spentAmount: number,
    remainingAmount: number,
    percentUsed: number,
    status: "under_budget" | "at_budget" | "over_budget",
    isCurrentPeriod: true, // Flag indicating this is current period, not historical
  },
  hasMore: boolean,
}
```

**Business Logic Flow:**
```typescript
async function getBudgetHistoryWithCurrent(ctx, args) {
  // 1. Get historical data
  const historyResult = await getBudgetHistory(ctx, args);
  
  // 2. Calculate current period execution (real-time)
  const currentExecution = await getBudgetExecution(ctx, { budgetId: args.budgetId });
  
  // 3. Combine results
  return {
    ...historyResult,
    currentPeriod: {
      periodStart: currentExecution.periodStart,
      periodEnd: currentExecution.periodEnd,
      spentAmount: currentExecution.spentAmount,
      remainingAmount: currentExecution.remainingAmount,
      percentUsed: currentExecution.percentUsed,
      status: currentExecution.status,
      isCurrentPeriod: true,
    },
  };
}
```

**Use Case**: Budget detail view showing historical trend with current period at the top

### calculateExecutionForPeriod Internal Query

**Purpose**: Calculate budget execution for a specific historical period (used by cron job and backfill utilities)

**Input Validator:**
```typescript
{
  budgetId: v.id("budgets"),
  periodStart: v.number(),
  periodEnd: v.number(),
}
```

**Output:**
```typescript
{
  spentAmount: number,
  remainingAmount: number,
  percentUsed: number,
  status: "under_budget" | "at_budget" | "over_budget",
} | null
```

**Business Logic Flow:**
```typescript
async function calculateExecutionForPeriod(ctx, args) {
  // 1. Retrieve budget
  const budget = await ctx.db.get(args.budgetId);
  if (!budget) return null;
  
  // 2. Determine accounts in scope (same logic as Phase 4.2 getBudgetExecution)
  let accountIds = [];
  if (budget.scopeType === "singleAccount") {
    const account = await ctx.db.get(budget.accountId!);
    if (account && !account.softdelete) {
      accountIds = [account._id];
    }
  } else if (budget.scopeType === "multipleAccounts") {
    const accountPromises = budget.scopeRefs!.map(id => ctx.db.get(id));
    const accounts = await Promise.all(accountPromises);
    accountIds = accounts.filter(a => a && !a.softdelete).map(a => a!._id);
  } else if (budget.scopeType === "accountType") {
    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_user_type_active", q =>
        q.eq("userId", budget.userId)
         .eq("accountType", budget.scopeAccountType)
         .eq("softdelete", false)
      )
      .collect();
    accountIds = accounts.map(a => a._id);
  }
  
  // 3. Aggregate journal_lines for period (same as Phase 4.2)
  let spentAmount = 0;
  for (const accountId of accountIds) {
    const account = await ctx.db.get(accountId);
    if (!account || account.softdelete) continue;
    
    const lines = await ctx.db
      .query("journal_lines")
      .withIndex("by_accountId_date", q =>
        q.eq("accountId", accountId)
         .gte("entryDate", args.periodStart)
         .lte("entryDate", args.periodEnd)
      )
      .collect();
    
    for (const line of lines) {
      if (account.accountType === "expense" && line.direction === "debit") {
        spentAmount += line.amountBaseCurrency;
      } else if (account.accountType === "income" && line.direction === "credit") {
        spentAmount += line.amountBaseCurrency;
      }
    }
  }
  
  // 4. Calculate derived values
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
  
  return { spentAmount, remainingAmount, percentUsed, status };
}
```

**Reusability**: This function is used by:
1. `processBudgetRollover` cron job to calculate execution at period end
2. `backfillBudgetHistory` utility to create missing historical lines on demand
3. Any future analytics or reporting features requiring historical execution calculation

### backfillBudgetHistory Mutation

**Purpose**: Manually backfill missing budget_lines records for a budget (used for pre-cron historical data or missed periods)

**Input Validator:**
```typescript
{
  budgetId: v.id("budgets"),
  startDate: v.optional(v.number()), // Backfill from this date (default: budget creation date)
  endDate: v.optional(v.number()), // Backfill until this date (default: end of last complete period)
}
```

**Output:**
```typescript
{
  budgetId: Id<"budgets">,
  periodsProcessed: number,
  linesCreated: number,
  status: "success",
}
```

**Business Logic Flow:**
```typescript
async function backfillBudgetHistory(ctx, args) {
  // 1. Authenticate user
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("UNAUTHORIZED");
  const user = await getUserByAuth0Id(ctx, identity.subject);
  
  // 2. Retrieve budget and validate ownership
  const budget = await ctx.db.get(args.budgetId);
  if (!budget || budget.userId !== user._id) {
    throw new ConvexError("BUDGET_NOT_FOUND");
  }
  
  // 3. Determine backfill date range
  const startDate = args.startDate ?? budget.creationTime;
  // Default endDate: end of last complete period (not current period)
  const defaultEndDate = (() => {
    const { periodStart, periodEnd } = calculatePeriodBoundaries(budget.frequency, Date.now());
    // If we're currently in a period, use the end of the previous period
    // This prevents backfilling partial current periods
    if (Date.now() >= periodStart && Date.now() <= periodEnd) {
      // Current period is incomplete, use previous period end
      const previousPeriodEnd = periodStart - 1;
      return previousPeriodEnd;
    }
    // Current period is complete (shouldn't happen if cron is working)
    return periodEnd;
  })();
  const endDate = args.endDate ?? defaultEndDate;
  
  // 4. Generate all period boundaries in range
  const periods = generatePeriodBoundariesInRange(
    budget.frequency,
    startDate,
    endDate
  );
  
  console.log(`[Backfill] Processing ${periods.length} periods for budget ${budget._id}`);
  
  let linesCreated = 0;
  
  // 5. For each period, check if budget_line exists, create if missing
  for (const period of periods) {
    // Check for existing line (idempotency)
    const existingLine = await ctx.db
      .query("budget_lines")
      .withIndex("by_budgetId_periodStart", q =>
        q.eq("budgetId", budget._id).eq("periodStart", period.periodStart)
      )
      .first();
    
    if (existingLine) {
      // Line already exists, skip
      continue;
    }
    
    // Calculate execution for this period
    const execution = await calculateExecutionForPeriod(ctx, {
      budgetId: budget._id,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
    });
    
    if (!execution) {
      console.warn(`[Backfill] Could not calculate execution for period ${period.periodStart}`);
      continue;
    }
    
    // Create budget_lines record
    await createBudgetLine(ctx, {
      budgetId: budget._id,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      spentAmount: execution.spentAmount,
      remainingAmount: execution.remainingAmount,
      percentUsed: execution.percentUsed,
      budgetAmount: budget.amount, // Snapshot current budget amount (best available historical data)
      status: execution.status,
    });
    
    linesCreated++;
  }
  
  console.log(`[Backfill] Completed: ${periods.length} periods processed, ${linesCreated} lines created`);
  
  return {
    budgetId: budget._id,
    periodsProcessed: periods.length,
    linesCreated,
    status: "success",
  };
}
```

**Use Cases:**
- Backfill historical data for budgets created before cron job implementation
- Recover missing periods if cron job failed for several days
- Generate historical data for testing or analytics purposes

**Performance:** Process in batches for budgets with many periods (e.g., daily budget over 2 years = 730 periods)

### Helper Functions

**generatePeriodBoundariesInRange Function:**
```typescript
interface PeriodBoundaries {
  periodStart: number;
  periodEnd: number;
}

function generatePeriodBoundariesInRange(
  frequency: Frequency,
  rangeStart: number,
  rangeEnd: number
): PeriodBoundaries[] {
  const periods: PeriodBoundaries[] = [];
  let currentDate = rangeStart;
  
  while (currentDate <= rangeEnd) {
    const { periodStart, periodEnd } = calculatePeriodBoundaries(frequency, currentDate);
    
    // Only include period if it's fully within the range
    if (periodEnd <= rangeEnd) {
      periods.push({ periodStart, periodEnd });
    }
    
    // Move to next period
    currentDate = periodEnd + 1; // Move 1ms past current period end
  }
  
  return periods;
}
```

**listActiveBudgets Internal Query:**
```typescript
async function listActiveBudgets(ctx) {
  return await ctx.db
    .query("budgets")
    .withIndex("by_user_active") // Assumes composite index (userId, softdelete, creationTime)
    .filter(q => q.eq(q.field("softdelete"), false))
    .collect();
}
```

**Note:** This query may return budgets for all users. In practice, cron jobs operate at system level, not user level. The query efficiently filters active budgets across all users.

**updateNextDueDate Internal Mutation:**
```typescript
async function updateNextDueDate(ctx, args: { budgetId: Id<"budgets">, nextDueDate: number }) {
  await ctx.db.patch(args.budgetId, { nextDueDate: args.nextDueDate });
}
```

## Technical Implementation Details

### File Structure

**Budget Historical Tracking Implementation:**
```
convex/
  ledger/
    budgetLines.ts          # Budget line creation and cron job (createBudgetLine, processBudgetRollover)
    budgetHistory.ts        # Historical queries (getBudgetHistory, getBudgetHistoryWithCurrent, backfillBudgetHistory)
    budgetExecution.ts      # [EXISTING] Add calculateExecutionForPeriod internal query
    budgetUtils.ts          # [EXISTING] Add generatePeriodBoundariesInRange helper
    budgets.ts              # [EXISTING] Add updateNextDueDate internal mutation
  
  crons.ts                  # [UPDATE] Add budgetRollover job
```

**Schema:**
- `budget_lines` table already defined in `convex/schema.ts` (Phase 1)
- Verify indexes exist: `by_budgetId_periodStart`, `by_budgetId`
- No schema changes required

### Integration Points

**Phase 4.2 Budget System:**
- Reuse `getBudgetExecution` logic for execution calculation
- Reuse `calculatePeriodBoundaries` and `calculateNextDueDate` utilities
- Reuse budget scope resolution logic (singleAccount, multipleAccounts, accountType)

**Journal System:**
- Query `journal_lines` for historical period execution calculation
- Use existing `by_accountId_date` index
- Apply same debit/credit logic as real-time execution

**Cron System:**
- Register new `budgetRollover` job in `convex/crons.ts`
- Schedule daily at 00:05 UTC
- Use Convex internal actions for privileged operations

**UI Components:**
- Budget history view showing trend chart (line or bar chart)
- Budget detail page with historical table
- Home dashboard budget card showing current + last period comparison

### Cron Job Configuration

**Job Definition:**
```typescript
// In convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "budget period rollover",
  { hours: 24 }, // Every 24 hours
  internal.ledger.budgetLines.processBudgetRollover,
  { schedule: "5 0 * * *" } // 00:05 UTC daily
);

export default crons;
```

**Alternative Cron Syntax (if above doesn't work):**
```typescript
export default {
  budgetRollover: {
    schedule: "5 0 * * *", // cron syntax: minute hour day month dayOfWeek
    handler: internal.ledger.budgetLines.processBudgetRollover,
  },
};
```

**Monitoring:**
- Convex dashboard shows cron job runs, duration, success/failure
- Logs visible in Convex logs panel
- Set up alerts for job failures (external monitoring system)

### Testing Requirements

**Unit Tests:**
- `createBudgetLine` idempotency (calling twice with same data)
- `calculateExecutionForPeriod` accuracy (compare with manual calculation)
- `generatePeriodBoundariesInRange` correctness for all frequencies
- Period boundary alignment for various budget creation dates
- Status calculation logic (under/at/over budget thresholds)

**Integration Tests:**
- End-to-end budget line creation via cron job
- Historical query returning correct data
- Backfill creating missing periods correctly
- Cron job processing multiple budgets in batch
- Cron job handling budget errors gracefully (continue processing remaining budgets)

**Cron Job Testing:**
- **Manual Trigger**: Create utility mutation to trigger cron job manually for testing
  ```typescript
  export const triggerBudgetRollover = internalMutation({
    handler: async (ctx) => {
      await processBudgetRollover(ctx);
    },
  });
  ```
- **Test Scenarios**:
  - Cron job with 0 budgets (no-op)
  - Cron job with 1 budget due for rollover
  - Cron job with 10 budgets, mix of due/not due
  - Cron job with budget having deleted accounts (handles gracefully)
  - Cron job with budget already having budget_line (idempotent, no duplicate)
  - Cron job failing on one budget (continues processing remaining budgets)

**Edge Case Testing:**
- Budget created at 23:59:59 UTC (period boundary edge)
- Budget created on Feb 29 (leap year)
- Budget with frequency change mid-period (ensure nextDueDate recalculates)
- Budget soft-deleted mid-period (final period captured then stops)
- Budget with no transactions in period (spentAmount = 0, line still created)
- Daily budget across year boundary (Dec 31 → Jan 1)
- Weekly budget across year boundary (week containing Jan 1)

**Performance Testing:**
- Cron job with 100 active budgets (completes in < 30 seconds)
- `getBudgetHistory` with 100 historical periods (completes in < 200ms)
- Backfill for daily budget over 2 years (730 periods, completes in < 60 seconds)
- Historical query with pagination (verify hasMore flag accuracy)

## Constraints & Non-Functional Requirements

### Performance
- **Cron Job Target**: Complete in < 60 seconds for 100 active budgets (realistic with journal aggregation)
- **Cron Job Batch Size**: Process 50 budgets per batch to manage memory and enable progress tracking
- **Per-Budget Processing**: Target < 1 second per budget for typical datasets (1 period, 1-10 accounts, 50-100 transactions)
- **Multi-Period Catchup**: If cron fails for N days, catchup time = N × per-budget processing time (e.g., 7 days = 7 seconds for single budget)
- **Historical Queries**: 
  - `getBudgetHistory` completes in < 100ms for 12 periods (no journal aggregation, reads from budget_lines)
  - `getBudgetHistory` completes in < 200ms for 50 periods
  - Query scales linearly with period count (no N+1 queries, single index scan)
- **Backfill Performance**: 
  - Target < 60 seconds for 730 periods (2 years of daily budget)
  - Dominated by journal_lines aggregation cost (50ms × 730 periods = 36.5 seconds theoretical minimum)
  - Process in batches if performance issues arise
- **Index Requirements**: All budget_lines queries MUST use `by_budgetId_periodStart` index
- **Load Testing**: Validate cron job performance with 100+ budgets on staging before production deployment

### Data Integrity
- Budget lines captured exactly once per period per budget (idempotency enforced)
- Execution calculation matches Phase 4.2 real-time calculation for same period
- Period boundaries align precisely with budget frequency definitions
- No missing periods (cron runs daily, catches all frequencies)
- `nextDueDate` updated atomically after budget_lines creation (prevent double-processing)

### Reliability
- Cron job never throws unhandled error (always completes)
- Individual budget failures do not prevent processing remaining budgets
- Failed budgets automatically retried in next cron run (idempotent design)
- Backfill utility available for manual recovery of missing periods
- Job logs all errors with context for debugging

### Security
- Historical queries filtered by budget ownership (userId validated)
- Internal mutations and actions not exposed to client
- Cron job operates with system-level privileges (not user context)
- Backfill mutation requires user authentication and ownership validation

### Compatibility
- Historical tracking compatible with Phase 4.2 budget system (no breaking changes)
- Budget_lines schema supports future analytics features (e.g., trend analysis, forecasting)
- Cron job coexists with existing recurring transaction cron job
- No impact on existing budget queries or mutations

### Observability
- Cron job logs start, completion, and summary statistics
- Each budget line creation logged with budgetId and period
- Errors logged with budget ID and error message for debugging
- Job duration tracked for performance monitoring
- Expose cron job metrics via Convex dashboard

## Out of Scope

The following are explicitly **NOT** included in Phase 4.3:

- **Budget Trend Charts**: Visual trend charts in UI (deferred to Phase 4.4 UI Integration)
- **Budget Forecasting**: Predictive analytics based on historical data (future AI feature)
- **Budget Alerts**: Email/push notifications for budget thresholds (Phase 8.3)
- **Budget Comparison**: Side-by-side comparison of multiple budgets (future reporting)
- **Budget Export**: CSV/PDF export of historical data (future reporting)
- **Budget Anomaly Detection**: Alerting for unusual spending patterns (future AI feature)
- **Budget Recommendations**: Suggesting budget adjustments based on history (future UX)
- **Pre-Aggregation Optimization**: Using budget_lines for Home dashboard rollups (Phase 4.4)
- **Budget Analytics Dashboard**: Dedicated full-screen analytics page (future reporting)
- **Budget Goal Setting**: Setting spending reduction goals based on historical data (future feature)
- **Budget Sharing**: Multi-user access to budget history (Phase 11.3)
- **Budget Snapshots**: Capturing budget configuration changes over time (future audit feature)

## Success Metrics

- [ ] `budget_lines` table receives records from cron job for all active budgets
- [ ] Cron job runs successfully daily at 00:05 UTC without failures
- [ ] Cron job completes in < 30 seconds for 100 active budgets
- [ ] `getBudgetHistory` query returns accurate historical data
- [ ] Historical execution matches recalculation from journal_lines (spot check validation)
- [ ] Period boundaries align correctly with budget frequency for all frequencies
- [ ] Idempotency enforced: no duplicate budget_lines for same budgetId + periodStart
- [ ] `nextDueDate` updated correctly after budget line creation
- [ ] Backfill utility successfully creates missing historical lines
- [ ] Budget history available for all budgets (no data gaps)
- [ ] Cron job handles errors gracefully and continues processing remaining budgets
- [ ] Comprehensive test coverage: Line coverage >90%, branch coverage >85% for budgetLines.ts, budgetHistory.ts, and processBudgetRollover logic. Test all 6 frequencies × 3 scope types = 18 budget type combinations.
- [ ] Cron job logs visible in Convex dashboard with clear success/error messages
- [ ] No performance degradation in existing budget or transaction operations

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Cron job fails silently for extended period | High | **MITIGATED**: Multi-period catchup logic (up to 100 periods per run). External monitoring alerts for job failures. Manual backfill utility as fallback. |
| Period boundary calculation errors | High | **MITIGATED**: Reuse Phase 4.2 tested `calculatePeriodBoundaries` utility. Explicit UTC timezone policy documented. Test all 6 frequencies with known dates. |
| Execution calculation differs from real-time | High | **MITIGATED**: Use identical `calculateExecutionForPeriod` logic as Phase 4.2. Add spot-check validation comparing historical vs. recalculated execution. |
| Budget amount changes invalidate historical percentUsed | High | **RESOLVED**: Store `budgetAmount` as snapshot in each budget_lines record. Historical data remains accurate regardless of future budget changes. |
| Cron job timeout with many budgets | Medium | **MITIGATED**: Realistic 60-second target. Batch processing (50 budgets). Parallel execution within batches. MAX_CATCHUP_PERIODS=100 safety limit prevents runaway loops. |
| Duplicate budget_lines created | Medium | **MITIGATED**: Strong idempotency check using `(budgetId, periodStart)` composite key before insert. Cron job safe to run multiple times. |
| Budget soft-deleted mid-period | Medium | **RESOLVED**: Explicit handling - create final period if due, then stop. Never process future periods for soft-deleted budgets. |
| Missing periods due to cron downtime | Low | **RESOLVED**: Multi-period catchup automatically recovers missed periods. Backfill utility for manual recovery. |
| Schema migration from existing budget_lines | Medium | **RESOLVED**: Migration plan documented. Verification step confirms table is empty. If not empty, migration script provided. |
| Clock skew causing incorrect period boundaries | Low | **MITIGATED**: All calculations use UTC with explicit timezone policy. Consistent Date.now() across all period calculations. |
| Budget frequency changed mid-period | Low | **ACCEPTABLE**: nextDueDate recalculated on budget update (Phase 4.2). Cron respects new frequency from that point forward. |
| Historical query performance degrades with years of data | Low | **MITIGATED**: Pagination support with default 12-period limit. Efficient index usage. Query reads denormalized budget_lines (no joins). |

## Appendix

### Glossary
- **Budget Line**: Historical record capturing budget execution for a specific period
- **Period Rollover**: Transition from one budget period to the next (e.g., midnight on 1st of month for monthly budgets)
- **Cron Job**: Scheduled background task that runs automatically at specified intervals
- **Idempotency**: Property where performing the same operation multiple times has the same effect as performing it once
- **Backfill**: Process of creating missing historical records retroactively
- **Snapshot**: Point-in-time capture of budget execution state
- **Time-Series Data**: Data points indexed by time, enabling trend analysis
- **Period Boundaries**: Start and end timestamps defining a budget period
- **On-Demand Calculation**: Computing historical execution when needed rather than pre-calculating and storing

### References
- Convex Cron Jobs: https://docs.convex.dev/scheduling/cron-jobs
- Convex Scheduled Functions: https://docs.convex.dev/scheduling/scheduled-functions
- Convex Internal Functions: https://docs.convex.dev/functions/internal-functions
- ISO 8601 Date/Time: https://en.wikipedia.org/wiki/ISO_8601
- Budget Analysis Best Practices: https://www.investopedia.com/articles/personal-finance/062015/how-analyze-your-budget.asp

### Related PRDs
- Phase 4.2: Budget System (Schema & Logic) - prerequisite
- Phase 4.4: Pre-Aggregation System - next phase
- Phase 6.2: Home Screen Dashboard Migration - UI integration
- Phase 8.3: Notifications & Preferences - budget alerts

### Code Examples

**Example 1: Query Budget History (Last 6 Months)**
```typescript
// Retrieve last 6 months of budget performance
const sixMonthsAgo = Date.now() - (180 * 24 * 60 * 60 * 1000);
const history = await getBudgetHistory({
  budgetId: "j123...",
  startDate: sixMonthsAgo,
  limit: 6, // Last 6 periods (months)
});

// history.history contains array of 6 monthly execution records
console.log(`Budget amount: ${history.currentBudgetAmount}`);
console.log(`Periods: ${history.history.length}`);
console.log(`Has more data: ${history.hasMore}`);
```

**Example 2: Query Budget History with Current Period**
```typescript
// Get historical data PLUS current period (real-time)
const fullHistory = await getBudgetHistoryWithCurrent({
  budgetId: "j123...",
  limit: 12,
});

console.log(`Current period status: ${fullHistory.currentPeriod.status}`);
console.log(`Current spending: ${fullHistory.currentPeriod.spentAmount}`);
console.log(`Historical periods: ${fullHistory.history.length}`);
```

**Example 3: Backfill Missing Historical Data**
```typescript
// Manually backfill historical data for a budget
const result = await backfillBudgetHistory({
  budgetId: "j123...",
  startDate: budget.creationTime, // From budget creation
  endDate: Date.now() - (24 * 60 * 60 * 1000), // Until yesterday
});

console.log(`Processed ${result.periodsProcessed} periods`);
console.log(`Created ${result.linesCreated} new budget lines`);
```

**Example 4: Display Historical Trend in UI**
```typescript
// Fetch history and format for chart
const history = await getBudgetHistoryWithCurrent({
  budgetId: selectedBudgetId,
  limit: 12,
});

// Format for chart.js
const chartData = {
  labels: [
    ...history.history.map(h => formatDate(h.periodStart)),
    formatDate(history.currentPeriod.periodStart) + " (current)",
  ],
  datasets: [
    {
      label: "Spent",
      data: [
        ...history.history.map(h => h.spentAmount / 100), // Convert to currency units
        history.currentPeriod.spentAmount / 100,
      ],
    },
    {
      label: "Budget",
      data: Array(history.history.length + 1).fill(history.currentBudgetAmount / 100),
    },
  ],
};
```

**Example 5: Cron Job Manual Trigger (Testing)**
```typescript
// Trigger cron job manually for testing
import { internal } from "./_generated/api";

export const testBudgetRollover = internalMutation({
  handler: async (ctx) => {
    console.log("Manually triggering budget rollover...");
    await ctx.scheduler.runAfter(0, internal.ledger.budgetLines.processBudgetRollover);
  },
});

// Call via Convex dashboard: testBudgetRollover()
```

**Example 6: Calculate Historical Execution**
```typescript
// Calculate execution for a specific historical period
const execution = await calculateExecutionForPeriod({
  budgetId: "j123...",
  periodStart: new Date("2025-09-01").getTime(),
  periodEnd: new Date("2025-09-30T23:59:59.999Z").getTime(),
});

if (execution) {
  console.log(`Spent: ${execution.spentAmount}, Status: ${execution.status}`);
} else {
  console.log("Could not calculate execution (budget or accounts not found)");
}
```

**Example 7: Generate Period Boundaries in Range**
```typescript
// Generate all monthly periods in 2025
const periods = generatePeriodBoundariesInRange(
  "monthly",
  new Date("2025-01-01").getTime(),
  new Date("2025-12-31T23:59:59.999Z").getTime()
);

console.log(`Generated ${periods.length} periods`); // Should be 12 (Jan-Dec 2025)
periods.forEach(p => {
  console.log(`Period: ${formatDate(p.periodStart)} to ${formatDate(p.periodEnd)}`);
});
```

---

## Implementation Checklist

**Pre-Implementation:**
- [ ] **CRITICAL**: Verify `budget_lines` table is empty in production deployment (expected state from Phase 4.2)
- [ ] **CRITICAL**: Update `convex/schema.ts` with new budget_lines schema (migration from old schema)
- [ ] Review Phase 4.2 budget system implementation for context
- [ ] Verify Phase 4.2 `calculatePeriodBoundaries` and `calculateNextDueDate` utilities are working correctly
- [ ] Add `budgetStatusValidator` to `convex/ledger/validators.ts`
- [ ] Verify Convex platform constraints (cron job limits, timeout behavior)
- [ ] Review Convex cron job documentation
- [ ] Set up test budgets with various frequencies (all 6) and scope types (all 3) for testing (18 combinations)

**Core Implementation:**
- [ ] Create `convex/ledger/budgetLines.ts` with line creation and cron job
- [ ] Create `convex/ledger/budgetHistory.ts` with historical queries
- [ ] Add `calculateExecutionForPeriod` internal query to `budgetExecution.ts`
- [ ] Add `generatePeriodBoundariesInRange` helper to `budgetUtils.ts`
- [ ] Add `updateNextDueDate` internal mutation to `budgets.ts`
- [ ] Implement `createBudgetLine` internal mutation with idempotency
- [ ] Implement `processBudgetRollover` internal action (cron job handler)
- [ ] Implement `getBudgetHistory` query with pagination
- [ ] Implement `getBudgetHistoryWithCurrent` query combining historical + current
- [ ] Implement `backfillBudgetHistory` mutation for manual recovery

**Cron Job Setup:**
- [ ] Add `budgetRollover` job to `convex/crons.ts`
- [ ] Configure schedule: "5 0 * * *" (daily at 00:05 UTC)
- [ ] Test cron job manually via utility mutation
- [ ] Verify cron job appears in Convex dashboard scheduled jobs

**Testing:**
- [ ] Unit tests for `createBudgetLine` idempotency
- [ ] Unit tests for `calculateExecutionForPeriod` accuracy
- [ ] Unit tests for `generatePeriodBoundariesInRange` (all frequencies)
- [ ] Integration test: cron job creates budget_line for due budget
- [ ] Integration test: cron job updates nextDueDate after line creation
- [ ] Integration test: cron job handles budget with deleted accounts
- [ ] Integration test: `getBudgetHistory` returns correct historical data
- [ ] Integration test: backfill creates missing periods
- [ ] Edge case tests: leap year, year boundary, month with 31 days, etc.
- [ ] Performance test: cron job with 100 budgets (< 30s)
- [ ] Performance test: `getBudgetHistory` with 100 periods (< 200ms)

**Integration:**
- [ ] Update budget detail UI to show historical trend chart
- [ ] Add "View History" button to budget list items
- [ ] Display last period comparison on Home dashboard budget card
- [ ] Add backfill utility to settings/admin panel (optional)

**Documentation:**
- [ ] Add JSDoc comments to all public functions
- [ ] Document cron job schedule and behavior
- [ ] Document backfill process and use cases
- [ ] Update user-facing documentation with historical tracking feature

**Validation:**
- [ ] Manual testing: create budget, wait 24+ hours, verify budget_line created
- [ ] Manual testing: query budget history, verify data accuracy
- [ ] Manual testing: backfill for budget created pre-cron, verify completeness
- [ ] Spot check: compare historical execution with recalculation from journal_lines
- [ ] Monitor cron job logs for 1 week post-deployment

**Deployment:**
- [ ] Deploy to dev environment first
- [ ] Verify cron job runs successfully in dev
- [ ] Deploy to production
- [ ] Monitor cron job for first 3 days post-production deployment
- [ ] Backfill historical data for existing budgets (if needed)

---

## Document Revision History

**Version 2.0 - October 12, 2025**

Critical and clarity issues resolved based on strategic audit:

**Critical Fixes:**
1. **Schema Migration**: Added comprehensive schema migration strategy section addressing mismatch between PRD design and production schema
2. **Budget Amount Storage**: Changed decision to STORE `budgetAmount` as snapshot in each budget_lines record for historical accuracy
3. **Cron Scalability**: Updated performance targets to realistic 60-second target with detailed per-budget processing estimates

**Clarity Fixes:**
1. **Multi-Period Catchup**: Added explicit catchup logic with MAX_CATCHUP_PERIODS=100 safety limit
2. **Soft-Delete Behavior**: Defined explicit behavior - create final period if due, then stop
3. **Timezone Policy**: Documented explicit UTC policy for all period boundaries
4. **Function Registration**: Clarified `createBudgetLine` is registered as `internalMutation`
5. **Test Coverage**: Specified line coverage >90%, branch coverage >85% requirements
6. **Backfill Default**: Changed from "yesterday" to "end of last complete period"
7. **Status Validator**: Extracted `budgetStatusValidator` for reuse across codebase
8. **Index Cardinality**: Documented expected scale (12-24 typical, up to 1000 max periods)
9. **Convex Constraints**: Added platform constraints documentation (no hard timeout, batch size rationale)

**All code examples, business logic flows, and acceptance criteria updated to reflect these changes.**

