# ADR-0096 — Deleted work expires, and purge is refused structurally

- **Status:** Proposed (M0 landed 2026-08-18: the indexes, the FK-safe order, and the two
  corrections below. M1–M5 not built.)
- **Date:** 2026-08-18
- **Supersedes:** nothing
- **Amends:** ADR-0087 (narrows its scheduler to a second job with a different cost profile),
  ADR-0057's recycle-bin surface (grouping, not the restore contract)
- **Builds on:** ADR-0046 (`delete_batch_id` and the plan-cascade sweep), ADR-0072/0073 (the
  append-only audit log and its two coverage tests), ADR-0085 (erasure vs the audit log),
  ADR-0086 (the staff identity that cannot reach a customer), ADR-0087 (the retention sweep)
- **Spec:** [`docs/specs/recently-deleted/`](../specs/recently-deleted/)

---

## Context

The product owner reported three things about Recently Deleted: it is hard to browse, the
"Restore its parent first" message is unhelpful, and the page prints its own name twice. They asked
for a **purge** with permanently-deleted content **transferred to a Super Admin account** as a
safeguard.

Reading the code changed two of those in ways worth recording, because the requests were reasonable
and the answers are not the ones they imply.

**"Restore its parent first" mostly describes work the product already does.** Deleting stamps a
whole subtree with one `delete_batch_id` and `restoreBatch` keys the restore on that value
(`hierarchy-lifecycle.service.ts:98-99`, `:517-586`) — so restoring a client already restores the
project and plan deleted with it. The screen renders each row separately and offers a per-row action
on rows that are not independently actionable. **The message is correct and useless**, which is
exactly how it was reported.

**Nothing has ever expired.** The list grows forever. That, not the absence of a purge button, is
why it is hard to browse.

---

## Decision

### D1 — Purge is refused, and refused structurally rather than as a preference

A user-facing purge is **not built**. Two decisions already in this register make the requested
shape impossible, and neither is a rule someone could remember to follow:

- **The safeguard cannot exist as asked.** ADR-0086 is titled _"A staff identity that cannot reach a
  customer"_, and its `StaffPrincipal` has no memberships, no `organizationId` and no `can()` — so
  staff touching customer data is **a compile error**. "Transfer purged content to the Super Admin
  account" asks for precisely the reach that decision spends itself preventing.
- **The evidence cannot be relaxed.** `audit_events` refuses `UPDATE` and `DELETE` by
  `ENABLE ALWAYS` triggers, and ADR-0085 D1 explicitly **rejected** relaxing them, because doing so
  converts a structural guarantee into a procedural one — the answer to "could these rows have been
  altered?" degrades from _"not by the application role"_ to _"only by the erasure path, which we
  believe was used correctly"_.

What the request was **for** is served instead: the list becomes browsable by grouping, and it stops
growing by expiring. Purge was the proposed mechanism, not the goal.

### D2 — Soft-deleted hierarchy expires at 90 days, and this is the first _aimable_ hard delete

A sweep permanently deletes soft-deleted clients, projects and plans whose `deleted_at` is older
than `RETENTION_HIERARCHY_DAYS` (default 90).

**CLAUDE.md §17 must be corrected when this ships.** It currently tells readers the only hard delete
is interchange's failure compensation (`interchange.service.ts:1134-1139`) — true today, and that
path **cannot be aimed at existing data**: it rolls back a plan the importer had just created and
nobody had seen. This one can be aimed. That difference is the whole reason this ADR exists.

### D3 — The clock is retroactive, and armed on release

The 90 days counts from `deleted_at`, not from this decision, so the first armed tick takes the
existing backlog. The product owner chose this over a report-only window with the consequence
stated. Mitigated by D4 rather than by softening it.

### D4 — The countdown ships one release before the sweep arms

A single release cannot both show the blast radius and arm the deletion:
`retention-sweep.service.ts:110-113` runs an **unawaited sweep at boot**, so arming and deploying are
one event and the panel would become readable only after the deletion it was meant to preview.

**This refutes a promise made to the product owner in conversation**, and is recorded as a
correction rather than quietly satisfied: M3 ships the countdown and the blast-radius view with
nothing deleted; M4 arms it. Under ADR-0047 the host auto-pulls, so the gap between the two releases
is the notice period.

### D5 — The expiry deletes by ownership scope, never by `delete_batch_id`

`HierarchyLifecycleService` touches 13 models and **`resource_assignments` and
`cross_plan_dependencies` are not among them** — zero matches, confirmed twice. A batch-keyed delete
would therefore fail the FK on exactly the plans that matter: resourced ones and programme-linked
ones. The deletable set is derived from ownership (`plan_id ∈ scope`, `activity_id ∈ actIds`), which
was enumerated from `pg_constraint` and run end to end against a real database.

Those two tables stay unstamped (`docs/TECH_DEBT.md` #139). Fixing them here would change what
`restoreBatch` brings back, and a cross-plan edge is a **shared** object between two plans —
stamping it into one plan's batch means restoring that plan silently resurrects an edge into a plan
that may have been deleted and restored separately. That is an ADR-0045 question, and it would
otherwise land in the same release as the first aimable hard delete.

### D6 — One index per hierarchy table, and a second one rejected on measurement

`(organization_id, deleted_at DESC, id) WHERE deleted_at IS NOT NULL` on `clients`, `projects` and
`plans` — TECH_DEBT #57's own candidate, measured and unchanged. One screen open on the largest
seeded organisation: **1,208 → 466 ms**. The hourly expiry scan **with nothing to do: 13.1–19.0 →
0.73–1.39 ms**, which is the number that matters, because after the first sweep clears the backlog
every subsequent run forever is that one, and it was scanning three tables to prove an absence.

A dedicated org-agnostic index was built, measured and **rejected**: 0.5 ms once an hour for 152 kB
(the ADR-0053 M4 outcome), with a revisit trigger of roughly a million soft-deleted rows rather than
a date.

`id` is in the key deliberately, at 5× the size, because a cascade stamps **one** `deleted_at` on
every row it touches — so paging a large batch is entirely the id tiebreak.

### D7 — `RESTRICT` does not force level-order deletion, and the spec said it did

The spec's §4.5 R2 claimed one `DELETE FROM activities WHERE plan_id = ANY(...)` must fail when a
summary and its children are both in it, and specified a repeated leaves-first loop. **It is false.**
The RI check is an `AFTER ROW` trigger evaluated at the end of the statement, so every row that
statement targets is already gone before any check runs.

Two reviewers established this independently and by different methods — a 100-deep chain plus 1,900
leaves deleted in one statement with a negative control proving the test is not vacuous, and the same
conclusion reached from trigger timing on a separate fixture. **The spec is corrected in place**
(ADR-0071), not left to be contradicted by this document.

The loop was never a performance mitigation either: each pass pays the same per-row RI cost.

### D8 — Expiry writes one audit event, inside the deleting transaction

`hierarchy.expired`, one row per batch carrying scalar counts, via `record()` **with** the
transaction — so an unwritable audit row rolls the deletion back. ADR-0073 C4 recorded the inverse
mistake (a producer written outside a transaction, whose failure broke its caller); this is that
lesson applied in the right direction. It passes both ADR-0073 tests: the deletion is **durable** and
its **blast radius** is a whole subtree.

### D9 — The blast radius lives on the organisation's own screen, not the staff console

The obvious home for "how much is about to be deleted" is the ADR-0087 M3 staff Retention panel.
`staff-boundary.structural.spec.ts:92` already names `recycle-bin` in the forbidden-import list, and
`:115-140` forbids the Prisma accessors it would need. **ADR-0086 is not amended and that spec is not
touched** — staff cannot restore anything, so the read buys nothing there worth widening a boundary
whose entire value is that it is structural rather than remembered.

### D10 — The arming switch is an enum, because `z.coerce.boolean()` reads `'false'` as `true`

M3 shipped `RETENTION_HIERARCHY_ENABLED: z.coerce.boolean().default(false)`. That coercion is
`Boolean(value)`, so **the string `'false'` parses to `true`** — verified rather than reasoned:
`z.coerce.boolean().parse('false') === true`. On the one switch in this product that permanently
destroys customer work, the documented way to turn it off turned it on, and `.env.example` ships the
literal line `RETENTION_HIERARCHY_ENABLED=false`, so **copying the example file was enough to arm
it**. The three sibling declarations immediately above it — `RETENTION_SWEEP_ENABLED` among them —
had the correct `z.enum(['true','false']).transform(…)` pattern the whole time: the ADR-0064 §7
shape for the sixth epic running, one correct pattern applied to a control and not its neighbour.

It is now an enum, so an unreadable value (`yes`, `0`, empty) **fails the boot** rather than being
guessed at, and the regression test was verified red against the M3 code. A repository-wide sweep
found `z.coerce.boolean()` used exactly once, here.

The claim about zod is deliberately **not** registered in `scripts/dependency-claims.json`
(ADR-0076): that register pins a file, a line range and an anchor inside a dependency, and this is
not a citation into zod's source — it is an executed expression, which is the stronger evidence of
the two. What matters going forward is not what `z.coerce.boolean()` does but what **this switch**
does, and `env.validation.spec.ts` asserts that directly, so a zod bump that changed the enum
transform's behaviour fails a test rather than silently invalidating a paragraph.

---

## Consequences

- The product's first aimable hard delete of customer content exists, gated by a 90-day clock, an
  operator override, and a release of notice.
- A name in `audit_events` **outlives the row it names**, permanently, because that table refuses
  `DELETE` (ADR-0085 D1). This is pre-existing and unchanged, and is stated here because this is the
  decision framed around retention.
- The CPM engine is not imported. The ADR-0034 recalculation parity gate is untouched — in its honest
  form: there is nothing here to hold parity for. **One real consequence is not covered by that
  sentence**: expiring a plan that is a live cross-plan dependency endpoint changes the _surviving_
  downstream plan's next input. M4 **proved** it against a real database rather than reasoning about
  it (`test/hierarchy-expiry.e2e-spec.ts`): with the upstream client, project, plan and activity
  gone, the surviving downstream plan recalculates on both `recalculate-programme` and
  `recalculate`. The case is green before the expiry as well as after, so the assertion is about the
  deletion and not about the fixture.
- A wrong FK order fails loudly (`23503`, naming the constraint) rather than corrupting anything —
  but the batch then never expires and is retried hourly forever, so `23503` must be escalated rather
  than absorbed as ordinary sweep noise.
