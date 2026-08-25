---
'@repo/web': minor
---

One label geometry on the plan's command surface.

The deck's labels sat on two different baselines and the eye tracked the difference along the row. A
plain command stacked its label under its icon while a split-button or popover trigger kept it
beside — nobody chose that, it was one `if` having a side effect on layout. Every control is now
inline: worst within-row label spread falls from 12 px to 3 px, and the deck is 8 px shorter at
1440 and above.

At 1280 the cards wrap from two lines to four, which costs 108 px of diagram height. That trade was
made deliberately, for the alignment win at the widths a plan is usually worked on.

The group captions take the same control height as everything else, which is what a control that
folds its group and holds a tab stop should always have had.
