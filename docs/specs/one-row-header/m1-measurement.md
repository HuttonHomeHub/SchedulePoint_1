# M1 measured — the pen sentence's move, before and after

> Measured 2026-08-26 against a real Chromium on a populated plan with the pen **held**, using
> `apps/web/measure-toolbar/m1-merged-probe.spec.ts` (horizontal) and
> `apps/web/measure-toolbar/vertical-stack.spec.ts` (vertical). The "before" run is the same
> harness on a stashed tree, not a remembered figure.

## The horizontal result matches the prediction exactly

`falsification.md` predicted, from the pre-split DOM, that the pen cluster would fall from **320 px**
(badge + sentence + controls) to **165 px** (badge + controls). Measured on the shipped code:

| reading                      | before   | after    |
| ---------------------------- | -------- | -------- |
| pen cluster                  | 320      | **165**  |
| identity row, required width | **1218** | **1063** |
| merged row, required width   | 1482¹    | **1482** |

¹ the pre-split figure was a _projection_ — the shipped row with the sentence's width subtracted.
The post-split figure is the same row **measured**. They agree to the pixel, which is the strongest
statement available that the projection was sound.

**The live defect this closes.** The identity row's container at 1280 is 1222 px, so before this
change it had **four pixels** of headroom and any plan name longer than the fixture's truncated. It
now has **159**.

## The vertical result: zero cost, and that was the open risk

The implementation plan flagged this as M1's one real hazard, in its own words: _"the status row
gains height where it had none, eating the epic's saving"_ — grid row 3 is `empty:hidden`, and on a
wide layout the facts are adopted by the activities handle row, leaving that row genuinely empty. An
always-mounted pen outlet **beside** `PlanFactsHost` would have kept it non-empty and bought ~24 px
of chrome in exchange for 155 px of width. That is the wrong direction for an epic whose subject is
the height above the canvas — ADR-0092 M4's _"relocating a row inside one column removes nothing"_,
one row down.

So the outlet went **inside `PlanFacts`** instead, and the sentence follows the facts to whichever
host has them. Measured, at four widths, before and after:

| viewport  | `aboveCanvas` before | after   | canvas before | after   |
| --------- | -------------------- | ------- | ------------- | ------- |
| 1280×900  | 411                  | **411** | 200           | **200** |
| 1440×960  | 295                  | **295** | 346           | **346** |
| 1646×1097 | 295                  | **295** | 483           | **483** |
| 1920×1080 | 295                  | **295** | 466           | **466** |

Not one band changed height. The risk did not materialise **because of where the outlet went**, and
the first design would have realised it — which is why this was measured rather than reasoned about.

## What the harness got wrong, and it was the third time in one file

The probe located the pen cluster by searching the page for one of the ten lock sentences and taking
its enclosing `role="status"`. That is correct only while the sentence and the controls are one
element. The moment M1 portalled the sentence away, the expression resolved to **the sentence's new
home in the facts row**, and the merged-row figure came back 166 px lighter — because it no longer
contained the pen at all.

An instrument that silently changes subject at precisely the change it exists to measure is worse
than no instrument. It is the third such defect in this one file: `inkOf` measuring a span rather
than content (`#198`), `inkOf` then measuring leaf rectangles and so missing every button's padding
(266 px), and now this. The fix is a stable `data-plan-pen` hook on the controls container, beside
the `data-plan-identity` that exists for the same reason — and the figures above are all post-fix.

**No number in this file was quoted before that repair.**
