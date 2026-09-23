# NetPoint-layout M6: the gate pass

**Status:** Landed 2026-09-23. Plan "Milestone M6: Gate pass and the paint reading".

Four specialist reviews read the combined diff of M1 to M5 (`84e94eb5..` the M5 head). Each
milestone had been reviewed on its own already. These reviews looked for what only a combined read
can find: defects in the seams between milestones.

## Verdicts

| Review        | Verdict      | What it found                                                                                                                                                                                                                                                                                                               |
| ------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Performance   | Pass         | Nothing blocking. Link marks are stroked per bucket, never per link. The worker is its own 15.7 kB chunk and is terminated on every exit. The bundle check passes at 428.2 of 437 kB. One suggestion, taken: the search hook sat in `TsldPanel`, so each progress tick re-rendered the whole panel about 16 times a second. |
| Component     | Pass         | Nothing found. Overlap is computed by one function in all three places that use it. `nearestFreeRow` has one implementation. Every new module reads the drawn dates. No export lacks a production caller.                                                                                                                   |
| Accessibility | Pass         | Nothing blocking. The auto-resolve, Arrange and Undo announcements cannot fire from the same write. Every fact the row and the link now paint is spoken in the listbox. The legend keys every new mark. Every new colour pair is gated. Two suggestions, filed as `docs/TECH_DEBT.md` #374 items 6 and 7.                   |
| UX            | One blocking | M5 said **row** on screen where the rest of the product says **lane** for the same thing. Folded (see below). Two suggestions filed as #374 items 1 and 2.                                                                                                                                                                  |

## The one blocking finding

The dialog, the dock offer and the figures said "row". The toolbar item that opens the dialog says
"Auto-arrange lanes". The M3 auto-resolve notice says "Moved … to lane 4". The legend says "Lane
overlap", and the screen-reader sentence says "overlaps another activity in its lane". About fifteen
user-facing strings said "lane" and six said "row", all six added by M5. So M5's copy now says
"lane". No milestone review could have seen this, because each saw only its own half.

## The performance suggestion, taken

`useArrangeSearch` moved from `TsldPanel` into `ArrangeSearchDialog`, a thin host in
`ArrangeDialog.tsx`. The search's state now lives in the dialog's subtree, so a progress tick
re-renders the dialog and nothing else. The dialog itself stays presentational, which is why its
suite still sets every state directly.

## FC-N8, the paint reading: not taken

FC-N8 needs one press of the `canvas-draw` sweep on the product owner's hardware, on the same
machine and viewport as M0-T6, after the epic. That reading has not been taken, and nothing here
claims it passed. What the code does establish is the shape of the cost:

- `paint.routing-budget.test.ts` is green and unedited.
- `paint.dates-budget.test.ts` and `paint.link-marks-budget.test.ts` are green.

The owed reading stays with `docs/TECH_DEBT.md` #75.
