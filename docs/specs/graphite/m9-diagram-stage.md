# Graphite M9 — the diagram stage: three deliverables already shipped, one defect found

**Status:** landed 2026-08-20 · **ADR:**
[ADR-0099](../../adr/0099-graphite-the-workstation-in-rail-chrome.md) · **Follows**
[`m8-gantt-split.md`](m8-gantt-split.md)

## Re-verifying the problem statement, which is now the third time it has paid

`design.md` §2 asks for: _"**Diagram stage** — same chrome; pinned WBS band, named lanes, the plot
full width."_ `plan.md` adds _"`sceneTopOffset` re-derived, not re-assumed"_.

Checked one at a time, against the code rather than the plan:

| Claim                       | Evidence                                                                                                                                                                                                            | Verdict                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Same chrome                 | The canvas is the shell's stage; M2–M8 gave it the rail, the band, the drawer and the status bar                                                                                                                    | **Already true**             |
| Pinned WBS band             | ADR-0063 shipped it; `wbsBandHeightPx` feeds `sceneTopOffset` today                                                                                                                                                 | **Already true**             |
| Plot full width             | The stage is `minmax(0,1fr)` in the shell grid since M2                                                                                                                                                             | **Already true**             |
| WBS colouring               | `render/palette.ts` carries `wbsCycle` and `wbsInkCycle`, with measured ratios in the comments (4.72 / 5.50, 5.01 / 7.21, 4.82 / 7.03)                                                                              | **Already shipped**          |
| `sceneTopOffset` re-derived | **`git log --since` on `src/features/tsld/render/` returns ZERO commits for the whole epic.** Graphite has not touched the painter at all, and nothing it added renders inside the canvas container above the scene | **Nothing to re-derive**     |
| Named lanes                 | No lane label is painted anywhere; lanes are a numeric `laneIndex`                                                                                                                                                  | **Out of scope — see below** |

**Named lanes are declined, on the epic's own constraint rather than on preference.** A lane name
has to persist, and ADR-0099 says "**Values only, no new structure**" and "the CPM engine is not
imported and **no migration runs**" — a claim made in every milestone entry so far and true of all
of them. Adding a column would also route through the database-architect agent (CLAUDE.md §19.3,
unconditional). The pinned WBS band already names what a lane belongs to, which is the part a
planner reads. Recorded as declined-with-reason rather than quietly dropped.

**This is the third consecutive milestone whose headline work was already done** — M7's dock
re-host (its precondition never happened), M8's §A15 fork (its premise was false since ADR-0059),
and now M9. The pattern is worth naming: this plan was written before M1, and the epic's own
milestones delivered several of its later items on the way past. Working through the list would have
produced three changes that were unnecessary, one of which (the dock re-host) would have reversed
ADR-0092.

## The one real finding: the date pills are painted on top of the first two lanes

The 1646 screenshot taken during M5 shows `Data date` printed across `A1000 Site set…`. It is not a
Graphite regression — `git log -S "DATA_DATE_CHIP_TOP"` dates the constant to **2026-08-07**, twelve
days before this epic began — and it was unrecorded.

The arithmetic, in scene coordinates:

|                  | occupies                                                       |
| ---------------- | -------------------------------------------------------------- |
| cursor date chip | y 4 – 20                                                       |
| Today pill       | y 24 – 40                                                      |
| Data date pill   | y 44 – 60                                                      |
| **lane 0's bar** | y 5 – 23 (`screenYOfLane(0) = originY = 0`, `+ (28 − 18) / 2`) |
| **lane 1's bar** | y 33 – 51                                                      |

So all three pills sit on top of bars whenever lanes 0 and 1 are occupied, which is every plan.
Their own docblocks are careful that the pills do not collide with **each other** — each row is
derived from the one above precisely so a future edit cannot reintroduce that — and none of them
considers the scene underneath.

**Deferred rather than fixed here, and the reason is scope not effort.** The fix is a canvas
_geometry_ change: either the scene's content origin starts below the pill band, or the permanent
pills move into the ruler. `screenYOfLane` is read by hit-testing, dragging, link routing, the
parallel a11y layer and the export path, so moving the origin is an epic's worth of blast radius to
open in the last milestone of another one. Recorded as `docs/TECH_DEBT.md` #148 with this
arithmetic, so the next reader starts from a measurement rather than from a screenshot.

## Gates

No product change, so no new gates. The claims above were each established by a command named
beside them (ADR-0076 §19.10).
