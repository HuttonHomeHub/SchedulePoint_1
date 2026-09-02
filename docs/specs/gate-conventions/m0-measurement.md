# Gate conventions — M0, and where it corrects the spec

Run 2026-09-02 against `a1d665d8` (recorded in `m0/baseline-rev.txt`), on a tree whose only
uncommitted change was this epic's own spec and plan.

## F0.1 — the parser boundary

**Condition, committed before the run** (`implementation-plan.md` M0-T1): _the proposed rule moves
**at most two** section boundaries across the three documents, and changes **zero** findings and
zero summary figures in either gate's output._ Predicted from reading: exactly one boundary moves,
`### 232.` at `docs/TECH_DEBT.md:1124`.

**Verdict: the first half is FALSIFIED, the second half holds.** Three boundaries move, and the
prediction named the smallest of them:

| Document            | Section                                       | Body lines, before → after |
| ------------------- | --------------------------------------------- | -------------------------- |
| `docs/TECH_DEBT.md` | `### 232.`                                    | 184 → **36**               |
| `docs/RECONCILE.md` | `### 8. Record the pass`                      | 31 → **5**                 |
| `docs/DECISIONS.md` | `### 2026-07-11 — TSLD accessibility model …` | **1160 → 25**              |

Both gates' output is **byte-identical** before and after (`m0/debt-status.before.txt`,
`m0/reconcile-due.before.txt`, diffed empty), all pre-existing fixture cases stay green, and the
summary figures are unchanged: `71 detailed rows (71 with a status, 0 without), 43 compact-table
rows, 113 ledgered, 3 section headings`, and `last pass 2026-08-30 (3d ago), 3 of 123 ADRs since,
threshold 8`.

**What the falsification is worth reading for.** The condition put a **proxy** and the **thing it
cared about** in one sentence joined by "and". The proxy — how many bodies move — was wrong by 50%
and named the wrong one. The thing it cared about — does any answer change — was right. Had the
condition been the proxy alone, the plan's "if falsified" branch would have fired and this milestone
would have become repair-then-arm on the strength of a number that decides nothing.

So the branch does **not** fire, and the reason is written down rather than inferred: a boundary
moving is only interesting where a body was carrying a field that belonged to somebody else, and
`docs/DECISIONS.md` and `docs/RECONCILE.md` have no field readers at all. Only `docs/TECH_DEBT.md`
does, and its one moved body changed nothing.

**Note what the prediction missed and why.** The spec found `### 232.` by reading `docs/TECH_DEBT.md`
— the document the row is about. The other two live in documents the row never mentions, and the
larger of them is a `###` entry silently swallowing **1,160 lines**. This is the epic's own subject:
a claim established by reading a document rather than by running something over all of its inputs.

## The off-by-one, and the case that caught it

The first implementation of the depth rule pushed the boundary one line late, so **every body kept
the heading that terminated it**. Both consumer gates still reported byte-identical output — a
heading line is not a column-0 field declaration, so nothing they assert could see it — and all
fifteen pre-existing fixture cases stayed green.

It was caught by fixture case (a), written before the change and run against the pre-change module
first. Case (e) was then added to state the property directly, and **verified red by restoring the
off-by-one**: `(a)` and `(e)` both fail, everything else passes.

That is ADR-0110 D5 doing exactly its job, on a defect that no gate in this repository could
otherwise have reported.

**Case (e)'s first draft was itself wrong**, and is recorded rather than quietly fixed: it asserted
that no body contains any heading line, and went red against a **correct** parser, because a deeper
heading legitimately belongs inside. The assertion now excludes only headings at the section's own
level or shallower. An assertion that fails against correct code is not a stricter assertion, it is
a wrong one.

## Verified corrections to the rows

Three of the spec's corrections to `#231` and `#222` were re-checked here rather than inherited:

- **`check:doc-links` does not use the parser.** `scripts/check-doc-links.mjs:22-24` imports only
  node built-ins. The two real consumers are `check-debt-status.mjs:25` and
  `check-reconcile-due.mjs:35` — and `#231` named the first, missed the second, and named a third
  that was never a consumer.
- **`#231`'s headline instance is already patched.** `#117` carries a status line today, so the
  parser change is a recurrence fix with no red state left in the tree — which is why A9's field
  limb has to be verified against a prior revision rather than against `HEAD`.
- **`fieldValue`'s docblock was false.** It claimed inline code spans are stripped; they are not,
  and the comment three lines below records that guard being removed as actively wrong because it
  ate two real declarations. Corrected as prose only — restoring the stripping would re-introduce
  the defect that comment exists to record.
