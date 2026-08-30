# ADR-0120 — A documented obligation with no computed observer

**Status:** Accepted · **Date:** 2026-08-30 · **Supersedes:** nothing · **Amends:** ADR-0058

## Context

Two obligations in this repository were written down, agreed, and unobserved.

**`docs/TECH_DEBT.md` is the artefact that decides what gets picked up next**, and answering "what
is actually still open?" required reading all of it. On 2026-08-30 three candidates were recommended
to the product owner from that file and one — `#109` — had been fixed three weeks earlier, in a
commit whose title names four unrelated ADRs. A sweep then verified seven rows against the code:
**six were fixed and never closed.** Only 12 of 107 rows carried a status a parser could find.

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

The 78 rows without one were marked **`unverified`**, not `open`. Writing `open` on a row nobody has
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

The red state is now gone from the file, so **that committed output is the only record that the gate
ever had anything to find** (ADR-0110 D5).

### D6 — The threshold is derived, and an ADR is a proxy for an epic

**T = 8 ADRs since the last pass**, from the realised counts `[0,1,1,2,3,3,6,7,8,11,12]` (p75 =
7.50). It fires on 3 of 11 intervals and catches both occasions the register records as failures.
A **14-day backstop** is kept and labelled honestly: it has never fired and never would have on this
history; it exists because a quiet period with no ADRs sits below every count threshold.

**An ADR is a proxy for an epic, not the thing** — 119 ADRs against 70 spec directories, about 1.7
per epic — so this counts the wrong noun. That is acceptable only because it is stated.

**The threshold and D2 are not independent, and the spec treated them as if they were.** T = 10
fires on exactly the two intervals somebody complained about, which is tuning to two data points;
T = 8 fires on one more. That extra firing is affordable **because the gate warns**. Had it blocked,
T = 10 would be right.

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
