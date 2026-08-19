# Graphite — design brief for review

**Status:** design agreed in principle by the product owner from a full-screen mockup;
this brief exists so the specialist agents can review it and produce the implementation
plan. **The palette is explicitly NOT settled** — see §5.

## 1. What this is

The plan workspace rebuilt as a hybrid of two of the five layout studies: the
**information density** of a P6-style workstation inside the **chrome model** of a
rail-and-drawer application. Chosen by the product owner over four alternatives.

Today's workspace (measured, `measure-output/m4-vertical-stack.json`) spends **240 px
above the canvas at every width** — an app header row, a mode row and two toolbar rows —
leaving the diagram a letterbox above an activities table that owns the bottom third.

## 2. The shape

```
┌────┬──────────────────────────────────────────────────────────────┐
│    │  TOOLBAR  (full width, fixed — see §4a)                       │
│RAIL├────────────┬─────────────────────────────────────────────────┤
│ 46 │  DRAWER    │  STAGE                                           │
│ px │  224 px    │  Gantt: grid 620 │ splitter │ chart              │
│    │            │  Diagram: WBS band + full-width time-scaled plot │
│    ├────────────┴─────────────────────────────────────────────────┤
│    │  STATUS BAR                                                   │
└────┴──────────────────────────────────────────────────────────────┘
```

- **Rail (46 px)** — brand, then the five **modal tools** (Select, Add activity, Link,
  Marquee, Add note; keys V A L M N), then five **panel switches** that change what the
  drawer shows (Explorer, Properties, Resources, Comments, Baselines), then help,
  settings, account.
- **Drawer (224 px)** — the selected activity: Details / Progress / Logic / Cost tabs,
  schedule fields, progress bar, relationships, resources, and the object actions
  (Edit, Duplicate, Report progress, Add note, Delete). **It replaces the modal activity
  dialog**, which today must be dismissed before the diagram is visible again.
- **Toolbar (36 px)** — six groups: History · Schedule · Time · Show · Find · Plan, with
  the two mode segments (Early/Visual, Diagram/Gantt) and the project-finish read-out
  right-aligned.
- **Status bar (24 px)** — activity count, data date, finish, critical count, scheduling
  options, zoom, armed-tool state, save state.
- **Gantt stage** — grid **beside** the chart with a draggable splitter; 8 columns; WBS
  summary brackets, milestone diamonds, progress shading, dashed float tails, routed
  dependency arrows; two-tier month/week scale.
- **Diagram stage** — same chrome; pinned WBS band, named lanes, the plot full width.

## 3. Command placement (all 38)

| Home               | Carries                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Rail · tools       | Select · Add activity · Link · Marquee · Add note                                                                                          |
| Rail · panels      | Explorer · Properties · Resources · Comments · Baselines                                                                                   |
| Toolbar · history  | Undo · Redo                                                                                                                                |
| Toolbar · schedule | Recalculate · Auto-arrange · Level resources                                                                                               |
| Toolbar · time     | Zoom out · Zoom in · Fit to plan · Go to today · scale preset                                                                              |
| Toolbar · show     | View ▾ (structure, markers, columns, panels, month bands, hatch) · Float paths · Baseline · Resource histogram · Over-allocation · Legend  |
| Toolbar · find     | Search · Filter ▾ · Conflicts (with live count)                                                                                            |
| Toolbar · plan     | Calendars · Analysis ▾ · Comments · Share ▾ · Print                                                                                        |
| Toolbar · right    | Early/Visual · Diagram/Gantt · Project finish read-out                                                                                     |
| Drawer             | Object actions — Edit, Duplicate, Report progress, Add note, Delete                                                                        |
| Status bar         | Facts only. **Recalculate stops being a button pretending to be a status** — the ADR-0032 coalesced auto-recalc already runs on every edit |

## 4. Product-owner amendments to the mockup

**4a — The toolbar is FIXED and must not resize with the drawer.** In the mockup the
toolbar sits inside the column to the right of the drawer, so opening or closing the
drawer changes the toolbar's width and re-flows its groups. That is wrong: the toolbar
spans the full width beneath the rail (or the full window width) and its geometry is
**independent of drawer state**. Controls must not move under the cursor because a panel
opened.

**4b — The icon rail moves to the trailing (right) edge; the drawer stays on the
leading (left) edge.** Confirmed by the product owner. The layout is therefore:

```
┌──────────────┬─────────────────────────────────────────┬────┐
│  TOOLBAR — full width, fixed, spans everything (§4a)     │    │
├──────────────┼─────────────────────────────────────────┤RAIL│
│  DRAWER      │  STAGE                                   │ 46 │
│  224 px      │  Gantt: grid 620 │ splitter │ chart      │ px │
│  (left)      │  Diagram: WBS band + full-width plot     │    │
├──────────────┴─────────────────────────────────────────┴────┤
│  STATUS BAR                                                  │
└──────────────────────────────────────────────────────────────┘
```

**Tools on one edge, context on the other.** The five modal tools and the panel switches
sit on the right where the drawing hand reaches them; the drawer stays beside the Gantt
grid on the left, where the activity it describes is.

Reviewers should say plainly if this is wrong. Two specific risks to address rather than
skirt: (i) DOM order versus visual order — the rail is a primary control cluster and must
not become the last thing in the reading order; (ii) a right-edge rail is unconventional
for a left-to-right reading direction and needs an argument better than symmetry.

## 5. The palette is OPEN

A dark graphite scheme was drafted and landed as ADR-0099 M1, with one rule — _cool means
interface, warm means attention_, azure as the only interactive colour, warm reserved for
critical / conflict / today. **The product owner is not settled on it.**

Reviewers are asked to propose a colour scheme fit for a professional construction
planning tool used all day, addressing at minimum:

- Long-session comfort; whether dark, light, or both.
- The **three criticality states** (ordinary / near-critical / critical) which must be
  distinguishable at a glance — the current draft separates them by lightness because a
  hue-only separation measured **1.23:1** and was invisible to a colour-deficient reader.
- Float, baseline, progress, over-allocation, selection, today, and the non-working wash
  — a lot of simultaneous semantics on one plot.
- WCAG 2.2 AA throughout, and the existing computed gate (`token-contrast.test.ts`).
- The constraint that the system is ADR-0097's 31-name vocabulary rebound per surface
  scope — a palette is a set of **values**, and proposing new token _names_ is a bigger
  change that needs its own argument.

## 6. Constraints

- Frontend only. **The CPM engine is not imported and no migration runs.**
- No new `VITE_` flag (ADR-0088 D1: a build-time constant is not an operator rollback).
  Each milestone is one commit, and that is the rollback.
- ADR-0060's per-scope save model and ADR-0061's form-layout primitives still govern the
  drawer's fields — a drawer is a container change, not a permission change.
- ADR-0093 stands: object actions belong on the object.
