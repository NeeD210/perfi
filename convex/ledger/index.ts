// Ledger system exports
export * from "./types";
export * from "./accounts";
export * from "./exchangeRateProviders";
export * from "./rateValidation";
export * from "./rateMonitoring";

// Export specific functions from fx and exchangeRates to avoid conflicts
export {
  convertAmount as convertAmountInternal,
  getEffectiveRate,
  getRateForDate as getRateForDateInternal,
  storeExchangeRate,
  calculateResidual,
  createBalancingLine,
  getExchangeRateForDate,
  getCurrentExchangeRate,
  convertAmountPublic,
} from "./fx";

export {
  getExchangeRate,
  fetchAndStoreRate,
  storeRate,
  getRateForDate,
  batchFetchRates,
  getExchangeRateWithRefresh,
  getProviderHealth,
  convertAmount as convertAmountService,
  getAvailableCurrencyPairs,
  getRateHistory,
} from "./exchangeRates";

// Export error tracking types and functions
export type { DualWriteError, ExchangeRateError } from "./errorTracking";
export {
  logDualWriteError,
  trackDualWriteOperation,
  logDualWriteSkip,
  logExchangeRateError,
  trackExchangeRateOperation,
} from "./errorTracking";

// Export transfer functions
export {
  addTransfer,
  listTransfers,
  getTransferDetails,
  updateTransfer,
  deleteTransfer,
  validateTransferAccounts,
  validateTransferAmount,
  validateExchangeRate,
  calculateDestinationAmount,
} from "./transfers";
