import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { initializeNextDueDate } from "../lib/scheduling";
import { convertAmountARS } from "./utils";

/**
 * Migrate legacy recurringTransactions into ledger recurring_entries and recurring_lines.
 *
 * Rules:
 * - Follow the same accounting pattern as cash migrations.
 *   - Expense: Dr Expense account, Cr Cash/Bank (asset)
 *   - Income:  Dr Cash/Bank (asset), Cr Income account
 * - Ignore any cuotas-related logic; cuotas is a dummy column for recurring.
 * - If no paymentType mapping exists, ensure default cash mapping exists and use it.
 * - Best-effort idempotency: if a similar recurring entry exists for a legacy item, skip.
 */

// Helper to ensure default cash payment type and mapping exist and are active
async function ensureDefaultCashMapping(ctx: any, userId: Id<"users">): Promise<{
  paymentTypeId: Id<"paymentTypes">;
  accountId: Id<"accounts">;
}> {
  const DEFAULT_CASH_NAME = "Efectivo o Transferencia";

  const paymentTypes = await ctx.db
    .query("paymentTypes")
    .withIndex("by_user_softdelete", (q: any) => q.eq("userId", userId))
    .collect();

  let cashType = paymentTypes.find((pt: any) => pt.name === DEFAULT_CASH_NAME);

  if (!cashType) {
    const newPaymentTypeId = (await ctx.db.insert("paymentTypes", {
      name: DEFAULT_CASH_NAME,
      userId,
      isCredit: false,
      softdelete: false,
    })) as Id<"paymentTypes">;

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

  if (cashType.softdelete) {
    await ctx.db.patch(cashType._id, { softdelete: false, deletedAt: undefined });
  }

  let mapping = await ctx.db
    .query("payment_type_mappings")
    .withIndex("by_user_paymentType", (q: any) =>
      q.eq("userId", userId).eq("paymentTypeId", cashType._id)
    )
    .first();

  if (!mapping) {
    const accountId = (await ctx.db.insert("accounts", {
      userId,
      description: DEFAULT_CASH_NAME,
      accountType: "asset",
      creationTime: Date.now(),
      softdelete: false,
    })) as Id<"accounts">;
    await ctx.db.insert("payment_type_mappings", {
      userId,
      paymentTypeId: cashType._id as Id<"paymentTypes">,
      accountId,
      createdAt: Date.now(),
    });
    return { paymentTypeId: cashType._id as Id<"paymentTypes">, accountId };
  }

  return { paymentTypeId: mapping.paymentTypeId as Id<"paymentTypes">, accountId: mapping.accountId as Id<"accounts"> };
}

export const migrateRecurringTemplatesForUser = internalMutation({
  args: {
    userId: v.id("users"),
    batchSize: v.optional(v.number()),
    lastProcessedId: v.optional(v.id("recurringTransactions")),
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
    const batchSize = args.batchSize ?? 100;

    // Load a batch of legacy recurring transactions for this user
    // Prefer ordering by startDate for determinism
    const query = ctx.db
      .query("recurringTransactions")
      .withIndex("by_user_isActive_startDate", (q: any) =>
        q.eq("userId", args.userId).eq("isActive", true)
      )
      .order("asc");

    const legacy = await query.take(batchSize * 2); // small over-fetch; we filter softdelete below

    const items = legacy
      .filter((t: any) => !t.softdelete)
      .slice(0, batchSize);

    if (items.length === 0) {
      return {
        processed: 0,
        createdEntries: 0,
        createdLines: 0,
        skipped: 0,
        hasMore: false,
        success: true,
      };
    }

    let processed = 0;
    let createdEntries = 0;
    let createdLines = 0;
    let skipped = 0;
    let lastProcessedId: Id<"recurringTransactions"> | undefined;

    for (const rt of items) {
      // Idempotency via mapping table
      const existingMap = await ctx.db
        .query("recurring_template_mappings")
        .withIndex("by_user_legacyRecurring", (q: any) =>
          q.eq("userId", args.userId).eq("legacyRecurringId", rt._id as Id<"recurringTransactions">)
        )
        .first();
      if (existingMap) {
        skipped += 1;
        processed += 1;
        lastProcessedId = rt._id as Id<"recurringTransactions">;
        continue;
      }

      // Resolve category and cash accounts
      const categoryMapping = await ctx.db
        .query("category_mappings")
        .withIndex("by_user_category", (q: any) =>
          q.eq("userId", args.userId).eq("categoryId", rt.categoryId)
        )
        .first();

      // If payment type mapping missing, fallback to default cash mapping
      let cashAccountId: Id<"accounts"> | undefined;
      if (rt.paymentTypeId) {
        const ptMapping = await ctx.db
          .query("payment_type_mappings")
          .withIndex("by_user_paymentType", (q: any) =>
            q.eq("userId", args.userId).eq("paymentTypeId", rt.paymentTypeId)
          )
          .first();
        if (ptMapping) cashAccountId = ptMapping.accountId as Id<"accounts">;
      }
      if (!cashAccountId) {
        const ensured = await ensureDefaultCashMapping(ctx, args.userId);
        cashAccountId = ensured.accountId;
      }

      if (!categoryMapping) {
        // Missing mapping; skip this template but count as processed
        skipped += 1;
        processed += 1;
        lastProcessedId = rt._id as Id<"recurringTransactions">;
        continue;
      }

      const description: string = rt.description;
      const frequency: string = rt.frequency;
      const startDate: number = rt.startDate as number;
      const now = Date.now();
      const nextDueDate: number = initializeNextDueDate(startDate, now, frequency as any);
      const anchorDay: number = new Date(startDate).getDate();
      const endDate: number | undefined = rt.endDate as number | undefined;
      const amountARS: number = convertAmountARS(rt.amount as number);
      const isIncome: boolean = rt.transactionType === "income";

      // Create recurring entry
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
      createdEntries += 1;

      // Create recurring lines (two lines per template)
      if (isIncome) {
        // Income: Dr Cash/Bank (asset), Cr Income Account
        await ctx.db.insert("recurring_lines", {
          recurringId: recurringEntryId,
          userId: args.userId,
          accountId: cashAccountId!,
          direction: "debit",
          currencyCode: "ARS",
          amount: amountARS,
          softdelete: false,
        });
        await ctx.db.insert("recurring_lines", {
          recurringId: recurringEntryId,
          userId: args.userId,
          accountId: categoryMapping.accountId as Id<"accounts">,
          direction: "credit",
          currencyCode: "ARS",
          amount: amountARS,
          softdelete: false,
        });
        createdLines += 2;
      } else {
        // Expense: Dr Expense Account, Cr Cash/Bank (asset)
        await ctx.db.insert("recurring_lines", {
          recurringId: recurringEntryId,
          userId: args.userId,
          accountId: categoryMapping.accountId as Id<"accounts">,
          direction: "debit",
          currencyCode: "ARS",
          amount: amountARS,
          softdelete: false,
        });
        await ctx.db.insert("recurring_lines", {
          recurringId: recurringEntryId,
          userId: args.userId,
          accountId: cashAccountId!,
          direction: "credit",
          currencyCode: "ARS",
          amount: amountARS,
          softdelete: false,
        });
        createdLines += 2;
      }

      // Write mapping for idempotency on re-runs
      await ctx.db.insert("recurring_template_mappings", {
        userId: args.userId,
        legacyRecurringId: rt._id as Id<"recurringTransactions">,
        recurringEntryId,
        createdAt: Date.now(),
      });

      processed += 1;
      lastProcessedId = rt._id as Id<"recurringTransactions">;
    }

    return {
      processed,
      createdEntries,
      createdLines,
      skipped,
      hasMore: items.length === batchSize,
      lastProcessedId,
      success: true,
    };
  },
});


