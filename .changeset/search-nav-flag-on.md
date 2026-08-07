---
'@repo/web': minor
---

Search that navigates is on by default (ADR-0079, `VITE_CANVAS_SEARCH_NAV`).

The TSLD's search field stops being only a filter. Enter and Shift+Enter walk the matches, each jump
centres the bar, selects it and says which one it is; an n-of-m read-out tracks the position; and
`Zoom to selection` frames what you landed on. The Gantt walks the same match set.

Rolling back is `VITE_CANVAS_SEARCH_NAV=false` and a rebuild — the flag-off parity suites are kept
and pinned rather than weakened, so the rollback restores the field's filter-only behaviour exactly.
