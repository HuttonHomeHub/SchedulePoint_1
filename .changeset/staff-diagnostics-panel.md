---
'@repo/web': minor
---

Add the Diagnostics panel to the staff console (ADR-0140).

One control — **Run diagnostics** — and a paste-ready block. The block is the deliverable rather
than the panel: a number that stays on one operator's screen answers nothing, and this is what gets
pasted into a measurement record.

Each row states what a non-zero count **means**. Both of today's diagnostics are retrospective —
they size whose stored numbers changed meaning when a release landed, not work that is wrong now —
and that is carried as a closed field on the registry entry rather than as one sentence on the
panel, so it cannot go stale the day a live diagnostic is added.

Nothing runs on arrival. The read touches customer tables and writes a durable audit row, so a query
firing on mount would count every visit to the console as somebody asking a question about customer
data.

Four states, each named: idle with the scope of what comes back, running, a result including both
zero shapes — "no work of this shape exists" and "none of it is affected" are different facts — and
a failure with no number beside it.
