---
'@repo/api': minor
'@repo/web': minor
'@repo/types': minor
---

Client and Project detail state how much they hold, and the audit log's empty column is gone.

A client's header now says "4 projects"; a project's says "16 plans · 2,880 activities across its
plans". Each count is **absent rather than zero** when it could not be taken, because a zero is a
claim that there are none and nothing on the screen can tell a fabricated one from a real one. The
activity figure counts every activity row — WBS summaries, levels of effort and milestones as well
as tasks — and says so.

The counts are on the detail reads only. Adding them to the list routes was measured at 14.5 ms
against 0.034 ms and, worse, abandons the keyset index, so a page of clients would cost
O(all projects in the installation) rather than O(page).

A plan count on a client was built and withdrawn on its own measurement: it plans as a sequential
scan once the client holds a substantial share of the projects table.

The audit log loses its `Outcome` column, whose every cell was empty on a healthy installation — the
outcome now rides on the event row, with success still announced to a screen reader. Recently
deleted's blocked-restore control names the blocker under the row rather than mid-sentence in its own
label.
