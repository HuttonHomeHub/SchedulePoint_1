# ADR-0099: Graphite — workstation density in rail chrome

- **Status:** Accepted (design direction); milestones accepted individually
- **Date:** 2026-08-19
- **Deciders:** Product owner (chose the direction from five layout studies), Claude

## Context

Four consecutive epics (ADR-0090, 0091, 0092, 0094) worked on the plan workspace's
command surface and each one asked the same question: **does the row fit?** The answer
was always "nearly", so the answer was always to shave. ADR-0097 Landing C proposed the
one genuinely different shape and killed it with a **width** criterion — 120 px of
slack — which a menu-driven design cannot win on and a row-shaped design always can.
The instrument could only ever select the incumbent.

The register recorded the symptom four times ("fourth consecutive epic whose width
expectation its own measurement contradicted") and read it as an estimation problem. It
was not. Four identical failures are evidence that the **frame** is wrong.

What settled it was looking. `scripts/shoot.mjs` has existed since ADR-0097 and its own
docblock says numbers cannot tell you a screen is ugly — and its shot list covered nine
screens and **not the plan workspace** (repaired in `6282066`). The first correct
screenshot showed what no measurement had reported: the diagram is a letterbox between
192 px of chrome and a table owning the bottom third, five controls are dead on arrival
before the pen is taken, and the loudest thing on the canvas is the weekend hatching.

Five layout studies were then drawn and put to the product owner, who chose a hybrid:
the **information density** of the P6-style workstation inside the **chrome model** of a
rail-and-drawer application.

## Decision

We will rebuild the plan workspace as **Graphite**:

**D1 — No top bar.** A 38 px icon rail on the leading edge carries the brand, the five
modal tools (Select, Add, Link, Marquee, Note) and the panel switches. Chrome above the
stage becomes one 29 px toolbar plus the 26 px time scale, against 192 px today.

**D2 — One context drawer, 186 px.** It shows the selected activity's schedule, logic,
resources and cost, and switches subject with the rail's panel buttons (Explorer,
Properties, Resources, Comments, Baselines). It **replaces the modal activity dialog**,
which today must be dismissed before the diagram is visible again.

**D3 — One toolbar strip carrying every command.** Grouped History · Schedule · Time ·
Show · Find · Plan, with the two mode segments and the project-finish read-out
right-aligned. Modal tools are NOT in it — they are modes and live on the rail. Object
actions are NOT in it — ADR-0093's rule stands, so they live on the object, in the
drawer and on right-click.

**D4 — A status bar.** Activity count, data date, finish, critical count, scheduling
options, zoom, save state. It is where `Recalculate` stops being a button pretending to
be a status: the coalesced auto-recalc (ADR-0032) already runs on every edit.

**D5 — The Gantt grid sits BESIDE the chart**, not stacked above it, split by a
draggable divider, with a two-tier month/week scale, WBS summary brackets, milestones,
progress shading and float tails.

**D6 — The palette is graphite with one rule: cool means interface, warm means
attention.** Azure is the only interactive colour, so anything blue is pressable or
selected; warm is reserved for the schedule speaking (critical, conflict, today).
Nothing else in the interface is saturated.

**D7 — Values only, no new structure.** ADR-0097's 31-name vocabulary rebound per
surface scope is kept exactly as it is. Graphite redefines the `page`, `chrome`, `panel`
and `plot` families' _values_; `REBOUND_NAMES`, the closure derivation and the
`[data-surface]` mechanism are untouched. That is what makes this affordable at all.

### The palette, and what measuring it changed

Computed before anything was drawn (`token-contrast.test.ts` extended to cover it). Two
of the first choices failed, one of them badly:

| Pair                         | First try  | Shipped    | Why it matters                                                                                                                                                                                                                                                |
| ---------------------------- | ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical vs non-critical bar | **1.23:1** | **3.32:1** | The two differed in hue and almost nothing else — the single most important distinction in the product, invisible to a colour-deficient reader, a poor monitor, or a glance. Critical went lighter and non-critical darker so they separate on **lightness**. |
| Label inside a critical bar  | **3.77:1** | **7.27:1** | White on the red failed AA. Critical bars carry a near-black label; every other bar carries white.                                                                                                                                                            |
| Selection ring on a bar      | **1.18:1** | **6.12:1** | No single ring colour clears both bar fills, so the ring sits **outside** the bar on the stage ground.                                                                                                                                                        |

## Alternatives considered

- **Keep shaving the row** (the ADR-0090/0091/0094 path) — four epics of evidence that it
  converges on a tidier version of the same problem. Rejected.
- **The other four layout studies** — P6 clone (most usable, looks its age), the old
  SchedulePoint (safe continuity, cards waste edge space), floating pills (demo winner,
  hardest to live in), bento board (a different product for a different reader). Each is
  drawn in the layout studies; the product owner chose the hybrid.
- **A light Graphite** — deferred, not rejected. The mechanism ADR-0097 kept alive is
  exactly for this, and the cost is stated there: a light twin needs its plot separations
  **re-derived, not re-tinted**.

## Consequences

- ~~The width ladder, band floors, hysteresis, `CHROME_RESIDUAL_PX` and the `⋯` overflow
  built by ADR-0090/0091 become unnecessary and are deleted with the row they served.~~
  **Corrected 2026-08-20 by M5-T1's measurement** (`docs/specs/graphite/m5-t1-measurement.md`):
  they are **kept**. The reduced strip does not fit at 768, 960, 1280 or 1440 — and the result is
  non-monotonic, because a `▾` trigger is icon-only in a narrow band and labelled in a roomy one, so
  the strip is cheapest where it has least room and dearest where it has most. A ladder is what
  makes one row fit across a width range, and 768–1920 needs one. The sentence above was written
  from the mockup, before M0 measured anything; it is struck rather than deleted because the
  epic's own record is that width expectations here have been contradicted by their own
  measurements six times, and the seventh should be visible.
  What M5 still delivers is three command rows becoming one. The `e2e-toolbar-fit` gate is
  rewritten around the single strip rather than retired.
- ~~`ADR-0031`'s seven-group taxonomy survives as the toolbar's grouping; its three-tier
  prominence model does not, because a single strip that fits has nothing to demote.~~
  **Corrected 2026-08-20 when M5 landed.** The taxonomy survives; so does the tier model, for the
  same reason the ladder does — the strip's protasis ("a single strip that fits") is false, and
  the apodosis went with it. Struck in place for the reason the bullet above is: this is the
  **seventh** width expectation in this register contradicted by its own measurement, and the
  seventh should be as visible as the sixth.
- **M5's real cost, measured rather than predicted, is that eleven pinned `render` items now
  share one budget** (`docs/specs/graphite/m5-command-strip.md`). Two consequences follow, both
  found by journeys rather than by reading. The strip stops fitting outright below ~900 px and
  scrolls there instead, so `e2e-toolbar-fit`'s `PINNED_FLOOR_WIDTH` rises 768 → 960
  (`docs/TECH_DEBT.md` #147, with the two candidate narrowings and their measured values). And
  `ToolbarItem.priority`, which defaults to `-order`, **stops being an inert convenience and starts
  deciding what a planner can reach** — it dropped `Next conflict` and `Recalculate` off the row,
  each of which is now ranked deliberately with its reason in the registry.
- The activity dialog's _content_ moves to the drawer. ADR-0060's per-scope save model
  and ADR-0061's form-layout primitives still apply — a drawer is a container change,
  not a permission change.
- `brand` and `auth` (the signed-out screens) are **out of scope for now** and keep
  today's values. They are deliberately theme-invariant already (ADR-0077 §8), so they
  do not break; revisiting them is a later slice, and this ADR does not pretend
  otherwise.
- **The CPM engine is not imported and no migration runs**, so the ADR-0034 recalculation
  parity gate is untouched by construction.

## References

- Layout studies and the chosen hybrid — the design artefacts put to the product owner.
- ADR-0090/0091/0092/0093/0094 — the command-surface epics this supersedes in shape.
- ADR-0097 — the surface-scope vocabulary this reuses, and the single-theme decision.
- ADR-0032 — the coalesced auto-recalc that makes `Recalculate` a status, not a button.
- ADR-0093 — object actions belong on the object; unchanged here.
- `6282066` — the screenshot harness repair that made the problem visible.
