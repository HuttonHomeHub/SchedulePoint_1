# M3 measured — the deck's type scale, in lines

> Measured 2026-08-27 in Chromium against a real API on a populated plan with the pen held, using
> `apps/web/measure-toolbar/m3-deck-type-scale.spec.ts`. The harness's JSON lands in
> `apps/web/measure-output/`, which is git-ignored — this file is the record.
>
> **The falsification condition was written into the spec (D3) before the run:** if the deck gains a
> visual line at 1920 or 1646, the change is withdrawn and re-opened as a type-ramp decision.

## The verdict: it does not fire

| viewport | lines before | lines after | deck height before | after   |
| -------- | ------------ | ----------- | ------------------ | ------- |
| 1920     | 2            | **2**       | 108 px             | **108** |
| 1646     | 2            | **2**       | 108 px             | **108** |

Cards widen by **75 px in total** and buy no line: View 638 → 667, Find 662 → **662**, Author
608 → 626, Plan 674 → 702. Find is unchanged because its content is the search field plus three
controls that were already at the larger size.

So D3 ships. Labels are bigger, the deck is exactly as tall, and the canvas loses nothing.

## What the measurement corrected, which is the part worth keeping

**The cause I gave the product owner was right about eight items and missed three, and the three are
the worse half.** The report said the split was "plain commands at 10 px, `▾` triggers at 14 px".
Measured, `Go to today` and `Next conflict` are both **14 px**, and both were named as examples of
the 10 px group.

There are **two** mechanisms:

| cause                                             | items                                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| A `render` item never reaches the override at all | `today`, `view`, `filter`, `add-activity`, `link-tool`, `summary`, `analysis`, `export` (8) |
| **The override lands on an invisible span**       | `next-conflict`, `float-paths`, `add-note` (3)                                              |
| Correctly 10 px                                   | `resource-view`, `legend`, `marquee-select`, `auto-arrange`, `calendar`, `comments` (6)     |

The second was not known and is the sharper one. `Deck` targeted `> span:last-of-type`, and
`ToolbarButton` renders **icon → label → `sr-only` reason → `sr-only` description**. So the moment a
control carries a disabled reason or an `srDescription`, the override applies to a node nobody can
see and the visible label falls through to `text-sm`.

**In other words: a plain command's label grew from 10 px to 14 px the moment it was shaded.** All
three items in that column measured `disabled: true` with an `sr-only` span present — so on the
screen the product owner was looking at, `Add note` was rendering larger than `Legend` beside it
_because_ it was disabled.

## What the instrument got wrong

The first pass recorded a `render` boolean meant to separate the two populations. It reported
`false` for **every** item, because `data-toolbar-item` sits on the focusable control and a split
button's primary half is a `<button>` too. It was dropped rather than repaired: the numbers it
existed to explain turned out to have a different explanation, and `hasSrSpan` + `disabled` — which
replaced it — are what actually discriminate.

That is the second time in three epics that a probe's own classification field was wrong while its
measurements were right, and both times it was caught by reading the rows rather than the summary.
