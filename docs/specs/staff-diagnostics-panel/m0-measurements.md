# M0 measurements — the staff diagnostics panel

- **Status:** Approved
- **Date opened:** 2026-09-13

## The falsification condition, committed BEFORE the run

This section is written and committed in its own commit, before any query is executed, for the
reason the plan gives: a bar chosen after seeing the number is not a bar. If either limb fails, the
spec's §4.5 anchoring is reopened or M0-T3 arms — **the bar does not move.**

**D-A (the day-factor divergence count) must, against a 2,000-activity plan:**

1. complete in **≤ 500 ms** wall clock, and
2. show **no sequential scan of `activities`** in the chosen plan.

**Non-vacuity control, checked first.** The fixture must actually contain diverging activities and
the query must return a non-zero count. A benchmark over a population with no divergence measures
the fastest path the query has and says nothing about the case it exists for — the ADR-0129 P3
lesson, and the reason ADR-0128 makes INDETERMINATE a first-class verdict.

**Recorded honestly either way**, including a failure, and including which database each run was
taken against. A number from the wrong database is worse than no number: `#86`'s M0-T3 is still
owed precisely because a test database answers it with a structural zero.

## What this document will NOT contain

The **deployed** population count. It cannot be taken from a container, it is the whole reason the
panel exists, and substituting a test-database zero for it would be the failure this epic is
written to remove. It is owed and stays owed until the panel is built or somebody runs it by hand.

## Results

_(to be filled by the run — see the commit following this one)_
