# M8 measurement outputs

**`drift-1646.json`** — the FC-8 reading, taken 2026-09-17 with `measure-page-drift.mjs` at 1646
against the same shoot fixture M0 and M1 used.

**`run.sha` reads `3cdf3672`, which is M7's commit, and the tree it measured was not that commit.**
The harness records `HEAD`, and this run was taken against a dev server serving the M8 fold-ins
while they were still uncommitted. Nothing in the FC-8 quantity depends on those fold-ins — they are
a description column, a header wrapper, one `aria-hidden` and four docblocks — but a field that says
one thing while the measurement means another is exactly what this epic keeps recording, so it is
said here rather than left for someone to reconcile.

**`firstRowTop` is new**, added at M8 because FC-8 had no instrument at all. Every other condition
here was judged by something that already existed; this one was left to be reasoned about, and
reasoning is what ADR-0076 says not to accept for a claim that decides something. It is
viewport-relative, so it compares directly with `state.viewport.h`, and it is recorded **per table**
rather than per page — Members and Project detail each hold two lists, and the second one is the one
a section heading pushes down.

**Page height on the two audit screens is fixture-dependent and must not be read as drift.** The
shoot harness mints a fresh tenant per run, so the number of audit events differs between runs:
`audit-log` reads 2100 (M0) → 1935 (M1) → 2053 (M8), which is a different row count, not a layout
change. The FC-8 quantity is the **first row's position**, which is a fact about the chrome above it.
