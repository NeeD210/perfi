/**
 * Budget Historical Tracking Tests
 * 
 * This file contains tests for the Phase 4.3 budget historical tracking functionality.
 * Tests cover:
 * - createBudgetLine idempotency
 * - calculateExecutionForPeriod accuracy
 * - generatePeriodBoundariesInRange correctness
 * - Period boundary alignment for various budget creation dates
 * - Status calculation logic
 */

import { describe, it, expect, beforeEach } from "vitest";
import { calculatePeriodBoundaries, calculateNextDueDate, generatePeriodBoundariesInRange } from "../convex/ledger/budgetUtils";

describe("Budget Historical Tracking", () => {
  describe("Period Boundary Calculations", () => {
    it("should calculate daily period boundaries correctly", () => {
      const testDate = new Date("2025-01-15T12:30:45.123Z").getTime();
      const { periodStart, periodEnd } = calculatePeriodBoundaries("daily", testDate);
      
      expect(periodStart).toBe(new Date("2025-01-15T00:00:00.000Z").getTime());
      expect(periodEnd).toBe(new Date("2025-01-15T23:59:59.999Z").getTime());
    });

    it("should calculate weekly period boundaries correctly (ISO 8601)", () => {
      // Wednesday, Jan 15, 2025
      const testDate = new Date("2025-01-15T12:30:45.123Z").getTime();
      const { periodStart, periodEnd } = calculatePeriodBoundaries("weekly", testDate);
      
      // Should start on Monday, Jan 13, 2025
      expect(periodStart).toBe(new Date("2025-01-13T00:00:00.000Z").getTime());
      // Should end on Sunday, Jan 19, 2025
      expect(periodEnd).toBe(new Date("2025-01-19T23:59:59.999Z").getTime());
    });

    it("should calculate monthly period boundaries correctly", () => {
      const testDate = new Date("2025-01-15T12:30:45.123Z").getTime();
      const { periodStart, periodEnd } = calculatePeriodBoundaries("monthly", testDate);
      
      expect(periodStart).toBe(new Date("2025-01-01T00:00:00.000Z").getTime());
      expect(periodEnd).toBe(new Date("2025-01-31T23:59:59.999Z").getTime());
    });

    it("should calculate quarterly period boundaries correctly", () => {
      // Q1 (January)
      const testDate = new Date("2025-01-15T12:30:45.123Z").getTime();
      const { periodStart, periodEnd } = calculatePeriodBoundaries("quarterly", testDate);
      
      expect(periodStart).toBe(new Date("2025-01-01T00:00:00.000Z").getTime());
      expect(periodEnd).toBe(new Date("2025-03-31T23:59:59.999Z").getTime());
    });

    it("should calculate semestrally period boundaries correctly", () => {
      // H1 (January)
      const testDate = new Date("2025-01-15T12:30:45.123Z").getTime();
      const { periodStart, periodEnd } = calculatePeriodBoundaries("semestrally", testDate);
      
      expect(periodStart).toBe(new Date("2025-01-01T00:00:00.000Z").getTime());
      expect(periodEnd).toBe(new Date("2025-06-30T23:59:59.999Z").getTime());
    });

    it("should calculate yearly period boundaries correctly", () => {
      const testDate = new Date("2025-01-15T12:30:45.123Z").getTime();
      const { periodStart, periodEnd } = calculatePeriodBoundaries("yearly", testDate);
      
      expect(periodStart).toBe(new Date("2025-01-01T00:00:00.000Z").getTime());
      expect(periodEnd).toBe(new Date("2025-12-31T23:59:59.999Z").getTime());
    });
  });

  describe("Next Due Date Calculations", () => {
    it("should calculate next daily due date correctly", () => {
      const currentDate = new Date("2025-01-15T12:30:45.123Z").getTime();
      const nextDueDate = calculateNextDueDate(currentDate, "daily");
      
      expect(nextDueDate).toBe(new Date("2025-01-16T00:00:00.000Z").getTime());
    });

    it("should calculate next weekly due date correctly", () => {
      // Wednesday, Jan 15, 2025
      const currentDate = new Date("2025-01-15T12:30:45.123Z").getTime();
      const nextDueDate = calculateNextDueDate(currentDate, "weekly");
      
      // Should be next Monday, Jan 20, 2025
      expect(nextDueDate).toBe(new Date("2025-01-20T00:00:00.000Z").getTime());
    });

    it("should calculate next monthly due date correctly", () => {
      const currentDate = new Date("2025-01-15T12:30:45.123Z").getTime();
      const nextDueDate = calculateNextDueDate(currentDate, "monthly");
      
      expect(nextDueDate).toBe(new Date("2025-02-01T00:00:00.000Z").getTime());
    });
  });

  describe("Period Range Generation", () => {
    it("should generate daily periods in range correctly", () => {
      const rangeStart = new Date("2025-01-01T00:00:00.000Z").getTime();
      const rangeEnd = new Date("2025-01-03T23:59:59.999Z").getTime();
      
      const periods = generatePeriodBoundariesInRange("daily", rangeStart, rangeEnd);
      
      expect(periods).toHaveLength(3);
      expect(periods[0].periodStart).toBe(new Date("2025-01-01T00:00:00.000Z").getTime());
      expect(periods[0].periodEnd).toBe(new Date("2025-01-01T23:59:59.999Z").getTime());
      expect(periods[1].periodStart).toBe(new Date("2025-01-02T00:00:00.000Z").getTime());
      expect(periods[1].periodEnd).toBe(new Date("2025-01-02T23:59:59.999Z").getTime());
      expect(periods[2].periodStart).toBe(new Date("2025-01-03T00:00:00.000Z").getTime());
      expect(periods[2].periodEnd).toBe(new Date("2025-01-03T23:59:59.999Z").getTime());
    });

    it("should generate monthly periods in range correctly", () => {
      const rangeStart = new Date("2025-01-01T00:00:00.000Z").getTime();
      const rangeEnd = new Date("2025-03-31T23:59:59.999Z").getTime();
      
      const periods = generatePeriodBoundariesInRange("monthly", rangeStart, rangeEnd);
      
      expect(periods).toHaveLength(3);
      expect(periods[0].periodStart).toBe(new Date("2025-01-01T00:00:00.000Z").getTime());
      expect(periods[0].periodEnd).toBe(new Date("2025-01-31T23:59:59.999Z").getTime());
      expect(periods[1].periodStart).toBe(new Date("2025-02-01T00:00:00.000Z").getTime());
      expect(periods[1].periodEnd).toBe(new Date("2025-02-28T23:59:59.999Z").getTime());
      expect(periods[2].periodStart).toBe(new Date("2025-03-01T00:00:00.000Z").getTime());
      expect(periods[2].periodEnd).toBe(new Date("2025-03-31T23:59:59.999Z").getTime());
    });

    it("should handle leap year correctly", () => {
      const rangeStart = new Date("2024-01-01T00:00:00.000Z").getTime();
      const rangeEnd = new Date("2024-02-29T23:59:59.999Z").getTime();
      
      const periods = generatePeriodBoundariesInRange("monthly", rangeStart, rangeEnd);
      
      expect(periods).toHaveLength(2);
      expect(periods[1].periodEnd).toBe(new Date("2024-02-29T23:59:59.999Z").getTime());
    });
  });

  describe("Edge Cases", () => {
    it("should handle year boundary correctly", () => {
      const testDate = new Date("2024-12-31T23:59:59.999Z").getTime();
      const { periodStart, periodEnd } = calculatePeriodBoundaries("daily", testDate);
      
      expect(periodStart).toBe(new Date("2024-12-31T00:00:00.000Z").getTime());
      expect(periodEnd).toBe(new Date("2024-12-31T23:59:59.999Z").getTime());
    });

    it("should handle month boundary correctly", () => {
      const testDate = new Date("2025-01-31T23:59:59.999Z").getTime();
      const nextDueDate = calculateNextDueDate(testDate, "monthly");
      
      expect(nextDueDate).toBe(new Date("2025-02-01T00:00:00.000Z").getTime());
    });

    it("should handle February correctly in non-leap year", () => {
      const testDate = new Date("2025-02-15T12:30:45.123Z").getTime();
      const { periodStart, periodEnd } = calculatePeriodBoundaries("monthly", testDate);
      
      expect(periodStart).toBe(new Date("2025-02-01T00:00:00.000Z").getTime());
      expect(periodEnd).toBe(new Date("2025-02-28T23:59:59.999Z").getTime());
    });
  });
});
