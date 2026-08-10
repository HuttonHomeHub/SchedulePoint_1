---
'@repo/web': patch
---

Retire `VITE_CALENDAR_SHIFT_EDITOR` and `VITE_LIBRARY_SCOPING`, deleting the weekday-checkbox
calendar form and the raw-`<select>` library pickers they selected (ADR-0088 D3). Class A
alternative surfaces go 4 → 2.

No user-visible change: both flags were compiled on in every published image and unreachable by any
build path, so nothing could select the deleted branches.
