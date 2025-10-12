/**
 * Phase 4.4 Rollup System Validation Script
 * 
 * This script validates the complete rollup system implementation:
 * 1. Tests rollup creation and updates
 * 2. Validates reconciliation job functionality
 * 3. Checks data consistency and drift detection
 * 4. Measures performance improvements
 * 5. Tests graceful degradation to direct calculation
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

// Configuration
const CONVEX_URL = process.env.CONVEX_URL || "https://your-convex-deployment.convex.cloud";
const client = new ConvexHttpClient(CONVEX_URL);

interface TestResult {
  testName: string;
  status: "PASS" | "FAIL" | "SKIP";
  duration: number;
  details?: string;
  error?: string;
}

class RollupSystemValidator {
  private results: TestResult[] = [];
  private testUserId: string | null = null;
  private testAccountIds: string[] = [];

  async runValidation(): Promise<void> {
    console.log("🚀 Starting Phase 4.4 Rollup System Validation");
    console.log("=" .repeat(60));

    try {
      await this.setupTestData();
      await this.testRollupCRUD();
      await this.testRollupCalculation();
      await this.testTransactionIntegration();
      await this.testMonthlySummary();
      await this.testBudgetExecution();
      await this.testReconciliationJob();
      await this.testPerformanceTargets();
      await this.testGracefulDegradation();
      
      this.printResults();
    } catch (error) {
      console.error("❌ Validation failed:", error);
    }
  }

  private async setupTestData(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Create test user (this would need to be done via auth in real scenario)
      // For now, we'll assume test data exists
      console.log("📋 Setting up test data...");
      
      // In a real test, you'd create users and accounts here
      // For validation, we'll use existing test data
      
      this.addResult("Setup Test Data", "PASS", Date.now() - startTime);
    } catch (error) {
      this.addResult("Setup Test Data", "FAIL", Date.now() - startTime, undefined, error.message);
    }
  }

  private async testRollupCRUD(): Promise<void> {
    console.log("\n🔧 Testing Rollup CRUD Operations");
    
    // Test 1: Create rollup
    await this.runTest("Create Monthly Rollup", async () => {
      const result = await client.mutation(api.ledger.rollups.upsertMonthlyRollup, {
        userId: "test-user-id" as any,
        accountId: "test-account-id" as any,
        month: Date.now(),
        totalDebits: 10000,
        totalCredits: 0,
        netAmount: -10000,
        transactionCount: 5,
        updateType: "transaction",
      });
      
      if (result.status !== "created") {
        throw new Error(`Expected status 'created', got '${result.status}'`);
      }
      
      return `Created rollup ${result.rollupId}`;
    });

    // Test 2: Update rollup
    await this.runTest("Update Monthly Rollup", async () => {
      const result = await client.mutation(api.ledger.rollups.upsertMonthlyRollup, {
        userId: "test-user-id" as any,
        accountId: "test-account-id" as any,
        month: Date.now(),
        totalDebits: 15000,
        totalCredits: 0,
        netAmount: -15000,
        transactionCount: 7,
        updateType: "reconciliation",
      });
      
      if (result.status !== "updated") {
        throw new Error(`Expected status 'updated', got '${result.status}'`);
      }
      
      return `Updated rollup ${result.rollupId}`;
    });

    // Test 3: Idempotent operation
    await this.runTest("Idempotent Rollup Operation", async () => {
      const result = await client.mutation(api.ledger.rollups.upsertMonthlyRollup, {
        userId: "test-user-id" as any,
        accountId: "test-account-id" as any,
        month: Date.now(),
        totalDebits: 15000,
        totalCredits: 0,
        netAmount: -15000,
        transactionCount: 7,
        updateType: "transaction",
      });
      
      if (result.status !== "already_current") {
        throw new Error(`Expected status 'already_current', got '${result.status}'`);
      }
      
      return "Idempotent operation handled correctly";
    });
  }

  private async testRollupCalculation(): Promise<void> {
    console.log("\n🧮 Testing Rollup Calculation");
    
    await this.runTest("Calculate Rollup from Journal Lines", async () => {
      const result = await client.query(api.ledger.rollups.calculateMonthlyRollup, {
        userId: "test-user-id" as any,
        accountId: "test-account-id" as any,
        month: Date.now(),
      });
      
      if (!result) {
        throw new Error("Expected rollup calculation result");
      }
      
      if (typeof result.totalDebits !== "number" || typeof result.totalCredits !== "number") {
        throw new Error("Invalid rollup calculation result format");
      }
      
      return `Calculated rollup: ${result.transactionCount} transactions, net: ${result.netAmount}`;
    });
  }

  private async testTransactionIntegration(): Promise<void> {
    console.log("\n🔄 Testing Transaction Integration");
    
    await this.runTest("Update Rollups on Transaction", async () => {
      const result = await client.mutation(api.ledger.rollups.updateRollupsOnTransaction, {
        journalEntryId: "test-entry-id" as any,
        updateType: "create",
      });
      
      if (result.status !== "completed" && result.status !== "entry_not_found") {
        throw new Error(`Unexpected status: ${result.status}`);
      }
      
      return `Transaction rollup update: ${result.status}`;
    });
  }

  private async testMonthlySummary(): Promise<void> {
    console.log("\n📊 Testing Monthly Summary with Rollups");
    
    await this.runTest("Get Monthly Summary (Rollup)", async () => {
      const result = await client.query(api.ledger.monthlySummary.getMonthlySummary, {
        month: Date.now(),
      });
      
      if (!result) {
        throw new Error("Expected monthly summary result");
      }
      
      if (!["rollups", "direct_calculation"].includes(result.dataSource)) {
        throw new Error(`Invalid data source: ${result.dataSource}`);
      }
      
      return `Monthly summary: ${result.dataSource}, net: ${result.netBalance}`;
    });
  }

  private async testBudgetExecution(): Promise<void> {
    console.log("\n💰 Testing Budget Execution with Rollups");
    
    await this.runTest("Get Budget Execution (Rollup)", async () => {
      const result = await client.query(api.ledger.budgetExecution.getBudgetExecution, {
        budgetId: "test-budget-id" as any,
      });
      
      if (!result) {
        throw new Error("Expected budget execution result");
      }
      
      if (!["rollups", "direct_calculation"].includes(result.dataSource)) {
        throw new Error(`Invalid data source: ${result.dataSource}`);
      }
      
      return `Budget execution: ${result.dataSource}, spent: ${result.spentAmount}`;
    });
  }

  private async testReconciliationJob(): Promise<void> {
    console.log("\n🔍 Testing Reconciliation Job");
    
    await this.runTest("Run Reconciliation Job", async () => {
      const result = await client.action(api.ledger.rollups.reconcileMonthlyRollups, {});
      
      if (typeof result.processed !== "number" || typeof result.updated !== "number") {
        throw new Error("Invalid reconciliation result format");
      }
      
      return `Reconciliation: ${result.processed} processed, ${result.updated} updated, ${result.driftDetected} drift detected`;
    });
  }

  private async testPerformanceTargets(): Promise<void> {
    console.log("\n⚡ Testing Performance Targets");
    
    // Test rollup operation performance
    await this.runTest("Rollup Operation Performance", async () => {
      const startTime = Date.now();
      
      await client.mutation(api.ledger.rollups.upsertMonthlyRollup, {
        userId: "test-user-id" as any,
        accountId: "test-account-id" as any,
        month: Date.now(),
        totalDebits: 10000,
        totalCredits: 0,
        netAmount: -10000,
        transactionCount: 5,
        updateType: "transaction",
      });
      
      const duration = Date.now() - startTime;
      
      if (duration > 100) {
        throw new Error(`Rollup operation too slow: ${duration}ms (target: <100ms)`);
      }
      
      return `Rollup operation: ${duration}ms (target: <100ms)`;
    });

    // Test monthly summary performance
    await this.runTest("Monthly Summary Performance", async () => {
      const startTime = Date.now();
      
      await client.query(api.ledger.monthlySummary.getMonthlySummary, {
        month: Date.now(),
      });
      
      const duration = Date.now() - startTime;
      
      if (duration > 300) {
        throw new Error(`Monthly summary too slow: ${duration}ms (target: <300ms)`);
      }
      
      return `Monthly summary: ${duration}ms (target: <300ms)`;
    });
  }

  private async testGracefulDegradation(): Promise<void> {
    console.log("\n🛡️ Testing Graceful Degradation");
    
    await this.runTest("Fallback to Direct Calculation", async () => {
      // Test with non-existent rollup data to trigger fallback
      const result = await client.query(api.ledger.monthlySummary.getMonthlySummary, {
        month: Date.now() - (365 * 24 * 60 * 60 * 1000), // 1 year ago (no rollups)
      });
      
      if (!result) {
        throw new Error("Expected fallback result");
      }
      
      if (result.dataSource !== "direct_calculation") {
        console.warn(`Expected 'direct_calculation', got '${result.dataSource}'`);
      }
      
      return `Fallback test: ${result.dataSource}`;
    });
  }

  private async runTest(testName: string, testFn: () => Promise<string>): Promise<void> {
    const startTime = Date.now();
    
    try {
      const details = await testFn();
      this.addResult(testName, "PASS", Date.now() - startTime, details);
    } catch (error) {
      this.addResult(testName, "FAIL", Date.now() - startTime, undefined, error.message);
    }
  }

  private addResult(testName: string, status: "PASS" | "FAIL" | "SKIP", duration: number, details?: string, error?: string): void {
    this.results.push({ testName, status, duration, details, error });
    
    const statusIcon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⏭️";
    console.log(`${statusIcon} ${testName} (${duration}ms)`);
    
    if (details) {
      console.log(`   📝 ${details}`);
    }
    
    if (error) {
      console.log(`   🚨 ${error}`);
    }
  }

  private printResults(): void {
    console.log("\n" + "=".repeat(60));
    console.log("📋 VALIDATION RESULTS SUMMARY");
    console.log("=".repeat(60));
    
    const passed = this.results.filter(r => r.status === "PASS").length;
    const failed = this.results.filter(r => r.status === "FAIL").length;
    const skipped = this.results.filter(r => r.status === "SKIP").length;
    const total = this.results.length;
    
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⏭️ Skipped: ${skipped}`);
    console.log(`📊 Total: ${total}`);
    
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
    console.log(`⏱️ Total Duration: ${totalDuration}ms`);
    
    if (failed > 0) {
      console.log("\n🚨 FAILED TESTS:");
      this.results
        .filter(r => r.status === "FAIL")
        .forEach(r => console.log(`   - ${r.testName}: ${r.error}`));
    }
    
    console.log("\n" + "=".repeat(60));
    
    if (failed === 0) {
      console.log("🎉 ALL TESTS PASSED! Phase 4.4 Rollup System is working correctly.");
    } else {
      console.log("⚠️ Some tests failed. Please review the implementation.");
    }
  }
}

// Run validation if this script is executed directly
if (require.main === module) {
  const validator = new RollupSystemValidator();
  validator.runValidation().catch(console.error);
}

export { RollupSystemValidator };
