/**
 * Error tracking utilities for dual-write operations
 * 
 * This module provides structured error logging for ledger dual-write failures.
 * In the future, this can be extended to integrate with error tracking services
 * like Sentry, Datadog, or similar platforms.
 */

export interface DualWriteError {
  operation: string;
  expenseId?: string;
  recurringId?: string;
  userId?: string;
  errorMessage: string;
  errorStack?: string;
  timestamp: number;
  context?: Record<string, any>;
}

/**
 * Log a dual-write error with structured information
 * 
 * @param error - The error details to log
 * 
 * Current implementation logs to console, but can be extended to:
 * - Store errors in a dedicated Convex table for monitoring
 * - Send to external error tracking service
 * - Trigger alerts for critical failures
 * - Aggregate metrics for dashboard display
 */
export function logDualWriteError(error: DualWriteError): void {
  const structuredError = {
    level: "error",
    component: "dual-write",
    ...error,
  };

  // Console logging with JSON structure for easy parsing
  console.error("[DUAL-WRITE-ERROR]", JSON.stringify(structuredError, null, 2));

  // TODO: Future enhancements
  // - Store in convex table: await ctx.db.insert("dual_write_errors", error);
  // - Send to Sentry: Sentry.captureException(err, { tags: { component: "dual-write" } });
  // - Trigger alert if critical: await sendAlert(error);
  // - Update metrics: incrementDualWriteErrorCounter(error.operation);
}

/**
 * Wrap dual-write operations with error tracking
 * 
 * Usage:
 * ```typescript
 * await trackDualWriteOperation("addExpense", expenseId, userId, async () => {
 *   // dual-write logic here
 * });
 * ```
 */
export async function trackDualWriteOperation<T>(
  operation: string,
  sourceId: string,
  userId: string,
  fn: () => Promise<T>,
  additionalContext?: Record<string, any>
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    logDualWriteError({
      operation,
      expenseId: sourceId,
      userId,
      errorMessage: err instanceof Error ? err.message : String(err),
      errorStack: err instanceof Error ? err.stack : undefined,
      timestamp: Date.now(),
      context: additionalContext,
    });
    return null;
  }
}

/**
 * Log a warning for dual-write skips (idempotency)
 */
export function logDualWriteSkip(operation: string, reason: string, sourceId: string): void {
  console.log("[DUAL-WRITE-SKIP]", JSON.stringify({
    level: "info",
    component: "dual-write",
    operation,
    reason,
    sourceId,
    timestamp: Date.now(),
  }));
}


