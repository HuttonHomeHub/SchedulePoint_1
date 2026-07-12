---
'@repo/web': minor
'@repo/types': minor
---

Close the "date constraints" loop in the UI. The activity form's constraint
selector now offers only the **six** kinds the CPM engine honours exactly as
labelled (`SNET`/`SNLT`/`FNET`/`FNLT`/`MSO`/`MFO`); the two `MANDATORY_*` kinds —
which the engine silently parks as their moderate equivalents (ADR-0023 §6) — are
no longer newly selectable, so a planner can't set a constraint that behaves
differently than it reads. An activity that already carries a parked value keeps it
as an honest, spelled-out option ("Mandatory start — applied as Must start on") and
is **never silently changed** on open.

A set constraint is now visible without opening each row: a text **Constraint**
column in the activities table (`"SNET · 01 May 2026"`, with the full label as its
accessible name), a small **pin** on the constrained edge of a bar on the TSLD
canvas (a shape cue, not colour — with a legend entry and a spoken equivalent in the
diagram's accessible listbox), and an explanation of the "Parked constraints" figure
in the schedule summary.

`@repo/types` gains `SELECTABLE_CONSTRAINT_TYPES` / `PARKED_CONSTRAINT_TYPES` /
`isParkedConstraintType` (the honoured-as-labelled set, mirroring the engine). No
API, database, or engine change — the constraint write path, optimistic locking, and
pen gating are untouched.
