import { Id } from "../_generated/dataModel";

// Enum types matching the schema validators
export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";
export type Direction = "debit" | "credit";
export type EntryStatus = "planned" | "posted" | "voided";
export type LinkType = "accrual" | "installment" | "settlement";
export type Frequency = "daily" | "weekly" | "monthly" | "quarterly" | "semestrally" | "yearly";
export type ScopeType = "singleAccount" | "multipleAccounts" | "accountType";
export type SourceType = "expense" | "income" | "transfer" | "installment" | "recurring" | "statement" | "other";

// Table document types
export interface Account {
  _id: Id<"accounts">;
  _creationTime: number;
  userId: Id<"users">;
  description: string;
  accountType: AccountType;
  parentAccountId?: Id<"accounts">;
  defaultCurrency?: string; // ISO 4217
  creationTime: number;
  softdelete: boolean;
  deletedAt?: number;
}

export interface JournalEntry {
  _id: Id<"journal_entries">;
  _creationTime: number;
  userId: Id<"users">;
  parentEntryId?: Id<"journal_entries">;
  date: number; // effective date (epoch ms)
  updateTime: number;
  softdelete: boolean;
  deletedAt?: number;
  description: string;
  status: EntryStatus;
  sourceType: SourceType;
  sourceId?: string;
  idempotencyKey?: string;
  linkType?: LinkType;
  installmentNumber?: number;
  totalInstallments?: number;
  createdBy: string;
  updatedBy?: string;
}

export interface JournalLine {
  _id: Id<"journal_lines">;
  _creationTime: number;
  journalEntryId: Id<"journal_entries">;
  userId: Id<"users">;
  accountId: Id<"accounts">;
  direction: Direction;
  currencyCode: string; // ISO 4217
  exchangeRateId?: Id<"exchange_rates">;
  exchangeRate?: number;
  amount: number; // signed integer in minor units
  amountBaseCurrency: number; // signed integer in base currency
  entryDate: number; // denormalized for indexing
  installmentNumber?: number;
  totalInstallments?: number;
}

export interface ExchangeRate {
  _id: Id<"exchange_rates">;
  _creationTime: number;
  pairCurrency: string; // "USD/ARS"
  rate: number; // scaled integer (base→quote)
  inverseRate?: number;
  date: number; // epoch ms (UTC day boundary)
  source: string; // provider ID
}

export interface Card {
  _id: Id<"cards">; // This will be the accountId
  _creationTime: number;
  accountId: Id<"accounts">; // PK & FK
  userId: Id<"users">;
  closingDay: number; // 1-31
  dueDate: number; // 1-31
  softdelete: boolean;
  deletedAt?: number;
}

export interface Debt {
  _id: Id<"debts">; // This will be the accountId
  _creationTime: number;
  accountId: Id<"accounts">; // PK & FK
  userId: Id<"users">;
  interestRate?: number; // advisory only
  softdelete: boolean;
  deletedAt?: number;
}

export interface Budget {
  _id: Id<"budgets">;
  _creationTime: number;
  userId: Id<"users">;
  accountId: Id<"accounts">;
  amount: number; // integer in base currency
  frequency: Frequency;
  nextDueDate: number;
  endDate?: number;
  creationTime: number;
  softdelete: boolean;
  deletedAt?: number;
  scopeType: ScopeType;
  scopeRefs?: Id<"accounts">[];
}

export interface BudgetLine {
  _id: Id<"budget_lines">;
  _creationTime: number;
  budgetId: Id<"budgets">;
  userId: Id<"users">;
  accountId: Id<"accounts">;
  amount: number;
  startDate: number;
  endDate: number;
  softdelete: boolean;
  deletedAt?: number;
}

export interface RecurringEntry {
  _id: Id<"recurring_entries">;
  _creationTime: number;
  userId: Id<"users">;
  description: string;
  frequency: Frequency;
  creationTime: number;
  endDate?: number;
  status: "active" | "paused";
  nextDueDate: number;
  softdelete: boolean;
  deletedAt?: number;
}

export interface RecurringLine {
  _id: Id<"recurring_lines">;
  _creationTime: number;
  recurringId: Id<"recurring_entries">;
  userId: Id<"users">;
  accountId: Id<"accounts">;
  direction: Direction;
  exchangeRateId?: Id<"exchange_rates">;
  amount: number;
  softdelete: boolean;
  deletedAt?: number;
}

// Utility types for FX operations
export interface FXConversionResult {
  converted: number;
  rateId: Id<"exchange_rates"> | null;
  rateUsed: number;
}

export interface EffectiveRateResult {
  rate: number;
  source: 'user' | 'official' | null;
}

export interface RateForDateResult {
  rate: number;
  id: Id<"exchange_rates">;
}

// Account creation types
export interface CreateAccountArgs {
  userId: Id<"users">;
  accountType: AccountType;
  description: string;
  parentAccountId?: Id<"accounts">;
  defaultCurrency?: string;
}

export interface CreateCardAccountArgs {
  userId: Id<"users">;
  description: string;
  closingDay: number; // 1-31
  dueDate: number; // 1-31
  parentAccountId: Id<"accounts">; // settlement account
}

export interface CreateDebtAccountArgs {
  userId: Id<"users">;
  description: string;
  interestRate?: number;
  parentAccountId: Id<"accounts">; // payment source
}

// Account closure types
export interface AccountClosureCheck {
  eligible: boolean;
  reason?: string;
}
