/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as diagnostics from "../diagnostics.js";
import type * as env from "../env.js";
import type * as expenses from "../expenses.js";
import type * as http from "../http.js";
import type * as internal_expenses from "../internal/expenses.js";
import type * as internal_index from "../internal/index.js";
import type * as internal_recurring from "../internal/recurring.js";
import type * as internal_ from "../internal.js";
import type * as ledger_accounts from "../ledger/accounts.js";
import type * as ledger_budgetExecution from "../ledger/budgetExecution.js";
import type * as ledger_budgetHistory from "../ledger/budgetHistory.js";
import type * as ledger_budgetLines from "../ledger/budgetLines.js";
import type * as ledger_budgetUtils from "../ledger/budgetUtils.js";
import type * as ledger_budgets from "../ledger/budgets.js";
import type * as ledger_cardStatements from "../ledger/cardStatements.js";
import type * as ledger_dualWriteConfig from "../ledger/dualWriteConfig.js";
import type * as ledger_dualWriteUtils from "../ledger/dualWriteUtils.js";
import type * as ledger_errorTracking from "../ledger/errorTracking.js";
import type * as ledger_exchangeRateProviders from "../ledger/exchangeRateProviders.js";
import type * as ledger_exchangeRates from "../ledger/exchangeRates.js";
import type * as ledger_fetchHistoricalRates from "../ledger/fetchHistoricalRates.js";
import type * as ledger_fetchLiveRates from "../ledger/fetchLiveRates.js";
import type * as ledger_fx from "../ledger/fx.js";
import type * as ledger_index from "../ledger/index.js";
import type * as ledger_monthlySummary from "../ledger/monthlySummary.js";
import type * as ledger_rateMonitoring from "../ledger/rateMonitoring.js";
import type * as ledger_rateValidation from "../ledger/rateValidation.js";
import type * as ledger_rollups from "../ledger/rollups.js";
import type * as ledger_testApiProviders from "../ledger/testApiProviders.js";
import type * as ledger_transfers from "../ledger/transfers.js";
import type * as ledger_types from "../ledger/types.js";
import type * as ledger_validators from "../ledger/validators.js";
import type * as lib_scheduling from "../lib/scheduling.js";
import type * as migrations_accountSeeding from "../migrations/accountSeeding.js";
import type * as migrations_backfillIsCredit from "../migrations/backfillIsCredit.js";
import type * as migrations_backfillPaymentTypeMappings from "../migrations/backfillPaymentTypeMappings.js";
import type * as migrations_bulkPhase2Migration from "../migrations/bulkPhase2Migration.js";
import type * as migrations_category from "../migrations/category.js";
import type * as migrations_expenseCategory from "../migrations/expenseCategory.js";
import type * as migrations_fixCardFields from "../migrations/fixCardFields.js";
import type * as migrations_index from "../migrations/index.js";
import type * as migrations_installmentBackfill from "../migrations/installmentBackfill.js";
import type * as migrations_phase2Runner from "../migrations/phase2Runner.js";
import type * as migrations_preflightCheck from "../migrations/preflightCheck.js";
import type * as migrations_recurring from "../migrations/recurring.js";
import type * as migrations_recurringCurrencyBackfill from "../migrations/recurringCurrencyBackfill.js";
import type * as migrations_recurringToLedger from "../migrations/recurringToLedger.js";
import type * as migrations_reimplement from "../migrations/reimplement.js";
import type * as migrations_resetProgress from "../migrations/resetProgress.js";
import type * as migrations_rollback from "../migrations/rollback.js";
import type * as migrations_transactionBackfill from "../migrations/transactionBackfill.js";
import type * as migrations_utils from "../migrations/utils.js";
import type * as migrations_verify from "../migrations/verify.js";
import type * as migrations from "../migrations.js";
import type * as projections from "../projections.js";
import type * as recurring from "../recurring.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  crons: typeof crons;
  diagnostics: typeof diagnostics;
  env: typeof env;
  expenses: typeof expenses;
  http: typeof http;
  "internal/expenses": typeof internal_expenses;
  "internal/index": typeof internal_index;
  "internal/recurring": typeof internal_recurring;
  internal: typeof internal_;
  "ledger/accounts": typeof ledger_accounts;
  "ledger/budgetExecution": typeof ledger_budgetExecution;
  "ledger/budgetHistory": typeof ledger_budgetHistory;
  "ledger/budgetLines": typeof ledger_budgetLines;
  "ledger/budgetUtils": typeof ledger_budgetUtils;
  "ledger/budgets": typeof ledger_budgets;
  "ledger/cardStatements": typeof ledger_cardStatements;
  "ledger/dualWriteConfig": typeof ledger_dualWriteConfig;
  "ledger/dualWriteUtils": typeof ledger_dualWriteUtils;
  "ledger/errorTracking": typeof ledger_errorTracking;
  "ledger/exchangeRateProviders": typeof ledger_exchangeRateProviders;
  "ledger/exchangeRates": typeof ledger_exchangeRates;
  "ledger/fetchHistoricalRates": typeof ledger_fetchHistoricalRates;
  "ledger/fetchLiveRates": typeof ledger_fetchLiveRates;
  "ledger/fx": typeof ledger_fx;
  "ledger/index": typeof ledger_index;
  "ledger/monthlySummary": typeof ledger_monthlySummary;
  "ledger/rateMonitoring": typeof ledger_rateMonitoring;
  "ledger/rateValidation": typeof ledger_rateValidation;
  "ledger/rollups": typeof ledger_rollups;
  "ledger/testApiProviders": typeof ledger_testApiProviders;
  "ledger/transfers": typeof ledger_transfers;
  "ledger/types": typeof ledger_types;
  "ledger/validators": typeof ledger_validators;
  "lib/scheduling": typeof lib_scheduling;
  "migrations/accountSeeding": typeof migrations_accountSeeding;
  "migrations/backfillIsCredit": typeof migrations_backfillIsCredit;
  "migrations/backfillPaymentTypeMappings": typeof migrations_backfillPaymentTypeMappings;
  "migrations/bulkPhase2Migration": typeof migrations_bulkPhase2Migration;
  "migrations/category": typeof migrations_category;
  "migrations/expenseCategory": typeof migrations_expenseCategory;
  "migrations/fixCardFields": typeof migrations_fixCardFields;
  "migrations/index": typeof migrations_index;
  "migrations/installmentBackfill": typeof migrations_installmentBackfill;
  "migrations/phase2Runner": typeof migrations_phase2Runner;
  "migrations/preflightCheck": typeof migrations_preflightCheck;
  "migrations/recurring": typeof migrations_recurring;
  "migrations/recurringCurrencyBackfill": typeof migrations_recurringCurrencyBackfill;
  "migrations/recurringToLedger": typeof migrations_recurringToLedger;
  "migrations/reimplement": typeof migrations_reimplement;
  "migrations/resetProgress": typeof migrations_resetProgress;
  "migrations/rollback": typeof migrations_rollback;
  "migrations/transactionBackfill": typeof migrations_transactionBackfill;
  "migrations/utils": typeof migrations_utils;
  "migrations/verify": typeof migrations_verify;
  migrations: typeof migrations;
  projections: typeof projections;
  recurring: typeof recurring;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
