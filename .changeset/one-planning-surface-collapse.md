---
'@repo/api': minor
'@repo/web': minor
---

feat!: one planning surface — `schedulingMode` leaves the API and the toolbar

A bar is drawn where it is placed, on every plan. ADR-0033's `EARLY` / `VISUAL` split is collapsed:
the Early | Visual selector is gone from the command surface, and `schedulingMode` is gone from
`CreatePlanDto`, `UpdatePlanDto` and `PlanResponseDto`.

BREAKING CHANGE: `POST …/projects/:projectId/plans` and `PATCH …/plans/:planId` now answer **422**
to a body naming `schedulingMode`, and `PlanResponseDto` no longer carries it. A client that still
sends the field is refused rather than silently ignored, which is deliberate: a silently-dropped
field would let an old client go on "setting the mode" for ever, succeeding, and changing nothing.
The Prisma column and its enum are untouched in this release.

Three capabilities that shipped beside the mode are **kept and ungated** — the read-only Late-start
overlay, the Visual-conflict legend key, and the display-only Go-to-date control — because none of
them ever read `schedulingMode`. `VITE_SCHEDULING_MODES` is retired with the capability it gated.
