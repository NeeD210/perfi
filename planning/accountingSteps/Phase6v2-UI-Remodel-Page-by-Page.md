# Phase 6v2: UI Remodel (Page-by-Page) with Ledger Integration - Product Requirements Document

## Introduction

This PRD defines Phase 6v2 of PerFi's accounting migration: a complete UI remodel implemented page-by-page, where each page is redesigned with modern aesthetics and connected directly to the ledger backend. Backend queries are built as needed by each new page design, rather than pre-building a compatibility layer.

This approach replaces the original Phase 6 "compat adapter" strategy. Instead of preserving legacy UI shapes, we design each page fresh and build purpose-specific queries that return exactly what the new UI needs. This results in cleaner code, better UX, and no throwaway abstractions.

The remodel follows a deliberate order: Home → Transaction Form → Transactions List → Settings → Plan → Reports. Each page is deployable independently, allowing incremental value delivery.

## Context & Background

### Current System
- Home and Transactions screens read from legacy `expenses` queries
- Separate drawers for Expense and Income entry; no unified flow
- Transfer form exists but is not integrated into main transaction drawer
- Upcoming payments derived from `paymentSchedules` and `recurringTransactions` (legacy tables)
- UI uses shadcn/ui components but lacks cohesive modern design language
- Mixed data sources create inconsistent user experience

### Target System
- All screens read exclusively from ledger tables (`journal_entries`, `journal_lines`, `monthly_rollups`)
- Unified Transaction Form for Expense, Income, and Transfer with smart defaults
- Modern, distinctive UI design that avoids generic "AI slop" aesthetics
- Purpose-built queries per page (no legacy shape compatibility layer)
- Performance targets: Home < 1s, Transactions first page < 500ms

### Technology Stack
- Backend: Convex (TypeScript)
- Database: Convex NoSQL with pre-defined ledger schema
- Validation: Convex `v` validator library
- Frontend: React + Vite + shadcn/ui + Tailwind CSS
- State: Convex reactive queries (no additional state management needed)

### Key Concepts
- **Page-by-Page Remodel**: Each page is redesigned independently, with backend queries built to serve that specific page's data needs
- **Ledger-First Queries**: All new queries read from `journal_entries`, `journal_lines`, and `monthly_rollups` — never from legacy tables
- **Purpose-Built API**: Each query returns exactly the shape the UI component needs, avoiding over-fetching and transformation layers
- **Incremental Deployment**: Each page can be deployed independently without blocking others

### Design System Reference

> **IMPORTANT:** All visual design, typography, colors, spacing, motion, and component styling MUST follow **`branding.md`** as the single source of truth.

This PRD focuses on **functional requirements, data shapes, and behavior**. Visual design decisions are documented in `branding.md`, including:

| Aspect | Reference Section in branding.md |
|--------|----------------------------------|
| Typography | Typography (Poppins font stack, weight scale, text sizes) |
| Color System | Color System (HSL tokens, semantic colors, gradients) |
| Spacing & Layout | Spacing & Layout (radius, container constraints) |
| Elevation | Elevation & Shadows (shadow scale, z-index) |
| Component States | Component Patterns (buttons, cards, inputs) |
| Loading States | Loading & Skeleton States |
| Error/Empty States | Error & Empty States |
| Animation | Animation & Motion (duration, easing, stagger) |
| Icons | Icons (Lucide React, sizing guidelines) |

**Do not define new design tokens in this PRD.** Reference `branding.md` for all visual specifications.

## User Stories

**US1 (Home Remodel):** As a user, I want a beautifully redesigned Home dashboard that shows my real-time financial status from the ledger, so I can understand my finances at a glance with a modern, delightful experience.

**US2 (Unified Transaction Entry):** As a user, I want a single, elegant Transaction Form where I can quickly add Expenses, Income, or Transfers with smart defaults, so entering transactions is fast and intuitive.

**US3 (Transactions List Remodel):** As a user, I want a redesigned Transactions list that loads quickly from the ledger, with modern filtering and detail views, so I can find and manage my transactions easily.

**US4 (Settings & Account Management):** As a user, I want a redesigned Settings screen where I can manage my accounts, categories, cards, and preferences with clear organization and modern UI patterns.

**US5 (Performance):** As a user, I want pages to load quickly (Home < 1s, Transactions < 500ms) so the app feels responsive and professional.

**US6 (Visual Identity):** As a user, I want a distinctive, cohesive visual design that makes PerFi feel premium and trustworthy, not generic or template-driven.

## Acceptance Criteria

### For US1 (Home Remodel)

**Data Sources:**
- [ ] Net Balance card reads from `api.ledger.home.getNetBalance` (new query)
- [ ] Income/Expense summary reads from `api.ledger.home.getMonthlySummary` (uses existing `monthly_rollups`)
- [ ] Top spending categories reads from `api.ledger.home.getTopCategories` (new query, limit: 5)
- [ ] Upcoming obligations reads from `api.ledger.home.getUpcomingObligations` (new query combining planned entries, card statements, recurring)
- [ ] No legacy queries (`expenses.list`, `paymentSchedules`) invoked by Home

**UI Components (styled per branding.md):**
- [ ] Balance Card: `<Card className="rounded-xl shadow">` with `text-3xl font-bold` for balance
- [ ] Income vs Expense Chart: Uses `categoryColors` from branding.md for visualization
- [ ] Categories Breakdown: Donut chart with branding.md chart category colors
- [ ] Upcoming Payments: List using `TransactionRow`-style pattern (icon, description, amount)
- [ ] Quick Actions: FAB using `shadow-lg hover:shadow-xl` pattern from branding.md > Navigation

**Visual Design (per branding.md):**
- [ ] All colors use CSS variables from `branding.md` Color System section
- [ ] Typography uses Poppins font stack with defined weight/size scale
- [ ] Staggered reveal animations on load (see Animation & Motion section)
- [ ] Dark mode using `.dark` class with proper contrast tokens
- [ ] Cards use shadow scale and rounded-xl radius
- [ ] Loading states use skeleton patterns from branding.md

### For US2 (Unified Transaction Form)

**Form Capabilities:**
- [ ] Type switcher: Expense | Income | Transfer (tab-based or segmented control)
- [ ] Amount input: Large, clear number input with currency indicator
- [ ] Date picker: Defaults to today, easy date selection
- [ ] Description: Text input with optional smart suggestions
- [ ] Category/Account selection: Filtered by transaction type
- [ ] Payment method selection: For Expense/Income, shows asset/liability accounts
- [ ] Installments option: For Expense/Income, inline expandable section with installment count
- [ ] Recurring option: For Expense/Income, inline expandable section with frequency picker

**Installments UI Pattern:**
```
┌─────────────────────────────────────┐
│ ☐ Split into installments          │  ← Toggle switch
└─────────────────────────────────────┘

When enabled, expands to:
┌─────────────────────────────────────┐
│ ☑ Split into installments          │
│ ┌─────────────────────────────────┐ │
│ │  Number of installments         │ │
│ │  ◀  [  3  ]  ▶                  │ │  ← Stepper control (1-48)
│ │                                 │ │
│ │  Each payment: $1,666.67        │ │  ← Calculated display
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**Recurring UI Pattern:**
```
┌─────────────────────────────────────┐
│ ☐ Make recurring                    │  ← Toggle switch
└─────────────────────────────────────┘

When enabled, expands to:
┌─────────────────────────────────────┐
│ ☑ Make recurring                    │
│ ┌─────────────────────────────────┐ │
│ │  Frequency                      │ │
│ │  [Monthly          ▼]           │ │  ← Dropdown
│ │                                 │ │
│ │  End date (optional)            │ │
│ │  [Never            ▼]           │ │  ← Dropdown or date picker
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**Mutual Exclusivity:** Installments and Recurring are mutually exclusive. Enabling one disables the other with a tooltip explaining why.

**Smart Defaults:**
- [ ] Pre-fill last used category per transaction type
- [ ] Pre-fill last used payment account per transaction type
- [ ] Remember currency preference
- [ ] Today's date as default

**Validation:**
- [ ] Amount must be > 0
- [ ] Transfer: source and destination accounts must differ
- [ ] Expense: requires category (expense account) and payment source
- [ ] Income: requires category (income account) and receiving account
- [ ] Installments: totalInstallments must be >= 1

**Backend Integration:**
- [ ] Expense/Income: calls existing dual-write mutations in `convex/expenses.ts`
- [ ] Transfer: calls `api.ledger.transfers.addTransfer`
- [ ] Rollups updated immediately after successful write

### For US3 (Transactions List Remodel)

**Data Source:**
- [ ] Main list reads from `api.ledger.transactions.listTransactions` (new query)
- [ ] Pagination: cursor-based with `(date desc, _id desc)` ordering
- [ ] Filters: date range, transaction type, account, status

**Query Output Shape:**
```typescript
{
  id: Id<"journal_entries">;
  date: number; // epoch ms
  description: string;
  type: "expense" | "income" | "transfer" | "other";
  amount: number; // signed integer, base currency minor units
  categoryName?: string; // expense/income account description
  paymentAccountName?: string; // asset/liability account description
  installment?: { current: number; total: number };
  status: "planned" | "posted" | "voided";
  isEditable: boolean; // see editability rules below
  sourceType?: string; // "expense" | "income" | "transfer" | "recurring" | etc.
  sourceId?: string; // reference to source record
}
```

**Editability Rules:**
| sourceType | isEditable | Reason |
|------------|------------|--------|
| `expense` | `true` | Editable via legacy mutation flow |
| `income` | `true` | Editable via legacy mutation flow |
| `transfer` | `false` | Transfers are immutable for accounting integrity; user must void and recreate |
| `recurring` | `false` | Auto-generated entries are read-only |
| `installment` | `false` | Child installments are read-only; edit parent entry instead |
| `statement` | `false` | Card settlement entries are system-generated |
| `other` | `false` | Unknown source types are read-only |

**UI Behavior for Non-Editable Entries:**
- Edit action hidden from swipe menu
- Tapping row shows detail view with "View Only" indicator
- Info tooltip explains why entry cannot be edited

**UI Components (styled per branding.md):**
- [ ] Transaction row: Use `TransactionRow` compound component pattern from branding.md
- [ ] Swipe actions: Edit, Delete (only for editable entries)
- [ ] Detail view: Full transaction breakdown in `<Sheet>` or detail page
- [ ] Filter panel: Use `<Select>` and `<DateRangePicker>` components
- [ ] Empty state: Use `EmptyState` pattern with `<Search />` icon for no results

**Performance:**
- [ ] First page loads in < 500ms
- [ ] Infinite scroll or pagination for subsequent pages
- [ ] Skeleton loading: Use `TransactionSkeleton` pattern from branding.md

```tsx
// Transaction row (see branding.md > Compound Components)
<TransactionRow
  description="Groceries"
  category="Food"
  amount={-5000}
  date="Dec 29"
  type="expense"
  onClick={() => openDetail(id)}
/>

// Loading state
{isLoading && Array(5).fill(0).map((_, i) => <TransactionSkeleton key={i} />)}
```

### For US4 (Settings Remodel)

**Sections (Sprint 4 Scope):**
- [ ] Profile: User info, email, logout
- [ ] Accounts: List and manage asset/liability accounts (banks, cards, wallets)
- [ ] Categories: List and manage expense/income categories (mapped to accounts)
- [ ] Cards: Configure card closing day, due day, linked settlement account

**Out of Scope for Sprint 4 (Future Phases):**
- ❌ Security: PIN/biometric settings — deferred to future phase
- ❌ Notifications: Email preferences — deferred to future phase
- ❌ Data Export: CSV/PDF export — deferred to future phase

> **Note:** Settings page will show placeholder sections for Security and Notifications with "Coming Soon" badges, but no functionality will be implemented in this phase.

**Account Management:**
- [ ] List accounts by type (asset, liability)
- [ ] Create new account with type, description, currency
- [ ] Edit account description and settings
- [ ] Close/archive account (with balance check)
- [ ] Card-specific settings for liability accounts marked as cards

**Backend Queries:**
- [ ] `api.ledger.accounts.listAccounts({ type?: string })` — returns accounts for user
- [ ] `api.ledger.accounts.getAccountDetails({ accountId })` — full account info
- [ ] `api.ledger.accounts.createAccount` — new account creation
- [ ] `api.ledger.accounts.updateAccount` — edit account
- [ ] `api.ledger.accounts.closeAccount` — soft-delete with balance validation

### For US5 (Performance)

**Metrics:**
- [ ] Home initial render: < 1 second for typical dataset (< 1000 transactions)
- [ ] Transactions first page: < 500ms server time
- [ ] Form submission feedback: < 200ms perceived response

**Implementation:**
- [ ] All queries use proper indexes (no full table scans)
- [ ] Pre-aggregated rollups used for Home summary data
- [ ] Cursor-based pagination for lists
- [ ] Optimistic UI updates where appropriate

### For US6 (Visual Identity)

> **Reference:** All visual specifications are defined in **`branding.md`**. This section specifies behavioral requirements only.

**Typography Requirements:**
- [ ] Primary font loaded: Poppins (Google Fonts) — see `branding.md > Typography`
- [ ] Font weights used consistently per hierarchy (400, 500, 600, 700)
- [ ] Financial amounts use `font-bold` for emphasis
- [ ] Text sizes follow the defined scale (xs through 3xl)

**Color Implementation:**
- [ ] All colors use CSS variables defined in `src/index.css`
- [ ] No hardcoded hex values in component code
- [ ] Semantic colors applied correctly:
  - Income: `text-green-600`
  - Expense: `text-red-600` / `text-destructive`
  - Transfer: `text-primary` (neutral)
- [ ] Dark mode toggle works with `.dark` class on `<html>`

**Component Styling (per branding.md):**
- [ ] Cards use `rounded-xl shadow` base styling
- [ ] Interactive cards add `hover:shadow-lg transition-shadow`
- [ ] Buttons follow variant system (default, secondary, outline, ghost, destructive)
- [ ] Inputs use defined border/focus states
- [ ] Loading states use skeleton patterns (`animate-pulse bg-muted`)

**Motion Implementation:**
- [ ] Duration scale applied: 150ms (quick), 200ms (standard), 300ms (emphasis)
- [ ] Easing functions: `ease-out` for entrances, `ease-in-out` for morphs
- [ ] Page load stagger: `animation-delay: calc(var(--index) * 50ms)`
- [ ] Reduced motion respected: `@media (prefers-reduced-motion: reduce)`

**Layout Requirements:**
- [ ] Page padding: `p-4` (16px)
- [ ] Card gaps: `gap-4` (16px)
- [ ] Section gaps: `gap-6` (24px)
- [ ] Mobile-first breakpoints: sm (640px), md (768px), lg (1024px)
- [ ] Content max-width: `max-w-md` for mobile-optimized views

## Detailed Specifications

### Page 1: Home Dashboard

#### Query: getHomeDashboard

**File:** `convex/ledger/home.ts`

**Purpose:** Single query returning all data needed for Home page to minimize round trips.

**Input:**
```typescript
{
  // No arguments needed - uses authenticated user and current month
}
```

**Output:**
```typescript
{
  netBalance: {
    current: number; // total assets - total liabilities (minor units)
    trend: "up" | "down" | "stable"; // compared to previous month
    changePercent: number; // percentage change from previous month
  };
  monthSummary: {
    month: number; // epoch ms of month start
    totalIncome: number; // minor units
    totalExpenses: number; // minor units
    netChange: number; // income - expenses
  };
  topCategories: Array<{
    accountId: Id<"accounts">;
    name: string;
    amount: number; // minor units
    percentOfTotal: number;
    color?: string;
  }>; // max 5 items
  upcomingObligations: Array<{
    id: string; // composite key for React
    type: "installment" | "recurring" | "card_statement";
    date: number; // epoch ms
    description: string;
    amount: number; // minor units
    accountName?: string;
  }>; // max 5 items
  lastUpdated: number; // epoch ms
}
```

**Business Logic:**
1. Authenticate user via `ctx.auth.getUserIdentity()`
2. Calculate net balance: sum of asset account balances minus liability account balances
3. Get month summary from `monthly_rollups` for current month (or calculate if missing)
4. Get top 5 expense categories by amount from current month rollups
5. Collect upcoming obligations from:
   - `journal_entries` with `status = 'planned'` and `date` within next 30 days
   - `card_statements` with `status = 'pending'` and `dueDate` within next 30 days
   - `recurring_entries` with `nextDueDate` within next 30 days
6. Sort upcoming by date, limit to 5
7. Return aggregated response

**Indexes Used (All verified in `convex/schema.ts`):**
- `monthly_rollups.by_user_month` — for month summary and top categories
- `journal_entries.by_user_status_date` — for planned entries (upcoming installments)
- `card_statements.by_user_status` — for pending card statements
- `recurring_entries.by_user_status_nextDueDate` — for recurring obligations

**Error Handling:**
- Throws `ConvexError({ code: "UNAUTHORIZED", message: "Not authenticated" })` if user not authenticated
- Throws `ConvexError({ code: "USER_NOT_FOUND", message: "User not found" })` if user record missing
- Returns zero values (not null) for empty data states
- Query timeout: 10 seconds max (Convex default), with client-side retry on network failure

**Error Response Type (all queries):**
```typescript
// All queries may throw ConvexError with this shape:
type QueryError = {
  code: "UNAUTHORIZED" | "USER_NOT_FOUND" | "INVALID_INPUT" | "NOT_FOUND" | "INTERNAL_ERROR";
  message: string;
  details?: Record<string, unknown>;
};

// Client-side error handling pattern:
try {
  const data = await ctx.runQuery(api.ledger.home.getHomeDashboard, {});
} catch (error) {
  if (error instanceof ConvexError) {
    const { code, message } = error.data as QueryError;
    // Handle by code: show toast, redirect to login, etc.
  }
}
```

**UI Error States (per branding.md > Error & Empty States):**
- Network error: Use `ErrorState` component with retry action
- Unauthorized: Redirect to login screen
- Empty data: Use `EmptyState` component with icon, title, description, action
- Stale rollups: Show data with `<Loader2 className="h-4 w-4 animate-spin" />` indicator

```tsx
// Example: Network error (see branding.md > Error States)
<ErrorState
  message="Unable to load dashboard"
  onRetry={() => refetch()}
/>

// Example: Empty transactions (see branding.md > Empty States)
<EmptyState
  icon={Wallet}
  title="No transactions yet"
  description="Start tracking by adding your first transaction."
  action={{ label: "Add Transaction", onClick: openForm }}
/>
```

#### Query: getTopCategories

**File:** `convex/ledger/home.ts`

**Purpose:** Standalone query for category breakdown (can be used independently of dashboard).

**Input:**
```typescript
{
  month?: number; // epoch ms; defaults to current month
  limit?: number; // defaults to 5
}
```

**Output:**
```typescript
Array<{
  accountId: Id<"accounts">;
  name: string;
  amount: number; // absolute value, minor units
  percentOfTotal: number; // 0-100
}>
```

**Business Logic:**
1. Query `monthly_rollups` for expense-type accounts in specified month
2. Sum `totalDebits` for each expense account
3. Calculate percentages relative to total expenses
4. Sort by amount descending, limit to specified count
5. Fetch account descriptions for names

#### Query: getUpcomingObligations

**File:** `convex/ledger/home.ts`

**Purpose:** Mixed feed of upcoming payments and due items.

**Input:**
```typescript
{
  days?: number; // look-ahead window, defaults to 30
  limit?: number; // defaults to 5
}
```

**Output:**
```typescript
Array<{
  id: string;
  type: "installment" | "recurring" | "card_statement";
  date: number;
  description: string;
  amount: number;
  accountName?: string;
  sourceId?: string; // for linking to detail views
}>
```

**Business Logic:**
1. Calculate date window: `now` to `now + days`
2. Query planned `journal_entries` in window (installments)
3. Query pending `card_statements` with `dueDate` in window
4. Query `recurring_entries` with `nextDueDate` in window and calculate future occurrences:
   - For each recurring entry, calculate upcoming dates based on `frequency` and `nextDueDate`
   - Generate virtual obligation objects for dates within window (NOT persisted to database)
   - Include amount from `recurring_lines` sum
5. Merge results, sort by date ascending
6. Limit to specified count

**Recurring Entry Simulation (Step 4 Detail):**
```typescript
// Calculate future occurrences WITHOUT creating journal entries
function simulateRecurringOccurrences(
  recurring: RecurringEntry,
  windowStart: number,
  windowEnd: number
): VirtualObligation[] {
  const occurrences: VirtualObligation[] = [];
  let nextDate = recurring.nextDueDate;
  
  while (nextDate <= windowEnd && occurrences.length < 10) {
    if (nextDate >= windowStart) {
      occurrences.push({
        id: `recurring_${recurring._id}_${nextDate}`,
        type: "recurring",
        date: nextDate,
        description: recurring.description,
        amount: sumRecurringLines(recurring._id), // calculated, not from journal
        accountName: undefined, // optional
        sourceId: recurring._id,
      });
    }
    nextDate = calculateNextDueDate(nextDate, recurring.frequency);
  }
  
  return occurrences;
}
```

> **Important:** This is a read-only projection. Journal entries for recurring transactions are only created when the cron job runs on the actual due date.

---

### Page 2: Transaction Form

#### Component: TransactionForm

**File:** `src/components/TransactionForm.tsx`

**Purpose:** Unified form for creating and editing Expenses, Income, and Transfers.

**Props:**
```typescript
interface TransactionFormProps {
  mode: "create" | "edit";
  initialType?: "expense" | "income" | "transfer";
  initialValues?: Partial<TransactionFormValues>;
  onSuccess: () => void; // called after successful submission
  onCancel: () => void;
}

interface TransactionFormValues {
  type: "expense" | "income" | "transfer";
  amount: number; // user-entered value (will be converted to minor units)
  date: number; // epoch ms
  description: string;
  categoryAccountId?: Id<"accounts">; // expense or income account
  fromAccountId?: Id<"accounts">; // source account (expense/transfer)
  toAccountId?: Id<"accounts">; // destination account (income/transfer)
  currencyCode: string; // ISO 4217, defaults to "ARS"
  installments?: {
    total: number; // >= 1
    // installmentNumber is auto-calculated on creation
  };
  recurring?: {
    frequency: "daily" | "weekly" | "monthly" | "quarterly" | "semestrally" | "yearly";
    endDate?: number; // optional end date
  };
}
```

**Behavior:**

**Type Switching (Explicit Field Reset Behavior):**
- Tabs or segmented control at top: Expense | Income | Transfer
- Switching type triggers the following state transitions:

| Field | Expense → Income | Expense → Transfer | Income → Expense | Income → Transfer | Transfer → Expense | Transfer → Income |
|-------|------------------|-------------------|------------------|-------------------|-------------------|-------------------|
| Amount | ✅ Preserve | ✅ Preserve | ✅ Preserve | ✅ Preserve | ✅ Preserve | ✅ Preserve |
| Date | ✅ Preserve | ✅ Preserve | ✅ Preserve | ✅ Preserve | ✅ Preserve | ✅ Preserve |
| Description | ✅ Preserve | ✅ Preserve | ✅ Preserve | ✅ Preserve | ✅ Preserve | ✅ Preserve |
| Category | 🔄 Reset (different type) | 🗑️ Clear (not used) | 🔄 Reset (different type) | 🗑️ Clear (not used) | 🔄 Load default | 🔄 Load default |
| From Account | ✅ Preserve | ✅ Preserve | 🔄 Load default | 🔄 Load default | ✅ Preserve | 🗑️ Clear |
| To Account | 🔄 Load default | 🔄 Load default | ✅ Preserve | ✅ Preserve | 🗑️ Clear | ✅ Preserve |
| Installments | ✅ Preserve | 🗑️ Clear | ✅ Preserve | 🗑️ Clear | 🔄 Reset to 1 | 🔄 Reset to 1 |
| Recurring | ✅ Preserve | 🗑️ Clear | ✅ Preserve | 🗑️ Clear | 🔄 Clear | 🔄 Clear |

Legend: ✅ Preserve = keep current value, 🔄 Reset/Load default = apply smart default, 🗑️ Clear = set to empty/undefined

**State Machine Implementation (Recommended):**
```typescript
type FormAction = 
  | { type: "SET_TRANSACTION_TYPE"; payload: "expense" | "income" | "transfer" }
  | { type: "SET_AMOUNT"; payload: number }
  | { type: "SET_FIELD"; field: keyof TransactionFormValues; value: unknown }
  | { type: "RESET_FORM" };

function formReducer(state: TransactionFormValues, action: FormAction): TransactionFormValues {
  switch (action.type) {
    case "SET_TRANSACTION_TYPE": {
      const newType = action.payload;
      const preserved = { amount: state.amount, date: state.date, description: state.description };
      
      // Load smart defaults for new type from localStorage
      const defaults = getSmartDefaults(newType);
      
      return {
        ...preserved,
        type: newType,
        categoryAccountId: newType === "transfer" ? undefined : defaults.categoryAccountId,
        fromAccountId: ["expense", "transfer"].includes(newType) ? defaults.fromAccountId : undefined,
        toAccountId: ["income", "transfer"].includes(newType) ? defaults.toAccountId : undefined,
        installments: newType === "transfer" ? undefined : state.installments,
        recurring: newType === "transfer" ? undefined : state.recurring,
        currencyCode: state.currencyCode,
      };
    }
    // ... other cases
  }
}
```

**Field Visibility:**
| Field | Expense | Income | Transfer |
|-------|---------|--------|----------|
| Amount | ✓ | ✓ | ✓ |
| Date | ✓ | ✓ | ✓ |
| Description | ✓ | ✓ | ✓ |
| Category (expense account) | ✓ | - | - |
| Category (income account) | - | ✓ | - |
| From Account | ✓ | - | ✓ |
| To Account | - | ✓ | ✓ |
| Installments | ✓ | ✓ | - |
| Recurring | ✓ | ✓ | - |

**Smart Defaults:**
- Amount: Empty (focus on mount)
- Date: Today (midnight local time)
- Description: Empty string
- Category: Last used per type (stored in localStorage)
- From/To Account: Last used per type (stored in localStorage)
- Currency: User's default or "ARS"

**Smart Defaults Fallback Behavior:**
When localStorage is empty or cleared (first-time use, incognito mode, cleared data):

| Field | Expense Fallback | Income Fallback | Transfer Fallback |
|-------|------------------|-----------------|-------------------|
| Category | First expense account alphabetically | First income account alphabetically | N/A |
| From Account | First asset account alphabetically | N/A | First asset account alphabetically |
| To Account | N/A | First asset account alphabetically | Second asset account (or first liability if only one asset) |

**localStorage Keys:**
```typescript
const STORAGE_KEYS = {
  lastExpenseCategory: "perfi_last_expense_category",      // Id<"accounts">
  lastIncomeCategory: "perfi_last_income_category",        // Id<"accounts">
  lastExpensePaymentAccount: "perfi_last_expense_from",    // Id<"accounts">
  lastIncomeReceivingAccount: "perfi_last_income_to",      // Id<"accounts">
  lastTransferSource: "perfi_last_transfer_from",          // Id<"accounts">
  lastTransferDest: "perfi_last_transfer_to",              // Id<"accounts">
  defaultCurrency: "perfi_default_currency",               // string (ISO 4217)
} as const;

// Stored as account IDs only (not sensitive data)
// Validated against current account list on load (account may have been deleted)
```

**Smart Defaults Loading Logic:**
```typescript
function getSmartDefaults(type: "expense" | "income" | "transfer", accounts: AccountsForForm) {
  const stored = localStorage.getItem(STORAGE_KEYS[`last${capitalize(type)}Category`]);
  
  // Validate stored ID still exists in current accounts
  const isValid = stored && accounts[`${type}Categories`]?.some(a => a.id === stored);
  
  if (isValid) return { categoryAccountId: stored };
  
  // Fallback: first account alphabetically
  const fallback = accounts[`${type}Categories`]?.[0]?.id;
  return { categoryAccountId: fallback };
}
```

**Validation Rules:**
```typescript
const validationRules = {
  amount: (v: number) => v > 0 || "Amount must be greater than 0",
  description: (v: string) => v.length <= 200 || "Description too long",
  transfer: (from: Id, to: Id) => from !== to || "Accounts must be different",
  installments: (n: number) => n >= 1 && n <= 48 || "Installments must be 1-48",
};
```

**Submission Logic:**

For Expense:
```typescript
// 1. Convert amount to minor units
const amountMinor = toMinorUnits(amount, currencyCode);

// 2. Call existing mutation (already does dual-write)
await ctx.runMutation(api.expenses.addExpense, {
  amount: amountMinor,
  categoryId: categoryAccountId, // mapped back to legacy categoryId if needed
  cuotas: installments?.total ?? 1,
  date,
  description,
  paymentTypeId: fromAccountId, // mapped back to legacy paymentTypeId if needed
  transactionType: "expense",
});
```

For Income:
```typescript
await ctx.runMutation(api.expenses.addExpense, {
  amount: amountMinor,
  categoryId: categoryAccountId,
  cuotas: 1,
  date,
  description,
  paymentTypeId: toAccountId,
  transactionType: "income",
});
```

For Transfer:
```typescript
await ctx.runMutation(api.ledger.transfers.addTransfer, {
  sourceAccountId: fromAccountId,
  destinationAccountId: toAccountId,
  amount: amountMinor,
  description,
  date,
  exchangeRate: calculatedRate, // if cross-currency
});
```

**Visual States (per branding.md):**
- Default: Form fields active, submit button enabled (`bg-primary`)
- Submitting: Button with `<Loader2 className="animate-spin" />`, fields `disabled opacity-50`
- Error: Inline field errors with `text-destructive`, toast variant="destructive"
- Success: Toast notification, auto-close drawer/dialog

**Form Component Patterns:**
```tsx
// Error state input (see branding.md > Inputs)
<Input className="border-destructive focus-visible:ring-destructive" />
<p className="text-sm text-destructive">Error message</p>

// Loading button (see branding.md > Buttons)
<Button disabled>
  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
  Saving...
</Button>
```

#### Query: getAccountsForForm

**File:** `convex/ledger/accounts.ts`

**Purpose:** Get accounts categorized for form dropdowns.

**Input:**
```typescript
{
  // No args - returns all accounts for authenticated user
}
```

**Output:**
```typescript
{
  expenseCategories: Array<{ id: Id<"accounts">; name: string }>;
  incomeCategories: Array<{ id: Id<"accounts">; name: string }>;
  paymentAccounts: Array<{ id: Id<"accounts">; name: string; type: "asset" | "liability" }>;
}
```

**Business Logic:**
1. Query all non-deleted accounts for user
2. Group by accountType:
   - `expense` → expenseCategories
   - `income` → incomeCategories
   - `asset`, `liability` → paymentAccounts
3. Sort each group alphabetically by description

---

### Page 3: Transactions List

#### Query: listTransactions

**File:** `convex/ledger/transactions.ts`

**Purpose:** Paginated list of journal entries for transactions view.

**Input:**
```typescript
{
  filters?: {
    startDate?: number; // epoch ms, inclusive
    endDate?: number; // epoch ms, inclusive
    type?: "expense" | "income" | "transfer";
    accountId?: Id<"accounts">;
    status?: "planned" | "posted" | "voided";
  };
  pagination: {
    cursor?: string; // opaque cursor from previous response
    pageSize: number; // 20-50 recommended
  };
}
```

**Output:**
```typescript
{
  items: Array<{
    id: Id<"journal_entries">;
    date: number;
    description: string;
    type: "expense" | "income" | "transfer" | "other";
    amount: number; // absolute value, minor units
    amountSigned: number; // negative for expense, positive for income
    categoryName?: string;
    paymentAccountName?: string;
    installment?: { current: number; total: number };
    status: "planned" | "posted" | "voided";
    isEditable: boolean;
    sourceType?: string;
    sourceId?: string;
  }>;
  nextCursor?: string; // undefined if no more pages
  hasMore: boolean;
}
```

**Business Logic:**
1. Build query on `journal_entries` for user
2. Apply filters:
   - Date range uses `by_user_date` index
   - Status uses `by_user_status_date` index
   - Account filter requires joining with `journal_lines`
3. Order by `(date desc, _id desc)` for stable pagination
4. For each entry, fetch lines to determine:
   - Type: based on account types in lines
   - Amount: from the expense/income side line
   - Category: description of expense/income account
   - Payment account: description of asset/liability account
5. Set `isEditable = sourceType in ["expense", "income"] && sourceId exists`
6. Encode cursor from last item's `(date, _id)`

**Indexes Used:**
- `journal_entries.by_user_date`
- `journal_entries.by_user_status_date`
- `journal_lines.by_entryId`

**Performance:**
- Query limited to `pageSize + 1` to detect `hasMore`
- Line fetches are batched per page

#### Query: getTransactionDetails

**File:** `convex/ledger/transactions.ts`

**Purpose:** Full details for a single transaction (detail view).

**Input:**
```typescript
{
  entryId: Id<"journal_entries">;
}
```

**Output:**
```typescript
{
  id: Id<"journal_entries">;
  date: number;
  description: string;
  status: "planned" | "posted" | "voided";
  type: "expense" | "income" | "transfer" | "other";
  lines: Array<{
    accountId: Id<"accounts">;
    accountName: string;
    accountType: string;
    direction: "debit" | "credit";
    amount: number;
    currencyCode: string;
  }>;
  installment?: { current: number; total: number };
  linkedEntries?: Array<{
    id: Id<"journal_entries">;
    date: number;
    description: string;
    installmentNumber?: number;
  }>; // child installments if this is parent
  sourceType?: string;
  sourceId?: string;
  isEditable: boolean;
  createdAt: number;
  updatedAt?: number;
}
```

---

### Page 4: Settings & Account Management

#### Query: getSettings

**File:** `convex/ledger/settings.ts`

**Purpose:** Get user settings and account summary for settings page.

**Output:**
```typescript
{
  user: {
    email: string;
    createdAt: number;
  };
  accounts: {
    assets: number; // count
    liabilities: number; // count (includes cards)
    cards: number; // count
    expenseCategories: number; // count
    incomeCategories: number; // count
  };
}
```

#### Query: listAccountsByType

**File:** `convex/ledger/accounts.ts`

**Purpose:** List accounts filtered by type for management views.

**Input:**
```typescript
{
  accountType?: "asset" | "liability" | "expense" | "income" | "equity";
  includeDeleted?: boolean; // defaults to false
}
```

**Output:**
```typescript
Array<{
  id: Id<"accounts">;
  description: string;
  accountType: string;
  defaultCurrency?: string;
  isCard: boolean; // true if has associated card record
  cardDetails?: {
    closingDay: number;
    dueDate: number;
  };
  balance?: number; // current balance in minor units (for asset/liability)
  isDeleted: boolean;
}>
```

#### Mutation: createAccount

**File:** `convex/ledger/accounts.ts`

**Purpose:** Create a new account.

**Input:**
```typescript
{
  description: string; // max 100 chars
  accountType: "asset" | "liability" | "expense" | "income";
  defaultCurrency?: string; // ISO 4217, defaults to "ARS"
  parentAccountId?: Id<"accounts">; // for hierarchy
  isCard?: boolean; // if liability, optionally create card record
  cardConfig?: {
    closingDay: number; // 1-31
    dueDay: number; // 1-31
  };
}
```

**Output:**
```typescript
{
  accountId: Id<"accounts">;
  status: "success";
}
```

**Business Logic:**
1. Validate user authentication
2. Validate description length (1-100 chars)
3. Validate accountType is allowed value
4. If parentAccountId provided, validate it exists and belongs to user
5. Check for cycle prevention in hierarchy
6. Insert account record
7. If isCard and accountType is "liability", create card record
8. Return new accountId

#### Mutation: updateAccount

**File:** `convex/ledger/accounts.ts`

**Purpose:** Update account details.

**Input:**
```typescript
{
  accountId: Id<"accounts">;
  description?: string;
  defaultCurrency?: string;
  cardConfig?: {
    closingDay?: number;
    dueDay?: number;
  };
}
```

**Validation:**
- Account must exist and belong to user
- Account must not be soft-deleted
- Description max 100 chars

#### Mutation: closeAccount

**File:** `convex/ledger/accounts.ts`

**Purpose:** Soft-delete an account after validation.

**Input:**
```typescript
{
  accountId: Id<"accounts">;
  force?: boolean; // skip balance check if true
}
```

**Business Logic:**
1. Validate ownership
2. Calculate current balance from journal_lines
3. If balance !== 0 and !force, return error with balance info
4. Check for pending obligations (planned entries referencing this account)
5. If obligations exist and !force, return error with count
6. Set softdelete = true, deletedAt = Date.now()

**Output:**
```typescript
{
  status: "success" | "has_balance" | "has_obligations";
  balance?: number; // if has_balance
  obligationCount?: number; // if has_obligations
}
```

---

## Technical Implementation Details

### File Structure

```
/
├── branding.md                   # REFERENCE: Single source of truth for visual design
│
├── convex/
│   └── ledger/
│       ├── home.ts               # NEW: Home dashboard queries
│       ├── transactions.ts       # NEW: Transaction list and details
│       ├── settings.ts           # NEW: Settings queries
│       ├── accounts.ts           # EXTEND: Add form helpers, management mutations
│       ├── transfers.ts          # EXISTS: Transfer mutations
│       ├── monthlySummary.ts     # EXISTS: Rollup-based summaries
│       ├── rollups.ts            # EXISTS: Pre-aggregation system
│       └── ...
│
├── src/
│   ├── index.css                 # CSS variables (aligned with branding.md)
│   ├── components/
│   │   ├── ui/                   # shadcn/ui primitives (Button, Card, Input, etc.)
│   │   ├── shared/               # NEW: Reusable compound components
│   │   │   ├── TransactionRow.tsx    # From branding.md > Compound Components
│   │   │   ├── CategoryBadge.tsx     # From branding.md > Compound Components
│   │   │   ├── AmountDisplay.tsx     # From branding.md > Compound Components
│   │   │   ├── EmptyState.tsx        # From branding.md > Empty States
│   │   │   ├── ErrorState.tsx        # From branding.md > Error States
│   │   │   └── skeletons/            # From branding.md > Loading States
│   │   │       ├── CardSkeleton.tsx
│   │   │       └── TransactionSkeleton.tsx
│   │   ├── TransactionForm.tsx       # NEW: Unified transaction form
│   │   ├── home/
│   │   │   ├── BalanceCard.tsx       # NEW: Net balance display
│   │   │   ├── MonthlySummary.tsx    # NEW: Income/expense summary
│   │   │   ├── TopCategories.tsx     # NEW: Category breakdown chart
│   │   │   └── UpcomingPayments.tsx  # NEW: Upcoming obligations list
│   │   ├── transactions/
│   │   │   ├── TransactionList.tsx   # NEW: Paginated transaction list
│   │   │   └── TransactionDetail.tsx # NEW: Full transaction view
│   │   └── settings/
│   │       ├── AccountList.tsx       # NEW: Account management list
│   │       └── AccountForm.tsx       # NEW: Create/edit account form
│   └── pages/
│       ├── HomePage.tsx              # REWRITE: Use new ledger queries
│       ├── ManageTransactionsPage.tsx # REWRITE: Use new list query
│       └── ConfigPage.tsx            # REWRITE: Use new settings queries
```

> **Note:** Shared components (`TransactionRow`, `EmptyState`, etc.) are implementations of patterns defined in `branding.md`. They should be created first in Sprint 1 and reused across all pages.

### Implementation Order

**Sprint 1: Home Dashboard (Week 1-2)**
1. **Verify branding.md alignment** — Ensure `src/index.css` CSS variables match branding.md
2. **Create shared components** — Implement reusable patterns from branding.md:
   - `src/components/shared/EmptyState.tsx`
   - `src/components/shared/ErrorState.tsx`
   - `src/components/shared/skeletons/CardSkeleton.tsx`
   - `src/components/shared/AmountDisplay.tsx`
3. Create `convex/ledger/home.ts` with `getHomeDashboard`, `getTopCategories`, `getUpcomingObligations`
4. Build Home UI components (`BalanceCard`, `MonthlySummary`, `TopCategories`, `UpcomingPayments`)
5. Rewrite `HomePage.tsx` to use new queries and shared components

**Sprint 2: Transaction Form (Week 3-4)**
1. Create `TransactionForm.tsx` component
2. Add `getAccountsForForm` query
3. Integrate with existing mutations (dual-write already enabled)
4. Add smart defaults and localStorage persistence
5. Replace existing expense/income drawers

**Sprint 3: Transactions List (Week 5-6)**
1. **Create shared components** (if not already done):
   - `src/components/shared/TransactionRow.tsx` (from branding.md pattern)
   - `src/components/shared/skeletons/TransactionSkeleton.tsx`
   - `src/components/shared/CategoryBadge.tsx`
2. Create `convex/ledger/transactions.ts` with `listTransactions`, `getTransactionDetails`
3. Build list UI components with pagination
4. Add filtering UI
5. Rewrite `ManageTransactionsPage.tsx`

**Sprint 4: Settings (Week 7-8)**
1. Create `convex/ledger/settings.ts`
2. Extend `convex/ledger/accounts.ts` with management mutations
3. Build settings UI components
4. Rewrite `ConfigPage.tsx`

### Index-First Design

All queries must use existing indexes. **Verification Status: ✅ All indexes confirmed in `convex/schema.ts`**

| Query | Index Used | Schema Verification |
|-------|------------|---------------------|
| `getHomeDashboard` | `monthly_rollups.by_user_month` | ✅ Line 347 |
| `getHomeDashboard` | `journal_entries.by_user_status_date` | ✅ Line 145 |
| `getTopCategories` | `monthly_rollups.by_user_month` | ✅ Line 347 |
| `getTopCategories` | `accounts.by_user_type` | ✅ Line 121 |
| `getUpcomingObligations` | `journal_entries.by_user_status_date` | ✅ Line 145 |
| `getUpcomingObligations` | `card_statements.by_dueDate_status` | ✅ Line 377 |
| `getUpcomingObligations` | `recurring_entries.by_user_status_nextDueDate` | ✅ Line 255 |
| `listTransactions` | `journal_entries.by_user_date` | ✅ Line 143 |
| `listTransactions` | `journal_lines.by_entryId` | ✅ Line 163 |
| `listAccountsByType` | `accounts.by_user_type` | ✅ Line 121 |

> **Pre-Implementation Requirement:** Before implementing any query, verify the index exists in `convex/schema.ts` and supports the intended query pattern (equality filters before range filters).

### Defensive Programming Standards

All queries and mutations must:
```typescript
// 1. Validate authentication
const identity = await ctx.auth.getUserIdentity();
if (!identity) {
  throw new ConvexError({ code: "UNAUTHORIZED", message: "Not authenticated" });
}

// 2. Validate user exists
const user = await ctx.db
  .query("users")
  .withIndex("by_auth0Id", (q) => q.eq("auth0Id", identity.subject))
  .first();
if (!user) {
  throw new ConvexError({ code: "USER_NOT_FOUND", message: "User not found" });
}

// 3. Validate input parameters
if (args.pageSize < 1 || args.pageSize > 100) {
  throw new ConvexError({ code: "INVALID_INPUT", message: "pageSize must be 1-100" });
}

// 4. Null-safe data access
const accountName = account?.description ?? "Unknown Account";
```

### Function Reference Discipline

```typescript
// ✅ CORRECT: Public queries use api.*
const dashboard = await ctx.runQuery(api.ledger.home.getHomeDashboard, {});

// ✅ CORRECT: Internal functions use internal.*
await ctx.runMutation(internal.ledger.rollups.updateRollupsOnTransaction, {
  journalEntryId: entryId,
  updateType: "create",
});

// ❌ WRONG: Never call internal from client
// const result = await ctx.runQuery(internal.ledger.something, {});
```

## Constraints & Non-Functional Requirements

### Performance

| Metric | Target | Measurement |
|--------|--------|-------------|
| Home initial render | < 1 second | Time from navigation to first contentful paint |
| Transactions first page | < 500ms | Server query time |
| Form submission feedback | < 200ms | Time from submit to loading state |
| Pagination load | < 300ms | Time to load next page |

### Data Integrity

- All writes maintain zero-sum invariant in journal entries
- Rollups updated synchronously on writes (best-effort, with scheduled reconciliation)
- Soft deletes preserve historical references
- No orphaned journal_lines (referential integrity via foreign keys)

### Security

- All queries scoped by `userId` (multi-tenant isolation)
- Account operations validate ownership before modification
- No sensitive data in client-side localStorage (only IDs)
- Audit trail maintained via `createdBy`, `updatedBy` fields

### Compatibility

- Existing mutations continue to work (dual-write is stable)
- Legacy tables remain intact during transition
- Gradual page-by-page rollout with no big-bang switch

## Out of Scope

The following are explicitly **NOT** included in this phase:

- Bulk transaction operations (multi-select, bulk delete)
- Advanced reporting and analytics
- Investment portfolio tracking
- Debt management and projections
- Goal/savings tracking
- Data export (CSV, PDF)
- Bank statement import
- Multi-user/household features
- Push notifications
- Offline support

## Success Metrics

### Analytics & Monitoring Requirements

**User Behavior Tracking (Client-Side):**
- [ ] Track "Add Transaction" button clicks by source (Home vs Navigation)
- [ ] Track transaction form completion funnel: open → type selected → amount entered → submitted
- [ ] Track form abandonment with last active field
- [ ] Track transaction type distribution (expense/income/transfer ratios)
- [ ] Track filter usage patterns on Transactions list

**Performance Monitoring:**
- [ ] Log query latency distribution (p50, p95, p99) for all new queries
- [ ] Monitor Home dashboard load time with real user data
- [ ] Track pagination performance for Transactions list
- [ ] Alert on queries exceeding 2x target (Home > 2s, Transactions > 1s)

**Error Monitoring:**
- [ ] Log all ConvexError occurrences with error codes
- [ ] Track client-side error rates by page
- [ ] Monitor rollup staleness and fallback usage rates
- [ ] Alert on error rate > 1% for any query

**Implementation Notes:**
- Use existing Convex logging for server-side metrics
- Consider Vercel Analytics or PostHog for client-side tracking (decision: Sprint 1)
- No PII in analytics events (only anonymized user IDs)

### Deliverables Checklist

**Sprint 1: Home**
- [ ] `getHomeDashboard` query implemented and tested
- [ ] `getTopCategories` query implemented and tested
- [ ] `getUpcomingObligations` query implemented and tested
- [ ] Home page UI redesigned and deployed
- [ ] No legacy queries in Home page
- [ ] Performance target met (< 1s)

**Sprint 2: Transaction Form**
- [ ] `TransactionForm` component implemented
- [ ] Supports Expense, Income, Transfer types
- [ ] Smart defaults working
- [ ] Installments option working
- [ ] Integrated with existing mutations
- [ ] Replaced legacy expense/income drawers

**Sprint 3: Transactions List**
- [ ] `listTransactions` query with pagination
- [ ] `getTransactionDetails` query
- [ ] Transactions page UI redesigned
- [ ] Filtering working
- [ ] Performance target met (< 500ms)

**Sprint 4: Settings**
- [ ] Account management CRUD working
- [ ] Card configuration working
- [ ] Settings page UI redesigned
- [ ] All legacy settings preserved

### Quality Gates

**Global Quality Gates:**
- [ ] >85% unit test coverage for new queries
- [ ] Integration tests for all page data flows
- [ ] No TypeScript errors (strict mode)
- [ ] No console errors in production
- [ ] Lighthouse performance score > 90
- [ ] Accessibility audit passed (WCAG 2.1 AA)

**Sprint 1 Pre-Launch Checklist (Home Dashboard):**
- [ ] `branding.md` design system applied (no separate design-tokens file needed)
- [ ] CSS variables in `src/index.css` verified against branding.md Color System
- [ ] Poppins font loaded via Google Fonts (see branding.md > Typography)
- [ ] `getHomeDashboard` query tested with < 1s response time
- [ ] Error states use `ErrorState` component pattern from branding.md
- [ ] Loading skeletons use `CardSkeleton` pattern from branding.md
- [ ] Empty state uses `EmptyState` component pattern from branding.md
- [ ] Dark mode tested with `.dark` class, contrast validated

**Sprint 2 Pre-Launch Checklist (Transaction Form):**
- [ ] TransactionForm type-switching tested for all 6 transition combinations
- [ ] Smart defaults fallback tested (empty localStorage scenario)
- [ ] localStorage persistence tested across browser sessions
- [ ] Form validation error messages displayed inline
- [ ] Installments UI expandable section working
- [ ] Recurring UI expandable section working
- [ ] Mutual exclusivity between Installments and Recurring tested
- [ ] All three submission paths tested (expense, income, transfer)

**Sprint 3 Pre-Launch Checklist (Transactions List):**
- [ ] Cursor-based pagination tested with 1000+ transactions
- [ ] Filter combinations tested (date + type + account + status)
- [ ] Empty state UI implemented for no matches
- [ ] Swipe actions tested on mobile devices
- [ ] isEditable rules verified for all sourceTypes
- [ ] Detail view displays all transaction data correctly
- [ ] Performance: first page < 500ms verified

**Sprint 4 Pre-Launch Checklist (Settings):**
- [ ] Account closure workflow tested with balance validation
- [ ] Account closure workflow tested with pending obligations
- [ ] Card configuration (closing day, due day) working
- [ ] Settings navigation structure validated
- [ ] "Coming Soon" badges displayed for Security/Notifications
- [ ] All existing settings functionality preserved

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Design inconsistency across pages | Low | **`branding.md` is single source of truth** — all pages reference same patterns |
| Performance regression with new queries | High | Use existing indexes; benchmark before deploy |
| Data discrepancy between legacy and ledger | High | Dual-write already stable; add reconciliation checks |
| Complex form state management | Medium | Use React Hook Form with Zod validation |
| Pagination edge cases | Low | Cursor-based pagination with stable sort keys |
| Category/account mapping confusion | Medium | Clear UI labels distinguishing accounts from categories |
| branding.md drift from implementation | Medium | Code review checklist includes branding.md compliance check |

## Appendix

### Glossary

- **Ledger**: The double-entry accounting system using `journal_entries` and `journal_lines`
- **Rollup**: Pre-aggregated monthly sums stored in `monthly_rollups` for fast queries
- **Minor Units**: Currency amounts stored as integers (e.g., cents for USD, pesos for ARS with scale 0)
- **Dual-Write**: Writing to both legacy tables (`expenses`) and ledger tables simultaneously
- **Planned Entry**: A `journal_entries` record with `status = 'planned'` representing future obligations

### References

- Completed Phases: 1 (Foundation), 2 (Migration), 3 (Dual-Write), 4 (Features), 5 (Cards)
- Design System: shadcn/ui + Tailwind CSS
- Convex Docs: https://docs.convex.dev/

### Related Documents

- **`branding.md`** — **PRIMARY VISUAL REFERENCE** — Complete design system for all UI work
- `planning/accounting.md` — Master project plan
- `planning/accountingSteps/Phase5-Card-Statements-Settlement-PRD.md` — Previous phase
- `convex/schema.ts` — Current database schema
- `.cursor/prompts/planningExecution/X - UIdev.md` — UI development prompt guidelines

