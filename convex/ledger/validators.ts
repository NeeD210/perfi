// Shared validators for the ledger system
import { v } from "convex/values";

// Account type enum
export const accountTypeValidator = v.union(
  v.literal("asset"),
  v.literal("liability"),
  v.literal("equity"),
  v.literal("income"),
  v.literal("expense")
);

// Direction enum
export const directionValidator = v.union(
  v.literal("debit"),
  v.literal("credit")
);

// Entry status enum
export const entryStatusValidator = v.union(
  v.literal("planned"),
  v.literal("posted"),
  v.literal("voided")
);

// Link type enum
export const linkTypeValidator = v.union(
  v.literal("accrual"),
  v.literal("installment"),
  v.literal("settlement")
);

// Frequency enum
export const frequencyValidator = v.union(
  v.literal("daily"),
  v.literal("weekly"),
  v.literal("monthly"),
  v.literal("quarterly"),
  v.literal("semestrally"),
  v.literal("yearly")
);

// Scope type enum
export const scopeTypeValidator = v.union(
  v.literal("singleAccount"),
  v.literal("multipleAccounts"),
  v.literal("accountType")
);

// Source type enum
export const sourceTypeValidator = v.union(
  v.literal("expense"),
  v.literal("income"),
  v.literal("transfer"),
  v.literal("installment"),
  v.literal("recurring"),
  v.literal("statement"),
  v.literal("other")
);

// Budget status enum
export const budgetStatusValidator = v.union(
  v.literal("under_budget"),
  v.literal("at_budget"),
  v.literal("over_budget")
);
