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

## F0.2 — A9's field limb

**Condition, committed before the run:** _today the limb reports N = N and produces zero findings;
at the prior revision it reports N−1 against N and fails._ Predicted: 71 = 71 today, 70 against 71
before.

**Verdict: holds, in both halves.** Today: `71 detailed rows (71 with a status, 0 without)`, no
finding. Against `6b3f740b` — the parent of `d250104d`, the commit that gave `#117` its status line
— the real gate reports:

```
✗ A9: the parser sees 71 numbered rows but the raw document declares 70 column-0 **Status:** lines.
      Some row has no declaration of its own — A1 names it.
✗ A1: docs/TECH_DEBT.md:1501 "117. CSP report delivery is unverified end to end" has no **Status:** line.
```

**A1 fires there too, and that is not redundancy — it is the point.** At that revision, with the
**old** parser, A1 was silent: `#117`'s body ran 1,115 lines and picked up `#118`'s declaration, so
the row satisfied A1 by borrowing. With the boundary fixed, A1 sees the row honestly. The field
limb is the independent control for the case where the parser is wrong again in some _new_ way, and
the two firing together is what a correct instrument and a correct control look like on a document
that really is missing a field.

The unanchored count at that revision is 70 as well; the 74-vs-71 divergence the spec predicted is
a property of today's register, not that one. Both are recorded because the anchoring decision has
to be right for both.

### The probe was wrong first, and the gate corrected it

The first measurement of this condition reported **63 parsed rows against 70 declarations** — the
wrong number and the wrong direction. It came from a throwaway probe that **reimplemented the
gate's `rowNumber` matcher** rather than running the gate, and the reimplementation required a
trailing `.`, so every row titled in the `### #208 —` em-dash form fell out of the count.

Running the real `check:debt-status` against the same file, by swapping the document into place,
gives 71 against 70 — precisely what the condition predicted.

This is the epic's own subject, committed inside the milestone that is about it: **a measurement
taken with a copy of an instrument measures the copy.** The copy looked right, produced a plausible
number, and would have been written into this document as evidence. It is recorded rather than
quietly replaced, because the corrected number is less instructive than the reason the first one
was wrong.

## F0.1 addendum — the ledger move (M1-T3)

`## Closed numbers` sat at `:1161` with **40 numbered detailed rows after it**, and
`check-debt-status.mjs` classifies any `| N |` line after that heading as a ledger entry. Measured
before the move: **113 matched rows after the heading, the last at `:1290`** — all of them the
ledger's own table, so the misclassification was **latent, not live**, exactly as the spec said.

Moved to the foot. Verified a **pure relocation** by comparing the sorted multiset of every
non-blank line before and after: identical, so no line was added, dropped or edited. The gate's
summary is unchanged (`71 / 43 / 113 / 3`), and the count of numbered rows after the ledger heading
is now **0**.

## F0.3 — the heading-form assertion (M2)

**Condition:** _the census finds ~9 non-canonical `###` headings, all repairable by editing the
title line alone, and A10 goes green immediately after the repair._

**Verdict: holds, and the census split is the finding.** Nine, of two different kinds:

- **Eight rows** in an `### #<n> — <title>` form (`#187`, `#191`, `#193`, `#194`, `#195`, `#197`,
  `#200`, `#208`). Normalised to `### <n>. <title>`, per the register's own stated convention.
- **One heading that is not a row at all** — `### Two more, and how the first grep missed them`,
  a sub-heading belonging to `#193`. Demoted to `####`.

**That ninth one is why A10 has two limbs.** The first limb's predicate only fires on lines already
shaped like a row heading, so it is structurally incapable of seeing a `###` that carries no number
— and after the depth fix in M1, such a heading **terminates the row it sits inside**, silently
truncating that row's body. The first limb reports 8 of 9 and reads as complete. The second limb
asserts that inside `## Detailed items` every `###` is a row, and reports the ninth.

Both limbs were verified red against the state that preceded them: the first against the
pre-repair register (8 findings), the second by re-promoting the demoted heading (1 finding, naming
its line).

**No inbound anchors break.** `grep` for `TECH_DEBT.md#` across `docs/`, `CLAUDE.md`, `README.md`,
`apps/`, `scripts/` and `packages/` returns three links, all to `#closed-numbers`, which is
unchanged. `check:doc-links` is green over 1,272 relative links.

**A10 does not narrow what the parser reads, and that is the load-bearing part.** `sections()` and
`rowNumber` still accept both heading levels and both separators, because ADR-0120 Finding 0 is that
a gate's job is to find every row — a row in the wrong form is still a row, and a reader that skips
it reports green over the gap. Finding stays generous; refusing is this separate strict pass over
what was found.

## F0.4 — the claim/mention escape (M3)

**Condition:** _the escape removes zero live claims — every one of the six claim sites is matched
before and after._

**Verdict: holds.** 19 matches across the four gated documents today; **0** of them sit inside an
inline code span, so the escape costs nothing. Verified in both directions by appending a sentence
to `CLAUDE.md`: bare, `The reconciliation threshold sits at 8 ADRs since the last pass` fails with
`says 8, the repository has 123`; wrapped as `` `8 ADRs` `` it passes. The failure message now names
the escape, so an author meets the remedy at the moment the gate fires.

**The row's own proposed fix was rejected on measurement.** It said to narrow the match "to the shape
a claim takes rather than the shape a mention takes", on the premise that the banner states counts in
one known form. Four of the six live sites are not in a banner: `CLAUDE.md`'s two are inside a fenced
repository-layout tree and `docs/ARCHITECTURE.md`'s two are plain prose. A banner-shaped pattern would
have silently stopped checking them — this gate's own failure mode, introduced by the fix for a
different one. Fences therefore stay in scope and only inline code spans are escaped.

## F0.5 — the advisory posture (M4)

**Condition:** _all `check:*` gates are `node scripts/*.mjs`, and exactly one can exit 2._

**Verdict: holds.** Thirteen `check:*` scripts, all node; `report()` in `scripts/lib/doc-register.mjs`
is the only producer of a 2, and `check-reconcile-due.mjs` its only caller.

The default is **inverted** rather than patched: a non-zero exit blocks unless the gate is named in
`ADVISORY_GATES`. The previous fix marked three gates "never advisory", which covers the three
somebody thought of and leaves the default on the dangerous side for everything else. Inverting makes
the residual risk **harmless instead of closed** — an unanticipated exit 2 now blocks, which is the
safe direction — and `run_strict` retires as a special case rather than being the safe path nobody
remembered to take. Proven by dispatch: `typecheck` exiting 2 FAILs, `check:reconcile-due` exiting 2
WARNs, `check:counts` exiting 2 FAILs.

`check:advisory-agreement` asserts the list against the code both ways, reading `ADVISORY_GATES` out
of `prepush.sh` rather than restating it. Verified red in both directions: a declared gate that
cannot warn, and a capable gate that is not declared.

### The check's first run was a false positive, and it is left recorded

It reported `check:doc-register` as capable of exiting 2, because `doc-register.test.mjs` names
`advisory` eleven times — while **testing** `report()`, capturing its return through a `quiet()`
helper rather than exiting on it. Forcing a failure in that file and reading the code gives **1**.

So a `*.test.mjs` exercises the mechanism as a subject and does not use it as its own exit path, and
the scan excludes those files with the measurement written beside the exclusion. The false positive
is the same class as `#222` itself — a scan matching something that _discusses_ its subject rather
than something that _is_ it — arriving inside the check written about that class, and caught only by
verifying the red rather than believing it.
