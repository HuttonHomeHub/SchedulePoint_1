---
'@repo/web': minor
---

Live cross-plan / programme scheduling web surface (inter-project M2, ADR-0045 §4/§5/§6, F8) — behind
a **new default-OFF flag `VITE_PROGRAMME_SCHEDULING`**, so it changes nothing until an operator opts in.
It puts the already-live cross-plan link CRUD, programme-recalc orchestration and staleness read (F3–F6)
in front of a planner:

- **Cross-plan links** — a new section in the activity Logic panel (the **successor** activity's home,
  CQ-2) to draw a **live** inter-project link from an upstream activity in **another plan** of the org.
  An org-scoped endpoint picker (client → project → plan → activity — the successor's own plan is
  excluded, so N31 can't be chosen) plus FS/SS/FF/SF type + signed lag + lag-calendar inputs (mirroring
  the intra-plan dependency editor), a both-direction link list ("Driven by" / "Drives") with delete,
  and the shared `CROSS_PLAN_DEPENDENCY_CONFLICT_MESSAGES` copy for the same-plan / cycle / duplicate
  rejections. RHF + Zod.
- **Recalculate programme** — an action (Planner/Org Admin) beside the existing Recalculate that runs
  the synchronous `…/schedule/recalculate-programme` solve, with a result panel (per-plan summaries
  upstream-first + the summed missing-upstream **N32** warning), the **423 `PROGRAMME_PLANS_LOCKED`**
  blocked-plans path (a link per blocked plan to request/override its pen), and the **422
  `PROGRAMME_TOO_LARGE`** path.
- **Stale banner** — a `role="status"` notice shown when the plan summary carries `scheduleStale` (an
  upstream plan was recalculated more recently), prompting a programme recalculate.

The whole surface is unobtrusive: it renders only for a plan that actually has cross-plan links (the
summary's `scheduleStale` field is present only then), so an ordinary plan is unaffected even with the
flag on. Reuses design-system primitives (Dialog, Select, Badge, DataTable, Button, form fields); no
one-off styling. WCAG 2.2 AA (labelled controls, keyboard, focus management, `role="status"` async
notices). Covered by component tests (links section, add-link cascade + validation + conflict copy,
programme control success/423/422/staleness) and a flag-on Playwright journey
(`playwright.programme.config.ts`, wired into CI). Flag default OFF ⇒ existing behaviour byte-identical.
