/**
 * Migration to fix missing baseCurrency and createdAt fields in cards table
 * 
 * This migration addresses a critical issue where existing cards are missing
 * required fields needed for Phase 5 card statement calculation.
 */

import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

export const fixCardFields = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
  },
  returns: v.object({
    processed: v.number(),
    updated: v.number(),
    errors: v.number(),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const batchSize = args.batchSize || 50;
    let processed = 0;
    let updated = 0;
    let errors = 0;

    console.log("[Fix Card Fields] Starting migration to add missing baseCurrency and createdAt fields");

    try {
      // Get cards that are missing required fields
      const cards = await ctx.db
        .query("cards")
        .filter((q) => 
          q.or(
            q.eq(q.field("baseCurrency"), undefined),
            q.eq(q.field("createdAt"), undefined)
          )
        )
        .take(batchSize);

      console.log(`[Fix Card Fields] Found ${cards.length} cards needing updates`);

      for (const card of cards) {
        try {
          const updates: any = {};
          let needsUpdate = false;

          // Add baseCurrency if missing (default to ARS)
          if (!card.baseCurrency) {
            updates.baseCurrency = "ARS";
            needsUpdate = true;
            console.log(`[Fix Card Fields] Adding baseCurrency=ARS to card ${card._id}`);
          }

          // Add createdAt if missing (use creation time)
          if (!card.createdAt) {
            updates.createdAt = card._creationTime;
            needsUpdate = true;
            console.log(`[Fix Card Fields] Adding createdAt=${card._creationTime} to card ${card._id}`);
          }

          if (needsUpdate) {
            await ctx.db.patch(card._id, updates);
            updated++;
          }

          processed++;
        } catch (error) {
          errors++;
          console.error(`[Fix Card Fields] Error updating card ${card._id}: ${error}`);
        }
      }

      const hasMore = cards.length === batchSize;

      console.log(`[Fix Card Fields] Migration completed: ${processed} processed, ${updated} updated, ${errors} errors`);

      return {
        processed,
        updated,
        errors,
        hasMore,
      };
    } catch (error) {
      console.error(`[Fix Card Fields] Migration failed: ${error}`);
      return {
        processed,
        updated,
        errors: errors + 1,
        hasMore: false,
      };
    }
  },
});

export const runCardFieldsFix = internalMutation({
  args: {},
  returns: v.object({
    totalProcessed: v.number(),
    totalUpdated: v.number(),
    totalErrors: v.number(),
    success: v.boolean(),
  }),
  handler: async (ctx) => {
    let totalProcessed = 0;
    let totalUpdated = 0;
    let totalErrors = 0;
    let hasMore = true;

    console.log("[Fix Card Fields] Starting full migration run");

    // Process all cards in batches
    let offset = 0;
    const batchSize = 50;
    
    while (hasMore) {
      const cards = await ctx.db
        .query("cards")
        .filter((q) => 
          q.or(
            q.eq(q.field("baseCurrency"), undefined),
            q.eq(q.field("createdAt"), undefined)
          )
        )
        .take(batchSize);

      if (cards.length === 0) {
        hasMore = false;
        break;
      }

      let batchProcessed = 0;
      let batchUpdated = 0;
      let batchErrors = 0;

      for (const card of cards) {
        try {
          const updates: any = {};
          let needsUpdate = false;

          // Add baseCurrency if missing (default to ARS)
          if (!card.baseCurrency) {
            updates.baseCurrency = "ARS";
            needsUpdate = true;
          }

          // Add createdAt if missing (use creation time)
          if (!card.createdAt) {
            updates.createdAt = card._creationTime;
            needsUpdate = true;
          }

          if (needsUpdate) {
            await ctx.db.patch(card._id, updates);
            batchUpdated++;
          }

          batchProcessed++;
        } catch (error) {
          batchErrors++;
          console.error(`[Fix Card Fields] Error updating card ${card._id}: ${error}`);
        }
      }

      totalProcessed += batchProcessed;
      totalUpdated += batchUpdated;
      totalErrors += batchErrors;
      
      hasMore = cards.length === batchSize;
      
      console.log(`[Fix Card Fields] Batch completed: ${batchProcessed} processed, ${batchUpdated} updated`);
    }

    const success = totalErrors === 0;

    console.log(`[Fix Card Fields] Full migration completed: ${totalProcessed} processed, ${totalUpdated} updated, ${totalErrors} errors`);

    return {
      totalProcessed,
      totalUpdated,
      totalErrors,
      success,
    };
  },
});
