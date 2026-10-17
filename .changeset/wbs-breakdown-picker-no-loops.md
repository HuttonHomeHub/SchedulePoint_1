---
'@repo/web': patch
---

Editing a WBS summary, the "Parent WBS summary" picker no longer offers the summaries inside it. It
used to list them and the server then refused the choice as a cycle with a message that named
nothing; the hint now says why they are missing.
