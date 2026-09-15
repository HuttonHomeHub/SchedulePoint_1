---
'@repo/web': patch
---

The staff console is built from the page archetypes, and it has a way back to the application.

`/staff` hand-rolled its own page frame and its own section heading rank — the shapes ADR-0097's
archetypes exist to own — so it took `PageContainer` + `PageHeader`, and `Panel` now composes
`SectionCard` rather than reimplementing `Card`. A structural gate over the whole surface (the route
file, the feature and the performance probe's UI) refuses a hand-rolled frame, `<h1>` or `<h2>` in
any of them.

It also gains the way back that nobody had noticed was missing: the authenticated branch rendered a
header with no link home, while the not-found branch beside it has one — so the branch for people
who cannot use the page had a way out and the branch for people who can did not, and there is no app
shell here to supply one.

Deliberately a no-op on measure, and verified as one rather than assumed: 8,793 px before against
8,781 px after, both measured in the same sitting. Comparing against the figure recorded earlier
would have shown +3,228 px and sent somebody looking for a defect that does not exist — the page's
height drifts upward on its own, because two of its tables only grow.
