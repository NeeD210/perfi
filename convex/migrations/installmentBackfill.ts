import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  generateInstallmentIdempotencyKey,
  convertAmountARS,
  validateZeroSum,
  getBatchSize,
  createMigrationTimer,
  createProgressLogger,
  MIGRATION_FEATURE_FLAGS,
} from "./utils";

// Helper to ensure default cash payment type and mapping exist and are active
async function ensureDefaultCashMapping(ctx: any, userId: Id<"users">): Promise<{
  paymentTypeId: Id<"paymentTypes">;
  accountId: Id<"accounts">;
}> {
  const DEFAULT_CASH_NAME = "Efectivo o Transferencia";

  // Try to find payment type by name for this user (may be soft-deleted)
  const paymentTypes = await ctx.db
    .query("paymentTypes")
    .withIndex("by_user_softdelete", (q: any) => q.eq("userId", userId))
    .collect();

  let cashType = paymentTypes.find((pt: any) => pt.name === DEFAULT_CASH_NAME);

  if (!cashType) {
    // Create payment type
    const newPaymentTypeId = (await ctx.db.insert("paymentTypes", {
      name: DEFAULT_CASH_NAME,
      userId,
      isCredit: false,
      softdelete: false,
    })) as Id<"paymentTypes">;

    // Create asset account and mapping
    const accountId = (await ctx.db.insert("accounts", {
      userId,
      description: DEFAULT_CASH_NAME,
      accountType: "asset",
      creationTime: Date.now(),
      softdelete: false,
    })) as Id<"accounts">;

    await ctx.db.insert("payment_type_mappings", {
      userId,
      paymentTypeId: newPaymentTypeId,
      accountId,
      createdAt: Date.now(),
    });

    return { paymentTypeId: newPaymentTypeId, accountId };
  }

  // If soft-deleted, revive it
  if (cashType.softdelete) {
    await ctx.db.patch(cashType._id, { softdelete: false, deletedAt: undefined });
  }

  // Find or create mapping
  let mapping = await ctx.db
    .query("payment_type_mappings")
    .withIndex("by_user_paymentType", (q: any) =>
      q.eq("userId", userId).eq("paymentTypeId", cashType._id)
    )
    .first();

  if (!mapping) {
    // Create account and mapping
    const accountId = (await ctx.db.insert("accounts", {
      userId,
      description: DEFAULT_CASH_NAME,
      accountType: "asset",
      creationTime: Date.now(),
      softdelete: false,
    })) as Id<"accounts">;

    await ctx.db.insert("payment_type_mappings", {
      userId,
      paymentTypeId: cashType._id,
      accountId,
      createdAt: Date.now(),
    });

    return { paymentTypeId: cashType._id, accountId };
  }

  // Ensure mapped account is active
  const account = await ctx.db.get(mapping.accountId as Id<"accounts">);
  if (account?.softdelete) {
    await ctx.db.patch(account._id, { softdelete: false, deletedAt: undefined });
  }

  return { paymentTypeId: cashType._id, accountId: mapping.accountId } as {
    paymentTypeId: Id<"paymentTypes">;
    accountId: Id<"accounts">;
  };
}

/**
 * Migrates payment schedules to planned ledger entries
 * Must run after transaction backfill is complete
 */
export const backfillInstallmentSchedules = internalMutation({
  args: {
    userId: v.id("users"),
    batchSize: v.optional(v.number()), // default from utils
    offset: v.optional(v.number()), // unused; kept for backward compat
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    schedulesProcessed: v.number(),
    journalEntriesCreated: v.number(),
    success: v.boolean(),
    nextOffset: v.optional(v.number()),
    hasMore: v.boolean(),
    error: v.optional(v.string()),
    skipped: v.optional(v.number()),
  }),
  handler: async (ctx, args): Promise<{
    schedulesProcessed: number;
    journalEntriesCreated: number;
    success: boolean;
    nextOffset?: number;
    hasMore: boolean;
    error?: string;
    skipped?: number;
  }> => {
    // Check feature flag
    if (!MIGRATION_FEATURE_FLAGS.PHASE2_MIGRATIONS_ENABLED) {
      return {
        schedulesProcessed: 0,
        journalEntriesCreated: 0,
        success: false,
        hasMore: false,
        error: "Phase 2 migrations are not enabled. Set PHASE2_MIGRATIONS_ENABLED=true to run.",
      };
    }

    const timer = createMigrationTimer();
    const batchSize = args.batchSize || getBatchSize('installment_backfill');
    const progressLogger = createProgressLogger("Installment backfill");

    try {
      // Check if transaction backfill completed first
      const transactionBackfillProgress = await ctx.db
        .query("migration_progress")
        .withIndex("by_user_type", (q) =>
          q.eq("userId", args.userId).eq("migrationType", "transaction_backfill")
        )
        .first();

      if (!transactionBackfillProgress || transactionBackfillProgress.status !== "completed") {
        return {
          schedulesProcessed: 0,
          journalEntriesCreated: 0,
          success: false,
          hasMore: false,
          error: "Transaction backfill must complete before installment backfill",
        };
      }

      // Check existing progress
      const existingProgress = await ctx.db
        .query("migration_progress")
        .withIndex("by_user_type", (q) =>
          q.eq("userId", args.userId).eq("migrationType", "installment_backfill")
        )
        .first();

      // Count total schedules to process
      const totalSchedules = await ctx.db
        .query("paymentSchedules")
        .withIndex("by_user_softdelete_dueDate", (q) =>
          q.eq("userId", args.userId).eq("softdelete", false)
        )
        .collect()
        .then(schedules => schedules.length);

      // Create or update progress record
      const progressId = existingProgress?._id || await ctx.db.insert("migration_progress", {
        userId: args.userId,
        migrationType: "installment_backfill",
        status: "in_progress",
        recordsProcessed: existingProgress?.recordsProcessed || 0,
        totalRecords: totalSchedules,
        startedAt: Date.now(),
      });

      // Determine paging anchor from lastProcessedId
      const lastProcessedId = existingProgress?.lastProcessedId as Id<"paymentSchedules"> | undefined;
      let schedules: Array<any> = [];

      if (lastProcessedId) {
        const anchor = await ctx.db.get(lastProcessedId as Id<"paymentSchedules">);
        const anchorDue = anchor?.dueDate as number | undefined;

        if (anchorDue !== undefined) {
          // 1) Same dueDate, strictly after anchor _id
          const sameDue = await ctx.db
            .query("paymentSchedules")
            .withIndex("by_user_dueDate", (q) => q.eq("userId", args.userId).eq("dueDate", anchorDue))
            .order("asc")
            .take(batchSize * 2);

          for (const s of sameDue) {
            if (s._id > lastProcessedId && !s.softdelete) {
              schedules.push(s);
              if (schedules.length >= batchSize) break;
            }
          }

          // 2) Next due dates
          if (schedules.length < batchSize) {
            const remaining = batchSize - schedules.length;
            const nextDue = await ctx.db
              .query("paymentSchedules")
              .withIndex("by_user_dueDate", (q) => q.eq("userId", args.userId).gt("dueDate", anchorDue))
              .order("asc")
              .take(remaining);
            for (const s of nextDue) {
              if (!s.softdelete) schedules.push(s);
            }
          }
        }
      } else {
        // Initial batch
        const firstBatch = await ctx.db
          .query("paymentSchedules")
          .withIndex("by_user_dueDate", (q) => q.eq("userId", args.userId))
          .order("asc")
          .take(batchSize);
        schedules = firstBatch.filter((s) => !s.softdelete);
      }

      if (schedules.length === 0) {
        // No more schedules to process
        await ctx.db.patch(progressId, {
          status: "completed",
          completedAt: Date.now(),
        });

        return {
          schedulesProcessed: 0,
          journalEntriesCreated: 0,
          success: true,
          hasMore: false,
          skipped: 0,
        };
      }

      let schedulesProcessed = 0;
      let journalEntriesCreated = 0;
      let skipped = 0;

      for (const schedule of schedules) {
        const idempotencyKey = generateInstallmentIdempotencyKey(schedule.expenseId, schedule.installmentNumber);

        // Check if already processed
        const existingEntry = await ctx.db
          .query("journal_entries")
          .withIndex("by_sourceType_sourceId", (q) =>
            q.eq("sourceType", "installment").eq("sourceId", schedule._id)
          )
          .first();

        if (existingEntry) {
          schedulesProcessed++;
          continue; // Already processed
        }

        // Get the parent expense and its journal entry mapping
        const expenseMapping = await ctx.db
          .query("expense_mappings")
          .withIndex("by_user_expense", (q) =>
            q.eq("userId", args.userId).eq("expenseId", schedule.expenseId)
          )
          .first();

        if (!expenseMapping) {
          console.warn(`No expense mapping found for schedule ${schedule._id}, expense ${schedule.expenseId}`);
          schedulesProcessed++;
          continue;
        }

        // Load the parent expense to determine payment type
        const parentExpense = await ctx.db.get(schedule.expenseId as Id<"expenses">);
        if (!parentExpense) {
          console.warn(`Parent expense not found for schedule ${schedule._id}`);
          schedulesProcessed++;
          continue;
        }

        // Skip non-credit payment types (cash, bank transfers, etc.)
        // Load payment type for credit detection
        const expensePaymentType = parentExpense.paymentTypeId
          ? await ctx.db.get(parentExpense.paymentTypeId as Id<"paymentTypes">)
          : undefined;

        // If payment type doesn't have isCredit field OR it's explicitly false, skip
        // Note: Old data might not have isCredit set, so we check for both undefined and false
        const isCredit = expensePaymentType?.isCredit === true;

        if (!isCredit) {
          // For cash/non-credit payment types, skip installment migration
          schedulesProcessed++;
          skipped++;
          continue;
        }

        // Get the parent journal entry to use description/linking
        const parentEntry = await ctx.db.get(expenseMapping.journalEntryId);
        if (!parentEntry) {
          console.warn(`Parent journal entry not found: ${expenseMapping.journalEntryId}`);
          schedulesProcessed++;
          continue;
        }

        // Resolve involved accounts
        // 1) Card liability (from expense paymentType mapping)
        const cardMapping = await ctx.db
          .query("payment_type_mappings")
          .withIndex("by_user_paymentType", (q) =>
            q.eq("userId", args.userId).eq("paymentTypeId", parentExpense.paymentTypeId as Id<"paymentTypes">)
          )
          .first();

        if (!cardMapping) {
          console.warn(`Missing card mapping for paymentType ${String(parentExpense.paymentTypeId)} on schedule ${schedule._id}`);
          schedulesProcessed++;
          continue;
        }

        // 2) Default cash account (ensure exists)
        const { accountId: cashAccountId } = await ensureDefaultCashMapping(ctx, args.userId);

        // Convert amount (ARS scale 0)
        const amount = convertAmountARS(Math.abs(schedule.amount));

        // Create planned journal entry for this installment
        const journalEntryId = await ctx.db.insert("journal_entries", {
          userId: args.userId,
          parentEntryId: parentEntry._id,
          date: schedule.dueDate, // Use the due date as effective date
          updateTime: Date.now(),
          softdelete: false,
          description: `Installment ${schedule.installmentNumber}/${schedule.totalInstallments} of ${parentEntry.description}`,
          status: schedule.dueDate > Date.now() ? "planned" : "posted",
          sourceType: "installment",
          sourceId: schedule._id,
          idempotencyKey,
          linkType: "installment",
          installmentNumber: schedule.installmentNumber,
          totalInstallments: schedule.totalInstallments,
          createdBy: args.userId,
          updatedBy: args.userId,
        });

        // Create journal lines for payment of installment
        // Dr Card Liability, Cr Cash (default)
        const lines = [
          {
            journalEntryId: journalEntryId as Id<"journal_entries">,
            userId: args.userId,
            accountId: cardMapping.accountId as Id<"accounts">,
            direction: "debit" as const,
            currencyCode: "ARS",
            amount,
            amountBaseCurrency: amount,
            entryDate: schedule.dueDate,
            installmentNumber: schedule.installmentNumber,
            totalInstallments: schedule.totalInstallments,
          },
          {
            journalEntryId: journalEntryId as Id<"journal_entries">,
            userId: args.userId,
            accountId: cashAccountId as Id<"accounts">,
            direction: "credit" as const,
            currencyCode: "ARS",
            amount,
            amountBaseCurrency: -amount,
            entryDate: schedule.dueDate,
            installmentNumber: schedule.installmentNumber,
            totalInstallments: schedule.totalInstallments,
          },
        ];

        // Validate zero-sum invariant
        if (!validateZeroSum(lines)) {
          console.error(`Zero-sum validation failed for installment ${schedule._id}`);
          schedulesProcessed++;
          continue;
        }

        // Insert journal lines (unless dry-run)
        if (!args.dryRun) {
          for (const line of lines) {
            await ctx.db.insert("journal_lines", line);
          }
        }

        schedulesProcessed++;
        journalEntriesCreated++;

        // Update progress
        if (!args.dryRun) {
          await ctx.db.patch(progressId, {
            recordsProcessed: (existingProgress?.recordsProcessed || 0) + schedulesProcessed,
            lastProcessedId: schedule._id,
          });
        }

        progressLogger(schedulesProcessed, totalSchedules, batchSize);
      }

      // If we couldn't fill the batch, assume completion
      if (schedules.length < batchSize && !args.dryRun) {
        await ctx.db.patch(progressId, {
          status: "completed",
          completedAt: Date.now(),
        });
      }

      const elapsed = timer.getElapsedSeconds();
      console.log(`Installment backfill batch completed for user ${args.userId}: ${schedulesProcessed} schedules processed, ${journalEntriesCreated} entries created in ${elapsed}s`);

      return {
        schedulesProcessed,
        journalEntriesCreated,
        success: true,
        nextOffset: schedules.length === batchSize ? (args.offset || 0) + schedulesProcessed : undefined,
        hasMore: schedules.length === batchSize,
        skipped,
      };

    } catch (error) {
      console.error(`Installment backfill failed for user ${args.userId}:`, error);

      // Update progress with error
      const progressRecord = await ctx.db
        .query("migration_progress")
        .withIndex("by_user_type", (q) =>
          q.eq("userId", args.userId).eq("migrationType", "installment_backfill")
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
        schedulesProcessed: 0,
        journalEntriesCreated: 0,
        success: false,
        hasMore: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
