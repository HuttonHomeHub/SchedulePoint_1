---
'@repo/web': minor
---

The plan workspace gives the diagram its height back, and stops covering it.

- The canvas fills its section: the rounded box and its padding are gone, so the
  plan is framed once rather than twice.
- Every transient strip — the armed-tool statement, the link confirmation, both
  selection bars, the edit-conflict banner and the empty-plan notice — now sits
  in a **dock** at the foot of the workspace, in the row the Activities handle
  already occupied. Measured: it costs the canvas no height at all, where before
  each one pushed the diagram down.
- The selection actions bar no longer floats over the diagram, so selecting an
  activity stops hiding the one above it.
- **Snap to grid is gone.** It had no effect: the scheduler already moves every
  hand-placed bar forward to the next working day, whatever the toggle said. What
  it did do was save a weekend drop as the _previous_ Friday — earlier than you
  placed it. Drops are now stored exactly where you put them and the schedule
  moves them forward, and the bar previews that while you drag.
- **Legend** and **Resource view** are back on the toolbar's first row as their
  own buttons, labelled on wider screens and icon-only on narrower ones.
- Two toolbar menus (**Analysis**, **Share & export**) kept their text at widths
  where every other menu had gone icon-only, pushing the second row past its edge
  on small screens. They now match their neighbours.
