# ADR-0081 — A milestone is its entry point, and the journey is the gate

**Status:** Proposed
**Date:** 2026-08-08
**Supersedes:** nothing. **Extends:** ADR-0058 (drift control), ADR-0076 (wrong claims are a defect class).

## Context

W5 (activity copy/paste/duplicate, `docs/specs/activity-copy-paste/` — a feature epic with a
spec and no ADR of its own, since Milestone B was not taken) shipped, and its enablement gate found more blocking
defects than any epic before it — six specialist reviews, five of them blocking, on a diff that had
passed a human read. That is not by itself remarkable; four consecutive epics record the same shape
(ADR-0060 M6, ADR-0063 M6, ADR-0064 §7, ADR-0067 M4). What is remarkable is **which** defect it
found:

> Milestone 2, "duplicate a WBS band", was **unreachable from the product**. `bandMembers` and
> `bandCopyConfirmation` had shipped with unit tests. `scripts/measure-band-copy.mjs` had measured a
> band copy against a real API and recorded the numbers in the spec. The milestone read as landed in
> the commit log. Both entry points excluded a `WBS_SUMMARY`, and the toolbar comment beside the
> exclusion still read _"copying the band with its subtree is M2"_ — of the milestone that had just
> been marked done. Its unit tests were validating dead code.

Three independent reviews (ux, component, test-engineer) found it separately, which is the clearest
possible signal that it was not a subtle omission.

This ADR is about the process that produced it, not the defect.

### What was different about W5

Every earlier epic pushed work through the running application repeatedly. ADR-0067's flag-on
journey found a menu unclickable inside a modal `<dialog>`'s top layer. ADR-0070's found that the
plan's calendar never reached `CreateActivityButton`, so the surface where every activity is first
created silently refused `4h`. ADR-0064's harness drove the real two-click pick before deciding
anything. Each of those is a defect that only the product could report.

W5 completed M0–M4 — three compiler-enforced censuses, the clone graph, the projections, the
command, the carriage, a measurement harness — **without the application being opened once**. The
plan's task list was worked through faithfully; every artefact it named was produced.

Three factors turned that into a milestone-sized hole:

1. **The measurement concealed the gap rather than exposing it.** `measure-band-copy.mjs` proves a
   band copy is fast by calling the REST API directly (correctly — that is what it is for). It is a
   _stronger_ artefact than earlier epics had, and it made M2 look **more** finished than any
   previous milestone while no UI path existed. A better tool made the hole harder to see.
2. **The flag-on journey was deferred to M5-T2**, four milestones after the first user-facing slice.
   When it ran it found four defects in one sitting, two of which — `bulkDelete` refusing a batch
   containing a summary, and the reveal riding a flag-gated seam — are invisible to every mocked
   test by construction. Four milestones of no end-to-end verification is what that looks like.
3. **The gate pass was one batch** over ~2,500 lines, so six reviewers reconstructed intent across
   four milestones instead of checking one.

### The underlying rule

ADR-0058 says _verify the claim; do not trust the document_. W5 failed it one level up: **a plan is
a document too.** Working through a task list is not evidence that a capability exists; it is
evidence that the tasks were done.

## Decisions

### §1 — A milestone claiming user-facing capability names its entry point

An implementation-plan milestone that claims a planner can _do_ something states, in the milestone
header, **which control they use**. A milestone that deliberately ships dark (schema, a pure model,
a read path behind a later surface) says so in the same place. There is no third state, and
"the model landed" is not a claim that the capability exists.

### §2 — The flag-on journey lands with the first user-facing milestone, not at enablement

Even as one skeletal step that opens the surface and presses the control. This is the load-bearing
decision, because it is the only one of the three that is **enforcement rather than intention**:
M2's hole survived a plan, a spec, a measurement, unit tests and a human read, and was found the
first time something drove the real product.

The enablement milestone keeps its full journey; what moves earlier is its first step.

### §3 — A measurement harness is not evidence that a surface exists

Where a harness exercises a capability through a path the product does not use — a REST client, a
seeded fixture, a pure function — it says so in its own docblock, in those words. `measure-band-copy`
now does. This is the ADR-0076 §19.9 rule applied to tools: a claim carries what established it, and
"the API can do this quickly" is not "a planner can do this".

### §4 — What is NOT adopted, and why — measured rather than asserted

A structural gate was proposed during this analysis: _every symbol exported from a feature barrel
has a non-test caller_. **It is rejected, and rejecting it required measuring it**, which is the
same discipline the epic failed at:

| Predicate                           | Findings across `apps/web/src/features` |
| ----------------------------------- | --------------------------------------- |
| No consumer outside its own feature | **129**                                 |
| No non-test caller anywhere         | **49**                                  |

Both are far past the threshold where "a gate that fails on day one gets deleted rather than fixed"
(ADR-0058). And the numbers are not the strongest objection. **`bandMembers` would not have been
caught by either**: its own unit tests called it, as do roughly half of the 49. The defect was never
"an uncalled symbol" — it was "a capability with no entry point", which is not a property of a
symbol at all.

The residue that _is_ worth doing is much smaller: a lint rule for unused barrel exports excluding
the two documented conventions (`*QueryOptions`, consumed by route loaders; `*_FIELD_DECISIONS`,
whose whole job is to be a compile-time gate rather than to be called). That is a handful of
findings, `projectDuplicate` among them (`docs/TECH_DEBT.md` #112). It is a tidiness gate, not this
ADR's fix, and it must not be mistaken for one.

## Consequences

- The delivery process (§21, `docs/PROCESS.md`) gains §1 and §2 as authoring rules for the
  implementation-plan template.
- Epics get a journey earlier, which costs a CI step sooner and buys the failure mode above.
- §3 and §4 are documentation and a small lint rule respectively; neither changes any product
  behaviour.
- **The CPM engine is not imported and no migration runs.** This ADR changes no product code.

## Recorded corrections

- The structural gate in §4 was proposed as the headline fix, in confident terms, **before it was
  measured**. Measuring it produced 129 and then 49 findings and showed it would not have caught the
  defect it was proposed for. The proposal is preserved here rather than quietly replaced, because
  the failure it demonstrates — asserting a fix and checking it afterwards — is the same one this
  ADR is about, occurring inside the ADR.

- §3 asserted that `measure-band-copy.mjs` "now" carried the caveat it prescribes. **It did not when
  that sentence was written**, and the docblock in fact said close to the opposite — _"what is timed
  is what a planner's browser would issue"_ — which is exactly the reading that let M2 look proven.
  The caveat was added on checking, so the claim is true now; it is recorded because the failure mode
  is ADR-0076 Class 3 (a claim the author asserted and never checked) occurring **twice inside the
  ADR written about it**, an hour apart, by the author who had just described it.

## Alternatives rejected

**Require a UI slice in every milestone.** Rejected: it would forbid the deliberately-dark slices
this repo uses well (ADR-0051 F-M1, ADR-0072 M1's schema). §1's "name it or declare it dark" keeps
that available while removing the ambiguity that hid M2.

**Run the specialist reviews per milestone rather than over the combined diff.** Rejected for now:
the combined pass is what lets a reviewer see an inconsistency _between_ milestones, which is where
four of W5's six findings lived ("one correct pattern applied to a control and not its neighbour").
The batch was not the root cause; the missing journey was.
