# Re-layout quality benchmark

- commit `bad55f5472e6ac354d833c6c501adf0e1b16e1e4`, 2026-10-18T09:39:40.020Z
- command: `node scripts/measure-relayout.mjs `
- candidate product; budgets seed,current; starts 0; runs 2; product m2
- corpus captured 2026-10-18T09:33:21.992Z at `bad55f5472e6ac354d833c6c501adf0e1b16e1e4`, 30 plans, scale plan 275 leaves
- conditions: docs/specs/relayout-quality/conditions.md

## Verdicts

### FC-R0: PASS

- AGREE reference-netpoint-power-plant tidy Activities moved: bench 25 | dialog 25
- AGREE reference-netpoint-power-plant tidy Lanes: bench 14 → 13 | dialog 14 → 13
- AGREE reference-netpoint-power-plant tidy Overlaps: bench 0 | dialog 0
- AGREE reference-netpoint-power-plant tidy Links behind bars: bench 0 | dialog 0
- AGREE reference-netpoint-power-plant tidy Crossings: bench 1 | dialog 1
- AGREE reference-netpoint-power-plant relayout Activities moved: bench 56 | dialog 56
- AGREE reference-netpoint-power-plant relayout Lanes: bench 14 | dialog 14
- AGREE reference-netpoint-power-plant relayout Overlaps: bench 0 | dialog 0
- AGREE reference-netpoint-power-plant relayout Links behind bars: bench 0 | dialog 0
- AGREE reference-netpoint-power-plant relayout Crossings: bench 1 | dialog 1
- AGREE fixture-p6-torture-v1 tidy Activities moved: bench 146 | dialog 146
- AGREE fixture-p6-torture-v1 tidy Lanes: bench 1 → 24 | dialog 1 → 24
- AGREE fixture-p6-torture-v1 tidy Overlaps: bench 2277 → 4 | dialog 2277 → 4
- AGREE fixture-p6-torture-v1 tidy Links behind bars: bench 14 → 1 | dialog 14 → 1
- AGREE fixture-p6-torture-v1 tidy Crossings: bench 689 → 294 | dialog 689 → 294
- AGREE fixture-p6-torture-v1 relayout Activities moved: bench 137 | dialog 137
- AGREE fixture-p6-torture-v1 relayout Lanes: bench 1 → 35 | dialog 1 → 35
- AGREE fixture-p6-torture-v1 relayout Overlaps: bench 2277 → 0 | dialog 2277 → 0
- AGREE fixture-p6-torture-v1 relayout Links behind bars: bench 14 → 0 | dialog 14 → 0
- AGREE fixture-p6-torture-v1 relayout Crossings: bench 689 → 119 | dialog 689 → 119

### FC-R1: PASS

- hand : overlaps 0, behind 0, crossings 1, contacts 0, same-row 29, travel 102, rows 14
- today : overlaps 1, behind 0, crossings 9, contacts 4, same-row 29, travel 135, rows 11
- today's Re-layout is worse than the hand layout on (overlaps, behind, crossings): the problem is real

### FC-R2: PASS

- 0 violations over 30 plans

### FC-R3: PASS

- hand : overlaps 0, behind 0, crossings 1, contacts 0, same-row 29, travel 102, rows 14
- candidate : overlaps 0, behind 0, crossings 1, contacts 2, same-row 27, travel 132, rows 14

### FC-R4: PASS

- strictly better than today on: fixture, reference (of fixture, reference, scale)

### FC-R5: FAIL

- fixture-p6-torture-v1: hand rows 1, mean |dlane| 0.00, max 0 | today rows 24, mean |dlane| 2.67, max 16 | candidate rows 35, mean |dlane| 4.73, max 28
- reference-netpoint-power-plant: hand rows 14, mean |dlane| 1.50, max 8 | today rows 11, mean |dlane| 1.99, max 10 | candidate rows 14, mean |dlane| 1.94, max 11
- scale-275: hand rows 1, mean |dlane| 0.00, max 0 | today rows 25, mean |dlane| 1.66, max 13 | candidate rows 25, mean |dlane| 1.66, max 13
- maximum |dlane| rose by more than 50 % on: fixture-p6-torture-v1 - to the product owner with pictures before it ships
- pictures: not produced by this script (shoot-layouts.mjs, plan M0-T5)

### FC-R6: PASS

- scale-275: 300 drawn activities, real module workers
- today : 18882 / 17547 ms (one search in one worker)
- product : 18118 / 17989 ms (starts 0 in 1 workers)
- ratio : 0.96x; one worker would wait 0.96x (18086 ms)
- evaluations 1765 against a cap of 2000 (starts x 2,000)
- within 1.5x at this size: the gate may stand at it

### FC-R7: PASS

- byte-identical lanes across repeats and reversed input

### FC-R8: FAIL

- fixture-p6-torture-v1: Tidy's lanes differ from the baseline
- capability-logic-fs-ss: Tidy's lanes differ from the baseline
- capability-logic-ff-sf: Tidy's lanes differ from the baseline
- capability-redundant-logic: Tidy's lanes differ from the baseline
- capability-redundant-logic-calendars: Tidy's lanes differ from the baseline
- capability-redundant-logic-kept: Tidy's lanes differ from the baseline
- capability-redundant-logic-unchecked: Tidy's lanes differ from the baseline
- capability-network-shape: Tidy's lanes differ from the baseline
- capability-float: Tidy's lanes differ from the baseline
- capability-constraints: Tidy's lanes differ from the baseline
- capability-expected-finish: Tidy's lanes differ from the baseline
- capability-snet-effects: Tidy's lanes differ from the baseline
- capability-calendars: Tidy's lanes differ from the baseline
- capability-shift-calendars: Tidy's lanes differ from the baseline
- capability-progress: Tidy's lanes differ from the baseline
- capability-retained-logic: Tidy's lanes differ from the baseline
- capability-progress-override: Tidy's lanes differ from the baseline
- capability-types-and-wbs: Tidy's lanes differ from the baseline
- capability-resources: Tidy's lanes differ from the baseline
- capability-levelling: Tidy's lanes differ from the baseline
- capability-levelling-placed: Tidy's lanes differ from the baseline
- capability-levelling-part-day: Tidy's lanes differ from the baseline
- capability-levelling-chain: Tidy's lanes differ from the baseline
- capability-cost-and-ev: Tidy's lanes differ from the baseline
- capability-external-dates: Tidy's lanes differ from the baseline
- capability-external-ignored: Tidy's lanes differ from the baseline
- capability-placements: Tidy's lanes differ from the baseline
- capability-placement-on-early: Tidy's lanes differ from the baseline
- reference-netpoint-power-plant: Tidy's lanes differ from the baseline
- scale-275: Tidy's lanes differ from the baseline

### FC-R9: PASS

- no file under apps/api/ or packages/layout/src/ changed

## Figures

| Plan                                 | Drawn | Layout                                                    | Rows | Behind | Crossings | Overlaps | Contacts | Same-row | Travel | Bends | Crit rows | Crit off-row | Mean/max dlane | Evals | ms            |
| ------------------------------------ | ----: | --------------------------------------------------------- | ---: | -----: | --------: | -------: | -------: | -------: | -----: | ----: | --------: | -----------: | -------------- | ----: | ------------- |
| fixture-p6-torture-v1                |   147 | hand                                                      |    1 |     14 |       689 |     2277 |      115 |      188 |      0 |   286 |         1 |         0/65 | 0.00/0         |       |               |
| fixture-p6-torture-v1                |   147 | Tidy                                                      |   24 |      1 |       294 |        4 |       38 |       19 |    792 |   280 |        17 |        56/65 | 4.21/15        |   117 | 821 / 726     |
| fixture-p6-torture-v1                |   147 | Re-layout (today)                                         |   24 |      0 |       171 |        0 |        8 |       37 |    502 |   253 |        14 |        53/65 | 2.67/16        |   892 | 4399 / 4011   |
| fixture-p6-torture-v1                |   147 | candidate: Re-layout (product: start 1, chain rows)       |   35 |      0 |       119 |        0 |        2 |       39 |    890 |   241 |        17 |        54/65 | 4.73/28        |  4796 | 22182 / 22925 |
| capability-logic-fs-ss               |    11 | hand                                                      |    1 |      0 |         1 |       26 |        9 |        8 |      0 |     8 |         1 |          0/1 | 0.00/0         |       |               |
| capability-logic-fs-ss               |    11 | Tidy                                                      |    7 |      0 |         0 |        0 |        2 |        1 |     15 |     8 |         2 |          1/1 | 1.88/5         |    25 | 12 / 6        |
| capability-logic-fs-ss               |    11 | Re-layout (today)                                         |    7 |      0 |         0 |        0 |        0 |        3 |      6 |     8 |         1 |          0/1 | 0.75/2         |    44 | 11 / 7        |
| capability-logic-fs-ss               |    11 | candidate: Re-layout (product: start 0, pack (today))     |    7 |      0 |         0 |        0 |        0 |        3 |      6 |     8 |         1 |          0/1 | 0.75/2         |   170 | 22 / 30       |
| capability-logic-ff-sf               |     8 | hand                                                      |    1 |      0 |         0 |       28 |        5 |        6 |      0 |    10 |         1 |          0/1 | 0.00/0         |       |               |
| capability-logic-ff-sf               |     8 | Tidy                                                      |    8 |      0 |         0 |        0 |        0 |        0 |     12 |    10 |         2 |          1/1 | 2.00/6         |    16 | 6 / 5         |
| capability-logic-ff-sf               |     8 | Re-layout (today)                                         |    8 |      0 |         0 |        0 |        0 |        0 |     12 |    10 |         2 |          1/1 | 2.00/6         |    16 | 4 / 3         |
| capability-logic-ff-sf               |     8 | candidate: Re-layout (product: start 1, chain rows)       |    8 |      0 |         0 |        0 |        0 |        0 |      8 |    12 |         2 |          1/1 | 1.33/2         |    62 | 7 / 8         |
| capability-redundant-logic           |    15 | hand                                                      |    1 |      0 |         7 |       26 |       14 |       15 |      0 |    14 |         1 |          0/2 | 0.00/0         |       |               |
| capability-redundant-logic           |    15 | Tidy                                                      |    5 |      0 |         3 |        0 |        7 |        7 |     10 |    12 |         2 |          1/2 | 0.67/2         |    10 | 3 / 4         |
| capability-redundant-logic           |    15 | Re-layout (today)                                         |    5 |      0 |         0 |        0 |        2 |       13 |      2 |    14 |         1 |          0/2 | 0.13/1         |    31 | 7 / 8         |
| capability-redundant-logic           |    15 | candidate: Re-layout (product: start 0, pack (today))     |    5 |      0 |         0 |        0 |        2 |       13 |      2 |    14 |         1 |          0/2 | 0.13/1         |    51 | 14 / 18       |
| capability-redundant-logic-calendars |    10 | hand                                                      |    1 |      0 |         1 |       25 |        9 |       10 |      0 |     6 |         1 |          0/1 | 0.00/0         |       |               |
| capability-redundant-logic-calendars |    10 | Tidy                                                      |    6 |      0 |         0 |        0 |        1 |        4 |      6 |     3 |         1 |          0/1 | 0.60/1         |    19 | 7 / 3         |
| capability-redundant-logic-calendars |    10 | Re-layout (today)                                         |    6 |      0 |         0 |        0 |        1 |        4 |      6 |     3 |         1 |          0/1 | 0.60/1         |    33 | 7 / 5         |
| capability-redundant-logic-calendars |    10 | candidate: Re-layout (product: start 0, pack (today))     |    6 |      0 |         0 |        0 |        1 |        4 |      6 |     3 |         1 |          0/1 | 0.60/1         |    91 | 14 / 13       |
| capability-redundant-logic-kept      |    15 | hand                                                      |    1 |      0 |         7 |       33 |       10 |       15 |      0 |    16 |         1 |          0/1 | 0.00/0         |       |               |
| capability-redundant-logic-kept      |    15 | Tidy                                                      |    6 |      0 |         2 |        0 |        7 |        4 |     14 |    16 |         1 |          0/1 | 0.93/2         |     7 | 2 / 3         |
| capability-redundant-logic-kept      |    15 | Re-layout (today)                                         |    6 |      0 |         2 |        0 |        4 |        4 |     16 |    16 |         2 |          1/1 | 1.07/3         |    27 | 11 / 7        |
| capability-redundant-logic-kept      |    15 | candidate: Re-layout (product: start 1, chain rows)       |    8 |      0 |         0 |        0 |        0 |        9 |      6 |    14 |         1 |          0/1 | 0.40/1         |   154 | 44 / 52       |
| capability-redundant-logic-unchecked |    12 | hand                                                      |    1 |      0 |         2 |       17 |        8 |       12 |      0 |    14 |         1 |          0/0 | 0.00/0         |       |               |
| capability-redundant-logic-unchecked |    12 | Tidy                                                      |    5 |      0 |         0 |        0 |        3 |        3 |     10 |    13 |         2 |          0/0 | 0.83/2         |    24 | 16 / 9        |
| capability-redundant-logic-unchecked |    12 | Re-layout (today)                                         |    5 |      0 |         0 |        0 |        1 |        8 |      4 |    14 |         3 |          0/0 | 0.33/1         |    31 | 7 / 7         |
| capability-redundant-logic-unchecked |    12 | candidate: Re-layout (product: start 0, pack (today))     |    5 |      0 |         0 |        0 |        1 |        8 |      4 |    14 |         3 |          0/0 | 0.33/1         |   171 | 44 / 39       |
| capability-network-shape             |     9 | hand                                                      |    1 |      0 |         0 |        7 |        7 |        7 |      0 |     2 |         1 |          0/3 | 0.00/0         |       |               |
| capability-network-shape             |     9 | Tidy                                                      |    3 |      0 |         0 |        0 |        1 |        4 |      3 |     0 |         2 |          2/3 | 0.43/1         |     4 | 1 / 1         |
| capability-network-shape             |     9 | Re-layout (today)                                         |    3 |      0 |         0 |        0 |        1 |        4 |      3 |     0 |         2 |          3/3 | 0.43/1         |     8 | 2 / 1         |
| capability-network-shape             |     9 | candidate: Re-layout (product: start 0, pack (today))     |    3 |      0 |         0 |        0 |        1 |        4 |      3 |     0 |         2 |          3/3 | 0.43/1         |    30 | 4 / 7         |
| capability-float                     |     6 | hand                                                      |    1 |      0 |         0 |        4 |        4 |        4 |      0 |     2 |         1 |          0/2 | 0.00/0         |       |               |
| capability-float                     |     6 | Tidy                                                      |    3 |      0 |         0 |        0 |        0 |        3 |      1 |     2 |         1 |          0/2 | 0.25/1         |     4 | 0 / 0         |
| capability-float                     |     6 | Re-layout (today)                                         |    3 |      0 |         0 |        0 |        0 |        3 |      1 |     0 |         1 |          0/2 | 0.25/1         |    14 | 1 / 1         |
| capability-float                     |     6 | candidate: Re-layout (product: start 0, pack (today))     |    3 |      0 |         0 |        0 |        0 |        3 |      1 |     0 |         1 |          0/2 | 0.25/1         |    50 | 4 / 3         |
| capability-constraints               |    12 | hand                                                      |    1 |      0 |        14 |       19 |       10 |       11 |      0 |    22 |         1 |          0/1 | 0.00/0         |       |               |
| capability-constraints               |    12 | Tidy                                                      |    5 |      0 |         9 |        0 |        3 |        4 |     16 |    20 |         4 |          1/1 | 1.45/4         |     6 | 1 / 1         |
| capability-constraints               |    12 | Re-layout (today)                                         |    5 |      0 |         2 |        0 |        2 |        2 |     16 |    20 |         4 |          1/1 | 1.45/3         |    55 | 17 / 11       |
| capability-constraints               |    12 | candidate: Re-layout (product: start 1, chain rows)       |    6 |      0 |         1 |        0 |        2 |        2 |     16 |    20 |         5 |          1/1 | 1.45/4         |    95 | 27 / 33       |
| capability-expected-finish           |     3 | hand                                                      |    1 |      0 |         0 |        1 |        0 |        2 |      0 |     2 |         1 |          0/1 | 0.00/0         |       |               |
| capability-expected-finish           |     3 | Tidy                                                      |    2 |      0 |         0 |        0 |        0 |        0 |      2 |     2 |         2 |          1/1 | 1.00/1         |     3 | 1 / 1         |
| capability-expected-finish           |     3 | Re-layout (today)                                         |    2 |      0 |         0 |        0 |        0 |        1 |      1 |     2 |         2 |          0/1 | 0.50/1         |     4 | 1 / 0         |
| capability-expected-finish           |     3 | candidate: Re-layout (product: start 0, pack (today))     |    2 |      0 |         0 |        0 |        0 |        1 |      1 |     2 |         2 |          0/1 | 0.50/1         |    10 | 1 / 3         |
| capability-snet-effects              |     4 | hand                                                      |    1 |      0 |         1 |        3 |        1 |        2 |      0 |     4 |         1 |          0/0 | 0.00/0         |       |               |
| capability-snet-effects              |     4 | Tidy                                                      |    2 |      0 |         0 |        0 |        0 |        2 |      0 |     2 |         1 |          0/0 | 0.00/0         |     3 | 1 / 0         |
| capability-snet-effects              |     4 | Re-layout (today)                                         |    2 |      0 |         0 |        0 |        0 |        2 |      0 |     2 |         1 |          0/0 | 0.00/0         |     3 | 0 / 0         |
| capability-snet-effects              |     4 | candidate: Re-layout (product: start 0, pack (today))     |    2 |      0 |         0 |        0 |        0 |        2 |      0 |     2 |         1 |          0/0 | 0.00/0         |    15 | 1 / 1         |
| capability-calendars                 |     8 | hand                                                      |    1 |      0 |         0 |       23 |        7 |        1 |      0 |     2 |         1 |          0/1 | 0.00/0         |       |               |
| capability-calendars                 |     8 | Tidy                                                      |    7 |      0 |         0 |        0 |        0 |        1 |      0 |     0 |         2 |          0/1 | 0.00/0         |     8 | 1 / 1         |
| capability-calendars                 |     8 | Re-layout (today)                                         |    7 |      0 |         0 |        0 |        0 |        1 |      0 |     0 |         2 |          0/1 | 0.00/0         |    10 | 1 / 1         |
| capability-calendars                 |     8 | candidate: Re-layout (product: start 0, pack (today))     |    7 |      0 |         0 |        0 |        0 |        1 |      0 |     0 |         2 |          0/1 | 0.00/0         |    19 | 1 / 1         |
| capability-shift-calendars           |     9 | hand                                                      |    1 |      0 |         0 |       29 |        8 |        0 |      0 |     0 |         1 |          0/0 | 0.00/0         |       |               |
| capability-shift-calendars           |     9 | Tidy                                                      |    8 |      0 |         0 |        0 |        1 |        0 |      0 |     0 |         1 |          0/0 | 0.00/0         |     9 | 1 / 1         |
| capability-shift-calendars           |     9 | Re-layout (today)                                         |    8 |      0 |         0 |        0 |        0 |        0 |      0 |     0 |         1 |          0/0 | 0.00/0         |    11 | 1 / 1         |
| capability-shift-calendars           |     9 | candidate: Re-layout (product: start 0, pack (today))     |    8 |      0 |         0 |        0 |        0 |        0 |      0 |     0 |         1 |          0/0 | 0.00/0         |    22 | 1 / 1         |
| capability-progress                  |     9 | hand                                                      |    1 |      0 |         0 |       36 |        8 |        0 |      0 |     0 |         1 |          0/0 | 0.00/0         |       |               |
| capability-progress                  |     9 | Tidy                                                      |    9 |      0 |         0 |        0 |        0 |        0 |      0 |     0 |         2 |          0/0 | 0.00/0         |    10 | 1 / 1         |
| capability-progress                  |     9 | Re-layout (today)                                         |    9 |      0 |         0 |        0 |        0 |        0 |      0 |     0 |         2 |          0/0 | 0.00/0         |    10 | 1 / 1         |
| capability-progress                  |     9 | candidate: Re-layout (product: start 0, pack (today))     |    9 |      0 |         0 |        0 |        0 |        0 |      0 |     0 |         2 |          0/0 | 0.00/0         |    20 | 1 / 1         |
| capability-retained-logic            |     3 | hand                                                      |    1 |      0 |         0 |        1 |        0 |        2 |      0 |     2 |         1 |          0/1 | 0.00/0         |       |               |
| capability-retained-logic            |     3 | Tidy                                                      |    2 |      0 |         0 |        0 |        0 |        1 |      1 |     2 |         2 |          0/1 | 0.50/1         |     3 | 0 / 0         |
| capability-retained-logic            |     3 | Re-layout (today)                                         |    2 |      0 |         0 |        0 |        0 |        1 |      1 |     2 |         2 |          0/1 | 0.50/1         |     4 | 0 / 0         |
| capability-retained-logic            |     3 | candidate: Re-layout (product: start 0, pack (today))     |    2 |      0 |         0 |        0 |        0 |        1 |      1 |     2 |         2 |          0/1 | 0.50/1         |    10 | 0 / 0         |
| capability-progress-override         |     3 | hand                                                      |    1 |      0 |         0 |        2 |        1 |        2 |      0 |     2 |         1 |          0/1 | 0.00/0         |       |               |
| capability-progress-override         |     3 | Tidy                                                      |    2 |      0 |         0 |        0 |        0 |        1 |      1 |     2 |         2 |          0/1 | 0.50/1         |     3 | 0 / 0         |
| capability-progress-override         |     3 | Re-layout (today)                                         |    2 |      0 |         0 |        0 |        0 |        1 |      1 |     2 |         2 |          0/1 | 0.50/1         |     3 | 0 / 0         |
| capability-progress-override         |     3 | candidate: Re-layout (product: start 0, pack (today))     |    2 |      0 |         0 |        0 |        0 |        1 |      1 |     2 |         2 |          0/1 | 0.50/1         |     6 | 0 / 0         |
| capability-types-and-wbs             |    10 | hand                                                      |    1 |      7 |         0 |       30 |        7 |       10 |      0 |     4 |         1 |          0/4 | 0.00/0         |       |               |
| capability-types-and-wbs             |    10 | Tidy                                                      |    7 |      0 |         0 |        1 |        0 |        2 |     13 |     4 |         3 |          2/4 | 1.30/3         |    24 | 5 / 4         |
| capability-types-and-wbs             |    10 | Re-layout (today)                                         |    7 |      0 |         0 |        0 |        0 |        2 |     13 |     2 |         2 |          2/4 | 1.30/3         |    68 | 12 / 8        |
| capability-types-and-wbs             |    10 | candidate: Re-layout (product: start 0, pack (today))     |    7 |      0 |         0 |        0 |        0 |        2 |     13 |     2 |         2 |          2/4 | 1.30/3         |   165 | 26 / 29       |
| capability-resources                 |    15 | hand                                                      |    1 |      0 |         0 |      105 |       13 |        1 |      0 |     0 |         1 |          0/0 | 0.00/0         |       |               |
| capability-resources                 |    15 | Tidy                                                      |   15 |      0 |         0 |        0 |        0 |        0 |      1 |     0 |         1 |          0/0 | 1.00/1         |    16 | 2 / 2         |
| capability-resources                 |    15 | Re-layout (today)                                         |   15 |      0 |         0 |        0 |        0 |        0 |      1 |     0 |         1 |          0/0 | 1.00/1         |    16 | 1 / 1         |
| capability-resources                 |    15 | candidate: Re-layout (product: start 0, pack (today))     |   15 |      0 |         0 |        0 |        0 |        0 |      1 |     0 |         1 |          0/0 | 1.00/1         |    46 | 4 / 4         |
| capability-levelling                 |     5 | hand                                                      |    1 |      0 |         0 |        3 |        2 |        6 |      0 |     0 |         1 |          0/6 | 0.00/0         |       |               |
| capability-levelling                 |     5 | Tidy                                                      |    3 |      0 |         0 |        0 |        0 |        2 |      4 |     4 |         3 |          4/6 | 0.67/1         |    10 | 2 / 2         |
| capability-levelling                 |     5 | Re-layout (today)                                         |    3 |      0 |         0 |        0 |        0 |        2 |      4 |     4 |         3 |          4/6 | 0.67/1         |    14 | 2 / 1         |
| capability-levelling                 |     5 | candidate: Re-layout (product: start 0, pack (today))     |    3 |      0 |         0 |        0 |        0 |        2 |      4 |     4 |         3 |          4/6 | 0.67/1         |    28 | 4 / 3         |
| capability-levelling-placed          |     5 | hand                                                      |    1 |      0 |         2 |        1 |        1 |        6 |      0 |     6 |         1 |          0/6 | 0.00/0         |       |               |
| capability-levelling-placed          |     5 | Tidy                                                      |    2 |      0 |         1 |        0 |        0 |        4 |      2 |     5 |         2 |          2/6 | 0.33/1         |     3 | 1 / 1         |
| capability-levelling-placed          |     5 | Re-layout (today)                                         |    2 |      0 |         0 |        0 |        0 |        3 |      3 |     4 |         2 |          3/6 | 0.50/1         |    10 | 2 / 1         |
| capability-levelling-placed          |     5 | candidate: Re-layout (product: start 0, pack (today))     |    2 |      0 |         0 |        0 |        0 |        3 |      3 |     4 |         2 |          3/6 | 0.50/1         |    20 | 3 / 3         |
| capability-levelling-part-day        |     3 | hand                                                      |    1 |      0 |         0 |        1 |        1 |        2 |      0 |     0 |         1 |          0/1 | 0.00/0         |       |               |
| capability-levelling-part-day        |     3 | Tidy                                                      |    2 |      0 |         0 |        0 |        0 |        1 |      1 |     0 |         2 |          1/1 | 0.50/1         |     3 | 0 / 0         |
| capability-levelling-part-day        |     3 | Re-layout (today)                                         |    2 |      0 |         0 |        0 |        0 |        1 |      1 |     0 |         2 |          1/1 | 0.50/1         |     4 | 0 / 0         |
| capability-levelling-part-day        |     3 | candidate: Re-layout (product: start 0, pack (today))     |    2 |      0 |         0 |        0 |        0 |        1 |      1 |     0 |         2 |          1/1 | 0.50/1         |     4 | 0 / 0         |
| capability-levelling-chain           |     6 | hand                                                      |    1 |      0 |         0 |        9 |        5 |        3 |      0 |     2 |         1 |          0/1 | 0.00/0         |       |               |
| capability-levelling-chain           |     6 | Tidy                                                      |    4 |      0 |         0 |        0 |        1 |        1 |      2 |     0 |         3 |          1/1 | 0.67/1         |     8 | 1 / 1         |
| capability-levelling-chain           |     6 | Re-layout (today)                                         |    4 |      0 |         0 |        0 |        1 |        1 |      2 |     2 |         2 |          0/1 | 0.67/1         |    12 | 1 / 1         |
| capability-levelling-chain           |     6 | candidate: Re-layout (product: start 0, pack (today))     |    4 |      0 |         0 |        0 |        1 |        1 |      2 |     2 |         2 |          0/1 | 0.67/1         |    36 | 3 / 3         |
| capability-cost-and-ev               |     5 | hand                                                      |    1 |      0 |         0 |        1 |        2 |        3 |      0 |     0 |         1 |          0/3 | 0.00/0         |       |               |
| capability-cost-and-ev               |     5 | Tidy                                                      |    2 |      0 |         0 |        0 |        0 |        3 |      0 |     0 |         1 |          0/3 | 0.00/0         |     3 | 0 / 1         |
| capability-cost-and-ev               |     5 | Re-layout (today)                                         |    2 |      0 |         0 |        0 |        0 |        3 |      0 |     0 |         1 |          0/3 | 0.00/0         |     6 | 0 / 0         |
| capability-cost-and-ev               |     5 | candidate: Re-layout (product: start 0, pack (today))     |    2 |      0 |         0 |        0 |        0 |        3 |      0 |     0 |         1 |          0/3 | 0.00/0         |     6 | 0 / 0         |
| capability-external-dates            |     5 | hand                                                      |    1 |      0 |         0 |        1 |        2 |        2 |      0 |     0 |         1 |          0/0 | 0.00/0         |       |               |
| capability-external-dates            |     5 | Tidy                                                      |    2 |      0 |         0 |        0 |        1 |        1 |      1 |     0 |         1 |          0/0 | 0.50/1         |     3 | 0 / 0         |
| capability-external-dates            |     5 | Re-layout (today)                                         |    2 |      0 |         0 |        0 |        0 |        1 |      1 |     0 |         1 |          0/0 | 0.50/1         |    10 | 0 / 1         |
| capability-external-dates            |     5 | candidate: Re-layout (product: start 0, pack (today))     |    2 |      0 |         0 |        0 |        0 |        1 |      1 |     0 |         1 |          0/0 | 0.50/1         |    31 | 1 / 1         |
| capability-external-ignored          |     5 | hand                                                      |    1 |      0 |         0 |        8 |        4 |        2 |      0 |     0 |         1 |          0/2 | 0.00/0         |       |               |
| capability-external-ignored          |     5 | Tidy                                                      |    4 |      0 |         0 |        0 |        0 |        1 |      1 |     0 |         2 |          1/2 | 0.50/1         |     8 | 1 / 0         |
| capability-external-ignored          |     5 | Re-layout (today)                                         |    4 |      0 |         0 |        0 |        0 |        1 |      1 |     0 |         2 |          1/2 | 0.50/1         |    10 | 0 / 0         |
| capability-external-ignored          |     5 | candidate: Re-layout (product: start 0, pack (today))     |    4 |      0 |         0 |        0 |        0 |        1 |      1 |     0 |         2 |          1/2 | 0.50/1         |    10 | 0 / 1         |
| capability-placements                |     7 | hand                                                      |    1 |      0 |         4 |        5 |        3 |        7 |      0 |    12 |         1 |          0/2 | 0.00/0         |       |               |
| capability-placements                |     7 | Tidy                                                      |    3 |      0 |         0 |        0 |        0 |        3 |      4 |     9 |         2 |          2/2 | 0.57/1         |    11 | 2 / 1         |
| capability-placements                |     7 | Re-layout (today)                                         |    3 |      0 |         0 |        0 |        0 |        3 |      4 |     9 |         2 |          2/2 | 0.57/1         |    26 | 3 / 3         |
| capability-placements                |     7 | candidate: Re-layout (product: start 0, pack (today))     |    3 |      0 |         0 |        0 |        0 |        3 |      4 |     9 |         2 |          2/2 | 0.57/1         |    77 | 8 / 8         |
| capability-placement-on-early        |     3 | hand                                                      |    1 |      0 |         0 |        0 |        0 |        2 |      0 |     0 |         1 |          0/2 | 0.00/0         |       |               |
| capability-placement-on-early        |     3 | Tidy                                                      |    1 |      0 |         0 |        0 |        0 |        2 |      0 |     0 |         1 |          0/2 | 0.00/0         |     2 | 0 / 0         |
| capability-placement-on-early        |     3 | Re-layout (today)                                         |    1 |      0 |         0 |        0 |        0 |        2 |      0 |     0 |         1 |          0/2 | 0.00/0         |     2 | 0 / 0         |
| capability-placement-on-early        |     3 | candidate: Re-layout (product: start 0, pack (today))     |    1 |      0 |         0 |        0 |        0 |        2 |      0 |     0 |         1 |          0/2 | 0.00/0         |     2 | 0 / 0         |
| reference-netpoint-power-plant       |    58 | hand                                                      |   14 |      0 |         1 |        0 |        0 |       29 |    102 |    26 |         6 |         9/12 | 1.50/8         |       |               |
| reference-netpoint-power-plant       |    58 | Tidy                                                      |   13 |      0 |         1 |        0 |        0 |       35 |     73 |    22 |         7 |         9/12 | 1.07/6         |   703 | 703 / 556     |
| reference-netpoint-power-plant       |    58 | Re-layout (today)                                         |   11 |      0 |         9 |        1 |        4 |       29 |    135 |    34 |         8 |        10/12 | 1.99/10        |   233 | 183 / 258     |
| reference-netpoint-power-plant       |    58 | candidate: Re-layout (product: start 2, depth-first pack) |   14 |      0 |         1 |        0 |        2 |       27 |    132 |    27 |         7 |        11/12 | 1.94/11        |  2977 | 3160 / 2956   |
| scale-275                            |   300 | hand                                                      |    1 |     20 |      1426 |     3365 |      227 |      440 |      0 |   538 |         1 |         0/72 | 0.00/0         |       |               |
| scale-275                            |   300 | Tidy                                                      |   25 |      2 |      1023 |        2 |       94 |      102 |   1411 |   501 |        21 |        48/72 | 3.21/21        |   170 | 2300 / 2381   |
| scale-275                            |   300 | Re-layout (today)                                         |   25 |      2 |       343 |        0 |       25 |      183 |    730 |   426 |        19 |        40/72 | 1.66/13        |  1765 | 16894 / 17790 |
| scale-275                            |   300 | candidate: Re-layout (product: start 0, pack (today))     |   25 |      2 |       343 |        0 |       25 |      183 |    730 |   426 |        19 |        40/72 | 1.66/13        |  1765 | 16485 / 16923 |
