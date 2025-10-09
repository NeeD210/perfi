import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { convertAmountARS, validateZeroSum, createJournalEntryDescription } from "../migrations/utils";

export type Direction = "debit" | "credit";

export interface CreateEntryParams {
  ctx: any;
  userId: Id<"users">;
  date: number;
  description: string;
  status: "posted" | "planned";
  sourceType: "expense" | "income" | "recurring" | "installment";
  sourceId: string | Id<any>;
  idempotencyKey: string;
  createdBy: Id<"users">;
}

export interface CreateDoubleEntryLinesParams {
  ctx: any;
  entryId: Id<"journal_entries">;
  userId: Id<"users">;
  debitAccountId: Id<"accounts">;
  creditAccountId: Id<"accounts">;
  amountARS: number; // positive integer in minor units
  date: number;
}

export async function getCategoryAccountMapping(
  ctx: any,
  userId: Id<"users">,
  categoryId: Id<"categories">
): Promise<{ accountId: Id<"accounts"> }> {
  const mapping = await ctx.db
    .query("category_mappings")
    .withIndex("by_user_category", (q: any) => q.eq("userId", userId).eq("categoryId", categoryId))
    .first();
  if (!mapping) {
    throw new Error(`No category mapping found for user ${userId} and category ${categoryId}`);
  }
  return { accountId: mapping.accountId as Id<"accounts"> };
}

export async function getPaymentTypeAccountMapping(
  ctx: any,
  userId: Id<"users">,
  paymentTypeId: Id<"paymentTypes">
): Promise<{ accountId: Id<"accounts"> }> {
  const mapping = await ctx.db
    .query("payment_type_mappings")
    .withIndex("by_user_paymentType", (q: any) => q.eq("userId", userId).eq("paymentTypeId", paymentTypeId))
    .first();
  if (!mapping) {
    throw new Error(`No payment type mapping found for user ${userId} and paymentType ${paymentTypeId}`);
  }
  return { accountId: mapping.accountId as Id<"accounts"> };
}

export async function createJournalEntry(params: CreateEntryParams): Promise<Id<"journal_entries">> {
  const { ctx, userId, date, description, status, sourceType, sourceId, idempotencyKey, createdBy } = params;
  const entryId = (await ctx.db.insert("journal_entries", {
    userId,
    date,
    updateTime: Date.now(),
    description,
    status,
    sourceType,
    sourceId: String(sourceId),
    idempotencyKey,
    createdBy,
    softdelete: false,
  })) as Id<"journal_entries">;
  return entryId;
}

export async function createDoubleEntryLines(params: CreateDoubleEntryLinesParams): Promise<void> {
  const { ctx, entryId, userId, debitAccountId, creditAccountId, amountARS, date } = params;
  const lines = [
    {
      journalEntryId: entryId,
      userId,
      accountId: debitAccountId,
      direction: "debit" as const,
      currencyCode: "ARS",
      amount: amountARS,
      amountBaseCurrency: amountARS,
      entryDate: date,
    },
    {
      journalEntryId: entryId,
      userId,
      accountId: creditAccountId,
      direction: "credit" as const,
      currencyCode: "ARS",
      amount: amountARS,
      amountBaseCurrency: -amountARS,
      entryDate: date,
    },
  ];

  if (!validateZeroSum(lines)) {
    throw new Error("Zero-sum validation failed for journal lines");
  }

  for (const line of lines) {
    await ctx.db.insert("journal_lines", line);
  }
}

export async function createInstallmentEntries(
  ctx: any,
  params: {
    parentEntryId: Id<"journal_entries">;
    totalAmount: number; // integer ARS
    totalInstallments: number;
    paymentAccountId: Id<"accounts">;
    expenseOrIncomeAccountId: Id<"accounts">;
    userId: Id<"users">;
    startDate: number;
    isIncome: boolean;
  }
): Promise<void> {
  const {
    parentEntryId,
    totalAmount,
    totalInstallments,
    paymentAccountId,
    expenseOrIncomeAccountId,
    userId,
    startDate,
    isIncome,
  } = params;

  const base = Math.floor(totalAmount / totalInstallments);
  let remainder = totalAmount - base * totalInstallments;

  for (let i = 1; i <= totalInstallments; i++) {
    const add = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    const installmentAmount = base + add;

    // For now, schedule monthly on same day; payment type-specific logic can be added if needed
    const d = new Date(startDate);
    const next = new Date(d.getFullYear(), d.getMonth() + (i - 1), d.getDate()).getTime();

    const entryId = (await ctx.db.insert("journal_entries", {
      userId,
      parentEntryId,
      date: next,
      updateTime: Date.now(),
      description: `Installment ${i}/${totalInstallments}`,
      status: "planned",
      sourceType: "installment",
      linkType: "installment",
      installmentNumber: i,
      totalInstallments,
      idempotencyKey: `installment_${parentEntryId}_${i}`,
      createdBy: userId,
      softdelete: false,
    })) as Id<"journal_entries">;

    const debit = isIncome ? paymentAccountId : expenseOrIncomeAccountId;
    const credit = isIncome ? expenseOrIncomeAccountId : paymentAccountId;

    await createDoubleEntryLines({
      ctx,
      entryId,
      userId,
      debitAccountId: debit,
      creditAccountId: credit,
      amountARS: installmentAmount,
      date: next,
    });
  }
}

export function toMinorARS(floatAmount: number): number {
  return convertAmountARS(floatAmount);
}

// Ensure a default cash/transfer payment type and mapping exist for the user
// Returns the ensured paymentTypeId and accountId. This is used as a safe
// fallback when a transaction doesn't provide a paymentTypeId or when the
// mapping is missing, so dual-write can still post to the ledger.
export async function ensureDefaultCashMapping(
  ctx: any,
  userId: Id<"users">
): Promise<{ paymentTypeId: Id<"paymentTypes">; accountId: Id<"accounts"> }> {
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

  return {
    paymentTypeId: mapping.paymentTypeId as Id<"paymentTypes">,
    accountId: mapping.accountId as Id<"accounts">,
  };
}


