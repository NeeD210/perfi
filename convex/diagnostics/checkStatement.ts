import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

/**
 * Check a specific statement and see why it might not appear in upcoming obligations
 */
export const checkStatement = internalQuery({
  args: {
    statementId: v.id("card_statements"),
  },
  returns: v.object({
    statement: v.union(
      v.object({
        _id: v.id("card_statements"),
        accountId: v.id("accounts"),
        userId: v.id("users"),
        closingDate: v.number(),
        dueDate: v.number(),
        periodStart: v.number(),
        periodEnd: v.number(),
        totalAmount: v.number(),
        status: v.string(),
        accountName: v.optional(v.string()),
      }),
      v.null()
    ),
    now: v.number(),
    thirtyDaysFromNow: v.number(),
    isInRange: v.boolean(),
    reason: v.string(),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const thirtyDaysFromNow = now + 30 * 24 * 60 * 60 * 1000;

    const statement = await ctx.db.get(args.statementId);
    
    if (!statement) {
      return {
        statement: null,
        now,
        thirtyDaysFromNow,
        isInRange: false,
        reason: "Statement not found",
      };
    }

    // Get account name
    const account = await ctx.db.get(statement.accountId);
    const accountName = account?.description;

    const isInRange = 
      statement.status === "pending" &&
      statement.dueDate >= now &&
      statement.dueDate <= thirtyDaysFromNow;

    let reason = "";
    if (statement.status !== "pending") {
      reason = `Status is "${statement.status}", not "pending"`;
    } else if (statement.dueDate < now) {
      reason = `Due date (${new Date(statement.dueDate).toISOString()}) is in the past`;
    } else if (statement.dueDate > thirtyDaysFromNow) {
      reason = `Due date (${new Date(statement.dueDate).toISOString()}) is more than 30 days away`;
    } else {
      reason = "Statement should appear in upcoming obligations";
    }

    return {
      statement: {
        _id: statement._id,
        accountId: statement.accountId,
        userId: statement.userId,
        closingDate: statement.closingDate,
        dueDate: statement.dueDate,
        periodStart: statement.periodStart,
        periodEnd: statement.periodEnd,
        totalAmount: statement.totalAmount,
        status: statement.status,
        accountName,
      },
      now,
      thirtyDaysFromNow,
      isInRange,
      reason,
    };
  },
});

