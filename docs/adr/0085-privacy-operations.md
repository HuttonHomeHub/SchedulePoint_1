# ADR-0085 — Erasure collides with the audit log, and that collision is the decision

**Status:** Accepted (decision only — **nothing is built by this ADR**)
**Date:** 2026-08-09
**Builds on:** ADR-0072 / ADR-0073 (the append-only audit log), ADR-0016 (identity & tenancy),
ADR-0046 (soft deletes and the recycle bin), ADR-0050 (interchange export).
**Amends:** `docs/SECURITY_STANDARDS.md` §"Data protection & privacy" — its "not yet implemented"
paragraph, which states the position correctly and gives no reason for it.
**Supersedes:** nothing.

## Why this is an ADR and not a ticket

`docs/BACKLOG.md` carries **Privacy operations** as an `M`: "a hard-delete path and a data-export
path, both explicit and audited." Sized as work. It is not work, or not yet — it is a decision with
a genuine conflict at its centre, and picking it up as a ticket means resolving that conflict by
whichever half the implementer happened to open first.

The conflict: **`audit_events` refuses `UPDATE` and `DELETE` in the database itself.** Not by
convention — by `BEFORE UPDATE OR DELETE` and `BEFORE TRUNCATE` triggers declared `ENABLE ALWAYS`,
so the application role cannot bypass them and neither can a superuser session
(`apps/api/prisma/migrations/20260803170000_audit_events/migration.sql:111-122`). And the table
holds personal data on purpose: `subject_label` stores the address a failed sign-in named, which
ADR-0073 C2 deliberately keeps in **the caller's own casing** so the row says what was actually
typed.

So a right-to-erasure request meets a guarantee this product made on purpose, three ADRs ago, and
implemented at the strongest layer available to it. Either can be honoured. Not both, silently.

## What the system actually holds — read from the schema, 2026-08-09

Establishing this first, because every option below is scoped by it and because the existing
"minimise collected PII" claim in `SECURITY_STANDARDS.md` deserved a count rather than a sentiment.

| Where                                    | What                                                         | Deletable today      |
| ---------------------------------------- | ------------------------------------------------------------ | -------------------- |
| `users`                                  | `name`, `email` (unique), `email_verified`                   | Soft only            |
| `invitations`                            | `email` — an address for someone who may have **no account** | Soft only            |
| `audit_events`                           | `actor_user_id`, `subject_id`, `subject_label` (an address)  | **Never** (triggers) |
| 54 attribution columns across the schema | `created_by` / `updated_by` / `deleted_by` user ids          | Soft only            |
| `notes`                                  | free-text bodies, attributed                                 | Soft only            |
| Better Auth session/account tables       | session rows, credential hashes                              | Library-owned        |

Two facts follow that a plan written from the backlog line would have missed. **The invitation
table holds addresses for people who never became users**, so "erase a user" is not the whole
request. And **54 attribution columns** mean erasure is not a row deletion but a graph problem: a
plan's history is made of who did what.

The good news is the other half. The application stores **no** phone numbers, addresses, payment
details, uploaded files or free-text profile fields — object storage (ADR-0011) is unimplemented, so
there is no blob store to sweep. The exposure is a name, an email, and authorship.

## Decision

### D1 — Erasure is **anonymisation of the actor**, never deletion of the record

The subject's `users` row is scrubbed — name replaced with a tombstone, `email` replaced with a
non-routable unique value that preserves the unique index — and every attribution column keeps
pointing at the same id. The audit log is untouched: its rows already reference the user **by id**,
so once the id resolves to a tombstone the log tells you an action happened and no longer tells you
who. `subject_label` is the one exception and needs its own answer (D3).

This is the only option that honours both guarantees rather than choosing between them. Deleting the
user row would either cascade destruction across 54 attribution columns — taking with it the plan
history of an organisation that has a legitimate interest in it, and other people's work — or leave
dangling ids, which is a corrupt database dressed up as a privacy feature.

**Considered and rejected: relaxing the append-only triggers for an erasure path.** It is the
obvious move and it is the wrong one, because it converts a _structural_ guarantee into a
_procedural_ one. ADR-0072's honest claim is tamper-**resistant**, and the resistance is exactly the
`ENABLE ALWAYS` trigger; a documented exception that deletes audit rows means the answer to "could
these rows have been altered?" changes from "not by the application role" to "only by the erasure
path, which we believe was used correctly". That is a different product.

### D2 — An invitation to a non-user is erased by **deleting the row**, and that is a real distinction

An unaccepted `PENDING` invitation to an address is personal data about someone with no account, no
attribution and no history. There is nothing to preserve, so it is a hard delete rather than a
tombstone. Stating it separately because a plan reasoning only about `users` would leave the most
clear-cut case in the system unhandled — an address held for someone who never agreed to anything.

### D3 — `subject_label` is redacted **in place is impossible**, so it is bounded by retention

The one row the tombstone cannot reach: a failed sign-in for `someone@example.com` names the address
in a column, in a table that refuses `UPDATE`. There are exactly three honest answers and this ADR
picks the third:

1. Relax the trigger — rejected at D1.
2. Accept it permanently — makes the strongest privacy claim in the product ("we can erase you") false
   for the single most sensitive event type it records.
3. **Bound it by time.** `auth.*` rows carrying a `subject_label` are the only rows in the table with
   a retention period, expired by a scheduled job that deletes them wholesale — which the triggers
   must permit for that narrow, dated predicate and nothing else.

(3) is chosen because a retention policy is a rule applied to all rows alike, which is a far weaker
hole than a per-subject delete: it cannot be aimed. The period is **not set here** — it is a legal
question, not an engineering one, and inventing a number would be exactly the ADR-0076 Class 3
failure this repository keeps recording.

### D4 — Export is **organisation-scoped and role-gated**, not subject-scoped

The obvious reading of "data export" is a subject-access request: everything about _me_. That is the
wrong first build for this product, and the reason is what the data is. A planner's personal data
here is a name, an email and a list of ids they touched; a subject export is a small file that tells
its reader almost nothing. What people actually ask for — and what
`docs/BACKLOG.md` means by it — is **their organisation's schedules, leaving**.

Plan-level export already exists (XER/MSPDI, ADR-0050 M4; CSV/PNG/PDF and the printed programme).
The gap is org-wide, and it is `ORG_ADMIN`-gated because it is a bulk read of everybody's work.

A subject export remains owed and is a smaller, later piece; it is named here so its absence is a
recorded decision rather than an oversight.

### D5 — Every privacy operation is itself audited, and the census must be able to see it

Erasure and export are precisely the ADR-0073 blast-radius shape: irreversible, org-wide, and
performed _on_ someone rather than by them. They earn `privacy.erased` and `privacy.exported`
events, and — because the payload allow-list would otherwise strip the subject — the subject is
recorded **by id**, which the tombstone then renders anonymous by the same mechanism as everything
else. There is a pleasing consistency there: the audit record of an erasure is anonymised by the
erasure it records.

### D6 — None of this is built now, and the trigger for building it is named

**Nothing in this ADR is implemented.** The product has no external users beyond the product owner's
own deployment, so the request this would serve cannot yet arrive.

It gets built when **either**: the first organisation outside the product owner's own is onboarded,
or a real subject request arrives. Naming the trigger is the point — "Privacy operations `M`" has sat
in the backlog with no condition attached, which is how something stays exactly one priority below
whatever is being done.

## Consequences

- `docs/SECURITY_STANDARDS.md` gains the **reason** its "not yet implemented" paragraph lacked, and
  a pointer here.
- `docs/BACKLOG.md`'s `M` gains its trigger condition and stops being sized as undifferentiated work.
- **A future erasure implementation may not touch the append-only triggers** except for D3's dated,
  aimable-at-nobody predicate. That constraint is the most valuable thing this ADR records, because
  it is the one a ticket-sized approach would have spent first.
- The 54 attribution columns are now a documented fact rather than a discovery.

**The CPM engine is not imported and no migration runs.** There is no code in this ADR at all.
