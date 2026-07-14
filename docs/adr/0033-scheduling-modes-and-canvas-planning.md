# ADR-0033: Scheduling modes & a de-overloaded plan start — Early/Visual authoring, a Late-Start overlay, advisory `visualStart`, and a mandatory data date

- **Status:** Accepted
- **Date:** 2026-07-14
- **Deciders:** James Ewbank (with Claude Code — feature-analyst)
- **Related:** ADR-0021 (DAG invariant), ADR-0022 (CPM synchronous recalculate),
  ADR-0023 (scheduling date convention / data date), ADR-0026 (TSLD canvas
  rendering & interaction — x derived from computed dates), ADR-0031 (toolbar
  registry), ADR-0032 (canvas-first authoring), ADR-0012 (RBAC + scope),
  ADR-0028 (plan edit-lock pen). Spec:
  `docs/specs/scheduling-model-and-canvas-planning-modes.md`; plan:
  `docs/plans/scheduling-model-and-canvas-planning-modes.md`.

## Context

`Plan.plannedStart` is **overloaded** to mean three different things at once:

1. the **CPM data date** the engine schedules every activity from (ADR-0023 §1,
   `DD = plannedStart`, offset 0);
2. the **canvas pixel day-zero** the TSLD paints against (ADR-0026; ADR-0032 M1
   anchors a start-less plan to `today`); and
3. the target of a **user-facing "pick a date" control** (ADR-0032 M2:
   `use-tsld-toolbar-context.tsx` → `setPlannedStart` → `PATCH /plans`).

Because one field serves all three, a planner who uses the canvas date picker to
_look_ at a period silently **re-baselines the whole schedule** — every computed
date shifts. On a product whose top risk is "CPM bugs erode planner trust"
(PROJECT_BRIEF §17), that is a correctness-of-experience defect.

The overload also **fights the product thesis**. SchedulePoint is a **Graphical
Path Method** tool (PROJECT_BRIEF §1, §22): GPM's essence is that a planner
**places activities by hand** and the tool computes logic-aware float around those
placements. Yet today a body-drag writes an **SNET constraint + recalc**
(`onTsldReposition`, ADR-0023/0032), so the engine immediately overrides the
planner's placement with a computed early date and accretes implicit constraints —
the opposite of GPM.

Finally, `plannedStart` being **optional** forces the ADR-0032 M1 "anchor to
today, first-draw silently pins the start" special-case, spreading null-branches
and a display-only origin through render/create/reposition/recalc.

The engine already computes **both** early and late dates in every run
(`engine/compute.ts` forward + backward passes; columns `early_*`/`late_*` on
`activities`). So "show bars at earliest" vs "show bars at latest" is purely a
client rendering choice over already-persisted data — no engine change is needed
for that. What is missing is (a) a place to persist a **hand-placed** date that the
**pure-network** pass does not schedule from (so it can't corrupt `early*`/float),
(b) a **display computation that honours those placements and pushes dependent
work** — the product owner's ratified requirement (CQ-5) — while (c) **flagging**
when a placement is logically infeasible, and (d) a clean separation of navigation
from data-editing.

## Decision

We will de-overload the plan start and introduce plan-level **scheduling modes**,
keeping the CPM engine a **pure function of logic + explicit constraints**.

1. **Separate navigation from data.** Split the ADR-0032 M2 inline picker into two
   controls: a **Go to date** viewport command (ephemeral pan; no persisted field,
   no request) and an explicit, labelled **Project start** control that owns
   `plannedStart` (a pen-gated `plan:update`). Navigation never mutates the schedule.

2. **Make `plannedStart` mandatory.** The data date becomes **required on plan
   create** and **non-nullable** (`plans.planned_start` migrated to NOT NULL after a
   one-time backfill: earliest active `constraint_date` → earliest `actual_start` →
   plan creation day → today). This **supersedes ADR-0032 M1/D2** (the anchor-to-
   today special-case and first-draw pin) and ADR-0022/0023's `PLAN_START_REQUIRED`
   becomes a create-time guarantee rather than a recalc-time 422.

3. **Introduce a plan-level `schedulingMode ∈ { EARLY, VISUAL }`** (default
   `EARLY`, behaviour-preserving). It selects the **bar-x date source** and the
   **drag semantics**:
   - **Early Start** — bars at pure-network `earlyStart`; a time-drag imposes an
     explicit **SNET** and recalculates (today's behaviour, now mode-scoped).
   - **Visual Planning** — bars at the engine's `visualEffectiveStart` (a placed
     bar sits exactly on its `visualStart`); a time-drag writes `visualStart`,
     **creates no constraint**, and **pushes unplaced successors**. This is the GPM
     authoring mode.

4. **Add a Planner-owned `Activity.visualStart`** (calendar day) as the placement
   input, and compute Visual-mode display via a **two-pass engine model** (CQ-5,
   **product-owner-ratified 2026-07-14 — overriding the analyst's earlier
   record-and-flag-only recommendation**):
   - **Pass 1 — pure-network (unchanged).** The existing forward + backward passes
     over logic + explicit constraints, **ignoring `visualStart`**. Produces
     `early*`, `late*`, `totalFloat`, `isCritical` — still a pure function of the
     network, golden-suite-verified. Source of Early bars, the Late overlay, and
     float.
   - **Pass 2 — effective-Visual (new; forward-only).** A second topological pass.
     For each activity `a`: `effectiveLogicEarliest(a) = clampForwardStart(
constraint, max(0, maxₑ forwardBound(e, pred.propStart, pred.propFinish, Dₐ)))`;
     `displayStart(a) = visualStart(a)` if set (**honoured exactly, never clamped**)
     else `effectiveLogicEarliest(a)`; `propStart(a) = max(displayStart(a),
effectiveLogicEarliest(a))` — the **feasible** finish `a` contributes to
     successors (a conflicted bar pushes from its feasible-earliest, not its illegal
     position; **SQ-b resolved: feasible-finish**). Emits engine-owned
     `visualEffectiveStart/Finish` (what Visual mode renders), so a placed activity
     **pushes its unplaced successors** while a placed successor stays put.

5. **Compute placement conflicts server-side, as engine-owned output.** In Pass 2
   the engine also computes `visualConflict(a) = (visualStart(a) set AND
visualStart(a) < effectiveLogicEarliest(a)) OR (a breaks its explicit
constraint)` and `visualDriftDays(a) = visualStart(a) − earlyStart(a)`
   (pure-network, working days). `visualEffective*`, `visualConflict`, and
   `visualDriftDays` are written by the same batched `unnest` UPDATE as the CPM
   columns — **engine-owned**, never accepted from a DTO, never touching
   `version`/`updated_at` (ADR-0022 property preserved). The canvas paints a
   non-colour-only conflict cue and accessible drift text; **the bar is never moved
   by the tool — stay-and-flag** (SQ-a). Float (pure-network) and drift are shown as
   **separate** read-outs (SQ-c). Explicit constraints still clamp both passes; a
   placement that violates one is allowed and flagged, not blocked (SQ-d). The Late
   overlay reads pure-network `late*` and there is **no effective backward pass**
   (SQ-e).

6. **Late Start is a read-only overlay, not an authoring mode.** A client-only
   `View` toggle shifts bars to `lateStart`/`lateFinish` for float analysis and
   suppresses all editing while on. Authoring at latest dates consumes all float
   (everything becomes critical), so it is deliberately not a mode you build in.

7. **Scope & rollout.** Behind `VITE_SCHEDULING_MODES` (default-off,
   `flagDefaultOff`), layered on the canvas host flags. No role gains/loses a
   permission; `visualStart`/`schedulingMode` reuse the existing activity-update /
   plan-update gates + org scope + pen; the API remains the trust boundary.

## Alternatives considered

- **Record-and-flag only — `visualStart` does NOT push successors.** This was the
  analyst's original recommended default (keeps every date a pure function of the
  network). _Cons:_ it does not deliver the planner's mental model that placing a
  bar moves the work depending on it — the core GPM interaction. **Rejected by the
  product owner (CQ-5 override, 2026-07-14)** in favour of the two-pass push above.
- **Single pass — let `visualStart` clamp the ordinary forward pass** (no separate
  effective pass). _Cons:_ forks the golden-suite-verified `early*`/float outputs
  (they'd depend on placements), reopening the ADR-0022/0023 correctness surface.
  **Rejected** — the two-pass split delivers the push while keeping Pass 1
  byte-for-byte.
- **Auto-clamp an infeasible placement** up to its feasible day (instead of
  stay-and-flag). _Cons:_ silently overwrites the planner's intent — the behaviour
  Visual mode exists to avoid. **Rejected** (SQ-a).
- **Propagate successors from a conflicted bar's displayed (illegal)
  `visualStart+duration`.** _Cons:_ implies an impossible sequence downstream (a
  successor abutting a finish that never legally happened). **Rejected** in favour
  of propagating from the feasible finish (SQ-b) — though the owner may prefer this
  WYSIWYG cascade; **flagged for confirmation**.
- **Visual placement as a "soft constraint"** (a constraint kind the pass ignores
  but the UI flags). _Cons:_ pollutes the honest constraint model (ADR-0023
  constraints _clamp_ the pass); a non-clamping constraint is `visualStart` in
  disguise and risks being mistaken for a real SNET in exports/baselines.
  **Rejected.**
- **Lane + target-date pair.** Functionally identical to `visualStart` but couples
  layout (y, `laneIndex`) and time (x) into one field, breaking the existing clean
  split. **Rejected.**
- **Client-only effective/conflict computation.** The client holds
  `earlyStart`/`visualStart`, but the effective pass + drift need the calendar and
  topological propagation, and forking engine logic violates "correctness is
  server-owned" (ADR-0026). **Rejected** (server-side, engine-owned).
- **Late Start as a full authoring mode.** Consumes all float; rarely the intent.
  **Rejected** in favour of a read-only overlay.
- **Keep `plannedStart` optional** and keep the anchor-to-today hack. **Rejected:**
  the hack is the source of the null-branch sprawl and the display-only origin the
  overload created.

## Consequences

- **Positive:** the canvas date picker can no longer silently re-baseline a plan;
  planners get a genuine GPM authoring mode (Visual Planning) that respects manual
  placement, **pushes dependent work**, and flags logic conflicts — the product's
  headline promise; the **pure-network** Early/Late dates, float and criticality
  remain a pure, golden-suite-verified function of the network; mode/overlay
  switching is a client re-render over already-loaded columns (no round-trip); the
  mandatory data date removes a whole class of null branches.
- **Invariant relaxation — stated precisely.** Visual mode **relaxes** the "bar
  positions are a pure function of the network" invariant **for display only**. It
  is preserved exactly where it matters: **Pass 1 (pure-network) never reads
  `visualStart`**, so `early*`/`late*`/`totalFloat`/`isCritical` are byte-for-byte
  the golden-suite-verified outputs regardless of mode or placement. The
  placement-dependent values live in **separate engine-owned columns**
  (`visualEffective*`, `visualConflict`, `visualDriftDays`) produced by **Pass 2**,
  which is forward-only, deterministic (topological order; feasible-finish
  propagation, SQ-b), and never feeds back into Pass 1. So "correctness is
  server-owned" holds, and the two notions of position — CPM-optimal (Pass 1) and
  as-placed (Pass 2) — are explicit and side-by-side, not conflated.
- **Negative / trade-offs:** a **drag now means different things per mode** — a
  learned behaviour changes (mitigated by a clear mode indicator, an Early mode that
  preserves the old behaviour, and flag-gating); one **irreversible migration**
  (mandatory `plannedStart`) whose backfill must be right (mitigated by the
  documented fallback chain, per-plan logging, and an isolated milestone); **five new
  activity columns** (`visual_start` input + four engine-owned) and one plan column;
  a **second forward pass** per recalc (one extra O(V+E) traversal reusing the built
  graph — within budget, SQ-f); reviewers must understand `visualStart` feeds **only**
  Pass 2, never Pass 1.
- **Supersedes / amends:**
  - **Supersedes ADR-0032 §M1/D2** — the anchor-to-today display origin and the
    first-draw `plannedStart` pin are removed; the render gate (`dataDate !== null`)
    is always satisfied for a saved plan because start is mandatory.
  - **Supersedes ADR-0032 / ADR-0023's "a drop = SNET at the new start" default** —
    that is now the **Early Start** behaviour only; Visual Planning drops write
    `visualStart` and create no constraint.
  - **Amends ADR-0022/0023** — `PLAN_START_REQUIRED` moves to create-time; the
    engine gains a **second forward-only effective-Visual pass** that reads
    `visualStart` and writes four new engine-owned columns (`visual_effective_start/
finish`, `visual_conflict`, `visual_drift_days`) via the same batched write; the
    **pure-network pass and the CPM date convention are unchanged**.
- **Follow-ups / new debt:** an explicit "soft constraint" kind if planners later
  want placement to also participate in the _pure-network_ pass; a per-user
  persisted view-start (CQ-1) if ephemeral Go-to-date proves insufficient; a "list
  conflicts" query/index if a conflicts panel is added.
- **Decisions (ratified, product owner, 2026-07-14):** CQ-1/2/3/4/6 as recommended;
  **CQ-5 overridden to "Visual placement feeds the forward pass,"** delivered by the
  two-pass model above. **SQ-b resolved to feasible-finish** (a conflicted bar
  displays at its illegal `visualStart` but pushes successors from its feasible
  finish, so the conflict stays localised and the downstream schedule never implies
  an impossible sequence) — adopted as the recommended default; **reversible** (a
  one-line change in Pass 2's `propStart`) should the owner later prefer the WYSIWYG
  cascade. SQ-a/c/d/e/f resolved as recorded. ADR **Accepted**.

## References

- Spec: `docs/specs/scheduling-model-and-canvas-planning-modes.md`
- Plan: `docs/plans/scheduling-model-and-canvas-planning-modes.md`
- Code seams: `apps/api/src/modules/schedule/engine/compute.ts` (passes),
  `schedule.repository.ts` (`writeResults` batched `unnest`),
  `schedule.service.ts`; `apps/web/src/components/layout/workspace/use-plan-workspace-model.ts`
  (`onTsldCreate`/`onTsldReposition`), `apps/web/src/features/tsld/toolbar/use-tsld-toolbar-context.tsx`
  (date control), `apps/web/src/features/tsld/render/{to-render-model,render-model,a11y}.ts`
  (bar-x source + cue), `apps/web/src/features/plans/schemas/plan-schemas.ts`,
  `apps/api/src/modules/plans/dto/*`, `apps/api/prisma/schema.prisma`.
- PROJECT_BRIEF §1/§8/§11 (GPM / TSLD-first), §17 (CPM-trust risk), §22 (glossary).
