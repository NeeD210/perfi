import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

export const fixAndBackfillStatements = internalMutation({
  args: { userId: v.string() },
  returns: v.array(v.object({
      accountId: v.id("accounts"),
      closingDay: v.number()
  })),
  handler: async (ctx, args) => {
    const user = await ctx.db.query("users").filter(q => q.eq(q.field("auth0Id"), args.userId)).first();
    const targetUserId = user ? user._id : (args.userId as any);

    const cards = await ctx.db.query("cards")
        .withIndex("by_user", q => q.eq("userId", targetUserId))
        .collect();

    const results = [];

    // 1. Fix missing createdAt and baseCurrency
    for (const card of cards) {
        const patches: any = {};
        
        if (!card.createdAt) {
            // Backfill to Jan 1, 2025 (epoch 1735689600000)
            patches.createdAt = 1735689600000; 
        }
        
        if (!card.baseCurrency) {
            patches.baseCurrency = "ARS";
        }
        
        if (Object.keys(patches).length > 0) {
            await ctx.db.patch(card._id, patches);
        }
        
        results.push({
            accountId: card.accountId,
            closingDay: card.closingDay
        });
    }

    return results;
  }
});
