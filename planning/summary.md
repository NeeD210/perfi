# Project Summary

This document provides an overview of the PerFi (Personal Finance) application, detailing its current state, database schema, backend functionalities, and frontend structure.

## Current Project Status

**PerFi** is a comprehensive personal finance tracking application built with modern technologies. The project has successfully completed **Phase 1-4.4 of the Accounting Ledger System** implementation. The application features a complete double-entry bookkeeping system with dual-write synchronization between legacy and ledger tables (production deployment: January 8, 2025), includes a complete account-to-account transfer system with cross-currency support (completed: October 11, 2025), has a comprehensive flexible budget system with real-time execution tracking (completed and deployed to production: October 12, 2025), includes budget historical tracking with automated period rollover (completed: January 15, 2025), and now features a pre-aggregation system with monthly rollups for performance optimization (completed: January 15, 2025). Current focus: Phase 4.5 UI Integration and Phase 5 Card Settlement.

### Key Achievements
- ✅ Complete double-entry accounting ledger system (Phase 1-3)
- ✅ Production deployment with 100% migration success (353 journal entries, 0 errors)
- ✅ Dual-write synchronization across all financial operations
- ✅ **Account-to-account transfer system with cross-currency support (Phase 4.1)**
- ✅ **Flexible budget system with three scope types and real-time execution tracking (Phase 4.2) - PRODUCTION DEPLOYED**
- ✅ **Budget historical tracking with automated period rollover and cron jobs (Phase 4.3) - COMPLETED**
- ✅ Complete transaction management system (expenses/income)
- ✅ Recurring transaction automation with ledger integration
- ✅ Installment payment scheduling for credit cards
- ✅ Category and payment type management with ledger accounts
- ✅ Financial projections combining recurring and installment payments
- ✅ Comprehensive diagnostic and migration tools
- ✅ Mobile-first UI with drawer-based navigation
- ✅ Auth0 authentication integration
- ✅ Real-time data synchronization with Convex

## Technology Stack

**Frontend:**
- React 18 with TypeScript
- Vite for build tooling
- TailwindCSS for styling
- Radix UI + shadcn/ui component library
- Chart.js and Recharts for data visualization
- React Router for navigation

**Backend:**
- Convex (TypeScript) for real-time database and backend functions
- Auth0 for authentication
- Convex cron jobs for automated processing

**Testing:**
- Playwright for E2E testing
- Vitest for unit testing

## Core Codebase Guidelines & Non-Functional Requirements (NFRs)

This section codifies the architectural standards, constraints, and best practices learned from Phase 4.4 implementation and audit findings. These guidelines serve as the single source of truth for all future development phases.

### Critical System Testing Standards

**MANDATORY REQUIREMENTS:**
- **Test Coverage Threshold**: All critical systems (rollups, reconciliation, aggregation) must achieve >85% line coverage before production deployment
- **Integration Test Coverage**: All rollup creation/update flows must have comprehensive integration tests
- **Performance Test Coverage**: All performance-critical queries must have benchmarks validating < 1s dashboard, < 200ms budget execution targets
- **Edge Case Testing**: All functions must include tests for boundary conditions, error states, and concurrent operations

**ENFORCEMENT:**
- No production deployment without meeting test coverage thresholds
- All rollup functions must have unit tests for idempotency and correctness
- All reconciliation jobs must have integration tests with multiple accounts
- All query optimizations must have performance benchmarks

### Function Size & Modularity Standards

**MANDATORY REQUIREMENTS:**
- **Function Size Limit**: Functions must not exceed 50 lines of code
- **Large Function Refactoring**: Functions exceeding 50 lines must be split into helper functions
- **Single Responsibility**: Each function must have a single, well-defined responsibility
- **Code Reuse**: Never duplicate logic when existing functions are available

**ENFORCEMENT:**
- Code review must reject functions exceeding 50 lines
- Refactor large functions before merging to main branch
- Extract helper functions for complex logic
- Always call existing functions instead of duplicating logic

### Type Safety Standards

**MANDATORY REQUIREMENTS:**
- **Eliminate `any` Types**: All `any` types must be replaced with proper Convex types
- **Convex Type Usage**: Use `QueryCtx`, `MutationCtx`, `ActionCtx` instead of generic types
- **Type Validation**: All function parameters must use Convex `v` validators
- **Return Type Safety**: All functions must have explicit return type annotations

**ENFORCEMENT:**
- TypeScript strict mode must be enabled
- Linting must fail on `any` type usage
- All internal functions must use proper Convex context types
- Type safety violations block production deployment

### Field Name Consistency Standards

**MANDATORY REQUIREMENTS:**
- **Schema Field Usage**: Always use exact field names from database schema
- **Aggregation Field Names**: Use `amountBaseCurrency` for journal line amounts, not `debitAmount`/`creditAmount`
- **Consistent Naming**: Maintain consistent field naming across all aggregation logic
- **Field Validation**: Validate field names against schema before use

**ENFORCEMENT:**
- Code review must verify field name consistency
- Runtime errors from incorrect field names are P0 critical bugs
- All aggregation functions must reference schema field names
- Field name mismatches block production deployment

### Convex Platform Constraints & Best Practices

**MANDATORY REQUIREMENTS:**
- **Cron Job Timeout**: All cron jobs must complete within 9 minutes (safety margin for 10-minute limit)
- **Batch Processing**: Process large datasets in batches of 100 accounts (reduces to 50 if memory pressure)
- **Memory Management**: Monitor memory usage during large operations
- **Progress Saving**: Long-running jobs must save progress and support resume capability
- **Timeout Handling**: Implement 9-minute timeout safety margin for all long operations

**ENFORCEMENT:**
- All cron jobs must have timeout handling
- Batch size must be configurable based on memory constraints
- Progress tracking must be implemented for jobs > 5 minutes
- Memory usage monitoring required for large operations

### Concurrent Operation Handling

**MANDATORY REQUIREMENTS:**
- **Atomic Operations**: Use atomic operations to prevent race conditions
- **Idempotent Functions**: All rollup functions must be idempotent
- **Concurrent Safety**: Handle concurrent updates between synchronous operations and background jobs
- **Race Condition Prevention**: Use proper locking mechanisms for shared resources

**ENFORCEMENT:**
- All rollup operations must be atomic
- Idempotency must be tested and verified
- Concurrent operation tests required
- Race condition prevention must be validated

### Error Recovery & Graceful Degradation Standards

**MANDATORY REQUIREMENTS:**
- **Retry Policies**: Implement exponential backoff retry policies (3 attempts: 1s, 2s, 4s delays)
- **Graceful Degradation**: System must continue operating when rollup updates fail
- **Error Logging**: All errors must be logged with transaction ID and context
- **Fallback Mechanisms**: All rollup-dependent queries must have direct calculation fallback
- **Recovery Procedures**: Failed operations must be automatically retried by reconciliation jobs

**ENFORCEMENT:**
- All rollup operations must have retry policies
- Transaction mutations must succeed even if rollup updates fail
- Comprehensive error logging required
- Fallback mechanisms must be tested and validated

### Performance Standards

**MANDATORY REQUIREMENTS:**
- **Home Dashboard**: < 1 second load time for users with 1000+ transactions
- **Budget Execution**: < 200ms query time for budgets with 10+ accounts
- **Reconciliation Job**: < 5 minutes completion time for 1000+ accounts
- **Rollup Updates**: < 100ms per transaction mutation
- **Query Optimization**: All queries must use appropriate indexes

**ENFORCEMENT:**
- Performance benchmarks must be met before production deployment
- Query optimization required for all rollup-dependent operations
- Performance regression testing required for all changes
- Index usage must be validated and optimized

### Data Consistency Standards

**MANDATORY REQUIREMENTS:**
- **Drift Detection**: Rollup values must match direct calculation within 0.01% tolerance
- **Consistency Validation**: Spot-check validation comparing rollup vs direct calculation
- **Reconciliation**: Daily reconciliation job must correct all identified drift
- **Data Integrity**: No missing rollup records for active accounts and recent months

**ENFORCEMENT:**
- Drift detection must be implemented and monitored
- Consistency validation required for all rollup data
- Reconciliation job must complete successfully daily
- Data integrity violations are P0 critical issues

### Monitoring & Observability Standards

**MANDATORY REQUIREMENTS:**
- **Success Rate Monitoring**: Rollup update success rate must be >95%
- **Performance Metrics**: Track query performance (rollup vs direct calculation)
- **Health Monitoring**: Monitor rollup data freshness and reconciliation job status
- **Alerting**: Alert on drift >1%, success rate <90%, stale data >48 hours
- **Operational Visibility**: Rollup metrics must be visible in Convex dashboard

**ENFORCEMENT:**
- Monitoring must be implemented before production deployment
- Alerting thresholds must be configured and tested
- Operational dashboards must be available
- Health monitoring must be continuous and automated

## Database Schema (Convex)

The database is managed using Convex and includes the following tables:

### Ledger System Tables (Phase 1-3)

*   **`accounts`**: Chart of accounts for double-entry bookkeeping.
    *   `userId`: (ID referencing `users`) The user who owns this account.
    *   `description`: (String) Account name/description.
    *   `accountType`: (String) "asset", "liability", "income", or "expense".
    *   `creationTime`: (Number) Account creation timestamp.
    *   `softdelete`: (Boolean) Flag for soft deletion.
    *   `deletedAt`: (Optional Number) Timestamp of soft deletion.
    *   *Indexes*: `by_user` on `userId`, `by_user_type` on `userId` and `accountType`, `by_user_type_active` on `userId`, `accountType`, and `softdelete`.

*   **`journal_entries`**: Financial transactions in double-entry format.
    *   `userId`: (ID referencing `users`) The user who owns this entry.
    *   `entryDate`: (Number) Transaction date timestamp.
    *   `description`: (String) Transaction description.
    *   `idempotencyKey`: (String) Unique key to prevent duplicates.
    *   `sourceType`: (String) "expense", "income", "recurring", or "installment".
    *   `sourceId`: (String) Reference to source transaction ID.
    *   `status`: (String) "draft", "posted", or "void".
    *   `createdBy`: (ID referencing `users`) User who created the entry.
    *   `updateTime`: (Optional Number) Last update timestamp.
    *   `updatedBy`: (Optional ID referencing `users`) User who last updated.
    *   `softdelete`: (Boolean) Flag for soft deletion.
    *   `deletedAt`: (Optional Number) Timestamp of soft deletion.
    *   *Indexes*: `by_user_date`, `by_idempotencyKey`, `by_sourceType_sourceId`.

*   **`journal_lines`**: Individual debit/credit lines for each journal entry.
    *   `entryId`: (ID referencing `journal_entries`) Parent journal entry.
    *   `accountId`: (ID referencing `accounts`) Account being debited/credited.
    *   `direction`: (String) "debit" or "credit".
    *   `amountBaseCurrency`: (Number) Amount in minor units (cents).
    *   `currencyCode`: (String) Currency code (default: "ARS").
    *   *Index*: `by_entryId` on `entryId`.

*   **`recurring_entries`**: Ledger templates for recurring transactions.
    *   `userId`: (ID referencing `users`) The user who owns this template.
    *   `description`: (String) Template description.
    *   `frequency`: (String) "daily", "weekly", "monthly", "semestrally", or "yearly".
    *   `anchorDay`: (Number) Day of month for scheduling.
    *   `nextDueDate`: (Number) Next scheduled execution date.
    *   `endDate`: (Optional Number) When template expires.
    *   `status`: (String) "active" or "paused".
    *   `softdelete`: (Boolean) Flag for soft deletion.
    *   `deletedAt`: (Optional Number) Timestamp of soft deletion.
    *   *Index*: `by_user_status` on `userId` and `status`.

*   **`recurring_lines`**: Ledger line templates for recurring transactions.
    *   `recurringEntryId`: (ID referencing `recurring_entries`) Parent template.
    *   `accountId`: (ID referencing `accounts`) Account for this line.
    *   `direction`: (String) "debit" or "credit".
    *   `amount`: (Number) Amount in minor units.
    *   `currencyCode`: (String) Currency code (default: "ARS").
    *   `softdelete`: (Boolean) Flag for soft deletion.
    *   *Index*: `by_recurringId` on `recurringEntryId`.

*   **`category_mappings`**: Links legacy categories to ledger accounts.
    *   `userId`: (ID referencing `users`)
    *   `categoryId`: (ID referencing `categories`)
    *   `accountId`: (ID referencing `accounts`)
    *   `createdAt`: (Number) Mapping creation timestamp.
    *   *Index*: `by_user_category` on `userId` and `categoryId`.

*   **`payment_type_mappings`**: Links legacy payment types to ledger accounts.
    *   `userId`: (ID referencing `users`)
    *   `paymentTypeId`: (ID referencing `paymentTypes`)
    *   `accountId`: (ID referencing `accounts`)
    *   `createdAt`: (Number) Mapping creation timestamp.
    *   *Index*: `by_user_paymentType` on `userId` and `paymentTypeId`.

*   **`recurring_template_mappings`**: Links legacy recurring transactions to ledger templates.
    *   `userId`: (ID referencing `users`)
    *   `legacyRecurringId`: (ID referencing `recurringTransactions`)
    *   `recurringEntryId`: (ID referencing `recurring_entries`)
    *   `createdAt`: (Number) Mapping creation timestamp.
    *   *Index*: `by_user_legacyRecurring` on `userId` and `legacyRecurringId`.

*   **`cards`**: Credit card metadata for payment scheduling.
    *   `accountId`: (ID referencing `accounts`) Linked liability account.
    *   `userId`: (ID referencing `users`)
    *   `closingDay`: (Number) Statement closing day (1-31).
    *   `dueDate`: (Number) Payment due day (1-31).
    *   `softdelete`: (Boolean) Flag for soft deletion.
    *   `deletedAt`: (Optional Number) Timestamp of soft deletion.
    *   *Index*: `by_accountId` on `accountId`.

*   **`fx_rates`**: Foreign exchange rates for multi-currency support (future).
    *   `fromCurrency`: (String) Source currency code.
    *   `toCurrency`: (String) Target currency code.
    *   `rate`: (Number) Exchange rate.
    *   `effectiveDate`: (Number) When rate became effective.
    *   *Index*: `by_currencies_date` on currency pair and date.

*   **`budgets`**: Budget definitions with flexible scoping (Phase 4.2).
    *   `userId`: (ID referencing `users`) The user who owns this budget.
    *   `accountId`: (Optional ID referencing `accounts`) Account for singleAccount scope only.
    *   `amount`: (Number) Budget limit in minor units (base currency).
    *   `frequency`: (String) "daily", "weekly", "monthly", "quarterly", "semestrally", or "yearly".
    *   `nextDueDate`: (Number) Next period start timestamp.
    *   `endDate`: (Optional Number) Budget expiration date.
    *   `creationTime`: (Number) Budget creation timestamp.
    *   `softdelete`: (Boolean) Flag for soft deletion.
    *   `deletedAt`: (Optional Number) Timestamp of soft deletion.
    *   `scopeType`: (String) "singleAccount", "multipleAccounts", or "accountType".
    *   `scopeRefs`: (Optional Array of IDs) Account IDs for multipleAccounts scope.
    *   `scopeAccountType`: (Optional String) "expense" or "income" for accountType scope.
    *   `description`: (Optional String) Budget description (max 500 characters).
    *   *Indexes*: `by_user` on `userId`, `by_accountId` on `accountId`, `by_user_active` on `userId` and `softdelete` and `creationTime`, `by_nextDueDate` on `nextDueDate`.

*   **`budget_lines`**: Historical budget execution records (Phase 4.3 - COMPLETED).
    *   `budgetId`: (ID referencing `budgets`) Parent budget.
    *   `periodStart`: (Number) Period start timestamp.
    *   `periodEnd`: (Number) Period end timestamp.
    *   `spentAmount`: (Number) Amount spent/earned in period.
    *   `remainingAmount`: (Number) Amount remaining in period.
    *   `percentUsed`: (Number) Percentage of budget used.
    *   `budgetAmount`: (Number) Budget amount at time of period end (snapshot for historical accuracy).
    *   `status`: (String) "under_budget", "at_budget", or "over_budget".
    *   `createdAt`: (Number) Record creation timestamp.
    *   *Indexes*: `by_budgetId_periodStart` on `budgetId` and `periodStart`, `by_budgetId` on `budgetId`.

*   **`monthly_rollups`**: Pre-calculated monthly aggregates by account for performance optimization (Phase 4.4).
    *   `userId`: (ID referencing `users`) User partition for multi-tenancy.
    *   `accountId`: (ID referencing `accounts`) Account reference.
    *   `month`: (Number) Epoch ms of month start (1st day 00:00:00 UTC).
    *   `totalDebits`: (Number) Sum of debit lines in month (minor units).
    *   `totalCredits`: (Number) Sum of credit lines in month (minor units).
    *   `netAmount`: (Number) totalCredits - totalDebits (can be negative).
    *   `transactionCount`: (Number) Number of journal_lines in month.
    *   `lastUpdated`: (Number) Epoch ms when rollup was last updated.
    *   `lastReconciled`: (Number) Epoch ms when rollup was last reconciled.
    *   `createdAt`: (Number) Epoch ms when rollup record was created.
    *   *Indexes*: `by_user_month` on `userId` and `month desc`, `by_account_month` on `accountId` and `month desc`, `by_user_account_month` on `userId`, `accountId`, and `month desc`, `by_month` on `month desc`, `by_last_reconciled` on `lastReconciled asc`.

*   **`ledger_errors`**: Error tracking for dual-write operations.
    *   `userId`: (ID referencing `users`)
    *   `operation`: (String) Operation that failed.
    *   `errorMessage`: (String) Error description.
    *   `context`: (Any) Additional error context.
    *   `timestamp`: (Number) When error occurred.

*   **`migration_progress`**: Tracks migration execution status.
    *   `userId`: (ID referencing `users`)
    *   `migrationName`: (String) Name of migration.
    *   `status`: (String) "pending", "running", "completed", or "failed".
    *   `startedAt`: (Optional Number) When migration started.
    *   `completedAt`: (Optional Number) When migration finished.
    *   `error`: (Optional String) Error message if failed.

### Legacy Tables

*   **`users`**: Stores user information.
    *   `auth0Id`: (String) Unique identifier from Auth0.
    *   `email`: (String) User's email address.
    *   `emailVerified`: (Boolean) Whether the email is verified.
    *   `isAnonymous`: (Optional Boolean) If the user is anonymous.
    *   `lastLoginAt`: (Optional Float64) Timestamp of the last login.
    *   `onboardingCompleted`: (Optional Boolean) Whether the user has completed onboarding.
    *   `softdelete`: (Boolean) Flag for soft deletion.
    *   *Index*: `by_auth0Id` on `auth0Id`.

*   **`categories`**: Stores expense and income categories.
    *   `name`: (String) Name of the category.
    *   `userId`: (ID referencing `users`) The user who owns this category.
    *   `color`: (Optional String) Color code for the category.
    *   `icon`: (Optional String) Icon for the category.
    *   `transactionType`: (Optional String) Type of transaction ("expense" or "income").
    *   `softdelete`: (Optional Boolean) Flag for soft deletion.
    *   *Indexes*: `by_user` on `userId`, `by_user_softdelete` on `userId` and `softdelete`.

*   **`paymentTypes`**: Stores user-defined payment methods with credit card support.
    *   `name`: (String) Name of the payment type.
    *   `userId`: (ID referencing `users`) The user who owns this payment type.
    *   `deletedAt`: (Optional Number) Timestamp of soft deletion.
    *   `softdelete`: (Boolean) Flag for soft deletion.
    *   `isCredit`: (Optional Boolean) Whether this is a credit card payment type.
    *   `closingDay`: (Optional Number) Credit card closing day (1-31).
    *   `dueDay`: (Optional Number) Credit card due day (1-31).
    *   *Index*: `by_user_softdelete` on `userId` and `softdelete`.

*   **`expenses`**: Stores all financial transactions (expenses and income).
    *   `amount`: (Float64) The transaction amount.
    *   `category`: (String) Name of the category (denormalized).
    *   `categoryId`: (Optional ID referencing `categories`) The category of the transaction.
    *   `cuotas`: (Float64) Number of installments.
    *   `date`: (Float64) Timestamp of the transaction.
    *   `description`: (String) Description of the transaction.
    *   `paymentType`: (Optional String) Name of the payment type (denormalized).
    *   `paymentTypeId`: (Optional ID referencing `paymentTypes`) The payment method used.
    *   `transactionType`: (String) "expense" or "income".
    *   `userId`: (ID referencing `users`) The user who made the transaction.
    *   `deletedAt`: (Optional Float64) Timestamp of soft deletion.
    *   `softdelete`: (Optional Boolean) Flag for soft deletion.
    *   `verified`: (Optional Boolean) Whether the transaction has been verified by the user.
    *   `recurringTransactionId`: (Optional ID referencing `recurringTransactions`) Reference to the recurring transaction that generated this transaction.
    *   `nextDueDate`: (Optional Float64) Next due date for installment payments.
    *   *Indexes*: `by_user`, `by_user_date`, `by_user_softdelete`, `by_recurringTransactionId`, `by_categoryId`.

*   **`recurringTransactions`**: Stores recurring transaction definitions with advanced scheduling.
    *   `userId`: (ID referencing `users`) The user who owns this recurring transaction.
    *   `description`: (String) Description of the transaction.
    *   `amount`: (Float64) The transaction amount.
    *   `categoryId`: (ID referencing `categories`) The category of the transaction.
    *   `paymentTypeId`: (Optional ID referencing `paymentTypes`) The payment method used.
    *   `transactionType`: (String) "expense" or "income".
    *   `frequency`: (String) "daily", "weekly", "monthly", "semestrally", or "yearly".
    *   `startDate`: (Float64) When the recurring transaction starts.
    *   `endDate`: (Optional Float64) When the recurring transaction ends.
    *   `lastProcessedDate`: (Optional Float64) When the recurring transaction was last processed.
    *   `nextDueDateCalculationDay`: (Optional Float64) Day of the month for monthly/yearly transactions.
    *   `nextDueDate`: (Optional Float64) Next due date for processing.
    *   `isActive`: (Boolean) Whether the recurring transaction is currently active.
    *   `softdelete`: (Optional Boolean) Flag for soft deletion.
    *   `cuotas`: (Optional Float64) Number of installments for each generated transaction.
    *   *Indexes*: `by_user_isActive_startDate`, `by_isActive_lastProcessedDate`, `by_isActive_nextDueDate`, `by_user_isActive_nextDueDate`, `by_user_softdelete`, `by_user_isActive_softdelete`, `by_user_isActive_startDate_softdelete`.

*   **`paymentSchedules`**: Stores generated installment schedules for expenses.
    *   `userId`: (ID referencing `users`)
    *   `expenseId`: (ID referencing `expenses`)
    *   `paymentTypeId`: (ID referencing `paymentTypes`)
    *   `amount`: (Float64) Amount per installment
    *   `dueDate`: (Float64) Due date timestamp
    *   `installmentNumber`: (Float64) 1-based index of the installment
    *   `totalInstallments`: (Float64) Total installments
    *   `softdelete`: (Optional Boolean) Flag for soft deletion
    *   *Indexes*: `by_user_dueDate`, `by_expenseId`, `by_user_dueDate_softdelete`, `by_user_softdelete_dueDate`

## Backend Functions (Convex)

### Authentication (`convex/auth.ts`)
*   **`createUser` (mutation)**: Creates a new user or updates an existing one based on `auth0Id` or `email`. Initializes default categories (expense & income) and payment types for new users.
*   **`loggedInUser` (query)**: Retrieves details for the currently authenticated user.

### Expenses & Transactions (`convex/expenses.ts`)
*   **`addExpense` (mutation)**: Adds a new expense or income transaction with automatic payment schedule generation.
*   **`listAllTransactions` (query)**: Lists all (non-soft-deleted) transactions for the current user.
*   **`listExpenses` (query)**: Lists all (non-soft-deleted) expense transactions for the current user.
*   **`listIncome` (query)**: Lists all (non-soft-deleted) income transactions for the current user.
*   **`deleteExpense` (mutation)**: Soft-deletes a transaction and its associated payment schedules.
*   **`updateExpense` (mutation)**: Updates an existing transaction, marks it as verified, and regenerates payment schedules if needed.
*   **`verifyExpense` (mutation)**: Marks a transaction as verified without making other changes.
*   **`getLastTransaction` (query)**: Retrieves the most recent transaction for the user.
*   **`getCategories` (query)**: Retrieves category names for the user (or default if none).
*   **`getCategoriesWithIds` (query)**: Retrieves categories (name, ID, type) for the user, excluding soft-deleted.
*   **`getCategoriesWithIdsIncludingDeleted` (query)**: Retrieves all categories for the user, including soft-deleted.
*   **`updateCategories` (mutation)**: Updates the user's list of categories (adds new, soft-deletes missing ones).
*   **`getPaymentTypes` (query)**: Retrieves payment types for the user.
*   **`addPaymentType` (mutation)**: Adds a new payment type for the user with credit card support.
*   **`removePaymentType` (mutation)**: Soft-deletes a payment type.
*   **`updatePaymentTypes` (mutation)**: Updates the user's list of payment types (adds new, soft-deletes missing ones).
*   **`getHistoricPaymentTypes` (query)**: Retrieves all payment types including soft-deleted ones.
*   **`migratePaymentSchedules` (mutation)**: Migration function to generate payment schedules for existing expenses.

### Recurring Transactions (`convex/recurring.ts`)
*   **`addRecurringTransaction` (mutation)**: Creates a new recurring transaction with backfill for past dates.
*   **`updateRecurringTransaction` (mutation)**: Updates an existing recurring transaction and recalculates next due date.
*   **`deleteRecurringTransaction` (mutation)**: Soft-deletes a recurring transaction.
*   **`toggleRecurringTransactionStatus` (mutation)**: Activates or deactivates a recurring transaction.
*   **`listRecurringTransactions` (query)**: Lists all active recurring transactions for the current user.
*   **`getRecurringTransactionsToProcess` (query)**: Gets recurring transactions that need to be processed (used by cron jobs).
*   **`generateTransactionFromRecurring` (mutation)**: Generates a transaction from a recurring transaction with idempotency checks.

### Projections (`convex/projections.ts`)
*   **`getProjectedPayments` (query)**: Returns forward-looking items combining installment schedules and recurring transactions within a 4-month horizon for the authenticated user. Optimized for performance with batch processing.

### Transfers (`convex/ledger/transfers.ts`)
*   **`addTransfer` (mutation)**: Creates account-to-account transfers with cross-currency support and automatic exchange rate handling.
*   **`updateTransfer` (mutation)**: Updates transfer description (amounts are immutable for accounting integrity).
*   **`deleteTransfer` (mutation)**: Soft-deletes a transfer with proper audit trail.
*   **`listTransfers` (query)**: Lists transfers for authenticated user with optional filters (account, date range, amount).
*   **`getTransferDetails` (query)**: Retrieves detailed information about a specific transfer including exchange rates.

### Budgets (`convex/ledger/budgets.ts`)
*   **`createBudget` (mutation)**: Creates a new budget with comprehensive validation for scope configuration, account ownership, and amount.
*   **`updateBudget` (mutation)**: Updates existing budget amount, frequency, or end date (scope configuration is immutable).
*   **`deleteBudget` (mutation)**: Soft-deletes a budget while preserving historical data.

### Budget Execution (`convex/ledger/budgetExecution.ts`)
*   **`getBudgetExecution` (query)**: Calculates real-time budget execution by aggregating journal_lines for accounts in budget scope within current period.
*   **`listBudgets` (query)**: Lists all budgets for authenticated user with current execution status and human-readable scope descriptions.

### Budget Utilities (`convex/ledger/budgetUtils.ts`)
*   **`calculatePeriodBoundaries`**: Calculates period start and end timestamps for all supported frequencies (daily through yearly) aligned to calendar boundaries in UTC.
*   **`calculateNextDueDate`**: Determines next period start date for budget rollover calculations.

### Budget Historical Tracking (`convex/ledger/budgetHistory.ts`)
*   **`getBudgetHistory` (query)**: Retrieves historical budget execution records for a budget with pagination and date filtering.
*   **`getBudgetHistoryWithCurrent` (query)**: Historical data plus current period execution (real-time calculation).
*   **`backfillBudgetHistory` (mutation)**: Manually backfill missing historical budget lines for specific periods.

### Pre-Aggregation System (`convex/ledger/rollups.ts`)
*   **`upsertMonthlyRollup` (internal mutation)**: Create or update monthly rollup record with idempotency guarantees.
*   **`calculateMonthlyRollup` (internal query)**: Calculate monthly rollup data for an account from journal_lines.
*   **`reconcileMonthlyRollups` (internal action)**: Background job that reconciles all monthly rollups to ensure consistency.
*   **`updateRollupsOnTransaction` (internal mutation)**: Update rollups when transactions are created/modified (best-effort synchronous updates).

### Monthly Summary (`convex/ledger/monthlySummary.ts`)
*   **`getMonthlySummary` (query)**: Retrieve monthly financial summary using rollup data with fallback to direct calculation.

### Internal Functions (`convex/internal/`)
*   **`generatePaymentSchedules` (internal mutation)**: Consolidated function for generating installment payment schedules.
*   **`deletePaymentSchedulesForExpense` (internal mutation)**: Removes payment schedules for a specific expense.
*   **`processRecurringTransactions` (internal action)**: Processes recurring transactions that are due (called by cron jobs).

### Automated Processing (`convex/crons.ts`)
*   **Daily Cron Job**: Processes recurring transactions at midnight every day.
*   **Budget Period Rollover**: Automated background job capturing budget execution at period boundaries.
*   **Rollup Reconciliation**: Daily cron job running at 02:00 UTC to reconcile monthly rollups and ensure consistency.

### Ledger System (`convex/ledger/`)
*   **`dualWriteUtils.ts`**: Utilities for dual-write operations to ledger system.
*   **`dualWriteConfig.ts`**: Feature flag for enabling/disabling dual-write (LEDGER_DUAL_WRITE_ENABLED).
*   **`errorTracking.ts`**: Structured error logging for dual-write failures with monitoring integration support.
*   **`accounts.ts`**: Account management utilities for chart of accounts.
*   **`fx.ts`**: Foreign exchange rate utilities for multi-currency support.

### Migrations (`convex/migrations/`)
*   **Phase 1 - Foundation:**
    *   `accountSeeding.ts`: Creates accounts from legacy categories and payment types.
    *   `backfillIsCredit.ts`: Backfills isCredit flag for payment types.
*   **Phase 2 - Historical Data Migration:**
    *   `transactionBackfill.ts`: Migrates historical expenses to journal entries.
    *   `installmentBackfill.ts`: Migrates payment schedules to journal entries.
    *   `recurringToLedger.ts`: Migrates recurring templates to ledger format.
    *   `bulkPhase2Migration.ts`: Orchestrates bulk migration for all users.
    *   `phase2Runner.ts`: Migration execution runner.
*   **Verification & Diagnostics:**
    *   `preflightCheck.ts`: Pre-migration data quality validation.
    *   `verify.ts`: Post-migration integrity verification (zero-sum, idempotency, etc.).
*   **Utilities:**
    *   `backfillPaymentTypeMappings.ts`: Repairs orphaned payment types.
    *   `utils.ts`: Common migration utilities.
    *   `resetProgress.ts`: Resets migration state.
    *   `rollback.ts`: Migration rollback procedures.
*   **Legacy Migrations:**
    *   `category.ts`: Migrates categories to include transaction type.
    *   `recurring.ts`: Backfills nextDueDate for recurring transactions.
    *   `recurringCurrencyBackfill.ts`: Adds currency support to recurring transactions.

### Diagnostics (`convex/diagnostics.ts`)
*   **`diagnoseRecurringTemplate`**: Health check for single recurring template.
*   **`scanUserRecurringTemplates`**: Batch health scan for all user templates.
*   **`repairRecurringTemplate`**: Repairs single broken template.
*   **`repairAllUserTemplates`**: Batch repair with dry-run support.

## Frontend (React with TypeScript)

### Core Application Structure:
*   **`App.tsx`**: Main application component managing authentication, routing, and navigation with drawer-based transaction forms.
*   **`SignInForm.tsx`**: Auth0-integrated sign-in component with Google OAuth support.
*   **`SignOutButton.tsx`**: Component for user sign-out functionality.

### Main Pages:
*   **`HomePage.tsx`**: Dashboard featuring doughnut charts for monthly expenses and combined bar/line charts for income vs expenses over time.
*   **`AddExpensePage.tsx`**: Drawer-based form for adding new expense transactions with category and payment type selection.
*   **`AddIncomePage.tsx`**: Drawer-based form for adding new income entries.
*   **`ManageTransactionsPage.tsx`**: Comprehensive transaction management with verification workflow, filtering, and recurring transaction sections.
*   **`ConfigPage.tsx`**: Settings page managing categories, payment types, and user preferences with nested navigation.
*   **`ProjectionPage.tsx`**: Financial projections view combining installment schedules and recurring transactions.
*   **`TransactionsNavigationPage.tsx`**: Navigation hub providing access to transaction management and recurring transaction features.

### Recurring Transactions Components:
*   **`RecurringTransactionList.tsx`**: Displays and manages recurring transactions with status toggles.
*   **`RecurringTransactionForm.tsx`**: Comprehensive form for creating and editing recurring transactions with frequency selection and date calculations.

### UI Components:
*   **shadcn/ui Components**: Comprehensive set of reusable UI components including buttons, forms, dialogs, charts, and navigation elements.
*   **Chart Components**: Custom chart implementations using Chart.js for doughnut charts and combined bar/line visualizations.
*   **Form Components**: Specialized components for category and payment type management with create/edit capabilities.

### Navigation & User Experience:
*   **Bottom Navigation**: 4-tab navigation (Home, Projections, Transactions, Settings) with central "+" button for quick transaction entry.
*   **Drawer-based Forms**: Transaction entry forms slide up from bottom for mobile-optimized experience.
*   **Theme Support**: Dark/light mode support through ThemeContext.
*   **Real-time Updates**: Live data synchronization with Convex backend.

## Testing & Quality Assurance

### Testing Strategy:
*   **E2E Testing**: Playwright tests for critical user flows including transaction management and UI interactions.
*   **Unit Testing**: Vitest tests for core business logic, particularly scheduling and payment calculations.
*   **Visual Regression**: Screenshot-based testing for UI consistency.

### Current Test Coverage:
*   **Scheduling Logic**: Comprehensive unit tests for payment scheduling, date calculations, and installment splitting.
*   **Budget Historical Tracking**: Unit tests for period boundary calculations, next due date calculations, and period range generation.
*   **UI Components**: E2E tests for accordion interactions and transaction list functionality.
*   **Critical Flows**: Basic coverage for core transaction management workflows.

## Recent Updates & Current State

### Phase 4.3: Budget Historical Tracking Implementation (✅ COMPLETED - January 15, 2025)

The application now includes comprehensive budget historical tracking with automated period rollover and cron job processing. This system captures budget execution snapshots at period boundaries, enabling trend analysis and historical reporting.

**Budget Historical Tracking Features:**
- **Automated Period Rollover**: Background cron job captures budget execution at period boundaries
- **Historical Data Storage**: Budget_lines table populated with execution snapshots for trend analysis
- **Time-Series Queries**: Historical query endpoints showing budget performance over time
- **Period Boundary Calculations**: Comprehensive support for all six budget frequencies with UTC alignment
- **Graceful Handling**: Proper handling of budget modifications and period transitions
- **Backfill Utilities**: Manual backfill capabilities for missing historical data
- **Performance Optimized**: Efficient pagination and date filtering for large historical datasets

**Technical Implementation:**
- Budget_lines table populated with historical execution records
- Automated cron job processing budget period rollovers
- Comprehensive period boundary calculation utilities
- Historical query functions with pagination support
- Backfill mutation for missing historical data
- Complete unit test coverage for period calculations

### Phase 4.2: Budget System Implementation (✅ COMPLETED & DEPLOYED TO PRODUCTION - October 12, 2025)

The application now includes a comprehensive flexible budget system built on the ledger infrastructure and successfully deployed to production. This system provides real-time budget tracking with three flexible scope types and automatic execution calculation from journal entries.

**Budget System Features:**
- **Three Scope Types**:
  - `singleAccount`: Budget for one specific account
  - `multipleAccounts`: Budget for selected accounts (must be same type: expense or income)
  - `accountType`: Budget for all accounts of a type (expense or income)
- **Frequency-Based Periods**: Daily, weekly, monthly, quarterly, semestrally, yearly with calendar-aligned boundaries
- **Real-Time Execution Calculation**: Aggregates journal_lines within current period to calculate spent/remaining amounts
- **UTC Time Standards**: All period calculations performed in UTC with ISO 8601 week boundaries (Monday start)
- **Performance Optimized**: Parallel queries for multiple accounts, indexed for efficient period lookups
- **Comprehensive Validation**: Account ownership, account type eligibility (expense/income only), cross-account type validation
- **Soft-Delete Support**: Budget deletion preserves historical data, gracefully handles deleted accounts
- **Status Tracking**: Under budget, at budget (95-105%), over budget (>105%)
- **Account Breakdown**: Per-account spending breakdown for multi-account budgets
- **Budget Utilities**: Reusable period calculation functions for all supported frequencies

**Production Deployment Results:**
- 1,004 lines of production-grade code deployed
- 5 public API functions available and operational
- 41/41 unit tests passing (100% coverage)
- Schema deployed with 4 new indexes
- Zero linting/TypeScript errors
- Production smoke tests passed
- No critical errors in monitoring
- All PRD acceptance criteria met

**Architectural Decisions:**
- Budget execution calculated from journal_lines (source of truth) rather than pre-aggregated data
- No carryover between budget periods (resets each period)
- Scope configuration is immutable after creation (must delete and recreate to change scope)
- Week boundaries follow ISO 8601 standard (Monday = week start)
- Quarter boundaries: Q1 (Jan-Mar), Q2 (Apr-Jun), Q3 (Jul-Sep), Q4 (Oct-Dec)
- Semester boundaries: H1 (Jan-Jun), H2 (Jul-Dec)
- Budget amounts stored in minor units (base currency) for precision
- Budget_lines schema prepared for Phase 4.3 historical tracking with budgetAmount snapshot field

### Phase 4.1: Transfer Implementation (✅ COMPLETED - October 11, 2025)

The application includes a complete account-to-account transfer system built exclusively on the ledger infrastructure. This is the first major feature leveraging the double-entry foundation established in Phases 1-3.

**Transfer System Features:**
- Account-to-account transfers with proper double-entry recording (debit source, credit destination)
- Cross-currency transfer support with user-provided or market exchange rates
- Comprehensive validation (amount, accounts, exchange rates, user authorization)
- Transfer history queries with filtering by account, date range, and amount
- Soft-delete capability with complete audit trail
- Zero-sum invariant maintenance with automatic residual balancing
- Performance optimized (< 200ms creation time, < 100ms queries)
- Complete test coverage (>90%) for all transfer logic

### Phase 1-3: Double-Entry Accounting Ledger System (✅ COMPLETED - January 8, 2025)

The application features a complete double-entry bookkeeping system with dual-write synchronization between legacy and ledger tables. Successfully deployed to production with 100% migration success rate.

**Production Deployment Results:**
- 7/7 users migrated successfully (100%)
- 353 journal entries created from historical data
- 706 journal lines (double-entry) with zero-sum validation
- 154 accounts created in chart of accounts
- 15 recurring templates migrated to ledger format
- Zero errors, zero failures, zero data loss

**Accounting System Features:**

1. **Phase 1 - Foundation:**
   - Complete chart of accounts with 154 accounts created
   - Account types: asset, liability, income, expense
   - Automatic account creation for categories and payment types
   - Category-to-account and payment-type-to-account mappings
   - Credit card accounts tracked as liabilities with billing cycle metadata

2. **Phase 2 - Historical Data Migration:**
   - Automated migration of all historical expenses to journal entries
   - Installment payment schedules converted to planned journal entries
   - Recurring transaction templates migrated to ledger format
   - Pre-flight data quality checks before migration
   - Post-migration integrity verification (zero-sum, idempotency, referential integrity)
   - 100% migration success with comprehensive error handling

3. **Phase 3 - Dual-Write Implementation:**
   - Real-time synchronization between legacy and ledger systems
   - All financial operations write to both systems simultaneously
   - Feature flag control (LEDGER_DUAL_WRITE_ENABLED) for rollback capability
   - Graceful degradation: legacy continues working if ledger fails
   - Complete audit trail with createdBy/updatedBy tracking
   - Idempotency protection preventing duplicate entries
   - Structured error logging ready for monitoring integration

4. **Double-Entry Bookkeeping:**
   - Every transaction creates balanced journal entries (debits = credits)
   - Zero-sum validation ensures accounting equation balance
   - Proper debit/credit logic for income vs expense transactions
   - Credit card purchases tracked as liabilities
   - Multi-currency support foundation (currently ARS only)

5. **Technical Excellence:**
   - Type-safe audit fields using Id<"users"> references
   - Comprehensive diagnostic tools for template health checks
   - Automated repair utilities for orphaned data
   - Migration rollback procedures with snapshot support
   - Performance optimized with efficient indexing
   - Complete test coverage for critical paths

### Current Implementation Status:

**✅ Completed Features (Phases 1-4.4):**
- ✅ Double-entry accounting ledger system with production deployment
- ✅ Complete dual-write synchronization (legacy ↔ ledger)
- ✅ Historical data migration (100% success rate)
- ✅ Chart of accounts with automatic creation
- ✅ Journal entries with zero-sum validation
- ✅ **Account-to-account transfers with cross-currency support (Phase 4.1)**
- ✅ **Flexible budget system with three scope types and real-time execution (Phase 4.2)**
- ✅ **Budget historical tracking with automated period rollover (Phase 4.3)**
- ✅ **Pre-aggregation system with monthly rollups and performance optimization (Phase 4.4)**
- ✅ Core transaction management (expenses/income)
- ✅ Recurring transaction automation with ledger integration
- ✅ Installment payment scheduling
- ✅ Category and payment type management with ledger accounts
- ✅ Financial projections
- ✅ Verification workflow
- ✅ Credit card payment type support as liabilities
- ✅ Comprehensive migration and diagnostic tools
- ✅ Structured error tracking and monitoring foundation
- ✅ Complete audit trail with user tracking

**🔄 In Progress (Phase 4.5):**
- 🔄 Phase 4.5: UI Integration (IN PLANNING)
  - Budget management UI components
  - Budget execution display in Home dashboard
  - Transfer creation and history UI
  - Home dashboard optimization with rollups

**📋 Planned (Phase 5+):**
- **Phase 5**: Card settlement and credit card statement reconciliation
- **Phase 6**: UI migration to ledger data (complete read path from journal entries)
- **Phase 7**: Legacy table deprecation and cleanup
- **Phase 8**: Multi-currency support enhancements and FX handling
- **Future**: Advanced features (savings goals, investment tracking, debt prioritization, financial insights)

### Production Status

**Environment:** Production (graceful-spaniel-507.convex.cloud)  
**Deployment Date:** January 8, 2025  
**Status:** ✅ Live and Healthy  
**Dual-Write:** Active  
**Monitoring:** 24/7 health checks

**Key Metrics:**
- Migration success rate: 100%
- Zero-sum compliance: 100%
- Data integrity: Perfect
- Error rate: 0%

### Next Steps

**Current Focus: Phase 4.5 UI Integration**

The pre-aggregation system backend implementation is complete and deployed to production. Next immediate steps:

1. **UI Integration** (Phase 4.5):
   - **Budget Management UI**:
     - Budget creation form with scope type selector
     - Budget list view with current execution status
     - Budget detail/edit view with historical tracking
     - Budget deletion with confirmation
   - **Transfer UI**:
     - Transfer creation form with account selection and currency conversion
     - Transfer history list with filtering
     - Transfer detail view
   - **Home Dashboard Optimization**:
     - Integrate budget execution cards showing progress bars
     - Display top spending categories using rollups
     - Show monthly trends with pre-aggregated data
     - Optimize queries with indexed rollup lookups

4. **Testing & Documentation**:
   - Unit tests for budget historical tracking logic
   - Integration tests for cron job processing
   - E2E tests for budget UI flows
   - Update API documentation

**Future Phases:**
- **Phase 5**: Card settlement and credit card statement reconciliation
- **Phase 6**: UI migration to ledger data (complete read path from journal entries)
- **Phase 7**: Legacy table deprecation and cleanup
- **Phase 8**: Multi-currency support enhancements and FX handling
- **Future**: Advanced features (savings goals, investment tracking, debt prioritization, financial insights)

## Development Process & Quality Assurance

### Enhanced Audit Process
The project has implemented a comprehensive audit-driven development process that ensures quality consistency and prevents production failures:

**Audit Framework:**
- **Comprehensive Quality Assessment**: Functional requirements audit, non-functional requirements compliance, and strategic process evaluation
- **Quality Gate Standardization**: Consistent P0/P1/P2/P3 prioritization with clear escalation criteria
- **Testing Discipline**: Mandatory unit test coverage >85%, integration tests, and performance benchmarks
- **Platform Expertise Integration**: Convex constraint awareness and platform-specific research requirements
- **Scope Management Discipline**: Systematic phase splitting to prevent complexity explosion

**Process Maturity:**
- **Pre-Implementation Checklist**: Schema verification, platform constraints research, function reference discipline
- **Testing Standards**: Comprehensive test coverage requirements with regression prevention
- **Documentation Quality**: Comprehensive JSDoc and implementation documentation standards
- **Error Handling**: Structured error logging with monitoring integration support

### Workflow Improvements
Based on comprehensive audit analysis across Phase 4 development journey:

**Key Process Enhancements:**
- **Scope Management**: Default to phase splitting unless tight technical coupling exists
- **Platform Expertise**: Dedicated Convex constraint research before implementation
- **Quality Gates**: Standardized prioritization and escalation procedures
- **Testing Discipline**: Consistent coverage requirements across all phases
- **Process Improvement**: Audit-driven learning and continuous workflow enhancement

**Reference Documentation:**
- `planning/accounting.md`: Complete accounting system roadmap
- `planning/accountingSteps/Phase4.1-TransferImplementation.md`: Transfer system specifications
- `planning/accountingSteps/Phase4.2-BudgetSystem.md`: Budget system specifications
- `planning/accountingSteps/Phase4.3-BudgetHistoricalTracking.md`: Budget historical tracking specifications
- `planning/accountingSteps/Phase4.4-PreAggregationSystem.md`: Pre-aggregation system specifications
- `planning/accountingSteps/audits/`: Comprehensive audit reports and process improvements
- `PRODUCTION-DEPLOYMENT-PHASE-4.2.md`: Phase 4.2 production deployment report
- `docs/PHASE-4.2-TEST-REPORT.md`: Budget system test results
- `docs/`: Implementation documentation and test reports