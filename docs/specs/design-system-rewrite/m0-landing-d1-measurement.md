# Landing D1 M0 — what the organisation nav is actually worth

**Date:** 2026-08-19 · **Harnesses:** `measure-toolbar/vertical-stack.spec.ts` (re-run) and
`measure-toolbar/menu-band.spec.ts` · **Verdict: PROCEED — and the stated rationale was wrong.**

Taken under the rule CLAUDE.md §19.10 gained the same day: **re-verify a spec's problem statement,
not only its design.** It has now changed three decisions in one session.

## The two corrections

**1. The nav is 540 px, not 637.** Three figures were in circulation for one measurement — 637
(`screens.md` §0, CQ-G), 620 (`m4-vertical-stack.json`, before today) and ~517 (ADR-0092 M5) — and
all three predate ADR-0098 M5 removing the **Overview** item this morning. Re-measured now:
**540 px** at 1646. Removing that one link cost 80 px, which is most of the gap between the two
larger figures.

**2. The header is not "the scarcest width in the product".** CQ-G's headline says freeing the nav
frees 637 px _of the scarcest width in the product_. Measured, the app header at 1646 uses **935 px
of 1646 and has 711 px free** — 43 % spare. The scarcest width in this product is the **plan
command band**, which the Landing C measurement put at **27 px** of slack the same day, and the
organisation nav is not in it.

So the sentence is false as written. **The correct argument is better**, and it is the one ADR-0092
M5 already implied without a number against it.

## What the nav actually buys: the band merge

ADR-0092 M5 wanted the plan identity line folded into the app header, and **withdrew it** — "134 px
short at 1646" — noting that closing it would cost the organisation nav. That is now costed.

| width | header free today | free if the nav leaves | tidied identity content | spare    |
| ----- | ----------------- | ---------------------- | ----------------------- | -------- |
| 1440  | 505               | 1045                   | 795                     | **+250** |
| 1646  | 711               | 1251                   | 795                     | **+456** |
| 1920  | 985               | 1525                   | 795                     | **+730** |

**Without** the nav leaving, 1646 is 711 against 795 — **84 px short**, which corroborates
ADR-0092 M5's independently-derived 134 px within the difference the Overview removal explains.
**With** it, the merge closes at every width measured, including 1440.

"Tidied identity content" is the plan name (227) + status badge (46) + the mode cluster (412) + the
pen button (110) = **795 px**, measured. The breadcrumb **path** (455 px) is what tidying drops, and
ADR-0092 M0 already established the pen badge and its live-region sentence as 223–257 px of pure
redundancy beside a button reading `Stop editing`.

## The short-name trap, avoided for the third time today

`vertical-stack.spec.ts` creates its fixture plan as **`Logic`** — five characters. So does
`item-widths.spec.ts`. The plan-name crumb measures **37 px** there and **227 px** for
`Riverside — Phase 2 Substructure`, an ordinary construction plan name and shorter than many.

That 190 px is not a rounding error: it is what reversed the Landing C verdict from PROCEED to
WITHDRAWN four hours earlier, and it is why the identity figure here is taken from the menu-band
harness (realistic name) rather than from the vertical-stack one (`Logic`), even though the header
figures come from the latter. The two agree to within a pixel once the correction is applied —
1121 + 190 = 1311 against a directly measured 1310 — which is the corroboration that makes mixing
them safe.

**The remaining fixtures should be renamed.** Two of this repository's four measurement harnesses
still measure the one term a documented risk is about at that term's most favourable value.

## Falsification condition, for the record

Written here because D1 did not have one and Landing C's is the reason this session has any
credibility about widths: **if the tidied identity content does not fit the freed header row at
1440 with ≥ 120 px of slack, the merge half of D1 is withdrawn and D1 ships as the navigation change
alone.** Measured: **+250 px at 1440.** It clears.

## The D1b blocking question, answered by reading rather than by inference

The identity row that D1b moves into the header contains the **mode `Toolbar`**. Inside the band it
takes its density from `ToolbarBandProvider`; moved into the header it would fall back to its own
`clientWidth` while being `shrink-0` — which reads exactly like ADR-0091 M7's trap, _"a shrink-to-fit
row must never demote"_, the one that once collapsed a row to 37 px holding nothing but a `⋯`.

**The first answer offered was wrong, and it is recorded because it was nearly shipped on.** The
inference was "its items are all `render` segmented controls, and `docs/TECH_DEBT.md` #134 says a
`render` item is not demotable, so the trap cannot fire". Reading
`tsld-toolbar-items.tsx:2142-2160`, `mode-early` is **not** a `render` item: it is an ordinary item
with `tier: 1`, `showLabel: 'always'`, an `onActivate`, and a `demotionGroup`. `Toolbar.tsx:352`
defines demotable as `typeof item.onActivate === 'function'`, so the mode items **are** demotable and
the inference was false.

**The real answer is a runtime guard, and it holds.** `Toolbar.measure` calls
`isWidthConstrained(container)` (`Toolbar.tsx:81-84`), which is `flexGrow > 0` read off the live
container. A `shrink-0` row is width-**un**constrained, and the comment at `:334-338` states the
consequence directly: such a row "is charged no chrome" and "never demotes", because its
`clientWidth` is an _output_ of the demotion decision. So the fit trap is closed by construction
wherever the row sits, and moving it into the header does not open it.

**What is genuinely left is density, not fit.** `toolbar-band.tsx:31-34` states the invariant: _the
band width may never be an input to a fit decision_ — it says how roomy the surface is, and the fit
question keeps reading the row's own box. Without a provider above it the mode row would resolve its
**density** from its own ~412 px content width and land in a narrow band. Its labels survive that
(`showLabel: 'always'`), but control padding does not.

**So D1b's requirement is one line, and it is the principled one rather than the cautious one:** the
header row is wrapped in a `ToolbarBandProvider` so the identity slot's toolbar resolves density
against the header, which is the surface it is now on. That is ADR-0091 M7's own fix applied to the
new host, and it is required for a real if minor reason rather than as insurance against a trap that
turns out to be guarded.

---

D1 therefore proceeds as scoped — one navigator instead of two, **and** the band merge ADR-0092 M5
withdrew — with the prize stated correctly: not "the header is cramped", but "the nav is exactly
what the merge costs, and there is 250 px to spare at the narrowest width we hold to".

---

## D1b, measured after the fact: **−45 px above the canvas, at every width**

**Date:** 2026-08-19 · **Harness:** `measure-toolbar/vertical-stack.spec.ts`

This is the check ADR-0092 M4 earned the hard way. That milestone folded the identity line into the
command band, and the honest finding was that relocating a row inside one column **"gained exactly
nothing"** — 257 px above the canvas before and 257 after, with the 8 px it did recover coming from
matching the rows' `py-1` rhythm rather than from the fold. A merge is not a saving; only removing a
row is. So D1b is not allowed to claim one without a number.

Both figures below were **measured**, not derived: the harness was run on `HEAD` (D1b) and again
with `apps/web/src` checked out at `HEAD~1` (D1a — the nav already in the rail, the identity still a
row of its own), on the same machine, in the same browser, against the same fixture plan.

| band                           | D1a     | D1b     |
| ------------------------------ | ------- | ------- |
| app header row                 | 56      | **56**  |
| identity row / slot            | 45      | 36      |
| command band (identity + rows) | 135     | **90**  |
| shell chrome band (total)      | 192     | **147** |
| **above the canvas**           | **240** | **195** |

| viewport  | canvas D1a | canvas D1b | gain                |
| --------- | ---------- | ---------- | ------------------- |
| 1920×1080 | 559        | **604**    | **+45 px, +8.1 %**  |
| 1646×1097 | 576        | **621**    | **+45 px, +7.8 %**  |
| 1440×960  | 439        | **484**    | **+45 px, +10.3 %** |

**The line that matters is the first one.** The app header row is **56 px in both states**: the
identity slot is 36 px and sits inside it, so the band did not grow to hold what moved in. That is
the difference between this and ADR-0092 M4 — there the row was relocated, here it is **absorbed**,
and the 45 px it used to occupy is gone rather than moved. Absorbed because D1a freed 540 px of
header width for it to be absorbed _into_, which is what that milestone was for.

`aboveCanvas` is taken from the canvas's own `getBoundingClientRect().top` rather than by summing
bands, so anything unaccounted for is included instead of quietly dropped — and it reconciles: the
chrome band fell 192 → 147, i.e. by exactly 45, and `aboveCanvas` fell by exactly 45.

**The gain is constant across the three widths, which is itself informative**: it says the saving is
a whole row leaving a vertical stack, not a layout that happens to pack better on a wide screen. The
_proportional_ gain is therefore largest where the canvas is smallest — 10.3 % at 1440×960, against
7.8 % at the product owner's 1646. A vertical saving is worth most to the reader with the least
vertical room, which is the opposite of how the horizontal work in ADR-0090/0091 behaved.

**One measurement note, recorded because the first attempt produced a wrong kind of answer.** The
harness located the identity row as "the command band's first child that contains a `nav`". After
D1b that element does not exist, and the harness **threw** — which is correct and is the rule
ADR-0091 M7 added after a `.filter()` silently dropped a missing band for the whole of ADR-0090 M5.
It now locates the identity by its slot (`[data-chrome-slot="identity"]`), which is the seam the
portal actually targets rather than a position that happens to be right today.

---

## What D1b broke, found by the sweep and not by a reviewer

**`e2e-programme` failed on `getByRole('link', { name: 'Riverside' })`** — a project link, clicked
from inside an open plan to get back to the project. That link was the **breadcrumb**, and D1b
dropped the breadcrumb path as 455 px of measured redundancy on the grounds that _"the Project
Explorer answers where am I"_.

That justification is right about **orientation** and wrong about **navigation**, and checking rather
than assuming showed the gap is larger than the failing assertion implies:

- `HierarchyTree.tsx:208-219` — `activate(row)` navigates **only for `kind === 'plan'`**. A client or
  a project row calls `tree.toggle(...)`. So a project is not reachable from the tree **at all**; it
  expands.
- The rows are `role="treeitem"` `<div>`s, not links, so even where the tree does navigate there is
  no href, no middle-click and no open-in-new-tab.

So the breadcrumb was not a duplicate of the rail. It was the **only** route from an open plan to its
project — the screen that hosts the project's Calendars section (ADR-0053 M2) — and after D1b the
route is Clients → the right client → the project, which requires knowing which client the plan
belongs to. That is a capability with no entry point (ADR-0081), shipped inside a milestone whose own
commit message called the thing it removed redundant.

**The deeper hole is the tree's, not D1b's.** ADR-0029 promises a Client → Project → Plan navigator
and two of those three levels cannot be opened. D1b did not cause that; it removed the workaround
that had been hiding it since the tree shipped. Both facts belong in the record, because fixing only
the visible half leaves the same trap for the next surface that stops carrying a breadcrumb.

---

## The merge does not fit below 1646, and the tidy estimate was wrong by ~375 px

**Date:** 2026-08-19 · **Harness:** `measure-toolbar/header-fit.spec.ts` (new)

The D1b write-up above measured the **vertical** stack, proved the band did not grow, and never
asked whether the row still fits **horizontally**. It does not, and the defect was live in what
shipped.

`header-fit` probes with `elementFromPoint` — the method `e2e-toolbar-fit` settled on after a
proposed gate would have passed a control shrunk to zero width — and reports:

| viewport  | header overflows | unreachable                                    |
| --------- | ---------------- | ---------------------------------------------- |
| 1920×1080 | no               | —                                              |
| 1646×1097 | no               | —                                              |
| 1440×960  | no               | **the SchedulePoint wordmark**                 |
| 1280×800  | **yes**          | **the wordmark**; `Stop editing` 80 px outside |

At 1280 `Stop editing` spanned 1218→1328 in a 1248 px header and **overlapped the account chip**
(1212→1264). At 1440 the wordmark — the route home — was covered and unclickable.

**That is ADR-0090 M1's defect, reproduced by the merge that was meant to be the cheap win**, and
`vertical-stack` structurally could not see it because it measures heights.

### The estimate

The merge was approved on "tidied identity content **795 px** against 1045 px freed at 1440 —
**+250 px slack**, gate ≥120". Measured, the identity content is **1126 px** before the crumbs and
**1172 px** with them. The estimate was low by about **375 px**, which is the whole of the slack and
then some. It is the **fifth** consecutive width expectation in this epic contradicted by its own
measurement, and the fourth in the same direction.

### Why it cannot simply be made to shrink

Four variants were measured, not reasoned:

| identity wrapper / `Toolbar` class    | header fits            | modes visible                |
| ------------------------------------- | ---------------------- | ---------------------------- |
| `shrink-0` / `shrink-0` (shipped)     | **no** — 1440 and 1280 | yes                          |
| `min-w-0` / `flex-1`                  | yes, every width       | **no** — all four in the `⋯` |
| `min-w-0 flex-1` crumbs / `min-w-0`   | **no** — 1440 and 1280 | yes                          |
| `min-w-0 flex-1` crumbs / `flex-auto` | yes, every width       | **no** — all four in the `⋯` |

The mechanism is understood: `Toolbar.measure` runs its ladder only on a width-**constrained** row
(`Toolbar.tsx:81-84`, `flexGrow > 0`), so without grow the four switches never demote and simply
overflow; with grow they demote, and `flex-1`'s zero basis makes the first measure see ~0 px so they
collapse into the overflow and never recover — a row measuring its own output, ADR-0091 M7's trap.
`flex-auto` starts at content width and still ends in the overflow, because the crumb block's
zero-basis `flex-1` takes the free space first.

**So there is no arrangement of shrink factors that fits the header AND keeps the modes visible at
1280–1440.** The content is simply wider than the space: brand 143 + account 52 + org switcher 192
leaves ~861 px at 1280, and the identity wants ~1170.

### What ships, and the open decision

The safe variant ships: the header **fits at every width measured and nothing is unreachable**, with
the four mode switches in the `⋯`. That is a usability regression against ADR-0091 D1 — _a mode is
not a command and belongs visible beside the pen_ — but it is reachable by pointer and keyboard,
which the shipped state was not.

**The decision is the product owner's and is stated rather than taken here**, because both answers
cost something real:

- **Withdraw the merge** (the ADR-0091 D4 / ADR-0092 M5 precedent — a requirement disqualified by its
  own measurement). Costs the 45 px; restores the modes beside the pen at every width.
- **Keep the merge and move the mode cluster back to the command band.** Without it the identity is
  ~770 px against 861 px available at 1280, so it fits — but the cluster then needs a home, and its
  own row is the 45 px back again.

Arithmetic says the second is feasible only if the cluster joins an existing row, which is a
`TOOLBAR_GROUPS` change and a milestone of its own rather than a fix.

---

## The merge is withdrawn for now, and a browser is what settled it

**Date:** 2026-08-19 · **Evidence:** `e2e-gantt`, two failures.

The safe variant shipped with the four mode switches in the `⋯` and that written up as an open
question. `e2e-gantt` then failed twice on `getByRole('button', { name: 'Gantt' })` and
`{ name: 'Diagram' }` — **the view switch**, the one control that gets a planner from the diagram to
the Gantt, reachable only through an overflow menu at every width.

That is not a locator nit and it is not a matter of taste. It is a real regression, found by
something that drove the real product, in exactly the way this epic's record keeps saying is the
only way these are found.

**So the mode cluster goes back to the band**, where ADR-0091 D1 put it, and the header keeps the
breadcrumb, the status pill and the edit pencil — ~770 px, which fits at every width measured
(`header-fit`: no overflow, nothing unreachable, 1280 → 1920). Re-measured: `aboveCanvas` returns to
**240 px** at all three widths, i.e. the 45 px D1b won is given back exactly.

**This is not the product owner's decision being taken.** It is declining to leave a shipped
regression in place while that decision is open. The two options are unchanged and both still cost
something real:

- **Leave it withdrawn.** The canvas keeps today's 240 px of chrome; the modes are visible beside
  the pen at every width. Nothing further is owed.
- **Re-attempt the merge with a home for the modes.** The identity fits the header without them, so
  the merge itself is sound — what it needs is somewhere for `Early | Visual | Diagram | Gantt` to
  live that is neither a band row of their own (which is the 45 px straight back) nor an overflow
  menu. Folding them into Row 1 is the only candidate that costs no height, and it reverses
  ADR-0091 D1's finding that a mode is not a command. That is a milestone, not a fix.

**What the epic keeps demonstrating, now five times running:** a width expectation was contradicted
by its own measurement. The approving estimate said 795 px of identity content and +250 px of slack;
the measured content was 1172 px. The number that mattered was never in the plan.
