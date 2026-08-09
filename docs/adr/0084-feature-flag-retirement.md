# ADR-0084 — A feature flag is a rollback contract with an expiry date

**Status:** Accepted
**Date:** 2026-08-09
**Extends:** ADR-0058 (drift control — what cannot be gated goes to a reconciliation pass; what can,
becomes a computed gate) and ADR-0076 (a claim that decides something carries its evidence).
**Amends:** nothing. **Supersedes:** nothing.

## Context — 58 flags, every one of them on

`apps/web/src/config/env.ts` declares **58** `VITE_` feature flags. `flagDefaultOff` is exported and
**called exactly zero times**: every flag in the product is default-**on**. They are not switches for
choosing a configuration; they are rollback contracts, each left behind by the epic that shipped it.

That is the right thing to have on the day a feature flips, and this repo's own record is why: the
enablement milestones (ADR-0062 M6, ADR-0064 §7, ADR-0067 M4, ADR-0073 C4, ADR-0080) each found
defects in code that had passed a human read, and a flag is what makes the answer to "turn it off
while we fix it" one environment variable rather than a revert. The **flag-off parity suites** are
that contract stated as tests — CLAUDE.md calls them "the rollback contract" in those words.

What no decision has ever said is when the contract **ends**. So:

- The oldest flags have been on for **28 days** across many releases on the deployed host, which
  auto-pulls each one (ADR-0047) and where a person reviews every release. The flag-off path for
  those has not been exercised by anybody, ever, outside its own parity suite.
- Fourteen of the 58 **do not record when they were enabled at all** — their docblocks say "ON by
  default" with no date. A policy keyed on age has nothing to read for a quarter of the estate, and
  a human trying to apply one would have to reconstruct each date from the ADR register.
- Three flags are **derived** (`VITE_SCHEDULING_MODES` composes `CANVAS_AUTHORING`;
  `VITE_CANVAS_RESOURCE_VIEW` composes `RESOURCE_CURVES`; `CANVAS_AUTHORING` is itself a
  composition), so retiring a parent silently changes what a child means.

The cost is not the `if`. It is that **every flag-off branch is a second product**, and it is
maintained on every change to the code around it forever — as this session found twice while doing
other work (ADR-0083's migration had to keep the flag-off parity suites of three unrelated epics
green; ADR-0079's Escape rule had to be specified for two worlds).

## Decision

### D1 — A default-on flag has a retirement date, and it is recorded where the flag is

Every flag declaration carries a machine-readable `@enabled YYYY-MM-DD` tag in its docblock. Not
prose — a tag, because `pnpm check:flags` reads it and because the fourteen undated flags prove that
prose does not survive contact with a busy epic.

The date is **when the flag flipped default-on**, not when it was created. That is the moment the
rollback contract started, and it is the only date that bears on when it should end.

### D2 — The horizon is 30 days, and it is measured in releases even though it is written in days

A flag retires at the first **retirement batch** falling 30 or more days after its enablement date.

Thirty days is not a calendar preference. On this deployment the unit of confidence is a **release**:
the host pulls and recreates automatically (ADR-0047) and a person reviews each one, so a month is
roughly a dozen releases during which the flag-**on** path is the only path anybody has run. At that
point the flag-off branch is not a safety net; it is an untested configuration whose parity suite
asserts that an unused product still works.

Written in days rather than releases because the release stream here is continuous and per-flag
release counting is machinery that would need its own gate to stay honest — the ADR-0058 test of
whether a rule is worth automating.

### D3 — The gate is a schedule, not a cliff

`pnpm check:flags` fails when a flag is past its horizon **and** absent from
`scripts/flag-retirement.json`, which lists the dated batches. So the horizon does not produce 27
simultaneous failures on the day this lands; it produces a queue with dates against it, and the
failure a developer actually meets is **a batch date passing with the batch not done**.

This is ADR-0058's coverage-ratchet lesson applied directly: that ADR set the coverage floors at the
**measured** value rather than the aspirational one, because "a gate that fails on day one gets
deleted rather than fixed". A 30-day horizon with no schedule fails on day one, twenty-seven times.

### D4 — A derived flag is retired with, or after, its parent — never before

`SCHEDULING_MODES_ENABLED` is `flagDefaultOn(VITE_SCHEDULING_MODES) && CANVAS_AUTHORING_ENABLED`.
Retiring the **child** while the parent survives is the contradiction: the child's retirement says
that feature is now permanent, and `VITE_CANVAS_AUTHORING=false` can still switch it off. The only
way to delete the child constant honestly would be to leave the parent's conjunct behind at every
call site, which turns a retirement into a rename.

The other order is harmless. A retired parent simply drops its conjunct, and nobody can turn off
what no longer exists.

> **This clause was drafted the other way round — "a parent must not retire before its children" —
> and `pnpm check:flags` failed on its very first run, against the register this ADR ships with.**
> The rule is recorded as corrected rather than quietly flipped, because the mistake is instructive:
> the draft reasoned about what happens to a reader who _has_ the parent turned off, and the answer
> is that retirement removes that possibility along with the flag. Which order is safe depends on
> which switch survives, and the surviving switch is the parent's. It is ADR-0076 Class 3 — a claim
> asserted and not checked — caught by the gate written in the same commit, which is the strongest
> case this repository has yet produced for computing a rule rather than stating one.

### D5 — Retiring a flag deletes its flag-off parity suite, and that is the point

The parity suites exist to prove the rollback is byte-for-byte. Once there is no rollback they are
asserting about a configuration that cannot be selected, and keeping them is how a suite becomes
folklore. They are deleted **in the same commit** as the flag, so the diff shows the contract and its
proof leaving together rather than one outliving the other.

What is **not** deleted is the flag-**on** journey: `apps/web/e2e-*` proves the feature works, which
is a claim about the product and not about the flag.

### D6 — A flag may be kept past its horizon, with a written reason, in the register

`flag-retirement.json` entries may carry `"keep": "<reason>"` instead of a batch. A flag genuinely
serving as an operator configuration — rather than a rollback — belongs there. **None exist today**,
and the field is in the schema so that the first one is recorded as a decision rather than as a flag
that quietly never got done.

## Consequences

- 58 flags gain a dated tag; 14 gain the date they never had, sourced from their ADR.
- The first batch retires the **2026-07-12 cohort**, oldest first.
- `pnpm check:flags` joins `check:counts` / `check:claims` / `check:doc-links` / `check:playbook` as
  a computed gate on documentation-shaped truth.
- A future epic's enablement milestone gains one line of work: add the `@enabled` tag. If it does
  not, the gate fails — which is the intended cost, because an undated flag is one that will still
  be here in a year.

## What this ADR does not do

It does not retire 27 flags. It sets the rule, records the dates, builds the gate, and does the first
batch. The remaining batches are dated in the register and will be done at those dates; if they are
not, CI says so, which is the whole difference between this and a note in a backlog.

**The CPM engine is not imported and no migration runs.**
