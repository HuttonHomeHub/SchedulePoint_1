# M3 — the narrow widths, measured

_Harness: `apps/web/measure-toolbar/item-widths.spec.ts` (`pnpm --filter @repo/web measure:toolbar`),
Chromium, on a plan with two activities and a computed schedule. Widths added for this milestone:
1280, 1024, 960, 768._

M3-T3's own risk note is flagged **"derived from the measured anchors, not observed"** and instructs
_measure before choosing_. This is that measurement. It changed two decisions and killed a third.

---

## 1. Where M3 started — after M2, before any M3 work

| viewport | row               | container | laid out | over                     |
| -------- | ----------------- | --------- | -------- | ------------------------ |
| 1440     | View and navigate | 1352      | 1352     | fits (4 commands in `⋯`) |
| 1280     | View and navigate | 1192      | 1192     | fits (6 in `⋯`)          |
| 1024     | View and navigate | 936       | 936      | fits (8 in `⋯`)          |
| 960      | View and navigate | 872       | **883**  | **11 px**                |
| 768      | View and navigate | 680       | **883**  | **203 px**               |

Row 2 fitted at every width, before and after. **The collapse was a Row-1 problem of two very
different sizes** — not the drafted "305 px floor collision", which M2's cuts (pinned floor
1198 → 784 px) had already overtaken.

Row 1's six survivors at ≤ 1024 and what each cost:

```
go-to-date 132   zoom-preset 102   view 91   search 240   filter 93   summary 126   = 784
chrome (gaps + group rules + residual)                                              =  99
                                                                                     ----
                                                                                      883
```

`search` alone was **31 %** of the row — exactly as M3-T3's note predicted, and the only figure in
that note that survived.

## 2. What the numbers decided

**D1 — the viewport fold extends to `compact`, not just `condensed` and below.** M3-T2 was drafted
as "below 1280". At a 1352 px container (a 1440 px window — Surface Pro landscape, this milestone's
headline target) the four viewport commands were **already** in the `⋯`, because Row 1's pinned
controls are 1113 px there and the four cost 430 more. The choice at that width was never "inline or
folded"; it was "in `⋯ More toolbar actions` or in `Zoom ▾` under a **Viewport** heading", and only
one of those names the subject. So `viewportCommandsAreFolded` is `layout !== 'comfortable'`.

**D2 — the collapsed band gets icon-only triggers and a 144 px search field.** Four of Row 1's six
survivors are `ToolbarPopover` triggers, so one `compact` prop is most of the collapse. Measured
saving: go-to-date 132 → 52, zoom-preset 102 → 52, view 91 → 52, filter 93 → 52, summary 126 → 52,
search 240 → 144. **300 px**, which closes 768 with room to spare.

An icon-**triggered** search field — the other option the note names — was not taken: it costs a
click on the control a planner most often arrives wanting, and the floor is enough.

**D3 — "segments become icon pairs" is not implementable, and was reverted the same hour.** M3-T2's
title asks for it and the four segment items (`mode-early`, `mode-visual`, `view-tsld`, `view-gantt`)
**carry no `icon` at all** — the registry says so twelve lines above them: _"Tier 1 so the labels
render (a tier-2 label-less segment paints blank — ux review)."_ Dropping their labels rendered four
blank **16 px** buttons, and `e2e-toolbar-fit` S5 failed on them as a WCAG 2.5.8 violation.

Choosing an icon for `Early` versus `Visual` scheduling mode is a design decision about the domain,
not a layout one, so it was not guessed. `docs/TECH_DEBT.md` **#126**. The primitive widening written
to support it (`showLabel` as a function of the band) was reverted with it rather than left in place
unused — an untested branch is a second product (ADR-0088).

## 3. Where M3 ends

| viewport | row               | container | laid out | inline items | labelled |
| -------- | ----------------- | --------- | -------- | ------------ | -------- |
| 2304     | View and navigate | 2216      | 2216     | 14           | 13       |
| 2304     | Build and manage  | 2216      | 2216     | 14           | 12       |
| 1920     | View and navigate | 1832      | 1832     | 14           | 13       |
| 1920     | Build and manage  | 1832      | 1832     | 14           | 12       |
| 1440     | View and navigate | 1352      | 1352     | 10           | 9        |
| 1440     | Build and manage  | 1352      | 1352     | 13           | 5        |
| 1280     | View and navigate | 1192      | 1192     | 8            | 7        |
| 1280     | Build and manage  | 1192      | 1192     | 14           | 5        |
| 1024     | View and navigate | 936       | 936      | 10           | 4        |
| 1024     | Build and manage  | 936       | 936      | 11           | 5        |
| 960      | View and navigate | 872       | 872      | 10           | 4        |
| 960      | Build and manage  | 872       | 872      | 9            | 5        |
| 768      | View and navigate | 680       | 680      | 6            | 0        |
| 768      | Build and manage  | 680       | 680      | 6            | 4        |

**Every row lays out inside its container at every width in the gate's list**, so
`e2e-toolbar-fit`'s `PINNED_FLOOR_WIDTH` drops 1440 → 768 and S4 now applies everywhere. That is
M3's stated outcome (_"`scrollWidth ≤ clientWidth + 1` extends to 960 and 768"_), met with numbers.

Surface Pro landscape (1440) shows **every Row-1 command inline** — the ten that remain after the
fold — with nothing demoted; the `⋯` holds only the tier-3 set M2 put there.

## 4. Two observations recorded rather than fixed

**O1 — the item count is not monotone in width.** Row 1 shows **8** inline at 1280 and **10** at
1024, because the collapsed band trades labels for commands and the condensed band does not. Nothing
is unreachable (the two extra live in the `⋯` at 1280), and the fix is D3's icons, which is why they
are one debt row and not two. Row 2 has the same shape at 1440 (13) versus 1280 (14).

**O2 — 768 is measured but is not a named target.** Surface Pro portrait is **960** CSS px; 768 is in
the gate's list and now passes, which is strictly better than the scroll it had, but no device in the
spec sits there. Worth knowing before anyone reads the 768 row as a device commitment.
