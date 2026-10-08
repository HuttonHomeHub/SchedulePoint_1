# Implementation Plan: Short screens — rows in the activities panel, and a three-line deck at 1024

- **Feature spec:** [feature-spec.md](feature-spec.md)
- **Status:** Draft — awaiting approval (CQ-A, CQ-B). Revised after the UX, accessibility and
  component reviews (all "agree with changes").
- **Owner:** web · **ADR:** 0180

## Breakdown

```mermaid
flowchart LR
  M0[M0 measure · XS] --> MA[M-A panel rows on a short screen · M]
  MA --> R[ADR-0181 retire-single-pane-workspace\n(other spec) lands AFTER M-A]
  M0 --> MB[M-B three-line deck · S–M\noptional; only if CQ-B = B1]
```

**Order:** M0 → M-A → (M-B, independent) → ADR-0181 retirement.

**One commit and one release per milestone, with no flag** (ADR-0088 D1). M-B is optional, and B0
is a clean outcome.

---

### Milestone M0: Measure before building (XS)

**Ships dark:** record only.

- **Task M0-T1. Readings** (throwaway harness, as in `minimum-viewport/m4-measurement.md`).
  - **Where:**
    - fine: 1024 × 600, 1024 × 768, 1280 × 720 (Playwright's default), 1280 × 800, 1912 × 948;
    - coarse: 1024 × 600, 1912 × 1114.
  - **What to read:**
    - the body height;
    - `PANEL_HEADER_PX`, `PANEL_FOOT_PX`, `PANEL_BODY_PAD_PX`, `TABLE_HEAD_PX` and `ROW_PX` on each
      pointer;
    - the three label widths and the DO row's spare at 1024 without them;
    - the compact trigger widths;
    - whether a hidden → shown canvas keeps `originX`, `originY` and `pxPerDay` today.
  - **Write up:** in `m0-measurement.md` here.
  - **Complexity:** XS · **Risks:** container Chromium measures layout only.
- **Task M0-T2. Stop condition.** If a reading moves a recommendation, re-ask CQ-A or CQ-B with the
  number. Examples: the labels sum to under 249, or the body at 1280 × 720 lands far from the
  threshold. Do not adjust the design silently.

---

### Milestone M-A: The activities panel shows rows on a short screen (M)

**Outcome:** #468 is closed, and SC-A1 to SC-A5 hold.

**Entry point:** the existing **Expand activities panel** control (ADR-0081).

**Journey** (`apps/web/e2e-workspace-chrome/activities-panel-scroll.spec.ts`, fine and coarse):

1. **At 1024 × 600:**
   - Expand;
   - ≥ 3 rows (fine) or ≥ 2 rows (coarse) are hit-testable via `elementFromPoint`;
   - the canvas row has `hidden`, with no `aria-hidden` and no `inert`;
   - the note text is present;
   - axe with `target-size` is clean.
2. **Round trip (SC-A4):**
   - pan and zoom;
   - select an activity;
   - focus the canvas listbox option;
   - Expand, then Collapse;
   - assert `originX`, `originY` and `pxPerDay`, the selection and the active option are unchanged;
   - assert the active option still has `tabindex="0"` and the listbox's `aria-activedescendant`
     is unchanged.
3. **Commands while hidden:**
   - press Fit, which collapses the panel and fits;
   - arm a tool, then Expand: the tool is disarmed and the note says so;
   - Escape in a table cell edit cancels the edit and leaves no tool state.
4. **Dock exclusivity:**
   - open Health, then Expand: the dock closes and its toggle is `aria-pressed=false`;
   - open Health with the swap active: the panel collapses.
5. **Live-resize focus (SC-A5):**
   - at 1280 × 800, Expand, then focus the canvas;
   - resize to 1024 × 600;
   - `activeElement` is the Collapse button and is never `<body>`.
6. **SC-A3:** canvas and panel heights at 1280 × 800 equal the M0 reading.
7. **640 × 480 and 320 × 256:** the single-pane layout is unchanged, and A1 is inert below `md`.
   This is re-run by ADR-0181.
8. **The constants are honest:** the measured panel parts are each ≤ their constant on both pointers.

#### Feature: the short-body swap

> **Complexity:** M · **Dependencies:** M0.
> **Risks:**
>
> 1. **Default-viewport suites will swap — high likelihood.** Playwright's default is 1280 × 720.
>    By M0's arithmetic the body there is ≈ 533 px, under the ≈ 539 px threshold
>    (`240 + PANEL_USEFUL_MIN`). So every suite that presses Expand at the default viewport and then
>    uses the canvas would collapse the panel or find the canvas hidden. 18 e2e files press Expand
>    (`grep "Expand activities panel" apps/web/e2e*`).
>    - **The fix,** in the same commit, is to derive the list (grep plus each config's `viewport`)
>      and set those suites to 1280 × 800.
>    - **No exception for tests:** a suite does not get a test-only threshold or an opt-out.
>    - **Paste the derived list into the PR.**
>    - **If the list is large,** re-ask CQ-A at M0-T2 before building.
> 2. **Focus loss on a live resize:** the layout effect and the journey's case 5.
> 3. **The canvas round trip:** the `measure()` guard, the unit test and the journey's case 2.
> 4. **The `keydown` change is a keyboard behaviour (ADR-0111):** accessibility-reviewer before
>    merge.
>
> **Testing:** unit tests (below); `scripts/e2e-local.sh web:workspace-chrome`, `web:workspace-fit`
> and `web:narrow-shell`; every suite from risk 1.

##### Task M-A1 — Constants and `isShortBody` (XS)

- **Steps:** in `use-activity-panel-prefs.ts`:
  1. Add the five named parts, using coarse values from M0.
  2. Derive `PANEL_MIN_OPEN` (+1 row) and `PANEL_USEFUL_MIN` (+3 rows).
  3. Add `isShortBody(bodyHeight, reserve, wasShort)` with 24 px hysteresis.
  4. Correct the `DOCK_MIN_HEIGHT` docblock.
- **Testing:**
  - sums equal their parts;
  - `PANEL_MIN_OPEN > 140`, red against today;
  - `isShortBody` at 0, at the boundary, and inside and outside the hysteresis band, with both
    reserves;
  - a stored 140 reads back as `PANEL_MIN_OPEN`, and `aria-valuemin` equals it.

##### Task M-A2 — The swap, focus, dock exclusivity (S–M)

- **Steps:** in `plan-workspace-toolbar.tsx`:
  1. The swap state, with `wasShort`.
  2. `hidden` on the row at `:2361`.
  3. The panel box (`:2499`) goes `flex-1`.
  4. The resizer is withheld.
  5. Focus-inside refs (row, dock, resizer) and a swap-on `useLayoutEffect` that focuses
     `collapseRef`.
  6. The dock/panel exclusivity: Expand closes the dock; opening a dock collapses the panel.
  7. The `ActivityBottomPanel` props `diagramHidden`, `toolDisarmed` and `collapseRef`, with the
     note copy for ux-reviewer.
- **Testing** (jsdom, `bodyHeight` stubbed through the ResizeObserver mock):
  - starts collapsed on a short body;
  - swap on expand with the canvas node unchanged;
  - not short gives today's DOM;
  - the dock closes on Expand and its toggle is unpressed;
  - focus moves from the canvas, dock and resizer to Collapse on swap-on;
  - exactly one facts outlet and one dock outlet while swapped;
  - `panel.size` is never written.

##### Task M-A3 — Canvas-directed commands (S)

- **Steps:**
  1. Add `withDiagram(fn)` (collapse, then the next `requestAnimationFrame`, then `fn`) in the
     workspace.
  2. Wrap the canvas-directed `ctx` callbacks: zoom, fit, presets, go to date and today,
     zoom-to-selection, next conflict, the find cursor step, tool arming and the dock openers.
  3. Leave the display-mark toggles and the plan/data/output callbacks unwrapped (spec §2 table).
- **Testing:**
  - a structural test lists the canvas-directed callbacks and fails if any is unwrapped;
  - a unit test: Fit while swapped collapses, then fits after a frame;
  - typing in Find does not collapse.

##### Task M-A4 — Canvas guards (S)

- **Steps:** in `TsldCanvas.tsx`:
  1. `measure()` returns early on a 0 × 0 rect (around `:1590`).
  2. The window `keydown` (`:2119`) returns early while hidden, reusing the hidden-pane pause's
     visibility flag.
  3. Swap entry disarms an armed tool via `exitAddMode`.
- **Testing:**
  - a 0 × 0 measure leaves `sizeRef` and the bitmap size unchanged;
  - a hidden canvas ignores shortcuts;
  - the existing `TsldCanvas.hidden-pane.test.tsx` stays green.
- **Reviews:** accessibility-reviewer before merge (ADR-0111).

##### Task M-A5 — Docs, ADR, release (XS)

- **Steps:**
  1. Write ADR-0180 and its CLAUDE.md §16 line.
  2. Flip this spec to Approved in the same commit (`check:spec-status` S3).
  3. Close #468 in the ledger.
  4. Update `docs/UX_STANDARDS.md` with the swap rule and the command classes.
  5. Add a `@repo/web` minor changeset.
- **Testing:** `pnpm prepush`.

**Required before merge:**

- ux-reviewer signs off the final note copy, the command classes and the dock rule;
- accessibility-reviewer and component-reviewer re-run on the `keydown` and `measure()` changes
  (ADR-0111), and review the focus, `hidden` and round-trip behaviour.

---

### Milestone M-B: A three-line deck at 1024 (S–M) — optional, only if CQ-B = B1

**Entry point:** the existing three deck controls.

**Journey:**

- `apps/web/e2e-workspace-fit/command-surface.spec.ts`:
  - `LINES[1024].max` 4 → 3 and `DO_ROW_MAX_LINES(1024)` → 1 (`:467`, `:471`);
  - the DO row's spare in px is recorded and asserted ≥ 0, with a failure message that names the
    product owner as the decider;
  - the three controls are icon-only at 1024 fine and ≥ 36 × 36;
  - they are labelled at 1280, and labelled under coarse emulation at 1024 (`hasTouch` /
    `any-pointer: coarse`).
- `apps/web/e2e-toolbar/toolbar.spec.ts`, in a real browser at 1024 × 600:
  - the tooltip shows on hover and on keyboard focus;
  - a click opens the menu with **no** tooltip;
  - with the menu open, no tooltip shows while `aria-expanded="true"`;
  - one Escape closes the menu, focus is on the trigger, and no tooltip shows;
  - a second Escape reaches the ladder (an armed tool is disarmed);
  - the same sequence for Summary's popover;
  - under touch emulation, a long-press shows the tooltip and leaves `aria-expanded` false.

#### Feature: width-and-device-conditional labels

> **Complexity:** S–M · **Dependencies:** M0 (label sum ≥ 249 confirmed). Independent of M-A.
> **Risks:**
>
> 1. **ADR-0111:** `useTooltip` gains an option, and two triggers change focus behaviour.
>    accessibility-reviewer and component-reviewer re-run **before** merge, and ux-reviewer signs
>    off the `FileDown` glyph standing for "share". All three are required, not optional.
> 2. **The 18 px spare:** the gate makes the next DO command a product-owner decision.
> 3. **ux-reviewer still blocks:** M-B stops and B0 stands.
> 4. **Tests finding these controls by visible text:** grep for them. Names are unchanged.
>
> **Testing:** unit tests (below); `web:workspace-fit`, `web:toolbar` and `web:workspace-chrome`.

##### Task M-B1 — Registry field and queries (S)

- **Steps:**
  1. In `toolbar-registry.ts`:
     - `ToolbarItem.deckLabel?: 'always' | 'icon-below-xl'`;
     - `ToolbarItemRenderApi.iconOnly?: boolean`, with TSDoc (spec §4).
  2. In `lib/breakpoints.ts`: `XL_QUERY` (from the `xl` token, pinned by a unit test) and
     `ICON_DECK_DEVICE_QUERY`.
  3. In `Deck.tsx`: derive `iconBelowXl`, set `showLabel` and `iconOnly`, and update `min-w`.
  4. Tag the three items, and give `calendar` the `Settings` gear icon.
- **Testing:** `Deck.test.tsx` with `matchMedia` stubbed:
  - icon-only on a fine-only device below `xl`;
  - labelled with `any-pointer: coarse`, without hover, or at `xl`;
  - names unchanged;
  - the roving walk unchanged.

##### Task M-B2 — Tooltip on two triggers, with suppression (S–M)

- **Steps:**
  1. In `tooltip.tsx`, add `suppressFocusOpen?: () => boolean`.
  2. Add the `useCompactTriggerTooltip` helper in
     `apps/web/src/components/ui/use-compact-trigger-tooltip.ts`, beside `tooltip.tsx`, so that both
     consumers depend downward on `components/ui`:
     - unconditional hooks;
     - `disabled: !compact`;
     - `name-echo`;
     - closed while expanded;
     - a `restoringFocus` ref set in the close handler;
     - no open on pointer-initiated focus.
  3. Adopt the helper in `ToolbarPopover` and `ExportMenuControl`, replacing `title` in the compact
     branch and keeping the `disabledReason` precedence and the reason span.
- **Testing:** unit tests for each clause, each verified red against the unsuppressed version
  (ADR-0110), plus the ADR-0117 ladder-interplay test.

##### Task M-B3 — Docs and release (XS)

- **Steps:**
  1. Add a `deckLabel` rule to `docs/DESIGN_SYSTEM.md`.
  2. Link `m4-measurement.md:56-58` to this spec.
  3. Add the ADR-0180 part B section, if M-A filed it without one.
  4. Add a `@repo/web` minor changeset.

---

## Definition of Done (per milestone)

- `pnpm prepush`;
- the e2e suites above, run locally;
- the reviews above, before merge;
- a changeset;
- before/after screenshots at 1024 × 600 (ADR-0081).

M-A also requires the derived suite list in the PR. Neither milestone touches `apps/api`.

## Risks & assumptions (rollup)

| Risk                                                                  | L / I       | Mitigation                                                    |
| --------------------------------------------------------------------- | ----------- | ------------------------------------------------------------- |
| Default 1280 × 720 suites swap                                        | high/med    | Derived list, set to 1280 × 800 in the same commit; M0-T2 re-ask if large |
| The canvas viewport does not survive `display: none`                  | med/high    | `measure()` 0 × 0 guard; journey case 2                       |
| Focus dropped on a live resize                                        | med/high    | Layout effect plus journey case 5                             |
| A diagram command acts invisibly                                      | low/med     | `withDiagram` plus the structural test                        |
| The tooltip pops after a menu closes                                  | med/med     | `suppressFocusOpen`; real-browser cases; ADR-0111 review      |
| The 18 px spare is consumed                                           | high/low    | The gate names the product owner as the decider               |
| The 1279/1280 flip under zoom surprises the product owner             | med/low     | Stated in CQ-B for acceptance                                 |
| Nobody on the product owner's own screens benefits                    | certain/low | Stated in spec §0                                             |
