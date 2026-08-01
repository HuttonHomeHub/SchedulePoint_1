# Calendar hours-per-day — schema design

Status: **design only**. No migration written; no code outside `docs/` touched.
Scope: the storage half of the product owner's decision that a calendar carries an
hours-per-day, so `durationDays × hoursPerDay × 60` replaces `durationDays × 1440`.

Every claim below is cited to `file:line` as read on 2026-08-01. Where the brief that
commissioned this design asserted something the code does not support, it is corrected
in [§0](#0-corrections-to-the-brief) rather than carried forward (ADR-0058: verify the
claim; do not trust the document).

---

## 0. Corrections to the brief

Five assertions in the commissioning brief are wrong or incomplete. Three of them change
the design.

**0.1 — `day_hr_cnt` is not "parsed and discarded."** `packages/interchange/src/xer-adapter.ts:398`
reads it and passes it to `fallbackWorkWeek(hoursPerDay)`
(`packages/interchange/src/xer-calendar.ts:222-234`), which synthesises a Mon–Fri `08:00 → 08:00+N`
week when `clndr_data` is unreadable, and reports an approximation finding
(`xer-adapter.ts:406-412`). So P6's hours-per-day already reaches shift rows on the fallback path —
it just has nowhere to be _stored_. Consequence for this design: the importer gains a real
destination for the value on **every** calendar, not only the fallback, and the ADR-0050
mapping-contract row for `day_hr_cnt` changes from "approximated" to "mapped."

**0.2 — `schedule.repository.ts:597,599,616` is not a read seam. It is the recalculation's write.**
`total_float`, `free_float` and `visual_drift_days` are persisted **in days**
(`apps/api/prisma/schema.prisma:949,962,1035`), converted from engine minutes at
`apps/api/src/modules/schedule/schedule.repository.ts:597,599,616` inside the batched engine-owned
`unnest` UPDATE. Changing the day factor therefore changes what a recalculation **stores**, not just
what a mapper renders. The ADR-0034 parity gate compares `computeSchedule` output (minutes) and is
genuinely untouched; any API-level or golden snapshot asserting `totalFloat` in days will move.

**0.3 — the claim "purely a write-seam and read-seam conversion" is false for cross-plan plans.**
`apps/api/src/modules/schedule/schedule.service.ts:862-886` builds `durationDaysByActivity` and
per-edge `lagDays` by ÷1440 and feeds them to `deriveExternalInstants`
(`apps/api/src/modules/schedule/cross-plan-derivation.ts:211,225`), whose `addDays`
(`cross-plan-derivation.ts:95-99`) adds **calendar** days, and whose output becomes the engine's
`externalEarlyStart`/`externalLateFinish` **input** (ADR-0045). On a plan carrying cross-plan edges,
changing the day factor changes engine input and therefore computed dates. See [§2.2](#22-the-two-
exceptions) — this needs an explicit decision and is the single largest risk in the change.

**0.4 — the seam list is incomplete.** Beyond the eight sites listed, the ×1440 factor also appears at
`apps/api/src/modules/activities/activities.service.ts:850` (`remainingDurationDays` write),
`apps/api/src/modules/dependencies/dependencies.service.ts:198,239` (`lagDays` write),
`apps/api/src/modules/cross-plan-dependencies/cross-plan-dependencies.service.ts:178` (`lagDays`
write), `apps/api/src/modules/schedule/schedule.service.ts:543` (`floatPaths.relativeFloat` read) and
`apps/web/src/features/resources/schemas/duration-triad.ts:70` (`formatDurationDays`, client-side).
Full inventory in [§3.4](#34-full-seam-inventory).

**0.5 — a stale comment that would mislead the next reader.**
`apps/api/src/modules/calendars/dto/calendar-response.dto.ts:88-91` states "richer shift calendars
aren't API-authorable yet — M1 follow-on." They are: `create-calendar.dto.ts:78` and
`update-calendar.dto.ts:70` both accept `shifts`. That comment is exactly what someone would trust
when deciding whether the 08:00–17:00 case is reachable, and it says it is not. Fix it in the same PR.

---

## 1. Column shape — recommendation

**Neither of the two options in the brief. Recommend a third: `hours_per_day_minutes INTEGER NOT NULL
DEFAULT 1440`, with the derivation moved out of the read path and into the _authoring_ seam.**

### 1.1 Why not nullable-and-derive

The nullable proposal is right about the outcome it wants (byte-identical today, correct for a newly
authored 08:00–17:00 calendar, no backfill) and wrong about the mechanism, for one reason:

> A standing derivation makes the day↔minute factor **a function of the weekly pattern**, so editing
> one shift row silently reinterprets the stored duration of every activity on that calendar.

A planner who shortens Friday to a half day has not touched any activity, holds no pen on any plan,
and gets no recalculation — yet every duration measured on that calendar now reads differently, and
if the modal tie-break flips, they read differently by a step nobody chose. That is a worse trap than
the one the nullability was introduced to avoid, because the forgetful-author trap is visible at the
moment of authoring and this one is invisible forever after.

The two sub-questions the brief asked are the symptom, and they have no good answers:

- **9h Mon–Thu, 5h Fri.** Modal → 540 min (9h). Arithmetic mean over working days → 492 min (8.2h).
  Max → 540. Total ÷ 5 weekdays → 492. All four are defensible; P6 users would type 9. There is no
  rule that is _derivable_ rather than _chosen_.
- **A tie.** Two 9h days and two 7h days — modal is undefined and needs an arbitrary tie-break that
  is invisible in the data and changes the meaning of every existing duration when a shift edit
  moves the tie.
- **A window-only calendar** (all weekdays empty; work comes only from positive exceptions — valid
  and documented at `apps/api/prisma/schema.prisma:1415-1420`, reachable since TECH_DEBT #79 and
  named at `apps/api/src/modules/schedule/plan-calendar.ts:83-88`). Every candidate derivation yields
  **0**. `durationDays × 0 × 60 = 0`, so every duration on that calendar becomes a zero-minute
  activity — a silent, dates-moving corruption produced by a divide-by-zero the derivation cannot see.
  The nullable-derive design has no answer here that is not "fall back to 24h", which is a stored
  lie dressed as a derivation.

### 1.2 What is recommended instead

`hours_per_day_minutes INTEGER NOT NULL DEFAULT 1440`, and the calendar **service** sets it when the
weekly pattern is written:

- Explicit client `hoursPerDay`/`hoursPerDayMinutes` always wins.
- When `shifts` are supplied and no explicit value is, the service derives **once, at that write**,
  and stores the result. `create-calendar.dto.ts:78` / `update-calendar.dto.ts:70` are the only two
  entry points, plus the interchange batch at `calendar.repository.ts:260`.
- When only `workingWeekdays` is supplied (the mask path, `calendar.repository.ts:167`), the pattern
  is full-day by construction (`WorkingWeekdays.toFullDayShifts`, `packages/types/src/index.ts:909`)
  and the derivation yields 1440 — the default — so nothing changes.
- A window-only calendar keeps the 1440 default and the service returns a **finding/warning**, not a
  silent zero. Hours-per-day for a calendar with no base week is genuinely unknowable; saying so is
  the honest behaviour and it costs nothing, because a window-only calendar's durations were already
  being measured against 1440 today.

This gets every property the nullable option wanted:

| Property                                           | nullable+derive                  | NOT NULL DEFAULT 24     | **derive-at-write, stored**    |
| -------------------------------------------------- | -------------------------------- | ----------------------- | ------------------------------ |
| Existing rows byte-identical, no backfill          | yes                              | yes                     | **yes**                        |
| New 08:00–17:00 calendar right first time          | yes                              | **no** (the 2.67× trap) | **yes**                        |
| Window-only calendar safe                          | **no** (÷0)                      | yes                     | **yes**                        |
| A shift edit cannot silently reinterpret durations | **no**                           | yes                     | **yes**                        |
| Derivation rule has to be defensible               | **yes, and it is not**           | n/a                     | it is a _default_, overridable |
| Round-trips P6 `day_hr_cnt`                        | lossy (NULL has no source value) | yes                     | **yes**                        |

The residual hazard is the mirror of the brief's: a planner converts an existing full-day calendar to
08:00–17:00 and the column stays at 1440. That is precisely why the derive-at-write rule above is
mandatory rather than a nicety — the service must co-write the factor whenever it writes shifts. It
is one rule at two call sites, not a standing dependency between two tables' meanings.

### 1.3 Type and precision — minutes, integer

**`Int` (`INTEGER`), named `hours_per_day_minutes`.** Not `Decimal(4,2)`.

The decisive reason is that this column sits in a **write** path that determines stored minutes and
therefore dates. `durationDays × hours_per_day_minutes` is exactly integral for any input; hours as
`Decimal(4,2)` is not — `7.33 h × 60 = 439.8 min` needs a rounding step, and a rounding step in a
date-determining write is a defect waiting for a support ticket. 7.5h is 450 minutes exactly, so the
fractional case P6 actually cares about is covered without a decimal at all. `Int` rather than
`SmallInt` matches `duration_minutes` (`schema.prisma:779`) and `lag_minutes` (`schema.prisma:1221`)
— the arithmetic operands should share a type, and the 2-byte saving on a table with a few hundred
rows is not a reason.

The **API** field stays hours, for P6 familiarity and XER round-trip. Expose **both**, exactly as
`ActivityResponseDto` already exposes `durationDays` and `durationMinutes` side by side
(`apps/api/src/modules/activities/dto/activity-response.dto.ts:384-385`) and for the identical
reason stated there — "minutes so a sub-day value survives the round trip instead of reading back
rounded":

```
hoursPerDay: number         // 7.5 — may be fractional; derived, never stored
hoursPerDayMinutes: number  // 450 — the stored truth
```

### 1.4 Bounds

`> 0` and `<= 24h`, as a raw-SQL CHECK. `NOT NULL` means no `IS NULL OR` guard is needed (contrast
`ck_resources_max_units_per_hour_nonneg`, which needs one:
`apps/api/prisma/migrations/20260717040000_m7_resource_levelling_schema/migration.sql:92`).

```sql
ALTER TABLE "calendars" ADD CONSTRAINT "ck_calendars_hours_per_day_minutes_range"
  CHECK ("hours_per_day_minutes" BETWEEN 1 AND 1440) NOT VALID;
ALTER TABLE "calendars" VALIDATE CONSTRAINT "ck_calendars_hours_per_day_minutes_range";
```

`BETWEEN` and the `NOT VALID` → `VALIDATE` pair follow `ck_dependencies_lag_minutes_range`
(`.../20260715120000_activity_dependency_baseline_minutes/migration.sql:52-53`). On a table this small
the two-step is free; it is used for uniformity, not necessity.

**Deliberately NOT a CHECK:** "hours-per-day must not exceed the calendar's actual maximum daily
working minutes." That is a cross-row property of `calendar_shifts`, and the schema already states
the precedent for refusing to encode cross-row calendar properties as CHECKs
(`schema.prisma:1415-1420`: "has working time within the horizon" is enforced at the engine factory,
not by the database). At most it is a service-level warning. It is also legitimately violable: a P6
`day_hr_cnt` of 8 on a calendar with a 10-hour Saturday is normal.

**No index.** The column is only ever read by an id lookup already served by the primary key or by
`idx_calendars_project_id`. There is no new predicate, so there is nothing to measure and nothing to
justify — the `docs/DATABASE.md` rule ("measure before adding an index") resolves to "do not add one."

### 1.5 The second column the decision requires: `baselines.hours_per_day_minutes`

A baseline is a **frozen snapshot copy, not a reference** — that is ADR-0025's central call, and the
schema states it at `apps/api/prisma/schema.prisma:1575-1581` ("`source_activity_id` is a PLAIN
correlation UUID with NO foreign key … a faithful historical record"). If the day factor lives only
on `calendars`, then editing a calendar's hours-per-day retroactively changes what a two-year-old
baseline reports as its captured durations (`baseline-response.dto.ts:121`) and its captured float
(`schema.prisma:1672`). The snapshot stops being a snapshot.

So the factor is captured at freeze, on the parent `Baseline` row, by the same argument ADR-0025
already made for copying rather than referencing:

```prisma
  hoursPerDayMinutes Int @default(1440) @map("hours_per_day_minutes")
```

This was not in the brief. It is not optional if ADR-0025's snapshot property is to survive.

---

## 2. Does this reach the CPM engine?

### 2.1 The engine itself: no. You are right.

The engine's calendar port is two methods and nothing else —
`apps/api/src/modules/schedule/engine/working-time-calendar.ts:23-35`:

```ts
export interface WorkingTimeCalendar {
  addWorkingTime(from: string, minutes: number): string;
  workingTimeBetween(from: string, to: string): number;
}
```

`buildPlanCalendar` (`apps/api/src/modules/schedule/plan-calendar.ts:50-70`) constructs it from
`shifts` + `exceptions` alone; `PlanCalendarInput` (`plan-calendar.ts:35-38`) has exactly those two
fields. `MINUTES_PER_DAY` inside the engine (`working-time-calendar.ts:64`) is the fixed
**epoch-day** stride for its absolute-instant axis (`:96-98`, `:203-217`) — it is a property of the
Gregorian calendar, not of anyone's working day, and it must never be replaced by hours-per-day.

So: `computeSchedule` cannot observe this column, the engine's signature is unchanged, and the
ADR-0034 recalc parity gate is untouched **for the single-plan path**. That part of your reading is
correct and is structurally verifiable, not merely asserted.

### 2.2 The two exceptions

**(a) Persisted day-denominated engine output.** `total_float`, `free_float` and `visual_drift_days`
are columns _in days_ (`schema.prisma:949,962,1035`), written by the recalc's batched UPDATE at
`schedule.repository.ts:597,599,616`. The engine still emits minutes; the projection to days is ours.
If those conversions adopt hours-per-day, a recalculation on an 8-hour calendar starts persisting
`total_float = 3` where it persisted `1`. Nothing is _wrong_ about that — it is the same change of
unit the durations get, and arguably the only self-consistent choice, since a float of "1 day"
against a duration of "3 days" for the same span would be incoherent. But it is a **write**, it is
engine-owned, and it will move every API-level snapshot that asserts float in days.

**(b) Cross-plan external bounds — this one reaches engine input.**
`schedule.service.ts:862` builds `durationDaysByActivity` by ÷1440 and `:869,880` build `lagDays` the
same way. Those go into `deriveExternalInstants` (`:886`), which at
`cross-plan-derivation.ts:130-182,211,225` does `addDays(predecessorEarlyFinish, lagDays)` and
`lagDays − successorDurationDays`, with `addDays` adding **calendar** days
(`cross-plan-derivation.ts:95-99`). The result becomes the engine's `externalEarlyStart` /
`externalLateFinish` — genuine engine input (ADR-0045).

Change the day factor and, on a plan with cross-plan edges, a 4320-minute successor reads as 9 days
instead of 3, so the derived FF/SF bound moves by six calendar days and the computed schedule moves
with it. ADR-0045's parity claim survives on its own terms (no cross-plan edge ⇒ identical input),
but the brief's "purely a write-seam and read-seam conversion" does not.

**Recommendation:** hold the cross-plan derivation at a **fixed 1440** and say so in a comment, or —
better, and the option I would take — move it to minutes and delete the day round-trip entirely. The
day round-trip is already an accepted approximation there (working-day-denominated durations added as
_calendar_ days), and hours-per-day would compound one approximation with another in the one place
where the result is engine input rather than display. Whichever is chosen, it must be a written
decision, not a consequence.

---

## 3. Which calendar converts what

### 3.1 The resolution rules, confirmed against the code

- **`durationDays`, `remainingDurationDays`** → the activity's **effective** calendar:
  `activities.calendar_id` ?? `plans.calendar_id`, the resolution documented at
  `apps/api/prisma/schema.prisma:781` ("activity.calendarId → plan.calendarId → all-minutes").
  Columns: `schema.prisma:788` and `schema.prisma:689`.
- **`lagDays`** → per `LagCalendarSource` (`schema.prisma:1181-1186`, column at `:1222`):
  `PREDECESSOR`/`SUCCESSOR` → that endpoint activity's effective calendar; `PROJECT_DEFAULT` → the
  plan's; **`TWENTY_FOUR_HOUR` → a fixed 1440, unconditionally** — that is the entire meaning of the
  label, and routing it through the calendar's hours-per-day would silently destroy it.
  Note the consequence: the factor for `lagDays` varies **per dependency row**, so a dependency list
  mapper may need several distinct factors within one page.
- **`totalFloat`, `freeFloat`, `visualDriftDays`, `levelingDelayDays`, `relativeFloat`** → the
  activity's effective calendar. ADR-0037 already measures total float in the activity's own
  calendar, so this is consistent rather than a new rule.
- **Baseline `durationDays`, variance** → the **baseline's captured** factor ([§1.5](#15-the-second-
  column-the-decision-requires-baselineshours_per_day_minutes)), never the live calendar's.

### 3.2 Query cost at the write seams — cheaper than feared

`loadActivePlan` (`apps/api/src/modules/activities/activities.service.ts:1093-1097`) calls
`plans.findActiveByIdInOrg`, which is `db.plan.findFirst({ where: … })` with **no `select`**
(`apps/api/src/modules/plans/plan.repository.ts:74-80`). So it returns the whole `Plan` row —
**`plan.calendarId` is already in hand**, alongside the `plan.projectId` the calendar-scope guard
already uses. The brief's uncertainty here resolves in the design's favour.

What is _not_ in hand is the calendar's `hours_per_day_minutes`. Two cases:

- **Activity specifies its own calendar** (`dto.calendarId !== null`): the service already calls
  `assertCalendarUsableBy` inside the write transaction (`activities.service.ts:~258`), which loads
  that calendar row to check `scope`/`project_id`/`archived_at`. Return the factor from that guard →
  **zero extra queries**. This is the cleanest wiring available and it also keeps the factor's read
  under the same advisory lock the guard already takes.
- **Activity inherits the plan's calendar**: one `SELECT hours_per_day_minutes FROM calendars WHERE
id = $planCalendarId` — a single indexed PK read per activity write. Acceptable; do not optimise it.

**Rejected:** caching an effective factor on `plans` or `activities`. It creates a second source of
truth invalidated by two unrelated events (a calendar edit, an activity's calendar rebinding), which
is the failure mode ADR-0053 §2's narrowing guard exists to avoid elsewhere.

### 3.3 Reaching the read seams without an N+1

Every listed read seam is a static `.from()` mapper with no DB access — correctly identified as the
harder half. The answer is the one the codebase already uses for exactly this problem:
`ActivityResponseDto.from(entity, canReadCost)`
(`apps/api/src/modules/activities/dto/activity-response.dto.ts:374`) takes a second argument the
**service** resolved once. Do the same with a small resolver:

```ts
/** Minutes per authored "day" for the calendar a value is measured on (ADR-00XX). */
export interface DayFactor {
  /** `null` (no calendar) and an unknown/soft-deleted id both fall back to 1440 —
   *  the same fallback `buildPlanCalendar` makes when it returns `allMinutesWorkCalendar`
   *  (plan-calendar.ts:52), so the two never disagree about an absent calendar. */
  forCalendar(calendarId: string | null): number;
}
```

Built by the service, **once per response**, from one query over the ids the page actually needs
(the page's `activities.calendar_id` values ∪ the plan's), and threaded to `.from()`:

```sql
SELECT "id", "hours_per_day_minutes" FROM "calendars"
WHERE "organization_id" = $1 AND "id" = ANY($2);
```

One query per list response, bounded by the page size, no N+1. For the guest DTOs
(`share/dto/guest-activity.dto.ts:85`, `guest-dependency.dto.ts:40`) the same map is built from the
token's plan — the `GuestPrincipal` already carries plan and org, so no new parameter reaches the
request surface and the anti-IDOR property of ADR-0051 F-M3 is unchanged.

Two details that will bite if missed:

- The lookup **must not filter on `archived_at`**, and must tolerate `deleted_at`. An activity may
  legitimately be bound to an archived calendar (ADR-0053 §4, `schema.prisma:1422-1434`), and a
  soft-deleted calendar is exactly the case `buildPlanCalendar` already handles by falling back to
  all-minutes. Same fallback, same number: 1440.
- The dependency mappers need the factor keyed by **both endpoints plus the plan**, because
  `lag_calendar` is per row ([§3.1](#31-the-resolution-rules-confirmed-against-the-code)).

### 3.4 Full seam inventory

| #   | Site                                                           | Kind                                          | Calendar                       |
| --- | -------------------------------------------------------------- | --------------------------------------------- | ------------------------------ |
| 1   | `activities.service.ts:244`                                    | write (create duration)                       | activity effective             |
| 2   | `activities.service.ts:404`                                    | write (update duration)                       | activity effective             |
| 3   | `activities.service.ts:850`                                    | write (remaining duration)                    | activity effective             |
| 4   | `dependencies.service.ts:198,239`                              | write (lag)                                   | per `lag_calendar`             |
| 5   | `cross-plan-dependencies.service.ts:178`                       | write (lag)                                   | per `lag_calendar`             |
| 6   | `schedule.repository.ts:597,599,616`                           | **write** (engine-owned float/drift, in days) | activity effective             |
| 7   | `schedule.service.ts:862,869,880`                              | **engine input** via cross-plan derivation    | see §2.2(b)                    |
| 8   | `activity-response.dto.ts:384,408,449`                         | read                                          | activity effective             |
| 9   | `dependency-response.dto.ts:87`                                | read                                          | per `lag_calendar`             |
| 10  | `cross-plan-dependency-response.dto.ts:74`                     | read                                          | per `lag_calendar`             |
| 11  | `guest-activity.dto.ts:85`, `guest-dependency.dto.ts:40`       | read                                          | plan (token-scoped)            |
| 12  | `baseline-response.dto.ts:121`                                 | read                                          | **baseline's captured factor** |
| 13  | `baselines/variance.ts:52`                                     | read                                          | **baseline's captured factor** |
| 14  | `schedule.service.ts:543` (`relativeFloat`)                    | read                                          | activity effective             |
| 15  | `apps/web/src/features/resources/schemas/duration-triad.ts:70` | client display                                | needs the value on the wire    |

Unaffected, verified: the server-side duration triad is **hour**-based, not day-based —
`apps/api/src/modules/schedule/duration-type/resolve-triad.ts:98` computes
`D = durationMinutes / MINUTES_PER_HOUR` (`:48`). `Units = Duration × Units/Time` (ADR-0040) does not
touch this column at all. Only the web's `formatDurationDays` display string does.

---

## 4. Compatibility and blast radius

### 4.1 Changing hours-per-day must NOT rewrite stored durations. Agreed, emphatically.

The minutes are the truth. Rewriting them on a calendar edit would move dates for every activity on
that calendar, with no pen held (ADR-0028), no recalculation requested, no `version` bump the client
could see, and no audit trail (there is no append-only audit log — TECH_DEBT #14). A calendar edit is
not a schedule edit and must not become one.

So the correct behaviour is: **stored minutes unchanged, dates unchanged, displayed `durationDays`
changes.** State it plainly in the calendar editor.

### 4.2 The hazard this creates is the _read_, not the write

An activity of 14 400 minutes reads as "10 days" at 24h/day and "30 days" at 8h/day. A planner who
remembers it as a 12-day activity and types `12` after the change has just cut it from 14 400 to
5 760 minutes — a real, dates-moving edit that looks like a correction. Mitigations, in order of
value:

1. The response already carries `durationMinutes` beside `durationDays`
   (`activity-response.dto.ts:384-385`), so the client can detect and warn.
2. The calendar update that changes `hours_per_day_minutes` should surface a confirmation naming
   **how many activities' displayed durations will change** — the ADR-0053 §2 narrowing-guard
   pattern (per-class counts in the 409), applied to a non-blocking case.
3. Optimistic locking already protects the activity write itself (`activities.version`); it does not
   and cannot protect against a _correct-looking_ value being retyped.

### 4.3 Seed catalogue (ADR-0066) and `packages/seed-http`

- `packages/seed-http/src/runner.ts:116` creates every seeded calendar with `workingWeekdays: mask`
  only — a full-day pattern. So **every seeded plan sits on the 1440 default and is byte-identical**
  after this change, with no seed edits required for the default path. Good.
- `toDays()` (`packages/seed-http/src/runner.ts:546`) divides by a hard-coded `MINUTES_PER_DAY`. It
  must take the target calendar's factor, or the day it first seeds a shift calendar the seeded
  durations silently change and its approximation report becomes wrong — which is the one thing that
  file exists to prevent (its own docblock, `:540-544`).
- `packages/seed/src/pairwise/dimensions.ts:60` already records that a non-working base week is a 422.
  A new pairwise dimension `hoursPerDay ∈ {1440, 480}` is the honest addition, and it is the only
  mechanism in the repo that would have caught the 2.67× defect at the application (rather than the
  engine) level — which is ADR-0066's whole argument.
- `docs/TEST_PLAYBOOK.md` needs a row naming which plan proves the conversion and what wrong looks
  like; `pnpm check:playbook` gates it in both directions.

### 4.4 Interchange (ADR-0050)

- **XER import:** set `hours_per_day_minutes = round(day_hr_cnt × 60)` on every imported calendar,
  not just the `fallbackWorkWeek` path ([§0.1](#0-corrections-to-the-brief)). Clamp into `[1, 1440]`
  and report a finding when clamped.
- **XER export:** emit `day_hr_cnt = hours_per_day_minutes / 60`. It becomes a genuine round-trip.
- **MSPDI:** no equivalent field. Import defaults to 1440; export reports it as a **drop**, which is
  the same treatment ADR-0053 M5 gave the calendar tier.
- The ADR-0050 mapping-contract table changes in lock-step; today's row for `day_hr_cnt` is now wrong.

### 4.5 Things that do _not_ change

- **`hours_per_day_minutes` is not part of the ADR-0053 §2 scope-narrowing guard.** It is not a
  reference and narrowing cannot be blocked by it.
- **The project soft-delete cascade** (`HierarchyLifecycleService`) is unaffected — no new row, no
  new `delete_batch_id` participant.
- **What "1 day" means when the calendar's Monday is shorter than hours-per-day.** On an 8h/day
  factor with a 5h Monday, a 1-day activity is 480 working minutes and spans Monday plus part of
  Tuesday. That is correct P6 behaviour and should be written down so nobody later "fixes" it.

---

## 5. The exact Prisma and SQL

### 5.1 `schema.prisma` — `Calendar` (insert after `projectId`, `schema.prisma:1413`)

```prisma
  // The calendar's STANDARD WORKING DAY in minutes — the day↔minute factor for every
  // day-denominated public field measured on this calendar (P6 `day_hr_cnt`; ADR-0036 §7).
  // Storage and the engine are MINUTES; `durationDays` etc. are a convenience over them, and
  // this column is the conversion. 1440 (24h) is the constant default, so every existing row
  // keeps today's `× 1440` behaviour exactly — no data migration, no behaviour change, and the
  // ADR-0034 recalc parity gate is unaffected.
  //
  // NOT NULL rather than nullable-and-derive, deliberately. A standing derivation would make
  // this factor a function of the `calendar_shifts` rows, so editing one shift would silently
  // reinterpret the stored duration of every activity on this calendar; and it has no answer at
  // all for a window-only calendar (empty base week — valid, see the shifts note above), where
  // every derivation yields 0 and `durationDays × 0` zeroes the activity. Instead the SERVICE
  // derives a default at the moment a weekly pattern is written and stores the result, which an
  // explicit client value always overrides.
  //
  // Minutes, not `Decimal(4,2)` hours: this value multiplies into a WRITE that determines stored
  // minutes and therefore dates, so `durationDays × hours_per_day_minutes` must be exactly
  // integral. 7.5h is 450 exactly. The public DTO exposes both `hoursPerDay` (hours, may be
  // fractional) and `hoursPerDayMinutes`, the same pair `ActivityResponseDto` exposes for
  // duration and for the same reason.
  //
  // NEVER read by the CPM engine: the WorkingTimeCalendar port is `addWorkingTime` /
  // `workingTimeBetween` over shift + exception rows only, so this column cannot reach
  // `computeSchedule`. Bounds are `ck_calendars_hours_per_day_minutes_range` (raw SQL,
  // 1–1440). "Must not exceed the pattern's longest day" is deliberately NOT a CHECK — it is a
  // cross-row property, the same reason no working-time guard lives here. No index: read only
  // by id alongside the calendar itself; no predicate targets it.
  hoursPerDayMinutes Int @default(1440) @map("hours_per_day_minutes")
```

### 5.2 `schema.prisma` — `Baseline` (beside `dataDate`, `schema.prisma:1611`)

```prisma
  // The plan calendar's hours-per-day AT CAPTURE (ADR-0025's snapshot-copy rule applied to the
  // day↔minute factor). Without it, editing a calendar's hours-per-day retroactively changes
  // what a frozen baseline reports as its captured durations and float — a snapshot that is not
  // a snapshot. Same constant 1440 default, so every existing baseline reads exactly as today.
  hoursPerDayMinutes Int @default(1440) @map("hours_per_day_minutes")
```

### 5.3 Migration SQL (one expand step; no contract, no backfill)

```sql
-- AddColumn: the calendar's standard working day in minutes (P6 `day_hr_cnt`).
-- Constant non-volatile DEFAULT ⇒ metadata-only on PostgreSQL, no table rewrite, no backfill,
-- and every existing row keeps the `× 1440` factor the services use today.
ALTER TABLE "calendars"
  ADD COLUMN "hours_per_day_minutes" INTEGER NOT NULL DEFAULT 1440;

-- CheckConstraint: 1 minute … 24 hours. NOT NULL, so no `IS NULL OR` guard is needed (contrast
-- ck_resources_max_units_per_hour_nonneg). NOT VALID + VALIDATE mirrors
-- ck_dependencies_lag_minutes_range; on this table it is free, and it keeps the pattern uniform.
ALTER TABLE "calendars" ADD CONSTRAINT "ck_calendars_hours_per_day_minutes_range"
  CHECK ("hours_per_day_minutes" BETWEEN 1 AND 1440) NOT VALID;
ALTER TABLE "calendars" VALIDATE CONSTRAINT "ck_calendars_hours_per_day_minutes_range";

-- AddColumn: the factor CAPTURED at baseline freeze (ADR-0025 snapshot-copy). A live-calendar
-- read would let a later calendar edit rewrite a frozen baseline's reported durations.
ALTER TABLE "baselines"
  ADD COLUMN "hours_per_day_minutes" INTEGER NOT NULL DEFAULT 1440;

ALTER TABLE "baselines" ADD CONSTRAINT "ck_baselines_hours_per_day_minutes_range"
  CHECK ("hours_per_day_minutes" BETWEEN 1 AND 1440) NOT VALID;
ALTER TABLE "baselines" VALIDATE CONSTRAINT "ck_baselines_hours_per_day_minutes_range";

-- No index. Both columns are read only by id alongside their own row; no new predicate exists,
-- so there is nothing to measure (docs/DATABASE.md: index query patterns, not columns).

-- Reverse (development only; production is forward-only):
--   ALTER TABLE "baselines" DROP CONSTRAINT "ck_baselines_hours_per_day_minutes_range";
--   ALTER TABLE "baselines" DROP COLUMN "hours_per_day_minutes";
--   ALTER TABLE "calendars" DROP CONSTRAINT "ck_calendars_hours_per_day_minutes_range";
--   ALTER TABLE "calendars" DROP COLUMN "hours_per_day_minutes";
```

**Locks:** two `ACCESS EXCLUSIVE` locks on small tables, each held for a metadata-only `ADD COLUMN`
plus a bounded validating scan. Not lock-heavy; no rewrite; no destructive step. Expand-only — nothing
is dropped, so a rollback is a code rollback, not a data one.

**Drift check:** no `@@index` is declared for either column and none is created, so
`prisma:check-drift` stays green (the TECH_DEBT #54 failure mode does not apply). Both CHECKs are raw
SQL with a documenting comment in the model and no Prisma declaration, per the house rule.

**One migration, not two.** No enum label is added, so the Postgres one-transaction restriction that
forced ADR-0053 M3's split does not apply here.

---

## 6. Risks, ranked

1. **Cross-plan derivation reaches engine input** ([§2.2b](#22-the-two-exceptions)). The only place
   this change can move computed dates. Must be an explicit decision (pin to 1440, or move the
   derivation to minutes) before any code is written.
2. **Persisted float changes unit** ([§2.2a](#22-the-two-exceptions)). `total_float` / `free_float` /
   `visual_drift_days` are stored in days by an engine-owned write. Self-consistency argues for
   converting them; every day-denominated float assertion in the API e2e and golden suites will move,
   and each one must be re-derived from first principles rather than re-baselined.
3. **The read-then-retype hazard** ([§4.2](#42-the-hazard-this-creates-is-the-read-not-the-write)). A
   correct-looking value retyped after a factor change silently rescales an activity. No storage
   constraint can catch it; the mitigation is a confirmation naming the affected count.
4. **A forgotten co-write of the factor when shifts change** ([§1.2](#12-what-is-recommended-instead)).
   The derive-at-write rule is the whole safety argument for `NOT NULL DEFAULT 1440`; if a call site
   writes shifts without it, that calendar carries the 2.67× trap the brief feared. Three call sites:
   `create-calendar.dto.ts:78`, `update-calendar.dto.ts:70`, `calendar.repository.ts:260`. Pin it with
   a structural test the way `calendar-seams.structural.spec.ts` pins the scope-guard seam set.
5. **Baseline faithfulness** ([§1.5](#15-the-second-column-the-decision-requires-baselineshours_per_day_minutes)).
   Handled by the second column; drops back to a real defect if that column is cut for scope.
6. **Guest share DTOs** must resolve the factor from the token's plan, never from a request parameter
   — the ADR-0051 F-M3 anti-IDOR property is "plan and org come from the `GuestPrincipal`, never a
   request param," and a factor lookup is an easy place to break it.

---

## 7. Documentation to update in lock-step

- `docs/DATABASE.md` — the day↔minute factor is now per-calendar, not a constant.
- `docs/API.md` + OpenAPI — `hoursPerDay`/`hoursPerDayMinutes` on the calendar DTOs; a note on every
  day-denominated field that its unit is calendar-dependent.
- `docs/adr/` — this is ADR-level: it changes the meaning of a public API unit. ADR-0036 §7 ("the
  public API stays day-denominated … the service scales days↔minutes") is amended, not superseded.
- ADR-0050's mapping-contract table — `day_hr_cnt` becomes mapped/round-tripped
  ([§4.4](#44-interchange-adr-0050)).
- `docs/TEST_PLAYBOOK.md` — a row for the conversion, gated by `pnpm check:playbook`.
- `apps/api/src/modules/calendars/dto/calendar-response.dto.ts:88-91` — the stale "not API-authorable
  yet" comment ([§0.5](#0-corrections-to-the-brief)).
