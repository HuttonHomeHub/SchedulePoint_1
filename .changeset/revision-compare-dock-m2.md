---
'@repo/web': minor
---

Add the **Compare revisions** dock: what entered and left the critical path between two of a plan's
computed schedules, and how far the completion moved. Opened from `Analysis ▾ → Compare revisions…`,
it compares a baseline against the plan as it stands now, or against another baseline.

It reports what moved and **never what caused it** — attributing a change in the critical path to one
edit needs an ordering nobody supplied, and the same edit scores differently depending where it falls
in that ordering. The panel says so rather than leaving the omission to be read as an oversight, and
warns when the two revisions were computed under different criticality settings, or when one of them
does not record which settings produced it.
