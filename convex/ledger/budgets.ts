/**
 * Budget CRUD Mutations
 * 
 * This module provides mutations for creating, updating, and deleting budgets.
 * Budgets support three scope types:
 * - singleAccount: Budget for one specific account
 * - multipleAccounts: Budget for selected accounts (must be same type)
 * - accountType: Budget for all accounts of a type (expense or income)
 * 
 * All budgets have frequency-based periods (daily through yearly) with no carryover.
 */

import { mutation, internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { Id } from "../_generated/dataModel";
import { calculateNextDueDate } from "./budgetUtils";
import { frequencyValidator, scopeTypeValidator } from "./validators";

// ============================================================================
// CREATE BUDGET MUTATION
// ============================================================================

/**
 * Create a new budget with comprehensive validation.
 * 
 * Validates:
 * - User authentication
 * - Budget amount (must be positive)
 * - Scope configuration (accountId/scopeRefs/scopeAccountType based on scopeType)
 * - Account ownership and status
 * - Account type eligibility (expense/income only)
 * - End date (must be in future if provided)
 * 
 * @returns Budget ID and success status
 */
export const createBudget = mutation({
  args: {
    scopeType: scopeTypeValidator,
    amount: v.number(),
    frequency: frequencyValidator,
    accountId: v.optional(v.id("accounts")),
    scopeRefs: v.optional(v.array(v.id("accounts"))),
    scopeAccountType: v.optional(v.union(v.literal("expense"), v.literal("income"))),
    endDate: v.optional(v.number()),
    description: v.optional(v.string()),
  },
  returns: v.object({
    budgetId: v.id("budgets"),
    status: v.literal("success"),
  }),
  handler: async (ctx, args) => {
    // 1. Authenticate user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "User not authenticated",
      });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_auth0Id", (q) => q.eq("auth0Id", identity.subject))
      .first();

    if (!user) {
      throw new ConvexError({
        code: "USER_NOT_FOUND",
        message: "User not found",
      });
    }

    // 2. Validate amount
    if (args.amount <= 0) {
      throw new ConvexError({
        code: "INVALID_AMOUNT",
        message: "Budget amount must be positive",
      });
    }

    // 2b. Validate description length if provided
    if (args.description && args.description.length > 500) {
      throw new ConvexError({
        code: "INVALID_DESCRIPTION",
        message: "Description must be 500 characters or less",
      });
    }

    // 3. Validate scope configuration based on scopeType
    if (args.scopeType === "singleAccount") {
      if (!args.accountId) {
        throw new ConvexError({
          code: "INVALID_SCOPE",
          message: "accountId required for singleAccount scope",
        });
      }

      // Validate account exists, belongs to user, is active, is expense/income type
      const account = await ctx.db.get(args.accountId);
      if (!account || account.userId !== user._id) {
        throw new ConvexError({
          code: "ACCOUNT_NOT_FOUND",
          message: "Account not found or access denied",
        });
      }

      if (account.softdelete) {
        throw new ConvexError({
          code: "ACCOUNT_DELETED",
          message: "Cannot create budget for deleted account",
        });
      }

      if (!["expense", "income"].includes(account.accountType)) {
        throw new ConvexError({
          code: "INVALID_ACCOUNT_TYPE",
          message: "Budget accounts must be expense or income type",
        });
      }
    } else if (args.scopeType === "multipleAccounts") {
      if (!args.scopeRefs || args.scopeRefs.length === 0) {
        throw new ConvexError({
          code: "INVALID_SCOPE",
          message: "scopeRefs array required for multipleAccounts scope",
        });
      }

      // Validate all accounts exist, belong to user, same type, active
      const accounts = await Promise.all(
        args.scopeRefs.map((id) => ctx.db.get(id))
      );

      const firstAccountType = accounts[0]?.accountType;

      for (const account of accounts) {
        if (!account || account.userId !== user._id) {
          throw new ConvexError({
            code: "ACCOUNT_NOT_FOUND",
            message: "One or more accounts not found or access denied",
          });
        }

        if (account.softdelete) {
          throw new ConvexError({
            code: "ACCOUNT_DELETED",
            message: "Cannot create budget with deleted accounts",
          });
        }

        if (!["expense", "income"].includes(account.accountType)) {
          throw new ConvexError({
            code: "INVALID_ACCOUNT_TYPE",
            message: "Budget accounts must be expense or income type",
          });
        }

        if (account.accountType !== firstAccountType) {
          throw new ConvexError({
            code: "MIXED_ACCOUNT_TYPES",
            message: "All accounts in budget must have same type",
          });
        }
      }
    } else if (args.scopeType === "accountType") {
      if (!args.scopeAccountType) {
        throw new ConvexError({
          code: "INVALID_SCOPE",
          message: "scopeAccountType required for accountType scope",
        });
      }

      if (!["expense", "income"].includes(args.scopeAccountType)) {
        throw new ConvexError({
          code: "INVALID_SCOPE",
          message: "scopeAccountType must be 'expense' or 'income'",
        });
      }

      // Verify at least one account of this type exists
      const accountsOfType = await ctx.db
        .query("accounts")
        .withIndex("by_user_type_active", (q) =>
          q
            .eq("userId", user._id)
            .eq("accountType", args.scopeAccountType!)
            .eq("softdelete", false)
        )
        .first();

      if (!accountsOfType) {
        throw new ConvexError({
          code: "NO_ACCOUNTS",
          message: `No ${args.scopeAccountType} accounts found`,
        });
      }
    }

    // 4. Validate endDate if provided
    if (args.endDate && args.endDate <= Date.now()) {
      throw new ConvexError({
        code: "INVALID_END_DATE",
        message: "endDate must be in the future",
      });
    }

    // 5. Calculate nextDueDate from frequency
    const nextDueDate = calculateNextDueDate(Date.now(), args.frequency);

    // 6. Insert budget record
    const budgetId = await ctx.db.insert("budgets", {
      userId: user._id,
      accountId: args.accountId,
      amount: args.amount,
      frequency: args.frequency,
      nextDueDate,
      endDate: args.endDate,
      creationTime: Date.now(),
      softdelete: false,
      scopeType: args.scopeType,
      scopeRefs: args.scopeRefs,
      scopeAccountType: args.scopeAccountType,
      description: args.description,
    });

    // 7. Return success
    return { budgetId, status: "success" as const };
  },
});

// ============================================================================
// UPDATE BUDGET MUTATION
// ============================================================================

/**
 * Update an existing budget's configuration.
 * 
 * Can update:
 * - amount: Budget limit
 * - frequency: Period frequency (recalculates nextDueDate)
 * - endDate: Budget end date
 * 
 * Cannot update scope configuration (must delete and recreate).
 * 
 * @returns Budget ID and success status
 */
export const updateBudget = mutation({
  args: {
    budgetId: v.id("budgets"),
    amount: v.optional(v.number()),
    frequency: v.optional(frequencyValidator),
    endDate: v.optional(v.number()),
  },
  returns: v.object({
    budgetId: v.id("budgets"),
    status: v.literal("success"),
  }),
  handler: async (ctx, args) => {
    // 1. Authenticate user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "User not authenticated",
      });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_auth0Id", (q) => q.eq("auth0Id", identity.subject))
      .first();

    if (!user) {
      throw new ConvexError({
        code: "USER_NOT_FOUND",
        message: "User not found",
      });
    }

    // 2. Retrieve and validate budget ownership
    const budget = await ctx.db.get(args.budgetId);
    if (!budget || budget.userId !== user._id) {
      throw new ConvexError({
        code: "BUDGET_NOT_FOUND",
        message: "Budget not found or access denied",
      });
    }

    if (budget.softdelete) {
      throw new ConvexError({
        code: "BUDGET_DELETED",
        message: "Cannot update deleted budget",
      });
    }

    // 3. Validate new values
    if (args.amount !== undefined && args.amount <= 0) {
      throw new ConvexError({
        code: "INVALID_AMOUNT",
        message: "Budget amount must be positive",
      });
    }

    if (args.endDate !== undefined && args.endDate <= Date.now()) {
      throw new ConvexError({
        code: "INVALID_END_DATE",
        message: "endDate must be in the future",
      });
    }

    // 4. Prepare update object
    const updates: Partial<{
      amount: number;
      frequency: "daily" | "weekly" | "monthly" | "quarterly" | "semestrally" | "yearly";
      nextDueDate: number;
      endDate: number;
    }> = {};

    if (args.amount !== undefined) {
      updates.amount = args.amount;
    }

    if (args.frequency !== undefined) {
      updates.frequency = args.frequency;
      // Recalculate nextDueDate when frequency changes
      updates.nextDueDate = calculateNextDueDate(Date.now(), args.frequency);
    }

    if (args.endDate !== undefined) {
      updates.endDate = args.endDate;
    }

    // 5. Update budget
    await ctx.db.patch(args.budgetId, updates);

    // 6. Return success
    return { budgetId: args.budgetId, status: "success" as const };
  },
});

// ============================================================================
// DELETE BUDGET MUTATION
// ============================================================================

/**
 * Soft-delete a budget (preserves historical data).
 * 
 * Sets softdelete = true and deletedAt = current timestamp.
 * Budget is excluded from active queries but data is preserved.
 * 
 * @returns Budget ID and success status
 */
export const deleteBudget = mutation({
  args: {
    budgetId: v.id("budgets"),
  },
  returns: v.object({
    budgetId: v.id("budgets"),
    status: v.literal("success"),
  }),
  handler: async (ctx, args) => {
    // 1. Authenticate user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "User not authenticated",
      });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_auth0Id", (q) => q.eq("auth0Id", identity.subject))
      .first();

    if (!user) {
      throw new ConvexError({
        code: "USER_NOT_FOUND",
        message: "User not found",
      });
    }

    // 2. Retrieve and validate budget ownership
    const budget = await ctx.db.get(args.budgetId);
    if (!budget || budget.userId !== user._id) {
      throw new ConvexError({
        code: "BUDGET_NOT_FOUND",
        message: "Budget not found or access denied",
      });
    }

    if (budget.softdelete) {
      throw new ConvexError({
        code: "BUDGET_ALREADY_DELETED",
        message: "Budget already deleted",
      });
    }

    // 3. Soft-delete budget
    await ctx.db.patch(args.budgetId, {
      softdelete: true,
      deletedAt: Date.now(),
    });

    // 4. Return success
    return { budgetId: args.budgetId, status: "success" as const };
  },
});

// ============================================================================
// INTERNAL QUERIES AND MUTATIONS FOR BUDGET ROLLOVER
// ============================================================================

/**
 * List all active budgets (not soft-deleted).
 * Used by the budget rollover cron job to process period rollovers.
 * 
 * @returns Array of active budgets
 * @internal This is an internal function used by the cron job
 */
export const listActiveBudgets = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("budgets"),
      userId: v.id("users"),
      accountId: v.optional(v.id("accounts")),
      amount: v.number(),
      frequency: frequencyValidator,
      nextDueDate: v.number(),
      endDate: v.optional(v.number()),
      creationTime: v.number(),
      softdelete: v.boolean(),
      deletedAt: v.optional(v.number()),
      scopeType: scopeTypeValidator,
      scopeRefs: v.optional(v.array(v.id("accounts"))),
      scopeAccountType: v.optional(v.union(v.literal("expense"), v.literal("income"))),
      description: v.optional(v.string()),
    })
  ),
  handler: async (ctx) => {
    // Query all budgets (not filtered by softdelete yet to support soft-delete logic in cron)
    const allBudgets = await ctx.db
      .query("budgets")
      .collect();
    
    return allBudgets;
  },
});

/**
 * Update a budget's nextDueDate field.
 * Used by the budget rollover cron job after creating budget_lines record.
 * 
 * @param budgetId - Budget to update
 * @param nextDueDate - New nextDueDate value
 * @internal This is an internal function used by the cron job
 */
export const updateNextDueDate = internalMutation({
  args: {
    budgetId: v.id("budgets"),
    nextDueDate: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.budgetId, {
      nextDueDate: args.nextDueDate,
    });
    
    return null;
  },
});

