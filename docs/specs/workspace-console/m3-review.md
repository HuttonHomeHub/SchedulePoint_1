# M3 — the state ladder, and what the two §19.13 reviews found

- **Status:** Accepted — the record of the pre-release gate for M3 (2026-09-10)
- **Why this file exists:** CLAUDE.md §19.13 / ADR-0111 requires `accessibility-reviewer` **and**
  `component-reviewer` over a shared primitive's ARIA and keyboard model **before** it ships. Both
  blocked. Seven findings, every one real, and two of them changed the design rather than a comment.

## The change

`toolbarControlVariants` had a boolean `active` painting **one** wash — `bg-accent`, **1.34:1**
against the navy band — for hover, for an open disclosure and for an armed modal tool alike. So an
armed Add tool looked like a hovered button: a WCAG 2.2 §1.4.11 exposure on the state a planner most
needs to notice, and the confusion ADR-0064 was opened on. It becomes
`state: 'rest' | 'open' | 'selected' | 'armed'`, with which kind an active control takes **declared
on the registry item** (`activeKind`) and never inferred from ARIA — a ladder read from
`aria-pressed` would paint an open `View ▾` as an armed tool, because `ToolbarPopover` set it.

## What the reviews found

| #     | finding                                                                                                                      | what it changed                                                          |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| B1    | `Toolbar` never forwarded `activeKind`; `Deck`, its sibling, did                                                             | one line, plus the first test that could catch it                        |
| B2    | **All three** `render` items ignored the resolved value — changing an item's registry declaration had **zero** visual effect | the field's stated purpose was plumbed to nowhere; four call sites wired |
| B3    | Four false docblock claims, one self-contradicting inside a single new comment                                               | corrected; see below                                                     |
| A1    | The fabricated claim survived in a **third** file the first fix missed                                                       | corrected                                                                |
| A2    | **The precedence fix made the underline load-bearing at 2.51:1**                                                             | the underline's colour changed and its pair is now asserted              |
| A3    | `IsolateControl` — the fourth modal tool — still hardcoded its state                                                         | reads `api.activeKind`                                                   |
| A4/A5 | no unit cover for the `aria-pressed` change; one unwired `render` consumer                                                   | both closed                                                              |

## The two that changed the design

### 1. A caret that does not rotate

The ladder first made `open` outrank `selected`, justified in three files by _"the caret
rotates"_. **No caret in this product rotates** — the component review found it, and a `grep` for
`rotate` across the toolbar family returns nothing. The claim was load-bearing for the rule.

With it gone the honest rule is simpler and better: **a control's own state outranks the transient
fact that its panel is showing**, in _both_ primitives — so the asymmetry the review separately
flagged as a trap disappears. It also fixes real behaviour: a filtered `Filter ▾` now keeps the mark
saying a filter is applied **while you open it to check**, where the withdrawn rule withdrew that
mark at exactly that moment.

### 2. Fixing that created a WCAG gap, and the accessibility review caught it

Once `selected` outranks `open`, an engaged open trigger and an idle open trigger share the
identical `--secondary` fill — so the underline becomes the **sole** carrier of "engaged" at the
moment a planner opened the panel to check. It was amber at **2.51:1** on that fill, and the first
version of this block _reported_ it, arguing no criterion requires a redundant second channel. After
the precedence fix it is not redundant, so the argument no longer held.

No amber value rescues it, and the reason is arithmetic rather than empirical — the band and the
amber are **7.91:1** apart, and two 3:1 steps need 9:1:

| `--secondary` L | amber underline / fill | fill / band |
| --------------- | ---------------------- | ----------- |
| 0.54 (shipped)  | 2.51                   | **3.15**    |
| 0.50            | 2.97                   | 2.66        |
| 0.46            | **3.53**               | 2.24        |

Drawing it **outside** the box, where it would sit on the band at 7.91:1, was measured in a browser
and rejected: after M1 deleted the group cards the deck's clearance below its last control row is
**6 px**, so an outset 2 px amber mark would sit 4 px above the band's own 3 px amber rule — two
parallel amber lines nearly touching, on a row carrying a selected-capable control (`notes`).

**So the underline takes the BAND's own colour**: `--background` on `--secondary` is the same
**3.15:1** pair as the fill against the band, read the other way round, and paints as a notch cut
from the bottom of the chip. It is now **asserted at 3:1**, not reported. `armed` keeps an amber
underline, because armed has no fill — its mark sits on the band at 7.91:1.

## Two decisions taken by measurement rather than by the plan

- **Armed carries no ring.** It was drafted with a 2 px inset amber ring — and `--chrome-ring` and
  `--chrome-primary` are the identical string while the CVA already draws focus as `ring-2
ring-inset`, so an armed _and keyboard-focused_ control showed one amber ring for two facts. The
  plan's remedy was to move focus outside the box; measured, the deck's smallest gap between two
  controls on a row is **4 px**, which a 2 px offset plus a 2 px ring consumes exactly. Took the
  plan's own fallback. (The accessibility review independently compiled the Tailwind output and
  confirmed the underline's `box-shadow` and the focus ring compose rather than overwrite.)
- **`font-semibold` removed from armed**: weight changes width and this deck wraps, so arming a tool
  could break a row under the planner's cursor and re-join it on disarm.

## The gates, and the one that was decorative until it was tested

Nine regression tests, each verified red against the specific defect it names: the contrast pair at
**1.34:1** (the exact wash being replaced), the structural test two ways, the CVA swap, both
precedence reversions, B1's missing forward, the amber underline at 2.51, and the `aria-pressed`
revert.

**Two of those assertions were decorative when first written and that was found by running them, not
by reading.** Asserting three states are _distinct_ stays true if two are swapped; and
`ToolbarPopover`'s `open` is internal state, so setting props alone never reaches the overlap the
case existed to pin. Both mutations passed. They assert a property now (selected takes a fill, armed
takes ink) and open the panel for real.
