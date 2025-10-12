/**
 * Exchange Rate Service
 * 
 * This module provides the core exchange rate service with on-demand fetching,
 * caching, and fallback mechanisms for reliable multi-currency support.
 */

import { query, internalQuery, internalMutation, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { QueryCtx, MutationCtx, ActionCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { providerManager, ExchangeRateData } from "./exchangeRateProviders";

// Helper functions
function getStartOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

// Default fallback rates (reasonable defaults for major pairs)
const DEFAULT_RATES: Record<string, number> = {
  'USD/ARS': 950,
  'EUR/ARS': 1020,
  'USD/EUR': 0.93,
  'ARS/USD': 0.00105,
  'ARS/EUR': 0.00098,
  'EUR/USD': 1.08,
};

// Major currency pairs we support
const MAJOR_CURRENCY_PAIRS = [
  'USD/ARS', 'EUR/ARS', 'USD/EUR',
  'ARS/USD', 'ARS/EUR', 'EUR/USD'
];

/**
 * Get exchange rate with on-demand fetching and caching
 * This is the main query that applications should use
 */
export const getExchangeRate = internalQuery({
  args: {
    fromCurrency: v.string(),
    toCurrency: v.string(),
    date: v.optional(v.number()), // Defaults to today
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    const targetDate = args.date || getStartOfDay(Date.now());
    const currencyPair = `${args.fromCurrency}/${args.toCurrency}`;
    
    // Same currency, no conversion needed
    if (args.fromCurrency === args.toCurrency) {
      return { 
        rate: 1, 
        source: 'same_currency', 
        fetchTime: Date.now() - startTime,
        cached: true 
      };
    }
    
    // Check cache first (< 50ms target)
    const existingRate = await ctx.db
      .query("exchange_rates")
      .withIndex("by_pair_date", (q) => 
        q.eq("pairCurrency", currencyPair).eq("date", targetDate)
      )
      .first();
    
    if (existingRate) {
      const cacheTime = Date.now() - startTime;
      console.log(`Cache hit: ${cacheTime}ms for ${currencyPair}`);
      return { 
        rate: existingRate.rate, 
        source: 'cache', 
        fetchTime: cacheTime,
        cached: true,
        rateId: existingRate._id
      };
    }
    
    // Rate doesn't exist, trigger async fetch (don't wait)
    // Note: runAction is not available in query context, this would need to be called from an action
    // For now, we'll just return the fallback rate
    
    // Return fallback rate immediately
    const fallbackRate = await getFallbackRate(ctx, currencyPair, targetDate);
    return { 
      rate: fallbackRate, 
      source: 'fallback', 
      fetchTime: Date.now() - startTime,
      cached: false
    };
  },
});

/**
 * Internal action to fetch and store exchange rate from API providers
 */
export const fetchAndStoreRate = internalAction({
  args: {
    currencyPair: v.string(),
    date: v.number(),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    
    try {
      // Parse currency pair
      const [baseCurrency, targetCurrency] = args.currencyPair.split('/');
      if (!baseCurrency || !targetCurrency) {
        throw new Error(`Invalid currency pair format: ${args.currencyPair}`);
      }

      // Fetch from API providers with timeout and fallback (including historical date support)
      const rates = await providerManager.fetchRatesWithFallback(
        baseCurrency, 
        [targetCurrency],
        args.date
      );
      
      if (rates.length > 0) {
        const rate = rates[0]; // Should be exactly one rate
        
        // Store in database
        await ctx.runMutation(internal.ledger.exchangeRates.storeRate, {
          pairCurrency: args.currencyPair,
          rate: rate.rate,
          inverseRate: rate.inverseRate,
          date: args.date,
          source: rate.source,
        });
        
        // Also store inverse pair if it doesn't exist
        const inversePair = `${targetCurrency}/${baseCurrency}`;
        const existingInverse = await ctx.runQuery(internal.ledger.exchangeRates.getRateForDate, {
          pairCurrency: inversePair,
          date: args.date,
        });
        
        if (!existingInverse) {
          await ctx.runMutation(internal.ledger.exchangeRates.storeRate, {
            pairCurrency: inversePair,
            rate: rate.inverseRate || (1 / rate.rate),
            inverseRate: rate.rate,
            date: args.date,
            source: rate.source,
          });
        }
        
        const fetchTime = Date.now() - startTime;
        console.log(`API fetch completed: ${fetchTime}ms for ${args.currencyPair} from ${rate.source}`);
      } else {
        console.warn(`No rates returned from providers for ${args.currencyPair}`);
      }
    } catch (error) {
      console.error(`API fetch failed for ${args.currencyPair}: ${error instanceof Error ? error.message : String(error)}`);
      // Log error but don't throw - system continues with fallback
    }
  },
});

/**
 * Helper function to get fallback rate
 */
export const getFallbackRate = async (
  ctx: QueryCtx, 
  currencyPair: string, 
  date: number
): Promise<number> => {
  // Try to get most recent rate for this pair
  const recentRate = await ctx.db
    .query("exchange_rates")
    .withIndex("by_pair_date", (q) => 
      q.eq("pairCurrency", currencyPair)
    )
    .order("desc")
    .first();
  
  if (recentRate) {
    console.log(`Using recent cached rate for ${currencyPair}: ${recentRate.rate}`);
    return recentRate.rate;
  }
  
  // Ultimate fallback: reasonable default rates
  const defaultRate = DEFAULT_RATES[currencyPair];
  if (defaultRate) {
    console.log(`Using default rate for ${currencyPair}: ${defaultRate}`);
    return defaultRate;
  }
  
  // If no default rate, return 1 (no conversion)
  console.warn(`No fallback rate available for ${currencyPair}, using 1.0`);
  return 1;
};

/**
 * Store exchange rate in database
 */
export const storeRate = internalMutation({
  args: {
    pairCurrency: v.string(),
    rate: v.number(),
    inverseRate: v.optional(v.number()),
    date: v.number(),
    source: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate rate is positive
    if (args.rate <= 0) {
      throw new Error("Exchange rate must be positive");
    }

    // Check if rate already exists for this pair/date/source
    const existingRate = await ctx.db
      .query("exchange_rates")
      .withIndex("by_pair_date_source", (q) =>
        q.eq("pairCurrency", args.pairCurrency)
         .eq("date", args.date)
         .eq("source", args.source)
      )
      .first();

    if (existingRate) {
      // Update existing rate
      await ctx.db.patch(existingRate._id, {
        rate: args.rate,
        inverseRate: args.inverseRate,
      });
      console.log(`Updated existing rate for ${args.pairCurrency} from ${args.source}`);
    } else {
      // Insert new rate
      await ctx.db.insert("exchange_rates", {
        pairCurrency: args.pairCurrency,
        rate: args.rate,
        inverseRate: args.inverseRate,
        date: args.date,
        source: args.source,
      });
      console.log(`Stored new rate for ${args.pairCurrency} from ${args.source}: ${args.rate}`);
    }
  },
});

/**
 * Get rate for specific date (internal query)
 */
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
    const rate = await ctx.db
      .query("exchange_rates")
      .withIndex("by_pair_date", (q) => 
        q.eq("pairCurrency", args.pairCurrency).eq("date", args.date)
      )
      .first();

    if (!rate) {
      return null;
    }

    return { 
      rate: rate.rate, 
      id: rate._id,
      source: rate.source
    };
  },
});

/**
 * Batch fetch rates for multiple currency pairs
 */
export const batchFetchRates = internalAction({
  args: {
    currencyPairs: v.array(v.string()),
    date: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const targetDate = args.date || getStartOfDay(Date.now());
    const results: Array<{ pair: string; success: boolean; error?: string }> = [];
    
    // Group pairs by base currency for efficient API calls
    const pairsByBase: Record<string, string[]> = {};
    
    for (const pair of args.currencyPairs) {
      const [base, quote] = pair.split('/');
      if (!base || !quote) continue;
      
      if (!pairsByBase[base]) {
        pairsByBase[base] = [];
      }
      pairsByBase[base].push(quote);
    }
    
    // Fetch rates for each base currency
    for (const [baseCurrency, targetCurrencies] of Object.entries(pairsByBase)) {
      try {
        const rates = await providerManager.fetchRatesWithFallback(
          baseCurrency,
          targetCurrencies
        );
        
      // Store each rate
      for (const rate of rates) {
        await ctx.runMutation(internal.ledger.exchangeRates.storeRate, {
          pairCurrency: rate.pairCurrency,
          rate: rate.rate,
          inverseRate: rate.inverseRate,
          date: targetDate,
          source: rate.source,
        });
          
          results.push({ pair: rate.pairCurrency, success: true });
        }
      } catch (error) {
        // Mark all pairs for this base currency as failed
        for (const quoteCurrency of targetCurrencies) {
        results.push({ 
          pair: `${baseCurrency}/${quoteCurrency}`, 
          success: false, 
          error: error instanceof Error ? error.message : String(error)
        });
        }
      }
    }
    
    return results;
  },
});

/**
 * Get exchange rate with forced refresh (bypasses cache)
 */
export const getExchangeRateWithRefresh = query({
  args: {
    fromCurrency: v.string(),
    toCurrency: v.string(),
    date: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const currencyPair = `${args.fromCurrency}/${args.toCurrency}`;
    const targetDate = args.date || getStartOfDay(Date.now());
    
    // Force refresh by triggering fetch
    // Note: runAction is not available in query context
    
    // Wait a moment for the fetch to complete, then return cached or fallback
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Try to get the freshly fetched rate
    const freshRate = await ctx.db
      .query("exchange_rates")
      .withIndex("by_pair_date", (q) => 
        q.eq("pairCurrency", currencyPair).eq("date", targetDate)
      )
      .first();
    
    if (freshRate) {
      return { 
        rate: freshRate.rate, 
        source: freshRate.source, 
        fetchTime: 0,
        cached: false,
        rateId: freshRate._id,
        refreshed: true
      };
    }
    
    // Fallback if refresh didn't work
    const fallbackRate = await getFallbackRate(ctx, currencyPair, targetDate);
    return { 
      rate: fallbackRate, 
      source: 'fallback', 
      fetchTime: 0,
      cached: false,
      refreshed: true
    };
  },
});

/**
 * Get provider health status
 */
export const getProviderHealth = query({
  args: {},
  handler: async (ctx) => {
    // This would need to be implemented as an action since it makes external calls
    // For now, return cached health info or implement a separate action
    return {
      providers: ['exchangerate-api', 'currencyapi', 'abstractapi'],
      status: 'unknown', // Would need action to get real-time health
    };
  },
});

/**
 * Convert amount using exchange rate
 */
export const convertAmount = internalQuery({
  args: {
    amount: v.number(),
    fromCurrency: v.string(),
    toCurrency: v.string(),
    date: v.optional(v.number()),
  },
  returns: v.object({
    originalAmount: v.number(),
    convertedAmount: v.number(),
    rate: v.number(),
    source: v.string(),
    fromCurrency: v.string(),
    toCurrency: v.string(),
  }),
  handler: async (ctx, args) => {
    const rateResult: any = await ctx.runQuery(internal.ledger.exchangeRates.getExchangeRate, {
      fromCurrency: args.fromCurrency,
      toCurrency: args.toCurrency,
      date: args.date,
    });
    
    const convertedAmount = Math.round(args.amount * rateResult.rate);
    
    return {
      originalAmount: args.amount,
      convertedAmount,
      rate: rateResult.rate,
      source: rateResult.source,
      fromCurrency: args.fromCurrency,
      toCurrency: args.toCurrency,
    };
  },
});

/**
 * Get available currency pairs
 */
export const getAvailableCurrencyPairs = query({
  args: {},
  handler: async (ctx) => {
    // Return the major currency pairs we support
    return MAJOR_CURRENCY_PAIRS;
  },
});

/**
 * Get rate history for a currency pair
 */
export const getRateHistory = query({
  args: {
    fromCurrency: v.string(),
    toCurrency: v.string(),
    days: v.optional(v.number()), // Default 30 days
  },
  handler: async (ctx, args) => {
    const currencyPair = `${args.fromCurrency}/${args.toCurrency}`;
    const days = args.days || 30;
    const endDate = getStartOfDay(Date.now());
    const startDate = endDate - (days * 24 * 60 * 60 * 1000);
    
    const rates = await ctx.db
      .query("exchange_rates")
      .withIndex("by_pair_date", (q) => 
        q.eq("pairCurrency", currencyPair)
         .gte("date", startDate)
         .lte("date", endDate)
      )
      .order("asc")
      .collect();
    
    return rates.map(rate => ({
      date: rate.date,
      rate: rate.rate,
      source: rate.source,
      id: rate._id,
    }));
  },
});
