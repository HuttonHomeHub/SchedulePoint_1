# ADR-0126: A baseline freezes the plan's shape, or a comparison invents it

- **Status:** Accepted
- **Date:** 2026-09-06
- **Deciders:** Product owner, engineering

## Context

ADR-0125 shipped the revision delta — what entered and left the critical path between two computed
schedules, and how far the completion moved — and answered the first half of the question a planner
is asked in every progress meeting. It could not answer the other half a change list needs, and the
reason is one sentence: **a baseline freezes the engine's OUTPUT and almost none of its INPUT.**

`BaselineActivity` has always held identity, type, duration, the computed dates, float and
criticality. So eight change classes fall out of it with no migration at all — added, removed,
renamed, re-coded, re-typed, re-durationed, re-dated, criticality — and those shipped first, as
ADR-0125's change list.

Six do not. **Logic, constraints, calendar, WBS parent, lane and progress are inputs**, and none of
them was frozen. A comparison could therefore report that an activity moved and could not report
that somebody re-parented it, re-constrained it, put it on a different calendar, re-sequenced it or
started it. Those are the edits a planner is asked to account for, and the tool that exists to show
logic could not tell you the logic had changed.

There is a second, sharper problem, and it is the one this decision is really about. **Nothing in
the data can distinguish "this did not change" from "nobody recorded it".** An activity with no
constraint, no parent, no calendar of its own, in lane 0, at 0 %, not yet started is the commonest
activity in any plan — so every value a reader might test for absence has a legitimate null on a
fully recorded side. A comparison that reads those nulls finds real-looking differences that are
artefacts of the snapshot's absence rather than edits anybody made, and it presents them with
exactly as much confidence as a true one.

## Decision

### D1 — The snapshot is extended, and the extension is permanent for existing rows

`baseline_activities` gains ten nullable columns — `lane_index`, `parent_id`, `calendar_id`, the two
constraint pairs, `percent_complete`, `actual_start`, `actual_finish` — and a new
`baseline_dependencies` table freezes the whole graph: the dependency's own id and both endpoints as
plain correlation UUIDs, plus `type`, `lag_minutes`, `lag_calendar` and `is_driving`.

**No backfill is possible, ever, and that is stated rather than deferred.** Writing today's logic
into a historic snapshot would state as history a graph that baseline never saw. The product owner
was asked directly whether to ship an extension whose value is entirely prospective, and chose to
(CQ-1, 2026-09-06): the alternative is that it is still not recorded a year from now.

### D2 — The discriminator is a capture-level column, and it is the only answer

`baselines.revision_snapshot_level` is `NONE | FULL`, defaulting to `NONE`, and the capture path
writes `FULL` **unconditionally** — including for a plan with no logic at all.

That unconditional write is the load-bearing part. Zero edge rows on a `FULL` baseline means "there
genuinely were none, and this snapshot is complete". Zero edge rows on a `NONE` baseline means
nobody looked. **A row count cannot tell those apart; this column is the only thing that can**, so
it must never be conditional on there being something to count. This is `costSnapshotLevel`'s rule
(ADR-0071 M3) applied one column along, and the sibling comment in `createWithSnapshot` says so.

The classifier's `bothSnapshotted` is derived from it on every **frozen** side. The live side is
always recorded — it IS the plan's shape — so a live comparison turns on one baseline and a
baseline-vs-baseline comparison needs both.

### D3 — Not one of the ten columns carries a DEFAULT, and `lane_index` is the reason

`activities.lane_index` is `NOT NULL DEFAULT 0` and `activities.percent_complete` is
`NOT NULL DEFAULT 0`. Copying either shape into the snapshot is the trap: **lane 0 is a real lane
and 0 % is a real progress figure**, so a constant default would tell every baseline captured before
this migration that all its activities sat in the top row and none of them had started — a
confident, fabricated picture that a ghost layer would paint and a change list would report.

That is `budgetedExpense`'s "0 is a claim" (ADR-0071 M3) and ADR-0125's rejected
`is_critical DEFAULT false`, arriving in the one place where the live column genuinely is `NOT NULL`
and the temptation to mirror it is therefore strongest. The `hours_per_day_minutes DEFAULT 1440`
precedent licenses nothing here: that default was legal because 1440 was **true of every pre-existing
row**, and none of these values is knowable for any.

`BaselineDependency`'s four value columns take no default either, and there the guard is the
compiler: `CaptureDependencyRow` requires all four, so a capture path that forgot `type` will not
build. Without it, every frozen edge in the product would silently be Finish-to-Start, and a change
list reading that snapshot would report a finish-to-finish link as having been re-typed by somebody.

### D4 — Reported as not assessable with a reason, never as "no change"

A pair where either frozen side is `NONE` reports each of the six paid classes with
`notAssessableReason: 'NOT_SNAPSHOTTED'`, no rows, and no count. Not omitted — a reader who cannot
find a class concludes nothing changed in it — and **never zero**, because a zero is a claim about
the plan and nobody counted. The copy states it as permanent for those two revisions rather than as
a wait, because "check back later" is a promise the data model cannot keep.

The guarantee lives in `assess`, and that was **established by removing each candidate in turn and
running the suite**, not by reading: six cases go red without it. The filter that skips the paid
classes when the shape is absent is a saving, and its comment now says which is which — it had
claimed to be the guarantee.

### D5 — Correlation ids, no foreign keys

`parent_id`, `calendar_id` and all three ids on `baseline_dependencies` are plain UUIDs. This is
ADR-0025's copy-not-reference rule, and it is not theoretical: `calendars` is hard-deleted by the
ADR-0096 retention expiry when its project expires, and a snapshot holding a real FK would either
block that deletion or rot with it.

The consequence surfaces in the product and is stated there in words: a calendar deleted since
capture renders as **"A calendar that no longer exists"**, never as a UUID. That is an expected
outcome of the design, not a broken reference, and printing an id would read as a defect.

### D6 — Logic is diffed over edges, so a change row's subject is not always an activity

`RevisionChangeRow` gains `subjectId`. For every activity-subject class it equals `activityId`; for
a logic row it is the dependency's id — because **two changed links into one successor are two rows
with one `activityId`**, and a client keying on the activity would have rendered them as one.

Keying the diff on the dependency id is also what keeps an edge whose endpoints were both deleted to
a single "removed" row rather than one per endpoint, and an edge re-typed _and_ re-lagged to one row
naming both sides rather than two a reader would count as two edits.

A logic row's `activityId` — its reveal target — is the **successor**, because a link change decides
when the successor can start and that is what a planner opens the row to look at.

### D7 — `is_driving` is frozen and deliberately not compared

The column is captured, because a snapshot should be faithful. It is **omitted from the projection**
the classifier reads, not merely left uncompared, so a later contributor has nothing to reach for.

It is the engine's output, not a planner's edit: a link becomes driving because dates moved, which
the delta already reports. Comparing it would make "Logic changed" fire on every recalculation of an
untouched graph — the noise that made progress an opt-in class, arriving in the one class a planner
most needs to trust.

For the same reason, a **lag calendar counts only alongside a lag**. Switching the lag calendar of a
zero-lag link changes no date, and both sides would render an identical label — a row a reader would
read as a defect in the list rather than as a fact about the plan.

### D8 — Progress is opt-in to READ, and written on every capture

`?include=progress`, because on a monthly comparison nearly every activity has progressed and the
class would out-number the others combined, drowning the structural changes the list exists to
surface (CQ-3, product owner). **The columns are written regardless**: opt-in is a read-model
default, and a column added later is a column no existing baseline has, which is D1's permanence.

`percent_complete_type` and `physical_percent_complete` are deliberately NOT frozen — they carry the
earned-value _performance_ percentage, which changes no CPM date, and belong to a cost comparison
that is out of scope. Named rather than omitted, because D1's permanence applies to them too.

### D9 — `existsLive` is answered by the server, per row

Whether a change row's activity is in the live plan — and therefore whether a client may offer to
reveal it — is answered where the delta already answers it, from one `liveIds` set.

The client used to derive it from the delta's own rows. That was conservative while only the free
classes existed and becomes **false** with the paid ones: an activity moved to another lane,
re-parented or progressed enters and leaves nothing, so it is in no delta list at all. Inferring
"not in the live plan" from that absence puts a false sentence on screen about a bar the reader can
see — which is worse than a missing control, because it states something untrue rather than
withholding something true.

## Consequences

**The CPM engine is not imported and the ADR-0034 recalculation parity gate is untouched.** The
capture reads columns and writes columns; `computeSchedule` never sees `revision_snapshot_level`,
`lane_index` or a frozen edge, and the classifier is a pure function over two projections.

**A fourth child table now hangs off `baseline`, and adding it broke 557 of 587 API e2e tests at
once** on `baseline_dependencies_baseline_id_fkey`. That is the loud failure mode; the quiet one is
`hierarchy-expiry.runner.ts`, where the same omission catches, logs a permanent failure and retries
every hour forever. M4 gave that path a DMMF-derived census for exactly this reason. Thirteen
hand-maintained copies of the delete sweep are `docs/TECH_DEBT.md` #253.

**Two migrations shipped one release apart from the readers**, so the halves fail separately.

**The paid classes are dark on every baseline captured before 2026-09-06, permanently.** A planner
comparing two historic revisions sees six reasons and no rows, and the product says why. That is the
accepted cost of D1, and it is the whole argument for shipping the extension before anything needed
it rather than when something did.

## Alternatives considered

**A `DEFAULT 0` on `lane_index` and `percent_complete`**, mirroring the live columns. Rejected by D3:
it manufactures a picture of every historic baseline that no capture ever recorded.

**A per-row sentinel** — testing the columns themselves for "was this recorded?". Rejected because
every one of them has a legitimate null on a fully recorded side, so the test reads "no constraint"
as "never recorded" and back again. This is where ADR-0125's criticality precedent stops applying:
its four columns have no legitimate null, and these ten do.

**A backfill from the live plan.** Rejected outright: it would state as history a graph that
baseline never saw, which is a worse defect than the absence, because it is confident.

**Foreign keys on `parent_id` and `calendar_id`.** Rejected by D5 — ADR-0025's rule, with a live
counter-example in ADR-0096's hard delete.

**Comparing `is_driving`.** Rejected by D7: it would report every recalculation as a logic change.
