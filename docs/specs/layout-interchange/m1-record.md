# M1 record: phase 3 packs the span the canvas draws

Built 2026-09-24. Entry point: project screen → **Import from file…** → **Confirm import** (an
existing control; behaviour change only).

## What changed

- `@repo/layout` gains `drawnSpanDays` and `finishMilestoneDayShift`. The web's
  `tsld/model/drawn-span.ts` and `lib/milestone-day.ts` delegate to them.
- Phase 3 (`InterchangeService.packImportedLanes`) packs each activity's **drawn** span — its
  visual-effective dates, a finish milestone at the end of its day — instead of its early dates.
- Phase 3 keys the packer's items by **activity code**, not id, and sorts each predecessor list. Both
  were sources of chance: the packer breaks ties on an item's id, and ids are UUIDv7 minted during the
  import.

## Results, on the instruments M0 committed

| Figure                                                 | Before (M0, corrected) | After M1 |
| ------------------------------------------------------ | ---------------------- | -------- |
| Torture import: activities overlapping in their row    | 37, 39, 39             | **0**    |
| NetPoint re-import: activities overlapping             | 2, 2, 2                | **0**    |
| Activities on a different row, two imports of one file | 39, 32, 34             | **0**    |
| Torture import graph and report (FC-2 digests)         | pinned                 | **same** |

Instruments: `apps/api/test/layout-interchange.e2e-spec.ts` (FC-2 and FC-5 cases) and the new step in
`apps/web/e2e-interchange/interchange.spec.ts`, which imports the torture file through the real dialog
and reads the result back through the API. **Both verified red** against the pre-M1 phase 3 (the two
source files stashed): the API case fails all three limbs, the journey reports 23 overlapping pairs.

## Departures from the plan, stated

- **One web suite was edited, not "every existing web suite unedited".**
  `finish-milestone-day.structural.test.ts` required `drawn-span.ts` to call `finishMilestoneDayShift`
  by name; it now delegates to `drawnSpanDays`, which applies the shift and has its own spec pinning
  that. The gate accepts either name.
- **Determinism was not in the plan.** M0-T4 found it (see `m0-measurement.md`, including its
  amendment), and FC-5 cannot hold without it.
