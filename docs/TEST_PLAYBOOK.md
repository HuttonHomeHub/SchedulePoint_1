# Test playbook — what to open, what to look at, and what wrong looks like

> **This document is gated.** `pnpm check:playbook` asserts that every `plan:` id below names a
> plan the builders actually produce, and that every plan they produce has a row here. It cannot
> check that the sentences are still true — that is what the reconciliation pass owns
> ([`docs/RECONCILE.md`](RECONCILE.md), ADR-0058).

The seed catalogue (ADR-0066) creates plans in a running instance through the public API. Each one
demonstrates something. This file says which plan demonstrates what, where to look, and — the part
that makes it useful — **what the wrong answer looks like**, because "the dates look plausible" is
how both of the defects that motivated the catalogue shipped.

## How to use it

```bash
# Seed the small per-capability plans into a project you own
pnpm --filter @repo/seed-cli seed -- \
  --url http://localhost:3000 --org <slug> --project <uuid> \
  --email <planner@example.com> --password '…' --tier capability

# One family at a time
… --tier capability --family calendars

# The full 129-activity fixture
… --tier fixture
```

Open the plan in the app, recalculate, and read the row the table names.

**Every plan's own description carries its expected outcome in a sentence.** That is deliberate: the
claim and the plan are the same string, so they cannot drift apart. This file adds the "what wrong
looks like" column, which a description cannot carry.

---

## Tier 1 — the fixture

One plan, 129 activities, every capability at once. Use it to see the product under a realistic
load; use the capability plans below to diagnose anything that looks wrong in it.

| Capability           | Plan                         | Look at                          | Correct                                                                         | Wrong                                                                                                                                         |
| -------------------- | ---------------------------- | -------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Everything, together | `plan:fixture-p6-torture-v1` | The whole plan after Recalculate | 129 activities, a visible critical path, WBS summaries that span their children | Any summary collapsed to a point at the data date; any LOE drawn as a zero-length bar. **Both of these shipped**, and are why ADR-0066 exists |

---

## Tier 2 — one capability per plan

Small enough to check by eye. This is the tier to reach for when the fixture looks wrong and you
need to know which feature caused it.

### Logic and lag

| Capability                        | Plan                            | Look at                                        | Correct                                                                                                                        | Wrong                                                                                                             |
| --------------------------------- | ------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| FS and SS relationships, with lag | `plan:capability-logic-fs-ss`   | The gap between each linked pair               | An FS successor starts after its predecessor finishes; an SS successor starts alongside it, offset by the lag                  | The lag counted in calendar days rather than working days — a 5-day lag that crosses a weekend lands 2 days early |
| FF and SF relationships, with lag | `plan:capability-logic-ff-sf`   | The finish edges                               | An FF successor finishes with its predecessor; SF is the rare inverse                                                          | SF treated as FS. It is the least-used type and the easiest to get silently wrong                                 |
| Open ends, merges and dangles     | `plan:capability-network-shape` | Activities with no predecessor or no successor | Open starts sit at the data date; open ends do not distort the critical path unless `makeOpenEndsCritical` is on               | An open end silently becoming critical with the option off                                                        |
| Zero, free and negative float     | `plan:capability-float`         | The Float column                               | Zero float on the critical path, free float where a successor has slack, negative float where a constraint is already breached | Free float equal to total float everywhere — a sign free float is not being computed at all                       |

### Constraints

| Capability                               | Plan                              | Look at                                      | Correct                                                                                           | Wrong                                                                                                                                                   |
| ---------------------------------------- | --------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every constraint type, one activity each | `plan:capability-constraints`     | Each activity's dates against its constraint | SNET/FNET push forward; SNLT/FNLT pull back and go negative-float rather than moving; MSO/MFO pin | A mandatory constraint that refuses to schedule the plan. ADR-0035 §7 is **produce and flag** — the plan must still compute, with the violation counted |
| Expected finish                          | `plan:capability-expected-finish` | The finish of the activity carrying one      | Honoured only when the plan's `useExpectedFinishDates` is on                                      | The date being honoured with the option off, or ignored with it on                                                                                      |

### Calendars

| Capability                               | Plan                              | Look at                                                                                                       | Correct                                                                                                                                                                                                                                                                                                                                                               | Wrong                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The same work on four working weeks      | `plan:capability-calendars`       | Four identical-duration activities side by side                                                               | Four **different** finish dates — that contrast is the whole plan                                                                                                                                                                                                                                                                                                     | Any two of them finishing on the same day. If a 5-day and a 6-day week agree, the activity's own calendar is not being read (this exact defect was found, and needed a 7-day duration to make visible)                                                                                                                                                                                                                                                                  |
| The same **hours** on six shift patterns | `plan:capability-shift-calendars` | S8, S2SHIFT, S12, S24, S_SPLIT — the same 40 working hours, on calendars whose working **days** are identical | Five different finishes, in that order: an eight-hour day takes five days, a sixteen-hour two-shift day takes three, twelve hours takes four, round-the-clock takes two, and the split day finishes later in the day than the eight-hour one for the same hours. S_NIGHT finishes on a **morning**. S_WINDOW_ONLY can only sit inside its three dated turnaround days | Any two of the five agreeing. Two calendars agreeing means the **hours** are not being read — the sharper form of the row above, and the shape that was invisible until this plan existed, because every earlier seeded calendar worked full days. Also wrong: S_NIGHT finishing in an evening (its 20:00–06:00 is two windows on two days, never one wrapping window), or S_WINDOW_ONLY finishing before 14 March (that means a walker fell back to "every day works") |

### Progress

| Capability                         | Plan                                | Look at                                    | Correct                                                                                       | Wrong                                                                                                           |
| ---------------------------------- | ----------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Statuses, suspend and resume       | `plan:capability-progress`          | Started, complete and suspended activities | Complete work sits behind the data date; remaining work in front of it                        | Remaining duration on a complete activity, or an in-progress bar starting after the data date                   |
| Out of sequence, Retained Logic    | `plan:capability-retained-logic`    | The out-of-sequence successor              | Remaining work still waits for its predecessor's remaining work                               | The successor finishing before its predecessor                                                                  |
| Out of sequence, Progress Override | `plan:capability-progress-override` | **The same activities as the row above**   | The successor's remaining work ignores the incomplete predecessor and runs from the data date | The two plans producing identical dates. They are a matched pair: **if they agree, the mode is not being read** |

### Activity types and the WBS

| Capability                        | Plan                            | Look at                              | Correct                                                                                             | Wrong                                                                                                                                                        |
| --------------------------------- | ------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Milestones, LOE and WBS summaries | `plan:capability-types-and-wbs` | `W1`, `G1`, `G2`, `M_START`, `M_FIN` | `W1` spans its children; `G1`/`G2` span their logic and are never critical; milestones take no time | A summary at the data date with zero length (`parentId` not reaching the engine); an LOE as a zero-duration task (the importer's coercion). **Both shipped** |

### Resources, cost and earned value

| Capability                                | Plan                          | Look at                                | Correct                                                                                                        | Wrong                                                                                              |
| ----------------------------------------- | ----------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Kinds, driving, curves and duration types | `plan:capability-resources`   | `T_TASK` beside `T_RES`                | Same duration, **different finishes**: the resource-dependent one schedules on its driving resource's calendar | The two finishing together — the driving resource's calendar is not being resolved                 |
| Levelling a deliberate over-allocation    | `plan:capability-levelling`   | The levelled dates and `levelingDelay` | With levelling on, demand no longer exceeds capacity; network float stays authoritative                        | Levelling changing the critical path. It is an overlay (ADR-0041 Q2), not a recalculation of float |
| Expenses, accrual and earned value        | `plan:capability-cost-and-ev` | The earned-value read                  | PV from the active baseline, EV from physical %, `EAC = BAC/CPI`                                               | EV moving a date. Physical %-complete earns value and changes **no** schedule (ADR-0042)           |
| A resource that joins late                | `plan:capability-resources`   | `A_LAG`'s histogram beside `A_BELL`'s  | Same units, same curve, same activity dates — `A_LAG`'s load simply starts two days in                         | The two series identical. They differ **only** in the lag, so agreement means the lag is not read  |

### Inter-project

| Capability              | Plan                               | Look at                                    | Correct                                                           | Wrong                                                                              |
| ----------------------- | ---------------------------------- | ------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Imported external dates | `plan:capability-external-dates`   | The activity carrying `externalEarlyStart` | Clamped like an SNET, flagged `externalDriven`                    | A hard pin — an external bound is **soft** and a real constraint still wins        |
| The same dates, ignored | `plan:capability-external-ignored` | **The same activities as the row above**   | `ignoreExternalRelationships` drops both directions; dates revert | The two plans agreeing. Another matched pair — agreement means the toggle is inert |

---

## Tier 3 — pairwise

Not a plan to read by eye. 63 generated plans crossing 26 interacting dimensions, each one asserted
by the differential (`pnpm --filter @repo/api test:e2e:pairwise`) against `computeSchedule` on the
same inputs. If it fails it names the case, the activity, the field and both values.

Use it when a change touches the write path, the read path or the recalculate transaction. It cannot
tell you the engine is right — that is the ADR-0034 goldens — only that the application agrees with
it.

---

## Tier 4 — scale

| Capability                    | Plan             | Look at                                 | Correct                                                                                             | Wrong                                                                                                                                                                                         |
| ----------------------------- | ---------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A realistic programme at size | `plan:scale-500` | Pan and zoom the canvas; open the Gantt | Smooth panning; a critical path through roughly a third of the plan; most activities carrying float | Nearly every activity critical at zero float. That means the generator has produced one long queue, which it did once (ADR-0066 M4) — and every declared shape number was correct at the time |

Sizes are parameterised: `--tier scale --activities 2000`. The cost is stated before the run starts,
because at the API's default 100-requests-per-60s throttle a 5,000-activity plan is about 162
minutes.

---

## Tier 5 — hostile input

One attempt per case, against a throwaway host plan: `--tier negative`. The output is a ledger of
what the API did, not a pass/fail. **A case the API accepts where the fixture says it must not is a
product finding, not a test to relax.**

| Case                                       | Attempt                                                      | Correct                                                                                                    | Wrong                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `plan:N01_CYCLE_3`                         | Close a three-activity loop                                  | Refused, **naming the members** of the cycle                                                               | "A loop was detected" with no members — undiagnosable on a real plan                                                          |
| `plan:N02_SELF_LOOP`                       | An activity as its own predecessor                           | Refused                                                                                                    | Accepted, then the plan never schedules again                                                                                 |
| `plan:N03_SS_FF_CYCLE`                     | A loop that exists only through SS/FF edges                  | Refused                                                                                                    | Accepted — the classic FS-only cycle detector's blind spot                                                                    |
| `plan:N04_DUPLICATE_RELATIONSHIP`          | A second link on a pair that already has one of that type    | Refused, `DUPLICATE_DEPENDENCY`. A **different** type on the same pair is allowed by design (ADR-0035 §13) | Silent dedupe, which hides a modelling error                                                                                  |
| `plan:N05_DANGLING_REFERENCE`              | A link to an activity that does not exist                    | Refused, not found                                                                                         | A link stored against nothing                                                                                                 |
| `plan:N06_AF_BEFORE_AS`                    | Actual finish before actual start                            | Refused                                                                                                    | Stored — negative elapsed work                                                                                                |
| `plan:N07_ACTUAL_IN_FUTURE`                | Work reported as started after the data date                 | Refused or warned                                                                                          | Silently accepted                                                                                                             |
| `plan:N08_COMPLETE_NO_AF`                  | 100% complete with no actual finish                          | Repaired or warned                                                                                         | Accepted with no finish date, so the activity is complete and undated                                                         |
| `plan:N09_NEGATIVE_DURATION`               | A negative duration                                          | Refused at the DTO                                                                                         | Accepted. The pure engine **cannot** own this one — it marks it `it.todo` — so this tier is the only place it is demonstrated |
| `plan:N10_IMPOSSIBLE_MANDATORY_PAIR`       | Two mandatory constraints that cannot both hold              | Scheduled **and** flagged (ADR-0035 §7)                                                                    | Refusing to schedule the plan at all                                                                                          |
| `plan:N11_ZERO_HOUR_CALENDAR`              | A calendar with no working time                              | Refused at load, or scheduled and reported                                                                 | **A hang.** This is the engine hang test: any naive "advance to the next working hour" loop spins forever                     |
| `plan:N12_LOE_NO_SPAN`                     | An LOE with no logic to span                                 | Refused, or produced at the data date and flagged                                                          | Produced with no flag — an undated bar that looks like a bug in the canvas                                                    |
| `plan:N13_LEAD_BEFORE_DATA_DATE`           | A lead large enough to pull a successor behind the data date | Clamped to the data date                                                                                   | Work scheduled in the past                                                                                                    |
| `plan:N14_NEGATIVE_UNITS`                  | Negative budgeted units                                      | Refused                                                                                                    | Stored, and every cost and histogram read downstream is wrong                                                                 |
| `plan:N15_CONSTRAINT_BEFORE_PROJECT_START` | An SNET dated before the data date                           | Warned                                                                                                     | Refused — it is a legal, if odd, thing to model                                                                               |
| `plan:N16_LAG_EXCEEDS_HORIZON`             | A 48-year lag                                                | Refused or warned                                                                                          | The date walker iterating toward it                                                                                           |
| `plan:N17_MS_WITH_DURATION`                | A milestone with a duration                                  | Refused or coerced to zero                                                                                 | A milestone with a length. Also `it.todo` at the engine                                                                       |
| `plan:N18_RD_GT_OD_ON_COMPLETE`            | Remaining duration exceeding the original on complete work   | Repaired or warned                                                                                         | Accepted, leaving remaining work on a finished activity                                                                       |

---

## What this file cannot tell you

- **That the engine is right.** The ADR-0034 goldens do that, per capability, against documented
  semantics (ADR-0035). This catalogue proves the application agrees with the engine and that the
  path between them keeps every field.
- **That every combination works.** The pairwise tier covers every _pair_ of interacting dimensions.
  Three- and four-way interactions are not covered and will not be.
- **That the sentences above are still true.** `check:playbook` gates the plan ids, not the prose.
  ADR-0058's rule applies: verify the claim, do not trust the document.
