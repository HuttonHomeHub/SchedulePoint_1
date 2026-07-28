# ADR-0057: Real modules replace the reference template

- **Status:** Accepted
- **Date:** 2026-07-27
- **Deciders:** Principal Engineer, Technical Lead (documentation rebaseline)
- **Supersedes:** [ADR-0014](0014-reference-feature-as-non-shipping-template.md),
  [ADR-0015](0015-template-driven-feature-development.md)

## Context

ADR-0014 kept the `ReferenceItem` feature as a non-shipping template after it had
served its original purpose of proving the architecture end to end. ADR-0015 then
made copying that template the **mandatory** starting point for new features, and
put it under CI (`scripts/verify-template.sh` + a "Verify feature template" job)
so it could not silently rot.

Both decisions were right for a repository with **no domain code**. That is not
this repository any more. `apps/api/src/modules/` holds 19 real modules built to
exactly the standard the template describes, several of them considerably richer
than it: org scoping and RBAC, advisory locks, soft-delete cascades with restore
guards, optimistic locking, pen gating, polymorphic parents, session-less guest
auth.

Three costs have become visible:

1. **The template teaches less than the code it models.** `ReferenceItem` is a
   flat CRUD feature over a synthetic table. A contributor copying it gets the
   layering right and then has to discover org scoping, the lifecycle service,
   the advisory-lock convention and the delete-batch pattern from real modules
   anyway — which is where they should have started.
2. **It is a standing obligation.** CLAUDE.md §19 requires the template be kept
   in step "when you change a cross-cutting standard". Every ADR that moved a
   cross-cutting standard since — and there have been many — either paid that
   tax or quietly skipped it.
3. **Its verification script is a liability.** `verify-template.sh` mutates the
   working tree to materialise the template. It destroyed uncommitted schema work
   once (TECH_DEBT #52, fixed 2026-07-27 by backing the file up rather than
   reverting it with `git checkout --`). That fix was sound, but it was effort
   spent protecting a scaffold.

CI verification also bought less than it looked like. It proved the template
still **compiled**; it could not prove the template still **represented** current
practice, which is the property that actually matters and the one that decayed.

## Decision

**We will delete the reference template and name real modules as the exemplars.**

1. **Removed:** `apps/api/examples/reference-feature/`,
   `scripts/verify-template.sh`, and the "Verify feature template" CI job.
2. **`docs/REFERENCE_FEATURE.md` survives, repointed.** Its 300 lines of
   standards — layering, naming, validation, error handling, structured logging,
   auth integration points, database patterns, testing, OpenAPI, the security
   checklist — were never about the template; they describe the standard the
   template happened to instantiate. The document keeps them and now points at
   real code for each one.
3. **The exemplars are named, in order of what you need:**
   - **`modules/clients`** — the canonical shape. Controller → service →
     repository, DTOs, org scoping, soft delete, optimistic locking. Structurally
     what the template was, except real.
   - **`modules/notes`** — the richer instance: a polymorphic parent with a
     fail-closed CHECK, a plan-cascade sweep, and author-ownership checks
     (ADR-0046).
   - **`modules/share`** — the auth-boundary instance: a parallel principal type,
     a token guard, uniform-404 resolution and rate limiting (ADR-0051).
4. **The "must copy the template" rule becomes "must match the standard".**
   Diverging from the cross-cutting patterns still requires an ADR — ADR-0015's
   actual intent, which never depended on a specific file to copy.

## Alternatives considered

- **Re-baseline the template against a current module.** Keeps a domain-free
  starting point. Rejected: it preserves every cost above — the standing
  obligation, the tree-mutating script, the second thing to keep in step — to
  produce a worse copy of `modules/clients`. Re-baselining is also not a one-off:
  it is a commitment to re-baseline again after the next cross-cutting change.
- **Keep it as-is and document that it lags.** Cheapest, and honest. Rejected
  because ADR-0015 makes the template _mandatory_; a mandatory starting point
  that is documented as unrepresentative is a contradiction a contributor has to
  resolve on their own, which is exactly how drift enters.
- **Keep the template but drop the CI verification.** Removes the script
  liability. Rejected: CI verification was the only thing keeping the template
  compiling at all, so this is the "keep as-is" option with faster rot.

## Consequences

**Easier.** One fewer artefact to keep in step with every cross-cutting change.
A contributor starting a feature reads code that is under real tests, carries
real invariants, and cannot be out of date with itself. The working tree is no
longer mutated by a CI script.

**Harder.** The exemplars carry domain baggage a synthetic template did not — a
reader wanting only the shape must ignore the scheduling specifics. Named
exemplars can also go stale in a subtler way: a module can be refactored away or
cease to be representative without anything failing. `docs/REFERENCE_FEATURE.md`
names three, which makes total staleness unlikely, and the tech-debt reconcile
(2026-07-27) is where that gets checked.

**Neutral.** ADR-0014 and ADR-0015 are marked superseded, not deleted — the
reasoning that a phantom `reference_items` table should not ship, and that
features must follow one standard, both still hold. Only the mechanism changes.

**Follow-up.** `docs/examples/example-manage-items.md` is a worked example built
on the template's vocabulary; it is retained as an illustration of the _delivery
process_ (spec → plan), which is what it actually demonstrates, with a note that
its subject feature never existed.
