# Phase 4.1: Transfer Implementation PRD

## Introduction

This PRD covers the implementation of account-to-account transfers within PerFi's double-entry accounting ledger system. Transfers represent a fundamental financial operation where money moves between accounts without affecting the user's net worth, enabling advanced features like savings allocations, investment purchases, debt payments, and account rebalancing.

This is the first major feature built exclusively on the ledger system, demonstrating the power of the double-entry foundation established in Phases 1-3. Transfers will be implemented as ledger-only operations, showcasing the system's capability to handle complex financial transactions beyond simple expense/income recording.

## Context & Background

### Current System
- Complete double-entry ledger system with accounts, journal entries, and journal lines
- Dual-write synchronization between legacy and ledger tables (Phase 3 complete)
- Support for expense/income transactions with automatic debit/credit logic
- Chart of accounts with asset, liability, income, and expense account types
- Multi-currency foundation with FX rate infrastructure
- Zero-sum validation ensuring all transactions balance

### Target System
- Account-to-account transfers as first-class financial operations
- Cross-currency transfer support with user-provided or market exchange rates
- Transfer validation preventing invalid operations (same account, insufficient balance)
- Proper double-entry recording: debit source account, credit destination account
- Integration with existing account management and transaction workflows
- Foundation for advanced features like debt payments, investment purchases, and savings allocations

### Technology Stack
- **Backend**: Convex (TypeScript) with existing ledger infrastructure
- **Database**: Convex NoSQL with established journal entries and journal lines tables
- **Validation**: Convex `v` validators with existing enum definitions
- **FX**: Leverage existing `exchange_rates` table and FX utilities

## User Stories

**US1:** *As a user, I want to transfer money between my accounts, so I can allocate funds to savings, pay down debts, or move money between different payment methods.*

**US2:** *As a user, I want to transfer money between accounts in different currencies, so I can manage my multi-currency financial situation with accurate exchange rates.*

**US3:** *As a developer, I need transfer operations to maintain the zero-sum invariant, so the accounting equation remains balanced and the ledger integrity is preserved.*

**US4:** *As a developer, I need comprehensive transfer validation, so invalid operations are prevented and users receive clear error messages.*

**US5:** *As a user, I want transfer transactions to appear in my transaction history, so I can track all financial movements in one place.*

## Acceptance Criteria

### For US1 (Basic Transfer Operations):

**Transfer Creation:**
- [ ] `addTransfer` mutation accepts source account, destination account, amount, and optional description
- [ ] Transfer creates balanced journal entry with two lines: debit source, credit destination
- [ ] Transfer appears in transaction history with proper categorization
- [ ] Transfer amount must be positive integer in minor units
- [ ] Source and destination accounts must be different
- [ ] Both accounts must belong to the authenticated user
- [ ] Both accounts must be active (not soft-deleted)

**Business Logic:**
- [ ] Transfer does not affect user's net worth (asset-to-asset, liability-to-liability, etc.)
- [ ] Transfer maintains zero-sum invariant (debits = credits)
- [ ] Transfer uses same currency for both accounts by default
- [ ] Transfer creates proper audit trail with createdBy and updateTime

### For US2 (Cross-Currency Transfers):

**Currency Handling:**
- [ ] Cross-currency transfers require exchange rate specification
- [ ] User can provide custom exchange rate via `exchangeRate` parameter
- [ ] System can use market rate via `exchangeRateId` reference
- [ ] User-provided rates take precedence over market rates
- [ ] Amount conversion applies proper rounding policy (round half away from zero)
- [ ] Residual amounts ≤ one minor unit are auto-balanced to `fx_rounding` account
- [ ] Both source and destination amounts are recorded in their respective currencies

**Validation:**
- [ ] Cross-currency transfers validate both accounts have defined currencies
- [ ] Exchange rate must be positive number
- [ ] Currency codes must be valid ISO 4217 format
- [ ] Conversion results must be within reasonable bounds

### For US3 (Zero-Sum Invariant):

**Accounting Integrity:**
- [ ] Every transfer creates exactly two journal lines
- [ ] Sum of all journal lines in transfer entry equals zero
- [ ] Debit amount in source currency equals credit amount in destination currency (after conversion)
- [ ] Transfer entry status is "posted" by default
- [ ] Transfer maintains referential integrity with accounts table

**Error Handling:**
- [ ] Transfer fails if zero-sum validation fails
- [ ] Transfer fails if account references are invalid
- [ ] Transfer fails if currency conversion produces invalid results
- [ ] All failures provide specific error messages

### For US4 (Transfer Validation):

**Input Validation:**
- [ ] Source account ID must be valid and belong to user
- [ ] Destination account ID must be valid and belong to user
- [ ] Amount must be positive integer
- [ ] Description is optional but limited to 500 characters
- [ ] Exchange rate must be positive when provided
- [ ] Currency codes must be valid ISO 4217 format

**Business Rule Validation:**
- [ ] Source and destination accounts must be different
- [ ] Both accounts must be active (softdelete = false)
- [ ] Transfer must not create negative balances (future enhancement)
- [ ] User must have permission to transfer from source account

**Error Messages:**
- [ ] "Source and destination accounts must be different"
- [ ] "Account not found or access denied"
- [ ] "Invalid amount: must be positive"
- [ ] "Exchange rate required for cross-currency transfers"
- [ ] "Invalid currency code"

### For US5 (Transaction History Integration):

**History Display:**
- [ ] Transfers appear in `listJournalEntries` query with `sourceType = 'transfer'`
- [ ] Transfer entries show both source and destination accounts
- [ ] Transfer entries display converted amounts in both currencies when applicable
- [ ] Transfer entries include exchange rate information
- [ ] Transfer entries support filtering by account, date range, and amount

**UI Integration:**
- [ ] Transfers appear in transaction list with distinct icon/indicator
- [ ] Transfer detail view shows both accounts and conversion details
- [ ] Transfer entries can be edited (amount, description) but not account assignments
- [ ] Transfer entries can be soft-deleted with proper cleanup

## Detailed Specifications

### addTransfer Mutation

**Purpose**: Creates a new account-to-account transfer with proper double-entry recording

**Input:**
```typescript
{
  sourceAccountId: Id<"accounts">, // Account to debit
  destinationAccountId: Id<"accounts">, // Account to credit
  amount: number, // Amount in source account currency (minor units)
  description?: string, // Optional description (max 500 chars)
  exchangeRate?: number, // User-provided rate (takes precedence)
  exchangeRateId?: Id<"exchange_rates">, // Market rate reference
}
```

**Output:**
```typescript
{
  journalEntryId: Id<"journal_entries">,
  status: "success" | "error",
  error?: string,
}
```

**Business Logic:**
1. Validate input parameters (accounts exist, belong to user, are different)
2. Retrieve account details and currency information
3. Calculate destination amount using exchange rate
4. Create journal entry with `sourceType = 'transfer'`
5. Create debit line for source account
6. Create credit line for destination account
7. Apply rounding policy and handle residuals
8. Return journal entry ID or error

**Validations:**
- Source and destination accounts must be different
- Both accounts must belong to authenticated user
- Both accounts must be active (softdelete = false)
- Amount must be positive integer
- For cross-currency: exchange rate or exchangeRateId required
- Exchange rate must be positive number
- Currency codes must be valid ISO 4217 format

**Error Conditions:**
- Throws `ConvexError("INVALID_ACCOUNTS")` when accounts are same or invalid
- Throws `ConvexError("INVALID_AMOUNT")` when amount is not positive
- Throws `ConvexError("MISSING_EXCHANGE_RATE")` for cross-currency without rate
- Throws `ConvexError("INVALID_EXCHANGE_RATE")` for non-positive rates

### Transfer Validation Utilities

**Purpose**: Centralized validation logic for transfer operations

**Functions:**
```typescript
validateTransferAccounts(
  sourceAccountId: Id<"accounts">,
  destinationAccountId: Id<"accounts">,
  userId: Id<"users">
): Promise<{ sourceAccount: Account, destinationAccount: Account }>

validateTransferAmount(amount: number): void

validateExchangeRate(
  exchangeRate?: number,
  exchangeRateId?: Id<"exchange_rates">
): Promise<number>

calculateDestinationAmount(
  sourceAmount: number,
  exchangeRate: number,
  sourceCurrency: string,
  destinationCurrency: string
): { destinationAmount: number, residual?: number }
```

### Transfer Queries

**Purpose**: Retrieve transfer transactions with proper filtering and display

**Functions:**
```typescript
listTransfers(
  userId: Id<"users">,
  filters?: {
    accountId?: Id<"accounts">,
    dateFrom?: number,
    dateTo?: number,
    amountMin?: number,
    amountMax?: number,
  }
): Promise<TransferEntry[]>

getTransferDetails(
  journalEntryId: Id<"journal_entries">
): Promise<TransferDetails>
```

**TransferEntry Type:**
```typescript
interface TransferEntry {
  id: Id<"journal_entries">,
  date: number,
  description: string,
  sourceAccount: { id: Id<"accounts">, description: string, currency: string },
  destinationAccount: { id: Id<"accounts">, description: string, currency: string },
  sourceAmount: number,
  destinationAmount: number,
  exchangeRate?: number,
  status: "posted" | "voided",
}
```

### FX Integration

**Purpose**: Handle currency conversion for cross-currency transfers

**Exchange Rate Resolution:**
1. User-provided `exchangeRate` takes highest precedence
2. Market rate via `exchangeRateId` as fallback
3. Default 1:1 rate for same-currency transfers
4. Validation ensures rate is positive and reasonable

**Rounding Policy:**
- Round half away from zero to destination currency minor unit
- Residuals ≤ one minor unit auto-balanced to `fx_rounding` account
- Track rounding residuals for audit purposes

**Currency Scale Handling:**
- ARS: scale 0 (no decimal places)
- USD/EUR: scale 2 (cents)
- Automatic scaling based on destination currency

## Technical Implementation Details

### File Structure

Create new transfer functionality in: `convex/ledger/transfers.ts`

**Key Functions:**
- `addTransfer` (mutation)
- `validateTransferAccounts` (internal)
- `calculateDestinationAmount` (internal)
- `listTransfers` (query)
- `getTransferDetails` (query)

### Integration Points

**Account Management:**
- Leverage existing `accounts` table and queries
- Use existing account validation utilities
- Integrate with account hierarchy system

**Journal System:**
- Create entries in `journal_entries` table
- Create lines in `journal_lines` table
- Maintain zero-sum invariant validation
- Use existing audit trail fields

**FX System:**
- Integrate with `exchange_rates` table
- Use existing FX utilities from `convex/ledger/fx.ts`
- Apply established rounding policies

### Error Handling Strategy

**Validation Errors:**
- Input validation failures return specific error messages
- Business rule violations provide actionable feedback
- Account access errors indicate permission issues

**System Errors:**
- Database constraint violations logged with context
- FX calculation errors include conversion details
- Zero-sum validation failures trigger rollback

**User Experience:**
- Clear error messages for common scenarios
- Suggestions for fixing validation issues
- Graceful handling of edge cases

### Testing Requirements

**Unit Tests:**
- Transfer creation with various account combinations
- Cross-currency conversion accuracy
- Validation logic for all error conditions
- Zero-sum invariant maintenance
- FX rounding policy application

**Integration Tests:**
- Transfer integration with existing transaction history
- Account balance calculations after transfers
- FX rate resolution and application
- Audit trail completeness

**Edge Cases:**
- Same-currency transfers (rate = 1.0)
- Maximum/minimum amount boundaries
- Account soft-deletion scenarios
- Concurrent transfer attempts

## Constraints & Non-Functional Requirements

### Performance
- Transfer creation must complete in < 200ms for typical operations
- Transfer queries must support pagination for large datasets
- FX calculations must complete in < 50ms
- Index usage optimized for account-based filtering

### Data Integrity
- All transfers must maintain zero-sum invariant
- Account references must be valid and accessible
- Currency conversions must be mathematically accurate
- Audit trail must be complete and immutable

### Security
- Users can only transfer between their own accounts
- Account access validated on every transfer operation
- Exchange rates validated to prevent manipulation
- Transfer amounts validated to prevent overflow

### Compatibility
- Transfers work with existing account management
- Transfer history integrates with current transaction views
- FX system compatible with future multi-currency features
- Schema changes backward compatible

## Out of Scope

The following are explicitly **NOT** included in this step:

- **Transfer Scheduling**: Recurring transfers (covered in Phase 4.2)
- **Transfer Fees**: Fee calculation and recording (future enhancement)
- **Batch Transfers**: Multiple account transfers in single operation (future)
- **Transfer Limits**: Daily/monthly transfer limits (future security feature)
- **Transfer Approvals**: Multi-user approval workflows (future collaboration)
- **Transfer Templates**: Saved transfer configurations (future UX enhancement)
- **Transfer Reversals**: Automatic transfer reversal capabilities (future)
- **External Transfers**: Bank-to-bank transfer integration (future)
- **Transfer Analytics**: Transfer pattern analysis and reporting (future)

## Success Metrics

- [ ] `addTransfer` mutation successfully creates balanced journal entries
- [ ] Cross-currency transfers handle FX conversion accurately
- [ ] Transfer validation prevents all invalid operations
- [ ] Transfer history displays correctly in transaction lists
- [ ] Zero-sum invariant maintained for all transfer operations
- [ ] Transfer performance meets < 200ms creation time requirement
- [ ] All transfer edge cases handled gracefully
- [ ] Transfer integration with existing UI components
- [ ] Comprehensive test coverage (>90%) for transfer logic
- [ ] Transfer documentation complete and accurate

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Zero-sum validation failure | High | Comprehensive testing, rollback on validation failure |
| FX conversion errors | Medium | Validate rates, handle edge cases, user-provided rate fallback |
| Account access violations | High | Strict user validation, account ownership checks |
| Performance degradation | Medium | Optimize queries, add indexes, pagination support |
| Currency precision issues | Medium | Proper rounding policy, residual handling |
| Integration complexity | Low | Leverage existing patterns, incremental development |

## Appendix

### Glossary
- **Transfer**: Account-to-account movement of funds maintaining zero net worth change
- **Zero-Sum Invariant**: Accounting principle where debits equal credits in every transaction
- **Cross-Currency Transfer**: Transfer between accounts with different currency codes
- **Exchange Rate**: Conversion factor between two currencies
- **Minor Units**: Smallest currency denomination (cents for USD, pesos for ARS)

### References
- Convex Docs: https://docs.convex.dev/database/schemas
- ISO 4217 Currency Codes: https://www.iso.org/iso-4217-currency-codes.html
- Double-Entry Bookkeeping: https://en.wikipedia.org/wiki/Double-entry_bookkeeping

### Related PRDs
- Phase 4.2: Budget System Implementation
- Phase 4.3: Pre-Aggregation System
- Phase 6: UI Migration to Ledger Data

### Code Examples

**Basic Transfer Creation:**
```typescript
// Same-currency transfer
await addTransfer({
  sourceAccountId: "j123...", // Cash account
  destinationAccountId: "j456...", // Savings account
  amount: 50000, // $50,000 ARS
  description: "Monthly savings allocation"
});

// Cross-currency transfer
await addTransfer({
  sourceAccountId: "j123...", // USD bank account
  destinationAccountId: "j456...", // ARS cash account
  amount: 10000, // $100.00 USD (in cents)
  exchangeRate: 950.50, // User's actual rate
  description: "USD to ARS conversion"
});
```

**Transfer Validation:**
```typescript
// Validation will fail
await addTransfer({
  sourceAccountId: "j123...",
  destinationAccountId: "j123...", // Same account
  amount: 50000
}); // Throws: "Source and destination accounts must be different"
```
