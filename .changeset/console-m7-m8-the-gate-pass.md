---
'@repo/web': patch
---

Fixes from the command console's gate pass.

The pen's focus ring is now visible when the pen is held. Inside the chrome the ring colour and the
pen's own fill are the same amber, and the shared treatment draws the ring inside the control — so
a keyboard planner who tabbed to Stop editing saw nothing at all.

The pen no longer explains itself with the wrong sentence. A reader whose role does not allow
editing was shown a dimmed Start editing accompanied by "No one is editing this plan.", which
answers a different question. It now says what every command beside it says.

The deck draws a mark between its groups again, taller than the one between the sections inside a
group. Deleting the captions removed the only thing separating Author from Plan, and the finer
boundary was left as the only one with a line through it.

The plan workspace stops re-rendering once a second. The pen's relative-time clock had been moved
to the top of the workspace, where it invalidated the whole command surface every tick; it now
produces a new value only when something a reader can see has changed, and stops entirely while the
tab is in the background.
