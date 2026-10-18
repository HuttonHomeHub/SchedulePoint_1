# Re-layout quality — M0 reading (first run)

- **Conditions:** [`conditions.md`](./conditions.md), committed alone at `5f8e5cf9` before any reading.
  No bar below was moved by this reading.
- **Instrument:** `apps/web/scripts/measure-relayout.mjs` at `1f2ad183`, run as
  `node scripts/measure-relayout.mjs` from `apps/web` with the defaults (`--budget=seed,current`,
  `--starts=0`, `--candidate=current:0`, `--runs=2`, `--product=today`), 2026-10-17.
- **Corpus:** [`apps/web/scripts/fixtures/relayout-corpus.json`](../../../apps/web/scripts/fixtures/relayout-corpus.json),
  captured 2026-10-17T21:11:08Z at `1f2ad183` through the public REST API: 30 plans, the generated
  scale plan at 275 leaves (300 drawn activities).
- **Raw record:** [`m0-report-1f2ad183.md`](./m0-report-1f2ad183.md) and
  [`m0-report-1f2ad183.json`](./m0-report-1f2ad183.json) (every run's lanes and vector).

## Verdicts

| ID    | Verdict | Reading                                                                                                                                  |
| ----- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| FC-R0 | FAIL    | Tidy agrees on all 10 figures; Re-layout disagrees on the reference plan. **An artefact of the run, not of the instrument** — see below. |
| FC-R1 | PASS    | The problem is real: hand layout 1 crossing, today's Re-layout 9 crossings and 1 overlap on the reference plan.                          |
| FC-R2 | PASS    | 0 violations over 30 plans (the candidate is never worse than today's Re-layout).                                                        |
| FC-R3 | FAIL    | The M1 lever reaches 3 crossings on the reference plan; the hand layout has 1.                                                           |
| FC-R4 | FAIL    | The M1 lever is strictly better than today's on the reference plan only, not on the fixture or `scale-275` (of three, one).              |
| FC-R5 | REPORT  | No plan raised the maximum \|Δlane\| by more than 50 %. Pictures not yet taken.                                                          |
| FC-R6 | PASS    | 0.99× on `scale-275` (17,620 / 18,097 ms against 18,366 / 18,208 ms), single thread; a projection, M2 measures it with real workers.     |
| FC-R7 | PASS    | Byte-identical lanes across repeats and reversed input.                                                                                  |
| FC-R8 | NOT RUN | No committed baseline existed.                                                                                                           |
| FC-R9 | PASS    | Nothing under `apps/api/` or `packages/layout/src/` changed.                                                                             |

## The reference plan (NetPoint power plant, 58 drawn activities)

| Layout                         | Overlaps | Behind | Crossings | Contacts | Same-row | Travel | Rows | Evaluations |
| ------------------------------ | -------: | -----: | --------: | -------: | -------: | -----: | ---: | ----------: |
| Hand (as seeded)               |        0 |      0 |         1 |        0 |       29 |    102 |   14 |             |
| Tidy                           |        0 |      0 |         1 |        0 |       35 |     73 |   13 |         703 |
| Re-layout, today (seed budget) |        1 |      0 |         9 |        4 |       29 |    135 |   11 |         233 |
| Re-layout, M1 (current budget) |        0 |      0 |         3 |        1 |       29 |    127 |   14 |         791 |

FC-R1 holds, so the epic continues. M1 closes most of the gap on this plan and the 14 rows are the
rows the diagram already has (CQ-1). It does not reach the hand layout (FC-R3), and on the fixture and
the scale plan it is identical to today's (FC-R4), because on those plans the pack already uses at least
as many rows as the diagram has. M1 alone therefore cannot satisfy FC-R4; M2 is what has to.

## The FC-R0 failure is an artefact, and why

FC-R0 asks that the bench's figures equal the Arrange dialog's for the same plan. The dialog the harness
drove ran this worktree's source, which already contained M1 (`9096e54d`: Re-layout's budget is the
taller of the current rows and the pack). The bench's "Re-layout" row, on the default `--product=today`,
ran **today's** seed budget. So the two sides measured different Re-layouts:

| Reference plan, Re-layout | Bench (today's budget) | Dialog (M1 code) | Bench candidate `current:0` |
| ------------------------- | ---------------------- | ---------------- | --------------------------- |
| Activities moved          | 55                     | 53               | 53                          |
| Lanes                     | 14 → 11                | 14               | 14                          |
| Overlaps                  | 0 → 1                  | 0                | 0                           |
| Crossings                 | 1 → 9                  | 1 → 3            | 3                           |
| Links behind bars         | 0                      | 0                | 0                           |

The dialog's figures equal the bench's M1 candidate on every row. Every Tidy figure (10 of 10) and the
fixture plan's Re-layout figures agree. This is stated as an artefact because the dialog matches the
candidate exactly, not because it was convenient: the disagreement is fully explained by the build the
dialog ran. It is nonetheless a defect in the harness, since a default run could compare an M1 dialog
with a today bench; the harness now detects which Re-layout the build under test contains and compares
the dialog against that one (see the commit after this record). FC-R0 is **re-taken** on that build
before any figure from this record is relied on for a shipping decision.

## Other observations

- The seeder prints `LOCKED` findings on recalculation while seeding. Expected: the capture
  recalculates holding the pen (`1f2ad183`), and the seeder's own recalculation runs after it releases it.
- Cost: `scale-275` Re-layout takes about 18 s single-threaded on this container, 1,765 evaluations.
- FC-R8 needs a baseline of Tidy's lane digests; obtaining it is the next commit.
