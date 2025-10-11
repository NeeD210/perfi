/**
 * Rate Validation and Quality Assurance
 * 
 * This module provides comprehensive validation and quality assurance
 * for exchange rate data to ensure accuracy and reliability.
 */

import { internalQuery, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

// Rate validation rules for major currency pairs
const RATE_VALIDATION_RULES = {
  'USD/ARS': { 
    min: 100, 
    max: 2000, 
    maxChangePerHour: 0.05, // 5% max change per hour
    maxChangePerDay: 0.15,  // 15% max change per day
  },
  'EUR/ARS': { 
    min: 120, 
    max: 2500, 
    maxChangePerHour: 0.05,
    maxChangePerDay: 0.15,
  },
  'USD/EUR': { 
    min: 0.8, 
    max: 1.2, 
    maxChangePerHour: 0.03, // 3% max change per hour
    maxChangePerDay: 0.08,  // 8% max change per day
  },
  'ARS/USD': { 
    min: 0.0005, 
    max: 0.01, 
    maxChangePerHour: 0.05,
    maxChangePerDay: 0.15,
  },
  'ARS/EUR': { 
    min: 0.0004, 
    max: 0.008, 
    maxChangePerHour: 0.05,
    maxChangePerDay: 0.15,
  },
  'EUR/USD': { 
    min: 0.83, 
    max: 1.25, 
    maxChangePerHour: 0.03,
    maxChangePerDay: 0.08,
  },
};

export interface RateValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
  confidence: number; // 0-1 scale
}

export interface ProviderComparisonResult {
  isValid: boolean;
  primaryRate: number;
  secondaryRate: number;
  difference: number;
  differencePercentage: number;
  recommendation: 'use_primary' | 'use_secondary' | 'manual_review';
}

/**
 * Validate exchange rate against rules and historical data
 */
export const validateExchangeRate = internalQuery({
  args: {
    rate: v.number(),
    currencyPair: v.string(),
    previousRate: v.optional(v.number()),
    historicalRates: v.optional(v.array(v.number())),
  },
  returns: v.object({
    isValid: v.boolean(),
    warnings: v.array(v.string()),
    errors: v.array(v.string()),
    confidence: v.number(),
  }),
  handler: async (ctx, args): Promise<RateValidationResult> => {
    const { rate, currencyPair, previousRate, historicalRates } = args;
    const warnings: string[] = [];
    const errors: string[] = [];
    let confidence = 1.0;

    // Basic validation
    if (rate <= 0) {
      errors.push("Exchange rate must be positive");
      return { isValid: false, warnings, errors, confidence: 0 };
    }

    if (!Number.isFinite(rate)) {
      errors.push("Exchange rate must be a finite number");
      return { isValid: false, warnings, errors, confidence: 0 };
    }

    // Get validation rules for this currency pair
    const rules = (RATE_VALIDATION_RULES as Record<string, any>)[currencyPair];
    if (!rules) {
      warnings.push(`No validation rules defined for ${currencyPair}`);
      confidence *= 0.8;
    } else {
      // Check rate bounds
      if (rate < rules.min) {
        errors.push(`Rate ${rate} is below minimum ${rules.min} for ${currencyPair}`);
        confidence = 0;
      } else if (rate > rules.max) {
        errors.push(`Rate ${rate} is above maximum ${rules.max} for ${currencyPair}`);
        confidence = 0;
      }

      // Check rate change from previous rate
      if (previousRate && previousRate > 0) {
        const changePercentage = Math.abs(rate - previousRate) / previousRate;
        
        if (changePercentage > rules.maxChangePerHour) {
          errors.push(`Rate change ${(changePercentage * 100).toFixed(2)}% exceeds maximum ${(rules.maxChangePerHour * 100)}% per hour`);
          confidence *= 0.3;
        } else if (changePercentage > rules.maxChangePerHour * 0.5) {
          warnings.push(`Large rate change detected: ${(changePercentage * 100).toFixed(2)}%`);
          confidence *= 0.7;
        }
      }

      // Check against historical data
      if (historicalRates && historicalRates.length > 0) {
        const avgHistorical = historicalRates.reduce((sum, r) => sum + r, 0) / historicalRates.length;
        const deviationFromAverage = Math.abs(rate - avgHistorical) / avgHistorical;
        
        if (deviationFromAverage > 0.2) { // 20% deviation
          warnings.push(`Rate deviates significantly from historical average`);
          confidence *= 0.6;
        } else if (deviationFromAverage > 0.1) { // 10% deviation
          warnings.push(`Rate deviates moderately from historical average`);
          confidence *= 0.8;
        }
      }
    }

    const isValid = errors.length === 0;
    return { isValid, warnings, errors, confidence: Math.max(0, confidence) };
  },
});

/**
 * Compare rates from multiple providers
 */
export const compareProviderRates = internalQuery({
  args: {
    primaryRate: v.number(),
    secondaryRate: v.number(),
    currencyPair: v.string(),
  },
  returns: v.object({
    isValid: v.boolean(),
    primaryRate: v.number(),
    secondaryRate: v.number(),
    difference: v.number(),
    differencePercentage: v.number(),
    recommendation: v.union(
      v.literal("use_primary"),
      v.literal("use_secondary"),
      v.literal("manual_review")
    ),
  }),
  handler: async (ctx, args): Promise<ProviderComparisonResult> => {
    const { primaryRate, secondaryRate, currencyPair } = args;
    
    const difference = Math.abs(primaryRate - secondaryRate);
    const differencePercentage = difference / Math.min(primaryRate, secondaryRate);
    
    // Get validation rules for context
    const rules = (RATE_VALIDATION_RULES as Record<string, any>)[currencyPair];
    const maxAcceptableDifference = rules ? rules.maxChangePerHour * 0.5 : 0.02; // 2% default
    
    let recommendation: 'use_primary' | 'use_secondary' | 'manual_review';
    let isValid = true;
    
    if (differencePercentage <= maxAcceptableDifference) {
      // Rates are close enough, use primary
      recommendation = 'use_primary';
    } else if (differencePercentage <= maxAcceptableDifference * 2) {
      // Rates differ moderately, use primary but flag for review
      recommendation = 'use_primary';
      isValid = false; // Flag as suspicious but not invalid
    } else {
      // Rates differ significantly, require manual review
      recommendation = 'manual_review';
      isValid = false;
    }
    
    return {
      isValid,
      primaryRate,
      secondaryRate,
      difference,
      differencePercentage,
      recommendation,
    };
  },
});

/**
 * Detect rate anomalies in historical data
 */
export const detectRateAnomalies = internalQuery({
  args: {
    currentRate: v.number(),
    historicalRates: v.array(v.number()),
    currencyPair: v.string(),
  },
  returns: v.object({
    isValid: v.boolean(),
    warnings: v.array(v.string()),
    errors: v.array(v.string()),
    confidence: v.number(),
    anomalyType: v.optional(v.union(
      v.literal("spike"),
      v.literal("drop"),
      v.literal("volatility"),
      v.literal("trend_break")
    )),
  }),
  handler: async (ctx, args): Promise<RateValidationResult & { anomalyType?: 'spike' | 'drop' | 'volatility' | 'trend_break' }> => {
    const { currentRate, historicalRates, currencyPair } = args;
    const warnings: string[] = [];
    const errors: string[] = [];
    let confidence = 1.0;
    let anomalyType: 'spike' | 'drop' | 'volatility' | 'trend_break' | undefined;

    if (historicalRates.length < 3) {
      warnings.push("Insufficient historical data for anomaly detection");
      return { isValid: true, warnings, errors, confidence: 0.5 };
    }

    // Calculate statistics
    const sortedRates = [...historicalRates].sort((a, b) => a - b);
    const mean = historicalRates.reduce((sum, r) => sum + r, 0) / historicalRates.length;
    const variance = historicalRates.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / historicalRates.length;
    const stdDev = Math.sqrt(variance);
    
    // Check for spikes or drops
    const zScore = Math.abs(currentRate - mean) / stdDev;
    
    if (zScore > 3) {
      // Significant outlier (3+ standard deviations)
      if (currentRate > mean) {
        errors.push("Rate spike detected - significantly higher than historical average");
        anomalyType = "spike";
      } else {
        errors.push("Rate drop detected - significantly lower than historical average");
        anomalyType = "drop";
      }
      confidence = 0.1;
    } else if (zScore > 2) {
      // Moderate outlier
      warnings.push("Rate deviates significantly from historical average");
      confidence *= 0.4;
    }

    // Check for volatility
    const recentRates = historicalRates.slice(-5); // Last 5 rates
    if (recentRates.length >= 3) {
      const recentVariance = recentRates.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / recentRates.length;
      const recentStdDev = Math.sqrt(recentVariance);
      
      if (recentStdDev > stdDev * 2) {
        warnings.push("High volatility detected in recent rates");
        anomalyType = "volatility";
        confidence *= 0.6;
      }
    }

    // Check for trend breaks
    if (historicalRates.length >= 7) {
      const firstHalf = historicalRates.slice(0, Math.floor(historicalRates.length / 2));
      const secondHalf = historicalRates.slice(Math.floor(historicalRates.length / 2));
      
      const firstHalfMean = firstHalf.reduce((sum, r) => sum + r, 0) / firstHalf.length;
      const secondHalfMean = secondHalf.reduce((sum, r) => sum + r, 0) / secondHalf.length;
      
      const trendChange = Math.abs(secondHalfMean - firstHalfMean) / firstHalfMean;
      
      if (trendChange > 0.1) { // 10% trend change
        warnings.push("Significant trend change detected");
        anomalyType = "trend_break";
        confidence *= 0.7;
      }
    }

    const isValid = errors.length === 0;
    return { isValid, warnings, errors, confidence, anomalyType };
  },
});

/**
 * Validate rate against multiple criteria and return comprehensive result
 */
export const comprehensiveRateValidation = internalQuery({
  args: {
    rate: v.number(),
    currencyPair: v.string(),
    source: v.string(),
    previousRate: v.optional(v.number()),
    historicalRates: v.optional(v.array(v.number())),
    providerRates: v.optional(v.array(v.object({
      provider: v.string(),
      rate: v.number(),
    }))),
  },
  returns: v.object({
    overallValid: v.boolean(),
    overallConfidence: v.number(),
    validations: v.object({
      basic: v.object({
        isValid: v.boolean(),
        errors: v.array(v.string()),
      }),
      bounds: v.object({
        isValid: v.boolean(),
        warnings: v.array(v.string()),
      }),
      change: v.object({
        isValid: v.boolean(),
        warnings: v.array(v.string()),
      }),
      anomaly: v.object({
        isValid: v.boolean(),
        warnings: v.array(v.string()),
        anomalyType: v.optional(v.string()),
      }),
      provider: v.object({
        isValid: v.boolean(),
        warnings: v.array(v.string()),
      }),
    }),
    recommendation: v.union(
      v.literal("accept"),
      v.literal("accept_with_warning"),
      v.literal("reject"),
      v.literal("manual_review")
    ),
  }),
  handler: async (ctx, args) => {
    const { rate, currencyPair, source, previousRate, historicalRates, providerRates } = args;
    
    // Run all validation checks
    const basicValidation = await ctx.runQuery(internal.rateValidation.validateExchangeRate, {
      rate,
      currencyPair,
      previousRate,
      historicalRates,
    });

    const boundsValidation = await ctx.runQuery(internal.rateValidation.validateExchangeRate, {
      rate,
      currencyPair,
      previousRate,
      historicalRates,
    });

    const anomalyValidation = await ctx.runQuery(internal.rateValidation.detectRateAnomalies, {
      currentRate: rate,
      historicalRates: historicalRates || [],
      currencyPair,
    });

    // Provider comparison (if multiple rates available)
    let providerValidation = { isValid: true, warnings: [] as string[] };
    if (providerRates && providerRates.length > 1) {
      const primaryRate = providerRates[0].rate;
      const secondaryRate = providerRates[1].rate;
      
      const comparison = await ctx.runQuery(internal.rateValidation.compareProviderRates, {
        primaryRate,
        secondaryRate,
        currencyPair,
      });
      
      providerValidation = {
        isValid: comparison.isValid,
        warnings: comparison.isValid ? [] : [`Provider rates differ by ${(comparison.differencePercentage * 100).toFixed(2)}%`],
      };
    }

    // Calculate overall confidence
    const confidenceFactors = [
      basicValidation.confidence,
      anomalyValidation.confidence,
      providerValidation.isValid ? 1 : 0.5,
    ];
    const overallConfidence = confidenceFactors.reduce((sum, cf) => sum + cf, 0) / confidenceFactors.length;

    // Determine recommendation
    let recommendation: 'accept' | 'accept_with_warning' | 'reject' | 'manual_review';
    
    if (basicValidation.errors.length > 0) {
      recommendation = 'reject';
    } else if (anomalyValidation.errors.length > 0 || !providerValidation.isValid) {
      recommendation = 'manual_review';
    } else if (basicValidation.warnings.length > 0 || anomalyValidation.warnings.length > 0 || providerValidation.warnings.length > 0) {
      recommendation = 'accept_with_warning';
    } else {
      recommendation = 'accept';
    }

    const overallValid = recommendation === 'accept' || recommendation === 'accept_with_warning';

    return {
      overallValid,
      overallConfidence,
      validations: {
        basic: {
          isValid: basicValidation.isValid,
          errors: basicValidation.errors,
        },
        bounds: {
          isValid: boundsValidation.isValid,
          warnings: boundsValidation.warnings,
        },
        change: {
          isValid: boundsValidation.isValid,
          warnings: boundsValidation.warnings,
        },
        anomaly: {
          isValid: anomalyValidation.isValid,
          warnings: anomalyValidation.warnings,
          anomalyType: anomalyValidation.anomalyType,
        },
        provider: {
          isValid: providerValidation.isValid,
          warnings: providerValidation.warnings,
        },
      },
      recommendation,
    };
  },
});

/**
 * Get validation rules for a currency pair
 */
export const getValidationRules = internalQuery({
  args: {
    currencyPair: v.string(),
  },
  returns: v.union(
    v.object({
      min: v.number(),
      max: v.number(),
      maxChangePerHour: v.number(),
      maxChangePerDay: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const rules = (RATE_VALIDATION_RULES as Record<string, any>)[args.currencyPair];
    return rules || null;
  },
});
