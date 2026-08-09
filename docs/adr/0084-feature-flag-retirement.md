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

### D4a — A batch is sized by blast radius; the cohort only sets the earliest date

Added 2026-08-09, because the first register was split by enablement cohort **alone** and that put
**17 flags and ~75 production files into a batch due in nine days** — the largest batch on the
second-earliest date. A schedule that front-loads its heaviest work is the same failure as a cliff,
one step along: it fails, and the response is to move the date, which is how a gate becomes
decoration.

So the cohort answers only "when may this flag retire at the earliest?" (`enabled + horizonDays`).
**What batch it lands in is a question about cost**, and cost is now measured: production files
referencing the constant, **and the number of `playwright*.config.ts` files that pin it**. The
second number is the one nobody had — `VITE_CANVAS_AUTHORING` is pinned in **14** configs and
`VITE_SCHEDULING_MODES` in **13**, and D5's note below records CI proving that a single pinned
config costs six specs to convert rather than a line.

**Two of the three inputs are measured and one is not, and the difference is stated rather than
blurred.** The file and pin counts are real. The weighting (`files + 3 × pins`), the per-batch cap
(45) and the fortnightly cadence are extrapolated from **one** completed retirement, which is not
enough to justify a seventeen-batch schedule reaching into 2027 — asserting otherwise would be the
ADR-0076 Class 3 failure this repository keeps recording, committed inside the ADR that cites it.

They are therefore a **hypothesis the gate tests for us**: if batch 2 takes longer than its
fortnight, the next batch's date fails and forces a re-fit against a second data point. Re-fit it
then. Do not defend it.

**And the horizon and the batch date are now visibly different things**, which the original draft
conflated: the horizon says when a flag stops earning its keep, the batch date says when we can
afford to remove it. The gap between them **is** the debt, and it is large. That is worth knowing
rather than hiding behind a schedule that pretends otherwise.

### D5 — Retiring a flag deletes its flag-off parity suite, and that is the point

The parity suites exist to prove the rollback is byte-for-byte. Once there is no rollback they are
asserting about a configuration that cannot be selected, and keeping them is how a suite becomes
folklore. They are deleted **in the same commit** as the flag, so the diff shows the contract and its
proof leaving together rather than one outliving the other.

What is **not** deleted is the flag-**on** journey: `apps/web/e2e-*` proves the feature works, which
is a claim about the product and not about the flag.

> **This clause was incomplete, and CI found it the same day — the second of two corrections this
> ADR earned from its own gate.** D5 says "its flag-off parity suite" and means the unit suites. It
> does not say that **a whole Playwright config can BE a flag-off harness**, which
> `apps/web/playwright.config.ts` is: it pins `VITE_TSLD_EDITING`, `VITE_PLAN_EDIT_LOCK` and
> `VITE_CANVAS_WORKSPACE` off for the entire base journey so that — in its own words — "the
> read-only TSLD surface and the role-only (no-pen) editing journeys stay covered". Batch 1 retired
> the first two. The pins became dead, the base suite was served an app with the pen live, and six
> editing specs (`activities`, `baselines`, `dependencies` ×2, `schedule` ×2) sat clicking controls
> the pen now shades until they timed out.
>
> Both flags are **put back**, into batch 2, with the reason recorded rather than the date quietly
> slipped — the same call `VITE_CANVAS_TOOLBAR` got, for the same reason: retiring them is a slice
> that converts six specs to take the pen, not a line deletion. And `pnpm check:flags` gained a
> fifth assertion reading the `env:` blocks of every `playwright*.config.ts`, so a retirement that
> would strand a pinned harness fails **before** it is pushed. Verified red first: it reports 22
> configs.
>
> The lesson generalises past this ADR. A flag-off contract is wherever a flag is _pinned_, and
> pinning happens in at least three places — a `vi.mock` of `@/config/env`, a Playwright config's
> `env:`, and `.env.example`. Only the first was in anybody's head.

### D6 — A flag may be kept past its horizon, with a written reason, in the register

`flag-retirement.json` entries may carry `"keep": "<reason>"` instead of a batch. A flag genuinely
serving as an operator configuration — rather than a rollback — belongs there. **None exist today**,
and the field is in the schema so that the first one is recorded as a decision rather than as a flag
that quietly never got done.

## Consequences

- 58 flags gain a dated tag; 14 gain the date they never had, sourced from their ADR.
- The first batch retires **one** flag, `VITE_NAV_TREE_CRUD` — the only one of the 2026-07-12 cohort
  with no harness pinning it. The other two were retired, caught by CI, and put back (D5's note).
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
