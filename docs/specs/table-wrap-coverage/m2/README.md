# M2 — seven candidates measured, one recommended, and two of my own numbers withdrawn

**Taken:** 2026-09-19, **one sitting**, tenant `composition-co-1789837073773`, one pair of dev
servers left running throughout. Each candidate was applied to the running tree, measured, and
reverted with `git checkout` — `unrendered-row-facts/m3`'s procedure, for the reason
`falsification.md` FC-4 gives: `page-composition/m7-measurement.md` records this page family
drifting **555px with no product change at all**, so readings taken on different days are not
comparable and readings taken minutes apart are.

**Tree:** the working tree at `2cc37fdf` (M1) plus the `ONLY=` filter this milestone adds to
`measure-column-fit.mjs`, stated explicitly because `run.sha` records `HEAD`, which is not
necessarily the tree that was served.

**No product change ships from this milestone.** The candidate patches are recorded as
`apply-candidate.py` so the sitting is reproducible; the working tree is clean of all seven.

**Recommendation: C2c** — fold both `Sent` and `Status` under the address. It is the only candidate
with **zero wrapped cells at all three widths**, it is the only one that also removes the 1280px
card overflow M0 §4 found, and it is ADR-0146 D4's own rule (_a fact about a row belongs under that
row_) applied one screen along from what `#343` did to Clients. §6 states what it costs.

---

## 1. What was measured, and what this sitting cannot judge

| Reading                           | Instrument                                 | Artefact             |
| --------------------------------- | ------------------------------------------ | -------------------- |
| Wraps + slack, 8 × 3 widths       | `measure-column-fit.mjs`, `ONLY=members`   | `widths.json`        |
| This sitting's baseline, 3 widths | `measure-column-fit.mjs`, `ONLY=members`   | `baseline-cf-*.json` |
| FC-5 clause 2 (C1's real cost)    | `measure-grid-tracks.mjs`, all 3 consumers | `c1-tracks-*.json`   |
| FC-5 clause 1 (no screen narrows) | `measure-page-drift.mjs` @1646             | `drift-1646-*.json`  |
| FC-6 (320px reflow), 8 runs       | a throwaway probe, §5                      | `reflow-320.jsonl`   |
| The two strongest, photographed   | Chromium, 1646 and 1280                    | `members-*.png`      |

**Every width run in this sitting used `ONLY=members`, which weakens the control — and that is why
M2 recommends rather than judges.** The filter's own docblock says a restricted run is evidence
about the screens it names and about nothing else, because the width-keyed wrap control
(`audit-log` at 1280) is not in the set, so those runs carry **no pinned positive wrap case**.
Twenty-one runs across the full ten-screen roster to compare one table was not affordable; one run
of it is, and **FC-4's verdict on the chosen remedy is taken in M3 from a full run**. What makes
this sitting's numbers usable in the meantime is that the _baseline_ rows wrap three columns at
every width, so no run in the sweep reported zero wraps without something to compare against.

`EXPECT_KNOWN_WRAPS=0` was not used anywhere.

---

## 2. This sitting's baseline is NOT M0's, and the headline number hides it

| Column    | M0 (`shoot-co-1789834496636`) | This sitting | Δ       |
| --------- | ----------------------------- | ------------ | ------- |
| `Email`   | 245                           | **270**      | **+25** |
| `Role`    | 88                            | **65**       | **−23** |
| `Sent`    | 147                           | 147          | 0       |
| `Status`  | 197                           | 197          | 0       |
| `Actions` | 71                            | 71           | 0       |
| **Total** | **748**                       | **750**      | **+2**  |

**`naturalTotal` moved by 2px while two of its five terms moved by ~25px each in opposite
directions.** A reader comparing only the headline would conclude the two fixtures are equivalent
and they are not: M1's fixture seeds its own invitation (`invited-…@example.com`, longer than M0's
invitee address, `Planner` rather than M0's role), so **`Email` wraps in this sitting and did not in
M0's**. This baseline is therefore strictly _harsher_ than M0's — three wrapping columns against
two — which is the right direction for a candidate comparison and the wrong direction for quoting
one sitting's absolute figure as the other's.

The rendered table width also differs at 1280 only: **519 (M0) against 473 (here)**, 1646 and 1920
identical at 599/682. At 1280 the table exceeds its 466px track and renders at its min-content
width, which is a function of the seeded row; the 46px is **not attributed** and nothing in this
milestone depends on it.

One consequence for the register: **`#344`'s "overflows its own card by 103px" is that sitting's
number, not a constant.** Here it is 473 against 416 — **57px**. The failure mode is real at both.

---

## 3. The candidate matrix

Table 1 on `/orgs/:slug/members` (Pending invitations). `slack` = rendered table width −
`naturalTotal`; a wrapped column's figure in brackets is how many pixels short it is.

| Cand.                 | `natural` | table 1280 / 1646 / 1920 | wraps @1280                    | @1646                         | @1920                         | FC-4              |
| --------------------- | --------- | ------------------------ | ------------------------------ | ----------------------------- | ----------------------------- | ----------------- |
| **baseline**          | 750       | 473 / 599 / 682          | Email(48) Sent(93) Status(135) | Email(26) Sent(51) Status(74) | Email(12) Sent(23) Status(33) | —                 |
| **C0** `fit`          | 750       | **748 / 748 / 748**      | none                           | none                          | none                          | **FAIL**          |
| **C1** grid           | 750       | 509 / 728 / 828          | Email(42) Sent(81) Status(117) | Email(3) Sent(7) Status(10)   | none                          | **FAIL**          |
| **C2a** fold `Sent`   | 603       | 420 / 599 / 682          | Email(48) Status(135)          | Email(1) Status(3)            | none                          | **FAIL**          |
| **C2b** fold `Status` | 553       | 416 / 599 / 682          | Email(46) Sent(90)             | none                          | none                          | **FAIL**          |
| **C2c** fold both     | **454**   | 416 / 599 / 682          | **none**                       | **none**                      | **none**                      | **PASS**          |
| **C3** `span="wide"`  | 750       | 905 / 1271 / 1438        | none                           | none                          | none                          | PASS (arithmetic) |
| **C4** shorter text   | 586       | 465 / 599 / 682          | Email(48) Sent(20) Status(53)  | none                          | none                          | **FAIL**          |

Raw rows, with per-column `used`/`natural`/`wrapped`, are in `widths.json`.

**C0 does not wrap and still fails, which is the control behaving exactly as FC-4 predicted.** Its
five columns render 748px inside a track of 466 / 649 / 732, so it converts three wrapped columns
into **282 / 99 / 66px of horizontal scroll** at the three widths — "a scrollbar, not a fit". A
candidate set whose control cannot fail is not a comparison, and this one failed.

**C1 is worse than predicted, and it is the only candidate whose predicted verdict was wrong in the
direction that matters.** `falsification.md` said FAIL at 1280; it fails at 1280 **and 1646**, the
latter by 22px — which the arithmetic in §4 explains exactly.

---

## 4. C1 is withdrawn twice over: FC-4 **and** FC-5 clause 2

The reading FC-5 clause 2 was written for — _what does a `PageGrid` track actually give its
occupants, and what does an asymmetric split take from the other two consumers?_ — had never been
taken. `measure-grid-tracks.mjs` under `md:grid-cols-[3fr_2fr]`:

| Width | narrow track, today | under C1 | Δ to the **other** narrow occupants |
| ----- | ------------------- | -------- | ----------------------------------- |
| 1280  | 466                 | 372      | **−94**                             |
| 1646  | 649                 | 519      | **−130**                            |
| 1920  | 732                 | 586      | **−146**                            |

The invitations section gains exactly what its neighbour loses (+93 / +129 / +146), and the
neighbours are not only Members' `What each role can do`. `PageGrid` is a shared archetype, so the
**organisation landing** — the screen every sign-in lands on, which ADR-0144 built three weeks
ago — loses the same width on `Needs your attention` and `Recently changed`:

```
org-home @1646   baseline tracks [649, 649]   →   C1 tracks [778, 519]
```

**FC-5 clause 2's withdrawal clause fires on that alone, regardless of the FC-4 score**, which is
the separation the plan's M2-T1 step 3 demanded. And the FC-4 score does not rescue it: +129px at
1646 takes the table from 599 to **728 against a `naturalTotal` of 750** — still 22px short, still
three wrapped columns. C1 buys width from a screen nobody in this epic is looking at and **still
does not fit**.

**What was NOT measured, stated rather than implied:** the staff console's tracks are absent from
`c1-tracks-*.json`, because `/staff` requires a staff identity this tenant's user does not hold, so
the harness recorded nothing for it. That reading would have been needed to _clear_ C1. It was not
needed to condemn it, because the reading that condemns it was taken on a screen the harness could
reach.

---

## 5. FC-6 (320px reflow), and the condition's own stale sentence

| Cand.    | document overflow @320 | invitations scroll region | table   |
| -------- | ---------------------- | ------------------------- | ------- |
| baseline | **0**                  | 251                       | 473     |
| C0       | **0**                  | 251                       | 473     |
| C1       | **0**                  | 251                       | 473     |
| C2a      | **0**                  | 198                       | 420     |
| C2b      | **0**                  | 189                       | 411     |
| C2c      | **0**                  | **135**                   | **357** |
| C3       | **0**                  | 251                       | 473     |
| C4       | **0**                  | 243                       | 465     |

FC-6's bar is `documentElement.scrollWidth <= clientWidth`, and **no candidate breaches it**. The
region column is reported beside it because a table inside `DataTable`'s scroll region can overflow
without the document overflowing, and a document-level reading alone would report that as a pass.
C2c reduces the region's own scroll by 116px; C1 and C3 change nothing at 320, correctly, because
below `md` the grid is one column and both are `md:`-gated.

**FC-6's own text about C0 is wrong, and the code says why.** It reads: _"M0 measured an all-`fit`
table rendering **793px inside a 320px container** … Candidate C0 is that failure by
construction."_ C0 measures **473px, identical to baseline** — because `WIDTH_CLASSES.fit` is
`md:w-px md:whitespace-nowrap`, and `data-table.tsx:40-56` records that the `md:` prefix was put
there **for exactly that 793px measurement**. The number is real and historical; the sentence cites
it as if the fix had not happened, in a document written for this epic four days after ADR-0146
landed it. `docs/RECONCILE.md`'s rule is _verify the claim_, and a falsification condition is a
claim like any other. Corrected in place in `falsification.md` rather than deleted.

---

## 6. Why C2c, and what it costs

**It is the only candidate that fits.** C2a and C2b each remove one column and each still wrap at
1280; C2a still wraps at 1646 by 1 and 3px. C3 fits by taking the whole row and §7 says what that
does. C0, C1 and C4 fail outright.

**It is the only candidate that also removes the second failure mode.** `#344`'s 1280px card
overflow needs the table's **min-content** reduced, which only a fold does: 473 → **416**, inside
the 416px available. The photographs are the clearest statement of it —
`members-1280-baseline.png` shows the address broken mid-token, `Sent`'s date over **four** lines
and `Expires`'s over **five** (its leading word costs it one), and **`Revoke` clipped out of sight
at the card edge**; `members-1280-C2c.png` shows one
address on one line, the two facts stacked beneath it whole, and `Revoke` on screen.

**FC-5 clause 1 passes and is largely structural.** Every screen's frame width is byte-identical
across baseline, C2c and C3 (`drift-1646-*.json`): `1369` on nine screens, `1536` on My activity,
`672` on the declared Account exception. C2c changes one component rendered on one screen, and a
screen's content width is set by `PageContainer` rather than by a table, so it could not have
fallen; the reading is taken anyway because "could not have" is the kind of claim this register
keeps finding to be false.

**`InvitationsSection` has exactly one consumer** (`apps/web/src/routes/members.tsx:55`), so FC-5
is structurally satisfied for C2c: there is no second screen for the fold to reach.

**US-1's third criterion — a fact may be moved, not dropped — is met, and the fold carries label
words because of it.** Both facts stay in the same `<tr>`, in the same `<td>`, as text. What the
fold _does_ remove is the column header that labelled them, so the folded line spells `Sent …` and
`Expires …` inline. That is not decoration; without it the row would show two bare timestamps.

**What it costs, plainly:**

- **The row is two lines tall** at every width, where the unwrapped ideal is one. That is the trade
  the withdrawal clause sanctions, and the alternative is a wrap inside a date.
- **At 1280 the two folded facts stack onto two lines of their own** (`members-1280-C2c.png`), so
  the row is three lines there. Each fact stays whole; the break is _between_ facts, which is what
  `flex-wrap` on the folded line buys and is the same distinction ADR-0146 D3 draws between a
  legitimate wrap and a broken value.
- **The probe reports `wrapped: 0` for that state, and it is right to** — its height test
  explicitly ignores cells whose height comes from stacked siblings — but the number alone would
  not have told anybody the row grew a line. The photograph did.
- **`Email` at 1280 is 280px against a `natural` of 318**, i.e. 38px short, and nothing wraps. That
  pair of facts is only consistent because of the point above; do not read `slack: −38` here as
  equivalent to the baseline's `slack: −277`.
- **The `Expired` branch is unphotographed.** The seeded invitation is live, so every reading here
  exercises the `Expires …` branch and none exercises the `Badge`. M3 covers it with a unit case.

**One question M3 has to answer rather than inherit:** the `Email` header now labels a cell holding
three facts. Leaving it as `Email` is the proposal — the address is the row's subject and the
folded facts carry their own words — but it is a decision, not a consequence.

---

## 7. C3 fits and is still refused, with the number

`falsification.md` predicted **"PASS on arithmetic, fails on composition"** and both halves hold.
Arithmetically it is the most comfortable candidate in the set: 750 against 905 / 1271 / 1438, zero
wraps, 155 / 521 / 688px of slack. The composition is the problem, and it is measurable rather than
aesthetic:

| Reading @1646                    | baseline | C3            |
| -------------------------------- | -------- | ------------- |
| `factSpread` (first fact → last) | 404      | **817**       |
| `Status` column width / content  | 123 / 99 | **334 / 181** |
| last fact's x                    | 730      | **1143**      |

**817px between a row's first fact and its last** is the defect ADR-0145 M4-T2's column caps were
built to remove and ADR-0098 records by name — a fact at one end of a row and its companion most of
a screen away. C3 trades a wrap for it. The columns are undeclared, so the browser distributes 521px
of slack across five short values and there is nothing to stop it.

`members-1646-C3.png` shows the second cost the probe cannot report: with the section spanning both
columns, `What each role can do` is pushed onto a row of its own and sits in the narrow left track
with **an empty right half beside it** — the ragged column this epic's parent work exists to reduce.

C3 is therefore refused on evidence rather than on precedent, which is ADR-0142 D4's rule.

---

## 8. Predictions against measurement — including two of my own readings withdrawn

### 8.1 The committed predictions

| Candidate | Predicted `natural` | Measured      | Predicted verdict                        | Measured verdict                        |
| --------- | ------------------- | ------------- | ---------------------------------------- | --------------------------------------- |
| C0        | 748 (min-content)   | 750           | FAIL — a scrollbar, not a fit            | **exactly that**                        |
| C1        | 748 unchanged       | 750 unchanged | FAIL at 1280                             | **FAIL at 1280 and 1646** — understated |
| C2a       | 601                 | **603**       | FAIL                                     | FAIL                                    |
| C2b       | 551                 | **553**       | FAIL at 1280                             | FAIL at 1280                            |
| C2c       | 404                 | **454**       | PASS                                     | PASS                                    |
| C3        | 748                 | 750           | PASS on arithmetic, fails on composition | **exactly that**                        |
| C4        | ≈634                | **586**       | FAIL alone                               | **FAIL at 1280 only**                   |

**Every predicted verdict held. One was understated (C1) and one was over-stated (C4, which is
clean at 1646 and 1920, not only at 1920).**

**C2a and C2b were arithmetically exact and the 2px is the fixture, not the model**: both were
derived as `748 − <removed column's natural>`, and the measured values are `750 − <same>`. The
discrepancy is entirely §2's two-pixel baseline difference.

**C2c's 50px miss is a modelling error and is the transferable one.** The prediction treated a fold
as subtraction — remove two columns, subtract their widths. It is not: a fold also **widens the cell
it folds into**. `Email`'s `natural` goes 270 → **318**, because `Sent 19 Sept 2026, 16:57 Expires
26 Sept 2026, 16:57` on one line is wider than the address. C2a shows the boundary exactly — folding
`Sent` **alone** leaves `Email` at 270, because that one line is narrower than the address, so a
single fold really is free and a double fold is not. **The rule is: a fold's saving is the removed
column's `natural` minus the increase in the host cell's max-content, and that second term is zero
only until the folded line becomes the widest thing in the cell.**

### 8.2 Two of my own readings did not reproduce, and are withdrawn

A first pass over the candidates was taken earlier in the same sitting with a shorter settle after
each edit. Re-running the whole sweep with a 6-second settle, and capturing each column's resolved
`widthClass` so a stale read is detectable, produced **two different answers**:

| Candidate | First pass                         | Re-run (recorded above)                               |
| --------- | ---------------------------------- | ----------------------------------------------------- |
| C0        | table **700**, `Email` wraps       | table **748**, **zero wraps**, `cls: md:w-px` present |
| C2c       | `natural` **406**                  | `natural` **454**                                     |
| C4        | `natural` **660**, wraps 1280+1646 | `natural` **586**, wraps **1280 only**                |

The re-run is the record; the first-pass figures are withdrawn. **Neither withdrawal changes a
verdict**, which is luck rather than design — C0's re-reading is a _better_ fit than the stale one
and still fails, for a different reason than the stale number suggested.

**The cause is not established.** The likely explanation is that the dev server had not finished
applying the edit when the page was measured, which the `widthClass` capture now makes detectable;
the 320px sweep, run twice with both settles, reproduced **to the pixel every time**, so whatever
happened did not affect it. What is certain is the general form: **a measurement taken after an edit
is a measurement of whatever the server was serving, and nothing in the first pass could tell those
apart.** The re-run's shape check (§8.3) exists for the same reason.

### 8.3 The label reconstruction is checked, not assumed

The sweep's invocation lost its label environment variables — `C=$c W=$w` after a redirect are
arguments, not assignments — so `widths.json`'s `candidate` and `viewport` are reconstructed from
the sweep order. They are then **verified against a column shape only that candidate can produce**
(`C2a` has no `Sent`, `C2b` no `Status`, `C2c` three columns, `C0` a non-null `widthClass`, `C3` a
table ≥ 905, `C4` a `Sent` whose `natural` is 65), and the file is written only if all 24 rows pass.
A reconstructed label written into an artefact that reads like raw output is how a future reader
inherits a guess; a checked one is not.

---

## 9. What M3 inherits

1. **Build C2c.** `apply-candidate.py`'s `C2c` branch is the shape that was measured, not the shape
   to ship — it has no tests, no `Expired`-branch coverage and no decision about the `Email` header.
2. **Take FC-4's verdict from a FULL run**, not `ONLY=members` (§1).
3. **Re-measure the 1280 card overflow** and record it closed with a number.
4. **Cover the `Expired` branch**, which no reading in this sitting exercised.
5. `falsification.md` FC-6's C0 sentence is corrected in this milestone (§5); FC-4's prediction
   table is left as written, with §8 as its verdict, because a prediction edited after the fact is
   not a prediction.
