---
'@repo/web': minor
---

Canvas multi-select — the bulk operations (`VITE_CANVAS_MULTI_SELECT`, now default on).

A plural selection can now do the three things it exists for. A bulk selection bar appears at two
selected, in the chrome above the diagram rather than floating over it: it names the primary (what
single-activity actions still act on), states **before** a drag that an Early-mode move will pin a
start-no-earlier-than on every selected activity, and shades each action with a reason it is
`aria-describedby`-linked to rather than merely next to.

**Delete** sweeps the set as one batch and undoes as one step — an id-stable batch restore, so the
dependencies _between_ the deleted activities come back with them. **Link in sequence** previews the
order with names and arrows before writing anything, offers Reverse, orders by time rather than by
which bar a marquee happened to touch first, and refuses a chain that would close a loop against the
plan as it stands rather than discovering it half-way through the write.

**Now on by default.** The flag flipped once the flag-on journey ran green against a real API with
the edit lock enforced. It found four things first: the bulk bar was not wired into the layout the
app actually renders; a bulk delete dropped keyboard focus to the page body, which failed WCAG 2.4.3
and silently disabled Ctrl+Z; the "2 activities deleted" announcement was overwritten by the row the
focus landed on; and Reverse persisted into the next preview, so a cancelled reversal could write
the following chain backwards. Set `VITE_CANVAS_MULTI_SELECT=false` to roll back — the selection is
then structurally singular and the canvas, toolbar and accessibility tree are exactly as before.
