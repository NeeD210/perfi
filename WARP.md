# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Essential Commands

### Development
```bash
# Start development environment (frontend + backend)
npm run dev

# Start frontend only
npm run dev:frontend

# Start backend only  
npm run dev:backend

# Build for production
npm run build

# Run linting and type checks
npm run lint
```

### Testing
```bash
# Run unit tests
npm run test

# Run unit tests in watch mode
npm run test:watch

# Run end-to-end tests (requires dev server running)
npm run test:e2e
```

### Convex Backend Operations
```bash
# Run a specific mutation (example: migrate payment schedules)
npx convex run expenses:migratePaymentSchedules

# Run migrations manually
npx convex run migrations:runMigration

# Access Convex dashboard for debugging
npx convex dashboard
```

## Architecture Overview

**PerFi** is a personal finance application featuring a React frontend with a Convex real-time backend. The app implements a dual-system architecture with both legacy transaction tables and a modern double-entry accounting ledger system.

### Core Systems

#### 1. Transaction Management
- **Legacy System**: `expenses` table storing all transactions (income/expense)
- **Modern System**: Double-entry ledger with `journal_entries` and `journal_lines`
- **Dual-Write**: Feature flag `LEDGER_DUAL_WRITE_ENABLED` controls simultaneous writes to both systems

#### 2. Recurring Transactions
- Automated processing via daily cron jobs (`convex/crons.ts`)
- Complex scheduling logic supporting daily/weekly/monthly/semestral/yearly frequencies
- Verification workflow for reviewing auto-generated transactions

#### 3. Payment Scheduling
- Credit card installment scheduling with closing/due date logic
- Automatic schedule generation for expenses with multiple installments (`cuotas`)
- Integration with `paymentSchedules` table for future payment tracking

#### 4. Financial Projections
- Forward-looking 4-month projections combining recurring transactions and installment schedules
- Optimized queries with batch processing for performance

### Key Database Tables

#### Legacy Transaction System
- `expenses` - All financial transactions (despite name, includes income)
- `categories` - User-defined expense/income categories  
- `paymentTypes` - Payment methods with credit card support
- `recurringTransactions` - Recurring transaction templates
- `paymentSchedules` - Generated installment schedules

#### Modern Ledger System
- `accounts` - Chart of accounts for double-entry bookkeeping
- `journal_entries` - Transaction entries with metadata
- `journal_lines` - Individual debit/credit lines
- `cards` - Credit card specific data
- `*_mappings` tables - Bridge legacy and modern systems

### Migration Architecture
The system is currently in Phase 3 of a multi-phase migration:
- **Phase 1**: Foundation setup ✅
- **Phase 2**: Recurring transactions ✅  
- **Phase 3**: Dual-write implementation ✅
- **Phase 4+**: Future enhancements planned

Migration progress is tracked in `migration_progress` table with atomic operations.

## Frontend Architecture

### Tech Stack
- React 18 + TypeScript + Vite
- TailwindCSS + Radix UI + shadcn/ui components
- React Router for routing
- Auth0 for authentication
- Chart.js/Recharts for visualizations

### Key Components

#### Navigation Structure
- **Bottom Navigation**: 5-tab layout (Home, Projections, Add, Transactions, Settings)
- **Drawer-based Forms**: Mobile-optimized transaction entry
- **Route-based Pages**: Each major feature as separate page component

#### Transaction Management
- `ManageTransactionsPage.tsx` - Main transaction list with filtering/verification
- `AddExpensePage.tsx` / `AddIncomePage.tsx` - Transaction entry forms
- `RecurringTransactionForm.tsx` - Complex recurring transaction setup

#### Data Visualization
- `HomePage.tsx` - Dashboard with doughnut and bar/line charts
- `ProjectionPage.tsx` - Forward-looking financial projections
- Custom chart components using Chart.js

### State Management
- Convex React hooks for real-time data synchronization
- Local component state for UI interactions
- Theme context for dark/light mode

## Development Rules and Patterns

### From Cursor Rules (.cursor/rules/)

#### Development Agent Guidelines
- **Implement First**: Default to writing code rather than planning
- **Tech Stack Adherence**: Strict conformance to React/TypeScript/Convex ecosystem
- **Production-Ready Code**: Robust error handling and type safety required
- **Code Quality**: Follow Prettier formatting and ESLint rules

#### Convex Best Practices
- Use new function syntax with validators for all functions
- Always include `args` and `returns` validators
- Use `ctx.runQuery`/`ctx.runMutation`/`ctx.runAction` for function calls
- Prefer single mutations over multiple calls to avoid race conditions
- Use `internal` for private functions, `api` for public ones

#### UI/UX Standards
- Mobile-first design approach
- TailwindCSS for all styling (no custom CSS files)
- Radix UI primitives with shadcn/ui patterns
- Recharts/Chart.js for data visualization only

### Architecture Constraints

#### Dual-Write System
When working with transactions:
1. Check `LEDGER_DUAL_WRITE_ENABLED` flag in `convex/ledger/dualWriteConfig.ts`
2. If enabled, write to both legacy tables AND ledger tables
3. Use proper error handling and idempotency keys
4. Leverage mapping tables to connect legacy and modern systems

#### Authentication
- All backend functions must validate user identity via `ctx.auth.getUserIdentity()`
- Frontend uses Auth0 React hooks
- User creation/updates handled in `convex/auth.ts`

#### Recurring Transactions
- Complex scheduling logic in `convex/lib/scheduling.ts`
- Daily cron processing at midnight via `convex/crons.ts`
- Verification workflow requires unverified transaction handling

## Important Files and Directories

### Configuration
- `package.json` - Dependencies and npm scripts
- `convex/schema.ts` - Complete database schema
- `convex/ledger/dualWriteConfig.ts` - Feature flags for dual-write
- `.cursor/rules/` - Development guidelines and coding standards

### Core Business Logic  
- `convex/expenses.ts` - Main transaction CRUD operations
- `convex/recurring.ts` - Recurring transaction management
- `convex/ledger/` - Modern accounting system implementation
- `convex/migrations/` - Database migration utilities

### Frontend Entry Points
- `src/App.tsx` - Main application with routing and navigation
- `src/pages/` - All major page components  
- `src/components/` - Reusable UI components
- `src/components/ui/` - shadcn/ui component implementations

### Documentation
- `README.md` - Setup and basic usage instructions
- `planning/summary.md` - Comprehensive project overview
- `docs/` - Detailed implementation and deployment guides

## Environment Variables

Required in `.env.local`:
- `CONVEX_DEPLOY_KEY` - Convex deployment credentials
- `CONVEX_DEPLOYMENT` - Deployment identifier
- `VITE_CONVEX_URL` - Convex API endpoint
- `VITE_AUTH0_DOMAIN` - Auth0 domain
- `VITE_AUTH0_CLIENT_ID` - Auth0 client ID
- `VITE_AUTH0_AUDIENCE` - Auth0 API identifier
- `RESEND_API_KEY` - Email service API key
- `VITE_APP_URL` - Application URL for callbacks

## Testing Strategy

### Unit Tests (Vitest)
- Focus on business logic in `convex/lib/` 
- Date calculations and scheduling algorithms
- Data transformation utilities

### E2E Tests (Playwright)
- Critical user flows: sign-in, transaction creation, recurring setup
- UI component interactions
- Cross-browser compatibility

### Manual Testing
- Transaction verification workflow
- Recurring transaction processing
- Payment schedule generation
- Financial projection accuracy

## Performance Considerations

### Backend Optimization
- Use proper Convex indexes for all queries
- Batch operations where possible (especially in projections)
- Leverage `internal` functions for complex operations
- Implement idempotency for cron jobs and migrations

### Frontend Optimization  
- React.memo for expensive chart components
- Proper loading states for all data fetching
- Optimistic updates where appropriate
- Image optimization for logos and assets

## Deployment Notes

The application supports multiple deployment environments:
- Development: Local Convex dev server
- Staging: Convex cloud deployment  
- Production: Full cloud deployment with custom domain

Migration coordination between environments is critical due to the dual-write system. Always run preflight checks before production deployments.