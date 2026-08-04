---
'@repo/api': minor
'@repo/web': minor
---

Make a failed sign-in readable by the account it was aimed at (ADR-0073 C2, closing TECH_DEBT #91).

`auth.sign_in_failed` was the one audited event with neither an organisation nor an actor, and both
read endpoints filter on exactly those columns — so the single most useful row an audit log has to
offer, somebody trying to get into your account, was reachable only from `psql`.

The attempted address is now resolved to a user id at **write time**, into `subject_id`, and
`GET /api/v1/me/audit-events?include=attempts` returns those rows to that account holder and to
nobody else. Not at read time: addresses get reassigned, so a read-time join would silently move one
person's history into another person's account as the mapping changed. Attribution is therefore
forward-only — the table refuses `UPDATE` by design, so rows written before this cannot be
attributed later.

The sign-in response is unchanged whether or not the address exists, so this is not an
account-existence oracle. Omitting `include` returns exactly the response the route gave before.

`VITE_AUDIT_SELF_SECURITY` gates the **My activity** surface, which explains what a "Not signed in"
row means and — as importantly — what it does not prove.
