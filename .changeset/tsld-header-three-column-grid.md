---
'@repo/web': minor
---

Header centring (tsld-toolbar-canvas-refinements M6, unflagged). The org switcher and nav now sit
at the true centre point between the brand and the account chip via a `1fr auto 1fr` grid, instead
of a flex row that merely absorbed leftover space. Centred while it fits, filling when it does
not: a long org name or a crowded nav scrolls internally (`min-w-0` + `overflow-x-auto`) rather
than pushing the account chip off-screen. The org switcher gains a bounded `max-w-[12rem]`
truncating width. DOM order and tab order are unchanged — no behavioural change, only the layout
mechanism.
