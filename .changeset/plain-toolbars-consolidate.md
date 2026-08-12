---
'@repo/web': minor
---

The plan workspace's command surface is consolidated (ADR-0090 M2). 44 toolbar
stops become 28, and **both rows now show their commands with labels at
1920×1080** — the first time that has been true on a typical 24" monitor.

Nothing is deleted. Selection-gated canvas commands (Zoom to selection, Isolate
logic path) move to the floating selection bar; the display lenses and the
Legend move into `View ▾`, which now names a non-default colour mode on its own
trigger; the Project-finish read-out moves to the plan header; Export, Print and
Share become one `Share & export` menu; Baselines, Earned value and Resource
histogram become one `Analysis` menu. Four commands sit in the `⋯` at every
width, one click away, which is what buys the rest their labels.
