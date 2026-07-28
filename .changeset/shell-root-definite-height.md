---
'@repo/web': patch
---

Fix the authenticated app shell's height, which was a minimum rather than a height.

The shell's outermost box was `min-h-dvh`, leaving its computed height `auto` — so every
`flex-1 min-h-0` region beneath it sized itself against its own content instead of the viewport,
and the plan workspace was silently unbounded. The diagram never showed it (a canvas fills whatever
container it is given and cannot report that the container was wrong); the Gantt did, rendering
every row of a plan instead of a viewport's worth.

The shell is now exactly the viewport and the workspace region scrolls, so the header and Project
Explorer stay put while long screens scroll their content — rather than the whole page moving the
chrome off-screen.

Also gives the plan workspace's canvas region the minimum height it was already documented to keep.
Without it, a short viewport squeezed the region to nothing while the content inside it could not
shrink, so it overlapped the docked activities panel: the panel stayed visible and enabled, but
clicks landed on the canvas instead.
