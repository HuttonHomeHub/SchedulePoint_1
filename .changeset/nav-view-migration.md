---
'@repo/web': patch
---

Compose the shell's workspace region as a single `<main>` (ADR-0029, M3). The routed
screens (clients, projects, plans, the plan workspace, members, calendars, baselines,
recently-deleted, onboarding, and the welcome landing) now render their content into
the shell's one main region instead of each owning a `<main>` of its own — removing
per-page landmark duplication so the top bar + rail are truly composed once. Purely
structural: each view's content and layout are unchanged.
