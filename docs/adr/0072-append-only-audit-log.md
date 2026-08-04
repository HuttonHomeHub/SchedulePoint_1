# ADR-0072: The append-only audit log, and what "append-only" honestly means here

- **Status:** Accepted
- **Date:** 2026-08-03
- **Deciders:** Product owner; database-architect (data model + the measured enforcement
  analysis); feature-analyst (delivery shape, the write seam, the coverage gate)
- **Spec:** [`docs/specs/audit-log/`](../specs/audit-log/feature-spec.md)

## Context

`docs/SECURITY_STANDARDS.md` has, since it was written, published a commitment the product does
not keep:

> **Append-only audit log** for security- and sensitive events (authentication events, permission
> changes, sensitive mutations, deletions/exports): who, what, when, and before→after where
> relevant. Audit entries are **never mutated or deleted**.

The section is titled _"not yet implemented"_. The gap was raised independently in the A1 and C1
security reviews and is `docs/TECH_DEBT.md` #14.

What exists instead — verified in code, not taken from the documents (ADR-0058):

- **Row attribution** (`created_by` / `updated_by` / timestamps) records the **last** writer and
  nothing before them. A member promoted and demoted an hour later leaves a row indistinguishable
  from one that never changed.
- **Soft delete + `delete_batch_id`** keeps the _rows_, but the **act** of deleting leaves no
  record beyond `deleted_at`, and a restore erases even that. `HierarchyLifecycleService` computes
  a rich `CascadeCounts` on every cascade and writes it to **stdout**.
- **Structured logs** carry the _new_ role and not the old one, go to stdout, and stdout is
  rotated, mutable at the sink, and shipped nowhere by the running Compose stack.
- **Authentication has no record at all.** A sign-in, a failed sign-in, a sign-out and a
  verification leave no row anywhere; `sessions` holds live sessions only and Better Auth deletes
  the row on sign-out.

Two forces make this current rather than theoretical. The product is **in use** — CLAUDE.md §17
records that the owner runs the Compose stack with the ADR-0047 Watchtower profile enabled, so
anything shipped default-on is live and the questions an audit log answers are askable about real
data. And the product is **multi-tenant with a privileged role**: an Org Admin can change any
member's role, remove any member, invite anyone, and cascade-delete a client with every project,
plan and activity under it. ADR-0012's RBAC decides whether an action is _allowed_; nothing
records that it _happened_.

Three constraints shape every option below:

1. **One database role.** ADR-0018's entrypoint runs `prisma migrate deploy` as the single
   `DATABASE_URL` role on every boot. That role **owns** every table and **cannot create another**
   (measured: `rolcreaterole = f` locally). The **deployment target is still undecided**
   (TECH_DEBT #5), so "provision a second role in every environment" is not a set we can enumerate.
2. **Better Auth is mounted outside Nest.** `app-setup.ts:53` mounts it on the raw Express
   instance **before** the Nest application, and it terminates the response. No Nest guard,
   interceptor, pipe or filter observes an authentication request.
3. **No scheduler exists.** ADR-0009's BullMQ is accepted and unimplemented; there is no cron in
   the image. Anything that requires periodic maintenance would require a maintainer that does not
   exist.

## Decision

**We will record security-sensitive events in a single append-only `audit_events` table, written
by explicit service calls inside the transaction that makes the change, and kept append-only by a
database trigger — while stating plainly, in the security standard itself, that this stops
accident and ordinary application code and is not tamper-proof against a compromised application
role.**

### The store

The table is polymorphic over an **untyped** subject — a `subject_type` string plus a `subject_id`
correlation id with **no foreign key** — deliberately declining ADR-0046's typed-parent-FK shape,
because an audit event must **outlive its subject** and must not require a migration each time a
new entity becomes auditable. The precedent taken instead is
`baseline_activities.source_activity_id`: a plain correlation id chosen so a snapshot "survives the
source activity's hard purge".

It carries a **nullable** `organization_id` — authentication events belong to no organisation — an
open **`action` vocabulary as `text`** closed by a TypeScript union rather than a Postgres enum
(the vocabulary grows on every rung; enum labels cost two migrations each and can never be
retired; and an audit vocabulary is versioned data that must stay readable for the table's life),
and an open **`changes jsonb`** payload bounded by `jsonb_typeof`/size CHECKs and an allow-list
redactor. It is the schema's **first JSONB column**, permitted under a narrow rule recorded here:
**JSONB is allowed only for an open-ended, never-queried, never-computed payload, with a shape
CHECK and a size bound.**

It deliberately omits `updated_at`, `updated_by`, `version`, `deleted_at` and `delete_batch_id` —
every column that presumes a mutable or restorable row — and keeps the fail-closed `CASE … ELSE
false` discipline for the one genuinely closed discriminator (`actor_type`). `organization_id`
keeps a `RESTRICT` FK because it is the tenant scope tag of a security control; the consequence,
that a future erasure path must address the audit log **explicitly** rather than cascading through
it, is the intended outcome.

### Append-only

Enforced by an `ENABLE ALWAYS BEFORE UPDATE OR DELETE OR TRUNCATE` trigger that raises. The
measured basis for choosing it over the two obvious alternatives is in _Alternatives_ below.

**The honest limit is part of the decision, not a caveat to it.** The application role owns the
table, so it can `ALTER TABLE … DISABLE TRIGGER` or `DROP TABLE` (both measured). This is
append-only **against accident, against ordinary application code, and against a bug** — and
tamper-**proof** against nothing. That sentence goes into `docs/SECURITY_STANDARDS.md` beside the
claim, into the migration comment, and here. Three places, one claim. A restricted second database
role remains **recorded as the escalation**, composing with the trigger rather than replacing it,
gated on the deployment-target decision (TECH_DEBT #5).

**A hash chain is rejected**, and no columns are reserved for one. An unkeyed chain is
recomputable by exactly the actor it targets; a keyed chain moves the problem to key custody, and
there is no key custody (Compose + environment variables, no KMS) — the key would sit in the same
`.env` as the database password, held by the same process that owns the table. A chain also
serialises inserts. Reserving nullable columns would not shorten later work by a line, because a
chain must be **continuous** and cannot be retro-fitted; if one is ever wanted it begins at a
genesis row with a documented discontinuity.

### The write seam

Writes are **explicit `AuditService.record(tx, …)` calls in each mutating service, inside the
owning transaction** — never an interceptor, never a Prisma middleware or client extension.

- **`SUCCESS` events** commit with the change, atomically in both directions. Two of the M1 call
  sites (`InvitationsService.create` / `.revoke`) have no transaction today and gain one.
- **`DENIED` / `FAILURE` events** are written in their **own** short transaction after the error is
  raised, because there is none to join and joining the failing one would roll them back with the
  very failure they describe. They carry the same `correlation_id`.
- **Authentication events** have no domain transaction; the adapter writes its own.

Request context (`correlationId`, `ip`, `userAgent`) reaches services through a `@RequestContext()`
param decorator — a sibling of the existing `@CurrentUser()` — so the service signature declares
what it needs and no service reads `req`. The visible extra parameter is the accepted cost of not
having an `AsyncLocalStorage` seam.

### Capturing authentication

Better Auth is reached through **`hooks.after`** (a single `createAuthMiddleware` branching on
`ctx.path`), with **`hooks.before`** used for `/sign-out` so the acting user is resolved **while
the session still exists** — after the endpoint runs there is no actor left to record, and the
actor is the only thing that makes a sign-out row worth having. Success is `ctx.context.newSession`
being present; failure is `ctx.context.returned` being an `APIError`. The writer is threaded in as
a `recordAuthEvent` **callback** on `CreateAuthOptions`, beside the existing
`sendVerificationEmail`, for the same stated reason: `createAuth` stays a pure function of its
options and never learns about Nest DI.

Two consequences are recorded rather than discovered later:

- **There is no pino correlation id on this path.** pino-http is Nest middleware and the auth
  handler terminates the response before Nest sees the request. The adapter **mints** an id, stores
  it, and includes it in any `error` line it emits — so the row and the log still join, and the
  value is honestly "an id this adapter created".
- **The IP is resolved by one shared helper** over the same `TRUSTED_PROXY_IPS` list Express's
  `trust proxy` uses, with a unit test asserting the two agree. Two implementations of "which hop
  is the client" is drift that stays invisible until it matters.

### Failure policy — a deliberate asymmetry

| Path                   | On audit failure | Why                                                                                                                                 |
| ---------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Domain, in-transaction | **Fail closed**  | If the record cannot be written, the change must not happen. A "logged-except-when-it-wasn't" trail is worse than none.             |
| Better Auth hook       | **Fail open**    | A full table or a transient error must not lock every user out. Availability of authentication outranks completeness of its record. |

This is the design's one genuinely uncomfortable decision. It is stated here, in the spec, and in a
code comment at both sites **with the reason** — because a future reader who finds only the
behaviour will "fix" one side into the other.

### Reads

Two endpoints, and no third:

- `GET /api/v1/organizations/:orgSlug/audit-events` — org-scoped, cursor-paginated, gated by a new
  **`audit:read`** permission granted to **Org Admin only**, as its own const, never folded into
  `HIERARCHY_READ` or `ADMIN`. The log carries other members' actions and their IP addresses; this
  is the `cost:read` / `plan:share` precedent for a grant narrower than "every member".
- `GET /api/v1/me/audit-events` — **self-scoped by principal, taking no user-id parameter of any
  kind.** Identity is the scope, which makes IDOR structurally impossible (the ADR-0051
  `GuestPrincipal` pattern).

**Fanning authentication events out to one row per membership is rejected**: it duplicates one
real-world event into N rows, is only correct at write time because membership changes, and would
let one organisation infer facts about a member's activity in **another** tenant. Stamping the org
"when the user has exactly one membership" is worse — a rule that sometimes applies produces a log
whose completeness silently varies per user. So org-less rows are returned by **no** organisation
endpoint, the endpoint's OpenAPI description and the screen's own persistent copy **say so**, and
the self-read is what makes the family readable in the product. **Cross-account** authentication
history stays operator-only via the database: no role in this product exists to read another
person's sign-in history, and inventing one to fill a gap in a read surface would be the wrong
direction.

### The coverage gate

The standard objection to an explicit call is that it can be forgotten. That is answered by a
**structural test, not by a runtime seam** — the
`calendar-seams.structural.spec.ts` / `seed-vocabulary.spec.ts` / `check:playbook` pattern this
repository already uses for this exact class of risk. Four gates:

1. **Vocabulary ⇒ declared seam**, compile-time: `Record<AuditAction, AuditSeam>` is exhaustively
   keyed, so an action with no declared seam is a TypeScript error.
2. **Declared seam ⇒ the call exists**, source scan: each seam's named method body must contain
   `audit.record(` and the action symbol.
3. **The mutating-route census**: every `@Post`/`@Patch`/`@Put`/`@Delete` handler under
   `apps/api/src/modules` (67 today) must appear in **exactly one** of `AUDITED_ROUTES` or
   `UNAUDITED_ROUTES`, the latter carrying a written reason — asserted as **set equality in both
   directions**, so a new route fails CI until someone decides, and a removed route fails CI until
   the list is corrected.
4. **The engine's negative seam**: `modules/schedule/**` contains no `audit.record(` call, which
   makes the forward rule below a test rather than a paragraph.

What the gate **cannot** do is stated in its own docblock: it cannot prove a call _executes_ (a
call in an unreachable branch passes gate 2 — the per-action API test against real Postgres is the
execution proof), and it cannot judge whether an `UNAUDITED_ROUTES` reason is a _good_ one. It
makes forgetting impossible; it cannot make dishonesty impossible. That is the honest bar, and it
is the same one ADR-0058 sets for every other gate here.

### The CPM engine is untouched, structurally

1. `computeSchedule` is a pure function over an input graph assembled by `modules/schedule`; the
   engine imports **no Prisma client** — the property ADR-0034's engine-free conformance package is
   built on. A table it cannot query cannot enter its input. There is no code path, not merely no
   policy.
2. No audited event lies on a scheduling write path. None of the eight producer services is in the
   recalc's call graph.
3. The migration performs **no `ALTER TABLE`** on any existing table: it creates one table, two
   enums, three indexes, four constraints and one trigger. No column, default or heap the engine
   reads changes, so every golden and conformance case recalculates **byte-identically** — the
   ADR-0034 parity gate is satisfied trivially, in the sense ADR-0046 and ADR-0051 use the phrase.
4. The trigger is scoped `… ON audit_events`; ADR-0022's batched engine `UPDATE` touches
   `activities` and `dependencies` and nothing else.
5. **The forward rule:** a recalculation is **not an auditable user action.** It is a derivation
   from inputs that were themselves audited, it produces thousands of row changes per press, and
   auditing it would place a write inside the engine's batched path. The auditable act is "Jane
   pressed Recalculate" — one row at the controller seam, if that is ever judged worth having —
   never the 2,000 rows the engine then rewrote. Gate 4 enforces this.

## Alternatives considered

### Enforcing append-only

- **`REVOKE UPDATE, DELETE, TRUNCATE … FROM app`.** _Rejected on measurement._ The `REVOKE`
  **does** deny the table's own owner — `ERROR: permission denied for table t` on both `UPDATE` and
  `DELETE`. The widely-repeated claim that "REVOKE is a no-op against the owner" is **false** and is
  recorded here so it is not repeated. But the owner re-grants it in **one statement** (measured:
  the update then succeeds), and the shipped Compose stack creates its role via `POSTGRES_USER`,
  which the official image makes a **superuser** that bypasses privilege checks entirely. So this
  option is strong in the environment it is developed in and absent in the one it runs in, with
  nothing to signal which you are in — worse than nothing, because it would be believed.
- **A restricted second database role** (`app_rw` holding only `INSERT` + `SELECT`). _Deferred, not
  rejected — this is the strongest control._ It needs two connection strings and a role Prisma
  Migrate does not manage, created by a role that cannot create roles (measured), on a deployment
  target that is not yet chosen. It would be the first thing in the repository a fresh `docker
compose up` does not produce. Recorded as the escalation.
- **A `BEFORE UPDATE OR DELETE OR TRUNCATE` trigger.** _Chosen._ Measured end to end: all three
  raise; `INSERT` is unaffected. It binds the **table**, not the role, so it behaves identically
  whether the connecting role is a superuser or not — precisely the property `REVOKE` lacks.
  `ENABLE ALWAYS` closes the `session_replication_role = replica` bypass (measured: a non-superuser
  cannot set that GUC at all, but the Compose role is a superuser and can). It **does not trip the
  schema-drift check** — measured by running `prisma migrate diff` before and after adding a trigger
  to `public.notes`: the output is byte-identical, because Prisma models no triggers.
  It is **not** "business logic in a trigger": it encodes no domain rule, it is a constraint
  Postgres has no declarative syntax for — the `EXCLUDE`-constraint category, not the
  stored-procedure category.
- **Append-only by convention, documented and unenforced.** _Rejected._ The security standard
  already promises "never mutated or deleted"; a convention would make that document true only by
  assertion, which is the failure ADR-0058 exists to prevent.

### The table shape

- **ADR-0046's typed parent FKs + fail-closed CHECK.** _Rejected._ ~26 nullable FKs, a CHECK with
  ~26 branches, a **migration to the audit table every time a new model is added**, and FKs that
  would block the very erasure the log must survive. An audit log that couples to the shape of
  everything it observes is the one thing it must not be.
- **Per-domain tables** (`auth_audit`, `membership_audit`, …). _Rejected._ "Everything that
  happened in this organisation, newest first" becomes a `UNION ALL` that grows with every rung —
  the shape `recycle-bin.repository.ts` already demonstrates the cost of (TECH_DEBT #57) — and the
  append-only trigger multiplies by N.
- **A normalised `audit_event_changes` child table** instead of JSONB. _Rejected._ Every read
  becomes a join and every write N inserts, for data nothing filters on.
- **No table — ship structured logs to an external sink.** _Rejected for now._ Needs infrastructure
  that does not exist and a deployment target that is undecided, and loses before→after and
  transactional atomicity. Recorded as the tamper-evidence rung.
- **Partition by month from day one.** _Rejected._ Nothing exists to create the next partition
  (ADR-0009 unimplemented, no cron), and because the domain path is fail-closed a missing partition
  would be an **outage of every audited action**, not a degraded log. It remains the documented
  escalation — and, non-obviously, the **only** retention mechanism compatible with the trigger,
  since `DELETE` is refused by design and `DETACH PARTITION` is DDL that fires no row trigger.

### The write seam

- **A NestJS interceptor.** _Rejected._ It **cannot see authentication at all** — Better Auth is
  mounted on raw Express before Nest and terminates the response, so for the _first_ thing #14 names
  the coverage argument is not weaker, it is zero. It also sees HTTP rather than the domain change:
  no before→after without re-reading the row (a second query racing the next writer), no created id
  until serialisation, and it runs **outside** the transaction, making "the change committed and
  the record did not" reachable.
- **Prisma middleware / `$extends`.** _Rejected, and worse here specifically._ It would be the app's
  **first** such seam — verified: `grep '\$extends\|\$use('` over `apps/api/src` returns nothing,
  which also means `docs/DATABASE.md`'s claim that "a Prisma extension enforces this centrally" for
  soft deletes is **itself drift** and is corrected by this work. More decisively, a write-level seam
  sees every write, including ADR-0022's batched recalc `UPDATE` and every cascade sweep — producing
  an audit log whose dominant content is the CPM engine talking to itself — and it cannot see the
  acting principal without an `AsyncLocalStorage` seam the app does not have.

### The read surface

- **Fan-out per membership** and **stamp-when-single-membership**: rejected above.
- **Include auth events of current members in the org read.** _Rejected._ Same cross-tenant
  inference as fan-out, but computed at read time, so it changes retroactively as membership
  changes and would show an Org Admin a member's sign-ins from before they joined and from other
  tenants' sessions.
- **Ship the log write-only and defer all reads.** _Rejected by the product owner._ It would leave
  the largest event family invisible for a milestone, and "a screen that omits half the catalogue
  while looking complete" is the failure the self-scoped second read exists to avoid.

## Consequences

**Positive**

- `docs/SECURITY_STANDARDS.md` stops publishing an aspiration. Permission changes, hierarchy
  deletions and authentication acquire a durable before→after record the database itself refuses to
  edit or delete.
- The `CascadeCounts` a delete already computes stop being written to stdout and discarded; the
  audit row names the existing `delete_batch_id`, so **one row per user action** identifies exactly
  which rows went and which a restore would bring back.
- Forgetting to audit a new mutating endpoint becomes a **CI failure with a named route**, not a
  silent gap discovered in an incident.
- The engine argument is structural and, for the first time, partly **tested** (gate 4) rather than
  asserted.
- Two long-standing documentation drifts are corrected as a side effect: the non-existent Prisma
  soft-delete extension in `docs/DATABASE.md`, and the `auth.emailVerification` docblock's history.

**Negative / accepted costs**

- **The append-only claim is bounded, and saying so is part of shipping it.** A reader who wants
  tamper-proof will not get it here. The mitigation is that the bound is stated in three places
  rather than implied in none.
- **Fail-closed on the domain path means a full disk stops every audited action.** Accepted
  deliberately: a change that cannot be recorded must not happen. It is also the reason the growth
  question is gated rather than assumed away.
- **Fail-open on the auth path can silently lose events under stress.** Accepted for the opposite
  reason, and it is why the asymmetry is documented at both sites with the reason attached.
- **Every route must be classified once**, and every future one classified as it is written. That
  is the price of the coverage guarantee and it is charged up front. (This line said "67 mutating
  routes" before M1 counted them: there are **116**, of which 12 audit — see §M1 below.)
- **One extra parameter on 12 controller handlers** (`@RequestContext()`), because there is no
  ambient request context and inventing one would hide the dependency.
- **A JSONB precedent now exists**, narrowly scoped here. The next proposal to use JSONB must show
  its payload is open-ended, never queried and never computed.
- **A third index** (`idx_audit_events_actor_occurred`) is required by the self-read and was **not**
  in the measured set. It is flagged as unmeasured and must be measured before it lands.

**Follow-ups**

- `docs/TECH_DEBT.md`: close #14(a)/(a2); split (b) (rate-limit store — with #49 and ADR-0010) and
  (c) (OAuth token encryption) into their own rows.
- Coverage widening (share links, library writes, interchange, activity/dependency deletes) is
  **gated on the growth measurement**, which is gated on nothing but doing it.
- The tamper-evidence escalation — a restricted second role, then getting a copy off the box — is
  gated on the deployment-target decision (TECH_DEBT #5) and composes with, rather than replaces,
  the trigger.
- Task 1.7's Better Auth spike findings are folded back into this ADR when M1 lands, **including
  anything the hook seam turned out not to supply** — the ADR-0064 discipline of recording what was
  measured and what could not be reproduced.

## M1 as built (2026-08-03)

The ADR asked for Task 1.7's Better Auth spike to be folded back in "**including anything the hook
seam turned out not to supply**". It did not supply two of the four events, and that is the
milestone's largest finding.

### The authentication seam is three seams, not one

The drafted design — one `hooks.after` switching on `ctx.path` — was written first, then read
against `better-auth@1.6.25`'s actual endpoints. Two events are invisible to it:

- **`/sign-out`** (`api/routes/sign-out.mjs`) reads the session **cookie** directly and never
  resolves a session onto the context. An after-hook has no idea who signed out. It is recorded
  from a **`before` hook** that resolves the session while the cookie is still valid; the row
  therefore means "a sign-out was requested by X" rather than "…completed", which is not a
  distinction a reader could act on since the endpoint swallows its own delete error and always
  returns success.
- **`/verify-email`** returns `{ status: true, user: null }` — the user is deliberately withheld —
  and, when a `callbackURL` is present (which is how the emailed link works), succeeds by
  **throwing a redirect**. An after-hook would see no user and an error on the success path. It is
  recorded from **`emailVerification.afterEmailVerification(user)`**, which fires only on success
  and receives the user.

Both would have been the ADR-0064 failure exactly: a producer that runs, looks right, and silently
records nothing.

What the hook seam **does** supply, and the ADR was right to rely on: `dispatchAuthEndpoint` catches
a thrown `APIError`, assigns it to `context.returned`, and **still runs the after-hooks**. A failed
sign-in is therefore observable — which matters more than the successes, because the row nobody can
produce is the one showing somebody trying.

### The route census is 116, not 67

Counted by walking `AppModule`'s module graph and reading Nest's own `path`/`method` metadata
(`audit-coverage.structural.spec.ts`), not by hand. 12 routes audit; 104 are declared unaudited
against one of nine **named** reasons. Two of those reasons are admissions rather than
justifications and are separated from ordinary reads so they stay visible: **reading the audit log
is itself worth recording**, and **minting a share link IS a permission change** — both M2
candidates.

### Append-only + `ON DELETE RESTRICT` has a test-harness consequence

The two rules compose into something neither states alone: a spec that clears organisations fails
on the FK, and **cannot fix that by deleting the audit rows first**, because the trigger refuses
that too. 392 pre-existing e2e assertions failed on the first real run. `apps/api/test/audit-reset.ts`
resolves it by momentarily disabling the trigger — and is therefore the **proof that this ADR's
honesty note is accurate rather than aspirational**: a trigger stops accident and stops application
code, but not the table's owner. Nothing in `src/` may import it.

### The web surface, and what reading its own diff found

Two screens behind `VITE_AUDIT_LOG` (default off): the organisation log at
`/orgs/$orgSlug/audit-log`, and the caller's own history at `/me/activity`. **One** list component
serves both — the organisation feed and a person's own history differ in what they are scoped to and
in nothing else, and two tables would eventually disagree about how a role change or a failed
sign-in reads, a divergence only somebody who opened both would ever see.

Reading the epic's own diff against the ux / accessibility / component checklists found four defects
that had passed a human read, all four the shapes this repository already has names for:

- The refusal — "Only an Org Admin can read this organisation's audit log" — rendered **while the
  organisations query was still in flight**, because `useOrgRole` answers `undefined` until it
  resolves and `canReadAuditLog` turns that into "no". An Org Admin was told they were not one, for
  as long as the request took. The ADR-0060 invented-message finding, one screen along.
- "Load more" **unmounted itself on the final press**, destroying the element the reader was
  standing on and dropping focus to `<body>` (WCAG 2.4.3) — triggered by the user's own click. It
  now shades with `aria-disabled` and the label "All events shown".
- `Intl.DateTimeFormat` was constructed per cell, in a table of 50 rows a page that grows without
  bound.
- **`/me/activity` had no route to it but a typed URL** — and the audit log's own refusal told the
  reader their activity was "on My activity", naming a place the product did not take them. It is
  now an account-menu item, which is the right home precisely because the screen is **not**
  org-scoped: it spans every organisation the reader belongs to and carries the org-less
  authentication rows too.

`apps/web/e2e-audit/` (its own CI step) drives the whole thing against a real API and database,
because a mocked fetch cannot be wrong about a row it invented. It proves the producers fire inside
the transactions that succeeded, that a role change's `before` is the membership's real prior value
(the detail reads "Planner → Contributor" only if the service read the row under its lock), that
`audit:read` is refused with a **403** in the non-admin's own session rather than by the hidden nav
link, and that `/me` is scoped by **actor** — the teammate is the _subject_ of the role change and
must not see it.

## M3: share links, and the storage measured (2026-08-03)

**`share.created` / `share.revoked` land**, taking the coverage census to 14 audited routes and the
vocabulary to 20 actions. They were the highest-value remaining events by some distance: minting a
guest link grants a read of plan data to somebody with **no account at all**, revocation is the only
way that grant ever ends, and the grantee is the one subject in the system who can never be asked
what they saw. The `SHARE_GRANT` reason is retired from `UNAUDITED_ROUTES` and both routes join the
census's **positive** assertion — the one that fails if a future refactor moves a permission change
back out with a plausible-sounding excuse.

The payload is `{ planId, label, expiresAt }`. **Neither token form is in it**, and two independent
controls hold that: the allow-list does not name them, and `NEVER_RECORD`'s substring ban catches
`token` and `hash` separately. A unit test asserts the outcome (verified to fail only when _both_
controls are broken) and the e2e reads the assertion off the **stored rows** rather than the
response, because the producer and the redactor are different code and only the table proves both.
`expiresAt: null` is recorded rather than omitted — a link that never dies is the fact a reader most
needs, and silence reads as "unknown".

### Storage measured (2026-08-03) — closing TECH_DEBT #90, answering the growth question

The ADR said `idx_audit_events_actor_occurred` "must be measured before it lands". It landed
unmeasured (recorded honestly as debt); this is the measurement. Postgres 17, 1,000,005 seeded rows,
`EXPLAIN (ANALYZE, BUFFERS)`:

| What                                                 | Result                                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| Table at 1M rows                                     | **565 MB** total — 371 MB heap, 193 MB indexes (**~592 B/row**)                   |
| Organisation read, first page                        | **0.24 ms**, Index Scan `idx_audit_events_org_occurred`, 53 buffers               |
| `/me` read, first page                               | **0.19 ms**, Index Scan `idx_audit_events_actor_occurred`                         |
| `/me` read, deep keyset page                         | **0.18 ms**, same index — **both** keyset columns in the Index Cond, not a filter |
| One `INSERT` (3 indexes, on the hot membership path) | **1.19 ms**, of which 0.70 ms is the `organization_id` FK trigger                 |
| Index sizes at 1M rows                               | pkey 38 MB · actor 75 MB · org 80 MB                                              |

So: the self-read index **is** used and earns its 75 MB — without it the `/me` page is a sequential
scan of the whole table, and the keyset predicate is served by the index rather than re-checked per
row, which is the property that keeps page 200 as cheap as page 1.

**On partitioning (plan Task 4.2): not warranted, and the number that would change that is the
operator's.** At ~592 B/row the table costs about **0.6 GB per million events**, and both reads are
sub-millisecond there — three orders of magnitude inside any request budget. The M1+M3 vocabulary
records permission changes and deletes, not mutations, so a busy tenant produces thousands of rows a
year, not millions. Partitioning would therefore buy nothing today and would cost a **table rewrite**
(the partition key must join the primary key) plus a partition-creating mechanism that does not exist
— and a missing partition makes every `INSERT` fail, which on the fail-closed domain path is an
**outage of every audited action**, not a degraded log.

The one input this cannot supply is the live row count. The operator can get it with
`SELECT count(*), pg_size_pretty(pg_total_relation_size('audit_events')) FROM audit_events;` — revisit
when that count approaches **10 million**, which is where the index working set stops fitting
comfortably in a small host's page cache. Retention, when it comes, is `DETACH PARTITION` and
**never** `DELETE`: the trigger refuses `DELETE` by design, which makes partitioning the mechanism
rather than an optimisation.

### Still outstanding

- **A failed sign-in is recorded and readable by nobody.** It carries neither an organisation nor an
  actor, and both reads filter on exactly those columns — so the most useful thing an audit log has
  to say is, today, reachable only from `psql`. Neither read is wrong; the gap is coverage, and
  closing it is a security decision about scope rather than a filter to widen
  (`docs/TECH_DEBT.md` #91).
- **Mutation events (plan Task 4.3) stay out.** They are two to three orders of magnitude above what
  the log records today, and the measurement above says the question is volume rather than
  performance: 0.6 GB per million rows is affordable, but "every activity edit" changes the arrival
  rate by a factor nobody has estimated. That estimate, not the index plan, is what gates the rung.

  **First contact with a real reader moved this (2026-08-04).** Within hours of the release the
  product owner created and deleted activities, looked at the audit log, found nothing, and asked
  why — then said sign-ins were missing too. Neither observation was a fault: activity writes are
  `content-edit-deferred-to-m3`, and an `auth.*` row carries no `organizationId` so the
  organisation read can never return one. **Both were the screen's fault.** Its subtitle promised
  "permission changes, deletions and sign-ins for this organisation", and one of those three is
  structurally impossible there; its empty state said "No events recorded yet", which asserts
  nothing happened when the truth is that this log does not record that kind of thing. That is
  precisely the failure this ADR names — absence a reader cannot distinguish from silence — built
  correctly for the **permission** case and not at all for the **coverage** case, in the same file,
  by the same author, on the same day. Fixed by naming the boundary on both screens.

  It is also the first real evidence on 4.3's open question. The rung was gated on "would activity
  events drown the permission changes"; the first person to open the log went looking for exactly
  those events. That is one data point, not a decision, but it belongs on the record next to the
  volume argument rather than in a chat log.

- **The `action` filter and its composite index (Task 4.4) are not built**, so the index it would
  need is not added. Adding an index for a filter that does not exist is the instinct that row
  deliberately warns against.

**`VITE_AUDIT_LOG` flipped default-on 2026-08-03**, on the product owner's decision, once the gate
pass and the journey were green. The flag-off parity suites are **kept, not weakened** — that is the
rollback contract (the ADR-0053 M6 rule), and flag-off is byte-for-byte the prior product because
there is no write path here to leave behind.

## References

- Spec: [`docs/specs/audit-log/feature-spec.md`](../specs/audit-log/feature-spec.md) ·
  [`implementation-plan.md`](../specs/audit-log/implementation-plan.md)
- `docs/TECH_DEBT.md` #14 (this debt), #5 (deployment target), #49 (throttler store),
  #54 (schema-drift rule), #57 (`UNION ALL` recycle-bin cost)
- `docs/SECURITY_STANDARDS.md` — the standard this makes true, and where the honest limit lives
- ADR-0003 (Better Auth), ADR-0012 (RBAC + resource scoping), ADR-0016 (tenancy/roles),
  ADR-0018 (self-migrating image — the single-role constraint), ADR-0022 (engine-owned batched
  writes), ADR-0025 (the non-FK snapshot precedent), ADR-0034 (recalc parity gate),
  ADR-0046 (the polymorphic shape this declines), ADR-0051 (`GuestPrincipal`, identity-as-scope),
  ADR-0053 (measure before you index), ADR-0057 (`modules/clients` as the canonical shape),
  ADR-0058 (verify the claim), ADR-0063/0064/0067 (the enablement-milestone discipline)
