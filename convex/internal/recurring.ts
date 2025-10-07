import { internalAction, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";

// Internal action to process recurring transactions
export const processRecurringTransactions = internalAction({
  handler: async (ctx) => {
    const due = await ctx.runQuery(internal.internal.getRecurringTransactionsToProcess);
    for (const transaction of due) {
      try {
        // Catch-up: generate repeatedly while behind, but cap per run to avoid infinite loops
        let iterations = 0;
        const maxIterations = 24; // safety cap
        while (transaction.nextDueDate && transaction.isActive && !transaction.softdelete && transaction.nextDueDate <= Date.now() && iterations < maxIterations) {
          await ctx.runMutation(internal.internal.generateTransactionFromRecurring, {
            recurringTransactionId: transaction._id,
            targetDate: transaction.nextDueDate,
          });
          // Refetch latest nextDueDate after mutation advanced it
          const latest = await ctx.runQuery(internal.internal.getRecurringTransactionsToProcess);
          const updated = latest.find((t: typeof transaction) => t._id === transaction._id);
          transaction.nextDueDate = updated?.nextDueDate;
          iterations += 1;
        }
      } catch (error) {
        console.error("Error processing recurring transaction:", error);
      }
    }
  },
}); 