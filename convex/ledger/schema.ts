import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  accountTypeValidator,
  directionValidator,
  entryStatusValidator,
  linkTypeValidator,
  frequencyValidator,
  scopeTypeValidator,
  sourceTypeValidator,
} from "./validators";

export const ledgerSchema = {
  // Chart of accounts
  accounts: defineTable({
    id: v.id("accounts"),
    userId: v.id("users"),
    description: v.string(),
    accountType: accountTypeValidator,
    parentAccountId: v.optional(v.id("accounts")),
    defaultCurrency: v.optional(v.string()), // ISO 4217, defaults to "ARS"
    creationTime: v.number(),
    softdelete: v.boolean(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_type", ["userId", "accountType"])
    .index("by_parentAccountId", ["parentAccountId"]),

  // Transaction headers
  journal_entries: defineTable({
    id: v.id("journal_entries"),
    userId: v.id("users"),
    parentEntryId: v.optional(v.id("journal_entries")),
    date: v.number(), // effective date (epoch ms)
    updateTime: v.number(),
    softdelete: v.boolean(),
    deletedAt: v.optional(v.number()),
    description: v.string(),
    status: entryStatusValidator,
    sourceType: sourceTypeValidator,
    sourceId: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    linkType: v.optional(linkTypeValidator),
    installmentNumber: v.optional(v.number()),
    totalInstallments: v.optional(v.number()),
    createdBy: v.string(),
    updatedBy: v.optional(v.string()),
  })
    .index("by_user_date", ["userId", "date"])
    .index("by_user_status_date", ["userId", "status", "date"])
    .index("by_sourceType_sourceId", ["sourceType", "sourceId"]),

  // Debit/credit lines
  journal_lines: defineTable({
    id: v.id("journal_lines"),
    journalEntryId: v.id("journal_entries"),
    userId: v.id("users"),
    accountId: v.id("accounts"),
    direction: directionValidator,
    currencyCode: v.string(), // ISO 4217
    exchangeRateId: v.optional(v.id("exchange_rates")), // Official market rate reference
    exchangeRate: v.optional(v.number()), // Actual rate user received (takes precedence)
    amount: v.number(), // signed integer in minor units
    amountBaseCurrency: v.number(), // signed integer in base currency
    entryDate: v.number(), // denormalized for indexing
    installmentNumber: v.optional(v.number()),
    totalInstallments: v.optional(v.number()),
  })
    .index("by_entryId", ["journalEntryId"])
    .index("by_accountId_date", ["accountId", "entryDate"])
    .index("by_user_accountId_date", ["userId", "accountId", "entryDate"]),

  // FX rates
  exchange_rates: defineTable({
    id: v.id("exchange_rates"),
    pairCurrency: v.string(), // "USD/ARS"
    rate: v.number(), // scaled integer (base→quote)
    inverseRate: v.optional(v.number()),
    date: v.number(), // epoch ms (UTC day boundary)
    source: v.string(), // provider ID
  })
    .index("by_pair_date_source", ["pairCurrency", "date", "source"]),

  // Credit card metadata
  cards: defineTable({
    accountId: v.id("accounts"), // PK & FK
    userId: v.id("users"),
    closingDay: v.number(), // 1-31
    dueDate: v.number(), // 1-31
    softdelete: v.boolean(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_accountId", ["accountId"])
    .index("by_user", ["userId"]),

  // Debt metadata
  debts: defineTable({
    accountId: v.id("accounts"), // PK & FK
    userId: v.id("users"),
    interestRate: v.optional(v.number()), // advisory only
    softdelete: v.boolean(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_accountId", ["accountId"])
    .index("by_user", ["userId"]),

  // Budget definitions
  budgets: defineTable({
    id: v.id("budgets"),
    userId: v.id("users"),
    accountId: v.id("accounts"),
    amount: v.number(), // integer in base currency
    frequency: frequencyValidator,
    nextDueDate: v.number(),
    endDate: v.optional(v.number()),
    creationTime: v.number(),
    softdelete: v.boolean(),
    deletedAt: v.optional(v.number()),
    scopeType: scopeTypeValidator,
    scopeRefs: v.optional(v.array(v.id("accounts"))),
  })
    .index("by_user", ["userId"])
    .index("by_accountId", ["accountId"]),

  // Budget history
  budget_lines: defineTable({
    id: v.id("budget_lines"),
    budgetId: v.id("budgets"),
    userId: v.id("users"),
    accountId: v.id("accounts"),
    amount: v.number(),
    startDate: v.number(),
    endDate: v.number(),
    softdelete: v.boolean(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_budgetId", ["budgetId"])
    .index("by_user", ["userId"]),

  // Recurring definitions
  recurring_entries: defineTable({
    id: v.id("recurring_entries"),
    userId: v.id("users"),
    description: v.string(),
    frequency: frequencyValidator,
    creationTime: v.number(),
    endDate: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("paused")),
    nextDueDate: v.number(),
    softdelete: v.boolean(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"]),

  // Recurring line items
  recurring_lines: defineTable({
    id: v.id("recurring_lines"),
    recurringId: v.id("recurring_entries"),
    userId: v.id("users"),
    accountId: v.id("accounts"),
    direction: directionValidator,
    exchangeRateId: v.optional(v.id("exchange_rates")),
    amount: v.number(),
    softdelete: v.boolean(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_recurringId", ["recurringId"])
    .index("by_user", ["userId"]),
};
