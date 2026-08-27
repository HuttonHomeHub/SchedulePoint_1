# M0 — the measurement, before anything is designed

**Date:** 2026-08-27 · **Against:** `web-v0.108.2` · **Harnesses:**
`apps/web/measure-toolbar/m0-foot-deck-menus.spec.ts`, `apps/web/measure-toolbar/m0-whatif.spec.ts`,
`apps/web/measure-toolbar/diag-popovers.spec.ts` · **Raw:** `apps/web/measure-output/*.json`

The product owner sent three screenshots of the plan workspace and eight observations. Three were
defects and shipped in `web-v0.108.2`. These are the other five, and all five are questions about
layout rather than reports of breakage.

**Why they were measured before being specified.** Six consecutive epics on this surface —
ADR-0090 D3, ADR-0091 D4, ADR-0092 M5, ADR-0093, ADR-0113 and ADR-0114 M2 — had their width
expectation contradicted by their own measurement, and ADR-0090's first recorded consequence is
that it was wrong three times for having been drafted without a shell. Everything below comes from
a real Chromium driving the real sign-up → client → project → plan journey against a real API with
the pen enforced.

Viewports: **1920×1080** (the 24" monitor at 100%), **1646×1097** (the Surface Pro at 175% — the
product owner's own screen, and the width ADR-0091's retrospective established two epics had never
used), **1440×900**.

---

## 0. The finding nobody asked about, and it outranks all five

**Selecting a single activity makes the foot row wrap, and the diagram pays for it.**

| viewport | foot row at rest | with ONE activity selected | canvas height | **lost** |
| -------- | ---------------- | -------------------------- | ------------- | -------- |
| 1920     | 41 px            | 41 px (1 line)             | 776 → 776     | **0**    |
| **1646** | 41 px            | **77 px** (2 lines)        | 793 → **757** | **−36**  |
| 1440     | 41 px            | **117 px** (3 lines)       | 560 → **484** | **−76**  |

The object bar needs **1037.4 px** (ten items totalling 965.4 px plus nine 8 px gaps). It is given
1049.6 px at 1920, **775.6 px at 1646** and 569.6 px at 1440. So it fits on one line only on the
widest screen measured.

This is ADR-0114 M1's own consequence, one step further than that ADR followed it. M1 changed the
bar from `shrink-0` to `min-w-0` because `shrink-0` takes `max-content` and never asks its line to
break, so four controls were being clipped and were pointer-unreachable. The fix was right and it
traded a hidden-controls defect for a shrinking-diagram one. ADR-0114 records losing ADR-0092's
0 px dock guarantee in the abstract; **nobody measured what it costs on the product owner's screen.**

**Two items are 31% of the bar**, and one of them is shaded in the state measured:

| item                     | width     | state in this reading |
| ------------------------ | --------- | --------------------- |
| `zoom-to-selection`      | **152.2** | enabled               |
| `clear-visual-placement` | **146.0** | **disabled**          |
| `resources`              | 104.7     | enabled               |
| `duplicate`              | 99.3      | enabled               |
| `progress`               | 94.1      | enabled               |
| `delete`                 | 79.9      | enabled               |
| `isolate-logic`          | 79.0      | enabled               |
| `notes`                  | 75.6      | enabled               |
| `open-logic`             | 71.3      | enabled               |
| `edit`                   | 63.3      | enabled               |
| **sum**                  | **965.4** |                       |

Shortfall at 1646 is **261.8 px**. Withdrawing the shaded `clear-visual-placement` recovers 154 px
(item + gap); making `zoom-to-selection` icon-only recovers a further ~116 px. Together, **270 px —
which closes it.** Narrowing the facts instead would need them to reach **219.6 px**, and §3 shows
that is not reachable by trimming copy.

---

## 1. "Should the bottom toolbar be the same colour as the others?"

**The product owner is right, and it is stronger than a colour difference: the foot row has no
surface at all.**

| property      | chrome band (header + deck)                   | foot row                     |
| ------------- | --------------------------------------------- | ---------------------------- |
| surface scope | `chrome`                                      | **`(page)` — none**          |
| background    | `oklch(0.252 0.056 264)`                      | **`rgba(0, 0, 0, 0)`**       |
| foreground    | `oklch(0.985 0 0)`                            | `oklch(0.321 0 0)`           |
| top border    | `1px solid oklch(1 0 0 / .14)`                | `1px solid oklch(0.907 0 0)` |
| bottom border | **`3px solid oklch(0.786 0.167 70)`** (amber) | `0px`                        |
| radius        | `10px`                                        | **`0px`**                    |

`ChromeBandRow` is a `<Surface tone="chrome">` card. The foot row is a bare
`flex min-h-9 shrink-0 items-center gap-2 border-t px-4` inheriting the page. They are not two
shades of one treatment; one is a card and the other is a hairline.

**Constant at all three widths.** The chrome band is 181 px tall at 1920 and 1646 and **217 px at
1440**, the extra 36 px being the header row wrapping below ADR-0112 D4's 1480 px threshold.

---

## 2. "Would the toolbar be better on the left and the activity summary on the right?"

**Measured, swapping the two would not make anything move — and ADR-0114's stated reason for the
present order is false as implemented.**

| child  | width (1920) | `flex-grow` | `flex-shrink` | `flex-basis` | `min-width` |
| ------ | ------------ | ----------- | ------------- | ------------ | ----------- |
| facts  | 481.4        | 0           | **0**         | `auto`       | `auto`      |
| dock   | 1049.6       | **1**       | 1             | **`0%`**     | `0px`       |
| toggle | 40           | 0           | 1             | `auto`       | `auto`      |

ADR-0114 chose facts-leading on the ground that _"putting the dock first would make the facts slide
sideways every time a selection appeared — the same juggle one axis over"_. The dock is
`flex-1 basis-0%`, so **its width does not depend on its content**: it claims all free space whether
it holds ten controls or none. The facts are `shrink-0` with `basis:auto`, so their width is
constant. At either end, the facts would sit still.

The order is therefore a free choice on today's box model, and the decision should be argued from
reading order rather than from a movement that does not occur. **This is an ADR-0076 Class 3 claim
in a document written three days ago and it is corrected here rather than repeated.**

---

## 3. "Could the activities be two lines, keeping the same height of the toolbar?"

**No — and this contradicts my own prediction, not the product owner's.**

The facts are **481.4 px** across eight text leaves, every one at **12 px/16 px**:

| leaf                        | width     |
| --------------------------- | --------- |
| `Activities` + count        | 56.7      |
| `Data date` + `05 Jan 2026` | 120.2     |
| `Finish` + `28 Jan 2026`    | 100.4     |
| `1 critical activity`       | 104.0     |
| `You're editing this plan.` | **125.9** |

I predicted two lines would cost nothing, because two lines of 16 px line-height is 32 px and the
row's height floor is the 40 px collapse button. **Measured, a wrapped facts row is 64 px**, because
the row is `gap-4` — 24 + 16 row-gap + 24 — which clears the button's floor and grows the row:

| viewport | at rest, 1 line | at rest, wrapped to 2 lines | canvas              |
| -------- | --------------- | --------------------------- | ------------------- |
| 1920     | foot 41         | foot **65**                 | 776 → **752 (−24)** |
| 1646     | foot 41         | foot **65**                 | 793 → **769 (−24)** |
| 1440     | foot 41         | foot **65**                 | 560 → **536 (−24)** |

With an activity selected it is not uniform, because the width the wrap frees goes to the dock:

| viewport | selected, 1-line facts | selected, wrapped facts | canvas              |
| -------- | ---------------------- | ----------------------- | ------------------- |
| 1920     | foot 41                | foot **65**             | 776 → 752 (−24)     |
| 1646     | foot 77                | foot **77**             | 757 → 757 (0)       |
| **1440** | foot **117**           | foot **77**             | 484 → **524 (+40)** |

So two-line facts are a **loss at 1920, neutral at 1646 and a gain only at 1440**, and never
free. Any design that wants them must first answer the 16 px row-gap.

**Instrument note.** The first two runs of this probe reported `factsH: 24` in every "two-line"
reading — it was capping an outer wrapper (`flex shrink-0 items-center`) while the real facts row
(`flex min-h-6 shrink-0 items-center gap-4 px-3 text-xs`) sat inside it and overflowed rather than
wrapped. The probe was reporting that it had not done the thing it was named for, visible only in
the height column. A third defect in the same probe had the selection surviving `Escape` between
viewports, so every "at rest" reading after the first was secretly a selected one; it now reloads.

---

## 4. "Should the bottom toolbar always be visible, with buttons greyed out?"

**Measured, this makes §0's cost permanent** — the row would sit at 77 px at 1646 and 117 px at
1440 whether or not anything is selected, so the diagram would lose 36 px and 76 px **all the
time** rather than only while a selection exists. Today at rest the dock renders **zero items and
zero height**.

It also runs into ADR-0082's discriminator, which this repository already settled: _omit_ when the
action does not apply to the object, _shade with a reason_ when it is shut by a state the reader can
change or by their role. With nothing selected there is no object, so ten controls would be shaded
against a subject that does not exist — and ADR-0082's own clause says a surface whose every item
would be shaded renders no trigger at all.

The measurement does not make the request wrong; it prices it. Any version of it has to pay §0's
wrap first.

---

## 5. "Can we get some commands out of the dropdowns, especially at the bigger scale?"

**There is space, and there is almost nothing worth putting in it.**

The deck's slack, measured:

| viewport | lines | line 1 slack | line 2 slack |
| -------- | ----- | ------------ | ------------ |
| 1920     | 2     | **23.1**     | **1175.6**   |
| 1646     | 2     | 275.2        | 375.5        |
| 1440     | 2     | 69.2         | 169.5        |

So the premise holds at 1920 — the deck's second line is 1,176 px of empty space — and roughly at 1646. At 1440 there is little.

But **48 controls sit behind the eight `▾` triggers, and only 13 are commands**:

| trigger            | kind   | contents                                                      | commands? |
| ------------------ | ------ | ------------------------------------------------------------- | --------- |
| `View ▾`           | dialog | **24 checkboxes** — 5 zoom presets, 19 structure/lens toggles | no        |
| `Filter ▾`         | dialog | 3 checkboxes — Critical, Has constraint, Has conflict         | no        |
| `Go to date ▾`     | dialog | 1 date input                                                  | no        |
| `Activity type ▾`  | menu   | 4 radios — the Add tool's type                                | no        |
| `Link type ▾`      | menu   | 4 radios — the Link tool's type                               | no        |
| `Summary ▾`        | dialog | **1 button — `Edit plan…`**                                   | **1**     |
| `Analysis ▾`       | menu   | Baselines…, Earned value…, Resource histogram…                | **3**     |
| `Share & export ▾` | menu   | CSV, 4× diagram PNG/PDF, XER, MSPDI, Print…, Share…           | **9**     |

35 of the 48 are lens toggles, zoom presets and tool-type radios. ADR-0091's own thesis is that **a
mode is not a command**; promoting a checkbox onto a command deck is precisely what that decision
argued against, and `View ▾`'s 24 switches are the clearest case in the product. Of the 13 real
commands, 9 are one export family whose members ("Diagram — current view (PDF)") are meaningless as
standalone deck buttons.

**The one thing that looks like a defect rather than a preference: `Summary ▾` is a dropdown
containing exactly one command.** It costs a click and offers no choice.

Promotion cost, measured by cloning a real labelled control and swapping its text — not by a nominal
px-per-character metric, because `apps/web` has never declared a `@font-face` (ADR-0097) and a width
computed in a nominal font is a width in a font nobody is guaranteed to have:

| label         | width | label                | width |
| ------------- | ----- | -------------------- | ----- |
| `Legend`      | 66.8  | `Export data`        | 96.5  |
| `Zoom in`     | 70.8  | `Critical path`      | 105.2 |
| `Baseline`    | 77.6  | `Export image`       | 104.5 |
| `Zoom out`    | 79.6  | `Print programme`    | 129.1 |
| `Fit to plan` | 90.0  | `Keyboard shortcuts` | 148.1 |
| `Float paths` | 93.8  | `Go to today`        | 94.3  |

---

## What the instruments got wrong

Recorded because each looked right, and because ADR-0058's rule is _verify the claim_.

1. **The menu probe swept the whole document.** The canvas's parallel a11y listbox (ADR-0026 D7)
   uses `role="option"`, so every menu came back holding the plan's activities — and four triggers
   reported nothing but that noise, which reads identically to an empty menu.
2. **Its replacement enumerated only what the click added**, which fixed the noise and still
   reported `View`, `Filter` and `Go to date` as empty. `diag-popovers.spec.ts` settled why by
   looking: those are `ToolbarPopover`, which mounts a `[role="dialog"]`; the ones that worked are
   `Menu`, which portals a `[role="menu"]`. v3 scopes to the open panel and reads both.
3. **The diagnostic located "View" by role and name and folded the View card**, because each deck
   group caption is itself a disclosure button. Locating chrome by its copy is the standing rule
   after ADR-0091, broken here by the probe written to check it.
4. **The what-if capped the wrong element** (§3) and **let the selection survive between
   viewports** (§3), so two of its three columns were describing a state other than the one their
   labels claimed.
5. **The first selection gesture clicked `[role="option"]` and selected nothing**, so every reading
   for §4 came back with a zero-item dock — indistinguishable from "the object bar does not exist",
   which is the very thing §4 asks about.

---

## Open, and deliberately not answered here

- **§0's remedy is a design question, not a measurement one.** The numbers say the shortfall is
  261.8 px at 1646 and that two changes to the dock close it; which two, and whether withdrawing a
  shaded control is right under ADR-0082, belongs in the spec.
- **§1's cost.** Giving the foot row a `chrome` treatment is a token and structure change whose
  height cost depends on the treatment chosen. The contrast matrix already covers the `chrome`
  scope's 31 tokens, so the pairs exist; what is unmeasured is whether the row keeps 41 px.

---

# Corrections — what a second reading and a verification pass changed

`ui-architect` reviewed this document (`design-review.md`) and challenged four decision-bearing
numbers; `feature-analyst` challenged one inference. **Every challenge was re-measured against the
running product rather than folded on the strength of a citation** —
`apps/web/measure-toolbar/m0-verify.spec.ts` and `m0-candidates.spec.ts`. Four of the five stand
against me, and one of my conclusions is reversed outright.

## C1. `You're editing this plan.` is a phantom — §3's leaf table was wrong

**Upheld.** Measured: the element's own rect is 125.9 × 15, and it is clipped by an ancestor
`DIV.sr-only` whose rect is **1 × 1** with `clip-path: inset(50%)`.

`CompactPenStatus.tsx:179` applies `sr-only` unless `LockView.messageVisible`, which
`lock-view.ts` sets on exactly two branches — the pen being **lost**, and an incoming request. In
the state measured the reader **holds** the pen, so the sentence is announced and not painted.

**How the probe fooled me, because the mechanism is worth knowing.** `sr-only` sits on the OUTER
span; the message lives in an inner `truncate` span. My "deepest text leaf" rule therefore measured
the inner element, and `getBoundingClientRect` on a child of a 1 px clipped ancestor still returns
the child's own intrinsic box — 125.9 px of text nobody can see. A milestone removing this sentence
"to free 126 px" would have freed **zero**. The visible facts are the other four leaves, 381.3 px.

## C2. Two-line facts ARE free — §3's conclusion is reversed

**Upheld, and this is a correction to my conclusion rather than to a number.** The row is
`gap-4`, which sets `row-gap: 16px` as well as `column-gap: 16px`. Measured at 1646, at rest:

| facts row                 | row height | foot row      | canvas         |
| ------------------------- | ---------- | ------------- | -------------- |
| one line (today)          | 24         | 41            | 793            |
| wrapped, `row-gap: 16px`  | 64         | **65 (+24)**  | 769 (−24)      |
| wrapped, **`row-gap: 0`** | **32**     | **41 (same)** | **793 (same)** |

So the product owner's Q3 — _"two lines keeping the same height of the toolbar still"_ — **is
achievable exactly as asked, at zero cost**, because two 16 px lines are 32 px and the row's floor
is the 40 px collapse button. §3's "never free" was true only of today's row-gap, and I generalised
it into a property of the layout. It is one Tailwind class.

## C3. The dock's width is not a viewport property

**Upheld.** The Project Explorer carries a resize separator reporting
`aria-valuemin="200"`, `aria-valuenow="276"`, `aria-valuemax="420"`. Every reading in this document
was taken at the 276 px default. The **220 px of user-controlled range is comparable to the
261.8 px shortfall**, so the same viewport can be inside or outside §0's defect depending on a drag
the reader has already made. Any gate written for §0 must pin the Explorer's width or it will be
flaky for a reason that has nothing to do with the code.

## C4. One fact renders twice on one screen

**Upheld in part — two confirmed, not three.** `Data date` renders in the foot row (52 × 16,
visible) and once more elsewhere (60 × 14, visible) with no popover open. The review's third
instance is inside `Summary ▾`; this probe's trigger click did not reliably open that popover, so
**three is not confirmed here and two is**. Worth its own row rather than a claim in this one.

## C5. My §5 inference was wrong — a lens toggle on the deck has precedent

**`feature-analyst` is right and I was wrong.** §5 argued from ADR-0091's "a mode is not a command"
that promoting a switch onto the deck is what that decision forbade. `tsld-toolbar-items.tsx:227`
records the opposite: _"The product owner asked for the Legend and the Resource view back on the
row"_ — both are deck items today, and `lensTogglesIn` (`:322`) excludes anything already on the
row so it can never appear twice. The mechanism exists, the precedent exists, and it was set by the
same person asking the question. §5's _count_ stands; its inference does not.

## C6. **WITHDRAWN — #202 and #203 both exist, and my "verification" was pattern-blind**

This section previously read _"`docs/TECH_DEBT.md` #202 and #203 do not exist — and both citations
are mine"_, and called it ADR-0076 Class 1 committed twice in three days. **It is wrong, and the way
it is wrong is worth more than the finding would have been.**

Both rows exist and are properly written: `## 202. Six non-blocking findings from the foot-row gate
pass` at line 5138, and `## 203. Two menu-positioning clamps, one now measured and one still
guessing` at line 5185.

**The register uses two heading styles.** Twenty-three older rows are `## #201 — title`; more than
seventy modern ones, including every row above #185, are `## 202. title`. I searched for `^## #`,
found the highest match at #201, and concluded the register stopped there. I then "confirmed" it
with `git show 06a7f6ec -- docs/TECH_DEBT.md | grep -E '^\+## #'`, which missed `+## 202.` for
**exactly the same reason** — so the check that was supposed to be independent shared the defect of
the claim it was checking.

Both reviewing agents reported the same absence independently, which is why it read as
corroborated. Three readers agreeing does not make a grep pattern correct.

**This is ADR-0076 Class 3 — a decision-bearing claim asserted without checking — committed inside a
document whose subject is Class 1, and asserted about myself in a passage congratulating a
different instrument for catching something.** It is corrected in place rather than deleted, because
the correction is the useful artefact: the sentence in the commit message for `a66b36a0` that says
"#202 and #203 do not exist in the debt register — both citations are mine" is **false**, and this
paragraph is where a reader who follows that commit will land.

**The real finding underneath it is the heading inconsistency**, which is now known to have produced
three independent false readings in one session. It is not repaired here — rewriting ninety-odd
headings is drive-by churn across a file every epic touches, and the risk of a bad sed over the
register is worse than the inconsistency. Recorded so the next reader greps for both forms.

---

# The decisive measurement — and it falsifies the cheap fix

C2 makes a two-line facts row free and takes it from 481.4 px to 250 px. That frees 231.4 px
against §0's 261.8 px shortfall, which looks close enough to try. **It buys nothing.**

| viewport | selected, facts 1 line | selected, facts 2 lines @ `row-gap: 0`  |
| -------- | ---------------------- | --------------------------------------- |
| 1646     | foot 77, canvas 757    | foot **77**, canvas **757** — unchanged |
| 1440     | foot 117, canvas 484   | foot **77**, canvas **524 (+40)**       |

**A wrapping row breaks between items, not by total width** — ADR-0114 M2 recorded exactly this,
freeing 164 px and buying zero height, and it is now the seventh consecutive width expectation in
this repository contradicted by its own measurement. Two-line facts help at 1440 and do **nothing**
at 1646, which is the width the product owner actually uses.

So the fix must reduce the **dock's own** width. Each candidate was applied by hiding the real
controls in the real row (`m0-candidates.spec.ts`) rather than by adding up their widths:

| candidate                                                   | items | items width | **1920** | **1646** | **1440** |
| ----------------------------------------------------------- | ----- | ----------- | -------- | -------- | -------- |
| today                                                       | 10    | 965.4       | 41       | 77       | 117      |
| **A** omit `clear-visual-placement` (shaded outside Visual) | 9     | 819.4       | 41       | **77**   | 117      |
| **B** A + `zoom-to-selection` to the deck                   | 8     | 667.1       | 41       | **41** ✓ | 117      |
| **C** B + `isolate-logic` to the deck                       | 7     | 588.1       | 41       | **41** ✓ | 117      |
| **D** move both, but keep `clear-visual-placement`          | 8     | 734.2       | 41       | **77**   | 117      |

Read `footH`, not the line count — see the instrument note below.

1. **A alone does not fix 1646.** Omitting the shaded control leaves 819.4 px plus 64 px of gaps
   against 775.6 px available. The plan that begins "omit `clear-visual-placement`, then decide the
   remaining 108 px" is right that it is insufficient and the residue is not 108 px of free choice —
   at 1646 nothing short of taking a second control off the bar closes it.
2. **D does not fix it either**, so omitting `clear-visual-placement` is _necessary_ as well as
   insufficient. Both halves of B are load-bearing.
3. **B is the minimum that fixes 1646**, and returns the 36 px: canvas 757 → 793. C buys margin.
4. **Nothing measured fixes 1440.** Even C's 588.1 px exceeds the 569.6 px available. A milestone
   claiming to fix "the wrap" must say it fixes 1920 and 1646 and not 1440, or it is claiming
   something the measurement does not support.

**Instrument note — a sixth defect, in this document's own table.** The `lines` column counts
distinct `y` values among `[data-toolbar-item]`s, and the object bar carries content that is not an
item (its own selection sentence). At 1646 candidate D reports `lines: 1` beside `footH: 77`: the
eight controls do sit on one line, and the bar is still two lines tall because its label wrapped.
**`footH` is the criterion and `lines` is not**, which is why the table above is read the way it is.
