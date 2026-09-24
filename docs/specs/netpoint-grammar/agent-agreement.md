# Agent agreement on the NetPoint-grammar spec and plan

**Status:** in progress. This file records the condition on the product owner's approval
(2026-09-24, [`feature-spec.md`](./feature-spec.md) §5.2): the specialist agents must agree with the
spec and plan before M0 starts.

## Round 1 (2026-09-24)

These agents review the spec and plan:

- ui-architect;
- accessibility-reviewer;
- ux-reviewer;
- component-reviewer;
- performance-reviewer.

Their verdicts, blocking findings and the change that folded each finding are recorded below as they
arrive.

### Verdicts

All five returned **AGREE WITH CONDITIONS**. Between them they raised 15 blocking findings. Each one
was checked against the code before it was folded. The ids below match
[`feature-spec.md`](./feature-spec.md) §4.13.

| Agent                  | Blocking findings                                                                                                                                                                                                                                                 | Folded as                                                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ui-architect           | The node disc hides the arrowhead. `NODE_RADIUS` feeds the layout search (verified at `layout-objective.ts:251`). A 15 px disc reaches into both text rows (verified at `geometry.ts:135-144`). A wrapped name leaves its lane. `lodTier` lands after M3 needs it | A1, A2 (plus FC-G1b and a new M2-T0), A3 (the old M4-T3 moves into M2), A4, A5. Its suggestions are taken as A-n1 (`--canvas-bar`), A-n2 and A-n3                  |
| accessibility-reviewer | The spoken slack and the drawn gap may use different bases. The plate box has no 1.4.11 treatment. The CQ-1 ruling is provisional, with two premises                                                                                                              | X1 (M3 gated on M0-T5 and unifies the basis), X2, X3                                                                                                               |
| ux-reviewer            | LOE and summary bars are as heavy as work. The lag and gap plates look alike. The Gantt is unmentioned                                                                                                                                                            | U1 (spans at half height), U2 (bordered lag plate, borderless gap label), U3 (the Gantt is already inside the canvas scope, verified at `GanttPanel.tsx:974-1004`) |
| component-reviewer     | There is no "Labels" group in `View ▾` (verified at `tsld-toolbar-items.tsx:133,490`)                                                                                                                                                                             | C1 (the switches join `markers`)                                                                                                                                   |
| performance-reviewer   | FC-G7 lacks the walk and wrap budgets. FC-G5 skips 1 px/day. No overview ceiling on direction marks                                                                                                                                                               | P1, P2, P3 (in FC-G5, FC-G7 and M0-T4)                                                                                                                             |

## Round 2

The folded spec and plan go back to the same five agents. Each is asked whether its own findings are
resolved and whether the folds introduced anything new.

### Round 2 verdicts

| Agent                  | Verdict               | New findings                                                                                                                                                                                   | Folded as                                            |
| ---------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| performance-reviewer   | **AGREE**             | none                                                                                                                                                                                           | —                                                    |
| accessibility-reviewer | **AGREE**             | Suggestion only: a unit case for name ink against rim ink                                                                                                                                      | U4 (taken)                                           |
| ui-architect           | AGREE WITH CONDITIONS | B6: four activity-bar consumers would stay blue under A-n1 (Gantt bar, Colour-by lens, WBS band summary, legend swatch), all verified in code. Suggestion: the memo key must include font size | A-n1 amended (full consumer list), A6                |
| component-reviewer     | AGREE WITH CONDITIONS | The `MINIMAP_GROUNDS` bar entry goes stale; `--canvas-bar` needs an `@theme inline` alias and a `token-architecture.test.ts` entry; M2-T1's description still named `globals.css:844`          | A-n1 amended; M2-T1's description corrected in place |
| ux-reviewer            | AGREE WITH CONDITIONS | A3's name-over-node trade-off must be judged deliberately                                                                                                                                      | U4                                                   |

## Round 3

The three agents with conditions check their round-2 folds.
