---
'@repo/web': patch
---

The staff console gets its frame: a two-column grid whose spans are assigned by content width
demand, a new order, and mail and retention in one card.

The console laid out in an 896px column inside a 1646px window — 46% of the screen unused, down all
of its 8,781px — while several of its tables looked cramped. Both are the same defect, and the
obvious fix would have made half of it worse: two EQUAL columns are 787px, narrower than the single
column they replace, so every table on the page would have shrunk while the page got wider.

So spans follow content. A section whose body is a table spans both columns and gets 1,438px of
table against today's 798 (+80%); a stat grid and a row of tool buttons pair at 732px each. Measured
same-sitting: the page falls from 8,781px to 7,686px (-12%), the unused margin from 46% to 7%, and
every table is wider at every width from 1280 up.

The order is priority and is also DOM order: conditions first, then what this installation is, then
the tools, then the record. Performance and Diagnostics no longer sit at positions 2 and 3, inert
until a button is pressed, taking ~550px of the best space on the page. "Retention sweeping is
disabled" moves from 562px below the fold to 716px above it.

Mail and retention become one card, since both are rendered from a single response. The card is
titled "Mail and retention" with two headings of equal rank rather than keeping the title "Mail" —
retention is not a kind of mail, and subordinating it would demote the panel an operator goes
looking for by name when they want to know whether the sweep is arming.

`PageGrid` joins the page archetypes, and it never re-orders: no CSS `order`, no dense auto-flow, no
explicit placement, so the DOM sequence stays the reading sequence. A gate refuses all three in the
primitive, verified red against each.
