import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { initializeNextDueDate, stepDateByFrequency } from "./lib/scheduling";
import { LEDGER_DUAL_WRITE_ENABLED } from "./ledger/dualWriteConfig";
import { 
  getCategoryAccountMapping, 
  getPaymentTypeAccountMapping, 
  ensureDefaultCashMapping,
  toMinorARS 
} from "./ledger/dualWriteUtils";

// Helper function to get the authenticated user's ID
async function getAuthenticatedUserId(ctx: { auth: { getUserIdentity: () => Promise<any> }, db: any }): Promise<Id<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const user = await ctx.db
    .query("users")
    .filter((q: any) => q.eq(q.field("auth0Id"), identity.subject))
    .first();

  return user?._id ?? null;
}

// Add a new recurring transaction
export const addRecurringTransaction = mutation({
  args: {
    description: v.string(),
    amount: v.number(),
    categoryId: v.id("categories"),
    paymentTypeId: v.optional(v.id("paymentTypes")),
    transactionType: v.string(),
    frequency: v.string(),
    startDate: v.number(),
    endDate: v.optional(v.number()),
    nextDueDateCalculationDay: v.optional(v.number()),
    cuotas: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    console.log('addRecurringTransaction nextDueDateCalculationDay:', args.nextDueDateCalculationDay); // Debug log
    const userId = await getAuthenticatedUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Validate frequency
    if (!["daily", "weekly", "monthly", "semestrally", "yearly"].includes(args.frequency)) {
      throw new Error("Invalid frequency. Must be daily, weekly, monthly, semestrally, or yearly.");
    }

    // Validate transaction type
    if (!["expense", "income"].includes(args.transactionType)) {
      throw new Error("Invalid transaction type. Must be expense or income.");
    }

    // Validate nextDueDateCalculationDay if provided
    if (args.nextDueDateCalculationDay !== undefined) {
      if (args.nextDueDateCalculationDay < 1 || args.nextDueDateCalculationDay > 31) {
        throw new Error("nextDueDateCalculationDay must be between 1 and 31");
      }
    }

    // Create the recurring transaction
    const now = Date.now();
    const initialNextDueDate = initializeNextDueDate(args.startDate, now, args.frequency as any);

    const recurringTransactionId = await ctx.db.insert("recurringTransactions", {
      userId,
      description: args.description,
      amount: args.amount,
      categoryId: args.categoryId,
      paymentTypeId: args.paymentTypeId,
      transactionType: args.transactionType,
      frequency: args.frequency,
      startDate: args.startDate,
      endDate: args.endDate,
      lastProcessedDate: undefined,
      nextDueDateCalculationDay: args.nextDueDateCalculationDay,
      nextDueDate: initialNextDueDate,
      isActive: args.isActive ?? true,
      softdelete: false,
      cuotas: args.cuotas ?? 1,
    });

    // Backfill only if startDate is in the past: repeatedly generate for due dates < now
    let targetDate = args.startDate;
    const anchorDay = new Date(args.startDate).getDate();
    while (targetDate <= now && (!args.endDate || targetDate <= args.endDate)) {
      await ctx.runMutation(internal.internal.generateTransactionFromRecurring, {
        recurringTransactionId,
        targetDate,
      });
      targetDate = stepDateByFrequency(targetDate, args.frequency as any, anchorDay);
    }

    // Dual-write: create recurring template in ledger
    if (LEDGER_DUAL_WRITE_ENABLED) {
      try {
        // Check for existing mapping (idempotency)
        const existingMap = await ctx.db
          .query("recurring_template_mappings")
          .withIndex("by_user_legacyRecurring", (q) => 
            q.eq("userId", userId).eq("legacyRecurringId", recurringTransactionId)
          )
          .first();
        
        if (!existingMap) {
          // Get account mappings
          const categoryMapping = await getCategoryAccountMapping(ctx, userId, args.categoryId);
          
          let paymentAccountId: Id<"accounts">;
          if (args.paymentTypeId) {
            try {
              const paymentMapping = await getPaymentTypeAccountMapping(ctx, userId, args.paymentTypeId);
              paymentAccountId = paymentMapping.accountId;
            } catch {
              // Fallback to default cash if mapping not found
              const ensured = await ensureDefaultCashMapping(ctx, userId);
              paymentAccountId = ensured.accountId;
            }
          } else {
            // No payment type specified, use default cash
            const ensured = await ensureDefaultCashMapping(ctx, userId);
            paymentAccountId = ensured.accountId;
          }
          
          const amountARS = toMinorARS(args.amount);
          const isIncome = args.transactionType === "income";
          
          // Create recurring_entries
          const recurringEntryId = await ctx.db.insert("recurring_entries", {
            userId,
            description: args.description,
            frequency: args.frequency as any,
            creationTime: Date.now(),
            anchorDay,
            endDate: args.endDate,
            status: (args.isActive ?? true) ? "active" : "paused",
            nextDueDate: initialNextDueDate,
            softdelete: false,
          }) as Id<"recurring_entries">;
          
          // Create recurring_lines (debit and credit)
          if (isIncome) {
            // Income: Dr Cash/Bank, Cr Income Account
            await ctx.db.insert("recurring_lines", {
              recurringId: recurringEntryId,
              userId,
              accountId: paymentAccountId,
              direction: "debit" as const,
              currencyCode: "ARS",
              amount: amountARS,
              softdelete: false,
            });
            await ctx.db.insert("recurring_lines", {
              recurringId: recurringEntryId,
              userId,
              accountId: categoryMapping.accountId,
              direction: "credit" as const,
              currencyCode: "ARS",
              amount: amountARS,
              softdelete: false,
            });
          } else {
            // Expense: Dr Expense Account, Cr Cash/Bank
            await ctx.db.insert("recurring_lines", {
              recurringId: recurringEntryId,
              userId,
              accountId: categoryMapping.accountId,
              direction: "debit" as const,
              currencyCode: "ARS",
              amount: amountARS,
              softdelete: false,
            });
            await ctx.db.insert("recurring_lines", {
              recurringId: recurringEntryId,
              userId,
              accountId: paymentAccountId,
              direction: "credit" as const,
              currencyCode: "ARS",
              amount: amountARS,
              softdelete: false,
            });
          }
          
          // Create mapping
          await ctx.db.insert("recurring_template_mappings", {
            userId,
            legacyRecurringId: recurringTransactionId,
            recurringEntryId,
            createdAt: Date.now(),
          });
        }
      } catch (error) {
        console.error("Failed to create recurring template in ledger:", error);
        // Continue - template still works via legacy system
      }
    }

    return recurringTransactionId;
  },
});

// Update an existing recurring transaction
export const updateRecurringTransaction = mutation({
  args: {
    id: v.id("recurringTransactions"),
    description: v.optional(v.string()),
    amount: v.optional(v.number()),
    categoryId: v.optional(v.id("categories")),
    paymentTypeId: v.optional(v.id("paymentTypes")),
    transactionType: v.optional(v.string()),
    frequency: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    nextDueDateCalculationDay: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
    cuotas: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Get the existing recurring transaction
    const recurringTransaction = await ctx.db.get(args.id);
    if (!recurringTransaction || recurringTransaction.userId !== userId) {
      throw new Error("Recurring transaction not found");
    }

    // Validate frequency if provided
    if (args.frequency && !["daily", "weekly", "monthly", "semestrally", "yearly"].includes(args.frequency)) {
      throw new Error("Invalid frequency. Must be daily, weekly, monthly, semestrally, or yearly.");
    }

    // Validate transaction type if provided
    if (args.transactionType && !["expense", "income"].includes(args.transactionType)) {
      throw new Error("Invalid transaction type. Must be expense or income.");
    }

    // Validate nextDueDateCalculationDay if provided
    if (args.nextDueDateCalculationDay !== undefined) {
      if (args.nextDueDateCalculationDay < 1 || args.nextDueDateCalculationDay > 31) {
        throw new Error("nextDueDateCalculationDay must be between 1 and 31");
      }
    }

    // Build updates and recompute nextDueDate if frequency/startDate changed
    const updates: any = {};
    for (const [key, value] of Object.entries(args)) {
      if (key !== "id" && value !== undefined) updates[key] = value;
    }
    if (updates.startDate || updates.frequency) {
      const startDate = (updates.startDate ?? recurringTransaction.startDate) as number;
      const frequency = (updates.frequency ?? recurringTransaction.frequency) as any;
      const now = Date.now();
      updates.nextDueDate = initializeNextDueDate(startDate, now, frequency);
    }

    await ctx.db.patch(args.id, updates);
    
    // Dual-write: update recurring template in ledger
    if (LEDGER_DUAL_WRITE_ENABLED) {
      try {
        // Find the ledger recurring entry via mapping
        const mapping = await ctx.db
          .query("recurring_template_mappings")
          .withIndex("by_user_legacyRecurring", (q) => 
            q.eq("userId", userId).eq("legacyRecurringId", args.id)
          )
          .first();
        
        if (mapping) {
          // Update recurring_entries metadata
          const entryUpdates: any = {};
          if (args.description !== undefined) entryUpdates.description = args.description;
          if (args.isActive !== undefined) entryUpdates.status = args.isActive ? "active" : "paused";
          if (args.frequency !== undefined) entryUpdates.frequency = args.frequency;
          if (args.endDate !== undefined) entryUpdates.endDate = args.endDate;
          if (updates.nextDueDate !== undefined) entryUpdates.nextDueDate = updates.nextDueDate;
          if (args.startDate !== undefined) {
            entryUpdates.anchorDay = new Date(args.startDate).getDate();
          }
          
          if (Object.keys(entryUpdates).length > 0) {
            await ctx.db.patch(mapping.recurringEntryId, entryUpdates);
          }
          
          // If amount/category/paymentType changed, recreate recurring_lines
          if (args.amount !== undefined || args.categoryId !== undefined || args.paymentTypeId !== undefined) {
            // Get updated recurring transaction
            const updated = await ctx.db.get(args.id);
            if (!updated) throw new Error("Recurring transaction not found after update");
            
            // Delete existing lines
            const existingLines = await ctx.db
              .query("recurring_lines")
              .withIndex("by_recurringId", (q) => q.eq("recurringId", mapping.recurringEntryId))
              .collect();
            for (const line of existingLines) {
              await ctx.db.delete(line._id);
            }
            
            // Get account mappings with updated values
            const finalCategoryId = args.categoryId ?? updated.categoryId;
            const finalPaymentTypeId = args.paymentTypeId ?? updated.paymentTypeId;
            const finalAmount = args.amount ?? updated.amount;
            const finalTransactionType = args.transactionType ?? updated.transactionType;
            
            const categoryMapping = await getCategoryAccountMapping(ctx, userId, finalCategoryId);
            
            let paymentAccountId: Id<"accounts">;
            if (finalPaymentTypeId) {
              try {
                const paymentMapping = await getPaymentTypeAccountMapping(ctx, userId, finalPaymentTypeId);
                paymentAccountId = paymentMapping.accountId;
              } catch {
                const ensured = await ensureDefaultCashMapping(ctx, userId);
                paymentAccountId = ensured.accountId;
              }
            } else {
              const ensured = await ensureDefaultCashMapping(ctx, userId);
              paymentAccountId = ensured.accountId;
            }
            
            const amountARS = toMinorARS(finalAmount);
            const isIncome = finalTransactionType === "income";
            
            // Create new lines
            if (isIncome) {
              await ctx.db.insert("recurring_lines", {
                recurringId: mapping.recurringEntryId,
                userId,
                accountId: paymentAccountId,
                direction: "debit" as const,
                currencyCode: "ARS",
                amount: amountARS,
                softdelete: false,
              });
              await ctx.db.insert("recurring_lines", {
                recurringId: mapping.recurringEntryId,
                userId,
                accountId: categoryMapping.accountId,
                direction: "credit" as const,
                currencyCode: "ARS",
                amount: amountARS,
                softdelete: false,
              });
            } else {
              await ctx.db.insert("recurring_lines", {
                recurringId: mapping.recurringEntryId,
                userId,
                accountId: categoryMapping.accountId,
                direction: "debit" as const,
                currencyCode: "ARS",
                amount: amountARS,
                softdelete: false,
              });
              await ctx.db.insert("recurring_lines", {
                recurringId: mapping.recurringEntryId,
                userId,
                accountId: paymentAccountId,
                direction: "credit" as const,
                currencyCode: "ARS",
                amount: amountARS,
                softdelete: false,
              });
            }
          }
        }
      } catch (error) {
        console.error("Failed to update recurring template in ledger:", error);
        // Continue - template still works via legacy system
      }
    }
    
    return args.id;
  },
});

// Delete (soft-delete) a recurring transaction
export const deleteRecurringTransaction = mutation({
  args: {
    id: v.id("recurringTransactions"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const recurringTransaction = await ctx.db.get(args.id);
    if (!recurringTransaction || recurringTransaction.userId !== userId) {
      throw new Error("Recurring transaction not found");
    }

    await ctx.db.patch(args.id, { softdelete: true });
    
    // Dual-write: soft-delete recurring template in ledger
    if (LEDGER_DUAL_WRITE_ENABLED) {
      try {
        // Find the ledger recurring entry via mapping
        const mapping = await ctx.db
          .query("recurring_template_mappings")
          .withIndex("by_user_legacyRecurring", (q) => 
            q.eq("userId", userId).eq("legacyRecurringId", args.id)
          )
          .first();
        
        if (mapping) {
          // Soft-delete recurring_entries
          await ctx.db.patch(mapping.recurringEntryId, {
            softdelete: true,
            deletedAt: Date.now(),
          });
          
          // Soft-delete associated recurring_lines
          const lines = await ctx.db
            .query("recurring_lines")
            .withIndex("by_recurringId", (q) => q.eq("recurringId", mapping.recurringEntryId))
            .collect();
          
          for (const line of lines) {
            await ctx.db.patch(line._id, {
              softdelete: true,
              deletedAt: Date.now(),
            });
          }
        }
      } catch (error) {
        console.error("Failed to soft-delete recurring template in ledger:", error);
        // Continue - template still deleted in legacy system
      }
    }
    
    return args.id;
  },
});

// Toggle active status for a recurring transaction
export const toggleRecurringTransactionStatus = mutation({
  args: {
    id: v.id("recurringTransactions"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const recurringTransaction = await ctx.db.get(args.id);
    if (!recurringTransaction || recurringTransaction.userId !== userId) {
      throw new Error("Recurring transaction not found");
    }

    const newIsActive = !recurringTransaction.isActive;
    await ctx.db.patch(args.id, { isActive: newIsActive });
    
    // Dual-write: update status in ledger
    if (LEDGER_DUAL_WRITE_ENABLED) {
      try {
        // Find the ledger recurring entry via mapping
        const mapping = await ctx.db
          .query("recurring_template_mappings")
          .withIndex("by_user_legacyRecurring", (q) => 
            q.eq("userId", userId).eq("legacyRecurringId", args.id)
          )
          .first();
        
        if (mapping) {
          // Update status in recurring_entries
          await ctx.db.patch(mapping.recurringEntryId, {
            status: newIsActive ? "active" : "paused",
          });
        }
      } catch (error) {
        console.error("Failed to toggle recurring status in ledger:", error);
        // Continue - status still toggled in legacy system
      }
    }
    
    return args.id;
  },
});

// Get all recurring transactions for the current user
export const listRecurringTransactions = query({
  handler: async (ctx) => {
    const userId = await getAuthenticatedUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("recurringTransactions")
      .withIndex("by_user_isActive_startDate", q => q.eq("userId", userId))
      .filter(q => q.eq(q.field("softdelete"), false))
      .collect();
  },
});

// Helper function to determine the last processing threshold based on frequency
function determineLastProcessingThreshold(frequency: string, currentTimestamp: number): number {
  const now = new Date(currentTimestamp);
  switch (frequency) {
    case "daily":
      return new Date(now.setDate(now.getDate() - 1)).getTime();
    case "weekly":
      return new Date(now.setDate(now.getDate() - 7)).getTime();
    case "monthly":
      return new Date(now.setMonth(now.getMonth() - 1)).getTime();
    case "semestrally":
      return new Date(now.setMonth(now.getMonth() - 6)).getTime();
    case "yearly":
      return new Date(now.setFullYear(now.getFullYear() - 1)).getTime();
    default:
      return 0;
  }
}

export const getRecurringTransactionsToProcess = query({
  handler: async (ctx) => {
    const now = Date.now();
    // Use nextDueDate-based detection in small batches
    const batch = await ctx.db
      .query("recurringTransactions")
      .withIndex("by_isActive_nextDueDate", (q) => q.eq("isActive", true))
      .filter((q) => q.eq(q.field("softdelete"), false))
      .filter((q) => q.lte(q.field("nextDueDate"), now))
      .take(200);
    return batch;
  },
});

export const generateTransactionFromRecurring = mutation({
  args: {
    recurringTransactionId: v.id("recurringTransactions"),
    targetDate: v.number(),
  },
  returns: v.id("expenses"),
  handler: async (ctx, args) => {
    // Delegate to internal dual-write implementation to ensure ledger posting
    const transactionId: Id<"expenses"> = await ctx.runMutation(
      internal.internal.generateTransactionFromRecurring,
      { recurringTransactionId: args.recurringTransactionId, targetDate: args.targetDate }
    );
    return transactionId;
  },
}); 