import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

export const inspectCardData = internalQuery({
  args: { userId: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").filter(q => q.eq(q.field("auth0Id"), args.userId)).first();
    const targetUserId = user ? user._id : (args.userId as any);

    const cards = await ctx.db.query("cards")
        .withIndex("by_user", q => q.eq("userId", targetUserId))
        .collect();

    const statements = await ctx.db.query("card_statements")
        .withIndex("by_user_status", q => q.eq("userId", targetUserId))
        .collect();

    const now = new Date();
    const todayDay = now.getUTCDate();

    return {
        timestamp: now.toISOString(),
        todayUTC: todayDay,
        cardCount: cards.length,
        cards: cards.map(c => ({
            id: c._id,
            closingDay: c.closingDay,
            dueDate: c.dueDate,
            baseCurrency: c.baseCurrency,
            createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : "N/A"
        })),
        statementCount: statements.length,
        statements: statements
    };
  }
});

