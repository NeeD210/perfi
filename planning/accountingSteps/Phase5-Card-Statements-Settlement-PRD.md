# Phase 5: Card Statements & Settlement - Product Requirements Document

## Introduction

This PRD covers the implementation of automated card statement calculation and settlement posting for PerFi's accounting core. The goal is to establish a robust system that automatically calculates credit card statements on closing dates and posts settlement entries on due dates, enabling accurate financial tracking and automated payment processing.

This phase builds on the existing ledger infrastructure (Phases 1-4) and introduces scheduled background jobs that process card statements using accrual accounting principles. The system will calculate statement totals from card transactions, store statement summaries, and automatically post settlement entries that transfer liability from card accounts to bank accounts.

This is Phase 5 in the multi-phase accounting migration, focusing specifically on card statement lifecycle management through automated scheduled processes.

## Context & Background

### Current System
- Card transactions are recorded as journal entries with card liability accounts
- Manual statement calculation and settlement posting
- No automated processing of card closing/due dates
- Card metadata exists in `cards` table with `closingDay` and `dueDate` fields

### Target System
- Automated statement calculation on card closing dates
- Automated settlement posting on card due dates
- Statement summaries stored in dedicated `card_statements` table
- Settlement entries linked to original card transactions via `parentEntryId`
- Idempotent processing with comprehensive error handling

### Technology Stack
- Backend: Convex (TypeScript)
- Database: Convex NoSQL with scheduled actions
- Scheduling: Convex cron jobs
- Validation: Convex `v` validator library
- Error Handling: Integration with existing `error_tracking` system

### Key Concepts
- **Accrual Accounting**: Card charges create liability, settlement reduces liability
- **Statement Period**: Month-to-month billing cycle ending on closing day
- **Settlement Entry**: Dr card account (liability), Cr bank account (asset)
- **Idempotency**: Operations can be safely retried without creating duplicates
- **Zero-Sum Invariant**: All journal entries must balance (debits = credits)
- **Timezone Handling**: All date operations use UTC with explicit timezone conversion for closing day matching
- **Multi-Currency Support**: Statements calculated in card's base currency with exchange rate conversion
- **First Statement Period**: Initial billing period calculated from card creation date to first closing day

## User Stories

**US1:** *As a system administrator, I need automated card statement calculation on closing dates, so that card statements are generated accurately and consistently without manual intervention.*

**US2:** *As a system administrator, I need automated settlement posting on due dates, so that card payments are processed automatically and liability is properly transferred to bank accounts.*

**US3:** *As a developer, I need idempotent statement and settlement processing, so that scheduled jobs can be safely retried without creating duplicate entries or corrupting financial data.*

**US4:** *As a user, I need accurate statement totals calculated from my card transactions, so that I can trust the automated billing amounts match my actual spending.*

**US5:** *As a system administrator, I need comprehensive error handling and logging for scheduled jobs, so that I can monitor statement processing and quickly resolve any issues.*

## Acceptance Criteria

### For US1 (Automated Statement Calculation):

**Statement Calculation Process:**
- [ ] Scheduled job runs daily at 01:00 UTC to check for cards with closing day = today
- [ ] For each qualifying card, calculate statement total from journal_lines in the billing period
- [ ] Statement period runs from previous closing date to current closing date (or card creation date for first statement)
- [ ] Statement total includes all credit transactions to the card account (charges) converted to card's base currency
- [ ] Statement record created in `card_statements` table with `status = 'pending'`
- [ ] Idempotency key prevents duplicate statements for same card/period
- [ ] Timezone conversion ensures closing day matching works across user timezones

**Statement Data Accuracy:**
- [ ] Statement total matches sum of card transactions in period
- [ ] Statement includes correct period start/end dates
- [ ] Due date uses card's stored `dueDate` field directly
- [ ] Statement linked to correct card account and user

### For US2 (Automated Settlement Posting):

**Settlement Posting Process:**
- [ ] Scheduled job runs daily at 03:00 UTC to check for statements with due date = today
- [ ] For each pending statement, create settlement journal entry
- [ ] Settlement entry: Dr card account (liability), Cr bank account (asset)
- [ ] Settlement amount equals statement total amount
- [ ] Settlement entry linked to statement via `settlementEntryId`
- [ ] Statement status updated to `posted` after successful settlement
- [ ] Graceful handling of cards with missing `parentAccountId` (skip with error logging)

**Settlement Entry Validation:**
- [ ] Settlement journal entry maintains zero-sum invariant
- [ ] Settlement amount matches statement total exactly
- [ ] Bank account is the card's `parentAccountId`
- [ ] Settlement entry has proper `sourceType = 'statement'` and `linkType = 'settlement'`

### For US3 (Idempotent Processing):

**Idempotency Enforcement:**
- [ ] Statement calculation checks for existing statement before creating new one
- [ ] Settlement posting checks for existing settlement entry before creating new one
- [ ] Idempotency keys use format: `statement-{cardAccountId}-{closingDate}` and `settlement-{cardAccountId}-{dueDate}`
- [ ] Duplicate operations return existing record instead of creating new one
- [ ] All scheduled jobs can be safely retried without side effects

**Race Condition Prevention:**
- [ ] Database operations use atomic mutations
- [ ] Idempotency checks happen within same transaction as creation
- [ ] Settlement posting validates statement status before proceeding

### For US4 (Accurate Statement Totals):

**Calculation Accuracy:**
- [ ] Statement total calculated from `journal_lines` with `accountId = cardAccountId`
- [ ] Only credit transactions included (charges to card)
- [ ] Period filtering uses `entryDate` between period start and end
- [ ] Amounts converted to card's base currency using **closing date exchange rate**
- [ ] Multi-currency transactions properly aggregated in base currency
- [ ] Exchange rate is **user-modifiable** to match actual rates paid
- [ ] Calculation matches manual verification within 1 cent tolerance

**Performance Requirements:**
- [ ] Statement calculation completes in < 500ms for cards with 100 transactions
- [ ] Statement calculation completes in < 2s for cards with 500 transactions
- [ ] Leverage `monthly_rollups` table for fast aggregation when available
- [ ] Fall back to line-by-line calculation with **closing date exchange rate conversion** if rollup missing
- [ ] Performance degradation limit: < 5s for cards with 1000+ transactions when using fallback

### For US5 (Error Handling and Monitoring):

**Error Handling:**
- [ ] Individual card failures don't stop processing of other cards
- [ ] All errors logged to `error_logs` table with operation context
- [ ] Failed statements/settlements can be manually retried
- [ ] Error rate monitoring with alerts if > 1% of operations fail

**Logging and Monitoring:**
- [ ] Job execution metrics stored (duration, records processed, error count)
- [ ] Structured logging for all statement and settlement operations
- [ ] Performance monitoring for job execution times
- [ ] Alert on jobs exceeding 5-minute execution threshold

## Detailed Specifications

### card_statements Table

**Purpose**: Store calculated card statement summaries for billing periods

**Fields:**
```typescript
{
  id: v.id("card_statements"),
  accountId: v.id("accounts"), // FK to card liability account
  userId: v.id("users"), // FK to user who owns the card
  periodStart: v.number(), // epoch milliseconds (start of billing period)
  periodEnd: v.number(), // epoch milliseconds (end of billing period)
  closingDate: v.number(), // epoch milliseconds (statement closing date)
  dueDate: v.number(), // epoch milliseconds (payment due date)
  totalAmount: v.number(), // signed integer in minor units (statement total)
  currencyCode: v.string(), // ISO 4217 currency code (e.g., "ARS", "USD")
  exchangeRate: v.optional(v.number()), // Exchange rate used for conversion (user-modifiable)
  exchangeRateId: v.optional(v.id("exchange_rates")), // Reference to official rate
  status: v.union(
    v.literal("pending"), // calculated but not yet settled
    v.literal("posted"), // settlement entry created
    v.literal("paid") // payment received (future enhancement)
  ),
  settlementEntryId: v.optional(v.id("journal_entries")), // FK to settlement entry
  idempotencyKey: v.string(), // prevents duplicate statements
  createdAt: v.number(), // epoch milliseconds
  updatedAt: v.number(), // epoch milliseconds
}
```

**Indexes:**
- `by_accountId_closingDate`: Query statements by card and closing date
- `by_user_status`: Query user's statements by status
- `by_dueDate_status`: Query statements due for settlement
- `by_idempotencyKey`: Prevent duplicate statement creation

**Business Rules:**
- `totalAmount` must be positive (represents charges to card)
- `dueDate` must be after `closingDate`
- `status` transitions: `pending` → `posted` → `paid`
- `settlementEntryId` required when `status = 'posted'`
- `idempotencyKey` must be unique across all statements

### calculateStatement Mutation

**Purpose**: Calculate and store card statement for a specific closing date

**Input:**
```typescript
{
  cardAccountId: Id<"accounts">, // card liability account
  closingDate: number, // epoch milliseconds (closing date)
}
```

**Output:**
```typescript
{
  statementId: Id<"card_statements">, // created statement ID
  totalAmount: number, // calculated statement total
  periodStart: number, // billing period start
  periodEnd: number, // billing period end
  dueDate: number, // payment due date
}
```

**Business Logic:**
1. Validate card account exists and is active
2. Check for existing statement using idempotency key
3. Calculate billing period:
   - First statement: card creation date to current closing date
   - Subsequent statements: previous closing date to current closing date
4. Query card transactions in period using `by_accountId_date` index
5. Get exchange rate for closing date (user-modifiable)
6. Convert all transactions to card's base currency using closing date rate
7. Sum credit transactions (charges) in base currency
8. Calculate due date using card's stored `dueDate` field
9. Create statement record with `status = 'pending'` and exchange rate info
10. Return statement details

**Validations:**
- Card account must exist and not be soft-deleted
- Closing date must be valid epoch milliseconds
- Statement period must be positive duration
- Total amount must be >= 0

**Error Conditions:**
- Throws `ConvexError("Card account not found")` when account doesn't exist
- Throws `ConvexError("Invalid closing date")` when date is invalid
- Returns existing statement if idempotency key matches

### postSettlement Mutation

**Purpose**: Create settlement journal entry for a card statement

**Input:**
```typescript
{
  statementId: Id<"card_statements">, // statement to settle
}
```

**Output:**
```typescript
{
  entryId: Id<"journal_entries">, // settlement journal entry ID
  amount: number, // settlement amount
  cardAccountId: Id<"accounts">, // card account debited
  bankAccountId: Id<"accounts">, // bank account credited
}
```

**Business Logic:**
1. Validate statement exists and status is `pending`
2. Get card account and determine settlement bank account
3. Check for existing settlement using idempotency key
4. Determine bank account for settlement:
   - Primary: Use card's `parentAccountId` if valid
   - Fallback: Use user's first available asset account
5. Create journal entry with `sourceType = 'statement'` and `linkType = 'settlement'`
6. Create debit line: card account (liability decrease)
7. Create credit line: bank account (asset decrease)
8. Validate zero-sum invariant
9. Update statement status to `posted` and link settlement entry
10. Log fallback usage if main asset account was used
11. Return settlement details

**Validations:**
- Statement must exist and be in `pending` status
- Card account must exist and be active
- Bank account must exist (either parentAccountId or main asset account)
- Settlement amount must equal statement total
- Journal entry must maintain zero-sum invariant

**Error Conditions:**
- Throws `ConvexError("Statement not found")` when statement doesn't exist
- Throws `ConvexError("Statement already settled")` when status is not `pending`
- Throws `ConvexError("No settlement account available")` when neither parentAccountId nor main asset account exists
- Throws `ConvexError("Zero-sum validation failed")` when entry doesn't balance
- Returns existing settlement if idempotency key matches
- Logs fallback usage when main asset account is used for settlement

### processClosingStatements Scheduled Mutation

**Purpose**: Daily job to calculate statements for cards with closing day = today

**Input:**
```typescript
{
  // No input parameters - processes all qualifying cards
}
```

**Output:**
```typescript
{
  total: number, // total cards processed
  processed: number, // successfully processed
  errors: number, // failed processing
  duration: number, // execution time in milliseconds
}
```

**Business Logic:**
1. Get current UTC date and extract day of month
2. Query all active cards with `closingDay = today`
3. For each card, call `calculateStatement` mutation
4. Track success/failure counts
5. Log execution metrics
6. Return processing summary

**Error Handling:**
- Individual card failures don't stop processing
- All errors logged with card context
- Failed cards can be manually retried
- Execution continues even if some cards fail

### getClosingDateExchangeRate Helper Function

**Purpose**: Get exchange rate for statement closing date (user-modifiable)

**Input:**
```typescript
{
  baseCurrency: string, // Card's base currency
  closingDate: number, // Closing date in epoch milliseconds
}
```

**Output:**
```typescript
{
  rate: number, // Exchange rate for conversion
  rateId: Id<"exchange_rates">, // Reference to official rate
}
```

**Business Logic:**
1. Get official exchange rate for closing date
2. Allow user to override with custom rate (future enhancement)
3. Return rate and official rate reference
4. Default to 1.0 if same currency

**Error Conditions:**
- Returns default rate if no official rate found
- Logs warning when using fallback rates

### getUserMainAssetAccount Helper Function

**Purpose**: Get user's primary bank account for settlement fallback

**Input:**
```typescript
{
  userId: Id<"users">, // user to get main asset account for
}
```

**Output:**
```typescript
{
  accountId: Id<"accounts">, // main asset account ID
  accountName: string, // account name for logging
}
```

**Business Logic:**
1. Query user's accounts with `accountType = 'asset'` and `softdelete = false`
2. Return first active asset account found
3. If no asset accounts exist, return null (will trigger error)

**Error Conditions:**
- Returns null if user has no asset accounts
- Logs warning when fallback account is used

### processSettlements Scheduled Mutation

**Purpose**: Daily job to post settlements for statements with due date = today

**Input:**
```typescript
{
  // No input parameters - processes all qualifying statements
}
```

**Output:**
```typescript
{
  total: number, // total statements processed
  processed: number, // successfully processed
  errors: number, // failed processing
  duration: number, // execution time in milliseconds
}
```

**Business Logic:**
1. Get current UTC date
2. Query all statements with `dueDate = today` and `status = 'pending'`
3. For each statement, call `postSettlement` mutation
4. Track success/failure counts
5. Log execution metrics
6. Return processing summary

**Error Handling:**
- Individual settlement failures don't stop processing
- All errors logged with statement context
- Failed settlements can be manually retried
- Execution continues even if some settlements fail

## Technical Implementation Details

### Critical Implementation Clarifications

**Timezone Handling Strategy:**
- All date operations use UTC timestamps internally
- Closing day matching converts user's local timezone to UTC for comparison
- Card closing day (1-31) represents day of month in user's local timezone
- Conversion logic: `userLocalDate.getUTCDate() === card.closingDay`
- Statement periods calculated using UTC boundaries to ensure consistency

**Timezone Handling Examples:**
- **User in EST (UTC-5) with closing day 15**: Card closes on 15th of each month in EST timezone
- **User in PST (UTC-8) with closing day 31**: Card closes on 31st (or last day of month) in PST timezone
- **Daylight Saving Time Transition**: UTC conversion handles DST automatically - no special logic needed
- **Month Boundary Edge Case**: If user's local timezone crosses month boundary, UTC conversion ensures consistent day matching
- **Leap Year Handling**: February 29th closing day handled automatically by JavaScript Date object

**Multi-Currency Card Support:**
- Cards have a `baseCurrency` field defining statement currency
- Statement calculation uses **single exchange rate from closing date**
- All transactions converted to base currency using closing date rate
- Statement totals calculated in base currency only
- Settlement entries use base currency amounts
- Exchange rate is **auto-filled by the job** but **user-modifiable** to match actual rates paid

**First Statement Period Logic:**
- For cards with no previous statements: period starts from card creation date
- For cards with existing statements: period starts from previous closing date
- First statement period may be shorter than full month (prorated)
- Subsequent statements always cover full monthly periods

**Orphaned Card Account Handling:**
- Cards without `parentAccountId` use user's first available asset account as fallback
- Main asset account selection: first active asset account (accountType='asset', softdelete=false)
- Settlement job logs fallback usage for monitoring and manual review
- Statement calculation continues normally for orphaned cards
- Fallback ensures core settlement functionality remains operational

**Edge Case Handling:**
- **Empty Billing Periods**: Cards with no transactions in period create statements with `totalAmount = 0`
- **Partial Month Statements**: First statement period may be shorter than full month (prorated from card creation date)
- **Missing Exchange Rates**: Fall back to rate of 1.0 for same currency, log warning for missing cross-currency rates
- **Invalid Closing Days**: Cards with closing day > 31 use last day of month (e.g., closing day 32 becomes 31st)
- **Missing Card Metadata**: Cards without `dueDate` field skip settlement with error logging
- **Zero-Sum Validation Failures**: Settlement entries that don't balance are rejected with detailed error logging

**Performance Fallback Behavior:**
- Primary: Use `monthly_rollups` table for fast aggregation
- Fallback: Line-by-line calculation with exchange rate conversion
- Fallback performance limit: < 5s for cards with 1000+ transactions
- Fallback triggers: Missing rollup data or rollup calculation errors
- Batch processing: Process cards in batches of 100 to stay within execution limits

### File Structure

Create new files in: `convex/ledger/cardStatements.ts`

```typescript
// convex/ledger/cardStatements.ts
import { internalMutation, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

// Statement calculation functions
export const calculateStatement = internalMutation({...});
export const processClosingStatements = internalMutation({...});

// Settlement posting functions  
export const postSettlement = internalMutation({...});
export const processSettlements = internalMutation({...});

// Helper functions
export const getCardsWithClosingToday = internalMutation({...});
export const getStatementsDueToday = internalMutation({...});
export const getUserMainAssetAccount = internalMutation({...});
export const getClosingDateExchangeRate = internalMutation({...});
export const convertToBaseCurrency = internalMutation({...});
```

### Cron Job Registration

Update `convex/crons.ts`:

```typescript
import { crons } from "convex/crons";
import { internal } from "./_generated/api";

// Card statement calculation - daily at 01:00 UTC
crons.cron("cardStatementCalculation", "0 1 * * *", 
  internal.ledger.cardStatements.processClosingStatements, {});

// Card settlement posting - daily at 03:00 UTC  
crons.cron("cardSettlementPosting", "0 3 * * *",
  internal.ledger.cardStatements.processSettlements, {});
```

### Schema Integration

Add to `convex/ledger/schema.ts`:

```typescript
export const card_statements = defineTable({
  // ... field definitions from specifications
})
  .index("by_accountId_closingDate", ["accountId", "closingDate"])
  .index("by_user_status", ["userId", "status"])
  .index("by_dueDate_status", ["dueDate", "status"])
  .index("by_idempotencyKey", ["idempotencyKey"]);
```

### Performance Optimization

**Leverage Monthly Rollups with Fallback:**
```typescript
// Try rollup first (fast path)
const rollup = await ctx.db
  .query("monthly_rollups")
  .withIndex("by_account_month", (q) =>
    q.eq("accountId", cardAccountId).eq("month", periodStart)
  )
  .first();

if (rollup) {
  return rollup.totalCredits; // Credits to card = charges
}

// Fall back to line-by-line aggregation with closing date exchange rate conversion (slow path)
const lines = await ctx.db
  .query("journal_lines")
  .withIndex("by_accountId_date", (q) =>
    q.eq("accountId", cardAccountId)
     .gte("entryDate", periodStart)
     .lte("entryDate", periodEnd)
  )
  .collect();

// Get exchange rate for closing date (user-modifiable)
const closingDateRate = await getClosingDateExchangeRate(
  card.baseCurrency,
  closingDate
);

// Convert all transactions to card's base currency using closing date rate
let totalAmount = 0;
for (const line of lines) {
  if (line.direction === "credit") {
    const convertedAmount = await convertToBaseCurrency(
      line.amount, 
      line.currencyCode, 
      card.baseCurrency, 
      closingDateRate  // Use closing date rate, not transaction date rate
    );
    totalAmount += convertedAmount;
  }
}
```

**Batch Processing:**
```typescript
// Process cards in batches to stay within execution limits
const BATCH_SIZE = 100;
const cards = await getCardsWithClosingToday(ctx);
const batches = chunk(cards, BATCH_SIZE);

for (const batch of batches) {
  await processBatch(ctx, batch);
}
```

### Error Handling Integration

**Error Logging:**
```typescript
import { logDualWriteError } from "./errorTracking";

try {
  await calculateStatement(ctx, card);
} catch (error) {
  await logDualWriteError(ctx, {
    operation: "card_statement_calculation",
    errorType: "statement_calculation_failed",
    errorMessage: error.message,
    metadata: { cardId: card._id, accountId: card.accountId },
  });
  throw error; // Re-throw to trigger retry
}
```

**Idempotency Key Generation:**
```typescript
const generateIdempotencyKey = (
  operation: string,
  entityId: string,
  date: number
): string => {
  return `${operation}-${entityId}-${date}`;
};

const statementIdempotencyKey = generateIdempotencyKey(
  "statement",
  cardAccountId,
  closingDate
);
```

## Constraints & Non-Functional Requirements

### Performance
- Statement calculation: < 500ms per card with 100 transactions (rollup path)
- Statement calculation: < 5s per card with 1000+ transactions (fallback path)
- Settlement posting: < 200ms per settlement entry
- Scheduled job execution: < 5 minutes total per job
- Batch processing: Handle up to 100 cards per statement job run
- Batch processing: Handle up to 200 settlements per settlement job run
- Exchange rate conversion: < 50ms per transaction in fallback mode

### Data Integrity
- Zero-sum invariant: All settlement entries must balance
- Idempotency: Operations must be safely retryable
- Referential integrity: All foreign keys must reference valid records
- Currency consistency: All amounts converted to card's base currency within statement
- Timezone consistency: All date operations use UTC with proper timezone conversion
- Exchange rate accuracy: Use rates from transaction date for historical accuracy

### Reliability
- Error rate: < 1% of statements/settlements should fail
- Graceful degradation: Individual failures don't stop batch processing
- Retry capability: Failed operations can be manually retried
- Monitoring: Comprehensive logging and metrics collection

### Security
- Multi-tenancy: All operations scoped by `userId`
- Audit trail: All operations logged with timestamps
- Data validation: Strict input validation on all parameters
- Access control: Only internal functions can process statements/settlements

## Out of Scope

The following are explicitly **NOT** included in this phase:

- **UI Changes**: No user interface modifications (covered in Phase 6)
- **Manual Statement Override**: Admin functions for manual statement calculation (future enhancement)
- **Partial Payments**: Support for partial settlement amounts (future enhancement)
- **Statement Notifications**: Email notifications when statements are calculated (future enhancement)
- **Statement History Export**: CSV export functionality (future enhancement)
- **Multi-Currency Card Support**: Cross-currency statement calculations (future enhancement)
- **Statement Reconciliation**: Automated verification against bank statements (future enhancement)
- **Payment Processing**: Actual payment collection from users (future enhancement)
- **Interest Calculations**: Credit card interest and fees (future enhancement)
- **Statement Templates**: Customizable statement formats (future enhancement)

## Success Metrics

### Schema and Infrastructure
- [ ] `card_statements` table created with all required fields and indexes
- [ ] Schema validation passes all tests
- [ ] No conflicts with existing tables
- [ ] All indexes created successfully

### Core Functionality
- [ ] `calculateStatement` mutation implemented and tested
- [ ] `postSettlement` mutation implemented and tested
- [ ] Statement calculation accuracy verified (within 1 cent tolerance)
- [ ] Settlement entry zero-sum validation working
- [ ] Idempotency keys preventing duplicate operations

### Scheduled Jobs
- [ ] `processClosingStatements` scheduled mutation implemented
- [ ] `processSettlements` scheduled mutation implemented
- [ ] Cron jobs registered in `crons.ts`
- [ ] Job execution metrics collection working
- [ ] Error handling and logging integrated

### Performance and Reliability
- [ ] Statement calculation performance targets met (< 500ms for 100 transactions)
- [ ] Settlement posting performance targets met (< 200ms per settlement)
- [ ] Job execution time targets met (< 5 minutes per job)
- [ ] Error rate below 1% threshold
- [ ] Batch processing working correctly

### Testing and Validation
- [ ] Unit tests for all mutations (>85% coverage)
- [ ] Integration tests for scheduled jobs
- [ ] Idempotency tests passing
- [ ] Zero-sum validation tests passing
- [ ] Performance tests for large transaction volumes
- [ ] Manual validation steps completed

### Documentation and Monitoring
- [ ] Card statement lifecycle documentation created
- [ ] Scheduled job runbook documented
- [ ] Settlement entry format examples documented
- [ ] Error handling procedures documented
- [ ] Performance monitoring dashboard configured

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Statement calculation exceeds execution time limits | High | Implement batch processing with cursor pagination; use monthly rollups for fast aggregation; fallback performance limit < 5s |
| Settlement posting creates duplicate entries | Critical | Enforce idempotency keys rigorously; check existing settlements before posting |
| Missing exchange rates for cross-currency settlements | Medium | Pre-fetch rates for upcoming settlement dates; fall back to user-provided rates; use transaction-date rates for historical accuracy |
| Timezone handling causes incorrect closing day matching | High | Use UTC day boundaries consistently; implement explicit timezone conversion logic; document timezone assumptions |
| Large card transaction volumes cause performance degradation | High | Leverage monthly rollups; implement incremental processing with resume logic; batch processing with performance limits |
| Scheduled job failures leave statements unprocessed | Medium | Implement comprehensive error logging; enable manual retry capability |
| Zero-sum validation failures corrupt financial data | Critical | Validate all settlement entries; reject settlements that don't balance |
| Card account hierarchy changes break settlement logic | Medium | Validate parent account relationships; use main asset account fallback for orphaned cards; comprehensive logging for fallback usage |
| Multi-currency cards cause calculation errors | Medium | Convert all transactions to card's base currency; use proper exchange rate conversion; validate currency consistency |
| First statement period calculation errors | Low | Document first statement logic; use card creation date as period start; handle prorated periods correctly |

## Appendix

### Glossary
- **Statement Period**: Billing cycle from previous closing date to current closing date (or card creation date for first statement)
- **Closing Date**: Day of month when card statement is calculated (1-31) in user's local timezone
- **Due Date**: Day of month when payment is due (stored in card's `dueDate` field) in user's local timezone
- **Settlement Entry**: Journal entry that transfers liability from card to bank account
- **Idempotency Key**: Unique identifier preventing duplicate operations
- **Zero-Sum Invariant**: Accounting rule that debits must equal credits in every journal entry
- **Base Currency**: Card's primary currency for statement calculations and settlements
- **Orphaned Card**: Card account without a valid `parentAccountId` for settlement
- **Main Asset Account**: User's first available asset account used as fallback for orphaned card settlements
- **Settlement Fallback**: Automatic use of main asset account when card's parentAccountId is missing
- **Timezone Conversion**: Process of converting user's local timezone to UTC for consistent date operations
- **Exchange Rate Conversion**: Converting transaction amounts to card's base currency using **closing date exchange rate**
- **Closing Date Exchange Rate**: Single exchange rate used for entire statement period (user-modifiable)

### References
- Convex Scheduled Actions: https://docs.convex.dev/functions/scheduled-functions
- Convex Cron Jobs: https://docs.convex.dev/functions/scheduled-functions#cron-jobs
- ISO 4217 Currency Codes: https://www.iso.org/iso-4217-currency-codes.html
- Double-Entry Accounting: https://en.wikipedia.org/wiki/Double-entry_bookkeeping

### Related PRDs
- Phase 1: Foundation & Schema
- Phase 2: Migration Foundation  
- Phase 3: Dual-Write Implementation
- Phase 4: New Ledger-Only Features
- Phase 6: UI Migration — Read Paths

### Code Examples

**Complete Statement Calculation Flow:**
```typescript
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
      return existing._id;
    }
    
    // 3. Calculate period boundaries
    const periodEnd = args.closingDate;
    let periodStart: number;
    
    // Check if this is the first statement for this card
    const existingStatements = await ctx.db
      .query("card_statements")
      .withIndex("by_accountId_closingDate", (q) => q.eq("accountId", args.cardAccountId))
      .collect();
    
    if (existingStatements.length === 0) {
      // First statement: use card creation date
      periodStart = card.createdAt;
    } else {
      // Subsequent statement: use previous closing date
      const lastStatement = existingStatements
        .sort((a, b) => b.closingDate - a.closingDate)[0];
      periodStart = lastStatement.closingDate;
    }
    
    // 4. Calculate statement total
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
      // Fall back to line-by-line calculation with closing date exchange rate
      const lines = await ctx.db
        .query("journal_lines")
        .withIndex("by_accountId_date", (q) =>
          q.eq("accountId", args.cardAccountId)
           .gte("entryDate", periodStart)
           .lte("entryDate", periodEnd)
        )
        .collect();
      
      // Get exchange rate for closing date (user-modifiable)
      const closingDateRate = await getClosingDateExchangeRate(
        card.baseCurrency,
        args.closingDate
      );
      
      // Convert all transactions to card's base currency using closing date rate
      for (const line of lines) {
        if (line.direction === "credit") {
          const convertedAmount = await convertToBaseCurrency(
            line.amount,
            line.currencyCode,
            card.baseCurrency,
            closingDateRate  // Use closing date rate, not transaction date rate
          );
          totalAmount += convertedAmount;
        }
      }
    }
    
    // 5. Calculate due date
    const dueDate = new Date(periodEnd);
    dueDate.setUTCDate(card.dueDate);
    if (dueDate <= periodEnd) {
      dueDate.setUTCMonth(dueDate.getUTCMonth() + 1);
    }
    
    // 6. Store statement with exchange rate information
    const statementId = await ctx.db.insert("card_statements", {
      accountId: args.cardAccountId,
      userId: card.userId,
      periodStart: periodStart,
      periodEnd: periodEnd,
      closingDate: args.closingDate,
      dueDate: dueDate.getTime(),
      totalAmount,
      currencyCode: card.baseCurrency,
      exchangeRate: closingDateRate,
      exchangeRateId: closingDateRateId, // Reference to official rate
      status: "pending",
      idempotencyKey,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    
    return statementId;
  },
});
```

**Complete Main Asset Account Helper:**
```typescript
export const getUserMainAssetAccount = internalMutation({
  args: {
    userId: v.id("users"),
  },
  returns: v.union(
    v.object({
      accountId: v.id("accounts"),
      accountName: v.string(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    // 1. Try to find first active asset account
    const assetAccount = await ctx.db
      .query("accounts")
      .withIndex("by_user_type", (q) => 
        q.eq("userId", args.userId).eq("accountType", "asset")
      )
      .filter((q) => q.eq(q.field("softdelete"), false))
      .first();
    
    if (assetAccount) {
      // Log fallback usage for monitoring
      await logDualWriteError(ctx, {
        operation: "get_user_main_asset_account",
        errorType: "fallback_asset_account",
        errorMessage: "Using first available asset account as fallback",
        metadata: { 
          userId: args.userId,
          fallbackAccountId: assetAccount._id,
          fallbackAccountName: assetAccount.description
        },
      });
      
      return {
        accountId: assetAccount._id,
        accountName: assetAccount.description,
      };
    }
    
    // 2. No asset accounts found
    return null;
  },
});
```

**Complete Settlement Posting Flow:**
```typescript
export const postSettlement = internalMutation({
  args: {
    statementId: v.id("card_statements"),
  },
  returns: v.id("journal_entries"),
  handler: async (ctx, args) => {
    // 1. Get statement
    const statement = await ctx.db.get(args.statementId);
    if (!statement || statement.status !== "pending") {
      throw new Error("Statement not found or already settled");
    }
    
    // 2. Get card and parent bank account
    const card = await ctx.db
      .query("cards")
      .withIndex("by_accountId", (q) => q.eq("accountId", statement.accountId))
      .unique();
    
    const cardAccount = await ctx.db.get(statement.accountId);
    let bankAccountId: Id<"accounts">;
    let usedFallback = false;
    
    if (cardAccount?.parentAccountId) {
      // Use card's designated parent account
      bankAccountId = cardAccount.parentAccountId;
    } else {
      // Fallback to user's main asset account
      const mainAssetAccount = await getUserMainAssetAccount(ctx, { userId: statement.userId });
      if (!mainAssetAccount) {
        throw new Error("No settlement account available - no parentAccountId and no main asset account");
      }
      bankAccountId = mainAssetAccount.accountId;
      usedFallback = true;
      
      // Log fallback usage for monitoring
      await logDualWriteError(ctx, {
        operation: "card_settlement_posting",
        errorType: "fallback_settlement_account",
        errorMessage: `Using main asset account ${mainAssetAccount.accountName} for orphaned card`,
        metadata: { 
          cardId: card._id, 
          accountId: statement.accountId,
          statementId: statement._id,
          fallbackAccountId: bankAccountId,
          fallbackAccountName: mainAssetAccount.accountName
        },
      });
    }
    
    // 3. Check for existing settlement (idempotency)
    const settlementIdempotencyKey = `settlement-${statement.accountId}-${statement.dueDate}`;
    const existingEntry = await ctx.db
      .query("journal_entries")
      .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", settlementIdempotencyKey))
      .first();
    
    if (existingEntry) {
      await ctx.db.patch(args.statementId, {
        status: "posted",
        settlementEntryId: existingEntry._id,
        updatedAt: Date.now(),
      });
      return existingEntry._id;
    }
    
    // 4. Create settlement journal entry
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
    
    // 5. Create debit line (card liability decreases)
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
    
    // 6. Create credit line (bank asset decreases)
    await ctx.db.insert("journal_lines", {
      journalEntryId: entryId,
      userId: statement.userId,
      accountId: bankAccountId,
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
    
    return entryId;
  },
});
```

---

**End of Phase 5 PRD**
