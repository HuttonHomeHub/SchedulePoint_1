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

## M3-T3 — wired into the workspace

`components/layout/workspace/use-auto-resolve-overlaps.ts` owns WHEN and the write;
`resolveNewOverlaps` still owns WHICH. Every structural handler in `use-plan-workspace-model.ts`
calls `beginLayoutEdit(subjects)` before its write. The recalculation's new `settled` counter (a
success that leaves no edit owed and no run queued) triggers the resolution in an idle callback. The
write goes through the positions batch, is recorded as its own undo step, is announced, and is shown
in the dock's new `layout-resolved` strip.

### Departures from the plan, each forced by the code

| Plan said                                     | Shipped                                                          | Why                                                                                                                                                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `relaneCommand` for one mover                 | `autoArrangeCommand` shape for any number                        | `relaneCommand` coalesces on `relane:{id}` within 500 ms, so a planner nudging the moved bar would fold their edit into the move and one `Ctrl+Z` would undo both.                                                                    |
| lane drop resolved by `nearestFreeRow`        | `resolveLaneDrop`: the next free lane in the direction of travel | The lane a moved bar left is always free to it, so the nearest-lane rule sends `Alt+↓` onto an occupied lane straight back where it started. Written as a unit case that fails against the nearest-lane rule.                         |
| lane drop only                                | a drag that changes date and lane is pre-resolved too            | Left to the settle, rule 1 would take the nearest free lane, which is usually the lane the bar was dragged out of. Resolved against the span it is being dropped at (its drawn length from the dropped day).                          |
| suppressed under the Late overlay             | holds by construction                                            | The snapshot always reads the `visual` basis, so no layout is ever computed on an overlay's dates. There is no gate to forget.                                                                                                        |
| census over the constructors in `commands.ts` | census over every `editHistory.record` site, plus constructors   | A constructor census cannot see an inline command (`linkChain` records one) or a handler that forgot the snapshot. The record-site scan fails on either, and still requires every exported constructor to be recorded from the model. |

### Two findings the unit suite made before the journey ran

1. **A real defect.** The resolver waits while any write is in flight, because the edit-lock heartbeat
   is a write that never settles. The first version tested the `isWriting` captured before it began
   waiting, so it could never see the write finish. It now re-reads the live parameters on every check.
2. **Then its own harness.** The fix passed a mutation that put the defect back. `renderHook` had been
   given the live state object as its first render's props, so every stale closure saw fresh values.
   The harness now passes a copy, and the mutation fails.

Four mutations were each verified to fail exactly their case: replay not noted, notice not withdrawn,
stale `isWriting`, and the pen ignored at settle. The census gate was verified red by deleting the
resize handler's snapshot call.

### The journey

`apps/web/e2e-arrange/auto-resolve.spec.ts`, against a real API with the pen enforced:

1. A `Shift+→` stretch moves **exactly one** lane (the stretched bar's), read back from the API.
2. The sentence appears in both the dock strip and the live region.
3. The strip's `Undo` restores the lane and leaves focus on the diagram's listbox, and the restored
   overlap is not re-resolved.
4. `Alt+↓` onto an occupied lane lands two lanes down, in one write.

Both cases were verified red by running the suite with the resolution disabled and the lane drop
unresolved: 2 failed, 7 passed.

### Review before release (§19.13)

Accessibility and component reviews ran on the uncommitted diff. Between them they raised three
blocking findings, all folded, each with a test verified red first:

1. **A false status message (WCAG 4.1.3).** A diagonal drag that found no free lane above
   announced "the next free lane" for a lane that had not changed. The pure lane move already said
   "No free lane above"; its diagonal sibling did not.
2. **The same sentence, wrong in the other branch.** A drop that also rolled to the next working day
   named the landed lane without saying it was not the one asked for.

   Both were one sentence built in two places (the pointer drop and the keyboard nudge), so it is
   now built once, by `repositionAnnouncement` (`model/reposition-announcement.ts`), and every
   outcome has a case.

3. **`LayoutResolvedStrip` had no test.** Every sibling dock strip has one. The new suite pins the
   message, the absence of a live region, and focus being handed on **before** either button
   removes the strip. Both focus cases fail against the reversed order.

Also folded:

- **Gantt dock.** It stacked this notice and the placement-migration notice, where the canvas ladder
  shows one. It now shows one, in the canvas's order.
- **`usePlanAutoRecalc` memo comment.** It was already false before `settled` joined the dependency
  list, and is corrected.
- **Duplicated rationale.** Four copies of the dialog-snapshot paragraph are now one plus pointers.

Recorded rather than changed:

- `PlacementMigrationNotice` restores focus **after** dismissing, where this strip does it before.
  Both work today, because React removes the node on a later commit. The newer order is the more
  robust one and is the one `UX_STANDARDS.md` states.
- The resolution announces after a network write, so it is not expected to share a frame with the
  recalculation's own settle announcement. Both still go through the one polite region, which
  speaks only the later of two messages set in the same frame, as `use-recalc-outcome-announcer.ts`
  already documents.

### The sweep

`scripts/e2e-sweep.sh` passed 46 of 47 suites against the M3 tree. `authoring` failed once, on an
axe contrast reading for two buttons over a #606f89 background, which looks like a transition caught
mid-fade. The 13-minute scale search was saturating the machine at the time. Re-run alone on the
same tree it passed. It is recorded as unreproduced, not as fixed.
