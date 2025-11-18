import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

export const getMissingMappings = internalQuery({
  args: { userId: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").filter(q => q.eq(q.field("auth0Id"), args.userId)).first();
    const targetUserId = (user ? user._id : args.userId) as Id<"users">;

    // 1. Fetch all active expenses
    const expenses = await ctx.db
        .query("expenses")
        .withIndex("by_user", q => q.eq("userId", targetUserId))
        .collect();
    const activeExpenses = expenses.filter(e => !e.softdelete);

    // 2. Fetch all existing mappings
    const mappings = await ctx.db
        .query("expense_mappings")
        .withIndex("by_user_expense", q => q.eq("userId", targetUserId))
        .collect();
    const mappedExpenseIds = new Set(mappings.map(m => m.expenseId));

    // 3. Identify missing
    const missingExpenses = activeExpenses.filter(e => !mappedExpenseIds.has(e._id));

    // 4. Format as CSV
    // Headers
    let csv = "Expense ID,Description,Amount,Date,Category,Transaction Type\n";
    
    for (const e of missingExpenses) {
        // Escape commas in description
        const description = e.description.replace(/"/g, '""');
        const row = [
            e._id,
            `"${description}"`,
            e.amount,
            new Date(e.date).toISOString(),
            e.category,
            e.transactionType
        ].join(",");
        csv += row + "\n";
    }

    return csv;
  }
});

