/**
 * Exchange Rate Monitoring and Alerting
 * 
 * This module provides comprehensive monitoring and alerting for exchange rate
 * operations, including API health, rate freshness, and error tracking.
 */

import { query, internalQuery, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

// Error types for exchange rate operations
export enum ExchangeRateError {
  API_UNAVAILABLE = 'API_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  RATE_VALIDATION_FAILED = 'RATE_VALIDATION_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  TIMEOUT = 'TIMEOUT',
  INVALID_CURRENCY_PAIR = 'INVALID_CURRENCY_PAIR',
}

// Monitoring thresholds
const MONITORING_THRESHOLDS = {
  staleRateThresholdHours: 24,
  maxRateChangePerHour: 0.1, // 10%
  apiTimeoutMs: 10000,
  maxErrorRate: 0.1, // 10%
  healthCheckIntervalMs: 300000, // 5 minutes
};

export interface ExchangeRateMetrics {
  provider: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  lastRequestTime: number;
  lastSuccessfulRequest: number;
  errorRate: number;
  isHealthy: boolean;
}

export interface RateAlert {
  id: string;
  type: 'provider_failure' | 'stale_rates' | 'rate_anomaly' | 'high_error_rate';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: number;
  resolved: boolean;
  resolvedAt?: number;
  metadata?: Record<string, any>;
}

/**
 * Track API response time and success/failure
 */
export const trackApiMetrics = internalMutation({
  args: {
    provider: v.string(),
    responseTime: v.number(),
    success: v.boolean(),
    errorType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { provider, responseTime, success, errorType } = args;
    const now = Date.now();

    // For now, we'll log metrics to console. In a production system,
    // this would be stored in a dedicated metrics table or sent to
    // an external monitoring service like DataDog, New Relic, etc.
    
    const logEntry = {
      timestamp: now,
      provider,
      responseTime,
      success,
      errorType: errorType || null,
      level: success ? 'info' : 'error',
    };

    if (success) {
      console.log(`[EXCHANGE-RATE-METRICS]`, JSON.stringify(logEntry));
    } else {
      console.error(`[EXCHANGE-RATE-METRICS]`, JSON.stringify(logEntry));
    }

    // TODO: Store in metrics table for historical analysis
    // await ctx.db.insert("exchange_rate_metrics", {
    //   provider,
    //   responseTime,
    //   success,
    //   errorType,
    //   timestamp: now,
    // });
  },
});

/**
 * Track exchange rate error
 */
export const trackExchangeRateError = internalMutation({
  args: {
    provider: v.string(),
    errorType: v.string(),
    errorMessage: v.string(),
    currencyPair: v.optional(v.string()),
    context: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { provider, errorType, errorMessage, currencyPair, context } = args;
    const now = Date.now();

    const errorLog = {
      timestamp: now,
      provider,
      errorType,
      errorMessage,
      currencyPair: currencyPair || null,
      context: context || {},
      level: 'error',
    };

    console.error(`[EXCHANGE-RATE-ERROR]`, JSON.stringify(errorLog));

    // Check if this error should trigger an alert
    await checkAndCreateAlert(ctx, {
      type: getAlertTypeFromError(errorType),
      severity: getSeverityFromError(errorType),
      message: `Provider ${provider} error: ${errorMessage}`,
      metadata: {
        provider,
        errorType,
        currencyPair,
        context,
      },
    });
  },
});

/**
 * Check for stale rates and create alerts
 */
export const checkStaleRates = internalQuery({
  args: {
    currencyPairs: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const currencyPairs = args.currencyPairs || [
      'USD/ARS', 'EUR/ARS', 'USD/EUR',
      'ARS/USD', 'ARS/EUR', 'EUR/USD'
    ];
    
    const staleThreshold = Date.now() - (MONITORING_THRESHOLDS.staleRateThresholdHours * 60 * 60 * 1000);
    const staleRates: Array<{ pair: string; lastUpdate: number; ageHours: number }> = [];

    for (const pair of currencyPairs) {
      const latestRate = await ctx.db
        .query("exchange_rates")
        .withIndex("by_pair_date", (q) => q.eq("pairCurrency", pair))
        .order("desc")
        .first();

      if (!latestRate) {
        staleRates.push({
          pair,
          lastUpdate: 0,
          ageHours: Infinity,
        });
      } else if (latestRate.date < staleThreshold) {
        const ageHours = (Date.now() - latestRate.date) / (60 * 60 * 1000);
        staleRates.push({
          pair,
          lastUpdate: latestRate.date,
          ageHours,
        });
      }
    }

    return staleRates;
  },
});

/**
 * Get provider health status
 */
export const getProviderHealthStatus = internalQuery({
  args: {},
  handler: async (ctx) => {
    // This is a simplified implementation. In production, this would
    // aggregate metrics from the metrics table and make health checks
    const providers = ['exchangerate-api', 'currencyapi', 'abstractapi'];
    const healthStatus: Record<string, { healthy: boolean; lastCheck: number; issues: string[] }> = {};

    for (const provider of providers) {
      // Check for recent successful rates from this provider
      const recentRate = await ctx.db
        .query("exchange_rates")
        .withIndex("by_source_date", (q) => q.eq("source", provider))
        .order("desc")
        .first();

      const isHealthy = recentRate && 
        (Date.now() - recentRate.date) < (24 * 60 * 60 * 1000); // Within 24 hours

      healthStatus[provider] = {
        healthy: !!isHealthy,
        lastCheck: Date.now(),
        issues: isHealthy ? [] : ['No recent rates available'],
      };
    }

    return healthStatus;
  },
});

/**
 * Get exchange rate metrics summary
 */
export const getExchangeRateMetrics = query({
  args: {
    timeRangeHours: v.optional(v.number()), // Default 24 hours
  },
  handler: async (ctx, args) => {
    const timeRangeHours = args.timeRangeHours || 24;
    const timeRange = Date.now() - (timeRangeHours * 60 * 60 * 1000);

    const providers = ['exchangerate-api', 'currencyapi', 'abstractapi'];
    const metrics: Record<string, ExchangeRateMetrics> = {};

    for (const provider of providers) {
      // Get rates from this provider in the time range
      const rates = await ctx.db
        .query("exchange_rates")
        .withIndex("by_source_date", (q) => 
          q.eq("source", provider).gte("date", timeRange)
        )
        .collect();

      const totalRequests = rates.length;
      const successfulRequests = rates.length; // All stored rates are successful
      const failedRequests = 0; // We don't store failed requests currently

      // Calculate average response time (simulated - would come from metrics table)
      const averageResponseTime = 250; // ms

      const lastRequestTime = rates.length > 0 ? Math.max(...rates.map(r => r.date)) : 0;
      const lastSuccessfulRequest = lastRequestTime;
      const errorRate = totalRequests > 0 ? failedRequests / totalRequests : 0;

      metrics[provider] = {
        provider,
        totalRequests,
        successfulRequests,
        failedRequests,
        averageResponseTime,
        lastRequestTime,
        lastSuccessfulRequest,
        errorRate,
        isHealthy: errorRate < MONITORING_THRESHOLDS.maxErrorRate && 
                  (Date.now() - lastRequestTime) < (timeRangeHours * 60 * 60 * 1000),
      };
    }

    return metrics;
  },
});

/**
 * Check for rate anomalies
 */
export const checkRateAnomalies = internalQuery({
  args: {
    currencyPair: v.string(),
    timeRangeHours: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const timeRangeHours = args.timeRangeHours || 24;
    const timeRange = Date.now() - (timeRangeHours * 60 * 60 * 1000);

    const rates = await ctx.db
      .query("exchange_rates")
      .withIndex("by_pair_date", (q) => 
        q.eq("pairCurrency", args.currencyPair)
         .gte("date", timeRange)
      )
      .order("asc")
      .collect();

    if (rates.length < 2) {
      return { hasAnomalies: false, anomalies: [] };
    }

    const anomalies: Array<{
      type: 'spike' | 'drop' | 'volatility';
      severity: 'low' | 'medium' | 'high';
      description: string;
      timestamp: number;
    }> = [];

    // Check for spikes and drops
    for (let i = 1; i < rates.length; i++) {
      const prevRate = rates[i - 1].rate;
      const currRate = rates[i].rate;
      const changePercentage = Math.abs(currRate - prevRate) / prevRate;

      if (changePercentage > MONITORING_THRESHOLDS.maxRateChangePerHour) {
        const isSpike = currRate > prevRate;
        anomalies.push({
          type: isSpike ? 'spike' : 'drop',
          severity: changePercentage > 0.2 ? 'high' : changePercentage > 0.1 ? 'medium' : 'low',
          description: `${isSpike ? 'Rate spike' : 'Rate drop'} detected: ${(changePercentage * 100).toFixed(2)}% change`,
          timestamp: rates[i].date,
        });
      }
    }

    // Check for high volatility
    const rateValues = rates.map(r => r.rate);
    const mean = rateValues.reduce((sum, r) => sum + r, 0) / rateValues.length;
    const variance = rateValues.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / rateValues.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / mean;

    if (coefficientOfVariation > 0.05) { // 5% coefficient of variation
      anomalies.push({
        type: 'volatility',
        severity: coefficientOfVariation > 0.1 ? 'high' : 'medium',
        description: `High volatility detected: ${(coefficientOfVariation * 100).toFixed(2)}% coefficient of variation`,
        timestamp: Math.max(...rates.map(r => r.date)),
      });
    }

    return {
      hasAnomalies: anomalies.length > 0,
      anomalies,
    };
  },
});

// Helper functions
function getAlertTypeFromError(errorType: string): RateAlert['type'] {
  switch (errorType) {
    case ExchangeRateError.API_UNAVAILABLE:
    case ExchangeRateError.NETWORK_ERROR:
    case ExchangeRateError.TIMEOUT:
      return 'provider_failure';
    case ExchangeRateError.RATE_VALIDATION_FAILED:
      return 'rate_anomaly';
    default:
      return 'provider_failure';
  }
}

function getSeverityFromError(errorType: string): RateAlert['severity'] {
  switch (errorType) {
    case ExchangeRateError.API_UNAVAILABLE:
    case ExchangeRateError.NETWORK_ERROR:
      return 'high';
    case ExchangeRateError.TIMEOUT:
    case ExchangeRateError.RATE_LIMIT_EXCEEDED:
      return 'medium';
    case ExchangeRateError.RATE_VALIDATION_FAILED:
      return 'high';
    default:
      return 'low';
  }
}

async function checkAndCreateAlert(
  ctx: any,
  alert: Omit<RateAlert, 'id' | 'timestamp' | 'resolved'>
) {
  // For now, just log the alert. In production, this would:
  // 1. Store the alert in a database table
  // 2. Send notifications (email, Slack, etc.)
  // 3. Integrate with monitoring systems
  
  const fullAlert: RateAlert = {
    id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    resolved: false,
    ...alert,
  };

  console.warn(`[EXCHANGE-RATE-ALERT]`, JSON.stringify(fullAlert));
  
  // TODO: Store in alerts table
  // await ctx.db.insert("exchange_rate_alerts", fullAlert);
}

/**
 * Get current alerts
 */
export const getCurrentAlerts = query({
  args: {
    severity: v.optional(v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("critical")
    )),
    resolved: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // For now, return empty array since we're not persisting alerts yet
    // In production, this would query the alerts table
    return [];
  },
});

/**
 * Health check endpoint for monitoring systems
 */
export const healthCheck = query({
  args: {},
  returns: v.object({
    healthy: v.boolean(),
    timestamp: v.number(),
    details: v.any(),
  }),
  handler: async (ctx) => {
    const staleRates: any = await ctx.runQuery(internal.ledger.rateMonitoring.checkStaleRates, {});
    const providerHealth: any = await ctx.runQuery(internal.ledger.rateMonitoring.getProviderHealthStatus, {});
    
    const hasStaleRates: boolean = staleRates.length > 0;
    const hasUnhealthyProviders: boolean = Object.values(providerHealth).some((p: any) => !p.healthy);
    
    const overallHealth: boolean = !hasStaleRates && !hasUnhealthyProviders;
    
    return {
      healthy: overallHealth,
      timestamp: Date.now(),
      details: {
        staleRates: staleRates.length,
        unhealthyProviders: Object.values(providerHealth).filter((p: any) => !p.healthy).length,
        providerHealth,
      },
    };
  },
});
