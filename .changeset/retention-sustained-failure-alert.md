---
'@repo/api': minor
---

Alert the operator when the retention sweep keeps failing (ADR-0087 M4).

After three consecutive failed runs, one message is POSTed to `MAIL_ALERT_URL` — the existing
webhook, reached through a `postAlert` function extracted verbatim from `OperationalAlertService`.
Three rather than one, because a single failed sweep is usually a connection the next tick will have
and the next tick is the retry; a channel that cries wolf gets muted. One message per incident, not
per tick, and a clean run closes the incident so a later outage alerts again.

The body carries counts and table names only — this POST leaves the system for a third-party chat
service, and one of these tables holds attacker-controlled strings while the other holds customer
addresses.

Also fixes a sweep that **throws** being recorded as a clean run: `record([])` found no failed table
and reset the counter, so a sweep crashing on every tick silenced this threshold and painted the
staff console healthy. `recordFailedRun` now says so explicitly.
