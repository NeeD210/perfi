/**
 * Phase 4.4 Pre-Aggregation System Test Suite
 * 
 * This test suite validates the rollup system implementation according to the PRD:
 * - Monthly rollup creation and updates
 * - Reconciliation job functionality
 * - Rollup data consistency and drift detection
 * - Performance improvements with rollup integration
 * - Graceful degradation to direct calculation
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConvexTestingHelper } from "convex/testing";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

describe("Phase 4.4: Pre-Aggregation System", () => {
  let t: ConvexTestingHelper;
  let userId: Id<"users">;
  let accountId1: Id<"accounts">;
  let accountId2: Id<"accounts">;
  let currentMonth: number;

  beforeEach(async () => {
    t = new ConvexTestingHelper();
    
    // Create test user
    userId = await t.db.insert("users", {
      auth0Id: "test-user-123",
      email: "test@example.com",
      emailVerified: true,
      softdelete: false,
    });

    // Create test accounts
    accountId1 = await t.db.insert("accounts", {
      userId,
      description: "Test Expense Account",
      accountType: "expense",
      creationTime: Date.now(),
      softdelete: false,
    });

    accountId2 = await t.db.insert("accounts", {
      userId,
      description: "Test Income Account", 
      accountType: "income",
      creationTime: Date.now(),
      softdelete: false,
    });

    // Get current month start
    const now = Date.now();
    const date = new Date(now);
    currentMonth = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
  });

  afterEach(async () => {
    await t.cleanup();
  });

  describe("Monthly Rollup CRUD Operations", () => {
    it("should create new monthly rollup", async () => {
      const result = await t.runMutation(api.ledger.rollups.upsertMonthlyRollup, {
        userId,
        accountId: accountId1,
        month: currentMonth,
        totalDebits: 10000, // $100.00
        totalCredits: 0,
        netAmount: -10000,
        transactionCount: 5,
        updateType: "transaction",
      });

      expect(result.status).toBe("created");
      expect(result.rollupId).toBeDefined();

      // Verify rollup was created in database
      const rollup = await t.db.get(result.rollupId);
      expect(rollup).toBeDefined();
      expect(rollup!.userId).toBe(userId);
      expect(rollup!.accountId).toBe(accountId1);
      expect(rollup!.month).toBe(currentMonth);
      expect(rollup!.totalDebits).toBe(10000);
      expect(rollup!.totalCredits).toBe(0);
      expect(rollup!.netAmount).toBe(-10000);
      expect(rollup!.transactionCount).toBe(5);
    });

    it("should update existing monthly rollup", async () => {
      // Create initial rollup
      const createResult = await t.runMutation(api.ledger.rollups.upsertMonthlyRollup, {
        userId,
        accountId: accountId1,
        month: currentMonth,
        totalDebits: 10000,
        totalCredits: 0,
        netAmount: -10000,
        transactionCount: 5,
        updateType: "transaction",
      });

      // Update rollup
      const updateResult = await t.runMutation(api.ledger.rollups.upsertMonthlyRollup, {
        userId,
        accountId: accountId1,
        month: currentMonth,
        totalDebits: 15000, // Updated amount
        totalCredits: 0,
        netAmount: -15000,
        transactionCount: 7, // Updated count
        updateType: "reconciliation",
      });

      expect(updateResult.status).toBe("updated");
      expect(updateResult.rollupId).toBe(createResult.rollupId);
      expect(updateResult.previousValues).toBeDefined();
      expect(updateResult.previousValues!.totalDebits).toBe(10000);
      expect(updateResult.previousValues!.transactionCount).toBe(5);

      // Verify rollup was updated
      const rollup = await t.db.get(createResult.rollupId);
      expect(rollup!.totalDebits).toBe(15000);
      expect(rollup!.transactionCount).toBe(7);
      expect(rollup!.lastReconciled).toBeGreaterThan(rollup!.lastUpdated);
    });

    it("should handle idempotent operations", async () => {
      // Create rollup
      const result1 = await t.runMutation(api.ledger.rollups.upsertMonthlyRollup, {
        userId,
        accountId: accountId1,
        month: currentMonth,
        totalDebits: 10000,
        totalCredits: 0,
        netAmount: -10000,
        transactionCount: 5,
        updateType: "transaction",
      });

      // Same operation should return already_current
      const result2 = await t.runMutation(api.ledger.rollups.upsertMonthlyRollup, {
        userId,
        accountId: accountId1,
        month: currentMonth,
        totalDebits: 10000,
        totalCredits: 0,
        netAmount: -10000,
        transactionCount: 5,
        updateType: "transaction",
      });

      expect(result2.status).toBe("already_current");
      expect(result2.rollupId).toBe(result1.rollupId);
    });
  });

  describe("Rollup Calculation from Journal Lines", () => {
    it("should calculate rollup from journal lines", async () => {
      // Create journal entry
      const entryId = await t.db.insert("journal_entries", {
        userId,
        date: currentMonth + (5 * 24 * 60 * 60 * 1000), // 5 days into month
        updateTime: Date.now(),
        softdelete: false,
        description: "Test transaction",
        status: "posted",
        sourceType: "expense",
        createdBy: userId,
      });

      // Create journal lines
      await t.db.insert("journal_lines", {
        journalEntryId: entryId,
        userId,
        accountId: accountId1,
        direction: "debit",
        currencyCode: "ARS",
        amount: 10000,
        amountBaseCurrency: 10000,
        entryDate: currentMonth + (5 * 24 * 60 * 60 * 1000),
      });

      await t.db.insert("journal_lines", {
        journalEntryId: entryId,
        userId,
        accountId: accountId2,
        direction: "credit",
        currencyCode: "ARS",
        amount: 10000,
        amountBaseCurrency: 10000,
        entryDate: currentMonth + (5 * 24 * 60 * 60 * 1000),
      });

      // Calculate rollup for account1
      const rollup1 = await t.runQuery(api.ledger.rollups.calculateMonthlyRollup, {
        userId,
        accountId: accountId1,
        month: currentMonth,
      });

      expect(rollup1).toBeDefined();
      expect(rollup1!.totalDebits).toBe(10000);
      expect(rollup1!.totalCredits).toBe(0);
      expect(rollup1!.netAmount).toBe(-10000);
      expect(rollup1!.transactionCount).toBe(1);

      // Calculate rollup for account2
      const rollup2 = await t.runQuery(api.ledger.rollups.calculateMonthlyRollup, {
        userId,
        accountId: accountId2,
        month: currentMonth,
      });

      expect(rollup2).toBeDefined();
      expect(rollup2!.totalDebits).toBe(0);
      expect(rollup2!.totalCredits).toBe(10000);
      expect(rollup2!.netAmount).toBe(10000);
      expect(rollup2!.transactionCount).toBe(1);
    });

    it("should return null for non-existent account", async () => {
      const fakeAccountId = "j1234567890123456789012345" as Id<"accounts">;
      
      const rollup = await t.runQuery(api.ledger.rollups.calculateMonthlyRollup, {
        userId,
        accountId: fakeAccountId,
        month: currentMonth,
      });

      expect(rollup).toBeNull();
    });

    it("should return null for soft-deleted account", async () => {
      // Soft delete account
      await t.db.patch(accountId1, { softdelete: true });

      const rollup = await t.runQuery(api.ledger.rollups.calculateMonthlyRollup, {
        userId,
        accountId: accountId1,
        month: currentMonth,
      });

      expect(rollup).toBeNull();
    });
  });

  describe("Transaction Integration", () => {
    it("should update rollups on transaction creation", async () => {
      // Create journal entry
      const entryId = await t.db.insert("journal_entries", {
        userId,
        date: currentMonth + (5 * 24 * 60 * 60 * 1000),
        updateTime: Date.now(),
        softdelete: false,
        description: "Test transaction",
        status: "posted",
        sourceType: "expense",
        createdBy: userId,
      });

      // Create journal lines
      await t.db.insert("journal_lines", {
        journalEntryId: entryId,
        userId,
        accountId: accountId1,
        direction: "debit",
        currencyCode: "ARS",
        amount: 10000,
        amountBaseCurrency: 10000,
        entryDate: currentMonth + (5 * 24 * 60 * 60 * 1000),
      });

      // Update rollups
      const result = await t.runMutation(api.ledger.rollups.updateRollupsOnTransaction, {
        journalEntryId: entryId,
        updateType: "create",
      });

      expect(result.status).toBe("completed");
      expect(result.results).toBeDefined();
      expect(result.results!.length).toBe(1);
      expect(result.results![0].accountId).toBe(accountId1);
      expect(result.results![0].month).toBe(currentMonth);
      expect(result.results![0].status).toBe("success");

      // Verify rollup was created
      const rollups = await t.db
        .query("monthly_rollups")
        .withIndex("by_user_account_month", q =>
          q.eq("userId", userId)
           .eq("accountId", accountId1)
           .eq("month", currentMonth)
        )
        .collect();

      expect(rollups.length).toBe(1);
      expect(rollups[0].totalDebits).toBe(10000);
      expect(rollups[0].transactionCount).toBe(1);
    });

    it("should handle rollup update failures gracefully", async () => {
      // Create journal entry with invalid account ID to trigger error
      const entryId = await t.db.insert("journal_entries", {
        userId,
        date: currentMonth + (5 * 24 * 60 * 60 * 1000),
        updateTime: Date.now(),
        softdelete: false,
        description: "Test transaction",
        status: "posted",
        sourceType: "expense",
        createdBy: userId,
      });

      const fakeAccountId = "j1234567890123456789012345" as Id<"accounts">;
      
      await t.db.insert("journal_lines", {
        journalEntryId: entryId,
        userId,
        accountId: fakeAccountId,
        direction: "debit",
        currencyCode: "ARS",
        amount: 10000,
        amountBaseCurrency: 10000,
        entryDate: currentMonth + (5 * 24 * 60 * 60 * 1000),
      });

      // Update rollups should handle the error gracefully
      const result = await t.runMutation(api.ledger.rollups.updateRollupsOnTransaction, {
        journalEntryId: entryId,
        updateType: "create",
      });

      expect(result.status).toBe("completed");
      expect(result.results).toBeDefined();
      expect(result.results!.length).toBe(1);
      expect(result.results![0].status).toBe("error");
      expect(result.results![0].error).toBeDefined();
    });
  });

  describe("Monthly Summary with Rollups", () => {
    it("should use rollup data when available", async () => {
      // Create rollup data
      await t.runMutation(api.ledger.rollups.upsertMonthlyRollup, {
        userId,
        accountId: accountId1,
        month: currentMonth,
        totalDebits: 10000,
        totalCredits: 0,
        netAmount: -10000,
        transactionCount: 5,
        updateType: "transaction",
      });

      await t.runMutation(api.ledger.rollups.upsertMonthlyRollup, {
        userId,
        accountId: accountId2,
        month: currentMonth,
        totalDebits: 0,
        totalCredits: 15000,
        netAmount: 15000,
        transactionCount: 3,
        updateType: "transaction",
      });

      // Get monthly summary
      const summary = await t.runQuery(api.ledger.monthlySummary.getMonthlySummary, {
        month: currentMonth,
      });

      expect(summary.dataSource).toBe("rollups");
      expect(summary.totalIncome).toBe(15000);
      expect(summary.totalExpenses).toBe(10000);
      expect(summary.netBalance).toBe(5000);
      expect(summary.accountBreakdown.length).toBe(2);
    });

    it("should fallback to direct calculation when rollups unavailable", async () => {
      // Create journal entries directly (no rollups)
      const entryId = await t.db.insert("journal_entries", {
        userId,
        date: currentMonth + (5 * 24 * 60 * 60 * 1000),
        updateTime: Date.now(),
        softdelete: false,
        description: "Test transaction",
        status: "posted",
        sourceType: "expense",
        createdBy: userId,
      });

      await t.db.insert("journal_lines", {
        journalEntryId: entryId,
        userId,
        accountId: accountId1,
        direction: "debit",
        currencyCode: "ARS",
        amount: 10000,
        amountBaseCurrency: 10000,
        entryDate: currentMonth + (5 * 24 * 60 * 60 * 1000),
      });

      await t.db.insert("journal_lines", {
        journalEntryId: entryId,
        userId,
        accountId: accountId2,
        direction: "credit",
        currencyCode: "ARS",
        amount: 10000,
        amountBaseCurrency: 10000,
        entryDate: currentMonth + (5 * 24 * 60 * 60 * 1000),
      });

      // Get monthly summary (should fallback to direct calculation)
      const summary = await t.runQuery(api.ledger.monthlySummary.getMonthlySummary, {
        month: currentMonth,
      });

      expect(summary.dataSource).toBe("direct_calculation");
      expect(summary.totalIncome).toBe(10000);
      expect(summary.totalExpenses).toBe(10000);
      expect(summary.netBalance).toBe(0);
    });
  });

  describe("Budget Execution with Rollups", () => {
    it("should use rollup data for budget execution", async () => {
      // Create budget
      const budgetId = await t.db.insert("budgets", {
        userId,
        amount: 20000, // $200.00
        frequency: "monthly",
        nextDueDate: currentMonth + (30 * 24 * 60 * 60 * 1000),
        creationTime: Date.now(),
        softdelete: false,
        scopeType: "singleAccount",
        accountId: accountId1,
      });

      // Create rollup data
      await t.runMutation(api.ledger.rollups.upsertMonthlyRollup, {
        userId,
        accountId: accountId1,
        month: currentMonth,
        totalDebits: 15000, // $150.00 spent
        totalCredits: 0,
        netAmount: -15000,
        transactionCount: 8,
        updateType: "transaction",
      });

      // Get budget execution
      const execution = await t.runQuery(api.ledger.budgetExecution.getBudgetExecution, {
        budgetId,
      });

      expect(execution.dataSource).toBe("rollups");
      expect(execution.spentAmount).toBe(15000);
      expect(execution.remainingAmount).toBe(5000);
      expect(execution.percentUsed).toBe(75);
      expect(execution.status).toBe("under_budget");
    });
  });

  describe("Reconciliation Job", () => {
    it("should reconcile rollups and detect drift", async () => {
      // Create journal entries
      const entryId = await t.db.insert("journal_entries", {
        userId,
        date: currentMonth + (5 * 24 * 60 * 60 * 1000),
        updateTime: Date.now(),
        softdelete: false,
        description: "Test transaction",
        status: "posted",
        sourceType: "expense",
        createdBy: userId,
      });

      await t.db.insert("journal_lines", {
        journalEntryId: entryId,
        userId,
        accountId: accountId1,
        direction: "debit",
        currencyCode: "ARS",
        amount: 10000,
        amountBaseCurrency: 10000,
        entryDate: currentMonth + (5 * 24 * 60 * 60 * 1000),
      });

      // Create incorrect rollup (simulate drift)
      await t.runMutation(api.ledger.rollups.upsertMonthlyRollup, {
        userId,
        accountId: accountId1,
        month: currentMonth,
        totalDebits: 5000, // Incorrect amount
        totalCredits: 0,
        netAmount: -5000,
        transactionCount: 1,
        updateType: "transaction",
      });

      // Run reconciliation
      const result = await t.runAction(api.ledger.rollups.reconcileMonthlyRollups, {});

      expect(result.processed).toBeGreaterThan(0);
      expect(result.updated).toBeGreaterThan(0);
      expect(result.driftDetected).toBeGreaterThan(0);

      // Verify rollup was corrected
      const rollups = await t.db
        .query("monthly_rollups")
        .withIndex("by_user_account_month", q =>
          q.eq("userId", userId)
           .eq("accountId", accountId1)
           .eq("month", currentMonth)
        )
        .collect();

      expect(rollups.length).toBe(1);
      expect(rollups[0].totalDebits).toBe(10000); // Corrected amount
      expect(rollups[0].lastReconciled).toBeGreaterThan(rollups[0].lastUpdated);
    });
  });

  describe("Performance Validation", () => {
    it("should complete rollup operations within performance targets", async () => {
      const startTime = Date.now();

      // Create rollup
      await t.runMutation(api.ledger.rollups.upsertMonthlyRollup, {
        userId,
        accountId: accountId1,
        month: currentMonth,
        totalDebits: 10000,
        totalCredits: 0,
        netAmount: -10000,
        transactionCount: 5,
        updateType: "transaction",
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100); // < 100ms target
    });

    it("should complete monthly summary query within performance targets", async () => {
      // Create rollup data
      await t.runMutation(api.ledger.rollups.upsertMonthlyRollup, {
        userId,
        accountId: accountId1,
        month: currentMonth,
        totalDebits: 10000,
        totalCredits: 0,
        netAmount: -10000,
        transactionCount: 5,
        updateType: "transaction",
      });

      const startTime = Date.now();

      // Get monthly summary
      await t.runQuery(api.ledger.monthlySummary.getMonthlySummary, {
        month: currentMonth,
      });

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(300); // < 300ms target (rollup-enabled)
    });
  });
});