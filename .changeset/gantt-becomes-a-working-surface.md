---
'@repo/web': minor
---

The Gantt becomes a working surface (ADR-0095).

The chart shipped read-only, and ADR-0093 then moved `Report progress` off the command surface onto
the canvas dock — which the Gantt did not have. It does now: the same object-action bar, called
rather than rebuilt, so a planner acts on a selected bar without leaving the view.

The grid takes in-cell editing. Name and duration are typed directly (`F2` or double-click, `Enter`
to commit, `Escape` to discard), with a Duration column that reads a sub-day value exactly rather
than rounding it to `0 d`. Each cell knows its own write scope, so reporting progress does not need
the edit lock while changing a duration does. A cell you may not change stays **readable** with the
reason given, rather than being greyed out and silent.

Bars move. Drag one, or press `Alt+←/→` to shift its start and `Shift+←/→` to change its length;
drag the right-hand edge to resize. An uncalculated plan now shows its grid so a new programme can
be typed in before the first recalculation.

Dependency arrows arrive behind **View ▾ → Logic links**, off by default — and selecting a row
always draws that row's own links, so "why is this bar here?" is answerable without turning anything
on. Every row also carries its predecessors in words for screen-reader users.

Bars now carry their **activity name** beside them and a mark on any bar that is **pinned by a
constraint** — both on screen and in the printed programme, where an anonymous bar sends the reader
back across the page to the grid for every one. Labels stand down where there is no room rather than
overlapping; the pinned mark stays, because a dense chart is exactly when you are looking for it.

Also fixes a defect visible only to someone opening one plan two ways: in Visual mode the chart drew
every hand-placed bar from the wrong dates, on screen, in the grid's own date columns, in its sort
order, and in the printed programme.
