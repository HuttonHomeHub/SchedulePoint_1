---
'@repo/web': patch
---

The staff console's first viewport answers "is anything wrong right now?".

A derived, four-state status summary leads the page: every check the console can make, severity
ordered, each naming the number its claim rests on and linking to the section that answers it. Five
checks — mail delivery, retention sweeping, Content-Security-Policy, account verification, and
whether anybody would learn of a failure at all.

Measured on the unhealthy recipe at 1646: **all five conditions are now named within the first
viewport, against three of five before**. The two that were below it — retention sweeping disabled,
and 93 accounts that cannot complete sign-in — sat 562px and 1,445px down at the start of this epic.

It never reports a pending or unreadable check as healthy: four states with no defaulting, and a
total record so a check added without a state is a typecheck failure rather than a silently missing
row. It is deliberately not a live region, by either mechanism — these are standing conditions, not
events — and the test pins the absence of `aria-live` as well as of `role`, because `aria-live` with
no role is still a live region.

It issues no request of its own: the derivation takes the page's existing query results as
arguments, because reading a staff panel is an audited act and a second request would write a second
row on every page load, forever, in the table that refuses DELETE.

`SectionCard` gains an optional `id`, which also makes it focusable, so a summary row's link has
somewhere to send a keyboard reader rather than only moving the viewport.
