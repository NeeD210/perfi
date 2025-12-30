import { internalAction, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

// List cards with required fields for backfilling
export const listCardsForBackfill = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    accountId: v.optional(v.id("accounts")),
  },
  returns: v.array(v.object({
    _id: v.id("cards"),
    accountId: v.id("accounts"),
    userId: v.id("users"),
    closingDay: v.number(),
    dueDate: v.number(),
    baseCurrency: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    softdelete: v.boolean(),
    _creationTime: v.number(), // System field
  })),
  handler: async (ctx, args) => {
    let cards;
    if (args.userId) {
      cards = await ctx.db
        .query("cards")
        .withIndex("by_user", (iq) => iq.eq("userId", args.userId!))
        .collect();
    } else {
      cards = await ctx.db.query("cards").collect();
    }
    return cards.filter((c) => !c.softdelete && (!args.accountId || c.accountId === args.accountId));
  },
});

function getStartOfDayUTC(ts: number): number {
  const d = new Date(ts);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function getMonthStartUTC(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0);
}

function getMonthEndDayUTC(year: number, monthIndex: number): number {
  // monthIndex is 0-11; new Date(year, month+1, 0) yields last day of month in local time
  // Use UTC-aware: create date at UTC and get day
  const last = new Date(Date.UTC(year, monthIndex + 1, 0, 0, 0, 0, 0));
  return last.getUTCDate();
}

// Generate closing dates (UTC day start) between [rangeStart, rangeEnd] inclusive
function generateClosingDates(closingDay: number, rangeStart: number, rangeEnd: number): number[] {
  const dates: number[] = [];
  const start = new Date(getStartOfDayUTC(rangeStart));
  const end = new Date(getStartOfDayUTC(rangeEnd));

  // Normalize to first day of start month
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth();

  while (year < end.getUTCFullYear() || (year === end.getUTCFullYear() && month <= end.getUTCMonth())) {
    const lastDay = getMonthEndDayUTC(year, month);
    const day = Math.min(closingDay, lastDay);
    const closingDate = Date.UTC(year, month, day, 0, 0, 0, 0);
    if (closingDate >= getStartOfDayUTC(rangeStart) && closingDate <= getStartOfDayUTC(rangeEnd)) {
      dates.push(closingDate);
    }
    // increment month
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  return dates;
}

export const backfillCardStatementsForUser = internalAction({
  args: {
    userId: v.id("users"),
    startDate: v.optional(v.number()), // epoch ms (default: earliest card.createdAt)
    endDate: v.optional(v.number()),   // epoch ms (default: now)
    cardAccountId: v.optional(v.id("accounts")),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    processedCards: v.number(),
    attemptedStatements: v.number(),
    successful: v.number(),
    skipped: v.number(),
    errors: v.number(),
    durationMs: v.number(),
  }),
  handler: async (ctx, args) => {
    const startTime = Date.now();
    let processedCards = 0;
    let attemptedStatements = 0;
    let successful = 0;
    let skipped = 0;
    let errors = 0;

    try {
      const cards = await ctx.runQuery(internal.migrations.cardStatementsBackfill.listCardsForBackfill, {
        userId: args.userId,
        accountId: args.cardAccountId,
      });

      for (const card of cards) {
        // Determine range per card
        const cardStart = args.startDate ?? (card.createdAt ?? Date.now());
        const cardEnd = args.endDate ?? Date.now();
        const dates = generateClosingDates(card.closingDay, cardStart, cardEnd);

        processedCards++;

        for (const closingDate of dates) {
          attemptedStatements++;
          try {
            if (args.dryRun) {
              skipped++;
              continue;
            }
            await ctx.runMutation(internal.ledger.cardStatements.calculateStatement, {
              cardAccountId: card.accountId as Id<"accounts">,
              closingDate,
            });
            successful++;
          } catch (err) {
            // Idempotency means existing statements will throw from within calc only on validation issues; count as skipped if duplicate
            errors++;
          }
        }
      }

      return {
        processedCards,
        attemptedStatements,
        successful,
        skipped,
        errors,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        processedCards,
        attemptedStatements,
        successful,
        skipped,
        errors: errors + 1,
        durationMs: Date.now() - startTime,
      };
    }
  },
});

export const backfillAllCardStatements = internalAction({
  args: {
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    totalCards: v.number(),
    attemptedStatements: v.number(),
    successful: v.number(),
    skipped: v.number(),
    errors: v.number(),
    durationMs: v.number(),
  }),
  handler: async (ctx, args) => {
    const startTime = Date.now();
    let totalCards = 0;
    let attemptedStatements = 0;
    let successful = 0;
    let skipped = 0;
    let errors = 0;

    try {
      const cards = await ctx.runQuery(internal.migrations.cardStatementsBackfill.listCardsForBackfill, {});

      for (const card of cards) {
        totalCards++;
        const cardStart = args.startDate ?? (card.createdAt ?? Date.now());
        const cardEnd = args.endDate ?? Date.now();
        const dates = generateClosingDates(card.closingDay, cardStart, cardEnd);

        for (const closingDate of dates) {
          attemptedStatements++;
          try {
            if (args.dryRun) {
              skipped++;
              continue;
            }
            await ctx.runMutation(internal.ledger.cardStatements.calculateStatement, {
              cardAccountId: card.accountId as Id<"accounts">,
              closingDate,
            });
            successful++;
          } catch (_err) {
            errors++;
          }
        }
      }

    } finally {
      return {
        totalCards,
        attemptedStatements,
        successful,
        skipped,
        errors,
        durationMs: Date.now() - startTime,
      };
    }
  },
});

/**
 * Backfill statements for all cards with closingDay = 31
 */
export const backfillCardStatementsForClosingDay31 = internalAction({
  args: {
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    totalCards: v.number(),
    attemptedStatements: v.number(),
    successful: v.number(),
    skipped: v.number(),
    errors: v.number(),
    durationMs: v.number(),
  }),
  handler: async (ctx, args) => {
    const startTime = Date.now();
    let totalCards = 0;
    let attemptedStatements = 0;
    let successful = 0;
    let skipped = 0;
    let errors = 0;

    try {
      const cards = await ctx.runQuery(internal.migrations.cardStatementsBackfill.listCardsForBackfill, {});
      
      // Filter cards with closingDay = 31
      const cardsWithClosingDay31 = cards.filter((c) => c.closingDay === 31);

      for (const card of cardsWithClosingDay31) {
        totalCards++;
        const cardStart = args.startDate ?? (card.createdAt ?? Date.now());
        const cardEnd = args.endDate ?? Date.now();
        const dates = generateClosingDates(card.closingDay, cardStart, cardEnd);

        for (const closingDate of dates) {
          attemptedStatements++;
          try {
            if (args.dryRun) {
              skipped++;
              continue;
            }
            await ctx.runMutation(internal.ledger.cardStatements.calculateStatement, {
              cardAccountId: card.accountId as Id<"accounts">,
              closingDate,
            });
            successful++;
          } catch (_err) {
            errors++;
          }
        }
      }

      return {
        totalCards,
        attemptedStatements,
        successful,
        skipped,
        errors,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        totalCards,
        attemptedStatements,
        successful,
        skipped,
        errors: errors + 1,
        durationMs: Date.now() - startTime,
      };
    }
  },
});

/**
 * Backfill statement for a specific account and month
 */
export const backfillStatementForAccount = internalAction({
  args: {
    accountId: v.id("accounts"),
    year: v.number(),
    month: v.number(), // 0-11 (0 = January, 11 = December)
  },
  returns: v.object({
    success: v.boolean(),
    statementId: v.optional(v.id("card_statements")),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<{
    success: boolean;
    statementId?: Id<"card_statements">;
    error?: string;
  }> => {
    try {
      // 1. Get card
      const cards = await ctx.runQuery(internal.migrations.cardStatementsBackfill.listCardsForBackfill, {
        accountId: args.accountId,
      });

      if (cards.length === 0) {
        return {
          success: false,
          error: `Card not found for accountId: ${args.accountId}`,
        };
      }

      const card = cards[0];

      // 2. Validate card has required fields
      if (!card.baseCurrency || !card.createdAt) {
        return {
          success: false,
          error: `Card missing required fields: baseCurrency=${!!card.baseCurrency}, createdAt=${!!card.createdAt}`,
        };
      }

      // 3. Calculate closing date for the specified month
      const lastDay = new Date(Date.UTC(args.year, args.month + 1, 0)).getUTCDate();
      const actualDay = Math.min(card.closingDay, lastDay);
      const closingDate = Date.UTC(args.year, args.month, actualDay, 0, 0, 0, 0);

      // 4. Calculate statement
      const result = await ctx.runMutation(internal.ledger.cardStatements.calculateStatement, {
        cardAccountId: args.accountId,
        closingDate,
      });

      return {
        success: true,
        statementId: result.statementId,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error?.message || String(error),
      };
    }
  },
});
