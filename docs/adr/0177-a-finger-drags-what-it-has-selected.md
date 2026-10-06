# ADR-0177: A finger drags what it has selected

- **Status:** Proposed (D1–D3 landed with M1; D4 is written at M2's close, and the ADR is Accepted
  then)
- **Date:** 2026-10-06
- **Deciders:** James Ewbank (product owner — approved 2026-10-05: both postures, select then
  drag), with Claude Code
- **Amends:** ADR-0095 (the bar gesture contract: a bar's body and edges are no longer armed for
  every pointer by default) and ADR-0118 D1 (its exception list gains the Gantt's entries, at D4)
- **Builds on:** ADR-0059, ADR-0082, ADR-0088 D1 (no flag), ADR-0111, ADR-0113, ADR-0118 D7,
  ADR-0128 D4, ADR-0170 D6
- **Spec:** [`docs/specs/gantt-coarse-pointer/`](../specs/gantt-coarse-pointer/feature-spec.md);
  measurement in [`m0-measurement.md`](../specs/gantt-coarse-pointer/m0-measurement.md), against
  predictions committed before the first run in
  [`m0-falsification.md`](../specs/gantt-coarse-pointer/m0-falsification.md)

**Terms.** "Stylus" is the input device. "Pen" means only the ADR-0028 edit lock.

## Context

The product owner works on a Surface Pro by finger and stylus, and the Gantt is a working surface
whose every gesture was designed with a mouse. M0 measured it (container Chromium, CDP touch — an
emulation, not the device):

- **A finger cannot move a bar, selected or not.** The body carries no `touch-action`, so the browser
  claims the drag as a pan and sends `pointercancel`: 12 of 12 touch drags cancelled, for the
  unselected bar and for the selected one. Selecting changes nothing for touch today (P1).
- **A finger on the end of any bar resizes it instead of scrolling.** The edge handles carry
  `touch-none` whatever the selection. A touch drag on an unselected bar's finish edge wrote in 11 of
  12 runs (P2b) — an accidental-write path that exists today.
- **There is no touch route to a row's actions except the 28 × 28 `⋯`** (P3), and no `contextmenu`
  handler anywhere under `features/gantt` (P8). Indent, Outdent and Insert exist only in that menu.
- **The Surface reports `pointer: fine` with the keyboard cover attached** (ADR-0118 D7), so any remedy
  keyed on `@media (pointer: coarse)` reaches nobody in that posture.

## Decision

### D1 — Gesture remedies are posture-independent

A remedy for a **gesture** keys on the input event (`pointerType`), on `touch-action`, or on
`contextmenu` — never on `pointer-coarse:`. A remedy for **geometry** (the size of a target) keys on
the media query, as ADR-0118 D2 decided. The reason is ADR-0118 D7: the posture a planner works in is
not the media query's to say. A structural test pins that no gesture class in the Gantt sits behind a
`pointer-coarse:` variant.

### D2 — On touch and stylus, a bar's body and both edges respond only once the bar is selected

`useBarPointerDrag` takes `touchArmed` (the bar is selected). A `touch` or `pen` press on an unarmed
bar **returns first** — before the `enabled` / refusal branch, and without `preventDefault` — so the
browser scrolls and the trailing click selects. It is a separate input from `enabled` on purpose:
flipping `enabled` would route an unarmed stylus into the refusal path and announce a refusal nobody
attempted. A mouse is never gated: a mouse press is unambiguous and unchanged.

On the selected bar the body carries `touch-action: pan-y` (only when it can move) and each edge
`touch-none`; unselected, the edges carry no rule. A selected, movable bar shows an **armed state** —
an offset outline and grip marks, shapes rather than colour alone (WCAG 1.4.1).

Selection-time facts are said where a finger can read them. A refused bar's reason, or — once per
session — the hint "Drag to move, or press and hold for actions", appears in a visible
`role="status"` line outside the scroller, when the selection came from a finger or stylus. The reason
used to live in a `title` on an `aria-hidden` span. These are not the after-the-write announcements
ADR-0170 D6 governs.

**The cost.** `pan-y` excludes pinch-zoom for a gesture that starts on the selected bar. Everywhere
else pinch-zoom is unaffected.

**Stylus is gated like touch**, by default. M0 could not take a stylus reading (the harness is touch
only), and the spec's stated default is to gate both until the device shows a stylus drag already
moves a bar. Narrowing the gate to touch alone is a one-line change to the hook's condition.

### D3 — `contextmenu` opens a grid row's menu

A press-and-hold, the stylus barrel button, a right-click and the Menu key / Shift+F10 all arrive as
`contextmenu` and open the row's menu — the menu the `⋯` opens, from the same thunk, with the same
items, shading and accessible name (`Actions for <activity>`), at the press point. `GanttRowMenu`
gains one optional ref handle (`openAt(point, restoreTo)`) and nothing else, so no per-row state is
lifted. In order: the event is left alone when it is not ours (the menu's own items, an open cell
input, Shift+right-click); ignored when a drag has begun (past `DRAG_INTENT_PX`, the one threshold the
refusal path also uses); then every live drag is cancelled so no ghost or capture-phase Escape
listener survives; then the menu opens. A keyboard-origin event anchors to the row. Focus returns to
the row on close. **The selection is unchanged**, including by the `click` a touch hold may end in,
which the row swallows once. Bucket rows and hosts without a menu context keep the browser's menu.

This is the large-target equivalent ADR-0118 D1 asks of `docs/TECH_DEBT.md` #215's Gantt half.

**Native `contextmenu` first.** Whether Windows fires `contextmenu` on a touch hold, and whether on
hold or on release, is the device's answer (M0 P8: no event in emulation, because CDP does not
synthesise the OS long-press). No `useLongPress` primitive is built on speculation; it is extracted
only if the device shows no `contextmenu` on a hold.

### D4 — Exception lists

Written at M2's close, each entry with its equivalent and each matching a sweep exemption: the
fine-pointer §2.5.8 equivalent exceptions (the 8 × 14 edge handles and 14 px bar body, whose
equivalents are the typed `Start` / `Finish` / `Duration` cells, F2 and row menu → `Edit`), and the
coarse-pointer entries below 44 px.

## Consequences

- **Right-click on a Gantt row changes for mouse users.** It opens the row's actions;
  Shift+right-click keeps the browser's menu. Stated in the changeset and `docs/UX_STANDARDS.md`.
- **A finger on an unselected bar now scrolls**, where it used to write on an edge and cancel on the
  body.
- **Touch quick-edit stays slower than a mouse, and that gap is open.** A double tap on a cell
  synthesised `dblclick` in emulation (P9, INDETERMINATE — emulation is not a Surface). If it does not
  on the device, touch's route to a duration is hold → `Edit` → the activity editor, which is correct
  and slower. It is recorded as unresolved rather than closed by declaring an equivalent.
- **The TSLD canvas differs, deliberately.** It is `touch-none` throughout and owns every gesture
  (P16); the Gantt is a DOM scroller with one bar per row. This ADR does not change the canvas.
- **Recalculation is untouched**: no scheduling input changes and `computeSchedule` is not imported
  from `features/gantt`.
- **Owed from the device**, listed in the M1 record: finger and stylus on a bar in both postures, the
  hold's `contextmenu` timing, and the keyboard-fired `contextmenu` and focus restore (ADR-0111).
