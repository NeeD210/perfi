import { internalAction, internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

export const runCardStatementsTest = internalAction({
  args: {},
  returns: v.object({
    success: v.boolean(),
    logs: v.array(v.string()),
  }),
  handler: async (ctx) => {
    const logs: string[] = [];
    const log = (msg: string) => logs.push(`[${new Date().toISOString()}] ${msg}`);
    
    let setupData: any = null;

    try {
      log("Starting Card Statements Phase 5 Test");

      // 1. Setup Test Data
      setupData = await ctx.runMutation(internal.ledger.testCardStatements.setupTestData, {});
      log(`Setup complete. User: ${setupData.userId}, Card: ${setupData.cardAccountId}, Bank: ${setupData.bankAccountId}`);

      // 2. Calculate Statement
      // We use a closing date that covers the transactions we created
      const closingDate = setupData.closingDate;
      
      log(`Calculating statement for closing date: ${new Date(closingDate).toISOString()}`);
      
      const calcResult = await ctx.runMutation(internal.ledger.cardStatements.calculateStatement, {
        cardAccountId: setupData.cardAccountId,
        closingDate: closingDate,
      });
      
      log(`Statement calculated. ID: ${calcResult.statementId}, Total: ${calcResult.totalAmount}`);
      
      if (calcResult.totalAmount !== setupData.expectedTotal) {
        throw new Error(`Expected total ${setupData.expectedTotal}, got ${calcResult.totalAmount}`);
      }

      // 3. Verify Statement Pending
      const statement = await ctx.runQuery(internal.ledger.testCardStatements.getStatementStatus, {
        statementId: calcResult.statementId
      });
      
      if (statement.status !== "pending") {
        throw new Error(`Expected status 'pending', got '${statement.status}'`);
      }
      log("Statement status verified: pending");

      // 4. Post Settlement
      log("Posting settlement...");
      const settlementResult = await ctx.runMutation(internal.ledger.cardStatements.postSettlement, {
        statementId: calcResult.statementId
      });
      
      log(`Settlement posted. Entry ID: ${settlementResult.entryId}`);

      // 5. Verify Statement Posted
      const statementPosted = await ctx.runQuery(internal.ledger.testCardStatements.getStatementStatus, {
        statementId: calcResult.statementId
      });
      
      if (statementPosted.status !== "posted") {
        throw new Error(`Expected status 'posted', got '${statementPosted.status}'`);
      }
      if (statementPosted.settlementEntryId !== settlementResult.entryId) {
         throw new Error(`Settlement Entry ID mismatch`);
      }
      log("Statement status verified: posted");
      
      // 6. Verify Ledger Entries
      await ctx.runQuery(internal.ledger.testCardStatements.verifyLedgerEntries, {
         entryId: settlementResult.entryId,
         cardAccountId: setupData.cardAccountId,
         bankAccountId: setupData.bankAccountId,
         amount: calcResult.totalAmount
      });
      log("Ledger entries verified.");

      // 7. Cleanup
      await ctx.runMutation(internal.ledger.testCardStatements.cleanupTestData, {
        userId: setupData.userId
      });
      log("Cleanup complete.");

      return { success: true, logs };

    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      log(`ERROR: ${errorMsg}`);
      
      // Try to cleanup even on error if setup happened
      if (setupData) {
          try {
            await ctx.runMutation(internal.ledger.testCardStatements.cleanupTestData, {
                userId: setupData.userId
            });
            log("Cleanup complete (after error).");
          } catch (c) {
            log("Failed to cleanup after error.");
          }
      }
      
      return { success: false, logs };
    }
  }
});

// Helper mutations
export const setupTestData = internalMutation({
  args: {},
  returns: v.any(), 
  handler: async (ctx) => {
     // Create test user
     const userId = await ctx.db.insert("users", {
        auth0Id: "test_card_user_" + Date.now(),
        email: "test@example.com",
        emailVerified: true,
        softdelete: false
     });

     // Create bank account
     const bankAccountId = await ctx.db.insert("accounts", {
        userId,
        description: "Test Bank",
        accountType: "asset",
        creationTime: Date.now(),
        softdelete: false,
        defaultCurrency: "ARS"
     });

     // Create card account
     const cardAccountId = await ctx.db.insert("accounts", {
        userId,
        description: "Test Card",
        accountType: "liability",
        creationTime: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
        softdelete: false,
        defaultCurrency: "ARS",
        parentAccountId: bankAccountId
     });
     
     // Use start of today (UTC) as closing date
     const today = new Date();
     today.setUTCHours(0,0,0,0);
     const closingDate = today.getTime();
     const closingDay = today.getUTCDate();
     
     // Create card metadata
     await ctx.db.insert("cards", {
        accountId: cardAccountId,
        userId,
        closingDay: closingDay,
        dueDate: closingDay + 10, // 10 days later
        baseCurrency: "ARS",
        createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
        softdelete: false
     });

     // Create transactions (Expenses)
     const date1 = Date.now() - 5 * 24 * 60 * 60 * 1000;
     
     // Create Journal Entry 1
     const je1 = await ctx.db.insert("journal_entries", {
        userId,
        date: date1,
        updateTime: Date.now(),
        softdelete: false,
        description: "Test Expense 1",
        status: "posted",
        sourceType: "expense",
        createdBy: userId,
     });
     
     // Lines for JE1
     await ctx.db.insert("journal_lines", {
        journalEntryId: je1,
        userId,
        accountId: cardAccountId,
        direction: "credit",
        currencyCode: "ARS",
        amount: 1000,
        amountBaseCurrency: 1000,
        entryDate: date1
     });
     await ctx.db.insert("journal_lines", {
        journalEntryId: je1,
        userId,
        accountId: bankAccountId, // Using bank as expense account proxy
        direction: "debit",
        currencyCode: "ARS",
        amount: 1000,
        amountBaseCurrency: 1000,
        entryDate: date1
     });
     
     const date2 = Date.now() - 2 * 24 * 60 * 60 * 1000;
      // Create Journal Entry 2
     const je2 = await ctx.db.insert("journal_entries", {
        userId,
        date: date2,
        updateTime: Date.now(),
        softdelete: false,
        description: "Test Expense 2",
        status: "posted",
        sourceType: "expense",
        createdBy: userId,
     });
     
     await ctx.db.insert("journal_lines", {
        journalEntryId: je2,
        userId,
        accountId: cardAccountId,
        direction: "credit",
        currencyCode: "ARS",
        amount: 2000,
        amountBaseCurrency: 2000,
        entryDate: date2
     });
      await ctx.db.insert("journal_lines", {
        journalEntryId: je2,
        userId,
        accountId: bankAccountId, 
        direction: "debit",
        currencyCode: "ARS",
        amount: 2000,
        amountBaseCurrency: 2000,
        entryDate: date2
     });
     
     return {
        userId,
        cardAccountId,
        bankAccountId,
        closingDate,
        expectedTotal: 3000
     };
  }
});

export const getStatementStatus = internalQuery({
  args: { statementId: v.id("card_statements") },
  returns: v.object({ status: v.string(), settlementEntryId: v.optional(v.id("journal_entries")) }),
  handler: async (ctx, args) => {
    const stmt = await ctx.db.get(args.statementId);
    return { status: stmt!.status, settlementEntryId: stmt!.settlementEntryId };
  }
});

export const verifyLedgerEntries = internalQuery({
  args: { 
    entryId: v.id("journal_entries"),
    cardAccountId: v.id("accounts"),
    bankAccountId: v.id("accounts"),
    amount: v.number()
  },
  handler: async (ctx, args) => {
    const lines = await ctx.db.query("journal_lines").withIndex("by_entryId", q => q.eq("journalEntryId", args.entryId)).collect();
    
    if (lines.length !== 2) throw new Error("Expected 2 lines for settlement");
    
    const debitLine = lines.find(l => l.direction === "debit");
    const creditLine = lines.find(l => l.direction === "credit");
    
    if (!debitLine || !creditLine) throw new Error("Missing debit or credit line");
    
    if (debitLine.accountId !== args.cardAccountId) throw new Error(`Debit line should be to card account ${args.cardAccountId}, got ${debitLine.accountId}`);
    if (creditLine.accountId !== args.bankAccountId) throw new Error(`Credit line should be to bank account ${args.bankAccountId}, got ${creditLine.accountId}`);
    
    if (debitLine.amount !== args.amount) throw new Error(`Debit amount mismatch: expected ${args.amount}, got ${debitLine.amount}`);
    if (creditLine.amount !== args.amount) throw new Error(`Credit amount mismatch: expected ${args.amount}, got ${creditLine.amount}`);
    
    return true;
  }
});

export const cleanupTestData = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (user) await ctx.db.delete(args.userId);
    
    const accounts = await ctx.db.query("accounts").withIndex("by_user", q => q.eq("userId", args.userId)).collect();
    for (const a of accounts) await ctx.db.delete(a._id);
    
    const entries = await ctx.db.query("journal_entries").withIndex("by_user_date", q => q.eq("userId", args.userId)).collect();
    for (const e of entries) await ctx.db.delete(e._id);
    
    // For journal lines, we iterate entries but also try to find by user if index exists.
    const lines = await ctx.db.query("journal_lines").withIndex("by_user_accountId_date", q => q.eq("userId", args.userId)).collect();
    for (const l of lines) await ctx.db.delete(l._id);

    const cards = await ctx.db.query("cards").withIndex("by_user", q => q.eq("userId", args.userId)).collect();
    for (const c of cards) await ctx.db.delete(c._id);
    
    const stmts = await ctx.db.query("card_statements").withIndex("by_user_status", q => q.eq("userId", args.userId)).collect();
    for (const s of stmts) await ctx.db.delete(s._id);
  }
});

