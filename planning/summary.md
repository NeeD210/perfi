# Project Summary

This document provides an overview of the PerFi (Personal Finance) application, detailing its current state, database schema, backend functionalities, and frontend structure.

## Current Project Status

**PerFi** is a comprehensive personal finance tracking application built with modern technologies. The project has successfully completed **Phase 1-4.2 of the Accounting Ledger System** implementation. The application features a complete double-entry bookkeeping system with dual-write synchronization between legacy and ledger tables (production deployment: January 8, 2025), includes a complete account-to-account transfer system with cross-currency support (completed: October 11, 2025), and now has a comprehensive flexible budget system with real-time execution tracking (completed: October 12, 2025). Current focus: Phase 4.3-4.4 Pre-Aggregation System & UI Integration.

### Key Achievements
- ✅ Complete double-entry accounting ledger system (Phase 1-3)
- ✅ Production deployment with 100% migration success (353 journal entries, 0 errors)
- ✅ Dual-write synchronization across all financial operations
- ✅ **Account-to-account transfer system with cross-currency support (Phase 4.1)**
- ✅ **Flexible budget system with three scope types and real-time execution tracking (Phase 4.2)**
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

*   **`budget_lines`**: Historical budget execution records (Phase 4.2).
    *   `budgetId`: (ID referencing `budgets`) Parent budget.
    *   `periodStart`: (Number) Period start timestamp.
    *   `periodEnd`: (Number) Period end timestamp.
    *   `spentAmount`: (Number) Amount spent/earned in period.
    *   `remainingAmount`: (Number) Amount remaining in period.
    *   `percentUsed`: (Number) Percentage of budget used.
    *   `status`: (String) "under_budget", "at_budget", or "over_budget".
    *   `createdAt`: (Number) Record creation timestamp.
    *   *Index*: `by_budgetId_periodStart` on `budgetId` and `periodStart`.

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

### Internal Functions (`convex/internal/`)
*   **`generatePaymentSchedules` (internal mutation)**: Consolidated function for generating installment payment schedules.
*   **`deletePaymentSchedulesForExpense` (internal mutation)**: Removes payment schedules for a specific expense.
*   **`processRecurringTransactions` (internal action)**: Processes recurring transactions that are due (called by cron jobs).

### Automated Processing (`convex/crons.ts`)
*   **Daily Cron Job**: Processes recurring transactions at midnight every day.

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
*   **UI Components**: E2E tests for accordion interactions and transaction list functionality.
*   **Critical Flows**: Basic coverage for core transaction management workflows.

## Recent Updates & Current State

### Phase 4.2: Budget System Implementation (✅ COMPLETED - October 12, 2025)

The application now includes a comprehensive flexible budget system built on the ledger infrastructure. This system provides real-time budget tracking with three flexible scope types and automatic execution calculation from journal entries.

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

**Architectural Decisions:**
- Budget execution calculated from journal_lines (source of truth) rather than pre-aggregated data
- No carryover between budget periods (resets each period)
- Scope configuration is immutable after creation (must delete and recreate to change scope)
- Week boundaries follow ISO 8601 standard (Monday = week start)
- Quarter boundaries: Q1 (Jan-Mar), Q2 (Apr-Jun), Q3 (Jul-Sep), Q4 (Oct-Dec)
- Semester boundaries: H1 (Jan-Jun), H2 (Jul-Dec)
- Budget amounts stored in minor units (base currency) for precision

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

**✅ Completed Features (Phases 1-4.2):**
- ✅ Double-entry accounting ledger system with production deployment
- ✅ Complete dual-write synchronization (legacy ↔ ledger)
- ✅ Historical data migration (100% success rate)
- ✅ Chart of accounts with automatic creation
- ✅ Journal entries with zero-sum validation
- ✅ **Account-to-account transfers with cross-currency support (Phase 4.1)**
- ✅ **Flexible budget system with three scope types and real-time execution (Phase 4.2)**
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

**🔄 In Progress (Phase 4.3-4.4):**
- 🔄 Phase 4.3: Pre-Aggregation System (IN PLANNING)
  - Monthly rollups table for performance optimization
  - Background job for rollup reconciliation
  - Best-effort synchronous updates on transactions
  - Home dashboard integration using pre-aggregated data
- 🔄 Phase 4.4: UI Integration (IN PLANNING)
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

**Current Focus: Phase 4.3-4.4 (Pre-Aggregation & UI Integration)**

The budget system backend implementation is complete. Next immediate steps:

1. **Pre-Aggregation System** (Phase 4.3):
   - Design and implement `monthly_rollups` table for performance optimization
   - Create background cron job for rollup reconciliation and correction
   - Implement best-effort synchronous rollup updates on transaction mutations
   - Build query functions for Home dashboard using pre-aggregated data
   - Add rollup metrics and monitoring

2. **UI Integration** (Phase 4.4):
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

3. **Testing & Documentation**:
   - Unit tests for rollup calculation logic
   - Integration tests for budget UI flows
   - E2E tests for transfer creation
   - Update API documentation

**Future Phases:**
- **Phase 5**: Card settlement and credit card statement reconciliation
- **Phase 6**: UI migration to ledger data (complete read path from journal entries)
- **Phase 7**: Legacy table deprecation and cleanup
- **Phase 8**: Multi-currency support enhancements and FX handling
- **Future**: Advanced features (savings goals, investment tracking, debt prioritization, financial insights)

**Reference Documentation:**
- `planning/accounting.md`: Complete accounting system roadmap
- `planning/accountingSteps/Phase4.1-TransferImplementation.md`: Transfer system specifications
- `planning/accountingSteps/Phase4.2-BudgetSystem.md`: Budget system specifications
- `docs/PHASE-4.2-TEST-REPORT.md`: Budget system test results
- `docs/`: Implementation documentation and test reports