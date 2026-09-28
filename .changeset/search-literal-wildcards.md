---
'@repo/api': patch
---

Searching calendars, resources or clients by name (or a resource's code) now matches `%` and `_` literally, so a row named e.g. `50%` is found by searching for `50%` instead of the characters being read as wildcards.
