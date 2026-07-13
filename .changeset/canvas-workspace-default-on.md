---
'@repo/web': minor
---

feat(web): make the canvas-first plan workspace the default plan surface (ADR-0030)

Flip `VITE_CANVAS_WORKSPACE` **on by default** now that the M5 quality gates are green
(a11y/ux/perf review findings folded in, the flag-on Playwright journey wired into CI, 538
unit tests passing). Opening a plan now renders the TSLD canvas as the primary workspace
surface with the activity table as a draggable, collapsible bottom panel, replacing the legacy
long stacked plan-detail page. The old page remains as the flag-off fallback — set
`VITE_CANVAS_WORKSPACE=false` for an emergency rollback. The flag-off Playwright suites are
pinned to `VITE_CANVAS_WORKSPACE=false` so the legacy fallback stays covered too.
