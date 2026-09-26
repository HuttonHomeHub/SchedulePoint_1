# Feature Spec: A cross-plan link produces the dates the same link would inside one plan

- **Status:** Draft
- **Author(s):** feature-analyst (for the product owner)
- **Date:** 2026-09-26
- **Tracking issue / epic:** [`docs/TECH_DEBT.md`](../../TECH_DEBT.md) #385
- **Roadmap link:** Inter-project scheduling (ADR-0043 / ADR-0045). A planner-visible date change, so
  it takes a roadmap line rather than an exemption.
- **Related ADR(s):** ADR-0045 (amended by this spec's proposed ADR-0161), ADR-0035 §30.5 (amended),
  ADR-0043, ADR-0036 §6, ADR-0037, ADR-0053, ADR-0068 §4, ADR-0148, ADR-0155, ADR-0139, ADR-0107

This spec exists because the fix reaches past the row that raised it. #385 describes one date rule
(a successor may start on its upstream's last day). Reading the code found five more ways the
cross-plan bound differs from the in-plan one (E5–E8, E17). One of them, the lag unit, is stored
data (E6). Changing stored data is a schema-class change, and that is an ADR-0105 trigger.

## 0. Evidence: what the brief claimed and what was checked

This spec was written without a shell. The environment had read and search tools only. So every
claim below was established by **reading**. None was run. M0 exists to turn the decision-bearing
ones into executable results before any product code changes (ADR-0076, CLAUDE.md §19.11). The
prediction table in §4.2 is written now so the M0 red run can disagree with it.

| #   | Claim                                                                                                              | Verdict                            | Established by                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | The derivation works in whole `YYYY-MM-DD` days. FS gives `predecessorPlacedFinish + lag`.                         | True                               | `cross-plan-derivation.ts:107-111` (`addDays` adds UTC calendar days), `:139-142` (FS).                                                                                                                                                                                                                                                                                                               |
| E2  | The engine reads a bare external early start as the **start** of that day, except for a finish milestone.          | True                               | `engine/constraints.ts:243-246`. A bare date parses to 00:00 (`working-time-calendar.ts:84-91`). A `FINISH_MILESTONE` goes through `finishMilestoneDateInstant`, which reads a bare date as the **end** of the day (`instants.ts:64-67`).                                                                                                                                                             |
| E3  | A persisted finish date means the end of that day; the in-plan FS bound is the predecessor's exclusive end.        | True                               | Dates are "inclusive display dates" (`engine/types.ts:244-251`); the placed finish is built from the inclusive finish (`compute.ts:945-947`). The in-plan forward pass holds `earlyFinish` as "the exclusive end boundary after its last working minute" (`compute.ts:172-174`), and FS returns that instant plus lag (`compute.ts:1013-1014`).                                                       |
| E4  | So FS lag 0 lets the successor start on the upstream's last day, and a test pins it.                               | True                               | `cross-plan-conformance.spec.ts:121-139`: upstream EF `2026-01-10`, FS+2, golden expects `2026-01-12`. The in-plan engine on the same 24/7 calendar gives `2026-01-13` (the end of the 10th is the 11th at 00:00, plus two days).                                                                                                                                                                     |
| E5  | **Suspected:** `lagDays` is documented as working days but `addDays` adds calendar days.                           | **True**                           | Documented as working days at `cross-plan-derivation.ts:31`, `:58` and the DTO (`create-cross-plan-dependency.dto.ts:39`); added as calendar days at `:107-111`. A lag spanning a weekend lands short.                                                                                                                                                                                                |
| E6  | **Not in the brief:** stored cross-plan lag is `lagDays × 1440` whatever the calendar.                             | True, and larger than E5           | Write: `cross-plan-dependencies.service.ts:31,178`. Read back as `/1440`: `schedule.service.ts:1523,1534`, `cross-plan-dependency-response.dto.ts:74`. The in-plan write converts on the lag calendar's hours-per-day (`dependencies.service.ts:271-296`, `lag-day-factor.ts:63-72`). So `cross_plan_dependencies.lag_minutes` is not working minutes, although `schema.prisma:1711-1715` says it is. |
| E7  | **Not in the brief:** the lag calendar is ignored by the derivation.                                               | True                               | Neither load selects `lagCalendar` (`cross-plan-dependency.repository.ts:211-216`, `:240-245`). The column exists (`schema.prisma:1716-1718`) and the create dialog offers it (`AddCrossPlanLinkDialog.tsx:337-357`). A `TWENTY_FOUR_HOUR` cross-plan lag behaves like `PROJECT_DEFAULT`.                                                                                                             |
| E8  | **Not in the brief:** FF/SF/SS-backward durations are `durationMinutes / 1440`, subtracted as calendar days.       | True                               | `schedule.service.ts:1508-1518` (the docblock says the fixed 1440 is deliberate); used at `cross-plan-derivation.ts:151,158,183,194`. The in-plan bounds walk the duration on the activity's own calendar (`compute.ts:1018-1022`, `:1044-1048`).                                                                                                                                                     |
| E9  | **Suspected:** the backward bound has the mirror overlap.                                                          | **True** (FS), and SS-backward too | FS backward returns `successorLateStart − lag` as a date (`cross-plan-derivation.ts:175-178`). For an activity with duration the engine reads a bare late finish as the **end** of that day (`constraints.ts:276-280`). So the upstream may finish at the end of the day the downstream must start. §4.2 lists the per-type table.                                                                    |
| E10 | The engine port can already accept an instant on the forward side.                                                 | True                               | `instants.ts:62`: "A date carrying a time of day is already an instant and is read as one." `toAbsMinutes` reads `YYYY-MM-DDTHH:MM` (`working-time-calendar.ts:84-91`). Both branches of `clampExternalForwardStart` go through it (`constraints.ts:243-246`).                                                                                                                                        |
| E11 | The backward side **cannot**, for an activity with duration.                                                       | True                               | That branch calls `nextCalendarDay` (`constraints.ts:276-280`), which calls `parseCalendarDate`. That splits on `-` (`calendar-date.ts:27-30`), so `2026-01-10T08:00` yields `Number('10T08:00')`, which is `NaN`. The finish-milestone branch (`:272-273`) and the zero-duration branch (`:274-275`) accept an instant.                                                                              |
| E12 | A midnight instant written by the existing formatter is misread for a finish milestone.                            | True                               | `absMinutesToInstant` drops `T00:00` (`working-time-calendar.ts:94-103`). A bare finish-milestone date then reads as the end of that day (`instants.ts:66`), one day late. On a 24-hour or full-day calendar every boundary is midnight, so this is the common case there.                                                                                                                            |
| E13 | The in-plan bound functions are private to `compute.ts`.                                                           | True                               | `forwardLowerBound`, `backwardUpperBound`, `applyLag` at `compute.ts:993-1059`; not exported.                                                                                                                                                                                                                                                                                                         |
| E14 | A plan with no cross-plan edge never reaches the derivation.                                                       | True                               | Guard at `schedule.service.ts:1488-1489`. With no derived entry, `toEngineActivity` passes the M1 columns formatted as bare dates (`:2673-2682`).                                                                                                                                                                                                                                                     |
| E15 | Persisted dates carry no time of day.                                                                              | True                               | `early_*`, `late_*` and `visual_effective_*` are `@db.Date` (`schema.prisma:1213-1216`, `:1300-1301`).                                                                                                                                                                                                                                                                                                |
| E16 | The org's stock calendar is a full-day Monday-to-Friday calendar.                                                  | True                               | `organizations.service.ts:83-95` (one `[0,1440)` shift per weekday), so its hours-per-day is 1440. E6 does not bite it. E5 (weekends) does.                                                                                                                                                                                                                                                           |
| E17 | **Not in the brief:** an LOE upstream drives a cross-plan successor; in-plan it never does.                        | True                               | In-plan skips LOE predecessors and successors (`compute.ts:205-207`, `:462-464`). The cross-plan path knows no activity type (no type field in `cross-plan-derivation.ts:27-63`; grep for `LEVEL_OF_EFFORT` in `modules/cross-plan-dependencies/`: no hits).                                                                                                                                          |
| E18 | **Not in the brief:** a cross-plan link may touch a WBS summary; in-plan that is refused.                          | True; out of scope here            | In-plan reject: `dependencies.service.ts:227`. No equivalent in the cross-plan service (same grep, no hits). A write-path rule, filed rather than folded (§1, Open questions).                                                                                                                                                                                                                        |
| E19 | Cross-plan feeds the upstream's **placed** dates into both engine passes; in-plan, placed dates reach Pass 2 only. | True; deliberate (ADR-0148 M-H)    | Load: `cross-plan-dependency.repository.ts:215`. In-plan Pass 1 reads early dates (`compute.ts:218-220`), Pass 2 placed ones (`:316-318`). The external start is used in both passes (`:242`, `:327`). §1 "What the decision does not settle".                                                                                                                                                        |
| E20 | The backward direction has no conformance coverage.                                                                | True                               | The adapter always passes `outgoing: []` (`conformance/cross-plan-adapter.ts:166-171`). Only the derivation unit suite covers it, against its own day arithmetic.                                                                                                                                                                                                                                     |
| E21 | The programme API e2e asserts no dates.                                                                            | True                               | `apps/api/test/programme-schedule.e2e-spec.ts:156-220` checks order, locks and staleness only.                                                                                                                                                                                                                                                                                                        |
| E22 | ADR-0155 recalculated stale plans once at boot, keyed on a migration's `finished_at`.                              | True                               | `finish-milestone-rederive.service.ts:60-78`. It orders by plan id (`:78`), not by the programme graph.                                                                                                                                                                                                                                                                                               |
| E23 | Re-encoding a lag to a smaller factor cannot breach the lag range CHECK.                                           | True                               | Hours-per-day is `BETWEEN 1 AND 1440` (`migrations/20260801120000_calendar_hours_per_day/migration.sql:22-24`), so `days × factor` is never larger in magnitude than `days × 1440`, which already passed the CHECK.                                                                                                                                                                                   |
| E24 | The debt row says a downstream plan "can move one day earlier".                                                    | True of ADR-0155, not of this fix  | `TECH_DEBT.md:11733-11734` describes ADR-0155's effect on an upstream finish milestone. This fix moves downstream plans **later** (and loosens nothing): see §1, Expected outcomes.                                                                                                                                                                                                                   |

**E6 and E7 matter most.** The brief framed the lag defect as calendar days versus working days.
The stored value itself is in the wrong unit on any calendar whose hours-per-day is not 1440, and
the planner's chosen lag calendar is never read. So "apply the lag in working days" is not a change
to the derivation alone. It is a change to what is stored.

## 1. Business understanding

### Problem

A programme is split across plans: procurement, engineering, construction, commissioning. A live
cross-plan link (ADR-0045) carries a finish-to-start or other tie from an activity in one plan to an
activity in another. The downstream plan's dates are derived from the upstream's persisted dates at
recalculation time.

That derivation is a second, simplified copy of the engine's link arithmetic, written in whole
calendar days. It disagrees with the engine in six ways:

1. **Day boundary (E1–E4, E9).** A finish date is read as the start of its day, so FS lets the
   downstream start on the upstream's last day. The backward bound has the mirror image.
2. **Lag walked in calendar days (E5).** A two-day lag from a Friday lands on Sunday, then rolls to
   Monday. In one plan it lands on Wednesday.
3. **Lag stored in the wrong unit (E6).** On an eight-hour calendar a one-day lag is stored as 1,440
   minutes and read back as one calendar day.
4. **Lag calendar ignored (E7).** A `TWENTY_FOUR_HOUR` cure lag across plans counts working days.
5. **Durations in calendar days (E8).** FF and SF subtract `round(minutes / 1440)` calendar days.
6. **LOE upstreams drive (E17).** In one plan an LOE never bounds a successor.

Every one of these makes a programme look healthier than it is: a downstream starts earlier, and an
upstream carries more float, than the same logic in one plan allows. A planner who splits a job into
plans gets a different, more optimistic programme than one who keeps it in one plan.

### Users

- **Planner** and **Org Admin**: they create cross-plan links (`dependency:link_cross_plan`) and run
  **Recalculate programme** (`schedule:calculate`). They see the corrected dates.
- **Contributor**, **Viewer**, **External Guest**: they read the dates. No permission changes.

### Primary use cases

1. A planner links an upstream finish to a downstream start with FS lag 0 and recalculates the
   programme. The downstream starts at the first working moment after the upstream finishes, as it
   would in one plan.
2. A planner sets a two-working-day lag across a weekend. It counts working days on the lag's
   calendar.
3. A planner sets a `TWENTY_FOUR_HOUR` lag for concrete cure across plans. It counts elapsed time.
4. An upstream plan's late dates are bounded by a downstream start, and the upstream is not allowed
   to finish on the day the downstream must start.

### User journeys

The journey does not change. A planner opens a plan with live cross-plan links, presses **Recalculate
programme** in the programme section, and reads the dates on the canvas, the Gantt and the status
bar. What changes is the dates. After the release, plans that carry cross-plan links are
recalculated once by the API (D8), so the first thing a planner sees is already corrected.

### Expected outcomes

- A cross-plan link and the same link inside one plan give the same dates, within the stated domain
  (§2, "Parity domain").
- In the common cases downstream plans move **later** and upstream plans lose float, by the amounts
  E1–E8 hid. Three kinds of case move the other way, and each is the in-plan behaviour: an LOE
  upstream stops driving (E17); a start-anchored link into a finish milestone, which today reads a
  day late; and a finish-anchored link out of a start milestone, which today is a day tight (§4.2).
- The stored cross-plan lag means the same thing as an in-plan lag: working minutes on the resolved
  lag calendar.

### Success criteria (committed before M0 measures anything)

These are falsification conditions. They are written now so the measurement cannot pick its own bar
(ADR-0058, ADR-0128's ordering).

- **FC-1, twin equality.** For every case in the parity matrix (§4.6), the cross-plan answer equals
  the in-plan answer **to the minute**. Forward: the successor's early-start instant. Backward: the
  derived external late-finish instant equals `backwardUpperBound` for the same edge in one plan.
  Zero tolerance. A single mismatch fails the milestone.
- **FC-2, red first, as predicted.** Against today's code, the matrix fails exactly on the cells
  §4.2 predicts and passes on the rest. **If the red run disagrees with the prediction in either
  direction, the work stops** and the disagreement is explained before anything is built. The
  prediction is a claim too.
- **FC-3, weekend golden.** Standard calendar (full-day, Mon–Fri), data date Mon `2026-01-05`,
  upstream 5-day task finishing Fri `2026-01-09`, FS lag 2 working days. Downstream early start is
  **Wed `2026-01-14`**. Today's code gives Mon `2026-01-12`.
- **FC-4, eight-hour lag golden.** Both plans on a Mon–Fri 08:00–16:00 calendar (hours-per-day
  480). Upstream finishes Tue `2026-01-06` 16:00. FS lag 1 working day, `PROJECT_DEFAULT`.
  Downstream early start is **Thu `2026-01-08`**. Today gives Wed `2026-01-07`. The fixed derivation
  **without** the lag migration gives Mon `2026-01-12` (1,440 stored minutes walked as three working
  days). Three outcomes, so this one case separates "fixed", "unfixed" and "half-fixed".
- **FC-5, parity.** `compute.spec.ts` (the Pass-1 golden suite), the ADR-0034 conformance matrix and
  every engine spec pass **unedited**. The only existing assertions that change are the inverted
  characterisations listed in the plan (M2-T5), each with its old and new value written before the
  run. Any other red test stops the work.
- **FC-6, cost.** On a fixture of 100 cross-plan edges from 10 upstream plans on 10 distinct
  calendars, the added time in `buildEngineGraph` is **at most 50 ms p95** over the M0 baseline.
  The number of queries on the cross-plan path does not grow with edge count (a counting stub, not a
  timing). The no-edge path issues exactly the queries it does today.
- **FC-7, migration exactness.** After the lag migration, every row reads back through the API with
  the same `lagDays` it had before. `TWENTY_FOUR_HOUR` rows and rows whose resolved factor is 1440
  are byte-unchanged. The reverse migration restores every row byte-for-byte.
- **FC-8, one re-derivation.** After the first boot on the release, every live, calculated plan
  with an active cross-plan edge and a `schedule_computed_at` before the migration's `finished_at`
  has been recalculated once, upstream-first. No plan is left `scheduleStale` that was not stale
  before. A second boot recalculates nothing.

### Open questions

**Critical (answers change the design or scope):**

- **CQ-1: Re-encode the stored lag, or convert on read?** (E6) _Default: re-encode._ A data
  migration rewrites `cross_plan_dependencies.lag_minutes` to working minutes on the resolved lag
  calendar, and the write path converts like the in-plan write does. The alternative converts
  `lag_minutes / 1440 × factor` at every recalculation and needs no migration. It is rejected
  because a lag converted on read changes whenever somebody edits the calendar's hours, while an
  in-plan lag does not (ADR-0068 converts once, on write). That would break the principle this
  whole spec implements. The cost of the default is a data migration and a rollback that is a
  reverse migration, not a redeploy (§4.4).
- **CQ-2: What does `PROJECT_DEFAULT` mean for a link between two plans?** The product owner's
  decision says "the calendar the in-plan engine uses", and in one plan that is the plan's own
  calendar (`compute.ts:999`). Across two plans there are two. _Default: the successor plan's
  calendar, in both directions._ The successor plan is the link's home (ADR-0045 CQ-2): it holds the
  link, guards it with its pen, and is the plan whose schedule the link bounds. The obvious
  alternative, "the plan being recalculated", would walk the forward bound on the successor's
  calendar and the backward bound on the predecessor's, so the two ends of one link would disagree
  about its lag.
- **CQ-3: Recalculate affected plans automatically, once, at boot?** _Default: yes_ (D8, the
  ADR-0155 D9 precedent). Without it, a plan whose upstream has not changed is not flagged stale,
  so it keeps the old, optimistic dates until someone happens to run a programme recalculation.
  The cost is that plans move without a planner pressing anything, as they did for ADR-0155.

**Assumed defaults (not blocking):**

- **LOE is in scope** (E17). An LOE upstream contributes no forward bound; an LOE downstream
  contributes no backward bound. It is one check, it is the in-plan rule, and the load that
  supplies the type is needed anyway.
- **WBS summary endpoints are out of scope** (E18). Refusing them is a write-path change with its own
  question (what happens to links that exist). Filed as a new debt row.
- **No `lagMinutes` on the cross-plan DTO.** ADR-0070 deferred it. This spec does not add API
  surface.
- **No `VITE_*` flag** (ADR-0088 D1). No web change at all is expected; M0-T5 confirms it.
- **The API contract keeps its shape.** `lagDays` still means working days, now honestly.

### What the decision does not settle

The product owner's rule is "a cross-plan link must produce the same dates as the same link would
inside one plan". Reading the code found three places where that cannot hold exactly, or where it
collides with an earlier decision. They are stated here so the agreement round decides them rather
than the build.

1. **Exact equality needs instants, and none are persisted** (E15). Upstream dates are stored as
   whole days. An upstream task that finishes at 12:00 is stored as that day, and the derivation can
   only read it as the end of that day's working time. So the cross-plan answer is **never earlier**
   than the in-plan one, and at most one upstream working day later, for a mid-day upstream finish.
   Sub-day durations are real (ADR-0070), so this is a live residual, not a hypothetical. Closing it
   needs instant columns written at every recalculation. That is a schema change on `activities`,
   and this spec defers it with a trigger: a planner reports a cross-plan successor starting later
   than the same link in one plan, or a sub-day upstream is seen on a programme. **The parity domain
   is therefore upstream activities that finish on a day boundary**, which is every activity with a
   whole-day duration.
2. **`PROJECT_DEFAULT` is ambiguous across two plans.** CQ-2.
3. **A hand-placed upstream behaves differently by design** (E19). In one plan, a hand-placed
   predecessor pushes its successor only in the effective-Visual pass; early dates, late dates and
   float ignore the placement. Across plans, ADR-0148 M-H chose the placed dates as the basis for
   both passes, on purpose ("an interface is about where the upstream work is planned to happen",
   `cross-plan-dependency.repository.ts:36-41`). This spec does not reopen ADR-0148. The parity
   domain is therefore **unplaced** upstreams, where placed and early dates agree. A placed upstream
   gets the corrected day rule and lag on its placed dates.

Two smaller residuals are recorded rather than fixed, because each needs state the derivation does
not have:

- **Progress-mode tie dropping.** In one plan, an in-progress successor under Progress Override or
  Actual Dates drops ties from incomplete predecessors (`compute.ts:212-216`). The external bound is
  applied regardless, as it is for a hand-entered M1 date today. Filed.
- **Expected-finish resizing.** The in-plan backward bound uses an expected-finish-resized duration
  when that option is on (`compute.ts:457-459`). The derivation can only use the stored duration.
  Option-gated, off by default. Filed.

## 2. Functional requirements

### User stories and acceptance criteria

> **US-1**: As a planner, I want a cross-plan FS link to start the downstream after the upstream
> finishes, so that a programme split into plans is not more optimistic than one plan.
>
> - **Given** an upstream task finishing Fri `2026-01-09` on the Standard calendar and an FS lag 0
>   link, **when** I recalculate the programme, **then** the downstream starts Mon `2026-01-12`,
>   exactly as the same link in one plan.
> - **Given** the same with an upstream **finish milestone** dated `2026-01-09`, **then** the same
>   result (ADR-0155: its date means the end of that day).

> **US-2**: As a planner, I want a cross-plan lag to count working time on the lag's calendar.
>
> - **Given** FS lag 2 working days from a Friday finish (FC-3), **then** Wednesday.
> - **Given** an eight-hour calendar and lag 1 working day (FC-4), **then** the next working day
>   after the one following the finish, as in one plan.
> - **Given** a `TWENTY_FOUR_HOUR` lag of 2 days from a Friday finish on the Standard calendar,
>   **then** Monday, as in one plan. Today's code also gives Monday, by accident (Sunday, rolled
>   forward). The case is there to fail a fix that walks working days and still ignores the lag
>   calendar (E7), which would give Wednesday.
> - **Given** a lead (negative lag), **then** it walks backwards on the same calendar.

> **US-3**: As a planner, I want the upstream's late dates bounded by a downstream start without an
> overlap day.
>
> - **Given** a downstream late start of Mon `2026-01-19` and FS lag 0, **when** I recalculate,
>   **then** the upstream's external late finish is the end of Fri `2026-01-16` on the Standard
>   calendar, not the end of Monday.

> **US-4**: As a planner, I want an LOE upstream not to drive a downstream plan, as it does not in
> one plan.

> **US-5**: As a planner, I want the dates I already have to be corrected without doing anything.
>
> - **Given** a plan with cross-plan links last calculated before the release, **when** the API
>   first boots on the release, **then** it is recalculated once, upstream plans before downstream
>   plans, and ends fresh (FC-8).

### Workflows

Forward, for each incoming cross-plan edge into this plan (successor here):

1. Skip if the upstream predecessor is an LOE, or if its placed dates are null (N32, counted as
   today).
2. Read the upstream anchor as an **instant** on the upstream activity's scheduling calendar: its
   placed start for SS/SF, its placed finish for FS/FF, by the date reader for its type (D3).
3. Resolve the lag calendar port (D5) and the lag in working minutes (D4).
4. Call the engine's own `forwardLowerBound` with the successor's calendar and duration (D2).
5. Take the latest bound per successor.

Backward, for each outgoing cross-plan edge out of this plan (predecessor here): the mirror, reading
the downstream successor's late start (FS/SS) or late finish (FF/SF) on its own calendar, skipping an
LOE successor, calling `backwardUpperBound` with the predecessor's calendar and duration, and taking
the earliest bound per predecessor.

Composition with the M1 hand-entered column (§30.5, unchanged in intent): compare as **instants** on
this activity's calendar, not as strings (D6). If the M1 value wins or ties, pass the M1 string
through verbatim. If the derived value wins, pass it as a timed instant string.

### Edge cases

| Case                                           | Expected behaviour                                                                                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upstream finish milestone                      | Its placed date means the end of that day (ADR-0155 D3); read with `finishMilestoneDateInstant`.                                                                     |
| Downstream finish milestone                    | Receives a timed instant, so it is not re-read as end-of-day (E12). A bare midnight string here would put it one day late; the formatter never writes one (D7).      |
| Start milestone or zero-duration task upstream | Its finish is its start instant, as in one plan (`constraints.ts:124-126`).                                                                                          |
| Upstream and downstream on different calendars | Anchor on the upstream's calendar, duration on the downstream's, lag on the resolved lag calendar: exactly the in-plan split.                                        |
| `RESOURCE_DEPENDENT` upstream                  | Its scheduling calendar is its driving resource's (`schedulingCalendarId`, `lag-day-factor.ts:34-55`). Loaded only when such an endpoint exists (the #86 cost rule). |
| Remote activity inherits its plan's calendar   | Resolve to **its own** plan's calendar, not this plan's. The inherit sentinel means "my plan", and there are two plans (the ADR-0139 lesson).                        |
| Upstream finishes mid-day (sub-day duration)   | Read as the end of that day. Never earlier than in-plan, at most one upstream working day later. Documented residual (§1).                                           |
| Derived start before this plan's data date     | Floored by the engine and counted N25, as today (`compute.ts:655-661`).                                                                                              |
| Upstream never calculated                      | N32: no bound, counted, as today.                                                                                                                                    |
| Downstream never calculated (backward)         | No bound, not counted, as today (`cross-plan-derivation.ts:239-247`).                                                                                                |
| Plan with no cross-plan edge                   | Untouched. The guard at `schedule.service.ts:1488-1489` still returns before any new code runs.                                                                      |
| `ignoreExternalRelationships` on               | The derived value is still computed and dropped by the engine, as today (§30.4).                                                                                     |
| Soft-deleted cross-plan link (lag migration)   | Re-encoded too, so a restore does not bring back the old unit. database-architect to confirm.                                                                        |

### Permissions

No change. Link create stays `dependency:link_cross_plan` with the successor plan's pen (ADR-0045
§6). Programme recalculation stays `schedule:calculate` with the pen on every plan it writes. The
boot re-derivation runs as the system, asserts no pen and is not audited, as ADR-0155 D9 does
(`schedule.service.ts:613-625`).

The widened loads read the remote endpoint's type, duration, calendar id and its plan's calendar id
and data date. All are in the same organisation (a cross-plan link is same-org by construction,
ADR-0045 §6), and the queries keep the `organizationId` filter.

### Validation rules

- `lagDays` stays an integer in −3650…3650 (`create-cross-plan-dependency.dto.ts:35-46`). It is
  converted to working minutes on the resolved lag calendar (D4). Minutes stay within the existing
  CHECK (E23).
- `lagCalendar` unchanged.

### Error scenarios

| Scenario                                       | Detection                  | Result                                                                | Status               |
| ---------------------------------------------- | -------------------------- | --------------------------------------------------------------------- | -------------------- |
| A remote calendar cannot be resolved (deleted) | `resolveCalendar` fallback | Falls back as the in-plan path does (`schedule.service.ts:1662-1667`) | 200, no error        |
| A plan fails during the boot re-derivation     | caught per plan            | Logged `schedule.xplan_rederive_plan_failed`; retried next boot       | none (boot proceeds) |
| Programme recalc on a peer-locked plan         | unchanged                  | 423 `PROGRAMME_PLANS_LOCKED`                                          | 423                  |

## 3. Technical analysis

| Area           | Impact | Notes                                                                                                                                                                                                                            |
| -------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend       | none   | No `apps/web` change expected. M0-T5 greps for any client-side cross-plan date arithmetic.                                                                                                                                       |
| Backend        | high   | `cross-plan-derivation.ts` rewritten on instants; `engine/` gains exported bound and date-reader modules (refactor) and one new clamp branch; `schedule.service.ts` builds richer inputs; one boot service.                      |
| Database       | medium | **A data migration** re-encoding `cross_plan_dependencies.lag_minutes` (CQ-1). No new column is needed for the arithmetic (E7: `lag_calendar` exists). database-architect decides whether conversions are recorded for reversal. |
| API            | low    | Shapes unchanged. The cross-plan write converts `lagDays` on the lag calendar; the response divides by the same factor. `docs/API.md` states both, and that dates across plans now match one plan.                               |
| Security       | low    | No new route or permission. Loads widen within one organisation.                                                                                                                                                                 |
| Performance    | low    | Cross-plan path only: wider includes, one conditional driving-calendar query, one `resolveCalendar` per distinct remote calendar. FC-6.                                                                                          |
| Infrastructure | none   | —                                                                                                                                                                                                                                |
| Observability  | low    | Boot re-derivation logs `schedule.xplan_rederived` with `pending`, `recalculated`, `durationMs` (the ADR-0155 shape), which also gives the deployed population.                                                                  |
| Testing        | high   | Parity matrix (conformance tier), goldens, unit suite rewrite, migration test, API e2e twin, boot re-derivation e2e.                                                                                                             |

### Dependencies

- ADR-0155 must stay as it is: the finish-milestone date readers are reused, not changed.
- `cross-plan-basis.structural.spec.ts` must pass unedited: field names `predecessorPlacedFinish`
  and `successorLateStart` stay, and the placed/late asymmetry stays (E19).
- The inverted characterisations in `cross-plan-conformance.spec.ts` and `cross-plan-derivation.spec.ts`
  change with the derivation (M2-T5).
- M2 and M3 ship in **one release**. Between them the plans are silently wrong, which is the thing
  M3 exists to prevent.

## 4. Solution design

### 4.1 Architecture overview

```mermaid
flowchart LR
  subgraph Engine["engine/ (pure)"]
    EB["edge-bounds.ts<br/>forwardLowerBound · backwardUpperBound · applyLag<br/>(moved out of compute.ts, exported)"]
    DR["instants.ts<br/>startDateInstant · finishDateInstant<br/>formatExternalInstant"]
    C["compute.ts"] --> EB
    K["constraints.ts<br/>resolvePair · external clamps"] --> DR
    C --> K
  end
  subgraph Service["schedule module"]
    S["schedule.service.ts<br/>buildEngineGraph"] -->|"edges + ports + remote anchors"| D["cross-plan-derivation.ts<br/>(instant-based)"]
    D --> EB
    D --> DR
    S -->|"EngineActivity.externalEarlyStart / LateFinish<br/>(M1 verbatim, or timed instant)"| C
    R["cross-plan-rederive.service.ts<br/>(boot, once)"] --> S
  end
  REPO["cross-plan-dependency.repository.ts<br/>(+ lagCalendar, remote type/duration/calendar,<br/>remote plan calendar + data date)"] --> S
  W["cross-plan-dependencies.service.ts<br/>(lagDays → minutes on the lag calendar)"] --> DB[("cross_plan_dependencies")]
  REPO --> DB
```

**One rule, not two.** The derivation calls the engine's own bound functions and the engine's own
date readers. There is no second copy of the link arithmetic to drift (the ADR-0065 `routeOrthogonal`
argument, the ADR-0139 two-maps argument). What the derivation owns is only what the engine cannot
know: where the remote anchor is, and which calendar each end is on.

### 4.2 Why the defect has the shape it has (the prediction for FC-2)

A persisted date means the start of its day or the end of it depending on **which end** it is and
**which type** reads it. The old code turned every one of them into a bare date and handed it to a
reader that picks start or end by the type of the activity in _this_ plan. So the error depends on
the link type, on this plan's activity type, and on which boundary the anchor was. Instants make
all of that disappear.

Prediction on a 24-hour calendar, lag 0, whole-day tasks unless noted. "Early" means the cross-plan
bound is earlier than in one plan (optimistic start); "loose" means a later late finish (float
overstated).

| Direction | Type | This plan's activity is a task | …is a finish milestone | …is a start milestone |
| --------- | ---- | ------------------------------ | ---------------------- | --------------------- |
| Forward   | FS   | 1 day early                    | equal                  | 1 day early           |
| Forward   | SS   | equal                          | 1 day late             | equal                 |
| Forward   | FF   | 1 day early                    | equal                  | 1 day early           |
| Forward   | SF   | equal                          | 1 day late             | equal                 |
| Backward  | FS   | 1 day loose                    | 1 day loose            | equal                 |
| Backward  | SS   | 1 day loose                    | 1 day loose            | equal                 |
| Backward  | FF   | equal                          | equal                  | 1 day tight           |
| Backward  | SF   | equal                          | equal                  | 1 day tight           |

On a Mon–Fri calendar, add the weekend error (E5) to any case whose lag or duration spans a weekend.
On a calendar whose hours-per-day is not 1440, add E6 and E8. On a `TWENTY_FOUR_HOUR` or
`PREDECESSOR`/`SUCCESSOR` lag calendar that differs from the plan's, add E7.

Two cells are worth naming: today's code is **late**, not early, for a start-anchored link into a
finish milestone, and **tight** for a finish-anchored link out of a start milestone. The fix
therefore does not only move dates later. Those cells are rare (a milestone at the end of a
cross-plan start tie), and M0-T2 counts them on the seed catalogue.

### 4.3 Data flow

```mermaid
sequenceDiagram
  participant P as Planner
  participant API as Programme recalc
  participant S as buildEngineGraph (downstream plan)
  participant R as repository
  participant D as deriveExternalInstants
  participant E as computeSchedule
  P->>API: Recalculate programme
  API->>API: upstream plans first (unchanged, ADR-0045 §4)
  API->>S: recalculate downstream plan
  S->>R: countActiveForPlan
  alt no cross-plan edge
    R-->>S: 0
    S->>E: M1 columns as today (byte-identical)
  else edges
    R-->>S: edges + lagCalendar + remote type/duration/calendar/plan calendar/data date
    S->>S: resolve remote calendar ports (once per distinct id)
    S->>D: edges, ports, M1 columns, local types/durations
    D->>D: anchor instant (date reader) → lag (edge-bounds) → bound
    D->>D: compose with M1 as instants; winner keeps its own form
    D-->>S: externalEarlyStart / externalLateFinish
    S->>E: engine input (timed instant or M1 string)
  end
  E-->>S: results
```

### 4.4 Database changes (CQ-1): a data migration, no new column

**Reviewed by database-architect before it is written, without exception** (CLAUDE.md §19.3). This
section is the input to that review, not its output.

- **Re-encode** `cross_plan_dependencies.lag_minutes` from `lagDays × 1440` to
  `lagDays × factor(resolved lag calendar)`, where `lagDays = lag_minutes / 1440`. Exact, because the
  DTO only ever accepted whole days (`@IsInt`, `create-cross-plan-dependency.dto.ts:43`), so every
  stored value is a multiple of 1440. database-architect confirms no row violates that.
- **Resolved lag calendar** per row, mirroring `lagCalendarIdFor` (`lag-day-factor.ts:34-55`) with
  the two-plan rule (CQ-2):
  - `TWENTY_FOUR_HOUR`: 1440, row unchanged.
  - `PROJECT_DEFAULT`: the successor plan's `calendar_id`.
  - `PREDECESSOR` / `SUCCESSOR`: that activity's scheduling calendar: driving resource's for a
    `RESOURCE_DEPENDENT` activity with a driver, else the activity's own, else **its own plan's**.
  - A null calendar id: `DEFAULT_HOURS_PER_DAY_MINUTES` (`lag-day-factor.ts:69`).
- **Soft-deleted rows are converted too** (a restore must not revive the old unit).
- **The CHECK cannot fail** (E23).
- **Reversal.** A redeploy of the previous image after the migration would read working minutes as
  `× 1440` days and write new rows in the old unit, mixing encodings in one column (the ADR-0107
  hazard). So the rollback is a reverse migration, as for ADR-0155. database-architect decides
  whether the conversions are recorded in a table (the `placement_migrations` precedent, ADR-0148)
  or recomputed, given that a calendar's hours may change between the two.
- **Marker.** The migration's `finished_at` is the boot re-derivation's marker (D8), so no date is
  written into code.
- `schema.prisma:1711-1715`'s comment ("working-MINUTE lag") becomes true; the `DATABASE.md` entry
  records the change.

### 4.5 API changes

None to shapes or routes.

- `POST …/cross-plan-dependencies` converts `lagDays` with the lag calendar's factor (a cross-plan
  `resolveLagDayFactorMinutes` context carrying **each endpoint's own plan calendar**, D5).
- The response's `lagDays` divides by the same factor (the in-plan `attachLagDayFactors` shape),
  so a stored lag reads back as the days the planner typed.
- The DTO description at `create-cross-plan-dependency.dto.ts:54` ("PREDECESSOR/SUCCESSOR coincide
  with the plan calendar until per-activity calendars land") has been stale since ADR-0037, and is
  corrected.
- `docs/API.md` says that cross-plan dates now match one plan, and names the residuals.

### 4.6 Component changes

None.

### 4.7 Implementation approach and alternatives

**D1: instants across the seam, not dates.** The derivation computes every bound as an absolute
working instant, the engine's own frame (ADR-0037). The engine port already accepts an instant on
the forward side (E10). The backward side gains one branch (D7).

**D2: the derivation calls the engine's bound functions.** `forwardLowerBound`, `backwardUpperBound`
and `applyLag` move from `compute.ts` into `engine/edge-bounds.ts`, exported through the engine
barrel, byte-for-byte. `compute.ts` imports them. The golden suite passing unedited is the proof
the move changed nothing (the ADR-0078 barrel-preserving oracle).

The cost is stated rather than hidden: a defect in a shared function would appear in both the
cross-plan answer and its in-plan twin, so the twin comparison cannot catch it. The in-plan golden
suite and the hand-computed goldens FC-3 and FC-4 are the independent oracle. That is why the plan
keeps both.

**D3: one pair of date readers, used by the engine and the derivation.** `constraints.ts` already
reads a date as a start or a finish instant, in two places: `resolvePair` (`:108-133`) and
`clampExternalBackwardFinish` (`:271-280`). They are extracted into `instants.ts`:

- `startDateInstant(cal, date, type)`: a finish milestone reads its date as the end of that day
  (`finishMilestoneDateInstant`); every other type reads the start of the day's working time.
- `finishDateInstant(cal, anchorAbs, date, type, durationMinutes)`: a finish milestone as above; a
  zero-duration activity reads its start; everything else reads the end of that day's working time.

Both constraint call sites and the derivation use them. Engine output is unchanged, pinned by FC-5.
This was not in the brief; it is the same one-rule argument as D2, one layer down.

**D4: lag in working minutes on the resolved lag calendar.** The stored value becomes honest (CQ-1)
and is passed unchanged as `EngineEdge.lagMinutes`.

**D5: every lag calendar resolves to an explicit port.** The derivation never relies on
`applyLag`'s `?? planCalendar` fallback (`compute.ts:999`), because "the plan" is two plans.
`PROJECT_DEFAULT` resolves to the successor plan's calendar in both directions (CQ-2).
`PREDECESSOR` and `SUCCESSOR` resolve to that endpoint's scheduling calendar, inheriting from **its
own** plan. `TWENTY_FOUR_HOUR` resolves to `allMinutesWorkCalendar`.

**D6: compose with the M1 column as instants, and keep the winner's own form.** String comparison
is wrong once a timed value meets a bare one: a bare finish-milestone date means the end of the
day, so `2026-01-12` is later than `2026-01-12T10:00` and sorts earlier. So the M1 column is read
with the D3 reader on this activity's calendar, the later (forward) or tighter (backward) instant
wins, and **an M1 winner is passed through as its original bare string**. That keeps the engine
input byte-identical for every activity whose M1 date already wins, including the N25 warning count,
which compares strings (`compute.ts:655-661`).

**D7: one formatter, and the backward clamp reads a timed value as an instant.**
`formatExternalInstant(abs)` always writes `YYYY-MM-DDTHH:MM`, including `T00:00`, because
`absMinutesToInstant` drops it (E12). In `clampExternalBackwardFinish`, a value longer than ten
characters is used as the instant itself for every type, mirroring the rule at `instants.ts:62`.
No persisted column can produce such a value (M1 columns are formatted as bare dates,
`schedule.service.ts:2673-2682`), so the new branch is reachable only from the derivation. The same
rule means the forward clamp needs no change (E10).

**D8: recalculate the affected plans once, at boot (CQ-3).** A `CrossPlanRederiveService`, beside
and shaped like `FinishMilestoneRederiveService`:

- **Which plans.** Live, with a data date, with at least one active cross-plan edge in either
  direction, and `schedule_computed_at` earlier than the lag migration's `finished_at`.
- **In what order.** Topologically over the organisation's plan graph (`loadOrgAdjacency`,
  `cross-plan-dependency.repository.ts:168-176`; the DAG is guaranteed by ADR-0045 §3), ties by plan
  id. Unlike the finish-milestone service's id order (E22), this matters here: a downstream
  recalculated before its upstream would read old upstream dates and end stale.
- **How.** `recalculateAsSystem` per plan (`schedule.service.ts:620-625`): no pen, the plan
  advisory lock, not audited, never awaited, never fails the boot. One plan's failure is logged and
  retried next boot.
- **Why not leave it to the next programme recalculation.** Staleness is computed from upstream
  `schedule_computed_at` (ADR-0045 §5). Nothing about this release changes that, so an affected plan
  is **not** flagged stale and keeps its optimistic dates indefinitely. That is the same argument
  ADR-0155 D9 made, and here the error is in the direction that hides risk.
- **Backward bounds converge one pass behind**, as they do in every programme recalculation: an
  upstream recalculated first reads its downstream's previous late dates. This is ADR-0045 §4's
  accepted property, not something D8 introduces.

**Alternatives considered:**

| Option                                                                              | Verdict         | Reason                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patch the dates: `+1` day on finish anchors, weekday-aware `addDays`                | Rejected        | It fixes the table in §4.2 one cell at a time and still misses the type-dependent cells, the lag unit (E6), the lag calendar (E7) and durations (E8). It is a second copy of the engine's arithmetic, which is how the defect happened.                                                                                                                                                   |
| Instants across the seam, derivation re-implements the bound arithmetic             | Rejected        | Correct today and a second copy tomorrow. The next lag or calendar rule in `compute.ts` would reach one plan and not a programme, invisibly.                                                                                                                                                                                                                                              |
| A numeric engine field (`externalEarlyStartAbs?: number`) instead of a timed string | Rejected, close | It removes the string traps (E12, D6) by construction, and the later-of could move into the engine's existing `max`. But it widens the pure engine's input for a concept it already has an input for, and ADR-0045 §2's decision was to reuse the M1 seam. The traps are closed by one formatter and one comparison, both pinned by tests (M1-T4). Reopen if a third string trap appears. |
| Persist instants and derive from them                                               | Deferred        | The only way to exact parity for mid-day upstreams (§1). A schema change on `activities` written by every recalculation. Trigger recorded in §1.                                                                                                                                                                                                                                          |
| Convert the lag on read instead of migrating (CQ-1)                                 | Rejected        | The lag would change when a calendar's hours change, which an in-plan lag does not (ADR-0068 §4).                                                                                                                                                                                                                                                                                         |
| Leave affected plans to the next programme recalculation (CQ-3)                     | Rejected        | They are not flagged stale, so "next" may be never.                                                                                                                                                                                                                                                                                                                                       |

### 4.8 Parity statement

**None of the three existing sentences applies, and saying which one would be wrong.**

- **ADR-0125 D1** ("`computeSchedule` is not called, imported or reachable") is false here: the
  engine is called on every recalculation.
- **ADR-0116 D7** ("computes read-only, persists nothing") is false: recalculation writes.
- **ADR-0139** ("the engine's arguments are byte-identical and the change is entirely in the
  conversion applied after it returns") is false: this changes the engine's **input** for linked
  plans, and makes a small engine change.

**The honest sentence has two parts:**

1. **For every plan with no active cross-plan edge, the engine's input is byte-identical** (the
   ADR-0045 §2 sentence, which still holds). The guard at `schedule.service.ts:1488-1489` returns
   before any new code runs, and `toEngineActivity` passes the M1 columns as it does today.
2. **The engine's code changes are a move plus one branch no existing input can reach.** D2 and D3
   move functions without editing them. D7 adds a branch taken only by a timed external string, and
   no persisted column produces one. So `computeSchedule` gives byte-identical output for every
   input any existing caller can build.

**How it is pinned:** `compute.spec.ts` and the ADR-0034 conformance matrix pass unedited (FC-5); a
structural test asserts the timed branch's only producer is `formatExternalInstant` and its only
caller is the derivation (M1-T4); and the existing no-edge service test asserts the derivation is
never invoked when `countActiveForPlan` is 0.

For plans **with** cross-plan edges the output changes deliberately. That is the point.

### 4.9 ADR outline: ADR-0161

**Title:** _A cross-plan link is the same link in one plan._

- **Amends:** ADR-0045 §2 (the derivation reuses the engine's bound functions on instants; lag is
  stored in working minutes; `PROJECT_DEFAULT` means the successor plan's calendar); ADR-0035 §30.5
  (the derived bound is an instant computed exactly as the in-plan bound, and an LOE never
  contributes one). **Notes against:** ADR-0043 (an external value may carry a time and is then an
  instant, in both directions), ADR-0068 §4 (cross-plan lags now convert on write), ADR-0148 (the
  placed basis stays), ADR-0155 (its date readers are reused, not changed).
- **Context:** E1–E9 and E17; the prediction table in §4.2.
- **Decision:** D1–D8; CQ-1–CQ-3 as answered.
- **Parity:** §4.8, in those words.
- **Consequences:** downstream plans move later and upstreams lose float; a few type-dependent
  cells move earlier (§4.2); plans with LOE upstreams move earlier; affected plans recalculate once
  at boot; rollback is a reverse migration; the sub-day, placed-upstream, progress-mode and
  expected-finish residuals are named; summary endpoints filed.
- **Registers:** CLAUDE.md §16 entry, `docs/adr/README.md` row, `docs/ROADMAP.md` line (a
  planner-visible change), or `check:adr-coverage` refuses the commit (ADR-0147).

### 4.10 User flow

```mermaid
flowchart TD
  A[Release deployed] --> B[API boots]
  B --> C{plans with cross-plan links computed before the migration?}
  C -- yes --> D[recalculate each once, upstream-first, as the system]
  C -- no --> E[nothing]
  D --> F[Planner opens a linked plan: corrected dates, not stale]
  E --> F
  F --> G[Planner edits upstream, presses Recalculate programme]
  G --> H[Downstream dates match the same link in one plan]
```

## 5. Links

- Implementation plan: [./implementation-plan.md](./implementation-plan.md)
- ADRs amended: [ADR-0045](../../adr/0045-live-cross-plan-programme-scheduling.md),
  [ADR-0035 §30.5](../../adr/0035-schedulepoint-cpm-semantics.md)
- Originating question: [`docs/specs/finish-milestone-date/spec.md`](../finish-milestone-date/spec.md) Q4
- Docs this change updates: `docs/API.md`, `docs/DATABASE.md`, `docs/DEPLOYMENT.md` (rollback past
  the lag migration), `docs/TECH_DEBT.md` (#385 closed; new rows for summary endpoints, progress-mode
  ties, expected-finish resizing, persisted instants), the derivation and adapter docblocks, the
  ADR registers.
