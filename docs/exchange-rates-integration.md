# Exchange Rates Integration - Implementation Guide

## Overview

The Exchange Rates Integration system provides real-time, multi-provider exchange rate data for PerFi's double-entry accounting ledger. This system ensures reliable currency conversion with fallback mechanisms, rate validation, and comprehensive monitoring.

## Architecture

### Core Components

1. **Exchange Rate Providers** (`convex/ledger/exchangeRateProviders.ts`)
   - Multiple API providers with fallback logic
   - Rate limiting and error handling
   - Provider health monitoring

2. **Exchange Rate Service** (`convex/ledger/exchangeRates.ts`)
   - On-demand rate fetching with caching
   - Fallback mechanisms for reliability
   - Performance optimization

3. **Rate Validation** (`convex/ledger/rateValidation.ts`)
   - Quality assurance for rate data
   - Anomaly detection
   - Multi-provider comparison

4. **Monitoring & Alerting** (`convex/ledger/rateMonitoring.ts`)
   - System health monitoring
   - Error tracking and alerting
   - Performance metrics

5. **Environment Configuration** (`convex/env.ts`)
   - Centralized configuration
   - API keys management
   - Validation rules

## API Providers

### Primary Provider: ExchangeRate-API
- **URL**: https://api.exchangerate-api.com/v4/latest
- **Free Tier**: 1,500 requests/month
- **No API Key Required**
- **Average Response Time**: ~200ms
- **Supported Currencies**: 170+

### Secondary Provider: CurrencyAPI
- **URL**: https://api.currencyapi.com/v3/latest
- **Free Tier**: 300 requests/month
- **API Key Required**: `CURRENCY_API_KEY`
- **Average Response Time**: ~150ms
- **Supported Currencies**: 170+

### Tertiary Provider: AbstractAPI
- **URL**: https://exchange-rates.abstractapi.com/v1/live
- **Free Tier**: 500 requests/month
- **API Key Required**: `ABSTRACT_API_KEY`
- **Average Response Time**: ~100ms
- **Supported Currencies**: 150+

## Supported Currency Pairs

The system supports the following major currency pairs:
- USD/ARS (US Dollar to Argentine Peso)
- EUR/ARS (Euro to Argentine Peso)
- USD/EUR (US Dollar to Euro)
- ARS/USD (Argentine Peso to US Dollar)
- ARS/EUR (Argentine Peso to Euro)
- EUR/USD (Euro to US Dollar)

## Usage Examples

### 1. Get Current Exchange Rate

```typescript
import { getCurrentExchangeRate } from "../convex/ledger/fx";

// Get current USD/ARS rate
const rateResult = await getCurrentExchangeRate({
  fromCurrency: "USD",
  toCurrency: "ARS"
});

console.log(`Rate: ${rateResult.rate}`);
console.log(`Source: ${rateResult.source}`); // 'cache', 'API', or 'fallback'
console.log(`Cached: ${rateResult.cached}`);
```

### 2. Convert Amount

```typescript
import { convertAmountPublic } from "../convex/ledger/fx";

// Convert 100 USD to ARS
const conversion = await convertAmountPublic({
  amount: 100,
  fromCurrency: "USD",
  toCurrency: "ARS"
});

console.log(`${conversion.originalAmount} ${conversion.fromCurrency} = ${conversion.convertedAmount} ${conversion.toCurrency}`);
console.log(`Rate used: ${conversion.rate}`);
```

### 3. Get Historical Rate

```typescript
import { getExchangeRateForDate } from "../convex/ledger/fx";

// Get rate for specific date
const historicalRate = await getExchangeRateForDate({
  fromCurrency: "USD",
  toCurrency: "ARS",
  date: getStartOfDay(new Date('2024-01-15'))
});

if (historicalRate) {
  console.log(`Historical rate: ${historicalRate.rate} from ${historicalRate.source}`);
}
```

### 4. Batch Fetch Rates

```typescript
import { batchFetchRates } from "../convex/ledger/exchangeRates";

// Fetch multiple rates at once
const results = await batchFetchRates({
  currencyPairs: ["USD/ARS", "EUR/ARS", "USD/EUR"]
});

results.forEach(result => {
  console.log(`${result.pair}: ${result.success ? 'Success' : 'Failed'}`);
});
```

### 5. Get Rate History

```typescript
import { getRateHistory } from "../convex/ledger/exchangeRates";

// Get last 30 days of rates
const history = await getRateHistory({
  fromCurrency: "USD",
  toCurrency: "ARS",
  days: 30
});

console.log(`Found ${history.length} historical rates`);
history.forEach(rate => {
  console.log(`${new Date(rate.date).toISOString()}: ${rate.rate}`);
});
```

## Performance Characteristics

### Response Times
- **Cached Rate Queries**: < 50ms
- **API Fetch Operations**: < 3 seconds
- **Total User Experience**: < 5 seconds
- **Fallback Rates**: < 100ms

### Caching Strategy
- **Database Cache**: Daily rates stored permanently
- **In-Memory Cache**: Frequently accessed rates
- **Cache TTL**: 5 minutes for API responses
- **Fallback Strategy**: Use most recent cached rate

## Rate Validation

### Validation Rules
The system validates rates against predefined rules:

```typescript
const validationRules = {
  'USD/ARS': { min: 100, max: 2000, maxChangePerHour: 0.05 },
  'EUR/ARS': { min: 120, max: 2500, maxChangePerHour: 0.05 },
  'USD/EUR': { min: 0.8, max: 1.2, maxChangePerHour: 0.03 },
  // ... more rules
};
```

### Quality Assurance
- **Rate Bounds Checking**: Ensures rates are within reasonable ranges
- **Change Velocity Limits**: Prevents unrealistic rate changes
- **Multi-Provider Comparison**: Cross-validates rates from different sources
- **Anomaly Detection**: Identifies unusual rate patterns

## Monitoring and Alerting

### Health Checks
```typescript
import { healthCheck } from "../convex/ledger/rateMonitoring";

const health = await healthCheck();
console.log(`System healthy: ${health.healthy}`);
console.log(`Stale rates: ${health.details.staleRates}`);
console.log(`Unhealthy providers: ${health.details.unhealthyProviders}`);
```

### Metrics
- **API Response Times**: Track performance per provider
- **Error Rates**: Monitor failure rates
- **Rate Freshness**: Ensure rates are up-to-date
- **Provider Availability**: Monitor provider health

### Alerts
The system generates alerts for:
- Provider failures
- Stale rate data (>24 hours old)
- Rate anomalies (>10% change)
- High error rates (>5%)

## Configuration

### Environment Variables
Set the following environment variables for full functionality:

```bash
# Optional: For CurrencyAPI provider
CURRENCY_API_KEY=your_currency_api_key

# Optional: For AbstractAPI provider  
ABSTRACT_API_KEY=your_abstract_api_key
```

### Configuration Options
Modify `convex/env.ts` to adjust:
- Provider priorities
- Rate validation rules
- Performance thresholds
- Monitoring settings

## Error Handling

### Fallback Mechanisms
1. **Primary Provider Fails**: Automatically switch to secondary
2. **Secondary Provider Fails**: Switch to tertiary
3. **All Providers Fail**: Use most recent cached rate
4. **No Cached Rate**: Use reasonable default rate

### Error Types
- `API_UNAVAILABLE`: Provider is down
- `RATE_LIMIT_EXCEEDED`: API quota exceeded
- `INVALID_RESPONSE`: Malformed API response
- `RATE_VALIDATION_FAILED`: Rate outside acceptable bounds
- `NETWORK_ERROR`: Network connectivity issues
- `TIMEOUT`: Request timeout

## Integration with Ledger System

### FX Conversion in Journal Entries
```typescript
import { convertAmount } from "../convex/ledger/fx";

// Convert amount for journal entry
const conversion = await convertAmount({
  amount: 10000, // Amount in minor units
  fromCurrency: "USD",
  toCurrency: "ARS",
  date: entryDate,
  userExchangeRate: userRate, // Optional user rate
  exchangeRateId: rateId // Optional official rate ID
});
```

### Rate Storage
The system automatically stores rates in the `exchange_rates` table:
- **pairCurrency**: Currency pair (e.g., "USD/ARS")
- **rate**: Direct conversion rate
- **inverseRate**: Inverse conversion rate
- **date**: Effective date (UTC day boundary)
- **source**: Provider identifier

## Testing

### Test Functions
Use the test functions in `convex/ledger/exchangeRates.test.ts` to verify functionality:

```typescript
// Test rate fetching
await testExchangeRateFetching({ fromCurrency: "USD", toCurrency: "ARS" });

// Test amount conversion
await testAmountConversion({ amount: 100, fromCurrency: "USD", toCurrency: "ARS" });

// Test batch operations
await testBatchRateFetching({ currencyPairs: ["USD/ARS", "EUR/ARS"] });
```

## Best Practices

### 1. Always Use Public Queries
Use the public queries (`getCurrentExchangeRate`, `convertAmountPublic`) rather than internal functions for application code.

### 2. Handle Fallback Scenarios
Always check the `source` field to understand where the rate came from:
- `'cache'`: Rate was cached (fastest)
- `'API'`: Rate was fetched from provider
- `'fallback'`: Using cached/default rate due to API failure

### 3. Monitor System Health
Regularly check system health and provider status:
```typescript
const health = await healthCheck();
if (!health.healthy) {
  // Handle degraded service
}
```

### 4. Validate Critical Rates
For high-value transactions, consider additional validation:
```typescript
const validation = await validateExchangeRate({
  rate: fetchedRate,
  currencyPair: "USD/ARS"
});
if (!validation.isValid) {
  // Handle invalid rate
}
```

### 5. Use Batch Operations
When fetching multiple rates, use batch operations for efficiency:
```typescript
const rates = await batchFetchRates({
  currencyPairs: ["USD/ARS", "EUR/ARS", "USD/EUR"]
});
```

## Troubleshooting

### Common Issues

1. **No API Keys Set**
   - Solution: Set `CURRENCY_API_KEY` and `ABSTRACT_API_KEY` environment variables
   - Fallback: System will use ExchangeRate-API (no key required)

2. **Rate Validation Failures**
   - Check if rate is within acceptable bounds
   - Verify currency pair is supported
   - Review validation rules in configuration

3. **Provider Failures**
   - Check provider health status
   - Verify network connectivity
   - Review error logs for specific issues

4. **Stale Rates**
   - Ensure providers are responding
   - Check for rate limit exceeded errors
   - Verify system is fetching rates regularly

### Debug Information
Enable debug logging by setting log level to 'debug' in configuration:
```typescript
// In convex/env.ts
export const monitoringConfig = {
  logLevel: 'debug',
  // ...
};
```

## Future Enhancements

### Planned Features
- **Cryptocurrency Support**: Bitcoin, Ethereum, etc.
- **Real-time Streaming**: WebSocket-based rate updates
- **Historical Analysis**: Trend analysis and forecasting
- **User-defined Rates**: Manual rate entry capabilities
- **Rate Alerts**: User notifications for rate changes
- **Advanced Analytics**: Rate volatility analysis

### Integration Opportunities
- **Budget System**: Multi-currency budget tracking
- **Transfer System**: Cross-currency transfers
- **Reporting**: Multi-currency financial reports
- **Tax Calculations**: Currency conversion for tax purposes

## Support

For issues or questions:
1. Check the monitoring dashboard for system health
2. Review error logs for specific error messages
3. Verify configuration and environment variables
4. Test with the provided test functions
5. Check provider API status independently

The exchange rate integration system is designed to be robust, performant, and reliable. With proper configuration and monitoring, it provides accurate, real-time exchange rate data for all multi-currency operations in PerFi.
