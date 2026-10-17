---
'@repo/api': patch
---

A restore and a delete of its client or project no longer interleave into an active plan, project or
project calendar under a deleted ancestor: restores lock their ancestors top-down and a client or
project delete locks its own row before it reads its contents, so whichever goes second waits and sees
the first one's result.
