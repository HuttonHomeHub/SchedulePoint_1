---
'@repo/web': patch
---

A share link now draws each bar where the planner placed it, exactly as the member canvas does
(ADR-0163) — a guest's picture used to draw the CPM early dates instead, a schedule the planner
never chose. A screen-reader guest now hears the same dates and lane too: the listbox previously
announced every activity as "not yet scheduled".
