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

## FC-N8, the paint reading: not taken at the gate pass, taken and PASSED the same day

At the gate pass FC-N8 was untaken, and this section said so rather than claiming it passed. What
the code established then was only the shape of the cost:

- `paint.routing-budget.test.ts` is green and unedited.
- `paint.dates-budget.test.ts` and `paint.link-marks-budget.test.ts` are green.

**Taken 2026-09-23, 19:17–19:19 UTC** (product owner, `web` 0.146.0, ADR-0128 panel, Surface Pro,
DPR 1.5, 1912×1114 CSS; full table in `docs/TECH_DEBT.md` #75 item 9). **Week reads 0.00 pp
dropped at both 500 and 2,000, with a 0.00 pp spread** (slowest = fastest = 60.0 fps). Dropped
frames cannot be negative, so that is ≤ baseline + 2.00 pp for any baseline; the same-machine
pre-epic figure (#75 item 7, 2026-09-11, 1912×1148) was also 0.00 pp, so the delta is 0.00 and not
INDETERMINATE, since 0 is not < 0. **Non-vacuity was checked by running it, not by reading**: a
throwaway counting-context test painted the probe's own scene (`buildDrawScene` + `framingFor` at
1912×1114). At Week/2000 it painted 240 centre items and batched chevron triangles (731 `fill()`
calls carrying 1,082 subpaths); at Week/500, 226 centre items. At Fit/2000 it paints **no text at
all** (below the label threshold), so the Fit figure measures bars and links only. The three budget
tests above are still green on `main`. **FC-N8 PASSES.** Its stated limit stands: the pre-epic
figure is from an earlier viewport and the pre-ADR-0151 painter at pitch 28, so the pair spans both
row changes (28 → 52 → 60) as well as the new marks.
