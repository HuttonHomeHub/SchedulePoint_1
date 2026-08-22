# TSLD canvas decomposition — a structural refactor plan

> **Status:** Proposed — design only. **No application code changes are proposed here**, and no
> step in this plan may change behaviour. This document is the decomposition design; the ADR
> outline in §10 is the decision record it would need.
>
> **Owner:** frontend architecture. **Governing decisions:** ADR-0026 (canvas substrate, module
> structure, a11y model), ADR-0031 (toolbar registry), ADR-0054/0055/0056/0063/0064/0065 (the
> layers that grew), ADR-0058 (verify the claim), ADR-0076 (a decision-bearing claim carries its
> evidence).
>
> **The CPM engine is not imported by any of this.** The engine is `apps/api/src/modules/schedule/
engine/`; `apps/web` has no dependency path to `apps/api`, and every import in the files below
> resolves to a sibling render/interaction module, `@/components`, `@/config`, `@/lib` or
> `@repo/types`. The ADR-0034 recalculation parity gate is untouched **by construction** — not as
> a promise, and not because a test says so.

---

## 1. The finding, restated with the evidence for each claim

From the multi-agent canvas review of 2026-08-06, item 10 of 10: _the canvas's growth has outrun
its module boundaries, and items 1–9 all land in these files with nowhere smaller to go._

Re-derived here rather than trusted (ADR-0058). Line counts are non-blank lines from
`rg --count`; total file lengths are from `Read`.

| File                                                 | Non-blank | Total | The specific shape of the problem                                                                                                                                                                                 |
| ---------------------------------------------------- | --------: | ----: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/tsld/toolbar/tsld-toolbar-items.tsx`       |     2,261 | 2,307 | 13 control components + 4 helpers inline (lines 95–1331) ahead of a single 975-line `buildTsldToolbarItems()` (1332–2307).                                                                                        |
| `features/tsld/render/paint.ts`                      |     2,105 | 2,203 | `paintScene` spans 884–1692 (**808 lines**) and carries **14** `// Layer …` markers (verified: `-0.5, 0, 1, 2, 2.5, 3, 3.2, 3.2b, 3.5, 3.55, 3.58, 3.6, 3.7, 4`). The brief said 13; 3.2 and 3.2b share a number. |
| `features/tsld/components/TsldPanel.tsx`             |     1,908 | 1,966 | One component from line 382 to the end: selection, the ADR-0026 D7 listbox + its keymap, six lens derivations, five announcement effects, tool arming, intent commit, the create popover.                         |
| `features/tsld/components/TsldCanvas.tsx`            |     1,773 | 1,829 | One `useEffect` at **1065–1440 (375 lines)** fusing five lifecycles; ten more effects above it; four inline pointer handlers of 60–100 lines each in the JSX.                                                     |
| `features/tsld/render/render-model.ts`               |     1,552 | 1,660 | Five unrelated concerns in one file — see §3.2. `link-routing.test.ts` already tests one of them **as a module that does not exist**.                                                                             |
| `features/tsld/toolbar/use-tsld-toolbar-context.tsx` |       972 | 1,005 | `return useMemo(…)` at **398–894**: one ~500-line object literal with the export/print/interchange commands defined inline inside it.                                                                             |

Three of these have a named consequence already recorded in the register, which is the strongest
argument that this is debt rather than taste:

- **`docs/TECH_DEBT.md` #85** says, in its own words: _"Split `useTsldToolbarContext`'s single
  ~250-property memo — the export/print commands are the obvious seam… **Do not remove the disables
  without doing that first**"_. Two `eslint-disable-next-line react-hooks/refs` suppressions are
  standing in the tree specifically because the file is too large for the compiler's analysis, and
  the register already says the fix is this refactor.
- **`docs/TECH_DEBT.md` #76** records two hoists inside `paintScene`'s edge block —
  `activityRect` computed three times per visible activity per frame, `crossedLanes` twice per
  edge — deferred because they sit inside an accepted overhead. Both are one-line moves **once a
  per-frame context object exists**, and are unreachable without one.
- **`docs/TECH_DEBT.md` #75** wants the draw budget re-expressed and re-measured. Today
  `paintScene` is one function, so it can only be measured as one number; there is no way to
  attribute a millisecond to the tails, the hatch or the routing.

And one verified structural oddity, which is the plan's cleanest single justification:

> `render/link-routing.test.ts` opens `import { arrowhead, bundleCorridors, BUNDLE_TOLERANCE_PX,
ARROWHEAD_*, FAN_OUT_STEP_PX, isLaneFreeAt, laneIntervalIndex, MAX_CORRIDOR_CANDIDATES,
routeOrthogonal, type LaneIntervalIndex … } from './render-model';`
>
> A test file named for a module, importing ten symbols that form exactly that module, out of a
> file that does not draw the boundary. **The seam is already agreed; only the source disagrees.**

Likewise verified: `TsldCanvas`'s `window` `keydown` handler (`TsldCanvas.tsx:1392–1421`) is
exercised by `TsldPanel.disarm.test.tsx:132–170` (`fireEvent.keyDown(window, { key: 'Escape' })`),
`TsldPanel.mode-band.test.tsx` and `TsldPanel.pick-announce.test.tsx`. `TsldCanvas.test.tsx`
mentions Escape only in prose. The handler that decides what Escape means for four tool modes is
**provable only through a different component's suite**.

---

## 2. The constraint that shapes everything below: ADR-0026 §8 already specifies this structure

This is not a new architecture. ADR-0026 §8 ("Module structure & composition") prescribes:

```text
features/tsld/
├── components/        # TsldCanvas (shell), Toolbar, ZoomSlider, Minimap, A11yOverlay
├── render/            # layer painters (grid, bars, edges), scene-model builder, palette-from-tokens
├── interaction/       # pointer + keyboard controllers, hit-test, drag/rubber-band state machine
├── viewport/          # transform, zoom levels, world↔screen, URL <-> viewport sync
├── a11y/              # DOM proxy model, roving focus, keymap
├── hooks/             # useRafLoop, useCanvasDpr, useSceneModel
└── index.ts           # public surface
```

What actually exists is `components/`, `export/`, `interaction/`, `render/`, `toolbar/`. **`viewport/`,
`a11y/` and `hooks/` were never created**; `render/` absorbed all three (`render/time-scale.ts` is
the viewport module, `render/a11y.ts` is the a11y text model, `render/use-now.ts` and
`render/use-theme-version.ts` are the hooks), and "layer painters (grid, bars, edges)" — plural,
named in the ADR — became one `paint.ts`.

**This changes the character of the work.** Most of it is not a proposal; it is compliance with an
accepted ADR that the code drifted from, one accepted feature at a time. Two consequences:

1. The bar for each step is low — "does ADR-0026 §8 already say this?" answers most layout
   questions, and where it does, the step needs no new argument.
2. The genuinely new decisions are small and specific: the per-frame **`PaintFrame`** context
   (§3.1), the **barrel-preserving** extraction method (§4.1), the **characterisation-first** rule
   (§5), and whether `viewport/`/`a11y/` should now be created or `render/` formally recognised as
   their home (§12, Q1). Those are what the ADR in §10 records — not the folder tree.

**What this plan explicitly refuses.** No WebGL. No framework change. No dirty-region rewrite. No
new state library. ADR-0026's Canvas-2D substrate decision stands and was re-confirmed on real
hardware in ADR-0026 §9b (Dell Precision 5690, 2,016-activity imported programme: ~60 fps at Week
zoom, ~53 fps at Fit, both **PASS** against §9's ≥ 30 fps @ 2,000 gate). A decomposition that
becomes a rewrite loses the one property that makes it safe.

---

## 3. Target module boundaries

Naming follows the repo: `kebab-case.ts` for modules, `PascalCase.tsx` for React components,
co-located `*.test.ts(x)`.

### 3.1 `render/paint.ts` → a layer directory behind a stable barrel

**The load-bearing choice: `paint.ts` remains and becomes a barrel.** 30 files import from
`render/paint` (verified by grep), including four counting-stub budget suites, the export renderer,
the toolbar context and `palette.ts`. If `paint.ts` keeps exporting exactly what it exports today —
re-exported from the new modules — then **not one import in the repository changes**, every existing
suite goes on pinning the seam unmodified, and each step's diff is a move plus a re-export line.

```text
features/tsld/render/
├── paint.ts                       # BARREL ONLY. Re-exports; owns paintScene's orchestration.
├── paint-frame.ts                 # PaintFrame: the per-frame derived context (new)
└── layers/
    ├── month-bands.ts             # Layer -0.5   (paint.ts:905–929)
    ├── non-working.ts             # Layer 0      (931–946) + nonWorkingHatchTile + its module cache
    ├── gridlines.ts               # Layer 1      (948–997)  both tiered + legacy branches
    ├── edges.ts                   # Layer 2      (999–1204) → returns EdgeLayerResult
    ├── baseline-ghosts.ts         # Layer 2.5    (1206–1257)
    ├── bars.ts                    # Layer 3      (1271–1350) + drawRefreshedBar + barColour/barInk
    ├── badges.ts                  # the four badge painters (constraint pin, conflict, overlap, over-allocation)
    ├── lag-runs.ts                # Layers 3.2 + 3.2b (1352–1379) + drawLagHandles
    ├── today.ts                   # Layer 3.5    (1381–1423) + TODAY_CHIP_H/TOP
    ├── float-tails.ts             # Layer 3.55   (1425–1467)
    ├── link-slack.ts              # Layer 3.58   (1469–1524)
    ├── labels.ts                  # Layer 3.6    (1546–1595)
    ├── dates.ts                   # Layer 3.7    (1597–1651)
    ├── selection.ts               # Layer 4      (1653–1689)
    ├── text-measure.ts            # the shared module-scope `labelWidths` memo (paint.ts:67)
    └── shapes.ts                  # beginRoundedRect, traceMilestoneDiamond, drawPolyline,
                                   #   drawRoundedPolyline — the tracings ≥2 layers share
```

Sibling painters that are already separable and simply move out of the 2,200-line file:

```text
├── paint-interaction.ts           # paintInteractionLayer + LinkOverlay/ResizeOverlay/LagOverlay/
│                                  #   GhostDetail/InteractionOverlay/CursorChip + CURSOR_CHIP_*
├── paint-resource-strip.ts        # paintResourceStrip + ResourceStripPalette
└── paint-wbs-band.ts              # paintWbsBand + WbsBandPalette
```

**`PaintFrame` — the per-frame context object.** Every layer takes exactly one argument. The
constraint that makes it correct is that it holds only what is **derived once per frame and shared
by two or more layers** — it is not a bag:

```ts
export interface PaintFrame {
  readonly ctx: Ctx2D;
  readonly scene: TsldScene;
  readonly view: Viewport;
  readonly size: Size;
  readonly palette: TsldPalette;
  /** `scene.view ?? DEFAULT_VIEW_TOGGLES`, resolved once (paint.ts:897). */
  readonly toggles: TsldViewToggles;
  readonly byId: ReadonlyMap<string, RenderActivity>;
  /** The culled set, insertion-ordered — bar z-order depends on this order (paint.ts:1262). */
  readonly visibleIds: ReadonlySet<string>;
  readonly firstDay: number;
  readonly lastDay: number;
  /** ONE calendar walk per frame, shared by the bands and the month/year gridlines. The comment
   *  at paint.ts:901 says why: "Two walks could disagree by a day; one cannot." */
  readonly bounds: CalendarBoundaries;
  /** Visible screen rects. LAZY — see the note below. Shared by bars, tails, slack, labels,
   *  dates and selection; each build re-parses two ISO dates per activity. */
  rects(): ReadonlyMap<string, Rect>;
  /** Lane-bucketed, x-sorted rows. LAZY — labels and dates share one build (paint.ts:1531). */
  laneRows(): ReadonlyMap<number, LaneRow[]>;
}
```

Two subtleties that must survive the move, both of which the current file states in comments and
neither of which is obvious from the code:

- **`rects` and `laneRows` stay lazy, and `rects` keeps its current first caller.** Today `rects`
  is built at line 1263 — _after_ the edge layer, whose `laneIntervalIndex` independently re-derives
  `activityRect` over the same culled set. That duplication is TECH_DEBT #76 and **must not be fixed
  in the refactor PR**: fixing it is a performance change with its own measurement, and a refactor
  PR that also improves performance cannot be reviewed as either. A lazy getter preserves today's
  ordering exactly and reduces #76 to a later one-line move (call `rects()` before the edge layer
  and pass it in). Note for the reviewer: building it eagerly would in fact be invisible to every
  gate, because `activityRect` makes no `ctx` calls — that is precisely why it must be resisted here
  and done deliberately there.
- **The edge layer returns a value.** Layer 2 collects `lagRuns`, `lagHandlePoints` and
  `activeLagHandle` while the anchors are at hand (paint.ts:1070–1096) and layers 3.2/3.2b draw them
  200 lines later. This is the one place the "layers are independent" story is false. Make it
  explicit rather than implicit: `paintEdges(frame): EdgeLayerResult`, consumed by
  `paintLagRuns(frame, edgeResult)`. A closure variable that is silently the coupling is exactly
  what a future layer author will not notice.

**Module-scope caches move with their owner, and one is shared.** `nonWorkingHatchCache` →
`non-working.ts`. `edgeFanOuts`/`edgeFanOutFor` → `edges.ts` (re-exported from the barrel, because
`paint.test.ts:2045–2053` imports and asserts its memo identity). `labelWidths` → `text-measure.ts`,
because **two** layers share it and it is keyed by text alone — the docblock at paint.ts:1559 warns
that a font change would poison it across palettes, and splitting the instance in two would create
exactly that class of bug with no error.

**One cross-module constant relationship must be preserved as an import, never duplicated.**
`TODAY_CHIP_TOP = CURSOR_CHIP_TOP + CURSOR_CHIP_H + 4` (paint.ts:1802). The two chips live on
different canvases, so nothing but this derivation stops them overlapping during a drag, and
`paint.test.ts:555` asserts it. After the split, `layers/today.ts` imports `CURSOR_CHIP_*` from
`paint-interaction.ts`. If that import ever looks like an oddity to be tidied away, the docblock
must say why it exists — it already does.

> **WITHDRAWN 2026-08-22 by ADR-0106 (`docs/TECH_DEBT.md` #148).** All five of those constants are
> deleted: the three date labels are DOM in the ruler band now, and the painter draws only the
> rules. So there is no cross-canvas derivation left to preserve, `layers/today.ts` has no
> `CURSOR_CHIP_*` to import, and `paint.test.ts:555` is not that assertion any more.
>
> Kept rather than cut, because this paragraph is the clearest statement of _why_ it mattered, and
> its own reasoning is what the replacement rests on: the relationship was cross-canvas and
> therefore invisible to either file alone. The successor is `render/axis-markers.ts`, which holds
> the whole cull → clamp → coincidence → overlap decision in **one** module for exactly the reason
> given here — and whose guards ask what a marker sits over rather than what it sits beside, which
> is the question this one never asked. The layer table above is stale in the same place
> (`today.ts … + TODAY_CHIP_H/TOP`) and for the same reason.
>
> This is the standing rule in `CLAUDE.md` §19 — _re-verify a spec's PROBLEM statement, not only its
> design_ — landing on an unbuilt plan: a milestone that fixes something does not go back and edit
> the plans that depended on it, so the next reader would have carefully preserved an import of
> symbols that no longer exist.

### 3.2 `render/render-model.ts` → the four modules it already contains

The test file has drawn one of these boundaries already. The rest fall out of reading the exports:

```text
features/tsld/render/
├── link-routing.ts        # THE MODULE link-routing.test.ts ALREADY IMPORTS.
│                          #   laneIntervalIndex, isLaneFreeAt, routeOrthogonal, bundleCorridors,
│                          #   BundleCandidate, BUNDLE_TOLERANCE_PX, MAX_CORRIDOR_CANDIDATES,
│                          #   arrowhead + ARROWHEAD_*, computeEdgeFanOut + FanOutOffsets +
│                          #   FAN_OUT_*, elbowRadius + LINK_ELBOW_RADIUS,
│                          #   dependencyPolyline(TimeTrue), lagAnchorPoints/LagAnchors,
│                          #   lagRunSegment/LagRun, linkHighlightIds, edgeTouches
├── viewport.ts            # Viewport, screenXOfDay/screenYOfLane, dayAtScreenX/laneAtScreenY,
│                          #   pan, zoomAt, panToDate, fitToContent, DEFAULT_VIEWPORT,
│                          #   MIN/MAX/LEGACY_MAX_PX_PER_DAY, ZOOM_STOPS/ZOOM_TARGET_DAYS/
│                          #   ZOOM_RANGE_LABELS, ZoomLevel, cull, rectsIntersect, dayCellRect
├── working-time.ts        # DayWalk, ELAPSED_DAY_WALK, makeWorkingDayWalk, WALK_HORIZON_DAYS,
│                          #   lagAnchorDay, lagFromAnchorDay, daysBetween, addCalendarDays
├── hit-test.ts            # hitTest, classifyHit, ClassifyHitOptions, HitZone/HitZoneKind,
│                          #   EDGE_HANDLE_PX, LAG_ANCHOR_PX, isResizeEligibleType
└── render-model.ts        # BARREL + what is genuinely the model: RenderActivity, RenderEdge,
                           #   Rect/Point/Size, activityRect, glyph geometry (barGlyphKind,
                           #   loeBracketRects, summaryTabRects, progressGeometry, MILESTONE_RADIUS,
                           #   BAR_*, LANE_HEIGHT), label/date placement (labelPlacement,
                           #   truncateToWidth, dateLabelSlot, LABEL_*), float/drift tails,
                           #   edgeGapDays, slackByDependencyId, formatCanvasDate
```

Same barrel rule: `render-model.ts` keeps every current export, so **no consumer changes**. The one
allowed test edit is `link-routing.test.ts` re-pointing its import from `./render-model` to
`./link-routing` — which is the change that makes the file's own name true, and should be its own
line in the PR description.

`hit-test.ts` is the seam ADR-0026 §8 calls `interaction/`. It is placed in `render/` here to keep
the step a pure move (it is imported by `TsldCanvas` and the export path); whether it should later
live in `interaction/` is §12 Q1.

### 3.3 `components/TsldCanvas.tsx` → the five fused lifecycles as hooks

The effect at 1065–1440 does five things whose only relationship is that they all need the same two
DOM refs. Each is separately testable and none of them today is:

| Today (in the one effect)                        | Becomes                                                                | What it owns                                                                                                                                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `measure()` + `ResizeObserver` (1086–1138, 1357) | `hooks/use-canvas-sizing.ts`                                           | Container measure → four backing stores × DPR, band-height reservation, the `applied` reset that fixed the dead interaction canvas (the 12-line comment at 1071–1083 moves verbatim). |
| `frame()` + rAF (1159–1355)                      | `hooks/use-raf-paint-loop.ts`                                          | The four dirty flags, the four painters, the selection-anchor publish. ADR-0026 §8 names this `useRafLoop`.                                                                           |
| `syncRuler()` (1140–1157) + pools                | `hooks/use-ruler-sync.ts`                                              | The imperative DOM ruler and its element pools (`syncRulerRow` at 517 moves with it).                                                                                                 |
| `IntersectionObserver` (1362–1373)               | `hooks/use-surface-visibility.ts`                                      | The off-screen pause, TECH_DEBT #30d. Pinned by `TsldCanvas.hidden-pane.test.tsx:87`.                                                                                                 |
| `wheel` (1375–1388) + `keydown` (1392–1422)      | `interaction/use-canvas-keymap.ts` and `interaction/use-wheel-zoom.ts` | **The keymap is the point of this whole step** — see below.                                                                                                                           |

```text
features/tsld/
├── components/TsldCanvas.tsx      # the shell: refs, scene publication, JSX, the four canvases
├── hooks/
│   ├── use-canvas-sizing.ts
│   ├── use-raf-paint-loop.ts
│   ├── use-ruler-sync.ts
│   ├── use-surface-visibility.ts
│   └── use-scene-ref.ts           # the 55-line scene literal duplicated at 711–749 and 799–853
└── interaction/
    ├── use-canvas-keymap.ts       # the window Escape handler + its four-mode precedence
    ├── use-wheel-zoom.ts
    └── canvas-pointer-handlers.ts # the four inline JSX handlers (1554–1804) as named functions
```

**Why the keymap is the highest-value extraction in the file.** ADR-0064 §7's enablement review
found five defects in exactly this area, four of them "one correct pattern applied to a control and
not its neighbour". The Escape precedence chain — gesture cancels first, then an open link pick,
then the tool disarms, and `loePicking` deliberately falls through to the third branch — is four
interacting rules in one `if/else if` chain that **no test in its own file can reach**. Extracted to
a hook (or better, a pure `escapeAction(state): 'cancelGesture' | 'dropPick' | 'exitTool' | 'none'`
plus a thin hook), it becomes a table test. The `TsldPanel` suites that prove it today are kept —
they are the integration proof and they are worth having — but they stop being the _only_ proof.

**The duplicated scene literal (711–749 and 799–853) is a defect waiting to happen and should be
one of the first moves.** The initial `sceneRef` and the resync effect construct the same 21-field
object twice, and they already differ deliberately in three fields (`hoverId`, `activeLagId`,
`gestureSourceId` are `null` on init and `*Ref.current` on resync). The comment at paint.ts's
`monthBandsEnabled` (TsldCanvas.tsx:704–710) records that this pair has already drifted once and was
hoisted for that reason — by a component review, not by a test.

### 3.4 `toolbar/tsld-toolbar-items.tsx` → controls beside the registry

The 13 controls are ordinary components that happen to be declared in the registry file. `defineToolbar`
validates a single array (`toolbar-registry.ts:166–187`: duplicate ids, empty labels, the
`onActivate`/`render` XOR), so a registry assembled from per-group arrays keeps exactly one
validation point and gains a compile-time home for each group.

```text
features/tsld/toolbar/
├── tsld-toolbar-items.tsx          # buildTsldToolbarItems(): defineToolbar([...frame, ...find, …])
├── controls/
│   ├── GoToDateControl.tsx         (170–235)
│   ├── AddActivityControl.tsx      (276–413)
│   ├── LinkControl.tsx             (435–528)
│   ├── ZoomPresetControl.tsx       (548–617)
│   ├── SearchFieldControl.tsx      (642–672)
│   ├── LiveSearchControl.tsx       (673–718)
│   ├── FilterMenuControl.tsx       (719–756)
│   ├── ColourByControl.tsx         (775–835)
│   ├── ExportMenuControl.tsx       (849–977)
│   ├── IsolateControl.tsx          (1001–1118)
│   ├── CurrentConflictStatus.tsx   (1119–1155)
│   ├── ViewTogglesPanel.tsx        (1156–1198)
│   ├── UndoRedoControl.tsx         (1199–1243)
│   └── toolbar-menu-parts.tsx      # SoonTag (243), MenuSection (252) — shared by several
└── items/                          # the registry entries, one file per ADR-0031 group
    ├── frame-items.tsx  find-items.tsx  lens-items.tsx
    ├── tools-items.tsx  object-items.tsx  plan-items.tsx  help-items.tsx
    └── item-shapes.ts              # the shared flag-on/flag-off `*Shape` literals (1337–1470+)
```

Two notes on doing it safely:

- The `*Shape` consts exist so a real item and its `placeholderItem()` stub cannot drift
  (component review C1, recorded in the file at 1333–1336). They must move **once**, to
  `item-shapes.ts`, and be imported by both branches — never copied into two group files. A
  structural test asserting every id appears in at most one `items/*` file is cheap insurance.
- Split the group files **only after** the controls move. Two large moves in one PR make the
  reviewer's job "did any line change?" over 2,300 lines instead of over 1,200.

The 13 toolbar suites drive items through `buildTsldToolbarItems()` + `makeTsldToolbarContext()`
(`toolbar/test-helpers.tsx`), so they see none of this — which is what makes it safe, and also what
means the step buys **structure, not new proof**. Weight it accordingly (§7).

### 3.5 `toolbar/use-tsld-toolbar-context.tsx` → command hooks

The ~500-line memo (398–894) is a context assembly with command implementations inlined. The
register already named the seam (#85):

```text
features/tsld/toolbar/
├── use-tsld-toolbar-context.tsx    # composes the hooks; the memo becomes assembly only
├── commands/
│   ├── use-export-commands.ts      # exportScheduleCsv (687), exportDiagramPng (713),
│   │                               #   exportDiagramPdf (745), exportInterchange (845), print;
│   │                               #   owns pdfExporting / interchangeExporting / printing /
│   │                               #   exportError / exportNotice AND buildDiagramImage —
│   │                               #   i.e. the ONLY reader of canvasControlRef
│   ├── use-conflict-navigation.ts  # orderedConflictHits (281), currentConflict (289),
│   │                               #   goToNextConflict (302) — the second ref reader
│   ├── use-lens-commands.ts        # filter / colour-by / baseline-overlay setters + gates
│   └── use-selection-commands.ts   # openProgress, openActivityNotes, revealComments, canProgress
└── ProjectFinishChip.tsx           # (63–88) a component in a hook file
```

**This step has a stated, checkable success criterion, which is rare and worth using:** delete the
two `eslint-disable-next-line react-hooks/refs` comments and `pnpm lint` stays green. #85 predicts
they come back if the split does not actually move the ref readers out — so the disables are the
test. Do not remove them in any earlier step.

### 3.6 `components/TsldPanel.tsx` → the a11y layer and the lens derivations

The largest and the **last** (see §7). Two clean seams and one that needs care:

```text
features/tsld/
├── components/TsldPanel.tsx        # composition: props → hooks → canvas + listbox + dialogs
├── a11y/
│   ├── ActivityListbox.tsx         # the ADR-0026 D7 parallel listbox (JSX at ~1870–1930)
│   └── use-listbox-keymap.ts       # onListKeyDown (1054–~1300): LOE pick, link pick, Enter,
│                                   #   ?, [ / ], Space, Shift+arrows, Alt+arrows
└── hooks/
    ├── use-tsld-lens-derivations.ts # dimmedIds / barFill / barInk / baselineGhosts / flaggedIds
    │                                #   (716–812) — six useMemos with a documented union rule
    ├── use-tsld-announcements.ts    # the five announce effects (813–882+)
    └── use-tsld-tool-arming.ts      # LOE + link arm/disarm, linkArmGeneration, mode statement
```

**The care.** `use-listbox-keymap` must be extracted as a hook that still receives the same
`editingEnabled`/`mode`/handler props, **not** as a pure reducer in step one. The keymap branches on
five capability gates and calls four different coalesced-nudge hooks; turning it pure is a second,
larger refactor with real risk. Move it, prove it, then consider purifying it — and only if
something needs it.

**The invariant this file carries above all others** is ADR-0063's: _the count of AT-reachable
activities does not change across the WBS-band toggle_, held **by construction** because the listbox
reads the plan's activities and not what the scene paints. Any move of the listbox must preserve
that property structurally — the listbox's data source stays `activities`, never a scene-derived
list. `TsldPanel.wbs-band.test.tsx` / `.wbs-band-off.test.tsx` pin it.

---

## 4. The invariants, and how each is proven

### 4.1 The method: barrel-preserving, characterisation-first, one property per step

Every step obeys four rules:

1. **The public surface does not change.** `paint.ts`, `render-model.ts` and
   `tsld-toolbar-items.tsx` remain as barrels re-exporting everything they export today. Consumers
   and their tests are untouched, so the existing suite is a _before/after_ comparison rather than
   a thing being rewritten alongside the code it guards.
2. **A refactor PR changes no behaviour and no test assertion.** Permitted test edits are import
   paths and file moves. If a step needs an assertion changed, the step is wrong — split it.
3. **Where nothing pins the seam, the characterisation test lands in a separate PR _first_** (§5).
   A characterisation test written in the same PR as the move proves the move against itself.
4. **Comments move verbatim.** These files' comments are unusually load-bearing — they record
   defects that shipped (the dead interaction canvas at TsldCanvas.tsx:1071–1083; the band-parity
   month ordinal at paint.ts:909–911; the hatch clamp at paint.ts:1453–1458 that turned 320,000 line
   segments into a bounded count). Rewording them during a move loses the evidence and violates
   CLAUDE.md §5 ("comments explain _why_"). Do not tidy.

### 4.2 The invariant table

| Invariant                                                                                              | How it is proven today                                                                                                                                                                                                                                                           | After the step                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Per-frame cost shape** (ADR-0054/0055/0056 counting-stub gates)                                      | `paint.dates-budget.test.ts`, `paint.band-budget.test.ts`, `paint.grid-budget.test.ts`, `paint.wbs-band-budget.test.ts`, `paint.routing-budget.test.ts` — call `paintScene` with a counting `ctx` and assert `fillRect`/`fillText`/`measureText` **counts** at 2,000 activities. | Unchanged and unmodified. They call `paintScene` through the barrel; extraction must not add or remove a single call. **These are the primary gate for §6 S2–S5.**                                                                        |
| **Byte-for-byte paint identity**                                                                       | `paint.test.ts:846–871` — a `Proxy` recording ctx logging every method call **and property assignment in order**, used as `expect(b.log).toEqual(a.log)` for the flag-off parity cases.                                                                                          | Promoted to a shared helper and used as the whole-scene golden (§5, S1). This is the strongest gate available and it already exists.                                                                                                      |
| **Flag-off parity** (every canvas flag's rollback contract)                                            | The `*-off` suites: `TsldPanel.wbs-band-off`, `TsldPanel.mode-band-off`, `TsldPanel.canvas-nav-off`, `tsld-toolbar-*-off`, `float-paths-flag-off.parity`, plus the in-suite "absent / explicitly undefined / flag-off ⇒ identical log" cases.                                    | Unchanged. A layer extraction that changed a `?? false` into a `?? true` reddens these; that is the point of not touching them.                                                                                                           |
| **ADR-0026 D7 parallel a11y layer**                                                                    | `TsldPanel.a11y.test.tsx`, `TsldPanel.axe.test.tsx`, `render/a11y.test.ts`, the WBS band-on/band-off pair, `e2e-wbs/`.                                                                                                                                                           | Unchanged. §3.6's rule (listbox reads `activities`, never the scene) is the structural half.                                                                                                                                              |
| **Ref-driven rAF paint decoupled from React renders** (ADR-0026 D3/§4 "React draws nothing per frame") | Partly: `TsldCanvas.hidden-pane.test.tsx:87` (loop pauses off-screen), `TsldCanvas.interaction-sizing.test.tsx:93` (sizes on the edit flip), `TsldCanvas.hover.test.tsx` (a repaint per hovered-bar change, not per move). **Nothing asserts the general rule.**                 | **A characterisation test is needed first** (§5, C3): mount, drive N pointer moves, assert the React render count did not increase and `paintScene` was called the expected number of times.                                              |
| **Toolbar taxonomy** (ADR-0031: closed 7-group union, 3 tiers, id uniqueness)                          | `toolbar-registry.test.ts` + `defineToolbar`'s dev-time throw + `tsld-view-toggles.registry.test.ts`.                                                                                                                                                                            | Unchanged; strengthened by a new "each id appears in exactly one `items/*` file" structural test.                                                                                                                                         |
| **Surface scopes / no colour literals** (ADR-0055)                                                     | `styles/token-contrast.test.ts`, `surface-seams.structural.test.ts`, the lint rule rejecting colour literals in `className`/`style`.                                                                                                                                             | Unchanged. The painter takes resolved strings from `palette.ts`; no step introduces a literal.                                                                                                                                            |
| **Coverage ratchets** (ADR-0058)                                                                       | `apps/web/vitest.config.ts`: lines 87 / statements 85 / **functions 81** / branches 79.                                                                                                                                                                                          | **Watch `functions`.** Extraction multiplies the function denominator. Every extracted layer is called on paths the suite exercises, so it should hold — but check the number on each PR, and never lower a threshold to land a refactor. |
| **The export path paints identically**                                                                 | `export/render-export-image.test.ts`, `.wbs-band.test.ts`, `export-image.test.ts` — `paintScene` is injectable there and asserted to run against the off-screen ctx.                                                                                                             | Unchanged, and a second independent consumer of the barrel: if the barrel's shape slips, these redden too.                                                                                                                                |

---

## 5. Where a characterisation test must be written **first**

Three seams have no gate today. Each gets its own PR, before the move it guards, and **each must be
verified red first** — write it, break the thing it describes, watch it fail, restore, commit. That
discipline is the house standard (ADR-0074 M5's CSP gate, ADR-0077 M8's once-only assertion) and it
is the only thing that distinguishes a characterisation test from a test that agrees with whatever
the code currently does.

**C1 — the whole-scene golden log.** _Blocks: S2–S8 (every paint layer step)._
Promote `paint.test.ts`'s `recordingCtx()` proxy to `render/test-support/recording-ctx.ts` and add
`paint.golden.test.ts`: one maximal scene — every toggle on, `visualRefresh`/`timeTrueLinks`/
`linkRouting`/`gridTiers`/`monthBands` on, a selection, a hover, a filter dim, a gesture source, a
baseline ghost, lag handles with an active one, a constrained + conflicted + overlapping +
over-allocated bar, a milestone, an LOE and a WBS summary — painted at three zooms and asserted
against an inline snapshot of the ordered call log. Plus a second scene with every optional field
absent (the flag-off shape). Verified red by, e.g., changing `EMPHASIS_STROKE_W`.
This is the single most valuable artefact in the plan: it converts "did the extraction change the
picture?" from a judgement into a diff. **It is also useful on its own** and should be written even
if the rest of the plan is deferred.

**C2 — the Escape precedence table.** _Blocks: S9 (the canvas keymap)._
A test in `TsldCanvas`'s own suite (or in the new keymap module's) covering the four-way chain: with
a gesture active → cancels the gesture only; with `linkPicking` and no gesture → drops the pick,
calls `onLinkPickStep(null)`, leaves the tool armed; with `loePicking` → falls through to the tool
exit (it is deliberately _not_ caught by the gesture branch — TsldCanvas.tsx:1416–1418 says so);
with a create popover pending → does nothing. The `TsldPanel` suites stay as the integration proof.

**C3 — the React-render-count invariant.** _Blocks: S10 (the rAF loop)._
Assert ADR-0026 D3 directly: mount `TsldCanvas` with a render counter, dispatch 20 `pointermove`
events, and assert the component's render count is unchanged while `paintScene`/
`paintInteractionLayer` were called as expected. There is no test of this today, and it is the rule
the entire frame budget rests on — the one an innocent-looking `useState` in the loop would break
silently.

Two more, cheaper, worth writing with their step rather than before it: a `PaintFrame`-identity test
(the `bounds` walk and the `laneRows` build happen at most once per frame — the current lazy-build
comment at paint.ts:1526–1531 says why), and a `use-tsld-toolbar-context` test that the context
object's key set is unchanged across the split.

---

## 6. The sequence

Every step is one PR, individually mergeable and individually revertible, titled
`refactor(web): …` per CLAUDE.md §9. Ordering rule: **the seams that queued work will touch come
first**, and within that, cheap-and-safe before expensive-and-risky.

> **A caveat, stated rather than glossed (ADR-0076 §19.9).** Items 1–9 of the 2026-08-06 review were
> not supplied to this plan. The "who benefits" column below is mapped to what I could verify — the
> debt register, the deferred ADR milestones and the ADR-0026 §9b reserved escalation. **Before the
> first PR, re-check this ordering against items 1–9**; if an item lands in, say, the toolbar
> controls, S11 moves up. The ordering is a recommendation with a stated basis, not a finding.

| #       | Step                                                                                                                                                       | Effort | Risk     | Gated by                                                                 | Who benefits                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| **S0**  | `render/test-support/recording-ctx.ts` — promote the proxy, no moves                                                                                       | XS     | none     | existing `paint.test.ts` still green                                     | everything downstream                                                                                 |
| **S1**  | **C1** the whole-scene golden log (verified red first)                                                                                                     | M      | none     | itself                                                                   | S2–S8; and any future layer PR gets a diff instead of a review                                        |
| **S2**  | `paint-frame.ts` + `layers/shapes.ts` + `layers/text-measure.ts` — introduce `PaintFrame`, `paintScene` builds it and destructures; **no layer moves yet** | M      | low      | C1 + 5 budget suites                                                     | TECH_DEBT #75 (per-layer measurement becomes possible), #76 (the hoist becomes one line)              |
| **S3**  | Ground layers out: `month-bands`, `non-working`, `gridlines`                                                                                               | S      | low      | C1 + band/grid budget suites                                             | ADR-0056 follow-ups; TECH_DEBT #58 (tiered ruler)                                                     |
| **S4**  | `layers/edges.ts` + `EdgeLayerResult` + `layers/lag-runs.ts`                                                                                               | L      | **med**  | C1 + `paint.routing-budget.test.ts` + `link-routing.test.ts`             | ADR-0065 §5 bundling work; TECH_DEBT #75/#76. **The 200-line layer; do it alone.**                    |
| **S5**  | `layers/bars.ts` + `layers/badges.ts` + `baseline-ghosts`                                                                                                  | M      | low      | C1                                                                       | TECH_DEBT #71 (band bucket shape cue); any new bar cue                                                |
| **S6**  | Text layers: `labels`, `dates`, `link-slack`, `float-tails`, `today`, `selection`                                                                          | M      | low      | C1 + dates budget suite                                                  | ADR-0054 follow-ups                                                                                   |
| **S7**  | Sibling painters out: `paint-interaction`, `paint-resource-strip`, `paint-wbs-band`                                                                        | S      | low      | C1 + `paint.live-feedback.test.ts` + strip/band suites                   | ADR-0049/0063 work; shrinks `paint.ts` to a barrel                                                    |
| **S8**  | `render-model.ts` → `link-routing` / `viewport` / `working-time` / `hit-test` (barrel kept)                                                                | M      | low      | `render-model.test.ts` (1,091 lines) + `link-routing.test.ts` re-pointed | makes `link-routing.test.ts`'s name true; every routing/viewport change after                         |
| **S9**  | **C2** then `interaction/use-canvas-keymap.ts` + `use-wheel-zoom.ts`                                                                                       | S      | low      | C2 + the three `TsldPanel` Escape suites                                 | ADR-0064 follow-ups (TECH_DEBT #76's open pointer-pick gap); the keymap stops needing a foreign suite |
| **S10** | **C3** then `hooks/use-canvas-sizing` + `use-surface-visibility` + `use-ruler-sync` + `use-raf-paint-loop` + `use-scene-ref`                               | L      | **med**  | C3 + `hidden-pane` + `interaction-sizing` + `hover` suites               | ADR-0026 §9b's reserved dirty-region escalation; any new canvas layer; the duplicated scene literal   |
| **S11** | `use-tsld-toolbar-context` → command hooks; **delete the two `react-hooks/refs` disables**                                                                 | M      | low      | 8 context suites + `pnpm lint` (the disables are the test)               | TECH_DEBT #85 by name; every future toolbar command                                                   |
| **S12** | `tsld-toolbar-items.tsx` → `controls/` (then, separately, `items/`)                                                                                        | M      | low      | 13 toolbar suites, unmodified                                            | every new toolbar item (ADR-0031's whole premise)                                                     |
| **S13** | `TsldPanel` → `a11y/ActivityListbox` + `use-listbox-keymap` + the three hook groups                                                                        | XL     | **high** | 20+ `TsldPanel.*` suites + `e2e-wbs` + `e2e-authoring-flow`              | ADR-0059 M5 (Gantt editing) if it ever shares the keymap; every authoring change                      |

Effort key (relative, not calendar): **XS** ≈ an hour; **S** a session; **M** a day with the
suites; **L** more than a day and worth a second reader; **XL** should probably be split again once
S13's first sub-move is done and the shape is known.

**S4, S10 and S13 are the three that can go wrong.** Each is flagged `med`/`high` for a specific
reason, not generally: S4 because the edge layer is the only one with real inter-layer state; S10
because the effect's dependency array (`[editing, selectionAnchorRef, resourceStripActive,
wbsBandHeightPx]`) encodes two subtle re-init requirements documented at 1431–1439 and splitting it
means five arrays that must jointly preserve them; S13 because it is the file the a11y contract
lives in.

---

## 7. Up-front vs lazily (extract-when-touched), and the recommendation

The honest position is that **most of this should be lazy**, and saying so is what makes the up-front
part credible.

**Do up-front (recommended): S0, S1, S2, S8, S11.** Roughly M+M+M+M+M.

- **S0 + S1 (the golden log)** — up-front, unconditionally. It is the tool every later step and
  every future layer needs, it is useful even if nothing else in this plan happens, and it cannot be
  written "when touched" because the thing it characterises is the code before the touch.
- **S2 (`PaintFrame`)** — up-front, because it is the seam every lazy paint extraction plugs into.
  Extract-when-touched without it means each layer invents its own parameter list, and after four
  layers there are four conventions. It is also the enabler for TECH_DEBT #75/#76, which are already
  owed.
- **S8 (`render-model` split)** — up-front, because it is nearly free (a barrel plus moves, pinned by
  1,091 lines of existing test) and because `link-routing.test.ts` is currently telling every reader
  that a module exists which does not. That is a small, live piece of misinformation in the codebase,
  which is exactly the defect class ADR-0058 covers.
- **S11 (toolbar context)** — up-front, because the register already committed to it (#85), because
  two lint suppressions are sitting in the tree waiting on it, and because it has a binary success
  test that costs nothing to check.

**Do lazily (extract-when-touched): S3, S5, S6, S7, S9, S12.**

Once `PaintFrame` exists, a layer costs ~20 lines to lift and the golden log proves it. So the rule
becomes a standing convention rather than a project: **the PR that changes a layer extracts it
first, in its own commit.** This is strictly better than up-front here, because (a) it spreads the
review load onto people who are already reading that layer, (b) it never spends effort on layers
nobody touches, and (c) a lift done by someone with the layer in their head catches things a
mechanical move does not. S12 in particular buys structure but no new proof (§3.4) — it is the
weakest up-front candidate in the plan.

**Do deliberately, when there is a reason: S4, S10, S13.**

- **S4 (edges)** — up-front _if_ items 1–9 or ADR-0065 follow-ups touch routing; otherwise lazy. It
  is the one lazy extraction that is not cheap.
- **S10 (the rAF loop)** — do it when a sixth thing wants to join that effect, or when the
  dirty-region escalation is picked up. Doing it speculatively spends `L` effort and `med` risk on a
  file that is currently working.
- **S13 (`TsldPanel`)** — **not now.** It is `XL`/`high`, it owns the a11y contract, and no queued
  work I can verify requires it. Revisit when a specific change needs it, and split it further then.

**Recommended split, stated plainly:** land **S0, S1, S2, S8, S11** as a small up-front epic (≈ five
PRs), adopt "extract the layer you are changing" as the standing rule for S3/S5/S6/S7/S9/S12, and
defer S4/S10/S13 to a triggering change. That is roughly a third of the mechanical work done
deliberately and two-thirds paid for by the features that benefit.

---

## 8. Repo rules each PR must honour

- **`refactor(web): …`** Conventional Commit titles (CLAUDE.md §9). Never `feat` or `fix` — if a step
  wants either, it is not a refactor.
- **No behaviour change in a refactor PR.** No performance change either, even an obvious one:
  TECH_DEBT #76's hoists are named in §3.1 precisely so they are not taken in passing.
- **No drive-by churn.** Moved code moves byte-identically where the compiler allows. A move that
  also renames a local, reorders a branch or "improves" a comment cannot be reviewed by reading the
  diff, which is the whole value on offer.
- **Comments explain _why_, not _what_** and move verbatim (§4.1 rule 4).
- **No changeset.** These are not user-visible changes (CLAUDE.md §10). If a step produces one, it
  changed behaviour.
- **The pre-push gate is run, not assumed** (CLAUDE.md §19.7): `pnpm lint && pnpm typecheck &&
pnpm test`. `apps/api` is untouched, so the API e2e half does not apply; no flag-on Playwright
  suite changes, so `scripts/e2e-local.sh web:<suite>` is not triggered by these PRs — **except**
  S13, which touches the surfaces `e2e-wbs` and `e2e-authoring-flow` drive, and must run them
  locally.
- **Each PR's description states what moved and what did not**, and names the gate that proves it —
  the ADR-0076 §19.9 rule applied to a refactor: "`paint.golden.test.ts` unchanged and green" is
  evidence; "behaviour is preserved" is not.
- **`pnpm check:counts`** (ADR-0076) re-derives CLAUDE.md's file counts. These steps add files to
  `apps/web/src`, so the banner's "792 web source files" figure moves and the gate will say so.
  Update the banner in the PR that changes the count — that is the gate working, not a nuisance.

---

## 9. Risks and trade-offs

| Risk                                                                                                                                | Mitigation                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A silent paint change** — the failure mode with no symptom until a planner sees a wrong picture                                   | C1's ordered golden log, verified red first. It is a stronger gate than a human reading a 2,000-line diff, which is what shipped every defect ADR-0064 §7 found.                                                                                                                                                    |
| **A refactor that quietly becomes an optimisation** (the `rects` hoist is genuinely tempting and genuinely invisible to every gate) | Named explicitly in §3.1 and §8; the lazy getter makes the tempting version and the correct version syntactically different.                                                                                                                                                                                        |
| **More files to navigate** — 2,200 lines in one file is at least searchable                                                         | The barrels mean the import surface does not fan out at all; discovery is unchanged for consumers. Inside `render/`, the layer names match the `// Layer` comments they replace, so a reader searching "float tails" lands in one place instead of one region of one file.                                          |
| **Coverage `functions` threshold**                                                                                                  | §4.2. Check the number per PR; never lower a threshold to land a refactor (ADR-0058's rule about gates that get deleted rather than fixed).                                                                                                                                                                         |
| **Merge conflicts against in-flight feature work** in the same six files                                                            | Steps are small and independently revertible; sequence them between epics rather than alongside one. If a feature is mid-flight in a file, its step waits — which is what "lazy" means in §7.                                                                                                                       |
| **The plan is followed mechanically past the point of value**                                                                       | §7 exists for this. Two-thirds of the steps are explicitly _not_ scheduled. A decomposition that becomes a project loses to the features it was meant to unblock.                                                                                                                                                   |
| **Doing nothing**                                                                                                                   | The register already shows the cost compounding: two lint suppressions live in the tree because of file size (#85), two measured hoists are unreachable (#76), the draw budget cannot be attributed to a layer (#75), and a test file is named for a module that does not exist. Each is small; the pattern is not. |

---

## 10. Is this ADR-worthy? — yes, narrowly. Draft outline for **ADR-0078**

**Recommendation: write it, and keep it short.** Not because the folder structure needs a decision —
ADR-0026 §8 already made it and this is compliance — but because four things here are genuine,
durable decisions that a future reader will otherwise have to re-derive, and one of them is an
**amendment to an accepted ADR** (CLAUDE.md §21: architectural changes require an ADR).

The cheaper alternative is a `docs/DECISIONS.md` entry plus this plan. That is defensible if the
recommendation in §7 is trimmed to S0/S1/S2 only. It is **not** defensible once `PaintFrame` becomes
the standing contract every future layer author must follow, because a contract nobody recorded is a
convention that decays.

> ### ADR-0078 — Canvas module boundaries: layer painters, a per-frame context, and extraction as a gated move
>
> **Status:** Proposed. **Amends** ADR-0026 §8. **Supersedes** nothing.
>
> **Context.** Six files in `features/tsld` carry 10,500 non-blank lines between them; `paintScene`
> is 808 lines across 14 comment-delimited layers; one `useEffect` fuses five lifecycles; a test
> file imports a module that does not exist. ADR-0026 §8 specified `render/` as _"layer painters
> (grid, bars, edges)"_ — plural — plus `viewport/`, `a11y/` and `hooks/`, none of which were
> created. The drift is not one decision; it is fourteen accepted features (ADR-0033 through
> ADR-0065) each adding correctly to the nearest existing place. Three consequences are already in
> the debt register (#75, #76, #85), one of them a standing instruction not to remove two lint
> suppressions until this refactor happens.
>
> **Decision.**
>
> 1. **`paintScene` decomposes into pure layer painters** under `render/layers/`, each taking one
>    argument: a per-frame **`PaintFrame`** context holding only what is derived once and shared by
>    two or more layers (`byId`, `visibleIds`, `toggles`, `bounds`, and lazily `rects`/`laneRows`).
>    A new canvas layer is a new module plus one call in the orchestrator — not another region of
>    one function. The edge layer's collected lag geometry becomes an **explicit return value**,
>    because it is the one real inter-layer dependency and a closure variable hides it.
> 2. **`render/` is formally recognised as the home of `viewport/`, `a11y/` and `hit-test`**, or
>    those directories are created — §12 Q1 decides which, but the ADR records the answer, because
>    ADR-0026 §8 currently describes a tree that does not exist and a reader trusting it is misled
>    (the ADR-0058 failure).
> 3. **Extraction is a barrel-preserving move.** `paint.ts`, `render-model.ts` and
>    `tsld-toolbar-items.tsx` remain as barrels exporting exactly what they export today, so the
>    30 consuming files and their suites are untouched and act as the before/after comparison. A
>    refactor PR changes no behaviour, no performance characteristic and no test assertion.
> 4. **Where nothing pins a seam, the characterisation test lands first, in its own PR, verified
>    red.** Three are named: the whole-scene ordered golden log, the Escape precedence table, and the
>    ADR-0026 D3 React-render-count invariant — the last of which has **never** been asserted, though
>    the entire frame budget rests on it.
> 5. **Most of the remainder is extract-when-touched, deliberately.** The ADR records the standing
>    rule ("the PR that changes a layer extracts it first, in its own commit") and the explicit
>    deferral of `TsldPanel`, so a later reader can tell a considered deferral from an oversight.
>
> **What this is not.** Not a substrate change. ADR-0026's Canvas-2D decision stands, re-confirmed
> on real hardware in §9b; the §9 WebGL escalation criteria remain the documented, unexercised
> fallback. Not a framework change, not a state-library addition, not dirty-region repainting
> (which stays ADR-0026 §9b's reserved escalation). **The CPM engine is not imported and no
> migration runs**, so the ADR-0034 recalculation parity gate is untouched by construction.
>
> **Consequences.**
> _Positive:_ TECH_DEBT #85 closes with its two suppressions; #76's two hoists become reachable
> one-line changes; #75 gains per-layer attribution; `link-routing.test.ts` stops naming a fiction;
> the Escape keymap and the rAF loop become provable in their own suites rather than through
> `TsldPanel`'s.
> _Negative:_ more files; a coverage-`functions` denominator that grows; merge friction if run
> alongside an epic in the same files; and a real risk that a mechanical follow-through spends effort
> on layers nobody touches — which §7's split exists to prevent and this ADR records rather than
> hides.
>
> **Alternatives considered.** (a) _Do nothing_ — rejected: three register items are already blocked
> on it and the pattern compounds. (b) _One big-bang decomposition_ — rejected: unreviewable, and it
> would land the paint layers, the hooks and the a11y layer in one diff over the file that owns the
> ADR-0026 D7 contract. (c) _Rewrite the painter_ (dirty regions / WebGL / a scene-graph library) —
> rejected: ADR-0026 §9b measured the current substrate passing on real hardware, and a rewrite
> discards the one property (existing suites as the before/after oracle) that makes any of this safe.
> (d) _A spec + `DECISIONS.md` entry instead of an ADR_ — viable only for the trimmed S0/S1/S2 scope;
> rejected for the full scope because `PaintFrame` becomes a contract on every future layer author,
> and it amends an accepted ADR's §8.

If ADR-0078 is written: add the row to `docs/adr/README.md`'s index, add the summary bullet to
CLAUDE.md §16, and add a pointer from `docs/FRONTEND_ARCHITECTURE.md` — in the same PR (CLAUDE.md
§6). Note that 0078 is the next free number as of 2026-08-07 (`docs/adr/` ends at 0077); re-check
before claiming it, since ADR-0071 was once cited by number for a whole epic while absent from the
register.

---

## 11. Implementer checklist

Per PR:

- [ ] Title is `refactor(web): …`; the body names **what moved**, **what did not**, and **which gate proves it**.
- [ ] Diff is a move. No renamed locals, no reordered branches, no reworded comments, no reformatted blocks.
- [ ] Every barrel still exports every symbol it exported before (`git diff` the export list, don't eyeball it).
- [ ] No test assertion changed. Only import paths and file locations.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` run locally and green — **run**, not assumed.
- [ ] Coverage `functions` checked against the 81 floor; if it moved, say why in the PR.
- [ ] The five counting-stub budget suites green and **unmodified**.
- [ ] The `*-off` flag-parity suites green and **unmodified**.
- [ ] No changeset (nothing user-visible). If one felt necessary, stop — the step changed behaviour.
- [ ] `pnpm check:counts` run if the file count moved; CLAUDE.md's banner updated in the same PR.
- [ ] Module-scope caches moved with their single owner, or (for `labelWidths`) to one shared module — never duplicated.
- [ ] For any characterisation test: **verified red first**, and the PR says how.

Before starting at all:

- [ ] Re-check §6's ordering against items 1–9 of the 2026-08-06 review (§6's stated caveat).
- [ ] Confirm no epic is mid-flight in `paint.ts`, `render-model.ts`, `TsldCanvas.tsx`, `TsldPanel.tsx`, `tsld-toolbar-items.tsx` or `use-tsld-toolbar-context.tsx`.
- [ ] Decide §12 Q1 (does `viewport/`/`a11y/` get created, or is `render/` recognised as their home?) — it changes S8 and S13's target paths.

---

## 12. Open questions

**Q1 — Create `viewport/`, `a11y/` and `hooks/`, or formally recognise `render/` as their home?**
ADR-0026 §8 names all three; none exists; `render/` holds all three concerns and does so coherently
(everything in `render/` is pure and framework-free except the two hooks). Creating them is more
faithful to the ADR and more churn; recognising `render/` is less churn and requires amending the
ADR. **My recommendation: create `hooks/` and `a11y/`** (they hold React, which does not belong
beside a pure painter, and `a11y/` gives the ADR-0026 D7 contract a home you can point at), **and
recognise `render/` as the home of viewport and hit-test** (they are pure geometry and every
consumer already imports them from there). This affects S8 and S13's paths and should be settled
before either.

**Q2 — Is `paint.golden.test.ts` an inline snapshot or an explicit expectation?**
A snapshot of a few hundred ordered log lines is easy to write and easy to re-baseline
thoughtlessly — the exact failure mode ADR-0034's golden strategy worries about. An explicit
expectation is laborious. Suggested middle: inline snapshot **plus** a handful of explicit
"structural" assertions (layer ordering by first-occurrence of each layer's signature call; total
call count per method), so a careless `-u` still trips something. Needs a decision before S1.

**Q3 — Does the golden log run at more than one DPR?**
`paintScene` takes `dpr` and calls `setTransform(dpr,0,0,dpr,0,0)`; nothing else in the layer code
reads it. One DPR is probably sufficient and cheaper. Confirm by reading, not by assuming.

**Q4 — Does `TsldPanel`'s decomposition (S13) wait for a triggering change, or for ADR-0059 M5?**
Gantt editing is deferred by design; if it ever shares the activity keymap, S13 becomes a
prerequisite rather than a cleanup. Worth asking the Gantt owner before deferring S13 indefinitely.

**Q5 — Should the toolbar `items/` split (S12's second half) be per ADR-0031 group or per feature
flag?** Per group matches the taxonomy the ADR made compiler-enforced and reads well
(`frame-items.tsx`, `lens-items.tsx`). Per flag matches how items actually arrive and die (a flag
flip touches one file). Groups and flags cut across each other, so this is a real choice.
**Leaning: per group** — the taxonomy is the durable axis and flags are temporary by design.

**Q6 — Is there an appetite for a file-size lint rule** (e.g. warn over 800 lines in
`features/tsld`) so this does not recur? ADR-0058's philosophy says prefer a computed gate to
vigilance; the counter-argument is that line count is a proxy for the thing that actually matters
and a bad rule gets suppressed rather than obeyed (the #85 suppressions are a cautionary example).
**Leaning: no rule** — but say so deliberately, in the ADR, rather than by omission.
