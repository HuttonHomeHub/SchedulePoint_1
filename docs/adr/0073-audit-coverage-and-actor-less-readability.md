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

### Measured, C3.0 (2026-08-04) — the row rate, before a single producer shipped

ADR-0072 gated this rung on an estimate nobody had made. §2.4 made one; this is the check, and it
ran **before** any producer existed — deliberately, because an append-only table cannot be cleaned,
so narrowing the catalogue is cheap now and impossible later.

Counted from the seed catalogue's own `SeedSpec`s rather than from persisted rows
(`scripts/measure-audit-row-rate.mjs`). That is the ADR-0066 rule applied to a measurement: the
specs are the source of truth for what the catalogue builds, and every family D–G operation maps to
exactly one spec element, so counting rows back out of a database would have required the producers
this measurement exists to gate.

| Shape                                 |     `dependency.created` rows |
| ------------------------------------- | ----------------------------: |
| Fixture + capability tiers (18 plans) | 254 total — **14.1 per plan** |
| Scale generator, 500 activities       |       800 (1.60 per activity) |
| Scale generator, 2,000 activities     | **3,200** (1.60 per activity) |

§2.4 estimated ~2,500 link creates for a 2,000-activity programme. Measured: **3,200 — a ratio of
1.28×**, against a narrowing gate of 5×. **The catalogue ships unchanged.**

Two things worth stating rather than leaving implicit. `dependency.created` **dominates the included
catalogue** at 1.6 rows per activity — everything else is tens per plan — so it is the action to
watch if the gate is ever re-run. And this measures the **included** classes only: the excluded ones
scale with interactions rather than with the size of the programme, which is the difference §2.4's
argument rests on and the reason no static artefact could count them.

### Built, C3.1 (2026-08-04) — family D, and two places the spec's shape was wrong

The first coverage slice: `activity.deleted` / `.restored` / `.dissolved` / `.reparented` and
`dependency.created` / `.deleted`, each produced inside the existing transaction, after the existing
`assertHoldsPen`, with the census's six routes moved and a new positive assertion — "audits every
destructive act inside a plan" — beside the permission-change and hierarchy ones.

**It also fixes §0.1(1), which had never worked.** The M1 spec promised family C would record
`changes = { deleteBatchId, counts: CascadeCounts }`. The shipped allow-list named no counts and the
producer passed none — and it could not have worked if it had, because the redactor's `normalise`
reduces any non-scalar to a type marker **by design** (the allow-list vets the top-level key and
cannot vouch for a sub-tree). So a delete of 412 activities recorded the batch id and not the size.
Counts are now **flattened scalars**, one field per level, on family C and family D alike. Old rows
are not backfilled and cannot be: the table refuses `UPDATE`.

**Two departures from the feature spec's shape, both because the spec was wrong about a case the
API permits:**

1. `activity.reparented` gains **`parentCount`**. The spec's `{ movedCount, parentName }` encodes
   "moved to the top level" as an absent `parentName` — but a batch may name a **different**
   destination per row, and that would render identically. Absence a reader cannot distinguish from
   a fact is the defect this whole milestone exists to remove, so the count makes all three cases
   determined.
2. `activity.dissolved` is filed under **`plan-structure`, not `deletions`**, though it soft-deletes
   a row. A dissolve removes the grouping and **keeps the work**; filing it under "what disappeared"
   would tell a reader looking for lost work that a phase's forty activities went away.

**What the census gained, and what it still cannot do.** `CONTENT_EDIT` splits into
`DURABLY_ATTRIBUTED` and `PLAN_CONTENT` — both **permanent**, both a decision — plus a third,
`PENDING_COVERAGE`, which the spec did not anticipate and which is honestly a _queue_: fifteen
routes C3.2–C3.4 will claim. A new assertion pins that list as a **snapshot**, so the failure it
catches is a route quietly _arriving_ there — parked as "later" by whoever added it — rather than
the expected shrinkage as slices land. When C3.4 lands the list is empty and the constant is
deleted. Note also what this ADR's own implementation plan got wrong about ADR-0072's census: its
six assertions force a route **to be** audited, and nothing in them forbids auditing one, so
`ENGINE_DERIVED` remains a documented rule and not a gate.

**The CPM engine is not imported, and the recalc parity gate is untouched.** The producers write one
row per user action beside writes that already happened; `computeSchedule`'s input is unchanged.

### Measured, C3.1 (2026-08-04) — the index does not ship, and NOT for the reason the plan gave

C3.1's last step was "re-measure the filtered organisation read; add
`idx_audit_events_org_action_occurred` **only** if it wins." It does not, and what the measurement
actually says is more useful than the verdict.

Postgres 17, 1,000,000 rows over two years, seeded from the vocabulary **as it stands after C3.1** —
family D weighted the way C3.0 measured it, so `dependency.created` dominates. Split across three
organisations, one of which (467k rows) has never used share links or invitations, which is the
realistic zero-match: a large partition and a chip that can only answer "no events" **for this
tenant**. `EXPLAIN (ANALYZE, BUFFERS)` on the real keyset query, warm.

| Read (organisation route, `LIMIT 50`)                | No index (shipped) | With the candidate index |
| ---------------------------------------------------- | -----------------: | -----------------------: |
| Unfiltered page                                      |            0.36 ms |                unchanged |
| **Plan structure** chip (3 actions, all populated)   |            0.37 ms |                unchanged |
| **Deletions** chip (9 actions)                       |            0.40 ms |                unchanged |
| **Access** chip (9 actions, 3.5% of rows)            |            0.26 ms |                unchanged |
| Two actions + `DENIED` (rare, present)               |              86 ms |                    91 ms |
| **9-action chip, zero match on a 467k-row tenant**   |         **341 ms** |               **326 ms** |
| _Same, single action_                                |             341 ms |             **0.081 ms** |
| _Same, 9 actions, `count(*)` with **no** `ORDER BY`_ |                  — |             **0.116 ms** |

Index cost: **80 MB** on a 450 MB table.

**The index wins only for a query shape the client never sends.** One action: 341 ms → 0.081 ms, a
4,000× improvement — which is what C1's projection measured and why the plan expected it to ship.
But the filter is **category**-based, and a category expands to **three or nine** actions before it
reaches the wire. With an `IN` list of that width Postgres will not use the index at all — not even
with `enable_seqscan = off` — because serving `ORDER BY occurred_at DESC, id DESC LIMIT 50` from N
separate index ranges would need a merge it declines to plan. It falls back to walking the
organisation partition in date order, which is the same 341 ms the unindexed table costs.

**The last row is the diagnosis.** Drop the `ORDER BY` and the same nine-action zero-match answers
in **0.116 ms** from the same index. So the predicate is not expensive and the index is not wrong:
the cost is the **pagination ordering combined with** a multi-value filter. Adding 80 MB to buy
nothing on every read the product actually issues would have been a measurable regression in storage
and write cost for a placebo.

**What this means for C3.2–C3.4.** The gate stays per-slice, but the question changes: it is no
longer "does an action index help?" — measured, not for a category chip — but "does the ordered read
need a different shape?" The two candidates, neither taken now because neither is warranted at the
volumes C3.0 measured: resolve the matching id set from a `(organization_id, action)` index and
order that (two cheap steps instead of one expensive one), or expose single-action filtering so the
fast path becomes reachable. Both are constant-factor moves on a read that is **sub-millisecond for
every populated chip**; only the zero-match case on a very large tenant is slow, and it is slow in a
way this index does not fix.

### Built, C3.2 (2026-08-04) — family E, and the one create in the catalogue

`plan.settings_changed`, `calendar.working_time_changed`, and `baseline.captured` / `.activated` /
`.deleted`. These are **updates**, which the durability test says do not earn a row — they are here
on the blast-radius test instead, and that asymmetry is now pinned by a fourth positive census
assertion, because a future reader applying Test 1 alone would move them to `PLAN_CONTENT` with a
plausible reason and remove the only explanation the log offers for "everything moved overnight".

**The governance set is one `const`, and the producer diffs by VALUE.** `PLAN_GOVERNANCE_FIELDS`
is `satisfies readonly (keyof UpdatePlanDto)[]`, so a typo is a compile error, and the redactor's
allow-list for the action **is that array spread** rather than a second copy — a field removed from
the set stops being recordable in the same commit. The value diff is not a refinement: the plan
settings dialog resends the whole form on every save, so a presence check would record fifteen
changes each time a planner moved one, and `name` and `description` — which are outside the set —
would still have to be excluded by hand somewhere. Dates compare by instant and `null`/`undefined`
are one state, because two `Date`s for the same moment are never `!==`-equal and `currencyCode: null`
means the same thing as never having set one.

**Three calendar-exception routes fold into the PATCH's action rather than earning three of their
own.** An exception _is_ working time; a reader asking why every date moved does not care which
control produced the edit. The payload names the **kind** (`shifts` / `hoursPerDay` / `exception`)
and not the rows: they are non-scalar, so the redactor would reduce them to a type marker anyway,
but the reason to withhold them is the reader's — a JSON dump of seven days' windows buries the one
fact the row exists to carry. `hoursPerDay` is its own kind because after ADR-0068 it is the
day↔minute factor: moving it reinterprets every duration **without** changing when anybody works.

**`baseline.captured` is the catalogue's only audited create**, and it is worth saying why rather
than letting it look like an inconsistency: a baseline is the standard every later variance is
measured against, so capturing one changes what "late" means for the whole plan. That is the
blast-radius test passing on a create, which nothing else in the catalogue does. `baseline.deleted`
is filed under **deletions** while capture and activation sit in **settings**, because those are
the questions a reader actually asks about each ("where did the December baseline go?" versus "what
changed about the rules?").

`softDeleteWithSnapshot` now returns its batch id so the delete row can carry it, which is the same
thread every other deletion in the log names. **The CPM engine is not imported.**

### Built, C3.3 (2026-08-04) — family F, and why archive is the sharp case

Seven actions over the two shared libraries (ADR-0053): `calendar.deleted` / `.archived` /
`.unarchived` / `.scope_changed`, and `resource.deleted` / `.archived` / `.unarchived`. A calendar
or a resource in the shared library is used by work its owner does not own, so what the library
offers is the blast-radius test in its plainest form.

**Archiving is the case that most needs the log, and it is the one that looks least like it does.**
ADR-0053 §4 made archive deliberately orthogonal to soft delete: the row stays valid, every
existing binding keeps scheduling **identically**, no lock is taken, no cascade runs, and only a
_new_ usage is refused. So nothing breaks, nothing is announced, and the whole effect of the change
surfaces days later as somebody asking why they can no longer pick a calendar they used last month.
That is a change with no other durable record of who made it or when — which is Test 1 and Test 2
passing at once on an action that a reader skimming the route list would file under "harmless".
It is pinned by a fifth positive census assertion for exactly that reason: a later refactor moving
these to `PLAN_CONTENT` with a plausible sentence would pass every exhaustive test above it.

**Archive and unarchive are two actions, not one action with a boolean.** They are the same
controller method with a flag, and it was tempting to record `library.archive_changed` with
`{ archived: true }`. A reader filtering the feed asks "what was retired?", not "what had its
archived flag written?", and one action would make that question unanswerable without reading every
payload. The same reasoning keeps `calendar.scope_changed` out of `deletions`: a tier move is a
statement about who may use this from now on, which is a settings question.

**A tier move is a second row on the same request, not a field on the first.** The calendar PATCH
can edit the working week _and_ narrow the scope in one call, and those are two different facts a
reader looks for on two different days. They share a `correlation_id` — the `invitation.accepted` +
`member.joined` precedent from M1 — which is what makes "these happened together" recoverable
without collapsing two questions into one action. It is also the census's first route mapping to
**two** actions, so that list is now `readonly AuditAction[]` in substance as well as in type.

**A GROUP delete writes one row carrying `resourceCount`, never one per descendant** — the rule
family D applies to a WBS summary, for the same reason: the delete is one thing a person did, and
2,000 rows would bury that rather than record it. `calendar.deleted` records `scope`, because a
shared-library calendar going away is a different event from a project one and after the delete the
audit row is the only place that distinction survives.

**Two archive paths gained a transaction, and it is worth being precise about what that does not
mean.** `setArchived` on both services now wraps its version-gated update and the audit insert in
one `$transaction`, so the row shares the write's fate. It adds an insert beside the update — it
does **not** add a lock, a cascade or an in-use count, which is ADR-0053 §4's whole point and stays
true. `softDeleteWithExceptions` and `softDelete` return their batch ids for the same reason
`softDeleteWithSnapshot` did in C3.2.

The web copy says **"Calendar retired"** rather than "archived", because the screen has to make the
distinction the model makes: nothing was deleted and nothing stopped working. **The CPM engine is
not imported**, and the recalc parity gate is untouched — an archived calendar schedules exactly as
it did the moment before.

### Built, C3.4 (2026-08-04) — family G, and the one producer that cannot sit in its transaction

`interchange.imported`, the catalogue's last action and its only import. A plan built by hand is a
sequence of choices somebody made and can account for; an imported plan arrived **whole**, from a
file, with hundreds of activities and possibly rows added to the shared libraries — and the upload
is not retained, so once the tab is closed nothing in the product distinguishes it from a plan
somebody typed. That is the durability test at its plainest: the act erases its own trace.

**Where it is written is a departure from the implementation plan, and the reason is structural.**
The plan said "inside the commit transaction", which is right for every other producer in C3 and
wrong for this one. `audit_events` is append-only **in the database** (ADR-0072) — the application
role cannot delete a row it wrote. The import's phase 2 recalculates in its own transaction and,
on failure, **hard-deletes** the just-created plan to honour "nothing is created on failure". A row
written in phase 1 would survive that compensation and permanently assert an import of a plan that
does not exist and never did. Every other C3 producer can ride its write's transaction because a
rollback removes both; here only one of the two is retractable.

So the row is written at the **point of no return**: after phase 2 has made the import durable, and
before phase 3, which is best-effort and cannot un-import anything. The residual risk inverts —
this write failing after a successful import leaves **no** row. That is silence rather than a false
claim, which is the right way round for an audit log, and it is the trade recorded here rather than
smoothed over.

The payload names the file (`sourceFilename` — display-only, never a path, and the reader's only
route back to a source that is not kept), the format, and the size of what arrived. `findingCount`
is a **scalar, not the report**: the report is a document, `normalise()` would reduce it to a type
marker anyway (the family C lesson), and a count says "this import was not clean, go and read it"
without pretending the row is the report. The dry-run stays unaudited beside it — it reads a file
and writes nothing, so there is no act to record.

**`PENDING_COVERAGE` is gone.** It was introduced in C3.1 as a third census reason the spec had not
anticipated — honestly a _queue_ rather than a decision — pinned as a snapshot so a route quietly
_arriving_ there would fail rather than pass. C3.4 emptied it, so the constant is deleted and a
sixth assertion takes its place: every reason in the census must be a declared decision, and the
string `awaiting-a-later-c3-slice` must not exist. A route added later is classified by the two
tests, not deferred with a note.

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
