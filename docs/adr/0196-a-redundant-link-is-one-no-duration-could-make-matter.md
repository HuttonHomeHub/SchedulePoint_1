# ADR-0196: A redundant link is one no duration could make matter

- **Status:** Accepted — 2026-10-17. The spec was approved by the product owner on 2026-10-17 with the recommended
  defaults in its §6 (CQ-1 provably removable; CQ-2 flag a same-pair duplicate, never the SS/FF ladder; CQ-3 accept
  the mixed-calendar restriction; CQ-4 started work breaks a chain; CQ-5 the existing remedy path only) and
  **amended the same day** (D1's W5, below). Milestones 0 to 2 are built and unreleased; the journey and the gate pass
  (M4) are not.
- **Spec:** [`docs/specs/redundant-link-advisory/spec.md`](../specs/redundant-link-advisory/spec.md) §2.1, §4.5, §4.7,
  §4.8 · **Plan:**
  [`implementation-plan.md`](../specs/redundant-link-advisory/implementation-plan.md) · **Measurements:**
  [`m0-measurement.md`](../specs/redundant-link-advisory/m0-measurement.md)
- **Date:** 2026-10-17
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Builds on:** ADR-0116 (a health finding is not a conflict, and a report never omits a check), ADR-0162 (the
  advisory section, which this mirrors and amends in D3), ADR-0035 §13 and §16 (the ladder; redundant logic deferred
  to a quality report), ADR-0021 (the DAG invariant), ADR-0036/0037 (lag calendars and the instant axis), ADR-0038
  (summaries carry no logic), ADR-0066 (the catalogue and the engine as oracle), ADR-0088 D1 (no flag), ADR-0094
  (a remedy belongs on the object), ADR-0110 (a gate is proven red), ADR-0127 (an overlay counts what it does not
  know).

## Context

A planner who imports or builds a programme over months collects links that say nothing the rest of the logic does
not already say: A to B to C, and a direct A to C. They clutter the diagram, inflate DCMA metric 3's denominator and
make the network hard to review. ADR-0035 §16 and ADR-0116 both named "redundant logic" as a later add, and until now
a planner found one only by tracing chains by eye.

"Implied" has two meanings, and only one is safe to tell a planner. **Structural**: another path reaches the
successor. That flags A to C `FS +5 days` beside a zero-lag chain, where the direct link is the one doing the work.
**Provable**: whatever the durations, the other path pushes the successor at least as far, so deleting the link cannot
change any date or float. A planner needs the second before pressing Delete. The catalogue already used "redundant"
for neither (`capability-network-shape`'s N3 is a shorter parallel path, a third thing), which is corrected below.

## Decision

**D1. The rule is provable dominance, with named exclusions.** A link `D = A → C` is redundant when a chain of other
links `A → … → C` satisfies W1 to W5 of the spec's §2.1: no leads on the chain; every intermediate is _transparent_
(not a level of effort or summary, not started, no mandatory pin) and is entered at its start and left at its finish;
the first link leaves A at an end at or after D's and the last binds C at an end at or before D's; a positive D lag
needs a chain lag sum at least as large with every positive chain lag on D's lag calendar; and single-calendar mode
(W5) may relax the entry and exit rule when A, C and every intermediate share a scheduling calendar. C must be
transparent too. A link the rule cannot judge is **not checked** and counted, never passed.

**W5 is amended (2026-10-17, by the product owner).** As first specified, single-calendar mode also wanted every
non-zero lag on the chain, and D's, on the shared calendar. Measured, that left the repository's own example, the
fixture's R0056 (A4110 to A4600), unflagged even with progress removed: the fixture's activities schedule on CAL-02
while its project-default lags are on the plan calendar CAL-01. The clause now applies **only when D's lag is
positive**. The oracle (D2) and the eight rule mutants were re-run after the change: zero divergences, eight kills.
A ninth mutant, dropping the clause that is kept, survives, so that clause stays as conservative.

**D2. Soundness is proven against the engine, not argued.** A differential oracle
(`apps/api/test/support/redundant-links-oracle.ts`, driven by `redundant-links.soundness.spec.ts`) builds one plan
description into the engine's graph and the rule's input through the same calendar resolution, removes each flagged
link alone and then all of them, recomputes, and compares every per-activity output a recalculation persists
(`isDriving` excluded by design: a link that ties with a longer chain reads Driving and is still removable). Zero
divergences over 500 generated plans drawn five times, 3,000 generated triangles, the whole capability and reference
catalogue, the fixture progressed and unprogressed, and `scale-500`. Each exclusion has a counterexample that fails
red (`redundant-links.oracle.spec.ts`, CE1 to CE9) or is marked "reasoned, not demonstrated" here:

- **Demonstrated:** CE1 an intermediate entered at its finish across calendars; CE2 an intermediate left at its start
  (a backward-pass-only divergence); CE3 **a started successor entered at its finish** (FF direct, SF chain: A's free
  float moves); CE4 a started intermediate under Progress Override; CE5 a mandatory intermediate; CE6 positive lags on
  two calendars with equal sums (on offsets, not dates); CE7 a lag sum that falls short; CE8 a lead on the chain; CE9 a
  level-of-effort intermediate.
- **CE3 was first mispredicted.** The spec argued a _pinned_ or _started_ successor entered by a **start-bound** link
  moves free float. Measured, it does not: the engine pins such a successor's late dates to its early ones, so the
  chain's total float is already at or below D's gap. Four constructions showed nothing; the mutation run then caught
  the finish-bound case above. The exclusion is necessary; the reasoning's mechanism was too narrow.
- **Reasoned, not demonstrated:** the clause that D's own lag calendar must be the shared one when D's lag is positive
  and single-calendar mode is used. No counterexample breaks it.
- **The levelling preview** is a claim the oracle does not carry. **Measured on one plan**: on `scale-500` with every
  resource capped at 2 units an hour (202 flagged links, real contention) the preview's full output is byte-identical
  with and without the flagged links. `capability-levelling` and `capability-levelling-placed` contain no flagged
  link, so the measurement there is vacuous and is reported as such. The claim covers Pass 1 and Pass 2; it is one
  plan, not a guarantee.

**D3. The advisory contract becomes a union discriminated on `id`.** `HealthAdvisoryResult` was one shape typed for
one advisory (`detail: { resourced }`); a second row made it a contract change (ADR-0162 D2's single shape is amended
here). `ZeroDurationTasksAdvisory` is unchanged on the wire; `RedundantLinksAdvisory` carries
`detail: { rule, unjudged, searchCapped }`, where `rule` is the token the caveat sentence is keyed on (the metric-10
`detail.narrowing` precedent). The denominator is per advisory: activities for the first, `relationshipCount` for the
second. OpenAPI is `oneOf` with `discriminator: id`.

**D4. The web that reads each advisory by its own id is released before the API emits the second.** An old bundle
would print "N zero-duration tasks out of M activities; undefined have resource assignments" under the heading
"Redundant links". So the per-id reader, tolerant of an `id` it does not know (name and count only), shipped first
(ADR-0162 D6's pattern); the producer merges only after a release containing it. The residual is a tab opened before
that release and never reloaded across two releases, accepted and stated.

**D5. A deterministic work limit, and "not checked" is a count.** The search is a max-plus programme per source
activity, `O(m · V · (V + E))` worst case, bounded by a **relaxation limit** (`relaxationLimit`; the spec said
"budget", a word the G4 cost-name gate refuses in `health/`). Sources are processed in topological order, so a capped
result is the same every time; links left unreached are added to `unjudged` and `searchCapped` says so. Measured in
process (`m0-measurement.md`, a shared four-core machine, so its times are indicative): `scale-2000` needs 45,100
relaxations, p95 11 ms (8.9 to 34.5 across runs) against the 50 ms line; the dense 2,000 × 10 plan needs 696,810; the
2,000 × 40 plan needs 9.8 million and is capped. The default limit is **2,000,000**: a capped plan answers in about
0.1 s typical and under 0.2 s at p95. The limit charges every step the search takes, including the witness scan and
each activity a run expands (a review found the first version scanned every rank between a source and its farthest
target for free, which made 20,000 disjoint pairs take 14 s; the search now visits only what it reaches). What is
**not** bounded by the limit is the linear set-up, about 90 ms for 20,000 pairs (40,000 activities, twenty times the
sized envelope). Links into started or
pinned work, to a level of effort, or with an unknown endpoint are counted as not checked (ADR-0127), apart from the
offender count and never folded into it. A stored cycle (ADR-0021 forbids one) flags nothing and counts every link.

**The health route is no longer "a persisted read that earns the default throttle".** It carries its own limit,
**71 requests / 60 s per IP** (`HEALTH_CHECK_THROTTLE`), by the critical-path test's rule (at most 20 % of a
window in worst-case compute time: `floor(12 000 / 169 ms)`, 169 ms being the capped 2,000 × 40 plan's search p95).
A realistic 2,000-activity plan costs about 11 ms, so 71 requests are about 0.8 s of the window; the default 100 on
the capped worst case would have been 17 s, 28 %. The CPM engine is still not invoked.

**D6. No schema, no flag, engine untouched.** The loader already selected every field the rule reads; the service
stopped discarding `lagCalendar`. There is no `VITE_` flag (ADR-0088 D1): rollback is the commit boundary.
`check:engine-parity` was active for the whole epic (TECH_DEBT #518) and is deactivated in the closing commit. The
advisory is a read: not structural, no pen, no lock, no audit event, and role-invariant (ADR-0116 D5).

**Corrections recorded.** `capability-network-shape`'s N3 was described as "redundant"; it is a non-driving parallel
path and is not flagged here (spec E16). Its description and comment now say so. The catalogue's "never state the same
edge twice" test described the pre-amendment rule (one link per pair); it now keys on pair and type, because the
ladder (ADR-0035 §13 as amended) is legal and `capability-redundant-logic-calendars` states one.

## Alternatives considered

| Alternative                                                     | Why not                                                                                                                                                         |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structural transitive reduction (any other path)                | Flags links that drive. A finding a planner cannot act on safely.                                                                                               |
| "Not driving in the last calculation" (read `isDriving`)        | Reads an engine output, flips on any duration edit, needs a calculated plan, and flags N3's links.                                                              |
| What-if: remove each link and recompute (the ADR-0116 M6 shape) | One engine run per link per report, against a measured 694 ms per recalculation; and it answers "now", not "whatever the durations".                            |
| A fifteenth metric                                              | Not DCMA; ADR-0116 D3 closes the set at fourteen.                                                                                                               |
| Join `CONFLICT_FLAGS` / Next conflict                           | A redundant link is not a conflict (ADR-0094, ADR-0116 D2).                                                                                                     |
| A panel "Delete link" action                                    | A new pen-gated structural write with its own undo entry and spec weight; nothing about the finding needs it (CQ-5). The remedy is the existing jump and Logic. |
| Include cross-plan links                                        | Needs the other plan's logic, possibly unreadable by this reader.                                                                                               |

## Consequences

- A planner sees which links are removable and can trust that none moves a date or float; the copy never says "never
  drives" (a tied link reads Driving today) and says it may start to matter if the chain changes.
- **Coverage is lower than a structural rule would give**, and the report says how much: links into started or pinned
  work, mixed-calendar chains that enter an activity at its finish or leave it at its start, and positive-lag chains on
  two calendars are not flagged. On the seeded fixture the rule flags 3 of 188 links and **not R0056**, whose chain
  passes through two in-progress activities (CQ-4); unprogressed it flags R0056. `scale-500` flags 202 of 800.
- Four catalogue plans (`capability-redundant-logic`, `-calendars`, `-kept`, `-unchecked`) hold one cluster per case
  and the rule to their descriptions (`redundant-links.catalogue.spec.ts`). They are four because a catalogue plan
  stays within fifteen activities and the twelve clusters need fifty.
- The cost is a second advisory read on every health request, bounded by D5.

## References

- Spec, plan and measurements: `docs/specs/redundant-link-advisory/`.
- `apps/api/src/modules/schedule/health/redundant-links.ts`, `lag-calendar-key.ts`, `compute-health.ts`.
- `docs/TEST_PLAYBOOK.md`, the four logic rows and "Redundant links".
- `docs/TECH_DEBT.md` #518.
