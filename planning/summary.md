# Project Summary

This document provides an overview of the PerFi (Personal Finance) application, detailing its current state, database schema, backend functionalities, and frontend structure.

## Current Project Status

**PerFi** is a comprehensive personal finance tracking application built with modern technologies. The project is currently in **Phase 2** of its implementation roadmap, with core transaction management and recurring transaction features fully implemented. The application provides a solid foundation for expense tracking, income management, and financial projections.

### Key Achievements
- ✅ Complete transaction management system (expenses/income)
- ✅ Recurring transaction automation with verification workflow
- ✅ Installment payment scheduling for credit cards
- ✅ Category and payment type management
- ✅ Financial projections combining recurring and installment payments
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

### Internal Functions (`convex/internal/`)
*   **`generatePaymentSchedules` (internal mutation)**: Consolidated function for generating installment payment schedules.
*   **`deletePaymentSchedulesForExpense` (internal mutation)**: Removes payment schedules for a specific expense.
*   **`processRecurringTransactions` (internal action)**: Processes recurring transactions that are due (called by cron jobs).

### Automated Processing (`convex/crons.ts`)
*   **Daily Cron Job**: Processes recurring transactions at midnight every day.

### Migrations (`convex/migrations/`)
*   **Category Migration**: Migrates existing categories to include transaction type.
*   **Recurring Migration**: Backfills nextDueDate for existing recurring transactions.
*   **Payment Schedule Migration**: Generates payment schedules for existing expenses.

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

### Phase 2: Recurring Transactions & Verification Workflow (✅ COMPLETED)

The application now supports comprehensive recurring transaction management with automated processing:

1. **Database Enhancements:**
   - Enhanced `recurringTransactions` table with advanced scheduling fields (`nextDueDate`, `nextDueDateCalculationDay`)
   - Enhanced `expenses` table with `verified` status and `recurringTransactionId` for tracking auto-generated transactions
   - Enhanced `paymentTypes` table with credit card support (`isCredit`, `closingDay`, `dueDay`)

2. **Advanced Backend Functionality:**
   - Full CRUD operations for recurring transactions with frequency support (daily, weekly, monthly, semestrally, yearly)
   - Automated transaction generation through daily cron jobs with idempotency checks
   - Backfill functionality for past recurring transaction dates
   - Verification workflow for reviewing auto-generated transactions
   - Advanced payment scheduling with credit card due date calculations

3. **Enhanced User Interface:**
   - Comprehensive "Recurring Transactions" management in Manage Transactions page
   - Advanced form for creating/editing recurring transactions with frequency and date settings
   - Visual indicators for unverified transactions and recurring transaction sources
   - Dedicated verification workflow with verify buttons for auto-generated transactions
   - Transaction filtering by verification status (All, Verified, Unverified)

4. **Technical Improvements:**
   - Daily automated processing of recurring transactions at midnight via cron jobs
   - Sophisticated date calculation logic with anchor day preservation
   - Integration with installment payment scheduling for recurring credit card payments
   - Optimized projection queries with batch processing for performance
   - Comprehensive migration system for data consistency

### Current Implementation Status:

**✅ Completed Features:**
- Core transaction management (expenses/income)
- Recurring transaction automation
- Installment payment scheduling
- Category and payment type management
- Financial projections
- Verification workflow
- Credit card payment type support
- Migration system for data consistency

**🔄 In Progress (Phase 3):**
- Home screen dashboard transformation
- Budget management system (planned)
- Enhanced navigation structure

**📋 Planned (Phases 4-7):**
- Comprehensive budget tracking
- Savings goals management
- Investment portfolio tracking
- Debt management
- Visual design improvements
- Performance optimizations

### Next Steps
Refer to `planning/implementation_roadmap.md` for the detailed phased implementation plan and `planning/perfi_revamp.md` for the UX/UI design vision. The project is ready to proceed with Phase 3: Home Screen Dashboard implementation.