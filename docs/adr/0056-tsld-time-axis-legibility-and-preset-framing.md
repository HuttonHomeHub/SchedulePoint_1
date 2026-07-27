# ADR-0056: TSLD time-axis legibility & preset framing

- **Status:** Proposed — M2–M5 landed behind `VITE_CANVAS_TIME_AXIS` (default off). M6 (header
  centring) is unflagged and independent of this ADR. M7 runs the deferred specialist reviews over
  the combined diff, flips the flag **default-on**, and moves this ADR to Accepted.
- **Date:** 2026-07-27
- **Deciders:** Frontend architecture, UX, Product
- **Related:** ADR-0026 (TSLD canvas rendering — **amended**: viewport preset contract, an
  interpolated Today marker, a ground/non-working distinction), ADR-0031 (toolbar item registry —
  the `View▾` grouping this epic's toggles join), ADR-0054 (canvas live feedback — the cursor date
  chip geometry and hatch-stripe precedent this ADR reuses), ADR-0055 (visual language & token
  architecture — **§4 amended**: month bands gain their own switch). Feature spec:
  `docs/specs/tsld-toolbar-canvas-refinements/`.

## Context

The time axis is the diagram's primary instrument, and it currently misreports itself in four
ways:

1. **A zoom preset is a pixel constant, not a duration.** `ZOOM_STOPS` are raw `pxPerDay` values;
   the same preset frames a different visible range at every canvas width, so "Week" does not
   reliably mean a week.
2. **Three levels of calendar hierarchy draw as one line.** Day, month and year boundaries all
   stroke in the same `gridLine` colour and weight — there is no visual hierarchy to read.
3. **The "Today" marker marks midnight and then freezes.** It draws at the whole-day offset only,
   so it never reflects the actual time of day, and — because nothing re-derives it — a plan left
   open across a midnight boundary keeps showing yesterday's line until something unrelated
   dirties the scene.
4. **The diagram's ground and its non-working days are two greys two points apart.** A weekend and
   a month band differ only by a small lightness delta, not by kind, so the two surfaces are easy
   to confuse at a glance.

Items 1, 2, 4, 8 (toolbar copy/DOM) and 9 (header) are refinements inside existing ADRs and are
tracked in `docs/DECISIONS.md`. Items **3, 5, 6, 7** (the zoom-preset contract, gridline tiers, the
Today marker and ground-vs-non-working) are not: together they change the canvas's viewport
contract, add a token family, and introduce the render path's first timer. That warrants this ADR.

## Decision

Four presentation-layer changes, behind one compile-time flag `VITE_CANVAS_TIME_AXIS`.

### 1 — Range-anchored presets (M2)

A preset declares a **target visible range** (`ZOOM_TARGET_DAYS`), not a scale;
`pxPerDayForPreset(level, width)` derives `pxPerDay` at pick time from the preset and the current
canvas width. `MAX_PX_PER_DAY` rises 60 → 200 so the tightest preset ("Day") can still hold its
contract at ordinary desktop widths. `presetOf`/`isAtPreset` take the canvas width as a
**required** parameter (a compiler-enforced signature change), so the preset a caller reports can
never disagree with the range actually framed. A preset is a **command, not a mode**: resizing the
window after picking one preserves the chosen scale rather than re-deriving it.

This amends ADR-0026's viewport model, which treated a zoom level as a fixed `pxPerDay` constant.

### 2 — Gridline tiers (M3)

The single batched `gridLine` stroke splits into three tiers — day, month, year — each with its
own colour token (`--canvas-grid-day`/`-month`/`-year`) and, for year, a heavier `lineWidth` (2 vs
1), drawn in day → month → year order so a coarser boundary wins at a coincident x. Two
independent cues (weight and colour) carry the hierarchy — never dash, since the dash channel is
already spoken for by the Today line (§3) and the ADR-0054 cursor guideline.

### 3 — A fractional, self-refreshing Today marker (M4)

An optional `todayFraction` scene field (`todayDayFraction`, the viewer-local time-of-day as a
0…1 fraction) interpolates the dashed Today line to the actual time of day instead of snapping to
the midnight boundary; absent, the line draws at the plain integer offset, which is what keeps the
flag-off parity claim structural rather than a promise.

A `useNow(60_000)` hook re-derives the marker every 60 seconds while the tab is **visible**,
pausing entirely while hidden and re-syncing immediately on `visibilitychange`. This is the
render path's first timer, justified as the only honest alternative to a marker that is silently
wrong for up to a day; it also repairs the pre-existing defect where a plan left open across
midnight kept showing yesterday's line. At the shipped 60 s step and `MAX_PX_PER_DAY = 200`, one
minute is 0.14 px — the marker is never visibly stale, at a duty cycle far below the ADR-0026
≤4 ms p95 draw budget.

A `Today` pill mirrors the ADR-0054 cursor date chip's geometry in the Today hue (a paired
`todayInk` token), offset 4 px below the cursor chip's own footprint so a drag's cursor chip and
the Today pill can never collide — even though the two live on separate canvases (interaction vs
base layer).

### 4 — Ground vs. non-working by kind (M5)

Non-working (weekend/holiday) columns gain a diagonal-stripe hatch via a **`CanvasPattern`** built
once per palette resolution from a small offscreen tile — O(1) per column, so the `fillRect` count
is unchanged from today's flat-fill pass. The stripe reuses the ADR-0054 float-tail hatch's 6 px
rhythm (`TAIL_HATCH_STEP`), so the canvas speaks one hatch language, not two. A guarded fallback
(`document.createElement('canvas').getContext('2d')` returning null) keeps every existing painter
unit suite on the deterministic flat-fill path.

The alternating month-band ground gains its own `View▾ → Structure → Month bands` switch,
**amending ADR-0055 §4** (which gave the bands no user control): `VITE_CANVAS_VISUAL_LANGUAGE`
remains the gate deciding whether the layer exists at all and its default-on value; the new switch
only lets a user turn the ground off for the session. Banding still does not follow the `Month
grid` line toggle — a surface and a line are different layers. The flag is read once, in
`TsldCanvas` (where every other flag composition already lives), so the pure painter module never
imports `@/config/env`.

## Rejected

- **Dashed gridline tiers** instead of colour+weight — rasterisation cost, and it collides with
  the two dash languages already in use (Today line, cursor guideline).
- **Per-line hatching** for the non-working wash instead of a `CanvasPattern` — measured at
  ~38,000 segments per frame at the existing draw threshold, an order of magnitude past budget.
- **Re-deriving the preset scale on resize** — would rescale the diagram out from under a user
  mid-read; a preset is a one-time command, not a live constraint.
- **Documenting the Today marker's staleness instead of fixing it** — would make the fractional
  interpolation this ADR adds pointless, since the marker would still freeze at whatever instant
  the plan happened to mount.

## Consequences

**Positive.** Every change is frontend-only: no endpoint, DTO, schema, or engine change, so the
ADR-0034 recalculation parity gate is structurally untouched. Flag-off (`VITE_CANVAS_TIME_AXIS`
default) paints byte-for-byte today's surface, pinned by counting-stub budget suites per layer.

**Negative / risks.**

- **A timer on the render path.** `useNow` is the first one; it is bounded (one repaint per 60s
  per visible, non-hidden plan) and pauses while the tab is hidden, but it is a new category of
  cost the canvas didn't previously carry.
- **A required-parameter signature change** (`presetOf`/`isAtPreset` now take `width`) — every call
  site had to be updated in the same change; the compiler enforced completeness.
- **Four new canvas tokens** across the three theme blocks (`:root`, `.dark`, `.corporate`) plus
  the `@theme inline` mapping: `--canvas-grid-day`/`-month`/`-year`, `--canvas-nonworking-hatch`
  (`todayInk` reuses the existing `--color-destructive-foreground`).

**Neutral.** The Month-bands toggle is one more entry in the `View▾` registry (ADR-0031) and its
drift-guard test.

## Alternatives considered

- **A single `pxPerDay` zoom level with no named presets** — rejected before this ADR; presets are
  the reference behaviour and the fix is to make them honest, not to remove them.
- **A single flag per item** (five flags for one review cycle) — rejected in favour of one flag
  over the four canvas/viewport items, so the rollback is one env var and the parity gate is
  structural; the four DOM/copy items and the header ship unflagged, matching the prior toolbar
  polish pass.
- **A new ADR per item** — rejected; the four decisions change one coherent contract (the time
  axis) and are easier to review, amend, and eventually supersede together.
