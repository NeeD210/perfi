import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { LEDGER_DUAL_WRITE_ENABLED } from "./ledger/dualWriteConfig";
import {
  getCategoryAccountMapping,
  getPaymentTypeAccountMapping,
  createJournalEntry,
  createDoubleEntryLines,
  createInstallmentEntries,
  toMinorARS,
  ensureDefaultCashMapping,
} from "./ledger/dualWriteUtils";
import { logDualWriteError, logDualWriteSkip } from "./ledger/errorTracking";
import { addMonths, setDate } from "date-fns";
import { internal } from "./_generated/api";
import { calculateNextDueDateForPaymentType } from "./lib/scheduling";

const defaultCategories = [
  "Vivienda",
  "Servicios",
  "Transporte",
  "Alimentación",
  "Seguros y Salud",
  "Deudas",
  "Ropa",
  "Hogar y electrónica",
  "Ocio",
  "Mascotas",
  "Educación",
  "Otras"
];

// default payment types are handled in auth.createUser

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

// Internal helper to generate payment schedules
// Removed local schedule generator; use internal/internal version as the single source of truth

// Helper to calculate next due date based on payment type
async function calculateNextDueDate(ctx: any, date: number, paymentTypeId: Id<"paymentTypes">): Promise<number> {
  const paymentType = await ctx.db.get(paymentTypeId);
  if (!paymentType) throw new Error("Payment type not found");
  return calculateNextDueDateForPaymentType(date, paymentType);
}

export const addExpense = mutation({
  args: {
    amount: v.number(),
    categoryId: v.id("categories"),
    cuotas: v.number(),
    date: v.number(),
    description: v.string(),
    paymentTypeId: v.optional(v.id("paymentTypes")),
    transactionType: v.string(),
    recurringTransactionId: v.optional(v.id("recurringTransactions")),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    if (!Number.isFinite(args.cuotas) || args.cuotas < 1) {
      throw new Error("cuotas must be >= 1");
    }
    if (!Number.isFinite(args.amount)) {
      throw new Error("amount must be a finite number");
    }
    
    // Get the category name from the category ID
    const category = await ctx.db.get(args.categoryId);
    if (!category) throw new Error("Category not found");

    // Calculate next due date if payment type is provided
    let nextDueDate: number | undefined;
    if (args.paymentTypeId) {
      nextDueDate = await calculateNextDueDate(ctx, args.date, args.paymentTypeId);
    }
    
    // Set verified status based on whether this is from a recurring transaction
    const verified = args.recurringTransactionId ? false : true;
    
    const expenseId = await ctx.db.insert("expenses", {
      userId,
      amount: args.amount,
      category: category.name,
      categoryId: args.categoryId,
      cuotas: args.cuotas,
      date: args.date,
      description: args.description,
      paymentTypeId: args.paymentTypeId,
      transactionType: args.transactionType,
      nextDueDate,
      verified,
      recurringTransactionId: args.recurringTransactionId,
      softdelete: false,
    });

    // Generate payment schedules if payment type is provided
    if (args.paymentTypeId) {
      void (await ctx.runMutation(
        internal.internal.expenses.generatePaymentSchedules,
        {
          expenseId,
          firstDueDate: nextDueDate!,
          totalAmount: args.amount,
          totalInstallments: args.cuotas,
          userId,
          paymentTypeId: args.paymentTypeId,
        } as any,
      ));
    }

    // Dual-write to ledger
    if (LEDGER_DUAL_WRITE_ENABLED) {
      try {
        const idempotencyKey = `expense_dual_write_${expenseId}`;
        
        // Check for existing entry to prevent duplicates
        const existingEntry = await ctx.db
          .query("journal_entries")
          .withIndex("by_idempotencyKey", (q: any) => q.eq("idempotencyKey", idempotencyKey))
          .first();
        
        if (existingEntry) {
          logDualWriteSkip("addExpense", "Journal entry already exists", String(expenseId));
        } else {
          const categoryMapping = await getCategoryAccountMapping(ctx, userId as Id<"users">, args.categoryId);
          let paymentMapping = args.paymentTypeId
            ? await getPaymentTypeAccountMapping(ctx, userId as Id<"users">, args.paymentTypeId)
            : null;
          // Fallback to default cash mapping when payment type mapping is absent
          if (!paymentMapping) {
            const ensured = await ensureDefaultCashMapping(ctx, userId as Id<"users">);
            paymentMapping = { accountId: ensured.accountId } as const;
          }

          // With fallback above, paymentMapping is guaranteed here
            const amountARS = toMinorARS(args.amount);
            const isIncome = args.transactionType === "income";

            const entryId = await createJournalEntry({
              ctx,
              userId: userId as Id<"users">,
              date: args.date,
              description: `${args.description}`,
              status: "posted",
              sourceType: isIncome ? "income" : "expense",
              sourceId: expenseId,
              idempotencyKey,
              createdBy: userId as Id<"users">,
            });

          const debitAccountId = isIncome ? paymentMapping.accountId : categoryMapping.accountId;
          const creditAccountId = isIncome ? categoryMapping.accountId : paymentMapping.accountId;

            await createDoubleEntryLines({
              ctx,
              entryId,
              userId: userId as Id<"users">,
              debitAccountId,
              creditAccountId,
              amountARS,
              date: args.date,
            });

            // Installments planned entries
            if (args.cuotas > 1 && args.paymentTypeId) {
              await createInstallmentEntries(ctx, {
                parentEntryId: entryId,
                totalAmount: amountARS,
                totalInstallments: args.cuotas,
                paymentAccountId: paymentMapping.accountId,
                expenseOrIncomeAccountId: categoryMapping.accountId,
                userId: userId as Id<"users">,
                startDate: args.date,
                isIncome,
              });
            }

            // Update rollups (best-effort, failures don't block transaction)
            try {
              await ctx.runMutation(internal.ledger.rollups.updateRollupsOnTransaction, {
                journalEntryId: entryId,
                updateType: "create",
              });
            } catch (rollupError) {
              console.error(`[Rollup Update] Failed to update rollups for expense ${expenseId}: ${rollupError}`);
              // Don't throw - rollup updates are best-effort
            }
        }
      } catch (err) {
        logDualWriteError({
          operation: "addExpense",
          expenseId: String(expenseId),
          userId: String(userId),
          errorMessage: err instanceof Error ? err.message : String(err),
          errorStack: err instanceof Error ? err.stack : undefined,
          timestamp: Date.now(),
          context: {
            amount: args.amount,
            categoryId: String(args.categoryId),
            paymentTypeId: args.paymentTypeId ? String(args.paymentTypeId) : undefined,
            transactionType: args.transactionType,
          },
        });
      }
    }

    return expenseId;
  },
});

export const listAllTransactions = query({
  handler: async (ctx) => {
    const userId = await getAuthenticatedUserId(ctx);
    if (!userId) return [];
    
    return await ctx.db
      .query("expenses")
      .withIndex("by_user", q => q.eq("userId", userId))
      .filter(q => q.eq(q.field("softdelete"), false))
      .order("desc")
      .collect();
  },
});

export const listExpenses = query({
  handler: async (ctx) => {
    const userId = await getAuthenticatedUserId(ctx);
    if (!userId) return [];
    
    return await ctx.db
      .query("expenses")
      .withIndex("by_user", q => q.eq("userId", userId))
      .filter(q => q.and(
        q.eq(q.field("transactionType"), "expense"),
        q.eq(q.field("softdelete"), false)
      ))
      .order("desc")
      .collect();
  },
});

export const listIncome = query({
  handler: async (ctx) => {
    const userId = await getAuthenticatedUserId(ctx);
    if (!userId) return [];
    
    return await ctx.db
      .query("expenses")
      .withIndex("by_user", q => q.eq("userId", userId))
      .filter(q => q.and(
        q.eq(q.field("transactionType"), "income"),
        q.eq(q.field("softdelete"), false)
      ))
      .order("desc")
      .collect();
  },
});

export const getCategories = query({
  handler: async (ctx) => {
    const userId = await getAuthenticatedUserId(ctx);
    if (!userId) return defaultCategories;
    
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_user", q => q.eq("userId", userId))
      .filter(q => q.eq(q.field("softdelete"), false))
      .collect();
    
    if (categories.length > 0) {
      return categories.map(c => c.name);
    }
    
    return defaultCategories;
  },
});

// initialize defaults moved to auth.createUser; keep function removed to prevent duplication
/* export const initializeDefaultCategories = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      console.warn(
        `initializeDefaultCategories: Skipping due to no auth identity. This might be normal if called during initial user setup when auth.ts:createUser is primary.`,
      );
      return;
    }

    // Get the user record using the auth identity
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("auth0Id"), identity.subject))
      .first();

    if (!user) {
      console.warn(
        `initializeDefaultCategories: Skipping due to no user record found. This might be normal if called during initial user setup when auth.ts:createUser is primary.`,
      );
      return;
    }

    // Check if user already has categories
    const existingCategories = await ctx.db
      .query("categories")
      .withIndex("by_user", q => q.eq("userId", user._id))
      .filter(q => q.eq(q.field("softdelete"), false))
      .collect();

    if (existingCategories.length === 0) {
      // Create default categories
      for (const name of defaultCategories) {
        await ctx.db.insert("categories", {
          name,
          userId: user._id,
          softdelete: false,
        });
      }
    }
  },
}); */

export const getPaymentTypes = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    // Get the user record using the auth identity
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("auth0Id"), identity.subject))
      .first();

    if (!user) return [];

    const paymentTypes = await ctx.db
      .query("paymentTypes")
      .withIndex("by_user_softdelete", q => q.eq("userId", user._id).eq("softdelete", false))
      .collect();

    return paymentTypes;
  },
});

/**
 * @deprecated Use updatePaymentTypes instead. This mutation does not implement dual-write
 * to the ledger system and will create orphaned payment types without ledger structures.
 * 
 * Migration: Call updatePaymentTypes with the full array of payment types including the new one.
 * Example:
 * ```
 * const existing = await ctx.runQuery(api.expenses.getPaymentTypes);
 * await ctx.runMutation(api.expenses.updatePaymentTypes, {
 *   paymentTypes: [...existing, newPaymentType]
 * });
 * ```
 */
export const addPaymentType = mutation({
  args: {
    name: v.string(),
    isCredit: v.optional(v.boolean()),
    closingDay: v.optional(v.number()),
    dueDay: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    console.warn("⚠️ DEPRECATED: addPaymentType is deprecated and does not implement dual-write. Use updatePaymentTypes instead.");
    
    const userId = await getAuthenticatedUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    // Validate credit card fields if isCredit is true
    if (args.isCredit) {
      if (!args.closingDay || !args.dueDay) {
        throw new Error("Closing day and due day are required for credit cards");
      }
      if (args.closingDay < 1 || args.closingDay > 31 || args.dueDay < 1 || args.dueDay > 31) {
        throw new Error("Closing day and due day must be between 1 and 31");
      }
    }

    return await ctx.db.insert("paymentTypes", {
      name: args.name,
      userId,
      isCredit: args.isCredit ?? false,
      closingDay: args.closingDay,
      dueDay: args.dueDay,
      softdelete: false,
    });
  },
});

/**
 * @deprecated Use updatePaymentTypes instead. This mutation does not cascade
 * soft-delete to ledger structures (accounts, cards), leaving orphaned records.
 * 
 * Migration: Call updatePaymentTypes with the filtered array excluding the deleted payment type.
 * Example:
 * ```
 * const existing = await ctx.runQuery(api.expenses.getPaymentTypes);
 * await ctx.runMutation(api.expenses.updatePaymentTypes, {
 *   paymentTypes: existing.filter(pt => pt._id !== idToDelete)
 * });
 * ```
 */
export const removePaymentType = mutation({
  args: {
    id: v.id("paymentTypes"),
  },
  handler: async (ctx, args) => {
    console.warn("⚠️ DEPRECATED: removePaymentType is deprecated and does not cascade to ledger. Use updatePaymentTypes instead.");
    
    const userId = await getAuthenticatedUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const paymentType = await ctx.db.get(args.id);
    if (!paymentType || paymentType.userId !== userId) {
      throw new Error("Payment type not found");
    }

    await ctx.db.patch(args.id, { softdelete: true });
  },
});

export const updateCategories = mutation({
  args: {
    categories: v.array(v.object({
      _id: v.optional(v.id("categories")),  // Include ID to track updates
      name: v.string(),
      transactionType: v.string(),
    })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    
    // Import feature flag
    const { LEDGER_DUAL_WRITE_ENABLED } = await import("./ledger/dualWriteConfig");
    
    // Get existing categories
    const existingCategories = await ctx.db
      .query("categories")
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();
    
    // Soft delete categories that are no longer in the list
    for (const category of existingCategories) {
      // Match by ID if provided, otherwise by name + transactionType
      const stillExists = args.categories.some(c => 
        c._id ? c._id === category._id : (c.name === category.name && c.transactionType === category.transactionType)
      );
      
      if (!stillExists) {
        await ctx.db.patch(category._id, { softdelete: true });
        
        // Cascade soft-delete to ledger (dual-write)
        if (LEDGER_DUAL_WRITE_ENABLED) {
          try {
            const categoryMapping = await ctx.db
              .query("category_mappings")
              .withIndex("by_user_category", (q) => q.eq("userId", userId).eq("categoryId", category._id))
              .first();
            
            if (categoryMapping) {
              await ctx.db.patch(categoryMapping.accountId, {
                softdelete: true,
                deletedAt: Date.now(),
              });
            }
          } catch (error) {
            console.error("Failed to cascade delete to ledger for category:", category.name, error);
            // Continue - don't fail entire operation if ledger update fails
          }
        }
      }
    }
    
    // Create, update, or reactivate categories
    for (const category of args.categories) {
      // Match by ID first (if provided), then by name + transactionType
      const existing = category._id
        ? existingCategories.find(c => c._id === category._id)
        : existingCategories.find(c => 
            c.name === category.name && 
            c.transactionType === category.transactionType
          );
      
      if (existing && !existing.softdelete) {
        // ✅ UPDATE existing active category (including name/type changes)
        await ctx.db.patch(existing._id, {
          name: category.name,  // ✅ Allow name updates
          transactionType: category.transactionType,  // ✅ Allow type changes
          softdelete: false,
        });
        
        // Update ledger structures (dual-write)
        if (LEDGER_DUAL_WRITE_ENABLED) {
          try {
            const categoryMapping = await ctx.db
              .query("category_mappings")
              .withIndex("by_user_category", (q) => q.eq("userId", userId).eq("categoryId", existing._id))
              .first();
            
            if (categoryMapping) {
              const existingAccount = await ctx.db.get(categoryMapping.accountId);
              const newAccountType = category.transactionType === "income" ? "income" : "expense";
              
              // ✅ Update account description and/or type if changed
              if (existingAccount && 
                  (existingAccount.description !== category.name || existingAccount.accountType !== newAccountType)) {
                await ctx.db.patch(categoryMapping.accountId, {
                  description: category.name,
                  accountType: newAccountType,
                });
              }
            }
          } catch (error) {
            console.error("Failed to update ledger structures for category:", category.name, error);
            // Continue - don't fail entire operation if ledger update fails
          }
        }
      } else if (existing && existing.softdelete) {
        // Reactivate soft-deleted category
        await ctx.db.patch(existing._id, {
          name: category.name,  // Update name in case it changed
          transactionType: category.transactionType,  // Update type in case it changed
          softdelete: false,
        });
        
        // Reactivate associated account (dual-write)
        if (LEDGER_DUAL_WRITE_ENABLED) {
          try {
            const categoryMapping = await ctx.db
              .query("category_mappings")
              .withIndex("by_user_category", (q) => q.eq("userId", userId).eq("categoryId", existing._id))
              .first();
            
            if (categoryMapping) {
              const newAccountType = category.transactionType === "income" ? "income" : "expense";
              
              await ctx.db.patch(categoryMapping.accountId, {
                description: category.name,  // Update description
                accountType: newAccountType,  // Update type
                softdelete: false,
                deletedAt: undefined,
              });
            }
          } catch (error) {
            console.error("Failed to reactivate ledger structures for category:", category.name, error);
            // Continue - don't fail entire operation if ledger update fails
          }
        }
      } else {
        // Create new category
        const categoryId = await ctx.db.insert("categories", {
          name: category.name,
          userId,
          transactionType: category.transactionType,
          softdelete: false,
        });
        
        // Create ledger structures (dual-write)
        if (LEDGER_DUAL_WRITE_ENABLED) {
          try {
            // Determine account type from transaction type
            const accountType = category.transactionType === "income" ? "income" : "expense";
            
            const accountId = await ctx.db.insert("accounts", {
              userId,
              description: category.name,
              accountType,
              creationTime: Date.now(),
              softdelete: false,
            });
            
            // Create mapping
            await ctx.db.insert("category_mappings", {
              userId,
              categoryId,
              accountId,
              createdAt: Date.now(),
            });
          } catch (error) {
            console.error("Failed to create ledger structures for category:", category.name, error);
            // Rollback: delete the category we just created
            await ctx.db.delete(categoryId);
            throw new Error(`Failed to create category with ledger integration: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }
    }
    return null;
  },
});

export const updatePaymentTypes = mutation({
  args: {
    paymentTypes: v.array(v.object({
      _id: v.optional(v.id("paymentTypes")),  // Include ID to track updates
      name: v.string(),
      isCredit: v.optional(v.boolean()),
      closingDay: v.optional(v.number()),
      dueDay: v.optional(v.number()),
    })),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    
    // Get existing payment types (including soft-deleted for reactivation)
    const allTypes = await ctx.db
      .query("paymentTypes")
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();
    
    // Filter to active types for deletion logic
    const existingTypes = allTypes.filter(t => !t.softdelete);

    // Soft delete types that are no longer in the list
    for (const type of existingTypes) {
      // Match by ID if provided, otherwise by name
      const stillExists = args.paymentTypes.some(t => 
        t._id ? t._id === type._id : t.name === type.name
      );
      
      if (!stillExists) {
        await ctx.db.patch(type._id, { 
          softdelete: true,
          deletedAt: Date.now()
        });
        
        // Cascade soft-delete to ledger (dual-write)
        if (LEDGER_DUAL_WRITE_ENABLED) {
          try {
            const paymentMapping = await ctx.db
              .query("payment_type_mappings")
              .withIndex("by_user_paymentType", (q) => q.eq("userId", userId).eq("paymentTypeId", type._id))
              .first();
            
            if (paymentMapping) {
              // Soft-delete account
              await ctx.db.patch(paymentMapping.accountId, {
                softdelete: true,
                deletedAt: Date.now(),
              });
              
              // Soft-delete card if it exists (for credit cards)
              const card = await ctx.db
                .query("cards")
                .withIndex("by_accountId", (q) => q.eq("accountId", paymentMapping.accountId))
                .first();
              
              if (card) {
                await ctx.db.patch(card._id, {
                  softdelete: true,
                  deletedAt: Date.now(),
                });
              }
            }
          } catch (error) {
            console.error("Failed to cascade delete to ledger for payment type:", type.name, error);
            // Continue - don't fail entire operation if ledger update fails
          }
        }
      }
    }

    // Create or update payment types
    for (const type of args.paymentTypes) {
      // Validate credit card fields if isCredit is true
      if (type.isCredit) {
        if (!type.closingDay || !type.dueDay) {
          throw new Error("Closing day and due day are required for credit cards");
        }
        if (type.closingDay < 1 || type.closingDay > 31 || type.dueDay < 1 || type.dueDay > 31) {
          throw new Error("Closing day and due day must be between 1 and 31");
        }
      }

      // Check all types (including soft-deleted) by ID first, then by name
      const existingType = type._id 
        ? allTypes.find(t => t._id === type._id)
        : allTypes.find(t => t.name === type.name);
      
      if (existingType && !existingType.softdelete) {
        // Update existing active type (including name change)
        await ctx.db.patch(existingType._id, {
          name: type.name,  // ✅ Allow name updates
          isCredit: type.isCredit ?? false,
          closingDay: type.closingDay,
          dueDay: type.dueDay,
        });
        
        // Update ledger structures (dual-write)
        if (LEDGER_DUAL_WRITE_ENABLED) {
          try {
            const paymentMapping = await ctx.db
              .query("payment_type_mappings")
              .withIndex("by_user_paymentType", (q) => q.eq("userId", userId).eq("paymentTypeId", existingType._id))
              .first();
            
            if (paymentMapping) {
              const existingAccount = await ctx.db.get(paymentMapping.accountId);
              const newAccountType = type.isCredit ? "liability" : "asset";
              
              // ✅ Update account description and/or type if changed
              if (existingAccount && 
                  (existingAccount.description !== type.name || existingAccount.accountType !== newAccountType)) {
                await ctx.db.patch(paymentMapping.accountId, {
                  description: type.name,
                  accountType: newAccountType,  // ✅ Convert asset ↔ liability
                });
              }
              
              // Update or create/delete card based on credit status
              const existingCard = await ctx.db
                .query("cards")
                .withIndex("by_accountId", (q) => q.eq("accountId", paymentMapping.accountId))
                .first();
              
              if (type.isCredit && !existingCard) {
                // Create card for newly credit payment type
                await ctx.db.insert("cards", {
                  accountId: paymentMapping.accountId,
                  userId,
                  closingDay: type.closingDay!,
                  dueDate: type.dueDay!,
                  softdelete: false,
                });
              } else if (type.isCredit && existingCard) {
                // Update existing card
                await ctx.db.patch(existingCard._id, {
                  closingDay: type.closingDay!,
                  dueDate: type.dueDay!,
                  softdelete: false,
                });
              } else if (!type.isCredit && existingCard) {
                // Soft-delete card if no longer credit
                await ctx.db.patch(existingCard._id, {
                  softdelete: true,
                  deletedAt: Date.now(),
                });
              }
            }
          } catch (error) {
            console.error("Failed to update ledger structures for payment type:", type.name, error);
            // Continue - don't fail entire operation if ledger update fails
          }
        }
      } else if (existingType && existingType.softdelete) {
        // Reactivate soft-deleted payment type
        await ctx.db.patch(existingType._id, {
          softdelete: false,
          deletedAt: undefined,
          isCredit: type.isCredit ?? false,
          closingDay: type.closingDay,
          dueDay: type.dueDay,
        });
        
        // Reactivate associated ledger structures (dual-write)
        if (LEDGER_DUAL_WRITE_ENABLED) {
          try {
            const paymentMapping = await ctx.db
              .query("payment_type_mappings")
              .withIndex("by_user_paymentType", (q) => q.eq("userId", userId).eq("paymentTypeId", existingType._id))
              .first();
            
            if (paymentMapping) {
              // Reactivate account
              await ctx.db.patch(paymentMapping.accountId, {
                softdelete: false,
                deletedAt: undefined,
              });
              
              // Reactivate or create card if credit
              if (type.isCredit && type.closingDay && type.dueDay) {
                const existingCard = await ctx.db
                  .query("cards")
                  .withIndex("by_accountId", (q) => q.eq("accountId", paymentMapping.accountId))
                  .first();
                
                if (existingCard) {
                  await ctx.db.patch(existingCard._id, {
                    softdelete: false,
                    deletedAt: undefined,
                    closingDay: type.closingDay,
                    dueDate: type.dueDay,
                  });
                } else {
                  // Create card if it didn't exist before
                  await ctx.db.insert("cards", {
                    accountId: paymentMapping.accountId,
                    userId,
                    closingDay: type.closingDay,
                    dueDate: type.dueDay,
                    softdelete: false,
                  });
                }
              }
            }
          } catch (error) {
            console.error("Failed to reactivate ledger structures for payment type:", type.name, error);
            // Continue - don't fail entire operation if ledger update fails
          }
        }
      } else {
        // Create new payment type (legacy)
        const paymentTypeId = await ctx.db.insert("paymentTypes", {
          name: type.name,
          userId,
          isCredit: type.isCredit ?? false,
          closingDay: type.closingDay,
          dueDay: type.dueDay,
          softdelete: false,
        });
        
        // Create ledger structures (dual-write)
        if (LEDGER_DUAL_WRITE_ENABLED) {
          try {
            // Determine account type: liability for credit cards, asset for cash/debit
            const accountType = type.isCredit ? "liability" : "asset";
            
            const accountId = await ctx.db.insert("accounts", {
              userId,
              description: type.name,
              accountType,
              creationTime: Date.now(),
              softdelete: false,
            });
            
            // Create mapping
            await ctx.db.insert("payment_type_mappings", {
              userId,
              paymentTypeId,
              accountId,
              createdAt: Date.now(),
            });
            
            // Create card record if it's a credit card
            if (type.isCredit && type.closingDay && type.dueDay) {
              await ctx.db.insert("cards", {
                accountId,
                userId,
                closingDay: type.closingDay,
                dueDate: type.dueDay,
                softdelete: false,
              });
            }
          } catch (error) {
            console.error("Failed to create ledger structures for payment type:", type.name, error);
            // Rollback: delete the payment type we just created
            await ctx.db.delete(paymentTypeId);
            throw new Error(`Failed to create payment type with ledger integration: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }
    }
    return null;
  },
});

export const deleteExpense = mutation({
  args: {
    id: v.id("expenses"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    
    const expense = await ctx.db.get(args.id);
    if (!expense) throw new Error("Expense not found");
    if (expense.userId !== userId) throw new Error("Not authorized");
    
    // Delete associated payment schedules
    await ctx.runMutation(internal.internal.expenses.deletePaymentSchedulesForExpense, {
      expenseId: args.id,
    });
    
    // Soft delete the expense
    await ctx.db.patch(args.id, { 
      softdelete: true,
      deletedAt: Date.now()
    });

    // Dual-write soft delete
    if (LEDGER_DUAL_WRITE_ENABLED) {
      try {
        // Find related journal entries via mapping or by sourceType/sourceId
        const entries = await ctx.db
          .query("journal_entries")
          .withIndex("by_sourceType_sourceId", (q: any) => q.eq("sourceType", expense.transactionType as "expense" | "income").eq("sourceId", String(args.id)))
          .collect();
        for (const e of entries) {
          await ctx.db.patch(e._id, {
            softdelete: true,
            deletedAt: Date.now(),
            updateTime: Date.now(),
            updatedBy: userId as Id<"users">,
          });

          // Update rollups (best-effort, failures don't block transaction)
          try {
            await ctx.runMutation(internal.ledger.rollups.updateRollupsOnTransaction, {
              journalEntryId: e._id,
              updateType: "delete",
            });
          } catch (rollupError) {
            console.error(`[Rollup Update] Failed to update rollups for expense delete ${args.id}: ${rollupError}`);
            // Don't throw - rollup updates are best-effort
          }
        }
      } catch (err) {
        logDualWriteError({
          operation: "deleteExpense",
          expenseId: String(args.id),
          userId: String(userId),
          errorMessage: err instanceof Error ? err.message : String(err),
          errorStack: err instanceof Error ? err.stack : undefined,
          timestamp: Date.now(),
        });
      }
    }
  },
});

export const updateExpense = mutation({
  args: {
    id: v.id("expenses"),
    amount: v.optional(v.number()),
    categoryId: v.optional(v.id("categories")),
    cuotas: v.optional(v.number()),
    date: v.optional(v.number()),
    description: v.optional(v.string()),
    paymentTypeId: v.optional(v.id("paymentTypes")),
    transactionType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    
    const expense = await ctx.db.get(args.id);
    if (!expense || expense.userId !== userId) {
      throw new Error("Expense not found");
    }

    const updates: any = {
      verified: true // Mark as verified when modified by the user
    };

    if (args.cuotas !== undefined && (!Number.isFinite(args.cuotas) || args.cuotas < 1)) {
      throw new Error("cuotas must be >= 1");
    }
    if (args.amount !== undefined && !Number.isFinite(args.amount)) {
      throw new Error("amount must be a finite number");
    }

    // Update category name if categoryId is provided
    if (args.categoryId) {
      const category = await ctx.db.get(args.categoryId);
      if (!category) throw new Error("Category not found");
      updates.category = category.name;
      updates.categoryId = args.categoryId;
    }

    // Add all other updates
    for (const [key, value] of Object.entries(args)) {
      if (key !== "id" && key !== "categoryId" && value !== undefined) {
        updates[key] = value;
      }
    }

    // Check if we need to recalculate schedules
    const needsScheduleRecalculation = 
      args.date !== undefined || 
      args.paymentTypeId !== undefined || 
      args.cuotas !== undefined || 
      args.amount !== undefined;

    // Recalculate nextDueDate if date or paymentTypeId changed
    if (args.date !== undefined || args.paymentTypeId !== undefined) {
      const date = args.date ?? expense.date;
      const paymentTypeId = args.paymentTypeId ?? expense.paymentTypeId;
      
      if (paymentTypeId) {
        updates.nextDueDate = await calculateNextDueDate(ctx, date, paymentTypeId);
      }
    }

    // Update the expense
    await ctx.db.patch(args.id, updates);

    // Regenerate payment schedules if needed
    if (needsScheduleRecalculation && expense.paymentTypeId) {
      // Delete existing schedules
      void (await ctx.runMutation(
        internal.internal.expenses.deletePaymentSchedulesForExpense,
        { expenseId: args.id } as any,
      ));

      // Get the updated expense
      const updatedExpense = await ctx.db.get(args.id);
      if (!updatedExpense) throw new Error("Updated expense not found");

      // Create new schedules
      void (await ctx.runMutation(
        internal.internal.expenses.generatePaymentSchedules,
        {
          expenseId: args.id,
          firstDueDate: updatedExpense.nextDueDate!,
          totalAmount: updatedExpense.amount,
          totalInstallments: updatedExpense.cuotas,
          userId,
          paymentTypeId: updatedExpense.paymentTypeId!,
        } as any,
      ));
    }

    // Dual-write: update ledger entry amounts or metadata
    if (LEDGER_DUAL_WRITE_ENABLED) {
      try {
        const existingEntry = await ctx.db
          .query("journal_entries")
          .withIndex("by_sourceType_sourceId", (q: any) =>
            q.eq("sourceType", (updates.transactionType ?? expense.transactionType) as "expense" | "income").eq("sourceId", String(args.id))
          )
          .first();

        if (existingEntry) {
          await ctx.db.patch(existingEntry._id, {
            updateTime: Date.now(),
            updatedBy: userId as Id<"users">,
          });

          // If amount changed, adjust lines (simplest: delete and recreate lines)
          if (args.amount !== undefined || args.categoryId !== undefined || args.paymentTypeId !== undefined) {
            const lines = await ctx.db
              .query("journal_lines")
              .withIndex("by_entryId", (q: any) => q.eq("journalEntryId", existingEntry._id))
              .collect();
            for (const line of lines) await ctx.db.delete(line._id);

            const userId = expense.userId as Id<"users">;
            const categoryId = (args.categoryId ?? expense.categoryId) as Id<"categories">;
            const paymentTypeId = (args.paymentTypeId ?? expense.paymentTypeId) as Id<"paymentTypes"> | undefined;
            const categoryMapping = await getCategoryAccountMapping(ctx, userId, categoryId);
            const paymentMapping = paymentTypeId ? await getPaymentTypeAccountMapping(ctx, userId, paymentTypeId) : null;
            if (paymentMapping) {
              const isIncome = (updates.transactionType ?? expense.transactionType) === "income";
              const amountARS = toMinorARS(args.amount ?? expense.amount);
              const debitAccountId = isIncome ? paymentMapping.accountId : categoryMapping.accountId;
              const creditAccountId = isIncome ? categoryMapping.accountId : paymentMapping.accountId;
              await createDoubleEntryLines({
                ctx,
                entryId: existingEntry._id,
                userId,
                debitAccountId,
                creditAccountId,
                amountARS,
                date: updates.date ?? expense.date,
              });

              // Update rollups (best-effort, failures don't block transaction)
              try {
                await ctx.runMutation(internal.ledger.rollups.updateRollupsOnTransaction, {
                  journalEntryId: existingEntry._id,
                  updateType: "update",
                });
              } catch (rollupError) {
                console.error(`[Rollup Update] Failed to update rollups for expense update ${args.id}: ${rollupError}`);
                // Don't throw - rollup updates are best-effort
              }
            }
          }
        }
      } catch (err) {
        logDualWriteError({
          operation: "updateExpense",
          expenseId: String(args.id),
          userId: String(userId),
          errorMessage: err instanceof Error ? err.message : String(err),
          errorStack: err instanceof Error ? err.stack : undefined,
          timestamp: Date.now(),
          context: {
            amount: args.amount,
            categoryId: args.categoryId ? String(args.categoryId) : undefined,
            paymentTypeId: args.paymentTypeId ? String(args.paymentTypeId) : undefined,
          },
        });
      }
    }

    return args.id;
  },
});

// Verify an expense (mark it as verified without making other changes)
export const verifyExpense = mutation({
  args: {
    id: v.id("expenses"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthenticatedUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    
    const expense = await ctx.db.get(args.id);
    if (!expense || expense.userId !== userId) {
      throw new Error("Expense not found");
    }

    // Only set the verified flag to true
    await ctx.db.patch(args.id, { verified: true });

    // Dual-write: update audit trail in ledger to track verification
    if (LEDGER_DUAL_WRITE_ENABLED) {
      try {
        const existingEntry = await ctx.db
          .query("journal_entries")
          .withIndex("by_sourceType_sourceId", (q: any) =>
            q.eq("sourceType", expense.transactionType as "expense" | "income").eq("sourceId", String(args.id))
          )
          .first();

        if (existingEntry) {
          await ctx.db.patch(existingEntry._id, {
            updateTime: Date.now(),
            updatedBy: userId as Id<"users">,
          });
        }
      } catch (err) {
        logDualWriteError({
          operation: "verifyExpense",
          expenseId: String(args.id),
          userId: String(userId),
          errorMessage: err instanceof Error ? err.message : String(err),
          errorStack: err instanceof Error ? err.stack : undefined,
          timestamp: Date.now(),
        });
      }
    }
    
    return args.id;
  },
});

export const getLastTransaction = query({
  handler: async (ctx) => {
    const userId = await getAuthenticatedUserId(ctx);
    if (!userId) return null;
    
    const lastExpense = await ctx.db
      .query("expenses")
      .withIndex("by_user", q => q.eq("userId", userId))
      .filter(q => q.eq(q.field("softdelete"), false))
      .order("desc")
      .first();
    
    return lastExpense;
  },
});

/* export const initializeDefaultPaymentTypes = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      console.warn(
        `initializeDefaultPaymentTypes: Skipping due to no auth identity. This might be normal if called during initial user setup when auth.ts:createUser is primary.`,
      );
      return;
    }

    // Get the user record using the auth identity
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("auth0Id"), identity.subject))
      .first();

    if (!user) {
      console.warn(
        `initializeDefaultPaymentTypes: Skipping due to no user record found. This might be normal if called during initial user setup when auth.ts:createUser is primary.`,
      );
      return;
    }

    // Check if user already has payment types
    const existingTypes = await ctx.db
      .query("paymentTypes")
      .withIndex("by_user_softdelete", q => q.eq("userId", user._id).eq("softdelete", false))
      .collect();

    if (existingTypes.length === 0) {
      // Create default payment types
      for (const name of defaultPaymentTypes) {
        await ctx.db.insert("paymentTypes", {
          name,
          userId: user._id,
          softdelete: false,
        });
      }
    }
  },
}); */

export const getCategoriesWithIds = query({
  handler: async (ctx) => {
    const userId = await getAuthenticatedUserId(ctx);
    if (!userId) return [];
    
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_user", q => q.eq("userId", userId))
      .filter(q => q.eq(q.field("softdelete"), false))
      .collect();
    
    return categories;
  },
});

export const getCategoriesWithIdsIncludingDeleted = query({
  handler: async (ctx) => {
    const userId = await getAuthenticatedUserId(ctx);
    if (!userId) return [];
    
    const categories = await ctx.db
      .query("categories")
      .withIndex("by_user", q => q.eq("userId", userId))
      .collect();
    
    return categories;
  },
});

export const getHistoricPaymentTypes = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    // Get the user record using the auth identity
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("auth0Id"), identity.subject))
      .first();

    if (!user) return [];

    const paymentTypes = await ctx.db
      .query("paymentTypes")
      .withIndex("by_user_softdelete", q => q.eq("userId", user._id))
      .collect();

    return paymentTypes;
  },
});

export const migratePaymentSchedules = mutation({
  args: {},
  handler: async (ctx) => {
    // Get all expenses that are not softdeleted and have a paymentTypeId
    const expenses = await ctx.db
      .query("expenses")
      .filter(q => q.and(
        q.neq(q.field("softdelete"), true),
        q.neq(q.field("paymentTypeId"), undefined)
      ))
      .collect();

    let migratedCount = 0;
    for (const expense of expenses) {
      // Check if there are already payment schedules for this expense
      const existingSchedules = await ctx.db
        .query("paymentSchedules")
        .withIndex("by_expenseId", q => q.eq("expenseId", expense._id))
        .filter(q => q.eq(q.field("softdelete"), false))
        .collect();
      if (existingSchedules.length > 0) continue; // Already migrated

      // Skip if paymentTypeId is undefined
      if (!expense.paymentTypeId) continue;

      // Calculate nextDueDate if not present
      let nextDueDate = expense.nextDueDate;
      if (!nextDueDate) {
        nextDueDate = await calculateNextDueDate(ctx, expense.date, expense.paymentTypeId);
      }
      if (!nextDueDate) continue; // Can't migrate without due date

      // Use internal mutation to generate payment schedules
      void (await ctx.runMutation(
        internal.internal.expenses.generatePaymentSchedules,
        {
          expenseId: expense._id,
          firstDueDate: nextDueDate,
          totalAmount: expense.amount,
          totalInstallments: expense.cuotas,
          userId: expense.userId,
          paymentTypeId: expense.paymentTypeId,
        } as any,
      ));
      migratedCount++;
    }
    return { migratedCount };
  },
});
