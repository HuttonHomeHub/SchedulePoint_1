# ADR-0059: The Gantt view's rendering substrate, and the view seam

- **Status:** Accepted
- **Date:** 2026-07-28
- **Deciders:** Technical Lead, Product Owner
- **Spec:** [`docs/specs/gantt-view/`](../specs/gantt-view/feature-spec.md)

## Context

The Gantt view is the last outstanding Must-have in
[`PROJECT_BRIEF.md`](../PROJECT_BRIEF.md) §8. Its purpose is not planner preference —
SchedulePoint's thesis that the **TSLD is the primary editing surface** stands — but that
**the people a planner reports to do not read logic diagrams.** Today the only way to hand a
site manager, a QS or a monitoring surveyor something they recognise is to export to XER and
open it in the tool we exist to replace. We built a read-only share door (ADR-0051) and put a
TSLD behind it.

Two decisions have to be made before any of it can be built, and both are easy to get wrong by
analogy.

**First: what does a Gantt bar chart render on?** ADR-0026 chose **Canvas 2D** for the TSLD after
a prototype-at-scale gate, and accepted a significant cost to do it: a parallel focusable DOM
layer built for no reason other than to make a canvas accessible. The precedent is strong, recent
and ours, which is exactly what makes it dangerous — "the TSLD is canvas, so the Gantt is canvas"
is an argument from familiarity, not from the problem.

**Second: where does the view live?** ADR-0031 §296 reserved a `view-mode` slot in the toolbar
registry, registered hidden (`isVisible: () => false`), with a documented promotion condition:
"once more than one _view_ exists". ADR-0055 §8.4 then decided **not** to ship a
`Gantt | Network` segmented control, because half of it would have been inert. Both remain in
force and both have to be addressed rather than quietly stepped over.

## Decision

**1. The Gantt renders as virtualized DOM rows, not Canvas 2D.**

ADR-0026's reasoning does not transfer, because the problem is not the same one:

|                       | TSLD (ADR-0026)                               | Gantt                                         |
| --------------------- | --------------------------------------------- | --------------------------------------------- |
| Items visible at once | Thousands, all at arbitrary 2-D positions     | One bar per row; rows bounded by the viewport |
| Geometry              | Routed link paths between arbitrary endpoints | One rectangle per row on a shared axis        |
| Scroll model          | Free pan/zoom in two dimensions               | A vertical list plus a horizontal time window |
| Accessibility         | A parallel DOM layer, built by hand           | Native — the rows _are_ the semantics         |

Row virtualization bounds the live node count to what fits the viewport — roughly forty rows —
whether the plan holds 200 activities or 20,000. The canvas argument is an argument about
unbounded simultaneous items, and virtualization removes that premise. Choosing canvas here would
import ADR-0026's accessibility cost to solve a problem the DOM solves for free.

**2. The time axis is shared, not reimplemented.** `render/time-scale.ts` — including ADR-0056's
range-anchored `pxPerDayForPreset(level, width)` — is consumed as-is. A second date→pixel
implementation is precisely how two views drift into disagreeing about where a Monday is.

**3. The Gantt is a peer view behind the reserved slot.** `view-mode` is promoted from a hidden
stub to a real segmented radiogroup (TSLD | Gantt), and the choice lives in the URL
(`?view=tsld|gantt`) so it is deep-linkable and survives a reload — the ADR-0053 M6 precedent that
list and view state belong in typed search params. One view at a time, full width.

**This amends ADR-0055 §8.4.** That decision's stated reason was an inert half; its condition — a
second real view — is now met for Gantt. `Network` remains unbuilt and stays out of the control.
The amendment is recorded here rather than left as a silent contradiction.

**4. The first ship is read-only** (spec Q1), **with no dependency arrows** (Q2). Editing is a
later, separately-gated milestone; the brief says "read-primary", and building the editor first
would invert that on the evidence of nothing. Arrows are excluded because arbitrary link routing
is the very thing that forced canvas on the TSLD — drawing them would drag the rejected substrate
back in through the side door.

**5. Behind `VITE_GANTT_VIEW`, default off**, with flag-off parity suites kept as the rollback
contract (ADR-0053 M6).

## Alternatives considered

- **Canvas-2D bars beside a DOM grid.** Reuses `paint.ts` and matches the house style. Rejected:
  it requires synchronising two independent scroll models pixel-for-pixel, and grid/bar desync is
  the defect class a user spots in the first second. We would be choosing that risk voluntarily,
  and paying for a second hand-built accessibility layer to do it.
- **Extend `ActivitiesTable` with a bar column.** The grid half already exists. Rejected on three
  counts: the table **is not virtualized** (verified, not assumed); a bar inside a `<td>` cannot
  pin columns while the time region scrolls horizontally; and eight other features already depend
  on that component, so the Gantt's lifecycle would be entangled with theirs.
- **A third-party Gantt component.** Rejected on the standing argument recorded in the
  engine-conformance spec: we own the scheduling semantics precisely so we are not bound to a
  vendor's interpretation of them. Our CPM outputs would have to be marshalled into someone else's
  model, and the component would fight the design system on every token — the one-off styling
  ADR-0055 exists to prevent, imported wholesale.
- **A separate `/gantt` route.** Rejected: the app shell (ADR-0029/0030) mounts once and owns
  selection; a sibling route would duplicate that and lose selection on every switch.

## Consequences

**Easier.** No backend work: every field the view needs — `earlyStart`/`earlyFinish`/`lateStart`/
`lateFinish`, `totalFloat`, `freeFloat`, `isCritical`, `parentId`, `percentComplete` — is already
computed, persisted and exposed. No schema, no migration, no endpoint, no permission, no new trust
boundary. Accessibility is largely structural rather than bolted on. WBS hierarchy (ADR-0038) and
the baseline variance bar (ADR-0025, deferred "until a Gantt exists") each finally get their
surface.

**Harder.** Row virtualization is new ground on this side of the codebase — the navigator tree
(HN-C2) is the only existing pattern, and the activity table has none. The shared-scroll shell is
the single hardest piece of M1 and the one most worth testing.

**Neutral — and structural.** The **CPM engine is not imported, not called and not changed.** The
Gantt reads persisted computed columns, so the ADR-0034 recalc parity gate is untouched by
construction, in the same sense as ADR-0052 and ADR-0054. A diff in this epic that breaks that
property is out of scope by definition.

**Risk accepted.** A Gantt that is pleasant to use will pull some planners away from the TSLD, and
the brief's §7 metric for exactly that ("≥ 70% of editing sessions in the TSLD") **cannot be
measured** — it depends on view-mode telemetry, and no telemetry facade exists (ADR-0058 records
why two documents claimed one). We ship read-only first, keep the TSLD as the default view, and
record the metric as unmeasurable rather than pretending otherwise.

## References

- [`docs/specs/gantt-view/feature-spec.md`](../specs/gantt-view/feature-spec.md) — the approved spec
- [`docs/specs/gantt-view/implementation-plan.md`](../specs/gantt-view/implementation-plan.md) — M0–M6
- [ADR-0026](0026-tsld-canvas-rendering-and-architecture.md) — the canvas decision this one declines to inherit
- [ADR-0031](0031-tsld-toolbar-registry-and-taxonomy.md) §296 — the reserved `view-mode` slot
- [ADR-0055](0055-designed-chrome-and-canvas-visual-language.md) §8.4 — amended here
- [ADR-0056](0056-tsld-time-axis-legibility-and-preset-framing.md) — the shared time axis
- [ADR-0038](0038-wbs-activity-hierarchy.md) / [ADR-0025](0025-baselines-snapshot-and-variance.md) — the surfaces this unblocks
