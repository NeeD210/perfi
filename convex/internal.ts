import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { stepDateByFrequency, initializeNextDueDate } from "./lib/scheduling";
import { Id } from "./_generated/dataModel";
import { LEDGER_DUAL_WRITE_ENABLED } from "./ledger/dualWriteConfig";
import {
  getCategoryAccountMapping,
  getPaymentTypeAccountMapping,
  createJournalEntry,
  createDoubleEntryLines,
  toMinorARS,
  ensureDefaultCashMapping,
} from "./ledger/dualWriteUtils";
import { logDualWriteError } from "./ledger/errorTracking";

// Internal query to get recurring transactions that need to be processed
export const getRecurringTransactionsToProcess = internalQuery({
  args: {},
  returns: v.array(v.object({
    _id: v.id("recurringTransactions"),
    _creationTime: v.number(),
    userId: v.id("users"),
    description: v.string(),
    amount: v.float64(),
    categoryId: v.id("categories"),
    paymentTypeId: v.optional(v.id("paymentTypes")),
    transactionType: v.string(),
    frequency: v.string(),
    startDate: v.float64(),
    endDate: v.optional(v.float64()),
    lastProcessedDate: v.optional(v.float64()),
    nextDueDateCalculationDay: v.optional(v.float64()),
    nextDueDate: v.optional(v.float64()),
    isActive: v.boolean(),
    softdelete: v.optional(v.boolean()),
    cuotas: v.optional(v.float64()),
  })),
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("recurringTransactions")
      .withIndex("by_isActive_nextDueDate", (q) => q.eq("isActive", true))
      .filter((q) => q.eq(q.field("softdelete"), false))
      .filter((q) => q.lte(q.field("nextDueDate"), now))
      .take(200);
    return due;
  },
});

// Internal mutation to generate a transaction from a recurring transaction
export const generateTransactionFromRecurring = internalMutation({
  args: {
    recurringTransactionId: v.id("recurringTransactions"),
    targetDate: v.number(),
  },
  returns: v.id("expenses"),
  handler: async (ctx, args) => {
    const recurringTransaction = await ctx.db.get(args.recurringTransactionId);
    if (!recurringTransaction) {
      throw new Error("Recurring transaction not found");
    }

    // Respect boundaries
    if (args.targetDate < recurringTransaction.startDate) {
      throw new Error("Target date before startDate");
    }
    if (recurringTransaction.endDate && args.targetDate > recurringTransaction.endDate) {
      await ctx.db.patch(args.recurringTransactionId, { isActive: false, nextDueDate: undefined });
      throw new Error("Recurring transaction past endDate; deactivated");
    }

    const category = await ctx.db.get(recurringTransaction.categoryId);
    if (!category) throw new Error("Category not found");

    // Idempotency: avoid duplicates for same recurringId+date
    const existing = await ctx.db
      .query("expenses")
      .withIndex("by_recurringTransactionId", (q) => q.eq("recurringTransactionId", args.recurringTransactionId))
      .filter((q) => q.eq(q.field("date"), args.targetDate))
      .first();
    if (existing) return existing._id;

    const transactionId = await ctx.db.insert("expenses", {
      userId: recurringTransaction.userId,
      description: recurringTransaction.description,
      amount: recurringTransaction.amount,
      category: category.name,
      categoryId: recurringTransaction.categoryId,
      paymentTypeId: recurringTransaction.paymentTypeId,
      transactionType: recurringTransaction.transactionType,
      date: args.targetDate,
      cuotas: recurringTransaction.cuotas ?? 1,
      verified: false,
      recurringTransactionId: args.recurringTransactionId,
      softdelete: false,
    });

    const anchorDay = new Date(recurringTransaction.startDate).getDate();
    const advancedNext = stepDateByFrequency(args.targetDate, recurringTransaction.frequency as any, anchorDay);
    await ctx.db.patch(args.recurringTransactionId, {
      lastProcessedDate: args.targetDate,
      nextDueDate: advancedNext,
    });

    if ((recurringTransaction.cuotas ?? 1) > 1 && recurringTransaction.paymentTypeId) {
      await ctx.runMutation(internal.internal.expenses.generatePaymentSchedules, {
        paymentTypeId: recurringTransaction.paymentTypeId,
        userId: recurringTransaction.userId,
        expenseId: transactionId,
        totalInstallments: recurringTransaction.cuotas ?? 1,
        firstDueDate: args.targetDate,
        totalAmount: recurringTransaction.amount,
      });
    }

    // Dual-write to ledger for generated transaction
    if (LEDGER_DUAL_WRITE_ENABLED) {
      try {
        const userId = recurringTransaction.userId as Id<"users">;
        const categoryMapping = await getCategoryAccountMapping(ctx, userId, recurringTransaction.categoryId);
        let paymentMapping = recurringTransaction.paymentTypeId
          ? await getPaymentTypeAccountMapping(ctx, userId, recurringTransaction.paymentTypeId)
          : null;
        if (!paymentMapping) {
          const ensured = await ensureDefaultCashMapping(ctx, userId);
          paymentMapping = { accountId: ensured.accountId } as const;
        }

          const isIncome = recurringTransaction.transactionType === "income";
          const amountARS = toMinorARS(recurringTransaction.amount);
          const entryId = await createJournalEntry({
            ctx,
            userId,
            date: args.targetDate,
            description: recurringTransaction.description,
            status: "posted",
            sourceType: "recurring",
            sourceId: args.recurringTransactionId,
            idempotencyKey: `recurring_dual_write_${args.recurringTransactionId}_${args.targetDate}`,
            createdBy: userId,
          });

          const debitAccountId = isIncome ? paymentMapping.accountId : categoryMapping.accountId;
          const creditAccountId = isIncome ? categoryMapping.accountId : paymentMapping.accountId;

          await createDoubleEntryLines({
            ctx,
            entryId,
            userId,
            debitAccountId,
            creditAccountId,
            amountARS,
            date: args.targetDate,
          });
      } catch (err) {
        logDualWriteError({
          operation: "generateTransactionFromRecurring",
          recurringId: String(args.recurringTransactionId),
          userId: String(recurringTransaction.userId),
          errorMessage: err instanceof Error ? err.message : String(err),
          errorStack: err instanceof Error ? err.stack : undefined,
          timestamp: Date.now(),
          context: {
            targetDate: args.targetDate,
            amount: recurringTransaction.amount,
            categoryId: String(recurringTransaction.categoryId),
          },
        });
      }
    }

    return transactionId;
  },
});

// Removed legacy helpers; nextDueDate progression is handled by frequency stepping

// Diagnostics: verify if a legacy recurringTransactions template was migrated to
// recurring_entries/recurring_lines and why it might be missing
export const verifyRecurringTemplateStatus = internalQuery({
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
  }),
  handler: async (ctx, args) => {
    const rt = await ctx.db.get(args.recurringTransactionId);
    const notes: Array<string> = [];
    if (!rt) {
      return {
        exists: false,
        mappingExists: false,
        recurringLinesCount: 0,
        hasCategoryMapping: false,
        hasPaymentTypeMapping: false,
        notes: ["Legacy recurring transaction not found"],
      };
    }

    const userId = rt.userId as Id<"users">;

    const categoryMap = await ctx.db
      .query("category_mappings")
      .withIndex("by_user_category", (q) => q.eq("userId", userId).eq("categoryId", rt.categoryId))
      .first();
    const hasCategoryMapping = !!categoryMap;
    if (!hasCategoryMapping) notes.push("Missing category mapping for this recurring transaction");

    let hasPaymentTypeMapping = true;
    if (rt.paymentTypeId) {
      const paymentTypeId = rt.paymentTypeId;
      const paymentMap = await ctx.db
        .query("payment_type_mappings")
        .withIndex("by_user_paymentType", (q) => q.eq("userId", userId).eq("paymentTypeId", paymentTypeId))
        .first();
      hasPaymentTypeMapping = !!paymentMap;
      if (!hasPaymentTypeMapping) notes.push("Missing payment type mapping; default cash will be used if backfilled");
    }

    const mapping = await ctx.db
      .query("recurring_template_mappings")
      .withIndex("by_user_legacyRecurring", (q) => q.eq("userId", userId).eq("legacyRecurringId", args.recurringTransactionId))
      .first();
    if (!mapping) {
      notes.push("No recurring template mapping found (recurring_template_mappings)");
      return {
        exists: true,
        mappingExists: false,
        recurringLinesCount: 0,
        hasCategoryMapping,
        hasPaymentTypeMapping,
        notes,
      };
    }

    const recurringEntryId = mapping.recurringEntryId as Id<"recurring_entries">;
    const linesCount = await ctx.db
      .query("recurring_lines")
      .withIndex("by_recurringId", (q) => q.eq("recurringId", recurringEntryId))
      .collect()
      .then((r) => r.length);

    return {
      exists: true,
      mappingExists: true,
      recurringEntryId,
      recurringLinesCount: linesCount,
      hasCategoryMapping,
      hasPaymentTypeMapping,
      notes,
    };
  },
});

// One-off backfill: create a recurring_entries template and lines for a legacy
// recurringTransactions row if it hasn't been migrated yet
export const backfillRecurringTemplateForLegacyId = internalMutation({
  args: {
    recurringTransactionId: v.id("recurringTransactions"),
  },
  returns: v.object({
    success: v.boolean(),
    recurringEntryId: v.optional(v.id("recurring_entries")),
    createdLines: v.number(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const rt = await ctx.db.get(args.recurringTransactionId);
    if (!rt) return { success: false, createdLines: 0, error: "Legacy recurring transaction not found" };

    const userId = rt.userId as Id<"users">;

    const categoryMap = await ctx.db
      .query("category_mappings")
      .withIndex("by_user_category", (q) => q.eq("userId", userId).eq("categoryId", rt.categoryId))
      .first();
    if (!categoryMap) return { success: false, createdLines: 0, error: "Missing category mapping" };

    // Ensure cash mapping/account exists
    const ensured = await ensureDefaultCashMapping(ctx, userId);

    // If mapping already exists, return existing info
    const existingMap = await ctx.db
      .query("recurring_template_mappings")
      .withIndex("by_user_legacyRecurring", (q) => q.eq("userId", userId).eq("legacyRecurringId", args.recurringTransactionId))
      .first();
    if (existingMap) {
      const linesCount = await ctx.db
        .query("recurring_lines")
        .withIndex("by_recurringId", (q) => q.eq("recurringId", existingMap.recurringEntryId))
        .collect().then((r) => r.length);
      return { success: true, recurringEntryId: existingMap.recurringEntryId, createdLines: linesCount };
    }

    const description: string = rt.description;
    const frequency: string = rt.frequency;
    const startDate: number = rt.startDate as number;
    const now = Date.now();
    const nextDueDate: number = initializeNextDueDate(startDate, now, frequency as any);
    const anchorDay: number = new Date(startDate).getDate();
    const endDate: number | undefined = rt.endDate as number | undefined;
    const amountARS: number = toMinorARS(rt.amount as number);
    const isIncome: boolean = rt.transactionType === "income";

    const recurringEntryId = (await ctx.db.insert("recurring_entries", {
      userId,
      description,
      frequency: frequency as any,
      creationTime: Date.now(),
      anchorDay,
      endDate,
      status: "active",
      nextDueDate,
      softdelete: false,
    })) as Id<"recurring_entries">;

    // Two lines per template
    if (isIncome) {
      await ctx.db.insert("recurring_lines", {
        recurringId: recurringEntryId,
        userId,
        accountId: ensured.accountId,
        direction: "debit" as const,
        currencyCode: "ARS",
        amount: amountARS,
        softdelete: false,
      });
      await ctx.db.insert("recurring_lines", {
        recurringId: recurringEntryId,
        userId,
        accountId: categoryMap.accountId as Id<"accounts">,
        direction: "credit" as const,
        currencyCode: "ARS",
        amount: amountARS,
        softdelete: false,
      });
    } else {
      await ctx.db.insert("recurring_lines", {
        recurringId: recurringEntryId,
        userId,
        accountId: categoryMap.accountId as Id<"accounts">,
        direction: "debit" as const,
        currencyCode: "ARS",
        amount: amountARS,
        softdelete: false,
      });
      await ctx.db.insert("recurring_lines", {
        recurringId: recurringEntryId,
        userId,
        accountId: ensured.accountId,
        direction: "credit" as const,
        currencyCode: "ARS",
        amount: amountARS,
        softdelete: false,
      });
    }

    await ctx.db.insert("recurring_template_mappings", {
      userId,
      legacyRecurringId: args.recurringTransactionId,
      recurringEntryId,
      createdAt: Date.now(),
    });

    return { success: true, recurringEntryId, createdLines: 2 };
  },
});

// Batch diagnostic: scan all active recurring transactions for a user and report their status
export const scanAllRecurringTemplates = internalQuery({
  args: {
    userId: v.id("users"),
  },
  returns: v.object({
    total: v.number(),
    withMappings: v.number(),
    withoutMappings: v.number(),
    missingCategoryMappings: v.number(),
    missingPaymentMappings: v.number(),
    brokenTemplates: v.array(v.object({
      recurringTransactionId: v.id("recurringTransactions"),
      description: v.string(),
      issues: v.array(v.string()),
    })),
  }),
  handler: async (ctx, args) => {
    const allRecurring = await ctx.db
      .query("recurringTransactions")
      .withIndex("by_user_isActive_startDate", (q) => q.eq("userId", args.userId).eq("isActive", true))
      .filter((q) => q.eq(q.field("softdelete"), false))
      .collect();

    const results = {
      total: allRecurring.length,
      withMappings: 0,
      withoutMappings: 0,
      missingCategoryMappings: 0,
      missingPaymentMappings: 0,
      brokenTemplates: [] as Array<{ recurringTransactionId: Id<"recurringTransactions">; description: string; issues: Array<string> }>,
    };

    for (const rt of allRecurring) {
      const issues: Array<string> = [];

      // Check category mapping
      const categoryMap = await ctx.db
        .query("category_mappings")
        .withIndex("by_user_category", (q) => q.eq("userId", args.userId).eq("categoryId", rt.categoryId))
        .first();
      if (!categoryMap) {
        issues.push("Missing category mapping");
        results.missingCategoryMappings += 1;
      }

      // Check payment type mapping (if applicable)
      if (rt.paymentTypeId) {
        const paymentTypeId = rt.paymentTypeId;
        const paymentMap = await ctx.db
          .query("payment_type_mappings")
          .withIndex("by_user_paymentType", (q) => q.eq("userId", args.userId).eq("paymentTypeId", paymentTypeId))
          .first();
        if (!paymentMap) {
          issues.push("Missing payment type mapping (will use default cash)");
          results.missingPaymentMappings += 1;
        }
      }

      // Check template mapping
      const templateMap = await ctx.db
        .query("recurring_template_mappings")
        .withIndex("by_user_legacyRecurring", (q) => q.eq("userId", args.userId).eq("legacyRecurringId", rt._id))
        .first();

      if (!templateMap) {
        issues.push("No recurring template mapping found");
        results.withoutMappings += 1;
      } else {
        // Check if lines exist
        const linesCount = await ctx.db
          .query("recurring_lines")
          .withIndex("by_recurringId", (q) => q.eq("recurringId", templateMap.recurringEntryId))
          .collect()
          .then((r) => r.length);

        if (linesCount === 0) {
          issues.push("Template mapping exists but no recurring_lines found");
        } else {
          results.withMappings += 1;
        }
      }

      if (issues.length > 0) {
        results.brokenTemplates.push({
          recurringTransactionId: rt._id,
          description: rt.description,
          issues,
        });
      }
    }

    return results;
  },
});

// Automated repair: backfill all broken recurring templates for a user
export const repairAllRecurringTemplates = internalMutation({
  args: {
    userId: v.id("users"),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    scanned: v.number(),
    repaired: v.number(),
    failed: v.number(),
    skipped: v.number(),
    failures: v.array(v.object({
      recurringTransactionId: v.id("recurringTransactions"),
      description: v.string(),
      error: v.string(),
    })),
  }),
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;
    
    const allRecurring = await ctx.db
      .query("recurringTransactions")
      .withIndex("by_user_isActive_startDate", (q) => q.eq("userId", args.userId).eq("isActive", true))
      .filter((q) => q.eq(q.field("softdelete"), false))
      .collect();

    const results = {
      scanned: allRecurring.length,
      repaired: 0,
      failed: 0,
      skipped: 0,
      failures: [] as Array<{ recurringTransactionId: Id<"recurringTransactions">; description: string; error: string }>,
    };

    for (const rt of allRecurring) {
      // Check if template mapping exists
      const templateMap = await ctx.db
        .query("recurring_template_mappings")
        .withIndex("by_user_legacyRecurring", (q) => q.eq("userId", args.userId).eq("legacyRecurringId", rt._id))
        .first();

      if (templateMap) {
        // Check if lines exist
        const linesCount = await ctx.db
          .query("recurring_lines")
          .withIndex("by_recurringId", (q) => q.eq("recurringId", templateMap.recurringEntryId))
          .collect()
          .then((r) => r.length);

        if (linesCount >= 2) {
          results.skipped += 1;
          continue; // Already has template and lines
        }
      }

      // Needs repair
      if (dryRun) {
        results.repaired += 1; // Would repair
        continue;
      }

      try {
        // Inline the backfill logic to avoid circular call issues
        const categoryMap = await ctx.db
          .query("category_mappings")
          .withIndex("by_user_category", (q) => q.eq("userId", args.userId).eq("categoryId", rt.categoryId))
          .first();
        
        if (!categoryMap) {
          results.failed += 1;
          results.failures.push({
            recurringTransactionId: rt._id,
            description: rt.description,
            error: "Missing category mapping",
          });
          continue;
        }

        const ensured = await ensureDefaultCashMapping(ctx, args.userId);
        
        const existingMap = await ctx.db
          .query("recurring_template_mappings")
          .withIndex("by_user_legacyRecurring", (q) => q.eq("userId", args.userId).eq("legacyRecurringId", rt._id))
          .first();
        
        if (existingMap) {
          results.repaired += 1;
          continue;
        }

        const description: string = rt.description;
        const frequency: string = rt.frequency;
        const startDate: number = rt.startDate as number;
        const now = Date.now();
        const nextDueDate: number = initializeNextDueDate(startDate, now, frequency as any);
        const anchorDay: number = new Date(startDate).getDate();
        const endDate: number | undefined = rt.endDate as number | undefined;
        const amountARS: number = toMinorARS(rt.amount as number);
        const isIncome: boolean = rt.transactionType === "income";

        const recurringEntryId = (await ctx.db.insert("recurring_entries", {
          userId: args.userId,
          description,
          frequency: frequency as any,
          creationTime: Date.now(),
          anchorDay,
          endDate,
          status: "active",
          nextDueDate,
          softdelete: false,
        })) as Id<"recurring_entries">;

        // Two lines per template
        if (isIncome) {
          await ctx.db.insert("recurring_lines", {
            recurringId: recurringEntryId,
            userId: args.userId,
            accountId: ensured.accountId,
            direction: "debit" as const,
            currencyCode: "ARS",
            amount: amountARS,
            softdelete: false,
          });
          await ctx.db.insert("recurring_lines", {
            recurringId: recurringEntryId,
            userId: args.userId,
            accountId: categoryMap.accountId as Id<"accounts">,
            direction: "credit" as const,
            currencyCode: "ARS",
            amount: amountARS,
            softdelete: false,
          });
        } else {
          await ctx.db.insert("recurring_lines", {
            recurringId: recurringEntryId,
            userId: args.userId,
            accountId: categoryMap.accountId as Id<"accounts">,
            direction: "debit" as const,
            currencyCode: "ARS",
            amount: amountARS,
            softdelete: false,
          });
          await ctx.db.insert("recurring_lines", {
            recurringId: recurringEntryId,
            userId: args.userId,
            accountId: ensured.accountId,
            direction: "credit" as const,
            currencyCode: "ARS",
            amount: amountARS,
            softdelete: false,
          });
        }

        await ctx.db.insert("recurring_template_mappings", {
          userId: args.userId,
          legacyRecurringId: rt._id,
          recurringEntryId,
          createdAt: Date.now(),
        });

        results.repaired += 1;
      } catch (error) {
        results.failed += 1;
        results.failures.push({
          recurringTransactionId: rt._id,
          description: rt.description,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  },
});