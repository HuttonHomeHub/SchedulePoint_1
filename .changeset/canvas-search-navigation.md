---
'@repo/web': minor
---

Search that navigates (behind `VITE_CANVAS_SEARCH_NAV`, default off).

The TSLD's live search stops being only a filter and becomes a **find** control.
Enter and Shift+Enter walk the matches; each jump centres the bar, selects it and
announces it, with focus staying in the field so the next press goes somewhere.
A read-out says "12 matches" before the first jump and "3 of 12" after, in the
accessibility tree as well as on screen. `Zoom to selection` frames what you
landed on at a legible scale. The same field, the same Enter and the same count
work in the Gantt as well as the diagram, over **one** derived match set — so the
two views cannot disagree about what the search matched.

The field also gains a real, keyboard-reachable clear: `type="search"` renders its
native ✕ in Chromium only and puts it in no browser's tab order, so on a control
whose whole point is keyboard operation the only way to empty it was
select-all-and-delete.

Frontend-only — no API, DTO, schema or migration, and the CPM engine is not
imported, so the ADR-0034 recalculation parity gate is untouched by construction.
Flag-off is byte-for-byte today's search, kept as the rollback contract in its own
parity suite.
