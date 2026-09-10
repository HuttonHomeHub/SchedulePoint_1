# M0 measurement — the plan-workspace console

- **Status:** Accepted — the readings M1–M8 are built against (taken 2026-09-10)
- **Instrument:** `apps/web/scripts/measure-console.mjs`, run twice against the dev servers
  (`web-v0.125.3` tree at `1e238683`), Chromium via Playwright. Every band part is reported by
  **selector and rect**, never by arithmetic, and every task prints a **control** — a reading with a
  known answer — beside its result. The raw output of both runs is reproduced at the end.
- **Where it bypasses the product** (ADR-0081): the plan is seeded through the public REST API from
  inside the page; the pen is taken by API; study C's composition is an **injected stylesheet**
  (`scratchpad/toolbar-design/css/C-console.css`), a picture of the geometry and not the shipped
  code; T4 and T6 measure **real DOM cloned from the page**, not restyled pseudo-elements.

## 0. The control failed on the first run, and the failure is the first finding

The plan's control was _"180 px at 1646 and 1920, or the harness is measuring the wrong boxes"_. The
first run read **220 at 1646** and 180 at 1920. Re-run with the render study's 32-char plan name
(`PLAN_NAME='Riverside — Phase 2 Substructure'`) it read **180 / 180** — so the harness is right and
the difference is the **plan name**: at 74 characters (`Riverside Quarter — Phase 2 Substructure &
Superstructure Programme (Rev C)`) the identity row already wraps to **two lines at 1646 today**,
which is `pen-status.spec.ts`'s one-line assertion holding for its 39-char fixture and not for a
real programme's name. §5 below shows what closes it. Both runs are kept: the short-name run is the
one whose control the plan wrote; the long-name run is the one the product owner's screen will show.

| control                                                                   | short name | long name                        |
| ------------------------------------------------------------------------- | ---------- | -------------------------------- |
| band is 180 px today at 1646 and 1920                                     | **PASS**   | FAIL at 1646 (220): header wraps |
| foot is 55 px today at 1646                                               | PASS       | PASS                             |
| each deck group's width = children + gaps + padding, ±2 px, at all widths | PASS ×4    | PASS ×4                          |
| deck is 2 lines at 1646                                                   | PASS       | PASS                             |
| pen re-taken after the T6 release                                         | PASS       | PASS                             |
| foot returns to baseline after T4's clones are removed; baseline = §1     | PASS ×2    | PASS ×2                          |
| no group changes line between plan states at a given width                | PASS       | PASS                             |
| `matchMedia('(pointer: coarse)')` on the coarse page                      | PASS       | PASS                             |

## 1. M0-T1 — band and foot heights, today and under C

Decomposition today, short name, 1646 and 1920: **header 40 + rows child 121 (deck wrapper 120 =
`py-1.5` 6 + deck 108 + 6, plus its 1 px `border-b`) + 3 px amber rule = 180**. The study's
56 + 1 + 108 + 12 + 3 was wrong about the header (40, not 56 — `min-h-12` on the row, `min-h-14` on
the band's padding box does not reach 56 at this content) and right about everything else.

| width | today (short / long name) | C (short / long) | C + foot `py-1` (foot) |
| ----- | ------------------------- | ---------------- | ---------------------- |
| 1920  | 180 / 180                 | **141** / 141    | 51                     |
| 1646  | 180 / **220**             | **141** / 141    | 51                     |
| 1440  | 278 / 278                 | 141 / 189        | 51                     |
| 1280  | 278 / 278                 | 189 / 193        | 51                     |

- **C measures 141 at 1646 and 1920 on either name** — 39 px of diagram, and with the long name at
  1646 it is **79 px**, because the pen leaving the identity row un-wraps it (§5).
- The study predicted 139; the **2 px is unattributed** and recorded rather than explained
  (ADR-0128's rule). Its 1440 figure (139) assumed a one-line header, which the short name gives
  and the long name does not.
- **F7 is reachable**: `py-1.5 → py-1` on `[data-activities-bar]` takes the foot from 55 to
  **51 px** at every width, the two-line facts block (40 px) being the tallest child throughout.
  The C override had never touched that row, so the brief's 51 was a prediction — now a reading.
- Today at 1440 and 1280 the deck is already **three lines** (166 px) and the header two; under C
  at 1440 the deck stays two (80 px) with the short name.

## 2. M0-T2 — each row's content width, pen held

Today's composition, cards included, 1646 (identical at every width — the groups do not shrink):

| group  | width | children + gaps + padding | items | caption | section |
| ------ | ----- | ------------------------- | ----- | ------- | ------- |
| View   | 797.8 | 797.7                     | 8     | 37.6    | 734.1   |
| Find   | 646.3 | 646.3                     | 4     | 35.4    | 584.9   |
| Author | 510.1 | 510.0                     | 6     | 52.5    | 431.5   |
| Plan   | 686.4 | 686.3                     | 5     | 37.1    | 623.2   |

Sets, with the deck's 8 px gap: **LOOK (View + Find) 1452.1 px, DO (Author + Plan) 1204.5 px.**

- **The study's ±20 px screenshot readings were right to within 3 px** (it said ≈ 1452 and ≈ 1202).
  `docs/specs/workspace-foot-and-deck/m0-measurement.md` §5, which reports line-1 slack of
  **23.1 px at 1920 and 275.2 at 1646**, is the **stale** document: the slack today is
  1904 − 1452.1 = **451.9** at 1920 and **177.9** at 1646. That file describes a deck this one no
  longer is, and its table should be read as history.
- Under C: the four cards go (S1, −18 px each → −36 per set) and C1 sets a **48 px** column gap
  between the two groups of a row (against today's 8). So a C row is set − 36 + 40: **LOOK ≈ 1456,
  DO ≈ 1208 + the pen (§4)**. Against containers of 1904 / 1630 / 1424 / 1264 that is slack of
  448 / 174 / **−32** / −192 for LOOK — **F2 (both rows fit at 1646) holds with 174 px, and the
  plan's F6 clause "exactly two line boxes at 1440" does not**: at 1424 the LOOK row wraps by
  32 px under C's own gap, and by −8 px even at today's 8 px gap. That clause was written against
  the study's 1440 figure, which the study itself derived from the same ±20 px readings. **M4 owns
  the answer** (a tighter gap, a shorter label, or re-stating F6 at 1440 as "at most three"); it is
  recorded here rather than fixed by editing the condition to match the number.

## 3. M0-T3 — the deck's line count today

| width | lines (height ÷ tallest child) | groups per line                           |
| ----- | ------------------------------ | ----------------------------------------- |
| 1920  | 2.16                           | View, Find → L1 · Author, Plan → L2       |
| 1646  | 2.16                           | same                                      |
| 1440  | 3.32                           | View → L1 · Find, Author → L2 · Plan → L3 |
| 1280  | 3.32                           | same                                      |

Today's two lines at 1646/1920 are LOOK-on-top / DO-below by **accident of width**, which is C.2's
claim confirmed: at 1440 `Find` drops a line and takes the whole DO set with it. F6's baseline.

## 4. M0-T6 — the real pen control

`[data-plan-pen] button` while holding: **`Stop editing` 103.1 × 32 px**; after release
**`Start editing` 103.2 px**. The two labels are the same width to 0.1 px, so there is no
"widest label" question. DO set + pen + one gap: **1315.7 px** today; against 1904 / 1630 / 1424 /
1264 that is 588 / 314 / 108 / **−52** of slack — and −36 + 40 under C, so ~1320. The DO row fits at
1440 and wraps at 1280, where F6 already allows a third line.

## 5. M0-T10 — the header's wrap once the pen leaves

Long-name run (the one that matters):

| width | today | pen cluster hidden | buttons hidden, badge kept |
| ----- | ----- | ------------------ | -------------------------- |
| 1920  | 1     | 1                  | 1                          |
| 1646  | 2.2   | **1**              | 2.2                        |
| 1440  | 2.2   | 2.2                | 2.2                        |
| 1280  | 2.2   | 2.2                | 2.2                        |

- **Moving the whole cluster buys the one-line header back at 1646 for a real plan name; keeping
  the badge in the header does not.** That is CQ-4's default supported by a number, and the reason
  the answered CQ-4 ("foot row") is the right one beyond tidiness.
- `pen-status.spec.ts`'s assertions (1 line at 1646, 2 at 1440 and 1280) hold in both worlds for
  the **74-char** name. **For the fixture's own 39-char name, 1440 DOES invert**: §1's C run — which
  hides the pen cluster — reads the header at **42 px (one line) at 1440**, against 88 today. So
  the risk table's "1440 may become one line" occurs for the journey's fixture and not for a long
  programme name, and M5-T6 must re-point that assertion rather than leave it. (This paragraph said
  "none inverts" until M1's re-measurement put the two runs side by side — a claim made from one
  name, corrected by the other.)

## 6. M0-T4 — the pen cluster's width in both of CQ-4's homes

- Header cluster today (badge + `Stop editing`): **165.4 px** — matching `CompactPenStatus.tsx`'s own
  recorded 165 without the sentence.
- Widest realistic cluster, cloned from live DOM (`Locked · Alexandra` badge + `Request control` +
  `Take over now`): **389.7 px**.
- (a) inside `[data-schedule-state]`: foot **55 px**, the state block 691.5 px wide. (b) as a third
  sibling of the dock and the facts: foot **55 px**. Neither home grows the foot at 1646 at rest.
- The sentence is `sr-only` in the foot (foot-row D4) and adds **no width** in either home.
- **Owed at M5**: the same reading with an activity **selected** (the dock bar occupying the row) and
  at 1440 — M0 measured the row at rest.

## 7. M0-T5 — what the organisation switcher paints

Computed on `#org-switcher` inside the chrome scope: **`background-color: oklch(0.252 0.056 264)`**
(the band's navy), `color: oklch(0.985 0 0)`, `appearance: auto`, `color-scheme: normal`. The
cascade (CDP `CSS.getMatchedStylesForNode`): four user-agent `select` rules, then Tailwind's
preflight `background-color: transparent`, then **`.bg-background { var(--background) }` wins**.

**So the code is right and the spec's §0.2(3) "live defect" is not reproduced on this platform.**
What the product owner's screenshot shows is not what Chromium on Linux paints; the harness cannot
say what Windows does with `appearance: auto` on a closed `<select>`. The repair does not change —
M2-T2 gives the control the chrome's **field** vocabulary, which is right whether or not a
user-agent rule wins somewhere else — but the spec's sentence is corrected from "live defect" to
"not reproduced; repaired anyway".

## 8. M0-T9 — does an offset focus ring fit? (CQ-2)

23 controls in the deck. Smallest gap between two controls on one line: **4 px** (`zoom-out` →
`zoom-in`, inside a section at `gap-1`). Nearest wrapper edge: 62.6 px. Gap between lines: 22 px.

A 2 px ring at 2 px offset needs 4 px: **today it touches its neighbour at zero clearance**; under
C.2's `gap: 0.5rem` inside a group it has 4 px to spare. **CQ-2's default is viable only alongside
the 8 px within-group gap**, so that gap must land with or before the ladder (M1 deletes the cards —
it must also set the group gap, or M3 inherits a ring that touches). Vertical clearance is not a
concern at 22 px.

## 9. M0-T8 — is the group→row assignment stable across plan states?

Three states measured at 1920 / 1646 / 1440 — computed schedule in Diagram, computed in **Gantt**,
and a plan with **no computed schedule**: 23 items and identical group widths in all three, and no
group changes line at any width. **Not measured**: a plan mid-conflict-cycle (the seed produces no
engine conflict) and a **Viewer** (needs a second member; one session cannot reach it). Both are
owed, not assumed stable. What this does show is C.2's argument in one number: today the assignment
is stable only because the item set happened not to change across these three states.

## 10. M0-T7 — coarse-pointer geometry

`hasTouch: true` on the page's own context; `matchMedia('(pointer: coarse)')` asserted before
measuring. `--control-h` = 2.75rem (44 px).

| width | today band (short / long) | C band (short / long) | C deck | foot            |
| ----- | ------------------------- | --------------------- | ------ | --------------- |
| 1646  | **196** / 248             | **165** / 221         | 96     | 59              |
| 1024  | 380                       | 221                   | 96     | 59              |
| 834   | 484                       | 221                   | 96     | 59              |
| 390   | 868                       | 331                   | 96     | not mounted (0) |

- The study predicted 196 today (exact) and **159 for C — measured 165**, +6 px, the header being
  50 rather than the 44 assumed. Under coarse the C deck is a flat **96 = 2 × 44 + 8** at every width
  from 1646 to 390, which is the declared rows holding their shape where today's deck goes to
  4.41 lines at 1024.
- `docs/TECH_DEBT.md` #133 (the deck losing labels in tablet mode) reproduces in today's line
  counts and is not reproduced under C's fixed rows.

## 11. What changes in the spec and plan because of these readings

1. **F6 at 1440** cannot be "exactly two" under C's 48 px column gap (§2); M4 decides the remedy.
2. **Spec §0.2(3)** — the switcher is not a reproduced defect on this platform (§7); wording corrected.
3. **CQ-2's default depends on the 8 px group gap landing by M3** (§8) — M1's task list gains it.
4. **CQ-4's default is now evidenced** (§5), and the risk table's "1440 may invert" is withdrawn.
5. **A 74-char plan name wraps the header at 1646 today** (§0/§5) — recorded in the spec's problem
   statement as the state the product owner's screen is in, and closed by M5 rather than by M6.
6. The study's row widths are confirmed (§2); the older foot-and-deck measurement is named stale.

## Appendix A — raw output, short plan name (the control run)

(harness output)

Taken 2026-09-10T12:17:13.467Z against http://localhost:5173, Chromium via Playwright, fixture: 8 activities on 3 lanes, computed schedule, pen held, plan name 32 chars: “Riverside — Phase 2 Substructure”.

## §1 · M0-T1 — band and foot heights, today and under C

| width | variant       | band | header | header lines | rows child (border-b) | pad wrap (pt/pb) | deck | deck lines | rule | foot (pt/pb) | foot tallest child |
| ----- | ------------- | ---- | ------ | ------------ | --------------------- | ---------------- | ---- | ---------- | ---- | ------------ | ------------------ |
| 1920  | today         | 180  | 40     | 1            | 121 (1px)             | 120 (6px/6px)    | 108  | 2.16       | 3px  | 55 (6px/6px) | 40                 |
| 1646  | today         | 180  | 40     | 1            | 121 (1px)             | 120 (6px/6px)    | 108  | 2.16       | 3px  | 55 (6px/6px) | 40                 |
| 1440  | today         | 278  | 88     | 2.2          | 179 (1px)             | 178 (6px/6px)    | 166  | 3.32       | 3px  | 55 (6px/6px) | 40                 |
| 1280  | today         | 278  | 88     | 2.2          | 179 (1px)             | 178 (6px/6px)    | 166  | 3.32       | 3px  | 55 (6px/6px) | 40                 |
| 1920  | C             | 141  | 42     | 1            | 88 (0px)              | 88 (4px/4px)     | 80   | 2.22       | 3px  | 55 (6px/6px) | 40                 |
| 1646  | C             | 141  | 42     | 1            | 88 (0px)              | 88 (4px/4px)     | 80   | 2.22       | 3px  | 55 (6px/6px) | 40                 |
| 1440  | C             | 141  | 42     | 1            | 88 (0px)              | 88 (4px/4px)     | 80   | 2.22       | 3px  | 55 (6px/6px) | 40                 |
| 1280  | C             | 189  | 90     | 2.14         | 88 (0px)              | 88 (4px/4px)     | 80   | 2.22       | 3px  | 55 (6px/6px) | 40                 |
| 1920  | C + foot py-1 | 141  | 42     | 1            | 88 (0px)              | 88 (4px/4px)     | 80   | 2.22       | 3px  | 51 (4px/4px) | 40                 |
| 1646  | C + foot py-1 | 141  | 42     | 1            | 88 (0px)              | 88 (4px/4px)     | 80   | 2.22       | 3px  | 51 (4px/4px) | 40                 |
| 1440  | C + foot py-1 | 141  | 42     | 1            | 88 (0px)              | 88 (4px/4px)     | 80   | 2.22       | 3px  | 51 (4px/4px) | 40                 |
| 1280  | C + foot py-1 | 189  | 90     | 2.14         | 88 (0px)              | 88 (4px/4px)     | 80   | 2.22       | 3px  | 51 (4px/4px) | 40                 |

- CONTROL — band is 180 px today at 1646 and 1920: **PASS** (180 / 180)
- CONTROL — foot is 55 px today at 1646: **PASS** (55)
- Decomposition today @1646: header 40 + rows child 121 (its border-b 1px) + rule 3px → band 180.
- Under C @1646: band 141 (study predicted 139; the difference is recorded, not explained). Foot under C with py-1: 51 (tallest child 40).

## §2 · M0-T2 — each row's content width, pen held (today's composition)

| width | container | scrollWidth | group  | line | group w | kids+gaps+pad | items | sections            |
| ----- | --------- | ----------- | ------ | ---- | ------- | ------------- | ----- | ------------------- |
| 1920  | 1904      | 1904        | View   | 1    | 797.8   | 797.7         | 8     | span:37.6 div:734.1 |
| 1920  | 1904      | 1904        | Find   | 1    | 646.3   | 646.3         | 4     | span:35.4 div:584.9 |
| 1920  | 1904      | 1904        | Author | 2    | 510.1   | 510           | 6     | span:52.5 div:431.5 |
| 1920  | 1904      | 1904        | Plan   | 2    | 686.4   | 686.3         | 5     | span:37.1 div:623.2 |
| 1646  | 1630      | 1630        | View   | 1    | 797.8   | 797.7         | 8     | span:37.6 div:734.1 |
| 1646  | 1630      | 1630        | Find   | 1    | 646.3   | 646.3         | 4     | span:35.4 div:584.9 |
| 1646  | 1630      | 1630        | Author | 2    | 510.1   | 510           | 6     | span:52.5 div:431.5 |
| 1646  | 1630      | 1630        | Plan   | 2    | 686.4   | 686.3         | 5     | span:37.1 div:623.2 |
| 1440  | 1424      | 1424        | View   | 1    | 797.8   | 797.7         | 8     | span:37.6 div:734.1 |
| 1440  | 1424      | 1424        | Find   | 2    | 646.3   | 646.3         | 4     | span:35.4 div:584.9 |
| 1440  | 1424      | 1424        | Author | 2    | 510.1   | 510           | 6     | span:52.5 div:431.5 |
| 1440  | 1424      | 1424        | Plan   | 3    | 686.4   | 686.3         | 5     | span:37.1 div:623.2 |
| 1280  | 1264      | 1264        | View   | 1    | 797.8   | 797.7         | 8     | span:37.6 div:734.1 |
| 1280  | 1264      | 1264        | Find   | 2    | 646.3   | 646.3         | 4     | span:35.4 div:584.9 |
| 1280  | 1264      | 1264        | Author | 2    | 510.1   | 510           | 6     | span:52.5 div:431.5 |
| 1280  | 1264      | 1264        | Plan   | 3    | 686.4   | 686.3         | 5     | span:37.1 div:623.2 |

- CONTROL — @1920 each group's width equals its children + gaps + padding within 2 px: **PASS** (all groups)
- CONTROL — @1646 each group's width equals its children + gaps + padding within 2 px: **PASS** (all groups)
- CONTROL — @1440 each group's width equals its children + gaps + padding within 2 px: **PASS** (all groups)
- CONTROL — @1280 each group's width equals its children + gaps + padding within 2 px: **PASS** (all groups)

### §2a · Sets

| width | container | LOOK (View+Find) incl. one deck gap | DO (Author+Plan) incl. one deck gap | deck gap |
| ----- | --------- | ----------------------------------- | ----------------------------------- | -------- |
| 1920  | 1904      | 1452.1                              | 1204.5                              | 8        |
| 1646  | 1630      | 1452.1                              | 1204.5                              | 8        |
| 1440  | 1424      | 1452.1                              | 1204.5                              | 8        |
| 1280  | 1264      | 1452.1                              | 1204.5                              | 8        |

## §3 · M0-T3 — the deck's line count today

| width | lines (height / tallest child) | groups per line                      |
| ----- | ------------------------------ | ------------------------------------ |
| 1920  | 2.16                           | View→L1, Find→L1, Author→L2, Plan→L2 |
| 1646  | 2.16                           | View→L1, Find→L1, Author→L2, Plan→L2 |
| 1440  | 3.32                           | View→L1, Find→L2, Author→L2, Plan→L3 |
| 1280  | 3.32                           | View→L1, Find→L2, Author→L2, Plan→L3 |

- CONTROL — deck is 2 lines at 1646: **PASS** (2.16)

## §4 · M0-T6 — the REAL pen control's width, and the DO row with it

- Header pen button while holding: **Stop editing** 103.1 × 32 px (a real `ToolbarButton`-class control with icon, not the study's `::before`).
- After release: **Start editing** 103.2 px.
- CONTROL — pen re-taken (control reads Stop editing again): **PASS** (Stop editing)

| width | container | DO set today | DO set + pen (widest label) + one gap | slack |
| ----- | --------- | ------------ | ------------------------------------- | ----- |
| 1920  | 1904      | 1204.5       | 1315.7                                | 588.3 |
| 1646  | 1630      | 1204.5       | 1315.7                                | 314.3 |
| 1440  | 1424      | 1204.5       | 1315.7                                | 108.3 |
| 1280  | 1264      | 1204.5       | 1315.7                                | -51.7 |

- Under C the cards go (−18 px width per group, S1), so each set above is ~36 px wider than C's rows will be; the slack column is therefore conservative by that amount.

## §5 · M0-T10 — the header's wrap threshold once the pen leaves

| width | header lines today | pen cluster hidden | buttons hidden, badge kept |
| ----- | ------------------ | ------------------ | -------------------------- |
| 1920  | 1                  | 1                  | 1                          |
| 1646  | 1                  | 1                  | 1                          |
| 1440  | 2.2                | 1                  | 1                          |
| 1280  | 2.2                | 2.2                | 2.2                        |

- `pen-status.spec.ts` asserts 1 line at 1646 and 2 at 1440 and 1280 today; the middle column says which of those move when the button leaves (M5-T6).

## §6 · M0-T4 — the pen cluster's width in both of CQ-4's homes

- Pen cluster in the header today (badge + Stop editing): 165.4 px. Fabricated widest cluster (`Locked · Alexandra` + Request control + Take over now), cloned from live DOM: **389.7 px**.
- (a) inside `[data-schedule-state]`: foot 55 px, the state block 691.5 px wide. (b) as a third foot sibling: foot **55 px**. Baseline foot 55 px.
- CONTROL — foot returns to its baseline once the clones are removed: **PASS** (55 vs 55)
- CONTROL — baseline foot equals §1 today@1646: **PASS** (55 vs 55)
- The sentence itself is `sr-only` in the foot (foot-row D4), so it adds no width in either home; the width is the badge and the buttons.

## §7 · M0-T5 — what the organisation switcher paints

- computed: background-color `oklch(0.252 0.056 264)`, color `oklch(0.985 0 0)`, appearance `auto`, color-scheme `normal`, inside chrome scope: true.
- matched rules declaring a background (cascade order, last wins):
  - `user-agent: select { background-color: field }`
  - `user-agent: select:not(:-internal-list-box) { background-color: buttonface }`
  - `user-agent: select:not(:-internal-list-box):not([multiple]) { background-color: -internal-auto-base(Field, transparent) }`
  - `user-agent: select:not(:-internal-list-box):not([multiple]):not(:-internal-list-box):not([multiple]) { background-color: -internal-auto-base(ButtonFace, transparent) }`
  - `regular: button, input, select, optgroup, textarea, ::file-selector-button { background-color: transparent; background-color: transparent }`
  - `regular: .bg-background { background-color: var(--background); background-color: var(--background) }`

## §8 · M0-T9 — does an offset focus ring fit? (CQ-2)

- 23 controls. Smallest horizontal gap between two controls on one line: **4 px** (zoom-out→zoom-in). Smallest distance from a control to the deck wrapper's edge: 62.6 px (today). Gap between the two lines: 22 px.
- A 2 px ring at 2 px offset needs **4 px** of clear space on every side to avoid touching a neighbour and **≥ 4 px** to the wrapper to avoid clipping (`overflow` permitting). Verdict on the numbers above: one offset ring fits without touching its neighbour, but two adjacent focused controls cannot both — a non-issue, since focus is singular; row gap 22 px clears it vertically.
- Under C (C2 sets `gap: 0.5rem` inside a group) the within-group gap becomes 8 px; the reading above is today's.

## §9 · M0-T8 — is the group→row assignment stable across plan states?

| state                         | width | items in deck | groups per line                      | group widths                  |
| ----------------------------- | ----- | ------------- | ------------------------------------ | ----------------------------- |
| computed, Diagram, pen held   | 1920  | 23            | View→L1, Find→L1, Author→L2, Plan→L2 | 797.8 / 646.3 / 510.1 / 686.4 |
| computed, Diagram, pen held   | 1646  | 23            | View→L1, Find→L1, Author→L2, Plan→L2 | 797.8 / 646.3 / 510.1 / 686.4 |
| computed, Diagram, pen held   | 1440  | 23            | View→L1, Find→L2, Author→L2, Plan→L3 | 797.8 / 646.3 / 510.1 / 686.4 |
| computed, Gantt, pen held     | 1920  | 23            | View→L1, Find→L1, Author→L2, Plan→L2 | 797.8 / 646.3 / 510.1 / 686.4 |
| computed, Gantt, pen held     | 1646  | 23            | View→L1, Find→L1, Author→L2, Plan→L2 | 797.8 / 646.3 / 510.1 / 686.4 |
| computed, Gantt, pen held     | 1440  | 23            | View→L1, Find→L2, Author→L2, Plan→L3 | 797.8 / 646.3 / 510.1 / 686.4 |
| NO computed schedule, Diagram | 1920  | 23            | View→L1, Find→L1, Author→L2, Plan→L2 | 797.8 / 646.3 / 510.1 / 686.4 |
| NO computed schedule, Diagram | 1646  | 23            | View→L1, Find→L1, Author→L2, Plan→L2 | 797.8 / 646.3 / 510.1 / 686.4 |
| NO computed schedule, Diagram | 1440  | 23            | View→L1, Find→L2, Author→L2, Plan→L3 | 797.8 / 646.3 / 510.1 / 686.4 |

- NOT MEASURED: a plan mid-conflict-cycle (needs an engine conflict the seed does not produce) and a **Viewer** (needs a second member; one session cannot reach it). Both are recorded as owed, not assumed stable.
- CONTROL — no group changes line between measured states at a given width (today's flex wrap): **PASS** (stable across the three states)

## §10 · M0-T7 — coarse-pointer geometry

- CONTROL — matchMedia("(pointer: coarse)") matches on the coarse page: **PASS** (coarse)

  | width | variant | band | header | deck | deck lines | foot | control height |
  | ----- | ------- | ---- | ------ | ---- | ---------- | ---- | -------------- |
  | 1646  | today   | 196  | 44     | 124  | 2.14       | 59   | 2.75rem        |
  | 1024  | today   | 380  | 100    | 256  | 4.41       | 59   | 2.75rem        |
  | 834   | today   | 484  | 156    | 304  | 2.87       | 59   | 2.75rem        |
  | 390   | today   | 868  | 252    | 592  | 2.93       | 0    | 2.75rem        |
  | 1646  | C       | 165  | 50     | 96   | 2.18       | 59   | 2.75rem        |
  | 1024  | C       | 221  | 106    | 96   | 2.18       | 59   | 2.75rem        |
  | 834   | C       | 221  | 106    | 96   | 2.18       | 59   | 2.75rem        |
  | 390   | C       | 331  | 216    | 96   | 2.18       | 0    | 2.75rem        |

- Study predicted 159 px for C's band under coarse at 1646. `docs/TECH_DEBT.md` #133 (labels lost in tablet mode) is reported by the line count, not asserted.

## Appendix B — raw output, 74-character plan name

(harness output)

Taken 2026-09-10T12:15:46.042Z against http://localhost:5173, Chromium via Playwright, fixture: 8 activities on 3 lanes, computed schedule, pen held, plan name 74 chars.

## §1 · M0-T1 — band and foot heights, today and under C

| width | variant       | band | header | header lines | rows child (border-b) | pad wrap (pt/pb) | deck | deck lines | rule | foot (pt/pb) | foot tallest child |
| ----- | ------------- | ---- | ------ | ------------ | --------------------- | ---------------- | ---- | ---------- | ---- | ------------ | ------------------ |
| 1920  | today         | 180  | 40     | 1            | 121 (1px)             | 120 (6px/6px)    | 108  | 2.16       | 3px  | 55 (6px/6px) | 40                 |
| 1646  | today         | 220  | 88     | 2.2          | 121 (1px)             | 120 (6px/6px)    | 108  | 2.16       | 3px  | 55 (6px/6px) | 40                 |
| 1440  | today         | 278  | 88     | 2.2          | 179 (1px)             | 178 (6px/6px)    | 166  | 3.32       | 3px  | 55 (6px/6px) | 40                 |
| 1280  | today         | 278  | 88     | 2.2          | 179 (1px)             | 178 (6px/6px)    | 166  | 3.32       | 3px  | 55 (6px/6px) | 40                 |
| 1920  | C             | 141  | 42     | 1            | 88 (0px)              | 88 (4px/4px)     | 80   | 2.22       | 3px  | 55 (6px/6px) | 40                 |
| 1646  | C             | 141  | 42     | 1            | 88 (0px)              | 88 (4px/4px)     | 80   | 2.22       | 3px  | 55 (6px/6px) | 40                 |
| 1440  | C             | 189  | 90     | 2.14         | 88 (0px)              | 88 (4px/4px)     | 80   | 2.22       | 3px  | 55 (6px/6px) | 40                 |
| 1280  | C             | 193  | 94     | 2.24         | 88 (0px)              | 88 (4px/4px)     | 80   | 2.22       | 3px  | 55 (6px/6px) | 40                 |
| 1920  | C + foot py-1 | 141  | 42     | 1            | 88 (0px)              | 88 (4px/4px)     | 80   | 2.22       | 3px  | 51 (4px/4px) | 40                 |
| 1646  | C + foot py-1 | 141  | 42     | 1            | 88 (0px)              | 88 (4px/4px)     | 80   | 2.22       | 3px  | 51 (4px/4px) | 40                 |
| 1440  | C + foot py-1 | 189  | 90     | 2.14         | 88 (0px)              | 88 (4px/4px)     | 80   | 2.22       | 3px  | 51 (4px/4px) | 40                 |
| 1280  | C + foot py-1 | 193  | 94     | 2.24         | 88 (0px)              | 88 (4px/4px)     | 80   | 2.22       | 3px  | 51 (4px/4px) | 40                 |

- CONTROL — band is 180 px today at 1646 and 1920: **FAIL** (220 / 180)
- CONTROL — foot is 55 px today at 1646: **PASS** (55)
- Decomposition today @1646: header 88 + rows child 121 (its border-b 1px) + rule 3px → band 220.
- Under C @1646: band 141 (study predicted 139; the difference is recorded, not explained). Foot under C with py-1: 51 (tallest child 40).

## §2 · M0-T2 — each row's content width, pen held (today's composition)

| width | container | scrollWidth | group  | line | group w | kids+gaps+pad | items | sections            |
| ----- | --------- | ----------- | ------ | ---- | ------- | ------------- | ----- | ------------------- |
| 1920  | 1904      | 1904        | View   | 1    | 797.8   | 797.7         | 8     | span:37.6 div:734.1 |
| 1920  | 1904      | 1904        | Find   | 1    | 646.3   | 646.3         | 4     | span:35.4 div:584.9 |
| 1920  | 1904      | 1904        | Author | 2    | 510.1   | 510           | 6     | span:52.5 div:431.5 |
| 1920  | 1904      | 1904        | Plan   | 2    | 686.4   | 686.3         | 5     | span:37.1 div:623.2 |
| 1646  | 1630      | 1630        | View   | 1    | 797.8   | 797.7         | 8     | span:37.6 div:734.1 |
| 1646  | 1630      | 1630        | Find   | 1    | 646.3   | 646.3         | 4     | span:35.4 div:584.9 |
| 1646  | 1630      | 1630        | Author | 2    | 510.1   | 510           | 6     | span:52.5 div:431.5 |
| 1646  | 1630      | 1630        | Plan   | 2    | 686.4   | 686.3         | 5     | span:37.1 div:623.2 |
| 1440  | 1424      | 1424        | View   | 1    | 797.8   | 797.7         | 8     | span:37.6 div:734.1 |
| 1440  | 1424      | 1424        | Find   | 2    | 646.3   | 646.3         | 4     | span:35.4 div:584.9 |
| 1440  | 1424      | 1424        | Author | 2    | 510.1   | 510           | 6     | span:52.5 div:431.5 |
| 1440  | 1424      | 1424        | Plan   | 3    | 686.4   | 686.3         | 5     | span:37.1 div:623.2 |
| 1280  | 1264      | 1264        | View   | 1    | 797.8   | 797.7         | 8     | span:37.6 div:734.1 |
| 1280  | 1264      | 1264        | Find   | 2    | 646.3   | 646.3         | 4     | span:35.4 div:584.9 |
| 1280  | 1264      | 1264        | Author | 2    | 510.1   | 510           | 6     | span:52.5 div:431.5 |
| 1280  | 1264      | 1264        | Plan   | 3    | 686.4   | 686.3         | 5     | span:37.1 div:623.2 |

- CONTROL — @1920 each group's width equals its children + gaps + padding within 2 px: **PASS** (all groups)
- CONTROL — @1646 each group's width equals its children + gaps + padding within 2 px: **PASS** (all groups)
- CONTROL — @1440 each group's width equals its children + gaps + padding within 2 px: **PASS** (all groups)
- CONTROL — @1280 each group's width equals its children + gaps + padding within 2 px: **PASS** (all groups)

### §2a · Sets

| width | container | LOOK (View+Find) incl. one deck gap | DO (Author+Plan) incl. one deck gap | deck gap |
| ----- | --------- | ----------------------------------- | ----------------------------------- | -------- |
| 1920  | 1904      | 1452.1                              | 1204.5                              | 8        |
| 1646  | 1630      | 1452.1                              | 1204.5                              | 8        |
| 1440  | 1424      | 1452.1                              | 1204.5                              | 8        |
| 1280  | 1264      | 1452.1                              | 1204.5                              | 8        |

## §3 · M0-T3 — the deck's line count today

| width | lines (height / tallest child) | groups per line                      |
| ----- | ------------------------------ | ------------------------------------ |
| 1920  | 2.16                           | View→L1, Find→L1, Author→L2, Plan→L2 |
| 1646  | 2.16                           | View→L1, Find→L1, Author→L2, Plan→L2 |
| 1440  | 3.32                           | View→L1, Find→L2, Author→L2, Plan→L3 |
| 1280  | 3.32                           | View→L1, Find→L2, Author→L2, Plan→L3 |

- CONTROL — deck is 2 lines at 1646: **PASS** (2.16)

## §4 · M0-T6 — the REAL pen control's width, and the DO row with it

- Header pen button while holding: **Stop editing** 103.1 × 32 px (a real `ToolbarButton`-class control with icon, not the study's `::before`).
- After release: **Start editing** 103.2 px.
- CONTROL — pen re-taken (control reads Stop editing again): **PASS** (Stop editing)

| width | container | DO set today | DO set + pen (widest label) + one gap | slack |
| ----- | --------- | ------------ | ------------------------------------- | ----- |
| 1920  | 1904      | 1204.5       | 1315.7                                | 588.3 |
| 1646  | 1630      | 1204.5       | 1315.7                                | 314.3 |
| 1440  | 1424      | 1204.5       | 1315.7                                | 108.3 |
| 1280  | 1264      | 1204.5       | 1315.7                                | -51.7 |

- Under C the cards go (−18 px width per group, S1), so each set above is ~36 px wider than C's rows will be; the slack column is therefore conservative by that amount.

## §5 · M0-T10 — the header's wrap threshold once the pen leaves

| width | header lines today | pen cluster hidden | buttons hidden, badge kept |
| ----- | ------------------ | ------------------ | -------------------------- |
| 1920  | 1                  | 1                  | 1                          |
| 1646  | 2.2                | 1                  | 2.2                        |
| 1440  | 2.2                | 2.2                | 2.2                        |
| 1280  | 2.2                | 2.2                | 2.2                        |

- `pen-status.spec.ts` asserts 1 line at 1646 and 2 at 1440 and 1280 today; the middle column says which of those move when the button leaves (M5-T6).

## §6 · M0-T4 — the pen cluster's width in both of CQ-4's homes

- Pen cluster in the header today (badge + Stop editing): 165.4 px. Fabricated widest cluster (`Locked · Alexandra` + Request control + Take over now), cloned from live DOM: **389.7 px**.
- (a) inside `[data-schedule-state]`: foot 55 px, the state block 691.5 px wide. (b) as a third foot sibling: foot **55 px**. Baseline foot 55 px.
- CONTROL — foot returns to its baseline once the clones are removed: **PASS** (55 vs 55)
- CONTROL — baseline foot equals §1 today@1646: **PASS** (55 vs 55)
- The sentence itself is `sr-only` in the foot (foot-row D4), so it adds no width in either home; the width is the badge and the buttons.

## §7 · M0-T5 — what the organisation switcher paints

- computed: background-color `oklch(0.252 0.056 264)`, color `oklch(0.985 0 0)`, appearance `auto`, color-scheme `normal`, inside chrome scope: true.
- matched rules declaring a background (cascade order, last wins):
  - `user-agent: select { background-color: field }`
  - `user-agent: select:not(:-internal-list-box) { background-color: buttonface }`
  - `user-agent: select:not(:-internal-list-box):not([multiple]) { background-color: -internal-auto-base(Field, transparent) }`
  - `user-agent: select:not(:-internal-list-box):not([multiple]):not(:-internal-list-box):not([multiple]) { background-color: -internal-auto-base(ButtonFace, transparent) }`
  - `regular: button, input, select, optgroup, textarea, ::file-selector-button { background-color: transparent; background-color: transparent }`
  - `regular: .bg-background { background-color: var(--background); background-color: var(--background) }`

## §8 · M0-T9 — does an offset focus ring fit? (CQ-2)

- 23 controls. Smallest horizontal gap between two controls on one line: **4 px** (zoom-out→zoom-in). Smallest distance from a control to the deck wrapper's edge: 62.6 px (today). Gap between the two lines: 22 px.
- A 2 px ring at 2 px offset needs **4 px** of clear space on every side to avoid touching a neighbour and **≥ 4 px** to the wrapper to avoid clipping (`overflow` permitting). Verdict on the numbers above: one offset ring fits without touching its neighbour, but two adjacent focused controls cannot both — a non-issue, since focus is singular; row gap 22 px clears it vertically.
- Under C (C2 sets `gap: 0.5rem` inside a group) the within-group gap becomes 8 px; the reading above is today's.

## §9 · M0-T8 — is the group→row assignment stable across plan states?

| state                         | width | items in deck | groups per line                      | group widths                  |
| ----------------------------- | ----- | ------------- | ------------------------------------ | ----------------------------- |
| computed, Diagram, pen held   | 1920  | 23            | View→L1, Find→L1, Author→L2, Plan→L2 | 797.8 / 646.3 / 510.1 / 686.4 |
| computed, Diagram, pen held   | 1646  | 23            | View→L1, Find→L1, Author→L2, Plan→L2 | 797.8 / 646.3 / 510.1 / 686.4 |
| computed, Diagram, pen held   | 1440  | 23            | View→L1, Find→L2, Author→L2, Plan→L3 | 797.8 / 646.3 / 510.1 / 686.4 |
| computed, Gantt, pen held     | 1920  | 23            | View→L1, Find→L1, Author→L2, Plan→L2 | 797.8 / 646.3 / 510.1 / 686.4 |
| computed, Gantt, pen held     | 1646  | 23            | View→L1, Find→L1, Author→L2, Plan→L2 | 797.8 / 646.3 / 510.1 / 686.4 |
| computed, Gantt, pen held     | 1440  | 23            | View→L1, Find→L2, Author→L2, Plan→L3 | 797.8 / 646.3 / 510.1 / 686.4 |
| NO computed schedule, Diagram | 1920  | 23            | View→L1, Find→L1, Author→L2, Plan→L2 | 797.8 / 646.3 / 510.1 / 686.4 |
| NO computed schedule, Diagram | 1646  | 23            | View→L1, Find→L1, Author→L2, Plan→L2 | 797.8 / 646.3 / 510.1 / 686.4 |
| NO computed schedule, Diagram | 1440  | 23            | View→L1, Find→L2, Author→L2, Plan→L3 | 797.8 / 646.3 / 510.1 / 686.4 |

- NOT MEASURED: a plan mid-conflict-cycle (needs an engine conflict the seed does not produce) and a **Viewer** (needs a second member; one session cannot reach it). Both are recorded as owed, not assumed stable.
- CONTROL — no group changes line between measured states at a given width (today's flex wrap): **PASS** (stable across the three states)

## §10 · M0-T7 — coarse-pointer geometry

- CONTROL — matchMedia("(pointer: coarse)") matches on the coarse page: **PASS** (coarse)

  | width | variant | band | header | deck | deck lines | foot | control height |
  | ----- | ------- | ---- | ------ | ---- | ---------- | ---- | -------------- |
  | 1646  | today   | 248  | 100    | 124  | 2.14       | 59   | 2.75rem        |
  | 1024  | today   | 380  | 100    | 256  | 4.41       | 59   | 2.75rem        |
  | 834   | today   | 484  | 156    | 304  | 2.87       | 59   | 2.75rem        |
  | 390   | today   | 868  | 252    | 592  | 2.93       | 0    | 2.75rem        |
  | 1646  | C       | 221  | 106    | 96   | 2.18       | 59   | 2.75rem        |
  | 1024  | C       | 221  | 106    | 96   | 2.18       | 59   | 2.75rem        |
  | 834   | C       | 221  | 106    | 96   | 2.18       | 59   | 2.75rem        |
  | 390   | C       | 331  | 216    | 96   | 2.18       | 0    | 2.75rem        |

- Study predicted 159 px for C's band under coarse at 1646. `docs/TECH_DEBT.md` #133 (labels lost in tablet mode) is reported by the line count, not asserted.

---

## Appendix C — §7 re-read after M2 (2026-09-10)

The M2-T2 obligation was to **confirm the paint changed**, not the class — ADR-0102's finding is a
surface scope that never reached its renderer while every gate stayed green. Same probe, same
method (CDP `CSS.getMatchedStylesForNode` plus the resolved style), against the M2 tree:

- computed `background-color: oklch(0.2 0.05 264)` — the recessed navy, where §7 read
  `oklch(0.252 0.056 264)` (the band) before;
- `color: oklch(0.985 0 0)`;
- the winning rule is now `.bg-field { background-color: var(--field) }`, ahead of the same four
  user-agent `select` rules and the preflight, exactly as `.bg-background` was.

So the token rebind (M2-T1) and the vocabulary change (M2-T2) both reach the pixel, and §7's
finding that the code — not a user-agent rule — decides this control's fill in Chromium still holds
after the change. What a different platform does with `appearance: auto` on a closed `<select>`
remains unmeasured, and the file says so rather than generalising from one platform.
