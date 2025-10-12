/**
 * Budget Lines Module
 * 
 * This module handles budget line creation and period rollover processing.
 * Budget lines are historical records capturing budget execution at period boundaries.
 * 
 * Key functions:
 * - createBudgetLine: Internal mutation to create historical execution snapshot
 * - processBudgetRollover: Internal action (cron job) to process period rollovers for all budgets
 * 
 * Cron job runs daily at 00:05 UTC to capture execution at period boundaries.
 */

import { internalMutation, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { Id } from "../_generated/dataModel";
import { calculatePeriodBoundaries, calculateNextDueDate } from "./budgetUtils";
import { budgetStatusValidator } from "./validators";

// ============================================================================
// CREATE BUDGET LINE INTERNAL MUTATION
// ============================================================================

/**
 * Create a historical budget execution snapshot (budget_lines record).
 * 
 * This function is idempotent - calling it multiple times with the same
 * budgetId + periodStart combination will not create duplicate records.
 * 
 * @param budgetId - Budget reference
 * @param periodStart - Period start epoch ms
 * @param periodEnd - Period end epoch ms
 * @param spentAmount - Amount spent in period (minor units)
 * @param remainingAmount - Budget amount minus spent (can be negative)
 * @param percentUsed - Percent of budget used (0-999)
 * @param budgetAmount - Budget amount at time of period end (snapshot)
 * @param status - Budget status (under_budget, at_budget, over_budget)
 * @returns Budget line ID and status (success or already_exists)
 * @internal This is an internal mutation called by cron job and backfill utilities
 */
export const createBudgetLine = internalMutation({
  args: {
    budgetId: v.id("budgets"),
    periodStart: v.number(),
    periodEnd: v.number(),
    spentAmount: v.number(),
    remainingAmount: v.number(),
    percentUsed: v.number(),
    budgetAmount: v.number(),
    status: budgetStatusValidator,
  },
  returns: v.object({
    budgetLineId: v.id("budget_lines"),
    status: v.union(v.literal("success"), v.literal("already_exists")),
  }),
  handler: async (ctx, args) => {
    // 1. Validate budget exists
    const budget = await ctx.db.get(args.budgetId);
    if (!budget) {
      throw new ConvexError({
        code: "BUDGET_NOT_FOUND",
        message: "Budget does not exist",
      });
    }

    // 2. Check for existing budget_line (idempotency)
    const existingLine = await ctx.db
      .query("budget_lines")
      .withIndex("by_budgetId_periodStart", (q) =>
        q.eq("budgetId", args.budgetId).eq("periodStart", args.periodStart)
      )
      .first();

    if (existingLine) {
      // Line already exists, return existing ID
      console.log(`Budget line already exists for budget ${args.budgetId} period ${args.periodStart}`);
      return { budgetLineId: existingLine._id, status: "already_exists" as const };
    }

    // 3. Validate period boundaries
    if (args.periodStart >= args.periodEnd) {
      throw new ConvexError({
        code: "INVALID_PERIOD",
        message: "periodStart must be before periodEnd",
      });
    }
    if (args.periodEnd >= Date.now()) {
      throw new ConvexError({
        code: "INVALID_PERIOD",
        message: "Cannot create budget line for future period",
      });
    }

    // 4. Insert budget_lines record
    const budgetLineId = await ctx.db.insert("budget_lines", {
      budgetId: args.budgetId,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      spentAmount: args.spentAmount,
      remainingAmount: args.remainingAmount,
      percentUsed: args.percentUsed,
      budgetAmount: args.budgetAmount,
      status: args.status,
      createdAt: Date.now(),
    });

    console.log(`Created budget line ${budgetLineId} for budget ${args.budgetId}: ${args.status}, ${args.percentUsed}% used`);

    return { budgetLineId, status: "success" as const };
  },
});

// ============================================================================
// PROCESS BUDGET ROLLOVER INTERNAL ACTION (CRON JOB)
// ============================================================================

/**
 * Process period rollovers for all active budgets (cron job handler).
 * 
 * Scheduled to run daily at 00:05 UTC. For each budget with nextDueDate <= currentTime:
 * 1. Calculate execution for previous period
 * 2. Create budget_lines record
 * 3. Update nextDueDate to next period start
 * 
 * Handles multi-period catchup if cron job fails for multiple days (up to 100 periods).
 * Processes budgets in batches of 50 for performance and memory efficiency.
 * 
 * @returns null (logs results to console)
 * @internal This is the cron job handler
 */
export const processBudgetRollover = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const startTime = Date.now();
    let processed = 0;
    let created = 0;
    let errors = 0;

    console.log(`[Budget Rollover] Job started at ${new Date(startTime).toISOString()}`);

    try {
      // 1. Query all budgets (filter will be applied in processing logic)
      const budgets = await ctx.runQuery(internal.ledger.budgets.listActiveBudgets);
      console.log(`[Budget Rollover] Found ${budgets.length} total budgets`);

      // 2. Process budgets in batches of 50 to prevent timeout
      const BATCH_SIZE = 50;
      for (let i = 0; i < budgets.length; i += BATCH_SIZE) {
        const batch = budgets.slice(i, i + BATCH_SIZE);

        // Process batch in parallel
        const results = await Promise.allSettled(
          batch.map((budget) => processSingleBudget(ctx, budget))
        );

        // Count results
        for (const result of results) {
          processed++;
          if (result.status === "fulfilled") {
            created += result.value.periodsCreated;
          } else if (result.status === "rejected") {
            errors++;
            console.error(`[Budget Rollover] Error processing budget: ${result.reason}`);
          }
        }
      }

      const duration = Date.now() - startTime;
      console.log(`[Budget Rollover] Job completed: ${processed} processed, ${created} lines created, ${errors} errors, ${duration}ms`);
    } catch (error) {
      console.error(`[Budget Rollover] Job failed: ${error}`);
      // Don't throw - allow job to complete even if partially failed
    }

    return null;
  },
});

// ============================================================================
// HELPER FUNCTION: PROCESS SINGLE BUDGET
// ============================================================================

/**
 * Process period rollover for a single budget.
 * 
 * Handles:
 * - Multi-period catchup (if cron failed for multiple days)
 * - Soft-deleted budgets (create final period if due, then stop)
 * - Expired budgets (skip)
 * - Missing execution data (skip and retry in next run)
 * 
 * @param ctx - Convex context
 * @param budget - Budget to process
 * @returns Object with budgetId, periodsCreated, and reason
 */
async function processSingleBudget(
  ctx: any,
  budget: {
    _id: Id<"budgets">;
    userId: Id<"users">;
    accountId?: Id<"accounts">;
    amount: number;
    frequency: "daily" | "weekly" | "monthly" | "quarterly" | "semestrally" | "yearly";
    nextDueDate: number;
    endDate?: number;
    creationTime: number;
    softdelete: boolean;
    deletedAt?: number;
    scopeType: "singleAccount" | "multipleAccounts" | "accountType";
    scopeRefs?: Array<Id<"accounts">>;
    scopeAccountType?: "expense" | "income";
    description?: string;
  }
): Promise<{ budgetId: Id<"budgets">; periodsCreated: number; reason: string }> {
  const currentTime = Date.now();
  let periodsCreated = 0;
  const MAX_CATCHUP_PERIODS = 100; // Safety limit to prevent runaway loops

  // Skip if budget hasn't reached nextDueDate yet
  if (budget.nextDueDate > currentTime) {
    return { budgetId: budget._id, periodsCreated: 0, reason: "not_due" };
  }

  // Handle soft-deleted budgets: create final period if current period has ended, then stop
  if (budget.softdelete) {
    console.log(`[Budget Rollover] Budget ${budget._id} is soft-deleted, creating final period if due`);
    if (budget.nextDueDate <= currentTime) {
      // Create final period
      const previousPeriodEnd = budget.nextDueDate - 1;
      const { periodStart } = calculatePeriodBoundaries(budget.frequency, previousPeriodEnd);
      
      const execution = await ctx.runQuery(internal.ledger.budgetExecution.calculateExecutionForPeriod, {
        budgetId: budget._id,
        periodStart,
        periodEnd: previousPeriodEnd,
      });

      if (execution) {
        await ctx.runMutation(internal.ledger.budgetLines.createBudgetLine, {
          budgetId: budget._id,
          periodStart,
          periodEnd: previousPeriodEnd,
          spentAmount: execution.spentAmount,
          remainingAmount: execution.remainingAmount,
          percentUsed: execution.percentUsed,
          budgetAmount: budget.amount, // Snapshot budget amount at period end
          status: execution.status,
        });
        periodsCreated++;
        
        // Update nextDueDate to prevent re-processing in future cron runs
        await ctx.runMutation(internal.ledger.budgets.updateNextDueDate, {
          budgetId: budget._id,
          nextDueDate: Date.now() + (100 * 365 * 24 * 60 * 60 * 1000), // 100 years in future
        });
      }
    }
    return { budgetId: budget._id, periodsCreated, reason: "soft_deleted_final_period" };
  }

  // Skip if budget has expired (endDate in past)
  if (budget.endDate && budget.endDate < currentTime) {
    console.log(`[Budget Rollover] Skipping expired budget ${budget._id}`);
    return { budgetId: budget._id, periodsCreated: 0, reason: "expired" };
  }

  // Multi-period catchup loop: process all periods from nextDueDate to currentTime
  let workingNextDueDate = budget.nextDueDate;

  while (workingNextDueDate <= currentTime && periodsCreated < MAX_CATCHUP_PERIODS) {
    // Calculate previous period boundaries
    const previousPeriodEnd = workingNextDueDate - 1; // 1ms before new period starts
    const { periodStart } = calculatePeriodBoundaries(
      budget.frequency,
      previousPeriodEnd
    );

    // Calculate execution for previous period
    const execution = await ctx.runQuery(internal.ledger.budgetExecution.calculateExecutionForPeriod, {
      budgetId: budget._id,
      periodStart,
      periodEnd: previousPeriodEnd,
    });

    if (!execution) {
      console.warn(`[Budget Rollover] Could not calculate execution for budget ${budget._id} period ${periodStart}`);
      break; // Stop processing this budget, will retry in next cron run
    }

    // Create budget_lines record (idempotent)
    const result = await ctx.runMutation(internal.ledger.budgetLines.createBudgetLine, {
      budgetId: budget._id,
      periodStart,
      periodEnd: previousPeriodEnd,
      spentAmount: execution.spentAmount,
      remainingAmount: execution.remainingAmount,
      percentUsed: execution.percentUsed,
      budgetAmount: budget.amount, // Snapshot budget amount at period end
      status: execution.status,
    });

    if (result.status === "success") {
      periodsCreated++;
    }

    // Advance to next period
    workingNextDueDate = calculateNextDueDate(workingNextDueDate, budget.frequency);
  }

  // Update budget.nextDueDate to caught-up date
  if (periodsCreated > 0) {
    await ctx.runMutation(internal.ledger.budgets.updateNextDueDate, {
      budgetId: budget._id,
      nextDueDate: workingNextDueDate,
    });
  }

  if (periodsCreated >= MAX_CATCHUP_PERIODS) {
    console.warn(`[Budget Rollover] Budget ${budget._id} hit catchup limit (${MAX_CATCHUP_PERIODS} periods). Will continue in next run.`);
  }

  return { budgetId: budget._id, periodsCreated, reason: "success" };
}

