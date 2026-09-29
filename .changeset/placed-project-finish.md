---
'@repo/api': patch
---

"Project finish" now states the placed finish. The schedule summary — the member strip, the
recalculate response and a share link's plan header — reported the network's earliest finish, so a
bar hand-placed past it left the header naming a date earlier than the last bar on screen. It is
now the latest drawn finish (ADR-0148), falling back to the early finish where a row has none.
