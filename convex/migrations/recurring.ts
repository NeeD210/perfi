import { internalAction, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { stepDateByFrequency } from "../lib/scheduling";
import { internal } from "../_generated/api";

interface MigrationBatchResult {
  processed: number;
  updated: number;
  errors: number;
  hasMore: boolean;
  lastProcessedId?: Id<"recurringTransactions">;
}

export const migrateRecurringNextDueDate = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
    lastProcessedId: v.optional(v.id("recurringTransactions")),
  },
  returns: v.object({
    processed: v.number(),
    updated: v.number(),
    errors: v.number(),
    hasMore: v.boolean(),
    lastProcessedId: v.optional(v.id("recurringTransactions")),
  }),
  handler: async (ctx, args): Promise<MigrationBatchResult> => {
    const batchSize = args.batchSize ?? 100;
    let processed = 0;
    let updated = 0;
    let errors = 0;
    let lastProcessedId: Id<"recurringTransactions"> | undefined = args.lastProcessedId;

    const items = await ctx.db
      .query("recurringTransactions")
      .filter((q) => q.eq(q.field("isActive"), true))
      .filter((q) => q.neq(q.field("softdelete"), true))
      .filter((q) => !lastProcessedId || q.gt(q.field("_id"), lastProcessedId!))
      .take(batchSize);

    for (const rt of items) {
      try {
        const anchorDay = new Date(rt.startDate).getDate();
        const candidate: number = rt.lastProcessedDate
          ? stepDateByFrequency(rt.lastProcessedDate, rt.frequency as any, anchorDay)
          : rt.startDate;

        if (rt.endDate && candidate > rt.endDate) {
          await ctx.db.patch(rt._id, { isActive: false, nextDueDate: undefined });
        } else {
          await ctx.db.patch(rt._id, { nextDueDate: candidate });
        }
        updated += 1;
        lastProcessedId = rt._id;
      } catch (error) {
        console.error(`Error migrating recurring ${rt._id}:`, error);
        errors += 1;
      }
      processed += 1;
    }

    return {
      processed,
      updated,
      errors,
      hasMore: items.length === batchSize,
      lastProcessedId,
    };
  },
});

interface MigrationResults {
  totalProcessed: number;
  totalUpdated: number;
  totalErrors: number;
  lastProcessedId?: Id<"recurringTransactions">;
}

export const runRecurringNextDueDateMigration = internalMutation({
  args: {
    maxRetries: v.optional(v.number()),
  },
  returns: v.object({
    totalProcessed: v.number(),
    totalUpdated: v.number(),
    totalErrors: v.number(),
    lastProcessedId: v.optional(v.id("recurringTransactions")),
  }),
  handler: async (ctx, args): Promise<MigrationResults> => {
    const maxRetries = args.maxRetries ?? 3;
    const results: MigrationResults = {
      totalProcessed: 0,
      totalUpdated: 0,
      totalErrors: 0,
    };

    let hasMore = true;
    let lastProcessedId: Id<"recurringTransactions"> | undefined;
    let retryCount = 0;

    while (hasMore && retryCount < maxRetries) {
      try {
        const batch = await ctx.runMutation(internal.migrations.recurring.migrateRecurringNextDueDate, {
          batchSize: 100,
          lastProcessedId,
        });

        results.totalProcessed += batch.processed;
        results.totalUpdated += batch.updated;
        results.totalErrors += batch.errors;
        hasMore = batch.hasMore;
        lastProcessedId = batch.lastProcessedId;
        results.lastProcessedId = lastProcessedId;
        retryCount = 0;
      } catch (error) {
        console.error(`Recurring migration batch failed (attempt ${retryCount + 1}/${maxRetries})`, error);
        retryCount += 1;
        if (retryCount >= maxRetries) {
          throw new Error(`Recurring migration failed after ${maxRetries} retries`);
        }
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
      }
    }

    return results;
  },
});

export const runRecurringCatchup = internalAction({
  args: {
    batchSize: v.optional(v.number()),
    perItemCap: v.optional(v.number()),
    maxBatches: v.optional(v.number()),
  },
  returns: v.object({
    processedRecurring: v.number(),
    generatedTransactions: v.number(),
    batchesRun: v.number(),
  }),
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 100;
    const perItemCap = args.perItemCap ?? 24;
    const maxBatches = args.maxBatches ?? 50;

    let processedRecurring = 0;
    let generatedTransactions = 0;
    let batchesRun = 0;

    while (batchesRun < maxBatches) {
      const due = await ctx.runQuery(internal.internal.getRecurringTransactionsToProcess);
      if (!due || due.length === 0) break;
      const slice = due.slice(0, batchSize);

      for (const transaction of slice) {
        let iterations = 0;
        // Clamp nextDueDate to at least startDate to avoid boundary errors
        if (transaction.nextDueDate && transaction.nextDueDate < transaction.startDate) {
          transaction.nextDueDate = transaction.startDate;
        }
        while (
          transaction.nextDueDate &&
          transaction.isActive &&
          !transaction.softdelete &&
          transaction.nextDueDate <= Date.now() &&
          iterations < perItemCap
        ) {
          await ctx.runMutation(internal.internal.generateTransactionFromRecurring, {
            recurringTransactionId: transaction._id,
            targetDate: transaction.nextDueDate,
          });
          generatedTransactions += 1;
        const latest = await ctx.runQuery(internal.internal.getRecurringTransactionsToProcess);
        const updated = latest.find((t: typeof transaction) => t._id === transaction._id);
          transaction.nextDueDate = updated?.nextDueDate;
          iterations += 1;
        }
        processedRecurring += 1;
      }

      batchesRun += 1;
      if (slice.length < batchSize) break;
    }

    return { processedRecurring, generatedTransactions, batchesRun };
  },
});


