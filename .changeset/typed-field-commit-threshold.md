---
'@repo/web': patch
---

Schedule settings: pressing Escape in Critical float threshold now discards a typed value, even though it
also closes the dialog. A second Enter while the save is in flight no longer
re-runs it. `TextField` gains an opt-in commit mode; every existing field is unchanged.
