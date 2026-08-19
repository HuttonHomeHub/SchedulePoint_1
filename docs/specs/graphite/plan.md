# Graphite — implementation plan

Design accepted 2026-08-19 (ADR-0099). Sliced so **every milestone ends with a
screenshot you can look at**, because that is the feedback loop whose absence
produced the four epics this replaces.

`scripts/shoot.mjs --only plan-workspace --width 1646` after each one.

| #      | Milestone                                                                                                           | Lands                                            | Risk                                         |
| ------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------- |
| **M1** | **Palette** — Graphite values for `page`, `chrome`, `panel`, `plot`; contrast matrix extended to the new pairs      | The whole app changes colour; no layout moves    | Low. Values only, no structure (ADR-0099 D7) |
| **M2** | **Rail** — 38 px icon rail; brand, 5 modal tools, 5 panel switches, account                                         | Top bar deleted; rail is the only nav            | Medium. Touches the shell                    |
| **M3** | **Drawer** — 186 px context panel; activity schedule/logic/resources/cost                                           | Replaces the modal activity dialog               | Medium. Reuses ADR-0060 scopes               |
| **M4** | **Toolbar** — one strip, six groups, modes + finish read-out right-aligned                                          | Deletes the ladder, band floors, hysteresis, `⋯` | Medium. Rewrites `e2e-toolbar-fit`           |
| **M5** | **Status bar** — counts, data date, finish, zoom, save state                                                        | `Recalculate` becomes a state                    | Low                                          |
| **M6** | **Gantt split** — grid beside chart, draggable, two-tier scale                                                      | Grid/chart layout change                         | Medium                                       |
| **M7** | **Diagram** — WBS band, named lanes, routed logic, float tails                                                      | Canvas paint only                                | Low. Painter already does most of it         |
| **M8** | **Gate pass** — the five specialist reviews over the combined diff, flag-on journeys, screenshots at 1646/1440/1920 |                                                  | —                                            |

## Sequencing rules

1. **M1 first and alone.** It is reversible in one commit and proves the token
   layer carries the design before anything structural moves.
2. **No new `VITE_` flag.** ADR-0088 D1 established a `VITE_` constant is inlined
   at build time and is not an operator rollback; the rollback is a commit
   boundary, and each milestone is one.
3. **`brand` / `auth` are out of scope** — the signed-out screens keep today's
   values and are revisited after M8.
4. **The CPM engine is not imported and no migration runs.**

## Open, and deliberately not blocking

- A **light** Graphite. Deferred, not rejected (ADR-0099). The plot separations
  must be re-derived rather than re-tinted, which is design work, not a swap.
- Whether the activities **table** survives as a bottom panel in the diagram view
  or becomes a rail panel. M3 will answer it from use, not from argument.
