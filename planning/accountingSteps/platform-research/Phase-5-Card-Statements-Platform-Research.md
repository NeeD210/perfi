# 🏗️ Platform Research Report: Convex Constraints and Capabilities

**Researcher:** Platform Research Specialist  
**Research Date:** October 12, 2025  
**Phase Scope:** Phase 5 - Card Statements & Settlement (Weeks 10-11)

## I. Executive Summary

Phase 5 focuses on implementing automated card statement calculation and settlement processing for the PerFi accounting core. This phase introduces scheduled background jobs that will calculate card statements on closing dates and post settlement entries on due dates. The research identifies several critical platform constraints that must be addressed:

**Key Findings:**
- **P1 HIGH PRIORITY**: Scheduled actions have execution time limits that require careful batch processing design
- **P1 HIGH PRIORITY**: Transaction complexity for card statement calculations may require pre-aggregation strategies
- **P2 MEDIUM PRIORITY**: Schema migration for statement metadata requires careful planning to avoid breaking changes
- **P2 MEDIUM PRIORITY**: Error handling and retry logic must be robust for financial data integrity

**Recommendations:**
1. Implement incremental batch processing for statement calculations to stay within execution limits
2. Leverage existing `monthly_rollups` infrastructure for statement aggregation
3. Use idempotency keys rigorously to prevent duplicate settlements
4. Implement comprehensive error tracking and alerting for scheduled jobs

---

## II. Performance and Scalability Constraints

### A. Query Performance Limits

| Constraint | Limit | Impact | Recommendation |
|:---|:---|:---|:---|
| Query Execution Time | Recommended < 1s for interactive queries | Statement calculation queries may scan hundreds of card transactions | Use `monthly_rollups` pre-aggregation for fast statement totals |
| Transaction Read Limit | No hard limit, but large scans are slow | Multi-card users with 100s of monthly transactions | Batch processing with cursor-based pagination |
| Index Requirements | Queries without indexes perform table scans | Critical for `by_accountId_date` lookups | Schema already defines required indexes |
| Concurrent Query Limit | High (1000s), but mutations serialize | Settlement posting must handle multiple cards | Stagger settlement times or batch by user |

**Phase 5 Specific Constraints:**

1. **Card Statement Calculation Query Pattern:**
```typescript
// GOOD: Uses index for efficient date range scan
const cardTransactions = await ctx.db
  .query("journal_lines")
  .withIndex("by_accountId_date", (q) =>
    q.eq("accountId", cardAccountId)
     .gte("entryDate", periodStart)
     .lte("entryDate", periodEnd)
  )
  .collect();
```

2. **Performance Target**: Statement calculation for a card with 100 transactions should complete in < 500ms

### B. Indexing Requirements

**Existing Indexes (from schema.ts):**
```typescript
journal_lines:
  - by_entryId: ["journalEntryId"]
  - by_accountId_date: ["accountId", "entryDate"] ✅ CRITICAL for Phase 5
  - by_user_accountId_date: ["userId", "accountId", "entryDate"]

journal_entries:
  - by_user_date: ["userId", "date"]
  - by_user_status_date: ["userId", "status", "date"] ✅ For planned entries
  - by_sourceType_sourceId: ["sourceType", "sourceId"]

cards:
  - by_accountId: ["accountId"] ✅ For card metadata lookup
  - by_user: ["userId"]
```

**Additional Indexes Needed for Phase 5:**
```typescript
// Statement summary table (new)
card_statements: defineTable({
  accountId: v.id("accounts"),
  userId: v.id("users"),
  periodStart: v.number(),
  periodEnd: v.number(),
  closingDate: v.number(),
  dueDate: v.number(),
  totalAmount: v.number(),
  status: v.union(v.literal("pending"), v.literal("posted"), v.literal("paid")),
  settlementEntryId: v.optional(v.id("journal_entries")),
})
  .index("by_accountId_closingDate", ["accountId", "closingDate"])
  .index("by_user_status", ["userId", "status"])
  .index("by_dueDate_status", ["dueDate", "status"]) // For settlement job
```

### C. Concurrent Request Handling

**Rate Limits (Convex Platform):**
- **Mutations**: No strict rate limit, but serialized per-document
- **Queries**: Highly concurrent (1000s simultaneous)
- **Scheduled Actions**: Run independently, no concurrency limit

**Phase 5 Implications:**
- Settlement posting for multiple cards can run in parallel
- Statement calculation can be parallelized by card account
- Use `ctx.db.patch` instead of `ctx.db.get` + `ctx.db.replace` to avoid read-modify-write races

---

## III. Background Job Limitations

### A. Job Timeout Behavior

| Job Type | Timeout Limit | Scalability Limit | Recommendation |
|:---|:---|:---|:---|
| Scheduled Actions (cron) | 10 minutes max recommended | Process all users' cards in single run | Batch users, process incrementally with resume logic |
| Scheduled Mutations | 5 minutes max recommended | Process single user or small batch | Ideal for per-user statement calculation |
| Internal Actions | 10 minutes max recommended | Can call multiple mutations | Use for orchestration, not computation |

**Existing Cron Jobs (from crons.ts):**
```typescript
// Midnight UTC - Recurring transactions
crons.cron("processRecurringTransactions", "0 0 * * *", ...);

// 00:05 UTC - Budget rollover
crons.cron("budgetRollover", "5 0 * * *", ...);

// 02:00 UTC - Rollup reconciliation
crons.cron("rollupReconciliation", "0 2 * * *", ...);
```

**Phase 5 Cron Jobs:**
```typescript
// 01:00 UTC - Card statement calculation (daily scan for closing dates)
crons.cron("cardStatementCalculation", "0 1 * * *", internal.ledger.cardStatements.processClosingStatements);

// 03:00 UTC - Card settlement posting (daily scan for due dates)
crons.cron("cardSettlementPosting", "0 3 * * *", internal.ledger.cardStatements.processSettlements);
```

### B. Job Scalability Patterns

**Pattern 1: Incremental Processing with Cursor**
```typescript
export const processClosingStatements = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    batchSize: v.number(),
  },
  returns: v.object({
    processed: v.number(),
    hasMore: v.boolean(),
    nextCursor: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const today = new Date().setUTC Hours(0, 0, 0, 0);
    
    // Find cards with closing date matching today
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_closingDay", (q) => q.eq("closingDay", new Date().getUTCDate()))
      .collect();
    
    let processed = 0;
    for (const card of cards.slice(0, args.batchSize)) {
      await calculateAndStoreStatement(ctx, card, today);
      processed++;
    }
    
    return {
      processed,
      hasMore: cards.length > args.batchSize,
      nextCursor: cards.length > args.batchSize ? cards[args.batchSize]._id : undefined,
    };
  },
});
```

**Pattern 2: Per-User Processing**
```typescript
// Scheduled action calls mutation per user
export const processStatementScheduler = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx, args) => {
    // Get all users with cards
    const users = await ctx.runQuery(internal.ledger.cardStatements.getUsersWithCards, {});
    
    for (const userId of users) {
      await ctx.runMutation(internal.ledger.cardStatements.processUserStatements, { userId });
    }
    
    return null;
  },
});
```

### C. Error Handling Patterns

**Idempotency Key Strategy:**
```typescript
const idempotencyKey = `card-statement-${cardAccountId}-${closingDate}`;

const existingStatement = await ctx.db
  .query("card_statements")
  .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
  .unique();

if (existingStatement) {
  console.log("Statement already calculated, skipping");
  return existingStatement;
}
```

**Error Tracking Integration:**
```typescript
import { logDualWriteError } from "./errorTracking";

try {
  await createSettlementEntry(ctx, statement);
} catch (error) {
  await logDualWriteError(ctx, {
    operation: "card_settlement_posting",
    errorType: "settlement_creation_failed",
    errorMessage: error.message,
    metadata: { statementId: statement._id, cardAccountId: statement.accountId },
  });
  throw error; // Re-throw to trigger retry
}
```

---

## IV. Schema Migration Constraints

### A. Schema Evolution Limits

| Migration Type | Constraint | Impact | Strategy |
|:---|:---|:---|:---|
| Add New Table | No limit | `card_statements` table needed | Deploy schema, then deploy functions |
| Add New Field | No limit | Optional fields only initially | Use `v.optional()` for new fields |
| Add New Index | No limit, but can be slow on large tables | `by_dueDate_status` on new table | Index creation is fast on empty tables |
| Modify Field Type | Requires migration | N/A for Phase 5 | Not needed |
| Remove Field | Requires migration | N/A for Phase 5 | Not needed |

**Phase 5 Schema Changes:**

1. **New Table: `card_statements`**
```typescript
card_statements: defineTable({
  accountId: v.id("accounts"),
  userId: v.id("users"),
  periodStart: v.number(),
  periodEnd: v.number(),
  closingDate: v.number(),
  dueDate: v.number(),
  totalAmount: v.number(), // Minor units in base currency
  currencyCode: v.string(),
  status: v.union(v.literal("pending"), v.literal("posted"), v.literal("paid")),
  settlementEntryId: v.optional(v.id("journal_entries")),
  idempotencyKey: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_accountId_closingDate", ["accountId", "closingDate"])
  .index("by_user_status", ["userId", "status"])
  .index("by_dueDate_status", ["dueDate", "status"])
  .index("by_idempotencyKey", ["idempotencyKey"])
```

2. **Extended `cards` Table Fields (Optional):**
```typescript
// Add to existing cards table
cards: defineTable({
  // ... existing fields ...
  lastStatementDate: v.optional(v.number()), // Last calculated statement
  lastSettlementDate: v.optional(v.number()), // Last posted settlement
})
```

### B. Data Migration Limits

**Backward Compatibility Requirements:**
- Existing card transactions (journal_lines with card liability accounts) remain unchanged
- New `card_statements` table is additive, doesn't affect existing data
- Settlement entries use existing `journal_entries` and `journal_lines` tables

**Migration Strategy:**
1. Deploy schema with `card_statements` table
2. Deploy statement calculation functions
3. Deploy scheduled cron jobs (initially disabled)
4. Test manually on single card
5. Enable cron jobs for production

---

## V. Platform-Specific Patterns

### A. Function Reference Best Practices

```typescript
// ✅ CORRECT: Use internal functions for scheduled jobs
import { internal } from "../_generated/api";
import { internalMutation, internalAction } from "../_generated/server";

export const processSettlements = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx, args) => {
    // Implementation
  },
});

// Register cron in crons.ts
crons.cron("cardSettlement", "0 3 * * *", internal.ledger.cardStatements.processSettlements, {});

// ❌ INCORRECT: Don't export settlement functions as public
export const processSettlements = mutation({ ... }); // Exposed to public API!
```

**Calling Patterns:**
```typescript
// From scheduled action to mutation
export const statementOrchestrator = internalAction({
  handler: async (ctx, args) => {
    // Call mutation to process statements
    await ctx.runMutation(internal.ledger.cardStatements.calculateStatements, {});
  },
});

// From mutation to mutation (same transaction)
export const postSettlement = internalMutation({
  handler: async (ctx, args) => {
    // Create settlement entry
    const entryId = await createJournalEntry(ctx, ...);
    
    // Update statement status (same transaction)
    await ctx.db.patch(statementId, { status: "posted", settlementEntryId: entryId });
  },
});
```

### B. Error Handling Patterns

**Convex-Specific Error Types:**
```typescript
import { ConvexError } from "convex/values";

// Validation errors (client-facing)
if (statement.totalAmount <= 0) {
  throw new ConvexError("Invalid statement amount: must be positive");
}

// Internal errors (logged, retried)
try {
  await processSettlement(ctx, statement);
} catch (error) {
  console.error("Settlement processing failed", { statementId: statement._id, error });
  // Log to error tracking table
  await ctx.db.insert("error_logs", {
    operation: "card_settlement",
    entityId: statement._id,
    errorMessage: error.message,
    timestamp: Date.now(),
  });
  throw error; // Re-throw for retry
}
```

**Retry Logic (Scheduled Jobs):**
```typescript
// Scheduled actions retry automatically on failure
// Add explicit retry counter for complex operations
export const processSettlements = internalMutation({
  args: { retryCount: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const retryCount = args.retryCount ?? 0;
    
    try {
      await performSettlement(ctx);
    } catch (error) {
      if (retryCount < 3) {
        // Schedule retry with backoff
        await ctx.scheduler.runAfter(
          60000 * Math.pow(2, retryCount), // Exponential backoff
          internal.ledger.cardStatements.processSettlements,
          { retryCount: retryCount + 1 }
        );
      } else {
        // Max retries reached, log critical error
        await logCriticalError(ctx, error);
      }
    }
  },
});
```

### C. Monitoring and Observability

**Logging Patterns:**
```typescript
// Structured logging for scheduled jobs
export const processClosingStatements = internalMutation({
  handler: async (ctx, args) => {
    const startTime = Date.now();
    let processedCount = 0;
    let errorCount = 0;
    
    try {
      // Process statements
      const cards = await getCardsWithClosingToday(ctx);
      
      for (const card of cards) {
        try {
          await calculateStatement(ctx, card);
          processedCount++;
        } catch (error) {
          errorCount++;
          console.error("Statement calculation failed", {
            cardId: card._id,
            accountId: card.accountId,
            error: error.message,
          });
        }
      }
      
      // Log summary
      console.log("Statement processing complete", {
        duration: Date.now() - startTime,
        total: cards.length,
        processed: processedCount,
        errors: errorCount,
      });
    } catch (error) {
      console.error("Statement processing job failed", {
        duration: Date.now() - startTime,
        error: error.message,
      });
      throw error;
    }
  },
});
```

**Metrics Tracking:**
```typescript
// Store job execution metrics
job_metrics: defineTable({
  jobName: v.string(),
  startTime: v.number(),
  endTime: v.number(),
  duration: v.number(),
  recordsProcessed: v.number(),
  errorsCount: v.number(),
  status: v.union(v.literal("success"), v.literal("partial"), v.literal("failed")),
})
  .index("by_jobName_startTime", ["jobName", "startTime"])
```

---

## VI. Risk Assessment and Mitigation

### A. High-Risk Platform Constraints

**P0 BLOCKER:** None identified - Phase 5 is feasible within platform constraints

**P1 HIGH PRIORITY:**

1. **Statement Calculation Performance**
   - **Risk**: Large card transaction volumes may cause statement calculation to exceed execution time limits
   - **Likelihood**: Medium (users with 500+ monthly transactions)
   - **Impact**: High (missed statement calculations, incorrect billing)
   - **Mitigation**: 
     - Use `monthly_rollups` pre-aggregation for total calculations
     - Implement incremental batch processing with cursor pagination
     - Set reasonable timeout thresholds and alert on slow calculations

2. **Settlement Posting Race Conditions**
   - **Risk**: Multiple settlement postings for same statement due to job retries
   - **Likelihood**: Low (but high impact if occurs)
   - **Impact**: Critical (duplicate charges, data integrity violation)
   - **Mitigation**:
     - Use idempotency keys on `journal_entries` (`by_idempotencyKey` index)
     - Check `card_statements.settlementEntryId` before posting
     - Implement zero-sum validation on all journal entries

**P2 MEDIUM PRIORITY:**

3. **Exchange Rate Availability**
   - **Risk**: Missing exchange rates for cross-currency card transactions on settlement date
   - **Likelihood**: Medium (API downtime, rate not fetched)
   - **Impact**: Medium (settlement delayed, manual intervention needed)
   - **Mitigation**:
     - Pre-fetch rates for upcoming settlement dates (1 week ahead)
     - Fall back to user-provided rate if official rate unavailable
     - Alert on missing rates 48 hours before settlement

4. **Timezone Handling**
   - **Risk**: Card closing day calculation incorrect due to timezone issues
   - **Likelihood**: Medium (Argentina is UTC-3, calculations at UTC 00:00)
   - **Impact**: Medium (statements calculated 1 day late)
   - **Mitigation**:
     - Store all dates as UTC epoch ms
     - Use UTC day boundaries for closing day matching
     - Document timezone assumptions clearly

### B. Mitigation Strategies

**Strategy 1: Pre-Aggregation for Performance**
```typescript
// Leverage existing monthly_rollups for fast statement totals
export const calculateStatementTotal = async (
  ctx: MutationCtx,
  cardAccountId: Id<"accounts">,
  periodStart: number,
  periodEnd: number
): Promise<number> => {
  // Try rollup first (fast path)
  const rollup = await ctx.db
    .query("monthly_rollups")
    .withIndex("by_account_month", (q) =>
      q.eq("accountId", cardAccountId).eq("month", periodStart)
    )
    .unique();
  
  if (rollup) {
    return rollup.totalCredits; // Credits to card liability = charges
  }
  
  // Fall back to line-by-line aggregation (slow path)
  const lines = await ctx.db
    .query("journal_lines")
    .withIndex("by_accountId_date", (q) =>
      q.eq("accountId", cardAccountId)
       .gte("entryDate", periodStart)
       .lte("entryDate", periodEnd)
    )
    .collect();
  
  return lines
    .filter(l => l.direction === "credit")
    .reduce((sum, l) => sum + l.amountBaseCurrency, 0);
};
```

**Strategy 2: Idempotency Enforcement**
```typescript
// Idempotency key format: operation-entity-date
const generateIdempotencyKey = (
  operation: string,
  entityId: string,
  date: number
): string => {
  return `${operation}-${entityId}-${date}`;
};

// Check before creating journal entry
const settlementIdempotencyKey = generateIdempotencyKey(
  "card-settlement",
  statement.accountId,
  statement.dueDate
);

const existingEntry = await ctx.db
  .query("journal_entries")
  .withIndex("by_idempotencyKey", (q) =>
    q.eq("idempotencyKey", settlementIdempotencyKey)
  )
  .first();

if (existingEntry) {
  console.log("Settlement already posted, skipping");
  return existingEntry._id;
}
```

**Strategy 3: Graceful Degradation**
```typescript
// Continue processing even if individual card fails
export const processAllStatements = internalMutation({
  handler: async (ctx, args) => {
    const cards = await getCardsWithClosingToday(ctx);
    const results = [];
    
    for (const card of cards) {
      try {
        const statement = await calculateStatement(ctx, card);
        results.push({ cardId: card._id, status: "success", statementId: statement._id });
      } catch (error) {
        results.push({ cardId: card._id, status: "failed", error: error.message });
        // Log but don't throw - continue processing other cards
        await logError(ctx, "statement_calculation_failed", card._id, error);
      }
    }
    
    return results;
  },
});
```

---

## VII. Recommendations for PRD Integration

### A. Performance Targets

**Statement Calculation:**
- **Target**: < 500ms per card with 100 transactions
- **Maximum**: < 2s per card with 500 transactions
- **Batch Size**: Process up to 100 cards per scheduled job run (< 5 minutes total)

**Settlement Posting:**
- **Target**: < 200ms per settlement entry (2 journal_lines)
- **Maximum**: < 1s per settlement with rollup updates
- **Batch Size**: Process up to 200 settlements per scheduled job run (< 5 minutes total)

**Scheduled Job Execution:**
- **Statement Calculation Job**: Daily at 01:00 UTC, max 5 minutes
- **Settlement Posting Job**: Daily at 03:00 UTC, max 5 minutes
- **Error Rate Threshold**: < 1% of statements/settlements should fail

### B. Architecture Decisions

**1. Use Monthly Rollups for Statement Aggregation**
- Leverage existing `monthly_rollups` table for fast statement totals
- Fall back to line-by-line aggregation only if rollup missing
- Ensures consistent performance regardless of transaction volume

**2. Separate Statement Calculation from Settlement Posting**
- Calculate and store statements in `card_statements` table
- Post settlement entries in separate scheduled job
- Allows manual review of statements before settlement if needed

**3. Implement Idempotency at Multiple Levels**
- Idempotency keys on `journal_entries` table
- Check `card_statements` for duplicate statements
- Check `settlementEntryId` before posting settlement

**4. Use Internal Functions for All Scheduled Jobs**
- Never expose statement/settlement processing as public API
- Use `internalMutation` and `internalAction` exclusively
- Register cron jobs in `crons.ts` with `internal.ledger.*` references

### C. Implementation Constraints

**MUST Requirements:**

1. **Idempotency**: All statement calculations and settlement postings must be idempotent
   - Use `idempotencyKey` field in `journal_entries`
   - Check for existing statements before creating
   - Validate zero-sum invariant on all settlement entries

2. **Error Handling**: Graceful degradation with comprehensive logging
   - Log all errors to `error_logs` table (or reuse error tracking)
   - Continue processing other cards if one fails
   - Alert on error rate > 1%

3. **Zero-Sum Validation**: All settlement entries must balance
   - Dr card account (liability), Cr bank account (asset)
   - Validate sum of `amountBaseCurrency` across lines = 0
   - Reject settlement if validation fails

4. **Exchange Rate Handling**: Proper FX rate resolution for multi-currency
   - Use user-provided rate if available (accurate cost basis)
   - Fall back to settlement-date official rate
   - Alert if rate unavailable 48 hours before settlement

**SHOULD Requirements:**

1. **Performance Monitoring**: Track job execution metrics
   - Store execution time, records processed, error count
   - Alert if job exceeds 5-minute threshold
   - Dashboard for historical job performance

2. **Manual Override Capability**: Allow manual statement calculation/settlement
   - Public mutation for admins to trigger statement recalculation
   - Public mutation to manually post settlement
   - Audit trail for manual overrides

3. **Statement Preview**: Show estimated statement before closing date
   - Query current period transactions
   - Calculate estimated total
   - Show in UI for user awareness

**COULD Requirements:**

1. **Partial Settlement Support**: Allow partial payments on due date
2. **Statement Email Notification**: Send email when statement calculated
3. **Statement History Export**: Export statement history to CSV

---

## VIII. Platform Expertise Integration

### A. Required Expertise Areas

1. **Scheduled Actions & Cron Jobs**
   - Understanding cron syntax and UTC timezone handling
   - Batch processing patterns for large datasets
   - Error handling and retry logic in scheduled contexts

2. **Transaction Integrity & Zero-Sum Validation**
   - Double-entry accounting constraints
   - Atomic mutations across multiple tables
   - Rollback strategies for failed settlements

3. **Idempotency & Deduplication**
   - Idempotency key generation and validation
   - Race condition prevention in concurrent environments
   - Retry-safe operations

4. **Performance Optimization**
   - Index-based query patterns
   - Pre-aggregation strategies (`monthly_rollups`)
   - Cursor-based pagination for large result sets

### B. Knowledge Gaps

1. **Exchange Rate Prefetching**: Need to implement proactive rate fetching for upcoming settlement dates
   - Action Item: Add scheduled job to fetch rates for next 7 days
   - Integration with existing `exchange_rates` table and providers

2. **Statement Reconciliation**: Process for verifying statement accuracy against actual transactions
   - Action Item: Design reconciliation query comparing `card_statements.totalAmount` to `journal_lines` aggregation
   - Scheduled reconciliation job similar to `rollupReconciliation`

3. **Timezone Edge Cases**: Handling users in different timezones with varying closing days
   - Current Design: All calculations in UTC, closing day is day-of-month (1-31)
   - Potential Issue: Argentina (UTC-3) card closing at midnight local time
   - Action Item: Document assumption that closing day is UTC day boundary

### C. Documentation Requirements

1. **Card Statement Lifecycle Documentation**
   - Diagram showing flow from transaction → statement → settlement
   - State machine for `card_statements.status`
   - Timeline showing when calculations happen (closing day, due date)

2. **Scheduled Job Runbook**
   - Description of each scheduled job
   - Expected execution time and batch sizes
   - Error scenarios and recovery procedures
   - Manual intervention procedures

3. **Settlement Entry Format**
   - Example journal entry for card settlement
   - Explanation of Dr/Cr lines
   - Linking strategy (`parentEntryId`, `linkType`)
   - Currency conversion handling

4. **Testing Strategy**
   - Unit tests for statement calculation logic
   - Integration tests for settlement posting
   - End-to-end test simulating full month cycle
   - Performance tests for large transaction volumes

---

## IX. Phase 5 Implementation Checklist

### Step 5.1 — Card Statement Calculation

- [ ] **Schema**: Add `card_statements` table to `schema.ts`
- [ ] **Indexes**: Create indexes for statement queries
  - `by_accountId_closingDate`
  - `by_user_status`
  - `by_dueDate_status`
  - `by_idempotencyKey`
- [ ] **Function**: `calculateStatement(ctx, card, closingDate)` mutation
  - Query card transactions in period
  - Calculate total amount
  - Store statement record with idempotency
- [ ] **Function**: `processClosingStatements()` scheduled mutation
  - Find cards with closing day = today
  - Call `calculateStatement` for each
  - Handle errors gracefully
- [ ] **Cron Job**: Register `cardStatementCalculation` in `crons.ts`
- [ ] **Tests**: Unit tests for statement calculation
- [ ] **Tests**: Integration test for scheduled job
- [ ] **Monitoring**: Add metrics logging for statement calculation

### Step 5.2 — Card Settlement Posting

- [ ] **Function**: `createSettlementEntry(ctx, statement)` mutation
  - Create journal_entry with `sourceType = 'statement'`
  - Generate idempotency key
  - Create Dr card / Cr bank journal_lines
  - Apply exchange rate if cross-currency
  - Validate zero-sum invariant
  - Update statement with `settlementEntryId`
- [ ] **Function**: `processSettlements()` scheduled mutation
  - Query statements with `dueDate = today` and `status = 'pending'`
  - Call `createSettlementEntry` for each
  - Mark statement as `posted`
  - Handle errors gracefully
- [ ] **Cron Job**: Register `cardSettlementPosting` in `crons.ts`
- [ ] **Tests**: Unit tests for settlement entry creation
- [ ] **Tests**: Zero-sum validation tests
- [ ] **Tests**: Idempotency tests (duplicate settlement prevention)
- [ ] **Tests**: Integration test for scheduled job
- [ ] **Monitoring**: Add metrics logging for settlement posting

### Step 5.3 — Installment Verification Flow

- [ ] **Function**: `verifyInstallment(ctx, entryId)` mutation
  - Update journal_entry `status = 'posted'`
  - Validate entry still balances
  - Optionally trigger settlement if all installments posted
- [ ] **Tests**: Installment verification tests
- [ ] **Tests**: Partial installment scenarios

### Additional Phase 5 Tasks

- [ ] **Documentation**: Card statement lifecycle diagram
- [ ] **Documentation**: Scheduled job runbook
- [ ] **Documentation**: Settlement entry format examples
- [ ] **Error Handling**: Integrate with existing `error_tracking` system
- [ ] **UI**: Show estimated statement in card detail view
- [ ] **UI**: Show settlement history for card
- [ ] **Manual Override**: Admin function to recalculate statement
- [ ] **Manual Override**: Admin function to manually post settlement

---

## X. Conclusion

Phase 5 (Card Statements & Settlement) is **feasible within Convex platform constraints** with careful implementation of the recommended patterns:

1. **Scheduled Jobs**: Use incremental batch processing with cursor pagination
2. **Performance**: Leverage `monthly_rollups` pre-aggregation for statement totals
3. **Integrity**: Enforce idempotency keys rigorously and validate zero-sum invariant
4. **Error Handling**: Implement graceful degradation with comprehensive logging

**No P0 blockers identified.** All P1 and P2 risks have clear mitigation strategies.

**Next Steps:**
1. Review and approve this platform research report
2. Proceed to PRD creation for Phase 5
3. Implement schema changes first (additive, low risk)
4. Implement and test statement calculation in isolation
5. Implement and test settlement posting separately
6. Deploy scheduled jobs with monitoring

**Estimated Implementation Time:** 2-3 weeks (Weeks 10-11 as planned)

---

## Appendix: Code Examples

### Example: Complete Statement Calculation Flow

```typescript
import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

/**
 * Calculate card statement for a specific closing date
 * Idempotent - will not create duplicate statements
 */
export const calculateStatement = internalMutation({
  args: {
    cardAccountId: v.id("accounts"),
    closingDate: v.number(),
  },
  returns: v.id("card_statements"),
  handler: async (ctx, args) => {
    // 1. Get card metadata
    const card = await ctx.db
      .query("cards")
      .withIndex("by_accountId", (q) => q.eq("accountId", args.cardAccountId))
      .unique();
    
    if (!card) {
      throw new Error("Card not found");
    }
    
    // 2. Check for existing statement (idempotency)
    const idempotencyKey = `statement-${args.cardAccountId}-${args.closingDate}`;
    const existing = await ctx.db
      .query("card_statements")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
      .first();
    
    if (existing) {
      console.log("Statement already exists", { statementId: existing._id });
      return existing._id;
    }
    
    // 3. Calculate period boundaries
    const periodEnd = args.closingDate;
    const periodStart = new Date(periodEnd);
    periodStart.setUTCMonth(periodStart.getUTCMonth() - 1);
    periodStart.setUTCHours(0, 0, 0, 0);
    
    // 4. Try rollup first (fast path)
    let totalAmount = 0;
    const rollup = await ctx.db
      .query("monthly_rollups")
      .withIndex("by_account_month", (q) =>
        q.eq("accountId", args.cardAccountId).eq("month", periodStart.getTime())
      )
      .first();
    
    if (rollup) {
      totalAmount = rollup.totalCredits; // Credits to card = charges
    } else {
      // 5. Fall back to line-by-line (slow path)
      const lines = await ctx.db
        .query("journal_lines")
        .withIndex("by_accountId_date", (q) =>
          q.eq("accountId", args.cardAccountId)
           .gte("entryDate", periodStart.getTime())
           .lte("entryDate", periodEnd)
        )
        .collect();
      
      totalAmount = lines
        .filter(l => l.direction === "credit")
        .reduce((sum, l) => sum + l.amountBaseCurrency, 0);
    }
    
    // 6. Calculate due date
    const dueDate = new Date(periodEnd);
    dueDate.setUTCDate(card.dueDate);
    if (dueDate <= periodEnd) {
      dueDate.setUTCMonth(dueDate.getUTCMonth() + 1);
    }
    
    // 7. Store statement
    const statementId = await ctx.db.insert("card_statements", {
      accountId: args.cardAccountId,
      userId: card.userId,
      periodStart: periodStart.getTime(),
      periodEnd: periodEnd,
      closingDate: args.closingDate,
      dueDate: dueDate.getTime(),
      totalAmount,
      currencyCode: "ARS", // TODO: Support multi-currency
      status: "pending",
      idempotencyKey,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    
    console.log("Statement calculated", {
      statementId,
      cardAccountId: args.cardAccountId,
      totalAmount,
      periodStart: periodStart.toISOString(),
      periodEnd: new Date(periodEnd).toISOString(),
      dueDate: dueDate.toISOString(),
    });
    
    return statementId;
  },
});

/**
 * Scheduled job to process all cards with closing date = today
 */
export const processClosingStatements = internalMutation({
  args: {},
  returns: v.object({
    total: v.number(),
    processed: v.number(),
    errors: v.number(),
  }),
  handler: async (ctx, args) => {
    const startTime = Date.now();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const closingDay = today.getUTCDate();
    
    // Find all cards with closing day = today
    const allCards = await ctx.db.query("cards").collect();
    const cardsClosingToday = allCards.filter(c => c.closingDay === closingDay && !c.softdelete);
    
    let processed = 0;
    let errors = 0;
    
    for (const card of cardsClosingToday) {
      try {
        await calculateStatement(ctx, {
          cardAccountId: card.accountId,
          closingDate: today.getTime(),
        });
        processed++;
      } catch (error) {
        errors++;
        console.error("Statement calculation failed", {
          cardId: card._id,
          accountId: card.accountId,
          error: error.message,
        });
      }
    }
    
    console.log("Statement processing complete", {
      duration: Date.now() - startTime,
      total: cardsClosingToday.length,
      processed,
      errors,
    });
    
    return { total: cardsClosingToday.length, processed, errors };
  },
});
```

### Example: Complete Settlement Posting Flow

```typescript
/**
 * Post settlement entry for a card statement
 * Dr Card (liability), Cr Bank (asset)
 */
export const postSettlement = internalMutation({
  args: {
    statementId: v.id("card_statements"),
  },
  returns: v.id("journal_entries"),
  handler: async (ctx, args) => {
    // 1. Get statement
    const statement = await ctx.db.get(args.statementId);
    if (!statement) {
      throw new Error("Statement not found");
    }
    
    if (statement.status !== "pending") {
      console.log("Statement already posted", { statementId: args.statementId, status: statement.status });
      return statement.settlementEntryId!;
    }
    
    // 2. Get card and parent bank account
    const card = await ctx.db
      .query("cards")
      .withIndex("by_accountId", (q) => q.eq("accountId", statement.accountId))
      .unique();
    
    const cardAccount = await ctx.db.get(statement.accountId);
    if (!cardAccount || !cardAccount.parentAccountId) {
      throw new Error("Card account or parent bank account not found");
    }
    
    // 3. Check for existing settlement (idempotency)
    const settlementIdempotencyKey = `settlement-${statement.accountId}-${statement.dueDate}`;
    const existingEntry = await ctx.db
      .query("journal_entries")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", settlementIdempotencyKey))
      .first();
    
    if (existingEntry) {
      console.log("Settlement already posted", { entryId: existingEntry._id });
      await ctx.db.patch(args.statementId, {
        status: "posted",
        settlementEntryId: existingEntry._id,
        updatedAt: Date.now(),
      });
      return existingEntry._id;
    }
    
    // 4. Create journal entry
    const entryId = await ctx.db.insert("journal_entries", {
      userId: statement.userId,
      date: statement.dueDate,
      updateTime: Date.now(),
      softdelete: false,
      description: `Card settlement for period ${new Date(statement.periodStart).toISOString().split('T')[0]} to ${new Date(statement.periodEnd).toISOString().split('T')[0]}`,
      status: "posted",
      sourceType: "statement",
      sourceId: statement._id,
      idempotencyKey: settlementIdempotencyKey,
      linkType: "settlement",
      createdBy: statement.userId,
    });
    
    // 5. Create Dr line (card liability decreases)
    await ctx.db.insert("journal_lines", {
      journalEntryId: entryId,
      userId: statement.userId,
      accountId: statement.accountId,
      direction: "debit",
      currencyCode: statement.currencyCode,
      amount: statement.totalAmount,
      amountBaseCurrency: statement.totalAmount,
      entryDate: statement.dueDate,
    });
    
    // 6. Create Cr line (bank asset decreases)
    await ctx.db.insert("journal_lines", {
      journalEntryId: entryId,
      userId: statement.userId,
      accountId: cardAccount.parentAccountId,
      direction: "credit",
      currencyCode: statement.currencyCode,
      amount: statement.totalAmount,
      amountBaseCurrency: statement.totalAmount,
      entryDate: statement.dueDate,
    });
    
    // 7. Validate zero-sum
    const lines = await ctx.db
      .query("journal_lines")
      .withIndex("by_entryId", (q) => q.eq("journalEntryId", entryId))
      .collect();
    
    const sum = lines.reduce((acc, line) => {
      return acc + (line.direction === "debit" ? line.amountBaseCurrency : -line.amountBaseCurrency);
    }, 0);
    
    if (sum !== 0) {
      throw new Error(`Zero-sum validation failed: sum = ${sum}`);
    }
    
    // 8. Update statement status
    await ctx.db.patch(args.statementId, {
      status: "posted",
      settlementEntryId: entryId,
      updatedAt: Date.now(),
    });
    
    console.log("Settlement posted", {
      statementId: args.statementId,
      entryId,
      amount: statement.totalAmount,
    });
    
    return entryId;
  },
});

/**
 * Scheduled job to process all settlements due today
 */
export const processSettlements = internalMutation({
  args: {},
  returns: v.object({
    total: v.number(),
    processed: v.number(),
    errors: v.number(),
  }),
  handler: async (ctx, args) => {
    const startTime = Date.now();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    
    // Find all pending statements with due date = today
    const allStatements = await ctx.db.query("card_statements").collect();
    const statementsDueToday = allStatements.filter(s => {
      const dueDate = new Date(s.dueDate);
      dueDate.setUTCHours(0, 0, 0, 0);
      return dueDate.getTime() === today.getTime() && s.status === "pending";
    });
    
    let processed = 0;
    let errors = 0;
    
    for (const statement of statementsDueToday) {
      try {
        await postSettlement(ctx, { statementId: statement._id });
        processed++;
      } catch (error) {
        errors++;
        console.error("Settlement posting failed", {
          statementId: statement._id,
          accountId: statement.accountId,
          error: error.message,
        });
      }
    }
    
    console.log("Settlement processing complete", {
      duration: Date.now() - startTime,
      total: statementsDueToday.length,
      processed,
      errors,
    });
    
    return { total: statementsDueToday.length, processed, errors };
  },
});
```

---

**End of Platform Research Report**

