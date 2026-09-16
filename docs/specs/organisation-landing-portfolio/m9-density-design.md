# M9 — the landing fits the window: tighter rows, and boxes that scroll

**Status:** Approved by the product owner ("go for the tighter version", 2026-09-16). Designed
against `m8-density-measurement.md`, which was taken before any of this was designed.

**The request, in the product owner's words:** _"can we tighten the rows to get more info without
hurting the readability … fix each box to 4 'items' and then add scroll bars to each box? if the
window allows more then grow the boxes"_ and _"I don't really want to have to scroll the main
window unless I really have to."_

---

## 0. What the measurement changed about the request

Two of M8's three findings are not in service of the request; they alter it.

**The page never scrolled.** The shell is an `h-dvh` grid with `overflow: hidden` and `<main>` is
the scroll container — 949 px of room asked to show 1302 px at a 1000 px window, **353 px over**.
So the cap belongs on the workspace region, and the mechanism the request asks for is most of the
way there already. Nothing needs to be built to stop the _document_ scrolling, because it does not.

**Four rows per box does not fit at today's row height.** A box's body is 313 px at a 1000 px
window and the median row is 81 px, so it holds **three** — two where a row carries flags and wraps
to 121 px. The two halves of the request are therefore one: the cap is bought by the tightening,
not chosen alongside it.

That is why the tightening is M9's first milestone and the cap is its second. Built the other way
round, the cap would ship showing three rows and look like a regression.

## 1. The decisions

### D1 — A row's subject and its context share one line

Every row on this screen is the same two lines: the name, then `project · client` beneath it in
muted small text. Merging them onto one line is worth **20 px on every row in all four boxes**, and
is the single largest term in the measurement.

```
Dockside — Berth 4 Deepening  [Draft]   ·  Dockside Regeneration · Harbourside    Finishes 13 Feb 2026
```

The name stays the link and keeps `rowLinkClass`; the project and client follow it as muted text in
the same line box, truncating first. At 464 px (1280, two columns) the context truncates away
entirely and the name survives — which is the right sacrifice and is what `min-w-0 truncate`
already does one line down.

**It is a shared `RowSubject`, not four copies.** All four rows render the same pair today and
would render the same merged line; four call sites each free-handing a flex row is how the two
tables in ADR-0143 ended up 371–660 px apart. One component, one truncation rule.

### D2 — The staleness caveat rides the movement line

`STALE_FIGURES_SENTENCE` costs a whole 20 px line to qualify the sentence directly above it. It
becomes a suffix on that sentence rather than a line under it, so the qualification sits where the
thing it qualifies is. Where the pair is too long for the column it wraps — which costs exactly
what it costs today and no more.

**It is not a badge and not a `title`.** A badge would have to be short enough to be ambiguous
("Stale" is not a fact a planner can act on), and `title` is invisible to keyboard and touch
(`docs/UX_STANDARDS.md` §6, already cited in `PlanStandingRow`'s own docblock).

### D3 — Flags render inline, and this overturns a comment that argued otherwise

`PlanStandingRow` stacks one line per flag, defended in a comment: _"they are independent problems
with independent remedies, and a comma-separated run reads as one."_ That reasoning is sound and
is overturned on a cost it did not have: a plan carrying all four flags is a **seven-line row**, and
in a box with a height budget that is one plan filling the box.

They become an inline run separated by `·`, still a `role="list"` of `role="listitem"`s so the
"independent problems" claim survives where it is load-bearing — in what an assistive reader hears.
The visual separator is the concession; the semantics are not.

**Height becomes bounded**: one line for one flag or for four, instead of one line each.

### D4 — A box fills its share and scrolls, and says what it is holding

`SectionCard` gains **`fill`**: the card becomes a column, its header stays put, and its body
scrolls. The grid row supplies the height; the card divides it.

Three things it must carry, each because its absence is a known defect here:

- **The scroll container is `tabIndex={0}`.** A scrollable region that is not focusable cannot be
  scrolled from the keyboard (WCAG 2.2 §2.1.1, level A). Browser defaults do not cover this
  reliably.
- **The box states its total.** Content below the fold of a card is content a reader cannot tell
  from content that does not exist — the failure ADR-0127 states as "a picture quietly missing rows
  is unnoticeable". The count goes in the existing `action` slot, worded ("8 plans"), never a bare
  numeral.
- **It sizes to content up to its share.** `Needs your attention` holding one item must not pad out
  to match its neighbour; that is what produces the gutters in the product owner's screenshot.
  `max-h-full` with no `h-full`.

### D5 — The floor is a `min-height`, not a breakpoint

Below some window height a quarter of the screen is one row and a scrollbar, which is worse than
the page scroll it replaced. The fallback is **one `min-height` on the box** — the heading block
plus two rows. When the viewport cannot give each box that much, the min wins, the grid exceeds
`<main>`, and `<main>` scrolls exactly as it does today.

No media query, no JS measurement, no second layout. The degradation is the absence of the
constraint rather than a different design, which is also why there is nothing extra to test at
small sizes: it _is_ the shipped behaviour.

## 2. What this does not do

- **It does not page or virtualize.** The lists are server-capped at 8 / 8 / 5, so a box's worst
  case is eight rows and a scrollbar. `Needs your attention` is the one that can reach ~13.
- **It does not change any endpoint.** No DTO, no query, no migration. The CPM engine is not
  imported.
- **It does not touch the copy contract's sentences**, only where two of them sit relative to each
  other.

## 3. The falsification condition, committed before the build

**FC-D1 — the workspace region does not scroll at 1646 × 1000.** `main.scrollHeight <=
main.clientHeight + 1` on the M8 fixture. Failure: the cap is withdrawn and the tightening ships
alone, which is a strict improvement on its own.

**FC-D2 — a box holds at least four rows at 1646 × 1000.** Body ÷ median row `>= 4`. The measured
baseline is 3. Failure: report the number, do not soften the row.

**FC-D3 — no box is taller than its content.** A box with one item is shorter than a box with
eight, at every measured height. Failure: the gutters are back.

**FC-D4 — the short-window fallback restores page scroll**, at 700 × 1646, rather than producing a
box with one visible row.

## 4. Milestones

- **M9.1 — the rows.** `RowSubject`, the staleness suffix, inline flags. Re-measure: the median row
  must fall from 81. Ships alone and is useful alone.
- **M9.2 — the cap.** `SectionCard fill`, the grid height, the count in `action`, the `min-height`
  floor. Judge FC-D1 to FC-D4.
- **M9.3 — gates, journey, release.**

---

## 5. Measured after, and judged

Same harness, same fixture, one sitting (`apps/web/scripts/measure-landing-density.mjs`).

|                                        |     Before |                    After |
| -------------------------------------- | ---------: | -----------------------: |
| `<main>` content / room at 1646 × 1000 | 1302 / 949 |            **949 / 949** |
| Median row                             |      81 px |                **61 px** |
| "Jump back in" row                     |      61 px |                **41 px** |
| Flagged standing row                   |     121 px |               **101 px** |
| Heading block (with description)       |      97 px |                    97 px |
| Rows fully visible in a capped box     |          — | **4** (302 px body ÷ 61) |
| FC-1, questions above the fold         |     7 of 7 |               **7 of 7** |

**FC-D1 — PASS.** `main.scrollHeight === main.clientHeight === 949`. The workspace region does not
scroll at 1646 × 1000, where it was 353 px over.

**FC-D2 — PASS.** A capped box's body is 302 px and the median row is 61, so **four rows are fully
visible** with the fifth partly. The measured baseline was three.

**FC-D3 — PASS.** Boxes size to content: "Jump back in" 261 px, "Needs your attention" 280 px, the
two long ones capped at 399 px. A short box is shorter.

**FC-D4 — PASS by construction.** The floor is a `min-height`, so below it the grid outgrows
`<main>` and `<main>` scrolls. There is no second layout to verify.

## 6. What the build changed about the design

**D4's third bullet was nearly reversed and should not have been.** Building it, the first version
let the boxes stretch to their grid row, on the reasoning that in a `1fr` grid the space exists
either way and a card enclosing it looks deliberate while a gap below a short card looks like a
mistake. The screenshot disagreed flatly: "Jump back in" holding one plan became a **399 px box with
250 px of nothing in it**, beside a neighbour clipping its last row. `self-start` with `max-h-full`
is what the design said and what shipped.

**A latent defect in `SectionCard` surfaced the moment it had a consumer.** Its header carried
`flex items-start justify-between gap-4` — a row — over `CardHeader`'s own `flex flex-col`. Those
are different utility groups, so `tailwind-merge` keeps both and the **column wins**: the header has
never been a row, and `items-start justify-between` described a layout that did not exist. It was
invisible because no screen passed `action` to a `SectionCard` until these counts. Fixed with
`flex-row`, verified red.

**The flagged row is 101 px, not the ~80 the design predicted.** Its movement sentence plus the
staleness caveat wraps to two lines in a 647 px column, so D2 buys a line only when the pair fits.
The median is what the cap is sized against and the median hit its target, so the prediction being
out by 21 px changes nothing — but it was a prediction, and it was wrong.

**The heading block did not shrink.** It was named as a target in the measurement's own framing and
nothing in this milestone touches it; 97 px of every capped box is still its heading and
description. Left alone deliberately: the description is fixed by the copy contract, and a box that
scrolls needs its heading more than one that does not.

**The journey's own no-scroll assertion was written, run, and found to be VACUOUS.** It read
`main.scrollHeight - main.clientHeight === 0` and passed — then passed again with the height cap
removed entirely, because `e2e-overview`'s organisation holds **one plan** and `<main>` does not
overflow either way. A test green against the defect it names is worse than no test, so it was
replaced with something that fixture can exhibit: that a capped box's body really takes keyboard
focus in a real browser, which jsdom structurally cannot check. The no-scroll claim stays where a
fixture can exhibit it — `measure-landing-density.mjs` on twelve plans — and the journey says so in
its own comment rather than leaving a reader to assume it is covered.

**Two gates caught things a human read did not.** The sizing ratchet refused `min-h-[220px]` as a
nineteenth arbitrary value; it is spelled `min-h-55` — the same 220 px on the 4 px spacing step —
which is the better answer rather than a raised ceiling. And `check:counts` caught the banner's web
source-file count going stale in the commit that added `SectionCount.tsx`.

---

## 7. M9.4 — the rows take what they need (a reversal, on the product owner's report)

Shipped as `web-v0.134.0`, the product owner said: _"i like it but if there is free space the boxes
should fill them rather than shrink?"_ Their screen showed the top row ending well short of its
track while "Where the work stands" scrolled — **surplus in one row, shortage in the other**.

Two things from §1 are reversed, and the more interesting one is that §6's own evidence was read too
broadly.

**The rows stop being equal halves.** `md:grid-rows-[repeat(2,minmax(0,1fr))]` becomes
`md:grid-rows-[minmax(0,auto)_minmax(0,1fr)]`: the top row takes its content's height, the bottom
row takes the rest. That asymmetry is a property of the content rather than of the position — "Jump
back in" holds at most five plans (`RECENT_PLANS_CAP`) and "Needs your attention" is an inbox that is
usually short, while the bottom row holds the two eight-row lists this screen exists to show. An
equal split was always going to leave surplus above and shortage below.

**D4's third bullet is withdrawn: the boxes stretch to their row again.** §6 recorded a screenshot
"disagreeing flatly" with stretching — one plan in a 399 px box with 250 px of nothing. That
observation was accurate **about the configuration it was taken in**, and the rule drawn from it
("size to content, never stretch") was too broad: the hole came from **equal `1fr` rows**, which
hand a four-plan shortlist the same half-screen as an eight-row list. It did not come from
stretching. With the rows sized to need there is no hole to avoid, and stretching buys something
worth having — the two boxes in a row end level instead of raggedly.

Recorded rather than edited into §1, because "a correct observation generalised one step too far" is
a more useful thing to have written down than a tidy decision.

### Measured

|                                        |  M9 (`web-v0.134.0`) |            M9.4 |
| -------------------------------------- | -------------------: | --------------: |
| `<main>` content / room at 1646 × 1000 |            949 / 949 |   **949 / 949** |
| Top-row boxes                          | 261 and 280 (ragged) | **280 and 280** |
| Bottom-row boxes                       |                  399 |         **517** |
| Rows visible in a bottom-row box       |                    4 |           **6** |
| Questions above the fold               |               7 of 7 |          7 of 7 |

The 118 px the bottom row gained is the surplus the top row was holding. `<main>` still does not
scroll, which is the condition the whole milestone turns on.

**What is unchanged and deliberately so:** the `min-h-55` floor still lives on the grid items rather
than on the tracks, so a short window still hands the page its scroll back the same way.
