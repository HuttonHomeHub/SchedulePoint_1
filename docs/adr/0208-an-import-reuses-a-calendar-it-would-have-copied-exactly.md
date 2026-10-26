# ADR-0208: An import reuses a calendar it would have copied exactly

- **Status:** Proposed. D1 to D4 and D6 are built (M1, 2026-10-26); D5 (bulk delete of unused project
  calendars) is M2 and is not built. This becomes Accepted when M2 ships, or when the owner declines it.
- **Date:** 2026-10-26
- **Deciders:** Product owner (spec approved 2026-10-26 with every default, Q1 to Q4)
- **Amends:** ADR-0053 §5 (the "an import never REUSES a calendar" paragraph, and its CQ-4 sentence for
  calendars)
- **Spec:** [`docs/specs/import-calendar-tidy/`](../specs/import-calendar-tidy/): `feature-spec.md` §4
  (this ADR's outline) and `implementation-plan.md`

## Context

A planner who re-imports successive revisions of one programme into one project got a new copy of every
calendar on every import: `Site 6-Day (imported 2026-10-26)`, and an ordinal if the day already had one.
The copies are not harmful (`docs/TECH_DEBT.md` #540 is closed; the name probe finds every earlier
variant). They are clutter: every calendar picker in the project lists them, nothing says which is
current, and deleting an old revision's plan removes none of them. The same happens in the shared
organisation library for the calendars a resource holds, which an import forces to `ORG`.

ADR-0053 §5 chose never to reuse, for one reason: **a name match can change working time**. Two
calendars can share a name and have different working weeks, so binding the import to the wrong one would
silently reschedule every imported activity. That reason is about matching by name. It says nothing against
reusing a calendar whose working time is the same, and §5 itself named "the seam to revisit" if reuse were
ever introduced. This ADR is that revisit.

## Decision

- **D1. A source calendar reuses an existing calendar when a copy would differ only in its name.** The
  identity is the standard working day (`hours_per_day_minutes`), the set of weekly shift windows, and the
  set of active exceptions with their windows **and labels**, all normalised (order is irrelevant; a
  multi-day range and the same days stored singly are different). It is computed by the same pure
  function (`calendarIdentityKey`) from a stored calendar and from the rows the import **would write**
  for the file's calendar, so "identical" means "a copy would have been the same". Labels are included
  although no scheduling path reads them: a label-only difference makes a copy, which is the direction a
  wrong answer is cheap in. The name is a necessary condition and never a sufficient one: it must be the
  source name or the importer's own `(imported YYYY-MM-DD)` variant of it, with an optional ordinal
  (`isImportedVariantOf`, built from the same suffix rule as the builder, `imported-name.ts`).
- **D2. Candidates and preference.** A candidate is active, **unarchived**, in the source calendar's tier,
  in the organisation, and for `PROJECT` in the target project. Exact name first, then the oldest variant
  (`created_at`, then id). One existing calendar is claimed by at most one source calendar per import, in
  file order, so the file's calendar count is kept; calendars inside one file are never merged. Archived
  calendars are not reused and not unarchived: a calendar can always fall back to a copy, so reviving a
  retired one would be a choice nobody asked for (the resources CQ-4 precedent does not carry over,
  because a resource name collision **forces** a match). ADR-0053 §5's "CQ-4 not applicable" for calendars
  is restated as **reuse skips archived**.
- **D3. Locks, order, and compensation.**
  - The commit predicts its reused ids before the transaction. Inside it takes the calendar advisory
    lock on each, in ascending id order, **then** the project chain lock, **then** `FOR SHARE` on the
    same rows, and re-reads and re-resolves under those locks. Only locked candidates are eligible, so a
    candidate that appears after the prediction is never reused: the safe direction is a copy.
  - The advisory locks come **before** the ancestors, the order of `CalendarsService.restore` and
    `restoreBatch`: the import used to take only the chain, and taking a calendar lock after it would be
    the inverse order. The calendar **rows** come **after** the chain. A project or client delete holds the
    project row `FOR NO KEY UPDATE` and then updates the project's calendars, so an import holding a
    calendar row while it waited for the project would close a cycle with it (`40P01`). The first build
    locked the rows before the chain; the backend-performance review found that interleaving, and the
    order above is the fix.
  - **`FOR SHARE` on the reused rows is the R2 decision, flagged for backend-performance review.** A
    version-gated content edit (shifts, exceptions) bumps `calendars.version`, which conflicts with the
    lock, so an edit that arrives mid-import waits for the commit instead of changing working time under a
    plan that has already bound the calendar. The advisory lock cannot do this: content edits do not take
    it. Shared locks never queue behind each other, so two imports reusing one calendar do not wait on one
    another. The cost is that a calendar edit waits for an import's transaction, which is the duration of
    one batched write. It relies on every content edit bumping `calendars.version`, which an e2e pins.
  - A reused id goes into the key-to-id map and nowhere else. It is never inserted and never on
    `createdCalendarIds`, which the recalculation-failure compensation hard-deletes.
- **D4. It is reported, and counted.** Reuse is a `repair` finding in the dry-run and the commit,
  `calendar “<source>” was matched to the existing calendar “<existing>”`, with the reason `it has the
same working week, exceptions and hours per day, so a copy would differ only in its name (ADR-0208)`.
  No new finding kind (the #541 contract argument). A calendar that is renamed is still reported as
  `was created as`, with a reason that no longer says "never reuses". `interchange.imported`'s `after`
  gains `calendarsReused`, and the commit log line likewise. The dry-run and the commit call one resolver,
  so the reviewed sentence and the persisted one are the same function's output.
- **D5. Unused project calendars can be deleted in bulk from the project screen** (M2, not built): each
  under its own batch, with the single delete's gates, all-or-nothing. Recorded here so the decision is
  one record; it is specified in the spec and has no code yet.
- **D6. No flag, no schema change, no engine change.** ADR-0088 D1: the rollback is the commit. The
  engine is untouched (ADR-0034): a reused calendar's rows equal, after normalisation, the rows a copy
  would have held, and `buildPlanCalendar` sorts both shifts and windows, so it receives equal input.
  The proof is an e2e comparing persisted dates of a reused import against a fresh-copy import of the same
  file.

## Alternatives considered

- **Offer to remove an import's unused calendars when its plan is deleted.** Needs a provenance column
  (nothing records which calendars an import made), acts too late (copies pile up while the old plan is
  live), and stamping calendars into the plan's batch makes the bin's group root ambiguous and lets them
  outlive the plan's expiry. Rejected.
- **Content-only matching, with no name lineage.** Would bind an import to an unrelated, identically
  shaped calendar ("Crew A nights") that its owner may later change, and widens the read to the whole tier,
  which probably needs a content fingerprint column and therefore database-architect. Not the default (Q1).
- **Reuse an archived calendar and unarchive it.** Rejected (D2).
- **Merge identical calendars inside one file.** Changes the file's structure; an export would no longer
  round-trip its calendar count. Rejected.
- **An import option "always create new calendars".** A control for a need nobody has stated. Not the
  default (Q2).
- **Load every lineage variant's content and compare.** Built first and measured: see the ledger.

## Consequences

- Revisions that reuse a calendar share it. Editing that calendar changes every one of their dates, and
  stamps each plan "edited since calculated". That is what sharing a calendar already means within a
  project; the report names every reuse (Q2).
- A reused resource still gets a copy of its calendar when the file's differs: the resource is matched by
  code and keeps its own calendar, and the file's non-identical `ORG` calendar is created bound to nothing
  (`docs/TECH_DEBT.md` #553; pinned by an e2e).
- A hand-authored calendar whose exceptions are one multi-day range never matches a file that lists single
  days. That is conservative by design.
- `docs/API.md` (interchange) is rewritten; ADR-0053 §5 points here.
- **Known worst case.** A candidate set of many calendars with the same counts, minutes and date span but
  different content (labels, or windows at the same count) defeats the aggregate rule-out and reads every
  candidate's content, a chunk at a time. See the ledger for its measured cost.

## Ledger (M1, 2026-10-26)

**Red-first, one mutation each, applied and reverted:**

| Mutation                                                                      | What went red                                                                                                                                                        |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) push reused ids onto `createdCalendarIds`                                 | `keeps a reused calendar, intact, when the recalculation fails and the import rolls back`                                                                            |
| (b) take the project chain before the calendar locks                          | `interchange-calendar-lock-order`: `55P03 could not obtain lock on row in relation "projects"`                                                                       |
| (c) drop the archived filter in both reads                                    | `never reuses an identical calendar that is archived`. Dropping it from the first read only stays green: the re-read under lock masks it (the ADR-0195 observation). |
| (d) drop the identity comparison                                              | five tests: the rewritten never-reuse cases, the label-only case, the F6 case                                                                                        |
| (e) lock the calendar rows before the project chain (the first build's order) | `holds no calendar row while it waits for the project`: `55P03 could not obtain lock on row in relation "calendars"`                                                 |
| (f) drop `FOR SHARE`                                                          | `holds the reused calendar row FOR SHARE for the rest of its transaction`                                                                                            |
| (g) bind the prediction instead of re-resolving in the transaction            | `re-resolves under the lock: a calendar edited after the preview is copied, not reused`, and the delete-race invariant                                               |

(b) is the advisory-then-chain order: `interchange-calendar-lock-order` parks the calendar's advisory lock
and asks whether the project row is still free. (e) is the **B1** interleaving the backend-performance
review found: the test parks the project row `FOR NO KEY UPDATE` as a project delete does, starts a
reusing import, and asks whether the calendar row can still be taken `FOR NO KEY UPDATE NOWAIT` while the
import waits. The 8-round delete-vs-import race could not reach either, because it needs a third
transaction holding the project row.

For (b) the plan asked for an 8-round race. A deterministic probe was used instead (the
`hierarchy-cascade-lock-order` precedent): park a transaction on the calendar's advisory lock, send the
import, and ask whether the project row can still be taken `FOR NO KEY UPDATE NOWAIT` while the import
waits. The 8-round delete-vs-import race also ran: 8 of 8 rounds ended as a copy (the delete won each
time). It asserts only the invariant it can prove, that a plan is never bound to a deleted calendar; the
reuse-and-409 branch is covered by the deterministic reuse tests and the in-use guard, not by that race.

**Measurement (T1.6)**, `apps/api/test/measure/calendar-reuse.measure.ts`, on a disposable migrated
database: 1,000 calendars in the organisation, one project holding 50 lineage variants of one name with
300 exceptions each (15,600 exception rows), 15 runs. "Added" is the p95 of the dry-run's calendar
resolution minus the old name probe alone.

| Reading                                                                                                  | Added p95                                                                                                                                   | Notes                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eager, nested ORM include of every variant (first build)                                                 | +684 to +738 ms                                                                                                                             | SQL itself: calendars 0.05 ms, exceptions 9 ms, shifts 0.5 ms. The cost was the ORM materialising 15,000 exceptions. Over the plan's 50 ms rule, so the milestone stopped for a decision. |
| Header aggregates in SQL, survivors read as flat rows                                                    | +162 ms (identical to all 50) / +12 ms (changed calendar)                                                                                   | The identical pile still read all 50.                                                                                                                                                     |
| **Lazy: first candidate alone, then five at a time, stop at the first identical (shipped)**              | **+27.5 ms** identical to all 50 (the existing pile); **+37.8 ms** changed calendar (p50 +12 ms); **+17 ms** at 5 variants of 30 exceptions | Within the 50 ms rule.                                                                                                                                                                    |
| **Known worst case**: adversarial, same counts, minutes and date span as every variant, different labels | **+161 ms** (p50 +137 ms)                                                                                                                   | Nothing is ruled out and nothing matches, so all 50 are read. Accepted and recorded; reachable only with dozens of look-alike calendars in one project.                                   |

The import resolves **twice**: once before the transaction to predict which calendars to lock, and once
inside it, under the locks, which is authoritative. The adversarial +161 ms is therefore spent **outside**
the transaction and holds no lock; a cap on candidates was considered and not added.

No index and no fingerprint column was added: the SQL was never the cost. If the adversarial case ever
matters, the remedy is a content fingerprint, which is a schema change and goes to database-architect.

## References

- Spec and plan: [`docs/specs/import-calendar-tidy/`](../specs/import-calendar-tidy/)
- ADR-0053 §5 (amended), ADR-0050 (pipeline and report), ADR-0068 (hours per day), ADR-0172 (soft-delete
  stance on every read), ADR-0195 (the archived-filter masking observation), ADR-0201, ADR-0081, ADR-0088
  D1, ADR-0105
- `docs/TECH_DEBT.md` #540 (closed), #553 (a reused resource's non-identical calendar)
