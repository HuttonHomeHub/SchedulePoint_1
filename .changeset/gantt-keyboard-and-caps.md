---
'@repo/web': patch
---

The Gantt's row menu works from the keyboard, and two capped views say what they held back.

**Indent, Outdent and Insert activity below could only be reached with a mouse.**
They live only in the row's `⋯` menu — the selection bar cannot carry them — and
nothing opened that menu from the keyboard. `Menu`/`Shift+F10` on the focused row
now does, the same key the Project Explorer already uses.

**And once open, none of its items responded to Enter.** The row claimed that key
for selecting itself, which silently suppressed activation for every item in the
menu, however it had been opened. Pressing Enter on an item now does what
clicking it does.

**Filing a row under a summary now says so**, on success and on failure. It
previously did neither, so a row that failed to move — two planners restructuring
at once is enough — looked identical to one that had not been asked to.

**A chart with more than 40 collapsed sections now says the address could not
carry them all**, instead of quietly re-expanding some after a reload and leaving
the reader to wonder whether they had imagined collapsing them.

Smaller: the `View ▾` panel's checkboxes are large enough to hit accurately on a
touch screen.
