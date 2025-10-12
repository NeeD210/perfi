/**
 * Fetch Live Exchange Rates
 * 
 * This action fetches live exchange rates from configured providers
 * and stores them in the database for immediate use.
 */

"use node";

import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

/**
 * Fetch live rates from CurrencyAPI and store them
 */
export const fetchFromCurrencyAPI = internalAction({
  args: {
    baseCurrency: v.string(),
    targetCurrencies: v.array(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const apiKey = process.env.CURRENCY_API_KEY;
    if (!apiKey) {
      throw new Error('CURRENCY_API_KEY not set');
    }

    const currencies = args.targetCurrencies.join(',');
    const url = `https://api.currencyapi.com/v3/latest?apikey=${apiKey}&currencies=${currencies}&base_currency=${args.baseCurrency}`;
    
    const startTime = Date.now();
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`CurrencyAPI error: ${response.status}`);
    }

    const data = await response.json();
    const responseTime = Date.now() - startTime;
    const now = Date.now();
    const targetDate = getStartOfDay(now);
    const storedRates = [];

    if (data.data) {
      for (const [currency, rateInfo] of Object.entries(data.data)) {
        const rate = (rateInfo as any).value;
        const pairCurrency = `${args.baseCurrency}/${currency}`;
        
        await ctx.runMutation(internal.ledger.exchangeRates.storeRate, {
          pairCurrency,
          rate,
          inverseRate: 1 / rate,
          date: targetDate,
          source: 'currencyapi',
        });

        storedRates.push({ pair: pairCurrency, rate });
      }
    }

    return {
      success: true,
      provider: 'CurrencyAPI',
      responseTime,
      storedRates,
    };
  },
});

/**
 * Fetch live rates from AbstractAPI and store them
 */
export const fetchFromAbstractAPI = internalAction({
  args: {
    baseCurrency: v.string(),
    targetCurrencies: v.array(v.string()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const apiKey = process.env.ABSTRACT_API_KEY;
    if (!apiKey) {
      throw new Error('ABSTRACT_API_KEY not set');
    }

    const now = Date.now();
    const targetDate = getStartOfDay(now);
    const storedRates: Array<any> = [];
    let totalResponseTime = 0;

    // AbstractAPI requires individual requests per currency pair
    for (const targetCurrency of args.targetCurrencies) {
      const url = `https://exchange-rates.abstractapi.com/v1/live/?api_key=${apiKey}&base=${args.baseCurrency}&target=${targetCurrency}`;
      
      const startTime = Date.now();
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });

      totalResponseTime += Date.now() - startTime;

      if (!response.ok) {
        console.warn(`AbstractAPI error for ${args.baseCurrency}/${targetCurrency}: ${response.status}`);
        continue;
      }

      const data = await response.json();
      
      if (data.exchange_rates && data.exchange_rates[targetCurrency]) {
        const rate = data.exchange_rates[targetCurrency];
        const pairCurrency = `${args.baseCurrency}/${targetCurrency}`;
        
        await ctx.runMutation(internal.ledger.exchangeRates.storeRate, {
          pairCurrency,
          rate,
          inverseRate: 1 / rate,
          date: targetDate,
          source: 'abstractapi',
        });

        storedRates.push({ pair: pairCurrency, rate });
      }
    }

    return {
      success: true,
      provider: 'AbstractAPI',
      responseTime: totalResponseTime,
      storedRates,
    };
  },
});

/**
 * Fetch and store rates for major currency pairs
 */
export const fetchMajorCurrencyRates = action({
  args: {},
  returns: v.any(),
  handler: async (ctx) => {
    const results: Array<any> = [];

    // Fetch USD-based rates directly (avoid nested runAction calls)
    try {
      const apiKey = process.env.CURRENCY_API_KEY;
      if (apiKey) {
        const url = `https://api.currencyapi.com/v3/latest?apikey=${apiKey}&currencies=ARS,EUR&base_currency=USD`;
        const response = await fetch(url);
        const data = await response.json();
        
        const now = Date.now();
        const targetDate = getStartOfDay(now);
        const storedRates: Array<any> = [];

        if (data.data) {
          for (const [currency, rateInfo] of Object.entries(data.data)) {
            const rate = (rateInfo as any).value;
            const pairCurrency = `USD/${currency}`;
            
            await ctx.runMutation(internal.ledger.exchangeRates.storeRate, {
              pairCurrency,
              rate,
              inverseRate: 1 / rate,
              date: targetDate,
              source: 'currencyapi',
            });

            storedRates.push({ pair: pairCurrency, rate });
          }
        }

        results.push({
          success: true,
          provider: 'CurrencyAPI-USD',
          storedRates,
        });
      }
    } catch (error) {
      console.error('CurrencyAPI USD fetch failed:', error);
    }

    // Fetch EUR-based rates
    try {
      const apiKey = process.env.CURRENCY_API_KEY;
      if (apiKey) {
        const url = `https://api.currencyapi.com/v3/latest?apikey=${apiKey}&currencies=ARS,USD&base_currency=EUR`;
        const response = await fetch(url);
        const data = await response.json();
        
        const now = Date.now();
        const targetDate = getStartOfDay(now);
        const storedRates: Array<any> = [];

        if (data.data) {
          for (const [currency, rateInfo] of Object.entries(data.data)) {
            const rate = (rateInfo as any).value;
            const pairCurrency = `EUR/${currency}`;
            
            await ctx.runMutation(internal.ledger.exchangeRates.storeRate, {
              pairCurrency,
              rate,
              inverseRate: 1 / rate,
              date: targetDate,
              source: 'currencyapi',
            });

            storedRates.push({ pair: pairCurrency, rate });
          }
        }

        results.push({
          success: true,
          provider: 'CurrencyAPI-EUR',
          storedRates,
        });
      }
    } catch (error) {
      console.error('CurrencyAPI EUR fetch failed:', error);
    }

    return {
      message: 'Fetched and stored live exchange rates',
      results,
      totalRatesStored: results.reduce((sum, r) => sum + (r.storedRates?.length || 0), 0),
    };
  },
});

// Helper function
function getStartOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

