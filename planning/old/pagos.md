# Payment and Recurring Transactions Implementation Plan

## Phase 1: Advanced Installment Scheduling ("Cuotas" Management) ✅
**Goal**: To allow users to accurately track expenses made with multiple installments ("cuotas"). Each installment will have a precisely calculated due date based on enhanced payment type configurations. All expenses will still be manually entered at this stage.

### 1. Database Schema Changes (Convex) ✅

#### paymentTypes Table ✅
- ✅ Add `isCredit`: boolean (Default: false. If true, uses closingDay/dueDay logic; if false, due date is transaction date)
- ✅ Add `closingDay`: number | null (Integer 1-31, day of month for billing cycle close; applicable if isCredit is true)
- ✅ Add `dueDay`: number | null (Integer 1-31, day of month for payment due; applicable if isCredit is true)
- ✅ (No change to existing name, userId, softdelete fields)
- ✅ Index: by_user_softdelete (existing)

#### expenses Table ✅
- ✅ Add `nextDueDate`: number (Timestamp: Due date of the first/next installment)
- ✅ Add `verified`: boolean (Default: true. All expenses in this phase are manual, hence verified)
- ✅ Add `recurringTransactionId`: string | null (Type: ID referencing recurringTransactions. Default: null)
- ✅ (No change to existing amount, category, categoryId, cuotas, date, description, paymentTypeId, transactionType, userId, softdelete fields)
- ✅ Index: by_user (existing)

#### paymentSchedules Table (NEW) ✅
- ✅ `userId`: string (Type: ID referencing users)
- ✅ `expenseId`: string (Type: ID referencing expenses)
- ✅ `paymentTypeId`: string (Type: ID referencing paymentTypes)
- ✅ `amount`: number (Float64: Amount for this specific installment)
- ✅ `dueDate`: number (Float64: Timestamp for this installment's due date)
- ✅ `installmentNumber`: number (Float64: The sequence number of this installment)
- ✅ `totalInstallments`: number (Float64: Total number of installments)
- ✅ `softdelete`: boolean (Optional Boolean: Flag for soft deletion)
- ✅ Indexes: by_expenseId on expenseId, by_user_dueDate on (userId, dueDate)

### 2. Backend Logic & API Endpoints (Convex) ✅

#### convex/auth.ts ✅
- ✅ Modified `createUser` mutation with default payment types configuration

#### convex/expenses.ts ✅
- ✅ Modified payment type management functions
- ✅ Added payment schedule generation logic
- ✅ Implemented expense CRUD operations with schedule management

### 3. Frontend Structure & Components (React with TypeScript) ✅
- ✅ Updated ConfigPage.tsx for payment type configuration
- ✅ Modified AddExpensePage.tsx and AddIncomePage.tsx
- ✅ Enhanced ManageTransactionsPage.tsx with payment schedule display

### 4. Deliverables/Outcomes for Phase 1 ✅
- ✅ Payment type configuration with credit card-like billing cycles
- ✅ Automatic nextDueDate calculation
- ✅ Payment schedule generation
- ✅ Installment payment breakdown view

## Phase 2: Recurring Transactions & Verification Workflow ✅
**Goal**: To enable users to define recurring transactions and introduce a verification workflow for auto-generated transactions.

### 1. Database Schema Changes (Convex) ✅
- ✅ Created recurringTransactions table with all required fields and indexes

### 2. Backend Logic & API Endpoints (Convex) ✅
- ✅ Implemented CRUD operations for recurring transactions
- ✅ Added scheduled processing function
- ✅ Modified expense handling for recurring transactions

### 3. Frontend Structure & Components (React with TypeScript) ✅
- ✅ Created RecurringTransactionForm.tsx
- ✅ Created RecurringTransactionList.tsx
- ✅ Enhanced ManageTransactionsPage.tsx

### 4. Deliverables/Outcomes for Phase 2 ✅
- ✅ Recurring transaction management
- ✅ Automatic transaction generation
- ✅ Verification workflow
- ✅ Integration with installment scheduling

## Phase 3: Future Payment Projection & Visualization (In Progress) 🔄
**Goal**: To provide users with a clear forecast of their upcoming financial obligations and income.

### 1. Backend Logic & API Endpoints (Convex) ✅
- ✅ Created `api.projections.getProjectedPayments` query with:
  - ✅ Scheduled installments fetching
  - ✅ Recurring transactions simulation
  - ✅ Data combination and sorting
  - ✅ Pagination support
  - ✅ Caching implementation

### 2. Frontend Structure & Components (React with TypeScript) ✅
- ✅ Created ProjectionPage.tsx with:
  - ✅ List view for chronological display
  - ✅ Calendar view for date-based visualization
  - ✅ Summary statistics (expenses, income, net flow)
  - ✅ Charts (pie chart for category distribution)
  - ✅ Date range picker
  - ✅ Filtering and sorting capabilities

### 3. Deliverables/Outcomes for Phase 3 🔄
- ✅ Dedicated "Projections" page implementation
- ✅ Financial event forecasting system
- ✅ Summary statistics and visualizations
- 🔄 Enhanced financial planning capabilities
- 🔄 Integration with existing payment schedules
- 🔄 Recurring transaction simulation

## Technical Considerations

### Performance ✅
- ✅ Efficient indexing
- ✅ Pagination support
- ✅ Caching implementation
- ✅ Background job optimization

### Security ✅
- ✅ Authorization checks
- ✅ Input validation
- ✅ Rate limiting
- ✅ Audit logging

### Testing (In Progress) 🔄
- 🔄 Unit tests for new functions
- 🔄 Integration tests for critical flows
- 🔄 End-to-end tests for user journeys
- 🔄 Performance tests for heavy operations

## Migration Plan
1. ✅ Deploy database schema changes
2. ✅ Implement backend functionality
3. ✅ Add frontend components
4. 🔄 Test thoroughly in staging
5. ⏳ Deploy to production
6. ⏳ Monitor for issues

## Future Enhancements
1. Advanced Visualization
   - Add more chart types
   - Implement interactive dashboards
   - Add export functionality
   - Add custom report generation

2. Smart Projections
   - Implement machine learning for better predictions
   - Add trend analysis
   - Add anomaly detection
   - Add budget recommendations

3. User Experience
   - Add drag-and-drop calendar events
   - Implement custom views
   - Add notification system
   - Improve mobile experience

4. Integration
   - Add export to calendar apps
   - Add integration with financial tools
   - Add API for third-party apps
   - Add webhook support

## Conclusion
The implementation of the payment and recurring transactions system, along with the projection feature, provides users with a comprehensive tool for managing their finances. The system allows for detailed tracking of installments, automatic handling of recurring transactions, and clear visualization of future financial obligations and income.

The modular design allows for future enhancements and scalability, while the thorough testing and migration plans ensure a smooth deployment process. The system's focus on user experience and performance makes it a valuable tool for personal financial management.
