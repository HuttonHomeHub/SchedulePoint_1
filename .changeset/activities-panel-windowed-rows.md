---
'@repo/web': patch
---

The activities panel now opens faster on plans with many activities, because it draws only the
rows you can see (plus a few either side) instead of every activity. One trade-off, agreed in
advance: your browser's find-in-page (Ctrl+F) can no longer find an activity that is scrolled out
of view, and a screen reader reaches such a row only as the list scrolls. The diagram's activity
list still holds every activity. Column widths are now set from the rows first shown, so an
unusually long value further down wraps onto a second line rather than widening its column.
