/**
 * Pre-Aggregation System (Rollups)
 * 
 * This module implements the monthly rollup system for performance optimization.
 * It maintains pre-calculated monthly aggregates of journal line data to ensure
 * fast Home dashboard and budget calculations as transaction volumes grow.
 * 
 * Key Features:
 * - Monthly rollups stored in monthly_rollups table
 * - Background reconciliation job for data consistency
 * - Best-effort synchronous updates on transaction mutations
 * - Graceful degradation to direct calculation when needed
 * - Eventual consistency with drift detection
 */

import { internalMutation, internalQuery, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { Id, Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get the start of a month (1st day 00:00:00 UTC) for a given timestamp
 */
function getMonthStart(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

/**
 * Get the end of a month (last day 23:59:59.999 UTC) for a given timestamp
 */
function getMonthEnd(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
}

/**
 * Get the start of the next month
 */
function getNextMonthStart(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth() + 1, 1).getTime();
}

// ============================================================================
// UPSERT MONTHLY ROLLUP (INTERNAL MUTATION)
// ============================================================================

/**
 * Create or update monthly rollup record (idempotent operation)
 * 
 * This function safely handles duplicate calls with same data, updating only
 * timestamps when values are unchanged.
 * 
 * @param userId - User ID
 * @param accountId - Account ID
 * @param month - Epoch ms of month start
 * @param totalDebits - Sum of debit lines in month (minor units)
 * @param totalCredits - Sum of credit lines in month (minor units)
 * @param netAmount - totalCredits - totalDebits (can be negative)
 * @param transactionCount - Number of journal_lines in month
 * @param updateType - Whether updated by transaction or reconciliation
 * @returns Rollup ID and status information
 */
export const upsertMonthlyRollup = internalMutation({
  args: {
    userId: v.id("users"),
    accountId: v.id("accounts"),
    month: v.number(), // Epoch ms of month start
    totalDebits: v.number(),
    totalCredits: v.number(),
    netAmount: v.number(),
    transactionCount: v.number(),
    updateType: v.union(
      v.literal("transaction"), // Updated by transaction mutation
      v.literal("reconciliation") // Updated by background job
    ),
  },
  returns: v.object({
    rollupId: v.id("monthly_rollups"),
    status: v.union(
      v.literal("created"),
      v.literal("updated"),
      v.literal("already_current")
    ),
    previousValues: v.optional(v.object({
      totalDebits: v.number(),
      totalCredits: v.number(),
      netAmount: v.number(),
      transactionCount: v.number(),
    })),
  }),
  handler: async (ctx, args) => {
    const currentTime = Date.now();
    
    // 1. Check for existing rollup
    const existingRollup = await ctx.db
      .query("monthly_rollups")
      .withIndex("by_user_account_month", q =>
        q.eq("userId", args.userId)
         .eq("accountId", args.accountId)
         .eq("month", args.month)
      )
      .first();
    
    if (existingRollup) {
      // 2. Check if update is needed
      const valuesChanged = 
        existingRollup.totalDebits !== args.totalDebits ||
        existingRollup.totalCredits !== args.totalCredits ||
        existingRollup.netAmount !== args.netAmount ||
        existingRollup.transactionCount !== args.transactionCount;
      
      if (!valuesChanged && args.updateType === "transaction") {
        // Values unchanged, just update lastUpdated timestamp
        await ctx.db.patch(existingRollup._id, { lastUpdated: currentTime });
        return { rollupId: existingRollup._id, status: "already_current" as const };
      }
      
      if (valuesChanged) {
        // 3. Update existing rollup
        const previousValues = {
          totalDebits: existingRollup.totalDebits,
          totalCredits: existingRollup.totalCredits,
          netAmount: existingRollup.netAmount,
          transactionCount: existingRollup.transactionCount,
        };
        
        await ctx.db.patch(existingRollup._id, {
          totalDebits: args.totalDebits,
          totalCredits: args.totalCredits,
          netAmount: args.netAmount,
          transactionCount: args.transactionCount,
          lastUpdated: currentTime,
          lastReconciled: args.updateType === "reconciliation" ? currentTime : existingRollup.lastReconciled,
        });
        
        console.log(`Updated rollup ${existingRollup._id}: ${args.transactionCount} transactions, net: ${args.netAmount}`);
        return { rollupId: existingRollup._id, status: "updated" as const, previousValues };
      }
      
      // If values haven't changed and it's reconciliation, just update timestamp
      await ctx.db.patch(existingRollup._id, { lastUpdated: currentTime });
      return { rollupId: existingRollup._id, status: "already_current" as const };
    } else {
      // 4. Create new rollup
      const rollupId = await ctx.db.insert("monthly_rollups", {
        userId: args.userId,
        accountId: args.accountId,
        month: args.month,
        totalDebits: args.totalDebits,
        totalCredits: args.totalCredits,
        netAmount: args.netAmount,
        transactionCount: args.transactionCount,
        lastUpdated: currentTime,
        lastReconciled: args.updateType === "reconciliation" ? currentTime : 0,
        createdAt: currentTime,
      });
      
      console.log(`Created rollup ${rollupId}: ${args.transactionCount} transactions, net: ${args.netAmount}`);
      return { rollupId, status: "created" as const };
    }
  },
});

// ============================================================================
// CALCULATE MONTHLY ROLLUP (INTERNAL QUERY)
// ============================================================================

/**
 * Calculate monthly rollup data for an account from journal_lines
 * 
 * Used by reconciliation and on-demand updates to compute rollup values
 * directly from source data.
 * 
 * @param userId - User ID
 * @param accountId - Account ID
 * @param month - Epoch ms of month start
 * @returns Rollup data or null if account not found
 */
export const calculateMonthlyRollup = internalQuery({
  args: {
    userId: v.id("users"),
    accountId: v.id("accounts"),
    month: v.number(), // Epoch ms of month start
  },
  returns: v.union(
    v.object({
      totalDebits: v.number(),
      totalCredits: v.number(),
      netAmount: v.number(),
      transactionCount: v.number(),
      monthStart: v.number(),
      monthEnd: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    // 1. Validate account exists and belongs to user
    const account = await ctx.db.get(args.accountId);
    if (!account || account.userId !== args.userId || account.softdelete) {
      return null;
    }
    
    // 2. Calculate month boundaries
    const monthStart = args.month;
    const monthEnd = getMonthEnd(monthStart);
    
    // 3. Query journal_lines for the month
    const lines = await ctx.db
      .query("journal_lines")
      .withIndex("by_accountId_date", q =>
        q.eq("accountId", args.accountId)
         .gte("entryDate", monthStart)
         .lte("entryDate", monthEnd)
      )
      .collect();
    
    // 4. Aggregate data
    let totalDebits = 0;
    let totalCredits = 0;
    
    for (const line of lines) {
      if (line.direction === "debit") {
        totalDebits += line.amountBaseCurrency;
      } else if (line.direction === "credit") {
        totalCredits += line.amountBaseCurrency;
      }
    }
    
    const netAmount = totalCredits - totalDebits;
    const transactionCount = lines.length;
    
    return {
      totalDebits,
      totalCredits,
      netAmount,
      transactionCount,
      monthStart,
      monthEnd,
    };
  },
});

// ============================================================================
// HELPER FUNCTIONS FOR ROLLUP UPDATES
// ============================================================================

/**
 * Group journal lines by account and month for rollup calculation
 */
function groupLinesByAccountMonth(lines: Doc<"journal_lines">[]): Map<string, {
  accountId: Id<"accounts">;
  month: number;
  totalDebits: number;
  totalCredits: number;
  transactionCount: number;
}> {
  const accountMonths = new Map();
  
  for (const line of lines) {
    const month = getMonthStart(line.entryDate);
    const key = `${line.accountId}-${month}`;
    
    if (!accountMonths.has(key)) {
      accountMonths.set(key, {
        accountId: line.accountId,
        month,
        totalDebits: 0,
        totalCredits: 0,
        transactionCount: 0,
      });
    }
    
    const data = accountMonths.get(key);
    if (line.direction === "debit") {
      data.totalDebits += line.amountBaseCurrency;
    } else if (line.direction === "credit") {
      data.totalCredits += line.amountBaseCurrency;
    }
    data.transactionCount++;
  }
  
  return accountMonths;
}

/**
 * Calculate new rollup values based on update type
 */
function calculateNewRollupValues(
  currentRollup: Doc<"monthly_rollups"> | null,
  transactionData: { totalDebits: number; totalCredits: number; transactionCount: number },
  updateType: "create" | "update" | "delete"
): { totalDebits: number; totalCredits: number; transactionCount: number } {
  if (!currentRollup) {
    return transactionData;
  }
  
  switch (updateType) {
    case "create":
      return {
        totalDebits: currentRollup.totalDebits + transactionData.totalDebits,
        totalCredits: currentRollup.totalCredits + transactionData.totalCredits,
        transactionCount: currentRollup.transactionCount + transactionData.transactionCount,
      };
    case "delete":
      return {
        totalDebits: currentRollup.totalDebits - transactionData.totalDebits,
        totalCredits: currentRollup.totalCredits - transactionData.totalCredits,
        transactionCount: currentRollup.transactionCount - transactionData.transactionCount,
      };
    case "update":
      // For updates, recalculate entire month (handled by reconciliation)
      return transactionData;
    default:
      return transactionData;
  }
}

/**
 * Update a single rollup record using the upsertMonthlyRollup function
 */
async function updateSingleRollup(
  ctx: any,
  userId: Id<"users">,
  accountId: Id<"accounts">,
  month: number,
  newValues: { totalDebits: number; totalCredits: number; transactionCount: number }
): Promise<{ status: "success" | "error"; error?: string }> {
  try {
    // Direct upsert logic instead of calling the separate mutation
    const existingRollup = await ctx.db
      .query("monthly_rollups")
      .withIndex("by_user_account_month", (q: any) =>
        q.eq("userId", userId)
         .eq("accountId", accountId)
         .eq("month", month)
      )
      .first();
    
    if (existingRollup) {
      // Update existing rollup
      await ctx.db.patch(existingRollup._id, {
        totalDebits: newValues.totalDebits,
        totalCredits: newValues.totalCredits,
        netAmount: newValues.totalCredits - newValues.totalDebits,
        transactionCount: newValues.transactionCount,
        lastUpdated: Date.now(),
      });
    } else {
      // Create new rollup
      await ctx.db.insert("monthly_rollups", {
        userId,
        accountId,
        month,
        totalDebits: newValues.totalDebits,
        totalCredits: newValues.totalCredits,
        netAmount: newValues.totalCredits - newValues.totalDebits,
        transactionCount: newValues.transactionCount,
        lastUpdated: Date.now(),
        lastReconciled: Date.now(),
        createdAt: Date.now(),
      });
    }
    
    return { status: "success" };
  } catch (error: any) {
    console.error(`[Rollup Update] Failed to update rollup for account ${accountId} month ${month}: ${error}`);
    return { status: "error", error: error.message };
  }
}

// ============================================================================
// UPDATE ROLLUPS ON TRANSACTION (INTERNAL MUTATION)
// ============================================================================

/**
 * Update rollups when transactions are created/modified (best-effort synchronous updates)
 * 
 * This function attempts to update rollups immediately but failures don't block
 * transaction completion (graceful degradation).
 * 
 * @param journalEntryId - Journal entry ID
 * @param updateType - Type of transaction operation
 * @returns Update status and results
 */
export const updateRollupsOnTransaction = internalMutation({
  args: {
    journalEntryId: v.id("journal_entries"),
    updateType: v.union(
      v.literal("create"),
      v.literal("update"),
      v.literal("delete")
    ),
  },
  returns: v.object({
    status: v.union(
      v.literal("completed"),
      v.literal("failed"),
      v.literal("entry_not_found")
    ),
    results: v.optional(v.array(v.object({
      accountId: v.id("accounts"),
      month: v.number(),
      status: v.union(v.literal("success"), v.literal("error")),
      error: v.optional(v.string()),
    }))),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      // 1. Get journal entry and lines
      const entry = await ctx.db.get(args.journalEntryId);
      if (!entry) return { status: "entry_not_found" as const };
      
      const lines = await ctx.db
        .query("journal_lines")
        .withIndex("by_entryId", q => q.eq("journalEntryId", args.journalEntryId))
        .collect();
      
      // 2. Group lines by account and month
      const accountMonths = groupLinesByAccountMonth(lines);
      
      // 3. Update rollups for each account-month combination
      const results = [];
      for (const [key, data] of accountMonths) {
        try {
          // Get current rollup
          const currentRollup = await ctx.db
            .query("monthly_rollups")
            .withIndex("by_user_account_month", q =>
              q.eq("userId", entry.userId)
               .eq("accountId", data.accountId)
               .eq("month", data.month)
            )
            .first();
          
          // Calculate new values
          const newValues = calculateNewRollupValues(currentRollup, data, args.updateType);
          
          // Update rollup using the dedicated function
          const result = await updateSingleRollup(
            ctx,
            entry.userId,
            data.accountId,
            data.month,
            newValues
          );
          
          results.push({ 
            accountId: data.accountId, 
            month: data.month, 
            status: result.status,
            error: result.error
          });
        } catch (error: any) {
          console.error(`[Rollup Update] Failed to update rollup for account ${data.accountId} month ${data.month}: ${error}`);
          results.push({ accountId: data.accountId, month: data.month, status: "error" as const, error: error.message });
        }
      }
      
      return { status: "completed" as const, results };
    } catch (error: any) {
      console.error(`[Rollup Update] Failed to update rollups for entry ${args.journalEntryId}: ${error}`);
      return { status: "failed" as const, error: error.message };
    }
  },
});

// ============================================================================
// RECONCILE MONTHLY ROLLUPS (INTERNAL ACTION - CRON JOB)
// ============================================================================

/**
 * Background job that reconciles all monthly rollups to ensure consistency with journal_lines
 * 
 * This cron job runs daily at 02:00 UTC and:
 * - Processes all active accounts in batches of 100
 * - Calculates rollup data from journal_lines
 * - Detects drift between rollup and direct calculation
 * - Updates rollups with corrected values
 * - Logs reconciliation results and drift detection
 * 
 * @returns Reconciliation summary
 */
export const reconcileMonthlyRollups = internalAction({
  args: {},
  returns: v.object({
    processed: v.number(),
    updated: v.number(),
    created: v.number(),
    errors: v.number(),
    driftDetected: v.number(),
    duration: v.number(),
  }),
  handler: async (ctx) => {
    const startTime = Date.now();
    let processed = 0;
    let updated = 0;
    let created = 0;
    let errors = 0;
    let driftDetected = 0;
    
    console.log(`[Rollup Reconciliation] Job started at ${new Date(startTime).toISOString()}`);
    
    try {
      // 1. Get all active accounts
      const accounts = await ctx.runQuery(internal.ledger.accounts.listActiveAccounts);
      console.log(`[Rollup Reconciliation] Found ${accounts.length} active accounts`);
      
      // 2. Process accounts in batches of 100
      const BATCH_SIZE = 100;
      for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
        const batch = accounts.slice(i, i + BATCH_SIZE);
        
        // Process batch in parallel
        const results = await Promise.allSettled(
          batch.map(account => reconcileAccountRollups(ctx, account))
        );
        
        // Count results
        for (const result of results) {
          processed++;
          if (result.status === "fulfilled") {
            const accountResult = result.value;
            updated += accountResult.updated;
            created += accountResult.created;
            driftDetected += accountResult.driftDetected;
          } else if (result.status === "rejected") {
            errors++;
            console.error(`[Rollup Reconciliation] Error processing account: ${result.reason}`);
          }
        }
      }
      
      const duration = Date.now() - startTime;
      console.log(`[Rollup Reconciliation] Job completed: ${processed} accounts processed, ${updated} updated, ${created} created, ${driftDetected} drift detected, ${errors} errors, ${duration}ms`);
      
      return {
        processed,
        updated,
        created,
        errors,
        driftDetected,
        duration,
      };
    } catch (error) {
      console.error(`[Rollup Reconciliation] Job failed: ${error}`);
      const duration = Date.now() - startTime;
      return {
        processed,
        updated,
        created,
        errors,
        driftDetected,
        duration,
      };
    }
  },
});

/**
 * Helper function to reconcile rollups for a single account
 */
async function reconcileAccountRollups(
  ctx: any, 
  account: { _id: Id<"accounts">; userId: Id<"users">; description: string; accountType: string; softdelete: boolean }
) {
  let updated = 0;
  let created = 0;
  let driftDetected = 0;
  
  // 1. Get last 12 months of rollups for this account
  const twelveMonthsAgo = getMonthStart(Date.now() - (365 * 24 * 60 * 60 * 1000));
  
  const existingRollups = await ctx.db
    .query("monthly_rollups")
    .withIndex("by_account_month", (q: any) =>
      q.eq("accountId", account._id)
       .gte("month", twelveMonthsAgo)
    )
    .collect();
  
  // 2. Create map of existing rollups by month
  const rollupMap = new Map();
  for (const rollup of existingRollups) {
    rollupMap.set(rollup.month, rollup);
  }
  
  // 3. Process each month in the last 12 months
  const currentMonth = getMonthStart(Date.now());
  let workingMonth = twelveMonthsAgo;
  
  while (workingMonth <= currentMonth) {
    // Calculate rollup from journal_lines directly
    const monthStart = workingMonth;
    const monthEnd = getMonthEnd(workingMonth);
    
    const lines = await ctx.db
      .query("journal_lines")
      .withIndex("by_accountId_date", (q: any) =>
        q.eq("accountId", account._id)
         .gte("entryDate", monthStart)
         .lte("entryDate", monthEnd)
      )
      .collect();
    
    const calculatedRollup = {
      totalDebits: lines.reduce((sum: number, line: Doc<"journal_lines">) => sum + (line.direction === "debit" ? line.amountBaseCurrency : 0), 0),
      totalCredits: lines.reduce((sum: number, line: Doc<"journal_lines">) => sum + (line.direction === "credit" ? line.amountBaseCurrency : 0), 0),
      transactionCount: lines.length,
      netAmount: 0, // Will be calculated below
    };
    
    calculatedRollup.netAmount = calculatedRollup.totalCredits - calculatedRollup.totalDebits;
    
    if (calculatedRollup) {
      const existingRollup = rollupMap.get(workingMonth);
      
      if (existingRollup) {
        // Check for drift
        const drift = Math.abs(existingRollup.netAmount - calculatedRollup.netAmount);
        const driftPercent = drift / Math.max(Math.abs(existingRollup.netAmount), 1) * 100;
        
        if (driftPercent > 0.01) { // 0.01% tolerance
          driftDetected++;
          console.warn(`[Rollup Reconciliation] Drift detected for account ${account._id} month ${workingMonth}: ${driftPercent.toFixed(4)}%`);
        }
        
        // Update rollup directly
        await ctx.db.patch(existingRollup._id, {
          totalDebits: calculatedRollup.totalDebits,
          totalCredits: calculatedRollup.totalCredits,
          netAmount: calculatedRollup.netAmount,
          transactionCount: calculatedRollup.transactionCount,
          lastUpdated: Date.now(),
          lastReconciled: Date.now(),
        });
        updated++;
      } else {
        // Create missing rollup directly
        await ctx.db.insert("monthly_rollups", {
          userId: account.userId,
          accountId: account._id,
          month: workingMonth,
          totalDebits: calculatedRollup.totalDebits,
          totalCredits: calculatedRollup.totalCredits,
          netAmount: calculatedRollup.netAmount,
          transactionCount: calculatedRollup.transactionCount,
          lastUpdated: Date.now(),
          lastReconciled: Date.now(),
          createdAt: Date.now(),
        });
        created++;
      }
    }
    
    // Move to next month
    workingMonth = getNextMonthStart(workingMonth);
  }
  
  return { updated, created, driftDetected };
}

// ============================================================================
// HELPER QUERIES FOR RECONCILIATION
// ============================================================================

/**
 * Get rollups for a specific account within a date range
 */
export const getAccountRollups = internalQuery({
  args: {
    accountId: v.id("accounts"),
    startMonth: v.number(),
  },
  returns: v.array(v.object({
    _id: v.id("monthly_rollups"),
    month: v.number(),
    totalDebits: v.number(),
    totalCredits: v.number(),
    netAmount: v.number(),
    transactionCount: v.number(),
    lastUpdated: v.number(),
    lastReconciled: v.number(),
  })),
  handler: async (ctx, args) => {
    const rollups = await ctx.db
      .query("monthly_rollups")
      .withIndex("by_account_month", q =>
        q.eq("accountId", args.accountId)
         .gte("month", args.startMonth)
      )
      .collect();
    
    return rollups.map(rollup => ({
      _id: rollup._id,
      month: rollup.month,
      totalDebits: rollup.totalDebits,
      totalCredits: rollup.totalCredits,
      netAmount: rollup.netAmount,
      transactionCount: rollup.transactionCount,
      lastUpdated: rollup.lastUpdated,
      lastReconciled: rollup.lastReconciled,
    }));
  },
});

/**
 * Get rollups for a user and month
 */
export const getUserMonthRollups = internalQuery({
  args: {
    userId: v.id("users"),
    month: v.number(),
  },
  returns: v.array(v.object({
    _id: v.id("monthly_rollups"),
    accountId: v.id("accounts"),
    totalDebits: v.number(),
    totalCredits: v.number(),
    netAmount: v.number(),
    transactionCount: v.number(),
    lastUpdated: v.number(),
  })),
  handler: async (ctx, args) => {
    const rollups = await ctx.db
      .query("monthly_rollups")
      .withIndex("by_user_month", q =>
        q.eq("userId", args.userId)
         .eq("month", args.month)
      )
      .collect();
    
    return rollups.map(rollup => ({
      _id: rollup._id,
      accountId: rollup.accountId,
      totalDebits: rollup.totalDebits,
      totalCredits: rollup.totalCredits,
      netAmount: rollup.netAmount,
      transactionCount: rollup.transactionCount,
      lastUpdated: rollup.lastUpdated,
    }));
  },
});

/**
 * Get rollups for budget execution (multiple accounts in a month)
 */
export const getBudgetExecutionRollups = internalQuery({
  args: {
    userId: v.id("users"),
    accountIds: v.array(v.id("accounts")),
    month: v.number(),
  },
  returns: v.array(v.object({
    _id: v.id("monthly_rollups"),
    accountId: v.id("accounts"),
    totalDebits: v.number(),
    totalCredits: v.number(),
    netAmount: v.number(),
    transactionCount: v.number(),
  })),
  handler: async (ctx, args) => {
    const rollups = await ctx.db
      .query("monthly_rollups")
      .withIndex("by_user_month", q =>
        q.eq("userId", args.userId)
         .eq("month", args.month)
      )
      .filter((q: any) => args.accountIds.includes(q.field("accountId")))
      .collect();
    
    return rollups.map(rollup => ({
      _id: rollup._id,
      accountId: rollup.accountId,
      totalDebits: rollup.totalDebits,
      totalCredits: rollup.totalCredits,
      netAmount: rollup.netAmount,
      transactionCount: rollup.transactionCount,
    }));
  },
});
