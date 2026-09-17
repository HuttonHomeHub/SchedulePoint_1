# Page composition — M2 measurement

**Status:** Complete
**Taken:** 2026-09-17
**Baseline:** `m0/column-fit-*.json`. **After:** `m2/column-fit-*.json`, same fixture.

---

## FC-2 — nothing wraps beside unused width

| Width | M0                      | M2                                                       |
| ----- | ----------------------- | -------------------------------------------------------- |
| 1646  | **11 wrapping columns** | **0**                                                    |
| 1280  | 11                      | **3**, all on the audit log, all now **declared `auto`** |

At 1646 every wrap is gone. At 1280 the audit log's table genuinely needs ~1136px in a ~955px
region, so something must wrap — and the three that do are prose (`Event`, `Subject`) and an email
address (`By`), which are the right things to break. `When` was the fourth and is now `fit`: a
timestamp is bounded, and a date broken over two lines reads as two dates.

**Those three carry `width: 'auto'` explicitly, which changes no CSS and is not decoration.** FC-2's
bar is "no cell wraps except in a column declared `auto`", and `auto` is also the default — so the
rule is vacuous unless the exception is written down. Now it is a decision somebody made.

## FC-6 — reflow at 320px: **PASS, unchanged**

Every in-scope screen still overflows by **0px**. This was the milestone's real risk: M0 measured a
table whose columns are all `fit` rendering **793px inside a 320px container**, because
`white-space: nowrap` has no fallback. `fit` is therefore applied from `md:` upwards only, and the
measurement confirms the guard holds.

---

## M2-T2a — the staff console conversion is WITHDRAWN, on its own premise

The task was to move the staff console's nine caps onto the column model, pixel-unchanged, so that
no table is left "on the retired mechanism".

**The mechanism is not retired, and that is the whole premise.** `Column.width` composes with
`cellClassName` rather than replacing it, so the class override still exists, still works, and is
still the right tool for a width chosen deliberately against a measured layout. That is exactly what
the console's nine caps are: ADR-0143 measured them against a 1438px table six weeks ago, the
console was already at the wide measure so this epic does not move it, and two of the nine
(`md:w-96`, `md:w-80`) sit on `break-all` address columns where a `fit` conversion — which adds
`whitespace-nowrap` — would fight the wrapping those columns require.

So the conversion buys nothing and risks a screen that is correct today. Withdrawn rather than
deferred: there is no work owed here, and the reason is a fact about the design rather than a lack
of time. If the class override is ever genuinely retired, this becomes work again.

---

## What the work itself corrected

**`docs/TECH_DEBT.md` #335 is reached without the change it proposes.** That row asks that a caller
be able to declare a width without restating padding, and proposes merging `headClassName` /
`cellClassName` into the default with `cn` instead of replacing it with `??`. ADR-0145 M4 declined
that because **seven overrides omit `py-2` deliberately**, and the plan required this epic to re-take
the decision rather than inherit it. Re-taken: composing the **width alone** reaches the row's goal
at no blast radius, so the risky merge buys nothing this needs. The row is narrowed rather than
closed.

**`ResourcesTable`'s call-site comment is corrected, not deleted.** Its 20-line block explained the
fixed caps, including a paragraph on why a width must go on `cellClassName` rather than
`headClassName` — true of the `??` mechanism and false of `width`, which composes with both. The
half that still stands (constrain what sits _before_ the last fact; capping the last fact column
made two tables worse) is kept, because that is the part a future reader would otherwise rediscover
by breaking it.

**The nesting test was rewritten, and the plan said not to.** M2-T3's risk note said the assertion
that nesting is conveyed in text "must pass unchanged, not be rewritten" — the right instinct, and
unhonourable literally: it demanded a `columnheader` named `Group`, and that column was removed
because it printed "—" on every row. It asserted the **carrier**, not the invariant. The rewrite
asserts the invariant with the carrier unnamed, is **stronger** than what it replaces (the old
version passed if the parent name appeared anywhere in the column; this one requires the nested row
itself to say which group it is in), and was **verified red** with the secondary line removed —
which is what proves the carrier moved rather than went.
