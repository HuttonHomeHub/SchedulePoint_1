---
'@repo/web': minor
---

feat(web): entry-route consistency for the plan workspace (behind `VITE_ENTRY_ROUTES`)

Makes plan and activity actions reachable from every context where a user expects them, and
converges duplicated wording. Behind a new compile-time flag `VITE_ENTRY_ROUTES` (default off) for the
new entry points; label/read-only consistency fixes are unconditional.

- **Plan notes → right-side drawer.** The always-inline notes block becomes a right-anchored `Sheet`
  drawer toggled by the toolbar **Comments** button (which previously only scrolled to the section),
  reclaiming canvas space. Adds a `side?: 'left' | 'right'` prop to the `Sheet` primitive.
- **Canvas selection bar** now offers **Resources**, **Report progress** (role-gated, not pen-gated),
  and **Steps** (behind Earned-Value + Steps flags, hidden for milestones/duration-derived), each
  opening the existing dialog — so a planner authoring on the canvas no longer has to drop to the
  activities table. Steps/Progress dialogs are mounted once in the shared workspace dialogs.
- **Wording convergence.** The selection bar now reads **Edit / Delete / Logic** to match the table,
  and the toolbar progress command is **Report progress…** to match the table and dialog.
- **Discoverability.** The toolbar "Add note" item gains a tooltip noting it opens the Logic panel
  (links & notes) — adds an optional `description` to the toolbar item registry (appended to the hover
  title, never the accessible name).
- **WBS parent read-only column** in the activities table (behind `VITE_ADVANCED_ACTIVITY_TYPES`),
  mirroring the existing Calendar/Constraint read-only columns.

Flag off ⇒ the new selection-bar items and the notes drawer are absent (the inline notes block and the
prior three-item bar are byte-for-byte unchanged). No API or schema change.
