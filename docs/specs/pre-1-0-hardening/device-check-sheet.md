# Device check sheet: screen reader, contrast theme, rotation and large text

For the product owner. About one hour in total, plus setup. No developer tools, nothing to type up.

**What this is for.** A computer test cannot hear Narrator, see a real Windows contrast theme or turn a
real tablet. These checks are the ones only you can do. Your answers decide which fixes get built. There
are no wrong answers: "nothing happened" is as useful as "it worked".

**How to answer.** Tick a box, or write a few words on the line. Photos and a screen recording are fine
instead of writing. Windows: Snipping Tool, then Record. Each step says what **Correct** looks or sounds
like and what **Wrong** looks or sounds like. If you are not sure, tick "not sure" and say what you saw.

> **Keep this sheet current.** Any change that alters what a step tests (the toolbar's names, the
> `View ▾` Zoom panel, the Gantt's row menus, the diagram ruler, the gear's place, or a landmark's name)
> updates this file in the same pull request, and the hand-off says so. The "Correct" lines were checked
> against `web` 0.190.0 on `main`, plus the ruler change in `fix/ruler-labels-200pc` (TECH_DEBT #478),
> which is not in a release yet: run section 6 only once that release is live. Gantt items 6, 25b and 29
> are not copied here, because a copy drifts: section 7 points you at them by number in
> [`../gantt-coarse-pointer/device-checklist.md`](../gantt-coarse-pointer/device-checklist.md).
> When you have answered, a follow-up change records them in `device-check-results.md` beside this file
> and turns each "wrong" into a `TECH_DEBT.md` row or a fix.

## Before you start

- Address to open: your SchedulePoint site, on `web` 0.190.0 or later (the release list on GitHub shows
  which version your site has pulled).
- Machines: the **Surface** (finger and stylus; browser: Edge) and the **PC** (mouse; the monitor at
  1912 × 948).
- Plan to open: any plan with a few activities, a few links, and at least one grouped "summary" row. A
  practice plan is best.
- Sign in as someone who can edit (Planner or Org Admin), so the editing steps work.

**How to start and stop Narrator.** Press **Ctrl + Windows key + Enter**. A blue box and a voice
appear. Press the same three keys again to stop it. The Narrator key is **Caps Lock** (hold it while you
press the other key; a tap of Caps Lock does not switch Caps Lock on while Narrator is running). Turn
the volume up. If the voice is too fast: Narrator key + Page Up / Page Down.

**The few Narrator keys you need.**

| To do this                         | Press                                                                  |
| ---------------------------------- | ---------------------------------------------------------------------- |
| Move to the next / previous item   | Caps Lock + Right arrow / Left arrow                                   |
| Jump to the next landmark (region) | **D** (while Narrator's scan mode is on; Caps Lock + Space toggles it) |
| Jump to the next heading           | **H** (scan mode on)                                                   |
| Hear where you are                 | Caps Lock + W                                                          |
| Stop it talking                    | Ctrl                                                                   |

**How to pick a Windows contrast theme.** Settings, then Accessibility, then **Contrast themes**. Pick
one from the drop-down (Aquatic, Desert, Dusk and Night sky are the colourful ones; try one of them and
then, if you have time, "High contrast black"), then press **Apply**. The screen flashes and goes
black or blue. To turn it off: the same page, set the drop-down to **None**, press **Apply**. A quick
way to switch on and off: **Left Alt + Left Shift + Print Screen**, then press Enter on the box.

## 1. Narrator on the Surface, in Edge (about 20 minutes)

Start Narrator. Use the keyboard cover and your fingers as you like. Nothing here changes your plans.

- [ ] **1. Sign in.** Open the site's sign-in page. Move through it with Caps Lock + Right arrow.
      Correct: it says "Email", then "Password", each as an edit box, then a button called "Sign in".
      Wrong: a box with no name (it says just "edit"), or the button read as only "button".
      It: [ ] correct [ ] wrong [ ] not sure: __________
- [ ] **2. Open a plan.** Use the left-hand Project Explorer (the tree of clients, projects and plans).
      Correct: each row says its name, "tree view item" or similar, and whether it is expanded or
      collapsed; the plan opens.
      Wrong: a row that is read as only "group" or "clickable", or Narrator goes quiet.
      It: [ ] correct [ ] wrong [ ] not sure: __________
- [ ] **3. Find the command band.** Turn scan mode on (Caps Lock + Space) and press **D** repeatedly to
      jump between landmarks.
      Correct: one of the stops says "Plan command band" (as a region). The buttons you meet after it are
      the toolbar: "Add activity", "Link activities", "Diagram", "Gantt", "View" and so on.
      Wrong: no stop called "Plan command band"; or the toolbar's buttons are read as a bare "button"
      with no name.
      It: [ ] correct [ ] wrong [ ] not sure: __________
- [ ] **4. Move through the activities on the diagram.** Switch to the **Diagram** view. Press Tab until
      Narrator says "Activities in the diagram" (a list). Press the **Down arrow** and **Up arrow**.
      Correct: each press says one activity (its name and, usually, its dates), and the same activity is
      highlighted on the picture. Pressing Enter on one opens its editor.
      Wrong: Down arrow says nothing; the picture and the voice disagree; or focus jumps somewhere else.
      It: [ ] correct [ ] wrong [ ] not sure: __________
- [ ] **5. Open the activity editor and move between its tabs.** With an activity chosen (step 4), open
      its editor (Enter). Then use Tab, and the Left and Right arrows on the tab row.
      Correct: a dialog opens and Narrator says the activity's name (or "Edit activity"). The tabs are
      read as "General", "Scheduling", "Logic", "Resources", "Progress" and "Notes", each as a tab, one
      "selected". A tab with unsaved changes or a problem says so. Escape closes the dialog and focus
      returns to where you were.
      Wrong: the dialog opens but Narrator stays on the page behind it; a tab is read without its name;
      Escape leaves you nowhere (Narrator says "unknown" or starts at the top of the page).
      It: [ ] correct [ ] wrong [ ] not sure: __________
- [ ] **6. Open a menu and leave it with Escape.** Go to the **Gantt** view (the button named "Gantt").
      Find a row's three-dots button. Narrator should call it "Actions for" and the activity's name. Press
      Enter or Space to open it, move with the arrows, then press **Escape**.
      Correct: the menu opens and says "menu"; each item is named and says if it is shaded (unavailable);
      Escape closes it and focus is back on the three-dots button.
      Wrong: the three dots have no name; the menu opens but the arrows do nothing; after Escape the
      voice says nothing or starts again from the top.
      It: [ ] correct [ ] wrong [ ] not sure: __________
- [ ] **7. Read a Gantt row.** Press Tab into the table and use the arrows.
      Correct: a row says the activity's name, then its other cells with column names (for example
      "Duration"); a summary row says "expanded" or "collapsed".
      Wrong: cells read as numbers with no column name; a summary row does not say its state.
      It: [ ] correct [ ] wrong [ ] not sure: __________
- [ ] **8. Zoom from the View menu, and hear the zoom.** Go back to the **Diagram** view. Open
      **View ▾** (the button named "View") and find the **Zoom** group in the panel.
      Correct: one row of three buttons: "Zoom out", "Zoom in" and "Fit to plan". Pressing **Zoom in**
      makes the voice say **"Zoomed in."**; pressing **Zoom out** says **"Zoomed out."**; the picture
      changes each time.
      Wrong: the buttons are read as "button" only; the voice says nothing after a press; or the voice
      says it but the picture did not change.
      It: [ ] correct [ ] wrong [ ] not sure: __________
- [ ] **9. Zoom when a side panel has squeezed the diagram.** Open a side panel that takes most of the
      width (for example the activity list or a dock that makes the diagram narrow). Open **View ▾**,
      **Zoom** again.
      Correct: the three buttons are still there and still work. Pressing one closes the panel and then
      zooms (you may see the panel shut first); it is not left half open.
      Wrong: the Zoom buttons are missing, or pressing them does nothing.
      It: [ ] correct [ ] wrong [ ] not sure: __________

Notes: ____________________________________________________________

## 2. NVDA on the PC (about 8 minutes; only if NVDA is already installed, otherwise skip)

Do not install anything for this. Start NVDA (Ctrl + Alt + N), open the site in Edge or Firefox.

- [ ] **10. Repeat steps 1, 3 and 8 above with NVDA.** (Sign in; the "Plan command band" region, found
      with **D** in browse mode; View ▾ › Zoom › Zoom in and Zoom out.)
      Correct: the same names and the same "Zoomed in." / "Zoomed out." as Narrator.
      Wrong: different or missing names, or no zoom announcement.
      It: [ ] correct [ ] wrong [ ] not sure [ ] skipped (not installed): __________
- [ ] **11. Open an activity editor and press Escape.**
      Correct: the dialog is announced with the activity's name; Escape returns you to where you were.
      Wrong: NVDA keeps reading the page behind the dialog.
      It: [ ] correct [ ] wrong [ ] not sure [ ] skipped: __________

Notes: ____________________________________________________________

## 3. A Windows contrast theme (about 10 minutes, either machine)

Turn on a contrast theme (see "Before you start"), then reload the page. Turn Narrator off for this.

- [ ] **12. Look at the toolbar.** Find a switch-style button that is on (for example the **Diagram**
      button when you are in the Diagram view, or **Start editing** once pressed). Compare it with one
      that is off.
      Correct: the one that is on is filled with the theme's highlight colour (often a solid block of one
      colour) with its words in a contrasting colour that you can read; the off ones are plain.
      Wrong: the on and off buttons look the same; the words on a filled button vanish into the fill; a
      button has no visible edge.
      It: [ ] correct [ ] wrong [ ] not sure: __________
- [ ] **13. Press Tab twenty times, watching the screen.**
      Correct: every control you land on has a visible ring or outline in the theme's highlight colour.
      Wrong: at any point you cannot tell where you are.
      Number of times you lost your place: ____
- [ ] **14. Open a menu and a dialog.**
      Correct: both have a clear edge and readable text; a shaded (unavailable) item looks different from
      an available one, in the theme's grey text colour.
      Wrong: a menu blends into the page; unavailable items look the same as available ones.
      It: [ ] correct [ ] wrong [ ] not sure: __________
- [ ] **15. Look at the diagram and the Gantt.**
      Correct: the bars, links and dates can be told apart from the background, even if the colours are
      not the usual ones; the selected activity is clearly marked.
      Wrong: bars or links vanish; you cannot tell which activity is selected.
      It: [ ] correct [ ] wrong [ ] not sure: __________
- [ ] **16. Turn the theme off again** (Settings › Contrast themes › None › Apply), and reload.
      Correct: the app looks as it did before.
      Wrong: it stays in odd colours after the theme is off.
      It: [ ] correct [ ] wrong [ ] not sure: __________

Notes: ____________________________________________________________

## 4. The gear when you turn the Surface (about 5 minutes, the Surface only)

The Settings gear (a small cog at the right-hand end of the toolbar's editing row) moves when the
screen gets narrower than about 1280 px, because the toolbar rearranges itself. Focus must stay on it.

- [ ] **17. Landscape: put focus on the gear.** Detach the keyboard cover (so the screen can turn), hold
      the Surface landscape, open a plan, then Tab or tap until the gear has the focus ring. Its name is
      "Settings…" and it is icon-only.
      Correct: the gear shows a ring and, if Narrator is on, it says "Settings".
      It: [ ] ring seen [ ] could not reach it: __________
- [ ] **18. Turn the Surface to portrait without touching anything else.**
      Correct: the toolbar rearranges, the gear may move, and the focus ring is **still on the gear**
      (or Narrator says nothing new). Pressing Enter opens the settings dialog.
      Wrong: the ring disappears; focus jumps to the page or to the toolbar's edge; Narrator announces
      that a control "was removed" or "moved" when you had not left the gear.
      It: [ ] correct [ ] wrong [ ] not sure: __________
- [ ] **19. Turn it back to landscape.** Same as step 18.
      It: [ ] correct [ ] wrong [ ] not sure: __________

Notes: ____________________________________________________________

## 5. 200 % text on the PC (about 8 minutes, the PC only)

Make text twice as big without zooming the page: Settings › Accessibility › **Text size**, slider to
**200 %**, Apply. (If your Windows has no slider that high, use the browser: Edge Settings › Appearance
› **Font size** › Very large, and tell us which you used.) Reload the page.

- [ ] **20. Use the toolbar.**
      Correct: nothing is cut off or hidden behind something else; the toolbar wraps onto more lines or
      moves items into a menu, and every button can still be reached and read.
      Wrong: a button is half hidden; the toolbar needs sideways scrolling to reach something; text
      overlaps text.
      It: [ ] correct [ ] wrong [ ] not sure: __________
- [ ] **21. Open the activity editor, the View menu and a Gantt row menu.**
      Correct: each opens fully on screen and scrolls if needed; no button is out of reach.
      Wrong: the bottom of a dialog is off the screen with no way to scroll to it.
      It: [ ] correct [ ] wrong [ ] not sure: __________

Notes: ____________________________________________________________

## 6. The diagram's day numbers at 200 % text (about 4 minutes, the PC only)

**Only once the release containing `fix/ruler-labels-200pc` (TECH_DEBT #478) is live.** Keep 200 % text
from section 5. Open the Diagram view of a plan that runs for a few weeks. The ruler is the strip of
dates across the top; the day numbers are the small numbers on its lowest line. They are shown once
there are about 18 px per day.

- [ ] **22. Zoom the diagram in and out slowly** (View ▾ › Zoom › Zoom in or Zoom out, ten steps each way)
      and look at the day numbers.
      Correct: the numbers never touch or overprint. When the days are close together, only every second
      calendar day shows (the odd numbers: 1, 3, 5 and so on, never an even one beside them); closer
      still, only the Mondays show. As you zoom in, more numbers appear. Panning sideways does not change
      which numbers show.
      Wrong: two numbers overlap or touch; numbers appear and disappear as you pan; the 30th and the 1st
      of the next month overprint each other.
      It: [ ] correct [ ] wrong [ ] not sure: __________
- [ ] **23. Turn text back to 100 % and look again.**
      Correct: every day number shows, as before this change.
      Wrong: numbers are still skipped when there was room for them all.
      It: [ ] correct [ ] wrong [ ] not sure: __________

Notes: ____________________________________________________________

## 7. The Gantt's row menus and the toolbar's joined buttons (about 10 minutes, the Surface)

These three were changed since you last answered, and they are already written in the Gantt sheet. Do
them from there, so there is one copy of the wording. Tablet posture, finger.

- [ ] **24. Item 6** of [`device-checklist.md`](../gantt-coarse-pointer/device-checklist.md): the Gantt's
      three dots and the summary arrow, ten taps each. The table is 48 px wider now and the three dots sit
      inside it, clear of the divider.
      Result: dots ____ / 10 arrow ____ / 10 (misses)
- [ ] **25. Item 25b** of the same sheet: putting a finger on the line between the Project Explorer and
      the plan.
      Result as written there: __________
- [ ] **26. Item 29** of the same sheet: Undo, Redo, Recent edits and the Colour options.
      Result as written there: __________
- [ ] **27. With a mouse on the PC, click a Gantt row's three dots, and the "Float left" column heading,
      at several points across each button, including the very edge.**
      Correct: every click opens the menu or sorts, and a click never starts dragging the divider.
      Wrong: a click on the edge of the button grabs the divider (the table width changes) instead.
      It: [ ] correct [ ] wrong [ ] not sure: __________

Notes: ____________________________________________________________

## When you are done

Total steps: 27. Send this sheet with its ticks, any photos or recording, and anything odd you noticed
that is not on the sheet, in your own words:

Notes: ____________________________________________________________

## Your results

Fill in as you go, or leave blank and send the ticks above.

| Field                                    | Answer |
| ---------------------------------------- | ------ |
| Date                                     |        |
| Site version                             |        |
| Narrator version (Win+Ctrl+Enter, About) |        |
| NVDA version, or "not installed"         |        |
| Contrast theme tried                     |        |
| Text-size method (200 %)                 |        |
| Steps correct (of 27)                    |        |
| Steps wrong (list the numbers)           |        |
| Steps not sure (list the numbers)        |        |

Each "wrong" becomes a row in `docs/TECH_DEBT.md` or a fix, recorded in a sibling
`device-check-results.md`.
