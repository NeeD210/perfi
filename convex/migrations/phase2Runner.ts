import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

/**
 * Runner for Phase 2 Migration Foundation
 * Runs all Phase 2 migrations for a specific user in the correct order
 */
export const runPhase2ForUser = internalMutation({
  args: {
    userId: v.id("users"),
  },
  returns: v.object({
    accountSeeding: v.object({
      accountsCreated: v.number(),
      mappingsCreated: v.number(),
      success: v.boolean(),
      error: v.optional(v.string()),
    }),
    transactionBackfill: v.object({
      expensesProcessed: v.number(),
      journalEntriesCreated: v.number(),
      success: v.boolean(),
      error: v.optional(v.string()),
    }),
    installmentBackfill: v.object({
      schedulesProcessed: v.number(),
      journalEntriesCreated: v.number(),
      success: v.boolean(),
      error: v.optional(v.string()),
      skipped: v.optional(v.number()),
    }),
    recurringTemplates: v.object({
      entriesCreated: v.number(),
      linesCreated: v.number(),
      success: v.boolean(),
      error: v.optional(v.string()),
    }),
    overallSuccess: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args): Promise<{
    accountSeeding: {
      accountsCreated: number;
      mappingsCreated: number;
      success: boolean;
      error?: string;
    };
    transactionBackfill: {
      expensesProcessed: number;
      journalEntriesCreated: number;
      success: boolean;
      error?: string;
    };
    installmentBackfill: {
      schedulesProcessed: number;
      journalEntriesCreated: number;
      success: boolean;
      error?: string;
      skipped?: number;
    };
    recurringTemplates: {
      entriesCreated: number;
      linesCreated: number;
      success: boolean;
      error?: string;
    };
    overallSuccess: boolean;
    message: string;
  }> => {
    console.log(`Starting Phase 2 migrations for user ${args.userId}`);

    // Step 1: Account Seeding
    console.log("Step 1: Running account seeding...");
    const accountSeedingResult = await ctx.runMutation(
      internal.migrations.accountSeeding.seedAccountsFromLegacyData,
      { userId: args.userId }
    );

    if (!accountSeedingResult.success) {
      return {
        accountSeeding: accountSeedingResult,
        transactionBackfill: {
          expensesProcessed: 0,
          journalEntriesCreated: 0,
          success: false,
          error: "Prerequisites not met",
        },
        installmentBackfill: {
          schedulesProcessed: 0,
          journalEntriesCreated: 0,
          success: false,
          error: "Prerequisites not met",
        },
        recurringTemplates: {
          entriesCreated: 0,
          linesCreated: 0,
          success: false,
          error: "Prerequisites not met",
        },
        overallSuccess: false,
        message: `Phase 2 migration failed at account seeding: ${accountSeedingResult.error}`,
      };
    }

    // Step 2: Transaction Backfill (may need multiple calls for large datasets)
    console.log("Step 2: Running transaction backfill...");
    let transactionBackfillResult = {
      expensesProcessed: 0,
      journalEntriesCreated: 0,
      success: true,
    };
    let offset: number | undefined = 0;

    do {
      const batchResult: {
        expensesProcessed: number;
        journalEntriesCreated: number;
        success: boolean;
        nextOffset?: number;
        hasMore: boolean;
        error?: string;
      } = await ctx.runMutation(
        internal.migrations.transactionBackfill.backfillHistoricalTransactions,
        {
          userId: args.userId,
          offset,
        }
      );

      if (!batchResult.success) {
        return {
          accountSeeding: accountSeedingResult,
          transactionBackfill: batchResult,
          installmentBackfill: {
            schedulesProcessed: 0,
            journalEntriesCreated: 0,
            success: false,
            error: "Prerequisites not met",
          },
          recurringTemplates: {
            entriesCreated: 0,
            linesCreated: 0,
            success: false,
            error: "Prerequisites not met",
          },
          overallSuccess: false,
          message: `Phase 2 migration failed at transaction backfill: ${batchResult.error}`,
        };
      }

      transactionBackfillResult.expensesProcessed += batchResult.expensesProcessed;
      transactionBackfillResult.journalEntriesCreated += batchResult.journalEntriesCreated;
      offset = batchResult.nextOffset;

    } while (offset !== undefined);

    // Step 3: Installment Backfill (may need multiple calls for large datasets)
    console.log("Step 3: Running installment backfill...");
    let installmentBackfillResult = {
      schedulesProcessed: 0,
      journalEntriesCreated: 0,
      success: true,
      skipped: 0,
    };
    let scheduleOffset: number | undefined = 0;

    do {
      const batchResult: {
        schedulesProcessed: number;
        journalEntriesCreated: number;
        success: boolean;
        nextOffset?: number;
        hasMore: boolean;
        error?: string;
        skipped?: number;
      } = await ctx.runMutation(
        internal.migrations.installmentBackfill.backfillInstallmentSchedules,
        {
          userId: args.userId,
          offset: scheduleOffset,
        }
      );

      if (!batchResult.success) {
        return {
          accountSeeding: accountSeedingResult,
          transactionBackfill: transactionBackfillResult,
          installmentBackfill: {
            schedulesProcessed: batchResult.schedulesProcessed,
            journalEntriesCreated: batchResult.journalEntriesCreated,
            success: batchResult.success,
            error: batchResult.error,
            skipped: batchResult.skipped,
          },
          recurringTemplates: {
            entriesCreated: 0,
            linesCreated: 0,
            success: false,
            error: "Prerequisites not met",
          },
          overallSuccess: false,
          message: `Phase 2 migration failed at installment backfill: ${batchResult.error}`,
        };
      }

      installmentBackfillResult.schedulesProcessed += batchResult.schedulesProcessed;
      installmentBackfillResult.journalEntriesCreated += batchResult.journalEntriesCreated;
      scheduleOffset = batchResult.nextOffset;
      if (batchResult.skipped) {
        installmentBackfillResult.skipped += batchResult.skipped;
      }

    } while (scheduleOffset !== undefined);

    // Step 4: Recurring Templates Migration
    console.log("Step 4: Running recurring templates migration...");
    let recurringTemplatesResult = {
      entriesCreated: 0,
      linesCreated: 0,
      success: true,
    };

    const recurringResult = await ctx.runMutation(
      internal.migrations.recurringToLedger.migrateRecurringTemplatesForUser,
      { userId: args.userId }
    );

    if (!recurringResult.success) {
      return {
        accountSeeding: accountSeedingResult,
        transactionBackfill: transactionBackfillResult,
        installmentBackfill: installmentBackfillResult,
        recurringTemplates: {
          entriesCreated: recurringResult.createdEntries,
          linesCreated: recurringResult.createdLines,
          success: false,
          error: recurringResult.error,
        },
        overallSuccess: false,
        message: `Phase 2 migration failed at recurring templates: ${recurringResult.error}`,
      };
    }

    recurringTemplatesResult.entriesCreated = recurringResult.createdEntries;
    recurringTemplatesResult.linesCreated = recurringResult.createdLines;

    const message = `Phase 2 migration completed successfully for user ${args.userId}: ` +
      `${accountSeedingResult.accountsCreated} accounts created, ` +
      `${transactionBackfillResult.journalEntriesCreated} transaction entries, ` +
      `${installmentBackfillResult.journalEntriesCreated} installment entries (skipped ${installmentBackfillResult.skipped}), ` +
      `${recurringTemplatesResult.entriesCreated} recurring entries, ${recurringTemplatesResult.linesCreated} recurring lines`;

    console.log(message);

    return {
      accountSeeding: accountSeedingResult,
      transactionBackfill: transactionBackfillResult,
      installmentBackfill: installmentBackfillResult,
      recurringTemplates: recurringTemplatesResult,
      overallSuccess: true,
      message,
    };
  },
});

/**
 * Check Phase 2 migration status for a user
 */
export const checkPhase2Status = internalMutation({
  args: {
    userId: v.id("users"),
  },
  returns: v.object({
    accountSeeding: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("failed")
    ),
    transactionBackfill: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("failed")
    ),
    installmentBackfill: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("failed")
    ),
    overallStatus: v.union(
      v.literal("not_started"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("failed")
    ),
    canProceed: v.boolean(),
    nextStep: v.optional(v.union(
      v.literal("account_seeding"),
      v.literal("transaction_backfill"),
      v.literal("installment_backfill")
    )),
  }),
  handler: async (ctx, args) => {
    const progressRecords = await ctx.db
      .query("migration_progress")
      .withIndex("by_user_type", (q) => q.eq("userId", args.userId))
      .collect();

    const status: {
      accountSeeding: "pending" | "in_progress" | "completed" | "failed";
      transactionBackfill: "pending" | "in_progress" | "completed" | "failed";
      installmentBackfill: "pending" | "in_progress" | "completed" | "failed";
    } = {
      accountSeeding: "pending",
      transactionBackfill: "pending",
      installmentBackfill: "pending",
    };

    for (const record of progressRecords) {
      status[record.migrationType as keyof typeof status] = record.status;
    }

    // Determine overall status
    let overallStatus: "not_started" | "in_progress" | "completed" | "failed" = "not_started";
    let canProceed = false;
    let nextStep: "account_seeding" | "transaction_backfill" | "installment_backfill" | undefined;

    if (status.accountSeeding === "failed" ||
        status.transactionBackfill === "failed" ||
        status.installmentBackfill === "failed") {
      overallStatus = "failed";
    } else if (status.accountSeeding === "completed" &&
               status.transactionBackfill === "completed" &&
               status.installmentBackfill === "completed") {
      overallStatus = "completed";
    } else if (status.accountSeeding === "in_progress" ||
               status.transactionBackfill === "in_progress" ||
               status.installmentBackfill === "in_progress") {
      overallStatus = "in_progress";
    } else {
      // Determine next step
      if (status.accountSeeding === "pending") {
        nextStep = "account_seeding";
        canProceed = true;
      } else if (status.accountSeeding === "completed" && status.transactionBackfill === "pending") {
        nextStep = "transaction_backfill";
        canProceed = true;
      } else if (status.transactionBackfill === "completed" && status.installmentBackfill === "pending") {
        nextStep = "installment_backfill";
        canProceed = true;
      }
      overallStatus = "not_started";
    }

    return {
      ...status,
      overallStatus,
      canProceed,
      nextStep,
    };
  },
});
