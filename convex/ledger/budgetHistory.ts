/**
 * Budget History Queries
 * 
 * This module provides queries for retrieving historical budget execution records.
 * Historical data is read from the budget_lines table (pre-computed snapshots).
 * Current period execution is calculated in real-time from journal_lines.
 * 
 * Key functions:
 * - getBudgetHistory: Query historical budget execution (paginated)
 * - getBudgetHistoryWithCurrent: Historical + current period execution
 * - backfillBudgetHistory: Manually backfill missing historical periods
 */

import { query, mutation } from "../_generated/server";
import { internal, api } from "../_generated/api";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { Id } from "../_generated/dataModel";
import { calculatePeriodBoundaries, generatePeriodBoundariesInRange } from "./budgetUtils";

// ============================================================================
// GET BUDGET HISTORY QUERY
// ============================================================================

/**
 * Retrieve historical budget execution records for a budget.
 * 
 * Returns historical data from budget_lines table (not recalculated).
 * Does NOT include current period (use getBudgetHistoryWithCurrent for that).
 * 
 * @param budgetId - Budget to retrieve history for
 * @param startDate - Optional: only periods after this date (epoch ms)
 * @param endDate - Optional: only periods before this date (epoch ms)
 * @param limit - Optional: max records to return (default 12)
 * @returns Object with budgetId, currentBudgetAmount, history array, and hasMore flag
 */
export const getBudgetHistory = query({
  args: {
    budgetId: v.id("budgets"),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    budgetId: v.id("budgets"),
    currentBudgetAmount: v.number(),
    history: v.array(
      v.object({
        periodStart: v.number(),
        periodEnd: v.number(),
        budgetAmount: v.number(), // Historical budget amount snapshot
        spentAmount: v.number(),
        remainingAmount: v.number(),
        percentUsed: v.number(),
        status: v.union(
          v.literal("under_budget"),
          v.literal("at_budget"),
          v.literal("over_budget")
        ),
        createdAt: v.number(),
      })
    ),
    hasMore: v.boolean(),
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

    // 2. Retrieve budget and validate ownership
    const budget = await ctx.db.get(args.budgetId);
    if (!budget || budget.userId !== user._id) {
      throw new ConvexError({
        code: "BUDGET_NOT_FOUND",
        message: "Budget not found or access denied",
      });
    }

    // 3. Build query with filters
    const limit = args.limit ?? 12;
    const query = ctx.db
      .query("budget_lines")
      .withIndex("by_budgetId_periodStart", (q) => q.eq("budgetId", args.budgetId))
      .order("desc"); // Most recent first

    // 4. Collect budget lines
    const allLines = await query.collect();

    // 5. Apply date filters if provided
    let filteredLines = allLines;
    if (args.startDate) {
      filteredLines = filteredLines.filter((line) => line.periodStart >= args.startDate!);
    }
    if (args.endDate) {
      filteredLines = filteredLines.filter((line) => line.periodEnd <= args.endDate!);
    }

    // 6. Apply pagination
    const hasMore = filteredLines.length > limit;
    const history = filteredLines.slice(0, limit);

    // 7. Return results
    return {
      budgetId: budget._id,
      currentBudgetAmount: budget.amount,
      history: history.map((line) => ({
        periodStart: line.periodStart,
        periodEnd: line.periodEnd,
        budgetAmount: line.budgetAmount, // Historical budget amount snapshot
        spentAmount: line.spentAmount,
        remainingAmount: line.remainingAmount,
        percentUsed: line.percentUsed,
        status: line.status,
        createdAt: line.createdAt,
      })),
      hasMore,
    };
  },
});

// ============================================================================
// GET BUDGET HISTORY WITH CURRENT QUERY
// ============================================================================

/**
 * Retrieve historical budget execution PLUS current period (real-time calculation).
 * 
 * Historical periods are read from budget_lines table.
 * Current period is calculated in real-time from journal_lines.
 * 
 * @param budgetId - Budget to retrieve history for
 * @param startDate - Optional: only periods after this date (epoch ms)
 * @param endDate - Optional: only periods before this date (epoch ms)
 * @param limit - Optional: max historical records to return (default 12)
 * @returns Object with budgetId, currentBudgetAmount, history array, currentPeriod object, and hasMore flag
 */
export const getBudgetHistoryWithCurrent = query({
  args: {
    budgetId: v.id("budgets"),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    budgetId: v.id("budgets"),
    currentBudgetAmount: v.number(),
    history: v.array(
      v.object({
        periodStart: v.number(),
        periodEnd: v.number(),
        budgetAmount: v.number(), // Historical budget amount snapshot
        spentAmount: v.number(),
        remainingAmount: v.number(),
        percentUsed: v.number(),
        status: v.union(
          v.literal("under_budget"),
          v.literal("at_budget"),
          v.literal("over_budget")
        ),
        createdAt: v.number(),
      })
    ),
    currentPeriod: v.object({
      periodStart: v.number(),
      periodEnd: v.number(),
      spentAmount: v.number(),
      remainingAmount: v.number(),
      percentUsed: v.number(),
      status: v.union(
        v.literal("under_budget"),
        v.literal("at_budget"),
        v.literal("over_budget")
      ),
      isCurrentPeriod: v.literal(true),
    }),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args): Promise<{
    budgetId: Id<"budgets">;
    currentBudgetAmount: number;
    history: Array<{
      periodStart: number;
      periodEnd: number;
      budgetAmount: number;
      spentAmount: number;
      remainingAmount: number;
      percentUsed: number;
      status: "under_budget" | "at_budget" | "over_budget";
      createdAt: number;
    }>;
    currentPeriod: {
      periodStart: number;
      periodEnd: number;
      spentAmount: number;
      remainingAmount: number;
      percentUsed: number;
      status: "under_budget" | "at_budget" | "over_budget";
      isCurrentPeriod: true;
    };
    hasMore: boolean;
  }> => {
    // 1. Get historical data
    const historyResult: any = await ctx.runQuery(api.ledger.budgetHistory.getBudgetHistory, {
      budgetId: args.budgetId,
      startDate: args.startDate,
      endDate: args.endDate,
      limit: args.limit,
    });

    // 2. Calculate current period execution (real-time)
    const currentExecution: any = await ctx.runQuery(api.ledger.budgetExecution.getBudgetExecution, {
      budgetId: args.budgetId,
    });

    // 3. Combine results
    return {
      ...historyResult,
      currentPeriod: {
        periodStart: currentExecution.periodStart,
        periodEnd: currentExecution.periodEnd,
        spentAmount: currentExecution.spentAmount,
        remainingAmount: currentExecution.remainingAmount,
        percentUsed: currentExecution.percentUsed,
        status: currentExecution.status,
        isCurrentPeriod: true as const,
      },
    };
  },
});

// ============================================================================
// BACKFILL BUDGET HISTORY MUTATION
// ============================================================================

/**
 * Manually backfill missing budget_lines records for a budget.
 * 
 * Used for:
 * - Backfilling historical data for budgets created before cron job implementation
 * - Recovering missing periods if cron job failed for several days
 * - Generating historical data for testing or analytics purposes
 * 
 * This mutation:
 * 1. Generates all period boundaries in specified date range
 * 2. For each period, checks if budget_lines record exists
 * 3. If missing, calculates execution from journal_lines and creates budget_lines record
 * 
 * @param budgetId - Budget to backfill history for
 * @param startDate - Optional: backfill from this date (default: budget creation date)
 * @param endDate - Optional: backfill until this date (default: end of last complete period)
 * @returns Object with budgetId, periodsProcessed, linesCreated, and status
 */
export const backfillBudgetHistory = mutation({
  args: {
    budgetId: v.id("budgets"),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  returns: v.object({
    budgetId: v.id("budgets"),
    periodsProcessed: v.number(),
    linesCreated: v.number(),
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

    // 2. Retrieve budget and validate ownership
    const budget = await ctx.db.get(args.budgetId);
    if (!budget || budget.userId !== user._id) {
      throw new ConvexError({
        code: "BUDGET_NOT_FOUND",
        message: "Budget not found or access denied",
      });
    }

    // 3. Determine backfill date range
    const startDate = args.startDate ?? budget.creationTime;
    
    // Default endDate: end of last complete period (not current period)
    const defaultEndDate = (() => {
      const { periodStart, periodEnd } = calculatePeriodBoundaries(budget.frequency, Date.now());
      // If we're currently in a period, use the end of the previous period
      // This prevents backfilling partial current periods
      if (Date.now() >= periodStart && Date.now() <= periodEnd) {
        // Current period is incomplete, use previous period end
        const previousPeriodEnd = periodStart - 1;
        return previousPeriodEnd;
      }
      // Current period is complete (shouldn't happen if cron is working)
      return periodEnd;
    })();
    const endDate = args.endDate ?? defaultEndDate;

    // 4. Generate all period boundaries in range
    const periods = generatePeriodBoundariesInRange(
      budget.frequency,
      startDate,
      endDate
    );

    console.log(`[Backfill] Processing ${periods.length} periods for budget ${budget._id}`);

    let linesCreated = 0;

    // 5. For each period, check if budget_line exists, create if missing
    for (const period of periods) {
      // Check for existing line (idempotency)
      const existingLine = await ctx.db
        .query("budget_lines")
        .withIndex("by_budgetId_periodStart", (q) =>
          q.eq("budgetId", budget._id).eq("periodStart", period.periodStart)
        )
        .first();

      if (existingLine) {
        // Line already exists, skip
        continue;
      }

      // Calculate execution for this period
      const execution = await ctx.runQuery(internal.ledger.budgetExecution.calculateExecutionForPeriod, {
        budgetId: budget._id,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
      });

      if (!execution) {
        console.warn(`[Backfill] Could not calculate execution for period ${period.periodStart}`);
        continue;
      }

      // Create budget_lines record
      await ctx.runMutation(internal.ledger.budgetLines.createBudgetLine, {
        budgetId: budget._id,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        spentAmount: execution.spentAmount,
        remainingAmount: execution.remainingAmount,
        percentUsed: execution.percentUsed,
        budgetAmount: budget.amount, // Snapshot current budget amount (best available historical data)
        status: execution.status,
      });

      linesCreated++;
    }

    console.log(`[Backfill] Completed: ${periods.length} periods processed, ${linesCreated} lines created`);

    return {
      budgetId: budget._id,
      periodsProcessed: periods.length,
      linesCreated,
      status: "success" as const,
    };
  },
});

