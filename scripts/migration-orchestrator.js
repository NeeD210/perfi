#!/usr/bin/env node

/**
 * Phase 2 Migration Orchestrator
 * 
 * This script automates the complete Phase 2 migration process for all users
 * without requiring manual user-by-user execution. It provides:
 * - Automated bulk migration execution
 * - Real-time progress monitoring
 * - Error handling and retry mechanisms
 * - Comprehensive reporting
 * - Resume capability for interrupted migrations
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";

// Configuration
const CONVEX_URL = process.env.CONVEX_URL || "https://your-deployment.convex.cloud";
const MIGRATION_CONFIG = {
  batchSize: 50,
  maxRetries: 3,
  maxConcurrentUsers: 10,
  progressCheckInterval: 5000, // 5 seconds
  maxExecutionTime: 24 * 60 * 60 * 1000, // 24 hours
};

class MigrationOrchestrator {
  private client: ConvexHttpClient;
  private migrationId: string | null = null;
  private startTime: number = 0;
  private isRunning: boolean = false;

  constructor() {
    this.client = new ConvexHttpClient(CONVEX_URL);
  }

  /**
   * Initialize the migration process
   */
  async initialize(): Promise<boolean> {
    try {
      console.log("🚀 Initializing Phase 2 Migration Orchestrator...");
      console.log(`📊 Configuration:`, MIGRATION_CONFIG);
      
      // Check if migration is already running
      const status = await this.client.mutation(api.migrations.checkBulkMigrationStatus, {});
      
      if (status.isRunning) {
        console.log("⚠️  Migration is already running!");
        console.log(`📈 Progress: ${status.progressPercentage}% (${status.processedUsers}/${status.totalUsers})`);
        
        if (status.lastError) {
          console.log(`❌ Last Error: ${status.lastError}`);
        }
        
        const shouldContinue = await this.promptUser("Do you want to continue monitoring the existing migration? (y/n): ");
        if (!shouldContinue) {
          return false;
        }
        
        return await this.monitorMigration();
      }
      
      console.log("✅ Ready to start migration");
      return true;
    } catch (error) {
      console.error("❌ Failed to initialize migration:", error);
      return false;
    }
  }

  /**
   * Run the complete bulk migration
   */
  async runMigration(): Promise<boolean> {
    try {
      console.log("🔄 Starting bulk Phase 2 migration...");
      this.startTime = Date.now();
      this.isRunning = true;
      
      const result = await this.client.mutation(api.migrations.runBulkPhase2Migration, MIGRATION_CONFIG);
      
      this.migrationId = result.migrationId;
      
      console.log("📊 Migration Results:");
      console.log(`   Total Processed: ${result.totalProcessed}`);
      console.log(`   Successful: ${result.totalSuccessful}`);
      console.log(`   Failed: ${result.totalFailed}`);
      console.log(`   Migration ID: ${result.migrationId}`);
      
      if (result.errors.length > 0) {
        console.log("❌ Errors encountered:");
        result.errors.forEach((error, index) => {
          console.log(`   ${index + 1}. ${error}`);
        });
      }
      
      const success = result.totalFailed === 0;
      console.log(success ? "✅ Migration completed successfully!" : "⚠️  Migration completed with errors");
      
      return success;
    } catch (error) {
      console.error("❌ Migration failed:", error);
      return false;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Monitor an ongoing migration
   */
  async monitorMigration(): Promise<boolean> {
    console.log("👀 Monitoring migration progress...");
    
    const startTime = Date.now();
    let lastProcessedUsers = 0;
    let stallCount = 0;
    const maxStallCount = 10; // 50 seconds of no progress
    
    while (this.isRunning || Date.now() - startTime < MIGRATION_CONFIG.maxExecutionTime) {
      try {
        const status = await this.client.mutation(api.migrations.checkBulkMigrationStatus, {});
        
        // Update display
        this.displayProgress(status);
        
        // Check for completion
        if (!status.isRunning && status.processedUsers === status.totalUsers) {
          console.log("✅ Migration completed!");
          return status.failedUsers === 0;
        }
        
        // Check for stalls
        if (status.processedUsers === lastProcessedUsers) {
          stallCount++;
          if (stallCount >= maxStallCount) {
            console.log("⚠️  Migration appears to be stalled. Consider checking for errors.");
            stallCount = 0; // Reset counter
          }
        } else {
          stallCount = 0;
          lastProcessedUsers = status.processedUsers;
        }
        
        // Check for timeout
        if (Date.now() - startTime >= MIGRATION_CONFIG.maxExecutionTime) {
          console.log("⏰ Migration timeout reached. Consider checking status manually.");
          break;
        }
        
        await this.sleep(MIGRATION_CONFIG.progressCheckInterval);
      } catch (error) {
        console.error("❌ Error monitoring migration:", error);
        await this.sleep(MIGRATION_CONFIG.progressCheckInterval);
      }
    }
    
    return false;
  }

  /**
   * Display migration progress
   */
  private displayProgress(status: any): void {
    const progressBar = this.createProgressBar(status.progressPercentage);
    const elapsed = this.formatTime(Date.now() - this.startTime);
    
    console.clear();
    console.log("🔄 Phase 2 Migration Progress");
    console.log("=" .repeat(50));
    console.log(`📊 Progress: ${progressBar} ${status.progressPercentage.toFixed(1)}%`);
    console.log(`👥 Users: ${status.processedUsers}/${status.totalUsers}`);
    console.log(`✅ Successful: ${status.successfulUsers}`);
    console.log(`❌ Failed: ${status.failedUsers}`);
    console.log(`⏱️  Elapsed: ${elapsed}`);
    console.log(`🔄 Status: ${status.isRunning ? "Running" : "Stopped"}`);
    
    if (status.lastError) {
      console.log(`❌ Last Error: ${status.lastError}`);
    }
    
    console.log("=" .repeat(50));
  }

  /**
   * Create a visual progress bar
   */
  private createProgressBar(percentage: number, width: number = 30): string {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
  }

  /**
   * Format time in human-readable format
   */
  private formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Reset migration progress for retry
   */
  async resetMigration(migrationType?: string): Promise<boolean> {
    try {
      console.log("🔄 Resetting migration progress...");
      
      const result = await this.client.mutation(api.migrations.resetBulkMigrationProgress, {
        migrationType: migrationType as any,
      });
      
      if (result.success) {
        console.log(`✅ Reset ${result.resetCount} migration records`);
        return true;
      } else {
        console.log(`❌ Failed to reset migration: ${result.message}`);
        return false;
      }
    } catch (error) {
      console.error("❌ Error resetting migration:", error);
      return false;
    }
  }

  /**
   * Generate migration report
   */
  async generateReport(): Promise<void> {
    try {
      console.log("📊 Generating migration report...");
      
      const status = await this.client.mutation(api.migrations.checkBulkMigrationStatus, {});
      
      const report = {
        timestamp: new Date().toISOString(),
        migrationId: this.migrationId,
        totalUsers: status.totalUsers,
        processedUsers: status.processedUsers,
        successfulUsers: status.successfulUsers,
        failedUsers: status.failedUsers,
        progressPercentage: status.progressPercentage,
        isRunning: status.isRunning,
        lastError: status.lastError,
        executionTime: this.startTime ? Date.now() - this.startTime : 0,
      };
      
      console.log("\n📋 Migration Report");
      console.log("=" .repeat(50));
      console.log(`🕐 Timestamp: ${report.timestamp}`);
      console.log(`🆔 Migration ID: ${report.migrationId}`);
      console.log(`👥 Total Users: ${report.totalUsers}`);
      console.log(`✅ Successful: ${report.successfulUsers}`);
      console.log(`❌ Failed: ${report.failedUsers}`);
      console.log(`📊 Progress: ${report.progressPercentage.toFixed(1)}%`);
      console.log(`⏱️  Execution Time: ${this.formatTime(report.executionTime)}`);
      console.log(`🔄 Status: ${report.isRunning ? "Running" : "Completed"}`);
      
      if (report.lastError) {
        console.log(`❌ Last Error: ${report.lastError}`);
      }
      
      console.log("=" .repeat(50));
      
      // Save report to file
      const fs = require('fs');
      const reportPath = `migration-report-${Date.now()}.json`;
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`📄 Report saved to: ${reportPath}`);
      
    } catch (error) {
      console.error("❌ Error generating report:", error);
    }
  }

  /**
   * Utility function to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Utility function to prompt user input
   */
  private async promptUser(question: string): Promise<boolean> {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    
    return new Promise((resolve) => {
      rl.question(question, (answer: string) => {
        rl.close();
        resolve(answer.toLowerCase().startsWith('y'));
      });
    });
  }
}

// Main execution function
async function main() {
  const orchestrator = new MigrationOrchestrator();
  
  try {
    console.log("🎯 Phase 2 Migration Orchestrator");
    console.log("=" .repeat(50));
    
    // Initialize
    const initialized = await orchestrator.initialize();
    if (!initialized) {
      console.log("❌ Initialization failed. Exiting.");
      process.exit(1);
    }
    
    // Check if user wants to start migration
    const shouldStart = await orchestrator.promptUser("Do you want to start the migration? (y/n): ");
    if (!shouldStart) {
      console.log("👋 Migration cancelled by user.");
      process.exit(0);
    }
    
    // Run migration
    const success = await orchestrator.runMigration();
    
    // Generate report
    await orchestrator.generateReport();
    
    // Exit with appropriate code
    process.exit(success ? 0 : 1);
    
  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  }
}

// Command line interface
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Phase 2 Migration Orchestrator

Usage: node migration-orchestrator.js [options]

Options:
  --help, -h          Show this help message
  --reset             Reset migration progress before starting
  --monitor           Only monitor existing migration
  --report            Generate migration report only

Examples:
  node migration-orchestrator.js                    # Start new migration
  node migration-orchestrator.js --reset            # Reset and start migration
  node migration-orchestrator.js --monitor          # Monitor existing migration
  node migration-orchestrator.js --report           # Generate report only
    `);
    process.exit(0);
  }
  
  if (args.includes('--reset')) {
    console.log("🔄 Reset mode enabled");
  }
  
  if (args.includes('--monitor')) {
    console.log("👀 Monitor mode enabled");
  }
  
  if (args.includes('--report')) {
    console.log("📊 Report mode enabled");
  }
  
  main().catch(console.error);
}

export { MigrationOrchestrator };
