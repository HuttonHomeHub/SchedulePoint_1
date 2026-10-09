# Implementation Plan: Toolbar redesign for a laptop, Surface Pro and monitor-first app

- **Feature spec:** [`feature-spec.md`](feature-spec.md)
- **Status:** Draft
- **Owner:** web

## Breakdown

The product owner's answers are **gates**: a milestone does not start until its gate is closed. CQ-1, CQ-2, CQ-3 and
the free-space requirement were decided on 2026-10-09. CQ-4 is still open.

```mermaid
flowchart LR
  M0[M0 Measure: ships dark] --> G0{Premises hold? <20px rule}
  G0 -- no --> STOP[Amend spec, ask the product owner]
  G0 -- yes --> M1
  Q2[[CQ-2 decided: 3 compact items]] --> M1[M1 Docs fixes + one label rule + 2 lines at the floor]
  M1 --> M2[M2 Relocations: identity row, Panels, Float paths, View panel at 1024]
  Q3[[CQ-3 decided: narrow only]] --> M3[M3 Below 1024: scrolling line, #471]
  M1 --> M3
  Q1[[CQ-1 decided: corner cluster]] --> M4[M4 Diagram-corner cluster]
  M2 --> M4
  QF[[Free-space requirement]] --> M5[M5 Promotion ladder]
  M3 --> M5
  M4 --> M5
  Q4[[CQ-4 open: org switcher]] --> M6V5[M6 V5 only]
  M5 --> M6[M6 Visual brief V1-V7]
  M6 --> M7[M7 Close-out: ADR, docs, counts]
```

### Epic

**Toolbar redesign.** Both toolbars are re-laid for a 1024 × 600-and-up product:

- two command rows, each one line at the floor;
- every tool on its subject's surface;
- labels that give way by declaration;
- spare width filled by promoting menu commands;
- a usable band in narrow windows.

**For every milestone:**

- No flag (ADR-0088 D1).
- Each milestone is a commit boundary that names its entry point or ships dark (ADR-0081).
- Run `pnpm prepush` plus `scripts/e2e-local.sh web:<suite>` for every changed journey before pushing.
- The **builder** agent implements; there is no schema, so database-architect is not involved.
- Re-read every `file:line` cited here before using it.

---

### Milestone M0: Measure and verify the premises (ships dark)

**Outcome:** `docs/specs/toolbar-redesign/m0-measurement.md`, `promotion-widths.json` and a go/no-go.
**Entry point:** `Ships dark: a measurement record and a harness spec.`
**Journey:** none (a harness, ADR-0081 §3).

##### Task M0-T1: the harness and readings (≈ one PR)

- **Description:** `apps/web/measure-toolbar/toolbar-redesign-m0.spec.ts` in the existing **non-CI**
  `playwright.measure-toolbar.config.ts`.
- **Complexity:** M
- **Run with:**
  `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome DATABASE_URL=postgresql://app:app@localhost:5432/app_test pnpm --filter @repo/web measure:toolbar -- toolbar-redesign-m0`
- **Cells:**
  - the requested 1024 × 600, 1280 × 800, 1440 × 900 and 1912 × 1080;
  - the product owner's 1912 × 948 and 1912 × 1114;
  - 1280 × 600 and 1366 × 768 (short but wide, CQ-3);
  - 2560 × 1440;
  - #471's 640 × 480, 640 × 360, 640 × 300, 320 × 720 and 320 × 256;
  - 1280 × 800 with `html { font-size: 200% }`.

  Every cell on **both pointers**.

- **Stress states:** the base state; conflicts present (chip shown); pen held by a peer; no computed diagram; Gantt
  view; a dock open; minimap open; a selection present.
- **What it reads:**
  - header, band, deck lines (overall and per row), `<main>` top, canvas height, foot height, and whether Expand and
    Recalculate are hit-testable;
  - **per row, the unused width** (SC-17 "before");
  - per item: id, row, group, x, y, width, label shown, tooltip present;
  - per menu: item names, and the panel height at 1024 × 600 (View must reach SC-13);
  - any group seam at the start of a line (SC-12);
  - the minimap's box and its `bottom` offset (`TsldMinimap.tsx:400`), and when `minimapRoom` turns false
    (`TsldCanvas.tsx:889`, `:2685`).
- **Development steps:**
  1. Write the spec and run it.
  2. Write the record with **§0 "what contradicts the spec"** first.

##### Task M0-T2: premises (same PR)

1. **Compact set at the floor:** with CQ-1 applied (zoom gone), the three compact items, Summary moved and Comments
   in Panels, is each row one line at 1024 × 600 in **every** stress state?
   **Exit rule:** if any row misses by less than 20 px in any state, **stop and ask** rather than compacting a
   fourth item.
2. **`--container-roomy`:** the smallest deck width at which every row is one line with every label visible.
3. **The Gantt route for Float paths:** does `GanttRowMenu.tsx` mirror the selection bar's object actions? Is
   `selection-actions.tsx:206` ("the Gantt renders no selection bar") still true? Decide D-c.
4. **Tailwind v4:** confirm the `@container/deck` and `@max-roomy/deck:` syntax and the `--container-*` theme
   token in the installed version. Register a dependency claim if a docblock will assert it.
5. **`promotion-widths.json`:**
   - measure every ladder entry's **promoted form**, using a local, uncommitted run in which every entry is set to
     the 1280 stage at a 4000 px viewport;
   - run `computePromotionStages` (pure, committed with M5) to propose each entry's stage;
   - record the header's free width at 1280 (H-P1).
6. **Suite impact:** every test that locates a moved or promotable control by name, with `file:line`.
7. Replace every estimate in the spec with a reading.

---

### Milestone M1: Docs first, one label rule, two lines at the floor (gate: CQ-2)

**Outcome:** at 1024 × 600 fine the deck is two lines. Baseline overlay, Comments and Settings show their icon
only, below `--container-roomy`. One resolver and one helper decide every label.
**Entry point:** the "Plan commands" toolbar at 1024 × 600.
**Journey:** `e2e-workspace-fit/command-surface.spec.ts`, which asserts:

- `LINES[1024] = 2`;
- a coarse 1024 cell at ≤ 3;
- a 1024 `BAND_MAX_PX` bar from M0;
- the three compact items keep their names, show their tooltips on hover and focus, and Escape dismisses them;
- 2.5.3 label-in-name;
- no leading seam;
- a 1280 × 800 text-only 200 % cell where every control is hit-testable.

##### Task M1-T1: the stale lines first (≈ one PR, docs and comments only)

- **Lines to fix:**
  - `DESIGN_SYSTEM.md:236-241`, `:255-258`, `:304-308`;
  - `Deck.tsx:61`;
  - `tsld-toolbar-items.tsx:2658`, `:3150-3153`;
  - `plan-workspace-toolbar.tsx:2143`, `:2271`;
  - `toolbar-band.tsx:11-16`;
  - `app-header.tsx:131-133`.
- **Complexity:** S
- **Testing:** `pnpm prepush` (the format and check gates).

##### Task M1-T2: delete the dead ladder (≈ one PR)

- **Delete:**
  - the bands, `resolveLayoutMode`, `bandIsAtLeast`;
  - `ToolbarLayoutEnv.layout` and `ToolbarItemRenderApi.layout`;
  - `isVisible`'s `env` argument;
  - `priority`, `priorityOf`, `partitionByTier`, the tier guard;
  - `triggersAreCompact` and every `compact` prop.
- **The ADR position:** this completes ADR-0109's supersession of ADR-0090 D6 and ADR-0091 D3a, and **overturns
  #193's keep** (ADR-0110 M5), noted in the PR.
- **Consumers to update:** `Toolbar.tsx`, `Toolbar.test.tsx`, `toolbar-registry.test.ts`, `toolbar-band.tsx`,
  `GanttRowMenu.tsx`, `GanttPanel.tsx`, `measure-toolbar/m1-icon-only.spec.ts`, and every `isVisible` caller
  (found by typecheck).
- **Complexity:** M
- **Risks:** behaviour-neutral by construction (every band resolves to `comfortable` today). Existing suites must
  pass unchanged.
- **Testing:** delete the removed functions' tests.

##### Task M1-T3: the label API (≈ one PR)

- **Description:**
  - `labelVisibility: 'always' | 'never' | 'roomy'`; `'auto'` becomes `'always'`, which is the default;
  - one `resolveLabelVisibility` and one `toolbarLabelClass` / `<ToolbarLabel>` in `toolbar-styles.ts`;
  - `ToolbarButton`, `ToolbarPopover`, `ToolbarSplitButton` and the custom triggers all use it;
  - `Deck` gets `@container/deck` on its full-width block wrapper;
  - `Toolbar` treats `'roomy'` as `'always'`;
  - `ICON_ONLY` is deleted: its members become `'never'`, except `apply-levelling`, which becomes `'roomy'`
    (D-l); `print` is dropped;
  - `--container-roomy` goes in `@theme`, with a docblock citing M0;
  - the `'roomy'` items always mount a `description`-purpose tooltip, so Baseline overlay and Comments gain a
    `description`.
- **Complexity:** L
- **Risks:**
  - A custom trigger made `'roomy'` without a tooltip: a structural test asserts every `'roomy'` item is a plain
    `onActivate` item rendered by `ToolbarButton`.
  - A label painted outside the helper: a structural test.
  - The container-query trap (`UX_STANDARDS.md:391-398`): satisfy `container-query.structural.test.ts`, plus a layout
    assertion that the deck's width equals the band's inner width at every cell.
- **Review:** accessibility-reviewer and component-reviewer **before release** (ADR-0111).
- **Changeset:** `@repo/web` minor.

---

### Milestone M2: Every tool on its subject's surface

**Outcome:**

- an `identity` registry row (Plan summary, Edit plan details) rendered by `Toolbar` after the status badge;
- a Panels deck group (Legend, Resource view, Comments), trailing on LOOK;
- Plan trailing on DO;
- Float paths on the selection bar and Gantt row menu (if M0-T2.3 allows);
- the View panel fitted at 1024.

**Entry points:** header "Plan summary" and "Edit plan details"; LOOK group "Panels"; selection bar "Float paths";
Gantt row menu "Float paths"; "View" at 1024 × 600.
**Journey:**

- a header case: open and close Summary with focus returning, and the same for Edit plan details;
- Panels: `aria-pressed`, and focus never stranded on `body`;
- Float paths by keyboard in both views;
- View ▾ ≤ 420 px at 1024 × 600, every toggle reachable;
- the trailing edges at ≥ 1280;
- DOM order equals visual order.

##### M2-T1: the identity row (≈ one PR)

- **Description:** `row: 'identity'`, rendered by `Toolbar` in the identity portal.
  - Summary: `aria-haspopup="dialog"`, `aria-expanded`, the name "Plan summary", a tooltip, focus return.
  - Edit plan becomes "Edit plan details". The voice-command change goes in the changeset.
- **Complexity:** M
- **Testing:** `pen-status.spec.ts` (the header is one line at 1024).

##### M2-T2: the Panels group (≈ one PR)

- **Description:**
  - a `DECK_GROUPS` remap: Panels is `{ row: 'look', members: ['help'] }` (ADR-0031 group 7, now empty), and `help`
    is removed from Plan;
  - Legend, Resource view and Comments are registered in `help`;
  - one `ml-auto` on Panels and one on Plan.
- **Complexity:** M
- **Testing:**
  - `command-surface.spec.ts` group membership gains "Panels";
  - a DOM-order equals visual-order assertion;
  - US-5 at ≥ 1280 when stacked.

##### M2-T3: the View panel at 1024 (≈ one PR)

- **Description:**
  - two columns, with collapsible sections;
  - delete the `panels` `ViewToggleGroupId` fieldset (its sole occupant, Minimap, leaves at M4; if M4 has not landed,
    Minimap stays until then);
  - the zoom radios stay.
- **Complexity:** M
- **Review:** accessibility-reviewer on the reading order.

##### M2-T4: Float paths (≈ one PR, only if M0-T2.3 allows)

- **Description:** an object action on the selection bar and in the Gantt row menu; the deck item is deleted.
- **Complexity:** M
- **Testing:** `float-paths-view-agnostic.structural.test.ts`, `selection-duplication.structural.test.ts`. Correct
  `selection-actions.tsx:183-199` and `:206`.

---

### Milestone M3: Below 1024, one scrolling line (#471; gate: CQ-3, narrow only)

**Outcome:** under `max-lg:` the deck is one line that scrolls sideways. Under `squat` (narrow **and** short) the
band scrolls away vertically. Wide windows are untouched: 1280 × 600 and 1366 × 768 keep two rows.
**Entry point:** the "Plan commands" toolbar at 640 × 360.
**Journey:** `e2e-narrow-shell/narrow-shell.spec.ts`:

- SC-5 at every #471 cell (the band is ≤ 40 % of height or scrolls away; Expand and Recalculate hit-testable);
- SC-6;
- after every arrow press, the focused control's rect is inside the scroller's visible rect;
- the overflow cue is visible;
- a menu opened from a half-scrolled trigger clamps to the viewport;
- 1280 × 600 still has two rows.

##### M3-T1 (≈ one PR)

- **Description:**
  - `flex-nowrap overflow-x-auto scroll-px-2` under `max-lg:`, with an edge fade;
  - **`scrollIntoView` on roving focus (required)**;
  - `@custom-variant squat` beside `tall`/`short` (`globals.css:31,36`), with its constant in `lib/breakpoints.ts`,
    pinned in `breakpoints.test.ts`.
- **Complexity:** M
- **Review:** accessibility-reviewer **before release** (ADR-0111: `Deck`'s keyboard contract gains scrolling).
- **Changeset:** minor.

##### M3-T2 (same PR)

- Re-read the #471 cells. If the header's own wrap (88 / 136 px) still breaks SC-5 at 320, stop and ask.

---

### Milestone M4: The diagram-corner cluster (gate: CQ-1, decided yes)

**Outcome:** a "Diagram view" toolbar (Zoom out, Zoom in, Fit to plan, Minimap) at the stage's bottom-right, with
the minimap stacking above it. Gone from the deck and from View ▾.
**Entry point:** the Diagram view's "Diagram view" toolbar, then "Zoom in".
**Journey:**

- press Zoom in and see the scale change;
- toggle Minimap (`aria-pressed`);
- Tab order canvas → minimap → cluster;
- shaded buttons are focusable and give their reason;
- switch to the Gantt: the cluster is absent, focus is handed to the view switch and announced (ADR-0135), and the
  band does not shift;
- **SC-15:** focus the bottom-right-most activity by keyboard and assert its rect intersects neither the cluster
  nor the minimap;
- with no room for the minimap, the toggle is shaded with its reason;
- a dock open, a selection present, the loading state, and Viewer and Contributor roles.

##### M4-T1: design note (ui-architect) and cluster (≈ one PR)

- **Description:**
  - `row: 'canvas'` in the same registry; Minimap reaches it through a promotion target like `promotedLensItems()`;
  - `Toolbar` renders that slice; `toolbarCardVariants`; `aria-keyshortcuts` on each item;
  - one positioned column, cluster fixed at the bottom and minimap above with `gap-2` (spec §4.7);
  - `minimapRoom` counts the cluster;
  - the reveal margin.
- **Complexity:** L
- **Review:** ui-architect note first; accessibility-reviewer **before release**; performance-reviewer
  (no canvas repaint).

##### M4-T2: remove the deck's frame section and View ▾'s Minimap row (≈ one PR)

- **Complexity:** S
- **Testing:** M0-T2.6's list of suites updated; re-read `LINES` and record the new free width.
- **Changeset:** minor.

---

### Milestone M5: Free space is used, the promotion ladder (gate: the product owner's requirement)

**Outcome:** at 1280, 1440, 1912 and 2560 each row (LOOK, DO, header, corner) fills its spare width with promoted
menu commands, in the spec's ladder order (§4.11). Promoted entries leave their menus.
**Entry point:** the "Plan commands" toolbar at 1440 × 900. "Critical", "Late-start overlay", "Baselines…",
"Print…" and "Share…" are on the bar there (if M0 confirms the stages).
**Journey:** a new `command-surface.spec.ts` case per stage (SC-17, SC-18):

- each row's unused width is ≤ 15 % unless its ladder is exhausted;
- no unpromoted entry's committed width fits the row's free gap;
- each promoted item sits immediately after its source trigger, inside the same group;
- its source menu no longer lists it, and an emptied menu's trigger is hidden;
- the roving order (ArrowRight, Home, End) matches visual order;
- demoting under focus (resize) hands focus off with "Moved into the ‹menu› menu.";
- **SC-18 is verified red** by raising one entry's stage (ADR-0110).

#### Feature: declared promotion

> **Complexity:** XL (it turns six menus' promotable entries into declared lists).
> **Dependencies:** M3 and M4 (the free widths depend on the settled layout); `promotion-widths.json` from M0, re-run
> after M4.
> **Risks:**
>
> - A width mechanism returning, which is the ADR-0109 defect class. Mitigation: viewport stages only, committed
>   thresholds, monotonic by construction, and no command on today's bar ever demoted.
> - A capability lost in a menu refactor (Share was lost once, `tsld-toolbar-items.tsx:3357-3363`). Mitigation:
>   SC-19's manifest test, written **first**.
> - Two controls with one name: the menu omits promoted entries; asserted.

##### M5-T1: the manifest and the stage model, before any menu changes (≈ one PR, ships dark)

- **Description:**
  - commit `command-manifest.json` (every registry id, header control, selection-bar item and menu item name);
  - `PROMOTE_*` constants in `lib/breakpoints.ts`, pinned in `breakpoints.test.ts`;
  - `usePromotionStage()`;
  - the pure `computePromotionStages`, with unit tests;
  - SC-19's unit test, green against today (nothing promoted).

##### M5-T2 … T6: one menu per PR

In ladder order of value: Filter (L1/L8/L11), Analysis (P1/P3/P5/P7/P8), Share & export (P2/P6/P11), View (L2–L7,
L9, L10, and C1 into the corner), Link and Add (P4, P9, P10), and Account (H-P1). Each PR:

- turns that menu's promotable entries into a declared list with `promotion.at` taken from the computed stages;
- renders promoted forms (button, toggle or segment with `segmentLabels`);
- omits promoted entries from the menu;
- adds a `lostReason` for each entry;
- updates the journey and the manifest test;
- changeset patch or minor.

##### M5-T7: re-measure (same as the last PR)

- The harness's SC-17 "after" table goes into `m0-measurement.md`'s appendix.

---

### Milestone M6: The visual brief (V1–V7)

**Outcome:** the decisions in spec §4.8. Each lands as its own commit with before and after screenshots at 1024 × 600,
1280 × 800, 1440 × 900 and 1912 × 1080, fine and coarse, signed off by the product owner (SC-16).
**Entry point:** the band on any plan. V5 is the header on every screen.
**Journey:** `command-surface.spec.ts` keeps SC-10, SC-12 and SC-17 green after each item.

- **V1** Row identity: the LOOK and DO rows distinguishable at a glance.
- **V2** Group pills, which also guard SC-12 (no leading seam).
- **V3** The shaded-control audit: ADR-0082 shading is kept; the treatment is quieter, and the Author group reads as
  one locked unit led by the pen.
- **V4** Share & export as the row's secondary-filled closing action.
- **V5** The organisation switcher as a ghost button opening a menu. **Gate: CQ-4.** Accessibility-reviewer
  before release, carrying over `OrgSwitcher.tsx:45-57`.
- **V6** Covered by M2-T3.
- **V7** Balance, covered by M5.

---

### Milestone M7: Close-out (ships dark)

1. File **ADR-0184** from spec §4.10 (D1–D6). Add its line to `CLAUDE.md` §16. Add amendment notes to ADR-0031,
   ADR-0091 (D3), ADR-0100 and ADR-0179 (D2 use), and record the completion note on ADR-0090 D6 and ADR-0091 D3a.
2. **Update `CLAUDE.md` §1's counts (`pnpm check:counts`)**: the ADR count, the web source file count, and any suite
   count.
3. `DESIGN_SYSTEM.md`: R1–R9, `--container-roomy`, the `PROMOTE_*` stages, and the amended `:225` rule.
   `UX_STANDARDS.md`: R5 and R9.
4. `TECH_DEBT.md`: close #471's band half; a new row for its second paragraph (D-j); close #193 with the overturn
   noted.
5. The SC-14 and SC-19 manifest test green; the SC-17 before and after tables in the record.
6. Set the spec header to `Accepted — shipped (ADR-0184)` (`check:spec-status`).

## Reviewer checklists (each must be ticked in the PR, with `file:line` or a test name)

**Every milestone from M2 on, and close-out: the promotion checks.**

- [ ] **No spare width while something promotable sits in a menu**: SC-18's journey green at 1280, 1440, 1912 and
      2560, verified red once.
- [ ] Unused width per row ≤ 15 % or the ladder is exhausted (SC-17). The table is attached.
- [ ] **Roving order and keyboard**: ArrowRight, Home and End visit promoted items in visual order. One Tab stop
      per toolbar. Group names (`View`, `Find`, `Panels`, `Author`, `Plan`) unchanged as items promote.
- [ ] A promoted item is absent from its menu, not shaded. No duplicate accessible names in the tree. An emptied
      menu's trigger is hidden.
- [ ] Demotion under focus hands off with its `lostReason` (ADR-0135).
- [ ] **The "no tool is lost" manifest (SC-14, SC-19) covers both states**: every entry resolves on the bar xor in
      its menu at every stage.

**Accessibility reviewer:**

- the M1 label API (names, tooltips, Escape, 2.5.3);
- M2's identity-row focus return and the Panels `aria-pressed`;
- M3's scroll focus and menu clamping;
- M4's Tab order, 2.4.11 and the Gantt hand-off;
- M5's promoted segments' names and the `segmentLabels` group;
- V5's organisation switcher.

All of these come **before release** where a shared primitive's keyboard contract changes (ADR-0111).

**Component reviewer:**

- the one resolver and helper (SC-8);
- the `'roomy'`-only-on-plain-buttons structural test;
- one registry, with no second registry for the cluster or the header;
- the declared-promotion API (one place, no thresholds in components);
- the `DECK_GROUPS` remap.

**UX reviewer:**

- the placement table against §4.6;
- the ladder order;
- the M6 screenshots;
- the < 20 px exit rule respected.

**Performance reviewer:**

- M1's container queries;
- M4's overlay (no canvas repaint);
- M5's `usePromotionStage` (media-query listeners only, with no width observer on the deck).

**Test engineer:** the journeys listed under each milestone.

## Sequencing & slices

M0 → M1 → M2. Then M3 (#471, moved ahead of the cluster), M4, M5, M6, M7.

- Every slice leaves `main` releasable: M1-T1 and M1-T2 are behaviour-neutral, M5-T1 ships dark, and each menu's
  promotion is its own commit.
- No flags. The rollback is reverting the commit.
- **Model switch points (§19.14):**
  - approval switches to Sonnet for M0 and M1;
  - switch to Opus if M0 contradicts a premise, for the M4 design note, and for M5's stage computation;
  - start a fresh session at the M5 boundary.

## Definition of Done (per task)

The Feature Completion Criteria in [`docs/PROCESS.md`](../../PROCESS.md), with `pnpm prepush` and the changed
journeys run locally before pushing.

## Risks & assumptions (rollup)

| Risk                                                                            | Likelihood | Impact | Mitigation                                                                                      |
| ------------------------------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------- |
| A row misses one line at 1024 in a stress state                                 | med        | med    | M0 exit rule (< 20 px → stop and ask)                                                           |
| The promotion ladder brings back width-driven defects                           | med        | high   | Viewport stages, committed thresholds, monotonic, never demotes today's bar; SC-18 verified red |
| A menu refactor loses a command                                                 | med        | high   | The SC-19 manifest test lands first (M5-T1)                                                     |
| Promoted widths differ from M0 after M3/M4                                      | high       | low    | Re-run the M0 harness before M5-T2                                                              |
| Gantt has no Float paths route                                                  | med        | low    | D-c is conditional                                                                              |
| Keyboard regressions in `Deck` scrolling, the cluster and the organisation menu | med        | high   | ADR-0111 reviews before release; journeys                                                       |
| Text-only 200 % overflows rows                                                  | med        | low    | `flex-wrap` safety valve (R1), the SC-7 cell                                                    |
| The cluster covers activities                                                   | med        | low    | The SC-15 reveal margin and its journey                                                         |
| The CQ-4 answer is no                                                           | med        | low    | V5 becomes restyling the native select only                                                     |
