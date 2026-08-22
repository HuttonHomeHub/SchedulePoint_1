# ADR-0105: A register row is not a spec, and the trigger is capability-shaped

- **Status:** Accepted
- **Date:** 2026-08-22
- **Deciders:** Product owner, who raised it after the second occurrence in one session.

## Context

`docs/PROCESS.md` opens _"the single, repeatable method for introducing **any** new requirement or
feature"_ and states the golden rule as **understand → design → plan → get approval → build**. It
contains no exemption for a defect fix: its only mentions of bug fixes concern regression tests and
changeset types.

In practice a different rule has been operating, unwritten: **a row in `docs/TECH_DEBT.md` has been
treated as standing in for the spec**, on the reasoning that the row already contains the problem
statement and the diagnosis. That reasoning is sound for a genuinely contained fix and wrong the
moment the work grows a surface — and the person deciding which case they are in is the person
about to skip the step.

It failed twice in one session. The second time (`docs/TECH_DEBT.md` #165a, ADR-0104) the work grew
from "withhold a panel" into a shell contract change, a component's prop contract, a new Playwright
suite, a new CI step, a `tsconfig` change and a change to a shared gate script — 22 files across
three code areas — with no Feature Spec and no Implementation Plan. Sharper than the general rule:
**the parent epic's own approved spec says of the milestone that produced #165 that its output is
register rows _"and the work it may generate is specified after it runs"_.** The approved document
committed in writing to specifying it.

The product owner's instruction was to write the rule down so it stops being a judgement call, and
to derive the trigger from **measured evidence rather than instinct**.

## Decision

**We will state, in `docs/PROCESS.md`, what a register row does and does not substitute for, and
gate the full spec on what a change adds rather than on how big it is.**

> A row in `docs/TECH_DEBT.md` may stand in for stages 1–2 **only while the change stays inside the
> behaviour that row describes and adds no new surface.** The full Feature Spec and Implementation
> Plan become mandatory — regardless of size, and regardless of the work having started — the moment
> the change does any of:
>
> - adds or changes a **user-facing entry point**;
> - adds or changes a **Playwright config or a CI step**;
> - changes a **component's public contract** (a prop's type or optionality) or a **shared gate**;
> - touches the **schema** (which additionally requires `database-architect`, ADR unconditional).
>
> Crossing a trigger mid-flight is not a reason to carry on: it is the point at which the work stops
> and the spec is written.

**The trigger is not size, and that is the measured part.** All 181 non-release commits on `main`
were classified by whether the work carries a `docs/specs/` entry:

|                 | n   | median files | p25 | p75 |
| --------------- | --- | ------------ | --- | --- |
| **with a spec** | 78  | 48           | 21  | 80  |
| **without**     | 103 | 7            | 2   | 21  |

The distributions overlap badly. **At its best threshold (≥ 40 files) a size rule still
misclassifies 41 of 181 changes — 23%.** A file-count trigger would therefore be a judgement call
wearing evidence's clothes, and this ADR would have proposed one had it not been measured.

**The strongest single predictor is adding or changing a Playwright config: at least 93%.**
Twenty-eight changes do; **26 belong to work that carries a spec**, against a base rate of 43%.
That is what generalises to the clause above: **a new journey means a new capability or surface**,
and it is the surface that earns the spec, not the diff.

**The proxy undercounts, twice over, and that is worth stating because it decides the next
section.** Classifying by "did this commit touch `docs/specs/`" misses every **milestone commit of
an already-spec'd epic** — the spec exists, it was written earlier, and the commit does not touch
it. Checking the five apparent exceptions found three were exactly that (ADR-0032, ADR-0033,
ADR-0051).

**The remaining two are unresolved, and an earlier draft of this ADR got them wrong.** It described
both as "gate or harness hardening" and rested a decision on that. Checking the claim — rather than
its commit subject — showed it is false: one changes product code (`config/zod-jitless.ts` and two
query hooks), the other changes backend authorisation (`auth-context.service.ts`, `principal.ts`,
`plan-lock.service.ts`), and **both also add a Playwright config and a CI step**, so by the rule
above both plainly needed a spec. Whether they had one is **not established**: grepping the specs
for their ADR numbers proves only that an ADR is mentioned somewhere, which is not the same claim.
So the honest figure is _at least_ 26 of 28, and the two are either milestone commits like the
other three or two further instances of this failure. Recorded as unresolved rather than rounded in
either direction — in an ADR about unverified claims, which is where it would have done the most
damage.

For reference: #165a added a Playwright config, added a CI step and touched three code areas. It
sits in the 93% bucket, and was placed in the 7% bucket without anyone saying so.

## Alternatives considered

- **No exemption at all — full spec for every change touching application code.** Rejected as
  disproportionate: 103 of 181 historical changes carry no spec and most are correctly small.
  Enforcing it universally is how a process stops being followed rather than how it starts being
  followed.
- **A file-count or blast-radius threshold.** Rejected **on the measurement above**, not on taste.
- **A narrower trigger (entry point and schema only).** Rejected: it would not have caught #165a,
  which added a Playwright config and a CI step without a new entry point — i.e. it fails on the
  case that prompted the rule.
- **A carve-out for gate and harness hardening.** Rejected, and the reason changed while this ADR
  was being written. It was first rejected as premature; then the two commits said to have that
  shape were opened, and **neither has it** — one changes product code and one changes backend
  authorisation. So the carve-out has no established instance at all, and "this is only tooling" is
  precisely how #165a was reasoned about. It is not written.

## Consequences

- **Small contained fixes are unchanged** — the common case keeps its register row and no ceremony.
- **The decision moves from judgement to observation.** "Did this add a Playwright config?" is
  checkable by anyone, including in review; "was this significant?" was not.
- **The trigger can fire mid-flight, and that is the point.** The clause says so explicitly, because
  #165a did not look like spec-work when it started and did by the time it finished.
- **It is a process rule with a review-time prompt, not a computed gate — and the reason is
  arithmetic rather than preference.** The obvious structural check is "a PR that adds
  `playwright.*.config.ts` must touch `docs/specs/`". **That would fail 26 of the 28 historical
  cases**, because a milestone commit of an already-spec'd epic touches no spec file — the same
  property that made the proxy undercount above. A gate that red-lights the compliant majority is
  not a gate; it is a gate that gets deleted (ADR-0058's own standing observation about a check that
  fails on day one).

  So the instrument is the **pull-request template**: a line naming the `docs/specs/` path this
  change belongs to, or stating which trigger it does not fire. It is checkable by a human in
  review, has no false failures, and puts the question in front of the person who can answer it.

  **An earlier draft declined the gate for a different and false reason** — that the history holds
  two legitimate exceptions. It does not, as far as anything here establishes; that claim was
  written from two commit subjects and collapsed when the commits were opened. The decision is the
  same and the reasoning is not, which is the distinction ADR-0076 exists to enforce. A stronger
  check remains buildable — require a PR adding a journey to **name** an existing spec rather than
  to modify one — and is deliberately deferred rather than dismissed: it depends on PR metadata
  rather than on the tree, which is a weaker substrate than every other gate in this repository.

- **The measurement is reproducible** rather than asserted: classify `git log main` non-release
  commits by whether they touch `docs/specs/`, and cross-check apparent exceptions against the epic
  the commit belongs to, since a milestone commit of a spec'd epic touches no spec file.
- **No product behaviour changes**, no code is touched, and no migration runs.

## References

- `docs/PROCESS.md` (the golden rule and stages 1–5); `docs/templates/`.
- ADR-0104 and `docs/specs/org-less-shell/` — the occurrence that prompted this, and the spec
  written afterwards as a check.
- `docs/specs/post-theme-consolidation/feature-spec.md` §"the brief describes a programme of three
  items" — the approved commitment that W1's output gets specified after it runs.
- ADR-0058 and ADR-0076 (what can be computed should be; an unverified claim is a defect class),
  ADR-0081 (a plan is evidence the tasks were done, not that a capability exists).
