---
'@repo/web': patch
---

fix(web): the canvas draws live again, and a bar lands the length you drew it

Two defects made on-canvas authoring feel broken.

- **Nothing appeared while drawing.** The overlay the canvas paints ghosts, the cursor guideline
  and the resize readout onto is a second canvas that only exists while editing — and it was being
  sized only when the _window_ changed size. Taking the pen doesn't change the window, so that
  canvas kept its default 300×150 while everything was drawn in full-screen coordinates: the live
  bar, the guideline and the date chip all landed off the surface. Resizing the window happened to
  fix it, which is why it looked intermittent rather than simply broken. Now the surface is sized
  whenever it appears, so a bar grows and shrinks under the pointer from the first drag.
- **A bar drawn across a weekend came back too long.** The diagram's horizontal axis is calendar
  time — a weekend still takes up two columns — but an activity's duration is counted in _working_
  days. Dragging Friday to Tuesday is five columns and three working days, and the five was being
  saved as the duration, so the engine laid the bar out two days past where the pointer was
  released. The drawn span is now converted properly, and a drag that starts on a weekend or a
  holiday begins on the next working day rather than being pushed later by the schedule afterwards.

No API, schema or scheduling change — the engine and the recalculation results are untouched.
