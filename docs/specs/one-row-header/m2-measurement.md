# M2 measured — the merged header row, shipped

> Measured 2026-08-26 against a real Chromium on a populated plan with the pen **held**. Every
> figure is re-derived from the shipped markup; the design's own numbers are quoted only to be
> compared against it.

## The row behaves as designed, at the width the epic exists for

| viewport | container | required | lines (live) | row height |
| -------- | --------- | -------- | ------------ | ---------- |
| 1280     | 1222      | 1482     | **2**        | 84         |
| 1440     | 1382      | 1482     | **2**        | 84         |
| 1646     | 1588      | 1482     | **1**        | 36         |
| 1920     | 1862      | 1482     | **1**        | 36         |

The pre-build projection said the row would require **1482 px** and wrap below a container of
**1480**. Shipped, it requires **1482** and wraps below **1480**. There is no breakpoint constant
anywhere in the change — the browser decides, and it decides where the product owner asked.

## The vertical result, before and after

The whole point. `aboveCanvas` is the chrome between the top of the viewport and the canvas.

| viewport  | `aboveCanvas` | → after | canvas | → after |
| --------- | ------------- | ------- | ------ | ------- |
| 1280×900  | 411           | **402** | 200    | 200     |
| 1440×960  | 295           | **286** | 346    | **355** |
| 1646×1097 | 295           | **250** | 483    | **528** |
| 1920×1080 | 295           | **250** | 466    | **511** |

**At 1646 — the product owner's Surface Pro, and the width the complaint was raised from — the
canvas gains 45 px, +9.3 %.** No width regresses: at 1440 and 1280 the header takes a second line
(56 → 84 px) and the band gives back the identity row's 45 px, netting −9 px of chrome.

The 45 px comes out of the **command band** (166 → 121), not out of the header: the header row
absorbed the identity content inside the height it already had. That is the outcome ADR-0092 M4's
_"relocating a row inside one column removes nothing"_ warns is **not** guaranteed, so it was
measured rather than assumed.

## The finding: the assertion passed against the wrong code, and the comment was wrong

The journey's headline case — one line at 1646, two at 1440 — was verified against both failure
modes the design names. Against a shrinkable mode cluster and against `flex-1` **on the identity
slot** it fails at 1440, one line where two are expected. Against `flex-1` restored on the identity
block **inside** the slot it **passes**.

That third run is the useful one. `plan-workspace-toolbar.tsx` carried a comment calling that inner
line _"the single line the one-row header turns on"_, and it is not: the header row's children are
the brand, the **slot** and the trailing group, so what the block does inside the slot cannot make
the row wrap or stop it. The load-bearing line is in `chrome-slot.tsx`. The claim was written before
it was checked (ADR-0076 Class 3) and survived a build, a measurement and a green journey; it was
caught only because the test was run against the state it was supposed to reject and refused to go
red. Both comments now say what was established and how.

## What the instrument got wrong this time

Two more, in the same file, both the same shape as the three before them:

1. **Per-occupant labels outlived their DOM.** The probe named the header's three children `brand` /
   `orgSwitcher` / `account` for the `1fr auto 1fr` grid. M2 replaced that grid with
   `[brand] [identity slot] [org + account]`, and the same indices came back under the same names —
   reporting the identity slot as `orgSwitcher: 1063`. Plausible, wrong, and nothing in the reading
   said so. The children are now listed by position with their own text.
2. **The composed hypothetical row became a double count.** Before M2 there was no merged row, so the
   probe built one from occupants on two rows. Once the row existed, `headerCells[1]` _was_ the
   identity slot and the identity block, mode cluster and pen cluster are all inside it — so adding
   them beside it counted each twice. It still returned a plausible 1482, four pixels from the truth
   by luck. The composition is deleted; the row itself is measured.

## M2-T5 — the twelve screens this epic is not about, photographed

`node scripts/shoot.mjs --width 1646`, looked at rather than described. **Q1 is realised and it is
fine**: on every `_authed` route that is not a plan, the organisation switcher is no longer centred —
it sits at the trailing edge beside the account chip, and the middle of the header is empty.

Judged from the pictures, that is **not worse**, and arguably better: brand-left / account-right is
the conventional shape, and a lone centred switcher on an otherwise empty navy band read as a
floating island rather than as a centre. The header's height is unchanged on those screens (the row's
one line still clears `min-h-14`), so nothing below it moves. Recorded as accepted, not as
unnoticed — the plan asked for this to be seen before it was judged, and it was.

**What the change made worse, on the same evidence: nothing that showed up in 21 shots.** Recorded in
those terms deliberately, because "we looked and found nothing" is a weaker claim than "there is
nothing", and 21 is not all of them — see below.

**The harness could not finish, and that is pre-existing.** The run throws after 21 shots in
`toggleViewSwitch`, taking the three canvas-lens shots with it. Verified against the stashed
pre-change tree, where it fails identically, so it is not this epic's; filed as
`docs/TECH_DEBT.md` #199 rather than fixed on a guess, because its own docblock records the previous
version of that helper failing the same way and being corrected **by probing the live DOM**.
