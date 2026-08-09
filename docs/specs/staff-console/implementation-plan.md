# Implementation Plan: SchedulePoint staff console

- **Feature spec:** [`./feature-spec.md`](./feature-spec.md) — **approved 2026-08-09**
- **Status:** **Approved 2026-08-09** — in implementation. All four critical questions are answered
  (spec §1 "Critical questions"); **CQ-1 was overruled** and the consequences are folded into M1-T1,
  M3 and M5 below rather than left in the spec.
- **Owner:** _(to be assigned on approval)_
- **ADR:** **ADR-0086** must be written and Accepted before M2 merges (see M2-T5). Next free number
  verified: `docs/adr/` ends at `0085-privacy-operations.md`; `docs/adr/README.md:111` is the last row.

> **Read the spec's §0 first.** Every file-and-line citation in this plan was re-verified against the
> code, not inherited from the brief (ADR-0076). Where a claim here is an estimate rather than an
> observation, it says so.

## Breakdown

```mermaid
flowchart LR
  E["Epic: staff console<br/>(operate the installation, audited)"]
  E --> M1["M1 · Mail alerting<br/>+ heartbeat"]
  M1 --> M2["M2 · Staff identity<br/>(ships dark)"]
  M2 --> M3["M3 · Console shell<br/>+ Health"]
  M3 --> M4["M4 · CSP sink<br/>+ Security panel"]
  M4 --> M5["M5 · Installation<br/>+ Accounts + Staff activity"]
  M5 --> M6["M6 · Enablement:<br/>gates, docs, cron retirement"]
```

### Epic

**The staff console** — move the operations that today happen over `psql` on the host into the
application, where they are audited, and close the mail-failure signal that reaches nobody
(`docs/TECH_DEBT.md` #100, open on the operator half). Maps to a new **operations & supportability**
roadmap theme; `docs/ROADMAP.md` has none today and gains one in M6.

**Sequencing principle.** M1 delivers the product owner's stated motivation and needs **no staff
principal at all** — so the highest-value slice is also the one with the smallest blast radius, and it
ships first. Everything after it is additive to a surface that does not exist until M2.

---

## Milestone M1 — Mail alerting and the heartbeat (shippable slice)

**Outcome:** a broken mail relay produces an alert in a channel the product owner watches, within one
coalescing window, instead of silence. An external watcher can detect that the API has stopped.

**Entry point:** **operator-facing, not user-facing.** The control is an environment variable —
setting `MAIL_ALERT_URL` in `docker-compose.release.yml` and recreating the container. There is no
screen and no in-app control in this milestone, deliberately: it must work before a console exists to
display it, and it is useful on its own. _(ADR-0081 §1: this milestone declares itself as having no
in-product entry point rather than implying one.)_

**Journey:** no Playwright journey — there is no UI. The gate is instead an **API e2e** that stops a
stub SMTP transport, drives a real send through `SmtpMailService`, and asserts one POST arrives at a
stub alert endpoint, plus a documented manual verification against the real host recorded in the PR.
The first Playwright journey lands in M3 with the first user-facing surface (ADR-0081 §2).

**Subsumes:** `docs/specs/operational-self-service/` Milestone B in full (a settled input).

---

#### Feature: alerting on the existing failure path

> **Description:** turn `event: 'mail.send_failed'` from a log line nobody reads into a message
> somebody receives, and persist enough of it to show a history later.
> **Complexity:** M
> **Dependencies:** none — `SmtpMailService` already emits at four sites (`smtp-mail.service.ts:153`,
> `:199`, `:230`, `:259`).
> **Risks:** an alert that blocks or fails a request → never awaited, bounded, swallowed (ADR-0075's
> own rule, applied one layer out). An alert storm → coalescing is in T2, not a later tuning knob.
> **Testing requirements:** unit (coalescing, redaction, absent-config inertness); API e2e (a failing
> send produces exactly one alert; a failing alert does not fail the send).

##### Task M1-T1 — `mail_events` table + migration (≈ one PR)

- **Description:** a new ordinary (updatable, expirable) table recording each failed or abandoned
  send: `kind`, `outcome`, `recipient`, `error_class`, `correlation_id`, `occurred_at`.
- **Complexity:** S
- **Dependencies:** none
- **Risks:** the reflex after ADR-0072 is to reach for the append-only audit shape → the migration
  comment states explicitly that this is telemetry about a machine, meant to be expired, not evidence
  about a person. **CQ-1 makes that comment load-bearing rather than explanatory:** the row now holds
  a customer's full address (the domain-only proposal was overruled), and `audit_events` refuses
  `UPDATE` and `DELETE` in the database — so the audit shape here would write customer addresses into
  a permanently unerasable table, which is the collision ADR-0085 D3 spent a whole decision avoiding
  for one column. · The address must reach the table **only** through the `recipient` column →
  `error_class`, never `error.message`, because a transport error routinely embeds the address it
  failed to reach and a free-text blob is a leak wearing a decision's clothes. · The row inherits
  ADR-0085 D3's **12-month** retention, deliberately the same number rather than a second one.
- **Testing:** `pnpm prisma:check-drift` clean; a repository unit test for the write; a migration
  review by **database-architect** before it is written (CLAUDE.md §20).
- **Development steps:**
  1. Design the table with **database-architect** — including whether `(occurred_at DESC, id DESC)`
     is the right index for the newest-first cursor read (the `audit_events` precedent,
     `schema.prisma:2660-2674`).
  2. Prisma model + migration; index; retention column semantics documented in the model docblock.
  3. `MailEventRepository` with `create` and a cursor-paginated `list`.
  4. Update `docs/DATABASE.md`.

##### Task M1-T2 — `OperationalAlertService`, wired to the existing failure path

- **Description:** on a mail failure, write a `mail_events` row and notify a coalescing alerter that
  POSTs once per window to `MAIL_ALERT_URL`.
- **Complexity:** M
- **Dependencies:** M1-T1
- **Risks:** **Calling `AuditService.record()` outside a transaction fails its caller** — the exact
  defect ADR-0073 C4 found in the interchange producer. This service must never use `record()`; it is
  not an audit producer at all (a mail failure is not an act by a person). Stated here because the
  instinct will be to reach for it. · A `fetch` with no timeout can hold a socket → bounded with
  `AbortSignal.timeout`, the `SEND_TIMEOUT_MS` reasoning (`smtp-mail.service.ts:45-69`). · Logging
  the alert URL could publish a webhook secret → allow-list the log context to `{ status, kind,
count }`, the `smtpEndpoint` rule (`mail-bootstrap.service.ts:14-24`).
- **Testing:** unit — ten failures in one window produce one POST; a rejecting alert URL produces a
  log and no throw; `MAIL_ALERT_URL` absent produces **no** behavioural difference (the rollback
  contract, asserted rather than assumed).
- **Development steps:**
  1. `MAIL_ALERT_URL`, `MAIL_ALERT_WINDOW_MINUTES` (default 10) in `env.validation.ts`, using the
     `optionalString` helper (`env.validation.ts:11-14`) so an empty compose value means absent.
  2. `common/operational/operational-alert.service.ts` — a bounded, unawaited POST; in-memory window
     state; message names count, window and kinds and **never a recipient**.
  3. Hook the four `SmtpMailService` catch blocks. Prefer **one** notification point over four
     duplicated calls — three literals drift one edit at a time, which is the reason
     `MAIL_SEND_FAILED` is a constant (`smtp-mail.service.ts:22-25`).
  4. `.env.example`, both compose files, `docs/DEPLOYMENT.md`.

##### Task M1-T3 — heartbeat (dead-man's-switch)

- **Description:** an optional periodic outbound POST to `HEARTBEAT_URL`, so an external service
  alerts on its **absence**. The one thing an application can honestly do about its own liveness.
- **Complexity:** S
- **Dependencies:** none
- **Risks:** **CQ-4 answered: build it, wire the receiver later.** The spec offered only "build it"
  or "drop it"; the product owner took a third answer, which stays defensible only if the dormancy is
  real — so **absent `HEARTBEAT_URL` must create no timer at all**, asserted by a unit test rather
  than assumed, and `docs/TECH_DEBT.md` #100's operator half **stays open** until an external check
  exists. Merging this task does not close it and M1-T4 must not claim otherwise. · A leaked interval keeps the process alive in tests →
  cleared in `OnApplicationShutdown`. · Multi-replica means N pings; harmless for a dead-man's-switch
  and stated so.
- **Testing:** unit with fake timers (pings at the interval; a failure logs and does not throw; absent
  config starts no timer at all).
- **Development steps:**
  1. `HEARTBEAT_URL`, `HEARTBEAT_INTERVAL_MINUTES` (1–60, default 5) in `env.validation.ts`.
  2. `HeartbeatService implements OnApplicationBootstrap, OnApplicationShutdown` with `setInterval` —
     **no new dependency**: verified `apps/api/package.json:26-49` has no `@nestjs/schedule`, no
     `bullmq`, no `ioredis`. The lifecycle-hook precedent is `MailBootstrapService`
     (`mail-bootstrap.service.ts:53-60`).
  3. **Never part of `/health/ready`** — write the reason in the docblock, because it is the same
     reason `MailBootstrapService` gives (`:42-47`) and it will be re-proposed otherwise.
  4. `docs/DEPLOYMENT.md`: how to point it at a check, and what the check does when pings stop.

##### Task M1-T4 — retire the mail half of `watch-mail-failures.sh`

- **Description:** decide and record what happens to the cron, rather than letting two alerts fire for
  one fault.
- **Complexity:** S
- **Dependencies:** M1-T2 verified working on the host
- **Risks:** retiring it before the new path is proven on the **real** host leaves a window with no
  alerting at all → the script is retired only after a manual verification is recorded in the PR.
- **Testing:** documentation only.
- **Development steps:**
  1. Verify M1-T2 on the deployed host (stop the relay, observe the alert). Record the observation in
     the PR — this is the evidence, not the unit test.
  2. Update `scripts/watch-mail-failures.sh`'s docblock: its mail-failure grep is superseded; its
     `docker logs` failure branch (`:59-65`) is superseded by M1-T3's heartbeat, **which is strictly
     better because the script runs on the same host and cannot report a host outage**.
  3. Recommend deleting the cron line, keeping the script in-tree one release as a fallback.
  4. Update `docs/TECH_DEBT.md` #100 — the operator half closes when the external check exists, not
     when this code merges.

---

## Milestone M2 — The staff identity (ships dark)

**Outcome:** the API can tell whether a caller is staff, and refuses everything to everyone else with
a uniform 404. Nothing in the product looks different.

**Entry point:** **Ships dark.** No web route, no nav entry, no screen. Exactly one HTTP route exists
(`GET /api/v1/staff/me`), reachable by `curl` with a session cookie; the first user-facing surface is
M3. _(ADR-0081 §1: declared rather than implied.)_

**Journey:** none — nothing is reachable from the product. The gate is an **API e2e** proving the
boundary end to end against a real database and real sessions: staff → 200, non-staff → 404,
unverified allowlisted → 404, unset allowlist → 404, and the denial audited. The e2e half is not
optional here (CLAUDE.md §19.7) — `scripts/e2e-local.sh api` must be run before the PR.

---

#### Feature: the fourth principal

> **Description:** `StaffPrincipal`, `StaffContextService`, `StaffGuard`, `@CurrentStaff()` — the
> `GuestPrincipal` shape applied to an installation-scoped identity.
> **Complexity:** L
> **Dependencies:** none
> **Risks:** the whole security posture of the epic is decided here → **security-reviewer is
> mandatory on this milestone**, not deferred to M6.
> **Testing requirements:** unit (allowlist parsing, normalisation, verification requirement, the
> uniform-404 property); structural (no member service reachable); API e2e (the real boundary).

##### Task M2-T1 — `StaffPrincipal` + `StaffRequest` + `@CurrentStaff()`

- **Description:** the type foundation, copied structurally from `guest-principal.ts` and
  `authenticated-request.ts:11-18`.
- **Complexity:** S
- **Dependencies:** none
- **Risks:** adding `memberships` or a `can()` "for convenience later" destroys the compile-error
  property that is the entire design (spec §4.3) → a structural test asserts neither exists, and the
  docblock says why, in the words `guest-principal.ts:1-9` uses.
- **Testing:** unit + a structural spec (`staff-principal.structural.spec.ts`) asserting the absent
  members and that `StaffPrincipal` is **not** assignable to `Principal`.
- **Development steps:**
  1. `common/staff/staff-principal.ts` — `userId`, `email`; nothing else.
  2. Extend `common/auth/authenticated-request.ts` with `StaffRequest { staff?: StaffPrincipal }`.
  3. `common/decorators/current-staff.decorator.ts`, mirroring `current-guest.decorator.ts`.
  4. The structural spec, **verified red first** by temporarily adding a `can()`.

##### Task M2-T2 — `STAFF_EMAILS` + the allowlist

- **Description:** parse, validate and expose the allowlist as a normalised `Set<string>`.
- **Complexity:** S
- **Dependencies:** M2-T1
- **Risks:** **getting normalisation backwards.** Trim the _list entries_ (our own format); never trim
  the _session value_ — `normalize-email.ts:11-16` records that trimming it "would attribute a
  sign-in attempt to a user whose account was never actually reachable by that input". · Writing a
  second `toLowerCase()` beside `normalizeEmail` → the shared function is used, for the reason its own
  docblock gives (`:17-19`): two implementations of one library's rule drift, and the drift is
  invisible. · A typo in the allowlist is a silent lockout → the schema **refuses to boot** on an
  entry with no `@`.
- **Testing:** unit — whitespace, mixed case, empty entries, duplicate entries, a single entry, an
  entry with no `@` (boot refusal), and the explicit assertion that a session value is **not**
  trimmed.
- **Development steps:**
  1. `STAFF_EMAILS` in `env.validation.ts` (comma-separated, each entry trimmed and validated).
  2. `AppConfigService.staffEmails` exposing a pre-normalised `ReadonlySet<string>` built once at
     boot, via `normalizeEmail`.
  3. `.env.example`, both compose files, `docs/DEPLOYMENT.md` §provisioning.

##### Task M2-T3 — `StaffContextService` + `StaffGuard`

- **Description:** resolve session → `users` row → require `emailVerified` → allowlist test →
  `StaffPrincipal`, or a uniform 404.
- **Complexity:** M
- **Dependencies:** M2-T2
- **Risks:** **an oracle.** Any answer that distinguishes "not staff" from "no staff configured" from
  "not signed in" tells a prober something → one `notFound()` helper, the `ShareTokenGuard` shape
  (`share-token.guard.ts:76-79`), and a test that asserts the three cases are byte-identical
  responses. · Trusting `session.user.email` rather than the stored row → the row is read, because
  `emailVerified` is authoritative there and the stored address is already lowercased by Better Auth
  (`normalize-email.ts:11-13`). · Modifying `AuthContextService` → **it is not touched**; a
  structural test pins that the staff path constructs no `Principal`.
- **Testing:** unit for every branch; the uniform-404 assertion; API e2e in M2-T4.
- **Development steps:**
  1. `common/staff/staff-context.service.ts` — session resolution via the existing `AUTH_INSTANCE`
     seam (`auth-context.service.ts:30-32`), then a single `users` lookup.
  2. `common/staff/staff.guard.ts` — `@Public()`-compatible, attaches `request.staff`, uniform 404.
  3. Boot diagnostic (`OnApplicationBootstrap`): log at `info` how many allowlisted addresses resolve
     to accounts, and at **`warn`** how many hold an active organisation membership (spec §4.4 — this
     is observability, **not** enforcement; it must not refuse to boot, pending CQ-2).
  4. Docblocks stating the three rules that will otherwise be "simplified" away: uniform 404, required
     verification, no `Principal` construction.

##### Task M2-T4 — `GET /api/v1/staff/me` + the audited denial + the census

- **Description:** the one route this milestone ships, the `staff.*` audit vocabulary, the
  `AuditActorType.STAFF` label, and the new census assertion.
- **Complexity:** M
- **Dependencies:** M2-T3
- **Risks:** **the enum label needs two migrations** — Postgres forbids using a label in the
  transaction that added it (`schema.prisma:2636-2638`; ADR-0053 M3 paid this). Attempting one
  migration fails at deploy, not at review. · The audited denial is a write triggered by an
  unauthenticated-ish caller → bounded by a controller `@Throttle` (20/60 s, tighter than the global
  100/60 s), the `GUEST_THROTTLE` precedent (`share-guest.controller.ts:30`). The residual worst case
  is named in the spec §2.6 rather than assumed away. · The census does **not** forbid auditing a
  route — verified at `audit-coverage.structural.spec.ts:329-441`, all six assertions are "must
  audit" — so the new assertion is additive and safe.
- **Testing:** API e2e (`test/staff-boundary.e2e-spec.ts`) covering staff 200 / non-staff 404 /
  unverified 404 / unset-allowlist 404 / denial recorded; the census spec fails when a staff route is
  added without auditing (**verified red first**).
- **Development steps:**
  1. Migration 1: add `STAFF` to the `audit_actor_type` enum. Migration 2: nothing else in it uses the
     label yet — so this is one migration now and the label is _used_ from the same release, which is
     exactly the case the two-migration rule exists for. Confirm the split with **database-architect**
     rather than assuming which side of the boundary the usage falls on.
  2. `AUDIT_ACTOR_TYPES` in `packages/types/src/index.ts:2058` gains `'STAFF'`; the nine `staff.*`
     actions join `AUDIT_ACTIONS` (`:1957-2053`) with their category mapping.
  3. `staffAuditActor(staff, context)` beside `auditActor` (`modules/audit/audit-actor.ts:24-33`) —
     `actorType: 'STAFF'`, `organizationId: null`.
  4. `modules/staff/staff.controller.ts` — `@Public()` + `@UseGuards(StaffGuard)` + `@Throttle`, the
     `ShareGuestController` shape (`share-guest.controller.ts:61-68`).
  5. The **seventh positive census assertion**: every route whose path starts with `/api/v1/staff/`
     appears in `AUDITED_ROUTES`. Derived from the path, not listed, so it cannot fall behind.
  6. `docs/API.md`, OpenAPI, `docs/SECURITY_STANDARDS.md`.

##### Task M2-T5 — write ADR-0086

- **Description:** the decision record. Must be Accepted before this milestone merges.
- **Complexity:** M
- **Dependencies:** M2-T1…T4 (the ADR records what was built, and building it will correct the draft)
- **Risks:** citing a decision by number that was never filed → the ADR-0071 failure. File it in
  `docs/adr/` **and** add the row to `docs/adr/README.md` in the same commit; `check:doc-links` and
  `check:claims` must pass.
- **Testing:** `pnpm check:doc-links`, `pnpm check:claims`, `pnpm check:counts` (the ADR count in
  `CLAUDE.md`'s banner is a computed gate — ADR-0076).
- **Development steps:**
  1. `docs/adr/0086-the-staff-console.md` from `docs/adr/_template.md`.
  2. Register any new dependency-internals citation in `scripts/dependency-claims.json` (ADR-0076).
  3. `CLAUDE.md` §16 entry; `docs/adr/README.md` row.

---

## Milestone M3 — The console shell and the Health panel

**Outcome:** staff open a screen and see whether the installation is healthy — mail transport state,
recent failures, database, versions — without a shell.

**Entry point:** **"Staff console"** in the app shell's account menu, rendered only when
`GET /api/v1/staff/me` returns 200 (runtime evidence, never a build-time flag — spec §4.9). It opens
`/staff`, whose default panel is **Health**.

**Journey:** `apps/web/e2e-staff/staff-console.spec.ts` with its own CI step
(`pnpm --filter @repo/web test:e2e:staff`) — **lands here, with the first user-facing milestone, not
at enablement** (ADR-0081 §2). Its first step signs in as an allowlisted, verified account, opens the
account menu, presses **Staff console**, and asserts the Health panel renders; its second signs in as
an ordinary member and asserts no nav entry exists and `/staff` shows the "not available" screen.

---

#### Feature: the console route tree and Health

> **Description:** a flat, canvas-free route tree at `/staff`, plus the first panel.
> **Complexity:** L
> **Dependencies:** M1 (for the data), M2 (for the identity)
> **Risks:** scope creep toward "just show the plan too" → prohibition list, spec §2.5.
> **Testing requirements:** unit (panel states: loading, empty, error, not-configured); a11y
> (keyboard, headings, live regions); the journey above.

##### Task M3-T1 — the `/staff` route tree and the shell entry

- **Description:** a sibling of `_authed` and `/share`, registered **unconditionally**, gated at
  render time on the staff probe.
- **Complexity:** M
- **Dependencies:** M2-T4
- **Risks:** gating registration on a flag would strand the surface — `...(FLAG ? [route] : [])`
  widens the tree type in **both** branches so typecheck cannot catch a link to nothing
  (`router.tsx:384-397`, ADR-0074's precedent). · A staff-only account has **no organisations**, so
  the existing home resolver redirects it to `/onboarding` (`router.tsx:152-164`) and invites it to
  create one — a dedicated staff account would be pushed straight into becoming an Org Admin. **This
  is a real, previously unnoticed consequence of recommending a dedicated account**, and it must be
  handled here: the onboarding screen gains a "go to the staff console" route out when the probe says
  staff. _(Established by reading `router.tsx:152-164` against `auth-context.service.ts:39-59`, which
  returns a `Principal` with an empty `memberships` array rather than refusing — so a memberless
  account is a valid, fully-denied session today.)_
- **Testing:** unit on the router tree; the journey's second case (ordinary member); a test that the
  nav entry is absent when the probe 404s.
- **Development steps:**
  1. `features/staff/` — the probe query, a `useIsStaff()` hook.
  2. `routes/staff.tsx` + a `StaffLayout` with a panel nav. **No Project Explorer, no canvas, no
     org picker.**
  3. Register in `router.tsx` unconditionally; render the account-menu entry on the probe.
  4. The onboarding escape hatch.
  5. The "not available" screen — the same words whether or not staff exists.

##### Task M3-T2 — `GET /api/v1/staff/health` + the Health panel

- **Description:** mail transport state (verified at boot / not configured / last failure), recent
  `mail_events`, database reachability, API and web versions.
- **Complexity:** M
- **Dependencies:** M1-T1, M3-T1
- **Risks:** **polling**. A panel that auto-refreshes turns the audit estimate (spec §2.6) into
  thousands of rows a day in a table that cannot be cleaned (ADR-0085) → refresh is an explicit
  control, asserted by a test that no interval or `refetchInterval` is configured. · "Not configured"
  rendered as a fault → it is a deployment state, the `MailBootstrapService` rule
  (`mail-bootstrap.service.ts:61-64`). · A row of em dashes reads as breakage → withhold the panel
  rather than render empty values (ADR-0061's `ContextStrip` rule).
- **Testing:** unit for all four states; API e2e for the endpoint + its audit row; a11y review.
- **Development steps:**
  1. `StaffService.getHealth` — reuses `VersionService.getVersion()` (`version.service.ts:26-28`) and
     the Terminus Prisma indicator already wired at `health.controller.ts:38`; **no new health
     mechanism**.
  2. DTO, controller route, audit call, census entry.
  3. The panel, using existing `Card`/`Table`/`Badge` primitives — **no one-off styling** (CLAUDE.md §12).
  4. Empty, loading, error and not-configured states.

##### Task M3-T3 — "Send a test message" _(CQ-3 — build only if confirmed)_

- **Description:** one write: send a message to the requesting staff member's **own** verified
  address.
- **Complexity:** S
- **Dependencies:** M3-T2, CQ-3 answered
- **Risks:** an arbitrary recipient parameter would make this an open relay → **the recipient is not a
  parameter**; it is `staff.email` from the principal. · Surfacing a send failure to a caller is what
  ADR-0075 forbids → the argument does not apply here (authenticated, allowlisted, fixed recipient,
  no enumeration surface), and that reasoning goes in the handler's docblock so it is not
  "corrected" later. · A `disabled` submit that flips twice per save blurs focus to `<body>` →
  `aria-disabled` + guard, the ADR-0060/0063 finding, and ADR-0083's field rule.
- **Testing:** unit (recipient is always self); API e2e (audited; throttled); journey step.
- **Development steps:**
  1. `POST /api/v1/staff/test-mail`; tight `@Throttle`; `staff.test_mail_sent` audit row.
  2. A `test` kind on `MailService`, or reuse verification copy — decide with the smallest change.
  3. The button, its confirmation and its failure state.

---

## Milestone M4 — CSP report sink and the Security panel

**Outcome:** browsers report CSP violations to the API, they are deduplicated and retained, and staff
read them on a screen — so a policy change is made from evidence rather than from one walkthrough.

**Entry point:** the **Security** panel in the staff console (`/staff` → Security).

**Journey:** extends `apps/web/e2e-staff/` with a step that POSTs a synthetic report to the public
endpoint and asserts it appears in the panel.

**Subsumes:** `docs/specs/operational-self-service/` Milestone A, with its A4 ("a documented `psql`
query, or a small CLI … **not** an in-app screen") **overturned** — that milestone's constraint was
"there is no principal for a system-wide read", and M2 created one.

---

#### Feature: the report pipeline

> **Complexity:** L
> **Dependencies:** M2 (for the reader), M3 (for the shell)
> **Risks:** a public unauthenticated POST is an abuse surface → throttle, cap, dedup, retention, and
> reports are **never** rendered as HTML.
> **Testing requirements:** unit (both body shapes; dedup upsert increments rather than inserts;
> truncation is deterministic); API e2e (204 on garbage; throttle trips); the `e2e-csp` suite must
> still pass.

##### Task M4-T1 — `csp_reports` table + migration

- **Complexity:** M · **Dependencies:** none
- **Risks:** a unique index over three free-text columns where `blocked_uri` can be long → **measure
  real lengths before choosing** between truncation and a hash index (carried forward from
  `operational-self-service` A1, which raised it and did not resolve it).
- **Testing:** dedup upsert; truncation; drift check.
- **Steps:** design with **database-architect**; model + migration + index; repository; `docs/DATABASE.md`.

##### Task M4-T2 — `POST /api/v1/csp-report`

- **Complexity:** M · **Dependencies:** M4-T1
- **Risks:** **the two report body shapes are assumed, not verified.** The legacy `report-uri` body
  (`application/csp-report`) and the newer `report-to` batch (`application/reports+json`) differ by
  engine. Establish which each engine actually sends **by observation** before claiming coverage —
  this was flagged as unverified in the source spec and is still unverified here. · A 400 tells a
  prober their probe was interesting → **always 204**.
- **Testing:** both shapes; oversized; malformed; throttle.
- **Steps:** `@Public()` + `@Throttle` (the `share-guest.controller.ts:66` precedent); body cap;
  defensive parse; upsert; always 204; census entry (`REASONS` — it is unauthenticated telemetry, not
  a staff act, so it is **unaudited** with a named reason).

##### Task M4-T3 — the policy carries the directives

- **Complexity:** S · **Dependencies:** M4-T2
- **Risks:** **`apps/web/e2e-csp/` parses the policy out of `docker-compose.yml` rather than restating
  it** (ADR-0074) — which is what makes that suite valuable and also what makes it sensitive to this
  change. It must be checked, not assumed. · A wrong directive fails **closed and silently** in
  enforce mode, before first paint (ADR-0074's reason for moving the theme-boot script to a file).
- **Testing:** run `scripts/e2e-local.sh web:csp` locally — the gate, not CI.
- **Steps:** add `report-uri`, `report-to` and the `Reporting-Endpoints` header to `CSP_POLICY` in
  `docker-compose.yml:108` and `docker-compose.release.yml:145`; check `e2e-csp`; document the
  report-only → enforce sequence in `docs/DEPLOYMENT.md`.

##### Task M4-T4 — the Security panel + retention sweep

- **Complexity:** M · **Dependencies:** M4-T1, M3-T1
- **Risks:** rendering untrusted URLs → text only, never a link, never HTML. · Unbounded growth → a
  retention sweep on the existing lifecycle hook (default 30 days, spec §4.10).
- **Testing:** unit (empty state — the **common** case, designed first); the journey step; a11y.
- **Steps:** `GET /api/v1/staff/csp-reports` (cursor, audited, census entry); the panel; the sweep;
  close `docs/TECH_DEBT.md` #8/#16 if the CSP flip has by then happened.

---

## Milestone M5 — Installation, Accounts and Staff activity

**Outcome:** staff can answer "what is deployed?", "who cannot sign in?" and "what did staff do?"
without a shell.

**Entry point:** the **Installation**, **Accounts** and **Staff activity** panels in `/staff`.

**Journey:** extends `apps/web/e2e-staff/` with a step per panel.

---

##### Task M5-T1 — `GET /api/v1/staff/installation`

- **Complexity:** M · **Dependencies:** M2-T4, M3-T1
- **Risks:** **leaking a credential.** `MAIL_SMTP_URL` is `smtps://user:PASSWORD@host:port`. The
  response must be built from an **allow-list of scalars**, never by omission from the config object —
  the `smtpEndpoint` rule verbatim (`mail-bootstrap.service.ts:14-24`), which returns "a new object
  with two scalars … so a future field cannot arrive by accident". A test asserts the response
  contains no substring of any configured secret.
- **Testing:** unit (the allow-list; the secret-absence assertion); API e2e (audited).
- **Steps:** API version from `VersionService`; web version from the client's own `APP_VERSION`
  (`apps/web/src/config/env.ts:26`, a compile-time constant — so the **client** reports it, not the
  API, which cannot know it); effective flag state; allow-listed config; panel.

##### Task M5-T2 — `GET /api/v1/staff/accounts` (counts, and the unverified list)

- **Complexity:** M (was S — **CQ-1 grew this task**) · **Dependencies:** M2-T4
- **Risks:** **CQ-1 answered: addresses are permitted.** The proposal was counts per organisation
  with no addresses and it was overruled, so this route returns a **cursor-paginated list of
  unverified accounts by address** as well as the counts. Three consequences follow and none is
  optional: the read is **audited like every other staff route** (§2.6), and the audit row records
  **that the panel was read**, never the addresses on it — writing them into `audit_events` would put
  customer PII in the one table that refuses `DELETE`, re-creating through the back door exactly what
  M1-T1's ordinary-table choice avoids. The list is **paginated, never unbounded**, because "every
  unverified address in the installation" is a bulk export of customer PII if it arrives in one
  response. And it is scoped to `email_verified = false` **in the repository**, not by a query
  parameter — the M5-T3 rule, for the same reason. · An unindexed count and an unindexed keyset scan
  over `users` → measure at the installation's real size before adding an index (the ADR-0053 M4 /
  ADR-0073 C1 pattern: measure, then decide).
- **Testing:** unit; API e2e (including: the audit row carries no address); a measured `EXPLAIN`
  recorded in the PR.
- **Steps:** the count query; the keyset list query; DTOs; panel; audit row + census entry.

##### Task M5-T3 — `GET /api/v1/staff/audit-events` (staff actions only)

- **Complexity:** M · **Dependencies:** M2-T4
- **Risks:** **this is the route most likely to become a customer-data leak by accident.** It must be
  filtered to `actor_type = 'STAFF'` **in the repository**, not by a query parameter, and pinned by a
  test asserting a member's row is never returned — prohibition #2 (spec §2.5). · Reusing the existing
  `AuditReadService` could inherit an org filter that silently returns nothing, or the wrong thing →
  read `modules/audit/audit-read.service.ts` before deciding to reuse rather than assuming either way.
- **Testing:** unit (the filter); API e2e (a member's row is absent even when it is the newest row).
- **Steps:** repository read; DTO; panel reusing the existing audit table components where they fit;
  audit row + census entry.

---

## Milestone M6 — Enablement: gates, docs, and the cron

**Outcome:** the epic is reviewed as a whole, the documents that described a world without a system
administrator are corrected, and the operator half of `docs/TECH_DEBT.md` #100 closes.

**Entry point:** no new capability. **This milestone ships no feature** — it is the gate pass, and on
this repository's record it is where the defects are found: ADR-0060 M6, ADR-0062 M6, ADR-0063 M6,
ADR-0064 §7 and ADR-0067 M4 each found between four and ten blocking defects in code that had already
passed a human read, and in four of them the defect was **one correct pattern applied to a control
and not its neighbour**.

**Journey:** the full `apps/web/e2e-staff/` suite, run locally via `scripts/e2e-local.sh web:staff`
before the PR — not left to CI (CLAUDE.md §19.7).

##### Task M6-T1 — specialist review pass over the combined diff

- **Complexity:** L · **Dependencies:** M1–M5
- **Agents (all six):** `security-reviewer` (**the critical one** — a new principal and a new trust
  boundary), `api-reviewer`, `backend-performance-reviewer`, `component-reviewer`,
  `accessibility-reviewer`, `ux-reviewer`.
- **Risks:** treating this as a formality → every blocking finding is folded **with a regression test
  verified to fail against the old code first**, the standing rule on this repository.
- **Testing:** the full pre-push gate plus both e2e halves.

##### Task M6-T2 — supersede `docs/specs/operational-self-service/`

- **Complexity:** S · **Dependencies:** M1, M4
- **Risks:** deleting it → its §3 analysis is the reasoning this epic overturned, and ADR-0086 cites
  it. Supersede, never delete (CLAUDE.md §6). · Losing its surviving milestone → a `docs/BACKLOG.md`
  row is added in the same PR.
- **Steps:** a **Superseded** banner on both files naming this spec and stating precisely that
  Milestone C (unverified members, `ORG_ADMIN`, own organisation) survives independently and is not in
  this epic; the backlog row; a note that its §3.1 conclusion (the verification backfill stays a
  script) still stands, for a different reason.

##### Task M6-T3 — documentation reconciliation

- **Complexity:** M · **Dependencies:** M1–M5
- **Steps:** `CLAUDE.md` §16 (ADR-0086) and §17 (the "no system administrator" assumption is now
  wrong and must not be left to rot — that is the exact class ADR-0058 exists for);
  `docs/SECURITY_STANDARDS.md` (a fourth principal kind); `docs/API.md`; `docs/DATABASE.md`;
  `docs/DEPLOYMENT.md` (provisioning, alerting, heartbeat, the retired cron);
  `docs/TESTING.md` + `.github/workflows` (the new journey and its CI step); `docs/ROADMAP.md` (the
  new theme); `docs/TECH_DEBT.md` #8/#16/#100; `.env.example`. Run `pnpm check:counts`,
  `check:doc-links`, `check:claims`, `check:flags`.

##### Task M6-T4 — a changeset and the version impact

- **Complexity:** S
- **Steps:** a `minor` changeset for both `@repo/api` and `@repo/web` (pre-1.0; user-visible new
  surface). No breaking change: no existing contract, permission or route is altered.

---

## Sequencing & slices

| Slice  | Ships                                    | Independently valuable?                                                           | Reversible by          |
| ------ | ---------------------------------------- | --------------------------------------------------------------------------------- | ---------------------- |
| **M1** | Mail alerting + heartbeat                | **Yes — this is the product owner's stated motivation, and it needs no console.** | unset `MAIL_ALERT_URL` |
| **M2** | The staff identity (dark)                | No user value; it is the foundation and the security boundary                     | unset `STAFF_EMAILS`   |
| **M3** | Console shell + Health                   | Yes — replaces the commonest shell errand                                         | unset `STAFF_EMAILS`   |
| **M4** | CSP sink + Security panel                | Yes — changes how a policy decision is made                                       | revert `CSP_POLICY`    |
| **M5** | Installation + Accounts + Staff activity | Yes — three more shell errands                                                    | unset `STAFF_EMAILS`   |
| **M6** | Gates, docs, cron retirement             | Yes — closes #100's operator half                                                 | n/a                    |

**Feature flags: none** (spec §4.9). `STAFF_EMAILS` is a better gate than a `VITE_` flag — it is
default-off, it is a runtime **server** value (and staff-ness is a server fact, which a client
build-time constant structurally cannot gate — ADR-0060 M0 / ADR-0074), and unsetting it disables the
entire surface everywhere at once. **No entry is added to `scripts/flag-retirement.json` and no
`@enabled` date is needed** (ADR-0084). If a `VITE_` flag is added later against this advice, it will
need both.

**`main` stays releasable at every point:** M1 changes no existing behaviour when unconfigured; M2
adds routes nobody can reach; M3–M5 add panels behind an unset variable; M6 is documentation and
fixes.

## Definition of Done (per task)

Each task's PR satisfies the Feature Completion Criteria in [`docs/PROCESS.md`](../../PROCESS.md).
Three of them are called out because this epic makes them sharper:

- **The pre-push gate is run, not written.** `pnpm lint && pnpm typecheck && pnpm test`, **plus
  `scripts/e2e-local.sh api`** for M1–M5 (every one touches `apps/api`), **plus
  `scripts/e2e-local.sh web:staff`** from M3 onward. A local database is available.
- **Security review is not deferred to M6 for M2.** M2 is the trust boundary.
- **Every decision-bearing claim in the PR names its evidence** (CLAUDE.md §19.9) — the command, the
  file and line, or the test. Not a pointer to this plan.

## Risks & assumptions (rollup)

| Risk / assumption                                                                                    | Likelihood | Impact   | Mitigation                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | ---------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A new principal type is a new trust boundary.** Get it wrong and it is a cross-tenant read.        | low        | **high** | The compile-error property (spec §4.3), a structural seam test, `security-reviewer` on M2 rather than M6, and an API e2e that proves the boundary against a real DB.                                                                                                                            |
| The env-var allowlist has **no in-application revocation** — removal needs a container recreate.     | **high**   | medium   | Accepted (a settled input) and stated in the spec §2.8. Mitigated by the console being read-only plus one self-addressed write.                                                                                                                                                                 |
| **No MFA / no step-up auth on the staff surface.** A stolen staff session yields installation reads. | low        | medium   | Named, not solved. First follow-up in spec §4.10. Bounded today by what the console can do (§2.5).                                                                                                                                                                                              |
| **No per-staff capability differentiation** — every allowlisted address gets everything.             | **high**   | low      | Acceptable at 1–3 staff. It becomes an ADR the day a support person needs Health but not Accounts.                                                                                                                                                                                              |
| **The heartbeat is a signal nobody receives** if nothing external watches it.                        | medium     | medium   | **Accepted, knowingly.** CQ-4 was answered "build it, wire it later", so this risk is live rather than mitigated. It is bounded by making dormancy structural (absent config ⇒ no timer, unit-tested) and by keeping `docs/TECH_DEBT.md` #100's operator half **open** until a receiver exists. |
| **The liveness half of the motivation is not delivered by this epic at all.**                        | certain    | medium   | Stated plainly in spec §1 with a table of what is and is not covered, rather than being implied away.                                                                                                                                                                                           |
| Auditing staff **reads** could make `audit_events` grow unexpectedly.                                | low        | medium   | Estimated (1–3 staff × tens of requests/day) and **marked as an estimate**; the falsifier is named — a polling screen — and polling is forbidden by M3-T2's test.                                                                                                                               |
| `audit_events` **cannot be cleaned** if that estimate is wrong (ADR-0085).                           | low        | **high** | Which is why the estimate and its falsifier are both written down before the first producer ships — the ADR-0073 C3.0 pattern.                                                                                                                                                                  |
| **The CSP report body shapes are assumed, not observed.**                                            | medium     | low      | Explicitly carried forward as unverified; M4-T2 establishes it by observation before claiming coverage.                                                                                                                                                                                         |
| **`apps/web/e2e-csp/` breaks on the new directives.**                                                | medium     | low      | M4-T3 owns it; that suite parses the real policy, which is what makes it valuable and what makes it sensitive.                                                                                                                                                                                  |
| A dedicated staff account is pushed into `/onboarding` and invited to create an organisation.        | **high**   | medium   | Found by reading `router.tsx:152-164` against `auth-context.service.ts:39-59`; handled in M3-T1 rather than discovered after the recommendation ships.                                                                                                                                          |
| **The enum label needs two migrations** and a single one fails at deploy, not at review.             | medium     | medium   | Called out in M2-T4 with the precedent (ADR-0053 M3) and confirmed with **database-architect**.                                                                                                                                                                                                 |
| Scope creep toward customer data ("just show the plan").                                             | medium     | **high** | The prohibition list is a spec section (§2.5), not a preamble, and eleven of its twelve rows are structural.                                                                                                                                                                                    |
| **The product owner asked for the canvas; declining it may read as scope reduction.**                | medium     | low      | It is the largest simplification in the design and the reason the boundary is a compile error. Stated in spec §4.10 as a decision with its reasoning.                                                                                                                                           |
| This plan's own citations go stale.                                                                  | medium     | low      | Every one was re-verified for this draft (spec §0). ADR-0080 found two of its own plan's citations stale on a spot-check of five — so re-verify before relying.                                                                                                                                 |

## What this plan does not claim

- It does not claim the console makes the installation _more_ controllable than a shell. It makes a
  narrow, defined subset of shell work **observable**, and leaves the rest on the shell — which is the
  right trade only because "who did that?" currently has no answer at all.
- It does not claim to deliver liveness alerting. It delivers the half an application can honestly
  do — stopping saying it is alive — and names the external component that must exist for that to be
  useful.
- It does not claim the four settled inputs are optimal. The env-var allowlist in particular is a
  deliberate trade of revocability and granularity for the property that changing it needs host
  access. Its weaknesses are in the spec, not hidden in this plan.
