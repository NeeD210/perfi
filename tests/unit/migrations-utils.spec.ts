import { describe, it, expect } from "vitest";
import {
  convertAmountARS,
  convertAmountCents,
  generateExpenseIdempotencyKey,
  generateInstallmentIdempotencyKey,
  generateAccountSeedingKey,
  getAccountTypeFromTransactionType,
  getAccountTypeFromPaymentType,
  validateZeroSum,
  createJournalEntryDescription,
} from "../../convex/migrations/utils";

describe("Migration Utilities", () => {
  describe("Amount Conversion", () => {
    it("should convert ARS amounts to integers (scale 0)", () => {
      expect(convertAmountARS(100.50)).toBe(101); // Round to nearest peso
      expect(convertAmountARS(100.49)).toBe(100); // Round to nearest peso
      expect(convertAmountARS(0)).toBe(0);
      expect(convertAmountARS(-50.75)).toBe(-51); // Negative amounts
    });

    it("should convert amounts to cents (scale 2)", () => {
      expect(convertAmountCents(100.50)).toBe(10050);
      expect(convertAmountCents(100.499)).toBe(10050); // Round half away from zero
      expect(convertAmountCents(0)).toBe(0);
    });
  });

  describe("Idempotency Key Generation", () => {
    it("should generate expense idempotency keys", () => {
      const key = generateExpenseIdempotencyKey("expense123");
      expect(key).toBe("expense_migration_expense123");
    });

    it("should generate installment idempotency keys", () => {
      const key = generateInstallmentIdempotencyKey("expense123", 2);
      expect(key).toBe("installment_migration_expense123_2");
    });

    it("should generate account seeding keys", () => {
      const paymentKey = generateAccountSeedingKey("user123", "payment456", "paymentType");
      expect(paymentKey).toBe("account_seeding_user123_paymentType_payment456");

      const categoryKey = generateAccountSeedingKey("user123", "category789", "category");
      expect(categoryKey).toBe("account_seeding_user123_category_category789");
    });
  });

  describe("Account Type Determination", () => {
    it("should determine account type from transaction type", () => {
      expect(getAccountTypeFromTransactionType("income")).toBe("income");
      expect(getAccountTypeFromTransactionType("expense")).toBe("expense");
      expect(getAccountTypeFromTransactionType("other")).toBe("expense"); // Default
    });

    it("should determine account type from payment type", () => {
      expect(getAccountTypeFromPaymentType(true)).toBe("liability"); // Credit card
      expect(getAccountTypeFromPaymentType(false)).toBe("asset"); // Cash/bank
      expect(getAccountTypeFromPaymentType(undefined)).toBe("asset"); // Default
    });
  });

  describe("Zero Sum Validation", () => {
    it("should validate zero sum for journal lines", () => {
      const validLines = [
        { amountBaseCurrency: 100 },
        { amountBaseCurrency: -100 },
      ];
      expect(validateZeroSum(validLines)).toBe(true);

      const invalidLines = [
        { amountBaseCurrency: 100 },
        { amountBaseCurrency: -50 },
      ];
      expect(validateZeroSum(invalidLines)).toBe(false);

      const emptyLines: Array<{ amountBaseCurrency: number }> = [];
      expect(validateZeroSum(emptyLines)).toBe(true);
    });

    it("should handle floating point precision", () => {
      const linesWithPrecision = [
        { amountBaseCurrency: 100.0000001 },
        { amountBaseCurrency: -100.0000001 },
      ];
      expect(validateZeroSum(linesWithPrecision)).toBe(true);
    });
  });

  describe("Journal Entry Description Creation", () => {
    it("should create descriptions from expense data", () => {
      const expense = {
        description: "Coffee purchase",
        category: "Food & Drinks",
        paymentType: "Visa Credit Card",
        transactionType: "expense",
      };

      const description = createJournalEntryDescription(expense);
      expect(description).toBe("Coffee purchase (Food & Drinks) via Visa Credit Card");
    });

    it("should handle missing optional fields", () => {
      const expense = {
        description: "Simple transaction",
        transactionType: "expense",
      };

      const description = createJournalEntryDescription(expense);
      expect(description).toBe("Simple transaction");
    });
  });
});
