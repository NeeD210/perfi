import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

/**
 * Comprehensive post-migration verification
 * Run this AFTER Phase 2 migration to verify integrity
 */
export const verifyMigrationIntegrity = internalQuery({
  args: {},
  returns: v.object({
    passed: v.boolean(),
    checks: v.array(v.object({
      name: v.string(),
      passed: v.boolean(),
      details: v.string(),
      critical: v.boolean(),
    })),
    summary: v.string(),
  }),
  handler: async (ctx) => {
    const checks: Array<{
      name: string;
      passed: boolean;
      details: string;
      critical: boolean;
    }> = [];
    
    // Check 1: Zero-sum invariant
    const journalEntries = await ctx.db.query("journal_entries").collect();
    const journalLines = await ctx.db.query("journal_lines").collect();
    
    let zeroSumPassed = true;
    let zeroSumDetails = "";
    const violations: string[] = [];
    
    for (const entry of journalEntries) {
      const lines = journalLines.filter(l => l.journalEntryId === entry._id);
      const sum = lines.reduce((acc, l) => acc + l.amountBaseCurrency, 0);
      if (sum !== 0) {
        zeroSumPassed = false;
        violations.push(`Entry ${entry._id}: sum=${sum}`);
      }
    }
    
    if (!zeroSumPassed && violations.length > 0) {
      zeroSumDetails = `${violations.length} violations. First 3: ${violations.slice(0, 3).join('; ')}`;
    }
    
    checks.push({
      name: "Zero-Sum Invariant",
      passed: zeroSumPassed,
      details: zeroSumPassed 
        ? `All ${journalEntries.length} entries balance correctly`
        : zeroSumDetails,
      critical: true,
    });
    
    // Check 2: Idempotency keys unique
    const idempotencyKeys = journalEntries
      .map(e => e.idempotencyKey)
      .filter(k => k);
    const uniqueKeys = new Set(idempotencyKeys);
    const duplicates = idempotencyKeys.length - uniqueKeys.size;
    
    checks.push({
      name: "Idempotency Keys Unique",
      passed: duplicates === 0,
      details: duplicates === 0 
        ? `All ${idempotencyKeys.length} keys are unique`
        : `Found ${duplicates} duplicate keys`,
      critical: true,
    });
    
    // Check 3: All accounts have mappings
    const accounts = await ctx.db.query("accounts").collect();
    const paymentTypeMappings = await ctx.db.query("payment_type_mappings").collect();
    const categoryMappings = await ctx.db.query("category_mappings").collect();
    const totalMappings = paymentTypeMappings.length + categoryMappings.length;
    
    // Each account should have at least one mapping (either payment type or category)
    const accountsWithMappings = new Set([
      ...paymentTypeMappings.map(m => m.accountId),
      ...categoryMappings.map(m => m.accountId)
    ]);
    
    checks.push({
      name: "Account Mappings Complete",
      passed: accountsWithMappings.size >= accounts.length,
      details: `${accounts.length} accounts, ${totalMappings} mappings (${accountsWithMappings.size} accounts mapped)`,
      critical: false,
    });
    
    // Check 4: Migration progress complete
    const users = await ctx.db.query("users").collect();
    const migrationProgress = await ctx.db.query("migration_progress").collect();
    const completedMigrations = migrationProgress.filter(p => p.status === "completed").length;
    const failedMigrations = migrationProgress.filter(p => p.status === "failed").length;
    
    // Each user should have 4 completed migrations: account_seeding, transaction_backfill, installment_backfill, recurring_migration
    const expectedMigrations = users.length * 4;
    
    checks.push({
      name: "All Users Migrated",
      passed: failedMigrations === 0 && completedMigrations >= users.length,
      details: `${completedMigrations}/${expectedMigrations} migrations completed, ${failedMigrations} failed`,
      critical: true,
    });
    
    // Check 5: No orphaned records
    let orphanedCount = 0;
    for (const line of journalLines) {
      const entry = journalEntries.find(e => e._id === line.journalEntryId);
      if (!entry) orphanedCount++;
    }
    
    checks.push({
      name: "No Orphaned Records",
      passed: orphanedCount === 0,
      details: orphanedCount === 0 
        ? "All journal lines have valid entries"
        : `Found ${orphanedCount} orphaned lines`,
      critical: true,
    });
    
    // Check 6: Expenses to journal entries ratio
    const expenses = await ctx.db.query("expenses").collect();
    const nonDeletedExpenses = expenses.filter(e => !e.softdelete);
    const conversionRate = nonDeletedExpenses.length > 0 
      ? (journalEntries.length / nonDeletedExpenses.length) * 100 
      : 100;
    
    checks.push({
      name: "Expense Conversion Rate",
      passed: conversionRate >= 90, // At least 90% should convert
      details: `${journalEntries.length}/${nonDeletedExpenses.length} expenses converted (${conversionRate.toFixed(1)}%)`,
      critical: false,
    });
    
    // Check 7: Recurring entries have lines
    const recurringEntries = await ctx.db.query("recurring_entries").collect();
    const recurringLines = await ctx.db.query("recurring_lines").collect();
    
    let recurringWithoutLines = 0;
    for (const entry of recurringEntries) {
      const lines = recurringLines.filter(l => l.recurringId === entry._id);
      if (lines.length === 0) recurringWithoutLines++;
    }
    
    checks.push({
      name: "Recurring Entries Have Lines",
      passed: recurringWithoutLines === 0,
      details: recurringWithoutLines === 0
        ? `All ${recurringEntries.length} recurring entries have lines`
        : `${recurringWithoutLines} recurring entries without lines`,
      critical: true,
    });
    
    // Check 8: All journal lines have valid accounts
    let invalidAccountRefs = 0;
    for (const line of journalLines) {
      const account = accounts.find(a => a._id === line.accountId);
      if (!account) invalidAccountRefs++;
    }
    
    checks.push({
      name: "All Journal Lines Have Valid Accounts",
      passed: invalidAccountRefs === 0,
      details: invalidAccountRefs === 0
        ? "All journal lines reference valid accounts"
        : `${invalidAccountRefs} lines reference invalid accounts`,
      critical: true,
    });
    
    // Overall assessment
    const criticalFailures = checks.filter(c => c.critical && !c.passed).length;
    const passed = criticalFailures === 0;
    
    const summary = passed
      ? `✅ Migration passed all ${checks.filter(c => c.critical).length} critical checks`
      : `❌ Migration failed ${criticalFailures} critical checks - review and fix before proceeding`;
    
    return { passed, checks, summary };
  },
});

/**
 * Quick health check for monitoring
 */
export const quickHealthCheck = internalQuery({
  args: {},
  returns: v.object({
    healthy: v.boolean(),
    stats: v.object({
      users: v.number(),
      accounts: v.number(),
      journalEntries: v.number(),
      journalLines: v.number(),
      recurringEntries: v.number(),
      completedMigrations: v.number(),
      failedMigrations: v.number(),
    }),
    issues: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const issues: string[] = [];
    
    const [
      users,
      accounts,
      journalEntries,
      journalLines,
      recurringEntries,
      migrationProgress,
    ] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("accounts").collect(),
      ctx.db.query("journal_entries").collect(),
      ctx.db.query("journal_lines").collect(),
      ctx.db.query("recurring_entries").collect(),
      ctx.db.query("migration_progress").collect(),
    ]);
    
    const completedMigrations = migrationProgress.filter(p => p.status === "completed").length;
    const failedMigrations = migrationProgress.filter(p => p.status === "failed").length;
    
    // Quick sanity checks
    if (journalEntries.length === 0 && accounts.length > 0) {
      issues.push("No journal entries found despite having accounts");
    }
    
    if (failedMigrations > 0) {
      issues.push(`${failedMigrations} migrations failed`);
    }
    
    if (journalLines.length < journalEntries.length * 2) {
      issues.push("Expected at least 2 lines per journal entry");
    }
    
    const healthy = issues.length === 0 && failedMigrations === 0;
    
    return {
      healthy,
      stats: {
        users: users.length,
        accounts: accounts.length,
        journalEntries: journalEntries.length,
        journalLines: journalLines.length,
        recurringEntries: recurringEntries.length,
        completedMigrations,
        failedMigrations,
      },
      issues,
    };
  },
});

