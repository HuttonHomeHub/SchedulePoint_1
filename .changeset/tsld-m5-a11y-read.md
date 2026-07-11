---
'@repo/web': minor
---

Harden the Time-Scaled Logic Diagram's keyboard accessibility (M8 M5, slice 5.1 — read; ships with
editing off). The activity list now supports **driving-first chain navigation** (`[` / `]` jump to
the predecessor / successor that drives the schedule, so a keyboard user can trace the driving path)
and an on-demand **logic summary** (`Space` announces how many ties an activity has and which are
driving) — delivering the driving/critical context without bloating the per-keystroke announcement,
which additionally now states **total float**. **Focus-follows-viewport** pans the diagram the
minimum distance to keep the selected bar's focus ring on-screen (WCAG 2.4.7 / 2.4.11), and if the
selected activity is deleted elsewhere, selection reconciles to the nearest survivor. A **`?`
keyboard-shortcuts help** sheet (also reachable by button) documents the full keymap in-app.
