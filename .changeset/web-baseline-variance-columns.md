---
'@repo/web': minor
---

Show per-activity baseline variance in the activities table (M7 Task D2, ADR-0025).
When a plan has an active baseline, the plan route fetches the variance read and passes a
per-activity map into the existing `ActivitiesTable` as an optional prop, which renders a
**Baseline finish** column: "3 d behind" / "2 d ahead" / "On baseline" (working days on
the plan calendar), "Added" for an activity created since capture, "Removed" for a
baselined activity now gone, and "—" when not comparable. Meaning is carried by the text,
not colour alone (WCAG 2.2); the tone colour only reinforces it. The column is absent when
there is no active baseline. `features/activities` stays dependency-free — it takes a
shared `@repo/types` shape and the route composes it from the baselines feature (no
feature→feature import). A Playwright journey covers capture → active → variance visible
with an axe check. The stale `ROADMAP.md` is refreshed to reflect the delivered M0–M7
milestones and the candidate next steps.
