# M3 record: the write path

Built 2026-09-24 on top of M2 (#685), and released one release after it, as the plan requires: a file
carrying the fields exists only once this ships, and the reader was already deployed.

## What was built

| Task  | Where                                                                                                             |
| ----- | ----------------------------------------------------------------------------------------------------------------- |
| M3-T1 | `ExportService.readGraph` copies `laneIndex`; `mapExportGraphToCanonical` sets `layout` and takes `carriesLayout` |
| M3-T2 | `emitXerFromCanonical` appends `UDFTYPE` and `UDFVALUE` last, through `encodeLayoutFields`                        |
| M3-T3 | FC-1 is an ordinary `it`; FC-3 on the edited export; the browser round trip through the export menu               |

## Evidence

- **FC-1** (`apps/api/test/layout-interchange.e2e-spec.ts`): the seeded NetPoint plan, exported through the real
  route and committed into a second project, restores every placement and lane, with visual-effective
  dates and conflict reasons equal by code. It was `it.fails` through M0–M2.
- **FC-3**, same file: the export is edited as P6 would leave it. `B_ERECT` gets twice its hours, a new
  `TASK` arrives with no layout, and one lane value is corrupted. Result: no carried lane moves, the new
  activity overlaps nothing, the corrupted activity keeps its placement and overlaps nothing, the reported conflict count equals the engine's, and there is one `repair`.
- **FC-7** (`packages/interchange/src/visual-placement.spec.ts`): every non-layout table of a fully laid-out
  rich export is byte-identical to `golden/fc7-rich-export.pre-epic.xer`. That file was written by the
  **pre-M3 exporter** at `a9021394`, run in a git worktree against the same graph, and is never
  regenerated. The case also requires both layout tables to be present, so a green run cannot mean they
  went missing. It went red when a scheduling table changed and when the layout tables were dropped.
- **The service seam** (`export.service.spec.ts`): lanes read from the repository reach the file in XER
  and the drop in MSPDI. Red when the service stops copying `laneIndex`.
- **MSPDI unchanged**: the MSPDI bytes are identical with and without layout on the canonical model.
- **Round trip, pure**: the real XER bytes decode back to every lane and placement.
- **Journey** (`apps/web/e2e-interchange/`): a placed plan exported through **Share & export ▾ → Primavera
  P6 (XER)**, the download imported into a second project through **Import from file…**, and the values
  read back through the API. 6/6 passed locally.
- **Structural**: `xer-emit.ts` goes through `xer-layout-fields.ts`, and no other production file holds a
  label. Red when the import path changes.

## Decisions

1. **The finding depends on the format, and it still has one producer.** The mapper serves both formats,
   so it takes `carriesLayout`. XER passes it and gets one `approximation` naming both counts. MSPDI does
   not pass it and keeps M-G's `drop`. A per-serialiser finding would be the two-copies drift ADR-0065
   records.
2. **Lanes alone are never reported.** Every plan has lanes, and no tool except SchedulePoint has any, so
   another tool shows nothing differently. Reporting them would put a standing line on every export.
3. **Definition ids are fixed and values are sorted.** The same plan exports the same bytes whatever order
   its activities were read in (M3-T2's determinism risk).
4. **The export route's own description was stale**, and not only about layout: it said WBS summaries,
   constraints, progress and resources were out of scope, and all four have been exported since M4c.
   Corrected, and `docs/API.md` now documents the export route, which it never had.

## One weak red, recorded

With the emitter's write removed, the API e2e fails in `beforeAll`: FC-3's edit helper finds no
`UDFVALUE` table and throws, so all twelve cases report skipped rather than FC-1 failing by name. It is
still red. It is recorded because a skipped suite reads differently from a failed assertion, and the
next person to see one should know what it means here.

## Review fold

- **Security (export side).** The M2 security review could not see this half, because M3 was held out of
  the tree while M2 was in review, so it was reviewed here. Nothing blocking: the export read is
  org-scoped and plan-scoped as before, the new fields carry only the plan's own placement and lane
  (both already readable through `GET …/activities`), every emitted value passes the export schema
  and the serialiser's tab/newline sanitiser, and file size is bounded by the existing activity cap.
  One suggestion was taken: the canonical model now carries `layout` **only** when the format writes
  it, so a future emitter cannot start reading a field it was never meant to carry. Pinned by a case
  in `visual-placement.spec.ts`, verified red against the ungated mapper.
- **Tests.** FC-3 now also asserts that the activity whose lane value was corrupted keeps its placed
  start and was given a lane free at its drawn span.
- **Vocabulary.** The finding and this record say **lane**, matching M2's review fold and the field
  label `SchedulePoint layout v1: lane`.
