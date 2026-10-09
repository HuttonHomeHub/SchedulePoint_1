# Implementation Plan: Toolbar redesign for a laptop, Surface Pro and monitor-first app

- **Feature spec:** [`feature-spec.md`](feature-spec.md)
- **Status:** Draft
- **Owner:** web

## Breakdown

```mermaid
flowchart LR
  E[Epic: Toolbar redesign] --> M0[M0 Measure: ships dark]
  M0 --> G{Premises hold?}
  G -- no --> A[Amend spec, ask the product owner]
  G -- yes --> M1[M1 Label rule + two lines at the floor]
  M1 --> M2[M2 Relocations: Summary, Shortcuts, Panels, Float paths]
  M2 --> M3[M3 Viewport cluster on the diagram: CQ-1]
  M1 --> M4[M4 Rows as wrap units + View panel columns + anchored edges]
  M1 --> M5[M5 Below the floor: one scrolling line, #471]
  M3 --> M6[M6 Docs, ADR, close-out]
  M4 --> M6
  M5 --> M6
```

### Epic

**Toolbar redesign.** Both toolbars re-laid for a 1024 × 600-and-up product: two one-line command rows at the
floor, every tool on the surface of its subject, labels that give way by declaration, and a usable band in short or
zoomed windows. Roadmap theme: UI consistency, minimum-viewport follow-on (ADR-0179).

**Global rules for every milestone.** No feature flag (ADR-0088 D1). Each milestone is a commit boundary and names
its entry point or declares itself dark (ADR-0081). `pnpm prepush` plus `scripts/e2e-local.sh web:<suite>` for each
changed journey before push (CLAUDE.md §19.8). Implementation goes to the **builder** agent (§19.14). No schema
change anywhere, so database-architect is not involved. Re-read every `file:line` in this plan before using it,
because the registry moves fast.

---

### Milestone M0 — Measure, and verify the premises (ships dark)

**Outcome:** a committed measurement record `m0-measurement.md` beside this plan, and a go/no-go on the spec's
premises. No product change.
**Entry point:** `Ships dark: a measurement record and a harness spec; nothing user-facing changes.`
**Journey:** none (harness only, ADR-0081 §3).

#### Feature: M0 harness and record

> **Description:** drive the real product through the real sign-up → plan journey and read the chrome.
> **Complexity:** M
> **Dependencies:** a migrated local DB (`postgresql://app:app@localhost:5432/app_test`), the container Chromium.
> **Risks:** readings vary between sittings (CLAUDE.md §17, #75) → layout-only readings, which are deterministic;
> repeat any cell that disagrees with the committed record by more than 2 px.
> **Testing requirements:** none; it asserts only that it reached the screen.

##### Task M0-T1: per-item inventory and heights at the requested matrix (≈ one PR, docs + harness)

- **Description:** add `apps/web/measure-toolbar/toolbar-redesign-m0.spec.ts` to the existing **non-CI** config
  `playwright.measure-toolbar.config.ts`, writing JSON through `measure-toolbar/output.ts`.
- **Complexity:** M
- **Dependencies:** —
- **Risks:** fixture drift between the old records and today → seed the same shape the minimum-viewport records
  used (two activities) **and** a second fixture with conflicts and a WBS summary (the `command-surface.spec.ts`
  fixture), so both the old figures and the conflict-chip case are covered.
- **Testing:** run it. Command:
  `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome DATABASE_URL=postgresql://app:app@localhost:5432/app_test pnpm --filter @repo/web measure:toolbar -- toolbar-redesign-m0`
  (the config starts the API and Vite itself unless `PLAYWRIGHT_SKIP_WEBSERVER` is set; see `scripts/e2e-local.sh`
  for the env the API needs).
- **Development steps:**
  1. Cells: 1024 × 600, 1280 × 800, 1440 × 900, 1912 × 1080 (requested); 1912 × 948 and 1912 × 1114 (the product
     owner's displays, `m4-measurement.md:28`); 2560 × 1440 (R2); #471's 640 × 480, 640 × 360, 640 × 300,
     320 × 720, 320 × 256. **Fine and coarse** (`hasTouch` + `pointer: coarse` emulation, as `e2e-narrow-shell`
     does). The pen taken, dock closed, Explorer at 276.
  2. Per cell: header height and line count; band height (`[data-surface="chrome"]:not([data-activities-bar])`);
     deck lines overall and per declared row (cluster tops within 4 px, as `command-surface.spec.ts:564-577`
     does); `<main>` top; canvas height; foot row height; Expand and Recalculate hit-testable.
  3. Per deck item (`[data-toolbar-item]`): id, row, group, x, y, width, label visible (yes/no), icon-only tooltip
     present. Per header control: the same.
  4. Per menu and popover (View, Filter, Analysis, Share & export, Add, Link, Recent edits, Go to date, Account):
     open it, list the item names, and record the panel height against the viewport at 1024 × 600.
  5. Write `docs/specs/toolbar-redesign/m0-measurement.md`: method, tables, and a **§0 "what contradicts the
     spec"** first, following `retire-single-pane-workspace/m0-measurement.md`.

##### Task M0-T2: verify the premises (same PR)

- **Description:** settle, with evidence, each premise the spec could not.
- **Complexity:** S
- **Dependencies:** M0-T1
- **Risks:** a premise fails → **stop**; amend the spec and put the decision to the product owner. Do not start M1.
- **Testing:** —
- **Development steps:**
  1. **Object bar in both views (D-c):** does the selection bar's object half render in the Gantt, or does only the
     Gantt row menu mirror it? Read `selection-actions.tsx`, the Gantt row menu and their hosts, and drive it once.
     Decide: Float paths moves (to the bar and the row menu) or stays.
  2. **Widths for the compact set (§4.5):** from T1's item widths, compute per row at 1024 × 600 fine and coarse
     the smallest prefix of the candidate list that makes each declared row one line, with CQ-1 both answered
     yes (zoom gone) and no. Record the `--container-deck-roomy` value: the smallest container width at which every
     row is one line **with every label visible**.
  3. **Tailwind v4 container queries:** confirm the variant syntax and theme-token mechanism in the installed
     version (`node_modules/tailwindcss`). Register a `scripts/dependency-claims.json` entry if any docblock will
     assert it.
  4. **Minimap placement (CQ-1):** read ADR-0100 and the minimap panel's DOM position, and record where a
     bottom-right cluster can sit without covering it.
  5. **Suite impact:** grep every journey and unit test that locates a moved control by role and name (Zoom
     out/in, Fit to plan, Minimap, Summary, Keyboard shortcuts, Float paths, Comments, Legend, Resource view),
     and list them with `file:line`.
  6. Replace the spec's SC-1, SC-3, SC-5 and SC-6 estimates with measured targets.

---

### Milestone M1 — One label rule, and two deck lines at the floor

**Outcome:** at 1024 × 600 fine the deck is two lines (LOOK, DO), with M0's compact set icon-only below the
container token. One source decides every label.
**Entry point:** the plan workspace's command deck (`role="toolbar"`, name "Plan commands") at 1024 × 600.
**Journey:** `e2e-workspace-fit/command-surface.spec.ts` band test: `LINES[1024]` becomes `{ max: 2 }`, each row
≤ 1 at 1024 fine, a coarse 1024 cell added at `≤ 3`, and each compacted control's accessible name and tooltip
asserted.

#### Feature: container-driven labels (shared primitive)

> **Description:** retire the inert ladder; labels give way by registry declaration and one container token.
> **Complexity:** L
> **Dependencies:** M0 (token value, compact set); CQ-2 answered.
> **Risks:** a label hidden visually and also removed from the name → the label span becomes `sr-only`, never
> `display: none`; asserted by role and name in the journey. A tooltip duplicating a visible label → render the
> name-echo tooltip only for `{ below }` items, and decide in review whether CSS can suppress it at roomy widths.
> Shared-primitive keyboard contract → **ADR-0111 review before release** (accessibility-reviewer +
> component-reviewer).
> **Testing requirements:** unit (registry types; `Deck` reads `showLabel`; `ToolbarButton` label classes);
> structural (no `ICON_ONLY` or id list in `Deck.tsx`; no `clientWidth`/`ResizeObserver` read in `Deck` or the
> label path); journey (above).

##### Task M1-T1: delete the inert machinery (≈ one PR)

- **Description:** remove `ToolbarLayoutMode`, `TOOLBAR_LAYOUT_BANDS`, `resolveLayoutMode`, `bandIsAtLeast`,
  `ToolbarLayoutEnv.layout`, `priority`/`priorityOf`, `partitionByTier`, the tier-mixing guard, the
  `triggersAreCompact` branches, and every `priority:` on the registry with its history comment (#193). Keep
  `tier` only if the component review asks for it. The default is delete, with `order` the only position field.
- **Complexity:** M
- **Dependencies:** M0
- **Risks:** `next-conflict-status`'s `bandIsAtLeast(env.layout, 'compact')` is always true today, so removing it
  is behaviour-neutral; asserted by its existing tests. `isVisible`'s second argument disappears, which is a
  typecheck-found change at each caller.
- **Testing:** existing unit suites green unchanged (behaviour-neutral by construction); delete the tests of the
  removed functions.
- **Development steps:**
  1. Delete the types and functions; fix callers by typecheck.
  2. Delete the `priority` fields and their comments. Keep each item's **reason** for its position as a one-line
     `order` comment where it still applies.
  3. Correct `tsld-toolbar-items.tsx:2658` (Float paths did not move with Isolate).
  4. Changeset: none (no user-visible change).

##### Task M1-T2: the label rule (≈ one PR)

- **Description:** `showLabel: 'always' | 'never' | { below: 'roomy' }`. `Deck` becomes `@container/deck`;
  `ToolbarButton`, `ToolbarPopover`, `ToolbarSplitButton` and the custom triggers (Analysis, Share & export, Add,
  Link) apply `@max-[--container-deck-roomy]/deck:sr-only` to their label span for a `{ below }` item. `ICON_ONLY`
  is deleted; its members are declared `'never'` in the registry (zoom ±, fit, undo, redo, apply-levelling;
  `print` dropped as a non-item).
- **Complexity:** L
- **Dependencies:** M1-T1
- **Risks:** a `render` item ignoring the declaration (the ADR-0064 §7 shape: "one correct pattern applied to a
  control and not its neighbour") → a structural test enumerates every registry item with `{ below }` and asserts
  its rendered label span carries the class (one per `render` component).
- **Testing:** unit per component; structural as above; journey (M1 header).
- **Development steps:**
  1. Add `--container-deck-roomy` in `globals.css` with a docblock citing M0's reading (ADR-0151: a constant
     carries its justification).
  2. Implement, then apply M0's compact set to the registry.
  3. Update `command-surface.spec.ts` (LINES, BAND bar at 1024, coarse 1024 cell, names and tooltips).
  4. `scripts/e2e-local.sh web:workspace-fit`.
  5. Changeset: `@repo/web` minor ("the command deck fits two lines at 1024").

---

### Milestone M2 — Every tool on its subject's surface

**Outcome:** Summary and Keyboard shortcuts in the header; a Panels section (Legend, Resource view, Comments) at
the end of LOOK; Plan actions trailing on DO; Float paths on the object bar if M0-T2 confirmed it.
**Entry points:** header "Plan summary" button; header "Keyboard shortcuts" button; LOOK row group "Panels";
object bar "Float paths" (Diagram) and the Gantt row menu "Float paths".
**Journey:** a new case in `e2e-workspace-chrome` (or the suite that owns the header): open a plan, press Plan
summary and see the popover, press Keyboard shortcuts and see the sheet, then confirm the Account menu no longer
lists it. Plus the float-paths journey driven from the object bar in **both** views.

#### Feature: relocations

> **Description:** move the five items in §4.6 marked as moving (except the viewport cluster).
> **Complexity:** M
> **Dependencies:** M1 (row widths); M0-T2.1 (D-c).
> **Risks:** a capability lost in a move (`tsld-toolbar-items.tsx:3357-3363` records Share being lost once) → each
> task carries its gate verbatim and an M0 → after inventory diff; `selection-duplication.structural.test.ts` and
> `float-paths-view-agnostic.structural.test.ts` stay green. The header's plan-unaware contract (ADR-0029) → Summary
> arrives through the existing `identity` slot portal; Shortcuts through `HelpActionProvider`, as today.
> **Testing requirements:** unit for each component touched; the journeys above; the existing minimap, legend,
> comments and resource-view journeys updated to the new locations.

##### Task M2-T1: Summary to the header (≈ one PR)

- **Description:** remove `summary` from the registry; render a ghost icon `Button` ("Plan summary", `Info`) in the
  identity portal after the status badge, opening the same `PlanSummaryPanel` through the shared popover hook.
- **Complexity:** S
- **Dependencies:** M1
- **Risks:** header section 1 is capped at 50 % at `lg` → the button is `shrink-0` and the name truncates; asserted
  at 1024 with the 40-character fixture name (`m4-measurement.md:69-72`).
- **Testing:** unit; `pen-status.spec.ts` header-is-one-line at 1024 stays green.
- **Development steps:** implement; update suites that find "Summary" in the deck; changeset (patch).

##### Task M2-T2: Keyboard shortcuts to the header (≈ one PR)

- **Description:** a header icon button rendered from the registered `useShortcutsAction` callback (absent when
  none is registered); the Account menu item is deleted.
- **Complexity:** S
- **Dependencies:** —
- **Risks:** a second route to the same sheet → deleted from the Account menu in the same commit, not kept.
- **Testing:** `help-action.test.tsx`, `account-chip.test.tsx`; the journey above.
- **Development steps:** implement; changeset (patch).

##### Task M2-T3: Panels section and trailing alignment (≈ one PR)

- **Description:** a registry group for panels (a new `TOOLBAR_GROUPS` member `panels` after `find`, or the `help`
  slot reused; component review decides; the default is a new member, since the tuple is closed and the compiler
  finds every consumer) holding Legend, Resource view and Comments, placed last in LOOK. One `ml-auto` on each
  row's last group (R4).
- **Complexity:** M
- **Dependencies:** M1
- **Risks:** `command-surface.spec.ts` group-name assertions (`getByRole('group', { name })`) → add "Panels",
  update membership; the four existing names stay.
- **Testing:** membership and edge-anchoring assertions (US-5) at ≥ 1280.
- **Development steps:** implement; journey; changeset (patch).

##### Task M2-T4: Float paths to the object bar (≈ one PR; only if M0-T2.1 said yes)

- **Description:** a `float-paths` object action (enabled whenever the bar renders; the selection exists by
  construction) in the object half of `selection-actions.tsx`, mirrored by the Gantt row menu; the deck item is
  deleted.
- **Complexity:** M
- **Dependencies:** M0-T2.1
- **Risks:** a canvas coupling deleting it from the Gantt → `float-paths-view-agnostic.structural.test.ts`; the
  journey in both views.
- **Testing:** as above; `selection-duplication.structural.test.ts` shows no twin.
- **Development steps:** implement; correct `selection-actions.tsx:183-199`; changeset (patch).

##### Task M2-T5: Analysis ▾ shows open docks (≈ one PR; only if the ADR-0111 review accepts it)

- **Description:** Health check and Compare revisions as checkable menu items with their open state (D-f).
- **Complexity:** M
- **Dependencies:** accessibility-reviewer and component-reviewer on `Menu`'s checkable contract **before** build.
- **Risks:** `Menu` keyboard and announcement rules → review first; if declined, drop the task.
- **Testing:** `Menu` unit tests; a journey toggling Health check from the menu twice.

---

### Milestone M3 — The viewport cluster on the diagram (CQ-1)

**Outcome:** Zoom out, Zoom in, Fit to plan and Minimap sit in the diagram's bottom-right corner; they are gone from
the deck and from View ▾.
**Entry point:** Diagram view → toolbar "Diagram view" in the stage corner → "Zoom in".
**Journey:** `e2e-workspace-fit` (or the minimap suite): press Zoom in and see the scale change; press Minimap and
see the panel; switch to the Gantt and see the cluster absent; Tab order canvas → cluster.

#### Feature: canvas viewport controls

> **Description:** a `Toolbar` of four registry-style items rendered as DOM over the canvas stage.
> **Complexity:** L
> **Dependencies:** CQ-1 = yes; **ui-architect** design note first (placement against the minimap and docks,
> surface scope, stacking under docks and Sheets); M0-T2.4.
> **Risks:** covers bars in the corner → inset 16 px, `pointer-events` only on the cluster, and an M0-style reading
> of the area covered; a new canvas-adjacent focus stop (ADR-0026 a11y architecture) → accessibility-reviewer
> before release (ADR-0111, since `Toolbar`'s contract is reused in a new host); paint cost → none expected (DOM,
> no canvas repaint), performance-reviewer confirms.
> **Testing requirements:** unit (gates and reasons equal today's); journey (above); coarse sweep includes the
> cluster (44 px).

##### Task M3-T1: design note (ui-architect) and cluster component (≈ one PR)

- **Complexity:** M · **Dependencies:** CQ-1 · **Risks:** as above · **Testing:** unit.
- **Development steps:** design note into this directory; build `CanvasViewportControls`; mount in the TSLD stage.

##### Task M3-T2: remove the frame section and the View ▾ Minimap row (≈ one PR)

- **Complexity:** S · **Dependencies:** M3-T1 · **Risks:** suites locating these in the deck → M0-T2.5's list ·
  **Testing:** journeys updated; `LINES` re-read (LOOK should gain slack; record it).
- **Development steps:** delete the items; update the suites; changeset (minor).

---

### Milestone M4 — Wide screens: rows as wrap units, the View panel in columns

**Outcome:** on a band wide enough for both, LOOK and DO share one line (R2). The View ▾ panel lays out in columns
at ≥ 1280 (D-g).
**Entry point:** the deck at 2560 × 1440 (one line); View ▾ at 1440 × 900.
**Journey:** `command-surface.spec.ts` adds a 2560 cell (one line, membership unchanged); a View ▾ case asserts the
panel is shorter than the viewport at 1024 × 600 and that every toggle is reachable by Tab.

#### Feature: row sharing and panel layout

> **Complexity:** M · **Dependencies:** M1, M2-T3.
> **Risks:** a row wrapping internally while sharing a line → rows are `flex-nowrap` inside a wrapping deck at
> ≥ 1024; asserted per row. A popover column order differing from tab order → one fieldset per column, DOM order
> = reading order.
> **Testing requirements:** journey cells; unit for the panel; accessibility-reviewer on the panel's reading order.

##### Task M4-T1: rows as wrap units (≈ one PR)

- **Development steps:** deck `flex flex-wrap`; each row a non-wrapping child at ≥ 1024; journey; changeset (patch).

##### Task M4-T2: View ▾ in columns (≈ one PR)

- **Development steps:** a CSS grid in `ViewTogglesPanel` at the popover's container width; journey; changeset
  (patch).

---

### Milestone M5 — Below the floor: one scrolling line (#471, CQ-3)

**Outcome:** below 1024 wide or 600 tall, the deck is one horizontally scrolling line; the workspace keeps its body;
the foot row is reachable.
**Entry point:** the deck at 640 × 360 (or 1280 × 800 at 200 % zoom).
**Journey:** `e2e-narrow-shell/narrow-shell.spec.ts`: at each #471 cell assert `<main>` top (SC-5), Expand and
Recalculate hit-testable, and at 640 × 480 and 320 × 720 one table row with the panel expanded (SC-6); arrow from
the first to the last deck control and assert each lands in view.

#### Feature: compact band

> **Complexity:** M · **Dependencies:** M1; CQ-3 = yes.
> **Risks:** a scrolling container hiding the focused control → `scrollIntoView({ block: 'nearest', inline:
'nearest' })` on roving focus if the browser's own focus scroll proves insufficient (measure first); a hidden
> scrollbar → never hidden (R6); ADR-0109 D1 conflict → amended in ADR-0184 D4 with ADR-0179 D2 and WCAG 1.4.10
> Note 2 cited. **ADR-0111 review before release** (`Deck`'s keyboard contract gains scroll behaviour).
> **Testing requirements:** journey (above); the coarse sweep at 640 × 844; the #466 row-menu case stays green.

##### Task M5-T1: the media rule and the line (≈ one PR)

- **Development steps:** a named media query constant beside `DESIGNED_MIN_WIDTH_QUERY` (ADR-0179 D1) used by CSS
  only; `Deck` row container `flex-nowrap overflow-x-auto` under it; journey; changeset (minor).

##### Task M5-T2: re-read #471's cells and the header below the floor (same PR)

- **Development steps:** take M0's #471 readings again; if the header's wrap (88 / 136 px) still breaks SC-5,
  stop and put that to the product owner (it would be a header change below the floor, which is outside this
  spec's decided scope).

---

### Milestone M6 — Docs, ADR, close-out

**Outcome:** the decisions recorded; stale claims corrected; the register updated.
**Entry point:** `Ships dark: documentation only.`
**Journey:** none.

##### Task M6-T1 (≈ one PR)

- **Complexity:** M · **Dependencies:** M1–M5.
- **Development steps:**
  1. File **ADR-0184** from the spec's outline; add its one line to `CLAUDE.md` §16 (`check:adr-coverage`); add
     "amended by ADR-0184" to the §16 lines of ADR-0031, 0090, 0091, 0109, 0133.
  2. `DESIGN_SYSTEM.md`: rewrite "A command surface wraps" for R1–R6; correct the fold/caption bullet (`:236-238`)
     and the `min-h-9` sentence (`:304`); document `--container-deck-roomy`.
  3. `UX_STANDARDS.md`: R5 ("a control lives on the surface of its subject") with the placement table's examples.
  4. `TECH_DEBT.md`: close #471's band half with the M5 readings; file a new row for its second paragraph (the
     selection bar in the foot row, D-j); close #193.
  5. Before/after inventory appendix in `m0-measurement.md` (US-4: every "before" has an "after").
  6. Set this spec's header to `Accepted — shipped (ADR-0184)` (`check:spec-status`).
  7. Screenshots at the four requested viewports, fine and coarse, for the product owner's sign-off (SC-11).

## Sequencing & slices

M0 → (decision) → M1 → M2 → M3, with M4 and M5 able to run after M1 in either order. Every slice leaves `main`
releasable: M1-T1 is behaviour-neutral; M1-T2 changes only labels at narrow widths; each relocation moves one
control with its gate and its journey in the same commit; M3 removes the deck's zoom only in the commit that adds
the cluster. **No feature flags** (ADR-0088 D1): the rollback for any slice is reverting its commit.

**Agents during build:** builder (implementation); **ui-architect** before M3 (and for the M4 panel);
**component-reviewer** on M1 (shared primitive contract), M2-T3 (new group), M2-T5 (Menu); **accessibility-reviewer**
on M1, M2-T5, M3, M5 **before release** (ADR-0111); **ux-reviewer** on M2, M3, M4 (placement, copy, hierarchy);
**performance-reviewer** on M3 (overlay over the canvas) and M1 (container queries); **test-engineer** for the
journeys. Not needed: database-architect (no schema), api-reviewer, security-reviewer (no new data or permission;
the security-relevant gates move with their controls and are asserted by the existing suites).

**Model switch points (§19.14):** this plan's approval is the switch to Sonnet for M0's harness and M1; switch
back to Opus if M0 contradicts a premise, and for the M3 design note.

## Definition of Done (per task)

Each task's PR must satisfy the Feature Completion Criteria in [`docs/PROCESS.md`](../../PROCESS.md) (code, tests,
docs, security, performance, accessibility, Docker build, CI, changelog, version impact), with `pnpm prepush` and
the changed journeys run locally before push.

## Risks & assumptions (rollup)

| Risk / assumption                                                                    | Likelihood  | Impact | Mitigation                                                                                           |
| ------------------------------------------------------------------------------------ | ----------- | ------ | ---------------------------------------------------------------------------------------------------- |
| The spec's width and height figures are estimates (no shell in the analysis session) | **certain** | med    | M0 measures everything first; §0 of the record lists contradictions; stop on any                     |
| Even with compaction, a declared row does not fit 1008 px at 1024                    | med         | med    | M0-T2.2 computes it; if so, CQ-1 or more candidates, or SC-1 relaxed, decided with the product owner |
| The object bar is not in the Gantt, so Float paths cannot move                       | med         | low    | D-c is conditional; it stays on the deck                                                             |
| A moved command is lost or loses its gate                                            | low         | high   | Inventory diff; structural duplication/view-agnostic tests; journeys per move                        |
| Shared-primitive keyboard regressions (Deck scroll, Menu checkable, the cluster)     | med         | high   | ADR-0111 reviews before release; journeys drive real focus                                           |
| The viewport cluster covers diagram content                                          | med         | low    | Inset, small footprint, area reading; ui-architect note                                              |
| Tooltip noise on labelled `{ below }` items at roomy widths                          | med         | low    | a11y review chooses CSS suppression or a purpose tooltip                                             |
| Coarse 1024 still at 3 lines                                                         | med         | low    | SC-3 accepts ≤ 3; the keyboard-cover gap stays declined (ADR-0183 D3)                                |
| Header wrap below the floor keeps SC-5 out of reach at 320                           | low         | low    | M5-T2 stops and asks; below-floor is reflow-only (ADR-0179 D2)                                       |
| Container-query syntax differs in the installed Tailwind                             | low         | low    | M0-T2.3 verifies; dependency claim registered                                                        |
