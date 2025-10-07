import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

export const runRecurringLinesCurrencyCodeBackfill = internalMutation({
  args: {
    userId: v.id("users"),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    processed: v.number(),
    patched: v.number(),
    skipped: v.number(),
    success: v.boolean(),
  }),
  handler: async (ctx, args): Promise<{
    processed: number;
    patched: number;
    skipped: number;
    success: boolean;
  }> => {
    const batchSize = args.batchSize ?? 500;

    // Iterate by user to leverage the index
    const lines = await ctx.db
      .query("recurring_lines")
      .withIndex("by_user", (q: any) => q.eq("userId", args.userId))
      .take(batchSize);

    let processed = 0;
    let patched = 0;
    let skipped = 0;

    for (const line of lines) {
      processed += 1;
      // Patch only when currencyCode is missing
      if ((line as any).currencyCode === undefined) {
        await ctx.db.patch(line._id, { currencyCode: "ARS" });
        patched += 1;
      } else {
        skipped += 1;
      }
    }

    return { processed, patched, skipped, success: true };
  },
});


