# M0 — The threshold, re-derived against the corrected table

**Run 2026-08-30**, after `docs/RECONCILE.md`'s pass table was sorted and its 2026-08-30 row
corrected. The spec derived its threshold from that table **before** those repairs, so the
derivation had to be re-run rather than inherited.

## Result: the spec's threshold stands. **T = 8 ADRs since the last pass.**

`feature-spec.md` states its own falsification condition: _"if the git-derived p75 differs from 7.75
by more than 1, the threshold changes and this section is corrected in place."_

| series          | n   | sorted                      | p75      |
| --------------- | --- | --------------------------- | -------- |
| spec's          | 10  | `[0,2,2,2,2,7,7,8,11,12]`   | **7.75** |
| re-derived here | 11  | `[0,1,1,2,3,3,6,7,8,11,12]` | **7.50** |

**Difference 0.25. The condition does not fire.** The two series differ only in interval _bracketing_
— the spec treated 08-25 → 08-30 as one interval (which is how the 08-30 row counted it before that
row was corrected), where the corrected table has a pass at 08-28 splitting it, and this run also
counts the zero-day interval between the two 2026-08-09 passes. Neither changes the shape.

Verified against the acceptance test rather than the percentile alone:

| candidate | fires on      | rate             | catches both recorded failures (11 and 12)? |
| --------- | ------------- | ---------------- | ------------------------------------------- |
| T = 7     | 8, 12, 7, 11  | 4 / 11 (36%)     | yes                                         |
| **T = 8** | **8, 12, 11** | **3 / 11 (27%)** | **yes**                                     |
| T = 10    | 12, 11        | 2 / 11 (18%)     | yes, and nothing else                       |

**T = 8 is kept.** T = 10 fires on exactly the two intervals somebody complained about, which is
tuning to two data points and would leave a nine-ADR gap silent. The one extra firing T = 8 buys is
affordable **because this gate warns and never blocks** — if it blocked a release an eager threshold
would be harmful and T = 10 would be right. That coupling between threshold and enforcement is worth
stating: they are not independent choices.

---

## This document's first version was wrong, and the error is worth keeping

It claimed the spec had derived a threshold in **days**, that the real day-intervals are
`[4,5,0,4,4,1,1,1,5,3,2]` with a maximum of 5, that **T = 8 days would therefore never fire**, and
that the spec had picked the wrong noun.

**Every part of that is false.** The spec's series is ADRs per interval, labelled as such one line
above the numbers I read. I computed a genuine day-interval series, saw `11` and `12` in the spec's
series, assumed they were the same unit as mine, and concluded the spec was measuring days. It was
not. **I did not read the label.**

Two things follow that are worth more than the correction:

1. **The failure mode was confirmation, not arithmetic.** Both numbers were right. The day series is
   real and the ADR series is real; I put them side by side and asserted a contradiction that only
   existed in my reading. Recomputing did not help, because I recomputed the thing I had already
   decided was the subject.
2. **The spec anticipated exactly this and told me what to do.** It committed a falsification
   condition with a number, a tolerance and an instruction — and applying it _as written_ is what
   produced the right answer in one command. Had I trusted my own reading instead of running its
   test, this epic would have shipped a threshold re-derived away from a correct one.

The day-interval figures are kept below because they are true and useful, just not the threshold:

```
2026-07-31 → 08-04 → 08-09 → 08-09 → 08-13 → 08-17 → 08-18 → 08-19 → 08-20 → 08-25 → 08-28 → 08-30
       4       5       0       4       4       1       1       1       5       3       2
```

**Median 3 days, maximum 5 — the cadence is healthy.** Both occasions the register calls failures
(11 ADRs before the 08-25 pass, 12 before the 08-09 one) are _five-day gaps in dense periods_, not
slow ones. That is a real finding and it independently supports the spec's choice of noun: a
day-based trigger genuinely could not catch either, which is precisely why the spec did not build
one.

---

## One correction the spec does need

`feature-spec.md:666-669` offers "two independent corroborations that the extraction is right": that
08-20 → 08-25 computes to 11 and matches that pass's own "eleven epics", and that 08-25 → 08-30
computes to 9 and matches the 08-30 row's "nine epics".

**The second corroboration is against a false number.** The 08-30 row's "nine epics" was my own
error, corrected the same day — there was a pass on 08-28, so that span is two intervals of 6 and 3,
not one of 9. The first corroboration is sound and the extraction is fine; but the spec now claims
two independent checks where it has one, and the missing one was validating against a claim this
epic exists to have caught.

---

## The falsification condition for the gate itself, committed before it is written

> **The gate is WRONG and must be re-derived if**, run against the eleven historical pass intervals,
> it does not fire at **both** the 12-ADR and 11-ADR intervals — the two the register itself records
> as failures — **or** if it fires on more than **4** of the 11, which would make it noise.
>
> **The measurement is VOID and re-run if** the pass table is unsorted (it was until 2026-08-30, and
> that is how the spec's input came to be bracketed differently), or if ADR dates come from the
> documents' own `**Date:**` fields rather than `git log --diff-filter=A` — ADR-0070 and ADR-0093
> have no `Date` line at all.

**The 14-day backstop is kept** and honestly labelled: it has never fired and never would have on
this history. It is insurance against ADRs ceasing to be the unit, since a period with no ADRs sits
below every count threshold and would otherwise leave the trigger permanently silent.
