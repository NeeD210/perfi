/**
 * Budget Execution Queries
 * 
 * This module provides queries for calculating real-time budget execution from journal_lines.
 * Budget execution aggregates spending/earning for the current period based on budget scope.
 * 
 * Performance considerations:
 * - Uses indexes for efficient period queries
 * - Parallelizes journal_lines queries for multiple accounts
 * - Handles soft-deleted accounts gracefully
 */

import { query, QueryCtx, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { Id, Doc } from "../_generated/dataModel";
import { calculatePeriodBoundaries } from "./budgetUtils";

// ============================================================================
// INTERNAL HELPER FUNCTIONS
// ============================================================================

/**
 * Internal helper to calculate budget execution.
 * This is extracted as a helper to avoid circular dependencies.
 */
async function calculateBudgetExecutionHelper(
  ctx: QueryCtx,
  budget: Doc<"budgets">,
  userId: Id<"users">
) {
  // 1. Calculate current period boundaries
  const { periodStart, periodEnd } = calculatePeriodBoundaries(
    budget.frequency,
    Date.now()
  );

  // 2. Determine accounts in scope (exclude soft-deleted accounts)
  const accountIds: Array<Id<"accounts">> = [];

  if (budget.scopeType === "singleAccount") {
    // For single account, verify account exists and is active
    if (budget.accountId) {
      const account = await ctx.db.get(budget.accountId);
      if (account && !account.softdelete) {
        accountIds.push(budget.accountId);
      }
    }
    // If account deleted or missing, accountIds remains empty (zero execution)
  } else if (budget.scopeType === "multipleAccounts") {
    // For multiple accounts, filter out soft-deleted accounts
    if (budget.scopeRefs && budget.scopeRefs.length > 0) {
      const accountPromises = budget.scopeRefs.map((id) => ctx.db.get(id));
      const accounts = await Promise.all(accountPromises);

      for (const account of accounts) {
        if (account && !account.softdelete) {
          accountIds.push(account._id);
        }
      }
    }
  } else if (budget.scopeType === "accountType") {
    // Query all active accounts of specified type for user
    if (budget.scopeAccountType) {
      const accounts = await ctx.db
        .query("accounts")
        .withIndex("by_user_type_active", (q) =>
          q
            .eq("userId", userId)
            .eq("accountType", budget.scopeAccountType!)
            .eq("softdelete", false)
        )
        .collect();

      accountIds.push(...accounts.map((a) => a._id));
    }
  }

  // 3. Aggregate journal_lines for accounts in period (parallelized for performance)
  let spentAmount = 0;
  const accountBreakdown: Array<{
    accountId: Id<"accounts">;
    accountDescription: string;
    spentAmount: number;
  }> = [];

  // Parallelize journal_lines queries for better performance
  const linePromises = accountIds.map((accountId) =>
    ctx.db
      .query("journal_lines")
      .withIndex("by_accountId_date", (q) =>
        q
          .eq("accountId", accountId)
          .gte("entryDate", periodStart)
          .lte("entryDate", periodEnd)
      )
      .collect()
  );

  const linesArrays = await Promise.all(linePromises);

  // Process each account's lines
  for (let i = 0; i < accountIds.length; i++) {
    const accountId = accountIds[i];
    const lines = linesArrays[i];

    const account = await ctx.db.get(accountId);
    if (!account || account.softdelete) continue;

    // Sum amounts based on account type and direction
    let accountSpent = 0;

    for (const line of lines) {
      if (account.accountType === "expense" && line.direction === "debit") {
        // Expense account: debits increase spending (positive amount)
        accountSpent += line.amountBaseCurrency;
      } else if (account.accountType === "income" && line.direction === "credit") {
        // Income account: credits increase earning (positive amount)
        accountSpent += line.amountBaseCurrency;
      }
    }

    spentAmount += accountSpent;

    accountBreakdown.push({
      accountId: account._id,
      accountDescription: account.description,
      spentAmount: accountSpent,
    });
  }

  // 4. Calculate derived values
  const remainingAmount = budget.amount - spentAmount;
  const percentUsed = budget.amount > 0 ? (spentAmount / budget.amount) * 100 : 0;

  // 5. Determine status
  let status: "under_budget" | "at_budget" | "over_budget";
  if (spentAmount < budget.amount) {
    status = "under_budget";
  } else if (spentAmount >= budget.amount && spentAmount < budget.amount * 1.05) {
    status = "at_budget";
  } else {
    status = "over_budget";
  }

  return {
    budgetId: budget._id,
    budgetAmount: budget.amount,
    spentAmount,
    remainingAmount,
    percentUsed: Math.min(percentUsed, 999), // Cap at 999% for display
    periodStart,
    periodEnd,
    status,
    accounts: accountBreakdown,
  };
}

// ============================================================================
// GET BUDGET EXECUTION QUERY
// ============================================================================

/**
 * Calculate real-time budget execution for a specific budget.
 * 
 * Aggregates journal_lines for accounts in budget scope within current period.
 * Handles:
 * - All three scope types (singleAccount, multipleAccounts, accountType)
 * - Soft-deleted accounts (excluded from aggregation)
 * - Expense accounts (sum debits) and income accounts (sum credits)
 * - Account breakdown showing spending per account
 * 
 * @returns Budget execution summary with spent amount, remaining, status, etc.
 */
export const getBudgetExecution = query({
  args: {
    budgetId: v.id("budgets"),
  },
  returns: v.object({
    budgetId: v.id("budgets"),
    budgetAmount: v.number(),
    spentAmount: v.number(),
    remainingAmount: v.number(),
    percentUsed: v.number(),
    periodStart: v.number(),
    periodEnd: v.number(),
    status: v.union(
      v.literal("under_budget"),
      v.literal("at_budget"),
      v.literal("over_budget")
    ),
    accounts: v.array(
      v.object({
        accountId: v.id("accounts"),
        accountDescription: v.string(),
        spentAmount: v.number(),
      })
    ),
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

    // 2. Retrieve budget
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
        message: "Cannot get execution for deleted budget",
      });
    }

    // 3. Calculate and return execution using helper
    return await calculateBudgetExecutionHelper(ctx, budget, user._id);
  },
});

// ============================================================================
// LIST BUDGETS QUERY
// ============================================================================

/**
 * List all budgets for a user with current execution status.
 * 
 * Returns:
 * - Budget configuration (amount, frequency, scope)
 * - Current execution summary (spent, remaining, status)
 * - Human-readable scope description
 * 
 * @returns Array of budget summaries sorted by creation time (newest first)
 */
export const listBudgets = query({
  args: {
    includeDeleted: v.optional(v.boolean()),
  },
  returns: v.array(
    v.object({
      id: v.id("budgets"),
      amount: v.number(),
      frequency: v.union(
        v.literal("daily"),
        v.literal("weekly"),
        v.literal("monthly"),
        v.literal("quarterly"),
        v.literal("semestrally"),
        v.literal("yearly")
      ),
      scopeType: v.union(
        v.literal("singleAccount"),
        v.literal("multipleAccounts"),
        v.literal("accountType")
      ),
      scopeDescription: v.string(),
      currentExecution: v.object({
        spentAmount: v.number(),
        remainingAmount: v.number(),
        percentUsed: v.number(),
        status: v.union(
          v.literal("under_budget"),
          v.literal("at_budget"),
          v.literal("over_budget")
        ),
      }),
      creationTime: v.number(),
      endDate: v.optional(v.number()),
    })
  ),
  handler: async (ctx, args) => {
    // 1. Authenticate user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_auth0Id", (q) => q.eq("auth0Id", identity.subject))
      .first();

    if (!user) {
      return [];
    }

    // 2. Query budgets by user
    const includeDeleted = args.includeDeleted ?? false;

    let budgets;
    if (includeDeleted) {
      // Get all budgets
      budgets = await ctx.db
        .query("budgets")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
    } else {
      // Get only active budgets
      budgets = await ctx.db
        .query("budgets")
        .withIndex("by_user_active", (q) =>
          q.eq("userId", user._id).eq("softdelete", false)
        )
        .collect();
    }

    // 3. For each budget, get execution and format scope description
    const budgetSummaries = await Promise.all(
      budgets.map(async (budget) => {
        // Get execution for this budget using helper
        let execution;
        try {
          execution = await calculateBudgetExecutionHelper(ctx, budget, user._id);
        } catch (error) {
          // If execution fails, return zero execution
          execution = {
            budgetId: budget._id,
            budgetAmount: budget.amount,
            spentAmount: 0,
            remainingAmount: budget.amount,
            percentUsed: 0,
            periodStart: 0,
            periodEnd: 0,
            status: "under_budget" as const,
            accounts: [],
          };
        }

        // Format scope description
        let scopeDescription = "";

        if (budget.scopeType === "singleAccount" && budget.accountId) {
          const account = await ctx.db.get(budget.accountId);
          scopeDescription = account?.description ?? "Unknown Account";
        } else if (budget.scopeType === "multipleAccounts" && budget.scopeRefs) {
          const accountCount = budget.scopeRefs.length;
          scopeDescription = `Multiple Accounts (${accountCount})`;
        } else if (budget.scopeType === "accountType" && budget.scopeAccountType) {
          const typeLabel =
            budget.scopeAccountType === "expense" ? "All Expenses" : "All Income";
          scopeDescription = typeLabel;
        } else {
          scopeDescription = "Unknown Scope";
        }

        return {
          id: budget._id,
          amount: budget.amount,
          frequency: budget.frequency,
          scopeType: budget.scopeType,
          scopeDescription,
          currentExecution: {
            spentAmount: execution.spentAmount,
            remainingAmount: execution.remainingAmount,
            percentUsed: execution.percentUsed,
            status: execution.status,
          },
          creationTime: budget.creationTime,
          endDate: budget.endDate,
        };
      })
    );

    // 4. Sort by creation time descending (newest first)
    budgetSummaries.sort((a, b) => b.creationTime - a.creationTime);

    return budgetSummaries;
  },
});

// ============================================================================
// CALCULATE EXECUTION FOR PERIOD (INTERNAL QUERY FOR HISTORICAL TRACKING)
// ============================================================================

/**
 * Calculate budget execution for a specific historical period.
 * 
 * Used by:
 * - Budget rollover cron job to capture execution at period boundaries
 * - Backfill utility to create missing historical lines
 * - Analytics and reporting features
 * 
 * This function reuses the same execution logic as real-time calculation but for arbitrary periods.
 * 
 * @param budgetId - Budget to calculate execution for
 * @param periodStart - Start of period (epoch ms, inclusive)
 * @param periodEnd - End of period (epoch ms, inclusive)
 * @returns Execution summary with spent amount, remaining, status, or null if budget not found
 * @internal This is an internal function for cron job and utilities
 */
export const calculateExecutionForPeriod = internalQuery({
  args: {
    budgetId: v.id("budgets"),
    periodStart: v.number(),
    periodEnd: v.number(),
  },
  returns: v.union(
    v.object({
      spentAmount: v.number(),
      remainingAmount: v.number(),
      percentUsed: v.number(),
      status: v.union(
        v.literal("under_budget"),
        v.literal("at_budget"),
        v.literal("over_budget")
      ),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    // 1. Retrieve budget
    const budget = await ctx.db.get(args.budgetId);
    if (!budget) return null;

    // 2. Determine accounts in scope (same logic as getBudgetExecution)
    const accountIds: Array<Id<"accounts">> = [];

    if (budget.scopeType === "singleAccount") {
      if (budget.accountId) {
        const account = await ctx.db.get(budget.accountId);
        if (account && !account.softdelete) {
          accountIds.push(budget.accountId);
        }
      }
    } else if (budget.scopeType === "multipleAccounts") {
      if (budget.scopeRefs && budget.scopeRefs.length > 0) {
        const accountPromises = budget.scopeRefs.map((id) => ctx.db.get(id));
        const accounts = await Promise.all(accountPromises);
        for (const account of accounts) {
          if (account && !account.softdelete) {
            accountIds.push(account._id);
          }
        }
      }
    } else if (budget.scopeType === "accountType") {
      if (budget.scopeAccountType) {
        const accounts = await ctx.db
          .query("accounts")
          .withIndex("by_user_type_active", (q) =>
            q
              .eq("userId", budget.userId)
              .eq("accountType", budget.scopeAccountType!)
              .eq("softdelete", false)
          )
          .collect();
        accountIds.push(...accounts.map((a) => a._id));
      }
    }

    // 3. Aggregate journal_lines for accounts in period (parallelized for performance)
    let spentAmount = 0;

    // Parallelize journal_lines queries
    const linePromises = accountIds.map((accountId) =>
      ctx.db
        .query("journal_lines")
        .withIndex("by_accountId_date", (q) =>
          q
            .eq("accountId", accountId)
            .gte("entryDate", args.periodStart)
            .lte("entryDate", args.periodEnd)
        )
        .collect()
    );

    const linesArrays = await Promise.all(linePromises);

    // Process each account's lines
    for (let i = 0; i < accountIds.length; i++) {
      const accountId = accountIds[i];
      const lines = linesArrays[i];

      const account = await ctx.db.get(accountId);
      if (!account || account.softdelete) continue;

      // Sum amounts based on account type and direction
      for (const line of lines) {
        if (account.accountType === "expense" && line.direction === "debit") {
          // Expense account: debits increase spending (positive amount)
          spentAmount += line.amountBaseCurrency;
        } else if (account.accountType === "income" && line.direction === "credit") {
          // Income account: credits increase earning (positive amount)
          spentAmount += line.amountBaseCurrency;
        }
      }
    }

    // 4. Calculate derived values
    const remainingAmount = budget.amount - spentAmount;
    const percentUsed = budget.amount > 0 ? Math.min((spentAmount / budget.amount) * 100, 999) : 0;

    // 5. Determine status
    let status: "under_budget" | "at_budget" | "over_budget";
    if (spentAmount < budget.amount) {
      status = "under_budget";
    } else if (spentAmount >= budget.amount && spentAmount < budget.amount * 1.05) {
      status = "at_budget";
    } else {
      status = "over_budget";
    }

    return {
      spentAmount,
      remainingAmount,
      percentUsed,
      status,
    };
  },
});

