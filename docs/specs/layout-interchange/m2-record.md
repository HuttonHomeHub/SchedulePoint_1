# M2 record: the read path

Landed 2026-09-24, on top of M1 (`da523b23`, #683). Ships one release before M3, so the reader is deployed
before any file carrying the fields exists.

## What was built

| Task  | Where                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------ |
| M2-T1 | `packages/interchange/src/xer-layout-fields.ts` — the one module naming the labels; decode and encode  |
| M2-T2 | canonical `layout`, import-graph `laneIndex`, mapper spread, report `placements`/`lanes`               |
| M2-T3 | `xer-adapter.ts` reads the fields after every activity exists; foreign `UDFTYPE` rows → one `drop`     |
| M2-T4 | `restoreLayout` on dry-run and commit (DTO, OpenAPI, controller, service); phase 1 writes both values  |
| M2-T5 | phase 3 `packed` / `carried` / `partial`; `packAroundCarried` in `@repo/layout`                        |
| M2-T6 | `restoredLayoutFindings`: conflicting restored placements, overlapping carried rows (best effort)      |
| M2-T7 | report tiles, the **Restore the SchedulePoint layout** checkbox, `restoreLayout` sent only as `IGNORE` |

## Evidence

- **Unit**: `xer-layout-fields.spec.ts` covers every row of spec §2's reader edge cases (14 cases). Five
  mutations (lane bound, project filter, calendar-date check, duplicate definition, summary placement) each
  turn one case red.
- **Structural** (spec §4.6 items 2–3, reader half): `visual-placement.structural.spec.ts` — no production
  file but `xer-layout-fields.ts` holds a label; the adapter imports it; the four MSPDI files mention
  neither; a pinned positive. Verified red three ways: a label in `import-xer.ts`, the word `layout` in
  `mspdi-adapter.ts`, and the adapter's import path changed.
- **API e2e** (`apps/api/test/layout-interchange.e2e-spec.ts`, "a SchedulePoint XER carrying its layout"):
  the real NetPoint export with the fields injected from the source plan's own rows through the shipped
  encoder, committed through the real route. RESTORE brings back all 58 placements and rows with every
  `version` still 1 (phase 3 wrote nothing); partial keeps every carried row; IGNORE matches a plain import's
  rows exactly; a placement pulled before its logic and two stacked bars each produce their finding; an
  unknown option is a 422. Three mutations each go red: phase 1 ignoring the carried row (3 cases),
  phase 3 always packing (3 cases), IGNORE not stripping (1 case).
- **Journey** (`apps/web/e2e-interchange/interchange.spec.ts`): a SchedulePoint `.xer` through the real
  dialog. The option appears checked with both tiles, passes axe, unticking re-runs the dry-run and the
  option stays offered, and the API reads back the restored start and row.
- **FC-2**: the torture file has no `UDFTYPE` table, so its graph and report digests are unchanged. The
  M0 baseline case passes unedited.

## Decisions the spec left open

1. **The option stays offered after it is unticked.** Spec §4.8 says to render it "only when the dry-run
   found layout". Taken literally, unticking would hide the checkbox, because an IGNORE dry-run reports no
   layout counts. The dialog therefore remembers "this file has a layout" for as long as that file stays
   chosen; the first dry-run always restores, so it always finds out. No report field was added.
2. **Duplicate definitions: first in file order wins.** Spec §2 says "the lowest `udf_type_id` in file
   order". Those can disagree, and ids are local to one P6 database, so file order is the rule that means
   something. The finding still counts the duplicates.
3. **Post-recalc findings are `approximation`s.** Neither finding is a repair (nothing was changed) or a drop
   (nothing was lost). Both say the restored picture and the recalculated plan now differ.
4. **`packAroundCarried` is new, and it reuses rather than restates.** The partial pack uses the packer's own
   predecessor-mean rule (`meanPlacedPredecessorLane`, exported from `pack-lanes.ts`) and the auto-resolve's
   `rowOccupancy`, which gained an `add` method, because a mover is not in the index it was built with.

## One false lead, recorded

The journey's first run failed with "Something went wrong" on the dry-run. The pure pipeline, the API and
the built package were all correct. The cause was **Vite's pre-bundled dependency cache**: the dev server
had bundled `@repo/interchange` at 10:37, before `placements` existed, so the client's strict report schema
rejected the new count. Clearing `apps/web/node_modules/.vite` fixed it. CI builds fresh and cannot hit
this. It is recorded because the symptom is identical to spec §0.10's stale-tab risk, and the two are easy
to confuse: this one is a local cache; that one is a deployed browser, which the one-release ordering
covers.

## Cleanup

`docs/API.md` said an import lays activities out "on a deterministic lane per source order". That was true
of phase 1 alone and has been stale since ADR-0069 added packing. It is corrected in the same change.
