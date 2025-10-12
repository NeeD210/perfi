import { mutation, query, internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { Account, Direction } from "./types";

// ============================================================================
// VALIDATORS
// ============================================================================

// Transfer input validator
const transferArgsValidator = v.object({
  sourceAccountId: v.id("accounts"),
  destinationAccountId: v.id("accounts"),
  amount: v.number(),
  description: v.optional(v.string()),
  exchangeRate: v.optional(v.number()),
  exchangeRateId: v.optional(v.id("exchange_rates")),
  date: v.optional(v.number()), // Transfer date, defaults to now
});

// Transfer entry output validator
const transferEntryValidator = v.object({
  id: v.id("journal_entries"),
  date: v.number(),
  description: v.string(),
  sourceAccount: v.object({
    id: v.id("accounts"),
    description: v.string(),
    currency: v.string(),
  }),
  destinationAccount: v.object({
    id: v.id("accounts"),
    description: v.string(),
    currency: v.string(),
  }),
  sourceAmount: v.number(),
  destinationAmount: v.number(),
  exchangeRate: v.optional(v.number()),
  status: v.union(v.literal("posted"), v.literal("voided")),
});

// ============================================================================
// INTERNAL VALIDATION UTILITIES
// ============================================================================

// Validate transfer accounts
export const validateTransferAccounts = internalQuery({
  args: {
    sourceAccountId: v.id("accounts"),
    destinationAccountId: v.id("accounts"),
    userId: v.id("users"),
  },
  returns: v.object({
    sourceAccount: v.object({
      _id: v.id("accounts"),
      userId: v.id("users"),
      description: v.string(),
      accountType: v.string(),
      defaultCurrency: v.optional(v.string()),
      softdelete: v.boolean(),
    }),
    destinationAccount: v.object({
      _id: v.id("accounts"),
      userId: v.id("users"),
      description: v.string(),
      accountType: v.string(),
      defaultCurrency: v.optional(v.string()),
      softdelete: v.boolean(),
    }),
  }),
  handler: async (ctx, args) => {
    const { sourceAccountId, destinationAccountId, userId } = args;

    // Validate accounts are different
    if (sourceAccountId === destinationAccountId) {
      throw new ConvexError({
        code: "INVALID_ACCOUNTS",
        message: "Source and destination accounts must be different",
      });
    }

    // Retrieve source account
    const sourceAccount = await ctx.db.get(sourceAccountId);
    if (!sourceAccount) {
      throw new ConvexError({
        code: "INVALID_ACCOUNTS",
        message: "Source account not found",
      });
    }

    // Retrieve destination account
    const destinationAccount = await ctx.db.get(destinationAccountId);
    if (!destinationAccount) {
      throw new ConvexError({
        code: "INVALID_ACCOUNTS",
        message: "Destination account not found",
      });
    }

    // Validate both accounts belong to the user
    if (sourceAccount.userId !== userId) {
      throw new ConvexError({
        code: "INVALID_ACCOUNTS",
        message: "Source account does not belong to user",
      });
    }

    if (destinationAccount.userId !== userId) {
      throw new ConvexError({
        code: "INVALID_ACCOUNTS",
        message: "Destination account does not belong to user",
      });
    }

    // Validate both accounts are active
    if (sourceAccount.softdelete) {
      throw new ConvexError({
        code: "INVALID_ACCOUNTS",
        message: "Source account is inactive",
      });
    }

    if (destinationAccount.softdelete) {
      throw new ConvexError({
        code: "INVALID_ACCOUNTS",
        message: "Destination account is inactive",
      });
    }

    return {
      sourceAccount: {
        _id: sourceAccount._id,
        userId: sourceAccount.userId,
        description: sourceAccount.description,
        accountType: sourceAccount.accountType,
        defaultCurrency: sourceAccount.defaultCurrency,
        softdelete: sourceAccount.softdelete,
      },
      destinationAccount: {
        _id: destinationAccount._id,
        userId: destinationAccount.userId,
        description: destinationAccount.description,
        accountType: destinationAccount.accountType,
        defaultCurrency: destinationAccount.defaultCurrency,
        softdelete: destinationAccount.softdelete,
      },
    };
  },
});

// Validate transfer amount
export const validateTransferAmount = internalQuery({
  args: {
    amount: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { amount } = args;

    if (amount <= 0) {
      throw new ConvexError({
        code: "INVALID_AMOUNT",
        message: "Amount must be positive",
      });
    }

    if (!Number.isInteger(amount)) {
      throw new ConvexError({
        code: "INVALID_AMOUNT",
        message: "Amount must be an integer (in minor units)",
      });
    }

    return null;
  },
});

// Validate exchange rate
export const validateExchangeRate = internalQuery({
  args: {
    sourceCurrency: v.string(),
    destinationCurrency: v.string(),
    exchangeRate: v.optional(v.number()),
    exchangeRateId: v.optional(v.id("exchange_rates")),
  },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    const { sourceCurrency, destinationCurrency, exchangeRate, exchangeRateId } = args;

    // Same currency, no conversion needed
    if (sourceCurrency === destinationCurrency) {
      return 1.0;
    }

    // Cross-currency: need exchange rate
    if (!exchangeRate && !exchangeRateId) {
      throw new ConvexError({
        code: "MISSING_EXCHANGE_RATE",
        message: "Exchange rate required for cross-currency transfers",
      });
    }

    // If user provided rate, validate and use it
    if (exchangeRate !== undefined) {
      if (exchangeRate <= 0) {
        throw new ConvexError({
          code: "INVALID_EXCHANGE_RATE",
          message: "Exchange rate must be positive",
        });
      }
      return exchangeRate;
    }

    // If only exchangeRateId provided, retrieve the rate
    if (exchangeRateId) {
      const rateDoc = await ctx.db.get(exchangeRateId);
      if (!rateDoc) {
        throw new ConvexError({
          code: "INVALID_EXCHANGE_RATE",
          message: "Exchange rate not found",
        });
      }
      return rateDoc.rate;
    }

    // Should not reach here due to validation above
    throw new ConvexError({
      code: "MISSING_EXCHANGE_RATE",
      message: "Exchange rate required for cross-currency transfers",
    });
  },
});

// Calculate destination amount with rounding
export const calculateDestinationAmount = internalQuery({
  args: {
    sourceAmount: v.number(),
    exchangeRate: v.number(),
    sourceCurrency: v.string(),
    destinationCurrency: v.string(),
  },
  returns: v.object({
    destinationAmount: v.number(),
    residual: v.number(),
  }),
  handler: async (ctx, args): Promise<{ destinationAmount: number; residual: number }> => {
    const { sourceAmount, exchangeRate, sourceCurrency, destinationCurrency } = args;

    // Same currency, no conversion needed
    if (sourceCurrency === destinationCurrency) {
      return {
        destinationAmount: sourceAmount,
        residual: 0,
      };
    }

    // Apply exchange rate
    const rawAmount = sourceAmount * exchangeRate;

    // Round half away from zero to integer (minor units)
    const roundedAmount = rawAmount >= 0 ? Math.round(rawAmount) : -Math.round(-rawAmount);

    // Calculate residual for rounding adjustment
    const residual = rawAmount - roundedAmount;

    return {
      destinationAmount: roundedAmount,
      residual,
    };
  },
});

// ============================================================================
// MAIN TRANSFER MUTATION
// ============================================================================

export const addTransfer = mutation({
  args: transferArgsValidator,
  returns: v.union(
    v.object({ status: v.literal("success"), journalEntryId: v.id("journal_entries") }),
    v.object({ status: v.literal("error"), error: v.string() })
  ),
  handler: async (ctx, args): Promise<
    | { status: "success"; journalEntryId: Id<"journal_entries"> }
    | { status: "error"; error: string }
  > => {
    const {
      sourceAccountId,
      destinationAccountId,
      amount,
      description,
      exchangeRate: userExchangeRate,
      exchangeRateId,
      date,
    } = args;

    try {
      // Get authenticated user
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new ConvexError({
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        });
      }

      const user = await ctx.db
        .query("users")
        .withIndex("by_auth0Id", (q) => q.eq("auth0Id", identity.subject))
        .first();

      if (!user) {
        throw new ConvexError({
          code: "UNAUTHORIZED",
          message: "User not found",
        });
      }

      // Validate amount
      await ctx.runQuery(internal.ledger.transfers.validateTransferAmount, { amount });

      // Validate description length (optional, <= 500)
      if (description && description.length > 500) {
        throw new ConvexError({
          code: "INVALID_INPUT",
          message: "Description must be 500 characters or less",
        });
      }

      // Validate and retrieve accounts
      const accountsValidation: {
        sourceAccount: {
          _id: Id<"accounts">;
          userId: Id<"users">;
          description: string;
          accountType: string;
          defaultCurrency?: string;
          softdelete: boolean;
        };
        destinationAccount: {
          _id: Id<"accounts">;
          userId: Id<"users">;
          description: string;
          accountType: string;
          defaultCurrency?: string;
          softdelete: boolean;
        };
      } = await ctx.runQuery(
        internal.ledger.transfers.validateTransferAccounts,
        {
          sourceAccountId,
          destinationAccountId,
          userId: user._id,
        }
      );
      const { sourceAccount, destinationAccount } = accountsValidation;

      // Get currencies (default to ARS if not specified)
      const sourceCurrency = sourceAccount.defaultCurrency || "ARS";
      const destinationCurrency = destinationAccount.defaultCurrency || "ARS";

      // Validate and get effective exchange rate
      const effectiveRate: number = await ctx.runQuery(
        internal.ledger.transfers.validateExchangeRate,
        {
          sourceCurrency,
          destinationCurrency,
          exchangeRate: userExchangeRate,
          exchangeRateId,
        }
      );

      // Calculate destination amount
      const { destinationAmount, residual } = await ctx.runQuery(
        internal.ledger.transfers.calculateDestinationAmount,
        {
          sourceAmount: amount,
          exchangeRate: effectiveRate,
          sourceCurrency,
          destinationCurrency,
        }
      );

      // Determine effective date
      const effectiveDate = date || Date.now();

      // Create journal entry
      const journalEntryId: Id<"journal_entries"> = await ctx.db.insert("journal_entries", {
        userId: user._id,
        date: effectiveDate,
        updateTime: Date.now(),
        softdelete: false,
        description: description || `Transfer from ${sourceAccount.description} to ${destinationAccount.description}`,
        status: "posted" as const,
        sourceType: "transfer" as const,
        createdBy: user._id,
      });

      // Credit source account (reduces asset balance - money leaving)
      await ctx.db.insert("journal_lines", {
        journalEntryId,
        userId: user._id,
        accountId: sourceAccountId,
        direction: "credit" as Direction, // Credit reduces asset or increases liability
        currencyCode: sourceCurrency,
        exchangeRateId: exchangeRateId,
        exchangeRate: effectiveRate !== 1.0 ? effectiveRate : undefined,
        amount,
        amountBaseCurrency: amount, // In source currency
        entryDate: effectiveDate,
      });

      // Debit destination account (increases asset balance - money arriving)
      await ctx.db.insert("journal_lines", {
        journalEntryId,
        userId: user._id,
        accountId: destinationAccountId,
        direction: "debit" as Direction, // Debit increases asset or reduces liability
        currencyCode: destinationCurrency,
        exchangeRateId: exchangeRateId,
        exchangeRate: effectiveRate !== 1.0 ? effectiveRate : undefined,
        amount: destinationAmount,
        amountBaseCurrency: destinationAmount, // In destination currency
        entryDate: effectiveDate,
      });

      // Handle residual if non-zero (>= 1 minor unit in either direction)
      if (Math.abs(residual) >= 1) {
        // Create balancing line for FX rounding
        await ctx.runMutation(internal.ledger.fx.createBalancingLine, {
          userId: user._id,
          residual: Math.round(residual),
          entryId: journalEntryId,
        });
      }

      // Validate zero-sum: debits equal credits in base currency
      const lines = await ctx.db
        .query("journal_lines")
        .withIndex("by_entryId", (q) => q.eq("journalEntryId", journalEntryId))
        .collect();

      const total = lines.reduce((sum, line) => {
        const signed = line.direction === "debit" ? line.amountBaseCurrency : -line.amountBaseCurrency;
        return sum + signed;
      }, 0);

      if (total !== 0) {
        // Rollback: delete created lines and entry
        for (const line of lines) {
          await ctx.db.delete(line._id);
        }
        await ctx.db.delete(journalEntryId);
        throw new ConvexError({
          code: "ZERO_SUM_VIOLATION",
          message: `Journal entry does not balance (sum=${total})`,
        });
      }

      // Update rollups (best-effort, failures don't block transaction)
      try {
        await ctx.runMutation(internal.ledger.rollups.updateRollupsOnTransaction, {
          journalEntryId,
          updateType: "create",
        });
      } catch (rollupError) {
        console.error(`[Rollup Update] Failed to update rollups for transfer ${journalEntryId}: ${rollupError}`);
        // Don't throw - rollup updates are best-effort
      }

      return { status: "success" as const, journalEntryId };
    } catch (error: any) {
      return { status: "error" as const, error: error.message || "Unknown error occurred" };
    }
  },
});

// ============================================================================
// TRANSFER QUERIES
// ============================================================================

// List transfers for a user with optional filters
export const listTransfers = query({
  args: {
    accountId: v.optional(v.id("accounts")),
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
    amountMin: v.optional(v.number()),
    amountMax: v.optional(v.number()),
  },
  returns: v.array(transferEntryValidator),
  handler: async (ctx, args) => {
    const { accountId, dateFrom, dateTo, amountMin, amountMax } = args;

    // Get authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_auth0Id", (q) => q.eq("auth0Id", identity.subject))
      .first();

    if (!user) {
      return [];
    }

    // Query journal entries using composite index for transfers
    const indexedQuery = ctx.db
      .query("journal_entries")
      .withIndex("by_user_sourceType_date", (q) => q.eq("userId", user._id).eq("sourceType", "transfer"));

    const allEntries = (await indexedQuery
      .filter((q) => q.eq(q.field("softdelete"), false))
      .order("desc")
      .collect()).filter((entry) => {
        if (dateFrom !== undefined && entry.date < dateFrom) return false;
        if (dateTo !== undefined && entry.date > dateTo) return false;
        return true;
      });

    // Process each entry to build transfer details
    const transfers: Array<{
      id: Id<"journal_entries">;
      date: number;
      description: string;
      sourceAccount: { id: Id<"accounts">; description: string; currency: string };
      destinationAccount: { id: Id<"accounts">; description: string; currency: string };
      sourceAmount: number;
      destinationAmount: number;
      exchangeRate?: number;
      status: "posted" | "voided";
    }> = [];

    for (const entry of allEntries) {
      // Get journal lines for this entry
      const lines = await ctx.db
        .query("journal_lines")
        .withIndex("by_entryId", (q) => q.eq("journalEntryId", entry._id))
        .collect();

      // Transfers should have exactly 2 or 3 lines (2 accounts + optional FX rounding)
      if (lines.length < 2) continue;

      // Identify source (credit) and destination (debit) lines
      const creditLine = lines.find((line) => line.direction === "credit");
      const debitLine = lines.find((line) => line.direction === "debit");

      if (!creditLine || !debitLine) continue;

      // Apply account filter if provided
      if (accountId && creditLine.accountId !== accountId && debitLine.accountId !== accountId) {
        continue;
      }

      // Apply amount filters if provided
      if (amountMin !== undefined && creditLine.amount < amountMin) continue;
      if (amountMax !== undefined && creditLine.amount > amountMax) continue;

      // Get account details
      const sourceAccount = await ctx.db.get(creditLine.accountId);
      const destinationAccount = await ctx.db.get(debitLine.accountId);

      if (!sourceAccount || !destinationAccount) continue;

      transfers.push({
        id: entry._id,
        date: entry.date,
        description: entry.description,
        sourceAccount: {
          id: sourceAccount._id,
          description: sourceAccount.description,
          currency: creditLine.currencyCode,
        },
        destinationAccount: {
          id: destinationAccount._id,
          description: destinationAccount.description,
          currency: debitLine.currencyCode,
        },
        sourceAmount: creditLine.amount,
        destinationAmount: debitLine.amount,
        exchangeRate: creditLine.exchangeRate || debitLine.exchangeRate,
        status: entry.status as "posted" | "voided",
      });
    }

    return transfers;
  },
});

// Get detailed information about a specific transfer
export const getTransferDetails = query({
  args: {
    journalEntryId: v.id("journal_entries"),
  },
  returns: v.union(transferEntryValidator, v.null()),
  handler: async (ctx, args): Promise<{
    id: Id<"journal_entries">;
    date: number;
    description: string;
    sourceAccount: { id: Id<"accounts">; description: string; currency: string };
    destinationAccount: { id: Id<"accounts">; description: string; currency: string };
    sourceAmount: number;
    destinationAmount: number;
    exchangeRate?: number;
    status: "posted" | "voided";
  } | null> => {
    const { journalEntryId } = args;

    // Get authenticated user
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_auth0Id", (q) => q.eq("auth0Id", identity.subject))
      .first();

    if (!user) {
      return null;
    }

    // Get journal entry
    const entry = await ctx.db.get(journalEntryId);
    if (!entry || entry.userId !== user._id || entry.sourceType !== "transfer") {
      return null;
    }

    // Get journal lines
    const lines = await ctx.db
      .query("journal_lines")
      .withIndex("by_entryId", (q) => q.eq("journalEntryId", entry._id))
      .collect();

    if (lines.length < 2) return null;

    // Identify source (credit) and destination (debit) lines
    const creditLine = lines.find((line) => line.direction === "credit");
    const debitLine = lines.find((line) => line.direction === "debit");

    if (!creditLine || !debitLine) return null;

    // Get account details
    const sourceAccount = await ctx.db.get(creditLine.accountId);
    const destinationAccount = await ctx.db.get(debitLine.accountId);

    if (!sourceAccount || !destinationAccount) return null;

    return {
      id: entry._id,
      date: entry.date,
      description: entry.description,
      sourceAccount: {
        id: sourceAccount._id,
        description: sourceAccount.description,
        currency: creditLine.currencyCode,
      },
      destinationAccount: {
        id: destinationAccount._id,
        description: destinationAccount.description,
        currency: debitLine.currencyCode,
      },
      sourceAmount: creditLine.amount,
      destinationAmount: debitLine.amount,
      exchangeRate: creditLine.exchangeRate || debitLine.exchangeRate,
      status: entry.status as "posted" | "voided",
    };
  },
});

// ============================================================================
// TRANSFER UPDATE AND DELETE
// ============================================================================

// Update transfer (description only, amounts cannot be changed)
export const updateTransfer = mutation({
  args: {
    journalEntryId: v.id("journal_entries"),
    description: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const { journalEntryId, description } = args;

    try {
      // Get authenticated user
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new ConvexError({
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        });
      }

      const user = await ctx.db
        .query("users")
        .withIndex("by_auth0Id", (q) => q.eq("auth0Id", identity.subject))
        .first();

      if (!user) {
        throw new ConvexError({
          code: "UNAUTHORIZED",
          message: "User not found",
        });
      }

      // Get journal entry
      const entry = await ctx.db.get(journalEntryId);
      if (!entry || entry.userId !== user._id || entry.sourceType !== "transfer") {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Transfer not found",
        });
      }

      // Validate description length
      if (description.length > 500) {
        throw new ConvexError({
          code: "INVALID_INPUT",
          message: "Description must be 500 characters or less",
        });
      }

      // Update entry
      await ctx.db.patch(journalEntryId, {
        description,
        updateTime: Date.now(),
        updatedBy: user._id,
      });

      // Update rollups (best-effort, failures don't block transaction)
      try {
        await ctx.runMutation(internal.ledger.rollups.updateRollupsOnTransaction, {
          journalEntryId,
          updateType: "update",
        });
      } catch (rollupError) {
        console.error(`[Rollup Update] Failed to update rollups for transfer update ${journalEntryId}: ${rollupError}`);
        // Don't throw - rollup updates are best-effort
      }

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Unknown error occurred",
      };
    }
  },
});

// Soft delete transfer
export const deleteTransfer = mutation({
  args: {
    journalEntryId: v.id("journal_entries"),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const { journalEntryId } = args;

    try {
      // Get authenticated user
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new ConvexError({
          code: "UNAUTHORIZED",
          message: "User not authenticated",
        });
      }

      const user = await ctx.db
        .query("users")
        .withIndex("by_auth0Id", (q) => q.eq("auth0Id", identity.subject))
        .first();

      if (!user) {
        throw new ConvexError({
          code: "UNAUTHORIZED",
          message: "User not found",
        });
      }

      // Get journal entry
      const entry = await ctx.db.get(journalEntryId);
      if (!entry || entry.userId !== user._id || entry.sourceType !== "transfer") {
        throw new ConvexError({
          code: "NOT_FOUND",
          message: "Transfer not found",
        });
      }

      // Soft delete entry
      await ctx.db.patch(journalEntryId, {
        softdelete: true,
        deletedAt: Date.now(),
        updateTime: Date.now(),
        updatedBy: user._id,
      });

      // Update rollups (best-effort, failures don't block transaction)
      try {
        await ctx.runMutation(internal.ledger.rollups.updateRollupsOnTransaction, {
          journalEntryId,
          updateType: "delete",
        });
      } catch (rollupError) {
        console.error(`[Rollup Update] Failed to update rollups for transfer delete ${journalEntryId}: ${rollupError}`);
        // Don't throw - rollup updates are best-effort
      }

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Unknown error occurred",
      };
    }
  },
});

