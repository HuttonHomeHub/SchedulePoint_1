# M0 — measured before specifying, and two decisions changed

> Measured 2026-08-26 with `apps/web/measure-toolbar/m4-one-line-deck.spec.ts` and
> `m3-below-canvas.spec.ts`, at 1920×1080 and 1646×1097 against the real product.

## 1. The deck's captions are not gutters, and I said they were

The one-line deck was proposed on the basis that ADR-0090 M2-T6 specified deleting the caption
gutters and never shipped it. **That is the wrong component.** M2-T6 was about ROW captions in the
two-row `Toolbar`, a layout ADR-0109 D1 deleted. The deck's captions arrived later, and each one is
a **focusable disclosure button that folds its group and holds a roving tab stop** — `Deck.tsx`
records turning the card on its side specifically to spend the caption's _width_ instead of its
height, taking the deck 170 → 112 px. Deleting them removes a feature and reverses a measured
decision. Recorded because it was told to the product owner as "finishing owed work", which it is
not.

## 2. What the cards actually cost

Identical at both widths — the cards are content-sized, not stretched.

| card   | card width | caption | controls | card chrome |
| ------ | ---------- | ------- | -------- | ----------- |
| View   | 638        | 54      | 559      | 25          |
| Find   | 662        | 51      | 585      | 26          |
| Author | 608        | 69      | 513      | 26          |
| Plan   | 674        | 53      | 595      | 26          |

All four plus gaps: **2618**. View + Find + Plan plus gaps: **1998**. Container at 1920: **1862**.

## 3. The one-line deck is reachable, and the slack is a fifth of the bar

| arrangement                                                        | required | slack vs 1862 |
| ------------------------------------------------------------------ | -------- | ------------- |
| View + Find + Plan, as they are                                    | 1998     | **−136**      |
| …with all three captions **deleted** (−158)                        | 1840     | **+22**       |
| …with captions **icon-only** (~~−70) and a shorter search (~~−100) | ~1828    | **~+34**      |

**The gain is 58 px** — the deck 108 → 50, chrome above the canvas 209 → 151, canvas 776 → 834 at
1920 (**+7.5 %**).

The header epic set a **+120 px** bar precisely so a longer plan name or a translated string could
not overflow a row. **Every arrangement here lands between +22 and +34** — a fifth of that bar — and
a deck that re-wraps is the two-row deck again, so the gain is conditional as well as small. Deleting
the captions also costs the fold feature and three roving tab stops.

## 4. True centring truncates the plan name at 1646, by more than was said

The three sections the product owner described, measured:

| section                   | required |
| ------------------------- | -------- |
| 1. brand + breadcrumb     | 582      |
| 2. mode + pen             | 620      |
| 3. organisation + account | 256      |

(582 + 620 + 256 + two gaps = 1482, which is exactly the merged row's measured requirement — the two
instruments agree.)

**Truly centring the middle means the outer two sections get equal shares**, because that is what
centring is. So section 1 is capped at whatever section 3's share is:

| viewport | container | share each | section 1 needs | result                     |
| -------- | --------- | ---------- | --------------- | -------------------------- |
| 1920     | 1862      | 609        | 582             | fits, 27 px spare          |
| 1646     | 1588      | 472        | 582             | **110 px of the name cut** |

It was put to the product owner as "~10 px over at 1646". **The real figure is 110 px**, estimated
then and measured now.

**Space-between does not truncate at all.** Three natural-width sections with the free space split
between them: at 1920 the gaps are 202 px each and section 2 sits 163 px right of the true centre;
at 1646 the gaps are 65 px and nothing truncates until the container falls below 1458. It gives the
visible separation the complaint was about — the current layout packs brand, breadcrumb, mode and
pen together at the left, then a void — without capping the plan name.

## 5. What could not be measured

The **Activities handle row's free width is unmeasured** — the probe's selector found nothing,
because the panel is collapsed by default and the row it looked for carries different content in
that state. So **moving Author to the canvas foot is still unpriced**, and the question ADR-0092
raises — that the row is reserved for transient strips, which a permanent 10-item toolbar would
compete with — is unanswered. Stated rather than glossed: no plan should assume Author fits there
until it is measured.

---

## 6. The canvas foot cannot hold Author — measured, and it settles the one-line deck

The Activities handle row, collapsed (the default), measured in the shipped product:

| viewport | row width | facts | **dock region** | expand |
| -------- | --------- | ----- | --------------- | ------ |
| 1920     | 1619      | 607   | **924**         | 40     |
| 1646     | 1345      | 607   | **650**         | 40     |

The dock region is `flex-1`, so it always fills whatever is left — which is why the first reading of
"free width" came back as 0 at every state and was the wrong question. The right one is what the
dock has to give: **924 px at 1920 and 650 px at 1646.**

**The Author card needs 608 px.** So at 1646 it would leave the dock **42 px**.

That is not enough for anything. The dock is not decoration — ADR-0092 put the diagram's transient
strips there deliberately (the armed-tool statement, the selection bars, the conflict banner, the
empty-plan notice), on the argument that the row was "a gap the workspace was paying for either
way". **The shortest strip in that set is longer than 42 px**, so the exact widths do not need
measuring to settle it: with Author in the row, arming a tool or selecting an activity pushes the
row to two lines — and `min-h-9` rather than `h-9` means it grows rather than clipping, which is
precisely the height this exercise exists to save.

Even with the shortened statement the product owner approved (`Adding task · drag to set length ·
Esc to stop`, roughly 290 px), Author plus a strip needs ~898 px: it clears 924 at 1920 by 26 px and
misses 650 at 1646 by 248.

### What that settles

**The one-line deck is not viable.** It required Author to leave the band; Author has nowhere to go.
All four cards on one line need 2618 px against an 1862 px container — 756 over — so the two-row
deck stands.

Recorded as a measured withdrawal rather than a deferral: there is no width to find, and no
milestone owes this work.

### Unmeasured, and stated

The **selection bar's** width was not captured — the probe's listbox click found no option, so that
state never rendered. It does not change the conclusion (Author already fails against the armed
statement, and the selection bar is the wider strip of the two), but it is not a number I have.
