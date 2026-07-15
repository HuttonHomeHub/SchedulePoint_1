# CPM/PDM Engine Conformance Fixture — Test Matrix

**Fixture:** `P6-TORTURE-01`
**Project:** TT-300 — Unit 300 Amine Regeneration Package (Construction & Commissioning)
**Planned start:** 2026-01-05 08:00 · **Data date:** 2026-03-02 08:00 · **Must Finish By:** 2026-12-18 17:00

| | |
|---|---|
| Activities | 129 |
| Relationships | 188 (FS 143 · SS 25 · FF 17 · SF 3) |
| Lags | 153 zero · 31 positive · 4 negative |
| Calendars | 8 (incl. 2 resource calendars) |
| Resources / assignments | 22 / 45 |
| Scheduling scenarios | 13 |
| Negative (hostile) cases | 18 |

---

## Files

| File | What it is |
|---|---|
| `p6_torture_test_v1.json` | The fixture. Everything: calendars, WBS, activities, logic, resources, assignments, steps, expenses, codes, UDFs, scheduling options, scenarios, and a `coverage_index` mapping every feature tag → the objects that exercise it. |
| `negative_cases.json` | **Keep separate.** Loops, self-loops, duplicate edges, bad actuals, a zero-working-hour calendar. Load one at a time; assert the engine rejects/reports rather than hangs. |
| `activities.csv` · `relationships.csv` · `calendars.csv` · `resources.csv` · `assignments.csv` | Flat tables for quick import or eyeballing. |
| `generate_fixture.py` | The generator. Change the data date, add activities, re-emit. |
| `validate_fixture.py` | Structural validator + coverage report. Run it after any edit. |

**Durations are stored in hours, not days.** With calendars ranging from 8 h/day to 24 h/day, "days" is meaningless as a storage unit — this is why P6 stores hours, and getting it wrong is one of the most common home-grown-engine bugs. Each activity also carries `original_duration_days_display` so you can check your day-conversion.

Every activity, relationship, calendar and assignment carries a `test_tags` array and most carry a `note` explaining *what it is trying to break*. Use the tags to drive parameterised tests.

---

## How to use it

1. **Load and schedule under scenario `S02_PROGRESSED_RETAINED_LOGIC`** (the default options in `project.scheduling_options`). That's the primary run.
2. **Diff against the other 12 scenarios.** Each scenario flips exactly one option. *If a scenario produces dates identical to S02, that option is not actually wired up.* That is the single most useful property of this fixture.
3. **Get a golden output.** I've deliberately not asserted specific dates — a hand-computed oracle would be a liability, and P6's calendar/lag arithmetic has quirks worth matching rather than guessing at. Import into P6, F9, export the dates, and use *that* as your golden file. (Say the word and I'll produce an XER or P6 XML so you can do that; it'll likely need a round or two of iteration against a live P6 to import cleanly.)
4. **Then run `negative_cases.json`.**

---

## 1. Relationship types and lag signs

Every combination of `{FS, SS, FF, SF} × {zero, positive, negative}` is present.

| Type | Lag | Where | Why it's there |
|---|---|---|---|
| FS | 0 | ~140 edges | Baseline |
| FS | + | A2300→A5100 (+80 h) | **Lag is double the predecessor's 40 h duration.** Anchored on the predecessor's *finish*, not its start. |
| FS | + | A6000→A6100 (+400 h) | Very long lag (50 working days). Not driving — the crane resource calendar is. |
| FS | + | A4430→A4440 (+168 h, **24 h lag calendar**) | See §4. The classic. |
| FS | **−** | A4350→A4360 (−20 h) | Negative lag (lead). `ES(succ) ≥ EF(pred) + lag`, lag = −20. |
| SS | 0 | A4500→A4510, A7100→A7110 | |
| SS | + | A5100→A5110 (+80 h), A7100→A7100 chain (+50 h) | |
| SS | **−** | A8000→A8010 (−40 h) | Successor may start **four days before** its predecessor. Indefensible in practice — a pure sign-convention test. |
| FF | 0 | A5100→A5120, A7100→A7400 | |
| FF | + | A4300→A4400 (+20 h), A7100→A7120 (+40 h) | |
| FF | **−** | A5220→A9000 (−30 h) | Successor may **finish three days before** the predecessor finishes. The least-tested edge in most engines. |
| SF | 0 | A8700→A3800 | Temp power can't *finish* until permanent power *starts*. `EF(succ) ≥ ES(pred)`, then `ES(succ) = EF(succ) − RD`. A3800's **only** predecessor is this SF. |
| SF | + | A11100→A10450 (+16 h) | Legacy control system runs in parallel for 16 h after the new one starts. The textbook legitimate SF. |
| SF | **−** | A11200→A10460 (−8 h) | Pure torture. No planning justification — it exists so a sign error can't hide. |

Also: **A4520** has an FF as its *only* predecessor link (dangling start — nothing controls when it begins). **A6300** is fully dangling: SS in, SS out.

---

## 2. Constraints — all nine P6 primaries, plus secondary and expected finish

| Constraint | Activity | The trap |
|---|---|---|
| Start On | A2000 Site Access Granted | Pins **both** passes. Its predecessor (A1000) says it *could* start 05-Jan; the constraint forces 19-Jan and the backward pass must not pull it earlier. |
| Start On or After (SNET) | A1000, A4300, **A5200** | **A5200's SNET date (2026-05-04) is the Early May bank holiday — a non-work day on CAL-02.** The constrained start must roll forward to the next working instant (Tue 05-May 07:00), not sit on a non-work timestamp. |
| Start On or Before (SNLT) | A7600 Hydrotest Prep | A **backward-pass** constraint. Caps the late start; must never move the early start. Drives negative float when the forward pass overshoots. |
| Finish On | A12500 RFSU | Pins both passes (unlike FNLT/FNET, which pin one). |
| Finish On or After (FNET) | A3900 Temp Facilities Removal | A rare **forward-pass-delaying** constraint — it pushes the activity *later*. Also an open end. |
| Finish On or Before (FNLT) | **A12000 Mechanical Completion** | **The negative-float driver.** Contractual 06-Nov-2026 that the forward pass can't meet. Verify: magnitude of TF; that it propagates *only* along the driving chain; that LOEs do **not** inherit it. |
| As Late As Possible | A9400 Final Clean | After scheduling: **free float = 0, total float unchanged**. It's a zero-free-float pass, not a date constraint. |
| Mandatory Start | A10100 TA Window Opens | **Overrides the network in both passes.** If predecessors slip past 05-Oct it *stays* on 05-Oct — so relationship A10000→A10100 gets violated and negative float propagates backwards. Most home-grown engines quietly implement this as an SNET and get it wrong. |
| Mandatory Finish | A10500 TA Window Closes | Same, on the finish. If A10400 runs long the mandatory finish sits *before* its predecessor's early finish — a genuinely impossible schedule. **P6 produces it anyway and shows the violation. Yours must too — don't silently "fix" it.** |
| Secondary constraint | A5200 (SNET primary + FNLT secondary) | Primary acts on the forward pass, secondary on the backward pass. |
| Expected Finish | A6200 Set Absorber Column | With `use_expected_finish_dates = true`, remaining duration is **recalculated** so the activity lands on 2026-08-14. Scenario S12 turns it off — diff must be non-empty. |

---

## 3. Activity types

| Type | Activities | Assertion |
|---|---|---|
| Task Dependent | 103 | Scheduled on the **activity's** calendar. |
| **Resource Dependent** | A6100, A8300 | Scheduled on the **resource's** calendar. A6100's activity calendar is CAL-06 (would allow a May start) but its crane is only on hire 27-Jul → 21-Aug. If you get a May start, you're using the wrong calendar. A8300's HV specialist works **Mon–Thu**, so no work may land on a Friday even though the activity calendar is Mon–Fri. |
| **Level of Effort** | A1010, A1020, A1030, A1040, A3100 | Duration is *derived* from an SS predecessor and an FF successor. Must **never** drive a successor, **never** appear on the critical path, and **never** inherit the negative float from A12000. A1030 spans CAL-01/CAL-03 activities while itself sitting on CAL-02. |
| Start / Finish Milestone | 4 / 12 | Zero duration; start = finish. |
| WBS Summary | W4000, W5000, W7000 | Dates roll up from all activities in the WBS branch. No relationships. |
| **Zero-duration *task*** | A7550 Turnover Sign-off | Not a milestone. It has both a start *and* a finish, can carry resources, and obeys duration-type rules. Naive engines divide by zero or silently coerce it to a milestone. |

---

## 4. Calendars — where most engines actually die

| Calendar | Pattern | The trap |
|---|---|---|
| CAL-01 | 5-day, 8 h, split shift (08–12, 13–17) | Lunch break. UK bank holidays. Christmas shutdown 21-Dec → 01-Jan. |
| CAL-02 | 6-day Mon–Sat, 10 h | Saturday working — most default-week assumptions break here. |
| CAL-03 | 7-day, 24 h, no holidays | Concrete cure, hydrotest hold, commissioning. 168 h = exactly 7 elapsed days. |
| **CAL-04** | Night shift, Mon–Fri 20:00 → 06:00 | **Crosses midnight.** Expressed as two work periods on adjacent days. A5500 starts Mon 20:00 with a 60 h duration and must run continuously across the 24:00/00:00 boundary. Its "days" display (6 d @ 10 h/day) must not be derived from the calendar-day count. |
| **CAL-05** | Turnaround window | **Base week is entirely non-work; work exists ONLY via a positive exception (05–16 Oct).** Engines that can only *subtract* exceptions from a base week fail outright. This is how a TA window should be modelled — with a calendar, not a constraint. |
| **CAL-06** | 8 h, with a 4-month non-work block (01-Nov → 28-Feb) | A12700's early start lands *inside* the block, so it must be pushed to 01-Mar-2027 — past the Must Finish By. Expect big negative float. **Guard your calendar walker with an iteration cap:** a naive "advance to next working hour" loop crawls ~2,900 non-work hours here. |
| RCAL-CRANE600 | Crane on hire 27-Jul → 21-Aug only | Drives A6100 (resource dependent). |
| RCAL-SPECIALIST | **Mon–Thu, 4-day week** | Drives A8300. |

### The lag-calendar test (the big one)

P6 has a project setting: *Calendar for scheduling relationship lag* — Predecessor / Successor / 24-Hour / Project Default.

- **A4430 → A4440, FS +168 h, `lag_calendar: "24H"`** — an explicit per-relationship override. 168 h means 7 *elapsed* days (concrete cure). If your engine resolves it on CAL-02 (10 h/day, no Sundays) you land roughly **two weeks late**. If your model has no per-relationship lag calendar, you cannot represent concrete cure correctly. This edge must **not** move in scenarios S05/S06.
- **A2230 → A8300, FS +40 h** — predecessor on CAL-03 (24 h), successor on CAL-01 (5-day). Under `PREDECESSOR` the lag is ~1.7 elapsed days; under `SUCCESSOR` it's ~5 working days. This single edge is the cleanest proof that the setting is actually wired up.

---

## 5. Progress — data date 2026-03-02 08:00

| Activity | State | The trap |
|---|---|---|
| **A4220** Pile Integrity Testing | **Out of sequence** | Its FS predecessor (A4200) is only 40 % complete, yet A4220 has an actual start. **Retained Logic:** remaining work waits for A4200. **Progress Override:** remaining work starts at the data date. **Actual Dates:** as retained, but actuals never move. Three different answers. Its successor **A4300** is the discriminator: expect ~19-Mar under retained logic, ~16-Mar (its SNET) under override. **If A4300 lands on the same date in S02 and S03, the option isn't implemented.** This is the highest-value activity in the fixture. |
| **A3040** Access Roads | **Stopped** | RD = 0, duration % = 100, **no actual finish**. P6 sets the remaining early finish to the data date. It has a successor (A6100) precisely so a null finish breaks something visibly. |
| **A4210** Piling Zone B | **Suspended, not resumed** | Remaining work schedules from the data date; the suspended window is excluded from actual duration. |
| **A4230** Pile Cropping | **Suspend before DD, Resume *after* DD** (09-Mar) | Remaining work must not start before 09-Mar even though the data date is 02-Mar. Behaviour here diverges between tools — verify against your P6 reference and **document the rule you pick**. |
| **A4200** Piling Zone A | RD ≠ derived from % | OD 200 h, RD 120 h → duration % = (200−120)/200 = **40 %**. Actual duration (elapsed on CAL-02) = **120 h**, so at-completion = **240 h** — 40 h over. Physical % (**35 %**, from weighted steps) deliberately ≠ duration % (40 %). EV must use the *nominated* % type. |
| All unstarted activities | — | No remaining work may be scheduled before the data date. **A9500** (open start, unstarted) must collapse to the data date — *not* the project start. |

---

## 6. Float

- **Negative float:** A12000 (FNLT 06-Nov) and A12700 (weather-blocked). Two independent sources — deliberately.
- **Free vs total float:** A4600 has a redundant predecessor (A4110, already reachable transitively). Merge points at A4999, A5400, A7400, A8400, A12000.
- **Longest Path ≠ TF ≤ 0** (S07): A12700 is hugely negative-float but is *open-ended*, so it is **not** on the longest path to the project finish. It must be critical under TF ≤ 0 and **not** critical under Longest Path. That's the cleanest discriminator between the two definitions.
- **Multiple float paths** (S11): target = A12500. Paths must be contiguous chains, not activities sorted by total float.
- **Total float as start / finish / smallest** (S13): the activities where these diverge are the ones whose calendar differs from their predecessors' — A4340, A7710, A11100, A5500.

---

## 7. Resources, cost and levelling

| Test | Where |
|---|---|
| Over-allocation → levelling | **NL-CRANE600** (max 1): A6100 and A6200 are SS+0 and both demand it. **NL-HYDROPUMP** (max 1): A7700 and A7730 both FS+0 from A7600. |
| Levelling conflict | Serialising A6100/A6200 pushes past the 21-Aug crane hire window. Extend, or report the conflict — **both are defensible; pick one and document it.** Levelling must **never** move a Mandatory-constrained activity (A10100, A10500). |
| Assignment lag | A7100 / LAB-WELD, lag 24 h — welders join 3 days in, so the assignment spans 276 h of a 300 h activity. Histograms *and* cost spreads must respect it. |
| Resource curves | LINEAR, FRONT_LOADED (A7100), BACK_LOADED (A11100), BELL (A5100), DOUBLE_PEAK (A11200) — 21-point. |
| Material resources | MAT-CONC (m³), MAT-STEEL (te), MAT-SPOOL (ea), MAT-CABLE (m) — non-hour units of measure. |
| Roles | ROLE-PF / ROLE-WD / ROLE-EIT on A7200, A8300. |
| Duration types | FIXED_UNITS (A4330, A7100) · FIXED_UNITS_TIME (A7200) · FIXED_DURATION_AND_UNITS (A3010, A7400) · FIXED_DURATION_AND_UNITS_TIME (default). `Units = Duration × Units/Time` — check which term flexes. |
| % complete types | DURATION (default) · PHYSICAL via weighted steps (A4200, A7100) · UNITS (A8010 — metres of cable / 12,000). |
| Cost overrun | A4100 actual units 1,860 vs budget 1,800 → CPI < 1.0. A4200 at-completion 2,400 vs 2,000. |
| Expenses | Accrual START (A6100, £45k crane mob) · UNIFORM (A3010, A10300) · END (A12500). |

---

## 8. Scenarios

Each flips exactly one option. **A scenario that produces dates identical to S02 means that option is not implemented.**

| ID | Flips | Must change |
|---|---|---|
| S01 | Data date = project start, actuals stripped | Snapshot as Baseline BL1 |
| **S02** | *(default)* | — the primary run |
| **S03** | `PROGRESS_OVERRIDE` | A4220 → A4300 |
| S04 | `ACTUAL_DATES` | A4220 |
| **S05** | Lag calendar = SUCCESSOR | A8300 moves; **A4440 must NOT** (explicit 24H override) |
| S06 | Lag calendar = 24_HOUR | Every lagged edge; check the negative ones |
| **S07** | Critical = LONGEST_PATH | A12700 drops out of the critical set |
| S08 | Open ends critical | A9500, A3900, A12700 |
| S09 | Ignore external relationships | All five external early starts drop; procurement chain pulls left |
| S10 | Level resources | A6100/A6200, A7700/A7730 serialise |
| S11 | Multiple float paths (target A12500) | 10 contiguous paths |
| S12 | Expected finish OFF | A6200 |
| S13 | Total float = START_FLOAT | A4340, A7710, A11100, A5500 |

---

## 9. Negative cases (`negative_cases.json`)

18 hostile inputs. Load one at a time; the engine must reject, repair or report — **never hang, crash or silently produce nonsense.**

Highlights:

- **N11 — zero-working-hour calendar.** *The hang test.* A calendar with no working time at all. Any naive "advance to the next working hour" loop spins forever. Every calendar walker needs an iteration cap and a "no working time within N years" error.
- **N03 — SS/FF cycle.** A loop that exists only through SS + FF edges. It looks exactly like ordinary ladder logic and trips FS-only cycle detectors.
- **N10 — impossible mandatory pair.** Mandatory Finish earlier than the predecessor's Mandatory Start. P6 produces the impossible schedule and shows the violation. So must you.
- **N04 — duplicate relationship.** P6 permits only one relationship per activity pair. Decide: reject, dedupe, or keep both and take the most constraining — and write it down.
- **N13 — lead pulling before the data date.** The data date is a hard floor for remaining work; the lead must be truncated, not honoured.
- **N16 — 100,000-hour lag** (~48 years on CAL-01). Your date walker needs a horizon.

---

## A note on scope

If you're still deciding between Bryntum/DHTMLX and rolling your own: this fixture is also a decent buying test. Load it into the candidate engine and count how many of the 13 scenarios it can even *express*. Most commercial Gantt components handle the four link types and lags well, and then stop — LOE activities, resource-dependent scheduling, per-relationship lag calendars, retained-logic-vs-progress-override, mandatory constraints that legitimately break logic, and multiple float paths are where the gap opens up. Whether that gap matters depends entirely on whether your users are planners or viewers.
