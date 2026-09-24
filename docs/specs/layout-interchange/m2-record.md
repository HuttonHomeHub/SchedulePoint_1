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

## Review fold (M4-T1, run over M1–M3 before M2 merged)

Six specialist reviews ran over the combined diff. What they found in M2's code is fixed here, in the
release that ships it, rather than in a later one:

- **UX, blocking:** the checkbox hint said that off means "the plan is scheduled from its logic alone".
  That is false: the network pass is the same either way (ADR-0148). Only the picture changes. The hint
  now says so, including that the logic, early dates and critical path are identical.
- **UX, blocking:** the dialog, the report tile and the server's findings said **row**; every canvas
  surface says **lane** for the same `lane_index`. All user-facing copy now says lane. **So does the
  field label**, `SchedulePoint layout v1: lane`. The label is the file format's identity and can never
  change once a file carries one. None did yet, so this was the last moment the rename was free
  (`conditions.md` records the amendment).
- **Performance, blocking:** `packAroundCarried` on 4,900 coincident movers took 426–561 ms here
  (reproduced from the review's own shape). The cause was `rowOccupancy` iterating a `Map` for every
  lane it scanned. Each lane now keeps an array and its start and end bounds, so a lane the mover
  cannot touch is ruled out in O(1): 139–157 ms on the same shapes, against `packLanes`' 67–109 ms on
  5,000 coincident items. It is still quadratic in the number of occupied lanes, it runs once per
  import commit, and that cost is accepted and recorded rather than removed.
- **Tests, blocking:** the duplicate-definition case could not tell "first in file order" from "lowest
  id", because its first definition had both. A case with id 9 listed before id 2 now does, verified
  red against an id sort. Spec §2's "placement on a started / complete / LOE activity" had no test. It
  now has one through the whole import, verified red against a mapper that drops placements on
  progressed rows.
- **Accessibility, suggested and taken:** the dry-run announcement now says when the file carries a
  SchedulePoint layout, so a screen-reader user learns why a new option appeared.
- **Security, suggested and taken:** `persistGraph` refuses a placement on a WBS summary itself, rather
  than relying on the reader alone; `countOverlapping` pushes rather than copying each lane's array.
- **API:** nothing blocking. The `@ApiBody` enum now reads `RESTORE_LAYOUT_OPTIONS` rather than
  restating it.

The security review could not see the export side, because M3 was held out of the tree while M2 was in
review. That half is reviewed again in M3.
