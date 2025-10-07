import { internalMutation, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { api } from "../_generated/api";

/**
 * Bulk Phase 2 Migration System
 * 
 * This system automates the Phase 2 migration process for all users without requiring
 * manual user-by-user execution. It includes:
 * - Batch processing of users
 * - System-wide progress tracking
 * - Comprehensive error handling and retry mechanisms
 * - Resume capability for interrupted migrations
 */

// System-wide migration status tracking
export const initializeBulkMigration = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
    maxConcurrentUsers: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
    totalUsers: v.number(),
    migrationId: v.string(),
    message: v.string(),
  }),
  handler: async (ctx, args): Promise<{
    success: boolean;
    totalUsers: number;
    migrationId: string;
    message: string;
  }> => {
    const batchSize = args.batchSize ?? 50;
    const maxConcurrentUsers = args.maxConcurrentUsers ?? 10;
    
    // Generate unique migration ID
    const migrationId = `bulk_phase2_${Date.now()}`;
    
    try {
      // Get all active users (not soft-deleted)
      const users = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("softdelete"), false))
        .collect();
      
      const totalUsers = users.length;
      
      if (totalUsers === 0) {
        return {
          success: false,
          totalUsers: 0,
          migrationId,
          message: "No active users found to migrate",
        };
      }
      
      // Create system-wide migration progress record
      await ctx.db.insert("migration_progress", {
        userId: users[0]._id, // Use first user as system record holder
        migrationType: "account_seeding", // We'll use this for system tracking
        status: "pending",
        recordsProcessed: 0,
        totalRecords: totalUsers,
        startedAt: Date.now(),
        errorMessage: `Bulk migration initialized: ${migrationId}`,
      });
      
      console.log(`Bulk Phase 2 migration initialized: ${migrationId}`);
      console.log(`Total users to migrate: ${totalUsers}`);
      console.log(`Batch size: ${batchSize}, Max concurrent: ${maxConcurrentUsers}`);
      
      return {
        success: true,
        totalUsers,
        migrationId,
        message: `Bulk migration initialized for ${totalUsers} users`,
      };
    } catch (error) {
      console.error("Failed to initialize bulk migration:", error);
      return {
        success: false,
        totalUsers: 0,
        migrationId,
        message: `Failed to initialize bulk migration: ${error}`,
      };
    }
  },
});

// Process a batch of users through Phase 2 migration
export const processUserBatch = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
    lastProcessedUserId: v.optional(v.id("users")),
    migrationId: v.optional(v.string()),
  },
  returns: v.object({
    processed: v.number(),
    successful: v.number(),
    failed: v.number(),
    hasMore: v.boolean(),
    lastProcessedUserId: v.optional(v.id("users")),
    errors: v.array(v.string()),
  }),
  handler: async (ctx, args): Promise<{
    processed: number;
    successful: number;
    failed: number;
    hasMore: boolean;
    lastProcessedUserId?: Id<"users">;
    errors: string[];
  }> => {
    const batchSize = args.batchSize ?? 50;
    let processed = 0;
    let successful = 0;
    let failed = 0;
    const errors: string[] = [];
    let lastProcessedUserId: Id<"users"> | undefined = args.lastProcessedUserId;
    
    try {
      // Get batch of users to process
      const users = await ctx.db
        .query("users")
        .filter((q) => 
          q.and(
            q.eq(q.field("softdelete"), false),
            !lastProcessedUserId || q.gt(q.field("_id"), lastProcessedUserId)
          )
        )
        .take(batchSize);
      
      if (users.length === 0) {
        return {
          processed: 0,
          successful: 0,
          failed: 0,
          hasMore: false,
          lastProcessedUserId,
          errors: [],
        };
      }
      
      // Process each user in the batch
      for (const user of users) {
        try {
          console.log(`Processing Phase 2 migration for user: ${user._id}`);
          
          // Run Phase 2 migration for this user
          const result = await ctx.runMutation(
            internal.migrations.phase2Runner.runPhase2ForUser,
            { userId: user._id }
          );
          
          if (result.overallSuccess) {
            successful++;
            console.log(`✅ User ${user._id} migrated successfully`);
          } else {
            failed++;
            const errorMsg = `User ${user._id}: ${result.message}`;
            errors.push(errorMsg);
            console.error(`❌ User ${user._id} migration failed:`, errorMsg);
          }
          
          lastProcessedUserId = user._id;
        } catch (error) {
          failed++;
          const errorMsg = `User ${user._id}: ${error}`;
          errors.push(errorMsg);
          console.error(`❌ User ${user._id} migration error:`, error);
        }
        
        processed++;
      }
      
      return {
        processed,
        successful,
        failed,
        hasMore: users.length === batchSize,
        lastProcessedUserId,
        errors,
      };
    } catch (error) {
      console.error("Batch processing error:", error);
      throw error;
    }
  },
});

// Run the complete bulk migration with retry logic
export const runBulkPhase2Migration = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
    maxRetries: v.optional(v.number()),
    maxConcurrentUsers: v.optional(v.number()),
  },
  returns: v.object({
    totalProcessed: v.number(),
    totalSuccessful: v.number(),
    totalFailed: v.number(),
    migrationId: v.string(),
    errors: v.array(v.string()),
    message: v.string(),
  }),
  handler: async (ctx, args): Promise<{
    totalProcessed: number;
    totalSuccessful: number;
    totalFailed: number;
    migrationId: string;
    errors: string[];
    message: string;
  }> => {
    const batchSize = args.batchSize ?? 50;
    const maxRetries = args.maxRetries ?? 3;
    const maxConcurrentUsers = args.maxConcurrentUsers ?? 10;
    
    // Initialize bulk migration
    const initResult = await ctx.runMutation(
      internal.migrations.bulkPhase2Migration.initializeBulkMigration,
      { batchSize, maxConcurrentUsers }
    );
    
    if (!initResult.success) {
      return {
        totalProcessed: 0,
        totalSuccessful: 0,
        totalFailed: 0,
        migrationId: initResult.migrationId,
        errors: [initResult.message],
        message: initResult.message,
      };
    }
    
    const migrationId = initResult.migrationId;
    const results = {
      totalProcessed: 0,
      totalSuccessful: 0,
      totalFailed: 0,
      errors: [] as string[],
    };
    
    let hasMore = true;
    let lastProcessedUserId: Id<"users"> | undefined;
    let retryCount = 0;
    
    console.log(`Starting bulk Phase 2 migration: ${migrationId}`);
    
    while (hasMore && retryCount < maxRetries) {
      try {
        const batchResult = await ctx.runMutation(
          internal.migrations.bulkPhase2Migration.processUserBatch,
          {
            batchSize,
            lastProcessedUserId,
            migrationId,
          }
        );
        
        results.totalProcessed += batchResult.processed;
        results.totalSuccessful += batchResult.successful;
        results.totalFailed += batchResult.failed;
        results.errors.push(...batchResult.errors);
        
        hasMore = batchResult.hasMore;
        lastProcessedUserId = batchResult.lastProcessedUserId;
        
        // Reset retry count on successful batch
        retryCount = 0;
        
        console.log(`Batch completed: ${batchResult.processed} processed, ${batchResult.successful} successful, ${batchResult.failed} failed`);
        
        // Small delay between batches to prevent overwhelming the system
        if (hasMore) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`Batch processing failed (attempt ${retryCount + 1}/${maxRetries}):`, error);
        retryCount++;
        
        if (retryCount >= maxRetries) {
          const errorMsg = `Bulk migration failed after ${maxRetries} retries: ${error}`;
          results.errors.push(errorMsg);
          break;
        }
        
        // Exponential backoff before retry
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
      }
    }
    
    const message = `Bulk Phase 2 migration completed: ${results.totalProcessed} users processed, ${results.totalSuccessful} successful, ${results.totalFailed} failed`;
    console.log(message);
    
    return {
      ...results,
      migrationId,
      message,
    };
  },
});

// Check bulk migration status
export const checkBulkMigrationStatus = internalMutation({
  args: {},
  returns: v.object({
    isRunning: v.boolean(),
    totalUsers: v.number(),
    processedUsers: v.number(),
    successfulUsers: v.number(),
    failedUsers: v.number(),
    progressPercentage: v.number(),
    estimatedTimeRemaining: v.optional(v.number()),
    lastError: v.optional(v.string()),
  }),
  handler: async (ctx) => {
    try {
      // Get all users count
      const totalUsers = await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("softdelete"), false))
        .collect()
        .then(users => users.length);
      
      // Get migration progress for all users
      const migrationProgress = await ctx.db
        .query("migration_progress")
        .filter((q) => q.eq(q.field("migrationType"), "account_seeding"))
        .collect();
      
      let processedUsers = 0;
      let successfulUsers = 0;
      let failedUsers = 0;
      let lastError: string | undefined;
      
      for (const progress of migrationProgress) {
        if (progress.status === "completed") {
          processedUsers++;
          successfulUsers++;
        } else if (progress.status === "failed") {
          processedUsers++;
          failedUsers++;
          if (progress.errorMessage) {
            lastError = progress.errorMessage;
          }
        } else if (progress.status === "in_progress") {
          processedUsers++;
        }
      }
      
      const progressPercentage = totalUsers > 0 ? (processedUsers / totalUsers) * 100 : 0;
      
      return {
        isRunning: migrationProgress.some(p => p.status === "in_progress"),
        totalUsers,
        processedUsers,
        successfulUsers,
        failedUsers,
        progressPercentage: Math.round(progressPercentage * 100) / 100,
        estimatedTimeRemaining: undefined, // Could be calculated based on processing rate
        lastError,
      };
    } catch (error) {
      console.error("Error checking bulk migration status:", error);
      return {
        isRunning: false,
        totalUsers: 0,
        processedUsers: 0,
        successfulUsers: 0,
        failedUsers: 0,
        progressPercentage: 0,
        lastError: String(error),
      };
    }
  },
});

// Reset bulk migration progress (for retry scenarios)
export const resetBulkMigrationProgress = internalMutation({
  args: {
    migrationType: v.optional(v.union(
      v.literal("account_seeding"),
      v.literal("transaction_backfill"),
      v.literal("installment_backfill")
    )),
  },
  returns: v.object({
    success: v.boolean(),
    resetCount: v.number(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    try {
      const migrationType = args.migrationType || "account_seeding";
      
      // Get all migration progress records for the specified type
      const progressRecords = await ctx.db
        .query("migration_progress")
        .filter((q) => q.eq(q.field("migrationType"), migrationType))
        .collect();
      
      let resetCount = 0;
      
      for (const record of progressRecords) {
        await ctx.db.patch(record._id, {
          status: "pending",
          recordsProcessed: 0,
          lastProcessedId: undefined,
          errorMessage: undefined,
        });
        resetCount++;
      }
      
      return {
        success: true,
        resetCount,
        message: `Reset ${resetCount} migration progress records for type: ${migrationType}`,
      };
    } catch (error) {
      console.error("Error resetting bulk migration progress:", error);
      return {
        success: false,
        resetCount: 0,
        message: `Failed to reset migration progress: ${error}`,
      };
    }
  },
});

// Action to run bulk migration (for external triggers)
export const runBulkPhase2MigrationAction = internalAction({
  args: {
    batchSize: v.optional(v.number()),
    maxRetries: v.optional(v.number()),
    maxConcurrentUsers: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
    totalProcessed: v.number(),
    totalSuccessful: v.number(),
    totalFailed: v.number(),
    migrationId: v.string(),
    errors: v.array(v.string()),
    message: v.string(),
  }),
  handler: async (ctx, args): Promise<{
    success: boolean;
    totalProcessed: number;
    totalSuccessful: number;
    totalFailed: number;
    migrationId: string;
    errors: string[];
    message: string;
  }> => {
    try {
      const result: {
        totalProcessed: number;
        totalSuccessful: number;
        totalFailed: number;
        migrationId: string;
        errors: string[];
        message: string;
      } = await ctx.runMutation(
        internal.migrations.bulkPhase2Migration.runBulkPhase2Migration,
        args
      );
      
      return {
        success: result.totalFailed === 0,
        ...result,
      };
    } catch (error) {
      console.error("Bulk migration action failed:", error);
      return {
        success: false,
        totalProcessed: 0,
        totalSuccessful: 0,
        totalFailed: 0,
        migrationId: `error_${Date.now()}`,
        errors: [String(error)],
        message: `Bulk migration action failed: ${error}`,
      };
    }
  },
});
