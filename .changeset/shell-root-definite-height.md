---
'@repo/web': patch
---

Fix the authenticated app shell's root height, which was a minimum rather than a height.

The shell's outermost box was `min-h-dvh`, leaving its computed height `auto` — so every
`flex-1 min-h-0` region beneath it sized itself against its own content instead of the viewport,
and the plan workspace was silently unbounded. The diagram never showed it (a canvas fills whatever
container it is given and cannot report that the container was wrong); the Gantt did, rendering
every row of a plan instead of a viewport's worth.

Long screens are unaffected: they still overflow the shell and scroll the page.
