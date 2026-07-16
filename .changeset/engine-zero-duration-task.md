---
'@repo/api': patch
---

Engine: distinguish a zero-duration `TASK` from a milestone by **type**
(`isMilestone`), not `duration === 0` (M4-F1, ADR-0035 §22). A zero-duration task
keeps a real start + finish and is scheduled as a task; the project-finish
tie-break's milestone privilege now keys off the milestone type. The change is
date-neutral in the current model (the golden suite stays byte-identical) and
expresses §22's intent in code.
