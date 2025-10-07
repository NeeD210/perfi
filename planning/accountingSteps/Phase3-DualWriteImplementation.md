# Phase 3: Dual-Write Implementation PRD

## Introduction

This PRD covers the implementation of dual-write functionality for PerFi's accounting core migration. This critical phase establishes the bridge between legacy transaction-based tables and the new double-entry ledger system, enabling a gradual migration path that minimizes risk while providing immediate value.

The dual-write implementation ensures that all expense and recurring transaction operations write to both the legacy `expenses` table and the new ledger tables (`journal_entries`, `journal_lines`) simultaneously. This creates a safety net where the existing application continues to function normally while the ledger system is populated with transaction data.

This is Phase 3 in the multi-phase migration using the strangler pattern—new ledger tables coexist with legacy tables, dual-writes enable gradual feature development, and feature flags control the rollout.

## Context & Background

### Current System
- Uses simplified transaction model with `expenses` table storing float64 amounts
- No multi-currency support beyond basic ARS transactions
- Recurring transactions managed through `recurringTransactions` table
- Installments tracked via `paymentSchedules` table
- Manual verification process for expenses

### Target System
- Double-entry ledger with `journal_entries` and `journal_lines` tables
- Integer amounts in minor units (pesos for ARS, cents for USD/EUR)
- Full multi-currency support with FX rate handling
- Recurring transactions converted to `recurring_entries`/`recurring_lines` format
- Installments as planned `journal_entries` with proper linking
- Audit trail with `createdBy`/`updatedBy` fields

### Technology Stack
- Backend: Convex (TypeScript)
- Database: Convex NoSQL with new ledger tables
- Validation: Convex `v` validator library
- Feature Flags: `LEDGER_DUAL_WRITE_ENABLED` controls dual-write behavior
- Mapping Utilities: Conversion functions between legacy and ledger formats

### Key Concepts
- **Dual-Write**: Each mutation writes to both legacy and ledger tables
- **Idempotency**: Prevents duplicate ledger entries via `idempotencyKey` fields
- **Zero-Sum Invariant**: Ledger entries must balance (debits = credits)
- **Audit Trail**: All operations track who created/updated records
- **Feature Flags**: Control rollout and enable gradual migration

## User Stories

**US1:** *As a developer, I need dual-write mutations that maintain data consistency between legacy and ledger tables, so the existing app continues to function while the ledger system is populated.*

**US2:** *As a developer, I need proper audit trails for all ledger operations, so I can track who created or modified financial records for compliance and debugging.*

**US3:** *As a developer, I need idempotent dual-write operations, so retry logic and backfills don't create duplicate ledger entries.*

**US4:** *As a product manager, I need feature flags to control dual-write behavior, so I can gradually rollout ledger functionality and rollback if issues arise.*

**US5:** *As a data engineer, I need proper handling of installments and recurring transactions in the ledger via dual-write, so complex payment scenarios are correctly represented while maintaining compatibility with existing recurring system.*

## Acceptance Criteria

### For US1 (Dual-Write Mutations)
- [ ] `addExpense` writes to both `expenses` and ledger tables (`journal_entries` + `journal_lines`)
- [ ] `updateExpense` updates both legacy and ledger records with proper validation
- [ ] `deleteExpense` soft-deletes records in both systems
- [ ] `verifyExpense` updates verification status in both systems
- [ ] All mutations maintain zero-sum invariant in ledger entries
- [ ] Cross-currency transactions handled correctly (ARS assumed for Phase 3)
- [ ] Example: Adding expense of 1000 ARS creates:
  - Legacy: `expenses` record with amount: 1000
  - Ledger: `journal_entries` + two `journal_lines` (Dr expense account, Cr payment account)

### For US2 (Audit Trail & Provenance)
- [ ] All ledger mutations capture `createdBy` and `updatedBy` fields
- [ ] `createdBy` set to authenticated user ID on creation
- [ ] `updatedBy` set to authenticated user ID on updates
- [ ] `updateTime` field maintained on all ledger record updates
- [ ] Audit fields populated for both direct mutations and dual-write operations

### For US3 (Idempotency Protection)
- [ ] All dual-write operations use unique `idempotencyKey` values
- [ ] Duplicate operations detected and prevented via key lookup
- [ ] Keys based on operation type and source record IDs
- [ ] Example: `expense_dual_write_${expenseId}` prevents duplicate ledger entries
- [ ] Recurring transaction generation uses `recurring_dual_write_${recurringId}_${targetDate}`

### For US4 (Feature Flag Control)
- [ ] `LEDGER_DUAL_WRITE_ENABLED` feature flag implemented
- [ ] When disabled, mutations only write to legacy tables
- [ ] When enabled, mutations write to both legacy and ledger tables
- [ ] Flag check occurs at start of each dual-write mutation
- [ ] Flag allows for gradual rollout and emergency rollback

### For US5 (Installments & Recurring)
- [ ] `addExpense` with installments creates planned ledger entries
- [ ] Each installment gets separate planned `journal_entries` with `linkType = 'installment'`
- [ ] Parent/child relationships maintained via `parentEntryId`
- [ ] `generateTransactionFromRecurring` creates both legacy and ledger records
- [ ] Recurring frequency logic preserved in dual-write operations

## Detailed Specifications

### Feature Flag Implementation

```typescript
// In convex/_generated/server.ts or separate config
export const LEDGER_DUAL_WRITE_ENABLED = process.env.LEDGER_DUAL_WRITE_ENABLED === 'true';
```

**Validation:**
- Boolean flag controlling dual-write behavior
- Defaults to `false` for safety
- Can be toggled without code deployment

### Dual-Write Expense Mutations

#### addExpense Dual-Write
```typescript
// Additional logic in existing addExpense mutation
if (LEDGER_DUAL_WRITE_ENABLED) {
  // 1. Get account mappings
  const categoryMapping = await getCategoryAccountMapping(ctx, args.categoryId);
  const paymentMapping = await getPaymentTypeAccountMapping(ctx, args.paymentTypeId);

  // 2. Create journal entry
  const entryId = await ctx.db.insert("journal_entries", {
    userId,
    date: args.date,
    updateTime: Date.now(),
    description: createJournalEntryDescription(args),
    status: "posted",
    sourceType: args.transactionType, // "expense" or "income"
    sourceId: expenseId, // The legacy expense ID
    idempotencyKey: `expense_dual_write_${expenseId}`,
    createdBy: userId,
    softdelete: false,
  });

  // 3. Create journal lines (double-entry)
  const amountARS = convertAmountARS(args.amount);
  const lines = [];

  if (args.transactionType === "expense") {
    // Dr expense account, Cr payment account
    lines.push({
      journalEntryId: entryId,
      userId,
      accountId: categoryMapping.accountId,
      direction: "debit",
      currencyCode: "ARS",
      amount: amountARS,
      amountBaseCurrency: amountARS,
      entryDate: args.date,
    });
    lines.push({
      journalEntryId: entryId,
      userId,
      accountId: paymentMapping.accountId,
      direction: "credit",
      currencyCode: "ARS",
      amount: amountARS,
      amountBaseCurrency: amountARS,
      entryDate: args.date,
    });
  } else {
    // Income: Dr payment account, Cr income account
    lines.push({
      journalEntryId: entryId,
      userId,
      accountId: paymentMapping.accountId,
      direction: "debit",
      currencyCode: "ARS",
      amount: amountARS,
      amountBaseCurrency: amountARS,
      entryDate: args.date,
    });
    lines.push({
      journalEntryId: entryId,
      userId,
      accountId: categoryMapping.accountId,
      direction: "credit",
      currencyCode: "ARS",
      amount: amountARS,
      amountBaseCurrency: amountARS,
      entryDate: args.date,
    });
  }

  // 4. Insert lines
  for (const line of lines) {
    await ctx.db.insert("journal_lines", line);
  }

  // 5. Handle installments
  if (args.cuotas > 1 && args.paymentTypeId) {
    await createInstallmentEntries(ctx, {
      parentEntryId: entryId,
      totalAmount: amountARS,
      totalInstallments: args.cuotas,
      paymentTypeId: args.paymentTypeId,
      userId,
      startDate: args.date,
    });
  }
}
```

#### updateExpense Dual-Write
```typescript
// Additional logic in existing updateExpense mutation
if (LEDGER_DUAL_WRITE_ENABLED) {
  // Find existing ledger entry
  const existingEntry = await ctx.db
    .query("journal_entries")
    .withIndex("by_sourceType_sourceId", (q) =>
      q.eq("sourceType", expense.transactionType).eq("sourceId", args.id)
    )
    .first();

  if (existingEntry) {
    // Update entry
    await ctx.db.patch(existingEntry._id, {
      updateTime: Date.now(),
      updatedBy: userId,
      // Update other fields as needed
    });

    // Update journal lines if amount changed
    if (args.amount !== undefined) {
      const newAmount = convertAmountARS(args.amount);
      // Update lines with new amounts
      // (implementation details for line updates)
    }
  }
}
```

#### deleteExpense Dual-Write
```typescript
// Additional logic in existing deleteExpense mutation
if (LEDGER_DUAL_WRITE_ENABLED) {
  // Soft delete ledger entries
  const ledgerEntries = await ctx.db
    .query("journal_entries")
    .withIndex("by_sourceType_sourceId", (q) =>
      q.eq("sourceType", expense.transactionType).eq("sourceId", args.id)
    )
    .collect();

  for (const entry of ledgerEntries) {
    await ctx.db.patch(entry._id, {
      softdelete: true,
      deletedAt: Date.now(),
      updatedBy: userId,
      updateTime: Date.now(),
    });
  }
}
```

### Dual-Write Recurring Transactions

#### generateTransactionFromRecurring Dual-Write
```typescript
// Additional logic in existing generateTransactionFromRecurring mutation
// NOTE: During Phase 3, this function continues to read from legacy recurringTransactions table
// and will be updated to use recurring_entries/recurring_lines in a later phase
if (LEDGER_DUAL_WRITE_ENABLED) {
  const idempotencyKey = `recurring_dual_write_${args.recurringTransactionId}_${args.targetDate}`;

  // Check for existing ledger entry
  const existingEntry = await ctx.db
    .query("journal_entries")
    .filter((q) => q.eq(q.field("idempotencyKey"), idempotencyKey))
    .first();

  if (!existingEntry) {
    // Create ledger entry and lines similar to addExpense
    const entryId = await ctx.db.insert("journal_entries", {
      userId: recurringTransaction.userId,
      date: args.targetDate,
      updateTime: Date.now(),
      description: recurringTransaction.description,
      status: "posted",
      sourceType: "recurring",
      sourceId: args.recurringTransactionId, // Legacy recurringTransactions ID
      idempotencyKey,
      createdBy: userId,
      softdelete: false,
    });

    // Create journal lines based on transaction type
    // (implementation details similar to addExpense)
  }
}
```

### Installment Handling

#### createInstallmentEntries Function
```typescript
async function createInstallmentEntries(ctx: any, params: {
  parentEntryId: Id<"journal_entries">,
  totalAmount: number,
  totalInstallments: number,
  paymentTypeId: Id<"paymentTypes">,
  userId: Id<"users">,
  startDate: number,
}): Promise<void> {
  const { parentEntryId, totalAmount, totalInstallments, paymentTypeId, userId, startDate } = params;

  // Get payment type for scheduling
  const paymentType = await ctx.db.get(paymentTypeId);
  if (!paymentType) throw new Error("Payment type not found");

  const installmentAmount = Math.floor(totalAmount / totalInstallments);

  for (let i = 1; i <= totalInstallments; i++) {
    const installmentDate = calculateInstallmentDate(startDate, paymentType, i);

    const installmentEntryId = await ctx.db.insert("journal_entries", {
      userId,
      parentEntryId,
      date: installmentDate,
      updateTime: Date.now(),
      description: `Installment ${i}/${totalInstallments}`,
      status: "planned",
      sourceType: "installment",
      linkType: "installment",
      installmentNumber: i,
      totalInstallments,
      idempotencyKey: `installment_${parentEntryId}_${i}`,
      createdBy: userId,
      softdelete: false,
    });

    // Create journal lines for this installment
    // (Dr/Cr logic similar to main transaction)
  }
}
```

### Mapping Utilities

#### getCategoryAccountMapping
```typescript
async function getCategoryAccountMapping(ctx: any, categoryId: Id<"categories">): Promise<{ accountId: Id<"accounts"> }> {
  // Look up account mapping for category
  const mapping = await ctx.db
    .query("category_mappings")
    .withIndex("by_category", (q) => q.eq("categoryId", categoryId))
    .first();

  if (!mapping) {
    throw new Error(`No account mapping found for category ${categoryId}`);
  }

  return { accountId: mapping.accountId };
}
```

#### getPaymentTypeAccountMapping
```typescript
async function getPaymentTypeAccountMapping(ctx: any, paymentTypeId: Id<"paymentTypes">): Promise<{ accountId: Id<"accounts"> }> {
  // Look up account mapping for payment type
  const mapping = await ctx.db
    .query("payment_type_mappings")
    .withIndex("by_paymentType", (q) => q.eq("paymentTypeId", paymentTypeId))
    .first();

  if (!mapping) {
    throw new Error(`No account mapping found for payment type ${paymentTypeId}`);
  }

  return { accountId: mapping.accountId };
}
```

## Technical Implementation Details

### File Structure
- Update `convex/expenses.ts` with dual-write logic
- Update `convex/recurring.ts` with dual-write logic
- Create `convex/ledger/dualWriteUtils.ts` for shared dual-write functions
- Feature flag in environment configuration

### Code Organization
- Dual-write logic separated from core business logic
- Shared utilities for mapping lookups and entry creation
- Clear separation between legacy and ledger operations
- Comprehensive error handling with rollback capabilities

### Integration Points
- Account mappings must exist before dual-write can function
- Feature flag controls enable/disable at runtime
- Audit fields populated from authenticated user context
- Zero-sum validation on all ledger entries

## Constraints & Non-Functional Requirements

### Performance
- Dual-write operations should not increase response time by more than 50ms
- Idempotency checks must be fast (index lookups)
- Mapping queries must resolve in < 10ms
- Batch processing for bulk operations where needed

### Data Integrity
- Zero-sum invariant enforced on all ledger entries
- Foreign key constraints maintained between tables
- Soft delete consistency between legacy and ledger
- Idempotency prevents duplicate entries

### Compatibility
- Feature flag allows gradual rollout per user/environment
- Legacy operations continue to function when dual-write disabled
- Backward compatibility maintained for existing API consumers
- Migration path defined for eventual legacy table removal

### Security
- All operations require authenticated user context
- Audit trail captures all create/update operations
- User isolation maintained between tenant data
- No elevation of privileges through dual-write operations

## Out of Scope

The following are explicitly **NOT** included in this phase:
- UI changes to read from ledger tables (covered in Phase 6)
- Removal of legacy table writes (covered in Phase 7)
- Migration of `generateTransactionFromRecurring` to use `recurring_entries`/`recurring_lines` tables (covered in Phase 7)
- Multi-currency support beyond ARS (covered in Phase 1.2)
- Advanced FX rate handling (covered in Phase 1.2)
- Card statement and settlement logic (covered in Phase 5)
- Budget system integration (covered in Phase 4)
- Debt management features (covered in Phase 7)

## Success Metrics

- [ ] All expense mutations (`addExpense`, `updateExpense`, `deleteExpense`, `verifyExpense`) implement dual-write
- [ ] `generateTransactionFromRecurring` implements dual-write
- [ ] Zero-sum invariant validation passes for all created ledger entries
- [ ] Idempotency prevents duplicate entries under retry conditions
- [ ] Feature flag controls dual-write behavior correctly
- [ ] Audit trail fields populated for all ledger operations
- [ ] Installment entries created with proper linking (`parentEntryId`, `linkType`)
- [ ] Performance benchmarks met (dual-write < 50ms overhead)
- [ ] Account mappings resolve correctly for all operations
- [ ] No data inconsistencies between legacy and ledger tables
- [ ] Feature flag allows safe rollback if issues discovered

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Data inconsistency between legacy and ledger | High | Implement comprehensive validation; use transactions where possible; detailed testing |
| Performance degradation from dual writes | Medium | Performance monitoring; optimize queries; feature flag for quick disable |
| Missing account mappings cause failures | High | Validate mappings exist before enabling dual-write; provide clear error messages |
| Idempotency key collisions | Medium | Use descriptive key formats; include timestamps if needed; comprehensive testing |
| Audit trail incomplete | Medium | Centralized audit field population; validation in all mutations |
| Installment logic complexity | Medium | Thorough testing of installment scenarios; clear documentation of linking logic |

## Appendix

### Glossary
- **Dual-Write**: Pattern where mutations write to both legacy and new tables simultaneously
- **Idempotency Key**: Unique identifier preventing duplicate operations
- **Zero-Sum Invariant**: Accounting rule that debits must equal credits
- **Feature Flag**: Runtime configuration controlling feature availability
- **Strangler Pattern**: Migration approach where new system gradually replaces old

### References
- Convex Docs: https://docs.convex.dev/database/writing-data
- Phase 1 PRD: `Phase1-Foundation.md`
- Phase 2 PRD: `Phase2-MigrationFoundation.md`
- Migration Utils: `convex/migrations/utils.ts`

### Related PRDs
- Phase 1.1: Schema Definition & Validators
- Phase 2.1: Account Seeding from Current Data
- Phase 2.4: Recurring Templates Migration (completed - migrated to `recurring_entries`/`recurring_lines`)
- Phase 4.1: Transfer Implementation
- Phase 6.1: Transactions Screen (Ledger Mode)
- Phase 7.x: Migration of `generateTransactionFromRecurring` to use new recurring tables

---

## Testing Strategy

### Unit Tests
- Test dual-write logic in isolation
- Validate zero-sum invariant enforcement
- Test idempotency key generation and collision prevention
- Test mapping resolution functions

### Integration Tests
- End-to-end dual-write scenarios
- Feature flag behavior validation
- Performance benchmarking
- Error handling and rollback scenarios

### Data Validation Tests
- Compare legacy vs ledger data consistency
- Validate audit trail completeness
- Test installment linking integrity
- Cross-reference expense IDs between systems
