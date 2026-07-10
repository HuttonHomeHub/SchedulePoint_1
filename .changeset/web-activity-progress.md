---
'@repo/web': minor
---

Add the activity progress editor with role gating. A "Progress" action on each
activity row opens a dialog to set percent complete and the actual start/finish
dates; the resulting status is shown as a live, read-only preview (the API derives
it). The action is gated on `canReportProgress` (Contributor upward), so a
Contributor — who cannot edit an activity's definition — can still report progress,
while Planners and Org Admins see it alongside Edit/Delete. Client-side validation
mirrors the API (a finish needs a start and cannot precede it).
