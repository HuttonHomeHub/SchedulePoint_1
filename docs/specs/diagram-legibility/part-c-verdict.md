# Part C — what shipped, what was withdrawn, and the numbers

- **Conditions:** [`./part-c-conditions.md`](./part-c-conditions.md) (committed alone, before any
  harness existed)
- **M-C0's measurements:** [`./part-c-m-c0.md`](./part-c-m-c0.md)
- **Status:** Approved

---

## The short version

| milestone                    | outcome                                                              |
| ---------------------------- | -------------------------------------------------------------------- |
| **M-C1** the gutter          | **WITHDRAWN** — FC-C3 fails at every pitch, in both halves           |
| **M-C2** the `Arrange` offer | **SHIPPED**, closing `docs/TECH_DEBT.md` #363                        |
| **M-C3** the crossing router | **SHIPPED** — **−20.8 %** whole-plan crossings per link, zero height |
| **M-C4** the layout rule     | **WITHDRAWN** — all three candidates are **worse** than what ships   |

Two of the four milestones were withdrawn on their own committed conditions, and the epic is better
for it: the product owner offered unlimited vertical space and the measurements say the space was
never the currency.

---

## M-C3 — the crossing-aware corridor pass

`routeOrthogonal` chooses a corridor for what it **hits** — a bar in a lane it passes through — and
has never had an opinion about what it **crosses**. The complaint that opened this epic was about
crossings, so this is the half of the remedy that costs no vertical space, which is why it was
sequenced before the layout rule.

### What it does

A post-pass beside `bundleCorridors`, run **before** it: each four-point elbow moves to the
candidate x at which its **whole line** crosses fewest others, measured against a **frozen**
snapshot of every horizontal and vertical on screen.

Four properties, in the order they matter:

1. **It never measures its own output.** The snapshot is taken once; moving a corridor moves the
   two horizontals attached to it, and a chooser that re-read the geometry as it went would be
   ADR-0090's recorded oscillation with a different subject.
2. **It never undoes the routing.** A corridor moves only to an x free of bars across every lane it
   crosses — the same `isLaneFreeAt` test `routeOrthogonal` applies, and the same hazard
   `bundleCorridors` records.
3. **It moves only on a strict improvement**, with a fixed candidate order, so the same frame always
   produces the same lines (ADR-0065: a route that varies between frames reads as the diagram
   twitching).
4. **It moves the line only** — lag anchors, drag handles and hit zones are computed before it runs
   and are not passed in, which is structural rather than remembered.

### The measurements, and what each one changed

Unit 300, whole-plan, 188 links on every side, baseline **2.612** crossings per link:

| what was tried                                         |  per link | vs baseline | kept?                        |
| ------------------------------------------------------ | --------: | ----------: | ---------------------------- |
| score the **corridor only**                            |     2.622 |  **+0.4 %** | no — very slightly worse     |
| score the **whole line** (corridor + both horizontals) |     2.596 |      −0.6 % | yes                          |
| …and let **adjacent-lane** corridors move too          | **2.069** | **−20.8 %** | yes — most of the result     |
| …and re-snapshot after every move (O(N²))              |     2.037 |     −22.0 % | **no** — 1.2 % for a rebuild |
| …and sample the span at 16 points instead of 17 fixed  |     2.032 |     −22.2 % | **no** — 0.2 %               |

**The single decision worth carrying is the third row.** `routeOrthogonal` returns today's elbow
unexamined when the two endpoints are within one lane of each other, because it is answering "could
this hit a bar?" and the answer is no. Inheriting that early return excluded **115 of 188 links** —
61 % of the diagram — and the pass was worth −4.1 % with it and **−20.8 %** without.

### What it does NOT clear

FC-C2's floor is a **50 %** reduction, and that condition governs the layout rule rather than the
router. The router's own condition was "if it is negligible, it is withdrawn": 20.8 % at zero
vertical cost is not negligible, and it ships. The floor is recorded as **not met** rather than
reinterpreted.

FC-C4 limb B holds: `paint.routing-budget.test.ts` is green **without being edited**.

---

## M-C4 — the layout rule is WITHDRAWN, and all three candidates are worse

The product owner re-aimed this milestone on M-C0-T2b's evidence: height does not buy legibility
(144 rows against 21 differs by under half a per cent at the two working zooms) and assignment
quality does (a random assignment at constant height is 2.7× worse). So a candidate became an
**assignment rule**, with the height it needs an output rather than a budget.

Three plausible rules were built in the harness — measured before anything was built in the product
— and **every one is worse than what ships**. Whole-plan, 188 links on every side, 4 px/day:

| assignment                  | rows |  per link |  vs shipped |
| --------------------------- | ---: | --------: | ----------: |
| **shipped** (packed + hint) |   21 | **1.691** |           — |
| A chain rows                |   28 |     3.144 | **+85.8 %** |
| B near predecessors         |   28 |     1.856 |  **+9.7 %** |
| C depth-first pack          |   23 |     2.761 | **+63.2 %** |

**FC-C2's withdrawal clause fires as written**: every candidate is below the 20 % at which the
decision would have gone to the product owner, so M-C4 does not ship and is recorded as
measured-and-rejected.

### Why chain rows — the most intuitive idea in the epic — is the worst

A chain drawn on one row has no vertical corridor at all, which is what a NetPoint diagram looks
like and what the product owner's screenshots were compared against. On this programme it is
**86 % worse**, and the reason is visible once measured: reserving a row for a chain pushes
everything else up, so every link that is _not_ in that chain travels further — and a 144-activity
programme has far more cross-chain links than chain links. The idea is right about the chain and
wrong about the diagram.

### What this does not say

- **Not that assignment does not matter.** The scramble is 2.7× worse than what ships, so a bad
  assignment is very bad indeed. What the measurement says is that the shipped greedy first-fit
  with its predecessor hint is already near the good end, and that three plausible improvements on
  it are not improvements.
- **Not that no rule could win.** These are three implementations. A fourth idea is not excluded —
  it would need its own measurement, and the harness to take it is committed
  (`apps/web/scripts/measure-assignment.mjs`).
- **Not that the re-aim was wrong.** It was the right question; the answer came back negative, which
  is what a falsification condition is for.

## M-C5 — the gate pass

Three specialist reviews over the combined Part C diff: **component** returned nothing blocking,
having re-derived the epic's own figures from the shipped code (`32 → 41` and `50 → 41` reproduced
by running `measure-arrange-cost.mjs` itself, and the memo-stability question of ADR-0133 D6 traced
dependency by dependency and cleared). **Accessibility** and **UX** each blocked, and **they reached
the same defect independently**.

### Folded, each with a regression test verified red first

1. **`Dismiss` dropped focus to `<body>`** — WCAG 2.4.3 (A). Pressing it flipped
   `arrangeOfferDismissed`, which unmounted the strip holding the button being pressed, with
   nothing moving focus first. On this surface that is also _silent_: the workspace's keyboard
   accelerators are a React `onKeyDown` on a root of which `<body>` is an ancestor, so a planner
   who dismissed the offer lost Undo, Escape and the arrow keys with nothing on screen saying so.
   **The fix pattern was eleven lines above in the same file** — the empty strip's "Draw the first
   activity" button focuses the listbox _before_ arming the mode that unmounts it, under a comment
   citing this exact criterion. One correct pattern applied to a control and not its neighbour, for
   the ninth recorded time in this register, inside a strip written three days after reading the
   one that has it.

   The test that should have caught it existed and asserted the wrong thing: it checked the strip
   was gone, which passes identically either way. Verified red by a targeted mutation (removing the
   one `listboxRef.current?.focus()` line, since stashing the file removes the whole uncommitted
   feature and produces a red run that proves nothing), reporting exactly
   `expected <body> to be <ul role="listbox">`.

2. **The success path had the same hazard one step later**, and it was raised as a _risk_ rather
   than a finding — "not certain from source" — so it was checked rather than filed. A native
   `<dialog>` restores focus on close to whatever held it when `showModal()` ran; by then the write
   has landed, `arrangeSummary.changes` is empty and the strip has gone, so the dialog would hand
   the planner back to a button that no longer exists. Fixed at the **strip's call site only** —
   the toolbar shares `openAutoArrange` and its own trigger survives its press, so moving focus
   inside the shared handler would take a stable restore target away from the other caller.

   **Asserted in the journey, not in a unit test**, because jsdom has neither a top layer nor
   native focus restoration: no unit suite here can ask the question at all. And it was **settled by
   experiment rather than left as a judgement** — removing the one line turns `e2e-arrange`'s step
   (5) red with focus on `<body>`, so the risk the reviewer could not confirm from source is real,
   and the assertion written for it discriminates. Left unchecked this would have gone either way:
   "probably fine" and "probably a defect" read identically in a review.

3. **The equal-rows sentence undersold the press.** "…and draw this plan in the same 9 rows" is
   accurate and reads as _nothing visible happens, so why press it_ — while the press still repacks
   every lane by time and prefers a lane already holding a predecessor, which is the whole of what
   Part C measures. The value was stated only in a test comment. The branch now names the
   **mechanism** (`…to pack them by time and logic, still drawing this plan in 9 rows`) rather than
   an outcome per link: the predecessor hint chooses among lanes that are **already free**, so it
   is a preference and not a guarantee, and promising the shorter link would have overclaimed.

4. **A stale docblock the insertion created.** `dock-strip.ts`'s "Last, and the ordering is the
   decision" block was written when `placement-migration` was the final case and now sat above the
   new `arrange-offer` branch, where a reader would attribute it to the wrong rung — and its
   "unlike its three neighbours it is dismissible" clause had stopped being true, because
   `arrange-offer` shares that property. Re-seated above its own `if` and the clause corrected to
   say why the two are separated by the live/historical test instead.

5. **A journey locator that worked by precondition.** `page.getByRole('button', { name: 'Arrange' })`
   avoided a strict-mode failure only because the assertion above it established that the strip was
   hidden. Now `[data-toolbar-item="auto-arrange"]`, per the ADR-0091 M7 rule.

### Filed rather than folded

Four non-blocking findings are `docs/TECH_DEBT.md` **#366**, and none is a defect in this diff: the
shared "Arrange" name, the offer's omission from a pen-less Planner (which is #114.1 reaching a
second consumer and **cannot** be fixed here — the fused `canEdit` boolean makes the honest sentence
unwritable), "session" really meaning "mount", and the toolbar context's looser-than-documented
`canAutoArrange`.
