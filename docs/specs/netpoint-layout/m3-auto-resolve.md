# NetPoint layout — M3 auto-resolve record

## M3-T1 — `nearestFreeRow`, `rowOccupancy` and the pair sweep

`@repo/layout` gains `nearestFreeRow` (rows by distance from the mover's current row, ties to the
lower row, which is `packLanes`' own tie rule; one past the highest row in use when every row is
blocked). It also gains `rowOccupancy`, the same answer for a cascade, with rows indexed once and
each mover's new row recorded. `nearestFreeRow` is `rowOccupancy` with a throwaway index, so there
is one implementation. `lane-overlap.ts` gains `laneOverlapPairs`, the existing sweep returning pairs,
and `laneOverlapIds` is now derived from it. Its nine existing cases passed **unedited** as the
before/after oracle.

## M3-T2 — the rule, and FC-N5b

`model/auto-resolve.ts`, `resolveNewOverlaps(S0, S1, subjects)`: spec §4.4 as written. Every clause
has a unit case built on the example that motivates it, and three targeted mutations were run
against the implementation, each turning exactly its case red:

| mutation                                           | case that went red                                        |
| -------------------------------------------------- | --------------------------------------------------------- |
| rule 2 moves the subject instead of the other bar  | rule 2 — the recalculation pushes an un-edited successor… |
| a mover's new row is not recorded for the next one | the cascade case, and "moves nobody whose lane and span…" |
| pre-existing overlaps are resolved too             | leaves an overlap that existed before the command alone   |

**FC-N5b — a 50-bar cascade at `scale-2000`, p95 ≤ 2 ms in node: FAIL at 8.8 ms.**
`apps/web/scripts/measure-auto-resolve.ts`: 50 bars spread through `scale-2000` (packed on drawn
spans) are stretched 15 days each, so each collides with its neighbour. That gives 47 moves, and
**0 new overlaps survive**. The run refuses a verdict if either count says the reading was vacuous.

| version                                                                                     | p50 (ms) | p95 (ms) |
| ------------------------------------------------------------------------------------------- | -------: | -------: |
| first draft (re-index and re-parse every bar per mover)                                     |     68.4 |     85.7 |
| bar list built once, movers updated in place                                                |      5.6 |     11.3 |
| sweep only the rows holding changed bars; one row index for the cascade; arithmetic `dayOf` |      4.4 |      8.8 |

What remains is four passes over the whole plan, each about 0.5 ms at 2,160 bars (the sweep, the item
build, the row index, a map), plus allocation and GC jitter. Going under 2 ms would need a row index
kept alive across edits, which is more machinery than a computation that runs once per settled
recalculation warrants. **The committed consequence applies: the resolution runs off the render
path, in an idle callback** (M3-T3). The bar is not moved.
