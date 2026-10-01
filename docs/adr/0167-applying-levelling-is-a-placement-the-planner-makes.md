# ADR-0167: Applying levelling is a placement the planner makes

- **Status:** Accepted; D1 and D3 amended by ADR-0168
- **Date:** 2026-09-30
- **Deciders:** James Ewbank (product owner — CQ-1 to CQ-4 answered (a), build approved 2026-09-30),
  with Claude Code
- **Extends:** ADR-0166 (levelling anchors on the drawn span — this is the "later" command its
  Alternatives named), ADR-0148 D9 (levelled is a lens, never an authority)
- **Does not amend:** ADR-0041, ADR-0166 or ADR-0148 D9. (ADR-0168 later amends D1 and D3 below.) Levelling still never writes anything by
  itself; the planner presses a command, and what is written is a placement.
- **Spec:** [`docs/specs/apply-levelled-dates/`](../specs/apply-levelled-dates/feature-spec.md)
  (§4.9 is this ADR's outline). Register row: `docs/TECH_DEBT.md` #413 Q1 (c). Follow-ups: #426, #427.

## Context

With `levelResources` on, levelling draws a **ghost** where a resource would let a bar start
(ADR-0148 D9), and since ADR-0166 it measures from where each bar is drawn. A planner who agrees with
the ghosts had one way to act on them: drag every bar by hand. The product owner chose the ghost first
and an explicit command "later" (#413 Q1 (c)).

The obvious implementation, copying each ghost's date into `visualStart`, was measured wrong twice
(`docs/specs/apply-levelled-dates/m0-measurement.md`):

- **A part-day start puts the clash back (A3).** On an 08:00-16:00 week a 4-hour lift frees the crane at
  12:00; the 1-day lift's ghost reports `2026-01-05`, and writing that date places the bar at 08:00 on
  Monday. `levelingDelay` stays 240 minutes and `leveledActivityCount` stays 1. Writing `2026-01-06`
  leaves both 0.
- **Levelling reads no links (A5), so a ghost can start before its predecessor finishes.** Applying every
  ghost of the measured fixture solves to `visualConflictReason: 'EARLIER_THAN_LOGIC'` on the follower.
  A blind apply plants a logic conflict the planner did not ask for.

## Decision

**Applying levelled dates is a preview, a confirmation and one batch placement write, with the engine
as the oracle for what to write.**

- **D1 — a placement, moved like a drag (CQ-1 (a)).** A row writes `visualStart` and nothing else, what
  a drag onto the ghost writes (ADR-0134 as amended by ADR-0148). The constraint the activity already has
  is **round-tripped as stored**, because the batch row is a complete placement and would otherwise clear
  it; no `SNET` is written.
- **D2 — the target is the next working day on the activity's own calendar (CQ-4 (a)).** The earliest
  **working** date whose placement instant is at or after the levelled instant, read from the overlay's
  absolute instant and through `startDateInstant`, the reader `compute.ts` Pass 2 uses
  (`engine/apply-levelling.ts:104-119`; `engine/compute.ts:354-356`). The stored date therefore says
  what is drawn and nothing rests on Pass 2 rolling a weekend forward.
- **D3 — a target the links refuse is not written.** The engine solves a copy with every target
  written; a target it reports `EARLIER_THAN_LOGIC` is dropped and reported (`leftToLogic`, or
  `conflictingPlaced` for a bar with a placement of its own, which also names a placed bar a kept move
  pushes past its placement). The apply code holds no rule about links (`engine/apply-levelling.ts:156`,
  `:221`, `:250`).
- **D4 — one press is one step (CQ-2 (a), CQ-3 (a)).** Every move at once, one batch write, one undo
  entry (`apps/web/.../use-plan-workspace-model.ts:1048-1095`). What still clashes afterwards is
  `remainingAfterApply`, shown and not chased; the planner may press again.
- **D5 — the preview is refused if it has gone stale.** The route returns
  `computedFrom.scheduleComputedAt`. The client holds no copy of it, so on **Apply** the dialog
  **re-reads** the preview and, if the value differs from the list the planner checked, shows the new
  list instead of writing (`ApplyLevellingDialog.tsx:195-222`). The write still carries each row's
  `version`, so a change between the re-read and the write fails the batch with `409` and nothing moves.
- **D6 — no audit event.** The preview is classified `READ` and the write is the batch placement route,
  already `PLAN_CONTENT` (`audit-coverage.structural.spec.ts:252-256`, `:281`): each moved activity
  records who changed it and when, as a group drag does. This is the batch route's classification
  followed, not a new one.
- **D7 — no flag (ADR-0088 D1).** An operator cannot switch it off in a way that has rollback value;
  the rollback is the commit boundary. Entry point and journey per ADR-0081: the toolbar item
  **Apply levelled dates…** beside Arrange, pen-gated (ADR-0133 D5), driven end to end in
  `placement-overlays.spec.ts`.

### What it costs

Measured by `apps/api/scripts/measure-levelling-application.mts` on `scaleSpec({ activities: 2000 })`
(2,160 activities, 3,200 links), n = 50 after a warm-up (`m0-measurement.md`, "M1 — what the preview
costs"): the **preview is p50 about 0.63 to 0.65 s and p95 about 0.71 to 0.78 s** of engine work, about
three recalculations, and the solves are **counted, not inferred: 3** in both variants (the tentative
solve and the re-solve without dropped targets are separate runs). The harness is pure — no database,
HTTP or graph load — so these are engine-only figures on a shared sandbox: read the ratio, not the
milliseconds. **One apply costs two preview reads** (the dialog's fetch on opening and the re-read on
confirming, D5), so about six solves and roughly 1.3 s of engine work at p50 on a plan that size,
before the write and the recalculation it triggers. The route ships at 10 requests per 60 s
(`schedule.controller.ts:71-82`), a judgement a third under the M6 formula's 15, not a measurement; a
whole-request figure against a database is still owed.

## Alternatives considered

- **Pin with `SNET` at the levelled date (CQ-1 (b)).** Would carry the levelled dates into exports and
  push the critical path, but replaces any constraint the activity already holds, the defect ADR-0148
  removed, and turns levelling into logic. **Rejected.** Consequence: exports do not carry applied dates
  (A12).
- **Choose which bars (CQ-2 (b)).** Can be added later without changing D4. **Deferred.**
- **Loop until nothing clashes (CQ-3 (b)).** Bars can march much later than a planner expects, each round
  is two more engine passes, and the planner sees only the end. **Rejected.** The measured evidence
  cuts the other way on chain-heavy plans: 218 of 236 candidates are dropped by D3 and 236 clashes remain
  after one step, which is what a logic-aware levelling (#427) would fix, not a loop.
- **Store part-day start times (CQ-4 (b)).** Exact, but a schema change to how every placed bar is stored.
  **Rejected:** next working day, and the dialog says how many bars were rounded.
- **Drop the moves that break logic silently.** The planner would not know a bar was left; D3 reports each
  and its reason.
- **Write the moves in a server route that computes and writes in one transaction.** A second write path
  for `visual_start`, a new audit classification, and an undo rebuilt from its response. **Rejected** for
  preview-then-existing-write.
- **Trust the preview on confirm.** A recalculation by anybody else between opening and confirming makes
  the list on screen a different answer. **Rejected:** D5.
- **An audit event per apply.** Would be the only bulk placement that audits. **Rejected:** D6.
- **A `VITE_` flag.** D7.
- **Levelling applies itself on every recalculation.** Rejected by the product owner (#413 Q1 (b)) and by
  ADR-0148 D9.

## Consequences

- **Exports do not carry applied dates** (A12): a placement is SchedulePoint's, so P6 or Microsoft
  Project see the original dates.
- **Float left falls, and may go negative** (A11): the bar now sits where the resource frees, inside or
  past the room its logic had.
- **A chain-heavy plan applies little in one press** and reports the rest. Filed as `docs/TECH_DEBT.md`
  #426 (S1: the lens draws no ghost for a part-day start the count includes) and #427 (S2: the summary's
  levelled finish ignores followers); both stay open.
- **`api` and `web` each take a minor.** No schema change.
- **The catalogue gains `plan:capability-levelling-part-day`**, the part-day shape M0 found missing.

## References

- Spec, plan and measurement: [`docs/specs/apply-levelled-dates/`](../specs/apply-levelled-dates/feature-spec.md).
- ADR-0166, ADR-0148 (D9), ADR-0134, ADR-0041, ADR-0088, ADR-0081, ADR-0133, ADR-0048, ADR-0073.
- Route: `docs/API.md`, "`GET …/schedule/levelling-application`".

## Amendments

### Amendment (ADR-0168, 2026-10-01) — a follower follows, and the oracle finds nothing to drop

Levelling now moves the followers of a delayed activity (ADR-0168), which is the "logic-aware levelling
(#427)" the Alternatives above called for. Spec: [`docs/specs/logic-aware-levelling/`](../specs/logic-aware-levelling/feature-spec.md).

- **D1 (a placement, moved like a drag):** unchanged for a bar a resource delays. **An unplaced activity
  whose only move is the knock-on gets no row**, because a placement would detach it from its links. The
  preview names it in `followingLinks` and the dialog says it will follow the bars before it. **A
  hand-placed activity whose only move is the knock-on does get a row**, with `reason: 'LINKS'` (CQ-1 (a)),
  listed as "the work before it moved"; Undo puts it back. A row's `reason` is `'RESOURCE'` when its own
  resource delays it. A placed finish milestone gets a `LINKS` row dated on the day it closes.
- **D3 (a target the links refuse is not written):** unchanged and **kept as the oracle**: the engine
  still solves a copy and drops what it reports `EARLIER_THAN_LOGIC`. With the knock-on in the overlay it
  is expected to find nothing, and measured it found nothing: `leftToLogic` 8 and 218 to 0 and
  `remainingAfterApply` 0 and 236 to 0 on the scale plan at capacity 8 and 2. The preview therefore takes
  2 solves, not 3, when nothing is dropped. A non-empty `leftToLogic` is investigated, not accepted.
- **Cost:** the "What it costs" figures above are the pre-ADR-0168 ones. After it the preview is p50
  670.8 ms and p95 730.9 ms at capacity 8 (was 893.9 and 982.0) and p50 740.4 ms and p95 793.5 ms at
  capacity 2 (was 948.7 and 1,034.1), measured in `m0-measurement.md`, "M2 measurement record".
- **Follow-ups:** #426 and #427 are both closed. D2, D4 to D7 are unchanged.
