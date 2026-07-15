# ADR-0034: Engine conformance & validation methodology

- **Status:** Accepted
- **Date:** 2026-07-15
- **Deciders:** James Ewbank (with Claude Code)

## Context

SchedulePoint's CPM/PDM scheduling engine (`apps/api/src/modules/schedule/engine/`) is the
correctness core of the product, but it is verified only by small, self-authored unit tests. There is
no adversarial regression floor, no evidence-based map of the gap to a P6-class engine, and no
benchmark to revalidate the build-vs-buy decision.

The product owner supplied a **P6-class conformance fixture** — 129 activities, 188 relationships
(FS/SS/FF/SF), 8 calendars (split-shift, 24h, midnight-crossing night shift, window-only), 22
resources, 13 scenarios (each flipping one scheduling option), 18 hostile negative cases, and a
`coverage_index` mapping every feature to the objects that exercise it. Crucially, the fixture ships
**no expected output dates** — it specifies inputs and intended behaviours, deliberately leaving the
oracle open.

Two facts shape the methodology. First, the current engine is **integer working-day** granular and
**ingests no actuals**, whereas the fixture is **hour-granular with progress** — so most of the
fixture is aspirational relative to today's engine. Second, **we do not have Primavera P6** (or any
external CPM engine) to generate golden dates.

## Decision

We will adopt the fixture as a **versioned conformance benchmark and living gap map**, tested in
three tiers with a **no-external-oracle golden strategy**.

1. **The fixture is a north star, not a parity pledge.** We measure the gap to P6-class behaviour and
   prioritise closing it by what SchedulePoint's construction planners actually need; capabilities we
   don't need soon are classified **out-of-scope-for-now**, not failures. The scored assessment lives
   in [`CAPABILITY_MATRIX.md`](../specs/engine-conformance-framework/CAPABILITY_MATRIX.md).

2. **Three tiers of test.**
   - **Structural validation** — engine-free checks (referential integrity, DAG, LOE spans, open-end
     sets, progress sanity, feature-coverage completeness). Computes no dates; runs as a CI gate now
     (`@repo/engine-conformance`, shipped in M0-A).
   - **Differential** — drive the real engine, flip exactly one scheduling option, and assert the
     output **changes** ("a scenario whose dates equal S02's means that option isn't wired up"). This
     proves an option is _implemented_, and needs no oracle.
   - **Golden snapshots** — for behaviours whose correct output is knowable without P6 (see 3).

3. **No-external-oracle golden strategy.** Correct dates are established two ways, never by importing
   into P6:
   - **First principles** for deterministic arithmetic (e.g. `168h` on a 24h calendar = 7 elapsed
     days = a specific instant).
   - **Documented SchedulePoint semantics** for genuinely ambiguous behaviours (retained-logic vs
     progress-override, suspend/resume-after-data-date, SF arithmetic, mandatory-breaks-logic, float
     definitions). We _decide and document_ our intended behaviour in **ADR-0035**, then lock it as a
     self-baselined golden snapshot reviewed on drift.
     An **external oracle** (an open-source CPM engine, a P6 trial, or the fixture author's F9 export)
     is an **optional later confidence check on our own reasoning — never a dependency or a gate.**

4. **Negative-case contract.** Each hostile input must **reject, repair, or report — never hang,
   crash, or silently produce nonsense.** Calendar/lag walkers carry an **iteration cap and a
   "no working time within N years" horizon** (the N11/N16 hang tests). Cycle reports should **name
   the exact cycle members** (N01/N03), not merely "loop detected." Ambiguous-policy cases (duplicate
   edge N04, mandatory-breaks-logic N10, lead-before-data-date N13) are settled in ADR-0035.

5. **TypeScript port for CI; Python is the canonical reference.** The structural validator is ported
   to TypeScript/Vitest so the pipeline stays Node-only; the upstream `fixtures/tools/*.py` remain the
   canonical reference (a parity of verdicts is expected). No Python is added to CI.

6. **Fixture vendoring & regeneration is a reviewed change.** The fixture is vendored in-repo and
   pinned to `schema_version` via a Zod schema; regenerating it into a different shape fails the
   loader tests. Editing the fixture by hand is disallowed.

7. **Repo layout.** Engine-independent assets (fixture, schema, loaders, structural validator) live in
   the shared **`packages/engine-conformance`**; the engine-driving **differential harness** lives in
   **`apps/api`** so it can import the engine directly.

8. **The matrix is living.** Every capability epic (M1–M7) **updates its rows in the capability
   matrix in the same PR** that lands the behaviour, flipping its fixture tags from `todo` to an
   asserting scenario. This keeps the gap map honest over time.

## Alternatives considered

- **Hand-computed golden dates.** Authoring exact expected dates by hand. Rejected: a large
  hand-computed oracle is a liability (its own bug surface), and the fixture author deliberately
  avoided it. First-principles + documented-semantics goldens are narrower and defensible.
- **Require P6 as the oracle.** Gate date-conformance on importing into P6 and running F9. Rejected:
  we don't have P6, and for the genuinely ambiguous behaviours P6 is only _one_ reference, not ground
  truth — "pick a rule and document it" is the honest posture. Kept as an optional later cross-check.
- **Python validator in CI.** Run the upstream `validate_fixture.py` directly. Rejected: adds a
  Python toolchain to a Node pipeline; a TS port integrates with Turbo/Vitest and is engine-adjacent.
- **Fixture inside `apps/api` only.** Simpler single location. Rejected: couples an engine-independent
  asset to the API app and blocks reuse (e.g. a buy-vs-build benchmark of a third-party engine).

## Consequences

- **Positive.** An adversarial regression floor and an objective, source-grounded capability matrix
  exist from M0 with **zero engine risk**; roadmap debate moves from opinion to measurable capability;
  the fixture doubles as a buy-vs-build benchmark. The structural gate blocks a malformed or
  under-covering fixture on every PR.
- **Negative / debt.** Most of the fixture cannot execute until the **hour/shift-granular rework**
  (ADR-0036) lands, so date-conformance coverage grows milestone-by-milestone rather than at once. The
  ambiguous-behaviour goldens encode _our_ judgement (ADR-0035); a wrong call is recoverable
  (self-baselined, reviewed on drift) but should be socialised.
- **Neutral.** Choosing SchedulePoint's own documented semantics over strict P6 parity is a deliberate
  stance recorded in ADR-0035; an external oracle can be adopted later without changing this ADR.

## References

- [Feature spec + implementation plan](../specs/engine-conformance-framework/)
- [Capability matrix](../specs/engine-conformance-framework/CAPABILITY_MATRIX.md)
- The fixture, loaders, and structural validator: `packages/engine-conformance/`
- ADR-0021 (DAG invariant), ADR-0022 (CPM execution), ADR-0023 (date convention), ADR-0024
  (working-day calendars) — the engine foundations this framework measures.
- ADR-0035 (CPM semantics) and ADR-0036 (hour-granular rework) — drafted next (M0-B2).
