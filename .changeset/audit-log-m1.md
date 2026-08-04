---
'@repo/api': minor
'@repo/web': minor
'@repo/types': minor
---

Add the append-only audit log (ADR-0072), closing `docs/TECH_DEBT.md` #14(a)/(a2).

Eighteen events are recorded into a table the database itself refuses to update or delete —
membership role changes and removals, invitations created, revoked and accepted, organisations
created, five authentication events, and hierarchy deletes and restores carrying the cascade's own
batch id, so one user action reads as one row rather than forty.

Membership and hierarchy events are written **inside the caller's transaction**: an action that
cannot be recorded does not happen. Authentication events invert that deliberately — there is no
transaction to roll back, and refusing every sign-in because the audit table is unavailable would
turn a logging fault into an outage.

Two reads: `GET …/organizations/:slug/audit-events` for an Org Admin, and `GET /me/audit-events`
for anyone. The self route takes no user id at all, so there is nothing to tamper with and no
permission to hold — an ordinary member can see their own sign-in history without asking.

Two screens behind `VITE_AUDIT_LOG` (**on by default**; set it to `false` to roll back to the prior
product exactly — there is no write path here to leave behind): **Audit log** in the organisation
nav for an Org Admin, and **My activity** in the account menu for everyone. Both render from one list component,
so the two views cannot drift about how an event reads. A caller without `audit:read` is told so
rather than shown an empty table — "no events" and "you may not see these" are the one distinction
an audit log must never blur.

Every route in the API is now gated on an audit decision: a new endpoint that is neither audited nor
explicitly excused with a named reason fails CI.
