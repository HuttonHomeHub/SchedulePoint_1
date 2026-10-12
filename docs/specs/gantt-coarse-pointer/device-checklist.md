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
> Item 12 was added for #464 and the arrow's move (item 6's wording changed with it).
> Item 25 was added for TECH_DEBT #439 (dividers now follow a finger).
> Item 29 was added for toolbar-grid M2 (2026-10-12): Undo, Redo and Recent edits, and the three Colour
> options, now sit in joined tracks with a 1 px gap where there were 4 px. No target got smaller (44 px under
> touch, asserted in `command-surface.spec.ts`), so items 1 to 28 do not change, but a finger meets something
> different between two neighbours and only a hand can say whether it misses.
> Items 13–24 were added on 2026-10-09 for the dense-row touch targets (`docs/specs/dense-row-touch-targets/`,
> ADR-0183, TECH_DEBT #215). That work left the Gantt's targets unchanged (the `⋯` stays 28 px and the
> arrow 24 px, ADR-0177 D4 and ADR-0183 D6), so items 1 to 12 do not change. **Revisit trigger:** if
> item 6 ever reads more than 1 miss in 10 on the Gantt's `⋯` or arrow, in either posture, say so: it
> reopens the Gantt's 28 px (ADR-0183 D6).

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
      row ten times.** (The arrow sits just before the summary's activity name, in the Activity
      column, the one with the task names.)
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

## Extra check for the table hold (about 2 minutes per posture)

This version stops the table's words and the blank space around them from being highlighted after
you touch the screen, so that a hold can reach SchedulePoint's menu (#464). 12b is the deciding check
for the blank-space extension. Do it once with a finger and once with the stylus, in
each posture.

For each run, first note the posture and the input, then do 12a and 12b.

- **Posture:** [ ] cover attached [ ] tablet. **Input:** [ ] finger [ ] stylus
  - [ ] **12a. Press and hold on the words in the table half of a row (a task name, for example)
        for about one second, then let go.**
        What appeared: [ ] SchedulePoint menu [ ] browser menu [ ] highlighted text [ ] nothing
        Was a word highlighted, with little round handles? [ ] yes [ ] no
  - [ ] **12b. Press and hold on an EMPTY part of the table half (the empty space inside a Code
        cell; if Code is hidden, a blank Duration cell). Stay on an activity's own line: the empty area
        below the last activity is not a row, so the browser's menu there is expected.**
        What appeared: [ ] SchedulePoint menu [ ] browser menu [ ] highlighted text [ ] nothing

## Row targets under a finger (about 8 minutes, tablet posture)

These confirm the dense-row work (ADR-0183) on the real Surface: row buttons are 44 px and tappable,
and folding the cover while the Explorer is scrolled keeps your place and your focus. Do items 13 to
24 in **tablet posture** (keyboard cover removed or folded back) unless a step says otherwise.

**With the keyboard cover attached, nothing on these steps changes, by design.** The Surface then
reports a mouse-type pointer, so every button below stays its small size in that posture. That is a
known gap (ADR-0183 D3), not a fault to report.

- [ ] **13. In the Project Explorer on the left, tap a client, project or plan row ten times** (any
      row; each tap should open or expand it). The rows should look about as tall as a finger.
      Missed or hit the wrong row, out of 10: ____ / 10
- [ ] **14. In the Explorer, tap the three dots at the end of a row ten times.**
      Missed or hit the wrong thing, out of 10: ____ / 10
- [ ] **15. Open each of Clients, Projects, Plans, Resources and Calendars and tap the three dots on
      a row** (once per page; a page with no rows can be skipped).
      Each three-dot button is as big as the Edit button beside it and opened its menu:
      [ ] yes, on every page I could try [ ] no, on: __________
- [ ] **16. On the Clients page, tap a row's three dots ten times.**
      Missed or hit the wrong thing, out of 10: ____ / 10
- [ ] **17. Open the activities table and tap the three dots on a row ten times.**
      Missed or hit the wrong thing, out of 10: ____ / 10
- [ ] **18. Make the window small, about 1024 wide by 600 high if the Surface lets you (otherwise
      skip this step), expand the activities table and tap the three dots on a row.**
      The row is tall enough and the three dots opened their menu: [ ] yes [ ] no [ ] skipped
- [ ] **18b. With the activities table open (a plan that has a WBS summary shows a "Select" column),
      tap the small box beside three different activities, then the box in the column heading.**
      Every tap ticked the one you meant, first time, and the heading box ticked them all:
      [ ] yes [ ] no, one missed: __________. The heading row looks: [ ] fine [ ] too tall
      [ ] other: __________ (the box you tick is still small; the area that takes your tap is a
      finger wide)
- [ ] **19. Hide the Project Explorer (its collapse button), then tap "Show Project Explorer" and each
      of the six icons on the narrow strip, one at a time.**
      Every button is finger-sized and nothing is cut off: [ ] yes [ ] no, a button is clipped: __________
- [ ] **20. Tap a row in the Explorer, then fold or unfold the keyboard cover. Press an arrow key.**
      Focus is still on the row you tapped and the arrow moves it from there: [ ] yes [ ] no
- [ ] **21. Scroll the Explorer to the top of a long list, then fold or unfold the cover.**
      The same row is still in view, and an arrow key still moves from the row you were on: [ ] yes
      [ ] no, it jumped: __________
- [ ] **22. Scroll the Explorer well past 60% of its length, then fold or unfold the cover (to the
      mouse-type pointer and back).** This is the case that needed a special fix.
      The same row is still in view: [ ] yes [ ] no, it jumped: __________
      An arrow key still moves from that row: [ ] yes [ ] no
- [ ] **23. Scroll the Explorer to the very end of its list, then fold or unfold the cover.**
      The end of the list is still in view: [ ] yes [ ] no
      An arrow key still moves from the row that had focus: [ ] yes [ ] no
      A blank strip appeared for a moment at the edge of the list: [ ] no [ ] yes, and it went away
      [ ] yes, and it stayed
- [ ] **24. Scroll the activities table and click a row so it has focus, then fold or unfold the
      cover.** Your place and the row's focus survived: [ ] yes [ ] no: __________

## Dragging a divider (about 1 minute, tablet posture)

Dividers now follow a finger all the way (TECH_DEBT #439); before, the drag stopped after a moment.

- [ ] **25. On a touch device, in the Gantt view, put one finger on the thin vertical line between the
      table (left) and the chart (right) and drag it slowly sideways, a thumb's width or more,
      without lifting.**
      It: [ ] followed my finger the whole way [ ] stopped part-way [ ] the chart scrolled instead
      [ ] nothing happened. Try the line between the Project Explorer and the plan too:
      [ ] followed [ ] stopped part-way [ ] other: __________
- [ ] **25b. Put one finger down on the line between the Project Explorer and the plan, a little to
      either side of it (a thumb's width is fine), without trying to hit it exactly. Do the same
      on the line above the activities table, and on the line beside an open Comments panel.**
      The line is a finger wide on these three, so each: [ ] found the line first time
      [ ] needed a second try: __________. A control beside one of them was taken by mistake:
      [ ] no [ ] yes: __________. The line between the table and the chart in the Gantt stays
      narrow on purpose (use View > Columns > Table width there): [ ] understood [ ] it should be
      wider too

- [ ] **26. Press the line between the Project Explorer and the plan with one finger, without moving
      it (a plain tap), then do the same on the line above the activities table and beside an open
      Comments panel.**
      A small box opened next to your finger with a number in it, and the cursor was in the number:
      [ ] yes, on all three [ ] on some: __________ [ ] no. Type a number a little bigger and press
      Enter on the keyboard cover or the on-screen keyboard: the panel changed to that size
      [ ] yes [ ] no. Tap elsewhere: the box went away [ ] yes [ ] no. A tap you meant as a drag
      opened the box by accident: [ ] never [ ] sometimes: __________ (if so, how far did your finger
      slide? The box opens for a slide of under 4 px.)
- [ ] **27. Put the box away with Escape on a keyboard, or by tapping the line again.** Focus is back
      on the line: [ ] yes [ ] no. "Reset to standard" is finger-sized and puts the panel back:
      [ ] yes [ ] no

- [ ] **28. Only if the device is an iPad or a Mac running Safari: open a divider's box (step 26), then
      tap "Reset to standard".** Safari does not focus a button on a tap, so the box could mistake the tap
      for focus leaving and close before the button acts. The panel went back to its standard size:
      [ ] yes [ ] no, the box closed first [ ] not Safari

## The toolbar's joined controls (about 3 minutes, tablet posture)

Open any plan at the full width of the screen (the Colour options are on the bar from about 1912 px; if they
are not, say so and skip the last part of this step). Press **Start editing**, then make one small change so
Undo has something to undo.

- [ ] **29. Tap each of Undo, Redo and Recent edits (the three joined buttons on the lower row, in that
      order) ten times, alternating, and tap each of the three Colour options ten times.** Press Redo only
      when it has something to redo; a button that is greyed does nothing, which is not a miss.
      Hit the wrong neighbour or nothing, out of 10: Undo ____ / 10 Redo ____ / 10 Recent edits ____ / 10
      Colour options ____ / 10 each
      The chosen Colour option looked different from the other two without my having to read them:
      [ ] yes [ ] no [ ] not sure

## When you are done

Send the photos of the `pointer-check` screen (one per posture), this sheet with its ticks, and any
recording. Anything odd you noticed that is not on this sheet is welcome too, in your own words:

Notes: ____________________________________________________________

Nothing here changes any of your plans, but dragging a bar does move it. Use a practice plan, or press
**Undo** afterwards.
