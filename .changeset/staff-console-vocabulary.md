---
'@repo/web': patch
---

One failure shape and one metric shape on the staff console — and a real defect closed on the way.

Five call sites rendered a failed query as character-identical markup, down to the gap and the
button's variant: `DataTable` and four staff panels. They are now one `QueryErrorState`, and
**`DataTable` consumes it** — a shared component the table did not use would be two implementations
of one shape held together by a test, which drift invisibly because each looks right alone.

The loading half is deliberately NOT unified. `DataTable` shows a content-shaped skeleton, whose own
docblock argues that a skeleton of the wrong shape reflows the page under the reader's cursor; a
panel whose settled content is a stat grid has no table shape to skeleton. Forcing one component
would have regressed a shipped decision, so it stays a rule.

The defect: `query.data` is not cleared by a failed refetch, so a panel written as "if error show
this, if data show that" rendered **both** — a red "could not read" sentence sitting directly above
figures from the last successful read, with nothing saying they were stale. Four panels did this.
Verified red before the fix.

`StatGrid` is promoted from the console's local helper, whose docblock claimed the codebase had no
primitive for this shape — untrue when written, since `ContextStrip` exists. Both docblocks now
state the discriminator, and the API is designed against the widest existing caller so the others
can adopt it. The four that remain are recorded as debt rather than converted carelessly: they
disagree about the figure's size, and two are deliberately quiet.
