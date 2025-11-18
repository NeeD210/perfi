/**
 * Card Statements & Settlement System
 * 
 * This module implements automated card statement calculation and settlement posting
 * for PerFi's accounting core. It provides scheduled background jobs that process
 * card statements using accrual accounting principles.
 * 
 * Key Features:
 * - Automated statement calculation on card closing dates
 * - Automated settlement posting on card due dates
 * - Statement summaries stored in dedicated card_statements table
 * - Settlement entries linked to original card transactions via parentEntryId
 * - Idempotent processing with comprehensive error handling
 * - Multi-currency support with closing date exchange rate conversion
 * - Performance optimization using monthly rollups with fallback
 */

import { internalMutation, internalQuery, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { logDualWriteError } from "./errorTracking";

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get the start of a day (00:00:00 UTC) for a given timestamp
 */
function getStartOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Get the start of a month (1st day 00:00:00 UTC) for a given timestamp
 */
function getMonthStart(timestamp: number): number {
  const d = new Date(timestamp);
  // Construct UTC month start to avoid local timezone skew
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0);
}

/**
 * Generate idempotency key for operations
 */
function generateIdempotencyKey(
  operation: string,
  entityId: string,
  date: number
): string {
  return `${operation}-${entityId}-${date}`;
}

/**
 * Convert amount using exchange rate
 */
function convertAmount(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  exchangeRate: number
): number {
  if (fromCurrency === toCurrency) {
    return amount;
  }
  return Math.round(amount * exchangeRate);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get exchange rate for statement closing date (user-modifiable)
 */
export const getClosingDateExchangeRate = internalQuery({
  args: {
    baseCurrency: v.string(),
    closingDate: v.number(),
  },
  returns: v.object({
    rate: v.number(),
    rateId: v.optional(v.id("exchange_rates")),
  }),
  handler: async (ctx, args) => {
    // Same currency, no conversion needed
    if (args.baseCurrency === "ARS") {
      return { rate: 1.0 };
    }

    // Get official exchange rate for closing date
    const currencyPair = `ARS/${args.baseCurrency}`;
    const rate = await ctx.db
      .query("exchange_rates")
      .withIndex("by_pair_date_source", (q) =>
        q.eq("pairCurrency", currencyPair)
         .eq("date", getStartOfDay(args.closingDate))
      )
      .first();

    if (rate) {
      return { rate: rate.rate, rateId: rate._id };
    }

    // Fallback to most recent rate
    const recentRate = await ctx.db
      .query("exchange_rates")
      .withIndex("by_pair_date_source", (q) =>
        q.eq("pairCurrency", currencyPair)
      )
      .order("desc")
      .first();

    if (recentRate) {
      console.warn(`Using recent rate for ${currencyPair} on ${new Date(args.closingDate).toISOString()}`);
      return { rate: recentRate.rate, rateId: recentRate._id };
    }

    // Ultimate fallback
    console.warn(`No exchange rate found for ${currencyPair}, using 1.0`);
    return { rate: 1.0 };
  },
});

// Insert: generalized conversion rate lookup with optional ARS pivot
export const getClosingDateConversionRate = internalQuery({
  args: {
    fromCurrency: v.string(),
    toCurrency: v.string(),
    closingDate: v.number(),
  },
  returns: v.object({
    rate: v.number(),
    rateId: v.optional(v.id("exchange_rates")),
  }),
  handler: async (ctx, args) => {
    if (args.fromCurrency === args.toCurrency) {
      return { rate: 1.0 };
    }

    const day = getStartOfDay(args.closingDate);

    // Try direct pair first
    const directPair = `${args.fromCurrency}/${args.toCurrency}`;
    let direct = await ctx.db
      .query("exchange_rates")
      .withIndex("by_pair_date_source", (q) => q.eq("pairCurrency", directPair).eq("date", day))
      .first();
    if (!direct) {
      direct = await ctx.db
        .query("exchange_rates")
        .withIndex("by_pair_date_source", (q) => q.eq("pairCurrency", directPair))
        .order("desc")
        .first();
    }
    if (direct) {
      return { rate: direct.rate, rateId: direct._id };
    }

    // Pivot via ARS pairs as a fallback
    let r1 = 1.0; // from -> ARS
    let r2 = 1.0; // ARS -> to

    if (args.fromCurrency !== "ARS") {
      const pair1 = `${args.fromCurrency}/ARS`;
      let p1 = await ctx.db
        .query("exchange_rates")
        .withIndex("by_pair_date_source", (q) => q.eq("pairCurrency", pair1).eq("date", day))
        .first();
      if (!p1) {
        p1 = await ctx.db
          .query("exchange_rates")
          .withIndex("by_pair_date_source", (q) => q.eq("pairCurrency", pair1))
          .order("desc")
          .first();
      }
      if (p1) r1 = p1.rate;
    }

    if (args.toCurrency !== "ARS") {
      const pair2 = `ARS/${args.toCurrency}`;
      let p2 = await ctx.db
        .query("exchange_rates")
        .withIndex("by_pair_date_source", (q) => q.eq("pairCurrency", pair2).eq("date", day))
        .first();
      if (!p2) {
        p2 = await ctx.db
          .query("exchange_rates")
          .withIndex("by_pair_date_source", (q) => q.eq("pairCurrency", pair2))
          .order("desc")
          .first();
      }
      if (p2) r2 = p2.rate;
    }

    if (r1 !== 1.0 || r2 !== 1.0) {
      return { rate: r1 * r2 };
    }

    console.warn(`No conversion rate found for ${args.fromCurrency}->${args.toCurrency} on ${new Date(args.closingDate).toISOString()}, using 1.0`);
    return { rate: 1.0 };
  },
});

/**
 * Get user's main asset account for settlement fallback
 */
export const getUserMainAssetAccount = internalQuery({
  args: {
    userId: v.id("users"),
  },
  returns: v.union(
    v.object({
      accountId: v.id("accounts"),
      accountName: v.string(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    // Try to find first active asset account
    const assetAccount = await ctx.db
      .query("accounts")
      .withIndex("by_user_type", (q) => 
        q.eq("userId", args.userId).eq("accountType", "asset")
      )
      .filter((q) => q.eq(q.field("softdelete"), false))
      .first();

    if (assetAccount) {
      return {
        accountId: assetAccount._id,
        accountName: assetAccount.description,
      };
    }

    return null;
  },
});

/**
 * Get cards with closing day = today
 */
export const getCardsWithClosingToday = internalQuery({
  args: {},
  returns: v.array(v.object({
    _id: v.id("cards"),
    accountId: v.id("accounts"),
    userId: v.id("users"),
    closingDay: v.number(),
    dueDate: v.number(),
    baseCurrency: v.string(),
    createdAt: v.number(),
  })),
  handler: async (ctx) => {
    const todayDay = new Date().getUTCDate();

    // Use indexed query for closingDay and filter active cards
    const cards = await ctx.db
      .query("cards")
      .withIndex("by_closingDay", (q) => q.eq("closingDay", todayDay))
      .filter((q) => q.eq(q.field("softdelete"), false))
      .collect();

    return cards
      .filter(card => card.baseCurrency && card.createdAt)
      .map(card => ({
        _id: card._id,
        accountId: card.accountId,
        userId: card.userId,
        closingDay: card.closingDay,
        dueDate: card.dueDate,
        baseCurrency: card.baseCurrency!,
        createdAt: card.createdAt!,
      }));
  },
});

/**
 * Get statements due for settlement today
 */
export const getStatementsDueToday = internalQuery({
  args: {},
  returns: v.array(v.object({
    _id: v.id("card_statements"),
    accountId: v.id("accounts"),
    userId: v.id("users"),
    totalAmount: v.number(),
    currencyCode: v.string(),
    dueDate: v.number(),
  })),
  handler: async (ctx) => {
    const today = getStartOfDay(Date.now());
    
    const statements = await ctx.db
      .query("card_statements")
      .withIndex("by_dueDate_status", (q) =>
        q.eq("dueDate", today).eq("status", "pending")
      )
      .collect();

    return statements.map(statement => ({
      _id: statement._id,
      accountId: statement.accountId,
      userId: statement.userId,
      totalAmount: statement.totalAmount,
      currencyCode: statement.currencyCode,
      dueDate: statement.dueDate,
    }));
  },
});

// ============================================================================
// CORE STATEMENT CALCULATION
// ============================================================================

/**
 * Calculate and store card statement for a specific closing date
 */
export const calculateStatement = internalMutation({
  args: {
    cardAccountId: v.id("accounts"),
    closingDate: v.number(),
  },
  returns: v.object({
    statementId: v.id("card_statements"),
    totalAmount: v.number(),
    periodStart: v.number(),
    periodEnd: v.number(),
    dueDate: v.number(),
  }),
  handler: async (ctx, args) => {
    const startTime = Date.now();
    
    try {
      // 1. Get card metadata
      const card = await ctx.db
        .query("cards")
        .withIndex("by_accountId", (q) => q.eq("accountId", args.cardAccountId))
        .unique();

      if (!card) {
        throw new Error("Card not found");
      }

      // Ensure card has required fields for statement calculation
      if (!card.baseCurrency) {
        throw new Error("Card missing baseCurrency field - cannot calculate statement");
      }
      if (!card.createdAt) {
        throw new Error("Card missing createdAt field - cannot calculate statement");
      }

      // 2. Check for existing statement (idempotency)
      const idempotencyKey = generateIdempotencyKey(
        "statement",
        args.cardAccountId,
        args.closingDate
      );
      
      const existing = await ctx.db
        .query("card_statements")
        .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", idempotencyKey))
        .first();

      if (existing) {
        return {
          statementId: existing._id,
          totalAmount: existing.totalAmount,
          periodStart: existing.periodStart,
          periodEnd: existing.periodEnd,
          dueDate: existing.dueDate,
        };
      }

      // 3. Calculate period boundaries
      const periodEnd = args.closingDate;
      let periodStart: number;

      // Check if this is the first statement for this card
      const existingStatements = await ctx.db
        .query("card_statements")
        .withIndex("by_accountId_closingDate", (q) => q.eq("accountId", args.cardAccountId))
        .collect();

      if (existingStatements.length === 0) {
        // First statement: use card creation date
        periodStart = card.createdAt;
      } else {
        // Subsequent statement: use previous closing date
        const lastStatement = existingStatements
          .sort((a, b) => b.closingDate - a.closingDate)[0];
        periodStart = lastStatement.closingDate;
      }

      // 4. Calculate statement total using rollups or fallback
      let totalAmount = 0;
      
      // Try rollup first (fast path)
      const monthStart = getMonthStart(periodStart);
      const rollup = await ctx.db
        .query("monthly_rollups")
        .withIndex("by_account_month", (q) =>
          q.eq("accountId", args.cardAccountId).eq("month", monthStart)
        )
        .first();

      if (rollup) {
        // Use rollup data for the month
        totalAmount = rollup.totalCredits; // Credits to card = charges
        console.log(`Using rollup for statement calculation: ${totalAmount}`);
      } else {
        // Fall back to line-by-line calculation with closing date exchange rate
        const lines = await ctx.db
          .query("journal_lines")
          .withIndex("by_accountId_date", (q) =>
            q.eq("accountId", args.cardAccountId)
             .gte("entryDate", periodStart)
             .lte("entryDate", periodEnd)
          )
          .collect();

        // Precompute conversion rates per unique currency (excluding base currency)
        const uniqueCurrencies = Array.from(
          new Set(lines.map((l) => l.currencyCode).filter((c) => c !== card.baseCurrency))
        );
        const currencyToRate = new Map<string, number>();
        for (const curr of uniqueCurrencies) {
          const resp = await ctx.runQuery(internal.ledger.cardStatements.getClosingDateConversionRate, {
            fromCurrency: curr,
            toCurrency: card.baseCurrency,
            closingDate: args.closingDate,
          });
          currencyToRate.set(curr, resp.rate);
        }

        // Convert all transactions to card's base currency using per-currency rates
        for (const line of lines) {
          if (line.direction === "credit") {
            const rate = line.currencyCode === card.baseCurrency ? 1 : (currencyToRate.get(line.currencyCode) ?? 1);
            const convertedAmount = convertAmount(
              line.amount,
              line.currencyCode,
              card.baseCurrency,
              rate
            );
            totalAmount += convertedAmount;
          }
        }
        console.log(`Using line-by-line calculation for statement: ${totalAmount}`);
      }

      // 5. Calculate due date
      const dueDate = new Date(periodEnd);
      dueDate.setUTCDate(card.dueDate);
      if (dueDate.getTime() <= periodEnd) {
        dueDate.setUTCMonth(dueDate.getUTCMonth() + 1);
      }

      // 6. Store statement (exchange rate fields omitted due to per-currency conversions)
      const statementId = await ctx.db.insert("card_statements", {
        accountId: args.cardAccountId,
        userId: card.userId,
        periodStart: periodStart,
        periodEnd: periodEnd,
        closingDate: args.closingDate,
        dueDate: dueDate.getTime(),
        totalAmount,
        currencyCode: card.baseCurrency,
        status: "pending",
        idempotencyKey,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const duration = Date.now() - startTime;
      console.log(`Statement calculated for card ${args.cardAccountId}: ${totalAmount} ${card.baseCurrency} in ${duration}ms`);

      return {
        statementId,
        totalAmount,
        periodStart,
        periodEnd,
        dueDate: dueDate.getTime(),
      };
    } catch (error) {
      await logDualWriteError({
        operation: "card_statement_calculation",
        errorMessage: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        context: { cardAccountId: args.cardAccountId, closingDate: args.closingDate },
      });
      throw error;
    }
  },
});

// ============================================================================
// SETTLEMENT POSTING
// ============================================================================

/**
 * Create settlement journal entry for a card statement
 */
export const postSettlement = internalMutation({
  args: {
    statementId: v.id("card_statements"),
  },
  returns: v.object({
    entryId: v.id("journal_entries"),
    amount: v.number(),
    cardAccountId: v.id("accounts"),
    bankAccountId: v.id("accounts"),
  }),
  handler: async (ctx, args) => {
    const startTime = Date.now();
    
    try {
      // 1. Get statement
      const statement = await ctx.db.get(args.statementId);
      if (!statement || statement.status !== "pending") {
        throw new Error("Statement not found or already settled");
      }

      // 2. Get card and determine settlement bank account
      const card = await ctx.db
        .query("cards")
        .withIndex("by_accountId", (q) => q.eq("accountId", statement.accountId))
        .unique();

      if (!card) {
        throw new Error("Card not found");
      }

      const cardAccount = await ctx.db.get(statement.accountId);
      let bankAccountId: Id<"accounts">;
      let usedFallback = false;

      if (cardAccount?.parentAccountId) {
        // Use card's designated parent account
        bankAccountId = cardAccount.parentAccountId;
      } else {
        // Fallback to user's main asset account
        const mainAssetAccount = await ctx.runQuery(internal.ledger.cardStatements.getUserMainAssetAccount, { 
          userId: statement.userId 
        });
        
        if (!mainAssetAccount) {
          throw new Error("No settlement account available - no parentAccountId and no main asset account");
        }
        
        bankAccountId = mainAssetAccount.accountId;
        usedFallback = true;

        // Log fallback usage for monitoring
        await logDualWriteError({
          operation: "card_settlement_posting",
          errorMessage: `Using main asset account ${mainAssetAccount.accountName} for orphaned card`,
          timestamp: Date.now(),
          context: { 
            cardId: card._id, 
            accountId: statement.accountId,
            statementId: statement._id,
            fallbackAccountId: bankAccountId,
            fallbackAccountName: mainAssetAccount.accountName
          },
        });
      }

      // 3. Check for existing settlement (idempotency)
      const settlementIdempotencyKey = generateIdempotencyKey(
        "settlement",
        statement.accountId,
        statement.dueDate
      );
      
      const existingEntry = await ctx.db
        .query("journal_entries")
        .withIndex("by_idempotencyKey", (q) => q.eq("idempotencyKey", settlementIdempotencyKey))
        .first();

      if (existingEntry) {
        await ctx.db.patch(args.statementId, {
          status: "posted",
          settlementEntryId: existingEntry._id,
          updatedAt: Date.now(),
        });
        return {
          entryId: existingEntry._id,
          amount: statement.totalAmount,
          cardAccountId: statement.accountId,
          bankAccountId,
        };
      }

      // 4. Create settlement journal entry
      const entryId = await ctx.db.insert("journal_entries", {
        userId: statement.userId,
        date: statement.dueDate,
        updateTime: Date.now(),
        softdelete: false,
        description: `Card settlement for period ${new Date(statement.periodStart).toISOString().split('T')[0]} to ${new Date(statement.periodEnd).toISOString().split('T')[0]}`,
        status: "posted",
        sourceType: "statement",
        sourceId: statement._id,
        idempotencyKey: settlementIdempotencyKey,
        linkType: "settlement",
        createdBy: statement.userId,
      });

      // 5. Create debit line (card liability decreases)
      await ctx.db.insert("journal_lines", {
        journalEntryId: entryId,
        userId: statement.userId,
        accountId: statement.accountId,
        direction: "debit",
        currencyCode: statement.currencyCode,
        amount: statement.totalAmount,
        amountBaseCurrency: statement.totalAmount,
        entryDate: statement.dueDate,
      });

      // 6. Create credit line (bank asset decreases)
      await ctx.db.insert("journal_lines", {
        journalEntryId: entryId,
        userId: statement.userId,
        accountId: bankAccountId,
        direction: "credit",
        currencyCode: statement.currencyCode,
        amount: statement.totalAmount,
        amountBaseCurrency: statement.totalAmount,
        entryDate: statement.dueDate,
      });

      // 7. Validate zero-sum
      const lines = await ctx.db
        .query("journal_lines")
        .withIndex("by_entryId", (q) => q.eq("journalEntryId", entryId))
        .collect();

      const sum = lines.reduce((acc, line) => {
        return acc + (line.direction === "debit" ? line.amountBaseCurrency : -line.amountBaseCurrency);
      }, 0);

      if (sum !== 0) {
        throw new Error(`Zero-sum validation failed: sum = ${sum}`);
      }

      // 8. Update statement status
      await ctx.db.patch(args.statementId, {
        status: "posted",
        settlementEntryId: entryId,
        updatedAt: Date.now(),
      });

      const duration = Date.now() - startTime;
      console.log(`Settlement posted for statement ${args.statementId}: ${statement.totalAmount} ${statement.currencyCode} in ${duration}ms`);

      return {
        entryId,
        amount: statement.totalAmount,
        cardAccountId: statement.accountId,
        bankAccountId,
      };
    } catch (error) {
      await logDualWriteError({
        operation: "card_settlement_posting",
        errorMessage: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
        context: { statementId: args.statementId },
      });
      throw error;
    }
  },
});

// ============================================================================
// SCHEDULED JOBS
// ============================================================================

/**
 * Daily job to calculate statements for cards with closing day = today
 */
export const processClosingStatements = internalAction({
  args: {},
  returns: v.object({
    total: v.number(),
    processed: v.number(),
    errors: v.number(),
    duration: v.number(),
  }),
  handler: async (ctx) => {
    const startTime = Date.now();
    let total = 0;
    let processed = 0;
    let errors = 0;

    console.log(`[Card Statement Processing] Job started at ${new Date(startTime).toISOString()}`);

    try {
      // 1. Get cards with closing day = today
      const cards = await ctx.runQuery(internal.ledger.cardStatements.getCardsWithClosingToday, {});
      total = cards.length;

      console.log(`[Card Statement Processing] Found ${total} cards with closing day today`);

      // 2. Process each card
      for (const card of cards) {
        try {
          const closingDate = getStartOfDay(Date.now());
          await ctx.runMutation(internal.ledger.cardStatements.calculateStatement, {
            cardAccountId: card.accountId,
            closingDate,
          });
          processed++;
        } catch (error) {
          errors++;
          console.error(`[Card Statement Processing] Failed to process card ${card.accountId}: ${error}`);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`[Card Statement Processing] Job completed: ${processed}/${total} processed, ${errors} errors, ${duration}ms`);

      return { total, processed, errors, duration };
    } catch (error) {
      console.error(`[Card Statement Processing] Job failed: ${error}`);
      const duration = Date.now() - startTime;
      return { total, processed, errors, duration };
    }
  },
});

/**
 * Daily job to post settlements for statements with due date = today
 */
export const processSettlements = internalAction({
  args: {},
  returns: v.object({
    total: v.number(),
    processed: v.number(),
    errors: v.number(),
    duration: v.number(),
  }),
  handler: async (ctx) => {
    const startTime = Date.now();
    let total = 0;
    let processed = 0;
    let errors = 0;

    console.log(`[Card Settlement Processing] Job started at ${new Date(startTime).toISOString()}`);

    try {
      // 1. Get statements due for settlement today
      const statements = await ctx.runQuery(internal.ledger.cardStatements.getStatementsDueToday, {});
      total = statements.length;

      console.log(`[Card Settlement Processing] Found ${total} statements due for settlement today`);

      // 2. Process each statement
      for (const statement of statements) {
        try {
          await ctx.runMutation(internal.ledger.cardStatements.postSettlement, {
            statementId: statement._id,
          });
          processed++;
        } catch (error) {
          errors++;
          console.error(`[Card Settlement Processing] Failed to process statement ${statement._id}: ${error}`);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`[Card Settlement Processing] Job completed: ${processed}/${total} processed, ${errors} errors, ${duration}ms`);

      return { total, processed, errors, duration };
    } catch (error) {
      console.error(`[Card Settlement Processing] Job failed: ${error}`);
      const duration = Date.now() - startTime;
      return { total, processed, errors, duration };
    }
  },
});
