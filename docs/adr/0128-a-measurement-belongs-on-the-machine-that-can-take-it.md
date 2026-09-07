# ADR-0128 — A measurement belongs on the machine that can take it

- **Status:** Accepted
- **Date:** 2026-09-07
- **Supersedes:** nothing
- **Amends:** ADR-0086 (the staff console gains its first write), ADR-0087 (a third table joins the
  retention sweep)
- **Builds on:** ADR-0026 §9 (the frame-rate gate), ADR-0058 (a gate that fails on day one gets
  deleted), ADR-0073 (which mutations earn an audit event), ADR-0081 (a milestone names its entry
  point), ADR-0100 (the paired-run measurement design)
- **Spec:** [`docs/specs/staff-performance-probe/`](../specs/staff-performance-probe/)

## Context

`docs/TECH_DEBT.md` #75 is the register's longest-running open question about the product's primary
surface, and it rests on **one reading**, taken on 2026-08-03, on one machine, by one person running
a terminal command. Five canvas epics have changed the painter since. Its own closing sentence names
what is still open: the **500-activity limb has never been measured at all**, and roughly 8 ms per
frame at the whole-plan framing is unattributed.

Nobody re-derived it, and the reason is not negligence. The instrument is a Node script that
requires a checkout, a package install and a command line — and the product owner, who is the one
person with the hardware the number is about, does not run terminal commands. So the measurement
existed, was correct, and was unreachable by the only person who could take it.

The obvious fix — run it on the server — is the one this ADR exists to refuse.

## Decisions

### D1 — the measurement runs in the operator's own browser, and a server-side job is refused

The API runs headless in a container where Canvas 2D can come from a software rasteriser. That
environment's **own no-change baseline** moved from 0.56 pp to 1.85 pp at 1646, and from 0.93 pp to
10.00 pp at 1920, between two runs an hour apart with no code change, against a 2.00 pp bar
(`m0-conditions.md`). A number from there would carry a timestamp, a scenario name and a verdict,
and would mean nothing — which is worse than having none, because somebody acts on it.

So the run happens in the browser, on the machine somebody uses, and the panel says so on screen.
The cost is stated rather than glossed: **there is no CI gate here and there never will be.** A
performance number this product can trust is a number from a real display, and CI has none.

### D2 — one scenario derivation and one judge; the CLI is refactored, never forked

`measure-revision-diff.mjs` already held a verdict rule. It became an **adapter** over the extracted
judge rather than keeping a copy — the ADR-0078 barrel-preserving argument — and its output before
and after was compared as the acceptance condition (F1, passed twice). Two implementations of "is
this a regression?" would drift, and the drift would be invisible: each looks right alone, and only
somebody running both on the same machine would ever see one disagree.

### D3 — the scene is synthetic by construction

A `StaffPrincipal` cannot reach a plan — that is ADR-0086 D1, and it is a compile error, not a
policy. So the scenes are generated (`@repo/seed/scale`) rather than loaded, and the panel measures
a plan no customer owns. This is the rare case where the security property and the measurement
property want the same thing: a synthetic scene is also **reproducible**, so two readings taken a
month apart are about the painter rather than about whose programme happened to be open.

### D4 — four verdict values, and INDETERMINATE is first-class

`PASS`, `FAIL`, `INDETERMINATE`, `REPORTED_ONLY`. The third exists because the environment above is
not hypothetical: an instrument whose baseline moves by more than its own bar cannot answer the
question, and a rule with only PASS and FAIL **must** report one of them. `m0-conditions.md` records
that exact pair of runs and concludes the environment is disqualified rather than that a regression
was found; INDETERMINATE is that conclusion made available to the code.

The judge also **throws rather than judging** when it has nothing to judge — a run with no finite
results, or a canvas that drew almost nothing. ADR-0097 Landing C emitted a confident `PROCEED` from
an `undefined`, and ADR-0066 records a 4.6 ms p95 that "looked like the budget being met" and was
about the cull. Refusing is the only answer that cannot be mistaken for a result.

`REPORTED_ONLY` covers the framing where the shipped painter is already known to judder: a gate that
fails on day one gets deleted rather than fixed (ADR-0058), so that limb reports its figures and
states no verdict.

### D5 — the server stores samples and thresholds, and does not judge

`perf_probe_results` holds the numbers and **the bars they were measured against**, and there is no
`verdict` column. Two consequences, both intended: changing a threshold cannot reinterpret history,
and the rule has exactly one home — the judge both the panel and the CLI import. A stored verdict
would be a second copy of a rule, which is the shape this repository has recorded drifting more than
any other.

### D6 — the GPU renderer string is recorded, and masked is recorded as masked

It is a fingerprinting surface, and it is recorded anyway, on the product owner's decision. The
argument is not that the concern is imaginary: it is that #75's single existing reading is
interpretable **only** because somebody wrote down that the browser had chosen the integrated
adapter on a machine that also has a discrete one. Without it, an outlier is unexplainable and the
reading is worth less than the risk it avoids.

What makes that affordable is where it is kept. `perf_probe_results` is an **ordinary table** — it
can be corrected, scrubbed and expired — and the two erasure affordances are named on the columns:
`recorded_by_label` is nullable, and a NULL `gpu_renderer` leaves a machine reading attached to
nobody. None of it reaches `audit_events`, which refuses `DELETE`.

**A masked or unavailable adapter is stored as NULL and printed as masked.** Writing "unknown GPU"
would put a fiction in the one field a reader trusts to explain an outlier.

### D7 — the first staff write, and how it keeps the compile-error property

ADR-0086 D1's guarantee is that staff reaching customer data is a compile error. `StaffProbeService`
takes a `StaffPrincipal`, which is not assignable to `Principal` in either direction, so it cannot
be handed a member's identity and cannot call a member service. The table has no `organization_id`,
no foreign key to any customer model, and no column that could hold a plan, activity or client id —
so there is **no scope to get wrong** rather than a scope that is guarded.

Three fields are server-set and refused from the body: a client-minted `runId` would file one
machine's numbers under another's grouping, a browser clock is neither trustworthy nor monotonic
against the database's and it is the retention predicate, and an API version supplied by the browser
is a claim about a process the browser cannot observe.

### D8 — audited, despite failing both of ADR-0073's tests

Test 1 (durability): the row itself carries `recorded_by_user_id` and `recorded_at`, so it is
durably attributed and earns nothing. Test 2 (blast radius): it changes nobody's rights and nobody's
work. **By the ordinary rules, no audit row.**

It is audited anyway, and that is ADR-0086 D5 working rather than an exception to it: the route
census derives a positive assertion **from the path**, so every `/api/v1/staff/` route must audit —
written precisely so a staff route added later is covered the day it is written. Both directions
were verified rather than assumed: omitting the route fails the coverage assertion, and classifying
it as unaudited fails the path-derived one.

One row per press, never one per limb, inside the write's own transaction. Its allow-list is
**empty**: the device characteristics are what make a reading comparable and also what identify a
staff member's machine, so they stay in the table that can forget them. The scenario travels in
`subjectLabel`, a column rather than a payload.

### D9 — retention is 365 days, not indefinite

Not because of volume — a row exists only because a person pressed a button. Because the row holds a
staff member's machine fingerprint and their address, and a record with no end is a decision nobody
made. A year is long enough to compare a release against the one before it and against the same
season last year, which is what these numbers are for.

## A correction to ADR-0086

ADR-0086 D6 states that one write exists on the staff console in v1 ("send a test message"). **It
does not.** The shape landed — the argument, the audit classification, the boundary reasoning — and
the route never did. Recorded here rather than routed around, which is the ADR-0071 lesson: noticing
drift and stepping over it leaves the register exactly as wrong as not noticing.

Two of this epic's own recorded claims were also wrong and are corrected in
`m0-conditions.md` rather than quietly fixed: it asserted that a new audit action costs **one**
migration (it costs none — the action CHECK is a format regex, and the precedent migration is a
deliberate no-op whose own comment says so), and that the probe's actor is an ordinary `USER` (it is
`STAFF`; the single `USER` exception is the denial, which is `USER` precisely because that caller is
not staff). Both were read off a filename rather than a file.

## Consequences

- **The numbers are client-reported.** A compromised staff session can post a fabricated reading.
  That is accepted: the alternative is a number from the wrong machine, the body is bounded and
  validated, and the writer is named on the row and in the audit log.
- **One machine at a time.** A reading is comparable with another reading from the same machine.
  Comparing across machines is a judgement a reader makes with the fingerprint in front of them, not
  something the product does for them.
- **No CI gate, ever.** Follows from D1. The frame-rate question cannot be answered by a container,
  so it stays a question a person asks a real display, and #75 stays open until somebody does.
- **`docs/TECH_DEBT.md` #75 is not closed by this ADR.** The instrument now exists and is reachable;
  the readings are the product owner's to take, and the unattributed ~8 ms at the whole-plan framing
  is a separate open question that this changes nothing about.
