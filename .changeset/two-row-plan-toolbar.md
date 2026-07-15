---
'@repo/web': minor
---

Redesign the plan toolbar as two rows split by "look vs change" (ADR-0031 two-row amendment). Row 1
(Look) carries always-live view/navigate controls — Go-to-date, the zoom cluster, View, the
Early | Visual scheduling-mode selector, a search/filter field with the find & analyse lenses, and
right-aligned Finish / Summary / Legend. Row 2 (Do) carries a pen-gated authoring cluster (Add, Link,
Auto-arrange, notes, Recalculate, Undo/Redo) that shades as one block when you're not editing, beside
always-live plan & deliverable actions (Baselines, Calendar, Plan details, Edit plan, Export, and
more). The toolbar no longer changes shape between viewing and editing — controls shade rather than
disappear — and on a desktop the full labelled command set is visible with no `⋯` overflow.

Also: the persisted data date leaves the toolbar (set at plan creation, changed via Edit plan;
Go-to-date stays for navigation); the header collapses to one line (breadcrumb → plan name + status
pill + pen status) and the redundant read-only banner is removed; the Add menu previews Hammock and
Level-of-effort under "Span between activities"; and the Gantt/Resource view-mode switch is kept
reserved (hidden) until a second view exists.
