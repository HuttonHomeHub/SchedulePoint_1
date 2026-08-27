---
'@repo/web': patch
---

The plan command deck now paints every command label at one size. It was painting two: eleven at
14 px and six at 10 px, side by side on the same row.

Two separate causes, and the second was the one nobody had noticed — a command's label grew from
10 px to 14 px **the moment it was shaded**, because the rule that shrank it targeted the last span
in the button and a disabled control gains an extra, invisible one. On a screen with Add note and
Next conflict unavailable, both were rendering larger than Legend beside them.

Measured before and after: the deck stays **two lines and 108 px tall** at 1920 and 1646, so the
larger labels cost the diagram nothing.
