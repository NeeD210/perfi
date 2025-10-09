import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

/**
 * Public-facing diagnostic wrapper for verifying a single recurring template
 * Usage: Call from Convex dashboard with a recurringTransactionId
 */
export const diagnoseRecurringTemplate = internalQuery({
  args: {
    recurringTransactionId: v.id("recurringTransactions"),
  },
  returns: v.object({
    exists: v.boolean(),
    mappingExists: v.boolean(),
    recurringEntryId: v.optional(v.id("recurring_entries")),
    recurringLinesCount: v.number(),
    hasCategoryMapping: v.boolean(),
    hasPaymentTypeMapping: v.boolean(),
    notes: v.array(v.string()),
    recommendation: v.string(),
  }),
  handler: async (ctx, args) => {
    const status: {
      exists: boolean;
      mappingExists: boolean;
      recurringEntryId?: Id<"recurring_entries">;
      recurringLinesCount: number;
      hasCategoryMapping: boolean;
      hasPaymentTypeMapping: boolean;
      notes: Array<string>;
    } = await ctx.runQuery(internal.internal.verifyRecurringTemplateStatus, {
      recurringTransactionId: args.recurringTransactionId,
    });

    let recommendation = "";
    if (!status.exists) {
      recommendation = "❌ Template does not exist";
    } else if (!status.hasCategoryMapping) {
      recommendation = "❌ BLOCKED: Missing category mapping. Fix category mappings first, then run backfill.";
    } else if (!status.mappingExists || status.recurringLinesCount === 0) {
      recommendation = "⚠️  NEEDS REPAIR: Run internal.backfillRecurringTemplateForLegacyId to create template and lines.";
    } else {
      recommendation = "✅ Template is healthy and ready for generation.";
    }

    return {
      ...status,
      recommendation,
    };
  },
});

/**
 * Repair a single broken recurring template
 */
export const repairRecurringTemplate = internalMutation({
  args: {
    recurringTransactionId: v.id("recurringTransactions"),
  },
  returns: v.object({
    success: v.boolean(),
    recurringEntryId: v.optional(v.id("recurring_entries")),
    createdLines: v.number(),
    error: v.optional(v.string()),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const result: {
      success: boolean;
      recurringEntryId?: Id<"recurring_entries">;
      createdLines: number;
      error?: string;
    } = await ctx.runMutation(internal.internal.backfillRecurringTemplateForLegacyId, {
      recurringTransactionId: args.recurringTransactionId,
    });

    let message = "";
    if (result.success) {
      message = `✅ Successfully created recurring template with ${result.createdLines} lines`;
    } else {
      message = `❌ Failed: ${result.error}`;
    }

    return {
      ...result,
      message,
    };
  },
});

/**
 * Scan all recurring templates for a user
 */
export const scanUserRecurringTemplates = internalQuery({
  args: {
    userId: v.id("users"),
  },
  returns: v.object({
    summary: v.object({
      total: v.number(),
      healthy: v.number(),
      needsRepair: v.number(),
      missingCategoryMappings: v.number(),
      missingPaymentMappings: v.number(),
    }),
    brokenTemplates: v.array(v.object({
      recurringTransactionId: v.id("recurringTransactions"),
      description: v.string(),
      issues: v.array(v.string()),
    })),
    recommendation: v.string(),
  }),
  handler: async (ctx, args) => {
    type ScanResult = {
      total: number;
      withMappings: number;
      withoutMappings: number;
      missingCategoryMappings: number;
      missingPaymentMappings: number;
      brokenTemplates: Array<{
        recurringTransactionId: Id<"recurringTransactions">;
        description: string;
        issues: Array<string>;
      }>;
    };
    const result: ScanResult = await ctx.runQuery(internal.internal.scanAllRecurringTemplates, {
      userId: args.userId,
    });

    let recommendation = "";
    if (result.total === 0) {
      recommendation = "ℹ️  No active recurring templates found for this user.";
    } else if (result.withoutMappings === 0 && result.missingCategoryMappings === 0) {
      recommendation = `✅ All ${result.total} templates are healthy!`;
    } else {
      recommendation = `⚠️  Found ${result.withoutMappings} templates needing repair. Run internal.repairAllRecurringTemplates to fix.`;
    }

    return {
      summary: {
        total: result.total,
        healthy: result.withMappings,
        needsRepair: result.withoutMappings,
        missingCategoryMappings: result.missingCategoryMappings,
        missingPaymentMappings: result.missingPaymentMappings,
      },
      brokenTemplates: result.brokenTemplates,
      recommendation,
    };
  },
});

/**
 * Repair all broken templates for a user with dry-run option
 */
export const repairAllUserTemplates = internalMutation({
  args: {
    userId: v.id("users"),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    summary: v.object({
      scanned: v.number(),
      repaired: v.number(),
      failed: v.number(),
      skipped: v.number(),
    }),
    failures: v.array(v.object({
      recurringTransactionId: v.id("recurringTransactions"),
      description: v.string(),
      error: v.string(),
    })),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;
    type RepairResult = {
      scanned: number;
      repaired: number;
      failed: number;
      skipped: number;
      failures: Array<{
        recurringTransactionId: Id<"recurringTransactions">;
        description: string;
        error: string;
      }>;
    };
    const result: RepairResult = await ctx.runMutation(internal.internal.repairAllRecurringTemplates, {
      userId: args.userId,
      dryRun,
    });

    let message = "";
    if (dryRun) {
      message = `🔍 DRY RUN: Would repair ${result.repaired} of ${result.scanned} templates. Run with dryRun: false to execute.`;
    } else {
      message = `✅ Repaired ${result.repaired} templates. Failed: ${result.failed}. Skipped: ${result.skipped}.`;
      if (result.failed > 0) {
        message += ` Check failures array for details.`;
      }
    }

    return {
      summary: {
        scanned: result.scanned,
        repaired: result.repaired,
        failed: result.failed,
        skipped: result.skipped,
      },
      failures: result.failures,
      message,
    };
  },
});

