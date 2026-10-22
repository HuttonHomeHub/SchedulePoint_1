# Swimlanes: frontend architecture review

- **Status:** Draft, input to [`feature-spec.md`](./feature-spec.md) and
  [`implementation-plan.md`](./implementation-plan.md). It does not edit them.
- **Author:** ui-architect (Claude Code), for James Ewbank (product owner)
- **Date:** 2026-10-22
- **Base:** `origin/main` 9788f1f. Every `file:line` below was read on that tree. Paths are under
  `apps/web/src/` unless they start with `docs/`, `packages/` or `apps/`.

This review checks the on-screen design: the projection, the label column, the boundary mark,
the entry point, the minimap, export, keyboard and screen-reader access, the Gantt and state
placement. It accepts the data model (two layouts and a lane basis) and does not reopen it.

---

## 1. What I agree with

- **A swimlane is a projection over lanes, not a new coordinate system** (spec §4.1).
  `screenYOfLane` and `laneAtScreenY` are linear in the lane
  (`features/tsld/render/geometry.ts:718-731`), so stacked contiguous swimlanes keep that
  linearity, and cull, hit-test and routing need no
  seams. Inserting space between swimlanes would break it. Do not add space between them.
- **Two layouts, off is lossless, and the lane basis** (spec §4.4). This is the only design in
  which turning swimlanes off leaves the diagram exactly as the planner drew it.
- **Names in a column, not in header lanes** (SQ-4). A header lane costs a 60 px pitch per
  swimlane against the scarcer vertical budget (ADR-0092, ADR-0180). A column costs width.
- **No rule drawn exactly where a single link run is drawn, as a mark above links.** The
  router's evidence is real. A run in a gutter takes channel 0, the lane boundary, first
  (`render/link-routing.ts:294`, `:297-305`, first fit at `:416-425`). Gutter runs are found by
  "any interior horizontal segment lying on a lane boundary" (`:366-375`). Links between
  swimlanes are the reason for the feature, so they will often run along a swimlane boundary.
  §2 C5 keeps a rule, but under the links.
- **No toolbar promotion, no new row** (spec §4.8). The entry point lives in `View ▾`, so it
  costs the deck nothing at the 1024 floor (ADR-0090, ADR-0185, ADR-0179).
- **The WBS band and swimlanes can be on together.** The band is a reservation at the top of the
  canvas stack (`components/TsldCanvas.tsx:2722-2743`, `sceneTopOffset` at `:242-244`). The name
  column is at the left and the corner cell covers ruler plus band. Summaries the band lifts out
  stay out of the projection. That is right, and it is the same rule that keeps the listbox count
  fixed (`components/TsldPanel.tsx:1225-1239`).
- **No Gantt grouping in this epic**, only a Swimlane column. The Gantt's rows are its WBS tree,
  and regrouping them is its own design.
- **No feature flag, and the entry point is the last task of M2** (ADR-0088 D1, ADR-0081).
- **The minimap readout names swimlanes instead of lane numbers.** The current sentence is
  "lanes a–b" (`components/TsldMinimap.tsx:159`), which means nothing once lanes are display
  lanes.
- **Arrange works within each swimlane**, through an optional partition that changes nothing when
  absent. `optimise-layout.ts:1` and `relayout-starts.ts:1` already import the packer, so this
  is one parameter, not a new path.

---

## 2. What I would change

Each change has a reason and the code that shows it. C1–C8 change what is built. C9–C13 refine
it.

### C1. The toggle is a lens toggle, not a `TsldViewToggles` key

The spec makes `swimlanes` a `TsldViewToggles` key under `VIEW_TOGGLE_META` (§4.8, M2-T2), and
also says it is shaded with a reason when nothing is set up (US-1). Those two do not fit
together:

- `VIEW_TOGGLE_META` holds only `{ group, label, enabled? }`, and `enabled` is a build-time flag
  (`toolbar/tsld-toolbar-items.tsx:647-650`).
- The second list, `LensToggleBase`, exists because its members "carry something the view
  toggles never do: a reason they are shut" (`:198-212`). It has `reason(ctx)` (`:221`). Its rows
  render through `CheckboxField` with a linked gate reason (`:2338-2361`).
- `view-toggles.ts:38-42` gives the test: "a lens exists because it needs data that can be
  loading or absent". Swimlanes need data: the swimlane list, the plan's source, and whether
  anything is set up.

**So:** add a `LensToggle` `{ id: 'swimlanes', group: 'structure' }`, with `enabled: false` until
M2-T11 (that keeps M2 dark, `:217`). Its reasons are, in order: no diagram
(`LENS_NO_DIAGRAM_REASON`, as at `:391-393`), "Loading swimlanes…", and "No swimlanes have been
set up for this plan." The painter gets a scene input `swimlanes?: SwimlaneScene` only while
they are shown. Absent means parity. The host builds it, as it builds `TsldScene.monthBands`
(`view-toggles.ts:75-81`). `Structure` is a folded disclosure (`:2151-2155`). Its label counts
checked lenses (`:2389-2391`), so it reads "Structure (1 on)" for free.

### C2. A checkbox never opens a dialog. Setup gets its own button

The spec has the toggle open the setup dialog when nothing is set up and the reader holds the
pen (§2 Workflows, §4.9). I would change this:

- **WCAG 3.2.2 On Input.** Changing a control's setting must not change context without warning.
  A modal dialog that takes focus is a change of context.
- **ADR-0091: a mode is not a command.** A view toggle and a command that opens a dialog are two
  kinds of control.
- **The control would mean two things.** A checked box can be cleared. A box that opens a dialog
  when clicked is then unchecked when cancelled, which nothing tells you in advance.

**So:** the `Structure` section gets a button under the toggle: "Set up swimlanes…" when none
exist, "Swimlanes…" when some do. It is shaded with "Take the pen to set up swimlanes." without
the pen (ADR-0082, ADR-0204). There is a precedent for a button in this popover: "Fit to plan" in
the Zoom section (`:2273-2285`). Once swimlanes exist, the gutter's corner cell carries the same
"Swimlanes…" command, which puts the action on the object (ADR-0093). The journey must expand
`Structure` before it reaches the toggle.

### C3. The gutter sits in the canvas root, as a reservation painted by the same loop

The spec puts the gutter "a sibling of the canvas stack, outside it" and says "outside the stack
there is none [no offset] to add" (§4.2, M2-T3). Both halves are contradicted by the code:

- **ADR-0063 has already rejected this design.** "A DOM overlay pinned above the canvas. Rejected:
  it would have to re-derive the axis from the viewport on every pan frame to stay aligned"
  (`docs/adr/0063-…md:222-224`). A gutter outside `TsldCanvas` cannot read `viewRef` in the frame
  the scene is painted, so it would be that overlay turned on its side.
- **There is an offset to add.** The create popover is positioned against the `Surface`, not the
  canvas. Its x is `pendingCreate.anchor.x`, which is canvas-relative (`TsldPanel.tsx:3443-3456`,
  `:3530-3539`). Any column to the left of `TsldCanvas` inside the `Surface` moves the popover by
  that column's width. This is ADR-0063 §5's y failure, in x.
- **The house construction is a reservation.** `measure()` subtracts each band from the size
  independently (`TsldCanvas.tsx:1908-1919`). Each band is repainted when `movedThisFrame` is set
  or its own dirty flag is (`:2240-2264`). The ruler is DOM written imperatively from that same
  loop (`:2658-2667`). ADR-0063's Consequences call this the canvas band model.

**So:**

- `TsldCanvas` takes `gutterWidthPx`. Zero means parity, exactly as `wbsBandHeightPx` does.
- `measure()` subtracts the gutter width, and the stack layers start at the gutter's right edge.
- `sceneOrigin(wbsBandHeightPx, gutterWidthPx) → { left, top }` replaces `sceneTopOffset` as the
  only definition of where the scene starts in the container. Every call site goes through it,
  the popover's x included.
- The rAF loop writes the gutter's label positions (sticky top, clamped to each swimlane's
  visible extent) from `viewRef`, in the frame the scene is painted.
- M2-T3's anchor regression tests stay, now about this function.

### C4. Gutter labels are DOM text. The export mirror comes from one pure model

- **The labels should be text.** They are chrome a reader reads, and HTML can show them, so
  WCAG 1.4.5 (images of text) asks for real text rather than canvas pixels. Real text also gets
  wrapping, text spacing (1.4.12) and find-in-page.
- **The precedent is the ruler.** ADR-0106 D1 is "a full-height rule stays on the canvas. Its
  label moves to the ruler" (`docs/adr/0106-…md:60`). The gutter is the same idea turned on its
  side: the boundary is a scene mark (C5), and its name is chrome.
- **SC-5 claims more than the gates check.** The layer gate finds `<canvas data-layer>` elements.
  The scene-key gate finds `TsldScene` keys. The gate file says outright that it "cannot see …
  DOM chrome (the ruler, the legend, the strip's panel)"
  (`features/tsld/export/scene-parity.structural.test.ts:209-211`). So a DOM gutter passes
  both gates whether or not the export draws it.

**So:**

- `swimlaneGutterModel(scene, view, size, measure?)` is a pure function in `features/tsld/render`.
  It returns each swimlane's label box, name, count and whether the name had to be cut. The
  optional `measure` follows ADR-0106 (`:125-127`).
- The DOM gutter and the export's painted mirror both call it. The two may break lines in
  different places (CSS against `measureText`). Which names appear, their order, their boxes and
  their counts are one derivation, and that is what parity means here.
- Close the hole SC-5 leans on: give DOM chrome a literal `data-chrome="…"` and an
  `EXPORT_CHROME_INPUTS` roster beside the layer roster (`:246-271`), for the ruler and the
  gutter. Otherwise, reword SC-5 to say only the grounds and rules are gated.

### C5. The boundary is a rule under the links, because the ground cannot show it

The spec chooses "a quiet alternating ground and no boundary rule" (§4.2, alternative F). The
ground cannot be seen well enough to carry the boundary:

- **The only alternating ground is 1.02:1 and cannot get louder.** `--canvas-band` is 1.02:1
  against the canvas, held down so it stays lighter than the non-working wash
  (`styles/globals.css:566-575`). A gate enforces that order: "wash … is not darker than the
  band" fails the build (`features/tsld/render/print-palette.structural.test.ts:221-238`). A
  swimlane tint loud enough to see would break that order, or would need the wash and every
  paper ground solved again.
- **At 1.02:1 a reader far from the gutter cannot see where Mechanical ends.**

The router objection to a rule holds only for a rule painted above the links. Grounds paint as
"Layer -0.5" and "Layer 0", beneath everything (`render/paint.ts:1192-1221`). Edges paint much
later (`:1634-1656`). So a link on channel 0 covers a rule there. A rule does not cover the link.
The link also has its own hue and shape: violet with direction marks (ADR-0157 D4). The rule's
remaining cost is that it is hidden under a leg that runs along it, which is the correct order of
loudness (ADR-0199).

**So:**

- Draw a full-width horizontal rule at each swimlane boundary, in the ground and grid pass,
  beneath every link and bar. It is a scene mark (ADR-0106 D1).
- **Add no new colour value.** Add alias tokens `--canvas-swimlane-rule: var(--canvas-grid-year)`
  and the paper twin `var(--canvas-paper-grid-year)` (`globals.css:759-768`). They inherit every
  contrast sweep that already covers those values. They give the legend census its own key
  (ADR-0157 Consequences). Keep the rule solid, so it is not the same shape as the dashed day and
  month rules (ADR-0157 D1).
- The alternating ground becomes optional (Q-UI-1). If it is kept, it reuses `--canvas-band`,
  which is already in `PLOT_GROUNDS` (`styles/token-contrast.test.ts:341-346`) and the print
  palette. That means no new ground and no new contrast work. Month bands are then hidden while
  swimlanes show, as the spec says. If it is dropped, month bands need not be hidden at all.
- Render rule-only and rule-plus-ground on the reference plan with the harness, commit both
  pictures, and record how many link runs coincide with a boundary (the ADR-0203 D3 form). This
  is a picture to review, not something the owner has to measure.

### C6. Display lanes are swapped in at one boundary, so the canvas never learns about swimlanes

The spec plans a census of "every `laneIndex` read in `features/tsld`" (M2 Feature risks). That
census is large because the projection's seam is not stated. State it instead:

- The host gives `toRenderActivities` copies of the activities whose `laneIndex` is the display
  lane.
- Then lane-overlap flags (`render/to-render-model.ts:46-53`), the render lane (`:58`), cull,
  hit-test, the router and the minimap marker (`TsldMinimap.tsx:144`) are all correct with no
  edit, because each already reads that field.
- `TsldCanvas`'s intents come back in display lanes. Only the host's write path converts them
  back to (swimlane, lane in swimlane).
- The census shrinks to the host and the write-side hooks, and the render layer stays free of
  swimlanes (ADR-0026 §8).
- One generic optional prop is needed: `laneRange?: (id) => { min, max }`, in display lanes. A
  WBS-sourced drag (SQ-6) is then clamped while it is in progress, instead of being refused after
  a ghost has crossed the boundary. Absent means unconstrained, which is parity.

### C7. One function builds the diagram's input for the screen and for the export

The WBS band is already derived at two sites: `TsldPanel.tsx:1213-1239` and
`toolbar/commands/use-diagram-image.ts:166-171`. Each runs `deriveWbsBandSource` and then
`toRenderActivities`. Adding the swimlane projection at both sites makes two sites that each chain
two derivations, which is the drift ADR-0063 §9 exists to prevent.

**So:** extract `deriveDiagramSource(activities, { wbsBand, swimlanes, source })` →
`{ sceneActivities, bandGroups, bandHeight, swimlaneScene }`. Both sites call it. This is the
second consumer, so extracting now is justified rather than speculative.

### C8. Where the code lives, and keeping ADR-0026 §8

ADR-0026 §8 says `features/tsld` "imports **no** other feature"
(`docs/adr/0026-…md:328-331`). That has already slipped: `TsldPanel.tsx:132-135` imports
`activities`, `plan-actions` and `wbs`, and `use-diagram-image.ts:32` imports `wbs`. The spec
cites the WBS band as its precedent for adding a fourth. Do not add it. The workspace already
has a composition host: `components/layout/workspace/use-plan-workspace-model.ts`, which imports
feature after feature (`:34-88`).

- **Queries, manual membership, dialogs, editor field:** `features/swimlanes`. This is the
  feature-first rule.
- **WBS membership at level N:** `features/wbs/model`, beside `wbs-groups.ts`. Then the Gantt,
  the band and swimlanes cannot disagree about membership.
- **Composing a neutral `SwimlaneInput`:** `use-plan-workspace-model.ts`, the existing host. It
  passes a read model to `TsldPanel`, as §8 asks.
- **`projectSwimlanes` and `swimlaneGutterModel`:** `features/tsld/render`. Display lanes are a
  render concept, and the screen and the export are the only consumers.
- **`deriveSwimlaneLanes` and `partition`:** `@repo/layout`. The package exists for "two callers
  [that] need the same answer" (`packages/layout/src/index.ts:4-14`). The XER importer packs
  within swimlanes when it restores them (M4-T4).

Record the existing slips in `docs/TECH_DEBT.md` as a candidate row. Do not fix them in this epic.

### C9. The keyboard and screen-reader model

- **The gutter is one tab stop.** It is `role="toolbar"` with `aria-orientation="vertical"` and
  `aria-label="Swimlanes"`. Each label is a button with `aria-haspopup="menu"` that opens the APG
  `Menu`.
- **Reuse the roving logic. Do not reuse the `Toolbar` component.** `rovingIndexFor` already
  handles ArrowDown, Home and End and the start-from-container case
  (`components/ui/toolbar/toolbar-keyboard.ts:139-148`). The `Toolbar` component "is horizontal,
  full stop" (`components/ui/toolbar/Toolbar.tsx:178-184`), and its docblock warns that saying
  the wrong orientation is the one thing `aria-orientation` must not do. So the gutter is a small
  composite on the shared function, and it gets the ADR-0111 review (M2-T9 already plans this).
- **Tab order.** The gutter renders inside `TsldCanvas` (C3), which comes before the listbox
  (`TsldPanel.tsx:3459` against `:3705`). So Tab reaches the gutter, then the diagram listbox,
  then the minimap and the viewport cluster. That follows the visual order, left to right.
- **Group the listbox, keep its count.** Today it is a flat list in plan order
  (`TsldPanel.tsx:3738-3758`). With swimlanes shown, give each swimlane a `role="group"` labelled
  by its name, in swimlane order, and keep plan order inside each group. Keep the spec's ", in
  Mechanical, lane 2 of 3" text for announcements.
  - ADR-0122's rule is that a structure must be reachable, not only described. A suffix on every
    row describes the structure. Groups make it navigable.
  - The ADR-0063 §4 count invariant still holds.
  - `onListKeyDown` (`:2219`) must follow the rendered order. This is the expensive part, so it
    needs its own test.
- **Off-screen swimlanes stay reachable.** Every swimlane has a button. Focusing one pans the
  canvas to it through the existing `centerOnWorld(null, lane)` (`TsldCanvas.tsx:168-173`).
- **Accessible name.** "Mechanical, swimlane 2 of 5, 14 activities, 3 lanes" starts with the
  visible text, so it meets WCAG 2.5.3. Keep it.

### C10. Moving work between swimlanes uses the existing select, not a submenu

`Move to swimlane ▸ <name>` (US-3) needs submenus. The `Menu` primitive has "no submenus or
typeahead" (`components/ui/menu.tsx:37-43`), and a flat menu of 100 swimlanes with no typeahead
cannot be used.

**So:** "Move to swimlane…" opens a small popover with a `SelectField` and a Move button. That is
the control `WbsBulkAssignBar` already uses for the same job
(`features/wbs/components/WbsBulkAssignBar.tsx:9`, `:111-131`). A native select brings its own
typeahead. Use the same `SelectField` for the editor
field and the table's bulk bar, so all three assignment surfaces use one control.

### C11. Where each piece of state lives (ADR-0004)

- **Swimlanes, plan source and level:** TanStack Query (server). The source is on the plan
  record, so it is known when the plan loads.
- **Shown or not:** client state, `override ?? (source !== 'NONE')`, kept in the lens state of
  `useTsldCanvasUiState`. It resets on plan switch with the other plan-specific state
  (`toolbar/use-tsld-canvas-ui-state.ts:209-233`). See the first note below.
- **Gutter collapsed:** a device preference in `localStorage`. The minimap and legend use the
  same shape (`toolbar/use-minimap-panel-prefs.ts:10`). This is the third such hook, so extract
  `useDevicePref(key, parse, fallback)` first.
- **Setup and manage dialogs:** component state for one opening (ADR-0169).
- **Nothing in the URL,** like every other `View ▾` toggle. The minimap docblock gives the reason
  (`use-minimap-panel-prefs.ts:3-11`). The data-derived default means a shared link opens as the
  plan was set up.

Two notes on these:

- **SQ-3 says "for their own session only", which is not quite what happens.** View state is
  `useState` that resets on every mount and plan switch (`view-toggles.ts:32-36`). So the on/off
  choice lasts for one visit to the plan, not one browser session. The copy and the ADR should
  say "until you leave the plan".
- **The swimlane-free picture must not flash first.** When `source !== 'NONE'` and the swimlane
  list is still loading, the diagram stays in its loading state (ADR-0202). It must not paint the
  swimlane-free layout and then jump every bar into its swimlane.

### C12. The 1024 floor: a fixed width, withdrawn with a reason when there is no room

- **The gutter has two fixed widths: expanded and a collapsed strip.** It has no drag divider.
  A divider would bring ADR-0188's single-pointer twin and ADR-0173's typed twin, and nothing
  needs a third width.
- **The collapsed strip** keeps each swimlane's bordered block and its position number. The full
  name stays in its accessible name and its tooltip (ADR-0117).
- **When the stage is too narrow to stay usable with the gutter expanded, it collapses**, and the
  expand control is shaded with the reason. The precedent is the minimap's `minimapRoom`
  (`tsld-toolbar-items.tsx:338-342`, `:547-552`): it says why it is shut rather than drawing a
  panel that does not fit. Set the threshold as a container width (ADR-0182), measured in M2-T3.
- **It costs no height,** so the 600 px floor is unaffected.

### C13. The minimap gets display lanes for free and draws no grounds

Given C6, the bitmap and the selection marker use display lanes with no edit. Keep the minimap's
grounds as they are. `MINIMAP_GROUNDS` leaves out the month band on purpose, because "a minimap
has no month band" (`styles/token-contrast.test.ts:348-355`). A swimlane ground there would add a
ground to its contrast set. Boundary ticks are optional, and only if they pass that same set.

---

## 3. Draft ADR outline (frontend decisions)

**Title:** "A swimlane is a rule in the scene and a name in the gutter". This is a companion to the
spec's §4.14 data ADR, or a section of it. Its decisions:

- **D1. Display lanes at one seam.** The host swaps each activity's `laneIndex` for its display
  lane before `toRenderActivities`. `TsldCanvas` and `render/` never learn that swimlanes exist,
  apart from the `swimlanes` scene input and the optional `laneRange`. The write path converts
  back.
- **D2. One composition.** `deriveDiagramSource` feeds both the screen and the export (it
  generalises ADR-0063 §9).
- **D3. Where code lives.** Projection and gutter model in `features/tsld/render`. Placement and
  partition in `@repo/layout`. WBS membership in `features/wbs`. Composition in the workspace
  model. No new sideways feature import (ADR-0026 §8 held).
- **D4. The gutter is a left reservation in the canvas band model.** `measure()` subtracts it.
  `sceneOrigin` is the only container offset. The rAF loop positions the labels from `viewRef`
  (extends ADR-0049 and ADR-0063 to the left edge).
- **D5. The labels are DOM text, and the export mirrors them from one pure model.** Add a
  DOM-chrome roster to the ADR-0200 gate (amends ADR-0198's recorded gap for the ruler and the
  gutter).
- **D6. The boundary is a solid rule beneath links,** using alias tokens of the year rule. The
  alternating ground is optional and reuses `--canvas-band`. No new colour values (applies
  ADR-0106 D1 and ADR-0157 D1/D4).
- **D7. Entry point.** A `LensToggle` in `Structure` with shut reasons, and a separate
  "Swimlanes…" command beside it and in the gutter's corner cell. A checkbox never opens a dialog
  (WCAG 3.2.2, ADR-0091).
- **D8. State.** Server data. Shown or not as an override on a data-derived default, until you
  leave the plan. Collapse as a device preference through a shared hook. Nothing in the URL. No
  swimlane-free first paint.
- **D9. Keyboard and screen reader.** A vertical roving gutter on `rovingIndexFor`. A grouped
  listbox with an unchanged count. Focusing a swimlane pans to it. ADR-0111 review before release.
- **D10. Assignment.** One `SelectField` control on the selection bar, the editor and the table.
  No submenu.
- **D11. Room.** Two fixed widths, and the gutter is withdrawn with a reason below a measured
  container width (the ADR-0100 `minimapRoom` form).
- **D12. Beside the other surfaces.** The WBS band stays inside the stack and the corner cell
  spans it. The minimap draws no grounds and its readout names swimlanes. In the Gantt, the toggle
  is shaded with the no-diagram reason, and the Gantt gets a column but no grouping.

The ADR also amends: ADR-0063 Consequences (a third reservation edge), ADR-0100 (the readout),
ADR-0200 (the chrome roster) and ADR-0031/0090 (no new row; a `Structure` lens).

---

## 4. Question for the owner (one)

- **Q-UI-1. Should swimlanes also be striped?** Each boundary gets a thin dividing line either way
  (§2 C5). The question is whether alternate swimlanes should also get the very faint
  month-band shade.
  - **Default: yes.** When month-band striping was switched off, you named swimlanes as the case
    where it would help (`render/view-toggles.ts:126-133`).
  - **The cost:** month bands are hidden while swimlanes show, to avoid a chequerboard. The shade
    is at the system's quietest level, so the line does the real work.
  - **If you say no:** month bands keep working alongside swimlanes.
  - You will see both versions as rendered pictures in M2 before anything ships.

---

## 5. Changes this implies for the plan (for the analyst to fold in)

- **M0-T1:** `projectSwimlanes` moves to `features/tsld/render`. `deriveSwimlaneLanes` stays in
  `@repo/layout` (C8).
- **M2-T1:** composition moves to `use-plan-workspace-model.ts`. WBS membership is in
  `features/wbs`. Add `deriveDiagramSource` (C7, C8).
- **M2-T2:**
  - add a `LensToggle`, not a `VIEW_TOGGLE_META` key (C1);
  - add the boundary rule and its alias tokens (C5);
  - render rule-only and rule-plus-ground pictures for Q-UI-1.
- **M2-T3:**
  - the gutter becomes a left reservation in `TsldCanvas`;
  - `sceneOrigin` replaces `sceneTopOffset` (C3);
  - `swimlaneGutterModel` (C4);
  - the room threshold (C12);
  - extract `useDevicePref` (C11);
  - the narrower census against the C6 seam.
- **M2-T4:** `laneRange` for clamping a WBS-sourced drag while it is in progress (C6).
- **M2-T7:** the export mirror reads `swimlaneGutterModel`. Add the `data-chrome` roster (C4).
- **M2-T9:**
  - the gutter composite on `rovingIndexFor` (C9);
  - the "Set up swimlanes…" / "Swimlanes…" button (C2);
  - ADR-0111 review.
- **M2-T10:**
  - "Move to swimlane…" as a `SelectField` popover (C10);
  - the grouped listbox and its keyboard order (C9).
- **M2-T11 journey:** expand `Structure` first. Set up through the button, not the checkbox (C2).
- **SQ-3 copy:** "until you leave the plan", not "session" (C11).

## 6. Implementer checklist

- [ ] With swimlanes off, or with `gutterWidthPx = 0`, the paint log is byte-identical (SC-3).
- [ ] With the gutter open, closed and collapsed, the popover's x and y equal the click point.
- [ ] No `features/tsld/render` file and no `TsldCanvas.tsx` import names `swimlanes` as a
      feature.
- [ ] Screen and export call one `deriveDiagramSource` and one `swimlaneGutterModel`.
- [ ] No new colour value in `globals.css`. Only aliases, recorded in `docs/DESIGN_SYSTEM.md`.
- [ ] Toggling never opens a dialog, and every shut control says why (ADR-0082, ADR-0204).
- [ ] The listbox count is unchanged across the toggle, and the arrow keys follow group order.
- [ ] The gutter's keyboard contract was reviewed by accessibility-reviewer and
      component-reviewer before release (ADR-0111).
- [ ] With a WBS source, no frame paints the swimlane-free layout first.
