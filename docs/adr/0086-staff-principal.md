# ADR-0086 — A staff identity that cannot reach a customer

**Status:** Accepted — M1–M6 landed 2026-08-09
**Date:** 2026-08-09
**Builds on:** ADR-0051 (the `GuestPrincipal` shape, which this copies), ADR-0012/0016 (RBAC and
tenancy), ADR-0072/0073 (the append-only audit log and what earns a row), ADR-0075 (mail is
best-effort, and the failure belongs to the operator).
**Amends:** nothing. **Supersedes:** nothing.

## Context — the most privileged operations in this product are the only unaudited ones

The product owner asked whether to build "a super god user … like a super admin", for employees of
SchedulePoint, motivated by wanting "email down alerts and the like".

The motivating example does not need one — an alert is an outbound POST (M1, landed) and needs no
principal at all. But the question underneath it is real, and reading the code turns up an argument
nobody had made:

**Every staff operation on this installation today happens over `psql` on the host, and is
completely unaudited.** `audit_events` is append-only in the database — `BEFORE UPDATE OR DELETE`
and `BEFORE TRUNCATE` triggers declared `ENABLE ALWAYS`, so the application role cannot bypass them
(ADR-0072). A person with a shell is outside that boundary entirely. Reading every customer's
address, counting unverified accounts, inspecting mail failures: all of it is possible, none of it
leaves a record, and the only reason it is not a governance problem yet is that there is one
operator and they are the owner.

So the honest framing is the inverse of the usual one. A staff identity built this way is not a new
hole; it is the first time the most privileged acts in the system become observable.

## The constraint that shapes everything

`OrganizationRole` is `VIEWER | CONTRIBUTOR | PLANNER | ORG_ADMIN` (`principal.ts`) — every role is
scoped to an organisation, and cross-organisation access returns **404, not 403**, deliberately (no
existence oracle). There is no global principal, and 20 modules enforce that.

The naive implementation adds `STAFF` to that enum, or an `isStaff` flag on `Principal`, and
branches at each scope check. That is the version to refuse. It puts a new conditional into the
highest-consequence code in the product — twenty modules' worth of org-scope assertions — where
every branch is a potential IDOR, and it makes "staff cannot read customer data" a property
maintained by vigilance across a hundred call sites.

## Decision

### D1 — `StaffPrincipal` is a structurally distinct type, copied from `GuestPrincipal`

```
class StaffPrincipal {
  readonly userId: string
  readonly email: string      // the stored, normalised address — the audit actor label
  // NO memberships. NO can(). NO organizationId. NO role.
}
```

`guest-principal.ts:1-15` states the property this is copied for: a guest reaching a member surface
is "a **compile error**, not a runtime check we could forget". The same holds here and for the same
mechanical reason — every member service method takes `Principal`, and a type with no `memberships`
and no `can` is not assignable to it.

**`AuthContextService` is not modified.** There is no `STAFF` in `OrganizationRole`, no
`principal.isStaff`, and no staff branch in `permissionsForRole`. Nothing on the member path changes
at all, which is what makes the review surface small and the rollback argument trivial: the member
authorisation code is byte-identical.

A structural seam test pins all three halves — `StaffPrincipal` declares no `memberships` and no
`can`; nothing under `modules/staff/` imports a service or repository from an org-scoped module; and
nothing there imports the CPM engine.

### D2 — Declining the canvas is the largest simplification in the design

The product owner offered staff the canvas, "if it's easier". It is neither easier nor safer, and
the reason is D1: reaching the canvas means reaching plan data, which means holding a `Principal`,
which destroys the compile-error property and converts every prohibition into a runtime check
somebody has to keep true. The console is a flat, canvas-free route tree.

This is recorded as a decision rather than a scope cut, because "give staff the full app" is the
obvious next request and the answer to it is structural, not a matter of appetite.

### D3 — Staff-ness is an env allowlist, and provisioning is deliberately out-of-band

`STAFF_EMAILS` is a comma-separated list on the API environment. Changing it requires host access
and a container recreate — **the same bar as reading the database today**, which is the point: it
creates no new privilege path, because anyone able to edit it could already do everything the
console offers, unaudited, over `psql`.

Its weaknesses are real and are recorded rather than discovered later: no revocation without a
recreate, no per-staff capability differentiation, and a list keyed on an address.

Two consequences that are **not** optional:

1. **Matching normalises with `toLowerCase()` and nothing else**, through the existing shared
   `normalizeEmail`. Trimming the session value would be a defect, not a courtesy — that function's
   docblock already establishes it for the audit attribution path, and a second implementation of
   one external library's rule drifts invisibly.
2. **`emailVerified` is required for staff unconditionally**, independent of
   `AUTH_REQUIRE_EMAIL_VERIFICATION` (which defaults to `false`). Without it, an allowlisted address
   that has not yet signed up is **squattable**: anyone who registers it first becomes staff. This
   is the cheapest and sharpest control in the design.

### D4 — Dual-hatting is permitted and warned, never refused

The product owner's own address is almost certainly both allowlisted and an organisation member.
Refusing staff status to any account holding a membership is the tidy answer and the unusable one —
it locks the only staff member out on day one. Refusing to boot is worse: a policy preference
converted into an outage. Requiring a second account is a reasonable recommendation and a bad
requirement, because nothing can enforce that the second account belongs to a different person, so
it buys hygiene rather than a security property.

The security argument never needed refusal. Staff-ness confers nothing inside any organisation **by
construction** (D1), so the two hats cannot combine: the same person on `/api/v1/staff/…` gets a
`StaffPrincipal` with no memberships, and on `/api/v1/organizations/…` gets exactly the role they
already had. The two never coexist on one request, because they are resolved by different guards on
disjoint route sets.

What is added is observability rather than enforcement: a boot-time `warn` naming how many
allowlisted addresses hold a membership, and a recommendation in `docs/DEPLOYMENT.md`.

### D5 — Every staff route is audited, **including reads**

Normally a read earns no audit row (ADR-0073's durability and blast-radius tests are about acts
somebody took). Here the read **is** the privileged act — the whole console is reads — so the
ordinary rule would audit nothing at all and the epic's central argument would evaporate.

This is enforceable rather than aspirational, and the brief was wrong about why. It assumed the
route census forbids auditing a read; it does not. All six of its assertions force a route **to
be** audited, and nothing forbids it — so a **seventh** assertion is buildable: any route whose path
starts `/api/v1/staff/` must appear in `AUDITED_ROUTES`. Derived from the path rather than listed,
so a staff route added later is covered the day it is written.

`AuditActorType` gains `STAFF`, which costs **two migrations**: Postgres cannot use a new enum label
in the transaction that added it (the ADR-0053 M3 precedent).

**The audit row never records what was on the screen.** It records that a staff member read a panel.
Recording the addresses would put customer PII into the one table that refuses `DELETE`, recreating
through the back door exactly what ADR-0085 D3 spent a decision avoiding — and what M1's
deliberately-ordinary `mail_events` table exists to keep erasable.

### D6 — Scope is the installation, never the customer

Twelve prohibitions are listed in the spec; the load-bearing ones are that no staff route may read a
client, project, plan, activity or note, and that there is **no impersonation**. The cross-org 404
invariant is untouched — not "respected", untouched: no code on that path is modified.

One write exists in v1: "send a test message", addressed only to the requesting staff member's own
verified address. The recipient is **not a parameter**, so it cannot be used as a relay — a
structural property rather than a validation rule.

### D7 — Two claims in this ADR were overstated, and they are corrected here rather than quietly edited

The security review that gated M2 found both. Recording them is the ADR-0076 rule applied to this
document.

**"Every refusal is a uniform 404" is true of _authenticated_ callers, and only those.** The global
`AuthenticationGuard` runs before `StaffGuard`, so an **anonymous** caller gets 401 — the guard's own
no-session branch is unreachable in the wired app and cannot make it a 404. The guarantee that
matters is intact: no authenticated caller can distinguish "I am not staff" from "there is no such
route", so the surface is not an oracle for **which addresses are staff**. But the blanket phrasing
was wrong, and "sign in first" is not a fact about anybody's staff status.

**D4's promised boot warning did not exist.** This ADR said staff-membership overlap would be logged
at boot; nothing did. It is built now (`StaffBootstrapService`) rather than the sentence being
deleted, because that observability was the whole compensation for permitting dual-hatting.

## Consequences

- The API gains a second guard and a second principal type. Both are small and both are pinned by a
  structural test; neither touches the member path.
- Staff acts become the only privileged acts in the system with a durable record. `psql` remains
  available and remains unaudited — this narrows the unaudited surface, it does not close it, and
  claiming otherwise would be false.
- A future capability split between staff members (support vs. engineering) is not designed for.
  `STAFF_EMAILS` is one flat list, and the day two tiers are wanted this ADR needs a successor.

## What this ADR does not do

It does not give staff access to customer data, and it does not defer that — it decides against it,
so a later request for it is a new decision with its own ADR rather than an extension of this one.

**The CPM engine is not imported and the ADR-0034 recalculation parity gate is untouched** — in its
honest form: there is nothing here to hold parity for.
