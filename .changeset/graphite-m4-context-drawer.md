---
'@repo/web': minor
---

Graphite M4 — the plan workspace gains a context drawer on the trailing edge, resizable and
persisted, and the Project Explorer becomes its first subject rather than a column of its own. The
leading edge is now a fixed 48px tool rail carrying the brand, the organisation switcher, the
drawer's panel buttons, the six organisation destinations and the account menu — none of them behind
a toggle.

The command band's width no longer changes when the drawer opens, closes or is resized. That is a
consequence of where the band sits in the grid rather than of anything measuring it, and it is
asserted in a browser at three drawer states.

Escape closes the drawer as the outermost rung of the workspace's existing key ladder: it defers to
any inner rung that already acted, ignores keystrokes typed into a field, and leaves an open dialog
alone.
