import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

/**
 * Diagnostic query to investigate why a card didn't get statements
 */
export const diagnoseCardStatements = internalQuery({
  args: {
    accountId: v.id("accounts"),
    year: v.optional(v.number()),
    month: v.optional(v.number()), // 0-11 (0 = January)
  },
  returns: v.object({
    card: v.union(
      v.object({
        _id: v.id("cards"),
        accountId: v.id("accounts"),
        userId: v.id("users"),
        closingDay: v.number(),
        dueDate: v.number(),
        baseCurrency: v.union(v.string(), v.null()),
        createdAt: v.union(v.number(), v.null()),
        softdelete: v.boolean(),
        hasRequiredFields: v.boolean(),
        wouldBeIncluded: v.boolean(),
      }),
      v.null()
    ),
    existingStatements: v.array(
      v.object({
        _id: v.id("card_statements"),
        closingDate: v.number(),
        periodStart: v.number(),
        periodEnd: v.number(),
        totalAmount: v.number(),
        status: v.string(),
      })
    ),
    expectedClosingDate: v.union(v.number(), v.null()),
    hasStatementForExpectedDate: v.boolean(),
    issues: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const issues: string[] = [];
    
    // 1. Get card
    const card = await ctx.db
      .query("cards")
      .withIndex("by_accountId", (q) => q.eq("accountId", args.accountId))
      .first();

    if (!card) {
      return {
        card: null,
        existingStatements: [],
        expectedClosingDate: null,
        hasStatementForExpectedDate: false,
        issues: [`Card not found for accountId: ${args.accountId}`],
      };
    }

    // 2. Check card metadata
    const hasRequiredFields = !!(card.baseCurrency && card.createdAt);
    const wouldBeIncluded = !card.softdelete && hasRequiredFields;

    if (card.softdelete) {
      issues.push("Card is soft-deleted");
    }
    if (!card.baseCurrency) {
      issues.push("Card missing baseCurrency field");
    }
    if (!card.createdAt) {
      issues.push("Card missing createdAt field");
    }

    // 3. Get existing statements
    const statements = await ctx.db
      .query("card_statements")
      .withIndex("by_accountId_closingDate", (q) => q.eq("accountId", args.accountId))
      .collect();

    // 4. Calculate expected closing date for specified month/year
    let expectedClosingDate: number | null = null;
    let hasStatementForExpectedDate = false;

    if (args.year !== undefined && args.month !== undefined && card.closingDay) {
      const year = args.year;
      const month = args.month; // 0-11
      
      // Get last day of month
      const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const actualDay = Math.min(card.closingDay, lastDay);
      
      expectedClosingDate = Date.UTC(year, month, actualDay, 0, 0, 0, 0);
      
      // Check if statement exists for this date
      hasStatementForExpectedDate = statements.some(
        (s) => Math.abs(s.closingDate - expectedClosingDate!) < 24 * 60 * 60 * 1000 // Within 1 day
      );

      if (!hasStatementForExpectedDate) {
        issues.push(
          `Missing statement for ${new Date(expectedClosingDate).toISOString().split("T")[0]} (closing day ${card.closingDay})`
        );
      }
    }

    // 5. Check if card would be included in daily job
    if (wouldBeIncluded) {
      const todayDay = new Date().getUTCDate();
      if (card.closingDay !== todayDay) {
        issues.push(
          `Card closing day (${card.closingDay}) doesn't match today (${todayDay}) - won't be processed by daily job today`
        );
      }
    }

    return {
      card: {
        _id: card._id,
        accountId: card.accountId,
        userId: card.userId,
        closingDay: card.closingDay,
        dueDate: card.dueDate,
        baseCurrency: card.baseCurrency ?? null,
        createdAt: card.createdAt ?? null,
        softdelete: card.softdelete,
        hasRequiredFields,
        wouldBeIncluded,
      },
      existingStatements: statements
        .sort((a, b) => b.closingDate - a.closingDate)
        .map((s) => ({
          _id: s._id,
          closingDate: s.closingDate,
          periodStart: s.periodStart,
          periodEnd: s.periodEnd,
          totalAmount: s.totalAmount,
          status: s.status,
        })),
      expectedClosingDate,
      hasStatementForExpectedDate,
      issues,
    };
  },
});

