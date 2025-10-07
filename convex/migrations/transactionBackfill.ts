import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  generateExpenseIdempotencyKey,
  convertAmountARS,
  validateZeroSum,
  createJournalEntryDescription,
  getBatchSize,
  createMigrationTimer,
  createProgressLogger,
  MIGRATION_FEATURE_FLAGS,
} from "./utils";

/**
 * Migrates historical expenses to double-entry ledger format
 * Must run after account seeding is complete
 */
export const backfillHistoricalTransactions = internalMutation({
  args: {
    userId: v.id("users"),
    batchSize: v.optional(v.number()), // default from utils
    offset: v.optional(v.number()), // unused; kept for backward compat
  },
  returns: v.object({
    expensesProcessed: v.number(),
    journalEntriesCreated: v.number(),
    success: v.boolean(),
    nextOffset: v.optional(v.number()),
    hasMore: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{
    expensesProcessed: number;
    journalEntriesCreated: number;
    success: boolean;
    nextOffset?: number;
    hasMore: boolean;
    error?: string;
  }> => {
    // Check feature flag
    if (!MIGRATION_FEATURE_FLAGS.PHASE2_MIGRATIONS_ENABLED) {
      return {
        expensesProcessed: 0,
        journalEntriesCreated: 0,
        success: false,
        hasMore: false,
        error: "Phase 2 migrations are not enabled. Set PHASE2_MIGRATIONS_ENABLED=true to run.",
      };
    }

    const timer = createMigrationTimer();
    const batchSize = args.batchSize || getBatchSize('transaction_backfill');
    const progressLogger = createProgressLogger("Transaction backfill");

    try {
      // Check if account seeding completed first
      const accountSeedingProgress = await ctx.db
        .query("migration_progress")
        .withIndex("by_user_type", (q) =>
          q.eq("userId", args.userId).eq("migrationType", "account_seeding")
        )
        .first();

      if (!accountSeedingProgress || accountSeedingProgress.status !== "completed") {
        return {
          expensesProcessed: 0,
          journalEntriesCreated: 0,
          success: false,
          hasMore: false,
          error: "Account seeding must complete before transaction backfill",
        };
      }

      // Check existing progress
      const existingProgress = await ctx.db
        .query("migration_progress")
        .withIndex("by_user_type", (q) =>
          q.eq("userId", args.userId).eq("migrationType", "transaction_backfill")
        )
        .first();

      // Count total expenses to process
      const totalExpenses = await ctx.db
        .query("expenses")
        .withIndex("by_user_softdelete", (q) =>
          q.eq("userId", args.userId).eq("softdelete", false)
        )
        .collect()
        .then(expenses => expenses.length);

      // Create or update progress record
      const progressId = existingProgress?._id || await ctx.db.insert("migration_progress", {
        userId: args.userId,
        migrationType: "transaction_backfill",
        status: "in_progress",
        recordsProcessed: existingProgress?.recordsProcessed || 0,
        totalRecords: totalExpenses,
        startedAt: Date.now(),
      });

      // Determine paging anchor from lastProcessedId
      const lastProcessedId = existingProgress?.lastProcessedId as Id<"expenses"> | undefined;
      let expenses: Array<any> = [];

      if (lastProcessedId) {
        const anchor = await ctx.db.get(lastProcessedId as Id<"expenses">);
        const anchorDate = anchor?.date as number | undefined;

        // 1) Collect remaining expenses on the same date strictly after the anchor _id
        if (anchorDate !== undefined) {
          const sameDate = await ctx.db
            .query("expenses")
            .withIndex("by_user_date", (q) => q.eq("userId", args.userId).eq("date", anchorDate))
            .order("asc")
            .take(batchSize * 2);

          for (const e of sameDate) {
            if (e._id > lastProcessedId && !e.softdelete) {
              expenses.push(e);
              if (expenses.length >= batchSize) break;
            }
          }

          // 2) If batch not full, collect next dates
          if (expenses.length < batchSize) {
            const remaining = batchSize - expenses.length;
            const nextDates = await ctx.db
              .query("expenses")
              .withIndex("by_user_date", (q) => q.eq("userId", args.userId).gt("date", anchorDate))
              .order("asc")
              .take(remaining);
            for (const e of nextDates) {
              if (!e.softdelete) expenses.push(e);
            }
          }
        }
      } else {
        // Initial batch from the beginning
        const firstBatch = await ctx.db
          .query("expenses")
          .withIndex("by_user_date", (q) => q.eq("userId", args.userId))
          .order("asc")
          .take(batchSize);
        expenses = firstBatch.filter((e) => !e.softdelete);
      }

      if (expenses.length === 0) {
      // No more expenses to process
      await ctx.db.patch(progressId, {
        status: "completed",
        completedAt: Date.now(),
      });

      return {
        expensesProcessed: 0,
        journalEntriesCreated: 0,
        success: true,
        hasMore: false,
      };
      }

      let expensesProcessed = 0;
      let journalEntriesCreated = 0;

      for (const expense of expenses) {
        const idempotencyKey = generateExpenseIdempotencyKey(expense._id);

        // Check if already processed
        const existingMapping = await ctx.db
          .query("expense_mappings")
          .withIndex("by_user_expense", (q) =>
            q.eq("userId", args.userId).eq("expenseId", expense._id)
          )
          .first();

        if (existingMapping) {
          expensesProcessed++;
          continue; // Already processed
        }

        // Get account mappings
        const [categoryMapping, paymentTypeMapping] = await Promise.all([
          expense.categoryId ? ctx.db
            .query("category_mappings")
            .withIndex("by_user_category", (q) =>
              q.eq("userId", args.userId).eq("categoryId", expense.categoryId!)
            )
            .first() : null,
          expense.paymentTypeId ? ctx.db
            .query("payment_type_mappings")
            .withIndex("by_user_paymentType", (q) =>
              q.eq("userId", args.userId).eq("paymentTypeId", expense.paymentTypeId!)
            )
            .first() : null,
        ]);

        if (!categoryMapping || !paymentTypeMapping) {
          console.warn(`Missing mappings for expense ${expense._id}: category=${!!categoryMapping}, paymentType=${!!paymentTypeMapping}`);
          // Skip this expense but continue processing others
          expensesProcessed++;
          continue;
        }

        // Convert amount (ARS scale 0)
        const amount = convertAmountARS(Math.abs(expense.amount)); // Ensure positive for ledger
        const isIncome = expense.transactionType === 'income';

        // Create journal entry
        const journalEntryId = await ctx.db.insert("journal_entries", {
          userId: args.userId,
          date: expense.date, // Use original expense date
          updateTime: Date.now(),
          softdelete: false,
          description: createJournalEntryDescription(expense),
          status: "posted", // Historical transactions are posted
          sourceType: isIncome ? "income" : "expense",
          sourceId: expense._id,
          idempotencyKey,
          createdBy: args.userId, // Assume user created these
          updatedBy: args.userId,
        });

        // Create journal lines for double-entry
        const lines = [];

        if (isIncome) {
          // Income: Dr Cash/Bank (asset), Cr Income Account
          lines.push({
            journalEntryId: journalEntryId as Id<"journal_entries">,
            userId: args.userId,
            accountId: paymentTypeMapping.accountId, // Debit cash/bank
            direction: "debit" as const,
            currencyCode: "ARS",
            amount, // Positive amount
            amountBaseCurrency: amount, // Same for ARS
            entryDate: expense.date,
          });
          lines.push({
            journalEntryId: journalEntryId as Id<"journal_entries">,
            userId: args.userId,
            accountId: categoryMapping.accountId, // Credit income account
            direction: "credit" as const,
            currencyCode: "ARS",
            amount, // Positive amount
            amountBaseCurrency: -amount, // Negative for credit
            entryDate: expense.date,
          });
        } else {
          // Expense: Dr Expense Account, Cr Cash/Bank (asset/liability)
          lines.push({
            journalEntryId: journalEntryId as Id<"journal_entries">,
            userId: args.userId,
            accountId: categoryMapping.accountId, // Debit expense account
            direction: "debit" as const,
            currencyCode: "ARS",
            amount, // Positive amount
            amountBaseCurrency: amount, // Positive for debit
            entryDate: expense.date,
          });
          lines.push({
            journalEntryId: journalEntryId as Id<"journal_entries">,
            userId: args.userId,
            accountId: paymentTypeMapping.accountId, // Credit cash/bank/card
            direction: "credit" as const,
            currencyCode: "ARS",
            amount, // Positive amount
            amountBaseCurrency: -amount, // Negative for credit
            entryDate: expense.date,
          });
        }

        // Validate zero-sum invariant
        if (!validateZeroSum(lines)) {
          console.error(`Zero-sum validation failed for expense ${expense._id}`);
          // Skip this expense but continue processing others
          expensesProcessed++;
          continue;
        }

        // Insert journal lines
        for (const line of lines) {
          await ctx.db.insert("journal_lines", line);
        }

        // Create expense mapping
        await ctx.db.insert("expense_mappings", {
          userId: args.userId,
          expenseId: expense._id,
          journalEntryId: journalEntryId as Id<"journal_entries">,
          createdAt: Date.now(),
        });

        expensesProcessed++;
        journalEntriesCreated++;

        // Update progress
        await ctx.db.patch(progressId, {
          recordsProcessed: (existingProgress?.recordsProcessed || 0) + expensesProcessed,
          lastProcessedId: expense._id,
        });

        progressLogger(expensesProcessed, totalExpenses, batchSize);
      }

      // If we couldn't fill the batch, assume no more for now
      if (expenses.length < batchSize) {
        await ctx.db.patch(progressId, {
          status: "completed",
          completedAt: Date.now(),
        });
      }

      const elapsed = timer.getElapsedSeconds();
      console.log(`Transaction backfill batch completed for user ${args.userId}: ${expensesProcessed} expenses processed, ${journalEntriesCreated} entries created in ${elapsed}s`);

      return {
        expensesProcessed,
        journalEntriesCreated,
        success: true,
        nextOffset: expenses.length === batchSize ? (args.offset || 0) + expensesProcessed : undefined,
        hasMore: expenses.length === batchSize,
      };

    } catch (error) {
      console.error(`Transaction backfill failed for user ${args.userId}:`, error);

      // Update progress with error
      const progressRecord = await ctx.db
        .query("migration_progress")
        .withIndex("by_user_type", (q) =>
          q.eq("userId", args.userId).eq("migrationType", "transaction_backfill")
        )
        .first();

      if (progressRecord) {
        await ctx.db.patch(progressRecord._id, {
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Unknown error",
          completedAt: Date.now(),
        });
      }

      return {
        expensesProcessed: 0,
        journalEntriesCreated: 0,
        success: false,
        hasMore: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
