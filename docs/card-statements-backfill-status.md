# Card Statements Backfill - Current State and Investigation Notes (2025-10-15)

## Current state
- Core feature implemented in `convex/ledger/cardStatements.ts`:
  - `calculateStatement` (internal mutation) with rollup fast-path and per-currency fallback conversion.
  - `postSettlement` (internal mutation) with zero-sum validation and idempotency.
  - Scheduled jobs (`processClosingStatements`, `processSettlements`) wired in `convex/crons.ts`.
- Schema and indexes present for `card_statements` (idempotency, due-date/status, account/date).
- Error logging via `logDualWriteError`.
- New migration backfills added:
  - `migrations/cardStatementsBackfill.ts`: `listCardsForBackfill`, `backfillCardStatementsForUser`, `backfillAllCardStatements`.
  - Exported actions in `migrations/index.ts`.
- Deployment succeeded: `npx convex deploy --yes`.

## Execution result (cloud)
- Command: `npx convex run migrations/index:backfillAllCardStatements '{}'`
- Result:
```json
{
  "totalCards": 0,
  "attemptedStatements": 0,
  "successful": 0,
  "skipped": 0,
  "errors": 0,
  "durationMs": 28
}
```

## Observations from dev logs
- ReturnsValidationError when listing cards in `listCardsForBackfill`:
  - "Object contains extra field `_creationTime` that is not in the validator."
  - Indicates the internal query returned full card documents (including `_creationTime`) instead of mapping to the declared return shape.

## Likely reasons no cards were backfilled
1. Deployment mismatch (most likely)
   - Dev status shows logs on `majestic-squirrel-400` while deploy reported `graceful-spaniel-507`.
   - Running the backfill against cloud where there are 0 cards yields zero results.
   - Action: Ensure the run targets the environment with data (dev or prod), or seed cards in the target deployment.

2. listCardsForBackfill validator shape mismatch (dev-only issue)
   - The internal query returns full docs (including `_creationTime`), but the validator omits `_creationTime`.
   - This can cause the query to throw/return empty depending on path, leading to no cards processed in dev.
   - Fix: Map results to the exact validator shape before returning.

3. Cards missing required metadata
   - `baseCurrency` or `createdAt` missing (older records) → filtering elsewhere can exclude them.
   - Backfill uses card.createdAt as default `startDate`; if missing, it falls back to now (no periods).
   - Action: Backfill/fix missing card fields (see `migrations/fixCardFields.ts`) or pass explicit `startDate`.

4. Date range yields no closing dates
   - If provided `startDate`/`endDate` range excludes any valid month with the card’s `closingDay`, no statements are generated.
   - Action: Provide a wider date range or verify card `closingDay`.

5. Idempotency / existing statements
   - If statements already exist for the generated closing dates, `calculateStatement` returns existing and may appear as skipped.
   - Action: Verify existing `card_statements` for the card/date combinations.

6. Soft-deleted cards or filtered accountId
   - `softdelete: true` cards are excluded.
   - Passing `cardAccountId` restricts to one card account.

## Immediate fixes
- Update `listCardsForBackfill` to map to validator shape (exclude `_creationTime`):
  - Return `{ _id, accountId, userId, closingDay, dueDate, baseCurrency, createdAt, softdelete }` only.
- Re-run against the correct deployment with data:
  - Dev: `npx convex run migrations/index:backfillAllCardStatements '{"startDate": 1704067200000, "endDate": 1735689600000}'`
  - Or target prod if intended.

## Next steps
- Confirm which deployment has the card data and run backfill there.
- If needed, seed a few test cards and re-run backfill to validate end-to-end.
- Add a small metrics log in backfill to report counts per reason (filtered, missing metadata, idempotency hits).

