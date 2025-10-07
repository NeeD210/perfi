import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

export const rollbackInstallmentEntries = internalMutation({
  args: {
    userId: v.id("users"),
    dryRun: v.optional(v.boolean()),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    entriesFound: v.number(),
    linesDeleted: v.number(),
    entriesDeleted: v.number(),
    success: v.boolean(),
  }),
  handler: async (ctx, args): Promise<{
    entriesFound: number;
    linesDeleted: number;
    entriesDeleted: number;
    success: boolean;
  }> => {
    const batchSize = args.batchSize ?? 500;

    // Find installment entries by sourceType
    const entries = await ctx.db
      .query("journal_entries")
      .withIndex("by_sourceType_sourceId", (q) => q.eq("sourceType", "installment"))
      .take(batchSize);

    let linesDeleted = 0;
    let entriesDeleted = 0;

    if (!args.dryRun) {
      for (const entry of entries) {
        // Delete lines first
        const lines = await ctx.db
          .query("journal_lines")
          .withIndex("by_entryId", (q) => q.eq("journalEntryId", entry._id))
          .collect();

        for (const line of lines) {
          await ctx.db.delete(line._id);
          linesDeleted++;
        }

        await ctx.db.delete(entry._id as Id<"journal_entries">);
        entriesDeleted++;
      }
    }

    return {
      entriesFound: entries.length,
      linesDeleted,
      entriesDeleted,
      success: true,
    };
  },
});
