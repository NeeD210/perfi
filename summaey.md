## Credit card statements — implementation overview

- **Data model**:
  - `cards`: `closingDay` (1–31), `dueDate` (1–31), `baseCurrency`, `createdAt`.
  - `card_statements`: `accountId`, `periodStart`, `periodEnd`, `closingDate`, `dueDate`, `totalAmount`, `currencyCode`, `exchangeRate`, `exchangeRateId`, `status` (`pending`/`posted`), `settlementEntryId`, `idempotencyKey`.
  - `monthly_rollups`: pre-aggregations used for performance; fallback to line-by-line.

- **Statement calculation (`calculateStatement`)**:
  - Idempotent via `statement-{cardAccountId}-{closingDate}`; returns existing statement if present.
  - Period: first statement from `card.createdAt` → `closingDate`; subsequent from previous `closingDate` → current `closingDate`.
  - Amount: prefer `monthly_rollups`; else sum `journal_lines` credits in period, converting to card `baseCurrency` using a single closing-date FX rate (`getClosingDateExchangeRate`).
  - Stores a `pending` record in `card_statements` with exchange rate info and computed `dueDate` (next occurrence of `card.dueDate` after `closingDate`).

- **Settlement posting (`postSettlement`)**:
  - Idempotent via `settlement-{accountId}-{dueDate}`; patches status if already posted.
  - Resolves funding account: `accounts.parentAccountId` of the card; fallback to user’s first active asset account.
  - Creates a `journal_entries` settlement on `dueDate` with two lines: debit card liability, credit bank asset. Validates zero-sum, then marks statement `posted` and links `settlementEntryId`.

- **Scheduled jobs**:
  - Daily 01:00 UTC: `processClosingStatements` → finds cards where `closingDay` = today and runs `calculateStatement` for `closingDate = startOfDay(now)`.
  - Daily 03:00 UTC: `processSettlements` → finds `card_statements` where `dueDate` = today and `status = pending`, then runs `postSettlement`.

- **Helpers**:
  - `getClosingDateExchangeRate(baseCurrency, closingDate)`: fetches exact FX for that day (`exchange_rates`), with recent-rate fallback; returns `{ rate, rateId? }`.
  - `getCardsWithClosingToday()`, `getStatementsDueToday()` support the jobs.

- **Key files**:
  - `convex/ledger/cardStatements.ts` — mutations, actions, helpers.
  - `convex/ledger/schema.ts` and `convex/schema.ts` — tables and indexes.
  - `convex/crons.ts` — job schedules.
