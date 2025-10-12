/**
 * Budget Lines & Historical Tracking
 * 
 * This module provides functionality for creating historical budget execution records
 * and processing budget period rollovers via cron job.
 * 
 * Key features:
 * - createBudgetLine: Internal mutation to create historical execution snapshots
 * - processBudgetRollover: Cron job handler for automated period rollover processing
 * - Idempotent operations to prevent duplicate budget_lines records
 * - Multi-period catchup for missed cron runs
 * - Graceful handling of soft-deleted budgets
 */

import { internalMutation, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { budgetStatusValidator } from "./validators";
import { calculatePeriodBoundaries, calculateNextDueDate, Frequency } from "./budgetUtils";

// ============================================================================
// CREATE BUDGET LINE INTERNAL MUTATION
// ============================================================================

/**
 * Create a historical budget execution snapshot (internal function, not exposed to clients).
 * 
 * This function is used by:
 * - Budget rollover cron job to capture execution at period boundaries
 * - Backfill utility to create missing historical lines
 * 
 * Features:
 * - Idempotent: checks for existing budget_lines record before creating
 * - Validates period boundaries and budget existence
 * - Stores budget amount as snapshot for historical accuracy
 * - Comprehensive error handling and logging
 * 
 * @param budgetId - Budget to create line for
 * @param periodStart - Start of period (epoch ms, inclusive)
 * @param periodEnd - End of period (epoch ms, inclusive)
 * @param spentAmount - Amount spent/earned in period (minor units)
 * @param remainingAmount - budgetAmount - spentAmount (can be negative)
 * @param percentUsed - (spentAmount / budgetAmount) * 100, capped at 999
 * @param budgetAmount - Budget amount at time of period end (snapshot)
 * @param status - Budget status for the period
 * @returns Budget line ID and creation status
 * @internal This is an internal function used by cron job and utilities
 */
export const createBudgetLine = internalMutation({
  args: {
    budgetId: v.id("budgets"),
    periodStart: v.number(), // Epoch ms
    periodEnd: v.number(), // Epoch ms
    spentAmount: v.number(), // Amount in minor units
    remainingAmount: v.number(), // Can be negative
    percentUsed: v.number(), // 0-999
    budgetAmount: v.number(), // Budget amount at time of period end (snapshot)
    status: budgetStatusValidator, // Extracted validator for reuse
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
      .withIndex("by_budgetId_periodStart", q =>
        q.eq("budgetId", args.budgetId).eq("periodStart", args.periodStart)
      )
      .first();
    
    if (existingLine) {
      // Line already exists, return existing ID
      console.log(`Budget line already exists for budget ${args.budgetId} period ${args.periodStart}`);
      return { budgetLineId: existingLine._id, status: "already_exists" };
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
    
    const result: { budgetLineId: Id<"budget_lines">; status: "success" | "already_exists" } = { budgetLineId, status: "success" };
    return result;
  },
});

// ============================================================================
// PROCESS BUDGET ROLLOVER INTERNAL ACTION (CRON JOB HANDLER)
// ============================================================================

/**
 * Scheduled background job that processes period rollovers for all active budgets.
 * 
 * This cron job runs daily at 00:05 UTC and:
 * - Queries all active budgets (including soft-deleted for final period handling)
 * - Processes budgets in batches of 50 to prevent timeout
 * - Creates budget_lines records for periods that have ended
 * - Updates nextDueDate to next period start
 * - Handles multi-period catchup if cron job missed runs
 * - Gracefully handles soft-deleted budgets (creates final period then stops)
 * 
 * Performance considerations:
 * - Batch processing (50 budgets per batch) prevents timeout
 * - Parallel processing within batches using Promise.allSettled
 * - Idempotency prevents duplicate budget_lines creation
 * - Safety limit of 100 periods per budget per run prevents runaway loops
 * 
 * @internal This is an internal action triggered by cron job
 */
export const processBudgetRollover = internalAction({
  args: {},
  returns: v.object({
    processed: v.number(),
    created: v.number(),
    errors: v.number(),
    duration: v.number(),
  }),
  handler: async (ctx) => {
    const startTime = Date.now();
    let processed = 0;
    let created = 0;
    let errors = 0;
    
    console.log(`[Budget Rollover] Job started at ${new Date(startTime).toISOString()}`);
    
    try {
      // 1. Query all budgets (not filtered by softdelete to support soft-delete logic)
      const budgets = await ctx.runQuery(internal.ledger.budgets.listActiveBudgets);
      console.log(`[Budget Rollover] Found ${budgets.length} budgets`);
      
      // 2. Process budgets in batches of 50 to prevent timeout
      const BATCH_SIZE = 50;
      for (let i = 0; i < budgets.length; i += BATCH_SIZE) {
        const batch = budgets.slice(i, i + BATCH_SIZE);
        
        // Process batch in parallel
        const results = await Promise.allSettled(
          batch.map((budget: any) => processSingleBudget(ctx, budget))
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
      
      return { processed, created, errors, duration };
    } catch (error) {
      console.error(`[Budget Rollover] Job failed: ${error}`);
      // Don't throw - allow job to complete even if partially failed
      const duration = Date.now() - startTime;
      return { processed, created, errors, duration };
    }
  },
});

/**
 * Process a single budget for period rollover.
 * 
 * Handles:
 * - Multi-period catchup if cron job missed runs
 * - Soft-deleted budgets (creates final period if due, then stops)
 * - Expired budgets (skips processing)
 * - Idempotent budget_lines creation
 * - Safety limits to prevent runaway loops
 * 
 * @param ctx - Convex action context
 * @param budget - Budget to process
 * @returns Processing result with periods created count
 */
async function processSingleBudget(
  ctx: any,
  budget: {
    _id: Id<"budgets">;
    userId: Id<"users">;
    accountId?: Id<"accounts">;
    amount: number;
    frequency: Frequency;
    nextDueDate: number;
    endDate?: number;
    creationTime: number;
    softdelete: boolean;
    deletedAt?: number;
    scopeType: "singleAccount" | "multipleAccounts" | "accountType";
    scopeRefs?: Id<"accounts">[];
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
      // Create final period, then skip
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