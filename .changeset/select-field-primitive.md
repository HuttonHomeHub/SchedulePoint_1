---
'@repo/web': patch
---

A shared `SelectField` primitive replaces 16 hand-assembled label-and-select blocks.

The idiom had been written out 33 times across 15 files, and the copies had drifted: some errors were
announced to screen readers and some weren't, some hints were rendered but never linked to their
control, one screen pointed two different paragraphs at the same id. `SelectField` now owns that
wiring, and every select in the activity form, the dependency and cross-plan link dialogs, plan
status and invite role uses it.

No visible change. The point is that the next accessibility fix to any of them lands once.
