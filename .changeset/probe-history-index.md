---
'@repo/web': minor
---

The staff console's reading history expands the newest sitting and indexes the rest.

Measured first: over fifteen accumulated sittings at 1646, the history was **8,487 px of a
12,842 px page — 66.1 %**, and roughly 3,400 px of that was per-block chrome rather than
measurements (the shared-facts list is a constant 140 px on every block, so fifteen blocks repeat
the same six facts for 2,100 px). The newest sitting now stays expanded and every other becomes one
row in a scannable index carrying when, what, machine, canvas and a verdict tally, each with a
control that moves it into the detail slot.

An index rather than a dropdown, deliberately: a select clears the height just as well and hides the
set, so a reader could not learn how many sittings exist or spot two taken at the same canvas
without opening it — which is exactly the comparison the panel's own comparability note asks them to
make. The canvas is on every index row for that reason.

Measured after, same database and width: the history is **1,666 px** and the page **6,021 px**, a
fall of 6,821 px (12.8 → 6.0 screens). The non-history part of the page is 4,355 px in both
readings, to the pixel, which is what makes the two comparable rather than two sittings apart.

The control on the sitting already shown is shaded with its reason rather than removed or natively
disabled: whether a row is the shown one flips when the reader presses a _different_ row, so a
native `disabled` would blur focus to `<body>` at exactly that moment.
