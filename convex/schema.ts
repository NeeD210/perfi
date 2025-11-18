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
} from "./ledger/validators";

export default defineSchema({
  // Existing tables
  users: defineTable({
    auth0Id: v.string(),
    email: v.string(),
    emailVerified: v.boolean(),
    isAnonymous: v.optional(v.boolean()),
    lastLoginAt: v.optional(v.number()),
    onboardingCompleted: v.optional(v.boolean()),
    softdelete: v.boolean(),
  }).index("by_auth0Id", ["auth0Id"]),

  categories: defineTable({
    name: v.string(),
    userId: v.id("users"),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    transactionType: v.optional(v.string()),
    softdelete: v.optional(v.boolean()),
  }).index("by_user", ["userId"])
    .index("by_user_softdelete", ["userId", "softdelete"]),

  paymentTypes: defineTable({
    name: v.string(),
    userId: v.id("users"),
    deletedAt: v.optional(v.number()),
    softdelete: v.boolean(),
    isCredit: v.optional(v.boolean()),
    closingDay: v.optional(v.number()),
    dueDay: v.optional(v.number()),
  }).index("by_user", ["userId"])
    .index("by_user_softdelete", ["userId", "softdelete"]),

  expenses: defineTable({
    amount: v.float64(),
    category: v.string(),
    categoryId: v.optional(v.id("categories")),
    cuotas: v.float64(),
    date: v.float64(),
    description: v.string(),
    paymentType: v.optional(v.string()),
    paymentTypeId: v.optional(v.id("paymentTypes")),
    transactionType: v.string(),
    userId: v.id("users"),
    deletedAt: v.optional(v.float64()),
    softdelete: v.optional(v.boolean()),
    verified: v.optional(v.boolean()),
    recurringTransactionId: v.optional(v.id("recurringTransactions")),
    nextDueDate: v.optional(v.float64()),
  }).index("by_user", ["userId"])
    .index("by_user_date", ["userId", "date"])
    .index("by_user_softdelete", ["userId", "softdelete"])
    .index("by_recurringTransactionId", ["recurringTransactionId"])
    .index("by_categoryId", ["categoryId"]),

  recurringTransactions: defineTable({
    userId: v.id("users"),
    description: v.string(),
    amount: v.float64(),
    categoryId: v.id("categories"),
    paymentTypeId: v.optional(v.id("paymentTypes")),
    transactionType: v.string(),
    frequency: v.string(),
    startDate: v.float64(),
    endDate: v.optional(v.float64()),
    lastProcessedDate: v.optional(v.float64()),
    nextDueDateCalculationDay: v.optional(v.float64()),
    nextDueDate: v.optional(v.float64()),
    isActive: v.boolean(),
    softdelete: v.optional(v.boolean()),
    cuotas: v.optional(v.float64()),
  })
  .index("by_user_isActive_startDate", ["userId", "isActive", "startDate"])
  .index("by_isActive_lastProcessedDate", ["isActive", "lastProcessedDate"])
  .index("by_isActive_nextDueDate", ["isActive", "nextDueDate"]) 
  .index("by_user_isActive_nextDueDate", ["userId", "isActive", "nextDueDate"]) 
  .index("by_user_softdelete", ["userId", "softdelete"])
  .index("by_user_isActive_softdelete", ["userId", "isActive", "softdelete"])
  .index("by_user_isActive_startDate_softdelete", ["userId", "isActive", "startDate", "softdelete"]),

  paymentSchedules: defineTable({
    userId: v.id("users"),
    expenseId: v.id("expenses"),
    paymentTypeId: v.id("paymentTypes"),
    amount: v.float64(),
    dueDate: v.float64(),
    installmentNumber: v.float64(),
    totalInstallments: v.float64(),
    softdelete: v.optional(v.boolean()),
  })
  .index("by_user_dueDate", ["userId", "dueDate"])
  .index("by_expenseId", ["expenseId"])
  .index("by_user_dueDate_softdelete", ["userId", "dueDate", "softdelete"])
  .index("by_user_softdelete_dueDate", ["userId", "softdelete", "dueDate"]),

  // Ledger schema for double-entry accounting

  accounts: defineTable({
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
    .index("by_user_type_active", ["userId", "accountType", "softdelete"])
    .index("by_parentAccountId", ["parentAccountId"]),

  journal_entries: defineTable({
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
    createdBy: v.id("users"),
    updatedBy: v.optional(v.id("users")),
  })
    .index("by_user_date", ["userId", "date"])
    .index("by_user_sourceType_date", ["userId", "sourceType", "date"])
    .index("by_user_status_date", ["userId", "status", "date"])
    .index("by_sourceType_sourceId", ["sourceType", "sourceId"])
    .index("by_idempotencyKey", ["idempotencyKey"]),

  journal_lines: defineTable({
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

  exchange_rates: defineTable({
    pairCurrency: v.string(), // "USD/ARS"
    rate: v.number(), // scaled integer (base→quote)
    inverseRate: v.optional(v.number()),
    date: v.number(), // epoch ms (UTC day boundary)
    source: v.string(), // provider ID
  })
    .index("by_pair_date_source", ["pairCurrency", "date", "source"])
    .index("by_pair_date", ["pairCurrency", "date"]) // For date-specific rate queries
    .index("by_source_date", ["source", "date"]), // For provider-specific queries

  cards: defineTable({
    accountId: v.id("accounts"), // PK & FK
    userId: v.id("users"),
    closingDay: v.number(), // 1-31
    dueDate: v.number(), // 1-31
    baseCurrency: v.optional(v.string()), // ISO 4217 currency code for statement calculations (optional for existing cards)
    createdAt: v.optional(v.number()), // epoch milliseconds (card creation date) (optional for existing cards)
    softdelete: v.boolean(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_accountId", ["accountId"])
    .index("by_user", ["userId"]) 
    .index("by_closingDay", ["closingDay"]),

  debts: defineTable({
    accountId: v.id("accounts"), // PK & FK
    userId: v.id("users"),
    interestRate: v.optional(v.number()), // advisory only
    softdelete: v.boolean(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_accountId", ["accountId"])
    .index("by_user", ["userId"]),

  budgets: defineTable({
    userId: v.id("users"),
    accountId: v.optional(v.id("accounts")), // Required only for singleAccount scope
    amount: v.number(), // integer in base currency
    frequency: frequencyValidator,
    nextDueDate: v.number(),
    endDate: v.optional(v.number()),
    creationTime: v.number(),
    softdelete: v.boolean(),
    deletedAt: v.optional(v.number()),
    scopeType: scopeTypeValidator,
    scopeRefs: v.optional(v.array(v.id("accounts"))), // Required for multipleAccounts scope
    scopeAccountType: v.optional(v.union(v.literal("expense"), v.literal("income"))), // Required for accountType scope
    description: v.optional(v.string()), // Optional budget description (max 500 chars)
  })
    .index("by_user", ["userId"])
    .index("by_accountId", ["accountId"])
    .index("by_user_active", ["userId", "softdelete", "creationTime"])
    .index("by_nextDueDate", ["nextDueDate"]),

  budget_lines: defineTable({
    budgetId: v.id("budgets"),
    periodStart: v.number(), // Epoch ms (inclusive) of period start
    periodEnd: v.number(), // Epoch ms (inclusive) of period end
    spentAmount: v.number(), // Amount spent/earned in period (minor units)
    remainingAmount: v.number(), // budgetAmount - spentAmount (can be negative)
    percentUsed: v.number(), // (spentAmount / budgetAmount) * 100, capped at 999
    budgetAmount: v.number(), // Budget amount at time of period end (snapshot for historical accuracy)
    status: v.union(
      v.literal("under_budget"),
      v.literal("at_budget"),
      v.literal("over_budget")
    ),
    createdAt: v.number(), // Epoch ms when this record was created (audit trail)
  })
    .index("by_budgetId_periodStart", ["budgetId", "periodStart"])
    .index("by_budgetId", ["budgetId"]),

  recurring_entries: defineTable({
    userId: v.id("users"),
    description: v.string(),
    frequency: frequencyValidator,
    creationTime: v.number(),
    // Anchor for monthly/semestral/yearly stepping to avoid drift
    anchorDay: v.optional(v.number()),
    endDate: v.optional(v.number()),
    status: v.union(v.literal("active"), v.literal("paused")),
    nextDueDate: v.number(),
    softdelete: v.boolean(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_status", ["userId", "status"]) 
    .index("by_user_status_nextDueDate", ["userId", "status", "nextDueDate"]),

  recurring_lines: defineTable({
    recurringId: v.id("recurring_entries"),
    userId: v.id("users"),
    accountId: v.id("accounts"),
    direction: directionValidator,
    // Line currency for amount minor units (temporarily optional for backfill)
    currencyCode: v.optional(v.string()),
    exchangeRateId: v.optional(v.id("exchange_rates")),
    amount: v.number(),
    softdelete: v.boolean(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_recurringId", ["recurringId"])
    .index("by_user", ["userId"]),

  // Migration progress tracking
  migration_progress: defineTable({
    userId: v.id("users"),
    migrationType: v.union(
      v.literal("account_seeding"),
      v.literal("transaction_backfill"),
      v.literal("installment_backfill")
    ),
    status: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("failed")
    ),
    lastProcessedId: v.optional(v.string()), // ID to resume from
    recordsProcessed: v.number(),
    totalRecords: v.number(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  })
    .index("by_user_type", ["userId", "migrationType"])
    .index("by_user_status", ["userId", "status"]),

  // Legacy data mappings for migrations
  payment_type_mappings: defineTable({
    userId: v.id("users"),
    paymentTypeId: v.id("paymentTypes"),
    accountId: v.id("accounts"),
    createdAt: v.number(),
  })
    .index("by_user_paymentType", ["userId", "paymentTypeId"])
    .index("by_account", ["accountId"]),

  category_mappings: defineTable({
    userId: v.id("users"),
    categoryId: v.id("categories"),
    accountId: v.id("accounts"),
    createdAt: v.number(),
  })
    .index("by_user_category", ["userId", "categoryId"])
    .index("by_account", ["accountId"]),

  expense_mappings: defineTable({
    userId: v.id("users"),
    expenseId: v.id("expenses"),
    journalEntryId: v.id("journal_entries"),
    createdAt: v.number(),
  })
    .index("by_user_expense", ["userId", "expenseId"])
    .index("by_journal_entry", ["journalEntryId"]),

  // Mapping from legacy recurringTransactions to ledger recurring_entries
  recurring_template_mappings: defineTable({
    userId: v.id("users"),
    legacyRecurringId: v.id("recurringTransactions"),
    recurringEntryId: v.id("recurring_entries"),
    createdAt: v.number(),
  })
    .index("by_user_legacyRecurring", ["userId", "legacyRecurringId"]) 
    .index("by_recurringEntryId", ["recurringEntryId"]),

  // Pre-aggregation system for performance optimization
  monthly_rollups: defineTable({
    userId: v.id("users"), // User partition for multi-tenancy
    accountId: v.id("accounts"), // Account reference
    month: v.number(), // Epoch ms of month start (1st day 00:00:00 UTC)
    totalDebits: v.number(), // Sum of debit lines in month (minor units)
    totalCredits: v.number(), // Sum of credit lines in month (minor units)
    netAmount: v.number(), // totalCredits - totalDebits (can be negative)
    transactionCount: v.number(), // Number of journal_lines in month
    lastUpdated: v.number(), // Epoch ms when rollup was last updated
    lastReconciled: v.number(), // Epoch ms when rollup was last reconciled
    createdAt: v.number(), // Epoch ms when rollup record was created
  })
    .index("by_user_month", ["userId", "month"]) // Home dashboard monthly summaries
    .index("by_account_month", ["accountId", "month"]) // Account-specific historical queries
    .index("by_user_account_month", ["userId", "accountId", "month"]) // Budget execution queries
    .index("by_month", ["month"]) // System-wide reconciliation jobs
    .index("by_last_reconciled", ["lastReconciled"]), // Find stale rollups for reconciliation

  // Card statements for automated billing
  card_statements: defineTable({
    accountId: v.id("accounts"), // FK to card liability account
    userId: v.id("users"), // FK to user who owns the card
    periodStart: v.number(), // epoch milliseconds (start of billing period)
    periodEnd: v.number(), // epoch milliseconds (end of billing period)
    closingDate: v.number(), // epoch milliseconds (statement closing date)
    dueDate: v.number(), // epoch milliseconds (payment due date)
    totalAmount: v.number(), // signed integer in minor units (statement total)
    currencyCode: v.string(), // ISO 4217 currency code (e.g., "ARS", "USD")
    exchangeRate: v.optional(v.number()), // Exchange rate used for conversion (user-modifiable)
    exchangeRateId: v.optional(v.id("exchange_rates")), // Reference to official rate
    status: v.union(
      v.literal("pending"), // calculated but not yet settled
      v.literal("posted"), // settlement entry created
      v.literal("paid") // payment received (future enhancement)
    ),
    settlementEntryId: v.optional(v.id("journal_entries")), // FK to settlement entry
    idempotencyKey: v.string(), // prevents duplicate statements
    createdAt: v.number(), // epoch milliseconds
    updatedAt: v.number(), // epoch milliseconds
  })
    .index("by_accountId_closingDate", ["accountId", "closingDate"])
    .index("by_user_status", ["userId", "status"])
    .index("by_dueDate_status", ["dueDate", "status"])
    .index("by_idempotencyKey", ["idempotencyKey"]),
});