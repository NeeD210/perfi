# Phase 2: Migration Foundation — Account Seeding & Historical Backfill

## Introduction

This PRD covers the foundational migration layer for PerFi's accounting core transformation. This phase establishes the bridge between the current transaction-based system and the new double-entry ledger architecture using a strangler pattern. The goal is to create a complete chart of accounts from existing data and migrate all historical financial transactions into the new ledger format while maintaining data integrity and system stability.

This is the second step in a multi-phase migration using the strangler pattern—building the new ledger infrastructure in parallel with the existing system, then gradually transitioning reads and writes. This phase focuses exclusively on one-time data migration tasks that will enable subsequent phases to operate on a complete, consistent dataset.

## Context & Background

### Current System
The application currently uses a simplified transaction model centered around the `expenses` table with float64 amounts prone to rounding errors. Financial data is organized around:
- `paymentTypes` table for cash/bank accounts and credit cards
- `categories` table for expense and income classification
- `expenses` table with basic transaction data and float64 amounts
- `paymentSchedules` table for installment tracking
- No multi-currency support or double-entry accounting

### Target System
The new system implements a double-entry ledger with:
- `accounts` table representing the complete chart of accounts
- `journal_entries` and `journal_lines` for double-entry transactions
- Integer amounts in minor units (no floating point precision issues)
- Full multi-currency support with proper FX handling
- Zero-sum invariant enforcement across all transactions

### Technology Stack
- Backend: Convex (TypeScript)
- Database: Convex NoSQL with new ledger schema
- Validation: Convex `v` validator library with strict type enforcement
- Migration: Idempotent batch processing with progress tracking

### Business Value
This migration phase eliminates the risk of data loss during the transition and ensures all historical financial data remains accessible and consistent. By creating a complete account structure and migrating all transactions, we establish a solid foundation for advanced features like multi-currency reporting, transfers, budgets, and investment tracking.

## User Stories

**US1:** *As a developer, I need a complete chart of accounts seeded from existing payment types and categories, so I can build ledger-based features with confidence that all account references are valid.*

**US2:** *As a developer, I need all historical transactions migrated to the double-entry ledger format, so queries and reports work correctly across the entire transaction history.*

**US3:** *As a data engineer, I need installment schedules properly linked in the ledger, so upcoming payments and projections show complete financial obligations.*

**US4:** *As a system administrator, I need idempotent migration processes with progress tracking, so I can safely retry failed migrations and monitor completion status.*

## Acceptance Criteria

### For US1 (Account Seeding):
- [ ] All existing `paymentTypes` successfully mapped to `accounts`:
  - Cash/bank accounts created as `asset` type
  - Credit cards created as `liability` type with `cards` entries
- [ ] All existing `categories` successfully mapped to `accounts`:
  - Expense categories created as `expense` type accounts
  - Income categories created as `income` type accounts
- [ ] Mappings persisted: `paymentTypeId → accountId`, `categoryId → accountId`
- [ ] No duplicate accounts created on re-run
- [ ] All accounts have proper `userId`, `accountType`, and audit fields

### For US2 (Historical Transaction Backfill):
- [ ] All `expenses` records successfully migrated to `journal_entries` + `journal_lines`
- [ ] Expense transactions: Dr expenseAccount, Cr paymentAccount
- [ ] Income transactions: Dr paymentAccount, Cr incomeAccount
- [ ] All amounts converted from float64 to integer minor units (ARS scale 0)
- [ ] Zero-sum invariant holds for all migrated entries
- [ ] Source traceability maintained via `sourceType` and `sourceId`
- [ ] Idempotency via `idempotencyKey` prevents duplicate entries
- [ ] Progress tracking shows batch completion status

### For US3 (Installment Backfill):
- [ ] All `paymentSchedules` migrated to `journal_entries` with `status = 'planned'`
- [ ] Proper installment linking via `parentEntryId` and `linkType = 'installment'`
- [ ] `installmentNumber` and `totalInstallments` correctly set
- [ ] Composite key prevents duplicate installment entries
- [ ] All installments linked to their parent expense transaction

### For US4 (Migration Safety):
- [ ] All mutations support batch processing (100-500 records per batch)
- [ ] Resume capability on failure with progress persistence
- [ ] Runtime measurement and logging for performance monitoring
- [ ] Rollback capability for failed migrations
- [ ] Feature flag control for migration execution

## Detailed Specifications

### Account Seeding Mutation (`seedAccountsFromLegacyData`)

**Purpose**: Create the complete chart of accounts from existing `paymentTypes` and `categories`

**Input:**
```typescript
{
  userId: Id<"users">,
  batchSize?: number, // default 100
}
```

**Output:**
```typescript
{
  accountsCreated: number,
  mappingsCreated: number,
  success: boolean,
  error?: string
}
```

**Business Logic:**
1. Query all active `paymentTypes` for the user
2. For each paymentType:
   - Create `accounts` entry with appropriate `accountType`
   - If credit card, create `cards` entry with closing/due dates
   - Store mapping: `paymentTypeId → accountId`
3. Query all active `categories` for the user
4. For each category:
   - Create `accounts` entry with `expense` or `income` type based on `transactionType`
   - Store mapping: `categoryId → accountId`
5. Return success metrics

**Validation:**
- Skip if account already exists for paymentType/category
- Validate required fields exist in legacy data
- Ensure no conflicts with existing accounts

### Historical Transaction Backfill Mutation (`backfillHistoricalTransactions`)

**Purpose**: Migrate all existing expenses to double-entry ledger format

**Input:**
```typescript
{
  userId: Id<"users">,
  batchSize?: number, // default 100
  startAfter?: Id<"expenses">, // for resume capability
}
```

**Output:**
```typescript
{
  expensesProcessed: number,
  journalEntriesCreated: number,
  success: boolean,
  nextStartAfter?: Id<"expenses">,
  error?: string
}
```

**Business Logic:**
1. Query batch of `expenses` records for user (ordered by `_creationTime`)
2. For each expense:
   - Generate unique `idempotencyKey` from expense data
   - Check if migration already completed (skip if exists)
   - Get account mappings from seeding step
   - Create `journal_entries` with `status = 'posted'`, `sourceType = 'expense'`, `sourceId = expenseId`
   - Create two `journal_lines`:
     - For expense: Dr expenseAccount, Cr paymentAccount, amount in integer minor units
     - For income: Dr paymentAccount, Cr incomeAccount, amount in integer minor units
   - Store `expenseId → journalEntryId` mapping
3. Validate zero-sum invariant before committing
4. Return progress metrics

**Validations:**
- Amount conversion: `Math.round(floatAmount)` for ARS (scale 0)
- Account mappings must exist (fail if seeding not completed)
- Zero-sum validation: sum of `amountBaseCurrency` across lines = 0

### Installment Backfill Mutation (`backfillInstallmentSchedules`)

**Purpose**: Migrate payment schedules to planned ledger entries

**Input:**
```typescript
{
  userId: Id<"users">,
  batchSize?: number, // default 100
  startAfter?: Id<"paymentSchedules">, // for resume capability
}
```

**Output:**
```typescript
{
  schedulesProcessed: number,
  journalEntriesCreated: number,
  success: boolean,
  nextStartAfter?: Id<"paymentSchedules">,
  error?: string
}
```

**Business Logic:**
1. Query batch of `paymentSchedules` for user (ordered by `dueDate`)
2. For each schedule:
   - Generate composite key for idempotency: `${expenseId}_${installmentNumber}`
   - Check if migration already completed (skip if exists)
   - Find parent journal entry from expense mapping
   - Create `journal_entries` with:
     - `status = 'planned'`
     - `linkType = 'installment'`
     - `parentEntryId` linking to parent transaction
     - `installmentNumber` and `totalInstallments`
   - Create two `journal_lines` (same Dr/Cr pattern as parent)
3. Return progress metrics

**Validations:**
- Parent expense must be migrated first
- Installment numbers must be sequential and valid
- Due dates must be in the future for planned entries

### Migration Progress Tracking

**Tables:**
```typescript
// migration_progress table for tracking
{
  id: v.id("migration_progress"),
  userId: v.id("users"),
  migrationType: v.union(
    v.literal("account_seeding"),
    v.literal("transaction_backfill"),
    v.literal("installment_backfill")
  ),
  status: v.union(
    v.literal("pending"),
    v.literal("in_progress"),
    v.literal("completed"),
    v.literal("failed")
  ),
  lastProcessedId?: v.string, // ID to resume from
  recordsProcessed: v.number,
  totalRecords: v.number,
  startedAt: v.number,
  completedAt?: v.number,
  errorMessage?: v.string
}
```

## Technical Implementation Details

### File Structure
```
convex/
  migrations/
    accountSeeding.ts      # Account creation from legacy data
    transactionBackfill.ts # Historical expense migration
    installmentBackfill.ts # Payment schedule migration
    progress.ts           # Migration tracking utilities
    types.ts              # Migration-specific types
```

### Migration Strategy
1. **Idempotency**: All migrations use unique keys to prevent duplicates
2. **Batch Processing**: 100-500 records per batch to avoid timeouts
3. **Resume Capability**: Track `lastProcessedId` for continuation
4. **Validation Gates**: Ensure prerequisites completed before dependent migrations
5. **Audit Trail**: Full logging of migration operations

### Account Mapping Tables
```typescript
// Legacy data mappings (stored in separate tables or metadata)
{
  paymentTypeId: v.id("paymentTypes"),
  accountId: v.id("accounts"),
  userId: v.id("users"),
  createdAt: v.number()
}

{
  categoryId: v.id("categories"),
  accountId: v.id("accounts"),
  userId: v.id("users"),
  createdAt: v.number()
}

{
  expenseId: v.id("expenses"),
  journalEntryId: v.id("journal_entries"),
  userId: v.id("users"),
  createdAt: v.number()
}
```

### Amount Conversion Logic
```typescript
// ARS conversion (scale = 0, no decimals)
const convertAmountARS = (floatAmount: number): number => {
  return Math.round(floatAmount); // Round to nearest peso
};

// Future USD/EUR conversion (scale = 2, cents)
const convertAmountCents = (floatAmount: number): number => {
  return Math.round(floatAmount * 100); // Convert to cents
};
```

## Constraints & Non-Functional Requirements

### Performance
- Batch processing: 100-500 records per operation (< 30 seconds per batch)
- Total migration time: < 10 minutes for typical user datasets (< 10k transactions)
- Memory usage: < 100MB per batch operation
- Database connection limits respected during bulk operations

### Data Integrity
- Zero-sum invariant enforced for all migrated transactions
- Referential integrity maintained between all linked records
- Idempotency prevents duplicate data creation
- Rollback capability for failed migrations

### Security
- All migrations run with user context (`userId` filtering)
- No cross-user data contamination
- Audit trail captures all migration operations
- Feature flags control migration execution in production

### Compatibility
- Existing application continues to function during migration
- No breaking changes to current API endpoints
- Legacy data remains accessible during transition period

## Out of Scope

The following are explicitly **NOT** included in this phase:

- Writing mutations or queries for new ledger features (covered in Phase 3)
- Data migration/backfill for recurring transactions (Phase 3)
- UI changes or new screens (Phase 6)
- FX rate fetching service (Phase 1)
- Budget system implementation (Phase 4)
- Card statement calculation (Phase 5)
- Investment/debt account creation (Phase 7)

## Success Metrics

- [ ] All user accounts successfully seeded with complete chart of accounts
- [ ] 100% of historical transactions migrated to ledger format
- [ ] Zero-sum invariant verified for all migrated entries
- [ ] All installment schedules properly linked as planned entries
- [ ] Migration processes complete within performance targets
- [ ] No data loss or corruption during migration
- [ ] Resume capability tested and functional
- [ ] Migration progress tracking provides accurate status
- [ ] All acceptance criteria validated through automated tests

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Migration timeout on large datasets | High | Batch processing with resume capability; configurable batch sizes |
| Data corruption during amount conversion | High | Extensive validation of conversion logic; zero-sum checks; rollback capability |
| Missing account mappings cause failures | Medium | Validation gates prevent dependent migrations from running prematurely |
| Duplicate entries from migration retries | Medium | Strong idempotency keys; duplicate detection logic |
| Performance impact on production system | Medium | Feature flags for controlled rollout; off-peak scheduling |
| Memory exhaustion during large batches | Low | Configurable batch sizes; memory monitoring |

## Appendix

### Glossary
- **Double-Entry Ledger**: Accounting system where every transaction affects at least two accounts
- **Zero-Sum Invariant**: Sum of debits equals sum of credits across all journal lines in an entry
- **Idempotency Key**: Unique identifier ensuring operations can be safely retried without duplication
- **Strangler Pattern**: Migration approach where new system grows around old system until it can be fully replaced

### References
- Convex Migration Patterns: https://docs.convex.dev/database/migrations
- Double-Entry Accounting: https://en.wikipedia.org/wiki/Double-entry_bookkeeping
- PerFi Schema Documentation: `convex/schema.ts`

### Related PRDs
- Phase 1.1: Schema Definition & Validators
- Phase 3.1: Dual-Write Mutations (Expenses/Income)
- Phase 6.1: Transactions Screen (Ledger Mode)

### Migration Testing Checklist
- [ ] Unit tests for amount conversion logic
- [ ] Integration tests for account seeding
- [ ] Property tests for zero-sum invariant
- [ ] Load tests for batch processing performance
- [ ] Idempotency tests for duplicate prevention
- [ ] Rollback tests for error recovery

### Example Migration Flow
```typescript
// 1. Seed accounts
await seedAccountsFromLegacyData({ userId });

// 2. Backfill transactions (batches)
let nextBatch = undefined;
do {
  const result = await backfillHistoricalTransactions({
    userId,
    batchSize: 100,
    startAfter: nextBatch
  });
  nextBatch = result.nextStartAfter;
} while (nextBatch);

// 3. Backfill installments
await backfillInstallmentSchedules({ userId });
```
