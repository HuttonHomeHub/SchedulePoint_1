# M1 — Build record

Evidence for [`implementation-plan.md`](implementation-plan.md) M1 (M1-T1, M1-T2, M1-T3). What was
built, what was defaulted because the device answers are not in, and what is owed to the device and
to the ADR-0111 pass. M2 is not started.

## Defaults applied

The product owner's device answers (the [`device-checklist.md`](device-checklist.md) items and the
stylus pass) were **not in** when M1 was built. Each point below is therefore the spec's stated
default, and each is revisited when the answer arrives:

| Point                               | Default applied                                                                                          | Revisit when                                                                                | What changes                                                                      |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Stylus gating (M1-T1's stylus exit) | The stylus is gated like touch: an unselected bar scrolls under a `pen` press as it does under a `touch` | The stylus pass shows a stylus drag already moves a bar in both postures                    | Drop `'pen'` from the early return in `use-bar-pointer-drag.ts`; ADR-0177 D2 text |
| Hold route (M1-T2 fallback)         | Native `contextmenu` only. No `useLongPress`, nothing in `components/ui/`, `tooltip.tsx` untouched       | Checklist item 4 shows no `contextmenu` on a touch hold (in either posture)                 | Extract `useLongPress` on the tooltip precedent; brings component-reviewer in     |
| The first-session hint's "session"  | `sessionStorage`, once per browser session, spent when the hint is the line shown                        | The product owner finds it shown too often or too rarely                                    | The storage key and `takeTouchHint`                                               |
| Gating on the device (D7 hybrid)    | Gestures key on `pointerType`, so they apply in both postures without a media query                      | The pointer-check photo / pass A show the real device reports something the harness did not | Nothing, unless a posture is found where `pointerType` is not `touch` / `pen`     |

## What was built

- **M1-T1.** `useBarPointerDrag` takes `touchArmed`; all three instances pass `isSelected`. The body
  carries `touch-pan-y` when selected and movable; the edges carry `touch-none` only when selected.
  A selected, movable bar shows an offset outline and grip marks. A finger or stylus selection puts
  the refusal reason (or the once-per-session hint) in a `role="status"` line below the scroller.
  `GanttPanel`'s stale docblock is corrected. ADR-0177 (D1–D3) is `Proposed`.
- **M1-T2.** `GanttRowMenu` gains the optional `ref` handle (`openAt`) and nothing else. The hook
  returns `cancel()` and `intentExceeded()` and exports `DRAG_INTENT_PX`. The row's `onContextMenu`
  follows the plan's four steps; the keyboard origin anchors to the row; a touch hold's trailing
  click is swallowed once.
- **M1-T3.** ADR-0177, its `CLAUDE.md` §16 line, the "amended by ADR-0177" notes on ADR-0095 and
  ADR-0118, `docs/UX_STANDARDS.md` "Row / node actions". The device confirmation is a three-item
  tick-box the product owner runs on the deployed release (below); ADR-0177 stays `Proposed`.

## Deviations from the plan, and why

- **`intentExceeded()` on the hook.** The plan has the row "read all three hooks' live movement"
  but the hook returned only `cancel()`. Reading a ref from outside needs a method; it is the one
  addition to the hook's return beyond the plan, and it uses the same `DRAG_INTENT_PX`.
- **`openAt` returns a boolean.** The plan types it `void`. Returning whether a menu opened lets the
  row leave the browser's own menu alone when the host supplies no context (the spec's "browser
  default stands" error row) instead of swallowing the event to show nothing.
- **The status line is outside the scroller.** Above the rows it would shift them under the finger
  that just tapped; inside the scroller it would scroll away.
- **The journey's hold cases synthesise the `contextmenu`.** CDP does not synthesise the OS
  long-press (M0 P8), so the hold cases hold a real CDP touch and dispatch the event the OS would
  send. They prove the application's response, not that Windows sends it.

## ADR-0111 claims for the accessibility pre-release pass

Statements about what a real browser does with a real focus ring, which jsdom cannot ask:

1. `contextmenu` from Shift+F10 / the Menu key. **Corrected after the accessibility review (Chromium):**
   a keyboard `contextmenu` reports `pointerType: "mouse"`, the focused element's centre and
   `detail: 0`, so the first build's heuristic (empty `pointerType` or a zero point) was wrong and was
   masked only because the keydown path `preventDefault`s. The row now records the key itself
   (`keyboardMenu`, set on keydown of `ContextMenu` / Shift+F10, cleared when a `contextmenu` consumes it
   or on the next pointer press), and `onContextMenu` reads that. The keydown path calls the menu
   handle's `openAt(rowAnchor, row)` rather than clicking the `⋯`, so one menu opens and focus returns
   to the ROW. Windows may deliver the `contextmenu` on key-up; unit tests cover both orders.
2. Focus returns to the **row** after a hold, right-click or the keyboard opens the menu and it closes
   (Escape, Tab, selection), and to the `⋯` when the `⋯` opened it. `restoreFocusRef` is now a local ref the
   handle repoints.
3. `cancel()` releases `useBarPointerDrag`'s capture-phase Escape listener, so Escape after a hold
   belongs to the menu and not to a drag that no longer exists.
4. A right-click inside the open menu's portal (React events follow the React tree) is left to the
   browser rather than re-opening the menu.
5. The status line (`role="status"`) is announced on a finger or stylus selection; whether a screen
   reader announces an inserted-with-text live region reliably is the pass's question.

## Coverage limits worth knowing

- **The stylus has no end-to-end case.** CDP's touch events carry no stylus pointer type, so the
  journey drives `touch` only; `pen` is covered by hook unit tests (`touchArmed`, both branches).
- **The scroll case asserts `pointercancel`, not a scroll offset.** The Gantt's zoom buttons are
  disabled and the chart is framed to the window, so the fixture has nothing to overflow, as M0 found
  (a narrower window and a wider grid pane did not change it). A handle that took the drag ends in
  `pointerup`.
- **A drag's drop is the column the pixel lands in**, and the browser rounds a touch point to a whole
  pixel, so a journey that drags exactly N columns lands N-1 half the time. The move case drags
  2.25 columns and asserts exactly two working days.
- **A real hold is still the device's.** The hold cases synthesise the `contextmenu`; they assert
  the drag was live first, so cancelling it is a real observation.

## Device confirmation (M1-T3), for the product owner

On the deployed release, in each posture, about 5 minutes:

- [ ] 1. Tap a bar, then drag it sideways. Did it move?
- [ ] 2. Without tapping first, drag the right end of a different bar. Did the chart scroll, with the
      bar unchanged?
- [ ] 3. Press and hold a row, lift, and check the menu is still open. Did it open while you held or
      after you lifted?
- [ ] 4. With the keyboard attached, focus a row and press the Menu key (and Shift+F10). Exactly one
      SchedulePoint menu should open (not also the browser's), and Escape should leave focus on the row.

Plus the stylus pass (checks 1 and 2 with the stylus, and a hold) if it was not already run. The
answers decide the first two defaults above.
