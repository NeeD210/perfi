/**
 * Environment Configuration
 * 
 * This module provides centralized environment configuration for the application,
 * including exchange rate API settings and other environment variables.
 */

// Exchange rate configuration
export const exchangeRateConfig = {
  // Primary provider configuration (updated based on test results)
  primaryProvider: "currencyapi",  // Working perfectly with current data
  secondaryProvider: "exchangerate-api",  // Recommended for redundancy
  
  // API Keys
  exchangeRateApiKey: process.env.EXCHANGE_RATE_API_KEY,
  currencyApiKey: process.env.CURRENCY_API_KEY,
  
  // Rate limits and timing
  cacheEnabled: true,
  rateValidationEnabled: true,
  fallbackEnabled: true,
  
  // Monitoring thresholds
  staleRateThresholdHours: 24,
  maxRateChangePerHour: 0.1, // 10%
  apiTimeoutMs: 10000, // 10 seconds
  
  // Major currency pairs we support
  supportedCurrencyPairs: [
    'USD/ARS', 'EUR/ARS', 'USD/EUR',
    'ARS/USD', 'ARS/EUR', 'EUR/USD'
  ],
  
  // Default fallback rates (reasonable defaults for major pairs)
  defaultRates: {
    'USD/ARS': 950,
    'EUR/ARS': 1020,
    'USD/EUR': 0.93,
    'ARS/USD': 0.00105,
    'ARS/EUR': 0.00098,
    'EUR/USD': 1.08,
  },
  
  // Rate validation rules
  validationRules: {
    'USD/ARS': { min: 100, max: 2000, maxChangePerHour: 0.05 },
    'EUR/ARS': { min: 120, max: 2500, maxChangePerHour: 0.05 },
    'USD/EUR': { min: 0.8, max: 1.2, maxChangePerHour: 0.03 },
    'ARS/USD': { min: 0.0005, max: 0.01, maxChangePerHour: 0.05 },
    'ARS/EUR': { min: 0.0004, max: 0.008, maxChangePerHour: 0.05 },
    'EUR/USD': { min: 0.83, max: 1.25, maxChangePerHour: 0.03 },
  },
};

// Provider-specific configuration (AbstractAPI removed - outdated data)
export const providerConfig = {
  'currencyapi': {
    name: 'currencyapi',
    baseUrl: 'https://api.currencyapi.com/v3/latest',
    requiresApiKey: true,
    apiKeyEnvVar: 'CURRENCY_API_KEY',
    rateLimit: {
      requestsPerMonth: 300,
      requestsPerMinute: 30,
    },
    timeout: 10000,
    priority: 1,  // Primary - working with current data
    supportsHistorical: true,
    historicalEndpoint: 'https://api.currencyapi.com/v3/historical',
  },
  'exchangerate-api': {
    name: 'exchangerate-api',
    baseUrl: 'https://v6.exchangerate-api.com/v6',
    requiresApiKey: true,
    apiKeyEnvVar: 'EXCHANGE_RATE_API_KEY',
    rateLimit: {
      requestsPerMonth: 1500,
      requestsPerMinute: 60,
    },
    timeout: 10000,
    priority: 2,  // Secondary - for redundancy
    supportsHistorical: true,
    historicalEndpoint: 'https://v6.exchangerate-api.com/v6',
  },
};

// Performance thresholds
export const performanceThresholds = {
  // Response time thresholds (in milliseconds)
  cacheHitMaxTime: 50,
  apiFetchMaxTime: 3000,
  totalUserExperienceMaxTime: 5000,
  
  // Error rate thresholds
  maxErrorRate: 0.1, // 10%
  maxConsecutiveFailures: 3,
  
  // Health check intervals
  healthCheckIntervalMs: 300000, // 5 minutes
  staleDataThresholdMs: 24 * 60 * 60 * 1000, // 24 hours
};

// Monitoring and alerting configuration
export const monitoringConfig = {
  enabled: true,
  logLevel: 'info', // 'debug', 'info', 'warn', 'error'
  
  // Alert thresholds
  alertThresholds: {
    providerFailure: {
      severity: 'high',
      threshold: 1, // Immediate alert on any failure
    },
    staleRates: {
      severity: 'medium',
      thresholdHours: 24,
    },
    rateAnomaly: {
      severity: 'high',
      thresholdPercentage: 0.1, // 10% change
    },
    highErrorRate: {
      severity: 'medium',
      threshold: 0.05, // 5% error rate
    },
  },
  
  // Metrics retention
  metricsRetentionDays: 30,
  alertRetentionDays: 7,
};

// Validation function to check if required environment variables are set
export function validateEnvironment(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  // Check for required API keys (AbstractAPI removed)
  if (providerConfig['currencyapi'].requiresApiKey && !exchangeRateConfig.currencyApiKey) {
    missing.push('CURRENCY_API_KEY');
  }
  
  if (providerConfig['exchangerate-api'].requiresApiKey && !exchangeRateConfig.exchangeRateApiKey) {
    missing.push('EXCHANGE_RATE_API_KEY (optional - for redundancy)');
  }
  
  return {
    valid: exchangeRateConfig.currencyApiKey !== undefined, // Only CurrencyAPI is required
    missing,
  };
}

// Get provider configuration by name
export function getProviderConfig(providerName: string) {
  return (providerConfig as Record<string, any>)[providerName] || null;
}

// Get all configured providers in priority order
export function getProvidersInPriorityOrder() {
  return Object.values(providerConfig)
    .sort((a, b) => a.priority - b.priority)
    .map(p => p.name);
}

// Check if a currency pair is supported
export function isCurrencyPairSupported(pair: string): boolean {
  return exchangeRateConfig.supportedCurrencyPairs.includes(pair);
}

// Get default rate for a currency pair
export function getDefaultRate(pair: string): number {
  return (exchangeRateConfig.defaultRates as Record<string, number>)[pair] || 1;
}

// Get validation rules for a currency pair
export function getValidationRules(pair: string) {
  return (exchangeRateConfig.validationRules as Record<string, any>)[pair] || null;
}
