---
'@repo/api': patch
---

Fix: exporting a plan no longer turns every Level of Effort activity into a task. `export.service.ts` coerced `LEVEL_OF_EFFORT` to `TASK` before the emitter saw it, justified by a docblock that stopped being true when the importer was fixed. XER has `TT_LOE`, the adapter reads it and the emitter writes it — only this function stood in the way, so export → re-import silently downgraded every LOE. Found by the new ADR-0066 M5.4 round-trip diff.
