/**
 * Budget Period Calculation Utilities
 * 
 * This module provides utilities for calculating budget period boundaries and next due dates
 * for all supported frequencies (daily, weekly, monthly, quarterly, semestrally, yearly).
 * 
 * All calculations are performed in UTC to ensure consistency across timezones.
 * Week boundaries follow ISO 8601 standard (Monday = start of week).
 */

import { ConvexError } from "convex/values";

// Frequency type definition
export type Frequency = "daily" | "weekly" | "monthly" | "quarterly" | "semestrally" | "yearly";

// Period boundaries interface
export interface PeriodBoundaries {
  periodStart: number; // Epoch ms (inclusive)
  periodEnd: number; // Epoch ms (inclusive, last millisecond of period)
}

/**
 * Calculate period boundaries (start and end) for a given frequency and reference date.
 * 
 * Period boundaries always align to standard calendar boundaries:
 * - Daily: 00:00:00 to 23:59:59.999 UTC of the reference date
 * - Weekly: Monday 00:00:00 to Sunday 23:59:59.999 UTC (ISO 8601)
 * - Monthly: 1st 00:00:00 to last day 23:59:59.999 UTC
 * - Quarterly: Quarter start 00:00:00 to quarter end 23:59:59.999 UTC
 * - Semestrally: Semester start 00:00:00 to semester end 23:59:59.999 UTC
 * - Yearly: Jan 1 00:00:00 to Dec 31 23:59:59.999 UTC
 * 
 * @param frequency - Budget frequency
 * @param referenceDate - Reference date in epoch milliseconds (defaults to current time)
 * @returns Period boundaries with start and end epoch milliseconds
 * @throws ConvexError if frequency is invalid
 */
export function calculatePeriodBoundaries(
  frequency: Frequency,
  referenceDate: number = Date.now()
): PeriodBoundaries {
  const date = new Date(referenceDate);
  date.setUTCHours(0, 0, 0, 0); // Start of day in UTC

  switch (frequency) {
    case "daily": {
      const periodStart = date.getTime();
      const periodEnd = date.getTime() + (24 * 60 * 60 * 1000) - 1; // End of day (23:59:59.999)
      return { periodStart, periodEnd };
    }

    case "weekly": {
      // Week starts on Monday (ISO 8601)
      // Sunday = 0, Monday = 1, ..., Saturday = 6
      const dayOfWeek = date.getUTCDay();
      const daysToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek); // If Sunday, go back 6 days
      
      const weekStart = new Date(date);
      weekStart.setUTCDate(date.getUTCDate() + daysToMonday);
      weekStart.setUTCHours(0, 0, 0, 0);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setUTCDate(weekStart.getUTCDate() + 6); // Sunday
      weekEnd.setUTCHours(23, 59, 59, 999);
      
      return { periodStart: weekStart.getTime(), periodEnd: weekEnd.getTime() };
    }

    case "monthly": {
      const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
      const monthEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
      return { periodStart: monthStart.getTime(), periodEnd: monthEnd.getTime() };
    }

    case "quarterly": {
      const quarter = Math.floor(date.getUTCMonth() / 3);
      const quarterStartMonth = quarter * 3; // 0, 3, 6, 9
      
      const quarterStart = new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth, 1, 0, 0, 0, 0));
      const quarterEnd = new Date(Date.UTC(date.getUTCFullYear(), quarterStartMonth + 3, 0, 23, 59, 59, 999));
      
      return { periodStart: quarterStart.getTime(), periodEnd: quarterEnd.getTime() };
    }

    case "semestrally": {
      const semester = date.getUTCMonth() < 6 ? 0 : 1; // H1: Jan-Jun (0), H2: Jul-Dec (1)
      const semesterStartMonth = semester * 6; // 0 or 6
      
      const semesterStart = new Date(Date.UTC(date.getUTCFullYear(), semesterStartMonth, 1, 0, 0, 0, 0));
      const semesterEnd = new Date(Date.UTC(date.getUTCFullYear(), semesterStartMonth + 6, 0, 23, 59, 59, 999));
      
      return { periodStart: semesterStart.getTime(), periodEnd: semesterEnd.getTime() };
    }

    case "yearly": {
      const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
      const yearEnd = new Date(Date.UTC(date.getUTCFullYear(), 11, 31, 23, 59, 59, 999));
      return { periodStart: yearStart.getTime(), periodEnd: yearEnd.getTime() };
    }

    default:
      throw new ConvexError({
        code: "INVALID_FREQUENCY",
        message: `Unknown frequency: ${frequency}`,
      });
  }
}

/**
 * Calculate the next due date (start of next period) for a budget.
 * 
 * This is used to determine when a budget period rolls over to the next period.
 * 
 * @param currentDate - Current date in epoch milliseconds
 * @param frequency - Budget frequency
 * @returns Epoch milliseconds of the next period start (00:00:00 UTC)
 * @throws ConvexError if frequency is invalid
 */
export function calculateNextDueDate(
  currentDate: number,
  frequency: Frequency
): number {
  const date = new Date(currentDate);

  switch (frequency) {
    case "daily": {
      // Next day at 00:00:00 UTC
      date.setUTCDate(date.getUTCDate() + 1);
      date.setUTCHours(0, 0, 0, 0);
      return date.getTime();
    }

    case "weekly": {
      // Next Monday at 00:00:00 UTC
      const dayOfWeek = date.getUTCDay();
      const daysUntilNextMonday = (8 - dayOfWeek) % 7 || 7; // If already Monday, next Monday is 7 days away
      
      date.setUTCDate(date.getUTCDate() + daysUntilNextMonday);
      date.setUTCHours(0, 0, 0, 0);
      return date.getTime();
    }

    case "monthly": {
      // 1st of next month at 00:00:00 UTC
      date.setUTCMonth(date.getUTCMonth() + 1);
      date.setUTCDate(1);
      date.setUTCHours(0, 0, 0, 0);
      return date.getTime();
    }

    case "quarterly": {
      // 1st of next quarter at 00:00:00 UTC
      const currentQuarter = Math.floor(date.getUTCMonth() / 3);
      const nextQuarterMonth = (currentQuarter * 3) + 3; // 3, 6, 9, 12
      
      if (nextQuarterMonth >= 12) {
        // Next quarter is in next year
        date.setUTCFullYear(date.getUTCFullYear() + 1);
        date.setUTCMonth(0);
      } else {
        date.setUTCMonth(nextQuarterMonth);
      }
      
      date.setUTCDate(1);
      date.setUTCHours(0, 0, 0, 0);
      return date.getTime();
    }

    case "semestrally": {
      // 1st of next semester at 00:00:00 UTC (Jan 1 or Jul 1)
      const nextSemesterMonth = date.getUTCMonth() < 6 ? 6 : 0; // If H1, next is H2 (Jul), if H2, next is H1 (Jan next year)
      
      if (nextSemesterMonth === 0) {
        // Next semester is next year H1
        date.setUTCFullYear(date.getUTCFullYear() + 1);
      }
      
      date.setUTCMonth(nextSemesterMonth);
      date.setUTCDate(1);
      date.setUTCHours(0, 0, 0, 0);
      return date.getTime();
    }

    case "yearly": {
      // Jan 1 of next year at 00:00:00 UTC
      date.setUTCFullYear(date.getUTCFullYear() + 1);
      date.setUTCMonth(0);
      date.setUTCDate(1);
      date.setUTCHours(0, 0, 0, 0);
      return date.getTime();
    }

    default:
      throw new ConvexError({
        code: "INVALID_FREQUENCY",
        message: `Unknown frequency: ${frequency}`,
      });
  }
}

