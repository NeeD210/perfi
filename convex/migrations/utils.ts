/**
 * Utility functions for Phase 2 Migration Foundation
 */

// Amount conversion utilities for different currencies
export const convertAmountARS = (floatAmount: number): number => {
  // ARS conversion (scale = 0, no decimals - round to nearest peso)
  return Math.round(floatAmount);
};

export const convertAmountCents = (floatAmount: number): number => {
  // USD/EUR conversion (scale = 2, cents)
  return Math.round(floatAmount * 100);
};

// Generate idempotency key for expense migration
export const generateExpenseIdempotencyKey = (expenseId: string): string => {
  return `expense_migration_${expenseId}`;
};

// Generate idempotency key for installment migration
export const generateInstallmentIdempotencyKey = (expenseId: string, installmentNumber: number): string => {
  return `installment_migration_${expenseId}_${installmentNumber}`;
};

// Generate idempotency key for account seeding
export const generateAccountSeedingKey = (userId: string, legacyId: string, type: 'paymentType' | 'category'): string => {
  return `account_seeding_${userId}_${type}_${legacyId}`;
};

// Determine account type from transaction type
export const getAccountTypeFromTransactionType = (transactionType: string): 'expense' | 'income' => {
  return transactionType === 'income' ? 'income' : 'expense';
};

// Determine account type from payment type
export const getAccountTypeFromPaymentType = (isCredit: boolean | undefined): 'asset' | 'liability' => {
  return isCredit ? 'liability' : 'asset';
};

// Validate zero-sum invariant for journal lines
export const validateZeroSum = (lines: Array<{ amountBaseCurrency: number }>): boolean => {
  const sum = lines.reduce((acc, line) => acc + line.amountBaseCurrency, 0);
  // For ARS-only migrations we expect exact integer equality
  return sum === 0;
};

// Create journal entry description from expense
export const createJournalEntryDescription = (expense: {
  description: string;
  category?: string;
  paymentType?: string;
  transactionType: string;
}): string => {
  const parts = [expense.description];

  if (expense.category) {
    parts.push(`(${expense.category})`);
  }

  if (expense.paymentType) {
    parts.push(`via ${expense.paymentType}`);
  }

  return parts.join(' ');
};

// Calculate batch size based on environment
export const getBatchSize = (operation: 'account_seeding' | 'transaction_backfill' | 'installment_backfill'): number => {
  // Smaller batches in production for safety
  const isProduction = process.env.NODE_ENV === 'production';

  switch (operation) {
    case 'account_seeding':
      return isProduction ? 50 : 100;
    case 'transaction_backfill':
      return isProduction ? 100 : 500;
    case 'installment_backfill':
      return isProduction ? 200 : 1000;
    default:
      return 100;
  }
};

// Feature flags for migration control
export const MIGRATION_FEATURE_FLAGS = {
  // Deterministic flags inside Convex runtime (no process.env access)
  PHASE2_MIGRATIONS_ENABLED: true,
  ALLOW_BATCH_RESUME: true,
  MIGRATION_DEBUG_LOGGING: false,
};

// Migration timing utilities
export const createMigrationTimer = () => {
  const startTime = Date.now();

  return {
    getElapsedMs: () => Date.now() - startTime,
    getElapsedSeconds: () => Math.round((Date.now() - startTime) / 1000),
  };
};

// Progress logging utility
export const createProgressLogger = (operation: string) => {
  let lastLogTime = Date.now();

  return (processed: number, total: number, batchSize: number) => {
    const now = Date.now();
    const timeSinceLastLog = now - lastLogTime;

    // Log every 10 seconds or when batch completes
    if (timeSinceLastLog > 10000 || processed % batchSize === 0) {
      const percent = Math.round((processed / total) * 100);
      console.log(`${operation}: ${processed}/${total} (${percent}%) completed`);
      lastLogTime = now;
    }
  };
};
