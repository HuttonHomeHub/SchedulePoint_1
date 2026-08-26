---
'@repo/web': patch
---

Delete `Toolbar`'s vertical variant. ADR-0109 removed the 48px mode rail that was its only consumer,
leaving the `orientation` prop with no caller while `DESIGN_SYSTEM.md` went on documenting the rule
that governed it. The prop, its branches and the standard were removed in one commit so the two
could not disagree about which existed.
