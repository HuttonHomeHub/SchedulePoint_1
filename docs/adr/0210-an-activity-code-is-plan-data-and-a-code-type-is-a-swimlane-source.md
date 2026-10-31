# ADR-0210: An activity code is plan data, and a code type is a swimlane source

- **Status:** Accepted — for what shipped (M0 to M4, `api` 0.103.2 and `web` 0.200.4). M5 (keeping codes on a P6
  import) and M6 (writing them to an XER) have **not** shipped; they wait for a real P6 export that uses activity
  codes (`m0-record.md`, ADR-0071 §5), and the decisions below that name them are the design they will be built to.
- **Date:** 2026-10-31
- **Deciders:** Product owner (epic spec Q1 to Q11, 2026-10-27; M3 spec, 2026-10-29; M4 spec and its three answers,
  "current code only" and the accepted capture miss, 2026-10-30; this outline, 2026-10-31); recorded at the epic's
  gate pass (M7)
- **Amends:** ADR-0206 A2 and A7 (a third source, and code lanes in their own table); ADR-0205 and through it
  ADR-0051 §4 (a guest sees code swimlanes by name); ADR-0025 (a baseline freezes the swimlane code's value and
  lane); ADR-0194 (organisation export 2.2 and 2.3); ADR-0156 (stated: the layout field is unchanged until M6).
  ADR-0050's mapping row was amended in place by M1; ADR-0061 §3 by M3-T1.
- **Spec:** [`docs/specs/p6-activity-codes/`](../specs/p6-activity-codes/): `spec.md` §4.12 (this ADR's outline),
  `database-design.md` (the schema), `m3-spec.md`, `m4-spec.md` §1b (the decisions M4 added); measurements in
  `m2-record.md`, `m3-record.md` and `m4-record.md`

## Context

A Primavera P6 programme is often organised by **activity codes**: labels such as Area (Level 1, Roof) or Trade
(Civil, Electrical) that a planner attaches to activities to sort and group them. SchedulePoint had nowhere to keep
one. The XER reader dropped the three code tables (`ACTVTYPE`, `ACTVCODE`, `TASKACTV`) **without a word**, against
ADR-0050's no-silent-loss rule, while that ADR's own table claimed they were "dropped + reported". Since 2026-10-25
the diagram draws swimlanes by hand or from the WBS (ADR-0206), and the owner wanted the third grouping P6 users
reach for.

Three facts shaped the design. **"Activity code" already meant something here**: the activity's own identifier
(P6's Activity ID, `activities.code`), which ADR-0129 matches two imports on. **No real P6 export with codes is in
the repository**, so the column names and lengths of `ACTVCODE` are known only from public sources (`m0-record.md`).
And **a swimlane is presentation, not a scheduling input** (ADR-0206), so whatever a code does to the picture, it
must not reach the engine.

The owner chose to **keep the codes in the plan** (option B below) on 2026-10-27. The epic shipped in five
milestones: M0 (what public sources confirm), M1 (the import report names the codes it drops), M2 (the schema, the
codes API and organisation export 2.2/2.3, dark), M3 (show and edit codes) and M4 (swimlanes by a code).

## Decision

- **D1. Vocabulary.** The product word is **Codes** ("Codes…", the editor's Codes section, "Set code…"); a code
  type appears under its own name wherever it can ("Area"). "Activity code" without "P6" keeps its meaning, the
  activity's identifier. Identifiers are `codeType*`, `codeValue*`, `codeValueAssignment*` and
  `codeSwimlaneLane*`; the one exception is the enum label `ACTIVITY_CODE` on `SwimlaneSource`, which names the
  P6 concept as a source.
- **D2. Codes are plan data, held by the database.** Four tables (`apps/api/prisma/schema.prisma`: `CodeType`,
  `CodeValue`, `CodeValueAssignment`, `CodeSwimlaneLane`), every edge a composite key through the plan, so a
  value of another plan or another type cannot be assigned. **One value per activity per code** is a unique index,
  not a convention. Codes are **per plan** (owner Q2); an organisation-wide library can be added later without
  losing data. The limits (`packages/types/src/index.ts`): **100 codes per plan, 1,000 values per code**, a name
  or short code of at most 80 characters and a description of at most 255. The two lengths are provisional until
  a real export is read (Q5), and **there is no parent value**: nesting is stored only if a real file shows P6 has
  one (Q11, `m2-record.md` "Decisions").
- **D3. Not a scheduling input.** `swimlaneCodeTypeId` is classified `NOT_INPUT` in
  `schedule-input-fields.ts`, beside `swimlaneSource`, so an unclassified field is a compile error. No engine,
  recalculation or float change; ADR-0034's parity gate is untouched.
- **D4. An assignment is an activity write, and codes are their own write scope.** Setting a code holds the
  activity's row lock, moves its `version` and records a history item `code:<codeTypeId>` under the existing
  `DEFINITION` scope (ADR-0174); it is not a module with its own lifecycle. In the activity editor codes have
  **their own Save** ("Save codes"), because they travel on their own endpoint, `PATCH …/activities/codes`
  (ADR-0060's one Save per write scope). Create accepts `codes`. Type and value deletes and restores are audited
  (`code_type.deleted`/`.restored`, `code_value.deleted`/`.restored`, ADR-0073).
- **D5. Values are read on demand.** Codes… paints from `GET code-types?values=none` (each type with a
  `valueCount`) and loads one type's values when it is opened (`GET code-types/:id/values`); a name the screen
  does not hold is resolved by id (`GET code-values?id=`). The nested read of every value is no longer what any
  screen opens on: at 100 × 1,000 it took 2.6 to 3.1 s (`m3-record.md` §1).
- **D6. A code type is a third swimlane source, and its lanes have their own table.** `swimlaneSource` gains
  `ACTIVITY_CODE`, bound to `plans.swimlane_code_type_id` by the replaced `ck_plans_swimlane_source_level`. Lanes
  written under a code live in `code_swimlane_lanes`, one row per (activity, code, value or none), **not** as new
  labels on `activity_swimlane_lanes`: widening that table's unique index would have broken the previous image's
  lane writes on every plan (`42P10`, probed), so a rollback would have failed everywhere. Switching from Area to
  Trade and back writes nothing and loses nothing. The basis is still derived by the server (ADR-0206 A3): a
  lane-only write **names the code it planned against**, and is refused 409 `SWIMLANE_SOURCE_CHANGED` if the
  plan's source has moved since.
- **D7. Writing under a code source.** A drag stops at the band's edge (Q7, as under the WBS). Work changes band
  only on purpose: **Move to swimlane…** offers the bands on screen plus "No <code>" (owner, 2026-10-30), and
  **Set code…**, the table's Set and the editor's Save codes write the code and the lanes together, as one undo
  step. A value nobody uses yet is reached with Set code…. A hand-made `swimlaneId` is refused 422
  `SWIMLANE_SOURCE_IS_ACTIVITY_CODE` (the WBS precedent) and kept for switching back.
- **D8. Bands, their names and the limit.** One band per value **in use**, in the value order, named by the
  value's description, else its short code, with no length clause (`m4-spec.md` §1b row 5); "No <code>" last,
  under the code's own name. A **WBS summary does not make a value "in use"**: summaries are never band members.
  A code can be chosen when **1 to 100** of its values are in use (`SWIMLANE_LIMIT`, refused 422 otherwise, the
  card shaded with its reason). If more than 100 come into use after it was chosen, **every band still draws**
  and the Swimlanes menu says "Area has 140 values in use. Swimlanes are made for up to 100." (owner,
  2026-10-30): refusing the 101st value would stop classification work and still not hold, because a restore can
  pass 100.
- **D9. The list carries the current code only.** Activity reads carry `codeSwimlaneLanes` only under a code
  source, only for that code, and only the row at each activity's current value. Another code's lanes come from
  `GET …/plans/:planId/code-types/:codeTypeId/swimlane-lanes` (one request, throttled 30 a minute) when the
  planner switches, so a switch is no longer instant (owner, 2026-10-30). There is **no public membership
  route**: membership comes from each activity's `codes`. The list carries `codes` only when the plan has code
  types, so a plan without them reads as it did.
- **D10. Deletes and restores.** Deleting the code the swimlanes come from is **refused** 409
  `CODE_TYPE_IS_SWIMLANE_SOURCE` ("Choose another swimlane source first", Q3), and Delete… is shaded for it.
  Deleting a value is allowed: its activities read as "no value", draw under "No <code>", and return to their
  lanes when it is restored. A **new** assignment to a deleted value is refused 422 `CODE_VALUE_DELETED`. An
  activity restored onto a value deleted meanwhile is admitted and reads "no value" until the value returns; this
  follows ADR-0206 A8's reasoning (presentation, not a scheduling input) and is **not** ADR-0201 D1's rule for
  calendars. A value or type under a deleted parent is refused `PARENT_DELETED`. Types and values join the plan's
  delete batch and the expiry; the plan ↔ code type pointer is a delete cycle, cleared before types are deleted
  and recorded as the `'Plan→CodeType'` entry in the expiry census's `EXEMPT_EDGES`.
- **D11. A baseline freezes the swimlane code's value and lane, not every code.** Owner Q1 was "yes, if one
  capture of the largest plan adds at most 1 s". Freezing every assignment measured **2.4 to 2.8 s** added
  (150,000 rows; even with no keys or indexes over 1 s), so the approved fallback shipped: three columns on
  `baseline_activities` (`code_value_id`, `code_lane_index`, `code_lane_updated_at`) for the frozen source code
  only, with `baselines.code_snapshot_level` (`NONE` | `SWIMLANE_TYPE`) saying whether they were recorded. A
  removed activity's ghost is drawn in its frozen band only when the baseline froze **this** code, the frozen
  value is a band drawn today, and a lane was frozen inside today's rows; otherwise it is **counted, not
  derived**, with its reason (ADR-0127; `swimlane-ghosts.ts`). A derived lane would put removed work somewhere
  plausible, which is a false statement about where it was.
- **D12. A guest sees band names and "No <code>", never the codes** (Q6; owner, 2026-10-30). The share view's
  swimlane list carries a code plan's bands as `{ id, name }` and a `noSwimlaneName`; the code type, its values
  and each activity's codes are never sent (`share/dto/guest-plan.dto.ts`). The type's name reaches the guest
  only as a band label.
- **D13. Interchange: reported, not yet kept.** A P6 import **reports** the code types the project uses and counts
  the values set (M1, `xer-adapter.ts` `reportUnreadCodes`); it keeps none of them until M5. `ACTVCODE` is not read
  because its columns are unconfirmed. When M5 and M6 are built, two rules from the epic spec hold: the XER reader
  that understands a code source ships **one release before** the writer emits it (ADR-0156 D9), and MS Project
  files say plainly that codes are not carried (Q10).
- **D14. Organisation export 2.2 and 2.3.** 2.2 added `ACTIVITY_CODE` to the `swimlaneSource` enums; 2.3 added the
  four code files and six columns (`docs/ORGANISATION_EXPORT_FORMAT.md`). Both are minor changes, so 2.x readers
  keep working, and the census refuses an unclassified new column.
- **D15. No flag** (ADR-0088 D1): a `VITE_` constant cannot be switched off in a published image, so a flag would
  have been a second root kept forever and never a rollback.

## Measured misses the owner accepted

Each is recorded as measured, on the build container (not the deployed host), and was put to the owner rather than
re-measured away (ADR-0076, ADR-0142).

- **Full baseline freezing:** 2.4 to 2.8 s against the 1 s ceiling; the smaller freeze (D11) shipped
  (`m2-record.md` §4).
- **The Codes… type list** (`values=none`): about 70 ms p95 against its 60 ms slice, all of it one `groupBy`
  sequential scan; the first paint it is part of passes at 121 to 136 ms against 200. Accepted 2026-10-29, no
  index (`m3-record.md` §1).
- **Code lanes on the list:** sending every code's lanes at every stored value added 5 to 6 ms per 100-row page and
  24 % payload, and grows as stale rows build up. The owner chose "current code only" (D9); on that shape the list
  adds 0.8 to 1.6 ms per page and 8 % payload. The plan-wide read's single-statement form missed its 10 ms (11.5 to
  12.7 ms), so a two-statement form shipped (6.1 to 6.4 ms) (`m4-record.md` §1).
- **Baseline of a code-grouped plan:** about +0.1 to +0.15 s against a 0.05 s target (a capture is about 1.25 to
  1.47 s); the pair spread was about ±0.5 s, so the target could not have been shown either way. Accepted
  2026-10-30, rather than counting every removed activity instead of drawing it (`m4-record.md` §3).
- **Not demonstrable:** the 2,000-row code write with lanes measured about +120 ms on 14 pairs against its 150 ms
  allowance, but the spread on this machine means it cannot be shown to within 50 ms (`m4-record.md` §1 item 2).

## Alternatives considered

- **A. Swimlanes once, at import** (the spec's first draft): derive hand-made swimlanes from the file and store no
  codes. Rejected by the owner: switching grouping later meant importing again, and codes could not be seen or
  edited.
- **C. A JSON column on `activities`.** Rejected: unindexable and unvalidated (`database-design.md` §14 I).
- **D. Codes into the WBS.** Rejected: it destroys the client's WBS.
- **E. An organisation-wide code library.** Deferred (Q2); `database-design.md` §4.3 costs adding it later.
- **New `SwimlaneLaneBasis` labels on `activity_swimlane_lanes`.** Rejected: see D6 (rollback breaks).
- **Refuse the 101st value in use** (the database review's §6.1). Rejected by the owner: see D8.
- **Every code's lanes on the list, so a switch is instant.** Measured and declined by the owner: see the misses.
- **Derive a lane for a removed ghost whose frozen value is gone** (the database review's §2.10). Rejected: D11.
- **Copy codes with activities pasted into another plan, dropping and counting them.** Moot as built: a paste into
  another plan is refused before any write (`features/activity-copy/model/clipboard.ts`), and a paste within a plan
  keeps its codes.

## Consequences

- **The import report stopped hiding codes** (M1), and a plan built in SchedulePoint can be classified and grouped
  by Area, then Trade, and back.
- **Gantt code cells are read-only:** a code is written from the editor, the table or the diagram
  (`GanttPanel.tsx`).
- **Rollback is a procedure once a plan uses the source.** An image older than `api` 0.102.2 cannot read a plan
  whose source is `ACTIVITY_CODE`; such plans are reset by the steps in `docs/DEPLOYMENT.md` "Rolling back past the
  P6 activity codes release" before the older image starts. Never drop the code tables as a rollback.
- **Found at this gate pass, 2026-10-31: an export loses codes silently.** An XER or MSPDI export writes no codes,
  and a plan grouped by a code is written as having no swimlane source
  (`apps/api/src/modules/interchange/export.service.ts`, the `swimlaneSource` mapping), with no line in the export
  report. That is the same silent loss this epic was started to end on import. The owner chose on 2026-10-31 that
  the report says so; the fix is its own pull request after this ADR.
- **Known gaps carried as rows:** stored code lane rows for values an activity no longer holds are kept for ever,
  so the plan-wide lane read grows (`docs/TECH_DEBT.md` #563); the codes API's deferred items (#562); two shared
  primitives' issues found while building the source card (#564). With 1,000 values in use the gutter has 1,000
  buttons and the listbox 1,000 groups, and screen-reader group navigation at that size has not been tried
  (`m4-record.md` §4).
- **What waits for a real P6 export:** M5 (keep codes on import, and "Swimlanes by code" in the import window) and
  M6 (write them to XER, with the reader released first). Also the two provisional lengths, the parent value and
  whether P6 treats `l1` and `L1` as different short codes. None of it is built on guessed column names.

## References

- `docs/specs/p6-activity-codes/`: `spec.md`, `plan.md`, `database-design.md`, `m0-record.md`, `m2-record.md`,
  `m3-spec.md`, `m3-plan.md`, `m3-record.md`, `m3-ui-design.md`, `m4-spec.md`, `m4-plan.md`,
  `m4-database-review.md`, `m4-ui-design.md`, `m4-record.md`.
- `apps/api/src/modules/codes/`, `activities/activity-codes.service.ts`, `plans/plans.service.ts`,
  `share/share-guest.service.ts`; `packages/layout/src/swimlanes.ts`;
  `apps/web/src/features/codes/`, `features/tsld/render/project-swimlanes.ts`, `swimlane-ghosts.ts`.
- ADR-0012, ADR-0025, ADR-0028, ADR-0034, ADR-0048, ADR-0050, ADR-0051, ADR-0060, ADR-0061, ADR-0071, ADR-0073,
  ADR-0076, ADR-0088, ADR-0127, ADR-0129, ADR-0142, ADR-0156, ADR-0174, ADR-0176, ADR-0194, ADR-0201, ADR-0205,
  ADR-0206.
