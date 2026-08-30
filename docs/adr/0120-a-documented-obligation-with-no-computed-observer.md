# ADR-0120 — A documented obligation with no computed observer

**Status:** Accepted · **Date:** 2026-08-30 · **Supersedes:** nothing · **Amends:** ADR-0058

## Context

Two obligations in this repository were written down, agreed, and unobserved.

**`docs/TECH_DEBT.md` is the artefact that decides what gets picked up next**, and answering "what
is actually still open?" required reading all of it. On 2026-08-30 three candidates were recommended
to the product owner from that file and one — `#109` — had been fixed three weeks earlier, in a
commit whose title names four unrelated ADRs. A sweep then verified seven rows against the code:
**six were fixed and never closed.** Only **14 of 138** rows carried a status a parser could find.

> **That sentence read "12 of 107" until the gate could see the whole file, and the correction is
> this ADR's own subject landing on it.** `check:debt-status` shipped calling `sections(md, 2)` —
> and `docs/TECH_DEBT.md:100-103` states the document's own convention, `### <number>. <title>`,
> **always**, with `##` as drift three rows had picked up. So the gate read _only the drifted rows_:
> 31 numbered rows invisible, 29 of them with no status at all. It survived a red run, a repair and
> an arming because **A9 — the assertion that exists to answer "did we read less than we think?" —
> counted `^## ` too**, so both sides of the comparison shared one blind spot and it agreed with
> itself. The seventh recorded instance in this repository of a check whose subject was not what it
> believed, and the first where the check was the one written to close that class.

**`docs/RECONCILE.md` says its pass runs "at each epic boundary"**, with a three-month hard floor.
The floor works, because a date is a fact a person can check. The trigger did not — and the reason
is not that anybody forgets. The pass table was **unsorted**, and its banner summary contradicted
its own newest row. On the day this ADR was written, a reader auditing that file _specifically for
staleness_ got it wrong on the first attempt: read the table with `tail -8`, noticed line order was
not date order, corrected once, and stopped at the first correction instead of sorting the column.

Both are the same shape. **A rule nothing computes is a rule that decays silently**, and both decayed
in the direction that is hardest to notice: the document keeps reading as authoritative.

## Decision

### D1 — Two gates, one parser

`scripts/lib/doc-register.mjs` is shared by both. **Every match is anchored at column 0**, fenced
blocks are stripped before anything is read, fields are never read from inside backticks, headings
are matched on the heading line alone, and table cells are read **by index**.

That is not fastidiousness. This repository has shipped **six** recorded instances of a scan matching
its own explanatory prose instead of its subject, and the sixth was live in this epic's own subject:
an unanchored `grep` for `**Status:**` in `docs/TECH_DEBT.md` returned 14 where the truth was 13,
because `#219` — the row _asking for_ this gate — quotes the string.

Fence stripping blanks each line rather than removing it, so **line numbers survive**: a finding that
cannot cite `file:line` sends the reader to `grep`, which is what these gates exist to be cheaper
than.

### D2 — Exit 1 blocks, exit 2 warns, and the discriminator is written down

`scripts/prepush.sh` gains a third result state. The rule is:

> **Exit 1 is for an obligation whose remedy is an edit to the file that failed.
> Exit 2 is for one whose remedy is somebody's judgement.**

It is written into the script because the tempting discriminator — _how important is it?_ — has no
stable answer, and would let a future gate return 2 for something that ought to block.

`check:debt-status` blocks: a row without a status is fixed by typing one. `check:reconcile-due`
warns: a missed reconciliation pass is fixed by running a pass and thinking, and blocking a release
on a documentation chore is how a gate gets bypassed with `--no-verify` — after which it is bypassed
always.

**This was a prerequisite, not a preference.** `run()` sends a passing gate's output to a log and
prints nothing, so before this change an advisory `check:*` script was **completely silent**. There
is no design in which Gate B is visible without it.

### D3 — The warning is ignorable, and that is recorded rather than designed away

Escalation-to-failure after N ignored warnings was considered and **refused**: that is a blocking
gate with extra steps, arriving at the same bypass by a longer route.

So the honest statement is that `check:reconcile-due` can be ignored indefinitely, and **that is
exactly how `#220` happened in the first place**. What it buys is that the state is now _visible and
computed_ rather than requiring somebody to read an unsorted table correctly. That is a smaller
claim than "this cannot happen again", and it is the true one.

### D4 — `unverified` is a status, not a guess

The 106 rows without one were marked **`unverified`**, not `open`. Writing `open` on a row nobody has
checked against the code asserts a claim that has not been established — which is precisely the
defect this epic exists to remove, and precisely how the `#109` recommendation happened.
`unverified` is what those rows are. They convert as they are touched, and the count prints on every
run, so a number that stops falling is a finding for the next pass rather than a silence.

ADR-0058's rule is the reason this is not stricter: a gate that fails on day one gets deleted rather
than fixed. Accepting `unverified` is what let the gate be armed at all.

### D5 — Arm after the repair, and keep the red run

Gate A was **report-only** through M2–M3. The red run against the un-repaired register — 118
findings — is committed at `docs/specs/drift-gates/red-run.md`, the repair took it to zero, and only
then was the `package.json` key added. Arming first would have produced a gate failing on day one.

**118 is an undercount, and the file says so rather than being re-run.** Against the same commit
with the fixed parser the register held 138 numbered rows and 14 statuses, so the honest figure is
124 A1 findings. Re-running it now would produce a tidier document and destroy what it is for: it is
the record of what the gate _did_ report on the day it ran, and the gap between that and the truth
is the D5 lesson stated in numbers.

The red state is now gone from the file, so **that committed output is the only record that the gate
ever had anything to find** (ADR-0110 D5).

### D6 — The threshold is derived, and an ADR is a proxy for an epic

**T = 8 ADRs since the last pass**, from the realised counts `[0,1,1,2,3,3,6,7,8,11,12]` (p75 =
7.50). It fires on 3 of 11 intervals and catches both occasions the register records as failures.
A **14-day backstop** is kept and labelled honestly: it has never fired and never would have on this
history; it exists because a quiet period with no ADRs sits below every count threshold.

**An ADR is a proxy for an epic, not the thing** — 120 ADRs against 70 spec directories, about 1.7
per epic — so this counts the wrong noun. That is acceptable only because it is stated.

**The threshold and D2 are not independent, and the spec treated them as if they were.** T = 10
fires on exactly the two intervals somebody complained about, which is tuning to two data points;
T = 8 fires on one more. That extra firing is affordable **because the gate warns**. Had it blocked,
T = 10 would be right.

### D7 — The gate's own input is compared across all three recording sites

`docs/RECONCILE.md:9-13` instructs the owner of a pass to record it in three places — the banner
date, a Passes-run row, and a `docs/DECISIONS.md` entry — "**all three, in the same commit**". That
instruction is prose, and prose is what failed: the banner said `2026-07-28` while the table recorded
`2026-07-31`, so the drift-control document had drifted about its own drift control.

So Gate B parses all three and reports any disagreement, naming the line. The **effective date is the
newest of the three**, deliberately: the failure to avoid is a forgotten update making the pass look
older and firing a warning about work already done, which is precisely how a reader learns to ignore
a gate. Erring towards silence, with the disagreement reported separately, hides nothing either way.

**Its blind spot is stated rather than closed.** The `DECISIONS.md` clause knows only that an entry
carrying that date exists, never that it is about the pass. Matching the word "Reconciliation" in a
heading would be prose-scanning — the failure this whole module is built against — and would be wrong
in both directions, since two of that file's real pass entries do not carry it in a form a regex
could rely on. A same-day entry about something else therefore satisfies it: a knowingly weak check,
not an accidental one.

**The live repository is now consistent, which is why fixtures exist.** A check that cannot be made
to fail by the defect it names is not finished (ADR-0110 D5), and the red case this was specified
against has been repaired, so `scripts/check-reconcile-due.test.mjs` carries it — including a
fixture whose findings column holds a later date than any pass row, because reading a row's text and
taking the first date is exactly how the wrong answer was reached.

### D8 — "It never blocks" is enforced in one place, not by four exits remembering

Gate B's one contractual promise is that it warns and never fails a push. It shipped with four exit
paths and one of them broke that promise: `execFileSync` was called bare, so `git` absent from PATH —
or a checkout that is not a work tree — produced an uncaught exception, exit **1**, reported by
`prepush.sh` as **FAIL**, under a docblock stating that outcome was impossible.

A promise kept by each branch remembering to keep it is not kept. `report()` therefore takes
`advisory: true` and has **no path that returns 1** for such a gate; the git calls return `null`
rather than throwing, and "git could not be read" is reported as its own finding instead of
collapsing into a reassuring `0 ADRs since`. A **shallow clone is refused rather than guessed**:
`--diff-filter=A` dates every file to the boundary commit, so a `fetch-depth: 1` checkout would warn
that the entire register had been filed since the last pass.

The same pass replaced 122 `git log` subprocesses with one `--name-only` walk — **2.9 s to 0.11 s**,
against this gate's own sub-second budget. That budget is not decoration: a pre-push step slow enough
to notice is a step somebody starts skipping, which is the `--no-verify` route D3 already refuses.

## Consequences

- `pnpm prepush` runs 16 steps. Two are new gates; one is the parser's own fixtures.
- `docs/TECH_DEBT.md` is 89 rows, every one with a machine-readable status, and the compact
  one-line format is frozen behind a ratchet in `scripts/debt-register.json`.
- **The ratchet's own history is the argument for it.** It was specified at 66, measured at 42, and
  shipped at 43. 66 conflated the compact table with the 24-row Closed-numbers ledger — a permanent
  record that only grows — so a ratchet of 66 would have permitted 24 new compact rows before ever
  firing: a gate that exists, passes, and protects nothing. Then numbering an orphan row whose
  number cell was prose made it countable, the table went 42 → 43, and **A7 refused the stale value
  in the same commit that changed the count**. The gate caught its own parameter going out of date.
- Eighteen rows claiming closure were deleted and ledgered, which is `docs/TECH_DEBT.md`'s own rule
  in bold at its top. Each ledger entry names where the record now lives, because ADRs are never
  rewritten and cite these numbers long after the row is gone.
- **`#169` was nearly deleted with them.** Its heading said `HALF CLOSED`, and half closed is open.
  It kept its content and was renamed to describe what remains — the register's own instruction for
  a partly-done item.
- Three apparent vocabulary violations were vocabulary words wearing punctuation (`open, narrowed`;
  `open, deferred on a measured trigger`, for which the vocabulary already had `deferred`). The rows
  were made readable rather than the gate widened to accept anything.

**The CPM engine is not imported and no migration runs.** This is repository tooling and
documentation; no product behaviour changes.
