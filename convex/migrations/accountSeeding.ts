import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  generateAccountSeedingKey,
  getAccountTypeFromPaymentType,
  getAccountTypeFromTransactionType,
  getBatchSize,
  createMigrationTimer,
  createProgressLogger,
  MIGRATION_FEATURE_FLAGS,
} from "./utils";

/**
 * Seeds accounts from existing paymentTypes and categories
 * This is the first migration step that must complete before transaction backfill
 */
export const seedAccountsFromLegacyData = internalMutation({
  args: {
    userId: v.id("users"),
    batchSize: v.optional(v.number()), // default from utils
    includeSoftDeleted: v.optional(v.boolean()), // Include soft-deleted items (default: true)
  },
  returns: v.object({
    accountsCreated: v.number(),
    mappingsCreated: v.number(),
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{
    accountsCreated: number;
    mappingsCreated: number;
    success: boolean;
    error?: string;
  }> => {
    const includeSoftDeleted = args.includeSoftDeleted ?? true; // Default to including soft-deleted
    // Check feature flag
    if (!MIGRATION_FEATURE_FLAGS.PHASE2_MIGRATIONS_ENABLED) {
      return {
        accountsCreated: 0,
        mappingsCreated: 0,
        success: false,
        error: "Phase 2 migrations are not enabled. Set PHASE2_MIGRATIONS_ENABLED=true to run.",
      };
    }

    const timer = createMigrationTimer();
    const batchSize = args.batchSize || getBatchSize('account_seeding');

    try {
      // Check if migration already completed
      const existingProgress = await ctx.db
        .query("migration_progress")
        .withIndex("by_user_type", (q) =>
          q.eq("userId", args.userId).eq("migrationType", "account_seeding")
        )
        .first();

      if (existingProgress?.status === "completed") {
        return {
          accountsCreated: 0,
          mappingsCreated: 0,
          success: true,
        };
      }

      // Create or update progress record
      const progressId = existingProgress?._id || await ctx.db.insert("migration_progress", {
        userId: args.userId,
        migrationType: "account_seeding",
        status: "in_progress",
        recordsProcessed: 0,
        totalRecords: 0, // Will update after counting
        startedAt: Date.now(),
      });

      // Count total records to process (including soft-deleted if flag is true)
      const [paymentTypeCount, categoryCount] = await Promise.all([
        (includeSoftDeleted
          ? ctx.db
              .query("paymentTypes")
              .withIndex("by_user", (q) => q.eq("userId", args.userId))
              .collect()
          : ctx.db
              .query("paymentTypes")
              .withIndex("by_user_softdelete", (q) =>
                q.eq("userId", args.userId).eq("softdelete", false)
              )
              .collect()
        ).then(types => types.length),
        (includeSoftDeleted
          ? ctx.db
              .query("categories")
              .withIndex("by_user", (q) => q.eq("userId", args.userId))
              .collect()
          : ctx.db
              .query("categories")
              .withIndex("by_user_softdelete", (q) =>
                q.eq("userId", args.userId).eq("softdelete", false)
              )
              .collect()
        ).then(categories => categories.length)
      ]);

      const totalRecords = paymentTypeCount + categoryCount;

      // Update progress with total count
      await ctx.db.patch(progressId, {
        totalRecords,
      });

      let accountsCreated = 0;
      let mappingsCreated = 0;

      // Process payment types (including soft-deleted if flag is true)
      const paymentTypes = includeSoftDeleted
        ? await ctx.db
            .query("paymentTypes")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .collect()
        : await ctx.db
            .query("paymentTypes")
            .withIndex("by_user_softdelete", (q) =>
              q.eq("userId", args.userId).eq("softdelete", false)
            )
            .collect();

      for (const paymentType of paymentTypes) {
        const idempotencyKey = generateAccountSeedingKey(args.userId, paymentType._id, 'paymentType');

        // Check if already processed
        const existingMapping = await ctx.db
          .query("payment_type_mappings")
          .withIndex("by_user_paymentType", (q) =>
            q.eq("userId", args.userId).eq("paymentTypeId", paymentType._id)
          )
          .first();

        if (existingMapping) {
          continue; // Already processed
        }

        // Determine account type
        const accountType = getAccountTypeFromPaymentType(paymentType.isCredit);

        // Create account (preserve soft-delete status)
        const accountId = await ctx.db.insert("accounts", {
          userId: args.userId,
          description: paymentType.name,
          accountType,
          creationTime: Date.now(),
          softdelete: paymentType.softdelete || false, // PRESERVE soft-delete status
        });

        // Create card entry if it's a credit card (and not soft-deleted)
        if (paymentType.isCredit && !paymentType.softdelete && paymentType.closingDay && paymentType.dueDay) {
          await ctx.db.insert("cards", {
            accountId: accountId as Id<"accounts">,
            userId: args.userId,
            closingDay: paymentType.closingDay,
            dueDate: paymentType.dueDay,
            baseCurrency: "ARS", // Default to ARS for existing cards
            createdAt: Date.now(),
            softdelete: false,
          });
        }

        // Create mapping
        await ctx.db.insert("payment_type_mappings", {
          userId: args.userId,
          paymentTypeId: paymentType._id,
          accountId: accountId as Id<"accounts">,
          createdAt: Date.now(),
        });

        accountsCreated++;
        mappingsCreated++;

        // Update progress
        await ctx.db.patch(progressId, {
          recordsProcessed: accountsCreated + mappingsCreated,
        });
      }

      // Process categories (including soft-deleted if flag is true)
      const categories = includeSoftDeleted
        ? await ctx.db
            .query("categories")
            .withIndex("by_user", (q) => q.eq("userId", args.userId))
            .collect()
        : await ctx.db
            .query("categories")
            .withIndex("by_user_softdelete", (q) =>
              q.eq("userId", args.userId).eq("softdelete", false)
            )
            .collect();

      for (const category of categories) {
        const idempotencyKey = generateAccountSeedingKey(args.userId, category._id, 'category');

        // Check if already processed
        const existingMapping = await ctx.db
          .query("category_mappings")
          .withIndex("by_user_category", (q) =>
            q.eq("userId", args.userId).eq("categoryId", category._id)
          )
          .first();

        if (existingMapping) {
          continue; // Already processed
        }

        // Determine account type from transaction type
        const accountType = getAccountTypeFromTransactionType(category.transactionType || 'expense');

        // Create account (preserve soft-delete status)
        const accountId = await ctx.db.insert("accounts", {
          userId: args.userId,
          description: category.name,
          accountType,
          creationTime: Date.now(),
          softdelete: category.softdelete || false, // PRESERVE soft-delete status
        });

        // Create mapping
        await ctx.db.insert("category_mappings", {
          userId: args.userId,
          categoryId: category._id,
          accountId: accountId as Id<"accounts">,
          createdAt: Date.now(),
        });

        accountsCreated++;
        mappingsCreated++;

        // Update progress
        await ctx.db.patch(progressId, {
          recordsProcessed: accountsCreated + mappingsCreated,
        });
      }

      // Mark as completed
      await ctx.db.patch(progressId, {
        status: "completed",
        completedAt: Date.now(),
      });

      const elapsed = timer.getElapsedSeconds();
      console.log(`Account seeding completed for user ${args.userId}: ${accountsCreated} accounts created, ${mappingsCreated} mappings created in ${elapsed}s`);

      return {
        accountsCreated,
        mappingsCreated,
        success: true,
      };

    } catch (error) {
      console.error(`Account seeding failed for user ${args.userId}:`, error);

      // Update progress with error
      const progressRecord = await ctx.db
        .query("migration_progress")
        .withIndex("by_user_type", (q) =>
          q.eq("userId", args.userId).eq("migrationType", "account_seeding")
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
        accountsCreated: 0,
        mappingsCreated: 0,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
