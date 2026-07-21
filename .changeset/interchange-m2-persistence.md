---
'@repo/api': minor
---

Persist the Stage C2 M2 import graph (ADR-0050): the XER commit now creates a materially-complete P6
import — the **WBS tree** (`WBS_SUMMARY` activities + `parentId`), **activity constraints** (primary +
secondary + As-Late-As-Possible), **progress** (status, actual dates, remaining duration, physical %,
suspend/resume, expected finish), and **resources + assignments**. Resources are org-scoped, so the
importer **resolves-or-creates** — reusing an existing active org resource by code (else name) rather than
blind-creating (which would collide with the org-unique partial-uniques and abort the import). All new
rows go in via batched `createManyForImport` inside the existing single commit transaction (activities in
one `createMany` so the WBS self-FK resolves at statement end), and `compensate` now unwinds assignments
and import-created resources FK-safely on a phase-2 recalc failure. The pure pipeline already guarantees
the invariants the domain services would (one-driver-per-activity, MATERIAL-never-drives, WBS acyclicity,
progress consistency), so the batched writes never trip a DB constraint. The CPM engine and recalc are
only invoked, never modified.
