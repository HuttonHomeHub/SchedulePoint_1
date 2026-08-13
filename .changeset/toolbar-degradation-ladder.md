---
'@repo/web': minor
---

Toolbar: labels now fall one at a time instead of all at once, and the `⋯` empties

The plan workspace's two command rows used to make a single all-or-nothing
decision about labels: either every width-responsive command showed its name, or
none did. They now degrade one command at a time, least important first, and the
order is the exact reverse of the order commands demote into the overflow menu —
so the row can never keep a label on something it values less than a command it
has just hidden.

Tier-3 commands are admitted back onto the row when there is room, which means
the `⋯` button empties on a wide screen and stops rendering entirely. When it
does render it is now the last thing on the row: the Project-finish read-out
moved inside the toolbar (as a non-focusable read-out) so nothing sits to the
button's right.

Two commands merged. **Go to date** is now the caret of **Go to today**, with the
two halves keeping their own availability — going to a date still works on a plan
with no computed diagram. **Keyboard shortcuts** left the command row for the
account menu, where the rest of the application's reference material lives; the
`?` key still opens the same sheet.

The width arithmetic behind all of this was re-measured against a real browser.
Row 2 keeps every label at 1646 px (the width this was reported at), and gains
labels it did not have at 1536 and 1440.
