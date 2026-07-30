---
'@repo/web': minor
---

Add the **Members** tab — manage a WBS summary's contents from the summary (`VITE_WBS_IMPROVEMENTS`,
default off).

The shipped WBS could only be built one activity at a time, from each child's own editor: filing
twenty activities meant opening twenty editors, and nothing anywhere answered "what is actually in
this summary?". Opening a `WBS_SUMMARY` now offers a checklist over the plan, with one Save that
sends one all-or-nothing batch.

The checked set is **state, not a projection of the visible rows**. The list filters, so a member
scrolled out of view or excluded by the search term is still a member; deriving the set from what is
on screen would silently unfile everyone the filter hides, in a request that would be perfectly
valid and atomic. Only genuine changes are sent, because every unnecessary row is another chance for
someone else's stale version to reject the whole save.

Membership reuses the existing **definition** gate object rather than re-expressing the same rule —
an identity test asserts `gating.members === gating.general`, so "this changes no permission" is
checkable rather than claimed. The panel shades its controls with a reason instead of hiding them: a
reader without the pen can still see what is in a grouping.
