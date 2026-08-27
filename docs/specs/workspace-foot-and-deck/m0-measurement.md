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
