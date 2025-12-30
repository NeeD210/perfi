/**
 * Home Dashboard Queries (Ledger-First)
 *
 * This module provides optimized queries for the Home dashboard page.
 * All queries read from ledger tables exclusively (no legacy table reads).
 *
 * Performance Targets:
 * - getHomeDashboard: < 1 second for users with 1000+ transactions
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { Doc, Id } from "../_generated/dataModel";

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get the start of a month (1st day 00:00:00 UTC) for a given timestamp
 */
function getMonthStart(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0);
}

/**
 * Get the end of a month (last day 23:59:59.999 UTC) for a given timestamp
 */
function getMonthEnd(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    0,
    23,
    59,
    59,
    999
  );
}

/**
 * Get the start of the previous month
 */
function getPreviousMonthStart(timestamp: number): number {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1, 0, 0, 0, 0);
}

/**
 * Get user by Auth0 ID with proper error handling
 */
async function getUserByAuth0Id(
  ctx: any,
  auth0Id: string
): Promise<Doc<"users">> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_auth0Id", (q: any) => q.eq("auth0Id", auth0Id))
    .first();

  if (!user) {
    throw new ConvexError({
      code: "USER_NOT_FOUND",
      message: "User not found",
    });
  }

  return user;
}

// ============================================================================
// GET HOME DASHBOARD (SINGLE QUERY FOR ALL DASHBOARD DATA)
// ============================================================================

/**
 * Single query returning all data needed for Home page to minimize round trips.
 *
 * Returns:
 * - Net balance (assets - liabilities) with trend
 * - Month summary (income vs expenses)
 * - Top 5 spending categories
 * - Upcoming 5 obligations (planned entries, card statements, recurring)
 */
export const getHomeDashboard = query({
  args: {},
  returns: v.object({
    netBalance: v.object({
      current: v.number(),
      trend: v.union(v.literal("up"), v.literal("down"), v.literal("stable")),
      changePercent: v.number(),
    }),
    monthSummary: v.object({
      month: v.number(),
      totalIncome: v.number(),
      totalExpenses: v.number(),
      netChange: v.number(),
    }),
    topCategories: v.array(
      v.object({
        accountId: v.id("accounts"),
        name: v.string(),
        amount: v.number(),
        percentOfTotal: v.number(),
        color: v.optional(v.string()),
      })
    ),
    upcomingObligations: v.array(
      v.object({
        id: v.string(),
        type: v.union(
          v.literal("installment"),
          v.literal("recurring"),
          v.literal("card_statement")
        ),
        date: v.number(),
        description: v.string(),
        amount: v.number(),
        accountName: v.optional(v.string()),
      })
    ),
    lastUpdated: v.number(),
  }),
  handler: async (ctx) => {
    // 1. Authenticate user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Not authenticated",
      });
    }

    const user = await getUserByAuth0Id(ctx, identity.subject);
    const now = Date.now();
    const currentMonthStart = getMonthStart(now);
    const previousMonthStart = getPreviousMonthStart(now);

    // 2. Calculate net balance from all asset and liability accounts
    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .filter((q: any) => q.eq(q.field("softdelete"), false))
      .collect();

    let totalAssets = 0;
    let totalLiabilities = 0;
    let previousAssets = 0;
    let previousLiabilities = 0;

    // Get current month rollups for net balance calculation
    const currentRollups = await ctx.db
      .query("monthly_rollups")
      .withIndex("by_user_month", (q: any) =>
        q.eq("userId", user._id).eq("month", currentMonthStart)
      )
      .collect();

    // Get previous month rollups for trend calculation
    const previousRollups = await ctx.db
      .query("monthly_rollups")
      .withIndex("by_user_month", (q: any) =>
        q.eq("userId", user._id).eq("month", previousMonthStart)
      )
      .collect();

    // Calculate balances from rollups
    const accountMap = new Map(accounts.map((a) => [a._id.toString(), a]));

    for (const rollup of currentRollups) {
      const account = accountMap.get(rollup.accountId.toString());
      if (!account) continue;

      if (account.accountType === "asset") {
        // Asset accounts: netAmount = credits - debits, so for positive balances netAmount is negative
        // We need to invert: asset balance = debits - credits = -netAmount
        totalAssets += -rollup.netAmount;
      } else if (account.accountType === "liability") {
        totalLiabilities += Math.abs(rollup.netAmount);
      }
    }

    for (const rollup of previousRollups) {
      const account = accountMap.get(rollup.accountId.toString());
      if (!account) continue;

      if (account.accountType === "asset") {
        // Asset accounts: netAmount = credits - debits, so for positive balances netAmount is negative
        // We need to invert: asset balance = debits - credits = -netAmount
        previousAssets += -rollup.netAmount;
      } else if (account.accountType === "liability") {
        previousLiabilities += Math.abs(rollup.netAmount);
      }
    }

    const currentNetBalance = totalAssets - totalLiabilities;
    const previousNetBalance = previousAssets - previousLiabilities;
    const balanceChange = currentNetBalance - previousNetBalance;
    const changePercent =
      previousNetBalance !== 0
        ? (balanceChange / Math.abs(previousNetBalance)) * 100
        : 0;

    let trend: "up" | "down" | "stable" = "stable";
    if (balanceChange > 0) trend = "up";
    else if (balanceChange < 0) trend = "down";

    // 3. Calculate month summary from rollups
    let totalIncome = 0;
    let totalExpenses = 0;

    for (const rollup of currentRollups) {
      const account = accountMap.get(rollup.accountId.toString());
      if (!account) continue;

      if (account.accountType === "income") {
        totalIncome += Math.abs(rollup.totalCredits);
      } else if (account.accountType === "expense") {
        totalExpenses += rollup.totalDebits;
      }
    }

    // 4. Get top 5 spending categories
    const categoryColors = [
      "#FF6384",
      "#36A2EB",
      "#FFCE56",
      "#4BC0C0",
      "#9966FF",
    ];

    const expenseAccounts = accounts.filter((a) => a.accountType === "expense");
    const categorySpending: Array<{
      accountId: Id<"accounts">;
      name: string;
      amount: number;
      percentOfTotal: number;
      color?: string;
    }> = [];

    for (const account of expenseAccounts) {
      const rollup = currentRollups.find(
        (r) => r.accountId.toString() === account._id.toString()
      );
      if (rollup && rollup.totalDebits > 0) {
        categorySpending.push({
          accountId: account._id,
          name: account.description,
          amount: rollup.totalDebits,
          percentOfTotal: 0,
        });
      }
    }

    // Sort by amount and take top 5
    categorySpending.sort((a, b) => b.amount - a.amount);
    const top5 = categorySpending.slice(0, 5);

    // Calculate percentages and assign colors
    const totalCategorySpending = top5.reduce((sum, c) => sum + c.amount, 0);
    top5.forEach((cat, index) => {
      cat.percentOfTotal =
        totalCategorySpending > 0
          ? (cat.amount / totalCategorySpending) * 100
          : 0;
      cat.color = categoryColors[index];
    });

    // 5. Get upcoming obligations (next 30 days)
    const thirtyDaysFromNow = now + 30 * 24 * 60 * 60 * 1000;
    const upcomingObligations: Array<{
      id: string;
      type: "installment" | "recurring" | "card_statement";
      date: number;
      description: string;
      amount: number;
      accountName?: string;
    }> = [];

    // Get planned journal entries (installments)
    const plannedEntries = await ctx.db
      .query("journal_entries")
      .withIndex("by_user_status_date", (q: any) =>
        q.eq("userId", user._id).eq("status", "planned")
      )
      .filter((q: any) =>
        q.and(
          q.gte(q.field("date"), now),
          q.lte(q.field("date"), thirtyDaysFromNow)
        )
      )
      .take(10);

    for (const entry of plannedEntries) {
      // Get the expense line to find amount
      const lines = await ctx.db
        .query("journal_lines")
        .withIndex("by_entryId", (q: any) => q.eq("journalEntryId", entry._id))
        .collect();

      const expenseLine = lines.find((l) => l.direction === "debit");
      if (expenseLine) {
        // For installments, get the parent entry's description if available
        let description = entry.description;
        if (entry.parentEntryId) {
          const parentEntry = await ctx.db.get(entry.parentEntryId);
          if (parentEntry) {
            // Use parent description, optionally append installment info
            description = parentEntry.description;
            if (entry.installmentNumber && entry.totalInstallments) {
              description = `${description} (${entry.installmentNumber}/${entry.totalInstallments})`;
            }
          }
        }

        upcomingObligations.push({
          id: entry._id,
          type: "installment",
          date: entry.date,
          description,
          amount: expenseLine.amountBaseCurrency,
        });
      }
    }

    // Get pending card statements using user_status index, then filter by dueDate range
    // Include statements due in the next 30 days OR in the past 7 days (to catch recently past-due)
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const pendingStatements = await ctx.db
      .query("card_statements")
      .withIndex("by_user_status", (q: any) =>
        q.eq("userId", user._id).eq("status", "pending")
      )
      .filter((q: any) =>
        q.and(
          q.gte(q.field("dueDate"), sevenDaysAgo),
          q.lte(q.field("dueDate"), thirtyDaysFromNow)
        )
      )
      .take(10);

    for (const statement of pendingStatements) {
      const cardAccount = await ctx.db.get(statement.accountId);
      upcomingObligations.push({
        id: statement._id,
        type: "card_statement",
        date: statement.dueDate,
        description: `Card Statement - ${cardAccount?.description ?? "Unknown Card"}`,
        amount: statement.totalAmount,
        accountName: cardAccount?.description,
      });
    }

    // Get active recurring entries
    const recurringEntries = await ctx.db
      .query("recurring_entries")
      .withIndex("by_user_status_nextDueDate", (q: any) =>
        q.eq("userId", user._id).eq("status", "active")
      )
      .filter((q: any) =>
        q.and(
          q.gte(q.field("nextDueDate"), now),
          q.lte(q.field("nextDueDate"), thirtyDaysFromNow)
        )
      )
      .take(10);

    for (const recurring of recurringEntries) {
      // Get recurring lines to calculate amount
      const lines = await ctx.db
        .query("recurring_lines")
        .withIndex("by_recurringId", (q: any) =>
          q.eq("recurringId", recurring._id)
        )
        .filter((q: any) => q.eq(q.field("softdelete"), false))
        .collect();

      const totalAmount = lines.reduce((sum, l) => sum + Math.abs(l.amount), 0);

      upcomingObligations.push({
        id: `recurring_${recurring._id}`,
        type: "recurring",
        date: recurring.nextDueDate,
        description: recurring.description,
        amount: totalAmount / 2, // Divide by 2 since double-entry has both debit and credit
      });
    }

    // Sort by date and take top 5
    upcomingObligations.sort((a, b) => a.date - b.date);
    const top5Obligations = upcomingObligations.slice(0, 5);

    return {
      netBalance: {
        current: currentNetBalance,
        trend,
        changePercent: Math.round(changePercent * 100) / 100,
      },
      monthSummary: {
        month: currentMonthStart,
        totalIncome,
        totalExpenses,
        netChange: totalIncome - totalExpenses,
      },
      topCategories: top5,
      upcomingObligations: top5Obligations,
      lastUpdated: now,
    };
  },
});

// ============================================================================
// GET TOP CATEGORIES (STANDALONE)
// ============================================================================

/**
 * Standalone query for category breakdown (can be used independently of dashboard).
 */
export const getTopCategories = query({
  args: {
    month: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      accountId: v.id("accounts"),
      name: v.string(),
      amount: v.number(),
      percentOfTotal: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    // 1. Authenticate user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Not authenticated",
      });
    }

    const user = await getUserByAuth0Id(ctx, identity.subject);
    const month = args.month ?? getMonthStart(Date.now());
    const limit = args.limit ?? 5;

    // 2. Get rollups for expense accounts
    const rollups = await ctx.db
      .query("monthly_rollups")
      .withIndex("by_user_month", (q: any) =>
        q.eq("userId", user._id).eq("month", month)
      )
      .collect();

    // 3. Filter and calculate
    const categories: Array<{
      accountId: Id<"accounts">;
      name: string;
      amount: number;
      percentOfTotal: number;
    }> = [];

    let totalExpenses = 0;

    for (const rollup of rollups) {
      const account = await ctx.db.get(rollup.accountId);
      if (!account || account.softdelete || account.accountType !== "expense") {
        continue;
      }

      if (rollup.totalDebits > 0) {
        categories.push({
          accountId: rollup.accountId,
          name: account.description,
          amount: rollup.totalDebits,
          percentOfTotal: 0,
        });
        totalExpenses += rollup.totalDebits;
      }
    }

    // Calculate percentages
    categories.forEach((cat) => {
      cat.percentOfTotal =
        totalExpenses > 0 ? (cat.amount / totalExpenses) * 100 : 0;
    });

    // Sort and limit
    categories.sort((a, b) => b.amount - a.amount);
    return categories.slice(0, limit);
  },
});

// ============================================================================
// GET UPCOMING OBLIGATIONS (STANDALONE)
// ============================================================================

/**
 * Mixed feed of upcoming payments and due items.
 */
export const getUpcomingObligations = query({
  args: {
    days: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      id: v.string(),
      type: v.union(
        v.literal("installment"),
        v.literal("recurring"),
        v.literal("card_statement")
      ),
      date: v.number(),
      description: v.string(),
      amount: v.number(),
      accountName: v.optional(v.string()),
      sourceId: v.optional(v.string()),
    })
  ),
  handler: async (ctx, args) => {
    // 1. Authenticate user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Not authenticated",
      });
    }

    const user = await getUserByAuth0Id(ctx, identity.subject);
    const days = args.days ?? 30;
    const limit = args.limit ?? 5;
    const now = Date.now();
    const windowEnd = now + days * 24 * 60 * 60 * 1000;

    const obligations: Array<{
      id: string;
      type: "installment" | "recurring" | "card_statement";
      date: number;
      description: string;
      amount: number;
      accountName?: string;
      sourceId?: string;
    }> = [];

    // Get planned journal entries
    const plannedEntries = await ctx.db
      .query("journal_entries")
      .withIndex("by_user_status_date", (q: any) =>
        q.eq("userId", user._id).eq("status", "planned")
      )
      .filter((q: any) =>
        q.and(q.gte(q.field("date"), now), q.lte(q.field("date"), windowEnd))
      )
      .take(20);

    for (const entry of plannedEntries) {
      const lines = await ctx.db
        .query("journal_lines")
        .withIndex("by_entryId", (q: any) => q.eq("journalEntryId", entry._id))
        .collect();

      const expenseLine = lines.find((l) => l.direction === "debit");
      if (expenseLine) {
        obligations.push({
          id: entry._id,
          type: "installment",
          date: entry.date,
          description: entry.description,
          amount: expenseLine.amountBaseCurrency,
          sourceId: entry._id,
        });
      }
    }

    // Get pending card statements using user_status index, then filter by dueDate range
    // Include statements due in the past 7 days (recently past-due) to catch up on missed statements
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const pendingStatements = await ctx.db
      .query("card_statements")
      .withIndex("by_user_status", (q: any) =>
        q.eq("userId", user._id).eq("status", "pending")
      )
      .filter((q: any) =>
        q.and(
          q.gte(q.field("dueDate"), sevenDaysAgo),
          q.lte(q.field("dueDate"), windowEnd)
        )
      )
      .take(10);

    for (const statement of pendingStatements) {
      const cardAccount = await ctx.db.get(statement.accountId);
      obligations.push({
        id: statement._id,
        type: "card_statement",
        date: statement.dueDate,
        description: `Card Statement - ${cardAccount?.description ?? "Unknown"}`,
        amount: statement.totalAmount,
        accountName: cardAccount?.description,
        sourceId: statement._id,
      });
    }

    // Get recurring entries
    const recurringEntries = await ctx.db
      .query("recurring_entries")
      .withIndex("by_user_status_nextDueDate", (q: any) =>
        q.eq("userId", user._id).eq("status", "active")
      )
      .filter((q: any) =>
        q.and(
          q.gte(q.field("nextDueDate"), now),
          q.lte(q.field("nextDueDate"), windowEnd)
        )
      )
      .take(20);

    for (const recurring of recurringEntries) {
      const lines = await ctx.db
        .query("recurring_lines")
        .withIndex("by_recurringId", (q: any) =>
          q.eq("recurringId", recurring._id)
        )
        .filter((q: any) => q.eq(q.field("softdelete"), false))
        .collect();

      const totalAmount = lines.reduce((sum, l) => sum + Math.abs(l.amount), 0);

      obligations.push({
        id: `recurring_${recurring._id}`,
        type: "recurring",
        date: recurring.nextDueDate,
        description: recurring.description,
        amount: totalAmount / 2,
        sourceId: recurring._id.toString(),
      });
    }

    // Sort by date and limit
    obligations.sort((a, b) => a.date - b.date);
    return obligations.slice(0, limit);
  },
});

// ============================================================================
// GET NET BALANCE (STANDALONE)
// ============================================================================

/**
 * Calculate net balance from all asset and liability accounts.
 */
export const getNetBalance = query({
  args: {},
  returns: v.object({
    current: v.number(),
    trend: v.union(v.literal("up"), v.literal("down"), v.literal("stable")),
    changePercent: v.number(),
  }),
  handler: async (ctx) => {
    // 1. Authenticate user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Not authenticated",
      });
    }

    const user = await getUserByAuth0Id(ctx, identity.subject);
    const now = Date.now();
    const currentMonthStart = getMonthStart(now);
    const previousMonthStart = getPreviousMonthStart(now);

    // Get accounts
    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q: any) => q.eq("userId", user._id))
      .filter((q: any) => q.eq(q.field("softdelete"), false))
      .collect();

    const accountMap = new Map(accounts.map((a) => [a._id.toString(), a]));

    // Get current month rollups
    const currentRollups = await ctx.db
      .query("monthly_rollups")
      .withIndex("by_user_month", (q: any) =>
        q.eq("userId", user._id).eq("month", currentMonthStart)
      )
      .collect();

    // Get previous month rollups
    const previousRollups = await ctx.db
      .query("monthly_rollups")
      .withIndex("by_user_month", (q: any) =>
        q.eq("userId", user._id).eq("month", previousMonthStart)
      )
      .collect();

    let totalAssets = 0;
    let totalLiabilities = 0;
    let previousAssets = 0;
    let previousLiabilities = 0;

    for (const rollup of currentRollups) {
      const account = accountMap.get(rollup.accountId.toString());
      if (!account) continue;

      if (account.accountType === "asset") {
        // Asset accounts: netAmount = credits - debits, so for positive balances netAmount is negative
        // We need to invert: asset balance = debits - credits = -netAmount
        totalAssets += -rollup.netAmount;
      } else if (account.accountType === "liability") {
        totalLiabilities += Math.abs(rollup.netAmount);
      }
    }

    for (const rollup of previousRollups) {
      const account = accountMap.get(rollup.accountId.toString());
      if (!account) continue;

      if (account.accountType === "asset") {
        // Asset accounts: netAmount = credits - debits, so for positive balances netAmount is negative
        // We need to invert: asset balance = debits - credits = -netAmount
        previousAssets += -rollup.netAmount;
      } else if (account.accountType === "liability") {
        previousLiabilities += Math.abs(rollup.netAmount);
      }
    }

    const currentNetBalance = totalAssets - totalLiabilities;
    const previousNetBalance = previousAssets - previousLiabilities;
    const balanceChange = currentNetBalance - previousNetBalance;
    const changePercent =
      previousNetBalance !== 0
        ? (balanceChange / Math.abs(previousNetBalance)) * 100
        : 0;

    let trend: "up" | "down" | "stable" = "stable";
    if (balanceChange > 0) trend = "up";
    else if (balanceChange < 0) trend = "down";

    return {
      current: currentNetBalance,
      trend,
      changePercent: Math.round(changePercent * 100) / 100,
    };
  },
});

