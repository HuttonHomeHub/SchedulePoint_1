# M-P-T3 — FC-7 Part B, at the product

**Taken 2026-09-20** against a real PostgreSQL and the real `AppModule`, through the public REST
API: the real DTOs, the real guards, the real write path, the real recalculation and the real read
serialisation. Committed as `apps/api/test/placed-basis-parity.e2e-spec.ts`, so this is a standing
gate and not a one-off run.

**Why it is not the engine case.** FC-11 asserts the same invariant at `computeSchedule` and the two
deliberately do not substitute for each other. ADR-0066 exists because all 117 capability keys were
proven at the engine and none at the application, and the two defects that motivated it were **green
at the engine and wrong in the product**. This one builds the plan the way a planner would.

---

## 1. The fixture

One plan (`plannedStart` 2026-01-05), eight activities created through
`POST …/plans/:id/activities`, four dependencies through `POST …/dependencies`, progress reported
through `PATCH …/activities/:id/progress`, and one `POST …/schedule/recalculate`. **No `visualStart`
is sent anywhere** — that is the condition, and a placement would make a difference legitimate and
the comparison meaningless.

| Code      | Shape                                                                 |
| --------- | --------------------------------------------------------------------- |
| `SPINE`   | plain 3-day task (control)                                            |
| `TAIL`    | plain 2-day task, FS after `SPINE` (control)                          |
| `LEAD`    | plain 5-day task (control)                                            |
| `SUMMARY` | `WBS_SUMMARY` over `CHILD`                                            |
| `CHILD`   | 4-day task, FS after `LEAD` — so the summary's span starts **late**   |
| `LOE`     | `LEVEL_OF_EFFORT`, SS from `SPINE`, FF to `TAIL` — a **derived** span |
| `STARTED` | 4-day task, 50% complete, `actualStart` 2026-01-02                    |
| `DONE`    | 4-day task, 100% complete, actuals 2026-01-02 → 2026-01-03            |

**Two fixture decisions are load-bearing and were both corrections to a first draft.**

The actuals sit **before** the data date, not on it. With `actualStart` at 2026-01-05 the two bases
agreed about the **start** of both progressed rows while disagreeing about their finishes — so half
the defect was invisible, and a gate that misses half of what it is written for is worse than it
looks.

`CHILD` starts after a five-day `LEAD`, so the summary's rolled-up span does **not** begin at the
data date. With the child at the data date, Pass 2's bare data-date answer and Pass 1's rolled-up
start coincide and this case passes over a summary that renders at the data date whatever its
children do — ADR-0093's shape, and it is how the engine-level case first went green against the
same defect.

## 2. Before — the pre-M-P engine, same fixture, same route

Produced by reverting **only** `compute.ts` to `ee690c1f` and re-running. `-` is `early*`,
`+` is `visualEffective*`:

```
    "CHILD":   { "f": "2026-01-15", "s": "2026-01-12" }      (agreed)
    "DONE":    -f "2026-01-03"  -s "2026-01-02"   +f "2026-01-08"  +s "2026-01-05"
    "LEAD":    { "f": "2026-01-09", "s": "2026-01-05" }      (agreed)
    "LOE":     -f "2026-01-09"                    +f "2026-01-05"
    "SPINE":   { "f": "2026-01-07", "s": "2026-01-05" }      (agreed)
    "STARTED": -f "2026-01-06"  -s "2026-01-02"   +f "2026-01-08"  +s "2026-01-05"
    "SUMMARY": -f "2026-01-15"  -s "2026-01-12"   +f "2026-01-05"  +s "2026-01-05"
    "TAIL":    { "f": "2026-01-09", "s": "2026-01-08" }      (agreed)
```

Four of the eight diverged, and every divergence is a sentence a planner would have to explain:

- **`DONE`** — a completed activity, frozen on 02–03 Jan on one basis and drawn 05–08 Jan on the
  other. Both actuals ignored.
- **`STARTED`** — its frozen actual start ignored, and drawn at its **full** four days rather than
  the two it has left.
- **`LOE`** — a five-day hammock drawn as a **point**.
- **`SUMMARY`** — a four-day group drawn as a **point, at the data date**, a week left of the child
  it is supposed to contain.

The three plain tasks agreed, which is the control: a run in which everything was broken would look
the same as one in which nothing was, without them.

## 3. After — the shipped engine

**All eight agree. Two tests, two passed.**

The second test is not decoration. The equality in the first would be satisfied by a summary and an
LOE that had **both** collapsed — if Pass 1 had collapsed them too — and by a schedule that never
computed, whose columns are null on both sides and compare equal to themselves. So it separately
asserts that `SUMMARY` and `LOE` each span more than a day, that `SUMMARY` does not begin at the data
date, and that `STARTED`'s and `DONE`'s early dates really are their actuals.

## 4. What this establishes, and what it does not

**Establishes:** on the surface a client reads, a plan carrying progress, a Level of Effort and a WBS
summary renders identically on both bases where nothing is placed — through the write path, the
guards, the recalculation and the DTO, not only through `computeSchedule`.

**Does not establish:** anything about a plan **with** a placement. That is the rest of the epic, and
this condition is deliberately about the resting state. It also says nothing about what the web
surfaces draw: it asserts the API's numbers, and FC-7 Part A at M-F is what compares the pixels.

**The seed catalogue's own C16 row is now out of date in the helpful direction.** It records that
`plan:capability-types-and-wbs`'s `W1`/`G1`/`G2` collapse on the placed basis "CURRENTLY TRUE, before
M-P", and says that if they still collapse after M-P the milestone has not done its job. They do not.
The row is corrected in the same commit rather than left to be discovered.
