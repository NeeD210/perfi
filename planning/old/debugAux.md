# Debugging Auxiliary: Recurring Transactions & Cronjob Logic

## 1. What is a Recurring Transaction?
A **recurring transaction** is a template that defines an expense or income that repeats on a regular schedule (daily, weekly, monthly, semestrally, or yearly). It is stored in the `recurringTransactions` table in the database.

### Key Fields in `recurringTransactions`:
- `userId`: The owner of the recurring transaction
- `description`, `amount`, `categoryId`, `paymentTypeId`, `transactionType`
- `frequency`: How often it repeats ("daily", "weekly", "monthly", "semestrally", "yearly")
- `startDate`, `endDate`: When the recurrence starts/ends
- `lastProcessedDate`: When the transaction was last generated
- `nextDueDateCalculationDay`: (Optional) Used for monthly/yearly to track the day of the month
- `isActive`, `softdelete`, `cuotas`: Status and installment info

## 2. Creation Flow
- When a user creates a recurring transaction (via the frontend form), the backend mutation `addRecurringTransaction` is called.
- The backend validates the input and inserts a new document into `recurringTransactions`.
- **Initial Transaction Generation:**
  - After creation, the backend immediately generates all due transactions from the `startDate` up to the current date. This is done by repeatedly calling `generateTransactionFromRecurring` for each due date in the past.
  - Each generated transaction is inserted into the `expenses` table, linked by `recurringTransactionId`.
  - If the transaction is an installment (cuotas > 1), payment schedules are also generated.

## 3. Cronjob Processing
- A cronjob is defined in `convex/crons.ts`:
  - `crons.cron("processRecurringTransactions", "0 0 * * *", internal.internal.recurring.processRecurringTransactions);`
  - This runs every day at midnight.
- The cronjob triggers the internal action `processRecurringTransactions` (see `convex/internal/recurring.ts`).

## 4. How Due Transactions Are Detected and Processed
- The action queries for all active, non-deleted recurring transactions that are due for processing (using `getRecurringTransactionsToProcess`).
- For each due recurring transaction:
  - It calls `generateTransactionFromRecurring`, which:
    - Creates a new expense for the current due date
    - Updates `lastProcessedDate` to prevent duplicate processing
    - Generates payment schedules if needed
- The logic for determining if a transaction is due is based on comparing `lastProcessedDate` and the frequency to the current date.

## 5. Integration with Expenses and Payment Schedules
- Each generated expense is a real transaction in the `expenses` table, with a reference to its parent recurring transaction.
- If the expense is an installment (cuotas > 1), payment schedules are generated and stored in the `paymentSchedules` table.
- This allows the app to show both upcoming recurring transactions and detailed installment breakdowns.

## 6. Edge Cases & Design Notes
- If a recurring transaction is created with a start date in the past, all missed transactions are generated immediately.
- If a recurring transaction is edited, only the provided fields are updated; logic ensures no data loss.
- The field `nextDueDateCalculationDay` is only set for monthly/yearly frequencies and is used for advanced due date logic.
- Soft-deleted or inactive recurring transactions are ignored by the cronjob.

## 7. Key Files & Functions
- `convex/recurring.ts`: Main logic for recurring transaction creation and updates
- `convex/internal/recurring.ts`: Cronjob action and processing logic
- `convex/crons.ts`: Cronjob schedule definition
- `convex/schema.ts`: Database schema definitions
- `src/components/recurring/RecurringTransactionForm.tsx`: Frontend form for creating/editing recurring transactions

## 8. How Are Recurring Transactions Determined to Be "Due for Processing"?
A recurring transaction is considered **due for processing** if:
- It is active (`isActive` is true)
- It is not soft-deleted (`softdelete` is false)
- Its `lastProcessedDate` is **before** a calculated threshold based on its frequency

This logic is implemented in the `getRecurringTransactionsToProcess` function (see `convex/internal.ts` and `convex/recurring.ts`):

```js
return await ctx.db
  .query("recurringTransactions")
  .filter((q) => q.eq(q.field("isActive"), true))
  .filter((q) => q.eq(q.field("softdelete"), false))
  .filter((q) => {
    const frequency = q.field("frequency") as unknown as string;
    const threshold = determineLastProcessingThreshold(frequency, currentTimestamp);
    return q.lt(q.field("lastProcessedDate"), threshold);
  })
  .collect();
```

The threshold is calculated as:
- For `"daily"`: 1 day ago
- For `"weekly"`: 7 days ago
- For `"monthly"`: 1 month ago
- For `"semestrally"`: 6 months ago
- For `"yearly"`: 1 year ago

If the `lastProcessedDate` is before this threshold, the transaction is due and will be processed by the cronjob.

**Summary:**
A recurring transaction is "due" if it hasn't been processed since its frequency interval elapsed. The cronjob checks this every day and processes all such transactions.

---
This document should help you debug, extend, or reason about the recurring transaction and cronjob system in Expense Vibing. 