import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

/**
 * Backfills isCredit field for payment types that don't have it set
 * Heuristic: If payment type has closingDay and dueDay, it's a credit card
 */
export const backfillIsCreditField = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    processed: v.number(),
    updated: v.number(),
    success: v.boolean(),
  }),
  handler: async (ctx, args): Promise<{
    processed: number;
    updated: number;
    success: boolean;
  }> => {
    let processed = 0;
    let updated = 0;

    // Find all payment types where isCredit is undefined
    const allPaymentTypes = await ctx.db.query("paymentTypes").collect();
    
    for (const pt of allPaymentTypes) {
      processed++;
      
      // Skip if already has isCredit field set
      if (pt.isCredit !== undefined) {
        continue;
      }

      // Heuristic: If it has closingDay and dueDay, it's a credit card
      // OR if the name contains credit card keywords
      const nameLC = pt.name.toLowerCase();
      const creditKeywords = ['visa', 'mastercard', 'amex', 'american express', 'tarjeta', 'credit card'];
      const cashKeywords = ['efectivo', 'cash', 'transferencia', 'transfer', 'debit'];
      
      let isCredit = !!(pt.closingDay && pt.dueDay);
      
      // If no closing/due days, check name
      if (!isCredit && !pt.closingDay && !pt.dueDay) {
        const hasCreditKeyword = creditKeywords.some(kw => nameLC.includes(kw));
        const hasCashKeyword = cashKeywords.some(kw => nameLC.includes(kw));
        
        // Credit card if has credit keyword and no cash keyword
        if (hasCreditKeyword && !hasCashKeyword) {
          isCredit = true;
        }
      }
      
      if (!args.dryRun) {
        await ctx.db.patch(pt._id as Id<"paymentTypes">, {
          isCredit,
        });
      }
      
      updated++;
      console.log(`Payment type "${pt.name}" (${pt._id}): isCredit = ${isCredit}`);
    }

    return {
      processed,
      updated,
      success: true,
    };
  },
});

