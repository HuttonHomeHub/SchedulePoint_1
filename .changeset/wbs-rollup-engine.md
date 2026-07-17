---
'@repo/api': minor
---

CPM engine now rolls up **WBS-summary** activity dates from their branch (M5-epic F6–F7, ADR-0035 §24).
A `WBS_SUMMARY` carries no logic (it has no dependencies); in a post-pass after the network is computed —
running **after** the Level-of-Effort derivation and **deepest-first** so nested summaries resolve
child-before-parent — each summary's dates are derived from its **direct children** in the `parentId`
tree: earliest child start to latest child finish. A summary **never drives a successor, never appears on
the critical path or the longest-path set, and never defines the project finish**; its late dates are
pinned to the rolled-up early dates, so total float and free float are a by-convention 0. An **empty**
summary (no children) collapses to the data date. The engine's `EngineActivity` gains a `parentId` input
(the WBS containment tree, orthogonal to the dependency graph). With no `WBS_SUMMARY` activity present the
new pass is a no-op and the golden/parity path is byte-identical. The engine-conformance harness now
schedules the fixture's three summaries (W4000/W5000/W7000), building the `parentId` tree from the
fixture's dotted `wbs` codes; supported activities rise from 124 to 127 (relationship counts unchanged —
summaries carry no logic).
