# Re-layout quality — M2 verdict (the starts, and where CQ-2 lets them run)

- **Conditions:** [`conditions.md`](./conditions.md), committed alone at `5f8e5cf9` before any reading. No bar
  below was moved.
- **Instrument:** `apps/web/scripts/measure-relayout.mjs` at `9c56c628` (plus the `--corpus` option added
  with this reading), `--skip-capture` against the committed corpus, real module workers, headless
  Chromium in the container, 2026-10-17. Raw records: [`m2-report-gate300-9c56c628.md`](./m2-report-gate300-9c56c628.md)
  / `.json` (gate at 300) and [`m2-report-gate10-9c56c628.md`](./m2-report-gate10-9c56c628.md) (gate at 10).

## FC-R6 fails, and no size worth having passes it

With the gate at 300 (up to four starts) `scale-275` (300 drawn) waited **90.1 s against today's 24.7 s,
3.27x**; one worker would wait 4.10x. The starts each cost more than today's single search (they search
from a start with the `current` row budget), so parallelism cannot bring the ratio near 1.5x.

CQ-2's remedy is to run the extra starts "only below a measured size". `scale-275` is the only generated
plan in the corpus, and a generated plan needs the API to schedule it, so the sizes below are
**deterministic subsamples** of it: the first N drawn activities by (drawn start, id), the links between
them, lanes renumbered densely, `packChanges` recomputed with the product's own `packLanes` call. The
subsample is a prefix of the programme, so it is shorter in time and denser in logic than a plan of that
size would be; it is a measurement of cost against size, not a corpus plan. Each size was timed three
times per sitting; the ratio is median pool wait over median today wait. Machine load varied between
sittings (load average 0.8 to 6, other agents share the machine), which moves the small, sub-100 ms
figures most.

| Drawn | Starts that ran | Workers | Today (ms)            | Product (ms)          | Ratio | Sitting |
| ----: | --------------- | ------: | --------------------- | --------------------- | ----: | ------- |
|     6 | 0,2             |       2 | 37 / 29 / 25          | 37 / 41 / 42          |  1.43 | 4       |
|     8 | 0,2             |       2 | 40 / 33 / 44          | 55 / 57 / 67          |  1.42 | 4       |
|    10 | 0,2             |       2 | 63 / 30 / 35          | 37 / 36 / 39          |  1.06 | 2       |
|    10 | 0,2             |       2 | 33 / 36 / 32          | 52 / 45 / 44          |  1.37 | 4       |
|    11 | 0,2             |       2 | 38 / 42 / 41          | 43 / 44 / 65          |  1.07 | 4       |
|    12 | 0,2             |       2 | 61 / 42 / 40          | 87 / 58 / 72          |  1.70 | 3       |
|    12 | 0,2             |       2 | 48 / 38 / 39          | 68 / 57 / 56          |  1.46 | 4       |
|    15 | 0,2             |       2 | 72 / 70 / 60          | 107 / 91 / 81         |  1.31 | 2       |
|    15 | 0,2             |       2 | 71 / 65 / 85          | 128 / 93 / 118        |  1.67 | 3       |
|    16 | 0,2             |       2 | 90 / 55 / 57          | 145 / 146 / 149       |  2.57 | 3       |
|    17 | 0,2             |       2 | 107 / 80 / 61         | 137 / 139 / 133       |  1.71 | 3       |
|    18 | 0,1,2           |       3 | 64 / 72 / 74          | 228 / 217 / 207       |  3.01 | 3       |
|    19 | 0,1,2           |       3 | 73 / 67 / 70          | 191 / 194 / 215       |  2.76 | 3       |
|    20 | 0,1,2           |       3 | 83 / 73 / 76          | 233 / 242 / 245       |  3.19 | 2       |
|    20 | 0,1,2           |       3 | 87 / 108 / 114        | 213 / 239 / 239       |  2.20 | 3       |
|    25 | 0,1,2,3         |       3 | 121 / 112 / 105       | 1019 / 1043 / 901     |  9.12 | 3       |
|    30 | 0,1,2,3         |       3 | 489 / 409 / 404       | 1155 / 1172 / 1152    |  2.83 | 2       |
|    40 | 0,1,2,3         |       3 | 291 / 339 / 286       | 1250 / 1254 / 1265    |  4.31 | 2       |
|    50 | 0,1,2,3         |       3 | 484 / 460 / 385       | 3074 / 2725 / 3482    |  6.68 | 1       |
|    50 | 0,1,2,3         |       3 | 369 / 380 / 374       | 1784 / 1839 / 2024    |  4.92 | 4       |
|    75 | 0,1,2,3         |       3 | 1078 / 1251 / 1151    | 6135 / 5862 / 5758    |  5.09 | 1       |
|   100 | 0,1,2,3         |       3 | 3896 / 3235 / 3457    | 15044 / 14075 / 13831 |  4.07 | 1       |
|   100 | 0,1,2,3         |       3 | 2585 / 2200 / 2249    | 7369 / 7695 / 7677    |  3.41 | 4       |
|   150 | 0,1,2,3         |       3 | 6673 / 7129 / 6064    | 27220 / 26365 / 25723 |  3.95 | 1       |
|   200 | 0,1,2,3         |       3 | 10627 / 8268 / 8689   | 31657 / 26882 / 32895 |  3.64 | 1       |
|   250 | 0,1,2,3         |       3 | 14187 / 15266 / 16038 | 59261 / 65680 / 68066 |  4.30 | 1       |
|   300 | 0,1,2,3         |       3 | 24653 / 27649         | 90106 / 90325         |  3.27 | FC-R6   |

Largest size under 1.5x in **every** sitting: **10** (1.06, 1.37; 11 passed its one sitting at 1.07; 12 and
15 each passed once and failed once). At 10 the wait is about 40 ms either way, so the ratio there is
mostly thread start-up. **`RELAYOUT_MULTISTART_MAX_ACTIVITIES` is set to 10**; above it Re-layout searches
from start 0 only (today's M1 behaviour).

## Verdicts with the gate at 10 (full bench, product build detected as `m2`)

| ID    | Verdict  | Reading                                                                                                                                 |
| ----- | -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| FC-R0 | NOT RUN  | Needs the servers; not taken in this sitting.                                                                                           |
| FC-R1 | PASS     | Hand layout 1 crossing; today's Re-layout 9 crossings and 1 overlap on the reference plan.                                              |
| FC-R2 | PASS     | 0 violations over 30 plans.                                                                                                             |
| FC-R3 | **FAIL** | Candidate 3 crossings, 1 contact on the reference plan; the hand layout has 1 crossing, 0 contacts.                                     |
| FC-R4 | **FAIL** | Strictly better than today on the reference plan only (of fixture, reference, scale).                                                   |
| FC-R5 | REPORT   | No plan raises max abs(dlane) by more than 50 % (the candidate is today's on the fixture and the scale plan, which are above the gate). |
| FC-R6 | PASS     | `scale-275`: 1.17x (24259 / 27616 ms against 21266 / 23586 ms); the product runs start 0 in one worker.                                 |
| FC-R7 | PASS     | Byte-identical lanes across repeats and reversed input.                                                                                 |
| FC-R8 | PASS     | Tidy's lanes match the baseline on 30 plans.                                                                                            |
| FC-R9 | PASS     | Nothing under `apps/api/` or `packages/layout/src/` changed.                                                                            |

## The trade, stated plainly

The starts are what close the reference-plan gap: with start 2 the reference plan matches the hand layout
(1 crossing, 0 overlaps, 14 rows; FC-R3 and FC-R4 pass), and the fixture and `scale-275` improve (fixture
171 to 119 crossings, scale 343 to 226). They cost 3x to 15x today's wait at 58 drawn activities and
above (the reference plan alone: 272 ms today, about 3.6 s of search across the starts). A gate at 10
satisfies CQ-2 literally and takes that gain away from every plan a planner would actually press
Re-layout on. FC-R3 and FC-R4 then fail, and the epic's headline claim is not met.

The two bars cannot both hold. Options, none taken here, all the owner's:

1. Keep CQ-2 as written (gate 10). Ships M1's lever only; FC-R3/FC-R4 fail and are recorded as such.
2. Loosen CQ-2 to an absolute wait (for example, a few seconds at 60 activities) so the starts run on
   plans like the reference plan. That is a change to an approved condition, so it is not made here.
3. Gate at 150 (reference and fixture inside, scale outside). FC-R6 fails by CQ-2's own terms, FC-R5
   fires on the fixture (max abs(dlane) 16 to 28, rows 24 to 35), and FC-R4 then rests on two plans.

## FC-R5 pictures (the fixture is outside a gate of 10, so FC-R5 does not fire; these show option 3)

Painted by the real `paintScene` through `apps/web/scripts/shoot-relayout.mjs`, whole plan, lane 0 at the
top, identical framing; only the lanes differ. Lanes are those recorded in the gate-300 report.

- `pictures/fixture-p6-torture-v1-{hand,today,candidate}.png`: today 24 rows, candidate 35 rows.
- `pictures/reference-netpoint-power-plant-{hand,today,candidate}.png`: today 11 rows, candidate 14 rows.

## Owner decision 2026-10-18: a size limit of 150 replaces FC-R6's 1.5x bar

The two bars above could not both hold, and the options were put to the owner with the reference-plan
pictures (today 9 crossings, candidate 1, hand layout 1). The owner chose a variant of option 3 and, when
re-asked, confirmed it: `RELAYOUT_MULTISTART_MAX_ACTIVITIES` is **150**. Plans of up to about 150 drawn
activities search from all four starts (the wait is cancellable); bigger plans keep the single pack start
(M1's behaviour). **FC-R6's 1.5x bar is superseded by that size limit** (spec, CQ-2, "Owner amendment
2026-10-18"; `conditions.md` at `5f8e5cf9` is untouched). The owner accepted knowingly that
`fixture-p6-torture-v1` (147 drawn, inside the limit) spreads from 24 to 35 rows, which is FC-R5 firing; its
pictures are `pictures/fixture-p6-torture-v1-today.png` and `-candidate.png`, kept as the evidence decided on.

Re-run with the gate at 150 (`--skip-capture`, product detected as `m2`, tree at `56a6d1e5` plus the gate
change). Raw record: [`m2-report-gate150-56a6d1e5.md`](./m2-report-gate150-56a6d1e5.md) / `.json`.

| ID    | Verdict    | Reading                                                                                                                                                                                               |
| ----- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FC-R0 | NOT RUN    | Needs the servers; not taken in this sitting.                                                                                                                                                         |
| FC-R1 | PASS       | Hand 1 crossing; today's Re-layout 9 crossings and 1 overlap on the reference plan.                                                                                                                   |
| FC-R2 | PASS       | 0 violations over 30 plans.                                                                                                                                                                           |
| FC-R3 | **PASS**   | Reference plan: candidate 0 overlaps, 1 crossing, 14 rows (start 2, depth-first pack); the hand layout has 1 crossing. It has 2 contacts to the hand layout's 0.                                      |
| FC-R4 | **PASS**   | Strictly better than today on the fixture and the reference plan (of fixture, reference, scale). `scale-275` is outside the limit and identical to today's.                                           |
| FC-R5 | **FAIL**   | `fixture-p6-torture-v1`: rows 24 to 35, max abs(dlane) 16 to 28. Accepted by the owner (above). Reference 10 to 11 and `scale-275` 13 to 13 do not rise by over 50 %.                                 |
| FC-R6 | SUPERSEDED | Its 1.5x bar no longer governs. Measured for the record: `scale-275` (300, outside) 1.00x; reference plan 309 / 365 ms today against 3594 / 3554 ms; fixture 5184 / 4664 ms against 25652 / 30510 ms. |
| FC-R7 | PASS       | Byte-identical lanes across repeats and reversed input.                                                                                                                                               |
| FC-R8 | PASS       | Tidy's lanes match the baseline on 30 plans.                                                                                                                                                          |
| FC-R9 | PASS       | Nothing under `apps/api/` or `packages/layout/src/` changed.                                                                                                                                          |

The fixture's wait (about 5 s to about 28 s, five- to six-fold) is the largest cost inside the limit; the
reference plan's (0.3 s to 3.6 s) is the one the owner saw. The bench's candidate times are its own
measurement of the product's search, not the pool's wall clock on a planner's machine.

**M3 (chain and row moves) is not built.** The plan builds it only if M2 still misses FC-R3. FC-R3 now
passes on the reference plan with the starts alone, so there is nothing for it to close.
