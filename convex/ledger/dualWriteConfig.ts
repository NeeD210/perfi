// Centralized feature flag for Phase 3 dual-write.
// Note: Convex runtime doesn't expose process.env to mutations reliably.
// Toggle this constant to enable/disable dual-write behavior.
export const LEDGER_DUAL_WRITE_ENABLED = true; // Enabled: 2025-01-08 post-migration

