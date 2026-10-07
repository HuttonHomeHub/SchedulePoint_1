# Surface test sheet: the Gantt under a finger and a stylus

For the product owner. About 30 minutes, plus setup. No developer tools, nothing to type up.

**What this is for.** A computer test cannot tell us how the Gantt feels under a real finger or
stylus. Your answers decide which fixes get built and which are dropped. There are no wrong answers:
"nothing happened" is as useful as "it worked".

**How to answer.** Tick a box, or write a few words on the line. Photos and a screen recording are
fine instead of writing. Windows: Snipping Tool, then Record.

> **Answered 2026-10-07** on `web` 0.177.2: the results and what they decide are in
> [`device-results.md`](device-results.md).
>
> **Keep this sheet current (product owner, 2026-10-06).** The sheet was **parked** until the product
> owner ran it. Any change that alters what a step tests — Gantt touch, stylus, right-click or
> keyboard-menu behaviour, the Gantt's targets, or `/pointer-check.html` — updates this file in the
> same pull request, and the hand-off says so. Items 9–11 were added for `web` 0.173.0 (#843).

## Before you start

- Address to open: your SchedulePoint site (version 0.173.0 or later)
- Plan to open: any plan with grouped "summary" rows (each has a small arrow at its left). A practice
  plan is best, because dragging a bar really moves it; otherwise press **Undo** after each drag.
- [ ] Sign in, open the plan, and open the **Gantt** view (the bar chart with a table on its left).
- [ ] Press **Start editing** at the top. Nothing below works until you do.

## Each time you change posture

Do this before each of the two passes below.

1. Open a new tab and type the site's address followed by `/pointer-check.html`
   (for example `https://yoursite/pointer-check.html`).
2. **Take a photo of the screen.** (Windows key + Print Screen also works.) It lists six lines of
   large text. If you fold or unfold the keyboard cover while it is open, the text should change by
   itself; if it does not, say so.
3. Go back to the Gantt tab.

## Pass A: keyboard cover attached

Use **one finger**. Pick a normal task row (a bar, not a grey summary row).

- [ ] **1. Drag a bar sideways without tapping it first.**
      It: [ ] moved [ ] the chart scrolled [ ] nothing happened [ ] something else: __________
- [ ] **2. Tap the bar once, then drag it sideways.**
      It: [ ] moved [ ] the chart scrolled [ ] nothing happened [ ] something else: __________
- [ ] **3. Drag the right-hand end of a bar you have not tapped.**
      It: [ ] stretched [ ] the chart scrolled [ ] nothing happened [ ] something else: __________
- [ ] **4. Press and hold on a row for about one second, then let go.**
      What appeared: [ ] nothing [ ] a small menu from the browser [ ] highlighted text
      [ ] a menu from SchedulePoint
      When: [ ] while I was still holding [ ] only after I lifted my finger
- [ ] **5. Double-tap a Duration number.**
      [ ] a text box opened [ ] nothing happened [ ] something else: __________
- [ ] **6. Tap the three dots at the end of a row ten times. Then tap the small arrow beside a summary
      row ten times.**
      Missed or hit the wrong thing, out of 10: dots ____ / 10 arrow ____ / 10

## Pass B: tablet (keyboard cover folded back or removed)

Do the setup steps above again (photo included), then repeat items 1 to 6 exactly as in Pass A.
Items 7 and 8 are extra and only needed here: they decide whether larger touch areas are needed.

- [ ] 1. [ ] moved [ ] scrolled [ ] nothing [ ] other: __________
- [ ] 2. [ ] moved [ ] scrolled [ ] nothing [ ] other: __________
- [ ] 3. [ ] stretched [ ] scrolled [ ] nothing [ ] other: __________
- [ ] 4. Appeared: [ ] nothing [ ] browser menu [ ] highlighted text [ ] SchedulePoint menu.
      When: [ ] while holding [ ] after lifting
- [ ] 5. [ ] text box opened [ ] nothing [ ] other: __________
- [ ] 6. Missed, out of 10: dots ____ / 10 arrow ____ / 10
- [ ] **7. Tap a bar once, then press on its right-hand end and drag it slightly, ten times** (press
      **Undo** after each).
      Times it stretched the bar, out of 10: ____ / 10 Times something else happened: ____ / 10
- [ ] **8. Tap a column heading in the table (for example "Start") ten times to sort by it.**
      Times it missed or hit the wrong thing, out of 10: ____ / 10

## Stylus pass (about 5 minutes, either posture)

Use the stylus in place of your finger. Say which posture: [ ] cover attached [ ] tablet

- [ ] **1. Drag a bar sideways without tapping it first.**
      [ ] moved [ ] the chart scrolled [ ] nothing [ ] other: __________
- [ ] **3. Drag the right-hand end of a bar you have not tapped.**
      [ ] stretched [ ] the chart scrolled [ ] nothing [ ] other: __________
- [ ] **4. Press and hold on a row for about one second, then let go.**
      Appeared: [ ] nothing [ ] browser menu [ ] highlighted text [ ] SchedulePoint menu.
      When: [ ] while holding [ ] after lifting

## Extra checks for the new touch features (keyboard cover attached, about 5 minutes)

Version 0.173.0 added "tap a bar, then drag it" and "press and hold a row for its menu". These
confirm them on the real Surface.

- [ ] **9. Click a row in the table so it is selected, then press the keyboard's Menu key** (the key
      with a little list picture, near the right-hand Ctrl; if there isn't one, press Shift+F10).
      [ ] exactly one SchedulePoint menu opened [ ] two menus [ ] the browser's own menu [ ] nothing
- [ ] **10. Press Escape.** Is the same row still highlighted? [ ] yes [ ] no
- [ ] **11. With the mouse, right-click a row while holding Shift.**
      [ ] the browser's own menu appeared (expected) [ ] SchedulePoint's menu [ ] nothing

## When you are done

Send the photos of the `pointer-check` screen (one per posture), this sheet with its ticks, and any
recording. Anything odd you noticed that is not on this sheet is welcome too, in your own words:

Notes: ____________________________________________________________

Nothing here changes any of your plans, but dragging a bar does move it. Use a practice plan, or press
**Undo** afterwards.
