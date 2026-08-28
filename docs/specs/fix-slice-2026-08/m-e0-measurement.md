# M-E E0 — the CAL-05 measurement campaign

> The record ADR-0076 §19.11 requires: every decision-bearing number in M-E, with the command or
> file that established it, **including the attempts that failed** — because the spec's proposed
> amendment (widen the window's END only) was disproved by running it, and the shipped amendment
> (widen **both** ends, 2026-10-01 → 2026-10-30) exists only because of the failures below.

## The question

`docs/TECH_DEBT.md` #205(a): the conformance fixture's CAL-05 ("Turnaround Window") starves the
TT.10 chain — seeding the fixture through the public REST API and recalculating returns HTTP 422
`CALENDAR_WORKING_TIME_UNREACHABLE` instead of a schedule. The PO chose **amend CAL-05 and bump
the fixture's revision** over relaxing the engine guard. E0's job: reproduce the 422, establish
how the fixture is maintained (CQ-1), derive the smallest window that schedules while keeping
every behaviour the fixture exists to pin — most sharply TT.10's **mandatory-breaks-logic** case
(A10500's `MANDATORY_FINISH`, ADR-0035 §7) — and check nothing else starves (R5).

## E0.1 — reproduce fresh (2026-08-28)

Environment: dedicated database `app_e0` (`postgresql://app:app@localhost:5432/app_e0`), API
booted from `apps/api/dist` on :3000, user `e0@example.com`, org `e0-org`. Seed:

```
node apps/seed-cli/dist/main.js --url http://localhost:3000 --org e0-org \
  --project <id> --email e0@example.com --password '…' --tier fixture
POST /api/v1/organizations/e0-org/plans/<plan>/schedule/recalculate
```

Result: **HTTP 422**, `{ "reason": "CALENDAR_WORKING_TIME_UNREACHABLE", "calendarId": null }` —
the #205 symptom, reproduced on a pristine database before anything was touched.

## E0.2 — how the fixture is maintained (CQ-1)

`packages/engine-conformance/fixtures/tools/generate_fixture.py` was run unmodified and its
output diffed against the vendored files:

- `p6_torture_test_v1.json` and `negative_cases.json` reproduce **byte-identically**.
- The CSVs differ only by line endings (generator emits CRLF) and float formatting
  (`0.0` vs vendored `0`) — cosmetic, not semantic.
- The generator emits **no `.xer`**, and nothing under `apps/` or `packages/` reads the vendored
  `.xer` (grep over both trees).

So CQ-1(a) lands as: amend the generator, regenerate the JSON into scratch, **audit the diff**
(it must touch only the CAL-05 block), copy it over, hand-edit `csv/calendars.csv` to match, and
add a JSON↔CSV consistency gate so the two cannot drift again (verified red by de-syncing).

## E0.3 — the forward-pass arithmetic

CAL-05 as vendored: working windows `06:00–12:00` + `12:30–18:30` (12 h/day) on
**2026-10-05 → 2026-10-16 only** (empty base week; the window is the calendar's entire working
time): 12 working days × 12 h = **144 h**.

The TT.10 chain on CAL-05: A10200 (24 h) → A10300 (96 h) → A10400 (36 h) = **156 h** sequential.
156 > 144 — the chain cannot fit even before any predecessor pushes its start. Starvation
confirmed by arithmetic; the 422 is the ADR-0036 N11/N16 horizon guard firing while
`advanceWorking` walks forward past the last window looking for minutes that never come.

## E0.4 — trial 1 FAILED: the spec's end-only widening is not enough

The spec proposed keeping the start (10-05) and widening the end to **2026-10-30**
(20 working days × 12 h = 240 h ≥ 156 h). Applied to the working tree, rebuilt
(`@repo/engine-conformance` → `@repo/seed` → `@repo/seed-http` → `@repo/seed-cli`), re-seeded a
fresh plan, recalculated: **still HTTP 422.**

Bisection (all by running, each against a fresh recalculate):

1. Detach all three chain activities from CAL-05 → **200**. So CAL-05 is the only starving seam.
2. Re-attach one at a time → A10200 alone starves; A10300 alone starves. Not a single-activity
   duration problem — the end had been widened far past any one duration.
3. Widen `RCAL-CRANE600` (the other window-only calendar, 27-Jul → 21-Aug 2026) → **no change**.
   The crane hypothesis is dead: A6100's EF (2026-07-29) sits inside its window.

With the failure not explicable from the outside, the engine was **temporarily instrumented**
(both horizon throws in `working-time-calendar.ts` given `` `fwd/back from=${from} minutes=${minutes}` ``,
threaded through `WorkingTimeHorizonExceededError` into the 422 details; reverted before commit).
The failing walk:

```
back from=2026-03-02 minutes=-1440   (stack: compute.ts backward pass, lateStart.set(...))
```

**The backward pass starves, not the forward pass.** A10500 carries
`MANDATORY_FINISH 2026-10-16T18:00` — the fixture's deliberate breaks-logic case. The late-date
walk needs the chain's 156 h = **9,360 working minutes at or before the pin**. A window opening
2026-10-05 06:00 holds only **8,610 minutes ≤ the pin** (11 full days × 720 + 690 on the 16th).
On a window-only calendar there is **no representable late date before the window exists**, so
produce-and-flag has nothing to produce and the walk runs off the horizon backwards
(`from=2026-03-02` is the walk already ~7 months past the window's start, still hunting).

This is the finding the fixture never documented: **on a window-only calendar,
mandatory-breaks-logic requires the window to hold the full chain _before the pin_, not just in
total.** Widening the end cannot fix a backward starvation.

## E0.4 — trial 2: widen BOTH ends, 2026-10-01 → 2026-10-30

Working minutes at-or-before the pin become 11,490 (≥ 9,360) — backward feasible. And the
forward picture does not move at all, which makes the amendment more surgical than designed:
A10100 ("TA Window Opens") carries `MANDATORY_START 2026-10-05`, so the chain still starts on
the original window's first day and the four added working days (Oct 1–4) exist **only** so the
backward pass has representable late dates. (The E0 notes first claimed A10100 was
unconstrained — wrong, corrected here by reading the seeded row.)

Generator amended (name string + `date_range`), regenerated, **diff audited: exactly the two
expected value lines**, JSON copied over, `csv/calendars.csv` hand-edited to match.

Trial-2 verification (fresh project, full seed of all 147 activities / 188 relationships,
recalculate): **HTTP 200** — `projectFinish 2027-03-12`, `activityCount 147`,
`criticalCount 87`, `constraintViolationCount 1`. The seeded rows:

| code   | ES         | EF         | constraint                  | violated | TF  |
| ------ | ---------- | ---------- | --------------------------- | -------- | --- |
| A10100 | 2026-10-05 | 2026-10-05 | MANDATORY_START 2026-10-05  | no       | 0   |
| A10200 | 2026-10-05 | 2026-10-06 | —                           | no       | −1  |
| A10300 | 2026-10-07 | 2026-10-14 | —                           | no       | −1  |
| A10400 | 2026-10-15 | 2026-10-17 | —                           | no       | −1  |
| A10500 | 2026-10-16 | 2026-10-16 | MANDATORY_FINISH 2026-10-16 | **yes**  | 0   |

A10400's EF (2026-10-17) sits past the pin, A10500 is the plan's **only** flagged violation,
and the chain carries the negative float the pin produces — the mandatory-breaks-logic
produce-and-flag shape (ADR-0035 §7), intact and now reachable through the public API.

## E0.5 — nothing else starves (R5)

- `RCAL-CRANE600` (27-Jul → 21-Aug 2026): A6100 EF **2026-07-29**, inside the window; widening
  it changed nothing. No starvation — and the trial-2 **200** is itself the strongest form of
  this check, since any starving calendar (window-only or resource) would have returned the 422.
- Project finish 2027-03-12 with 87 critical activities and negative float against
  `must_finish_by` 2026-12-18 is the Heavy Lift weather calendar's **designed** Nov–Feb pause —
  the fixture's intended pathology, not a defect.
- Noted in passing, not a cause: the seeded CAL-05 row carries `hours_per_day_minutes = 1440`
  (the seeder's default; the fixture says 12 h). The engine never reads it (ADR-0068 — the port
  is shift/exception rows only), so it cannot contribute to the 422. Filed as an observation in
  the M-E notes rather than fixed here.

## Why every conformance tier was green while the API returned 422

The amended fixture ran the full `apps/api` suite (1,765 tests) with **zero** snapshot or golden
updates — and so did the starving original, which deserves the explanation rather than the
shrug: the pure harness's baseline adaptation schedules the **whole network on the project's
default calendar** (`conformance/adapter.ts` — a non-default activity calendar is substituted
and reported as `activity-calendar-substituted`), so the TT.10 chain never actually ran on
CAL-05 in the pure tier. The goldens are hand-authored small networks (ADR-0034 §3) and never
touch the fixture. So the one place CAL-05's window was ever _executed_ was the seeded
application path — ADR-0066's argument ("proven at the engine, never at the application")
restated as this milestone's own evidence, and why zero re-baselines after the amendment is the
**correct** outcome, not a hole discovered late.

## The amendment

CAL-05: **2026-10-01 → 2026-10-30** (was 2026-10-05 → 2026-10-16), name updated to state its own
dates, `fixture.revision` bumped (E1). Everything else in the fixture is byte-identical.
