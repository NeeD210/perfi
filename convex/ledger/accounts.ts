import { mutation, query, internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { AccountType, CreateAccountArgs, CreateCardAccountArgs, CreateDebtAccountArgs, AccountClosureCheck } from "./types";
import { accountTypeValidator } from "./validators";

// Create base account
export const createAccount = internalMutation({
  args: {
    userId: v.id("users"),
    accountType: accountTypeValidator,
    description: v.string(),
    parentAccountId: v.optional(v.id("accounts")),
    defaultCurrency: v.optional(v.string()),
  },
  returns: v.id("accounts"),
  handler: async (ctx, args): Promise<Id<"accounts">> => {
    const { userId, accountType, description, parentAccountId, defaultCurrency } = args;

    // Validate parent account exists and belongs to same user
    if (parentAccountId) {
      const parentAccount = await ctx.db.get(parentAccountId);
      if (!parentAccount || parentAccount.userId !== userId) {
        throw new Error("Parent account not found or does not belong to user");
      }

      // Note: Cycle detection not needed for account creation since new account has no children
    }

    // Create account
    const accountId = await ctx.db.insert("accounts", {
      userId,
      description,
      accountType,
      parentAccountId,
      defaultCurrency: defaultCurrency || "ARS",
      creationTime: Date.now(),
      softdelete: false,
    });

    return accountId;
  },
});

// Create specialized card account
export const createCardAccount = internalMutation({
  args: {
    userId: v.id("users"),
    description: v.string(),
    closingDay: v.number(), // 1-31
    dueDate: v.number(), // 1-31
    parentAccountId: v.id("accounts"), // settlement account
  },
  returns: v.id("accounts"),
  handler: async (ctx, args): Promise<Id<"accounts">> => {
    const { userId, description, closingDay, dueDate, parentAccountId } = args;

    // Validate days are in range
    if (closingDay < 1 || closingDay > 31 || dueDate < 1 || dueDate > 31) {
      throw new Error("Closing day and due date must be between 1 and 31");
    }

    // Create the account first
    const accountId = await ctx.runMutation(internal.ledger.accounts.createAccount, {
      userId,
      accountType: "liability",
      description,
      parentAccountId,
    });

    // Create card metadata
    await ctx.db.insert("cards", {
      accountId, // This is also the primary key
      userId,
      closingDay,
      dueDate,
      softdelete: false,
    });

    return accountId;
  },
});

// Create specialized debt account
export const createDebtAccount = internalMutation({
  args: {
    userId: v.id("users"),
    description: v.string(),
    interestRate: v.optional(v.number()),
    parentAccountId: v.id("accounts"), // payment source
  },
  returns: v.id("accounts"),
  handler: async (ctx, args): Promise<Id<"accounts">> => {
    const { userId, description, interestRate, parentAccountId } = args;

    // Create the account first
    const accountId = await ctx.runMutation(internal.ledger.accounts.createAccount, {
      userId,
      accountType: "liability",
      description,
      parentAccountId,
    });

    // Create debt metadata
    await ctx.db.insert("debts", {
      accountId, // This is also the primary key
      userId,
      interestRate,
      softdelete: false,
    });

    return accountId;
  },
});

// Update account
export const updateAccount = internalMutation({
  args: {
    accountId: v.id("accounts"),
    description: v.optional(v.string()),
    parentAccountId: v.optional(v.id("accounts")),
    defaultCurrency: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { accountId, description, parentAccountId, defaultCurrency } = args;

    // Get current account
    const account = await ctx.db.get(accountId);
    if (!account) {
      throw new Error("Account not found");
    }

    // Check for circular references if parent is changing
    if (parentAccountId && parentAccountId !== account.parentAccountId) {
      const parentAccount = await ctx.db.get(parentAccountId);
      if (!parentAccount || parentAccount.userId !== account.userId) {
        throw new Error("Parent account not found or does not belong to user");
      }

      const hasCycle = await ctx.runQuery(internal.ledger.accounts.detectCycle, {
        accountId,
        potentialParentId: parentAccountId,
      });
      if (hasCycle) {
        throw new Error("Circular reference detected in account hierarchy");
      }
    }

    // Update account
    await ctx.db.patch(accountId, {
      ...(description !== undefined && { description }),
      ...(parentAccountId !== undefined && { parentAccountId }),
      ...(defaultCurrency !== undefined && { defaultCurrency }),
    });

    return null;
  },
});

// Cycle detection algorithm
export const detectCycle = internalQuery({
  args: {
    accountId: v.id("accounts"),
    potentialParentId: v.id("accounts"),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const { accountId, potentialParentId } = args;

    const visited = new Set<Id<"accounts">>();
    let current: Id<"accounts"> | undefined = potentialParentId;

    while (current) {
      if (current === accountId) {
        return true; // Cycle detected
      }

      if (visited.has(current)) {
        break; // Prevent infinite loops in case of bad data
      }

      visited.add(current);

      const account = await ctx.db.get(current) as { parentAccountId?: Id<"accounts"> } | null;
      current = account?.parentAccountId;
    }

    return false;
  },
});

// Check if account can be closed
export const canCloseAccount = internalQuery({
  args: {
    accountId: v.id("accounts"),
  },
  returns: v.object({
    eligible: v.boolean(),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<AccountClosureCheck> => {
    const { accountId } = args;

    const account = await ctx.db.get(accountId);
    if (!account) {
      return { eligible: false, reason: "Account not found" };
    }

    // Check 1: Balance = 0 (sum all journal lines for this account)
    const lines = await ctx.db
      .query("journal_lines")
      .withIndex("by_accountId_date", (q) => q.eq("accountId", accountId))
      .collect();

    const balance = lines.reduce((sum, line) => {
      const amount = line.direction === "debit" ? line.amountBaseCurrency : -line.amountBaseCurrency;
      return sum + amount;
    }, 0);

    if (Math.abs(balance) > 0.01) { // Allow for tiny floating point errors
      return { eligible: false, reason: `Account has non-zero balance: ${balance}` };
    }

    // Check 2: No planned entries
    const plannedEntries = await ctx.db
      .query("journal_entries")
      .withIndex("by_user_status_date", (q) =>
        q.eq("userId", account.userId).eq("status", "planned")
      )
      .collect();

    // Check if any planned entries reference this account
    for (const entry of plannedEntries) {
      const entryLines = await ctx.db
        .query("journal_lines")
        .withIndex("by_entryId", (q) => q.eq("journalEntryId", entry._id))
        .collect();

      if (entryLines.some(line => line.accountId === accountId)) {
        return { eligible: false, reason: "Account has planned journal entries" };
      }
    }

    // Check 3: Not referenced as parent by active accounts
    const childAccounts = await ctx.db
      .query("accounts")
      .withIndex("by_parentAccountId", (q) => q.eq("parentAccountId", accountId))
      .filter((q) => q.eq(q.field("softdelete"), false))
      .collect();

    if (childAccounts.length > 0) {
      return { eligible: false, reason: "Account is referenced as parent by active accounts" };
    }

    return { eligible: true };
  },
});

// Soft delete account (close account)
export const softDeleteAccount = internalMutation({
  args: {
    accountId: v.id("accounts"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { accountId } = args;

    const checkResult = await ctx.runQuery(internal.ledger.accounts.canCloseAccount, { accountId });
    if (!checkResult.eligible) {
      throw new Error(checkResult.reason || "Account cannot be closed");
    }

    // Soft delete the account
    await ctx.db.patch(accountId, {
      softdelete: true,
      deletedAt: Date.now(),
    });

    // Also soft delete associated metadata if exists
    const card = await ctx.db
      .query("cards")
      .withIndex("by_accountId", (q) => q.eq("accountId", accountId))
      .first();

    if (card) {
      await ctx.db.patch(card._id, {
        softdelete: true,
        deletedAt: Date.now(),
      });
    }

    const debt = await ctx.db
      .query("debts")
      .withIndex("by_accountId", (q) => q.eq("accountId", accountId))
      .first();

    if (debt) {
      await ctx.db.patch(debt._id, {
        softdelete: true,
        deletedAt: Date.now(),
      });
    }

    return null;
  },
});

// Reopen account
export const reopenAccount = internalMutation({
  args: {
    accountId: v.id("accounts"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { accountId } = args;

    // Reopen the account
    await ctx.db.patch(accountId, {
      softdelete: false,
      deletedAt: undefined,
    });

    // Also reopen associated metadata if exists
    const card = await ctx.db
      .query("cards")
      .withIndex("by_accountId", (q) => q.eq("accountId", accountId))
      .first();

    if (card) {
      await ctx.db.patch(card._id, {
        softdelete: false,
        deletedAt: undefined,
      });
    }

    const debt = await ctx.db
      .query("debts")
      .withIndex("by_accountId", (q) => q.eq("accountId", accountId))
      .first();

    if (debt) {
      await ctx.db.patch(debt._id, {
        softdelete: false,
        deletedAt: undefined,
      });
    }

    return null;
  },
});

// Public queries for account management
export const getAccountHierarchy = query({
  args: {
    userId: v.id("users"),
    rootAccountId: v.optional(v.id("accounts")),
  },
  returns: v.array(v.object({
    id: v.id("accounts"),
    description: v.string(),
    accountType: v.string(),
    parentAccountId: v.optional(v.id("accounts")),
    level: v.number(),
    children: v.array(v.id("accounts")),
  })),
  handler: async (ctx, args) => {
    const { userId, rootAccountId } = args;

    // Get all user accounts
    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .filter((q) => q.eq(q.field("softdelete"), false))
      .collect();

    // Build hierarchy
    const accountMap = new Map(accounts.map(acc => [acc._id, acc]));
    const childrenMap = new Map<Id<"accounts">, Id<"accounts">[]>();

    // Group children
    accounts.forEach(account => {
      if (account.parentAccountId) {
        if (!childrenMap.has(account.parentAccountId)) {
          childrenMap.set(account.parentAccountId, []);
        }
        childrenMap.get(account.parentAccountId)!.push(account._id);
      }
    });

    // Calculate levels and build result
    const result: Array<{
      id: Id<"accounts">;
      description: string;
      accountType: string;
      parentAccountId?: Id<"accounts">;
      level: number;
      children: Id<"accounts">[];
    }> = [];

    const calculateLevel = (accountId: Id<"accounts">, level: number = 0): number => {
      const account = accountMap.get(accountId);
      if (!account) return level;

      if (account.parentAccountId) {
        return calculateLevel(account.parentAccountId, level + 1);
      }
      return level;
    };

    const rootAccounts = rootAccountId
      ? accounts.filter(acc => acc._id === rootAccountId)
      : accounts.filter(acc => !acc.parentAccountId);

    for (const account of rootAccounts) {
      result.push({
        id: account._id,
        description: account.description,
        accountType: account.accountType,
        parentAccountId: account.parentAccountId,
        level: calculateLevel(account._id),
        children: childrenMap.get(account._id) || [],
      });
    }

    return result;
  },
});
