import { internalQuery, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

/**
 * Pre-flight check to identify data quality issues before migration
 * Run this BEFORE starting Phase 2 migration
 */
export const runPreflightCheck = internalQuery({
  args: {},
  returns: v.object({
    passed: v.boolean(),
    issues: v.array(v.object({
      severity: v.union(v.literal("critical"), v.literal("warning"), v.literal("info")),
      category: v.string(),
      message: v.string(),
      count: v.number(),
      affectedRecords: v.array(v.string()),
    })),
    summary: v.object({
      critical: v.number(),
      warnings: v.number(),
      info: v.number(),
    }),
  }),
  handler: async (ctx) => {
    const issues: Array<{
      severity: "critical" | "warning" | "info";
      category: string;
      message: string;
      count: number;
      affectedRecords: string[];
    }> = [];
    
    // Check 1: Expenses with missing categories
    const expenses = await ctx.db.query("expenses").collect();
    const expensesWithoutCategory = expenses.filter(e => !e.categoryId);
    if (expensesWithoutCategory.length > 0) {
      issues.push({
        severity: "warning",
        category: "Data Quality",
        message: "Expenses without valid category reference",
        count: expensesWithoutCategory.length,
        affectedRecords: expensesWithoutCategory.slice(0, 10).map(e => e._id),
      });
    }
    
    // Check 2: Expenses with missing payment types (especially incomes)
    const expensesWithoutPaymentType = expenses.filter(e => !e.paymentTypeId);
    if (expensesWithoutPaymentType.length > 0) {
      issues.push({
        severity: "info",
        category: "Data Quality",
        message: "Expenses without payment type (will default to 'Efectivo')",
        count: expensesWithoutPaymentType.length,
        affectedRecords: expensesWithoutPaymentType.slice(0, 10).map(e => e._id),
      });
    }
    
    // Check 3: Soft-deleted categories still referenced
    const categories = await ctx.db.query("categories").collect();
    const deletedCategories = new Set(
      categories.filter(c => c.softdelete).map(c => c._id)
    );
    const expensesReferencingDeletedCategories = expenses.filter(
      e => e.categoryId && deletedCategories.has(e.categoryId)
    );
    if (expensesReferencingDeletedCategories.length > 0) {
      issues.push({
        severity: "info",
        category: "Referential Integrity",
        message: "Expenses referencing soft-deleted categories (will migrate with soft-delete status)",
        count: expensesReferencingDeletedCategories.length,
        affectedRecords: expensesReferencingDeletedCategories.slice(0, 10).map(e => e._id),
      });
    }
    
    // Check 4: Soft-deleted payment types still referenced
    const paymentTypes = await ctx.db.query("paymentTypes").collect();
    const deletedPaymentTypes = new Set(
      paymentTypes.filter(p => p.softdelete).map(p => p._id)
    );
    const expensesReferencingDeletedPaymentTypes = expenses.filter(
      e => e.paymentTypeId && deletedPaymentTypes.has(e.paymentTypeId)
    );
    if (expensesReferencingDeletedPaymentTypes.length > 0) {
      issues.push({
        severity: "info",
        category: "Referential Integrity",
        message: "Expenses referencing soft-deleted payment types (will migrate with soft-delete status)",
        count: expensesReferencingDeletedPaymentTypes.length,
        affectedRecords: expensesReferencingDeletedPaymentTypes.slice(0, 10).map(e => e._id),
      });
    }
    
    // Check 5: Existing migration state
    const existingAccounts = await ctx.db.query("accounts").collect();
    const existingJournalEntries = await ctx.db.query("journal_entries").collect();
    
    if (existingAccounts.length > 0 || existingJournalEntries.length > 0) {
      issues.push({
        severity: "critical",
        category: "Migration State",
        message: "Ledger tables not empty - migration may have already run or needs cleanup",
        count: existingAccounts.length + existingJournalEntries.length,
        affectedRecords: [],
      });
    }
    
    // Check 6: User count validation
    const users = await ctx.db.query("users").collect();
    if (users.length === 0) {
      issues.push({
        severity: "critical",
        category: "Data Validation",
        message: "No users found - cannot proceed with migration",
        count: 0,
        affectedRecords: [],
      });
    }
    
    // Check 7: Verify required indexes exist
    // This is informational - can't directly check indexes, but we can verify queries work
    try {
      await ctx.db.query("paymentTypes").withIndex("by_user", (q) => q.eq("userId", users[0]?._id)).first();
      await ctx.db.query("categories").withIndex("by_user", (q) => q.eq("userId", users[0]?._id)).first();
    } catch (error) {
      issues.push({
        severity: "critical",
        category: "Schema",
        message: "Required indexes missing - ensure schema is deployed",
        count: 0,
        affectedRecords: [],
      });
    }
    
    const summary = {
      critical: issues.filter(i => i.severity === "critical").length,
      warnings: issues.filter(i => i.severity === "warning").length,
      info: issues.filter(i => i.severity === "info").length,
    };
    
    const passed = summary.critical === 0;
    
    return { passed, issues, summary };
  },
});

/**
 * Fix missing mappings by creating default categories and payment types
 * Run with dryRun: true first to see what would be fixed
 */
export const fixMissingMappings = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    fixed: v.number(),
    createdAccounts: v.number(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    let fixed = 0;
    let createdAccounts = 0;
    
    const expenses = await ctx.db.query("expenses").collect();
    
    for (const expense of expenses) {
      let needsUpdate = false;
      const updates: any = {};
      
      if (!expense.categoryId) {
        // Create or find "Uncategorized" category for this user
        let uncategorized = await ctx.db
          .query("categories")
          .withIndex("by_user_softdelete", (q) =>
            q.eq("userId", expense.userId).eq("softdelete", false)
          )
          .filter(q => q.eq(q.field("name"), "Uncategorized"))
          .first();
        
        if (!uncategorized && !dryRun) {
          // Create Uncategorized category
          const categoryId = await ctx.db.insert("categories", {
            userId: expense.userId,
            name: "Uncategorized",
            transactionType: expense.transactionType || "expense",
            softdelete: false,
          });
          uncategorized = await ctx.db.get(categoryId);
          createdAccounts++;
        }
          
        if (uncategorized) {
          updates.categoryId = uncategorized._id;
          needsUpdate = true;
        }
      }
      
      // Handle empty paymentType (common for incomes)
      // Note: Migration will auto-create "Efectivo" if needed, but this fixes the source data
      if (!expense.paymentTypeId) {
        // Look for "Efectivo" (Cash) payment type for this user
        let efectivo = await ctx.db
          .query("paymentTypes")
          .withIndex("by_user_softdelete", (q) =>
            q.eq("userId", expense.userId).eq("softdelete", false)
          )
          .filter(q => q.eq(q.field("name"), "Efectivo"))
          .first();
        
        if (!efectivo && !dryRun) {
          // Create "Efectivo" payment type
          const paymentTypeId = await ctx.db.insert("paymentTypes", {
            userId: expense.userId,
            name: "Efectivo",
            isCredit: false,
            softdelete: false,
          });
          efectivo = await ctx.db.get(paymentTypeId);
          createdAccounts++;
        }
          
        if (efectivo) {
          updates.paymentTypeId = efectivo._id;
          needsUpdate = true;
        }
      }
      
      if (needsUpdate && !dryRun) {
        await ctx.db.patch(expense._id, updates);
        fixed++;
      } else if (needsUpdate) {
        fixed++; // Count what would be fixed
      }
    }
    
    const message = dryRun
      ? `DRY RUN: Would fix ${fixed} expenses and create ${createdAccounts} default accounts`
      : `Fixed ${fixed} expenses by assigning default categories/payment types. Created ${createdAccounts} default accounts.`;
      
    return { fixed, createdAccounts, message };
  },
});

