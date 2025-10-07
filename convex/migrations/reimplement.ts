import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

/**
 * Orchestrates rollback and safe re-implementation of installment backfill
 */
export const reimplementInstallments = internalMutation({
  args: {
    userId: v.id("users"),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    rolledBack: v.boolean(),
    backfilled: v.boolean(),
    rollback: v.object({
      entriesFound: v.number(),
      linesDeleted: v.number(),
      entriesDeleted: v.number(),
      success: v.boolean(),
    }),
    backfill: v.object({
      schedulesProcessed: v.number(),
      journalEntriesCreated: v.number(),
      success: v.boolean(),
      error: v.optional(v.string()),
      skipped: v.optional(v.number()),
      hasMore: v.optional(v.boolean()),
    }),
  }),
  handler: async (ctx, args): Promise<{
    rolledBack: boolean;
    backfilled: boolean;
    rollback: {
      entriesFound: number;
      linesDeleted: number;
      entriesDeleted: number;
      success: boolean;
    };
    backfill: {
      schedulesProcessed: number;
      journalEntriesCreated: number;
      success: boolean;
      error?: string;
      skipped?: number;
      hasMore?: boolean;
    };
  }> => {
    // 1) Rollback existing installment entries
    const rollbackResult: {
      entriesFound: number;
      linesDeleted: number;
      entriesDeleted: number;
      success: boolean;
    } = await ctx.runMutation(
      internal.migrations.rollback.rollbackInstallmentEntries,
      {
        userId: args.userId,
        dryRun: args.dryRun,
      }
    );

    if (!rollbackResult.success) {
      return {
        rolledBack: false,
        backfilled: false,
        rollback: rollbackResult,
        backfill: {
          schedulesProcessed: 0,
          journalEntriesCreated: 0,
          success: false,
          error: "Rollback failed",
        },
      };
    }

    if (args.dryRun) {
      return {
        rolledBack: true,
        backfilled: false,
        rollback: rollbackResult,
        backfill: {
          schedulesProcessed: 0,
          journalEntriesCreated: 0,
          success: true,
          skipped: 0,
        },
      };
    }

    // 2) Re-run installment backfill with corrected logic
    const backfillResult: {
      schedulesProcessed: number;
      journalEntriesCreated: number;
      success: boolean;
      error?: string;
      skipped?: number;
    } = await ctx.runMutation(
      internal.migrations.installmentBackfill.backfillInstallmentSchedules,
      { userId: args.userId }
    );

    return {
      rolledBack: true,
      backfilled: backfillResult.success,
      rollback: rollbackResult,
      backfill: {
        schedulesProcessed: backfillResult.schedulesProcessed,
        journalEntriesCreated: backfillResult.journalEntriesCreated,
        success: backfillResult.success,
        error: backfillResult.error,
        skipped: backfillResult.skipped,
        hasMore: (backfillResult as any).hasMore,
      },
    };
  },
});


