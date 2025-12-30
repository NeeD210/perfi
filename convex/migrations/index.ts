import { internalMutation, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
// Do not import Convex function implementations for execution; use internal function references instead.
import { Id } from "../_generated/dataModel";

type MigrationReturnType = {
  category: {
    totalProcessed: number;
    totalUpdated: number;
    totalErrors: number;
    lastProcessedUserId?: Id<"users">;
  };
  recurring: {
    totalProcessed: number;
    totalUpdated: number;
    totalErrors: number;
    lastProcessedId?: Id<"recurringTransactions">;
  };
  // Phase 2: Migration Foundation
  phase2: {
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
    };
  };
  // Bulk Phase 2 Migration
  bulkPhase2: {
    totalProcessed: number;
    totalSuccessful: number;
    totalFailed: number;
    migrationId: string;
    errors: string[];
    success: boolean;
    message: string;
  };
  // catch-up run is executed separately as an action
};

// Run all migrations
export const runAll = internalMutation({
  args: {},
  returns: v.object({
    category: v.object({
      totalProcessed: v.number(),
      totalUpdated: v.number(),
      totalErrors: v.number(),
      lastProcessedUserId: v.optional(v.id("users")),
    }),
    recurring: v.object({
      totalProcessed: v.number(),
      totalUpdated: v.number(),
      totalErrors: v.number(),
      lastProcessedId: v.optional(v.id("recurringTransactions")),
    }),
    phase2: v.object({
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
      }),
    }),
    bulkPhase2: v.object({
      totalProcessed: v.number(),
      totalSuccessful: v.number(),
      totalFailed: v.number(),
      migrationId: v.string(),
      errors: v.array(v.string()),
      success: v.boolean(),
      message: v.string(),
    }),
  }),
  handler: async (ctx): Promise<MigrationReturnType> => {
    // Run category migration
    const categoryResults: {
      totalProcessed: number;
      totalUpdated: number;
      totalErrors: number;
      lastProcessedUserId?: Id<"users">;
    } = await ctx.runMutation(
      internal.migrations.category.runCategoryMigration,
      {}
    );

    // Run recurring nextDueDate backfill
    const recurringResults = await ctx.runMutation(
      internal.migrations.recurring.runRecurringNextDueDateMigration,
      {}
    );

    // Optional: one-time backfill for recurring_lines.currencyCode
    // This can be run per-user via the exported mutation below

    // Phase 2: Migration Foundation
    // Note: These migrations need to be run per-user, so we can't run them in runAll
    // They should be called separately for each user
    const phase2Results = {
      accountSeeding: {
        accountsCreated: 0,
        mappingsCreated: 0,
        success: false,
        error: "Phase 2 migrations must be run per-user, not in runAll",
      },
      transactionBackfill: {
        expensesProcessed: 0,
        journalEntriesCreated: 0,
        success: false,
        error: "Phase 2 migrations must be run per-user, not in runAll",
      },
      installmentBackfill: {
        schedulesProcessed: 0,
        journalEntriesCreated: 0,
        success: false,
        error: "Phase 2 migrations must be run per-user, not in runAll",
      },
    };

    // Bulk Phase 2 Migration
    // Note: This should be run separately using runBulkPhase2Migration
    const bulkPhase2Results = {
      totalProcessed: 0,
      totalSuccessful: 0,
      totalFailed: 0,
      migrationId: "not_run",
      errors: ["Bulk Phase 2 migration must be run separately using runBulkPhase2Migration"],
      success: false,
      message: "Bulk Phase 2 migration not executed in runAll",
    };

    return {
      category: categoryResults,
      recurring: recurringResults,
      phase2: phase2Results,
      bulkPhase2: bulkPhase2Results,
    };
  },
});

// Recurring templates migration (legacy -> ledger recurring_entries/recurring_lines)
export const migrateRecurringTemplatesForUser = internalMutation({
  args: {
    userId: v.id("users"),
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    processed: v.number(),
    createdEntries: v.number(),
    createdLines: v.number(),
    skipped: v.number(),
    hasMore: v.boolean(),
    lastProcessedId: v.optional(v.id("recurringTransactions")),
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{
    processed: number;
    createdEntries: number;
    createdLines: number;
    skipped: number;
    hasMore: boolean;
    lastProcessedId?: Id<"recurringTransactions">;
    success: boolean;
    error?: string;
  }> => {
    return await ctx.runMutation(
      internal.migrations.recurringToLedger.migrateRecurringTemplatesForUser,
      args
    );
  },
});

// Bulk Phase 2 Migration Functions
export const runBulkPhase2Migration = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
    maxRetries: v.optional(v.number()),
    maxConcurrentUsers: v.optional(v.number()),
  },
  returns: v.object({
    totalProcessed: v.number(),
    totalSuccessful: v.number(),
    totalFailed: v.number(),
    migrationId: v.string(),
    errors: v.array(v.string()),
    message: v.string(),
  }),
  handler: async (ctx, args): Promise<{
    totalProcessed: number;
    totalSuccessful: number;
    totalFailed: number;
    migrationId: string;
    errors: string[];
    message: string;
  }> => {
    return await ctx.runMutation(
      internal.migrations.bulkPhase2Migration.runBulkPhase2Migration,
      args
    );
  },
});

export const checkBulkMigrationStatus = internalMutation({
  args: {},
  returns: v.object({
    isRunning: v.boolean(),
    totalUsers: v.number(),
    processedUsers: v.number(),
    successfulUsers: v.number(),
    failedUsers: v.number(),
    progressPercentage: v.number(),
    estimatedTimeRemaining: v.optional(v.number()),
    lastError: v.optional(v.string()),
  }),
  handler: async (ctx): Promise<{
    isRunning: boolean;
    totalUsers: number;
    processedUsers: number;
    successfulUsers: number;
    failedUsers: number;
    progressPercentage: number;
    estimatedTimeRemaining?: number;
    lastError?: string;
  }> => {
    return await ctx.runMutation(
      internal.migrations.bulkPhase2Migration.checkBulkMigrationStatus,
      {}
    );
  },
});

export const resetBulkMigrationProgress = internalMutation({
  args: {
    migrationType: v.optional(v.union(
      v.literal("account_seeding"),
      v.literal("transaction_backfill"),
      v.literal("installment_backfill")
    )),
  },
  returns: v.object({
    success: v.boolean(),
    resetCount: v.number(),
    message: v.string(),
  }),
  handler: async (ctx, args): Promise<{
    success: boolean;
    resetCount: number;
    message: string;
  }> => {
    return await ctx.runMutation(
      internal.migrations.bulkPhase2Migration.resetBulkMigrationProgress,
      args
    );
  },
});

// Action wrapper for external triggers
export const runBulkPhase2MigrationAction = internalAction({
  args: {
    batchSize: v.optional(v.number()),
    maxRetries: v.optional(v.number()),
    maxConcurrentUsers: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
    totalProcessed: v.number(),
    totalSuccessful: v.number(),
    totalFailed: v.number(),
    migrationId: v.string(),
    errors: v.array(v.string()),
    message: v.string(),
  }),
  handler: async (ctx, args): Promise<{
    success: boolean;
    totalProcessed: number;
    totalSuccessful: number;
    totalFailed: number;
    migrationId: string;
    errors: string[];
    message: string;
  }> => {
    return await ctx.runAction(
      internal.migrations.bulkPhase2Migration.runBulkPhase2MigrationAction,
      args
    );
  },
});

// Expose currency backfill per user
export const backfillRecurringLinesCurrencyCode = internalMutation({
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
    return await ctx.runMutation(
      internal.migrations.recurringCurrencyBackfill.runRecurringLinesCurrencyCodeBackfill,
      args
    );
  },
});

export const backfillCardStatementsForUser = internalAction({
  args: {
    userId: v.id("users"),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    cardAccountId: v.optional(v.id("accounts")),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    processedCards: v.number(),
    attemptedStatements: v.number(),
    successful: v.number(),
    skipped: v.number(),
    errors: v.number(),
    durationMs: v.number(),
  }),
  handler: async (ctx, args): Promise<{ processedCards: number; attemptedStatements: number; successful: number; skipped: number; errors: number; durationMs: number; }> => {
    return await ctx.runAction(
      internal.migrations.cardStatementsBackfill.backfillCardStatementsForUser,
      args
    );
  },
});

export const backfillAllCardStatements = internalAction({
  args: {
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    totalCards: v.number(),
    attemptedStatements: v.number(),
    successful: v.number(),
    skipped: v.number(),
    errors: v.number(),
    durationMs: v.number(),
  }),
  handler: async (ctx, args): Promise<{ totalCards: number; attemptedStatements: number; successful: number; skipped: number; errors: number; durationMs: number; }> => {
    return await ctx.runAction(
      internal.migrations.cardStatementsBackfill.backfillAllCardStatements,
      args
    );
  },
});

export const backfillCardStatementsForClosingDay31 = internalAction({
  args: {
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    totalCards: v.number(),
    attemptedStatements: v.number(),
    successful: v.number(),
    skipped: v.number(),
    errors: v.number(),
    durationMs: v.number(),
  }),
  handler: async (ctx, args): Promise<{ totalCards: number; attemptedStatements: number; successful: number; skipped: number; errors: number; durationMs: number; }> => {
    return await ctx.runAction(
      internal.migrations.cardStatementsBackfill.backfillCardStatementsForClosingDay31,
      args
    );
  },
});

export const backfillStatementForAccount = internalAction({
  args: {
    accountId: v.id("accounts"),
    year: v.number(),
    month: v.number(), // 0-11 (0 = January, 11 = December)
  },
  returns: v.object({
    success: v.boolean(),
    statementId: v.optional(v.id("card_statements")),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{
    success: boolean;
    statementId?: Id<"card_statements">;
    error?: string;
  }> => {
    return await ctx.runAction(
      internal.migrations.cardStatementsBackfill.backfillStatementForAccount,
      args
    );
  },
});