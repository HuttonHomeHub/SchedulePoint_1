# Minimap spec input — architecture (ui-architect, 2026-08-20)

> Verbatim report from the ui-architect agent, gathered BEFORE the spec was drafted. It opens with
> three corrections to its own brief (ADR-0076 §19.10), which is the reason input rounds precede
> the spec here.

## Corrections to the brief (verify the claim)

1. **The world-extent helper is not in `render/geometry.ts`.** It is `dayExtent` at
   `apps/web/src/features/tsld/render/paint.ts:2203-2218`, and it covers **x only**. The lane
   extent is derived **twice more, independently and inline** — `fitToContent` at
   `render/viewport.ts:161-168` and `buildExportViewport` at `export/export-image.ts:111-117`.
   The minimap would be the **third** derivation of `maxLane`. See §4.
2. **`paintScene`'s returned culled-id set is discarded by its only production caller.** The
   docblock (`paint.ts:775-776`) says the caller reuses it "for hit-testing / the minimap";
   `TsldCanvas.tsx:1317` calls it as a statement. Every consumer of the return value is a test.
   The minimap **must not** use it anyway — the culled set is precisely what is _on_ screen, and a
   minimap's subject is what is _off_ it.
3. **ADR-0026 §3's "committed viewport lives in typed, validated search params" was never built.**
   No `validateSearch` in `apps/web/src/routes` carries `pxPerDay`/`originX`; `zoomPreset` is
   plain `useState` (`toolbar/use-tsld-canvas-ui-state.ts:162`). ADR-0026's Journey 3 (send a
   client a link to a region) does not exist. Do not let the spec inherit it as a premise, and do
   not let the minimap quietly acquire it as scope.

Verified as stated: `PROJECT_BRIEF.md:92` (Should-have) and `:165`; ADR-0026:315 reserves a
`Minimap` component and `:150` classifies "minimap visibility" as local component state;
ADR-0079:20-22 for 60–80 lanes; TECH_DEBT #148 at `docs/TECH_DEBT.md:2640-2682`.

## 1. What is the minimap?

**Both — a draggable viewport rectangle AND click-to-jump. Hover does nothing at all.**

- Drag the rectangle → continuous pan (the primary gesture; what makes it a control rather than a
  picture).
- Click anywhere outside the rectangle → centre the viewport on that world point. Same command as
  drag, entered differently — one code path (`centerOnWorld`).
- Keyboard: the rectangle is the focusable element. Arrows nudge by one lane / one
  visible-width-tenth, `PageUp`/`PageDown` by a viewport height, `Home`/`End` to the extent ends.
- **Hover: nothing.** At 200×120 px over 60–80 lanes a lane is ~1.6 px tall, so a hover hit-test
  cannot be accurate — a tooltip naming the wrong activity is worse than none, and hover-only is
  the pattern `docs/UX_STANDARDS.md` bans. Only hover affordance: `grab`/`grabbing` cursor over
  the rectangle, `pointer` elsewhere (mirrors `TsldCanvas.tsx:1706-1715`).

Counter-argument stated honestly: a minimap that shows _where_ but never _what_ forces the planner
to jump before knowing whether they wanted to. A hover **date** readout (x is continuous, so it IS
accurate) would answer that near-free via `render/cursor-readout.ts`. Ship without it in M3 and
revisit — the date is on the ruler two centimetres away, and every overlay has cost something
(TECH_DEBT #148).

## 2. Where does it live?

**A floating overlay panel pinned to the canvas container's bottom-right corner. Fixed size.
Collapsible. Default off. Mounted inside `TsldCanvas`, not beside it.**

Decided by elimination — every other region has a real occupant:

| Region            | Occupant                                                                                        | Evidence                                           |
| ----------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Top strip         | ruler (40px, z-10) + WBS band + three date pills over lanes 0–1                                 | `TsldCanvas.tsx:141`, `:1658-1701`; TECH_DEBT #148 |
| Bottom-left       | Legend panel default corner, z-10                                                               | `TsldLegendPanel.tsx:143` (`bottom-3 left-3`)      |
| Bottom full-width | resource strip, 72px, when active                                                               | `TsldCanvas.tsx:147`, `:2020-2024`                 |
| Below container   | the canvas dock (36px, transient strips)                                                        | `canvas-dock.tsx:89-105`                           |
| Trailing drawer   | `DrawerSubject = 'explorer' \| 'context'` — exactly two; the plan owns `context` for the editor | `tool-rail.tsx:22`; `drawer-subject.tsx:35-46`     |

Not a chrome band (ADR-0092/0099 spent two epics taking `aboveCanvas` 249 → 135 px; a band hands
that back). Not the drawer (the minimap would compete with the activity editor; wanting both at
once is the normal case).

**Collision the spec must handle**: `measure()` subtracts `RESOURCE_STRIP_HEIGHT` from the scene
height (`TsldCanvas.tsx:1219-1225`) but the Legend does NOT offset by it (`TsldLegendPanel.tsx:64-70`)
— the legend can sit over the strip today. The minimap must offset by
`resourceStripActive ? RESOURCE_STRIP_HEIGHT : 0`.

**Fixed, not resizable** (a resizable minimap re-derives scale and repaints the whole picture per
drag frame). **Default off**, matching Legend (`use-legend-panel-prefs.ts:51`), Resource view
(`TsldCanvas.tsx:656`) and the WBS band (`render/view-toggles.ts:55-60` — whose stated reason
applies verbatim). Counter-argument: a default-off Should-have may never be discovered (ADR-0081's
dark-milestone shape) — mitigation is the named `View ▾ ▸ Panels` entry and the journey. **Reject**
auto-open on large plans: a panel that appears by itself was not asked for and would flicker as
the planner zooms.

## 3. What does it draw?

**Every activity, decimated to a minimum-1px rect, in two inks, with paint order as the decimation
policy. Links omitted. Shares the scene palette; does not resolve its own.**

Draws, in order (the order IS the rule): canvas ground (`palette.handleHalo` reads
`--color-canvas`, `render/palette.ts:85`); non-critical bars (`palette.bar`); critical bars
(`palette.critical`); data-date + Today verticals, 1px; the selection as a rect always ≥3×3px; the
viewport rectangle (as DOM — §4). Below ~1px/lane, later strokes overwrite earlier ones, so
critical-after-non-critical means **the critical path survives the merge** — graceful degradation
to a density picture with no separate mode to build.

Deliberately omits **10 of the painter's 15 layers** (`paint.ts:795, 821, 838, 889, 1126, 1268,
1287, 1398, 1442, 1503, 1554`):

| Omitted                                                           | Reason                                                                                                                                                |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency edges                                                  | 3,200 links in a 200px box is a solid smear hiding the bars. The decision most likely to be argued; state it as a decision.                           |
| Month bands, hatch, gridlines                                     | All LOD-gated off far above minimap scale (`NON_WORKING_MIN_PX`, `DAY_GRID_MIN_PX`) — including them ADDS work the scene itself refuses at this zoom. |
| Float/drift tails, link slack                                     | Sub-pixel; a tail would read as extra duration, which is a lie.                                                                                       |
| Bar labels, flanking dates                                        | `LABEL_MIN_PX_PER_DAY = 4`, `DATE_LABEL_MIN_PX_PER_DAY = 6` (`geometry.ts:43, 62`); minimap is ~0.3 px/day.                                           |
| Baseline ghosts, lag runs/handles, progress fill, constraint pins | Editing/analysis detail; the minimap is a locator.                                                                                                    |
| Near-critical                                                     | Amber at 1.6px reads as a third population, not a shading. Two inks, for legibility.                                                                  |

**Palette: reuse the scene's `paletteRef`.** `resolveTsldPalette(root)` takes a REQUIRED root
because a default once made all 86 token reads resolve against the page (`render/palette.ts:12-19`).
Resolve against the same `useCanvasSurface()` element (`TsldCanvas.tsx:672-674`), re-resolve on
`themeVersion`. A `resolveMinimapPalette` is the ADR-0065 drift. A dimmed outside-viewport ink, if
wanted, is a NEW token added to `token-contrast.test.ts` BEFORE the CSS (ADR-0083's rule).

## 4. Relation to the render model

**A new pure layer painter (`render/minimap.ts`) with its own narrow scene and its own viewport —
NOT a second `paintScene` call, NOT an offscreen tile on a cadence.**

Why not a second `paintScene`: the minimap's `pxPerDay` for a 2-year plan in 200px is ~0.27, below
`MIN_PX_PER_DAY = 0.4` (`geometry.ts:300`); whole-plan `paintScene` is the dearest measured case
in the product (14.6/**18.7 ms** p95, `docs/TECH_DEBT.md:434-439`); and every future scene layer
would land in the minimap silently (`TsldScene` has ~30 optional fields; the minimap needs six).

**The load-bearing observation: the minimap picture is invariant under pan and zoom.**
`screenYOfLane` hard-codes `LANE_HEIGHT` (`geometry.ts:35, 429-431`), so the world's vertical
extent in px is fixed; the minimap's own viewport derives from world extent + box size, neither of
which changes when the main canvas moves. The picture repaints ONLY on (a) activity data change,
(b) box resize, (c) theme bump. Zero cost on the pan path.

| Layer              | Substrate                          | Dirty when                 | Cost per pan frame |
| ------------------ | ---------------------------------- | -------------------------- | ------------------ |
| Plan picture       | `<canvas>`                         | data / resize / theme      | **0**              |
| Viewport rectangle | **DOM `<div>`**, `style.transform` | every frame the view moves | one style write    |

The DOM rectangle is ADR-0059's argument one level down: the minimap's interactive content is
exactly one rectangle, and the DOM gives it focus ring, role, name, pointer capture and keyboard
natively — **no parallel a11y layer**, the expensive thing ADR-0026 D7 had to build for the scene.

Module layout (mirrors `render/resource-strip.ts` + host wiring — the shipped precedent):

```text
features/tsld/render/minimap.ts          # pure: worldExtent · minimapViewport · minimapRects · paintMinimap
features/tsld/render/minimap.test.ts
features/tsld/render/minimap-budget.test.ts        # counting-stub, the paint.*-budget.test.ts pattern
features/tsld/components/TsldMinimap.tsx           # DOM panel + rectangle (focusable, draggable)
features/tsld/components/TsldMinimap.test.tsx
features/tsld/toolbar/use-minimap-panel-prefs.ts   # localStorage, the use-legend-panel-prefs shape
```

**Extract the world extent, do not write it a third time.** Add to `render/geometry.ts` (a leaf —
imports only `daysBetween`, pinned by `geometry-is-a-leaf.structural.test.ts`):

```ts
export interface WorldExtent {
  minDay: number;
  maxDay: number;
  maxLane: number;
}
export function worldExtent(activities, dataDate): WorldExtent | null;
```

Convert `dayExtent` (`paint.ts:2203`), `fitToContent` (`viewport.ts:159-169`) and
`buildExportViewport` (`export-image.ts:106-117`) to read it, with a structural one-derivation
test (the ADR-0063 rule). **One deliberate asymmetry to write down**: minimap x MUST be
`screenXOfDay` (pin structurally); minimap y must NOT be `screenYOfLane` (hard-codes
`LANE_HEIGHT`; the minimap compresses lanes). `minimapRects` computes
`y = laneIndex * boxHeight / (maxLane + 1)`, `h = max(1, …)`, `w = max(1, …)`, with the docblock
saying why the axes differ.

## 5. State

**A `LensToggle` in the `panels` group — NOT a `TsldViewToggles` key — persisted in global
`localStorage`, not the URL, not per-plan.**

Template: the Legend (`toolbar/tsld-toolbar-items.tsx:293-305`), `group: 'panels'` (stated reason
at `:168-171`: "a panel is a surface you read beside the diagram, not a mark drawn on it"). The
registry item it rides on is `View ▾`, `group: 'lens'`, `row: 'strip'`, `tier: 2` (`:2180-2200`),
unchanged. Do NOT add a `TsldViewToggles` key (that type is "which optional canvas layers draw",
read by the pure painter and the Gantt — both existing panels sit outside it). Do NOT promote to
the command strip in the first milestone (the pinned floor was measured at 960px, ADR-0099 M5;
promotion is M0 arithmetic, not a default).

Persistence: global localStorage key `schedulepoint-tsld-minimap`, copying
`use-legend-panel-prefs.ts:30-52` including the try/catch shape. Not the URL (ADR-0095's Gantt
memory earned the URL because sort/columns change what the reader is looking at; minimap
visibility is a workstation preference — a link forcing the recipient's minimap open is noise).
Not per-plan (a preference that appears to reset per plan reads as a broken toggle; being wrong is
one click).

## 6. Interaction plumbing

**Mount inside `TsldCanvas`'s container as a fifth pinned layer, reading `viewRef` directly. No
new subscription seam.**

Pan today: `viewRef.current = pan(...); dirtyRef.current = true; ...` (`TsldCanvas.tsx:1893-1894`,
`:1089-1091`); one rAF loop (`:1286-1319`); `movedThisFrame` (`:1315`) is the "view moved" signal,
already consumed imperatively by the date ruler (`:864-866`, `:1269-1284` — ADR-0026 D3, no
per-frame setState). The rectangle update is one more consumer of `movedThisFrame` writing
`style.transform` on a ref'd div. Structural template: the resource strip's palette/canvas/dirty
ref trio, already copied once by the WBS band (`:679-695`, `:1105-1112`, `:1390-1402`,
`:1570-1576`, `:2020-2024`).

Honest counter-argument (the strongest objection): `TsldCanvas.tsx` is ~2,000 lines and ADR-0078
§3 defers `TsldPanel` decomposition; a fifth layer is more of what ADR-0078 was written about. The
alternative (mount beside, like `TsldLegendPanel`) needs a new `subscribeViewport` seam on
`TsldCanvasHandle`, because `getViewport()` from React is a per-frame setState (D3 forbids).
Inside wins: the panel genuinely needs `viewRef` every frame, and the pure half keeps host wiring
to ~40 lines — the resource strip's split.

**Write path**: extend `TsldCanvasHandle` (`:107-133`) with ONE method:
`centerOnWorld: (day: number, lane: number) => void` (pure view transform). `centerOnDate` centres
horizontally only and takes ISO; do not refactor it in this epic (three callers, own suite).

**Escape ladder (ADR-0080)**: the minimap adds no rung at rest. ONE rung, innermost: Escape
cancels an in-flight minimap drag, restoring the viewport to its value at press, claiming the
press only while dragging (`preventDefault()`, the `lib/escape-rungs.ts:39-44` contract). Test
that Escape with NO drag does not reach it, verified red.

**Tool-mode contract (ADR-0064)**: the minimap is not a tool; arms/disarms nothing. A minimap drag
must NOT drop an open Link pick — `dropLinkPickSignal`'s purpose is "the bars are about to move"
(`TsldCanvas.tsx:261-267`), i.e. DATA change; a pan moves the camera and the pick is against an
activity id. Write the distinction down. No recalculation hold (no writes). Ctrl-drag on the
minimap is an ordinary pan, never a marquee (`:1729-1730` is the scene's chord). **Not pen-gated**
— navigating is a read (ADR-0063 M4b / ADR-0080); a Viewer gets a working minimap.

## 7. Slicing

**M0 — measure, falsification condition written first.**

1. Cost: paint the proposed picture for the 2,160-activity scene into 200×120; measure a 10s pan
   with/without the minimap via `measure-draw-in-browser.js`. Metric: **dropped frames** (the §9
   gate), against the recorded 10.2% baseline. _Falsification condition:_ >2 percentage points
   worse ⇒ the rectangle moves to pure transform (if not already), and failing that the feature
   withdraws to a static picture with no live rectangle.
2. Need: re-derive the world extent of the operator's largest real plan and a 500-activity import,
   in lanes and days, and the visible fraction per zoom preset at 1646. ADR-0079's "60–80 lanes,
   ~a dozen visible" PREDATES Graphite's canvas-height change (576 → 681px ⇒ ~24 lanes visible) —
   stale by construction (ADR-0076 Class 1). The horizontal figure (`ZOOM_TARGET_DAYS.day = 14`,
   `geometry.ts:278` — ~2% of a two-year plan) is a different and probably stronger argument. **Do
   not justify a mostly-vertical control with a horizontal-zoom anecdote.**
3. Collision: `scripts/shoot.mjs` at 1646 with Legend open, resource strip active, WBS band on —
   confirm bottom-right is genuinely free.

**M1 — the pure core; declares itself dark (ADR-0081)** — `render/minimap.ts` + the `worldExtent`
extraction with all three call sites converted + the structural one-derivation test. No entry
point, said in those words.

**M2 — picture + read-only rectangle, WITH its entry point** (`View ▾ ▸ Panels ▸ Minimap`,
`useMinimapPanelPrefs`). Deliberately not sliced picture/rectangle apart — a minimap with no
rectangle is ADR-0059 M6's lit-but-inert shape. **Lands with the journey** (first user-facing
milestone; ADR-0081's subject is the capability, not the flag).

**M3 — interaction**: drag, click-to-jump, keyboard, the innermost Escape rung, focus ring,
accessible name, announcement on jump, `centerOnWorld`.

**M4 — gate pass**: ux · accessibility · component · frontend-performance · ui-architect over the
combined diff; re-derive M0's numbers from the final code. **No `VITE_` flag** (ADR-0088 D1); the
panel defaults off, which is a behavioural rollback anyway.

## Risks the spec must not gloss

1. **The pan path is already dropping frames** — 10.2% at 2,016 activities at Fit, ~8 ms/frame
   unattributed, full-canvas raster the leading hypothesis (`docs/TECH_DEBT.md:502-520`). A
   minimap is a second full-canvas raster. The invariant-picture + DOM-rectangle design is the
   answer and M0 must prove it. **This is the risk that can kill the feature.**
2. **The measured need is stale and points the wrong way** — re-derive before the problem
   statement is written (CLAUDE.md §19's problem-statement rule).
3. **`maxLane` derived twice already; this makes three** — extract or drift (ADR-0065 shape).
4. **`resolveTsldPalette`'s root is required for a reason** — reuse the scene's `paletteRef`.
5. **Panel-on-panel collision is unhandled today** (legend vs resource strip) — the minimap must
   offset; check in a browser, not by assumption.
6. **Decimation below 1px/lane is the NORMAL case at scale** — state the merge rule
   (`max(1, …)` + paint order) in the spec or the critical path disappears on exactly the plans
   the minimap exists for.
7. **The drawer has exactly two subjects and the plan owns one** — "put it in the drawer" means
   no minimap while editing.
8. **A hover tooltip is unbuildable accurately at this scale** and will be requested — say no in
   the spec with the pixel arithmetic.
9. **Escape is a ladder, not a listener** — one innermost rung, tested red-first.
10. **`paintScene`'s culled-id return is live misinformation naming this feature**
    (`paint.ts:775-776` vs `TsldCanvas.tsx:1317`) — wire it or correct the docblock; leaving it is
    ADR-0058's class in the first file the spec author reads. (Note: performance input recommends
    the minimap NOT use the culled set anyway — its subject is what is off screen — so the likely
    resolution is correcting the docblock.)
11. **ADR-0026 §3's URL-committed viewport does not exist** — a spec author reading that ADR will
    assume deep-linkable viewports; shareable viewport is its own decision, not minimap scope.
