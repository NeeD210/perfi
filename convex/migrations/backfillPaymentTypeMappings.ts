/**
 * Migration: Backfill Payment Type Mappings
 * 
 * Purpose: Creates missing ledger structures (accounts, mappings, cards) for payment types
 * that were created using the deprecated addPaymentType mutation which lacked dual-write support.
 * 
 * This migration:
 * 1. Finds all active payment types for a user
 * 2. Checks if each has a corresponding payment_type_mapping
 * 3. For orphaned payment types (no mapping), creates:
 *    - Account record (liability for credit, asset for cash/debit)
 *    - payment_type_mapping linking them
 *    - Card record (if credit card with billing cycle info)
 * 
 * Run per user: npx convex run migrations:backfillPaymentTypeMappings '{"userId":"..."}'
 * Run for all users: npx convex run migrations:backfillPaymentTypeMappingsForAllUsers
 */

import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

/**
 * Backfill payment type mappings for a single user
 */
export const backfillPaymentTypeMappings = internalMutation({
  args: { 
    userId: v.id("users"),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    totalPaymentTypes: v.number(),
    orphanedCount: v.number(),
    backfilledCount: v.number(),
    skippedCount: v.number(),
    errors: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;
    const errors: Array<string> = [];
    let backfilledCount = 0;
    let skippedCount = 0;

    console.log(`Starting backfill for user ${args.userId} (dryRun: ${dryRun})`);

    // Get all active payment types for this user
    const paymentTypes = await ctx.db
      .query("paymentTypes")
      .withIndex("by_user", q => q.eq("userId", args.userId))
      .filter(q => q.eq(q.field("softdelete"), false))
      .collect();

    console.log(`Found ${paymentTypes.length} active payment types`);

    // Check each payment type for existing mapping
    const orphanedTypes: Array<any> = [];
    
    for (const pt of paymentTypes) {
      const existing = await ctx.db
        .query("payment_type_mappings")
        .withIndex("by_user_paymentType", q => 
          q.eq("userId", args.userId).eq("paymentTypeId", pt._id)
        )
        .first();
      
      if (!existing) {
        orphanedTypes.push(pt);
        console.log(`  ⚠️  Orphaned: ${pt.name} (${pt._id})`);
      } else {
        console.log(`  ✓ Has mapping: ${pt.name}`);
      }
    }

    console.log(`Found ${orphanedTypes.length} orphaned payment types`);

    if (dryRun) {
      console.log("DRY RUN - No changes made");
      return {
        totalPaymentTypes: paymentTypes.length,
        orphanedCount: orphanedTypes.length,
        backfilledCount: 0,
        skippedCount: orphanedTypes.length,
        errors: [],
      };
    }

    // Backfill missing ledger structures
    for (const pt of orphanedTypes) {
      try {
        console.log(`  Creating ledger structures for: ${pt.name}`);
        
        // Determine account type: liability for credit cards, asset for cash/debit
        const accountType = pt.isCredit ? "liability" : "asset";
        
        // Create account
        const accountId = await ctx.db.insert("accounts", {
          userId: args.userId,
          description: pt.name,
          accountType,
          creationTime: Date.now(),
          softdelete: false,
        }) as Id<"accounts">;
        
        console.log(`    ✓ Created account: ${accountId}`);
        
        // Create mapping
        await ctx.db.insert("payment_type_mappings", {
          userId: args.userId,
          paymentTypeId: pt._id,
          accountId,
          createdAt: Date.now(),
        });
        
        console.log(`    ✓ Created mapping`);
        
        // Create card record if it's a credit card with billing cycle info
        if (pt.isCredit && pt.closingDay && pt.dueDay) {
          await ctx.db.insert("cards", {
            accountId,
            userId: args.userId,
            closingDay: pt.closingDay,
            dueDate: pt.dueDay,
            softdelete: false,
          });
          
          console.log(`    ✓ Created card record`);
        }
        
        backfilledCount++;
        console.log(`  ✓ Backfilled: ${pt.name}`);
        
      } catch (error) {
        const errorMsg = `Failed to backfill ${pt.name}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(`  ✗ ${errorMsg}`);
        errors.push(errorMsg);
        skippedCount++;
      }
    }

    console.log(`Backfill complete: ${backfilledCount} created, ${skippedCount} skipped, ${errors.length} errors`);

    return {
      totalPaymentTypes: paymentTypes.length,
      orphanedCount: orphanedTypes.length,
      backfilledCount,
      skippedCount,
      errors,
    };
  },
});

/**
 * Get all users who have payment types
 */
export const getUsersWithPaymentTypes = internalQuery({
  args: {},
  returns: v.array(v.id("users")),
  handler: async (ctx) => {
    const paymentTypes = await ctx.db
      .query("paymentTypes")
      .filter(q => q.eq(q.field("softdelete"), false))
      .collect();
    
    // Get unique user IDs
    const userIds = new Set(paymentTypes.map(pt => pt.userId));
    
    return Array.from(userIds);
  },
});

/**
 * Backfill payment type mappings for all users
 */
export const backfillPaymentTypeMappingsForAllUsers = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    totalUsers: v.number(),
    successfulUsers: v.number(),
    failedUsers: v.number(),
    totalBackfilled: v.number(),
    errors: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? false;
    console.log(`Starting backfill for all users (dryRun: ${dryRun})`);

    // Get all users with payment types
    const userIds: Array<Id<"users">> = await ctx.runQuery(internal.migrations.backfillPaymentTypeMappings.getUsersWithPaymentTypes);
    
    console.log(`Found ${userIds.length} users with payment types`);

    let successfulUsers = 0;
    let failedUsers = 0;
    let totalBackfilled = 0;
    const allErrors: Array<string> = [];

    for (const userId of userIds) {
      try {
        console.log(`\nProcessing user: ${userId}`);
        
        const result = await ctx.runMutation(
          internal.migrations.backfillPaymentTypeMappings.backfillPaymentTypeMappings,
          { userId, dryRun }
        );
        
        totalBackfilled += result.backfilledCount;
        
        if (result.errors.length > 0) {
          failedUsers++;
          allErrors.push(`User ${userId}: ${result.errors.join(', ')}`);
        } else {
          successfulUsers++;
        }
        
        console.log(`  User ${userId}: ${result.backfilledCount} backfilled`);
        
      } catch (error) {
        failedUsers++;
        const errorMsg = `User ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(`  ✗ ${errorMsg}`);
        allErrors.push(errorMsg);
      }
    }

    console.log(`\n=== Backfill Complete ===`);
    console.log(`Total users: ${userIds.length}`);
    console.log(`Successful: ${successfulUsers}`);
    console.log(`Failed: ${failedUsers}`);
    console.log(`Total backfilled: ${totalBackfilled}`);
    console.log(`Errors: ${allErrors.length}`);

    return {
      totalUsers: userIds.length,
      successfulUsers,
      failedUsers,
      totalBackfilled,
      errors: allErrors,
    };
  },
});

