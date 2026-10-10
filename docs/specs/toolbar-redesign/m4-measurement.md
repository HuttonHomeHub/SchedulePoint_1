# Toolbar redesign — M4 measurement record

Taken 2026-10-10 on the M4 build by `apps/web/measure-toolbar/toolbar-redesign-m4.spec.ts` (a harness, not a gate;
ADR-0081 §3), fine and coarse pointers, the container's Chromium, a plan with a long name ("Riverside Quarter — Phase 2
Substructure"). Nothing is projected: M2 read the real deck with zoom and the minimap still on it, M4 reads the real deck
without them. Lines are "LOOK/DO". Readings: `apps/web/measure-output/toolbar-redesign-m4.{fine,coarse}.json`.

## 1. What this changes in the plan's premises

1. **The 14 px axis-marker row is not at the stage's bottom.** M0 §7 and spec §4.7 name it as the second bound of the
   corner column ("the 40 px ruler at the top and the 14 px axis-marker row at the bottom"). In the code it is
   `absolute inset-x-0 bottom-0 h-3.5` **inside the 40 px ruler** (`TsldCanvas.tsx`, the `tsld-axis-markers` div is a child
   of the `tsld-ruler` div), so it is the bottom of the ruler band at the top of the stage. The stage's only bottom
   furniture is the optional resource strip, which the column already clears. Consequence: the column is bounded by the
   ruler (and the WBS band, via `sceneTopOffset`) at the top and by the resource strip at the bottom, and
   `minimapHasRoom` charges the 12 px inset once. Nothing was lost; the premise was a misreading of a `bottom-0`.
2. **There are no zoom keyboard shortcuts, so there is nothing for `aria-keyshortcuts` to advertise.** The brief and
   US-3 say every item "keeps its shortcut on `aria-keyshortcuts`". Zoom in/out/fit have no accelerator anywhere in the
   product (wheel and pinch are pointer gestures; the only keys the diagram claims are listed in `PlanShortcutsHelp.tsx`,
   and none zooms). Declaring `aria-keyshortcuts` for keys that do nothing would be a false claim, so none is set, and the
   registry carries a comment saying why. If the owner wants zoom keys, that is a new binding (a spec), after which the
   attribute is one line.
3. **The Tab order "canvas → minimap → cluster" needed a DOM move.** The diagram's keyboard surface is the sr-only
   listbox, which `TsldPanel` renders **after** `TsldCanvas`; a column inside the canvas box therefore tabbed minimap,
   cluster, _then_ the diagram. `TsldCanvas` now draws the column into a host node `TsldPanel` places after the list
   (`columnHost`, a portal), so Tab is list → minimap → × → cluster, asserted by `viewport-cluster.spec.ts`.
4. **Fit in the cluster no longer closes a dock** (corrected after review, §8). The deck's Fit used to close a squeezing
   dock and fit a frame later (ADR-0180's wrapped viewport command). The cluster is in the stage, which is `inert` in
   exactly those states. The review called the cluster "visible but dead" there; **measured, it is not visible at all**
   (the stage is a 1 px sliver, or under 40 px tall, and the cluster is clipped out of it). Hosting it outside the
   inert region would draw a card over the dock that has taken the row, so the route is `View ▾` ▸ Zoom ▸ **Fit to
   plan** (the same wrapped command). `docs/TECH_DEBT.md` #480.
5. **The coarse 1024 × 600 "no room" cell is the selection state, not the base state.** M0 measured the coarse stage at
   274 px; the real coarse base at M4 is **286 px of canvas** (the band is 211, three lines), which holds the 230 px column
   (44 px spare under the ruler). The minimap withdraws on coarse when a selection docks its bar (canvas 200) and with a
   conflict (234, 200).

## 2. Deck lines (fine pointer; LOOK/DO)

Every one of the eleven states is **1/1 at every width**, the floor included:

| State                                        | 1024 | 1280 | 1366 | 1440 | 1912 | 2560 |
| -------------------------------------------- | ---- | ---- | ---- | ---- | ---- | ---- |
| base, selection, dock, minimap, Gantt, empty | 1/1  | 1/1  | 1/1  | 1/1  | 1/1  | 1/1  |
| peer holds the pen                           | 1/1  | 1/1  | 1/1  | 1/1  | 1/1  | 1/1  |
| "1 conflict" (with and without a peer)       | 1/1  | 1/1  | 1/1  | 1/1  | 1/1  | 1/1  |
| "Conflict 1 of 1" (with and without a peer)  | 1/1  | 1/1  | 1/1  | 1/1  | 1/1  | 1/1  |

(M2 had LOOK at 2 lines with a conflict at 1024, 1280, 1366 and, cycling, 1440.) `LINES[1024]` is `{ max: 2 }` in
`command-surface.spec.ts`; each row is asserted at 1 line at every width, and `floor-states.spec.ts` sweeps nine of the
states at 1024 × 600.

**Coarse** (44 px targets kept, OD-2): 1024 is 3 lines in the base state (LOOK 1, DO 2: DO is 1151.7 px in 1008) and 4 with
a conflict (2/2); 1280 is 2/2 lines (1/1) in the base state and 3 with a conflict (2/1); 1366 is 2 and 3 only for the
cycling read-out; 1440 and up are 2 (1/1). The coarse 1024 bound `{ max: 4 }` holds. SC-3's "expected 2 at 1280" is met in
the base state only; a conflict costs a LOOK line on touch there.

## 3. Free width and the band at 1024 × 600 (fine)

Natural width against the row (1008 px), spare in px:

| State                       | LOOK natural | LOOK spare | DO natural | DO spare | Band | Canvas |
| --------------------------- | ------------ | ---------- | ---------- | -------- | ---- | ------ |
| base                        | 862.0        | 146.0      | 955.7      | 52.3     | 139  | 362    |
| selection                   | 862.0        | 146.0      | 955.7      | 52.3     | 139  | 246    |
| peer holds the pen          | 862.0        | 146.0      | 957.8      | 50.2     | 139  | 362    |
| "1 conflict"                | 958.3        | 49.7       | 955.7      | 52.3     | 139  | 362    |
| "Conflict 1 of 1" (cycling) | 987.3        | **20.7**   | 955.7      | 52.3     | 139  | 246    |
| cycling + peer pen          | 987.3        | 20.7       | 957.8      | 50.2     | 139  | 246    |
| empty plan                  | 862.0        | 146.0      | 955.7      | 52.3     | 139  | 356    |

The wide cells (base, fine): LOOK spare 128.6 / 214.6 / 288.6 / 688.6 / 1336.6 and DO spare 98.7 / 184.7 / 258.7 / 730.7 /
1378.7 at 1280 / 1366 / 1440 / 1912 / 2560. These are the numbers M5 recomputes its stages from (the JSON is re-taken then).

**SC-1:** the canvas is 362 px at 1024 × 600 on a mouse in every state without a selection (≥ 350). **The selection
states are 246 px**, set by the selection bar's own 167 px foot row (`m3-measurement.md` §4), which M4 does not change; the
journey asserts lines for them and states the canvas exception. Recorded as unmet-by-design, not as a regression.

## 4. The conflict read-out (the known risk)

M2 measured the cycling "Conflict n of m · reason" read-out 56 px over LOOK at the floor even after zoom left. **Owner
decision 2026-10-10 replaced "shrink the reason" with "the reason leaves the toolbar"**: the chip is count-only at every
width ("Conflict 1 of 1", no `max-w`, `title` = the count). LOOK with a conflict showing is now **49.7 px spare idle and 20.7
px spare cycling** at fine 1024 (it was 70.3 over and 202.0 over before M4 removed zoom, 56 over projected). Verified red:
restoring a truncated reason clause makes the deck three lines in the cycling states (`floor-states.spec.ts`).

## 5. Where the reason went

- **Spoken, every step, in full:** `use-conflict-navigation.ts` announces `Conflict i of n: <name> — <every reason>.` through
  the polite announcer (unchanged by M4).
- **On the object:** the step selects the conflicted activity, so the selection bar shows its **remedy** — "Review the
  constraint…" or "Review resources…" for three of the four flag types; "Clear visual start" (always on the bar) for the
  fourth, which renders nothing extra (`CONFLICT_REMEDIES`).
- **What is missing** is a _sentence on screen_ saying what is wrong with that activity (four of the five flag types have no
  canvas badge). Delivering it needs a new surface or a changed contract on the selection bar's conflict item (ADR-0105
  triggers), so it was **not built**. The proposal and its tests are `docs/TECH_DEBT.md` #479.

## 6. The column and the cluster (rects in page px; 1024 × 600, minimap open)

| Pointer | Cluster (x, y, w × h) | Minimap (w × h) | Column (w × h) | Column top below the ruler | Canvas |
| ------- | --------------------- | --------------- | -------------- | -------------------------- | ------ |
| fine    | 862, 491, 150 × 46    | 204 × 164       | 204 × 218      | **132 px**                 | 362    |
| coarse  | 814, 479, 198 × 54    | 204 × 168       | 204 × 230      | **44 px**                  | 286    |

- Heights are `viewport-column.ts`'s sums of declared parts (minimap 164 / 168, gap 8, cluster 46 / 54, inset 12) and equal
  the readings; `viewport-column.test.ts` pins them and `viewport-cluster.spec.ts` asserts the stack (minimap wholly above
  the cluster with 8 px between, both 12 px from the stage's right edge, minimap below the ruler).
- **Opening the minimap never moves the Minimap button** (its rect is identical before and after, asserted).
- **`minimapHasRoom`** is now width ≥ 600 **and** `stage height − 12 ≥ column`: the base fine and coarse stages hold it; the
  coarse selection (canvas 200) and conflict states, and any 386 px-wide docked stage, do not, and the toggle is shaded with
  "Not enough room for the minimap" (journey: the docked fine 1024 cell and the coarse selection cell).
- **Reveal margin (SC-15):** at 1024 × 600 fine, with the minimap open, End on the diagram's list selects the last activity
  and the reveal pans it clear of the column; the journey measures the bar's true extent (clicking through the column with
  `pointer-events: none`) and asserts it intersects neither the cluster nor the minimap. **Verified red** with the clearing
  disabled: `the bar {"x":865,"y":359,"w":100,"h":22} is under the minimap`. (At 1646 × 1097 the case passes without the
  margin, because the last bar is hundreds of pixels above the column; the first draft ran there and proved nothing.)
- Focus: with focus on the cluster, the view switching to the Gantt removes it, focus lands on the Gantt segment, the
  announcer says "Diagram viewport controls are only in the Diagram view. Focus moved to Gantt.", and the band's rect is
  unchanged (`viewport-cluster.spec.ts`; unit: `diagram-viewport-cluster.test.tsx`, verified red by deleting the cleanup).

## 7. Shared keyboard/focus change (ADR-0111), exactly

**As first built: none to `Deck`, `Toolbar`, `Menu`, `ToolbarPopover` or `usePopoverPanel`; the review round added optional props, listed in §8.** The cluster is one new `Toolbar` instance
(`diagram-viewport-cluster.tsx`) over `rows.canvas`, a fifth value of `ToolbarRow` (`'canvas'`) and a fifth key of
`splitByRow`. The container-unmount hand-off is a wrapper around that instance (focus/blur capture and a layout-effect
cleanup), in the cluster's own file; `useToolbarFocusHandoff` is untouched (its docblock already says it cannot fire when
the container unmounts). Roving, Tab stops and key sets are the shared ones.

## 8. After the review (the same day)

- **The cluster was anchored to a box nobody can see.** `TsldPanel`'s surface keeps a 240 px minimum and the stage
  clips it, so with a selection bar docked the canvas root's bottom is below the stage's visible bottom. Measured at
  coarse 1024 × 600 with a conflict selected: the stage was **89 px** visible (not the 200 this record gave: 200 was the
  canvas element, 40 px of ruler short of the surface and clipped), the cluster drawn off screen and still a Tab stop.
  The column is now lifted by the clipped amount (`TsldCanvas` `visibleBoxRef`, `clipShift`) and **withdrawn with
  `visibility: hidden`** where the visible scene cannot hold the card (`clusterHasRoom`). The keyboard reveal measures
  the visible stage too, and re-runs when it shrinks.
- **Coarse selection stage, before and after** (visible stage incl. the 40 px ruler, 1024 × 600): selected 141 → **186**;
  conflict selected 89 → **134** (floor 120). The cause was the selection bar's five 44 px lines in a 320 px outlet beside
  the facts; a marked strip (`data-dock-wide`) now takes 36 rem on a finger-sized window, which wraps the bar onto the
  line below the facts: three lines, 140 px. Fine pointer unchanged (246 / 286). A visible **Clear selection** button
  joins the bar (icon-only, 36 / 44 px; Escape does the same).
- **Exactly what changed in the shared primitives** (ADR-0111 review): `Toolbar.tsx` gains optional `ungrouped` (groups
  render as plain wrappers: no `role="group"`, no name) and `tooltip` (forwarded to `ToolbarButton`); `ToolbarButton.tsx`
  gains an optional `tooltip` prop spread into `useTooltip`; `tooltip.tsx` gains `placement` (`'below'` default, `'above'`
  tries above first) and `dismissOnPress` (a document click on the trigger closes the tip; default off). **No key
  handling, roving order, Tab stop or focus rule changed.** New: `use-container-unmount-handoff.ts`; `Deck.tsx` renders
  its two rows in `use-deck-row-order.ts`'s order (DO first below 1024), the one media-query read, so the first roving
  stop and the arrow order follow the screen.
- **Not done / observed:** a pointer-selected bar near the foot row used to be revealed against the canvas's own height
  (under the docked bar); the reveal now uses the visible height. `HistoryResultStrip` and `SelectionActionsBar` keep
  their own hand-off copies (adopting the hook was optional and not trivially safe: the second hands focus to a caller's
  function, not a selector). Crossing 1024 with focus inside the deck re-orders its rows in the DOM; Chromium drops focus
  on a moved node, so a reader resizing across the floor mid-keystroke lands on `<body>` (not handled).
