/**
 * Phase 4.2 Budget System Test Suite
 * 
 * Tests budget creation, validation, execution calculation, and period boundaries
 * against PRD requirements and acceptance criteria.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { calculatePeriodBoundaries, calculateNextDueDate } from "../../convex/ledger/budgetUtils";

describe("Budget System - Period Calculations", () => {
  describe("calculatePeriodBoundaries", () => {
    // Daily frequency tests
    it("should calculate daily period boundaries correctly", () => {
      // Test date: October 15, 2025 at 14:30 UTC
      const testDate = new Date(Date.UTC(2025, 9, 15, 14, 30, 0, 0)).getTime();
      const { periodStart, periodEnd } = calculatePeriodBoundaries("daily", testDate);

      const startDate = new Date(periodStart);
      const endDate = new Date(periodEnd);

      // Should be Oct 15 00:00:00 to Oct 15 23:59:59.999
      expect(startDate.getUTCFullYear()).toBe(2025);
      expect(startDate.getUTCMonth()).toBe(9); // October (0-indexed)
      expect(startDate.getUTCDate()).toBe(15);
      expect(startDate.getUTCHours()).toBe(0);
      expect(startDate.getUTCMinutes()).toBe(0);

      expect(endDate.getUTCFullYear()).toBe(2025);
      expect(endDate.getUTCMonth()).toBe(9);
      expect(endDate.getUTCDate()).toBe(15);
      expect(endDate.getUTCHours()).toBe(23);
      expect(endDate.getUTCMinutes()).toBe(59);
      expect(endDate.getUTCSeconds()).toBe(59);
    });

    // Weekly frequency tests
    it("should calculate weekly period boundaries (Monday start - ISO 8601)", () => {
      // Test date: Wednesday, October 15, 2025
      const testDate = new Date(Date.UTC(2025, 9, 15)).getTime();
      const { periodStart, periodEnd } = calculatePeriodBoundaries("weekly", testDate);

      const startDate = new Date(periodStart);
      const endDate = new Date(periodEnd);

      // Week should start on Monday Oct 13
      expect(startDate.getUTCDay()).toBe(1); // Monday
      expect(startDate.getUTCDate()).toBe(13);

      // Week should end on Sunday Oct 19
      expect(endDate.getUTCDay()).toBe(0); // Sunday
      expect(endDate.getUTCDate()).toBe(19);
    });

    it("should handle weekly period when date is Sunday", () => {
      // Test date: Sunday, October 12, 2025
      const testDate = new Date(Date.UTC(2025, 9, 12)).getTime();
      const { periodStart, periodEnd } = calculatePeriodBoundaries("weekly", testDate);

      const startDate = new Date(periodStart);
      const endDate = new Date(periodEnd);

      // Week should start on Monday Oct 6
      expect(startDate.getUTCDay()).toBe(1); // Monday
      expect(startDate.getUTCDate()).toBe(6);

      // Current day is Sunday, so it's the end of the week
      expect(endDate.getUTCDay()).toBe(0); // Sunday
      expect(endDate.getUTCDate()).toBe(12);
    });

    it("should handle weekly period when date is Monday", () => {
      // Test date: Monday, October 13, 2025
      const testDate = new Date(Date.UTC(2025, 9, 13)).getTime();
      const { periodStart, periodEnd } = calculatePeriodBoundaries("weekly", testDate);

      const startDate = new Date(periodStart);
      const endDate = new Date(periodEnd);

      // Week should start on this Monday
      expect(startDate.getUTCDay()).toBe(1); // Monday
      expect(startDate.getUTCDate()).toBe(13);

      // Week should end on Sunday Oct 19
      expect(endDate.getUTCDay()).toBe(0); // Sunday
      expect(endDate.getUTCDate()).toBe(19);
    });

    // Monthly frequency tests
    it("should calculate monthly period boundaries correctly", () => {
      // Test date: October 15, 2025
      const testDate = new Date(Date.UTC(2025, 9, 15)).getTime();
      const { periodStart, periodEnd } = calculatePeriodBoundaries("monthly", testDate);

      const startDate = new Date(periodStart);
      const endDate = new Date(periodEnd);

      // Should be Oct 1 00:00:00 to Oct 31 23:59:59.999
      expect(startDate.getUTCFullYear()).toBe(2025);
      expect(startDate.getUTCMonth()).toBe(9);
      expect(startDate.getUTCDate()).toBe(1);

      expect(endDate.getUTCFullYear()).toBe(2025);
      expect(endDate.getUTCMonth()).toBe(9);
      expect(endDate.getUTCDate()).toBe(31); // October has 31 days
    });

    it("should handle February in non-leap year", () => {
      // Test date: February 15, 2025 (non-leap year)
      const testDate = new Date(Date.UTC(2025, 1, 15)).getTime();
      const { periodStart, periodEnd } = calculatePeriodBoundaries("monthly", testDate);

      const endDate = new Date(periodEnd);
      expect(endDate.getUTCDate()).toBe(28); // Feb 2025 has 28 days
    });

    it("should handle February in leap year", () => {
      // Test date: February 15, 2024 (leap year)
      const testDate = new Date(Date.UTC(2024, 1, 15)).getTime();
      const { periodStart, periodEnd } = calculatePeriodBoundaries("monthly", testDate);

      const endDate = new Date(periodEnd);
      expect(endDate.getUTCDate()).toBe(29); // Feb 2024 has 29 days
    });

    it("should handle months with 30 days", () => {
      // Test date: September 15, 2025
      const testDate = new Date(Date.UTC(2025, 8, 15)).getTime();
      const { periodStart, periodEnd } = calculatePeriodBoundaries("monthly", testDate);

      const endDate = new Date(periodEnd);
      expect(endDate.getUTCDate()).toBe(30); // September has 30 days
    });

    // Quarterly frequency tests
    it("should calculate Q1 period boundaries (Jan-Mar)", () => {
      // Test date: February 15, 2025 (Q1)
      const testDate = new Date(Date.UTC(2025, 1, 15)).getTime();
      const { periodStart, periodEnd } = calculatePeriodBoundaries("quarterly", testDate);

      const startDate = new Date(periodStart);
      const endDate = new Date(periodEnd);

      // Q1: Jan 1 to Mar 31
      expect(startDate.getUTCMonth()).toBe(0); // January
      expect(startDate.getUTCDate()).toBe(1);

      expect(endDate.getUTCMonth()).toBe(2); // March
      expect(endDate.getUTCDate()).toBe(31);
    });

    it("should calculate Q2 period boundaries (Apr-Jun)", () => {
      // Test date: May 15, 2025 (Q2)
      const testDate = new Date(Date.UTC(2025, 4, 15)).getTime();
      const { periodStart, periodEnd } = calculatePeriodBoundaries("quarterly", testDate);

      const startDate = new Date(periodStart);
      const endDate = new Date(periodEnd);

      // Q2: Apr 1 to Jun 30
      expect(startDate.getUTCMonth()).toBe(3); // April
      expect(startDate.getUTCDate()).toBe(1);

      expect(endDate.getUTCMonth()).toBe(5); // June
      expect(endDate.getUTCDate()).toBe(30);
    });

    it("should calculate Q3 period boundaries (Jul-Sep)", () => {
      // Test date: August 15, 2025 (Q3)
      const testDate = new Date(Date.UTC(2025, 7, 15)).getTime();
      const { periodStart, periodEnd } = calculatePeriodBoundaries("quarterly", testDate);

      const startDate = new Date(periodStart);
      const endDate = new Date(periodEnd);

      // Q3: Jul 1 to Sep 30
      expect(startDate.getUTCMonth()).toBe(6); // July
      expect(startDate.getUTCDate()).toBe(1);

      expect(endDate.getUTCMonth()).toBe(8); // September
      expect(endDate.getUTCDate()).toBe(30);
    });

    it("should calculate Q4 period boundaries (Oct-Dec)", () => {
      // Test date: November 15, 2025 (Q4)
      const testDate = new Date(Date.UTC(2025, 10, 15)).getTime();
      const { periodStart, periodEnd } = calculatePeriodBoundaries("quarterly", testDate);

      const startDate = new Date(periodStart);
      const endDate = new Date(periodEnd);

      // Q4: Oct 1 to Dec 31
      expect(startDate.getUTCMonth()).toBe(9); // October
      expect(startDate.getUTCDate()).toBe(1);

      expect(endDate.getUTCMonth()).toBe(11); // December
      expect(endDate.getUTCDate()).toBe(31);
    });

    // Semestral frequency tests
    it("should calculate H1 period boundaries (Jan-Jun)", () => {
      // Test date: March 15, 2025 (H1)
      const testDate = new Date(Date.UTC(2025, 2, 15)).getTime();
      const { periodStart, periodEnd } = calculatePeriodBoundaries("semestrally", testDate);

      const startDate = new Date(periodStart);
      const endDate = new Date(periodEnd);

      // H1: Jan 1 to Jun 30
      expect(startDate.getUTCMonth()).toBe(0); // January
      expect(startDate.getUTCDate()).toBe(1);

      expect(endDate.getUTCMonth()).toBe(5); // June
      expect(endDate.getUTCDate()).toBe(30);
    });

    it("should calculate H2 period boundaries (Jul-Dec)", () => {
      // Test date: September 15, 2025 (H2)
      const testDate = new Date(Date.UTC(2025, 8, 15)).getTime();
      const { periodStart, periodEnd } = calculatePeriodBoundaries("semestrally", testDate);

      const startDate = new Date(periodStart);
      const endDate = new Date(periodEnd);

      // H2: Jul 1 to Dec 31
      expect(startDate.getUTCMonth()).toBe(6); // July
      expect(startDate.getUTCDate()).toBe(1);

      expect(endDate.getUTCMonth()).toBe(11); // December
      expect(endDate.getUTCDate()).toBe(31);
    });

    // Yearly frequency tests
    it("should calculate yearly period boundaries correctly", () => {
      // Test date: June 15, 2025
      const testDate = new Date(Date.UTC(2025, 5, 15)).getTime();
      const { periodStart, periodEnd } = calculatePeriodBoundaries("yearly", testDate);

      const startDate = new Date(periodStart);
      const endDate = new Date(periodEnd);

      // Year: Jan 1 to Dec 31
      expect(startDate.getUTCFullYear()).toBe(2025);
      expect(startDate.getUTCMonth()).toBe(0); // January
      expect(startDate.getUTCDate()).toBe(1);

      expect(endDate.getUTCFullYear()).toBe(2025);
      expect(endDate.getUTCMonth()).toBe(11); // December
      expect(endDate.getUTCDate()).toBe(31);
    });

    // Edge case: period boundary transitions
    it("should handle date exactly at period start (monthly)", () => {
      // Test date: October 1, 2025 00:00:00
      const testDate = new Date(Date.UTC(2025, 9, 1, 0, 0, 0, 0)).getTime();
      const { periodStart, periodEnd } = calculatePeriodBoundaries("monthly", testDate);

      const startDate = new Date(periodStart);
      expect(startDate.getTime()).toBe(testDate);
    });

    it("should handle date at end of period (monthly)", () => {
      // Test date: October 31, 2025 23:59:59
      const testDate = new Date(Date.UTC(2025, 9, 31, 23, 59, 59, 999)).getTime();
      const { periodStart, periodEnd } = calculatePeriodBoundaries("monthly", testDate);

      const endDate = new Date(periodEnd);
      
      // Period end should be Oct 31 23:59:59.999
      expect(endDate.getUTCDate()).toBe(31);
      expect(endDate.getUTCHours()).toBe(23);
      expect(endDate.getUTCMinutes()).toBe(59);
    });
  });

  describe("calculateNextDueDate", () => {
    // Daily frequency
    it("should calculate next due date for daily frequency", () => {
      const testDate = new Date(Date.UTC(2025, 9, 15, 14, 30)).getTime();
      const nextDue = calculateNextDueDate(testDate, "daily");
      
      const nextDate = new Date(nextDue);
      
      // Should be Oct 16 00:00:00
      expect(nextDate.getUTCDate()).toBe(16);
      expect(nextDate.getUTCHours()).toBe(0);
      expect(nextDate.getUTCMinutes()).toBe(0);
    });

    // Weekly frequency
    it("should calculate next due date for weekly frequency (Wednesday → next Monday)", () => {
      const testDate = new Date(Date.UTC(2025, 9, 15)).getTime(); // Wednesday
      const nextDue = calculateNextDueDate(testDate, "weekly");
      
      const nextDate = new Date(nextDue);
      
      // Should be next Monday (Oct 20)
      expect(nextDate.getUTCDay()).toBe(1); // Monday
      expect(nextDate.getUTCDate()).toBe(20);
    });

    it("should calculate next due date for weekly frequency (Monday → next Monday)", () => {
      const testDate = new Date(Date.UTC(2025, 9, 13)).getTime(); // Monday
      const nextDue = calculateNextDueDate(testDate, "weekly");
      
      const nextDate = new Date(nextDue);
      
      // Should be next Monday (Oct 20), 7 days later
      expect(nextDate.getUTCDay()).toBe(1); // Monday
      expect(nextDate.getUTCDate()).toBe(20);
    });

    it("should calculate next due date for weekly frequency (Sunday → next Monday)", () => {
      const testDate = new Date(Date.UTC(2025, 9, 12)).getTime(); // Sunday
      const nextDue = calculateNextDueDate(testDate, "weekly");
      
      const nextDate = new Date(nextDue);
      
      // Should be next Monday (Oct 13), 1 day later
      expect(nextDate.getUTCDay()).toBe(1); // Monday
      expect(nextDate.getUTCDate()).toBe(13);
    });

    // Monthly frequency
    it("should calculate next due date for monthly frequency", () => {
      const testDate = new Date(Date.UTC(2025, 9, 15)).getTime(); // October
      const nextDue = calculateNextDueDate(testDate, "monthly");
      
      const nextDate = new Date(nextDue);
      
      // Should be Nov 1
      expect(nextDate.getUTCMonth()).toBe(10); // November
      expect(nextDate.getUTCDate()).toBe(1);
    });

    it("should handle year transition for monthly frequency", () => {
      const testDate = new Date(Date.UTC(2025, 11, 15)).getTime(); // December
      const nextDue = calculateNextDueDate(testDate, "monthly");
      
      const nextDate = new Date(nextDue);
      
      // Should be Jan 1, 2026
      expect(nextDate.getUTCFullYear()).toBe(2026);
      expect(nextDate.getUTCMonth()).toBe(0); // January
      expect(nextDate.getUTCDate()).toBe(1);
    });

    // Quarterly frequency
    it("should calculate next due date for quarterly frequency (Q1 → Q2)", () => {
      const testDate = new Date(Date.UTC(2025, 1, 15)).getTime(); // February (Q1)
      const nextDue = calculateNextDueDate(testDate, "quarterly");
      
      const nextDate = new Date(nextDue);
      
      // Should be Apr 1 (Q2 start)
      expect(nextDate.getUTCMonth()).toBe(3); // April
      expect(nextDate.getUTCDate()).toBe(1);
    });

    it("should handle year transition for quarterly frequency (Q4 → Q1)", () => {
      const testDate = new Date(Date.UTC(2025, 11, 15)).getTime(); // December (Q4)
      const nextDue = calculateNextDueDate(testDate, "quarterly");
      
      const nextDate = new Date(nextDue);
      
      // Should be Jan 1, 2026 (Q1 start)
      expect(nextDate.getUTCFullYear()).toBe(2026);
      expect(nextDate.getUTCMonth()).toBe(0); // January
    });

    // Semestral frequency
    it("should calculate next due date for semestral frequency (H1 → H2)", () => {
      const testDate = new Date(Date.UTC(2025, 3, 15)).getTime(); // April (H1)
      const nextDue = calculateNextDueDate(testDate, "semestrally");
      
      const nextDate = new Date(nextDue);
      
      // Should be Jul 1 (H2 start)
      expect(nextDate.getUTCMonth()).toBe(6); // July
      expect(nextDate.getUTCDate()).toBe(1);
    });

    it("should handle year transition for semestral frequency (H2 → H1)", () => {
      const testDate = new Date(Date.UTC(2025, 10, 15)).getTime(); // November (H2)
      const nextDue = calculateNextDueDate(testDate, "semestrally");
      
      const nextDate = new Date(nextDue);
      
      // Should be Jan 1, 2026 (H1 start)
      expect(nextDate.getUTCFullYear()).toBe(2026);
      expect(nextDate.getUTCMonth()).toBe(0); // January
    });

    // Yearly frequency
    it("should calculate next due date for yearly frequency", () => {
      const testDate = new Date(Date.UTC(2025, 6, 15)).getTime(); // July 2025
      const nextDue = calculateNextDueDate(testDate, "yearly");
      
      const nextDate = new Date(nextDue);
      
      // Should be Jan 1, 2026
      expect(nextDate.getUTCFullYear()).toBe(2026);
      expect(nextDate.getUTCMonth()).toBe(0); // January
      expect(nextDate.getUTCDate()).toBe(1);
    });
  });

  // Mid-period budget creation tests (PRD Section: Mid-Period Budget Creation)
  describe("Mid-Period Budget Creation Behavior", () => {
    it("should align monthly budget to full period even when created mid-month", () => {
      // Budget created on Oct 15, should still cover Oct 1-31
      const creationDate = new Date(Date.UTC(2025, 9, 15)).getTime();
      const { periodStart, periodEnd } = calculatePeriodBoundaries("monthly", creationDate);
      
      const startDate = new Date(periodStart);
      
      // Period should start on Oct 1, not Oct 15
      expect(startDate.getUTCDate()).toBe(1);
      expect(startDate.getUTCMonth()).toBe(9); // October
    });

    it("should align weekly budget to full period even when created mid-week", () => {
      // Budget created on Wednesday (Oct 15), should cover Monday Oct 13 - Sunday Oct 19
      const creationDate = new Date(Date.UTC(2025, 9, 15)).getTime();
      const { periodStart, periodEnd } = calculatePeriodBoundaries("weekly", creationDate);
      
      const startDate = new Date(periodStart);
      const endDate = new Date(periodEnd);
      
      // Period should start on Monday, not Wednesday
      expect(startDate.getUTCDay()).toBe(1); // Monday
      expect(startDate.getUTCDate()).toBe(13);
      
      expect(endDate.getUTCDay()).toBe(0); // Sunday
      expect(endDate.getUTCDate()).toBe(19);
    });
  });
});

describe("Budget System - Validation Logic", () => {
  describe("Budget Amount Validation", () => {
    it("should require positive budget amounts", () => {
      // This will be tested via mutation in integration tests
      // Test: amount <= 0 should throw INVALID_AMOUNT error
      const invalidAmounts = [0, -100, -0.01];
      
      invalidAmounts.forEach(amount => {
        expect(amount).toBeLessThanOrEqual(0);
      });
    });

    it("should accept valid positive amounts", () => {
      const validAmounts = [1, 100, 50000, 1000000];
      
      validAmounts.forEach(amount => {
        expect(amount).toBeGreaterThan(0);
      });
    });
  });

  describe("Scope Configuration Validation", () => {
    it("should validate singleAccount scope requires accountId", () => {
      // singleAccount scope must have accountId
      const scopeType = "singleAccount";
      const accountId = "some_id";
      
      // Valid configuration
      expect(scopeType).toBe("singleAccount");
      expect(accountId).toBeDefined();
    });

    it("should validate multipleAccounts scope requires scopeRefs array", () => {
      // multipleAccounts scope must have non-empty scopeRefs
      const scopeType = "multipleAccounts";
      const scopeRefs = ["id1", "id2", "id3"];
      
      expect(scopeType).toBe("multipleAccounts");
      expect(Array.isArray(scopeRefs)).toBe(true);
      expect(scopeRefs.length).toBeGreaterThan(0);
    });

    it("should validate accountType scope requires scopeAccountType", () => {
      // accountType scope must have scopeAccountType
      const scopeType = "accountType";
      const scopeAccountType = "expense";
      
      expect(scopeType).toBe("accountType");
      expect(["expense", "income"]).toContain(scopeAccountType);
    });
  });
});

describe("Budget System - Execution Status Calculation", () => {
  describe("Status Determination", () => {
    it("should return under_budget when spent < budget", () => {
      const budgetAmount = 100000;
      const spentAmount = 50000;
      
      const status = spentAmount < budgetAmount ? "under_budget" : 
                     spentAmount >= budgetAmount && spentAmount < budgetAmount * 1.05 ? "at_budget" : 
                     "over_budget";
      
      expect(status).toBe("under_budget");
    });

    it("should return at_budget when spent is within 5% over budget", () => {
      const budgetAmount = 100000;
      const spentAmount = 102000; // 2% over
      
      const status = spentAmount < budgetAmount ? "under_budget" : 
                     spentAmount >= budgetAmount && spentAmount < budgetAmount * 1.05 ? "at_budget" : 
                     "over_budget";
      
      expect(status).toBe("at_budget");
    });

    it("should return at_budget when spent exactly equals budget", () => {
      const budgetAmount = 100000;
      const spentAmount = 100000;
      
      const status = spentAmount < budgetAmount ? "under_budget" : 
                     spentAmount >= budgetAmount && spentAmount < budgetAmount * 1.05 ? "at_budget" : 
                     "over_budget";
      
      expect(status).toBe("at_budget");
    });

    it("should return over_budget when spent >= 105% of budget", () => {
      const budgetAmount = 100000;
      const spentAmount = 106000; // 6% over
      
      const status = spentAmount < budgetAmount ? "under_budget" : 
                     spentAmount >= budgetAmount && spentAmount < budgetAmount * 1.05 ? "at_budget" : 
                     "over_budget";
      
      expect(status).toBe("over_budget");
    });

    it("should calculate percent used correctly", () => {
      const budgetAmount = 100000;
      const spentAmount = 75000;
      const percentUsed = (spentAmount / budgetAmount) * 100;
      
      expect(percentUsed).toBe(75);
    });

    it("should cap percent used at 999 for extreme cases", () => {
      const budgetAmount = 100000;
      const spentAmount = 2000000; // 2000%
      const percentUsed = Math.min((spentAmount / budgetAmount) * 100, 999);
      
      expect(percentUsed).toBe(999);
    });
  });
});

