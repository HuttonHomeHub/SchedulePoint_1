# ADR-0156: A SchedulePoint layout travels in an inert field that only SchedulePoint reads

- **Status:** Accepted (product owner, 2026-09-24: CQ-1 A, CQ-2 A; FC-6 **unobserved**, no P6
  available)
- **Date:** 2026-09-24
- **Deciders:** James Ewbank (with Claude Code)
- **Amends:** [ADR-0148](./0148-visual-is-the-plan.md) D7 (what export does with a placement);
  [ADR-0050](./0050-schedule-interchange-canonical-model.md) (mapping-contract rows for
  `Activity.visualStart`, `Activity.laneIndex` and user-defined fields);
  [ADR-0069](./0069-shared-lane-layout-and-packing-at-import.md) §2/§4 (phase 3 gains three modes and packs the
  drawn span)
- **Applies:** [ADR-0153](./0153-an-edit-moves-only-the-bar-that-caused-an-overlap.md) decision 1 at
  import (an overlap the import did not create is not resolved);
  [ADR-0155](./0155-a-finish-milestone-is-dated-by-the-day-it-closes.md) decision 3 (a finish
  milestone's stored placement means the end of its day)
- **Spec:** [`docs/specs/layout-interchange/`](../specs/layout-interchange/feature-spec.md)

## Context

An XER export of a hand-laid-out plan re-imported with the same network and a different picture.
Every `visual_start` was dropped by the export mapper, and every `lane_index` was replaced by
ADR-0069's packer. ADR-0148 D7 decided the export would report the placement rather than translate
it. The code then went one step further and argued, in `import-graph.ts`, that no format could ever
carry one. That is true of P6 and MS Project as producers. It is false of SchedulePoint: nothing stops
our own file from carrying our own layout in a field no other tool schedules from.

P6's documented extension mechanism for exactly this is the user-defined field (`UDFTYPE` /
`UDFVALUE`). This repository's XER parser already kept those as unread rows. The mechanism is
**documented, not observed**: no real P6 file with a UDF has been read here, and no real P6 has been
seen opening a SchedulePoint XER.

Measuring the import first (M0) found a second defect under the first. Phase 3 packed each activity on
its **early** dates, while the canvas draws the **placed** span. So an import could draw two bars on
top of each other in one lane: 37–39 such activities on the torture file and 2 on the NetPoint
re-import. And two imports of one file did not agree about lanes (32–39 activities differed), because
the packer breaks ties on an id and import ids are minted fresh.

## Decision

1. **The layout travels in P6 user-defined fields that are namespaced to SchedulePoint and
   versioned.** There are two labels on three definitions:
   - `SchedulePoint layout v1: placed start` (`TASK`, `FT_TEXT`, the stored `YYYY-MM-DD`);
   - `SchedulePoint layout v1: lane` (`TASK` and `PROJWBS`, `FT_INT`).

   One module, `packages/interchange/src/xer-layout-fields.ts`, owns the labels, the encoder and the
   decoder, and a structural test holds every other file to it. The lane label read `… v1: row` until
   the M4 review, before any file carried it. Every surface in the product says **lane** for
   `lane_index`, and a label can never change once a file carries one.

2. **A field is identified by its exact label.** It is never identified by P6's database-local id or
   name, and never by the file's header. So a P6 re-export of our file still restores what it
   carries. Near-miss labels (case, spacing) are foreign fields.
3. **`v1` names the rule, not the format.** It means "the stored placement under ADR-0155's
   end-of-day rule for finish milestones". A change to what a stored placement means bumps the label.
   A reader meeting an unknown version reports one drop and reads nothing.
4. **Export never translates a placement into anything a foreign tool schedules from.** ADR-0148 D7's
   reason is kept whole. What D7's _statement_ loses is "the export carries one aggregate drop". The
   finding becomes an approximation saying that P6 and other tools will show computed dates. MSPDI
   keeps D7's drop unchanged.
5. **Import restores by default, and the planner can decline.** Restoring writes `visual_start` and
   `lane_index` in phase 1. Declining (`restoreLayout: IGNORE`) strips the layout before mapping,
   which makes the path identical to a foreign file's. The report then names what was not applied.
   The option is offered only when the dry-run found a layout. It stays offered once unticked, for as
   long as the same file stays chosen.
6. **Phase 3 has three modes:**
   - `packed`: no lane was carried, so the packer runs as before;
   - `carried`: every lane was carried, so phase 3 writes nothing;
   - `partial`: only activities without a lane take the nearest free lane, and carried lanes never
     move.

   Overlaps among carried lanes are **reported, not resolved**, with **Arrange** named as the remedy.
   This is ADR-0153's rule: an overlap a command did not create is not that command's to fix. A
   restored placement the engine flags as conflicting is reported the same way. Both findings are
   approximations, because nothing was changed and nothing was lost.

7. **Phase 3 packs the span the canvas draws, keyed by activity code.** The drawn-span derivation
   (effective dates plus the finish-milestone axis shift) moves into `@repo/layout`, and both the web
   and the importer use it (ADR-0069 §1's one-implementation argument). The packer's items are keyed
   by code rather than by id, and each predecessor list is sorted, so two imports of one file lay out
   identically.
8. **No schema change and no engine change.** `visual_start` and `lane_index` already exist.
   `computeSchedule` is unmodified. Its arguments are identical on the foreign path. On the layout
   path they differ only in `visualStart`, which reaches Pass 2 only (ADR-0148 D2).
9. **The reader ships one release before the writer.** The web client parses the import report with a
   strict schema. So a deployed browser that is one release behind must never meet a report carrying
   the new counts from a file that a newer export wrote. The import side released first; the export
   side followed.
10. **MSPDI is out of this decision** until a real MS Project file has been read. When it is built, it
    carries the SchedulePoint activity type too (`docs/TECH_DEBT.md` #386).

## Consequences

- A SchedulePoint → SchedulePoint XER round trip is layout-exact. FC-1 is the measurement: 58 of 58
  placements and every lane come back, compared by activity code, and the finish and the critical set
  match.
- **FC-6 is unobserved, and that is not a pass.** No P6 was available. Nothing here establishes that a
  real P6 accepts the file. That P6 would gain two UDF definitions on import is reasoned from vendor
  documentation, not observed. The fallback, if P6 refuses UDF tables, is a sidecar file (see
  Alternatives).
- FC-2's foreign-file parity covers the two XER fixtures this repository imports: the torture file and
  the NetPoint re-import. Neither carries a `UDFTYPE` table, so the foreign-UDF drop line is exercised
  by FC-4's unit cases, not by a real foreign file.
- An importing instance older than the reader release ignores the fields silently, just as it ignores
  every table it does not read.
- A restored placement describes the picture at export time, so after an edit in another tool it may
  be stale. Infeasible placements are flagged by the engine and counted in the report. Feasible but
  stale ones cannot be detected, and the decline option is the planner's control.
- ADR-0050's claim that foreign UDFs are "dropped + reported" becomes true. It was false before:
  nothing reported them.
- The partial pack is quadratic in the number of occupied lanes in the worst case. It measured
  139–157 ms for 4,900 coincident movers and runs once per import commit. The cost is accepted and
  recorded.

## Alternatives considered

- **Translate to `SNET`.** Refused by ADR-0148 D7.
- **A private XER table.** P6's behaviour on an unknown table is undocumented, and a P6 re-export would
  not preserve it.
- **A sidecar file or a native format.** That means two artefacts to keep together, and no P6 round
  trip. Kept as the fallback if FC-6 finds that P6 refuses UDF tables.
- **A separate "with layout" export.** Planners would have to know to choose it, and the ordinary
  export would go on losing the picture.
- **`FT_START_DATE`.** That would put a time of day and P6's date handling on a date-only value whose
  end-of-day meaning is SchedulePoint's.
- **Resolve imported overlaps.** That would move work in a clean round trip whose source had accepted
  the overlap.
