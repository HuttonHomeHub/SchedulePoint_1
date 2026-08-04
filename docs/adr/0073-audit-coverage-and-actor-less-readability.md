# ADR-0073: Which mutations earn an audit event, and who may read an actor-less one

- **Status:** **Accepted** (per-milestone: C1 filter — **landed**, `VITE_AUDIT_FILTERS` default-on
  2026-08-04; C2 attribution, C3 coverage, C4 enablement — outstanding)
- **Date:** 2026-08-04
- **Deciders:** Product Owner (CQ-A subject-only readability; CQ-B the 19-action catalogue and the
  permanent exclusion of content edits; CQ-C the reorder); feature-analyst (design)

## Context

ADR-0072 shipped the append-only audit log, flipped `VITE_AUDIT_LOG` default-on, and met a real
reader within hours. That reader created and deleted activities, opened the log, found nothing, and
asked why — then said sign-ins were missing too. Neither observation was a fault. Activity writes
are `content-edit-deferred-to-m3` in the route census, and an `auth.*` row carries no
`organization_id` so the organisation read can never return one. Both were the **screen's** fault,
and the copy was fixed.

But first contact exposed three gaps that copy cannot close, and they are the same failure wearing
three costumes: **the log records things nobody can find.**

1. **A failed sign-in is readable by nobody.** It carries neither `organization_id` nor an actor —
   there is no authenticated user at that moment — and both read endpoints filter on exactly those
   columns. The single most useful thing an audit log has to say is reachable only from `psql`.
   ADR-0072 recorded this as `docs/TECH_DEBT.md` #91 and called closing it "a security decision
   about scope rather than a filter to widen". It deferred the decision; this ADR makes it.
2. **There is no filter, on either side.** `PaginationQueryDto` is the entire query contract for
   both endpoints, and neither screen renders a control. Seven distinct event kinds arrive in one
   undifferentiated reverse-chronological stream.
3. **88 mutating routes sit in `UNAUDITED_ROUTES`** under `content-edit-deferred-to-m3`. ADR-0072's
   plan gated that rung (Task 4.3) on the partitioning question, which its M3 measurement then
   **answered**: ~592 B/row at 1M rows, both reads sub-millisecond, partitioning not warranted,
   revisit at 10M. The gate cleared on 2026-08-03 and nothing said so.

What ADR-0072 left genuinely open is not cost. It is _which_ mutations belong in an audit log at
all, and _who_ may read a row that names no actor.

## Decision

### 1. Two tests decide whether a mutation earns a row — negative by default

We will not maintain a list of opinions about which endpoints are interesting. A route earns an
audit event if and only if it passes one of two tests:

- **Test 1 — durability.** _Does the product otherwise keep a durable record that this act
  happened?_ A create leaves `created_by`; an update leaves `updated_by`; those **are** the record,
  so neither earns a row. A **delete or restore** is the act of the record disappearing — and a
  restore erases even `deleted_at` — so it earns one. A **bulk or import** operation earns one per
  **user action**, carrying counts and the batch id. This is ADR-0072's own opening argument
  (attribution columns are not an audit trail) applied one level down its own tree.
- **Test 2 — blast radius.** _Does it change the rules **other people's** work is judged by?_ The
  data date, the scheduling mode, a shared calendar's working time, an archive, a calendar's scope
  — these silently re-interpret work that other people authored, so they earn a row. An activity's
  own duration, lane or progress does not.

The catalogue is a **consequence** of the tests, not an input to them: the next route is decided by
reading the two questions, rather than by asking whoever is nearest. The census `REASONS` are
renamed to match, so a route's classification cites the test that classified it.

This yields **19 new actions** across four families — plan structure and destruction, the
rules-other-work-is-judged-by, library governance, and provenance.

### 2. An actor-less row is readable by **its subject, and nobody else**

A failed sign-in's attempted email is resolved to a user id at **write time**, into the existing
`subject_id` column (legal without schema change: `ck_audit_events_actor_shape` constrains only
`actor_user_id`), and surfaced by an **opt-in projection** on the self endpoint —
`GET /me/audit-events?include=attempts` — whose absence is byte-identical to today. That is what
lets the web half sit behind a `VITE_` flag with no corresponding server flag.

The attribution is **forward-only**. The append-only trigger refuses `UPDATE`, so rows written
before this lands can never be attributed. That is a permanent consequence, stated rather than
worked around.

**Not the organisation feed.** An attacker chooses which tenant to appear in by choosing which
address to type, and an Org Admin has no remedy available to them anyway — there is no
admin-initiated password reset in this product. Fanning failures out to organisations would add
noise an admin cannot act on, at an attacker's discretion.

**Not read-time email matching.** Addresses get reassigned; matching on read would silently move
one person's failure history into another person's account, needs an index on attacker-supplied
text, and pays the join on every `/me` read.

### 3. An ordinary content edit is **never** an audit event — permanently

Not "not yet". The class that would flood the log is not deletes or settings; it is the ordinary
field edit, and it is the one class that scales with **interactions** rather than with the size of
the programme. A planner dragging a bar for an afternoon generates arbitrarily many; a programme of
5,000 activities generates a bounded number of deletes.

This is the volume answer ADR-0072 said gated the rung, and it is a scope decision rather than a
measurement — though C3.0 still measures the row rate against the seed catalogue before the first
producer ships, because a decision made on an argument should be checked against an observation.

The cost is explicit: **"who changed this duration?" stays unanswerable**, and is now documented as
unanswerable rather than left to look like an oversight. The feature that would answer it is
**per-activity plan revision history** — a different feature, with a different table, a different
retention story and a different read model. Naming it is part of this decision; building it is not.

### 4. The filter precedes the coverage, and its flip gates the first producer

ADR-0072's plan sequenced the filter **after** the mutation events, conditionally ("if the filter
ships"). That was not wrong about the index — an index is justified by _volume_, volume arrives
with the coverage, so measuring after it is right. It was wrong to make the filter and the index
**one task**, because a filter is justified by _variety_, and the variety already exists.

So they separate rather than swap: **the filter ships first with no index**; the composite index is
decided per coverage slice, on a fresh `EXPLAIN (ANALYZE, BUFFERS)` at 1M rows, added only when it
wins, with the number recorded in the migration comment.

This is a **hard gate**, not a preference, for a reason specific to this feature: the producers are
server-side, and a `VITE_` constant is a client build-time value that cannot gate a server-side
record (ADR-0060 M0's rule, which this epic already applied to M1's writes). The day the first
producer merges, every reader's feed changes — flag or no flag — and the coverage milestone has no
web surface of its own to put behind one. Its only client change is 19 entries in exhaustive maps.

### Measured, C1 (2026-08-04) — why no index ships with the filter, and what changes that

Postgres 17, 1,000,000 seeded rows over two years, ~909k of them in one organisation, drawn from the
real 20-action vocabulary. `EXPLAIN (ANALYZE, BUFFERS)` on the actual keyset query, warm:

| Read                                   | No index (shipped) | With `(organization_id, action, occurred_at DESC, id DESC)` |
| -------------------------------------- | -----------------: | ----------------------------------------------------------: |
| Unfiltered page                        |            0.35 ms |                                                     0.05 ms |
| One action                             |       1.6 – 2.3 ms |                                                     0.11 ms |
| Five actions                           |            0.14 ms |                                                           — |
| One action + a narrow past date window |             3.0 ms |                                                           — |
| Rare outcome (`FAILURE`, 1 in 389)     |        6.8 – 38 ms |                                           22.9 ms (no help) |
| **A combination that matches nothing** |   **681 – 954 ms** |                                                   **43 ms** |

Index cost: **76 MB** on a 406 MB table (+19%).

Two things follow, and the second is not what the plan expected.

**The plan is right that C1 ships without the index — now for a measured reason.** Every ordinary
filtered read is between 0.1 ms and 3 ms unindexed. The cliff is the zero-match case, where Postgres
must walk the whole organisation partition to prove an absence: ~5–7 µs per row scanned, so the cost
is `organisation_rows × ~6 µs`. ADR-0072's own volume argument puts a busy tenant at **thousands of
rows a year** on the M1+M3 vocabulary — three orders of magnitude below where this bites. C3 is
exactly what closes that gap, which is why the index decision belongs to C3, per slice, on a fresh
measurement.

**The cheapest route to the worst case was a filter we had documented as useless.** `auth.*` rows
carry no organisation, so naming one on the organisation route can never match — and "never matches"
is precisely the shape that costs 954 ms. The first version of the query DTO put that fact in a
description and accepted the request. It is now **refused (422)** on the organisation route, which is
the same rule the rest of the DTO already applied to unknown values, applied to the one case we had
written down instead of enforced. The refusal is derived from the action's `auth.` prefix rather than
a hand-listed set, so a sixth authentication event is covered without anyone remembering the file.

### Observed, C2.1 (2026-08-04) — what the failed sign-in path actually gives us

Three questions the C2 attribution design turns on, answered against `better-auth@1.6.25`'s source
and against the real handler (`apps/api/test/auth-attribution.e2e-spec.ts`) rather than
assumed. All three expectations held; the value is that two of them are now **pinned by a test**
rather than by a sentence in a plan.

**1. The recorded label is the address exactly as typed, and the stored one is lowercased.**
`internalAdapter.findUserByEmail` looks up `email.toLowerCase()` with **no trimming**, and
`/sign-up/email` stores `email.toLowerCase()`. The audit row, however, is written from `ctx.body` —
the raw request — so an attempt against `Victim@Example.COM` records that string verbatim while the
user row holds `victim@example.com`.

So the C2.2 normaliser is `toLowerCase()` **and nothing else**. Trimming would be a defect, not a
kindness: `" jane@x.com"` is an address Better Auth would never have matched, so trimming it into a
match would attribute a probe to a user whose account was never actually reachable by that input —
telling someone they were targeted when they were not, on the one screen where that claim carries
weight.

**2. A malformed body still produces a row, carrying no label.** The after-hook survives the
endpoint's **schema** rejection, not merely a handler `APIError`: a body with no `email` at all, and
one with a non-string `email`, each write exactly one `auth.sign_in_failed` row with
`subject_label NULL` and no coercion. The hostile-body case is therefore real and already handled —
`attemptedEmail` returns `null` for anything that is not a non-empty string.

**3. An attempt against an unregistered address still produces a row, and nothing can attribute it.**
That is the honest answer rather than a gap: no such user exists. C2.3's read must not assume every
attempt row has a subject, and the `/me` surface must not imply that an unattributed attempt is
absent — it is invisible to `/me` by construction, and that is a limit worth stating rather than a
bug to fix.

**The rate limiter, verified rather than trusted.** `rateLimit.enabled` is `isProduction`, so it is
**off in dev and test** and on in production. Better Auth's own defaults then apply a stricter
per-path rule ahead of the app's `window: 60, max: 100`: `getDefaultSpecialRules()` caps any path
starting `/sign-in` at **3 requests per 10 seconds per IP**. The existing docblock's claim of
"stricter per-path limits" is therefore accurate.

What that docblock does **not** say, and what matters for the flooding argument, is the store:
`storage: options.rateLimit?.storage || (options.secondaryStorage ? 'secondary-storage' : 'memory')`
— and this app configures no `secondaryStorage`, so the counter lives **in process memory**. The
bound is per-replica and resets on restart. Today's deployment is a single API container
(`docs/DEPLOYMENT.md`), so 3-per-10s is the real figure; the moment a second replica exists it
becomes `N × 3`, silently. C2's flooding paragraph is therefore "bounded, per process" rather than
"bounded", and horizontal scaling acquires a prerequisite nobody would otherwise connect to the
audit log.

### Measured, C2.3 (2026-08-04) — the widened read DOES need an index, and the plan expected otherwise

Postgres 17, 1,000,000 rows: 990,000 attributed rows across 500 actors (~2,000 each) and 10,000
actor-less failed sign-ins, 2,000 of them naming one subject. `EXPLAIN (ANALYZE, BUFFERS)` on the
real keyset query, warm:

| Read                                         |                                  Plan |         Time |
| -------------------------------------------- | ------------------------------------: | -----------: |
| `include` absent (the parity path)           |                            Index Scan |  **0.20 ms** |
| `include=attempts`, no new index             | Parallel Seq Scan, 996k rows filtered | **49–52 ms** |
| `include=attempts`, with the candidate       |    BitmapOr over both partial indexes |   **7.1 ms** |
| `include=attempts`, subject with no attempts |           BitmapOr (second leg empty) |   **7.6 ms** |

Index size: **576 kB** on a 145 MB table (**+0.4%**).

**The index ships, and the plan's stated escalation was the wrong one.** The plan wrote that the
documented remedy was "two keyset queries merged in the repository, **not** a wider index". That
reasoning came from C1, where the candidate cost 76 MB for a smaller gain and was rejected. It does
not transfer, and the reason is structural rather than a matter of degree: `idx_audit_events_actor_
occurred` is **partial on `actor_user_id IS NOT NULL`**, so it excludes precisely the rows the second
disjunct selects. There is no version of the existing index that could serve this. The new one is
partial over the ~1% of rows that are actor-less, which is why it costs three orders of magnitude
less than C1's candidate — 576 kB against 76 MB.

What the index does **not** buy is parity: 7 ms is still 35× the 0.2 ms unwidened read, because an
`OR` forces a bitmap heap scan and a top-N sort rather than walking one already-ordered index. The
plan's two-keyset-queries idea is the remedy for **that**, and it is recorded in the migration as the
next move rather than taken now — it is more code for a difference nobody can perceive at 7 ms. The
distinction worth keeping is that the index removes a cliff and the merge would remove a constant
factor; only the first was worth paying for today.

The parity path is unchanged and measured to be so, which is the property that lets the server half
ship unflagged.

## Alternatives considered

- **Fan failed sign-ins out to the organisations the matched member belongs to.** Rejected: the
  attacker picks the tenant by picking the address, and the admin has no remedy. Considered and
  rejected once already in ADR-0072's M1; the new reason is the targeting, not the volume.
- **Read-time email matching.** Rejected — rewrites history invisibly as addresses are reassigned,
  and puts an index on attacker-supplied text.
- **Coalesce repeated failures into one row with a count.** Rejected: the repetition **is** the
  signal, the trigger forbids updating a counter, and completeness would vary with traffic. The
  flood is bounded by Better Auth's own rate limiter, which C2.1 **verifies rather than assumes**.
- **Audit everything that writes.** Affordable in bytes; unreadable in practice. It also makes the
  census a formality — if everything audits, "should this?" stops being a question anyone answers.
- **A Prisma `$extends` write-level seam to catch mutations "for free".** Rejected in ADR-0072 and
  more wrong at this scale: it would see ADR-0022's batched recalculation `UPDATE` and every
  cascade sweep, producing a log whose dominant content is the engine talking to itself.
- **An `activity.created` event, to pair with the delete.** Rejected. ADR-0048's undo of a delete is
  a **re-create**, so the log will show deletions that were reversed with no matching restore. That
  is recorded as debt pointing at ADR-0048 M4 (id-stable restore) rather than papered over by
  auditing creates — which would earn a row under neither test.
- **A `plan_id` column so plan-structure rows can be filtered by plan.** A schema change to serve a
  filter nobody has asked for; `subject_id` + `subject_label` already name the object.
- **Keep the original order.** See Decision 4: the unfiltered window is not recoverable.

## Consequences

- The vocabulary nearly doubles, and four exhaustive maps must be kept in lock-step. Each is a
  **compile error** when it drifts, by design — the discipline the redactor and the copy map
  already use.
- **Failed sign-ins recorded before C2 are unattributable forever.** The trigger refuses `UPDATE`;
  there is no backfill, and there cannot be one.
- **A member's own feed becomes writable by an unauthenticated party** — anyone who types their
  address into the sign-in form. No coalescing is added, because the repetition is the signal.
- ADR-0072's most-likely-bug — reading `before` outside the lock that makes the read safe, the
  defect ADR-0063's `dissolve` actually shipped — now repeats across roughly 14 more services. It is
  called out in every coverage slice rather than trusted to reviewers.
- **The engine argument is unchanged and still structural.** `computeSchedule` is not imported, and
  auditing the recalculation is forbidden: it is deterministic from inputs that are themselves
  audited, so a row saying "the schedule was recomputed" is noise, not evidence.
  **One correction to the plan, verified against the code:** the census's six assertions force a
  route **to be** audited and force every route to be classified exactly once, but **nothing
  forbids auditing one**. `ENGINE_DERIVED` is a documented rule, not a gate. If that protection is
  wanted it has to be written — the plan's C3 risk line claims it already exists, and it does not.
- Roughly 14 more transactions carry the measured 1.19 ms insert (0.70 ms of which is the
  `organization_id` FK trigger). Re-measured in C4.1 rather than assumed to stay affordable.

## References

- [ADR-0072](0072-append-only-audit-log.md) — the append-only audit log. Accepted, **not edited**;
  it gains a pointer in its "Still outstanding" section, in the same way its M1 and M3 sections were
  appended.
- [ADR-0048](0048-undo-redo-command-stack.md) — undo of a delete is a re-create (the unpaired-delete
  consequence above).
- [ADR-0060](0060-tabbed-activity-editor-and-per-scope-save.md) — a `VITE_` constant cannot gate a
  server-side check (Decision 4's mechanism).
- [ADR-0058](0058-drift-control-and-the-reconciliation-pass.md) — verify the claim, do not trust the
  document. Applied twice while writing this: the census gate above, and the discovery that
  [ADR-0071](0071-per-assignment-lag.md) had never been filed.
- Feature spec: [`../specs/audit-log-coverage/feature-spec.md`](../specs/audit-log-coverage/feature-spec.md)
- Implementation plan: [`../specs/audit-log-coverage/implementation-plan.md`](../specs/audit-log-coverage/implementation-plan.md)
- `docs/TECH_DEBT.md` #91 — closed by Decision 2.
