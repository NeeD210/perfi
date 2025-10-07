# Recurring Transactions & Cron Jobs ‑ Rewrite Plan

> **Goal:** Redesign the recurring-transaction engine and its daily cron job so that it is **robust**, **clean**, **performant**, and **extensible**.  Expense generation must work for all current frequencies (daily, weekly, monthly, semestrally, yearly) **and** for any new frequency added in the future – without touching core logic.

---

## 0  Background & Pain Points (from `debugAux.md`)
1. Business rules live in multiple files (`convex/recurring.ts`, `convex/internal/recurring.ts`, `convex/internal.ts`).
2. Tight coupling between *frequency logic* and *expense generation* makes it hard to add new frequencies.
3. Single-row updates inside a loop → N database round-trips per transaction.
4. Cron job processes **all** users in one batch; danger of timeouts.
5. No formal idempotency → risk of duplicated expenses if cron re-runs.
6. Hard to test because functions mix query, mutation, and validation in the same scope.

---

## 1  Design Principles
| # | Principle | Rationale |
|---|-----------|-----------|
| 1 | **Single-Responsibility** | Separate detection, scheduling, and generation. |
| 2 | **Pluggable Frequencies** | Add a new handler (= class / module) without touching the engine. |
| 3 | **Batch & Stream** | Process in chunks (e.g. 50 recs at a time) to stay within Convex action limits. |
| 4 | **Idempotent** | Use deterministic idempotency keys to avoid duplicates. |
| 5 | **Observable** | Structured logs + metrics for success/failure counts & timings. |
| 6 | **Test-Driven** | Unit tests per frequency & integration tests for the cron driver. |

---

## 2  Proposed Architecture
```
recurrence/
  ├─ index.ts               # public API: add/update/delete/list
  ├─ engine.ts              # orchestrates detection → generation pipeline
  ├─ detector.ts            # fetches due recurring txs (batch-aware)
  ├─ generator.ts           # creates expense & schedules, ensures idempotency
  ├─ frequencies/
  │     ├─ Frequency.ts     # interface: getNextDueDate(lastDate): number
  │     ├─ Daily.ts
  │     ├─ Weekly.ts
  │     ├─ Monthly.ts
  │     ├─ Semestral.ts
  │     ├─ Yearly.ts
  │     └─ **NewOne.ts**    # drop-in when needed
  └─ utils/
        └─ idempotency.ts   # builds idempotency keys
```
### Key Concepts
* **Frequency Strategy** – Each file under `frequencies/` implements `Frequency` interface enabling open/closed principle.
* **Recurrence Engine** – Stateless orchestrator: (1) query detector, (2) call generator for each tx.
* **Idempotency Key** – `userId|recurringId|dueDate` stored on the expense record.  `UNIQUE` index prevents duplicates.

---

## 3  Schema Changes
1. `recurringTransactions`
   * **Add** `nextDueDate` (float64) – cached pointer → O(1) detection.
   * **Rename** `lastProcessedDate` → `lastRunAt` (clear semantics).
2. `expenses`
   * **Add UNIQUE index** on `(recurringTransactionId, date)` to enforce idempotency.

> Migration scripts will back-fill `nextDueDate` by computing `getNextDueDate(lastRunAt)` for each row.

---

## 4  Algorithm (Happy Path)
1. **Cron Trigger** (daily at 00:00): calls `recurrence.engine.run()`.
2. **Detection** – Query `recurringTransactions` where `isActive && !softdelete && nextDueDate <= now` LIMIT *batchSize*.
3. **Per Record**:
   1. Compute `dueDate = nextDueDate`.
   2. Call generator → creates new expense **if not already present**.
   3. Compute `nextDueDate = frequency.getNextDueDate(dueDate)`.
   4. Patch the recurring record with `{ lastRunAt: dueDate, nextDueDate }`.
4. **Loop** while more due records exist.

Edge cases (endDate passed, deactivated, etc.) handled inside detector.

---

## 5  Phased Implementation Roadmap
### Phase 1: Foundations (Week 1)
* Extract **Frequency Strategy** pattern.
* Implement unit tests per frequency.
* Create `utils/idempotency.ts`.

### Phase 2: Read-Only Engine (Week 2)
* Build detector & engine but **DO NOT** write expenses – just log would-create.
* Enable via feature flag `processRecurrenceV2=false`.
* Benchmark performance vs. current.

### Phase 3: Dual-Write & Validation (Week 3-4)
* Turn on dual-write: old path + new engine (idempotent).
* Cross-validate counts (shadow mode).
* Instrument metrics.

### Phase 4: Cutover (Week 5)
* Flip feature flag.
* Remove legacy cron reference, point to `engine.run`.
* Monitor error budget for one week.

### Phase 5: Cleanup & Hard Delete (Week 6)
* Remove deprecated code paths.
* Finalize documentation, diagrams, and tests.

---

## 6  Testing Strategy
1. **Unit Tests**
   * Frequency handlers: edge dates (leap year, month-end, DST).
   * Generator idempotency.
2. **Integration Tests**
   * End-to-end cron run with mocked time travel.
3. **Load Tests**
   * Simulate 100k recurring txs, ensure cron completes < 30 sec.
4. **Regression Suite**
   * Guard against duplicate expenses & missed generations.

---

## 7  Monitoring & Alerting
* **Metrics**: cron duration, processed count, skipped (duplicates), errors.
* **Logs**: structured JSON per record.
* **Alert**: failure rate > 0.5% or duration > X min.

---

## 8  Extending with New Frequencies
1. Create `frequencies/BiWeekly.ts` implementing interface.
2. Register in a frequency map: `{ biweekly: new BiWeekly() }`.
3. No other code changes required → passes unit tests.

---

## 9  Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Long-running cron exceeds Convex 30s limit | Batch & loop with cursor between action calls |
| Duplicate processing after crash | Idempotency key + UNIQUE index |
| Developer misuse of frequency map | Compile-time `assertNever` to ensure exhaustive handling |
| Data migration errors | Run in read-only shadow mode first |

---

## 10  Deliverables
- [ ] New modular recurrence engine under `convex/recurrence/`
- [ ] Updated database schema & migration scripts
- [ ] Complete unit + integration test suite under `/tests/recurrence/`
- [ ] Monitoring dashboards & alerts
- [ ] Updated documentation (`docs/recurring.md`)

---

**Ready for execution!**
