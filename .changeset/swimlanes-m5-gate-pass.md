---
'@repo/web': patch
'@repo/api': patch
---

Swimlanes gate pass. When a plan's swimlanes follow its WBS, the note above the Activities table and
the Gantt's Swimlane cell now say how to move an activity (file it under another summary in
Breakdown), and the table's note is hidden on narrow screens where the column is. The API
documentation now gives the swimlane list's real default page size (100) and the order in which a
swimlane request is refused.
