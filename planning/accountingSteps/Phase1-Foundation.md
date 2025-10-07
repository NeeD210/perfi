# Phase 1: Foundation & Schema PRD

## Introduction

This PRD covers the complete foundational layer for PerFi's accounting core migration. We will establish a double-entry ledger system with multi-currency support, replacing the current transaction-based model. This foundation enables advanced features like transfers, debt tracking, investment portfolios, and proper financial reporting.

**Deliverable**: A production-ready schema, FX infrastructure, and account management system that coexists with legacy tables.

**Duration**: 2 weeks (Steps 1.1, 1.2, 1.3 combined)

## Context & Background

### Current System
- Simplified transaction model: `expenses`, `categories`, `paymentTypes`, `recurringTransactions`, `paymentSchedules`
- Float64 amounts (rounding errors)
- Single currency (ARS assumed)
- Two transaction types: expense/income only
- No formal accounting principles

### Target System
- Double-entry ledger with debits/credits and zero-sum invariant
- Multi-currency with proper FX conversion
- Integer amounts (no floats): ARS scale 0, USD/EUR scale 2
- Support: expenses, income, transfers, investments, debts, cards
- Hierarchical chart of accounts
- Full audit trail and provenance

### Technology Stack
- **Backend**: Convex (TypeScript)
- **Database**: Convex NoSQL with relational patterns
- **Validation**: Convex `v` validators
- **FX Provider**: TBD (mock in this phase)

## User Stories

**US1:** *As a developer, I need a complete ledger schema with validators, so I can build transactions with confidence in data integrity.*

**US2:** *As a developer, I need FX infrastructure for multi-currency transactions, so users can record expenses in USD, EUR, etc.*

**US3:** *As a developer, I need account creation utilities with hierarchy support, so I can build the chart of accounts from legacy data.*

**US4:** *As a system, I need the foundation to coexist with legacy tables, so migration can proceed without breaking existing functionality.*

## Acceptance Criteria

### AC1: Schema & Validators (Step 1.1)

**New Tables Created:**
- ✅ `accounts` - Chart of accounts
- ✅ `journal_entries` - Transaction headers
- ✅ `journal_lines` - Debit/credit lines
- ✅ `exchange_rates` - FX rates
- ✅ `cards` - Credit card metadata
- ✅ `debts` - Debt metadata
- ✅ `budgets` - Budget definitions
- ✅ `budget_lines` - Budget history
- ✅ `recurring_entries` - Recurring definitions
- ✅ `recurring_lines` - Recurring line items

**Each table has:**
- All fields with explicit types
- Required indexes for query performance
- `userId` for multi-tenancy
- Soft delete: `softdelete: boolean`, `deletedAt?: number`

**All enums defined:**
- `accountType`: `asset | liability | equity | income | expense`
- `direction`: `debit | credit`
- `entryStatus`: `planned | posted | voided`
- `linkType`: `accrual | installment | settlement`
- `frequency`: `daily | weekly | monthly | quarterly | semestrally | yearly`
- `scopeType`: `singleAccount | multipleAccounts | accountType`
- `sourceType`: `expense | income | transfer | installment | recurring | statement | other`

### AC2: FX Infrastructure (Step 1.2)

**FX Rate Management:**
- ✅ `exchange_rates` table with unique constraint on `(pairCurrency, date, source)`
- ✅ Utility to fetch/store rates with `rate` and `inverseRate`
- ✅ Rounding policy: round half away from zero to minor unit
- ✅ FX residual handling: auto-balance to `fx_rounding` account

**Conversion Utilities:**
- ✅ `convertAmount(amount, fromCurrency, toCurrency, date)` → converted amount
- ✅ `getRateForDate(pair, date)` → rate or null
- ✅ `calculateResidual(lines)` → residual amount
- ✅ `createBalancingLine(residual)` → line for fx_rounding account

**Rounding Rules:**
- ARS: scale 0 (whole pesos, no decimals)
- USD/EUR: scale 2 (cents)
- Residual tolerance: ≤ 1 minor unit

### AC3: Account Creation Utilities (Step 1.3)

**Account CRUD:**
- ✅ `createAccount(userId, accountType, description, parentAccountId?)` 
- ✅ `createCardAccount(userId, description, closingDay, dueDate, parentAccountId)`
- ✅ `createDebtAccount(userId, description, interestRate?, parentAccountId)`
- ✅ `updateAccount(accountId, updates)` with validation
- ✅ `softDeleteAccount(accountId)` with eligibility check
- ✅ `reopenAccount(accountId)` to restore soft-deleted account

**Hierarchy Validation:**
- ✅ Prevent circular references (cycle detection)
- ✅ Allow arbitrary depth
- ✅ Postings allowed on any node (leaf or non-leaf)

**Closure Workflow:**
- ✅ Check account has zero balance
- ✅ Check no pending obligations (planned entries)
- ✅ Guide user to transfer/settle before deletion
- ✅ Historic references remain intact

### AC4: Coexistence & Safety

- ✅ No modifications to existing tables
- ✅ No breaking changes to current mutations/queries
- ✅ All new code in separate namespace (`convex/ledger/`)
- ✅ Schema compiles without errors
- ✅ All tables visible in Convex dashboard

## Core Schema Specifications

### 1. accounts
```typescript
{
  id: v.id("accounts"),
  userId: v.id("users"),
  description: v.string(),
  accountType: v.union(...), // asset|liability|equity|income|expense
  parentAccountId: v.optional(v.id("accounts")),
  defaultCurrency: v.optional(v.string()), // ISO 4217, defaults to "ARS"
  creationTime: v.number(),
  softdelete: v.boolean(),
  deletedAt: v.optional(v.number()),
}
```
**Indexes**: `by_user`, `by_user_type`, `by_parentAccountId`

### 2. journal_entries
```typescript
{
  id: v.id("journal_entries"),
  userId: v.id("users"),
  parentEntryId: v.optional(v.id("journal_entries")),
  date: v.number(), // effective date (epoch ms)
  updateTime: v.number(),
  softdelete: v.boolean(),
  deletedAt: v.optional(v.number()),
  description: v.string(),
  status: v.union(...), // planned|posted|voided
  sourceType: v.union(...),
  sourceId: v.optional(v.string()),
  idempotencyKey: v.optional(v.string()),
  linkType: v.optional(v.union(...)), // accrual|installment|settlement
  installmentNumber: v.optional(v.number()),
  totalInstallments: v.optional(v.number()),
  createdBy: v.string(),
  updatedBy: v.optional(v.string()),
}
```
**Indexes**: `by_user_date`, `by_user_status_date`, `by_sourceType_sourceId`

**Business Rules**:
- Entries editable in all statuses (not immutable when posted)
- `idempotencyKey` format: `{sourceType}:{sourceId}` or custom for migrations
- `linkType` required when `parentEntryId` present
- `installmentNumber`/`totalInstallments` required when `linkType = "installment"`
- **FX Rate Rules**:
  - `exchangeRate` takes precedence over `exchangeRateId` for calculations
  - At least one rate source required when `currencyCode` ≠ account's `defaultCurrency`
  - `exchangeRate` must be positive when provided
  - `exchangeRateId` must reference valid `exchange_rates` record when provided

### 3. journal_lines
```typescript
{
  id: v.id("journal_lines"),
  journalEntryId: v.id("journal_entries"),
  userId: v.id("users"),
  accountId: v.id("accounts"),
  direction: v.union(...), // debit|credit
  currencyCode: v.string(), // ISO 4217
  exchangeRateId: v.optional(v.id("exchange_rates")), // Official market rate reference
  exchangeRate: v.optional(v.number()), // Actual rate user received (takes precedence)
  amount: v.number(), // signed integer in minor units
  amountBaseCurrency: v.number(), // signed integer in base currency
  entryDate: v.number(), // denormalized for indexing
  installmentNumber: v.optional(v.number()),
  totalInstallments: v.optional(v.number()),
}
```
**Indexes**: `by_entryId`, `by_accountId_date`, `by_user_accountId_date`

**Invariants**:
- Sum of `amountBaseCurrency` across all lines in entry = 0 (zero-sum)
- `entryDate` must match parent `journal_entries.date`
- `exchangeRate` takes precedence over `exchangeRateId` for calculations
- `exchangeRateId` required when `currencyCode` ≠ account's `defaultCurrency` AND `exchangeRate` not provided
- `exchangeRate` must be positive when provided

### 4. exchange_rates
```typescript
{
  id: v.id("exchange_rates"),
  pairCurrency: v.string(), // "USD/ARS"
  rate: v.number(), // scaled integer (base→quote)
  inverseRate: v.optional(v.number()),
  date: v.number(), // epoch ms (UTC day boundary)
  source: v.string(), // provider ID
}
```
**Index**: `by_pair_date_source` (unique enforced in mutation)

**Format**: `pairCurrency = "{BASE}/{QUOTE}"` (e.g., "USD/ARS")

### 5. cards & debts (Specialized)
```typescript
// cards
{
  accountId: v.id("accounts"), // PK & FK
  userId: v.id("users"),
  closingDay: v.number(), // 1-31
  dueDate: v.number(), // 1-31
  softdelete: v.boolean(),
  deletedAt: v.optional(v.number()),
}

// debts
{
  accountId: v.id("accounts"), // PK & FK
  userId: v.id("users"),
  interestRate: v.optional(v.number()), // advisory only
  softdelete: v.boolean(),
  deletedAt: v.optional(v.number()),
}
```
**Indexes**: Both have `by_accountId` (PK), `by_user`

### 6. budgets & budget_lines
```typescript
// budgets
{
  id: v.id("budgets"),
  userId: v.id("users"),
  accountId: v.id("accounts"),
  amount: v.number(), // integer in base currency
  frequency: v.union(...),
  nextDueDate: v.number(),
  endDate: v.optional(v.number()),
  creationTime: v.number(),
  softdelete: v.boolean(),
  deletedAt: v.optional(v.number()),
  scopeType: v.union(...),
  scopeRefs: v.optional(v.array(v.id("accounts"))),
}

// budget_lines (historical tracking)
{
  id: v.id("budget_lines"),
  budgetId: v.id("budgets"),
  userId: v.id("users"),
  accountId: v.id("accounts"),
  amount: v.number(),
  startDate: v.number(),
  endDate: v.number(),
  softdelete: v.boolean(),
  deletedAt: v.optional(v.number()),
}
```
**Note**: No carryover; execution computed on read

### 7. recurring_entries & recurring_lines
```typescript
// recurring_entries
{
  id: v.id("recurring_entries"),
  userId: v.id("users"),
  description: v.string(),
  frequency: v.union(...),
  creationTime: v.number(),
  endDate: v.optional(v.number()),
  status: v.union(v.literal("active"), v.literal("paused")),
  nextDueDate: v.number(),
  softdelete: v.boolean(),
  deletedAt: v.optional(v.number()),
}

// recurring_lines
{
  id: v.id("recurring_lines"),
  recurringId: v.id("recurring_entries"),
  userId: v.id("users"),
  accountId: v.id("accounts"),
  direction: v.union(...),
  exchangeRateId: v.optional(v.id("exchange_rates")),
  amount: v.number(),
  softdelete: v.boolean(),
  deletedAt: v.optional(v.number()),
}
```
**Note**: Generates `journal_entries` when due (uses existing scheduling logic)

## FX Infrastructure Details

### Conversion Flow
1. Receive amount in source currency (e.g., 100 USD)
2. **Rate Selection Priority**:
   - If `exchangeRate` provided: use user's actual rate
   - Else if `exchangeRateId` provided: fetch rate from `exchange_rates` table
   - Else: throw error (no rate available)
3. Convert: `100 * selected_rate = X ARS`
4. Round to minor unit (0 decimals for ARS)
5. Calculate residual: `actual_sum - expected_zero`
6. If `|residual| ≤ 1`, create balancing line to `fx_rounding` account

### Rate Storage
- Store rates as scaled integers (e.g., multiply by 10000, store as int)
- Store both `rate` and `inverseRate` to avoid division errors
- UTC day boundary for date (midnight UTC)

### FX Rounding Account
- System account: `accountType = "expense"`, `description = "FX Rounding Adjustments"`
- Created automatically on first use
- Accumulates minor residuals from conversions

### Utilities to Implement

**Core Functions:**
```typescript
// convex/ledger/fx.ts

async function convertAmount(
  ctx: MutationCtx,
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  date: number,
  userExchangeRate?: number, // User's actual rate (takes precedence)
  exchangeRateId?: Id<"exchange_rates"> // Official rate reference
): Promise<{ converted: number; rateId: Id<"exchange_rates"> | null; rateUsed: number }>

async function getEffectiveRate(
  ctx: QueryCtx,
  userExchangeRate?: number,
  exchangeRateId?: Id<"exchange_rates">,
  pairCurrency?: string,
  date?: number
): Promise<{ rate: number; source: 'user' | 'official' | null }>

async function getRateForDate(
  ctx: QueryCtx,
  pairCurrency: string,
  date: number
): Promise<{ rate: number; id: Id<"exchange_rates"> } | null>

function calculateResidual(lines: JournalLine[]): number

async function createBalancingLine(
  ctx: MutationCtx,
  userId: Id<"users">,
  residual: number,
  entryId: Id<"journal_entries">
): Promise<Id<"journal_lines">>
```

## Account Management Utilities

### Account Creation

**Base Account:**
```typescript
async function createAccount(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">,
    accountType: AccountType,
    description: string,
    parentAccountId?: Id<"accounts">,
    defaultCurrency?: string,
  }
): Promise<Id<"accounts">>
```

**Validations:**
- Check for circular references in `parentAccountId`
- Ensure `parentAccountId` belongs to same user
- Default `defaultCurrency` to "ARS"

**Specialized Accounts:**
```typescript
async function createCardAccount(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">,
    description: string,
    closingDay: number, // 1-31
    dueDate: number, // 1-31
    parentAccountId: Id<"accounts">, // settlement account
  }
): Promise<Id<"accounts">>

async function createDebtAccount(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">,
    description: string,
    interestRate?: number,
    parentAccountId: Id<"accounts">, // payment source
  }
): Promise<Id<"accounts">>
```

### Hierarchy Validation

**Cycle Detection Algorithm:**
```typescript
async function detectCycle(
  ctx: QueryCtx,
  accountId: Id<"accounts">,
  parentAccountId: Id<"accounts">
): Promise<boolean> {
  const visited = new Set<Id<"accounts">>();
  let current = parentAccountId;
  
  while (current) {
    if (current === accountId) return true; // Cycle detected
    if (visited.has(current)) break;
    visited.add(current);
    
    const account = await ctx.db.get(current);
    current = account?.parentAccountId;
  }
  
  return false;
}
```

### Account Closure

**Eligibility Check:**
```typescript
async function canCloseAccount(
  ctx: QueryCtx,
  accountId: Id<"accounts">
): Promise<{ eligible: boolean; reason?: string }>
```

**Checks:**
1. Balance = 0 (sum all `journal_lines` for account)
2. No planned entries (check `journal_entries` with `status = "planned"`)
3. Not referenced as `parentAccountId` by active accounts

**Soft Delete:**
```typescript
async function softDeleteAccount(
  ctx: MutationCtx,
  accountId: Id<"accounts">
): Promise<void> {
  const { eligible, reason } = await canCloseAccount(ctx, accountId);
  if (!eligible) throw new ConvexError(reason);
  
  await ctx.db.patch(accountId, {
    softdelete: true,
    deletedAt: Date.now(),
  });
}
```

**Reopen:**
```typescript
async function reopenAccount(
  ctx: MutationCtx,
  accountId: Id<"accounts">
): Promise<void> {
  await ctx.db.patch(accountId, {
    softdelete: false,
    deletedAt: undefined,
  });
}
```

## Technical Implementation

### File Structure
```
convex/
  ledger/
    schema.ts          # All table definitions
    validators.ts      # Reusable validators
    fx.ts             # FX utilities
    accounts.ts       # Account CRUD mutations
    types.ts          # TypeScript types
  _generated/
    ... (auto-generated)
```

### Schema File Template
```typescript
// convex/ledger/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Enums
const accountTypeValidator = v.union(
  v.literal("asset"),
  v.literal("liability"),
  v.literal("equity"),
  v.literal("income"),
  v.literal("expense")
);

// ... other enums

export const ledgerSchema = {
  accounts: defineTable({
    // ... fields
  })
    .index("by_user", ["userId"])
    .index("by_user_type", ["userId", "accountType"])
    .index("by_parentAccountId", ["parentAccountId"]),
  
  // ... other tables
};
```

### Integration with Main Schema
```typescript
// convex/schema.ts
import { defineSchema } from "convex/server";
import { ledgerSchema } from "./ledger/schema";

export default defineSchema({
  // ... existing tables (users, expenses, etc.)
  ...ledgerSchema,
});
```

## Testing Requirements

### Unit Tests
- [ ] All enums reject invalid values
- [ ] Numeric validators enforce ranges (e.g., 1-31 for days)
- [ ] Currency code validation (3 uppercase letters)
- [ ] FX pair format validation ("BASE/QUOTE")
- [ ] Cycle detection algorithm correctness
- [ ] Rounding logic for each currency scale
- [ ] **FX Rate Priority**: `exchangeRate` takes precedence over `exchangeRateId`
- [ ] **Rate Validation**: `exchangeRate` must be positive when provided
- [ ] **Rate Requirements**: At least one rate source required for non-base currency

### Integration Tests
- [ ] Create account with all field types
- [ ] Create card and debt accounts with metadata
- [ ] Verify indexes are queryable
- [ ] Foreign key references work correctly
- [ ] Soft delete preserves references
- [ ] FX conversion produces zero-sum entries
- [ ] **User Rate vs Official Rate**: Both rate types work correctly
- [ ] **Rate Fallback**: System falls back to official rate when user rate not provided

### Property Tests
- [ ] Zero-sum invariant: sum of lines always = 0
- [ ] Integer amounts only (no floats accidentally stored)
- [ ] Residual always ≤ 1 minor unit
- [ ] Cycle prevention never allows circular hierarchies
- [ ] **Rate Consistency**: User rates and official rates both produce valid conversions
- [ ] **FX Spread Tracking**: System can track differences between user and official rates

## Constraints & Non-Functional Requirements

### Performance
- Index queries < 50ms for datasets < 10k entries
- FX conversion overhead < 10ms per transaction
- Cycle detection < 100ms for hierarchies < 20 levels deep

### Data Integrity
- All FKs use `v.id("tableName")`
- Soft delete always boolean (not optional)
- Timestamps always epoch milliseconds
- Zero-sum enforced on every entry

### Compatibility
- Works with current Convex version
- No deprecated Convex features
- Schema supports future additive changes

## Out of Scope

**NOT included in Phase 1:**
- Data migration/backfill (Phase 2)
- Dual-write implementation (Phase 3)
- Mutations for transactions (Phase 3)
- UI changes (Phase 6)
- Pre-aggregation rollups (Phase 4)
- Card statement automation (Phase 5)
- Budget execution queries (Phase 4)

## Success Metrics

**Schema & Validation:**
- [ ] All 10 tables defined with correct types
- [ ] All 7 enums defined with complete values
- [ ] All 20+ indexes created as specified
- [ ] Schema compiles without errors
- [ ] Convex dashboard shows all tables

**FX Infrastructure:**
- [ ] Exchange rates table functional
- [ ] Conversion utilities tested with sample rates
- [ ] Rounding policy produces correct results
- [ ] FX rounding account created
- [ ] Zero-sum maintained across currencies
- [ ] **User Rate Support**: Users can specify their actual exchange rates
- [ ] **Rate Priority**: User rates take precedence over official rates
- [ ] **FX Spread Analysis**: System tracks differences between user and official rates

**Account Management:**
- [ ] Account CRUD operations functional
- [ ] Cycle detection prevents circular refs
- [ ] Card/debt accounts create metadata entries
- [ ] Closure eligibility check works correctly
- [ ] Reopen restores soft-deleted accounts

**Integration:**
- [ ] No conflicts with existing schema
- [ ] All code in separate namespace
- [ ] Documentation complete
- [ ] All tests passing

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| FX rate precision loss | High | Use scaled integers, store inverse rates |
| Index performance degrades | High | Monitor queries, add composite indexes |
| Circular account references | Medium | Implement cycle detection in creation |
| Enum values need changes | Medium | Use string literals for flexibility |
| Float amounts used accidentally | High | Runtime validation, TypeScript strict mode |
| Schema conflicts | High | Separate namespace, thorough testing |

## Appendix

### Glossary
- **Double-Entry Ledger**: Every transaction affects ≥2 accounts (debit/credit)
- **Chart of Accounts**: Hierarchical list of all ledger accounts
- **Zero-Sum Invariant**: Sum of debits = sum of credits in an entry
- **Minor Units**: Smallest currency unit (cents for USD, pesos for ARS)
- **Accrual**: Recording when incurred (not when cash moves)

### References
- Convex Schemas: https://docs.convex.dev/database/schemas
- ISO 4217 Codes: https://www.iso.org/iso-4217-currency-codes.html
- Double-Entry Accounting: https://www.accountingtools.com/articles/double-entry-accounting

### Related PRDs
- Phase 2: Migration Foundation (Seeding & Backfill)
- Phase 3: Dual-Write Implementation

