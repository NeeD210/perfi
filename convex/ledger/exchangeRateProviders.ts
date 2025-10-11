/**
 * Exchange Rate API Providers
 * 
 * This module implements multiple exchange rate API providers with fallback mechanisms
 * to ensure reliable exchange rate data availability.
 */

// Provider interfaces and types
export interface ExchangeRateData {
  pairCurrency: string; // "USD/ARS"
  rate: number; // Direct rate (1 USD = X ARS)
  inverseRate?: number; // Inverse rate (1 ARS = Y USD)
  date: number; // Epoch milliseconds
  source: string; // Provider name
  lastUpdated: number; // When this rate was fetched
}

export interface ExchangeRateProvider {
  name: string;
  baseUrl: string;
  requiresApiKey: boolean;
  rateLimit: {
    requestsPerMonth: number;
    requestsPerMinute: number;
  };
  
  fetchRates(baseCurrency: string, targetCurrencies: string[], date?: number): Promise<ExchangeRateData[]>;
  isHealthy(): Promise<boolean>;
  getUsageStats(): Promise<ProviderUsageStats>;
}

export interface ProviderUsageStats {
  requestsThisMonth: number;
  requestsThisMinute: number;
  lastRequestTime: number;
  isHealthy: boolean;
}

// Rate validation rules
const RATE_VALIDATION_RULES = {
  'USD/ARS': { min: 100, max: 2000, maxChangePerHour: 0.05 },
  'EUR/ARS': { min: 120, max: 2500, maxChangePerHour: 0.05 },
  'USD/EUR': { min: 0.8, max: 1.2, maxChangePerHour: 0.03 },
  'ARS/USD': { min: 0.0005, max: 0.01, maxChangePerHour: 0.05 },
  'ARS/EUR': { min: 0.0004, max: 0.008, maxChangePerHour: 0.05 },
  'EUR/USD': { min: 0.83, max: 1.25, maxChangePerHour: 0.03 },
};

// Helper functions
function getStartOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

function createInversePair(pairCurrency: string): string {
  const [base, quote] = pairCurrency.split('/');
  return `${quote}/${base}`;
}

function validateRate(rate: number, currencyPair: string): boolean {
  const rules = (RATE_VALIDATION_RULES as Record<string, any>)[currencyPair];
  if (!rules) return true; // No validation rules for unknown pairs
  
  return rate >= rules.min && rate <= rules.max;
}

// ExchangeRate-API Provider (Primary)
export class ExchangeRateAPIProvider implements ExchangeRateProvider {
  name = 'exchangerate-api';
  baseUrl = 'https://v6.exchangerate-api.com/v6';
  requiresApiKey = true;
  rateLimit = {
    requestsPerMonth: 1500,
    requestsPerMinute: 60,
  };

  private getApiKey(): string {
    const apiKey = process.env.EXCHANGE_RATE_API_KEY;
    if (!apiKey) {
      throw new Error('EXCHANGE_RATE_API_KEY environment variable not set');
    }
    return apiKey;
  }

  async fetchRates(baseCurrency: string, targetCurrencies: string[], date?: number): Promise<ExchangeRateData[]> {
    const apiKey = this.getApiKey();
    
    // Use historical endpoint if date is provided, otherwise use latest
    let url: string;
    let targetDate: number;
    
    if (date) {
      // Historical data - format: YYYY/M/D (e.g., 2025/9/26)
      const dateObj = new Date(date);
      const year = dateObj.getUTCFullYear();
      const month = dateObj.getUTCMonth() + 1;
      const day = dateObj.getUTCDate();
      url = `${this.baseUrl}/${apiKey}/history/${baseCurrency}/${year}/${month}/${day}`;
      targetDate = getStartOfDay(date);
    } else {
      // Latest data
      url = `${this.baseUrl}/${apiKey}/latest/${baseCurrency}`;
      targetDate = getStartOfDay(Date.now());
    }
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`ExchangeRate-API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const rates: ExchangeRateData[] = [];
      const now = Date.now();

      // Check for API-specific response format
      const conversionRates = data.conversion_rates || data.rates;
      
      if (!conversionRates) {
        throw new Error(`Invalid response format from ExchangeRate-API`);
      }

      for (const targetCurrency of targetCurrencies) {
        if (conversionRates[targetCurrency]) {
          const rate = conversionRates[targetCurrency];
          const pairCurrency = `${baseCurrency}/${targetCurrency}`;
          
          if (validateRate(rate, pairCurrency)) {
            rates.push({
              pairCurrency,
              rate,
              inverseRate: 1 / rate,
              date: targetDate,
              source: this.name,
              lastUpdated: now,
            });
          }
        }
      }

      return rates;
    } catch (error) {
      console.error(`ExchangeRate-API fetch error:`, error);
      throw new Error(`ExchangeRate-API failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const apiKey = this.getApiKey();
      const response = await fetch(`${this.baseUrl}/${apiKey}/latest/USD`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getUsageStats(): Promise<ProviderUsageStats> {
    // For free tier, we can't track usage precisely
    return {
      requestsThisMonth: 0, // Unknown for free tier
      requestsThisMinute: 0,
      lastRequestTime: Date.now(),
      isHealthy: await this.isHealthy(),
    };
  }
}

// CurrencyAPI Provider (Secondary)
export class CurrencyAPIProvider implements ExchangeRateProvider {
  name = 'currencyapi';
  baseUrl = 'https://api.currencyapi.com/v3/latest';
  requiresApiKey = true;
  rateLimit = {
    requestsPerMonth: 300,
    requestsPerMinute: 30,
  };

  private getApiKey(): string {
    const apiKey = process.env.CURRENCY_API_KEY;
    if (!apiKey) {
      throw new Error('CURRENCY_API_KEY environment variable not set');
    }
    return apiKey;
  }

  async fetchRates(baseCurrency: string, targetCurrencies: string[], date?: number): Promise<ExchangeRateData[]> {
    const apiKey = this.getApiKey();
    const currencies = targetCurrencies.join(',');
    
    // Use historical endpoint if date is provided, otherwise use latest
    let url: string;
    let targetDate: number;
    
    if (date) {
      // Historical data - format date as YYYY-MM-DD
      const dateObj = new Date(date);
      const dateStr = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD format
      url = `https://api.currencyapi.com/v3/historical?apikey=${apiKey}&currencies=${currencies}&base_currency=${baseCurrency}&date=${dateStr}`;
      targetDate = getStartOfDay(date);
    } else {
      // Latest data
      url = `${this.baseUrl}?apikey=${apiKey}&currencies=${currencies}&base_currency=${baseCurrency}`;
      targetDate = getStartOfDay(Date.now());
    }
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`CurrencyAPI error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const rates: ExchangeRateData[] = [];
      const now = Date.now();

      if (data.data) {
        for (const [currency, rateInfo] of Object.entries(data.data)) {
          if (typeof rateInfo === 'object' && rateInfo !== null && 'value' in rateInfo) {
            const rate = (rateInfo as any).value;
            const pairCurrency = `${baseCurrency}/${currency}`;
            
            if (validateRate(rate, pairCurrency)) {
              rates.push({
                pairCurrency,
                rate,
                inverseRate: 1 / rate,
                date: targetDate,
                source: this.name,
                lastUpdated: now,
              });
            }
          }
        }
      }

      return rates;
    } catch (error) {
      console.error(`CurrencyAPI fetch error:`, error);
      throw new Error(`CurrencyAPI failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const apiKey = this.getApiKey();
      const response = await fetch(`${this.baseUrl}?apikey=${apiKey}&currencies=USD&base_currency=USD`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getUsageStats(): Promise<ProviderUsageStats> {
    // For free tier, we can't track usage precisely
    return {
      requestsThisMonth: 0, // Unknown for free tier
      requestsThisMinute: 0,
      lastRequestTime: Date.now(),
      isHealthy: await this.isHealthy(),
    };
  }
}

// AbstractAPI Provider - REMOVED
// Reason: Free tier returns severely outdated data (4+ years old)
// If you have a paid AbstractAPI account, you can re-enable this provider

// Provider factory
export function createProvider(providerName: string): ExchangeRateProvider {
  switch (providerName) {
    case 'currencyapi':
      return new CurrencyAPIProvider();
    case 'exchangerate-api':
      return new ExchangeRateAPIProvider();
    default:
      throw new Error(`Unknown provider: ${providerName}. Available: currencyapi, exchangerate-api`);
  }
}

// Provider manager with fallback logic
export class ExchangeRateProviderManager {
  private providers: ExchangeRateProvider[] = [];
  private currentProviderIndex = 0;

  constructor() {
    // Initialize providers in order of preference (updated based on test results)
    // Priority 1: CurrencyAPI (working perfectly with current data)
    // Priority 2: ExchangeRate-API (for redundancy when API key is added)
    this.providers = [
      new CurrencyAPIProvider(),
      new ExchangeRateAPIProvider(),
    ];
  }

  async fetchRatesWithFallback(
    baseCurrency: string,
    targetCurrencies: string[],
    date?: number
  ): Promise<ExchangeRateData[]> {
    let lastError: Error | null = null;
    
    for (let i = 0; i < this.providers.length; i++) {
      const provider = this.providers[(this.currentProviderIndex + i) % this.providers.length];
      
      try {
        const dateStr = date ? new Date(date).toISOString().split('T')[0] : 'latest';
        console.log(`Attempting to fetch rates from ${provider.name} for ${dateStr}`);
        const rates = await provider.fetchRates(baseCurrency, targetCurrencies, date);
        
        if (rates.length > 0) {
          // Success! Update current provider for next time
          this.currentProviderIndex = (this.currentProviderIndex + i) % this.providers.length;
          console.log(`Successfully fetched ${rates.length} rates from ${provider.name}`);
          return rates;
        }
      } catch (error) {
        console.warn(`Provider ${provider.name} failed:`, error instanceof Error ? error.message : String(error));
        lastError = error as Error;
        continue;
      }
    }

    // All providers failed
    throw new Error(`All exchange rate providers failed. Last error: ${lastError?.message}`);
  }

  async getProviderHealth(): Promise<Record<string, boolean>> {
    const health: Record<string, boolean> = {};
    
    for (const provider of this.providers) {
      try {
        health[provider.name] = await provider.isHealthy();
      } catch {
        health[provider.name] = false;
      }
    }
    
    return health;
  }

  getCurrentProvider(): ExchangeRateProvider {
    return this.providers[this.currentProviderIndex];
  }
}

// Default provider manager instance
export const providerManager = new ExchangeRateProviderManager();
