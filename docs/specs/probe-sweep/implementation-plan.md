# Implementation Plan: The probe sweep, and a console that reads a sitting

- **Feature spec:** [`./feature-spec.md`](./feature-spec.md) — Accepted
- **Status:** Draft
- **Owner:** —

## Breakdown

```mermaid
flowchart LR
  E["Epic: one press, every reading, all of it legible"]
  E --> M0["M0 · Measure and re-verify (dark)"]
  M0 --> M1["M1 · The headroom guard (#260)"]
  M1 --> M2["M2 · The history tells the truth"]
  M2 --> M3["M3 · A limb is the unit of durability"]
  M3 --> M4["M4 · Schema (dark)"]
  M4 --> M5["M5 · The sweep — new entry point"]
  M5 --> M6["M6 · Sittings: combined and separate"]
  M6 --> M7["M7 · Gate pass, ADR, docs"]
```

### Epic

**One press, every reading, all of it legible** — make the probe's complete measurement a single
decision, make nothing measured go missing, and make a sitting as readable in a month as in the
minute after it was taken. Roadmap theme: operational tooling / `docs/TECH_DEBT.md` #75.

**Ordering rationale, since it is not obvious.** The guard (M1) precedes the sweep (M5) because the
sweep's fourth step produces exactly the reading that exposed #260 — shipping the sweep first ships
a known-misleading cell in the feature's headline output. The display fixes (M2) precede the schema
(M4) because they close three approved-but-unmet acceptance criteria and need nothing new. The
schema (M4) precedes the sweep because grouping and protocol labelling depend on it and a column is
the one thing that cannot be added afterwards without a second migration.

---

## Milestone M0 — Measure and re-verify

**Outcome:** the numbers this epic's decisions rest on are measured rather than inferred, and its
falsification conditions are committed before anything is built.
**Ships dark:** no product code changes and nothing is reachable. Output is
`docs/specs/probe-sweep/m0-measurements.md`.
**Journey:** none — nothing user-facing.

> **Feature: the sweep's cost, taken rather than estimated**
> **Complexity:** S · **Dependencies:** none · **Risks:** the machine that can answer is the product
> owner's, so this milestone has a hand-off → the harness is the existing panel, so the ask is "press
> these four buttons and paste the four blocks", not "run a command".
> **Testing:** none — this milestone produces evidence, not code.

##### Task M0-T1 — commit the falsification conditions first

- **Description:** write S5's PASS/ESCALATE thresholds, and the sweep-duration table with its one
  **inferred** cell flagged, into `m0-measurements.md` **before** any measurement is taken.
- **Complexity:** S · **Dependencies:** none
- **Risks:** a condition written after the number is a number tuned to the answer → the file is
  committed in its own commit, and the commit precedes the readings.
- **Testing:** n/a.
- **Steps:** 1) restate the CQ-2 arithmetic with sources; 2) state PASS ≤ 144 s, ESCALATE > 180 s; 3) commit.

##### Task M0-T2 — measure the four steps individually

- **Description:** on the product owner's machine, run each of the four (scenario × framing) steps at
  `full` through today's panel and record wall-clock, fps, viewport and the copied report block.
- **Complexity:** S · **Dependencies:** M0-T1
- **Risks:** the fourth cell (revision overlay at Fit) is the inferred one and may be far from
  ~23 fps → the table is corrected **from the run**, and if the total exceeds 180 s the sweep's shape
  goes back to the product owner as CQ-2 reopened rather than being quietly trimmed.
- **Testing:** n/a.
- **Steps:** 1) four runs; 2) paste each block; 3) sum; 4) compare against M0-T1's condition and
  state the verdict in those words.

##### Task M0-T3 — re-verify the problem statement, not only the design

- **Description:** re-check every claim in the spec's §1 against the code as it stands on the day
  the work starts, and correct in place what has moved.
- **Complexity:** S · **Dependencies:** none
- **Risks:** this register's most-recorded failure is a document complaining about something already
  fixed → the check is a list of commands and file:line reads, written down with their results.
- **Testing:** n/a.
- **Steps:** 1) re-read `run-probe.ts:255`, `to-probe-body.ts:31`, `probe-history.tsx:68-98`,
  `judge.ts:181-211`; 2) confirm the three unmet predecessor criteria are still unmet; 3) confirm
  `e2e-staff/staff.spec.ts` still selects `quick`; 4) record any correction.

---

## Milestone M1 — The headroom guard (#260)

**Outcome:** no difference reading prints a delta that cannot mean what it looks like.
**Entry point:** none added. The **existing** history table and the existing live result change what
they say for a saturated reading — including for rows already stored, because the verdict is derived
on read (ADR-0128 D5 working as designed).
**Journey:** the existing `e2e-staff` probe assertion is extended to accept the new sentence; no new
config, no new CI step.

> **Feature: `saturated` as a fact, and INDETERMINATE as its gated consequence**
> **Complexity:** M · **Dependencies:** M0
> **Risks:** `judge.ts` is a **shared gate** — the CLI driver imports it — so a change here changes
> `scripts/measure-revision-diff.mjs`'s output → F1's before/after comparison is re-run as the
> acceptance condition, exactly as ADR-0128 D2 required of the extraction.
> **Testing:** unit, from literals, verified red against the current judge; the CLI oracle.

##### Task M1-T1 — the guard

- **Description:** add `headroomPp = 100 - baselineMeanPp` and `saturated = headroomPp < barPp` to
  `JudgeResult`, always computed. When `gated && saturated`, return `INDETERMINATE` with a reason
  naming both numbers. **The `!gated` early return must not skip the fact** — only the verdict branch
  is gated.
- **Complexity:** S · **Dependencies:** none
- **Risks:** placing the branch where the spread guard sits reproduces the row's own error — the
  exhibit that exposed #260 is **ungated** and returns at `judge.ts:195` before reaching it → the
  test built from #260's numbers is written **ungated first**, and verified red.
- **Testing:** (a) gated + saturated → INDETERMINATE, not PASS; (b) **ungated** + saturated →
  `saturated: true` on the result; (c) `docs/TECH_DEBT.md:4385-4387`'s exact numbers; (d) an
  unsaturated run is unchanged in every field.
- **Steps:** 1) extend `JudgeResult`; 2) compute before the `!gated` return; 3) add the gated branch; 4) tests, each verified red.

##### Task M1-T2 — the sentence, and the ungated rendering

- **Description:** `verdictNote` gains the saturated case. Every renderer that prints a delta —
  `probe-report.ts:130`, the panel's limb block, the history's verdict cell — prints the caveat
  beside it when `saturated`, and never a bare figure.
- **Complexity:** S · **Dependencies:** M1-T1
- **Risks:** one renderer updated and not its neighbour is this repository's most-repeated shape →
  a test enumerates the three renderers against one saturated fixture.
- **Testing:** unit per renderer; one shared fixture.
- **Steps:** 1) sentence in `verdict-copy.ts`; 2) three renderers; 3) tests; 4) close #260 in
  `docs/TECH_DEBT.md` with the correction to its own proposed placement (spec §4.9).

##### Task M1-T3 — the CLI oracle

- **Description:** run `apps/web/scripts/measure-revision-diff.mjs` before and after and compare, as
  ADR-0128 F1 did.
- **Complexity:** S · **Dependencies:** M1-T1, M1-T2
- **Risks:** an unsaturated CLI run should be byte-identical; a saturated one should differ by
  exactly the new sentence → both cases run, and the diff is recorded rather than described.
- **Testing:** the comparison itself.
- **Steps:** 1) run both; 2) record; 3) changeset.

---

## Milestone M2 — The history tells the truth

**Outcome:** a stored reading carries the facts that decide whether it means anything, and can be
copied.
**Entry point:** the **existing** history table on `/staff` → Performance — new columns, a
**Copy report** control per row group, and the narrow-viewport caveat the predecessor spec promised.
**Journey:** `e2e-staff` asserts the viewport column and the copy control against a real stored row.

> **Feature: close three approved-but-unmet acceptance criteria**
> **Complexity:** M · **Dependencies:** M1 (so a copied block already carries the saturation caveat)
> **Risks:** the table becomes too wide to read → the facts that are constant per sitting move out of
> the table in M6; M2 adds only the three the predecessor spec named, and M6 rearranges.
> **Testing:** unit on the columns; the journey for the real row.

##### Task M2-T1 — the missing columns

- **Description:** add viewport (`w×h`, with DPR), measured display interval, and focus-held to the
  history row. These are stored on every row today and rendered on none
  (`probe-history.tsx:68-98`), against `docs/specs/staff-performance-probe/feature-spec.md:206-208`.
- **Complexity:** S · **Dependencies:** none
- **Risks:** none material.
- **Testing:** unit asserting each value renders from a fixture row; one asserting a masked GPU still
  renders as masked and never as a guess.
- **Steps:** 1) columns; 2) tests; 3) note in `docs/TECH_DEBT.md` #261 that the parameter is now
  visible per reading (the row stays open — it asks for a decision, not a display).

##### Task M2-T2 — the viewport caveat

- **Description:** the panel states that a reading's viewport decides its comparability, with the
  measured figure (~4.26 ms per megapixel, `docs/TECH_DEBT.md` #75(f)) available as the reason.
  `docs/specs/staff-performance-probe/feature-spec.md:262` specified this and it was never built.
- **Complexity:** S · **Dependencies:** M2-T1
- **Risks:** a caveat nobody reads → it is attached to the table by `aria-describedby`, the
  established fix here (`my-activity.tsx` precedent, cited at `routes/staff.tsx:282-283`), because
  `DataTable` is a focusable region and a landmark-navigating reader lands inside it.
- **Testing:** unit asserting the association, not merely the text.

##### Task M2-T3 — copy a stored reading

- **Description:** `formatProbeReport` takes the presentation model rather than a live
  `ProbeOutcome`, so a reading taken last week produces the same block.
- **Complexity:** M · **Dependencies:** M2-T1
- **Risks:** the formatter's line vocabulary drifts while being re-pointed → `probe-report.test.ts`
  is the before/after oracle and its assertions do **not** change in this task.
- **Testing:** the existing suite unchanged; one new case building the model from stored rows and
  asserting the same block.
- **Steps:** 1) introduce `model/sitting.ts` with the live adapter only; 2) re-point the formatter; 3) add the stored adapter; 4) the structural field-set equality test (spec S2), verified red
  against an adapter missing one field.

---

## Milestone M3 — A limb is the unit of durability

**Outcome:** stopping a run stops costing you the work already done.
**Entry point:** the **existing** `Run measurement` control — its **Stop** now keeps completed limbs,
and its copy says so.
**Journey:** `e2e-staff` presses Stop during a two-limb run and asserts a row exists.

> **Feature: cancellation stops being all-or-nothing**
> **Complexity:** M · **Dependencies:** M0
> **Risks:** recording a partial limb would be worse than discarding it → a limb is recorded **iff**
> it collected all its repeats/pairs, asserted directly.
> **Testing:** unit on `runProbe`'s outcome shape and on `toProbeBody`; the journey for the real path.

##### Task M3-T1 — completed limbs survive a cancellation

- **Description:** `ProbeOutcome`'s `cancelled` kind carries the limbs that completed. `toProbeBody`
  stores those and only those. `refuseRun`'s frame-count input stays the **intended** count, which is
  correct by construction once an incomplete limb can never be stored.
- **Complexity:** M · **Dependencies:** none
- **Risks:** the difference scenario breaks out mid-pair (`revision-diff.ts:434-435`), so a partial
  **pair** must not be counted → the pair is pushed only after both phases return, which it already
  is (`:453`); assert it.
- **Testing:** (a) stop after limb 1 of 2 → one row, verified red against today's discard;
  (b) stop inside limb 1 → no rows; (c) a refusal still stores nothing.
- **Steps:** 1) thread completed limbs through the cancelled outcome; 2) `toProbeBody`; 3) tests; 4) correct the `run-probe.ts:280-282` comment, which is true of the interrupted limb and false of
  its finished neighbour.

##### Task M3-T2 — the copy, and what was not taken

- **Description:** **Stop** becomes "Stop (keeps what is already measured)". The result states how
  many readings were kept and how many were not taken.
- **Complexity:** S · **Dependencies:** M3-T1
- **Risks:** "not taken" and "refused" collapsing into one sentence loses the distinction between
  "we did not try" and "we tried and the machine said no" → two vocabularies, two tests.
- **Testing:** unit on both sentences; the live region says the same thing as the visible copy.

---

## Milestone M4 — Schema

**Outcome:** a sitting and a protocol are facts the database holds.
**Ships dark:** two nullable columns, written by nothing until M5. No screen changes.
**Journey:** none. The API e2e suite covers the round trip.

> **Feature: `sweep_id` and `frames_per_phase`**
> **Complexity:** M · **Dependencies:** M0; **CQ-1 answered by the product owner**
> **Risks:** a migration is checksummed on landing and applies to a real database → **the design goes
> through `database-architect` first, without exception; if the agent fails, is empty or is slow, it
> is re-run. Waiting is the cheap option** (CLAUDE.md §19.3/§20).
> **Testing:** API e2e round trip; the schema-drift check; the retention sweep's existing suite.

##### Task M4-T1 — design with `database-architect`

- **Description:** hand the agent spec §4.4 — the two columns, the nullability argument, the
  no-backfill argument, the no-index bound, and the four open questions listed there.
- **Complexity:** S · **Dependencies:** none
- **Risks:** deciding this is "too small to need the agent" is the judgement the agent exists to make
  → unconditional.
- **Testing:** n/a.

##### Task M4-T2 — migration and Prisma model

- **Description:** the migration the agent specified, plus docblocks in the house style stating why
  each column is nullable and why neither is backfilled.
- **Complexity:** S · **Dependencies:** M4-T1
- **Risks:** the ADR-0126 M4 shape — a new column or table breaking the API e2e suite en masse →
  additive nullable columns on an existing table with no FK; the full API e2e run is the check.
- **Testing:** `scripts/e2e-local.sh api`; `pnpm check:schema-drift` (or the repo's equivalent, via
  `pnpm prepush`).

##### Task M4-T3 — DTOs

- **Description:** `sweepId?` (`@IsUUID`, `@IsOptional`) and `framesPerPhase?` (bounded int) on the
  request; both on the response. Fold #259 items 1–3 while these files are open.
- **Complexity:** S · **Dependencies:** M4-T2
- **Risks:** a DTO bound looser than the database CHECK turns a promised 422 into a 500 → the bound
  is asserted as a strict subset, the property backend-performance re-derived at the last gate pass.
- **Testing:** `dto/probe-dto.validation.spec.ts` extended; API e2e for the 422s.

---

## Milestone M5 — The sweep

**Outcome:** one press takes every reading the probe can take, recording each as it completes.
**Entry point:** `/staff` → Performance → button **“Run all measurements”**. Secondary:
**“Check the probe works”**. The three existing selects move into a **“Measure one thing”**
disclosure and keep working.
**Journey (lands here, not at the end — ADR-0081 §2):** a **second `test()`** in
`apps/web/e2e-staff/staff.spec.ts` that signs in as staff, presses **Check the probe works**, waits
for a terminal state, and asserts that more than one sitting's worth of readings reached the history
under one grouping. A second `test()` rather than an extension of the first because Playwright's
config `timeout` is per test (`playwright.staff.config.ts:30` is 120 000 ms) — **verify that on the
first local run rather than assuming it**, and if it is not, raise the timeout deliberately.

> **Feature: `run-sweep.ts`**
> **Complexity:** L · **Dependencies:** M1, M3, M4
> **Risks:** the sweep is a second orchestration that could drift from the single run → all three
> controls go through one code path and one plan derivation, pinned structurally.
> **Testing:** unit (plan derivation, per-step recording, continue-past-refusal); API e2e (grouping);
> the flag-free journey.

##### Task M5-T1 — the plan, derived

- **Description:** `plan = SCENARIOS.flatMap(s => PRESETS.map(p => …))`, Week before Fit.
- **Complexity:** S · **Dependencies:** none
- **Risks:** a hard-coded list goes stale the day a scenario is added — the ADR-0073 C4 shape →
  structural test: a stub registry of three scenarios yields six steps with no edit here.
- **Testing:** the structural test, verified red against a literal list.

##### Task M5-T2 — the loop, and per-step recording

- **Description:** run each step; classify `measured` / `refused` / `cancelled(partial)`; POST the
  completed limbs immediately with the sweep's id; continue past a refusal; leave the loop on Stop.
- **Complexity:** M · **Dependencies:** M5-T1, M3-T1, M4-T3
- **Risks:** a failed POST aborting the sweep → the store's failure is per-step state, never a throw;
  a test drives a rejecting client and asserts steps 2–4 still run.
- **Testing:** unit with a spy client: four POSTs, one `sweepId`, four distinct `runId`s returned.

##### Task M5-T3 — one refetch, not four

- **Description:** move `invalidateQueries` out of the mutation's `onSuccess`
  (`api/probe-results.ts:118-120`) to a sweep-level call.
- **Complexity:** S · **Dependencies:** M5-T2
- **Risks:** a single run must still refresh the history → the single-run path calls the same
  sweep-level completion hook, since it is a one-step sweep.
- **Testing:** unit asserting exactly one invalidation per sitting. This is a real cost, not tidying:
  four refetches are four extra `staff.panel_read` rows in an append-only table for one press.

##### Task M5-T4 — the controls and the confirmations

- **Description:** the three controls of §4.6, each with its own confirmation naming its own duration
  (derived per step, not the constant "about 25 seconds"), the motion, the foreground requirement and
  what **Stop** keeps.
- **Complexity:** M · **Dependencies:** M5-T2
- **Risks:** two minutes of full-screen motion with sparse announcements — #259 item 11 already
  records `revision-diff` narrating once for a whole multi-pair run → announce per step **and** per
  repeat, and fold #259 item 11 here rather than filing it again.
- **Testing:** unit on each confirmation's copy; the live region asserted for step transitions.

##### Task M5-T5 — the journey

- **Description:** the second `test()` described above.
- **Complexity:** M · **Dependencies:** M5-T4
- **Risks:** a container drops frames badly, so even the short sweep may be slow → assert a terminal
  state with a generous budget and assert the **kind** of outcome, never a number; the existing probe
  assertion's shape (`e2e-staff/staff.spec.ts:314-341`) is the model, and it already accepts a
  refusal as a correct outcome.
- **Testing:** the journey itself. Run it locally — `scripts/e2e-local.sh web:staff` — before pushing;
  CI is the second opinion, never the first.

---

## Milestone M6 — Sittings: combined and separate

**Outcome:** the console displays a sweep as one sitting and a single run as a sitting of one,
without either hiding the other.
**Entry point:** the **rebuilt** history on `/staff` → Performance.
**Journey:** the M5 journey is extended by two assertions — a sweep renders as one block, and a
single run renders as its own.

> **Feature: `ui/probe-sittings.tsx`**
> **Complexity:** L · **Dependencies:** M2-T3 (the presentation model), M4, M5
> **Risks:** N tables on screen is a navigation cost → each sitting's `DataTable` caption names the
> sitting, so a landmark-navigating reader hears which one they are in; the accessibility review at
> M7 checks it rather than the author asserting it.
> **Testing:** unit on grouping and on every state; a11y in the journey's axe sweep.

##### Task M6-T1 — group stored rows into sittings

- **Description:** group by `sweepId ?? runId`; order newest first; a `NULL` `sweepId` is a
  single-press sitting.
- **Complexity:** S · **Dependencies:** M4
- **Risks:** a sitting split across a retention boundary reads as complete → the block states its own
  reading count and claims nothing about completeness (spec §2, edge cases).
- **Testing:** unit including a pre-migration row, a partial sitting, and a sitting whose two rows
  carry different `apiVersion`s.

##### Task M6-T2 — the sitting block

- **Description:** facts list + `DataTable` + **Copy report**, reusing existing primitives; no
  one-off styling.
- **Complexity:** M · **Dependencies:** M6-T1, M2-T3
- **Risks:** a state that exists and is unreachable — this register's most-recorded defect → every
  state in spec §4.6 gets a rendering test, including `check, not a measurement` and
  `viewport differs`.
- **Testing:** unit per state.

##### Task M6-T3 — the summary sentence

- **Description:** one line per sitting: graded / reported-only / not taken, and — when every reading
  is ungraded — say so first.
- **Complexity:** S · **Dependencies:** M6-T2
- **Risks:** the sentence and the live region drifting apart → one pure function, both consumers.
- **Testing:** unit from literals; an assertion that the visible copy and the announced copy are the
  same string.

##### Task M6-T4 — run the missing measurements

- **Description:** a control that re-runs only the steps that were refused or not taken, under the
  **same** `sweepId`.
- **Complexity:** M · **Dependencies:** M5-T2
- **Risks:** re-running under the same id makes a sitting span a long gap → the block shows each
  reading's own `recordedAt` and flags a spread beyond an hour, rather than pretending it was one
  sitting in time.
- **Testing:** unit; the journey drives one refused step if the container produces one, and skips
  the assertion honestly if it does not.

---

## Milestone M7 — Gate pass, ADR, docs

**Outcome:** the epic is reviewed by the specialists that would catch what a human read misses, and
the decisions are recorded where the next reader will find them.
**Ships:** no new capability.
**Journey:** none new; every existing suite is run.

> **Feature: the deferred reviews, folded**
> **Complexity:** M · **Dependencies:** M1–M6
> **Risks:** treating the gate pass as a formality — seven consecutive epics here have found defects
> at it that had already passed a human read → every blocking finding is fixed with a regression test
> **verified red first**; non-blocking findings become a numbered `docs/TECH_DEBT.md` row with reasons.
> **Testing:** the full pre-push gate plus `scripts/e2e-local.sh api` and `web:staff`.

##### Task M7-T1 — specialist reviews over the combined diff

- **Description:** run **security-reviewer** (the client-supplied `sweep_id`, the staff boundary, the
  unchanged 404), **api-reviewer** (the two optional fields, the folded #259 items),
  **backend-performance-reviewer** (four POSTs, one GET, the read's plan at a larger row count),
  **database-architect** (re-review of the landed migration), **accessibility-reviewer** (a two-minute
  motion surface, N table regions, the live region during a sweep, focus return from the overlay),
  **ux-reviewer** (three controls, four confirmations, the not-taken/refused distinction) and
  **component-reviewer** (one presentation model, one formatter, no one-off styling).
- **Complexity:** M · **Dependencies:** M6
- **Risks:** a reviewer's finding being argued away → each is recorded with its verdict, including the
  ones judged wrong, with the reason.
- **Testing:** regression tests for every blocking finding, each verified red.

##### Task M7-T2 — the ADR

- **Description:** file the ADR (provisional 0130 — confirm the number at filing, ADR-0071's lesson),
  amending ADR-0128 D4/D5/D7, closing #260 with the correction to that row's own proposed placement,
  and recording the §1(e) finding: three approved acceptance criteria unmet for a milestone that read
  as done.
- **Complexity:** M · **Dependencies:** M7-T1
- **Risks:** the ADR index drifting → `pnpm check:adr-coverage` gates both directions since
  ADR-0110 D6; run `pnpm prepush`, which derives its checks rather than relying on a remembered list.
- **Testing:** the gates.

##### Task M7-T3 — docs and changeset

- **Description:** `docs/API.md`, `docs/DATABASE.md`, `CLAUDE.md` §16, `docs/TECH_DEBT.md`
  (#260 closed; #259 items 1–3 closed; #75 and #261 annotated, both **left open**), a changeset for
  each of `@repo/api` and `@repo/web`.
- **Complexity:** S · **Dependencies:** M7-T2
- **Risks:** closing #75 or #261 because this epic touched them → neither is closed. #75 stays open
  until readings are taken; #261 asks for a **decision** about the gate's canvas size, which this
  epic deliberately does not make (CQ-6).
- **Testing:** `pnpm prepush`, including `check:doc-links`, `check:counts`, `check:claims`,
  `check:debt-status`.

---

## Sequencing & slices

Each milestone is independently releasable and independently useful.

| Slice | Value on its own                                                                | Reversible by                                      |
| ----- | ------------------------------------------------------------------------------- | -------------------------------------------------- |
| M0    | Evidence; may reopen CQ-2 before any code                                       | n/a                                                |
| M1    | A misleading number stops being printed — including for **rows already stored** | one commit                                         |
| M2    | A stored reading becomes comparable and copyable                                | one commit                                         |
| M3    | A stopped run stops costing you the work already done                           | one commit                                         |
| M4    | Nothing visible; unblocks M5/M6                                                 | a second migration (so M4-T1 is not optional)      |
| M5    | The product owner's actual ask: one button                                      | one commit (the disclosure keeps the old controls) |
| M6    | The second half of the ask: combined **and** separate, correctly                | one commit                                         |
| M7    | The findings a human read misses                                                | n/a                                                |

**No feature flag.** ADR-0088 D1 established that a `VITE_` constant is inlined at build time,
`docker-publish.yml` passes no build args and `.dockerignore` strips `**/.env` from the build
context — so a `VITE_` flag has never been an operator rollback. The rollback here is a commit
boundary, and the estate's flag count is deliberately not increased. This also matches ADR-0128,
which shipped the panel with no flag.

## Definition of Done (per task)

Each task's PR satisfies the Feature Completion Criteria in [`docs/PROCESS.md`](../../PROCESS.md).
Two are called out because this epic can fail them quietly:

- **The pre-push gate is run, not written.** `pnpm prepush`, plus `scripts/e2e-local.sh api` for
  M4 and `scripts/e2e-local.sh web:staff` for M2, M3, M5 and M6. A journey drives a real browser
  against a real API; no unit suite can tell you an accessible name is wrong.
- **A regression test is verified red before it is trusted.** ADR-0128's own gate pass found a
  focus-return test that passed against a panel that dropped focus, caught only by verifying red.

## Risks & assumptions (rollup)

| Risk / assumption                                                                                                                 | Likelihood | Impact | Mitigation                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The sweep's real duration exceeds 180 s and the feature is too slow to be used — which is #75's founding failure in a new costume | med        | high   | M0-T2 measures before anything is built; the condition is committed first; exceeding it reopens CQ-2 with the product owner rather than being trimmed quietly           |
| The inferred revision-overlay-at-Fit cell is far from ~23 fps                                                                     | med        | med    | flagged as inferred everywhere it appears; M0-T2 replaces it with a measurement                                                                                         |
| `sweep_id` is client-supplied, weakening `runId`'s forging property                                                               | low        | low    | stated in CQ-1; the capability is strictly weaker than fabricating numbers, which ADR-0128 already accepts; the alternative loses durability                            |
| A migration lands wrong and costs a second one                                                                                    | low        | high   | `database-architect` first, unconditionally; re-run if it fails or is slow                                                                                              |
| `judge.ts` is shared, so a change alters the CLI's output                                                                         | high       | med    | expected and checked: M1-T3 re-runs ADR-0128's F1 oracle both ways                                                                                                      |
| The rebuilt panel loses a state that exists today (refusal wording, retry, inert overlay, focus return)                           | med        | high   | the existing `performance-probe-panel.test.tsx` assertions are **not** rewritten; they are the before/after oracle, and the ADR-0078 barrel-preserving argument applies |
| A refused step still leaves no trace in history                                                                                   | high       | low    | accepted and stated (spec §4.8) with its trigger to revisit                                                                                                             |
| Two minutes of unstoppable-looking motion is worse for a reduced-motion reader than 25 seconds                                    | med        | med    | **Stop** keeps what is recorded and says so; the confirmation names the total; accessibility review at M7                                                               |
| Scope creep into #258 (three copies of the pacing arithmetic)                                                                     | med        | med    | explicitly out of scope; its own trigger has not fired                                                                                                                  |
| The epic decides #261 by accident by fixing a sweep viewport                                                                      | low        | high   | CQ-6: the sweep uses the operator's real window and displays it; the decision stays with whoever picks up the Fit work                                                  |
