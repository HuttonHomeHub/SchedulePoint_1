# FC-1 — the estate readings: **UNANSWERED, and now permanently so**

**Status:** UNANSWERED (ADR-0127 D8) · **Closed:** 2026-09-21 · **Owner:** product owner

## The verdict

**No estate readings were taken before the collapse shipped.** FC-1 asked for the eight
staff-diagnostics figures that M0 built the means to take (ADR-0140, `staff-diagnostics.registry.ts`),
on the deployed host, against the pre-collapse estate. They were never pressed.

This is recorded as UNANSWERED rather than filled in. ADR-0127 D8 is the precedent: a measurement
that was not taken is reported as not taken, never reconstructed, and never replaced by a figure
that looks like one. There is no number in this file because there is no number.

## Why it cannot be taken now

Two independent closures, either of which is sufficient:

1. **The strip has run.** `20260921120000_strip_drag_constraints` executes inside
   `prisma migrate deploy` at container boot (ADR-0018), and `api-v0.70.0` published to GHCR at
   2026-09-21 05:55Z on a host that auto-pulls (ADR-0047). Once it ran, the pre-strip state is not
   reconstructible — the conversion is irreversible by design and `placement_migrations` records
   what changed, not what the aggregate counts were.
2. **One of the readings no longer exists.** `placement-on-early-plan` was retired with
   `plans.scheduling_mode` at M-J-T2. Its query cannot be run again by anybody, because neither the
   entry nor the column it filtered on is in the product.

## The decision, and who made it

The `placement-on-early-plan` docblock said the entry was kept for one release **specifically
because** these readings were owed, and that deleting it beforehand "would remove the only
pre-collapse figure for this population, permanently."

That was put to the product owner on 2026-09-21, before the entry was deleted, with the cost
stated and the alternative (hold PR #2 for one button press) offered. **They chose to proceed and
accept the loss.** The forfeit is therefore deliberate and attributed, not an oversight.

## What this does and does not cost

**Does not cost:** any product behaviour. Nothing in the running application read these figures;
they were decision inputs for two questions that have since been answered by other means — whether
a baseline capture needed a migration or a default (answered by ADR-0126's capture-level column)
and whether the strip could run unattended (answered by M-I's four-class test and FC-10 clause C's
executable proof).

**Does cost:** the ability to say afterwards how large the affected population was on the one
deployed installation. If somebody later asks "how many activities did the strip actually convert
here?", `placement_migrations` answers that — it is the strip's own record. What is gone is the
_surrounding_ context: how much of the estate had ever been placed, how many baselines sat over
placed plans, and the four SNET class counts, as they stood before the conversion.

## The transferable finding

FC-1 named a condition whose evidence could only be produced by a person with access this session
does not have, and set no deadline against the release that would destroy it. A falsification
condition that depends on somebody else's hardware needs its **window** written down beside it, not
just its question — otherwise it expires silently while everything else proceeds correctly.
ADR-0128 exists because a measurement was unreachable by the person who needed to take it; this is
the same failure one step along, where the measurement was reachable and nobody was told it was
about to stop being.
