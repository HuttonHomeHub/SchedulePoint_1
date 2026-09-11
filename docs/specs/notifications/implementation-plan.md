# Implementation Plan: Notifications

- **Feature spec:** [`./feature-spec.md`](./feature-spec.md) — **Draft, awaiting approval.**
- **Status:** Draft
- **Owner:** _(to be assigned on approval)_

> **Nothing in this plan is built until the spec is approved and CQ-1, CQ-2 and CQ-3 are answered.**
> CQ-2's answer decides whether M1 carries a second model; CQ-3's decides whether M4–M5 exist at all.

## Breakdown

```mermaid
flowchart LR
  E[Epic: Notifications] --> M0[M0 · measure + decide]
  M0 --> M1[M1 · the record · DARK]
  M1 --> M2[M2 · the inbox · FIRST USER-FACING]
  M2 --> M3[M3 · the unread signal]
  M3 --> M4[M4 · preferences]
  M4 --> M5[M5 · the digest]
  M5 --> M6[M6 · gate pass]
```

### Epic

**Notifications** — give SchedulePoint a durable, per-person record of the events that change work
its owner is not watching, and make every channel a pointer to that record rather than a separate
unverifiable claim. Closes `docs/BACKLOG.md:150-166`. Roadmap theme: to be added on approval
(there is no notifications entry today).

---

## Milestone 0 — Measure, and settle the two numbers the design turns on

**Outcome:** three falsification conditions committed **before** their runs, and two of them answered.
**Ships dark:** nothing is reachable — this milestone writes measurement harnesses and one ADR, and
changes no product code. The surface arrives at M2.
**Journey:** none (nothing user-facing). ADR-0081's second rule attaches to M2.

> **Why a measurement milestone exists at all.** Eight consecutive epics in this repository
> (ADR-0090/0091/0092/0110/0112/0113/0114/0115) had a width or cost expectation contradicted by their
> own measurement, and ADR-0099 M0 is the one that was caught **before** building. Two numbers here
> can change the design rather than tune it: the fan-out cost (SC-3) and the unread-count read
> (§3). The conditions are committed in their own commit first, per ADR-0128's rule that an
> instrument which cannot refuse a verdict is not an instrument.

#### Feature: measured design inputs

> **Description:** harnesses + the ADR, before any schema.
> **Complexity:** M
> **Dependencies:** spec approved; CQ-1/2/3 answered.
> **Risks:** a measurement taken on the wrong artefact reads as a result (ADR-0121's harness measured the
> wrong zoom; ADR-0119's probe styled the wrong node) → each harness prints the node/row it touched,
> and each has a non-vacuity control that is checked **first**.
> **Testing requirements:** the harnesses are the test; each must be able to return FAIL.

##### Task M0-T1 — commit the falsification conditions

- **Description:** `docs/specs/notifications/falsification.md`, committed **alone**, stating the bars
  before any harness runs.
- **Complexity:** S · **Dependencies:** none · **Risks:** a bar tuned to the answer → it lands first,
  in its own commit, which is the whole point.
- **Testing:** n/a.
- **Development steps:**
  1. **F1 (fan-out, SC-3):** a `createMany` of N notification rows inside the plan-settings
     transaction adds ≤ **10 ms p95** to `PATCH …/plans/:id` at N = 50 recipients, measured against a
     real Postgres. State the control: the same endpoint with zero recipients.
  2. **F2 (inbox read, SC-2):** `GET /me/notifications` p95 < **200 ms** at 10,000 rows for one
     recipient (`docs/PERFORMANCE.md`'s own bar). Control: an unindexed baseline, so a PASS is not
     a statement about an empty table.
  3. **F3 (unread count):** the count query p95 < **10 ms** at 100,000 rows across 200 recipients.
     If F3 fails, the indicator falls back to an on-open count (spec §4.9) — **write that fallback
     into the condition**, so failing is a decision and not a crisis.
  4. State what each does **not** cover, in its own file (ADR-0128's rule).

##### Task M0-T2 — the fan-out and read harnesses

- **Description:** a script that seeds N recipients and M rows against a real Postgres and reports
  p50/p95 with the run-to-run spread. **The spread is what makes a verdict mean anything** — ADR-0127
  D8 recorded a machine whose no-change baseline moved 0.93 → 10.00 pp against a 2.00 pp bar and was
  honestly reported INDETERMINATE.
- **Complexity:** M · **Dependencies:** M0-T1 · **Risks:** measuring a copy of the query rather than
  the query (ADR-0124's A9 limb measured a copy of its own gate and reported the wrong number in the
  wrong direction) → the harness calls the **service**, not a restatement of its SQL.
- **Testing:** the harness must produce a FAIL against a deliberately unindexed build. Verified red.
- **Development steps:**
  1. Seed through the **public REST API** where possible (ADR-0066's rule), directly where not, and
     say which in the docblock.
  2. Report `INDETERMINATE` when the spread exceeds the bar. Throw when there is nothing to judge.
  3. Record the result in `docs/specs/notifications/m0-measurement.md`, including anything that
     contradicted this plan.

##### Task M0-T3 — the ADR

- **Description:** write the ADR drafted in spec §4.9 and file it.
- **Complexity:** M · **Dependencies:** M0-T2 (D6's bound is a measured number) ·
  **Risks:** the register entry and the index drift (ADR-0071 was cited by shipped code for a whole
  epic without being filed; ADR-0132 was filed and missing from CLAUDE.md §16 for a day).
- **Testing:** `pnpm check:adr-coverage` (which since ADR-0110 D6 checks `docs/adr/README.md` in both
  directions).
- **Development steps:**
  1. Number it by reading `docs/adr/` rather than assuming; if the number moves, record the
     collision rather than routing around it (ADR-0079's lesson).
  2. Add to `docs/adr/README.md` **and** CLAUDE.md §16 in the same commit.
  3. Run `pnpm prepush` — **one command**, not its parts (CLAUDE.md §19.8).

---

## Milestone 1 — The record (ships dark)

**Outcome:** the five catalogued events write durable per-recipient rows. Nothing reads them.
**Ships dark:** deliberately. There is no route and no screen; the inbox is M2. Stated here because
"the model landed" is not a claim that the capability exists (ADR-0081 §1).
**Journey:** none — see the ships-dark clause. M2 carries the first journey.

#### Feature: the `notifications` model and its emitter

> **Description:** schema, the emitter, five producer call sites, retention.
> **Complexity:** L
> **Dependencies:** M0.
> **Risks:** (a) a fan-out inside a transaction lengthens a planner's save → bounded by F1, with the
> derived-feed fallback named; (b) a FK from `notifications` to a hard-deletable plan makes the
> ADR-0096 expiry fail on exactly the organisations that use the product most (ADR-0096 D5's own
> finding) → **explicit `database-architect` question**, plus a retention-census assertion.
> **Testing requirements:** unit (emitter, recipient resolver, redaction), API e2e against a real
> Postgres (that a rolled-back save emits nothing; that the import path emits at the point of no
> return), structural (import ban, audit census, retention census).

##### Task M1-T1 — schema (**`database-architect`, without exception**)

- **Description:** design `notifications` from spec §4.6.
- **Complexity:** M · **Dependencies:** M0-T3 · **Risks:** a checksummed migration cannot be edited,
  so a mistake costs a second migration in every environment.
- **Testing:** `pnpm check:schema-drift`; the migration applied against a **populated** table rebuilt
  from the earlier migrations, not an empty one (ADR-0107's whole subject: a migration a pristine
  database cannot test passes CI and fails on the host, leaving a restart loop under ADR-0018's
  `set -e`).
- **Development steps:**
  1. **Run the `database-architect` agent.** If it returns nothing, fails, or is slow, **re-run it.**
     An unavailable agent is a reason to wait, never a reason to proceed (CLAUDE.md §19.3 / §20 —
     which exist because `csp_reports` was hand-written when an agent returned nothing, and the
     review that followed found four defects, two fatal).
  2. Hand it, explicitly, the four questions in spec §4.6 — especially the hard-delete FK behaviour
     and the unread-count index, given ADR-0073 C2.3's finding that a **partial** index on a nullable
     column structurally cannot serve rows where that column is null.
  3. Take its answer. Where this plan and the agent disagree, the agent wins and the disagreement is
     recorded.
  4. Update `docs/DATABASE.md` in the same change — ADR-0130's gate pass found `docs/API.md`
     untouched while `docs/DATABASE.md` got a full update for the same change; both are steps here.

##### Task M1-T2 — the emitter and the recipient resolver

- **Description:** `NotificationEmitter.emit(kind, subject, actor, tx)`; the resolver returns the
  organisation's members holding a write permission, minus the actor (CQ-2a).
- **Complexity:** M · **Dependencies:** M1-T1 · **Risks:** the resolver drifts from
  `org-permissions.ts` → it **derives** from `permissionsForRole`, never a second list, pinned by a
  structural test (a hard-coded roster is ADR-0073 C4's defect in miniature).
- **Testing:** unit over every role; a structural test that the resolver imports
  `permissionsForRole`; a **pinned positive case** so a green suite cannot mean "found nobody"
  (ADR-0093/ADR-0108 — a census whose glob matched zero files passed its own "nothing unclassified"
  assertion perfectly).
- **Development steps:**
  1. Per-kind payload allow-lists on `audit-redactor.ts:131-165`'s shape, with the `NEVER_RECORD`
     substring ban.
  2. `createMany` — **one statement**, never a loop. ADR-0053 M6 measured a per-descendant loop at
     ~830 ms against ~13 ms batched, all of it holding a lock.
  3. Empty recipient set ⇒ no statement, no error.

##### Task M1-T3 — the four in-transaction producers

- **Description:** call the emitter beside `record(…)` in `plans`, `calendars`, `baselines` and the
  hierarchy delete path.
- **Complexity:** M · **Dependencies:** M1-T2 · **Risks:** a producer added later without an emit →
  the audit census already forces classification of new routes; extend it so a **blast-radius**
  action must declare whether it notifies.
- **Testing:** API e2e proving a 409 optimistic-lock loss writes **neither** an audit row nor a
  notification.
- **Development steps:**
  1. `plans.service.ts:231-247` — inside the same `if (moved)` branch, so a name-only PATCH notifies
     nothing, exactly as it audits nothing.
  2. `calendars.service.ts:790`, `baselines.service.ts:231`, the `plan.deleted` path.
  3. Extend `audit-coverage.structural.spec.ts` with the notification classification.

##### Task M1-T4 — the import producer, which must **not** follow M1-T3's rule

- **Description:** emit `plan.imported` at the **point of no return**, best-effort.
- **Complexity:** S · **Dependencies:** M1-T2 · **Risks:** **this is the task most likely to be
  written the obvious way and be wrong.** `interchange.service.ts:297-316` states the reason
  verbatim: phase 2 **hard-deletes** the plan when recalculation fails, so a row written in phase 1
  outlives its subject and permanently claims an import that was rolled back. The same ADR records
  the first version calling `record()` — whose contract is to fail its caller — which would have
  turned a successful import into a 500, inviting a retry that creates a **second** plan.
- **Testing:** an API e2e with a forced recalculation failure asserting **zero** notifications; a
  second asserting an emitter failure after the point of no return still returns 201.
- **Development steps:**
  1. Emit beside `recordBestEffort` at `:317`, after phase 2, before phase 3.
  2. Exclude the importer from the recipients — they were answered synchronously (spec §0).
  3. Put the residual in the docblock: a missing row, never a false one.

##### Task M1-T5 — run F1, F2, F3

- **Description:** execute M0's harnesses against the shipped code.
- **Complexity:** S · **Dependencies:** M1-T1…T4 · **Risks:** a PASS taken from a run where nothing
  was exercised → the non-vacuity control is checked **first** (ADR-0125's rule: a benchmark over two
  identical schedules reports the fastest number the route can produce and says nothing).
- **Testing:** the run is the test.
- **Development steps:**
  1. Run; record in `m0-measurement.md` **beside** the pre-committed condition.
  2. **If F1 fails, stop and re-plan** to the derived-feed fallback (spec §4.9). Do not tune the bar.
  3. Record anything that contradicted this plan, in this plan's own words.

##### Task M1-T6 — retention

- **Description:** add `notifications` to `RETENTION_TABLES` with a 90-day period.
- **Complexity:** S · **Dependencies:** M1-T1 · **Risks:** the boot line's table count and CLAUDE.md
  §17's sentence go stale — **this exact sentence went stale once already** when
  `perf_probe_results` joined and the prose was not swept (CLAUDE.md §17).
- **Testing:** a retention-census assertion; a sweep test at a batch boundary reusing ADR-0087 D6's
  `ctid` shape (an `id IN (SELECT …)` degrades to a sequential scan as the table shrinks).
- **Development steps:**
  1. Table + period + census row. 2. Update the boot line and CLAUDE.md §17 **in the same commit**.

##### Task M1-T7 — the engine import ban

- **Description:** a structural test that the notifications module cannot reach `computeSchedule`.
- **Complexity:** S · **Dependencies:** M1-T2 · **Risks:** a gate scoped to a file list stops covering
  new files → derive the roster by **prefix**, which is what made ADR-0129's ban cover a new module
  the day it was written.
- **Testing:** verified red by a deliberate import.
- **Development steps:** 1. Prefix-derived roster. 2. Verify red. 3. State the honest form in the
  docblock: there is nothing here to hold parity _for_.

---

## Milestone 2 — The inbox (**first user-facing milestone**)

**Outcome:** a member can read, in one place, everything that happened to work they are involved in,
across every organisation they belong to, and mark it read.
**Entry point:** **the account chip menu → "Notifications"** (`apps/web/src/components/layout/account-chip.tsx`,
directly above **My activity**, whose `:108-113` docblock records exactly this reasoning for a
per-person, cross-organisation surface), opening **`/me/notifications`**.
**Journey:** **`apps/web/e2e-notifications/notifications.spec.ts`** — a new Playwright config and a
new CI step, landing **with this milestone, not at enablement** (ADR-0081 §2). It opens the account
menu, presses **Notifications**, asserts a seeded row against a **real API**, activates it, lands on
the plan, and asserts the row is read on return.

> **The new Playwright config and CI step are themselves an ADR-0105 trigger** — which is why this
> spec and plan exist. `scripts/e2e-sweep.sh` derives its suite list, so the new suite joins it
> automatically; verify that it did rather than assuming (that script was wrong in **both**
> directions once, naming a deleted suite and omitting seven — ADR-0112).

#### Feature: the read API and the inbox screen

> **Description:** four endpoints + one route, built from the ADR-0097 archetypes.
> **Complexity:** L
> **Dependencies:** M1.
> **Risks:** (a) a bespoke layout on a new screen falsifies ADR-0097's thesis → assembled from
> `PageContainer`/`SectionCard`, asserted by the archetype gate ADR-0098 shipped, verified red
> against a hand-rolled frame; (b) the two empty states collapse into one sentence — **ADR-0073 C1
> shipped exactly that** and the accessibility gate caught a live region saying "Showing 0 events"
> for both.
> **Testing requirements:** unit (both empty states, all three actor kinds, all three subject states),
> API e2e (org scope, IDOR, uniform 404, idempotence, cursor), journey, axe scan on a **populated**
> screen (ADR-0116's finding: a scan certifying only the all-PASS state certifies nothing).

##### Task M2-T1 — `GET /me/notifications` + `unread-count`

- **Description:** controller → service → repository, on `audit.controller.ts:75`'s shape.
- **Complexity:** M · **Dependencies:** M1 · **Risks:** filtering on membership _at emission_ rather
  than _at read_ would return rows for an organisation the caller has since left → the read filters on
  **current** memberships, with an e2e that removes a membership and asserts the rows vanish.
- **Testing:** API e2e comparing **whole payloads**, not three empty arrays — an oracle is a
  difference (ADR-0098).
- **Development steps:**
  1. Recipient id from the session, never a parameter.
  2. Actor names through `org_members`, never `users`; reuse `OverviewActor` from `@repo/types`.
  3. `subject.state` as `LIVE`/`DELETED`/`GONE` — a discriminated state, never a nullable id.
  4. OpenAPI + **`docs/API.md`** (an explicit step; it was silently missed once — ADR-0130).

##### Task M2-T2 — mark read / read-all

- **Description:** two idempotent writes scoped to the caller's own rows.
- **Complexity:** S · **Dependencies:** M2-T1 · **Risks:** a per-row read that leaks another
  recipient's existence → `updateMany` with both predicates, **uniform 404** on zero rows.
- **Testing:** e2e for another recipient's id (404), a nonexistent id (404, **byte-identical**),
  double-mark (204).
- **Development steps:** 1. `updateMany … WHERE recipient = me AND read_at IS NULL`. 2. Assert the two
  404 bodies are identical rather than merely both 404.

##### Task M2-T3 — the route and the screen

- **Description:** `/me/notifications` and its components.
- **Complexity:** M · **Dependencies:** M2-T1/T2 · **Risks:** a search param that cannot survive the
  URL round trip — ADR-0095 records "hide nothing" serialising to `''`, which `useUrlFilterState`
  deletes, with the unit case passing throughout because it hands the parser the value directly.
- **Testing:** unit per state; the archetype gate; a round-trip test that crosses the **router's real
  parser** (`router.options.parseSearch`, never a hand-named default — ADR-0123's finding).
- **Development steps:**
  1. `PageContainer narrow` + `SectionCard` + `ActorName`.
  2. **Two distinct empty states**, in the visible copy **and** the live region.
  3. Shaded link with a reason for a non-`LIVE` subject (ADR-0082), the reason linked by
     `aria-describedby` rather than merely adjacent (ADR-0060 M6's finding).
  4. "Load more" as the **last item in the arrow-key sequence** (WCAG 2.1.1, ADR-0053 M6).
  5. Announce the settled result count (WCAG 4.1.3).

##### Task M2-T4 — the menu item

- **Description:** one `MenuItem` above **My activity**.
- **Complexity:** S · **Dependencies:** M2-T3 · **Risks:** **zero layout width is a claim, not an
  assumption** — the header wraps below a 1480 px container. A portalled menu adds none; assert it.
- **Testing:** a `aboveCanvas`/header-height equality at 1646 and 1920, **verified red** against a
  deliberate header button.
- **Development steps:** 1. Add it. 2. Measure. 3. Record the equality in the milestone note.

##### Task M2-T5 — the journey, the config and the CI step

- **Description:** `apps/web/e2e-notifications/`, its config, its `package.json` script, its CI step.
- **Complexity:** M · **Dependencies:** M2-T4 · **Risks:** a CI opt-in keyed on a branch name that
  can never be true — ADR-0095 shipped exactly that (`contains(github.head_ref, 'gantt')` on a
  repository with one long-lived agent branch).
- **Testing:** the journey is the test. Run it **locally** before pushing —
  `scripts/e2e-local.sh web:notifications` — per CLAUDE.md §19.8; CI is the second opinion.
- **Development steps:**
  1. Seed through the public REST API.
  2. Drive the entry point by **role and accessible name**, never a copy string (ADR-0091 M7's rule).
  3. Add the CI step; confirm the new suite appears in `scripts/e2e-sweep.sh`'s derived list.
  4. Add a changeset.

---

## Milestone 3 — The unread signal

**Outcome:** a member sees that something is waiting without opening a menu.
**Entry point:** the **unread indicator on the existing account-chip avatar**, with the count in its
accessible name — `account-chip.tsx:53-78`.
**Journey:** extends `e2e-notifications`: assert the indicator appears with a seeded unread row,
disappears after mark-all-read, and that the accessible name carries the count.

#### Feature: the indicator

> **Description:** an unread-count query, polled, and a zero-width indicator.
> **Complexity:** M · **Dependencies:** M2, F3's result.
> **Risks:** a count query on every authenticated page for every user forever → F3 is the gate, and
> its **fallback is pre-decided** (on-open count).
> **Testing:** unit (present/absent, accessible name), the journey, the F3 re-run against shipped code.

##### Task M3-T1 — re-run F3 and choose the shape

- **Complexity:** S · **Dependencies:** M2 · **Risks:** a PASS against an empty table → the
  non-vacuity control first.
- **Testing:** the run.
- **Development steps:** 1. Run. 2. If it fails, take the pre-decided fallback and **say so in the
  milestone note**, rather than tuning the bar.

##### Task M3-T2 — the indicator

- **Complexity:** S · **Dependencies:** M3-T1 · **Risks:** a dot as the **only** sighted channel
  reads as colour-coded meaning → it is presence/absence (a shape channel), and the count is in the
  accessible name. **Reviewed by `accessibility-reviewer` before merge** — the avatar is a shared
  shell control and ADR-0111's rule covers changes to a shared primitive's contract.
- **Testing:** unit; axe; the journey.
- **Development steps:** 1. Indicator + accessible name. 2. Re-measure the header equality from
  M2-T4 — an addition to that row is never assumed free.

---

## Milestone 4 — Preferences (**a hard prerequisite of M5**)

**Outcome:** a member chooses what they are notified about, per organisation and per kind.
**Entry point:** a **Notifications** section on **`/account`**.
**Journey:** extends `e2e-notifications`: turn a kind off, cause that event, assert no new row.

> **This milestone is sequenced before mail on principle, not on convenience.** An inbox row is not
> an interruption — you see it when you look. Mail is an interruption delivered to a place the product
> does not control, so shipping mail without opt-out is a decision to send people mail they cannot
> stop.

##### Task M4-T1 — schema (**`database-architect`, without exception**)

- **Description:** `notification_preferences` — per user, per organisation, per kind.
- **Complexity:** S · **Dependencies:** M3 · **Risks:** a `DEFAULT` that states a claim about
  pre-existing rows. The repeated lesson (ADR-0126 `lane_index`, ADR-0071 `budgetedExpense`): a
  default is legal only when it is **true of every pre-existing row**. Absence-means-default is the
  right shape here — no row means "the role's default" — so **there may be no rows at all** until
  somebody changes something.
- **Testing:** drift check; migration against a populated table.
- **Development steps:** 1. **Run the agent; re-run it if it returns nothing.** 2. `docs/DATABASE.md`.

##### Task M4-T2 — API + screen

- **Complexity:** M · **Dependencies:** M4-T1 · **Risks:** the preference silently suppresses the
  **audit** row → an e2e asserting the audit row is still written with the preference off.
- **Testing:** unit, API e2e, journey, axe.
- **Development steps:** 1. `GET`/`PUT /me/notification-preferences`. 2. A section on `/account` using
  the ADR-0061 form-layout primitives. 3. Classify the two routes in the audit census — applying
  ADR-0073's two tests **in writing**: a preference is durable (`updated_at`) and re-judges nobody
  else's work, so **no** audit row.

---

## Milestone 5 — The digest (mail)

**Outcome:** a member with unread notifications gets at most one email per interval, carrying a
**count and a link and no plan content**.
**Entry point:** none new in the app — the email's link is the entry point, landing on
`/me/notifications`. The **operator** entry point is `NOTIFICATION_DIGEST_ENABLED`, default `false`.
**Journey:** an API e2e against the logging adapter asserting one digest per watermark interval and
that the message body contains **no** plan name, organisation name, actor or date.

> **Only if CQ-3 is answered (a).** If (c), this milestone does not exist.

#### Feature: a bounded digest on the ADR-0087 scheduler

> **Complexity:** L · **Dependencies:** M4.
> **Risks:** **this milestone fires ADR-0087 D2's own "fan-out" trigger** and must not pretend
> otherwise — see spec §4.4. Mitigation: a hard cap on sends per tick, a resumable watermark, and a
> measurement. **If the cap is exceeded in practice, ADR-0009 is reopened**; that is written into the
> milestone, not left as a hope.
> **Testing:** unit (watermark, cap, idempotence), API e2e (no content in the body), a threshold test
> for the failure counter.

##### Task M5-T1 — the port method + the `mail_events.kind` CHECK (**`database-architect`**)

- **Complexity:** S · **Dependencies:** M4 · **Risks:** reaching for a generic `send()` and
  dissolving the port's closed vocabulary → a **fourth typed method**, `sendNotificationDigest`
  (`mail.service.ts:45-84`).
- **Testing:** both adapters; the CHECK migration against a populated table.
- **Development steps:** 1. Port method + both adapters. 2. `MailFailureKind` gains
  `notification_digest`. 3. **Run the agent** for the CHECK widening — **one** migration, which is
  why the column is `TEXT` + `CHECK` rather than an enum (`schema.prisma:3205-3211`).

##### Task M5-T2 — the job

- **Complexity:** M · **Dependencies:** M5-T1 · **Risks:** (a) `z.coerce.boolean()` is
  `Boolean(value)`, so `'false'` parses to **`true`** — ADR-0096 shipped exactly that, with the
  inverted line in `.env.example`; (b) no re-entrancy guard, which the sibling job carries
  deliberately; (c) an unbounded `{ in: [...] }` — Prisma does not chunk it, and ADR-0096 measured a
  bind-parameter error at 16,384 ids that the catch block reported as "the next tick will retry it".
- **Testing:** unit for the arming switch **with the string `'false'`**, verified red; the cap; the
  watermark's idempotence; a crash mid-tick re-sending at most one duplicate.
- **Development steps:**
  1. `HeartbeatService`'s shape — `setInterval`, `.unref()`'d, no timer when disabled.
  2. Watermark per recipient; cap per tick; log when the cap binds, because that is ADR-0009's
     trigger arriving.
  3. Never part of `/health/ready` (ADR-0075's rule: the host recreates containers unattended).

##### Task M5-T3 — the message, and the honesty gates

- **Complexity:** S · **Dependencies:** M5-T2 · **Risks:** a helpful subject line leaking a plan name
  — which is the disclosure this design exists to prevent (spec §4.3).
- **Testing:** **G1** (nothing claims a message was sent) and **G2** (role-invariant, cost-free
  payloads), both verified red; a body assertion that no plan/org/actor string appears.
- **Development steps:**
  1. Write G1 and G2 **comment-stripped** — four gates in this repository have matched their own
     docblocks (ADR-0097, ADR-0106, ADR-0116, ADR-0124).
  2. Ship G2 with ADR-0116 M5's two bypasses and ADR-0129's third as **fixtures on day one**.
  3. `.env.example`, `docs/DEPLOYMENT.md`, `docs/OBSERVABILITY.md`.

---

## Milestone 6 — The gate pass

**Outcome:** the specialist reviews over the combined diff, folded, with every fix carrying a
regression test **verified red first**.
**Entry point:** none new.
**Journey:** the full `e2e-notifications` suite plus **every** other journey — ADR-0091 records three
journeys broken across one epic, each found by CI rather than locally, because the suite CI named was
fixed instead of all of them.

> Seven of the last eight epics' gate passes found defects that had passed a human read, and in four
> of them the largest finding was **a milestone's headline capability having no entry point**
> (ADR-0081's class). This milestone is not a formality.

##### Task M6-T1 — reviews

- **Complexity:** M · **Agents:** `security-reviewer` (recipient scoping, IDOR, uniform 404,
  disclosure past the permission boundary), `backend-performance-reviewer` (fan-out, count query,
  sweep — **re-deriving M0's numbers from the shipped code**, which is what the last three passes
  did), `database-architect` (the migrations as shipped, against a populated table),
  `api-reviewer` (envelopes, cursor, status codes, OpenAPI), `ux-reviewer` (the two empty states, the
  shaded reasons, the copy), `accessibility-reviewer` (WCAG 2.2 AA; the indicator; the live regions),
  `component-reviewer` (archetype reuse, no one-off styling).
- **Development steps:** 1. Run them over the **combined** diff. 2. Fold every blocking finding with
  a regression test verified red first. 3. File the non-blocking ones as a numbered
  `docs/TECH_DEBT.md` row with a status (`check:debt-status` refuses one without).

##### Task M6-T2 — documents, and the spec's own header

- **Complexity:** S
- **Development steps:**
  1. `docs/BACKLOG.md` — close the `M` row.
  2. `docs/ROADMAP.md` — add the entry.
  3. CLAUDE.md §16 (the ADR) and §17 (the retention table count).
  4. **Set this spec's and this plan's `**Status:**` header to `Accepted — shipped (ADR-NNNN)`** in
     the same change that files the ADR. `check:spec-status` refuses a `Draft` header on a spec any
     ADR cites — and the estate reached 54 stale headers precisely because that was nobody's step
     (ADR-0131).
  5. Record what was found **wrong** during the epic, not only what changed.

---

## Sequencing & slices

Each milestone keeps `main` releasable, and each is independently valuable:

| Slice | Releasable because                                             | Reachable?                             |
| ----- | -------------------------------------------------------------- | -------------------------------------- |
| M0    | harnesses + an ADR; no product code                            | n/a                                    |
| M1    | rows accumulate; nothing reads them; no surface changes        | **dark, deliberately**                 |
| M2    | the inbox is the feature; everything after it is amplification | **yes** — account menu → Notifications |
| M3    | the signal; the inbox works without it                         | yes                                    |
| M4    | preferences; the feature works without them                    | yes                                    |
| M5    | mail; off by default; the inbox is unaffected                  | operator-armed                         |
| M6    | gates                                                          | n/a                                    |

**If only one slice ships, it should be M1 + M2.** That is the narrow thing: a durable per-person
record and one screen to read it on.

**Feature flags: none.** ADR-0088 D1 — `import.meta.env.VITE_*` is inlined at build time,
`apps/web/Dockerfile` declares one `VITE_` build arg and `docker-publish.yml` passes none, so every
published image carries every flag at its default and an operator cannot switch one off. A flag here
would be a second JSX root maintained forever, not a rollback. **The rollback is a commit boundary**,
and the milestones are cut so each is one revertible commit range.

**What this epic deliberately does not do**, stated so it is not rediscovered as an omission:

- It does **not** touch the pen (CQ-1), and §4.2 of the spec says why with the arithmetic.
- It does **not** notify on ordinary content edits. There is no event source and there permanently
  will not be one in the audit log (ADR-0073 §3); `docs/BACKLOG.md:167-177` names that as a different
  feature with a different table.
- It does **not** add real-time push, per-plan subscriptions, digest grouping, or a Slack/Teams
  channel. Each has a named trigger in the spec.
- It does **not** notify External Guests. There is nobody to notify.

## Definition of Done (per task)

Every PR satisfies the Feature Completion Criteria in [`docs/PROCESS.md`](../../PROCESS.md).
Two are called out because they are the ones most often written rather than done:

- **`pnpm prepush` is run as one command**, not as its parts. `scripts/prepush.sh` derives the gate
  list from `package.json` precisely so nobody keeps one in their head; following an older written
  list once sent a change to CI that a documented gate refused (CLAUDE.md §19.8).
- **`scripts/e2e-local.sh api` for every `apps/api` change, and `web:notifications` for every journey
  change.** CI is the second opinion, never the first.

## Risks & assumptions (rollup)

| Risk / assumption                                                                             | Likelihood                                 | Impact   | Mitigation                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------- | ------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fan-out lengthens a planner's save past F1                                                    | med                                        | high     | Measured at M1-T5 with the bar committed first; the derived-feed fallback is pre-decided, not improvised.                                                                                      |
| The unread count is a per-page query forever                                                  | med                                        | med      | F3, with a pre-decided on-open fallback; the index designed by `database-architect`, given ADR-0073 C2.3's partial-index finding.                                                              |
| A FK to a hard-deletable plan breaks the ADR-0096 expiry on exactly the busiest organisations | med                                        | **high** | Explicit `database-architect` question (spec §4.6 Q1) + a retention-census assertion. ADR-0096 D5 found this shape live.                                                                       |
| The import notification is written the obvious way and outlives a rolled-back import          | **high**                                   | high     | M1-T4 exists as its own task for this reason, with the rule quoted from `interchange.service.ts:297-316` and two e2e cases.                                                                    |
| Noise makes the inbox useless in a large organisation                                         | med                                        | med      | CQ-2a narrows the audience by derivation; grouping is the cheap first remedy; subscriptions (CQ-2c) have a named trigger.                                                                      |
| The digest becomes fan-out that ADR-0087 was not chosen for                                   | med                                        | med      | Capped, watermarked, measured; exceeding the cap **reopens ADR-0009** and that is written down.                                                                                                |
| A structural gate matches its own docblock and passes for the wrong reason                    | **high** — it has happened four times here | med      | G1 and G2 are comment-stripped and verified red against a named mutation (ADR-0110 D5: a gate is finished when it has been **made to fail** by the defect it was written for).                 |
| The milestone's capability has no entry point                                                 | med                                        | **high** | ADR-0081: every milestone header above names its entry point or declares itself dark, and the journey lands at M2 rather than at the end. Four of the last eight gate passes found this class. |
| A decision in this plan was inherited from the brief and is wrong                             | med                                        | high     | Spec §0 re-verified all six inherited facts; one was materially incomplete and the correction changed the recommendation. Anything else load-bearing is re-checked before it is built.         |
