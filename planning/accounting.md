# PerFi Accounting Core

This document contains all of the information about the upcoming migration of the app's logic towards an account-driven background and a more concise front end.

## UX/UI

The design philosophy for PerFi is centered on **Effortless Financial Clarity**. Our goal is to empower users in Argentina by transforming the potentially stressful task of financial management into a simple, insightful, and even motivating experience. We achieve this through three core principles:

1. **Glanceable Insights**: The app is designed to provide maximum value with minimum effort. The Home screen acts as a dynamic dashboard that tells the user their current financial story in seconds. Key metrics, upcoming bills, and budget progress are surfaced immediately, adhering to the principle of Visual Hierarchy so users can assess their standing and move on with their day.

2. **Frictionless Input**: The most common action—adding a transaction—is the most accessible. By placing a distinct + button at the center of the navigation, we make data entry a near-instantaneous muscle memory. The input screen itself is optimized for speed with smart defaults, a readily available number pad, and intelligent suggestions, embodying our commitment to Performance and User-Centricity.

3. **Progressive Disclosure**: We combat information overload by presenting a clean, simple interface that reveals complexity only when the user requests it. A user can operate entirely on the surface level (Home screen and quick-add) or dive deep into detailed Reports, transaction histories, and forward-looking Plans. This layered approach makes the app welcoming for beginners like Sofía while still providing the depth needed for power users.

The visual style—built on a foundation of calming blues, clear typography, and purposeful green accents—is intentionally designed to build trust and confidence. Every element, from the subtle animation on a saved transaction to the consistent iconography, works to create a cohesive and reliable financial companion.

---

## Detailed Screen Breakdown

Here is a comprehensive description of each primary and key secondary screen, including its components and all potential interactions.

### 1. Home Screen (Primary Tab)

This is the user's primary dashboard and the first thing they see upon opening the app.

- **Description**: A vertically scrolling screen composed of distinct informational cards. It provides a high-level, real-time summary of the user's financial health.

- **Components**:
  - **Top Navigation Bar**: Contains the app logo and a Settings Icon (⚙️) on the right.
  - **Main Balance Card**: A prominent card showing "Current Net Balance" and a total income vs expenses for the current month with a simple horizontal bar graph.
  - **Budgets Overview Card**: Shows progress bars for 3-4 key budgets, current levels and budget limits.
  - **Upcoming Bills Card**: Lists the next 2-3 upcoming payments (credit card due dates, recurring expenses) with the amount and date.
  - **Investment Snapshot Card (Future)**: A summary of the user's investment portfolio value and its daily/monthly performance.

- **Interactions**:
  - **Tap Settings Icon (⚙️)**: Navigates to the Settings Screen.
  - **Tap on main balance card**: Navigates to the Reports Tab, pre-filtered to the monthly spending breakdown.
  - **Tap Upcoming Bills Card**: For this section I think the best approach is a calendar showing future recurring payments, card statements, and loans. There should be a subsection for "expenses to confirm" so the user can mark whether they actually paid what appears on the card.
  - **Tap any Budget progress bar**: Navigates to the transactions sheet pre-filtered for that category, with an extra card above the transactions showing a chart of past spending in that category.
  - **Tap Savings/Investment Snapshot Card**: Navigates to the Plan Tab and deep-links to the "Investments" section. This view appears only if the user has savings configured. Tapping it opens a page showing the different investment portfolios with their main KPIs (USD value, % change, etc.). Tapping a portfolio shows the performance of its assets. This page should be similar to yahoo finance.
  - **Tap debt**: Tapping here opens a view similar to Savings. It will list each debt instrument (cards and other debts like loans). Tapping a debt shows its projection until payoff, the outstanding amount, and the interest rate. Ideally the user could prioritize which debt to pay down earlier from this page.

---

### 2. Transactions Screen (Primary Tab)

This screen is the complete, detailed log of every financial movement.

- **Description**: A reverse chronological list of all transactions. It's built for search, filtering, and editing.

- **Components**:
  - **Search Bar**: Allows users to find transactions by name (e.g., "Starbucks," "Edesur").
  - **Filter Button**: Opens options to filter the list by transaction type, account, date or amount.
  - **Transaction List**: Each item clearly displays the category icon, name, amount, payment method, and date. Income amounts are colored green.

- **Interactions**:
  - **Tap a Transaction**: Navigates to a Transaction Detail Screen showing all data associated with that entry (notes, installments, etc.) and provides an "Edit" option.
  - **Swipe Left on a Transaction**: Reveals quick actions: "Edit" and "Delete".
  - **Tap Filter Button**: Opens a modal sheet from the bottom allowing the user to filter by:
    - Type (Income, Expense)
    - Date Range
    - Category
    - Payment Method
  - **Pull Down to Refresh**: Updates the list with any new data.

---

### 3. Add Transaction Screen (Modal)

This is not a primary tab but is the primary action screen, accessed via the central + button.

- **Description**: A modal sheet that slides up from the bottom, designed for rapid data entry.

- **Components**:
  - **Tabs (Expense / Income)**: At the top, allowing the user to switch the transaction type.
  - **Amount Input**: A large, clear display for the amount with an active number pad below it.
  - **Selector Rows**: For "Category," "Payment Method," and "Date." These show the currently selected option.
  - **Optional Fields**: A "Description" text field and "Recurring Transaction".
  - **Add transaction Button**: A prominent primary call-to-action button.

- **Interactions**:
  - **Tap the "+" button**: A drawer slides up with the numeric keyboard open and ready to write the transaction amount. The transaction type, category and payment type are preset by the last one (it will later have a more sophisticated logic).
  - **Tap Category/Payment Method Row**: Opens a new screen or bottom sheet listing all available options, with "Frequently Used" at the top for quick selection.
  - **Toggle "Recurring Transaction"**: Opens a modal to set the Frequency (e.g., Monthly, Weekly).
  - **Tap "Add transaction"**: The modal slides down, a confirmation toast ("Transaction Saved!") appears briefly, and the data on the Home Screen and other relevant screens updates immediately with a brief animation highlighting the modification in the home screen indicators.

---

### 4. Plan Screen (Primary Tab)

This screen is dedicated to proactive, forward-looking financial management.

- **Description**: A sectioned screen for managing budgets, savings goals, investments, and debts.

- **Components**:
  - **Top Segmented Control**: Switches between four views: Budgets, Goals, Investments, and debts.
  - **Budgets View**: A list of all user-created budgets, each with a progress bar and text showing "Spent / Total" (e.g., "$12,500 / $15,000").
  - **Goals View**: A list of savings goals, displayed as cards with a progress bar and target amount.
  - **Investments View**: A summary of the portfolio with total value, performance graphs, and a list of all assets held.
  - **Debts view**: A summary of the debts by the interest rate, amount left, etc.
  - **"Create New" Floating Button**: Allows the user to create a new budget, goal, investment portfolio, or debt depending on the active view.

- **Interactions**:
  - **Tap "Create New"**: Initiates the user flow for setting up a new budget, goal, investment portfolio or debt.
  - **Tap an individual Budget or Goal**: Navigates to a Detail Screen for that item, showing its progress over time and a list of all transactions contributing to it.
  - **Tap an Investment Asset**: Navigates to a detail screen for that asset, showing purchase history and performance charts.
  - **Tap a debt**: Navigates to a detail screen with the projection of the debt with the current payment plan. It should allow the user to modify the amount paid to simulate the differences.

---

### 5. Settings Screen (Secondary)

This screen is the hub for all configuration and account management.

- **Description**: A simple, list-based screen for less-frequent but important actions. Accessed via the gear icon on the Home screen.

- **Components**: A list of menu items:
  - Profile
  - Accounts/Credit cards
  - Categories
  - Security (Set PIN / Face ID)
  - Notifications
  - Logout

- **Interactions**:
  - **Tap any list item**: Navigates to its dedicated sub-screen. For example, tapping "Payment Methods" leads to a screen where the user can add, edit, or delete their cards and accounts. Tapping "Categories" leads to a screen for managing their custom categories.

---

## Database Schema

### Conventions

- Use camelCase field names everywhere (e.g., `userId`, `parentEntryId`, `parentAccountId`).
- Soft delete fields are standardized as: `softdelete: boolean`, `deletedAt?: number` (epoch ms). Apply consistently to all soft-deletable tables.
- Prefer `userId` everywhere it is relevant to partition tenant data.
- Parent/child references use the `...Id` suffix and explicit FK targets. Example: `parentAccountId?: Id<'accounts'>`.
- Currency model and base resolution:
  - `journal_lines.currencyCode` (ISO) is the line currency for `amount`.
  - If conversion to base is needed, supply `exchangeRateId` (FK to `exchange_rates`) OR `exchangeRate` (user's actual rate).
  - `exchangeRate` takes precedence over `exchangeRateId` for calculations.
  - Base currency for a line is the account's `accounts.defaultCurrency` unless explicitly overridden in business logic.
- Traceability: every `journal_entries` row includes `sourceType` and `sourceId` to point to the originating domain object (e.g., `expense`, `installment`, `recurring`).
- Consistency for installments/linking: use `parentEntryId` and `linkType` (`accrual`, `settlement`, `installment`).
- Amounts and rounding:
  - Store monetary fields as integers in minor units per currency (no floats). For ARS use unit scale = pesos (no decimals). For USD/EUR use cents (scale = 2).
  - Amounts are signed. Enforce zero-sum on base currency across `journal_lines` within an entry.
  - Rounding policy: round half away from zero to the currency's minor unit when converting. Handle residuals by adding an automatic balancing line to a dedicated `fx_rounding` account when |residual| ≤ one minor unit.
- Currencies and FX: lines reference an `exchange_rates` record via `exchangeRateId` when conversion is needed, OR use `exchangeRate` for user's actual rate. Store both `rate` and optional `inverseRate` in `exchange_rates` to avoid float drift. User-provided rates take precedence for calculations but official rates are maintained for audit and comparison purposes.
 - Entry editability: entries are editable in all statuses. `posted` is not immutable; edits must maintain zero-sum and invariants. Prefer `voided` + compensating entries for auditability where appropriate.

### Tables and Fields

#### users
- `id` - PK
- `auth0Id`
- `email`
- `emailVerified`
- `lastLogin`
- `creationTime`

#### accounts
- `id` - PK
- `userId` - FK
- `description`
- `creationTime`
- `softdelete`
- `deletedAt`
- `accountType` (enum: `expense`, `income`, `asset`, `liability`, `equity`)
- `parentAccountId?` - FK → `accounts`
- `defaultCurrency?` - optional default currency code used when a line omits FX/currency

Note: Card- and debt-specific attributes moved to specialized tables keyed by `accountId` to avoid null-heavy rows.

#### exchange_rates
- `id` - PK
- `pairCurrency` (e.g., `USD/ARS`)
- `rate` (base→quote)
- `inverseRate?` (quote→base)
- `date` (effective date; UTC day boundary policy)
- `source` (provider id)

Constraints:
- Unique on (`pairCurrency`, `date`, `source`).
- Define timezone/rounding policy: store rates as decimals scaled to integers where possible; round monetary base amounts to cents after aggregation.

#### budgets
- `id` - PK
- `userId` - FKcarryover 
- `accountId` - FK → `accounts` (scope by account)
- `amount`
- `frequency` (enum: `daily`, `weekly`, `monthly`, `quarterly`, `semestrally`, `yearly`)
- `nextDueDate`
- `endDate` (one-shot budgets/goals)
- `creationTime`
- `softdelete`
- `deletedAt`
 - `scopeType` (enum: `singleAccount`, `multipleAccounts`, `accountType`)
 - `scopeRefs?` (array of `accountId` when `multipleAccounts`)
 - Carryover: none (no carryover across periods)

#### budget_lines
- `id` – PK
- `budgetId` – FK → `budgets`
- `userId` – FK
- `accountId` – FK → `accounts`
- `amount`
- `startDate`
- `endDate`
- `softdelete`
- `deletedAt`

#### recurring_entries
- `id` - PK
- `userId` - FK
- `description`
- `frequency`
- `creationTime`
- `endDate`
- `status` (active, paused)
- `nextDueDate`
- `softdelete`
- `deletedAt`

#### recurring_lines
- `id` - PK
- `recurringId` - FK → `recurring_entries`
- `userId` - FK
- `accountId` - FK → `accounts`
- `direction` (enum: `debit`, `credit`)
- `exchangeRateId?` - FK → `exchange_rates`
- `amount`
- `softdelete`
- `deletedAt`

#### journal_entries
- `id` - PK
- `userId` – FK
- `parentEntryId?` - FK → `journal_entries`
- `date` (effective date)
- `updateTime`
- `softdelete`
- `deletedAt`
- `description`
- `status` (enum: `planned`, `posted`, `voided`)
- `sourceType` (enum: `expense`, `income`, `transfer`, `installment`, `recurring`, `statement`, `other`)
- `sourceId?` (opaque origin id; pairs with `sourceType`)
- `idempotencyKey?` (ensures backfills/dual-writes are idempotent)
- `linkType?` (enum: `accrual`, `settlement`, `installment`)
 - `installmentNumber?` (1-based, when `linkType = 'installment'`)
 - `totalInstallments?` (when `linkType = 'installment'`)
 - `createdBy` (FK → `users` or auth subject)
 - `updatedBy?` (FK → `users` or auth subject)

#### journal_lines
- `id` - PK
- `journalEntryId` - FK → `journal_entries`
- `userId` - FK
- `accountId` - FK → `accounts`
 - `direction` (enum: `debit`, `credit`)
 - `currencyCode` (ISO 4217; line currency)
 - `exchangeRateId?` - FK → `exchange_rates` (official market rate reference)
 - `exchangeRate?` - actual rate user received (takes precedence)
 - `amount` (signed integer in minor units of `currencyCode`)
 - `amountBaseCurrency` (signed integer in base currency minor units)
 - `entryDate` (denormalized from `journal_entries.date` for indexing)
 - `installmentNumber?` (1-based, when the parent entry is an installment)
 - `totalInstallments?`

---

### Specialized Tables (Cards and Debts)

#### cards
- `accountId` - PK & FK → `accounts`
- `userId` - FK
- `closingDay` (1–31)
- `dueDate` (1–31)
- `softdelete`
- `deletedAt`
Notes:
- Statement calculation and due logic follow current implementation (see `planning/summary.md`). For UX, estimates may use current FX; settlement postings use the settlement-date rate.

#### debts
- `accountId` - PK & FK → `accounts`
- `userId` - FK
- `interestRate?`
- `softdelete`
- `deletedAt`
Notes:
- No automated amortization schedule is posted. `interestRate` is advisory to prioritize debts.

## General Explanation of the Database

This database aims to model a ledger. In this way, we will be able to follow the rules and methods used in accounting to record the movements users make in their personal finances. This will create a much firmer and more flexible foundation when adding new features later on.

The accounts table will represent the lines of a financial balance sheet. The accountType column will determine the logic applied to the rows in the table.

- **Income and Expenses (P&L)**: These will be the category types and will be measured over periods.
- **Balances / Investments**: These accounts will be liquid accounts that have accumulated balances. All money will flow into or out of balance accounts at some point.
- **Cards**: These accounts will contain the same key information we currently have for cards, with closing date and due date. Additionally, parentAccount will be the balance account that pays the card balance.
- **Debts**: Debt accounts will have relevant information about the debt, such as the interest rate (optional). Debts will also have a parentAccount.

`journal_entries` will contain the header data of each transaction (date, description, source). `journal_lines` will mirror debit/credit logic in the ledger, and transactions can use different currencies. Currencies will later be converted to pesos when executed (for example, a USD card payment will be converted using the USD‑ARS rate on the card payment date); prior to execution they'll be estimated for indicators.

The budgets table will track any account or all accounts and will be flexible to expand features using accounts + recurring. `budget_lines` will be a historical record of budgets. `recurring_entries` and `recurring_lines` will keep the current recurring functionality but use the updated recording format (journal_entries + journal_lines).

---

## Constraints and Invariants

- Zero-sum invariant: The sum of `amountBaseCurrency` across all `journal_lines` within a single `journal_entries` row must equal 0.
- Signed base amounts: Keep signed `amountBaseCurrency` to preserve direction; validate against `direction`.
- FX linkage: When conversion is required, `journal_lines.exchangeRateId` points to the exact `exchange_rates` row used for conversion, OR `journal_lines.exchangeRate` contains the user's actual rate. User-provided rates take precedence for calculations.
- Idempotency: All write paths provide `idempotencyKey` where operations may be retried/backfilled.
 - Denormalization: Updating `journal_entries.date` must update all child `journal_lines.entryDate` consistently.

## Indexes

- `journal_entries`: `by_user_date (userId, date desc)`, `by_user_status_date (userId, status, date desc)`, `by_sourceType_sourceId (sourceType, sourceId)`.
- `journal_lines`: `by_entryId (journalEntryId)`, `by_accountId_date (accountId, entryDate desc)`, `by_user_accountId_date (userId, accountId, entryDate desc)`.
- `accounts`: `by_user (userId)`, `by_user_type (userId, accountType)`, `by_parentAccountId (parentAccountId)`.
- `exchange_rates`: `by_pair_date_source (pairCurrency, date, source)`.
- `budgets`: `by_user (userId)`.
- `budget_lines`: `by_budgetId (budgetId)`, `by_user (userId)`.

Pagination and ordering:
- Default sort: `(date desc, id desc)` for `journal_entries`. Use cursor-based pagination with stable sort keys.

---

## Adapted Functionalities

### Transaction Form

With the new table format, there will be categories for income and expenses, savings balances, investments, debts, and other instruments for future developments. The form must adapt to the transaction type:

- **Expense**: choose expense category and the account/card from which money leaves.
- **Income**: reversed logic (payment account is debited, income account is credited).
- **Savings/investments/debts**: allow account-to-account transactions.

### Balance

- **Monthly balance**: sum journal_lines filtered by account and period.
- **Loans/credits**: same calculation.
- **Investments**: sum totals by foreign currency and multiply by current exchange rate (user's actual rate if available, otherwise official rate).
- **FX Spread Analysis**: track differences between user-provided rates and official market rates for cost analysis.

### Budgets (Setup and Display)

To set a budget, define accountID, frequency and amount. Budgets can be used as expense limits.

### Budget — Goals

Suggested UI flow using tables:

1. Create a balance account for the goal.
2. Define goal amount and deadline.
3. Define a recurring entry with the monthly saving amount.

With those three elements the goal can be established.

### Transactions Sheet

There will be three transaction types: income, expense, and transfer. Income and expense follow current behavior; transfers need a different UI (to be designed). Interactions remain: tap to view details, edit, delete.

### Cards

Card payments use accrual accounting:

- Record the expense in the selected category on the transaction date; the other line is the card accrued liability.
- On statement closing, capture a statement summary (non-posting memo or off-balance entry) for UX.
- On due date, post the settlement: Dr card (liability), Cr bank (asset), amount = statement; link via `parentEntryId` with `linkType = settlement`. Use user's actual exchange rate if available for accurate cost tracking, otherwise use settlement-date FX rate if cross-currency.
- Accrued entries and actual payments are linked via `parentEntryId` with `linkType` (`accrual`, `installment`, `settlement`).
- Cards auto-generate installment records; prefer planned entries that are marked `posted` when verified. Enforce idempotency via `idempotencyKey`.
- **Simulation**: pretend the current date is X months in the future, run the recurring transaction generator, but do not persist results (use them only for preview).

### Loading Debts

When recording a debt, define amount owed, currency, interest rate, installment amount, period, and parent account (the balance that receives funds and pays installments). Then:

- Create an account in accounts.
- Open the account with a transaction that adds the balance to the parent account.
- Generate a recurring expense for the defined installment amount until the debt ends (either endDate or when the balance reaches 0 — business rule to decide).

### Investments

Investment portfolios are balance accounts. Users record purchases of different instruments in that account. To obtain a portfolio balance, sum balances by currency and calculate their current price using user's actual exchange rates when available (for accurate cost basis tracking), falling back to official rates for market value calculations.

### Reports

Because of ledger similarity with traditional accounting, financial indicators can be used for reporting. Specific indicators to implement will be decided later. **FX Analysis**: Reports can show FX spreads, cost basis vs market value for investments, and currency exposure analysis using both user-provided and official exchange rates.

### Pre-aggregations and Pagination

- Home dashboard rollups: maintain monthly aggregates by account and by accountType to avoid scanning large `journal_lines` on every render. Keep them updated on writes or via a periodic background action.
- Queries over `journal_entries` must support pagination and filtering by `date` and `status`.

Pre-aggregation update strategy:
- Background job is source of truth for rollups. Best-effort synchronous updates may occur on writes; scheduled reconciliation ensures consistency. Include idempotent upserts keyed by `(userId, accountId, month)`.

### Settings

In Settings the user can modify accounts (possibly separated into categories and balances), configure notifications (e.g., email), log out, and set a security PIN or fingerprint.

### Onboarding

Onboarding should determine the user's intended level of app usage via a form (experience with expense tracking, ability to import past expenses, savings, investments, etc.).

### Extras

Consider building the app in two languages: English and Spanish.

---

## Implementation Plan

The PerFi revamp affects all areas of the application, so plan carefully what to use as the migration basis. Use a strangler pattern: develop new tables in parallel with old ones, perform backfills and dual-writes until logic is complete, then migrate the UI.

### Proposed Plan

#### Step 0 — Preparation

- Add new tables in Convex without touching existing ones:
  - accounts (chart of accounts)
  - journal_entries, journal_lines
  - exchange_rates
  - recurring_entries, recurring_lines
  - budgets, budget_lines

#### Step 1 — Initial Mappings

- Seed accounts from current data:
  - For each paymentType: create a balance account (bank/cash) or card.
  - For each expense/income category: create an income or expense account.

- Keep the current categories table; add an optional category_to_account table to map category → account.
- Keep paymentTypes; map them to accounts.

#### Step 2 — Backfill (One Shot)

- Iterate existing expenses and generate journal_entries:
  - Expense: Dr expenseAccount (by category), Cr paymentAccount (by payment method).
  - Income: Dr paymentAccount, Cr incomeAccount.
  - Installments: for each paymentSchedule, generate a "planned" journal_entry with dueDate.

- Save mapping expenseId → journalEntryId (in expenses) for idempotency.

#### Step 3 — Dual Write in Current Mutations

- addExpense / updateExpense / deleteExpense / verifyExpense:
  - Continue writing to expenses.
  - Additionally, write/update/delete the corresponding entry in journal_*.

- recurring: generateTransactionFromRecurring will create journal_entries (and optionally keep the mirrored expense row temporarily).

#### Step 4 — New Features on Top of the Ledger (Without Breaking Anything)

- **Transfers**: implement in the ledger only (journal_entries with two lines: asset/liability); expose a new mutation addTransfer. UI: third tab in the drawer.
  - No fees for transfers. For cross-currency transfers, require `exchangeRateId` OR `exchangeRate` and apply rounding policy; auto-balance residuals to `fx_rounding`. User-provided rates take precedence for accurate cost tracking.
- **Budgets**: implement budgets + scopes and the "Budgets" card on Home reading from the ledger.
- **Upcoming due items**: calculate from planned journal_entries (installments + recurring) and optionally keep summing paymentSchedules while both coexist.

#### Step 5 — Cards (Statement and Payment)

- Introduce a job/action for "card statements":
  - On closing: calculate statement (range by closingDay), generate a statement summary (non-posting memo or off‑balance entry) for UX.
  - On due date: post the settlement: Dr card (liability), Cr bank account (asset), amount = statement. Link installments via `parentEntryId` and `linkType`.

- Keep installments as planned entries. When each installment is verified, post the actual movement.

#### Step 6 — Migrate Reads Screen by Screen

- **Transactions**: offer a toggle "New mode (ledger)" behind a feature flag; list journal_entries with adaptations for cards.
- **Home**: move Monthly Summary, Upcoming Bills and Budgets to read from the ledger.
- When "new mode" reaches parity, change the default. Keep old queries as fallback while deprecating them.

#### Step 7 — Gradual Deprecation

- When the ledger is the source of truth:
  - Rewrite listAllTransactions / listExpenses / listIncome to read from the ledger and, if needed, generate a "compat" view for the old UI.
  - paymentSchedules can be replaced by planned journal_entries; keep a migration and coexistence period.
  - recurringTransactions can continue as the scheduler but generate journal_entries (and an "expense mirror" if some screens still require it).

---

## Validation, Testing, and Migration Safety

- Data validation: use strict `convex/values` validators with enums for types and currency-related fields.
- Property tests: verify zero-sum invariant, idempotent backfills (respect `idempotencyKey`), FX conversions correctness, and rounding policies.
- Migration/backfill: process in batches, persist `expenseId → journalEntryId` mapping for idempotency, support resume on failure, and measure runtime. Gate dual-writes behind a feature flag.

### Enumerations and numeric precision

- accountType: `asset`, `liability`, `equity`, `income`, `expense`
- direction: `debit`, `credit`
- status: `planned`, `posted`, `voided`
- linkType: `accrual`, `installment`, `settlement`
- frequency: `daily`, `weekly`, `monthly`, `quarterly`, `semestrally`, `yearly`
- scopeType: `singleAccount`, `multipleAccounts`, `accountType`

Numeric representation:
- Monetary amounts stored as integers in minor units per currency; ARS has scale 0 (no decimals), USD/EUR scale 2 (cents).
- Rates stored as scaled decimals (e.g., integer with fixed scale) to avoid floating point.

### Hierarchical accounts and soft-delete workflow

- Hierarchy: arbitrary depth; prevent cycles. Postings are allowed on any node (leaf or non-leaf). Rollups must avoid double counting by summing child balances plus own postings once.
- Closing accounts: if an account has a balance and/or obligations, guide the user to settle/transfer balances or reassign obligations before soft-deleting. Historic references remain pointing to the original account. Users may reopen a soft-deleted account, restoring visibility.

---

## Proposed Implementation Steps

The following steps provide a detailed, ordered implementation plan for the PerFi accounting core migration. Each step builds on the previous ones using a strangler pattern to minimize risk while delivering incremental value.

### Phase 1: Foundation & Schema (Weeks 1-2)

#### Step 1.1 — Schema Definition & Validators
- Define Convex schema for new tables: `accounts`, `journal_entries`, `journal_lines`, `exchange_rates`, `cards`, `debts`, `budgets`, `budget_lines`, `recurring_entries`, `recurring_lines`
- Create strict validators with all enums (`accountType`, `direction`, `status`, `linkType`, `frequency`, `scopeType`)
- Define numeric validators for integer amounts and scaled rates
- Add indexes per specification: `by_user_date`, `by_user_status_date`, `by_accountId_date`, etc.
- **Deliverable**: Schema file with all table definitions and indexes

#### Step 1.2 — Base Currency & FX Infrastructure
- Create `exchange_rates` table with unique constraint on (`pairCurrency`, `date`, `source`)
- Build FX service/utility for fetching and storing rates (with `rate` and `inverseRate`)
- Implement rounding policy: round half away from zero to minor unit
- Create `fx_rounding` system account for residual balancing
- **Deliverable**: FX rate ingestion + conversion utilities with tests

#### Step 1.3 — Account Creation Utilities
- Build `createAccount` mutation with cycle prevention for `parentAccountId`
- Implement account hierarchy validation (prevent circular references)
- Add specialized mutations: `createCardAccount`, `createDebtAccount`
- Build utility to check account closure eligibility (balance + obligations check)
- **Deliverable**: Account CRUD operations with hierarchy support

### Phase 2: Migration Foundation (Weeks 3-4)

#### Step 2.1 — Account Seeding from Current Data
- Migration: create accounts from existing `paymentTypes`:
  - Cash/bank → `asset` accounts
  - Credit cards → `liability` accounts + entries in `cards` table
- Migration: create accounts from existing `categories`:
  - Expense categories → `expense` accounts
  - Income categories → `income` accounts
- Store mapping: `paymentTypeId → accountId`, `categoryId → accountId`
- **Deliverable**: Seeded accounts with mappings persisted

#### Step 2.2 — Historical Transaction Backfill (Batch Processing)
- Build idempotent backfill mutation using `idempotencyKey`
- For each existing expense/income:
  - Create `journal_entries` with `sourceType`, `sourceId`, `status = 'posted'`
  - Generate two `journal_lines` (Dr/Cr) with `accountId`, `currencyCode = 'ARS'`, integer amounts
  - Store `expenseId → journalEntryId` mapping
- Process in batches (100-500 records), support resume on failure
- Track progress and measure runtime
- **Deliverable**: All historical transactions in ledger format

#### Step 2.3 — Installment/Schedule Backfill
- For each `paymentSchedule`:
  - Create `journal_entries` with `status = 'planned'`, `linkType = 'installment'`
  - Add `installmentNumber` and `totalInstallments` to entry and lines
  - Link to parent via `parentEntryId`
- Ensure idempotency via composite key check
- **Deliverable**: All installments as planned ledger entries

#### Step 2.4 — Recurring Templates Migration
- For each `recurringTransactions`:
  - Create `recurring_entries` with frequency, nextDueDate, and status
  - Create two `recurring_lines` following double-entry accounting:
    - **Expense**: Dr Expense Account, Cr Cash/Bank Account
    - **Income**: Dr Cash/Bank Account, Cr Income Account
  - Use existing category and payment type mappings
  - Fallback to default cash account if payment type mapping missing
  - Ignore `cuotas` field (dummy column for recurring)
- Ensure idempotency via description/frequency/date matching
- **Deliverable**: All recurring templates in ledger format
- **Status**: ✅ Completed in development (15 recurring entries, 30 recurring lines)

### Phase 3: Dual-Write Implementation (Weeks 5-6)

#### Step 3.1 — Dual-Write Mutations (Expenses/Income)
- Update `addExpense`:
  - Continue writing to `expenses`
  - Additionally write to `journal_entries` + `journal_lines` (with FX if needed)
  - Handle installments: create planned entries with proper linking
- Update `updateExpense`, `deleteExpense`, `verifyExpense` similarly
- Add feature flag: `LEDGER_DUAL_WRITE_ENABLED`
- **Deliverable**: All expense mutations writing to both systems

#### Step 3.2 — Dual-Write Recurring Transactions
- Update `generateTransactionFromRecurring`:
  - Write to both `expenses` and ledger tables
  - Use existing scheduling logic from `planning/summary.md`
  - Ensure `idempotencyKey` prevents duplicates
- Keep `recurringTransactions` as scheduler
- **Deliverable**: Recurring generation creates ledger entries

#### Step 3.3 — Audit Trail & Provenance
- Add `createdBy` and `updatedBy` to all write paths
- Capture auth subject/userId on every mutation
- Add `updateTime` maintenance on edits
- **Deliverable**: Full audit trail for all ledger operations

### Phase 4: New Ledger-Only Features (Weeks 7-9)

#### Step 4.1 — Transfer Implementation
- Build `addTransfer` mutation:
  - Create entry with two lines (from-account Cr, to-account Dr)
  - Handle cross-currency: require `exchangeRateId`, apply rounding, auto-balance residuals
  - Set `sourceType = 'transfer'`
- Build transfer validation: prevent transfers to/from same account, check sufficient balance
- **Deliverable**: Transfer mutation with validation + tests

#### Step 4.2 — Budget System (Schema & Logic)
- Implement budget creation with scope support:
  - `singleAccount`: one `accountId`
  - `multipleAccounts`: array of `accountId` in `scopeRefs`
  - `accountType`: filter by account type
- Implement frequency-based period calculation
- No carryover: reset each period
- Build query to compute execution from `journal_lines` by account/period
- **Deliverable**: Budget CRUD + execution calculation

#### Step 4.3 — Budget Lines & Historical Tracking
- On period rollover, create `budget_lines` entry capturing period bounds
- Build query to show budget execution over time
- **Deliverable**: Budget history tracking

#### Step 4.4 — Pre-Aggregation System
- Create `monthly_rollups` table: `(userId, accountId, month, amountBaseCurrency, ...)`
- Build background job (scheduled action) to compute/update rollups
- Implement idempotent upsert keyed by `(userId, accountId, month)`
- Add best-effort synchronous updates on writes
- Build reconciliation to fix drift
- **Deliverable**: Pre-aggregation system with background job

### Phase 5: Card Statements & Settlement (Weeks 10-11)

#### Step 5.1 — Card Statement Calculation
- Build scheduled job to detect closing dates from `cards` table
- Calculate statement total: sum unposted card transactions in period
- Create statement summary (memo table or metadata, not posted to ledger)
- **Deliverable**: Statement calculation and storage

#### Step 5.2 — Card Settlement Posting
- Build scheduled job for due dates
- On due: create settlement entry with `linkType = 'settlement'`:
  - Dr card account (liability)
  - Cr bank account (asset) via `parentAccountId`
- Link all installments via `parentEntryId`
- Use settlement-date FX rate if cross-currency
- **Deliverable**: Automated card settlement

#### Step 5.3 — Installment Verification Flow
- When user verifies installment, update `status = 'posted'`
- Maintain zero-sum invariant
- Prevent double-posting via `idempotencyKey`
- **Deliverable**: Installment verification with idempotency

### Phase 6: UI Migration — Read Paths (Weeks 12-14)

#### Step 6.1 — Transactions Screen (Ledger Mode)
- Add feature flag: `LEDGER_READ_MODE`
- Build `listJournalEntries` query with pagination (`date desc, id desc`)
- Build query with filters: date range, status, account
- Adapt transaction detail view to show entry + lines
- Show installment progress (X/Y) from metadata
- **Deliverable**: Transactions screen reading from ledger (behind flag)

#### Step 6.2 — Home Screen Dashboard (Ledger Mode)
- Update Monthly Summary card: read from `monthly_rollups` or sum `journal_lines`
- Update Budgets card: read from budget execution queries
- Update Upcoming Bills: read `journal_entries` with `status = 'planned'`, filter by date
- Use pre-aggregated data where available
- **Deliverable**: Home screen reading from ledger (behind flag)

#### Step 6.3 — Projections & Simulations
- Build projection query from planned entries
- Implement card statement simulation (X months forward, no persist)
- Show installment schedules from planned entries
- **Deliverable**: Projection system on ledger data

#### Step 6.4 — Feature Flag Rollout
- Test ledger mode with beta users
- Monitor performance and correctness
- Gradually increase % of users on ledger mode
- **Deliverable**: Ledger mode available to all users

### Phase 7: Advanced Features (Weeks 15-17)

#### Step 7.1 — Debt Management
- Build debt creation flow:
  - Create `liability` account in `accounts`
  - Add entry to `debts` with `interestRate`
  - Opening transaction: Dr bank (parentAccount), Cr debt account
  - Create recurring for installment payments
- Build debt detail view with projection
- Implement debt prioritization by interest rate
- **Deliverable**: Debt tracking and prioritization

#### Step 7.2 — Investment Portfolios
- Build investment account creation (asset type)
- Implement multi-currency balance calculation
- Build purchase recording (transfer to investment account)
- Aggregate by currency, multiply by current FX rate
- **Deliverable**: Investment portfolio tracking

#### Step 7.3 — Goals & Savings
- Build goal creation flow:
  - Create balance account
  - Set target amount and deadline
  - Create recurring entry for savings
- Show progress via account balance vs target
- **Deliverable**: Goals and savings tracking

### Phase 8: Settings & Account Management (Weeks 18-19)

#### Step 8.1 — Account Management UI
- Build account list/edit screens (categories + balances separated)
- Implement account closure workflow:
  - Check balance and obligations
  - Guide user to transfer/settle before soft-delete
  - Support reopen for soft-deleted accounts
- **Deliverable**: Account management with closure workflow

#### Step 8.2 — Card & Debt Configuration
- Build UI for card details (closing day, due day)
- Build UI for debt details (interest rate, amortization)
- Allow editing `parentAccountId` for settlement account
- **Deliverable**: Card and debt configuration screens

#### Step 8.3 — Notifications & Preferences
- Email configuration
- Budget alert thresholds
- Recurring transaction reminders
- **Deliverable**: Notification settings

### Phase 9: Deprecation & Cleanup (Weeks 20-21)

#### Step 9.1 — Ledger as Source of Truth
- Switch default to ledger mode for all users
- Rewrite `listAllTransactions` to read from ledger with compat view
- Mark old queries as deprecated
- **Deliverable**: Ledger is primary data source

#### Step 9.2 — Dual-Write Removal
- Stop writing to `expenses` table (read-only for legacy)
- Remove dual-write code paths
- Keep mappings for historical reference
- **Deliverable**: Single-write to ledger only

#### Step 9.3 — Table Deprecation
- Mark `paymentSchedules` as deprecated (use planned entries)
- Keep `recurringTransactions` as scheduler only
- Archive old `expenses` data
- **Deliverable**: Legacy tables deprecated

### Phase 10: Polish & Optimization (Weeks 22-23)

#### Step 10.1 — Performance Optimization
- Optimize indexes based on query patterns
- Tune pre-aggregation job frequency
- Implement query result caching where appropriate
- **Deliverable**: Performance benchmarks met

#### Step 10.2 — Testing & Validation
- Property tests for zero-sum invariant
- FX conversion and rounding tests
- Idempotency tests for all mutations
- Load testing for pagination and aggregations
- **Deliverable**: Comprehensive test coverage

#### Step 10.3 — Documentation & Training
- Update API documentation
- Create migration guide for developers
- Document all enums, validators, and business rules
- **Deliverable**: Complete documentation

#### Step 10.4 — Internationalization (Optional)
- Add Spanish translations
- Localize currency formatting
- Adapt date/time display for timezone
- **Deliverable**: Multi-language support

### Phase 11: Future Enhancements (Post-Launch)

#### Step 11.1 — Advanced Reporting
- Implement financial indicators (P&L, balance sheet, cash flow)
- Build custom report builder
- Export functionality (CSV, PDF)
- **Deliverable**: Comprehensive reporting suite

#### Step 11.2 — Enhanced Onboarding
- Multi-step onboarding form
- Import from bank statements/CSV
- Setup wizard for budgets and goals
- **Deliverable**: Improved first-user experience

#### Step 11.3 — Collaboration Features (Future)
- Shared accounts/budgets
- Multi-user households
- Permission management
- **Deliverable**: Collaboration capabilities

---

### Migration Checklist

**Pre-Launch Validation:**
- [x] All historical data backfilled successfully
- [x] Zero-sum invariant holds for all entries
- [x] Idempotency verified for all mutations
- [x] FX conversions accurate within rounding tolerance
- [ ] Pre-aggregations match detailed calculations
- [ ] Feature flags functional and tested
- [ ] Performance benchmarks met (Home load < 1s, transactions list < 500ms)
- [x] No data loss during dual-write period
- [ ] Rollback plan tested and documented
- [x] Recurring templates migrated to ledger format

**Post-Launch Monitoring:**
- [ ] Monitor error rates for ledger mutations
- [ ] Track query performance and optimize slow queries
- [ ] Verify pre-aggregation job completion
- [ ] Monitor FX residual account for anomalies
- [ ] User feedback on ledger mode experience
- [ ] Gradual rollout metrics (% on ledger, error rates, performance)