# PerFi - Personal Finance Tracker

PerFi is a comprehensive personal finance tracking application built with React + Vite on the frontend and Convex on the backend. It features a complete **double-entry accounting ledger system**, automated transaction processing, multi-currency support, and intelligent financial insights.

## Features

### Core Financial Management
- **Double-Entry Accounting**: Complete ledger system with journal entries, zero-sum validation, and audit trails
- **Transaction Management**: Add, edit, verify, and manage expenses and income with category tracking
- **Recurring Transactions**: Automated processing with daily/weekly/monthly/semestral/yearly frequencies
- **Credit Card Scheduling**: Installment payment schedules with closing and due day logic
- **Automated Card Statements**: Statement calculation on closing dates and settlement posting on due dates

### Budgeting & Analytics
- **Flexible Budgets**: Three scope types (single account, multiple accounts, account type) with real-time execution tracking
- **Budget History**: Automated period rollover with historical trend analysis
- **Pre-Aggregated Rollups**: Monthly summaries for sub-second dashboard performance
- **Financial Projections**: 4-month forward-looking view combining recurring items and installments

### Multi-Currency Support
- **Real-Time Exchange Rates**: Integration with multiple API providers (ExchangeRate-API, CurrencyAPI, AbstractAPI)
- **Cross-Currency Transfers**: Account-to-account transfers with automatic rate conversion
- **Historical Rates**: Accurate retrospective currency conversions

### User Experience
- **Mobile-First Design**: Drawer-based navigation optimized for mobile devices
- **Real-Time Sync**: Live data synchronization powered by Convex
- **Verification Workflow**: Review and verify auto-generated transactions
- **Dark/Light Mode**: Theme support across all components

## Tech Stack

- **Frontend**: React 18, Vite, TypeScript, TailwindCSS, Radix UI, shadcn/ui
- **Backend**: Convex (TypeScript) with cron jobs, actions, and internal mutations
- **Authentication**: Auth0 via `@auth0/auth0-react` and Convex integration
- **Data Visualization**: Recharts, Chart.js
- **Testing**: Playwright (E2E), Vitest (unit)

## Project Structure

```
src/                  # React application
├── pages/            # Page components
├── components/       # UI components
│   └── ui/           # shadcn/ui components
├── context/          # React context providers
├── hooks/            # Custom hooks
└── lib/              # Utility functions

convex/               # Convex backend
├── ledger/           # Double-entry accounting system
│   ├── accounts.ts   # Chart of accounts management
│   ├── budgets.ts    # Budget CRUD operations
│   ├── transfers.ts  # Account-to-account transfers
│   ├── rollups.ts    # Pre-aggregation system
│   ├── cardStatements.ts  # Card billing automation
│   └── exchangeRates.ts   # Multi-currency support
├── migrations/       # Data migration utilities
├── internal/         # Private helper functions
└── schema.ts         # Database schema

planning/             # Documentation
├── summary.md        # Comprehensive project overview
├── onboarding.md     # Onboarding strategy
└── accountingSteps/  # Phase-by-phase implementation docs

tests/                # Playwright E2E tests
debugging/            # Developer guides and error resolution
```

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create `.env.local` with:

```env
CONVEX_DEPLOY_KEY=
CONVEX_DEPLOYMENT=
VITE_CONVEX_URL=
VITE_AUTH0_DOMAIN=
VITE_AUTH0_CLIENT_ID=
VITE_AUTH0_AUDIENCE=
RESEND_API_KEY=
VITE_APP_URL=
```

### 3. Development

```bash
# Start frontend + backend
npm run dev

# Frontend only
npm run dev:frontend

# Backend only
npm run dev:backend
```

### 4. Build & Deploy

```bash
npm run build
npm run lint
```

## Testing

```bash
# Unit tests
npm run test

# Unit tests (watch mode)
npm run test:watch

# E2E tests (requires dev server)
npm run test:e2e
```

## Backend Operations

```bash
# Run Convex dashboard
npx convex dashboard

# Run a specific mutation
npx convex run expenses:migratePaymentSchedules

# Check deployment status
npx convex status
```

## Architecture Highlights

### Dual-Write System
The application maintains both legacy tables (`expenses`) and modern ledger tables (`journal_entries`, `journal_lines`) with synchronized writes. This enables gradual migration while maintaining backward compatibility.

### Pre-Aggregation System
Monthly rollups provide O(accounts) query complexity instead of O(transactions), achieving:
- Home dashboard: < 1 second load time
- Budget execution: < 200ms query time
- Daily reconciliation ensures data consistency

### Automated Processing
Convex cron jobs handle:
- **Midnight**: Recurring transaction processing
- **01:00 UTC**: Card statement calculation
- **02:00 UTC**: Rollup reconciliation
- **03:00 UTC**: Settlement posting

## Documentation

- `planning/summary.md` - Complete system overview
- `planning/accountingSteps/` - Phase implementation details
- `debugging/WARP.md` - Development environment guide
- `debugging/CRITICAL_ERRORS_GUIDE.md` - Error resolution patterns

## Current Status

**Completed Phases:**
- ✅ Phase 1-3: Double-entry ledger with dual-write
- ✅ Phase 3.5: Exchange rate integration
- ✅ Phase 4.1: Cross-currency transfers
- ✅ Phase 4.2: Flexible budget system
- ✅ Phase 4.3: Budget historical tracking
- ✅ Phase 4.4: Pre-aggregation system
- ✅ Phase 5: Card statements & settlement

**In Progress:**
- 🔄 Phase 6v2: UI Remodel with ledger-first queries

## Contributing

See `planning/summary.md` for the comprehensive system overview and `planning/accountingSteps/` for detailed implementation specifications.
