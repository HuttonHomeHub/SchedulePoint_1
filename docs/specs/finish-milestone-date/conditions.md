# Conditions and decisions: finish-milestone date (#381)

Committed before any engine change (M0-T1). Nothing below may be edited once M2 runs; a change is a
new dated section.

## Decisions (product owner, 2026-09-23)

| Question                                      | Decision                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Q1 — existing finish-milestone placements     | **A.** The migration rewrites each stored placement one day earlier. The diamond and the schedule do not move; only the printed date does. |
| Q2 — start-type inputs on a finish milestone  | **A.** Every date given for a finish milestone is read as the end of that day. The date typed is the date read back.                       |
| Q3 — baselines captured before the change     | **Moot.** The product owner reports no baselines have been captured on the installation.                                                   |
| Q4 — cross-plan links from a finish milestone | **A** (the recommended default; not put to the product owner): treated like any finish.                                                    |

## Scope reductions the decisions allow

- **M1 is withdrawn.** Its baseline rule column and rule-aware readers existed only to compare a
  baseline captured under the old rule with one under the new. With no baselines captured, there is
  nothing to protect. The accepted residual: a baseline captured on some other installation between
  now and the M2 release would be read under the new rule. The M2 release is the boundary.
- **M0-T3 (the staff diagnostic) is withdrawn.** It existed to inform Q1–Q4, which are decided, and
  the migration handles any number of placed milestones.

## Falsification conditions (spec §5, verbatim)

| ID   | Condition                                                                                                                                                                               | How it is judged                                                                                     |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| FC-1 | A finish milestone placed on its predecessor's last day reports no visual conflict                                                                                                      | Engine unit case, API e2e, and the canvas journey (drag)                                             |
| FC-2 | The NetPoint reference plan's GCO and `summary.projectFinish` read **2031-02-28**                                                                                                       | Seed the plan against a local API after M2; also an API e2e reduced to TURNOVER → GCO                |
| FC-3 | The seed's next-day workaround is removed; `netpoint-power-plant.spec.ts` passes with a milestone-aware position helper, and every milestone's `visualStart` equals the picture's label | Unit suite                                                                                           |
| FC-4 | `goldens.spec.ts` and `compute.spec.ts` pass **unedited**                                                                                                                               | CI; any edit to either is a stop                                                                     |
| FC-5 | Over every seed-catalogue plan, engine outputs for non-finish-milestone rows are byte-identical before and after                                                                        | M0 harness, inputs built from each `SeedSpec` (ADR-0066), diff restricted to FM rows and the summary |
| FC-6 | The Q1 migration leaves every Pass 2 instant byte-identical on a populated database                                                                                                     | API e2e: compute, migrate, compute, compare instants; verified red by skipping the migration         |
| FC-7 | No finish milestone reads earlier than the data date                                                                                                                                    | Unit case; torture-plan DCMA metric 9 stays at 8 / 0 (`docs/TEST_PLAYBOOK.md:229`)                   |
| FC-8 | On a 24-hour-day calendar every finish-milestone diamond keeps its pixel x                                                                                                              | Paint golden log: only label text lines change, audited by hand against a written list               |
| FC-9 | `FNLT D` on a finish milestone after a task ending `D` gives float 0                                                                                                                    | Engine unit case                                                                                     |

**Predictions:** NetPoint finish `2031-02-28`; torture finish `2027-03-11`;
`compute.zero-task.spec.ts:63` goes red and is re-characterised; the torture plan's violation count
stays 1. If the violation or negative-float count moves, stop and report the number before M2.
