# The command surface — a reshape, not a fourth fitting

> **Read this against `docs/specs/workspace-layout/`, `workspace-modes/` and `workspace-chrome/`
> before disagreeing with it.** Everything below is built on those epics' own measurements, not on a
> fresh opinion about their outcome. Where a number is mine it says so, and it is a **prediction that
> M0 must falsify or confirm** — because the single most repeated finding in those three epics is
> that a width expectation was contradicted by its own measurement.

---

## 1. What three epics established

ADR-0090, ADR-0091 and ADR-0092 are, between them, the most measured work in this repository. The
outcome is genuinely good and it is not in dispute. What is worth reading is **what it took**.

| Fact                                                                                                | Source                                                                                |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| The row shipped **46 registered items / 44 toolbar stops**                                          | `workspace-layout/m2-item-widths.md`                                                  |
| It was **109 px over its container at 1920 with no `⋯` rendering at all**                           | ADR-0090 Context — a live WCAG 2.5.8 failure                                          |
| Consolidation took it to **32 stops** and bought labels at 1920                                     | `m2-item-widths.md` "The decision landed"                                             |
| **Four commands are now permanently in the `⋯`** at every width                                     | same — `Next conflict`, `Float paths`, `Keyboard shortcuts`, `Clear visual placement` |
| At **1646** (the product owner's screen) Row 2 fits in **1630 px** of container                     | `workspace-modes/m7-ladder-measurement.md` §1                                         |
| Costing the `⋯` correctly **took Row 2 from 12/14 labels to 5/14 at 1646**                          | same, §2 — "a net narrowing on the day it lands"                                      |
| `CHROME_RESIDUAL_PX = 56` **over-charges Row 2 by ~47 px**, and that is the same width as §2's loss | same, §3                                                                              |
| The three bands above the canvas cost **134 px**; total chrome **249 px, 31 %** of the workspace    | `workspace-chrome/m0-band-measurement.md` §2                                          |
| Merging the identity line into the **app header** is **134 px short at 1646** and was **withdrawn** | same, §4a; ADR-0092 M5                                                                |

And four decisions, each correct, each a patch on the same shape: `showLabel` is presentation and
`tier` is priority (ADR-0031); a preset is a command, not a derivation (ADR-0056); the band width may
never be an input to a fit decision (ADR-0091 M7); a shrink-to-fit row must never demote (same).

**The register's own retrospectives read as a fight against a shape.** That is the coordinator's
phrase and it is fair. `m2-item-widths.md` ends with the trade put to the product owner in these
terms: _"labels at 1920 cost all three of `shortcuts`, `next-conflict` and `float-paths`, and the
last two are commands a planner uses to trace logic, not conveniences."_ A design system that makes a
product choose between naming its commands and having them is not serving the product.

---

## 2. The diagnosis: it is a menu bar rendered as a row

`TOOLBAR_GROUPS` (`toolbar-registry.ts:19-32`) is a closed seven-member tuple in canonical order:

```
frame · lens · find · tools · object · output · help
```

Read those as nouns rather than as layout: **frame** is how you look at time, **lens** is what the
diagram encodes, **find** is how you locate work, **tools** is how you author it, **object** is what
you do to the plan, **output** is how the plan leaves the product, **help** is help.

**That is a menu structure.** ADR-0031 designed the menus in 2026-07; ADR-0090, ADR-0091 and ADR-0092
spent three epics rendering them as a row and making the row fit. The registry is not the problem and
has never been the problem — it is a good, compiler-enforced, gated, tested piece of design. The
**renderer** is a flat horizontal bar, and a flat horizontal bar is the wrong instrument for
thirty-two commands.

Four symptoms follow directly from the shape, and only from the shape:

1. **Labels are all-or-nothing per row.** `Toolbar.tsx:286-310` sums the whole `bar`, not the inline
   half, so _"one 121 px label anywhere on the bar suppresses all of them"_
   (`m2-item-widths.md`). A menu never faces this question: a menu item always has its name.
2. **The `⋯` is an unnamed container for four named commands.** A planner looking for `Float paths`
   has to know it is behind a glyph that means "more".
3. **Every width decision is a subtraction.** `computeLadder`, the four band floors, the 48 px
   hysteresis, `CHROME_RESIDUAL_PX`, the `⋯` costing — the entire apparatus exists to decide **what
   to drop**. A menu bar drops nothing.
4. **The vertical cost buys the horizontal.** Two rows exist because one will not hold the commands.
   134 px of a 807 px workspace at 1646 is spent on the chrome above a diagram, and 31 % is the
   number the product owner reported as "taking up canvas space" (ADR-0092 Context).

---

## 3. The proposal

**One band. A menu bar, a short command strip, the two mode switches, the pen.**

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  Riverside · Logic  [Draft]   Plan▾ Edit▾ View▾ Insert▾ Analyse▾  │ ⌕ ⤺ ⤻ ⊕ ⇄ ⌖ ⊞ ⟳ │  │
│                                        Early|Visual  Diagram|Gantt  │  Stop editing   │
└──────────────────────────────────────────────────────────────────────────────────────┘
                                    ↑ one band, ~44 px
```

- **Identity, reduced.** The plan name and its status badge. The path (`Clients / Northgate /
Riverside /`) goes — the Project Explorer already shows where you are, and ADR-0092 M0 measured
  dropping it at **199 px**.
- **Five menus**, always labelled, at every width, in the registry's own group order:
  `Plan` (object) · `Edit` (tools) · `View` (frame + lens) · `Insert` (tools, authoring) ·
  `Analyse` (find + output). `Help` folds into the account menu, where ADR-0091 M7 already sent
  keyboard shortcuts.
- **A short strip of always-visible commands** — the handful a planner presses constantly, icon-only,
  each also present in its menu with the same accessible name.
- **The two mode switches**, which ADR-0091 correctly identified as **modes, not commands**.
- **The pen**, reduced to its button. ADR-0092 M0 measured the badge and the live-region sentence at
  **223–257 px of pure redundancy** beside a button that already reads `Stop editing`.

### 3.1 The arithmetic, from ADR-0092's own measurements

Every input below is measured, in `workspace-chrome/m0-band-measurement.md` §3–§4, on the product
owner's width. Only the two menu-and-strip figures are mine.

| term                            | px        | source                                          |
| ------------------------------- | --------- | ----------------------------------------------- |
| identity line, as shipped       | 1151      | measured, §3                                    |
| — less the breadcrumb path      | −199      | measured, §4                                    |
| — less the pen badge + sentence | −257      | measured, §4 (pen-available, the arrival state) |
| **identity, reduced**           | **695**   | derived from measured                           |
| five labelled menu triggers     | ~425      | **estimated** — see below                       |
| eight icon-only commands + gaps | ~285      | **estimated** — 32 px each, measured unit       |
| group rules and gaps            | ~60       | 13 px + 4 px units, measured                    |
| **total**                       | **~1465** |                                                 |
| **container at 1646**           | **1630**  | measured, `m7-ladder-measurement.md` §1         |
| **slack**                       | **~165**  |                                                 |

The two estimates are the weak points and are labelled as such. A menu trigger is one word plus a
caret: the measured comparators are `view` at **91 px** and `zoom-preset` at **102 px**
(`m2-item-widths.md`), both of which are labelled triggers with chevrons, so ~85 px each is a
defensible figure and not a hopeful one. **It is still an estimate, and M0 measures it before
anything is built.**

**Vertical: two rows removed, 45 + 44 = 89 px returned to the canvas** — taking it from 558 px to
~647 px at 1646, a **16 % increase in the diagram**, which is more than the whole of ADR-0090,
ADR-0091 and ADR-0092 delivered between them. That figure is arithmetic on measured band heights and
must also be re-measured, because ADR-0092 M4 records a merge that _"gained exactly nothing"_.

### 3.2 What this deletes

- `computeLadder`'s label pass, the four band floors, `LABEL_CHROME_PX`, `LABEL_PROMOTION_MARGIN_PX`,
  `CHROME_RESIDUAL_PX`, the 48 px hysteresis, the `⋯` costing, tier-3 admission, and the
  "shrink-to-fit rows must never demote" rule — **because there is nothing to demote.**
- The four permanently-overflowed commands' exile. They become menu items with names.
- `docs/TECH_DEBT.md` **#126** (four segments with no icons) — the mode switches keep their labels
  because the band has room; there is no condensed state that needs a glyph. **#131** (an icon-only
  control names itself only on hover) survives for the eight-item strip and is answered by the rule
  in `design.md` §4.4, not by this shape.

### 3.3 What this keeps, entirely untouched

**The registry.** Every `defineToolbar` item keeps its `group`, `tier`, `isEnabled`, `disabledReason`,
pen gating, `demotionGroup` and `onActivate`. Forty-six registrations and all their gating logic are
unchanged; **`tier` simply stops meaning "how likely to be dropped" and starts meaning "on the strip,
or in the menu"** — which is what a two-value prominence axis should always have meant.

That is the strongest single argument for this shape: it is a **renderer** change to a data structure
that was designed for it, and the registry's own gates (`selection-duplication.structural.test.ts`,
the taxonomy's closed tuple, the reason wiring from ADR-0082) all keep working.

### 3.4 The APG pattern, and what it costs to build

`menubar` rather than `toolbar`. Left/Right move between menus; Down/Enter opens one; once one is
open, moving to a sibling opens it; Esc closes and returns focus. `Menu`/`MenuItem`
(`components/ui/menu.tsx`) already supplies the hard half — portalling, roving arrow focus,
`Esc`/`Tab`/click-away, focus-return — and **ADR-0082 already made disabled items focusable with a
linked reason**, which is exactly what a menubar needs to shade a pen-gated command instead of hiding
it.

The work is the bar itself: sibling navigation, open-on-traverse, and the single-focus-stop rule.
That is a bounded, well-specified primitive with a published pattern, and it is smaller than the
ladder it replaces.

---

## 4. Alternatives, and why not

- **A fourth fitting pass.** Reduce further, shorten more labels, tune the residual. **Rejected on
  the evidence**: `m2-item-widths.md` establishes that Row 1's labels at 1920 cost three commands,
  two of which trace logic. The row is at its floor; the next pass takes function.
- **A ribbon** (tabbed groups, labelled, in a taller band). Genuinely solves the label problem and is
  what P6 and MS Project use. **Rejected because the complaint is vertical**: a ribbon is 90–120 px,
  which is worse than the 134 px it replaces once you add the identity line back. It also hides
  groups behind tabs, which is the `⋯` problem with better manners.
- **A command palette only** (⌘K, no bar). Excellent for the planner, **wrong for this product's
  secondary users** — `PROJECT_BRIEF.md` §4 names project managers and superintendents who are _"less
  scheduling-savvy — need the visual view to be immediately readable"_. A palette is discoverable only
  if you already know the command's name. **A palette is a good addition later; it is not the shape.**
- **A left vertical rail of commands.** Trades vertical for horizontal — but on a time-scaled diagram
  the horizontal axis **is time**, so width is the scarcer resource on the surface that matters. It
  also puts the commands furthest from the canvas's own dock.
- **Keep two rows, move the modes and pen into the app header.** ADR-0092 M5 **measured this and
  withdrew it**: 456 px of tidying, still 134 px short at 1646, and closing it costs the organisation
  nav, the wordmark or the mode labels. Do not re-propose it; it has a number.

---

## 5. The risks, stated before they are discovered

1. **A menu is a click deeper.** This is the real cost and it is not softened. Eight commands stay
   inline; every other command that a planner presses often now takes two actions instead of one.
   **There is no telemetry in this product**, so the eight cannot be chosen from data. They are
   chosen by the product owner from a shortlist, the choice is recorded as **provisional**, and the
   strip is a registry field so revising it is one edit.
2. **165 px of slack is thin**, and a long plan name eats it. The name truncates with a `title`, as a
   breadcrumb crumb already does — but if M0 measures the slack below ~120 px, the strip drops to six
   items before anything else gives.
3. **Menu bars are unfashionable in web applications.** True, and mostly irrelevant here: this
   product's users arrive from P6, MS Project and Netpoint, all of which have one
   (`PROJECT_BRIEF.md` §4 — _"comfortable with concepts like WBS, logic, float"_, §6 — the tools they
   are switching from). The fashion argument is worth naming so it is dismissed on a reason rather
   than ignored.
4. **It is a large behavioural change to the surface with the most test coverage in the product.**
   Nine of the thirty-three journeys touch the toolbar. All are run; several will need their locators
   moved from `[data-toolbar-item]` to a menu item. ADR-0091's retrospective's own rule applies:
   after any layout change, run every journey.
5. **The eight-item strip re-creates a small ladder.** It has to fit at 768. Eight 32 px controls plus
   gaps is ~285 px, which fits in a 752 px container with room, so the ladder is trivial — but it is
   not zero, and pretending it is would be the mistake the last three epics record.

---

## 6. How this is decided — measurement first, and the gate

**M0 measures before anything is built**, because this document's two estimates are exactly the class
of number this repository has been wrong about four times running.

1. Render five labelled menu triggers and the eight-item strip into the existing harness
   (`apps/web/measure-toolbar/item-widths.spec.ts`) at **1646, 1440, 1280, 1024, 768**.
2. Report the band's total against each container, and the vertical stack against the 2026-08-13
   baseline (`workspace-chrome/m0-band-measurement.md` §2: header 56, identity 45, row 1 45, row 2 44,
   above-canvas 249, canvas 558).
3. **If the band does not fit at 1646 with ≥ 120 px of slack, this proposal is withdrawn and the
   fourth-fitting option returns.** That is the falsification condition, written down before the
   measurement, which is the one discipline these three epics converged on.

**The gate afterwards** is the existing `e2e-toolbar-fit`, re-pointed: its S3 (every command
reachable), S5/S7 (target size), S9 (the `⋯` is rightmost) and S10 (a trailing group really trails)
become assertions about a menubar — and **S3 gets easier and more meaningful**, because "every
command is reachable" stops being "reachable via an unnamed glyph" and becomes "reachable by name".
