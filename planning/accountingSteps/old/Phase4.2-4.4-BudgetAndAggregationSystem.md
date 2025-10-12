# Phase 4.2-4.4: Budget & Pre-Aggregation System PRD

## Introduction

This PRD covers the implementation of PerFi's budget tracking system and performance optimization through pre-aggregation, building on the double-entry ledger foundation established in Phases 1-3. These features enable users to define spending limits, track budget execution in real-time, and maintain performance as transaction volumes grow.

The budget system provides flexible scoping (single accounts, multiple accounts, or account types), frequency-based periods (daily, weekly, monthly, etc.), and historical tracking via budget lines. The pre-aggregation system ensures the Home dashboard and budget calculations remain fast by maintaining monthly rollups of journal line data, updated through background jobs and best-effort synchronous writes.

This is a critical step in delivering user-facing financial planning features while establishing the performance infrastructure needed for production scalability.

## Context & Background

### Current System
- Complete double-entry ledger system with accounts, journal entries, and journal lines (Phase 1-2)
- Historical transaction backfill complete with zero-sum validation (Phase 2)
- Dual-write synchronization between legacy and ledger tables (Phase 3)
- Transfer functionality for account-to-account movements (Phase 4.1)
- Budget and budget_lines tables defined in schema but no implementation
- Home dashboard reads directly from journal_lines (performance risk at scale)

### Target System
- Flexible budget system with three scope types:
  - **Single Account**: Budget for one specific account (e.g., groceries expense)
  - **Multiple Accounts**: Budget for selected accounts (e.g., all food-related expenses)
  - **Account Type**: Budget for all accounts of a type (e.g., all expense accounts)
- Frequency-based period calculation (daily, weekly, monthly, quarterly, semestrally, yearly)
- No carryover between periods (each period resets)
- Real-time budget execution calculation from journal_lines
- Historical tracking via budget_lines table
- Pre-aggregated monthly rollups for fast dashboard queries
- Background job reconciliation to maintain aggregate accuracy
- Best-effort synchronous updates for real-time feel

### Technology Stack
- **Backend**: Convex (TypeScript) with existing ledger infrastructure
- **Database**: Convex NoSQL with journal_entries, journal_lines, accounts tables
- **Scheduled Actions**: Convex cron jobs for background processing
- **Validation**: Convex `v` validators with existing enum definitions

## User Stories

**US1:** *As a user, I want to set spending budgets for specific categories, so I can control my expenses and stay within my financial limits.*

**US2:** *As a user, I want to see my budget execution in real-time, so I know how much I have left to spend in each category.*

**US3:** *As a user, I want to track my budget performance over time, so I can identify spending patterns and adjust my budgets accordingly.*

**US4:** *As a user, I want to create budgets for multiple accounts or account types, so I can manage complex spending scenarios (e.g., all food expenses across multiple accounts).*

**US5:** *As a developer, I need the Home dashboard to load quickly even with thousands of transactions, so users have a smooth experience.*

**US6:** *As a system administrator, I need background jobs to maintain data consistency, so pre-aggregated data stays accurate without manual intervention.*

## Acceptance Criteria

### For US1 (Budget Creation):

**Budget Setup:**
- [ ] `createBudget` mutation accepts account scope, amount, and frequency
- [ ] Budget supports three scope types: singleAccount, multipleAccounts, accountType
- [ ] Budget amount is positive integer in minor units
- [ ] Budget frequency supports: daily, weekly, monthly, quarterly, semestrally, yearly
- [ ] Budget automatically calculates nextDueDate based on frequency
- [ ] Budget can have optional endDate for one-shot budgets
- [ ] Budget belongs to authenticated user
- [ ] Budget starts active by default

**Validation:**
- [ ] Amount must be positive integer
- [ ] Frequency must be valid enum value
- [ ] scopeType must be valid enum value
- [ ] For singleAccount: accountId is required
- [ ] For multipleAccounts: scopeRefs array is required and non-empty
- [ ] For accountType: accountType parameter is required
- [ ] All referenced accounts must exist and belong to user
- [ ] endDate must be after current date if provided

### For US2 (Budget Execution Calculation):

**Real-Time Tracking:**
- [ ] `getBudgetExecution` query calculates spent amount from journal_lines
- [ ] Query aggregates transactions in current budget period
- [ ] Query respects budget scope (single account, multiple accounts, or account type)
- [ ] Query handles expense accounts (sum debit lines) and income accounts (sum credit lines)
- [ ] Query returns: budgetAmount, spentAmount, remainingAmount, percentUsed
- [ ] Query supports multiple budgets simultaneously
- [ ] Query performance < 200ms for typical datasets

**Period Calculation:**
- [ ] Daily budgets: period = current day (UTC)
- [ ] Weekly budgets: period = current week (Monday-Sunday)
- [ ] Monthly budgets: period = current month (1st to last day)
- [ ] Quarterly budgets: period = current quarter (Q1: Jan-Mar, Q2: Apr-Jun, etc.)
- [ ] Semestral budgets: period = current semester (H1: Jan-Jun, H2: Jul-Dec)
- [ ] Yearly budgets: period = current year (Jan 1 - Dec 31)
- [ ] No carryover: each period starts fresh at zero spent

### For US3 (Budget Historical Tracking):

**Budget Lines Creation:**
- [ ] Background job creates budget_lines entry at period rollover
- [ ] Budget line captures: budgetId, accountId, amount, startDate, endDate
- [ ] Budget line records actual spending for completed period
- [ ] Budget lines preserve history even if budget is deleted
- [ ] Budget lines enable trend analysis and reporting

**Historical Queries:**
- [ ] `getBudgetHistory` query returns budget_lines for a given budget
- [ ] Query supports date range filtering
- [ ] Query returns execution percentage for each period
- [ ] Query enables comparison across periods
- [ ] Query supports pagination for long histories

### For US4 (Flexible Budget Scopes):

**Single Account Scope:**
- [ ] Budget tracks spending for one specific account
- [ ] Account must be expense or income type
- [ ] Budget execution sums journal_lines for that account
- [ ] Example: "Groceries" budget for groceries expense account

**Multiple Accounts Scope:**
- [ ] Budget tracks spending across multiple specified accounts
- [ ] scopeRefs array contains account IDs
- [ ] Budget execution sums journal_lines for all specified accounts
- [ ] All accounts must belong to user
- [ ] Example: "Food" budget for groceries, restaurants, and coffee accounts

**Account Type Scope:**
- [ ] Budget tracks spending for all accounts of a specific type
- [ ] Supports expense and income account types
- [ ] Budget execution sums journal_lines for all accounts of that type
- [ ] Dynamically includes new accounts of the type
- [ ] Example: "Total Expenses" budget for all expense accounts

### For US5 (Pre-Aggregation System):

**Monthly Rollups Table:**
- [ ] Create monthly_rollups table with fields:
  - userId (FK to users)
  - accountId (FK to accounts)
  - month (YYYY-MM format or epoch of month start)
  - amountBaseCurrency (aggregated sum)
  - transactionCount (number of lines)
  - lastUpdated (epoch milliseconds)
- [ ] Unique index on (userId, accountId, month)
- [ ] Support efficient querying by userId and month
- [ ] Store aggregated data in base currency only

**Home Dashboard Integration:**
- [ ] Home dashboard reads from monthly_rollups instead of scanning journal_lines
- [ ] Monthly balance card uses pre-aggregated data
- [ ] Budget overview card uses pre-aggregated data for current month
- [ ] Fallback to direct calculation if rollup missing
- [ ] Home dashboard load time < 1 second

**Performance Targets:**
- [ ] Home dashboard queries < 100ms with rollups
- [ ] Budget execution queries < 200ms using rollups
- [ ] Rollup update operations < 50ms per account-month
- [ ] Background job processes all users in < 5 minutes

### For US6 (Background Job Reconciliation):

**Scheduled Actions:**
- [ ] Daily background job runs at configurable time (default: 2 AM UTC)
- [ ] Job processes all users with transactions
- [ ] Job computes monthly rollups from journal_lines
- [ ] Job performs idempotent upserts keyed by (userId, accountId, month)
- [ ] Job handles errors gracefully with retry logic
- [ ] Job logs completion status and metrics

**Synchronous Updates:**
- [ ] Best-effort rollup update on transaction creation
- [ ] Best-effort rollup update on transaction edit
- [ ] Best-effort rollup update on transaction deletion
- [ ] Synchronous failures do not block transaction operations
- [ ] Background job corrects any synchronous update failures

**Consistency Guarantees:**
- [ ] Background job is source of truth for rollups
- [ ] Scheduled reconciliation ensures eventual consistency
- [ ] Drift detection and automatic correction
- [ ] Idempotent operations prevent duplicate aggregations

## Detailed Specifications

### budgets Table Enhancement

**Purpose**: Store budget definitions with flexible scoping

**Fields:**
```typescript
{
  id: v.id("budgets"),
  userId: v.id("users"),
  accountId: v.optional(v.id("accounts")), // For singleAccount scope
  amount: v.number(), // Budget limit in minor units
  frequency: v.union(
    v.literal("daily"),
    v.literal("weekly"),
    v.literal("monthly"),
    v.literal("quarterly"),
    v.literal("semestrally"),
    v.literal("yearly")
  ),
  nextDueDate: v.number(), // Epoch ms of next period start
  endDate: v.optional(v.number()), // Epoch ms for one-shot budgets
  creationTime: v.number(), // Epoch milliseconds
  softdelete: v.boolean(),
  deletedAt: v.optional(v.number()),
  scopeType: v.union(
    v.literal("singleAccount"),
    v.literal("multipleAccounts"),
    v.literal("accountType")
  ),
  scopeRefs: v.optional(v.array(v.id("accounts"))), // For multipleAccounts
  scopeAccountType: v.optional(v.string()), // "expense" or "income" for accountType scope
}
```

**Indexes:**
- `by_user`: Query all budgets for a user
- `by_user_active`: Filter active budgets (softdelete = false)
- `by_nextDueDate`: Find budgets due for period rollover

**Business Rules:**
- `amount` must be positive
- `nextDueDate` auto-calculated based on frequency
- `scopeType` determines which scope fields are required
- No carryover between periods
- Deleted budgets preserve historical budget_lines

### budget_lines Table

**Purpose**: Historical record of budget execution by period

**Fields:**
```typescript
{
  id: v.id("budget_lines"),
  budgetId: v.id("budgets"),
  userId: v.id("users"),
  accountId: v.id("accounts"), // Specific account for this line
  amount: v.number(), // Spent amount in minor units
  startDate: v.number(), // Epoch ms of period start
  endDate: v.number(), // Epoch ms of period end
  softdelete: v.boolean(),
  deletedAt: v.optional(v.number()),
}
```

**Indexes:**
- `by_budgetId`: Query history for a specific budget
- `by_user`: Query all budget lines for a user
- `by_user_dateRange`: Filter by date range

**Business Rules:**
- Created at period rollover by background job
- One line per account in multipleAccounts scope
- Preserves history for reporting and analysis
- Immutable once created (no edits)

### monthly_rollups Table

**Purpose**: Pre-aggregated monthly transaction summaries for performance

**Fields:**
```typescript
{
  id: v.id("monthly_rollups"),
  userId: v.id("users"),
  accountId: v.id("accounts"),
  month: v.string(), // "YYYY-MM" format
  amountBaseCurrency: v.number(), // Sum of journal_lines.amountBaseCurrency
  transactionCount: v.number(), // Count of journal_lines
  lastUpdated: v.number(), // Epoch milliseconds
}
```

**Indexes:**
- `by_user_month`: Query rollups for a user in a specific month
- `by_user_account`: Query rollups for a specific account
- `by_month`: Global rollup queries

**Unique Constraint:**
- Composite key: (userId, accountId, month)

**Business Rules:**
- Updated by background job (source of truth)
- Best-effort synchronous updates on writes
- Idempotent upserts prevent duplicates
- Missing rollups trigger fallback to direct calculation

### createBudget Mutation

**Purpose**: Creates a new budget with flexible scope

**Input:**
```typescript
{
  scopeType: "singleAccount" | "multipleAccounts" | "accountType",
  amount: number, // Budget limit in minor units
  frequency: "daily" | "weekly" | "monthly" | "quarterly" | "semestrally" | "yearly",
  accountId?: Id<"accounts">, // Required for singleAccount
  scopeRefs?: Id<"accounts">[], // Required for multipleAccounts
  scopeAccountType?: "expense" | "income", // Required for accountType
  endDate?: number, // Optional epoch ms for one-shot budgets
}
```

**Output:**
```typescript
{
  budgetId: Id<"budgets">,
  status: "success" | "error",
  error?: string,
}
```

**Business Logic:**
1. Validate input parameters based on scopeType
2. Verify all referenced accounts exist and belong to user
3. Calculate initial nextDueDate from current date and frequency
4. Create budget record with all fields
5. Return budget ID or error

**Validations:**
- Amount must be positive integer
- Frequency must be valid enum value
- scopeType must be valid enum value
- For singleAccount: accountId required and must exist
- For multipleAccounts: scopeRefs required, non-empty, all accounts exist
- For accountType: scopeAccountType required, must be "expense" or "income"
- endDate must be in future if provided

**Error Conditions:**
- Throws `ConvexError("INVALID_AMOUNT")` when amount <= 0
- Throws `ConvexError("INVALID_SCOPE")` when scope configuration invalid
- Throws `ConvexError("ACCOUNT_NOT_FOUND")` when account reference invalid
- Throws `ConvexError("INVALID_FREQUENCY")` when frequency invalid

### getBudgetExecution Query

**Purpose**: Calculate current budget execution with real-time data

**Input:**
```typescript
{
  budgetId: Id<"budgets">,
}
```

**Output:**
```typescript
{
  budgetId: Id<"budgets">,
  budgetAmount: number, // Budget limit
  spentAmount: number, // Amount spent in current period
  remainingAmount: number, // budgetAmount - spentAmount
  percentUsed: number, // (spentAmount / budgetAmount) * 100
  periodStart: number, // Epoch ms of current period start
  periodEnd: number, // Epoch ms of current period end
  status: "under_budget" | "over_budget" | "at_budget",
}
```

**Business Logic:**
1. Retrieve budget configuration
2. Calculate current period boundaries from frequency
3. Query journal_lines for accounts in scope within period
4. For expense accounts: sum debit lines (positive direction)
5. For income accounts: sum credit lines (negative direction)
6. Prefer monthly_rollups if current period is complete month
7. Calculate remaining amount and percentage
8. Determine status (under/at/over budget)
9. Return execution summary

**Period Calculation Examples:**
- Daily: Today 00:00 UTC to 23:59:59 UTC
- Weekly: Current Monday 00:00 to Sunday 23:59:59 UTC
- Monthly: 1st of month 00:00 to last day 23:59:59 UTC
- Quarterly: Quarter start to quarter end
- Yearly: Jan 1 00:00 to Dec 31 23:59:59 UTC

**Optimization:**
- Use monthly_rollups for completed months
- Direct query journal_lines only for current incomplete period
- Cache period boundary calculations

### getBudgetHistory Query

**Purpose**: Retrieve historical budget execution for trend analysis

**Input:**
```typescript
{
  budgetId: Id<"budgets">,
  dateFrom?: number, // Optional start date filter
  dateTo?: number, // Optional end date filter
  limit?: number, // Pagination limit (default: 12)
  offset?: number, // Pagination offset (default: 0)
}
```

**Output:**
```typescript
{
  budgetId: Id<"budgets">,
  history: [
    {
      periodStart: number,
      periodEnd: number,
      budgetAmount: number,
      spentAmount: number,
      percentUsed: number,
    }
  ],
  totalPeriods: number,
}
```

**Business Logic:**
1. Query budget_lines for budgetId
2. Apply date range filters if provided
3. Sort by startDate descending (most recent first)
4. Apply pagination (limit, offset)
5. Calculate percentUsed for each period
6. Return history array and total count

### updateMonthlyRollups Background Job

**Purpose**: Maintain pre-aggregated monthly summaries for performance

**Schedule**: Daily at 2:00 AM UTC (configurable)

**Business Logic:**
```typescript
async function updateMonthlyRollups() {
  // 1. Get all users with transactions
  const users = await getUsersWithTransactions();
  
  for (const user of users) {
    // 2. Get all accounts for user
    const accounts = await getAccounts(user.id);
    
    // 3. Get months with activity (last 24 months + current)
    const months = getRelevantMonths();
    
    for (const account of accounts) {
      for (const month of months) {
        // 4. Calculate sum from journal_lines
        const sum = await sumJournalLines(user.id, account.id, month);
        
        // 5. Idempotent upsert
        await upsertMonthlyRollup({
          userId: user.id,
          accountId: account.id,
          month: month, // "YYYY-MM"
          amountBaseCurrency: sum.amount,
          transactionCount: sum.count,
          lastUpdated: Date.now(),
        });
      }
    }
  }
  
  // 6. Log completion metrics
  logMetrics({
    usersProcessed: users.length,
    rollupsUpdated: rollupCount,
    duration: endTime - startTime,
  });
}
```

**Idempotency Strategy:**
- Use unique constraint on (userId, accountId, month)
- Upsert operations overwrite existing rollups
- Each run recalculates from source data
- No duplicate aggregation risk

**Error Handling:**
- Catch errors per user to prevent full job failure
- Log errors with user context
- Continue processing remaining users
- Retry failed users in next run

### Best-Effort Synchronous Rollup Updates

**Purpose**: Keep rollups fresh without blocking transactions

**On Transaction Creation:**
```typescript
async function onTransactionCreated(journalEntryId: Id<"journal_entries">) {
  try {
    // Get journal lines for this entry
    const lines = await getJournalLines(journalEntryId);
    
    for (const line of lines) {
      // Calculate month from entryDate
      const month = getMonthString(line.entryDate);
      
      // Best-effort update (don't throw on failure)
      await updateMonthlyRollup(line.userId, line.accountId, month)
        .catch(err => console.warn("Rollup update failed:", err));
    }
  } catch (err) {
    // Don't block transaction on rollup failure
    console.warn("Synchronous rollup update failed:", err);
  }
}
```

**On Transaction Update/Delete:**
- Similar logic to creation
- Update rollups for affected account-months
- Recalculate full month sum (not delta)
- Failures logged but don't block operation

**Design Principles:**
- Never throw errors to transaction operations
- Log failures for monitoring
- Background job corrects any missed updates
- Trade consistency for availability

## Technical Implementation Details

### File Structure

**Budget System:**
- `convex/ledger/budgets.ts`: Budget CRUD operations
- `convex/ledger/budgetExecution.ts`: Budget calculation queries
- `convex/ledger/budgetHistory.ts`: Historical tracking queries

**Pre-Aggregation:**
- `convex/ledger/aggregations.ts`: Monthly rollup utilities
- `convex/crons.ts`: Add scheduled job configuration
- `convex/ledger/rollupJobs.ts`: Background job implementation

### Integration Points

**Account Management:**
- Query accounts table for scope resolution
- Validate account ownership and status
- Handle account hierarchy for type-based scopes

**Journal System:**
- Read journal_lines for budget execution
- Filter by account, date range, and direction
- Aggregate amounts in base currency

**Home Dashboard:**
- Replace direct journal_lines queries with rollup queries
- Fallback to direct calculation if rollup missing
- Cache rollup results per request

### Period Calculation Utilities

**Purpose**: Centralized period boundary calculation

```typescript
interface PeriodBoundaries {
  startDate: number; // Epoch ms
  endDate: number; // Epoch ms
}

function calculatePeriodBoundaries(
  frequency: Frequency,
  referenceDate?: number // Default: Date.now()
): PeriodBoundaries {
  // Implementation for each frequency type
}

function getMonthString(epochMs: number): string {
  // Format: "YYYY-MM"
  const date = new Date(epochMs);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function calculateNextDueDate(
  currentDate: number,
  frequency: Frequency
): number {
  // Calculate next period start
}
```

### Rollup Update Strategy

**Write Path:**
1. Transaction mutation executes
2. Best-effort synchronous rollup update (don't await)
3. Transaction completes successfully
4. Rollup failure logged but doesn't affect transaction

**Background Job Path:**
1. Cron triggers at scheduled time
2. Process all users in batches
3. Recalculate rollups from source data
4. Idempotent upsert ensures correctness
5. Log metrics and errors

**Read Path:**
1. Query checks monthly_rollups first
2. If rollup exists and recent: use it
3. If rollup missing/stale: fallback to direct calculation
4. Cache result for request duration

### Testing Requirements

**Budget System Tests:**
- Budget creation with all scope types
- Budget execution calculation accuracy
- Period boundary calculation for all frequencies
- Multi-account scope aggregation
- Budget history pagination
- Budget soft-delete behavior

**Pre-Aggregation Tests:**
- Monthly rollup calculation accuracy
- Idempotent upsert behavior
- Background job completion
- Synchronous update best-effort
- Rollback on failure scenarios
- Performance benchmarks

**Integration Tests:**
- Home dashboard with rollups
- Budget execution with rollups
- Rollup consistency after transactions
- Background job end-to-end
- Concurrent transaction handling

**Edge Cases:**
- Budgets spanning month boundaries
- Account type scope with no accounts
- Budget deletion with active lines
- Rollup for accounts with no transactions
- Timezone handling for period boundaries

## Constraints & Non-Functional Requirements

### Performance
- Budget execution queries must complete in < 200ms
- Home dashboard load time < 1 second with rollups
- Monthly rollup calculation < 50ms per account-month
- Background job completion < 5 minutes for typical datasets
- Query result caching for repeated reads

### Data Integrity
- Budget amounts must be positive integers
- Budget scope configuration must be valid
- Monthly rollup sums must match source data
- Idempotent operations prevent duplicate aggregations
- Background job is source of truth for rollups

### Security
- Users can only create budgets for their own accounts
- Budget queries filtered by userId
- Account access validated on budget creation
- Rollup queries respect user data isolation

### Compatibility
- Budgets work with existing account hierarchy
- Budget execution integrates with current transaction views
- Rollups support all existing account types
- Schema changes backward compatible

### Observability
- Background job logs completion metrics
- Rollup update failures logged with context
- Performance monitoring for query times
- Drift detection alerts for rollup inconsistencies

## Out of Scope

The following are explicitly **NOT** included in this step:

- **Budget Carryover**: Carrying unused budget to next period (future enhancement)
- **Budget Alerts**: Email/push notifications when budget exceeded (Phase 8.3)
- **Budget Sharing**: Multi-user budget collaboration (Phase 11.3)
- **Budget Templates**: Pre-defined budget suggestions (future UX)
- **Budget Adjustments**: Mid-period budget amount changes with prorating (future)
- **Advanced Rollups**: Daily/weekly aggregations (monthly only for now)
- **Rollup Archival**: Long-term rollup data compression (future optimization)
- **Budget Forecasting**: Predictive budget recommendations (future AI feature)
- **Budget Approval**: Workflow for budget creation approval (future)
- **Budget Categories**: Grouping budgets into categories (future UX)

## Success Metrics

- [ ] `createBudget` successfully creates budgets with all scope types
- [ ] Budget execution calculation accurate within 0.01% of source data
- [ ] Budget history queries support pagination and filtering
- [ ] Monthly rollups table created with proper indexes
- [ ] Background job runs daily and completes successfully
- [ ] Home dashboard load time < 1 second using rollups
- [ ] Budget execution queries < 200ms using rollups
- [ ] Rollup consistency matches direct calculation
- [ ] Best-effort synchronous updates implemented
- [ ] Comprehensive test coverage (>90%) for budget and rollup logic
- [ ] Budget and rollup documentation complete
- [ ] Performance benchmarks met for all query types

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Budget calculation errors | High | Comprehensive testing, compare with direct calculation, validation |
| Rollup drift from source data | High | Background job reconciliation, monitoring, drift detection |
| Background job failures | Medium | Error handling, retry logic, alerting, idempotent operations |
| Performance degradation at scale | Medium | Proper indexing, query optimization, pagination, caching |
| Period boundary edge cases | Medium | Thorough testing of all frequencies, timezone handling |
| Scope configuration complexity | Low | Clear validation, helpful error messages, examples |
| Synchronous update failures | Low | Best-effort design, background job corrects, logging |
| Budget history data growth | Low | Pagination, archival strategy, index optimization |

## Appendix

### Glossary
- **Budget**: Spending limit for a period, scoped to accounts or account types
- **Budget Scope**: Defines which accounts a budget tracks (single, multiple, or type)
- **Budget Execution**: Actual spending compared to budget limit
- **Budget Line**: Historical record of budget execution for a completed period
- **Period**: Time range for budget calculation (day, week, month, quarter, semester, year)
- **Carryover**: (Not implemented) Transferring unused budget to next period
- **Pre-Aggregation**: Pre-calculated summaries for performance optimization
- **Monthly Rollup**: Aggregated sum of journal lines for an account in a month
- **Background Job**: Scheduled task that runs periodically (e.g., daily)
- **Idempotent**: Operation that produces same result when run multiple times
- **Best-Effort**: Operation that attempts but doesn't guarantee completion

### References
- Convex Docs: https://docs.convex.dev/database/schemas
- Convex Scheduled Actions: https://docs.convex.dev/scheduling/cron-jobs
- Double-Entry Bookkeeping: https://en.wikipedia.org/wiki/Double-entry_bookkeeping
- Budget Planning: https://www.investopedia.com/terms/b/budget.asp

### Related PRDs
- Phase 4.1: Transfer Implementation
- Phase 6.2: Home Screen Dashboard Migration
- Phase 8.3: Notifications & Preferences

### Code Examples

**Creating a Single Account Budget:**
```typescript
await createBudget({
  scopeType: "singleAccount",
  accountId: "j123...", // Groceries expense account
  amount: 50000, // $50,000 ARS limit
  frequency: "monthly"
});
```

**Creating a Multiple Accounts Budget:**
```typescript
await createBudget({
  scopeType: "multipleAccounts",
  scopeRefs: [
    "j123...", // Groceries
    "j456...", // Restaurants
    "j789...", // Coffee shops
  ],
  amount: 120000, // $120,000 ARS limit for all food
  frequency: "monthly"
});
```

**Creating an Account Type Budget:**
```typescript
await createBudget({
  scopeType: "accountType",
  scopeAccountType: "expense",
  amount: 500000, // $500,000 ARS limit for all expenses
  frequency: "monthly"
});
```

**Querying Budget Execution:**
```typescript
const execution = await getBudgetExecution({
  budgetId: "j123..."
});
// Returns:
// {
//   budgetAmount: 50000,
//   spentAmount: 32500,
//   remainingAmount: 17500,
//   percentUsed: 65,
//   status: "under_budget"
// }
```

**Background Job Configuration (convex/crons.ts):**
```typescript
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "update-monthly-rollups",
  { hourUTC: 2, minuteUTC: 0 }, // 2:00 AM UTC
  internal.ledger.rollupJobs.updateMonthlyRollups
);

export default crons;
```

**Monthly Rollup Query:**
```typescript
// Query pre-aggregated data for Home dashboard
const rollups = await db
  .query("monthly_rollups")
  .withIndex("by_user_month", q =>
    q.eq("userId", userId).eq("month", "2025-10")
  )
  .collect();

// Sum by account type for dashboard card
const expenseTotal = rollups
  .filter(r => accounts.get(r.accountId)?.accountType === "expense")
  .reduce((sum, r) => sum + r.amountBaseCurrency, 0);
```

