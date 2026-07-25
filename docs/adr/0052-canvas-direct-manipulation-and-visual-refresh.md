# ADR-0052: TSLD direct manipulation & canvas visual refresh

- **Status:** Accepted
- **Date:** 2026-07-22
- **Deciders:** Frontend architecture, UX, Product
- **Related:** ADR-0021 (dependency DAG), ADR-0022 (CPM execution), ADR-0023
  (date convention), ADR-0026 (TSLD canvas rendering — amended), ADR-0028 (plan
  edit-lock / pen), ADR-0032 (canvas-first authoring — amended), ADR-0033
  (scheduling modes — amended), ADR-0036 (hour-granular calendars, §6 lag
  calendar), ADR-0048 (undo/redo command stack). Feature spec:
  `docs/specs/canvas-direct-manipulation/`.

## Context

The TSLD canvas can create, reposition, relane, link (two-click) and hand-place
activities (ADR-0026/0032/0033), but two direct-manipulation gestures GPM
planners expect from tools like NetPoint are missing, and the link drawing is
functional-but-plain:

1. **Duration cannot be changed on the canvas** — only in the activity dialog.
2. **Lag cannot be seen or changed on the canvas** — links spring from the
   bars' extreme ends, so an `SS+3` tie draws exactly like an `SS+0`; the
   diagram is not fully _time-true_, a stated TSLD goal.
3. **The bar-end grab-zones are overloaded.** ADR-0026 D5 armed a _link_
   rubber-band on them; ADR-0032 M5 already moved link creation to the
   two-click `link` tool (edge-drag suppressed under authoring), leaving the
   bar ends without a purpose in `select` mode.
4. **The whole diagram aesthetic (bars + links) trails NetPoint** — flat
   rectangles, 1–2px elbowed polylines, no arrowheads.

The forces: the CPM engine, the API and the recalc **parity gate** must stay
untouched (every prior canvas feature has preserved this); all drawing must
stay inside the Canvas-2D layered/culled architecture and the **≤ 4 ms p95 @
2,000 activities** draw budget (ADR-0026); the render model must stay pure (no
CPM/calendar arithmetic — ADR-0023/0024 keep that server-side); and no
one-off colour, ever (ADR-0006 tokens via `TsldPalette`).

## Decision

Deliver **canvas direct manipulation + a full visual refresh of bars and
links** as a **frontend-only** feature composed on the existing REST mutations
(`PATCH /activities/:id`, `PATCH /dependencies/:id`) + the ADR-0032 coalesced
auto-recalc + the ADR-0048 undo stack — **no engine, API or DB change**, so the
recalc parity gate is **structurally untouched**. Everything ships behind one
flag, **`VITE_CANVAS_DIRECT_MANIPULATION` (default OFF)**; flag-off paints
byte-for-byte today's canvas (a parity paint test per milestone).

### 1. Edge-handle repurpose (amends ADR-0032 M5, ADR-0026 D5)

In `select` mode the bar-end grab-zones become **duration-resize handles**
(finish edge = change duration; start edge = move start + change duration,
keep finish). Link creation **stays** the ADR-0032 two-click `link` tool-mode —
the tool freed the bar ends, and bar-end = resize matches NetPoint/MS-Project
muscle memory. The legacy edge-drag-link (still live when authoring is off) is
gated off under this flag.

### 2. Time-true GPM lag anchoring (amends ADR-0026's edge-endpoint routing)

Each dependency end anchors at the point in time it actually constrains, so
lag/lead reads as horizontal offset. The offset is `lagDays` **walked on the
relationship's lag calendar** (ADR-0036 §6): the plan working-day calendar for
`PROJECT_DEFAULT`/`PREDECESSOR`/`SUCCESSOR` today, **elapsed** calendar days
for `TWENTY_FOUR_HOUR` — the picture always means what the engine means. The
per-type convention (documented golden behaviour, `lagAnchorPoints`):

- **Zero lag** keeps today's constrained-edge endpoints exactly — the common
  `FS+0` looks unchanged.
- **FS/FF** — the lag runs forward from the predecessor's **finish**, so the
  **successor** anchor marks the constrained point (`pred finish + lag`; FS
  constrains a start, FF a finish).
- **SS/SF** — the lag **embeds along the predecessor bar from its start** (the
  GPM embed point): an `SS+3` tie departs three working days into the
  predecessor.
- A **lead** (negative lag) walks left; a walked anchor is **clamped to its
  bar's span** so it always sits on the bar, even for a lag past the bar's
  extent.

The walk is a **pure, injected** `DayWalk` (`makeWorkingDayWalk` over the same
working-day predicate the non-working wash reads) — the render model still
does no CPM. It is **memoised** and **horizon-bounded** (`WALK_HORIZON_DAYS`,
the `snapToWorkingDay` contract: a pathological calendar falls back to the
elapsed result, never hangs), keeping the per-frame cost O(visible edges).
Null computed dates fall back to the legacy extreme-end routing. The a11y
layer speaks the same offset (`lagPhrase`: "SS + 3 working days").

### 3. Start-edge resize semantics (amends ADR-0033)

A start-edge drag means "move start + change duration, keep the finish". Its
mode-aware expression: **EARLY** → `PATCH {constraintType: SNET,
constraintDate, durationDays}` (the start is computed, so the intent is pinned
as an SNET); **VISUAL** → `PATCH {visualStart, durationDays}` (ADR-0033's
advisory placement). Suppressed under the read-only Late overlay, like every
edit gesture. Duration clamps at ≥ 1 working day; milestones/LOE/WBS summaries
(duration-derived) offer no handles.

### 4. Visual refresh scope — bars + links, inside the Canvas-2D budget

The refresh covers the **whole diagram**: activity bars (shape/rounding,
progress fill, criticality emphasis, milestone/LOE/summary glyphs,
selection/hover/drag states, labels, restyled-but-preserved badges) and logic
links (arrowheads, routing/elbows, crowding fan-out, hover/selection
highlight). Constraints: **token-resolved `TsldPalette` only** (theme-aware,
lens-consistent — composes with `barFill`/`barInk` and the legend); every
**non-colour cue is retained** (driving weight/dash, criticality outline,
badge shapes — WCAG 1.4.1); cheap primitives only (no per-bar shadow/blur —
elevation is stroke-approximated); every render-polish task is gated on the
**≤ 4 ms p95 @ 2,000 activities** benchmark.

### 5. Milestones

- **M1 (this ADR's landed slice)** — time-true anchors + arrowheads +
  retained emphasis. **Render-only**: no gestures, no writes; visible to every
  role (Viewer/External Guest included) when the flag is on.
- **M2** — finish-edge duration resize (gesture + write + coalesced undo +
  `Shift+←/→` keyboard nudge).
- **M3** — start-edge resize (mode-aware, §3) + lag-anchor drag (the inverse
  of §2's mapping, shared helper + round-trip tests).
- **M4** — visual refresh: activity bars.
- **M5** — visual refresh: logic links (fan-out, hover/selection highlight).

Gestures (M2/M3) stay pen + `canEdit` + non-Late-overlay gated (ADR-0028/0033);
rendering milestones (M1/M4/M5) apply to read-only roles too.

## Alternatives considered

- **A backend "resize"/"set-lag" endpoint.** Rejected: the existing PATCH
  DTOs already accept the fields; new surface would duplicate validation and
  risk the parity gate.
- **Keep edge-handle = link; add a separate resize grip.** Rejected: clutters
  short bars, worsens target-size crowding, fights muscle memory; the
  two-click link tool already owns linking.
- **Server-computed anchor positions.** Rejected: anchor placement is pure
  client geometry; round-trips would kill interactivity and violate the
  ADR-0026 client-render model.
- **Always-working-day anchor display (ignore the lag calendar).** Rejected:
  the picture would contradict the engine's meaning for `TWENTY_FOUR_HOUR`
  lags (ADR-0036 §6) — the anchor walks the lag's own calendar.
- **Curved/bezier links.** Deferred to an M5 evaluation behind the same flag;
  orthogonal + rounded elbows + arrowheads is predictable, cheap, testable.
- **DOM/SVG bars or per-bar shadows for the refresh.** Rejected: blows the
  ≤ 4 ms budget; the refresh stays Canvas-2D rectangles/lines/text.
- **A separate flag for the visual refresh.** Rejected: one flag keeps
  flag-off a single byte-for-byte parity gate.

## Consequences

- **Positive:** the canvas becomes a genuinely time-true TSLD (lag visible as
  offset, direction visible as an arrowhead) and, by M3, a primary editing
  surface (duration + lag at the speed of thought); zero engine/API/DB risk —
  the parity gate holds by construction; read-only roles get the render wins
  free.
- **Negative / accepted:** more client geometry + painter complexity inside a
  tight draw budget (mitigated: memoised bounded walks, batched arrowhead
  fills, O(visible) passes, benchmark gates); the edge-handle repurpose is a
  learned-gesture change (mitigated: the two-click link tool already exists
  and the handles are advertised on selection); a clamped anchor on a
  too-short bar trades exact time-proportionality for staying on the bar.
- **Follow-ups:** M2–M5 as sliced above; curved-link evaluation; multi-select
  resize.

## References

- Feature spec + plan: `docs/specs/canvas-direct-manipulation/`.
- Amends: ADR-0026 (edge-endpoint routing, hit-zones, a11y strings, paint),
  ADR-0032 (M5 interaction model), ADR-0033 (start-edge semantics).
- Builds on: ADR-0021/0022/0023/0028/0036/0048.
- M1 implementation: `apps/web/src/features/tsld/render/render-model.ts`
  (`makeWorkingDayWalk`, `lagAnchorPoints`, `dependencyPolylineTimeTrue`,
  `arrowhead`), `render/paint.ts` (`TsldScene.timeTrueLinks`),
  `render/a11y.ts` (`lagPhrase`), `config/env.ts`
  (`CANVAS_DIRECT_MANIPULATION_ENABLED`).
- M2 implementation (finish-edge duration resize): `render-model.ts`
  (`resizeStart`/`resizeFinish` zones, `isResizeEligibleType`),
  `interaction/gesture-machine.ts` (`resizing` state, `resize` intent),
  `interaction/use-coalesced-duration-nudge.ts` (`Shift+←/→`),
  `render/paint.ts` (`InteractionOverlay.resize` ghost + label),
  `components/layout/workspace/use-plan-workspace-model.ts` (`onTsldResize`),
  `features/undo-redo/commands.ts` (`durationResizeCommand`, key
  `resize:{activityId}`).
- M3 implementation (start-edge resize + lag-anchor drag): `render-model.ts`
  (`lagAnchorDay` — the ONE forward mapping shared with `lagAnchorPoints` —
  its exact inverse `lagFromAnchorDay` with round-trip property tests, and the
  `lagAnchor` hit zone carrying `dependencyId`; offset anchors only — a
  zero-lag anchor sits on the constrained edge and must not steal the resize
  handles); `interaction/gesture-machine.ts` (`resizing.edge: 'start'` —
  finish-pinned, clamp ≥ 1 day — and the `lagDragging` state whose tentative
  lag runs the inverse mapping on the edge's lag-calendar walk; `lag` intent);
  `render/paint.ts` (`InteractionOverlay.lag` readout chip, `SS + 3d`);
  `components/TsldCanvas.tsx` (`liveResize` start-date label, `liveLag`,
  `lagGrabOf`); `use-plan-workspace-model.ts` (`onTsldResize` start branch —
  EARLY: ONE combined `{SNET, constraintDate, durationDays}` full-definition
  PATCH (spike-verified against `UpdateActivityDto`); VISUAL:
  `{visualStart, durationDays}` through the extended `setVisualStart` seam —
  and `onTsldLag` over `useUpdateDependency`); `features/undo-redo/commands.ts`
  (`visualResizeCommand` sharing the `resize:{activityId}` key,
  `lagDragCommand`, key `lag:{dependencyId}`);
  `interaction/use-coalesced-lag-nudge.ts` + the Logic panel's dependency rows
  (`DependencyEditor.onNudgeLag`, `Shift+←/→`) — the app's per-dependency
  keyboard surface, since the canvas listbox lists activities.
