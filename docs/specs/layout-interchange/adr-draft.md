# ADR-0156 (draft) — A SchedulePoint layout travels in an inert field that only SchedulePoint reads

- **Status:** Draft — awaiting approval before implementation (to be filed as `docs/adr/0156-…md` at
  M4-T3; **re-verify the number at filing**)
- **Date:** 2026-09-24
- **Amends:** ADR-0148 D7 (what export does with a placement); ADR-0050 (mapping-contract rows for
  `Activity.visualStart` and UDFs, plus a new row for `Activity.laneIndex`); ADR-0069 §2/§4 (phase 3
  gains three modes and packs the drawn span)
- **Applies:** ADR-0153 decision 1 at import (an overlap the import did not create is not resolved);
  ADR-0155 decision 3 (a finish milestone's stored placement means the end of its day)
- **Spec:** [`./feature-spec.md`](./feature-spec.md)

## Context

An XER export of a hand-laid-out plan re-imports with the same network and a different picture: every
`visual_start` is dropped (`packages/interchange/src/export-mapper.ts:197-223`) and every
`lane_index` is replaced by ADR-0069's packer (`apps/api/src/modules/interchange/interchange.service.ts:
352-359`). ADR-0148 D7 decided the export would report the placement rather than translate it, and the
code went one step further and argued that **no format could ever carry one**
(`import-graph.ts:176-193`). That is true of P6 and MS Project as producers and false of SchedulePoint:
nothing stops our own file from carrying our own layout in a field no other tool schedules from.

P6's documented extension mechanism for exactly this is the user-defined field (`UDFTYPE`/`UDFVALUE`),
which this repository's XER parser already keeps as unread rows (`xer-parser.ts:102-109`). The
mechanism is documented, not observed: no real P6 file with a UDF has been read here, and no real P6
has been observed opening any SchedulePoint XER.

## Decision

1. **The layout travels in P6 user-defined fields namespaced to SchedulePoint and versioned.** Three
   fields: `SchedulePoint layout v1: placed start` (`TASK`, `FT_TEXT`, the stored `YYYY-MM-DD`) and
   `SchedulePoint layout v1: lane` (`TASK` and `PROJWBS`, `FT_INT`). One module owns the labels, the
   encoder and the decoder; a structural test holds every other file to it.
2. **The field is identified by its exact label, never by P6's database-local name or id**, and never
   by the file's header, so a P6 re-export of our file still restores what it carries.
3. **`v1` names the rule, not the format.** It means "the stored placement under ADR-0155's end-of-day
   rule for finish milestones". A change to what a stored placement means bumps the label; a reader
   meeting an unknown version reports it and reads nothing.
4. **Export never translates a placement into anything a foreign tool schedules from** — ADR-0148 D7's
   reason, kept whole. What D7's _statement_ loses is "the export carries one aggregate drop": the
   finding becomes an approximation saying P6 and other tools will show computed dates.
5. **Import restores by default and can be declined.** Restoring writes `visual_start` and `lane_index`
   in phase 1; declining makes the path byte-identical to a foreign file's.
6. **Phase 3 has three modes** — `packed` (no row carried: today's packer), `carried` (every row
   carried: no write), `partial` (only un-rowed activities take the nearest free row; carried rows never
   move). Overlaps among carried rows are **reported, not resolved** — ADR-0153's rule that an overlap
   a command did not create is not its to fix, with **Arrange** named as the remedy.
7. **Phase 3 packs the span the canvas draws.** The drawn-span derivation (effective dates plus the
   finish-milestone axis shift) moves into `@repo/layout` and both the web and the importer use it —
   ADR-0069 §1's one-implementation argument, closing the server half of the defect ADR-0153's context
   records.
8. **No schema change and no engine change.** `visual_start` and `lane_index` exist; `computeSchedule`
   is unmodified, its arguments are byte-identical on the foreign path, and on the layout path they
   differ only in `visualStart`, which reaches Pass 2 only (ADR-0148 D2).
9. **MSPDI is out of this decision** until a real MS Project file has been read; when it is built it
   carries the SchedulePoint activity type too (`docs/TECH_DEBT.md` #386).

## Consequences

- A SchedulePoint→SchedulePoint XER round trip is layout-exact; FC-1 is the measurement.
- **A P6 recipient's database gains two UDF definitions** on import (reasoned from vendor
  documentation, not observed). Whether a real P6 accepts the file is **owed** (FC-6) and must be
  recorded here as observed or unobserved before this ADR is Accepted.
- An importing instance older than the reader release ignores the fields silently, exactly as it
  ignores every table it does not read.
- A restored placement describes the picture at export; after an edit in another tool it may be stale.
  Infeasible ones are flagged by the engine and counted in the report; feasible-but-stale ones are not
  detectable, and the decline option is the planner's control.
- ADR-0050's claim that foreign UDFs are "dropped + reported" becomes true (it was false: nothing
  reported them).

## Alternatives considered

- **Translate to `SNET`** — refused by ADR-0148 D7.
- **A private XER table** — P6's behaviour on an unknown table is undocumented, and a P6 re-export would
  not preserve it.
- **A sidecar file or a native format** — two artefacts to keep together, and no P6 round trip. Kept as
  the fallback if FC-6 finds P6 refuses UDF tables.
- **A separate "with layout" export** — a choice a planner must know to make; the ordinary export would
  go on losing the picture.
- **`FT_START_DATE`** — puts a time of day and P6 date handling on a date-only value whose end-of-day
  meaning is SchedulePoint's.
- **Resolve imported overlaps** — moves work in a clean round trip whose source had accepted the overlap.
