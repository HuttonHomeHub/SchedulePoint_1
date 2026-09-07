---
'@repo/api': minor
'@repo/web': minor
---

Measure the canvas on the machine somebody actually uses.

`docs/TECH_DEBT.md` #75 has one real-hardware reading, and it exists because a
person ran a terminal command once. The staff console now has a control that
takes the same measurement in the operator's own browser and records it — the
scenario, the framing, the machine, the numbers and the bars they were judged
against.

The measurement runs in the browser and a server-side job is refused. The API
runs headless in a container where Canvas 2D can come from a software
rasteriser, and that container's own no-change baseline moved more than tenfold
between two runs an hour apart. An authoritative-looking number from the wrong
machine is worse than none, because somebody acts on it.

The server stores the samples and the thresholds, and does not judge. The
verdict is derived on read by the same judge the command-line driver uses, so a
reading stays readable against the bar it was actually taken under rather than
the bar in force when somebody reads it. `INDETERMINATE` is a first-class
verdict: a machine that cannot resolve the question says so instead of guessing.

Two new staff routes, both audited — `POST /api/v1/staff/probe-results` is the
console's first write — and a 365-day retention period that is swept like the
other two tables.
