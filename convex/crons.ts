import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run recurring transactions processing every day at midnight (00:00 UTC)
crons.cron("processRecurringTransactions", "0 0 * * *", internal.internal.recurring.processRecurringTransactions);

// Run budget period rollover every day at 00:05 UTC (5 minutes after midnight)
// Captures budget execution at period boundaries and creates historical budget_lines records
crons.cron("budgetRollover", "5 0 * * *", internal.ledger.budgetLines.processBudgetRollover);

// Run rollup reconciliation every day at 02:00 UTC (after transaction processing peak)
// Ensures monthly rollups are consistent with journal_lines data through drift detection
crons.cron("rollupReconciliation", "0 2 * * *", internal.ledger.rollups.reconcileMonthlyRollups);

export default crons; 