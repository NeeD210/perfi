/**
 * Fetch Historical Exchange Rates
 * 
 * This module provides functionality to fetch historical exchange rates
 * for specific dates from API providers.
 */

"use node";

import { action } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

// Helper function
function getStartOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Fetch historical rate for a specific date (e.g., September 26, 2025)
 */
export const fetchHistoricalRate = action({
  args: {
    fromCurrency: v.string(),
    toCurrency: v.string(),
    date: v.string(), // Format: "YYYY-MM-DD" or "DD/MM/YY" or epoch ms
  },
  handler: async (ctx, args) => {
    // Parse date string to epoch milliseconds
    let targetDate: number;
    
    if (args.date.includes('/')) {
      // Format: DD/MM/YY or DD/MM/YYYY
      const parts = args.date.split('/');
      const day = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1; // JS months are 0-indexed
      let year = parseInt(parts[2]);
      
      // Handle 2-digit year
      if (year < 100) {
        year += 2000;
      }
      
      const dateObj = new Date(year, month, day);
      targetDate = getStartOfDay(dateObj.getTime());
    } else if (args.date.includes('-')) {
      // Format: YYYY-MM-DD
      const dateObj = new Date(args.date);
      targetDate = getStartOfDay(dateObj.getTime());
    } else {
      // Assume epoch milliseconds
      targetDate = getStartOfDay(parseInt(args.date));
    }

    const currencyPair = `${args.fromCurrency}/${args.toCurrency}`;
    
    // First check if we already have this rate cached
    const existingRate = await ctx.runQuery(internal.ledger.exchangeRates.getRateForDate, {
      pairCurrency: currencyPair,
      date: targetDate,
    });

    if (existingRate) {
      return {
        success: true,
        source: 'cache',
        currencyPair,
        date: new Date(targetDate).toISOString().split('T')[0],
        rate: existingRate.rate,
        message: 'Rate found in cache',
      };
    }

    // Not in cache, fetch from API
    try {
      await ctx.runAction(internal.ledger.exchangeRates.fetchAndStoreRate, {
        currencyPair,
        date: targetDate,
      });

      // Get the newly stored rate
      const newRate = await ctx.runQuery(internal.ledger.exchangeRates.getRateForDate, {
        pairCurrency: currencyPair,
        date: targetDate,
      });

      if (newRate) {
        return {
          success: true,
          source: 'api',
          currencyPair,
          date: new Date(targetDate).toISOString().split('T')[0],
          rate: newRate.rate,
          provider: newRate.source,
          message: 'Rate fetched from API and stored',
        };
      } else {
        return {
          success: false,
          currencyPair,
          date: new Date(targetDate).toISOString().split('T')[0],
          error: 'Failed to fetch rate from API',
        };
      }
    } catch (error) {
      return {
        success: false,
        currencyPair,
        date: new Date(targetDate).toISOString().split('T')[0],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

/**
 * Fetch multiple historical rates for a date range
 */
export const fetchHistoricalRateRange = action({
  args: {
    fromCurrency: v.string(),
    toCurrency: v.string(),
    startDate: v.string(), // Format: "YYYY-MM-DD" or "DD/MM/YY"
    endDate: v.string(),   // Format: "YYYY-MM-DD" or "DD/MM/YY"
  },
  handler: async (ctx, args) => {
    // Parse dates
    const parseDate = (dateStr: string): number => {
      if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        let year = parseInt(parts[2]);
        if (year < 100) year += 2000;
        return new Date(year, month, day).getTime();
      } else {
        return new Date(dateStr).getTime();
      }
    };

    const startTimestamp = getStartOfDay(parseDate(args.startDate));
    const endTimestamp = getStartOfDay(parseDate(args.endDate));
    
    const results = [];
    let currentDate = startTimestamp;
    
    // Fetch rates for each day in the range
    while (currentDate <= endTimestamp) {
      const dateStr = new Date(currentDate).toISOString().split('T')[0];
      
      try {
        const result = await ctx.runAction(ctx.action(fetchHistoricalRate), {
          fromCurrency: args.fromCurrency,
          toCurrency: args.toCurrency,
          date: dateStr,
        });
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          date: dateStr,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      
      // Move to next day
      currentDate += 24 * 60 * 60 * 1000;
    }

    return {
      fromCurrency: args.fromCurrency,
      toCurrency: args.toCurrency,
      startDate: new Date(startTimestamp).toISOString().split('T')[0],
      endDate: new Date(endTimestamp).toISOString().split('T')[0],
      totalDays: results.length,
      successful: results.filter((r: any) => r.success).length,
      failed: results.filter((r: any) => !r.success).length,
      results,
    };
  },
});

/**
 * Test historical rate fetching for September 26, 2025
 */
export const testSeptember26Rate = action({
  args: {},
  handler: async (ctx) => {
    // Call the handler directly
    return await fetchHistoricalRate.handler(ctx, {
      fromCurrency: 'USD',
      toCurrency: 'ARS',
      date: '26/9/25',  // September 26, 2025
    });
  },
});

