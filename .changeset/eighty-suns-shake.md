---
'@repo/web': minor
---

The calendar shift editor is on by default (`VITE_CALENDAR_SHIFT_EDITOR`, ADR-0067 Accepted).

A planner can now author what storage and the CPM engine have held for a year: split shifts, a
four-hour Friday, a night shift across midnight, a calendar with no working week at all, and the
standard working day that decides what "5 days" means on it. Rollback is `=false` and a rebuild;
the flag-off surface stays pinned by its own suites rather than weakened.

Its flag-on journey (`apps/web/e2e-calendar-shifts/`, its own CI step) earned its place on the
first run by finding a defect no unit test could: a menu opened from inside a modal `<dialog>` was
unclickable, because a modal dialog lives in the browser's top layer and the shared `Menu` portalled
to `document.body`, which no z-index can reach. jsdom has no top layer, so 3,200 passing unit tests
had nothing to say about it. `Menu` now portals into the topmost open dialog — a fix every future
menu-in-a-dialog inherits.
