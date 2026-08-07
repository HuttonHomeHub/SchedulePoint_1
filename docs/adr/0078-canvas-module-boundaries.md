# ADR-0078: Canvas module boundaries — layer painters, a per-frame context, and extraction as a gated move

- **Status:** Accepted
- **Date:** 2026-08-07
- **Deciders:** Frontend architecture (product owner approved the decomposition plan and its
  stated defaults)
- **Amends:** ADR-0026 §8 (module structure & composition). **Supersedes** nothing.

## Context

Six files in `features/tsld` carry roughly 10,500 non-blank lines between them. `paintScene` is
one 808-line function spanning **fourteen** comment-delimited layers (verified: the markers are
`-0.5, 0, 1, 2, 2.5, 3, 3.2, 3.2b, 3.5, 3.55, 3.58, 3.6, 3.7, 4` — the review brief said thirteen;
3.2 and 3.2b share a number). One `useEffect` in `TsldCanvas.tsx` fuses five lifecycles across 375
lines. `use-tsld-toolbar-context.tsx` returns a single ~500-line memo.

ADR-0026 §8 already prescribed the structure this drifts from — `render/` as _"layer painters
(grid, bars, edges)"_, **plural**, plus `viewport/`, `a11y/` and `hooks/`, none of which were ever
created. So most of this is not a proposal; it is compliance with an accepted decision that
fourteen accepted features (ADR-0033 through ADR-0065) each drifted from correctly, one at a time,
by adding to the nearest existing place.

Three consequences are already in the debt register, which is the strongest argument that this is
debt rather than taste:

- **`docs/TECH_DEBT.md` #85** carries a standing instruction not to remove two
  `eslint-disable-next-line react-hooks/refs` suppressions until this refactor happens. They are in
  the tree because the file is too large for the compiler's analysis.
- **#76** records two measured hoists inside `paintScene`'s edge block that are unreachable without
  a per-frame context object.
- **#75** wants the draw budget re-expressed and re-measured; today `paintScene` is one function,
  so it can only be measured as one number, with no way to attribute a millisecond to the tails,
  the hatch or the routing.

And one verified structural oddity, the cleanest single justification: `render/link-routing.test.ts`
imports ten symbols — `arrowhead`, `bundleCorridors`, `BUNDLE_TOLERANCE_PX`, `isLaneFreeAt`,
`laneIntervalIndex`, `MAX_CORRIDOR_CANDIDATES`, `routeOrthogonal`, `LaneIntervalIndex` and the
`ARROWHEAD_*` / `FAN_OUT_STEP_PX` constants — **from `./render-model`**. A test file named for a
module, importing exactly that module's surface, out of a file that does not draw the boundary. The
seam is already agreed; only the source disagrees, and a reader trusting that filename is misled
(the ADR-0058 failure class).

## Decision

**1. `paintScene` decomposes into pure layer painters** under `render/layers/`, each taking one
argument: a per-frame **`PaintFrame`** context holding only what is derived once per frame and
shared by **two or more** layers — `byId`, `visibleIds`, `toggles`, `bounds`, and lazily
`rects()` / `laneRows()`. It is a context, not a bag. A new canvas layer becomes a new module plus
one call in the orchestrator, rather than another region of one function.

`rects` and `laneRows` stay **lazy**, preserving today's call ordering exactly. This is deliberate
and slightly uncomfortable: building `rects` eagerly would be invisible to every existing gate,
because `activityRect` makes no `ctx` calls — which is precisely why it must be resisted here and
done deliberately as #76, with its own measurement. A refactor PR that also improves performance
can be reviewed as neither.

The edge layer **returns a value**. Layer 2 collects `lagRuns`, `lagHandlePoints` and
`activeLagHandle` while the anchors are at hand, and layers 3.2/3.2b draw them two hundred lines
later. That is the one place the "layers are independent" story is false, so it becomes explicit —
`paintEdges(frame): EdgeLayerResult`, consumed by `paintLagRuns(frame, edgeResult)` — rather than a
closure variable that silently _is_ the coupling.

**2. `hooks/` and `a11y/` are created; `render/` is formally recognised** as the home of the
viewport and hit-test modules. The first two hold React, which does not belong beside a pure
painter, and `a11y/` gives the ADR-0026 D7 contract a directory you can point at. Viewport and
hit-test are pure geometry that every consumer already imports from `render/`. ADR-0026 §8 currently
describes a tree that does not exist; this clause is what repairs it.

**3. Extraction is a barrel-preserving move.** `paint.ts`, `render-model.ts` and
`tsld-toolbar-items.tsx` remain as barrels exporting exactly what they export today, so the 30
consuming files and their suites are untouched and act as the before/after oracle. **A refactor PR
changes no behaviour, no performance characteristic, and no test assertion.** Permitted test edits
are import paths and file moves; if a step needs an assertion changed, the step is wrong and must be
split. Comments move **verbatim** — these files' comments record defects that shipped, and rewording
one during a move destroys the evidence.

**3a. A correction to the plan's §3.2, found by doing the first move.** The plan describes the end
state as `render-model.ts` = _"BARREL + what is genuinely the model"_ — the types, `activityRect`,
the glyph geometry. That shape **cannot work for `link-routing.ts`**: the routing code uses
`activityRect` eight times plus `screenXOfDay`, `BAR_HEIGHT`, `RectCache` and the core types
(counted, not estimated), so it must import from `render-model.ts` — which re-exports it. That is a
genuine import cycle, and while ES modules tolerate one, a cycle at the foundation of a
decomposition is the wrong thing to build on.

The **order of extraction therefore matters, and the plan's ordering is only accidentally right**.
A module can be lifted only when it depends on nothing that will be re-exported around it.
`working-time.ts` satisfies that (its whole surface needs only `DependencyType`), which is why it
went first. `link-routing.ts` does not, and cannot until the **core model itself becomes a module**
— leaving `render-model.ts` a _pure_ barrel over `geometry`, `working-time`, `link-routing`,
`viewport` and `hit-test` rather than a barrel that also holds code. That is a larger move than one
step and is recorded as such rather than attempted in passing (`docs/TECH_DEBT.md` #106).

**3a-bis. The ordering rule bites again in S2, and it costs three modules the plan did not list.**
S2 is described as three files — `paint-frame.ts`, `layers/shapes.ts`, `layers/text-measure.ts`.
Building it produced **six**, because §3a's rule (_a module can be lifted only when it depends on
nothing that will be re-exported around it_) applies transitively and the plan had not traced it:
`shapes.ts` needs `Ctx2D`, `paint-frame.ts` needs `activityIndexFor` and `DEFAULT_VIEW_TOGGLES`, and
all three were declared inside `paint.ts` — the file that would import the new modules. So
`ctx-2d.ts`, `activity-index.ts` and `view-toggles.ts` are lifted first and re-exported from
`paint.ts`, which is the barrel rule doing exactly what it was written for: **not one consumer or
suite changed an import**, and the 29 render suites (612 tests) pass untouched.

This is worth recording rather than absorbing, because it predicts the shape of every later layer
step: a layer painter needs `Ctx2D`, the palette type and `TsldScene`, and only the first of those
is now a leaf. The remaining two are why `TsldScene` is **not** imported by `paint-frame.ts` — it
takes a structural `PaintFrameScene` of the three fields it actually reads instead. That is a
deliberate, narrower contract, not a shortcut: a per-frame context that needed the whole 400-line
scene interface would make every future layer module depend on `paint.ts` again.

**3b. A second correction from doing, this time to `docs/TECH_DEBT.md` #85 — in its favour.** That
row diagnosed its two `react-hooks/refs` suppressions as a **budget** symptom: the reads had not
changed, the hook had merely grown past what the rule's analysis could follow. That is a falsifiable
claim, and S11 falsified it in the direction that confirms it. Lifting `goToNextConflict` and
`buildDiagramImage` out — about 190 lines — made the rule reach a **third** `canvasControlRef` read
it had never reported, in code the change did not touch. A suppression there would have been the
wrong answer twice over: it is the same shape as the two just removed, and it would have restored
the register entry the step exists to close. The three viewport commands were extracted instead. The
standing rule this sets: **a `react-hooks/refs` report in this tree is a signal to split, not to
silence** — and if a fourth surfaces, the answer is the same.

**4. Where nothing pins a seam, the characterisation test lands first, in its own commit, verified
red.** Three are named: the whole-scene ordered golden log (**C1**, landed), the Escape precedence
table (**C2**), and the ADR-0026 D3 React-render-count invariant (**C3**) — the last of which has
**never** been asserted, though the entire frame budget rests on it.

**5. Most of the remainder is extract-when-touched, deliberately.** The standing rule is: _the PR
that changes a layer extracts it first, in its own commit._ `TsldPanel`'s decomposition (S13) is
**explicitly deferred**, not overlooked: it is the largest file, it owns the a11y contract, and no
queued work requires it.

### Open questions, answered

- **Q2 — golden log form.** Inline snapshot **plus** structural assertions (layer ordering by each
  layer's signature call; per-method call totals). A snapshot alone is easy to re-baseline
  thoughtlessly with `-u`, which is the exact failure ADR-0034's golden strategy warns about; the
  structural half states the invariant in words, so a careless update still trips something.
- **Q3 — one DPR is sufficient.** Verified by reading rather than assumed: within `paintScene`,
  `dpr` occurs exactly twice — the signature default and the single `setTransform`. No layer reads
  it. (`paintWbsBand` uses it twice more, but that is a different painter and outside this golden's
  scope.)
- **Q5 — toolbar `items/` split is per ADR-0031 group**, not per feature flag: the taxonomy is the
  durable axis and flags are temporary by design.
- **Q6 — no file-size lint rule.** Recorded deliberately rather than by omission. Line count is a
  proxy for the thing that actually matters, and a bad rule gets suppressed rather than obeyed — the
  #85 suppressions are the cautionary example sitting in this very tree.

### Scope re-check performed before the first step

The plan's §6 ordering carried a stated caveat: items 1–9 of the 2026-08-06 canvas review were not
supplied to it. Re-checked 2026-08-07 against the committed specs — search navigation (item 5) lands
in `use-tsld-toolbar-context.tsx` and `tsld-toolbar-items.tsx`, confirming **S11 up-front** and
leaving S12's controls extraction to be paid for by that epic under the standing rule; multi-select
(item 6) lands mostly in new `model/` files plus `TsldPanel`, so **S13's deferral holds**.

## Alternatives considered

- **Do nothing** — rejected. Three register items are already blocked on it, and the pattern
  compounds: each accepted feature adds correctly to the nearest existing place, which is how a
  2,200-line file happens without anyone making a bad decision.
- **One big-bang decomposition** — rejected: unreviewable, and it would land the paint layers, the
  hooks and the a11y layer in one diff over the file that owns the ADR-0026 D7 contract.
- **Rewrite the painter** (dirty regions / WebGL / a scene-graph library) — rejected. ADR-0026 §9b
  measured the current substrate passing on real hardware (Dell Precision 5690, 2,016-activity
  imported programme: ~60 fps at Week zoom, ~53 fps at Fit, both PASS against the ≥ 30 fps gate),
  and a rewrite discards the one property — existing suites as the before/after oracle — that makes
  any of this safe.
- **A `DECISIONS.md` entry instead of an ADR** — viable only for a trimmed S0/S1/S2 scope; rejected
  for the full scope, because `PaintFrame` becomes a contract binding every future layer author, and
  because this amends an accepted ADR's §8. A contract nobody recorded is a convention that decays.

## Consequences

**Positive.** TECH_DEBT #85 closes with its two suppressions; #76's two hoists become reachable
one-line changes; #75 gains per-layer attribution; `link-routing.test.ts` stops naming a fiction; the
Escape keymap and the rAF loop become provable in their own suites rather than through `TsldPanel`'s.

**Negative.** More files. A coverage-`functions` denominator that grows — watch it per step and never
lower a threshold to land a refactor (ADR-0058's rule about gates that get deleted rather than
fixed). Merge friction if run alongside an epic in the same files. And a real risk that a mechanical
follow-through spends effort on layers nobody touches, which the extract-when-touched split exists to
prevent and which this ADR records rather than hides.

**What this is not.** Not a substrate change; ADR-0026's Canvas-2D decision stands and its §9 WebGL
escalation criteria remain the documented, unexercised fallback. Not a framework change, not a
state-library addition, not dirty-region repainting. **The CPM engine is not imported and no
migration runs** — `apps/web` has no dependency path to `apps/api`, so the ADR-0034 recalculation
parity gate is untouched **by construction**, not by a test's say-so.

## References

- [`docs/specs/canvas-decomposition/plan.md`](../specs/canvas-decomposition/plan.md) — the
  decomposition design this records.
- ADR-0026 §8 (the structure amended), §9/§9b (substrate, measured).
- ADR-0034 (conformance & the parity gate), ADR-0054/0055/0056 (the counting-stub budget gates),
  ADR-0058 (verify the claim), ADR-0064 §7 (the gate pass whose findings motivate the golden log),
  ADR-0065 (the one-route-function precedent), ADR-0076 (a decision-bearing claim carries its
  evidence).
- `docs/TECH_DEBT.md` #75, #76, #85.
