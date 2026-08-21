---
'@repo/web': minor
---

The light corporate theme. The application is now navy chrome and amber accents around light
working surfaces — the same navy and amber the sign-in screen has always worn, so the front door
and the product are one identity for the first time.

The diagram gets a ground of its own, one measured step off the page, and a criticality ladder
derived against it. Twelve categorical colours replace five, so grouping by WBS no longer reuses a
fill on the sixth phase.

Also fixes a defect that had been live since surface scopes shipped: the canvas painter resolved
the page's colours rather than the diagram's, because a `@theme inline` alias is resolved once at
the document root and cannot follow a per-surface rebind. The guest share view was a second
instance, and its legend a third.
