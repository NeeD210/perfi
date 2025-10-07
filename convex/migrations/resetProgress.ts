import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

/**
 * Reset migration progress for a user
 */
export const resetMigrationProgress = internalMutation({
  args: {
    userId: v.id("users"),
    migrationType: v.union(
      v.literal("account_seeding"),
      v.literal("transaction_backfill"),
      v.literal("installment_backfill")
    ),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args): Promise<{
    success: boolean;
    message: string;
  }> => {
    // Find the progress record
    const progress = await ctx.db
      .query("migration_progress")
      .withIndex("by_user_type", (q) => 
        q.eq("userId", args.userId).eq("migrationType", args.migrationType)
      )
      .first();

    if (!progress) {
      return {
        success: false,
        message: `No progress record found for user ${args.userId} and migration type ${args.migrationType}`,
      };
    }

    // Reset the progress
    await ctx.db.patch(progress._id, {
      status: "pending",
      recordsProcessed: 0,
      lastProcessedId: undefined,
      errorMessage: undefined,
    });

    return {
      success: true,
      message: `Reset migration progress for user ${args.userId}, migration type ${args.migrationType}`,
    };
  },
});
