---
'@repo/api': minor
'@repo/types': minor
---

WBS activity hierarchy foundation (M5-epic F5, ADR-0038 / ADR-0035 §24). Activities gain an adjacency-list
`parentId` (a nullable self-reference) and a new `WBS_SUMMARY` activity type, the groundwork for
WBS-summary rollup. The create/update API accepts `parentId` and the response echoes it; the service
validates it is an **active `WBS_SUMMARY` in the same plan** (a foreign/cross-plan/deleted id reads as 404) and that re-parenting introduces **no cycle** in the WBS tree. A **WBS summary carries no logic**:
the dependency-create path rejects a link whose endpoint is a summary (422). Governed by the new ADR-0038
(adjacency-list over a materialised path; parent tree acyclic + same-plan, orthogonal to the dependency
DAG). Schema-only + validation — the rollup engine (F6) and flagged web surface (F8) follow; every
existing activity reads `parentId = null`, so the path is behaviour-preserving.
