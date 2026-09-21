---
'@repo/api': patch
'@repo/interchange': patch
---

An export now says when a plan's hand-placed bars will not survive the file.

No interchange format encodes a hand-placement, so the receiving tool reads every activity
at its computed dates. The export report names how many activities are affected, once,
rather than leaving the reader to discover it in the other tool. Nothing changes for a plan
nobody has hand-placed, and no exported byte changes either way.
