import { mutation, query, internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { Direction, JournalLine } from "./types";

// Currency scale definitions (minor units)
const CURRENCY_SCALES: Record<string, number> = {
  ARS: 0, // whole pesos, no decimals
  USD: 2, // cents
  EUR: 2, // cents
  // Add more currencies as needed
};

// Rounding policy: round half away from zero to minor unit
function roundHalfAwayFromZero(value: number): number {
  return value >= 0 ? Math.round(value) : -Math.round(-value);
}

// Get scale for currency (default to 2 if unknown)
function getCurrencyScale(currencyCode: string): number {
  return CURRENCY_SCALES[currencyCode] ?? 2;
}

// Convert amount to minor units
function toMinorUnits(amount: number, currencyCode: string): number {
  const scale = getCurrencyScale(currencyCode);
  return Math.round(amount * Math.pow(10, scale));
}

// Convert amount from minor units
function fromMinorUnits(amount: number, currencyCode: string): number {
  const scale = getCurrencyScale(currencyCode);
  return amount / Math.pow(10, scale);
}

// Parse currency pair (e.g., "USD/ARS" -> { base: "USD", quote: "ARS" })
function parseCurrencyPair(pairCurrency: string): { base: string; quote: string } {
  const [base, quote] = pairCurrency.split('/');
  if (!base || !quote) {
    throw new Error(`Invalid currency pair format: ${pairCurrency}. Expected format: "BASE/QUOTE"`);
  }
  return { base, quote };
}

// Create inverse pair (e.g., "USD/ARS" -> "ARS/USD")
function createInversePair(pairCurrency: string): string {
  const { base, quote } = parseCurrencyPair(pairCurrency);
  return `${quote}/${base}`;
}

// Core FX conversion function
export const convertAmount = internalMutation({
  args: {
    amount: v.number(), // amount in source currency (in minor units)
    fromCurrency: v.string(),
    toCurrency: v.string(),
    date: v.number(),
    userExchangeRate: v.optional(v.number()), // User's actual rate (takes precedence)
    exchangeRateId: v.optional(v.id("exchange_rates")), // Official rate reference
  },
  returns: v.object({
    converted: v.number(), // converted amount in minor units
    rateId: v.union(v.id("exchange_rates"), v.null()),
    rateUsed: v.number(),
  }),
  handler: async (ctx, args): Promise<{ converted: number; rateId: Id<"exchange_rates"> | null; rateUsed: number }> => {
    const { amount, fromCurrency, toCurrency, date, userExchangeRate, exchangeRateId } = args;

    // Same currency, no conversion needed
    if (fromCurrency === toCurrency) {
      return { converted: amount, rateId: null, rateUsed: 1 };
    }

    // Get effective rate (user rate takes precedence)
    const effectiveRateResult = await ctx.runQuery(internal.ledger.fx.getEffectiveRate, {
      userExchangeRate,
      exchangeRateId,
      pairCurrency: `${fromCurrency}/${toCurrency}`,
      date,
    });

    if (!effectiveRateResult.rate) {
      throw new Error(`No exchange rate available for ${fromCurrency}/${toCurrency} on ${new Date(date).toISOString()}`);
    }

    // Convert amount
    const converted = roundHalfAwayFromZero(amount * effectiveRateResult.rate);

    return {
      converted,
      rateId: effectiveRateResult.source === 'official' ? exchangeRateId || null : null,
      rateUsed: effectiveRateResult.rate,
    };
  },
});

// Get effective rate with priority logic
export const getEffectiveRate = internalQuery({
  args: {
    userExchangeRate: v.optional(v.number()),
    exchangeRateId: v.optional(v.id("exchange_rates")),
    pairCurrency: v.optional(v.string()),
    date: v.optional(v.number()),
  },
  returns: v.object({
    rate: v.number(),
    source: v.union(v.literal("user"), v.literal("official"), v.null()),
  }),
  handler: async (ctx, args): Promise<{ rate: number; source: 'user' | 'official' | null }> => {
    const { userExchangeRate, exchangeRateId, pairCurrency, date } = args;

    // Priority 1: User-provided rate (takes precedence)
    if (userExchangeRate !== undefined && userExchangeRate > 0) {
      return { rate: userExchangeRate, source: 'user' };
    }

    // Priority 2: Official rate by ID
    if (exchangeRateId) {
      const rateDoc = await ctx.db.get(exchangeRateId);
      if (rateDoc) {
        return { rate: rateDoc.rate, source: 'official' };
      }
    }

    // Priority 3: Look up official rate by pair and date
    if (pairCurrency && date !== undefined) {
      const rateResult = await ctx.runQuery(internal.ledger.fx.getRateForDate, { pairCurrency, date });
      if (rateResult) {
        return { rate: rateResult.rate, source: 'official' };
      }
    }

    return { rate: 0, source: null };
  },
});

// Get rate for specific date
export const getRateForDate = internalQuery({
  args: {
    pairCurrency: v.string(),
    date: v.number(),
  },
  returns: v.union(
    v.object({
      rate: v.number(),
      id: v.id("exchange_rates"),
      source: v.string(),
    }),
    v.null()
  ),
  handler: async (ctx, args): Promise<{ rate: number; id: Id<"exchange_rates">; source: string } | null> => {
    const { pairCurrency, date } = args;

    // Use the new exchange rate service to get rate for specific date
    const rate = await ctx.runQuery(internal.exchangeRates.getRateForDate, {
      pairCurrency,
      date,
    });

    return rate;
  },
});

// Store exchange rate
export const storeExchangeRate = internalMutation({
  args: {
    pairCurrency: v.string(),
    rate: v.number(),
    date: v.number(),
    source: v.string(),
  },
  returns: v.id("exchange_rates"),
  handler: async (ctx, args): Promise<Id<"exchange_rates">> => {
    const { pairCurrency, rate, date, source } = args;

    // Use the new exchange rate service to store the rate
    await ctx.runMutation(internal.exchangeRates.storeRate, {
      pairCurrency,
      rate,
      inverseRate: 1 / rate,
      date,
      source,
    });

    // Find and return the stored rate ID
    const storedRate = await ctx.db
      .query("exchange_rates")
      .withIndex("by_pair_date_source", (q) =>
        q.eq("pairCurrency", pairCurrency).eq("date", date).eq("source", source)
      )
      .first();

    if (!storedRate) {
      throw new Error("Failed to store exchange rate");
    }

    return storedRate._id;
  },
});

// Calculate residual from journal lines (for FX rounding)
export const calculateResidual = internalQuery({
  args: {
    lines: v.array(v.object({
      amountBaseCurrency: v.number(),
    })),
  },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    const total = args.lines.reduce((sum, line) => sum + line.amountBaseCurrency, 0);
    return total; // This should be 0 in a properly balanced entry
  },
});

// Create balancing line for FX rounding account
export const createBalancingLine = internalMutation({
  args: {
    userId: v.id("users"),
    residual: v.number(),
    entryId: v.id("journal_entries"),
  },
  returns: v.id("journal_lines"),
  handler: async (ctx, args): Promise<Id<"journal_lines">> => {
    const { userId, residual, entryId } = args;

    // Find or create FX rounding account
    let fxRoundingAccount = await ctx.db
      .query("accounts")
      .withIndex("by_user_type", (q) =>
        q.eq("userId", userId).eq("accountType", "expense")
      )
      .filter((q) => q.eq(q.field("description"), "FX Rounding Adjustments"))
      .first();

    if (!fxRoundingAccount) {
      // Create FX rounding account
      const accountId = await ctx.db.insert("accounts", {
        userId,
        description: "FX Rounding Adjustments",
        accountType: "expense",
        defaultCurrency: "ARS",
        creationTime: Date.now(),
        softdelete: false,
      });
      fxRoundingAccount = await ctx.db.get(accountId);
    }

    if (!fxRoundingAccount) {
      throw new Error("Failed to create or find FX rounding account");
    }

    // Get the entry to determine the date
    const entry = await ctx.db.get(entryId);
    if (!entry) {
      throw new Error("Journal entry not found");
    }

    // Determine direction (opposite of residual sign)
    const direction: Direction = residual > 0 ? "credit" : "debit";
    const amount = Math.abs(residual);

    // Create balancing line
    const lineId = await ctx.db.insert("journal_lines", {
      journalEntryId: entryId,
      userId,
      accountId: fxRoundingAccount._id,
      direction,
      currencyCode: fxRoundingAccount.defaultCurrency || "ARS",
      amount,
      amountBaseCurrency: residual, // residual is already in base currency
      entryDate: entry.date,
    });

    return lineId;
  },
});

// Public query to get rate for date (for UI)
export const getExchangeRateForDate = query({
  args: {
    fromCurrency: v.string(),
    toCurrency: v.string(),
    date: v.number(),
  },
  returns: v.union(
    v.object({
      rate: v.number(),
      id: v.id("exchange_rates"),
      source: v.string(),
    }),
    v.null()
  ),
  handler: async (ctx, args): Promise<{ rate: number; id: Id<"exchange_rates">; source: string } | null> => {
    const pairCurrency = `${args.fromCurrency}/${args.toCurrency}`;
    return await ctx.runQuery(internal.ledger.fx.getRateForDate, {
      pairCurrency,
      date: args.date,
    });
  },
});

// Public query to get current exchange rate with on-demand fetching
export const getCurrentExchangeRate = query({
  args: {
    fromCurrency: v.string(),
    toCurrency: v.string(),
    date: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.runQuery(internal.exchangeRates.getExchangeRate, {
      fromCurrency: args.fromCurrency,
      toCurrency: args.toCurrency,
      date: args.date,
    });
  },
});

// Public query to convert amount using current exchange rate
export const convertAmountPublic = query({
  args: {
    amount: v.number(),
    fromCurrency: v.string(),
    toCurrency: v.string(),
    date: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.runQuery(internal.exchangeRates.convertAmount, {
      amount: args.amount,
      fromCurrency: args.fromCurrency,
      toCurrency: args.toCurrency,
      date: args.date,
    });
  },
});
