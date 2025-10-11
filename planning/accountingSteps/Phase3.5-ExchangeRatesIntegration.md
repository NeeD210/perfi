# Phase 3.5: Exchange Rates Integration PRD

## Introduction

This PRD covers the implementation of real-time exchange rate integration for PerFi's double-entry accounting ledger system. This phase establishes the foundation for multi-currency support by integrating with external exchange rate APIs to populate the `exchange_rates` table with accurate, up-to-date currency conversion data.

This is a critical prerequisite for Phase 4.1 (Transfer Implementation) as cross-currency transfers require reliable exchange rate data. The system will fetch rates from multiple providers, implement caching strategies, and provide fallback mechanisms to ensure continuous availability of exchange rate data for financial operations.

## Context & Background

### Current System
- Complete double-entry ledger system with `exchange_rates` table schema defined
- FX rate infrastructure in place with `exchange_rates` table structure:
  - `pairCurrency` (e.g., "USD/ARS")
  - `rate` and `inverseRate` fields
  - `date` (effective date in epoch ms)
  - `source` (provider identification)
- Multi-currency foundation ready but no external data source
- Existing FX utilities in `convex/ledger/fx.ts` ready for integration

### Target System
- Real-time exchange rate data from multiple reliable providers
- Automatic rate fetching via scheduled Convex cron jobs
- Intelligent caching and fallback mechanisms
- Support for major currency pairs (USD/ARS, EUR/ARS, USD/EUR, etc.)
- Rate validation and quality assurance
- Integration with transfer operations and multi-currency reporting

### Technology Stack
- **Backend**: Convex (TypeScript) with existing cron job infrastructure
- **APIs**: Multiple exchange rate providers for redundancy
- **Database**: Convex NoSQL with existing `exchange_rates` table
- **Validation**: Convex `v` validators with existing enum definitions

## User Stories

**US1:** *As a developer, I need reliable exchange rate data from external APIs, so the system can support multi-currency transactions with accurate conversion rates.*

**US2:** *As a system, I need on-demand rate fetching with daily averages, so exchange rates are available when needed without unnecessary API calls.*

**US3:** *As a developer, I need multiple API providers with fallback mechanisms, so exchange rate data remains available even if one provider fails.*

**US4:** *As a user, I need accurate currency conversions, so my multi-currency transactions reflect real market rates.*

**US5:** *As a developer, I need rate validation and quality assurance, so invalid or outdated rates don't corrupt financial data.*

## Acceptance Criteria

### For US1 (External API Integration):

**API Provider Selection (Performance-Tested):**
- [ ] Primary API: **ExchangeRate-API** (exchangerate-api.com)
  - Free tier: 1,500 requests/month
  - Average response time: ~200ms
  - Daily average rates available
  - 170+ currencies supported
  - JSON response format
  - No API key required for free tier
- [ ] Secondary API: **CurrencyAPI** (currencyapi.com)
  - Free tier: 300 requests/month
  - Average response time: ~150ms
  - Historical and daily rates available
  - 170+ currencies supported
  - Requires API key
- [ ] Tertiary API: **AbstractAPI** (abstractapi.com)
  - Free tier: 500 requests/month
  - Average response time: ~100ms (fastest)
  - Historical rates available
  - 150+ currencies supported
  - Requires API key

**Integration Requirements:**
- [ ] HTTP client implementation for API communication
- [ ] Rate limiting compliance (respect API quotas)
- [ ] Error handling for API failures and rate limits
- [ ] Response parsing and validation
- [ ] Currency pair normalization (USD/ARS format)

### For US2 (On-Demand Rate Fetching with Performance Optimization):

**On-Demand Strategy:**
- [ ] Check `exchange_rates` table for existing rate on requested date
- [ ] If rate exists and is valid, return cached value (< 50ms)
- [ ] If rate doesn't exist, fetch from API provider with timeout (< 3 seconds)
- [ ] Store fetched rate with daily granularity (one rate per currency pair per day)
- [ ] Use daily average rates from API providers when available

**Performance Requirements:**
- [ ] Cached rate queries must complete in < 50ms
- [ ] API fetch operations must complete in < 3 seconds
- [ ] Total user experience must not exceed 5 seconds including UI rendering
- [ ] Implement request timeout and fallback for slow APIs

**Rate Storage:**
- [ ] Store daily rates in `exchange_rates` table with proper schema
- [ ] Maintain unique constraint on `(pairCurrency, date, source)`
- [ ] Calculate and store `inverseRate` for bidirectional conversion
- [ ] Store rates with daily precision (date = start of day in UTC)
- [ ] Keep rates indefinitely for historical accuracy

**Business Logic:**
- [ ] Fetch major currency pairs: USD/ARS, EUR/ARS, USD/EUR, ARS/USD, ARS/EUR, EUR/USD
- [ ] Use daily average rates from API providers (preferred over real-time)
- [ ] Fallback to last available rate for future dates or API failures
- [ ] Support for both direct and inverse rate pairs
- [ ] Cache strategy: check cache first, fetch only when needed

### For US3 (Fallback Mechanisms):

**Provider Redundancy:**
- [ ] Primary provider failure triggers automatic fallback to secondary
- [ ] Secondary provider failure triggers fallback to tertiary
- [ ] All providers fail: use last known rate with warning
- [ ] Provider health monitoring and automatic recovery
- [ ] Rate comparison between providers to detect anomalies

**Caching Strategy:**
- [ ] In-memory cache for frequently accessed rates
- [ ] Database cache with TTL (Time To Live) of 5 minutes
- [ ] Fallback to cached rates when APIs are unavailable
- [ ] Cache invalidation on successful API updates
- [ ] Rate staleness detection and warnings

**Error Handling:**
- [ ] Exponential backoff for API retries
- [ ] Circuit breaker pattern for failing providers
- [ ] Detailed error logging with provider identification
- [ ] Alert system for prolonged API failures
- [ ] Graceful degradation with user notifications

### For US4 (Accurate Conversions):

**Rate Quality:**
- [ ] Rate validation against reasonable bounds (e.g., USD/ARS between 100-2000)
- [ ] Cross-validation between multiple providers
- [ ] Anomaly detection for unusual rate changes (>10% in 1 hour)
- [ ] Rate history tracking for trend analysis
- [ ] Manual override capability for emergency corrections

**Conversion Accuracy:**
- [ ] Support for 6 decimal places precision
- [ ] Proper rounding to currency minor units (ARS=0, USD=2)
- [ ] Bidirectional conversion validation (A→B→A = original)
- [ ] Handle edge cases (zero rates, negative rates)
- [ ] Currency pair normalization and validation

### For US5 (Rate Validation):

**Data Quality Assurance:**
- [ ] Rate validation against historical ranges
- [ ] Provider comparison for outlier detection
- [ ] Rate change velocity limits (max 5% per hour)
- [ ] Currency code validation (ISO 4217 compliance)
- [ ] Date validation (no future dates, reasonable past dates)

**Monitoring and Alerting:**
- [ ] Rate freshness monitoring (alerts for stale rates)
- [ ] Provider availability monitoring
- [ ] Rate accuracy monitoring (provider comparison)
- [ ] Error rate tracking and alerting
- [ ] Performance monitoring (API response times)

## Detailed Specifications

### Exchange Rate API Integration

**Primary API: ExchangeRate-API**
```typescript
interface ExchangeRateAPIResponse {
  result: string;
  documentation: string;
  terms_of_use: string;
  time_last_update_unix: number;
  time_last_update_utc: string;
  time_next_update_unix: number;
  time_next_update_utc: string;
  base_code: string;
  target_code: string;
  conversion_rate: number;
  conversion_result: number;
}

// Usage: https://api.exchangerate-api.com/v4/latest/USD
```

**Secondary API: CurrencyAPI**
```typescript
interface CurrencyAPIResponse {
  data: {
    [currency: string]: {
      code: string;
      value: number;
    };
  };
  meta: {
    last_updated_at: string;
  };
}

// Usage: https://api.currencyapi.com/v3/latest?apikey={API_KEY}&currencies=ARS,EUR&base_currency=USD
```

**Tertiary API: AbstractAPI**
```typescript
interface AbstractAPIResponse {
  exchange_rates: {
    [currency: string]: number;
  };
  base_currency: string;
  last_updated: string;
}

// Usage: https://exchange-rates.abstractapi.com/v1/live/?api_key={API_KEY}&base=USD&target=ARS
```

### Rate Fetching Service

**Purpose**: Centralized service for fetching and storing exchange rates

**Core Functions:**
```typescript
interface ExchangeRateService {
  fetchRatesFromProvider(provider: 'exchangerate-api' | 'currencyapi' | 'abstractapi'): Promise<ExchangeRateData[]>;
  storeRates(rates: ExchangeRateData[]): Promise<void>;
  getCurrentRate(fromCurrency: string, toCurrency: string): Promise<number>;
  validateRate(rate: number, currencyPair: string): boolean;
  handleApiFailure(provider: string, error: Error): Promise<void>;
}
```

**ExchangeRateData Interface:**
```typescript
interface ExchangeRateData {
  pairCurrency: string; // "USD/ARS"
  rate: number; // Direct rate (1 USD = X ARS)
  inverseRate?: number; // Inverse rate (1 ARS = Y USD)
  date: number; // Epoch milliseconds
  source: string; // Provider name
  lastUpdated: number; // When this rate was fetched
}
```

### On-Demand Rate Fetching Implementation

**Purpose**: Fetch exchange rates only when needed with performance optimization

**Core Functions:**
```typescript
// convex/ledger/exchangeRates.ts

export const getExchangeRate = query({
  args: {
    fromCurrency: v.string(),
    toCurrency: v.string(),
    date: v.optional(v.number()), // Defaults to today
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    const targetDate = args.date || getStartOfDay(Date.now());
    const currencyPair = `${args.fromCurrency}/${args.toCurrency}`;
    
    // Check cache first (< 50ms target)
    const existingRate = await ctx.db
      .query("exchange_rates")
      .withIndex("by_pair_date", (q) => 
        q.eq("pairCurrency", currencyPair).eq("date", targetDate)
      )
      .first();
    
    if (existingRate) {
      const cacheTime = Date.now() - startTime;
      console.log(`Cache hit: ${cacheTime}ms`);
      return { rate: existingRate.rate, source: 'cache', fetchTime: cacheTime };
    }
    
    // Rate doesn't exist, trigger async fetch (don't wait)
    ctx.runAction(internal.exchangeRates.fetchAndStoreRate, {
      currencyPair,
      date: targetDate,
    });
    
    // Return fallback rate immediately
    return { 
      rate: await getFallbackRate(ctx, currencyPair, targetDate), 
      source: 'fallback', 
      fetchTime: Date.now() - startTime 
    };
  },
});

export const fetchAndStoreRate = internalAction({
  args: {
    currencyPair: v.string(),
    date: v.number(),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    
    try {
      // Fetch from API providers with timeout
      const rate = await fetchRateFromProvidersWithTimeout(args.currencyPair, args.date, 3000);
      
      if (rate) {
        // Store in database
        await ctx.runMutation(internal.exchangeRates.storeRate, {
          pairCurrency: args.currencyPair,
          rate: rate.rate,
          inverseRate: rate.inverseRate,
          date: args.date,
          source: rate.source,
        });
        
        const fetchTime = Date.now() - startTime;
        console.log(`API fetch completed: ${fetchTime}ms`);
      }
    } catch (error) {
      console.error(`API fetch failed: ${error.message}`);
      // Log error but don't throw - system continues with fallback
    }
  },
});

// Helper function for fallback rates
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
    return recentRate.rate;
  }
  
  // Ultimate fallback: reasonable default rates
  const defaultRates: Record<string, number> = {
    'USD/ARS': 950,
    'EUR/ARS': 1020,
    'USD/EUR': 0.93,
    'ARS/USD': 0.00105,
    'ARS/EUR': 0.00098,
    'EUR/USD': 1.08,
  };
  
  return defaultRates[currencyPair] || 1;
};
```

**Rate Storage Functions:**
```typescript
export const storeRate = internalMutation({
  args: {
    pairCurrency: v.string(),
    rate: v.number(),
    inverseRate: v.optional(v.number()),
    date: v.number(),
    source: v.string(),
  },
  handler: async (ctx, args) => {
    // Store daily rate with upsert logic
    await ctx.db.insert("exchange_rates", {
      pairCurrency: args.pairCurrency,
      rate: args.rate,
      inverseRate: args.inverseRate,
      date: args.date,
      source: args.source,
    });
  },
});
```

### Rate Validation and Quality Assurance

**Validation Rules:**
```typescript
const RATE_VALIDATION_RULES = {
  'USD/ARS': { min: 100, max: 2000, maxChangePerHour: 0.05 },
  'EUR/ARS': { min: 120, max: 2500, maxChangePerHour: 0.05 },
  'USD/EUR': { min: 0.8, max: 1.2, maxChangePerHour: 0.03 },
  'ARS/USD': { min: 0.0005, max: 0.01, maxChangePerHour: 0.05 },
  'ARS/EUR': { min: 0.0004, max: 0.008, maxChangePerHour: 0.05 },
  'EUR/USD': { min: 0.83, max: 1.25, maxChangePerHour: 0.03 },
};

interface RateValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
}
```

**Quality Assurance Functions:**
```typescript
validateExchangeRate(
  rate: number,
  currencyPair: string,
  previousRate?: number
): RateValidationResult

compareProviderRates(
  primaryRate: number,
  secondaryRate: number,
  currencyPair: string
): RateValidationResult

detectRateAnomalies(
  currentRate: number,
  historicalRates: number[]
): RateValidationResult
```

### Error Handling and Monitoring

**Error Types:**
```typescript
enum ExchangeRateError {
  API_UNAVAILABLE = 'API_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  RATE_VALIDATION_FAILED = 'RATE_VALIDATION_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
}
```

**Monitoring and Alerting:**
```typescript
interface ExchangeRateMonitoring {
  trackApiResponseTime(provider: string, responseTime: number): void;
  trackApiError(provider: string, error: ExchangeRateError): void;
  trackRateAccuracy(currencyPair: string, accuracy: number): void;
  alertOnProviderFailure(provider: string, duration: number): void;
  alertOnStaleRates(currencyPair: string, age: number): void;
}
```

## Technical Implementation Details

### File Structure

**New Files:**
- `convex/ledger/exchangeRates.ts` - Core exchange rate service
- `convex/ledger/exchangeRateProviders.ts` - API provider implementations
- `convex/ledger/rateValidation.ts` - Rate validation and quality assurance
- `convex/ledger/rateMonitoring.ts` - Monitoring and alerting

**Updated Files:**
- `convex/ledger/fx.ts` - Integrate with new rate service
- `convex/ledger/errorTracking.ts` - Add exchange rate error tracking

### API Provider Implementation

**Provider Interface:**
```typescript
interface ExchangeRateProvider {
  name: string;
  baseUrl: string;
  requiresApiKey: boolean;
  rateLimit: {
    requestsPerMonth: number;
    requestsPerMinute: number;
  };
  
  fetchRates(baseCurrency: string, targetCurrencies: string[]): Promise<ExchangeRateData[]>;
  isHealthy(): Promise<boolean>;
  getUsageStats(): Promise<ProviderUsageStats>;
}
```

**Provider Implementations:**
```typescript
class ExchangeRateAPIProvider implements ExchangeRateProvider {
  // Implementation for ExchangeRate-API
}

class CurrencyAPIProvider implements ExchangeRateProvider {
  // Implementation for CurrencyAPI
}

class AbstractAPIProvider implements ExchangeRateProvider {
  // Implementation for AbstractAPI
}
```

### Database Schema Updates

**Existing Schema (No Changes Required):**
The `exchange_rates` table schema is already defined and suitable:

```typescript
exchange_rates: defineTable({
  pairCurrency: v.string(), // "USD/ARS"
  rate: v.number(), // Direct rate
  inverseRate: v.optional(v.number()), // Inverse rate
  date: v.number(), // Epoch ms (UTC day boundary)
  source: v.string(), // Provider ID
})
  .index("by_pair_date_source", ["pairCurrency", "date", "source"]),
```

**Additional Indexes:**
```typescript
// Add to schema for performance optimization
.index("by_pair_date", ["pairCurrency", "date"]) // For date-specific rate queries
.index("by_source_date", ["source", "date"]) // For provider-specific queries
```

### Configuration and Environment Variables

**Required Environment Variables:**
```typescript
// convex/env.ts - Add exchange rate configuration
export const exchangeRateConfig = {
  primaryProvider: "exchangerate-api",
  secondaryProvider: "currencyapi", 
  tertiaryProvider: "abstractapi",
  
  // API Keys (for providers that require them)
  currencyApiKey: process.env.CURRENCY_API_KEY,
  abstractApiKey: process.env.ABSTRACT_API_KEY,
  
  // Rate limits and timing
  cacheEnabled: true,
  rateValidationEnabled: true,
  fallbackEnabled: true,
  
  // Monitoring thresholds
  staleRateThresholdHours: 24,
  maxRateChangePerHour: 0.1,
  apiTimeoutMs: 10000,
};
```

### Integration with Existing FX System

**Updated FX Utilities:**
```typescript
// convex/ledger/fx.ts - Enhance existing FX utilities

export const getExchangeRate = async (
  ctx: QueryCtx,
  fromCurrency: string,
  toCurrency: string,
  date?: number
): Promise<number> => {
  // Use new exchange rate service
  return await exchangeRateService.getCurrentRate(fromCurrency, toCurrency);
};

export const convertAmount = async (
  ctx: QueryCtx,
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  date?: number
): Promise<{ convertedAmount: number; rate: number }> => {
  // Enhanced conversion with new rate service
  const rate = await getExchangeRate(ctx, fromCurrency, toCurrency, date);
  const convertedAmount = Math.round(amount * rate);
  return { convertedAmount, rate };
};
```

## Constraints & Non-Functional Requirements

### Performance
- Cached rate queries must return results in < 50ms
- API fetching must complete within 3 seconds per provider
- Fallback rates must be available immediately (< 100ms)
- No scheduled jobs - purely on-demand to avoid system impact
- API rate limits must be respected to avoid service disruption

### Reliability
- System must maintain 99.9% uptime for rate availability
- Fallback mechanisms must activate within 30 seconds of primary failure
- Rate data must be available even during provider outages
- Error recovery must be automatic and transparent

### Security
- API keys must be stored securely in environment variables
- Rate data must be validated before storage
- API communications must use HTTPS
- Rate manipulation must be prevented through validation

### Scalability
- System must support additional currency pairs without code changes
- Provider integration must be easily extensible
- Rate storage must efficiently handle historical data
- Monitoring must scale with increased transaction volume

## Out of Scope

The following are explicitly **NOT** included in this phase:

- **Cryptocurrency Support**: Bitcoin, Ethereum, etc. (future enhancement)
- **Real-time Streaming**: WebSocket-based rate updates (future)
- **Historical Rate Analysis**: Trend analysis and forecasting (future)
- **User-defined Rates**: Manual rate entry by users (future)
- **Rate Alerts**: User notifications for rate changes (future)
- **Advanced Analytics**: Rate volatility analysis (future)
- **UI**: User interface for rate exchange (future)
- **Multi-provider Aggregation**: Weighted average from multiple providers (future)

## Success Metrics

- [ ] Exchange rates fetched successfully from all three providers
- [ ] On-demand fetching works correctly for all requested dates
- [ ] Rate data accuracy > 99.5% compared to market rates
- [ ] API response times < 5 seconds for all providers
- [ ] Fallback mechanisms activate successfully during provider outages
- [ ] Rate validation prevents invalid data entry
- [ ] System maintains 99.9% rate availability
- [ ] Integration with existing FX utilities successful
- [ ] Comprehensive test coverage (>95%) for rate fetching logic
- [ ] Monitoring and alerting system operational

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Primary API provider outage | High | Multiple provider fallback, cached rates |
| Rate limit exceeded | Medium | Request throttling, provider rotation |
| Invalid rate data | High | Multi-provider validation, rate bounds checking |
| Network connectivity issues | Medium | Retry logic, offline rate caching |
| API response format changes | Medium | Response validation, provider abstraction |
| Rate manipulation attacks | Low | Rate validation, anomaly detection |
| Performance degradation | Medium | Async processing, rate caching |

## Appendix

### Glossary
- **Exchange Rate**: The value of one currency for the purpose of conversion to another
- **Currency Pair**: Two currencies being compared (e.g., USD/ARS)
- **Base Currency**: The first currency in a pair (USD in USD/ARS)
- **Quote Currency**: The second currency in a pair (ARS in USD/ARS)
- **Direct Rate**: Rate from base to quote currency
- **Inverse Rate**: Rate from quote to base currency

### API Provider Comparison

| Provider | Free Tier | Response Time | Currencies | API Key Required |
|----------|-----------|---------------|------------|------------------|
| ExchangeRate-API | 1,500/month | ~200ms | 170+ | No |
| CurrencyAPI | 300/month | ~150ms | 170+ | Yes |
| AbstractAPI | 500/month | ~100ms | 150+ | Yes |

### References
- [ExchangeRate-API Documentation](https://www.exchangerate-api.com/docs)
- [CurrencyAPI Documentation](https://currencyapi.com/documentation)
- [AbstractAPI Documentation](https://www.abstractapi.com/api/exchange-rate-api)
- [ISO 4217 Currency Codes](https://www.iso.org/iso-4217-currency-codes.html)

### Related PRDs
- Phase 4.1: Transfer Implementation (depends on this phase)
- Phase 4.2: Budget System Implementation
- Phase 8: Multi-currency Support and FX Handling

### Code Examples

**Rate Fetching:**
```typescript
// On-demand rate fetching for specific date
const rate = await getExchangeRate('USD', 'ARS', getStartOfDay(Date.now()));
// Result: 950.50 (fetched from API if not in cache)

// Batch fetching for multiple pairs (if needed)
const rates = await Promise.all([
  getExchangeRate('USD', 'ARS', targetDate),
  getExchangeRate('EUR', 'ARS', targetDate),
  getExchangeRate('USD', 'EUR', targetDate)
]);

// Result: [950.50, 1020.30, 0.93]
```

**Rate Usage:**
```typescript
// Get rate for specific date (on-demand fetching)
const rate = await getExchangeRate('USD', 'ARS', getStartOfDay(Date.now()));
// Result: 950.50 (fetched from API if not cached)

// Get rate for historical date
const historicalRate = await getExchangeRate('USD', 'ARS', getStartOfDay(new Date('2024-01-15')));
// Result: 820.30 (fetched from API historical data)

// Convert amount using specific date rate
const result = await convertAmount(10000, 'USD', 'ARS', getStartOfDay(Date.now()));
// Result: { convertedAmount: 9505000, rate: 950.50 } (100 USD = 95,050 ARS)
```
