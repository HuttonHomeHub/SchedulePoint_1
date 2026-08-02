# ADR-0058: Drift control — computed gates and the reconciliation pass

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** Principal Engineer, Technical Lead (documentation rebaseline)

## Context

Over four passes in July 2026 the repository was checked, claim by claim,
against its own code. The findings were not typos. A representative sample:

- `CLAUDE.md` opened by describing a repository with **no application features**
  while nineteen API modules, twenty-five Prisma models and forty-one migrations
  were shipping. That banner had been wrong for months.
- `docs/TESTING.md`, `docs/FRONTEND_QUALITY.md`, `CLAUDE.md` §7 and the pull-request
  template all asserted a **≥ 80% coverage bar**. Coverage had never been
  collectable: `@vitest/coverage-v8` was not installed, so `--coverage` failed
  outright, and CI never invoked it.
- Both vitest configs carried `passWithNoTests: true` with the comment "no app
  tests exist yet (foundation stage)" — beside 2,429 passing tests. A broken
  `include` glob would have turned the suite green having run nothing.
- The frontend docs described **shadcn/ui on Radix**; there is no Radix
  dependency and every primitive is hand-rolled. `docs/DESIGN_SYSTEM.md`
  specified nine components — toasts, tabs, charts, dashboards, pagination and
  skeletons among them — that do not exist. Two documents referenced a
  `lib/telemetry.ts` facade that was never written.
- `docs/API.md` documented the error contract with a **`BILL_NOT_FOUND`** example
  inherited from a predecessor product, and never mentioned that the wire `code`
  is a generic class while the branchable discriminator lives in
  `details.reason` — the single fact a client author most needs.
- The README's CI and CodeQL badges, its clone command and its
  security-advisory link all pointed at `HuttonHomeHub/blank-app`, **a
  repository that does not exist**.

Two observations shaped the decision.

**First: none of this was careless.** Every claim was true when written. The
coverage bar was a real intention; the Radix reference described the plan at the
time; the "no application features" banner was accurate on the day it was
typed. What failed was that nothing was scheduled to notice when reality moved.
Claims rot, silently, and a confident sentence gives no signal that it has
stopped being true.

**Second: reviewers do not catch this class of defect.** ADR-0055 already
recorded the precedent — six contrast defects shipped past a human review, a
component review and a green axe suite, because the class names were correct and
the automated check only ever scanned one theme in one surface. The same shape
recurs here: a document asserting a library that is not installed reads
perfectly. There is nothing to notice unless something checks.

## Decision

**We will treat documentation drift as a defect class with its own gates, and
schedule a reconciliation pass to catch what cannot be gated.**

1. **Prefer a computed gate to a checklist item.** Anything mechanically
   checkable becomes a CI gate, not an instruction someone is supposed to
   remember. Added in this pass:
   - `pnpm check:doc-links` (`scripts/check-doc-links.mjs`) — every relative
     Markdown link resolves. Deliberately narrow: no external URLs (network
     flakiness makes a gate untrustworthy, and an untrusted gate gets ignored)
     and no heading anchors.
   - **Coverage thresholds as a ratchet**, set at the level measured on the day
     rather than at the aspirational 80%. A gate that fails on day one is
     deleted, not fixed.
   - `passWithNoTests: false` in both apps — an empty run is a broken config,
     not a pass.
     These join the gates that already existed for the same reason: the schema
     drift check, the token-contrast matrix, the structural seam test, and the
     flag-off parity suites.

   Added since, on the same principle:

   - `pnpm check:build-contract` (`scripts/check-build-contract.mjs`) — every
     `@repo/*` an app lists in `dependencies` is COPYd and built in that app's
     Dockerfile, and built in the CI e2e job's direct "Build shared packages"
     step (ADR-0019). Three hand-maintained lines per package, and **a local
     checkout cannot see a missing one**: the package already has a `dist/` from
     an earlier build, so everything resolves right up until a clean machine
     builds the image. `@repo/layout` (ADR-0069) shipped with all three absent
     and surfaced as `Cannot find module '@repo/layout'` inside `nest build` —
     an error naming a module that plainly exists, minutes into CI, after a full
     green local gate including both e2e halves. This is the ADR's own thesis
     landing on it: the obligation was written down in a Dockerfile comment and
     the comment was not a gate.

2. **The bar for a gate is that it computes, not that it reads.** A test that
   asserts the _shape_ of a thing beats a reviewer who is asked to look for it.
3. **A reconciliation pass runs at each epic boundary**, with a three-month hard
   floor, following [`docs/RECONCILE.md`](../RECONCILE.md). It covers what no
   gate can: whether prose still describes the system, whether a register row is
   still true, whether an accepted ADR is still unbuilt.
4. **The governing rule is "verify the claim; do not trust the document."**
   Including documents written during a previous reconcile.
5. **Standards for unbuilt capabilities are marked, not deleted.** A section
   describing something we have decided on but not built is labelled
   **_not yet built_**. The standard is still what we want when the work lands;
   what must not survive is the impression that it already has.
6. **The specialist agents are part of the pass.** They are pointed at real,
   unreviewed diffs — see Consequences for what that produced.

## Alternatives considered

- **Just be more careful.** Rejected on the evidence. Four passes found dozens
  of drifted claims written by people (and agents) who were being careful. The
  defect is structural: nothing signals that a true sentence has become false.
- **Gate everything; drop the manual pass.** Attractive, and wrong. "Does this
  document still describe the system?" is not mechanically checkable. So is
  "is this register row still true?" A checker can confirm a link resolves; it
  cannot confirm the sentence around it is honest.
- **A scheduled calendar reminder instead of an epic-boundary trigger.**
  Rejected as the weaker signal: an epic boundary is when the most claims have
  just changed and the context is freshest. The three-month floor exists so a
  long epic cannot defer the pass indefinitely.
- **Rewrite documents to be vaguer, so they drift less.** Rejected outright. A
  document that cannot be wrong cannot be useful either; the specificity is the
  value. The answer to "this precise claim went stale" is to re-check it, not to
  stop making precise claims.

## Consequences

**Easier.** Drift now has an owner, a trigger and a checklist derived from real
findings rather than imagination. Three whole classes of defect — dead links,
schema drift, coverage slide — moved from "hope someone notices" to "CI is red".

**Harder.** The pass costs real time, and most of it is unautomatable reading.
It will also keep finding things, which is uncomfortable but is the point: a
pass that finds nothing has either succeeded or stopped looking, and those are
hard to tell apart from the outside.

**Evidence the agent step earns its place.** Run over nine unreviewed commits,
the specialists found a live `aria-describedby` bug in a file the commit had
only half-migrated, an exported API that could not do the job it existed for,
a latent copy of a just-fixed bug in a sibling primitive that a "one guard
covers both" claim had missed, and an overstated scope claim in `DECISIONS.md`.
Each was invisible to the author, who was the person best placed to see them.

**Neutral.** This ADR does not change any runtime behaviour, any dependency the
application ships, or the CPM engine. It adds one dev-only dependency
(`@vitest/coverage-v8`, first-party Vitest tooling for a provider both configs
already declared) and one repository script.

**New debt.** The coverage floors — API 74%, web 87% — are recorded as _today's_
numbers, not a target. They are a ratchet to be raised, and a future pass should
check they have been.

## References

- [`docs/RECONCILE.md`](../RECONCILE.md) — the pass itself.
- [ADR-0055](0055-designed-chrome-and-canvas-visual-language.md) — the prior art:
  gates that compute, after defects shipped past three human reviews.
- [ADR-0057](0057-real-modules-replace-the-reference-template.md) — the standing
  "keep it in step" obligation that decayed, and its removal.
- [`docs/TECH_DEBT.md`](../TECH_DEBT.md) — the register the pass reconciles.
