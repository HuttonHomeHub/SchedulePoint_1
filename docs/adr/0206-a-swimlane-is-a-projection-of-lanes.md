# ADR-0206: A swimlane is a projection of lanes: each basis keeps its own lane, the rule is in the scene and the name in the gutter

- **Status:** Accepted
- **Date:** 2026-10-25
- **Deciders:** Product owner (swimlanes spec approved 2026-10-22: SQ-1 to SQ-6 with their defaults,
  SQ-7 **yes**); recorded at the epic's gate pass (swimlanes M5)
- **Amends:** ADR-0026 (§8, and its deferred "swimlane-by-resource/WBS modes"), ADR-0031 and ADR-0090 (a
  `Structure` lens, no new row), ADR-0063 Consequences (a third reservation edge), ADR-0100 (the readout),
  ADR-0152 and ADR-0153 (the partition, both layouts). ADR-0200, ADR-0203 and ADR-0156 were amended in
  place by the milestones that changed them (M2-T7, M2-T6, M4-T4/T5); ADR-0205 (guests) was filed with M4-T3.
- **Amended by:** [ADR-0210](0210-an-activity-code-is-plan-data-and-a-code-type-is-a-swimlane-source.md) (2026-10-31): A2 and A7 gain a third source; see the amendment at the end.
- **Spec:** [`docs/specs/swimlanes/`](../specs/swimlanes/): `feature-spec.md` §4.14 (this ADR's outline),
  `schema-design.md` (the schema), `ui-architecture.md` §3 (Part B, adopted as written)

## Context

The owner asked on 2026-10-22 whether the systems in a plan could be shown in swimlanes: labelled
horizontal bands, one per system or trade, with their name. The diagram already had **lanes** (one
row each, `laneIndex`, ADR-0069) and a packer that keeps bars from overlapping inside them. A swimlane
is a group of lanes with a name.

Three facts shaped the design. A lane cannot be inserted between two integers, so writing swimlane
edits back into the one `laneIndex` would rewrite the swimlane-free picture. Turning swimlanes off
has to give that picture back exactly. And a swimlane is presentation, not a scheduling input: the
engine must never see it.

The epic shipped in five milestones: M0 and M1 (the pure functions and the schema, dark), M2 (hand-made
swimlanes on the diagram), M3 (swimlanes that follow the WBS) and M4 (the Activities table, the Gantt,
guests and XER). This ADR records the decisions they rest on.

## Decision

### Part A: data

- **A1. Vocabulary (SQ-1).** A **swimlane** is a named band, always the whole word in the product. A
  **lane** keeps its meaning: one row. A **display lane** is the row a bar is drawn on while swimlanes
  are shown. A **lane basis** is what an in-swimlane lane was written against: one hand-made swimlane,
  "No swimlane" under a hand-made source, one WBS summary, or "No swimlane" under a WBS level
  (`enum SwimlaneLaneBasis` in `apps/api/prisma/schema.prisma`, four labels).
- **A2. Two layouts, and a lane per basis, so off is lossless.** `activities.lane_index` stays the
  swimlane-free layout and no swimlane edit writes it. In-swimlane lanes live in
  `activity_swimlane_lanes`, one row per activity per basis, so switching source or moving work and
  back finds the lane it had (`schema-design.md` §2 shows why one slot plus a basis column fails).
- **A3. The basis is derived by the server and never sent.** A write names a swimlane, or none, and a
  lane. The server derives the basis from the plan's source and the activity's membership, read under
  `FOR SHARE` in the write's transaction; a client-supplied `basis` is a 422 (`update-positions.dto.ts`).
- **A4. Placement, materialise-on-write and the stale-row collision rule.** `deriveSwimlaneLanes`
  (`packages/layout/src/swimlanes.ts`) keeps every stored row unless two members of one swimlane hold
  the same lane with overlapping spans; then the later `updatedAt` keeps it, ties to the lower id, and
  the loser is placed as if it had no row. Unplaced members take the free lane nearest first-fit
  (ADR-0153 D3). A derived lane is stable only until the next write into that swimlane, which stores
  every derived member in the same batch. Unplaced members come only from server-side arrivals
  (import, API create, another client's WBS move), and that window is stated rather than hidden.
- **A5. Partition parity.** `packLanes`, `rowOccupancy` and `nearestFreeRow` take one optional
  `partition`. With it, each swimlane is packed exactly as a whole plan was; with a single-swimlane
  partition, or none, the result is the old one (`nearest-free-row.spec.ts`, the M0-T2 and M2-T6 parity
  suites). Tidy and Re-layout run inside each swimlane while swimlanes are shown (the ADR-0203 amendment).
- **A6. Auto-resolve in both layouts.** An overlap is resolved in the layout it was made in: with
  swimlanes off it moves `laneIndex`, with them on it moves the in-swimlane lane, and only the bar that
  caused it moves (ADR-0153).
- **A7. Sources (SQ-2).** A plan's `swimlaneSource` is `NONE`, `MANUAL` (made by hand) or `WBS` (one
  swimlane per WBS summary at `swimlaneWbsLevel`, kept live). `ck_plans_swimlane_source_level` pins the
  pair. Under `WBS` a drag stops at the swimlane edge and re-filing goes through Breakdown (SQ-5); a
  bar created inside a WBS swimlane is filed under its summary. `swimlaneId` is kept while the source is
  not `MANUAL`, so switching back restores the hand-made assignment.
- **A8. Restoring onto a deleted swimlane is admitted.** An activity restore whose `swimlaneId` names a
  deleted swimlane comes back, and is drawn under "No swimlane" until that swimlane is restored. This
  differs from ADR-0201 D1 on purpose: a calendar is a scheduling input, so returning onto a deleted
  one would silently move dates; a swimlane is presentation, and "a member of a deleted swimlane" is
  exactly the state that deleting a swimlane creates and restoring it reverses
  (`hierarchy-lifecycle.service.ts`, the comment at the batch restore; `schema-design.md` §6). Only a
  **new** assignment to a deleted swimlane is refused (404).
- **A9. Interchange labels and their release order.** A SchedulePoint XER carries swimlanes in three
  more `v1` user-defined fields (ADR-0156's amendment): `SchedulePoint layout v1: swimlane` and
  `… swimlane lane` on `TASK`, and `… swimlanes` (source, level and names in order) on `PROJECT`. The
  reader shipped one release before the writer (ADR-0156 D9: `api` 0.100.0, then 0.101.0). Names are
  held at least as strict as `ck_swimlanes_name_shape` and the `lower()` fold behind
  `uq_swimlanes_plan_name`, because one refused name would roll the whole import back. The label is
  permanent, which is why SQ-1's word cannot be changed later.
- **A10. No flag.** A `VITE_` constant is inlined at build and no published image can switch it off
  (ADR-0088 D1, ADR-0084), so a flag would have been a second root kept forever and never a rollback.
  Work shipped dark until M2-T11 opened the entry point (ADR-0081 §1).

### Part B: frontend (ui-architecture §3, D1 to D12, adopted as written)

- **B1. Display lanes at one seam.** The host swaps each activity's `laneIndex` for its display lane
  (`projectSwimlanes`, `features/tsld/render/project-swimlanes.ts`) before `toRenderActivities`. The
  canvas and the painters know swimlanes only as the scene's `swimlanes` input and the drag's
  `laneRange`. The write path converts back.
- **B2. One composition.** `deriveDiagramSource` (`features/tsld/model/derive-diagram-source.ts`) feeds
  the screen and the export.
- **B3. Where code lives.** Projection and gutter model in `features/tsld/render`; placement and
  partition in `@repo/layout`; queries, manual membership, dialogs and the editor field in
  `features/swimlanes`; composition in the workspace host. ADR-0026 §8 ("`features/tsld` imports no
  other feature") was **not fully held**: the epic gathered the two existing `features/wbs` imports into
  `derive-diagram-source.ts` and added one, `reparent-lanes.ts` (M3-T2), which reads WBS membership. It
  and the ten files that slipped before this epic are `docs/TECH_DEBT.md` #548.
- **B4. The gutter is a left reservation in the canvas band model.** `measure()` subtracts it,
  `sceneOrigin` is the one container offset (the create popover reads it), and the rAF loop writes the
  label positions in the frame the scene paints.
- **B5. The names are DOM text, and the export mirrors them from one pure model.** Real text wraps,
  honours text spacing and is found by find-in-page (WCAG 1.4.5, 1.4.12). `swimlaneGutterModel` feeds
  the gutter and its painted export mirror; the gutter and the ruler carry `data-chrome`, gated by the
  `EXPORT_CHROME_INPUTS` roster (the ADR-0200 amendment).
- **B6. The boundary is a solid rule beneath the links, at about 2:1, and that is the basis.** See
  "The boundary rule's contrast basis" below. The alternating ground is optional (SQ-6 yes) and reuses
  `--canvas-band`; month bands are hidden while it shows. No new colour value.
- **B7. Entry point.** A `Swimlanes` lens toggle in View ▸ `Structure`, shaded with its reason when it
  cannot apply, and a separate **Swimlanes…** command beside it and in the gutter's corner cell. A
  checkbox never opens a dialog (WCAG 3.2.2, ADR-0091).
- **B8. State (SQ-3).** Swimlanes are server data. Shown or hidden is a per-person override on a
  data-derived default that lasts until they leave the plan; collapse is a device preference. Nothing
  is in the URL, and there is no swimlane-free first paint.
- **B9. Keyboard and screen reader.** The gutter is a vertical roving toolbar with one tab stop;
  focusing a swimlane pans to it. The activity listbox is grouped by swimlane with an unchanged count
  and "No swimlane" last. Both were reviewed under ADR-0111 before release.
- **B10. Assignment.** One `SelectField`-based **Move to swimlane…** control on the selection bar, the
  editor and the Activities table's bulk bar. No submenu (`Menu` has none).
- **B11. Room.** The gutter has two fixed widths, expanded and a collapsed strip, and no divider. Below a
  measured container width it collapses and the expand control is shaded with the reason (the ADR-0100
  `minimapRoom` form).
- **B12. Beside the other surfaces.** The WBS band stays inside the stack and the corner cell spans it.
  The minimap draws no swimlane grounds and its readout names the swimlanes in view. The Gantt and the
  Activities table get a Swimlane column and no grouping; under a WBS source the column reads "Follows
  the WBS" with the reason and a way forward.

### The boundary rule's contrast basis

The rule is `--canvas-swimlane-rule: var(--canvas-grid-year)`, with the paper twin
`--canvas-paper-swimlane-rule: var(--canvas-paper-grid-year)` (`apps/web/src/styles/globals.css`).

- **On screen it is about 2:1, deliberately.** The year tier was solved at 2:1 on the ground and 1.9:1
  on the band (`docs/specs/netpoint-grammar/m0-solved.md`), and it sits under the grid's **2.5:1
  ceiling**: the grid is the quietest mark, and decoration stays quieter than every mark that carries
  meaning (ADR-0157, ADR-0199). `token-contrast.test.ts` gates the alias under that ceiling on both
  `--canvas` and `--canvas-band`, and requires it to stay visible (above 1:1).
- **That is below WCAG 1.4.11's 3:1, and the reason it may be is redundancy.** The rule is not the
  only place membership is shown. Every swimlane's name is DOM text in the gutter (and in the collapsed
  strip's accessible name and tooltip); the activity listbox groups by swimlane; each activity's
  description says which swimlane and lane it is in; and the Activities table, the Gantt and the editor
  show it in words. No reader depends on perceiving the rule. The M5 accessibility review confirmed
  that redundancy in the code.
- **A louder rule was not chosen** because it would outrank the year boundary it aliases and the links
  that cross it, and because the alternating ground (1.02:1) cannot carry the boundary on its own
  (`ui-architecture.md` C5).
- **On paper it keeps a 3:1 floor.** An exported picture has no ruler and no gutter interaction, so
  the paper twin is gated at **≥ 3:1** on `--print`, like the paper month and year rules.
- **Under a Windows contrast theme** the diagram keeps its own palette (ADR-0191 D3), so the aliases
  get no override; `token-architecture.test.ts` pins that.

## Alternatives considered

Taken from feature-spec §4.14, where each is argued:

- **One layout, writing `laneIndex` from swimlane edits.** Rejected: a lane cannot be inserted between
  integers, and editing inside a swimlane would rewrite the swimlane-free picture.
- **One layout that switches.** Rejected: "off" would have no layout to return to.
- **Header lanes** (a 60 px title row per swimlane). Rejected on the vertical budget (ADR-0092, ADR-0180).
- **A ground and no rule.** Rejected: 1.02:1 cannot be seen, and a gate holds it there.
- **A server-side projection.** Rejected: it is presentation and needs the drawn spans.
- **The gutter outside the canvas stack.** Rejected: ADR-0063's rejected overlay, and it moves the popover.
- **One lane slot plus its basis on the activity.** Rejected on correctness (`schema-design.md` §2).
- **Swimlanes by resource.** Not built. An activity can carry several resources, so it has no single
  band; the owner asked for systems, which the WBS or a hand-made list already gives.

## Consequences

- **No engine, recalculation or schedule change.** Swimlanes are not a scheduling input; the
  `schedule-input-fields.ts` classification makes adding one a compile error, and ADR-0034's parity gate
  is untouched.
- **Known gaps, recorded:** the editor's Breakdown field and Dissolve leave the moved activity's lane to
  be derived (`docs/TECH_DEBT.md` #547); a guest sees no swimlanes on a WBS-source plan (ADR-0205 D3);
  an XER export of a WBS-source plan writes only the source and level, because the reader re-derives
  membership; the Gantt view says nothing when the swimlane list fails to load (#549). The owner chose
  on 2026-10-25 to keep all of these as follow-ons.
- **Lane rows are never pruned.** An activity gains a row per basis it is placed on. The expiry budget
  (`LANE_ROWS_PER_ACTIVITY`) was measured in M1; re-measure the page payload and the baseline capture
  if real plans pass about three rows per activity.
- **The follow-on the brief now points at** is P6 activity codes as a third source
  (`docs/BACKLOG.md`).

## Amendment, 2026-10-31 ([ADR-0210](0210-an-activity-code-is-plan-data-and-a-code-type-is-a-swimlane-source.md), P6 activity codes)

- **A2.** "In-swimlane lanes live in `activity_swimlane_lanes`" now holds for the hand-made and WBS sources only.
  Lanes written while the swimlanes come from a code live in their own table, `code_swimlane_lanes`, one row per
  (activity, code, value or none), so switching between codes, or to another source and back, is as lossless as
  A2 promises. `SwimlaneLaneBasis` keeps its four labels and `activity_swimlane_lanes` is unchanged: widening its
  unique index would have broken the previous image's lane writes on every plan (`42P10`, probed), so a rollback
  would have failed everywhere.
- **A7.** A fourth value, `ACTIVITY_CODE` (one swimlane per value of a code in use, kept live), with
  `plans.swimlane_code_type_id` bound to it by the replaced `ck_plans_swimlane_source_level`. A code can be chosen
  when 1 to 100 of its values are in use, WBS summaries not counting. Under it, as under `WBS`, a drag stops at
  the swimlane edge; work changes band through **Move to swimlane…** or **Set code…**, which write the code and
  the lanes together, and a hand-made `swimlaneId` is refused 422 (kept for switching back, as A7 already said for
  the WBS source). The rest of the decisions it rests on are ADR-0210's.
- **Consequences.** The follow-on this ADR pointed at has shipped for M0 to M4; P6 import and XER export of codes
  wait for a real P6 export (ADR-0210 D13).

## References

- `docs/specs/swimlanes/feature-spec.md`, `schema-design.md`, `ui-architecture.md`,
  `implementation-plan.md`, `m0-reading.md`, `m2-t2/`.
- ADR-0026, ADR-0031, ADR-0063, ADR-0069, ADR-0081, ADR-0088, ADR-0090, ADR-0100, ADR-0106, ADR-0111,
  ADR-0152, ADR-0153, ADR-0156, ADR-0157, ADR-0191, ADR-0199, ADR-0200, ADR-0201, ADR-0203, ADR-0205.
