# Minimap spec input — accessibility (WCAG 2.2 AA, 2026-08-20)

> Verbatim report from the accessibility-reviewer agent, gathered BEFORE the spec was drafted.
> Verdict: **pass-with-conditions at design stage** — items 1–9 under "Hard requirements" are
> acceptance criteria for the spec, not deferred review findings.

## Corrections to the brief before answering

- **"Both themes" is stale.** `apps/web/src/test/css-blocks.ts:69` — `THEME_SELECTORS = [':root']`
  — ADR-0097 collapsed to one theme. Contrast needs checking once, but **across surface scopes**:
  `token-contrast.test.ts:19-20` defines `Scope = 'page' | 'chrome' | 'panel' | 'brand' | 'auth' |
'canvas'`, and `canvas` is a real scope with pairs already gated. The minimap inherits it.
- **"Every viewport state is already keyboard-reachable" is not quite true** — see Q2.

## 1. Role and name

`role="scrollbar"` and two `role="slider"`s are ARIA's single-axis single-value widgets; this
viewport is genuinely 2D (`render/geometry.ts:329-332`) plus zoom — either role's contract lies.
`role="application"` suppresses the AT virtual cursor for the subtree; grep confirms it appears
NOWHERE in `apps/web/src`, and every hand-rolled complex widget here (Menu, Combobox, Toolbar,
tree, PanelResizer) is semantic HTML + explicit roles, never `application` (CLAUDE.md §12).

**Recommendation:** no value-bearing role. `<div role="group" aria-label="Diagram overview"
tabIndex={0}>` containing an `aria-hidden="true"` preview canvas — matching every other canvas
layer (`TsldCanvas.tsx:610`, `:1659`, `:1684`, `:2023`, all `aria-hidden`, all covered by the
parallel listbox) — with the Q2 keyboard contract driven by the SAME pure `pan`/`panToDate`/
`zoomAt` functions the pointer path uses (`render/viewport.ts:69-99`); never a second
implementation (ADR-0065 / ADR-0079 one-function rule). Discrete state announcements are one-shot
sentences (e.g. "Viewing 12 Jan – 3 Feb, lanes 1–14 of 62."), not a live `aria-valuetext`.

## 2. Keyboard — the gap, established by reading the handlers

- Bare arrows/Home/End on the listbox move the SELECTION cursor (`TsldPanel.tsx:1869-1878, 1894`);
  panning is a separate reveal effect keyed on `selectedId` (`TsldCanvas.tsx:1050-1093`, citing
  2.4.7/2.4.11).
- `Alt+Arrow` and `Shift+←/→` are claimed by activity editing (`TsldPanel.tsx:1818-1848`).
- `setZoomPreset`/`stepZoom`/`goToDate`/`zoomToSelection` are toolbar buttons
  (`use-viewport-commands.ts:38-83`); `goToDate`/`zoomToSelection` announce.

**The gap: every keyboard route to a viewport position is ANCHORED** — to an activity, a match, a
conflict, or a typed date. There is NO keyboard command that pans to an arbitrary unanchored point
the way empty-ground drag (`TsldCanvas.tsx:1890-1898`) and wheel-zoom (`:1454-1467`) do.

Is a pointer-only minimap drag defensible under 2.1.1? Letter: arguably (unanchored pan is already
pointer-only). **Spirit and this repo's practice: no** — ADR-0064/0079/0080 all shipped keyboard
parity beside every pointer gesture, and the minimap's headline value is on exactly the plans
where a keyboard-only user needs it most.

**Minimal keyboard contract** (modelled on `panel-resizer.tsx:41-49, 116-144, 172-180`):

- `Tab` focuses the minimap group.
- `Arrow←/→` pan by one page of days, `Arrow↑/↓` by one page of lanes — reusing `pan()`
  (`viewport.ts:81-83`) verbatim. No collision: distinct DOM node from the listbox.
- `Home`/`End` jump to the plan's first/last dated day.
- Every keypress calls the identical pure functions the drag handler calls.

## 3. Tiny marks and 1.4.11

`token-contrast.test.ts:225-283`: canvas marks are checked against BOTH grounds (`PLOT_GROUNDS`:
`--canvas` and `--canvas-band`), with a documented reported-not-asserted exemption for
texture/redundant marks (`--canvas-grid-day`, hatch).

- Bars as decorative/aggregate texture → exempt (recommended reading).
- Bars encoding state (critical/selected) → inherit the existing `CRITICALITY_PAIRS` gate; reuse
  the existing canvas tokens, do not invent unvalidated ones.
- **MUST clear 3:1 regardless: the viewport-rectangle frame** — the "boundary of a UI component"
  case 1.4.11 names. Its own token (e.g. `--canvas-minimap-frame`) checked against both grounds,
  `it.each(PLOT_GROUNDS)` exactly. A floating container's edge needs the same two-ground check.

## 4. The a11y-layer invariant (ADR-0063)

The listbox is built from `activities`, never from what the canvas paints (`a11y.ts:8-11`); the
shipped test asserts SET EQUALITY across the band toggle (`TsldPanel.wbs-band.test.tsx:86-99`).
The minimap risks this only if an implementer mirrors activities into minimap-scoped DOM — the
exact draft ADR-0063 rejected. The spec must say so and add the set-equality structural test
(set-equality form, not count-only — the count is the weaker check).

## 5. Announcements

Verified pattern: continuous pointer gestures announce nothing (drag `:1890-1898`, wheel
`:1454-1467`); discrete jumps announce once (`goToDate` → "Jumped to {date}."
`use-viewport-commands.ts:57-63`; `zoomToSelection` `:70-80`; search-jump
`use-search-navigation.ts:105`); `PlanStatusBar` deliberately silent (§A14 — several facts on one
clear-then-set region drop messages).

- Minimap drag: no per-frame announcement.
- Click-to-jump / keyboard commit: one announcement on release ("Viewing {range}, lanes {n}–{m}.").
- Held arrow-nudge: COALESCE (the `useCoalescedNudge` pattern, `TsldPanel.tsx:1606-1619`) — one
  net announcement per burst.

## 6. Focus

The most load-bearing precedent, already written in `app-shell.tsx:181-205` (focus dropped from an
unmounting subtree to `<body>` — "shipped three times", and widening the search finds at least
five: ADR-0060 M6, ADR-0063 M6, ADR-0064 §7, ADR-0096, ADR-0099 M10 — the most repeated named a11y
regression in this codebase).

**The rule the spec carries:** before an element holding focus is unmounted or hidden, focus moves
synchronously — same handler/commit, never the browser's fallback — to a specific still-mounted
anchor that survives the transition and is ABOUT the thing that went away. For the minimap: **the
Minimap toggle control**, mirroring `focusRailButton`. Holds for close control, keyboard toggle,
and responsive collapse. If the dock/portal infra is reused: clear the outlet **by node identity**,
not `isConnected` (React runs ref cleanup before detach — found the hard way in ADR-0092).

## Hard requirements for the spec (blocking if missed)

1. No `role="scrollbar"`/`slider`/`application`. `role="group"` + `aria-label`; the rectangle is a
   plain custom control.
2. **Keyboard-operable, not a redundant pointer enhancement** — arrow page-pan + Home/End via the
   same pure functions. Justify against 2.1.1 explicitly; the existing routes do NOT fully cover it.
3. The viewport-rectangle frame is a 1.4.11 UI-component boundary — own token, both grounds, in
   `token-contrast.test.ts` BEFORE the CSS.
4. **No second per-activity DOM list** (ADR-0063 rejection). Set-equality structural test.
5. Discrete jumps announce once; drags/held nudges coalesce; nothing per-frame.
6. Toggling off while focus is inside moves focus synchronously to the toggle control — with a
   regression test; "we'll be careful" is not credible against this repo's history.
7. Any new close/toggle affordance meets the house 44×44 target (`docs/UX_STANDARDS.md:137`);
   do not inherit TECH_DEBT #127's 36px shortfall into a new feature.
8. Any e2e a11y scan covering the minimap must opt in `wcag22aa` + `target-size: {enabled: true}`
   (mirror `e2e-toolbar-fit/fit.spec.ts:708-739`); every existing suite scans only wcag2a/wcag2aa
   and axe ships target-size disabled — "the scan is green" is otherwise meaningless (ADR-0090 M1).
9. Reduced motion handled in JS: the global CSS rule (`globals.css:1106-1116`) cannot reach a
   JS-driven canvas repaint. Any fly-to tween gates behind `matchMedia('(prefers-reduced-motion:
reduce)')` (`use-media-query.ts` exists) or defaults to an instant jump.

## Reasoned from specification, not observed — verify before Accepted

- **`zoomToSelection`'s vertical framing appears incomplete**: `fitToContent` computes `maxLane`
  but never uses it — `originY` is hardcoded to `paddingPx` (`viewport.ts:152-180`), and the
  reveal effect re-runs only when `selectedId` CHANGES, not on a re-press
  (`TsldCanvas.tsx:1012-1041`). If confirmed live, "zoom to selection" does not reliably reveal an
  activity in lane 60 of an 80-lane plan — a pre-existing gap the spec must not lean on, and worth
  a Playwright probe.
- Real-AT behaviour of `role="group"` + coalesced announcements (NVDA/JAWS/VoiceOver untested).
- Whether a sighted low-vision keyboard user gets adequate visual feedback from coalesced
  arrow-pan (the frame moving) — hands-on check, not a code read.
