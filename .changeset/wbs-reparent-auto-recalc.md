---
'@repo/web': patch
---

Fix: assigning (or clearing) an activity's WBS summary now triggers the same auto-recalculate every
other structural edit already gets.

The auto-recalc coalescer decides whether to fire from a scheduling-input fingerprint built from
each activity's duration, type and constraint — `parentId` was missing from it, so reparenting an
activity under a WBS summary (or moving it back to top-level) never participated. The summary's
rollup dates would then sit stale until an unrelated edit, or a manual Recalculate, happened to run
one. `parentId` now joins the fingerprint.
