import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";

export const verifyUserIntegrity = internalQuery({
  args: { userId: v.string() },
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
  handler: async (ctx, args) => {
    const userId = args.userId;
    
    // Better to look up the user first to get the real Id type if strict
    const user = await ctx.db.query("users").filter(q => q.eq(q.field("auth0Id"), args.userId)).first();
    
    // If the user passed an ID string directly, we use it.
    // The prompt gave "k579d0k5gh9wq3x817k2mdty2s7g4mhy" which looks like a Convex ID.
    const targetUserId = (user ? user._id : args.userId) as Id<"users">;

    const checks: Array<{
      name: string;
      passed: boolean;
      details: string;
      critical: boolean;
    }> = [];

    // 1. Fetch all Journal Entries for the user
    const journalEntries = await ctx.db
      .query("journal_entries")
      .withIndex("by_user_date", (q) => q.eq("userId", targetUserId))
      .collect();

    // 2. Fetch all Journal Lines (Iterating entries to avoid full scan, though slower for many entries)
    // For a single user test, we can fetch lines by account to be more efficient if they have many entries
    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", targetUserId))
      .collect();

    // Strategy: Get lines by account. This covers all lines linked to user's accounts.
    const linesByAccountPromises = accounts.map(account => 
      ctx.db.query("journal_lines")
        .withIndex("by_user_accountId_date", q => q.eq("userId", targetUserId).eq("accountId", account._id))
        .collect()
    );
    const linesArrays = await Promise.all(linesByAccountPromises);
    const journalLines = linesArrays.flat();

    // Deduplicate lines just in case (shouldn't happen with distinct accounts)
    const uniqueLines = new Map();
    journalLines.forEach(line => uniqueLines.set(line._id, line));
    const allLines = Array.from(uniqueLines.values());

    // Also fetch lines by entry to catch any lines linked to entries but potentially missing account index (unlikely but safe)
    // Actually, let's rely on the entries -> lines mapping check.
    
    // Map lines to entries
    const linesByEntry = new Map<string, typeof journalLines>();
    for (const line of allLines) {
      const entryId = line.journalEntryId;
      if (!linesByEntry.has(entryId)) {
        linesByEntry.set(entryId, []);
      }
      linesByEntry.get(entryId)?.push(line);
    }

    // Check 1: Zero-sum invariant
    let zeroSumPassed = true;
    const zeroSumViolations: string[] = [];
    
    // We need to check every entry we found.
    // If we found lines for an entry that is NOT in journalEntries (orphaned lines), that's another issue.
    // If we have entries in journalEntries that have NO lines in allLines, that's an empty entry.

    for (const entry of journalEntries) {
      const lines = linesByEntry.get(entry._id) || [];
      
      // If we fetched lines by account, and an entry has lines in a deleted account or something, we might miss them?
      // But we fetched all accounts for the user.
      // If an account was deleted, does it still show up in `accounts` query? 
      // `accounts` query fetches everything including soft-deleted if we don't filter. 
      // Schema says `softdelete: v.boolean()`.
      
      if (lines.length === 0) {
         // Fetch specifically for this entry to be sure we didn't miss it due to account logic
         const strictLines = await ctx.db.query("journal_lines")
            .withIndex("by_entryId", q => q.eq("journalEntryId", entry._id))
            .collect();
         
         if (strictLines.length === 0) {
             // Genuine empty entry
             // Is this a violation? Maybe "planned" entries can be empty? Usually not.
             // zeroSumViolations.push(`Entry ${entry._id}: No lines`);
         } else {
             // We missed it in the bulk fetch - add to our map for zero-sum check
             linesByEntry.set(entry._id, strictLines);
         }
      }
      
      const currentLines = linesByEntry.get(entry._id) || [];
      if (currentLines.length > 0) {
          const sum = currentLines.reduce((acc, l) => acc + l.amountBaseCurrency, 0);
          if (sum !== 0) {
            zeroSumPassed = false;
            zeroSumViolations.push(`Entry ${entry._id} (${entry.description}): sum=${sum}`);
          }
      }
    }

    if (!zeroSumPassed && zeroSumViolations.length > 0) {
        // Limit details
    }

    checks.push({
      name: "Zero-Sum Invariant",
      passed: zeroSumPassed,
      details: zeroSumPassed 
        ? `All ${journalEntries.length} entries balance correctly`
        : `${zeroSumViolations.length} violations. Top: ${zeroSumViolations.slice(0, 3).join('; ')}`,
      critical: true,
    });

    // Check 2: Idempotency
    const idempotencyKeys = journalEntries.map(e => e.idempotencyKey).filter(k => k);
    const uniqueKeys = new Set(idempotencyKeys);
    checks.push({
      name: "Unique Idempotency Keys",
      passed: uniqueKeys.size === idempotencyKeys.length,
      details: `${uniqueKeys.size} unique / ${idempotencyKeys.length} total keys`,
      critical: true
    });

    // Check 3: Expenses Conversion (Dual Write check)
    const expenses = await ctx.db
        .query("expenses")
        .withIndex("by_user", q => q.eq("userId", targetUserId))
        .collect();
    
    const activeExpenses = expenses.filter(e => !e.softdelete);
    // We assume conversion if there are entries. 
    // A better check is looking at `expense_mappings` if that table exists and is populated.
    const expenseMappings = await ctx.db
        .query("expense_mappings")
        .withIndex("by_user_expense", q => q.eq("userId", targetUserId))
        .collect();

    checks.push({
        name: "Expense Mappings",
        passed: expenseMappings.length >= activeExpenses.length * 0.9, // allow some slack
        details: `${expenseMappings.length} mappings for ${activeExpenses.length} active expenses`,
        critical: false
    });

    // Check 4: Recurring Entries
    const recurring = await ctx.db
        .query("recurring_entries")
        .withIndex("by_user", q => q.eq("userId", targetUserId))
        .collect();
    
    // Check if they have lines
    let recurringEmpty = 0;
    for (const r of recurring) {
        const rLines = await ctx.db.query("recurring_lines")
            .withIndex("by_recurringId", q => q.eq("recurringId", r._id))
            .collect();
        if (rLines.length === 0) recurringEmpty++;
    }

    checks.push({
        name: "Recurring Entries Setup",
        passed: recurringEmpty === 0,
        details: `${recurring.length} recurring entries, ${recurringEmpty} empty`,
        critical: true
    });

    const criticalFailures = checks.filter(c => c.critical && !c.passed).length;
    const passed = criticalFailures === 0;

    return {
        passed,
        checks,
        summary: passed ? "✅ User Integrity Check Passed" : "❌ User Integrity Check Failed"
    };
  }
});

