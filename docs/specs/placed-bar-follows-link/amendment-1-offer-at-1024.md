# Amendment 1: where the offer goes when the dock cannot hold it at 1024

- **Status:** Draft — awaiting approval before implementation.
- **Amends:** [`feature-spec.md`](./feature-spec.md) §1 item 4, §2 Edge cases (summary row), §4.6, §4.9, SC-6;
  [`implementation-plan.md`](./implementation-plan.md) M0 (a second pass), M2 (dependency and risk row).
- **Author:** ui-architect, 2026-11-11.
- **Why it exists:** M0 overturned SC-6 and the M2 risk row (`m0-measurement.md` C12, C13, on branch
  `m0-follow-logic`, commits 605623a and 9a17467). The spec says that a false premise stops the work and comes back.
  This document is that return. It changes nothing in the spec, the plan, any ADR or `CLAUDE.md`. Those edits follow
  approval.

## Plain-English summary

On a 1024-wide window, the space at the foot of the diagram where messages appear is only about 350 px wide.
The two buttons alone take 200 px of it, so "make the message shorter" cannot make it fit. The fix proposed here
is that the message moves onto a line of its own across the full width of the foot bar while it is on screen, and
goes away when you answer it. On a wide screen like yours (1646 or 1912) nothing changes: it still fits beside the
plan facts. On a 1024 laptop the diagram gets roughly 55–75 px shorter while the message waits, and gets that back
when you press Follow logic or Keep it here. There is one hard case. On a 1024 × 600 touch tablet with a bar selected,
the diagram is already almost at its minimum height, and any message pushes it below that minimum. The existing
"Linked A → B" message already does this today. I recommend accepting that while the message waits for your
answer. Renaming "Clear visual start" to "Follow logic" (M1) does not depend on any of this and can go ahead now.

## 1. What was re-read, and what decides the design

Every claim below that decides something is cited. Pixel figures come from M0's readings, which were taken in a
container, not on the owner's Surface (ADR-0128).

| Fact                                                                                                                                                                                                                                                                                                                       | Source                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| The foot row is `[dock outlet][plan facts][toggle]`. The row wraps. The facts are `shrink-0`.                                                                                                                                                                                                                              | `activity-bottom-panel.tsx:550-564`                                                                               |
| The outlet is `flex-1` (zero basis), so it gets whatever the facts leave: 348 px fine and 344 px coarse at 1024. It only takes a line of its own when a strip marks itself `data-dock-wide`, and that only on a coarse pointer from `sm` up.                                                                               | `canvas-dock.tsx:104-137`; `selection-actions.tsx:1402-1403`; readings `width.fine.json` cell 1 (`outletW` 348.1) |
| ADR-0187 D3 refused to extend the own-row floor to fine pointers **for the selection bar**. It saves 40 px at 1024–1040 and costs 40 px at 1120–1250. ADR-0187 also rejected a content basis for the same bar ("forces the own row where the bar fits beside the facts").                                                  | ADR-0187 D3 and Alternatives; `docs/TECH_DEBT.md` #489                                                            |
| A docked strip may cost a line or two, never a band. ADR-0114 D1 turned ADR-0092's 0 px equality into that bound. The dock shows at most one transient strip (ADR-0114 D5). The precedence for that lives only in `resolveDockStrip`.                                                                                      | ADR-0114 D1, D5; `dock-strip.ts:84-135`                                                                           |
| `NoticeStrip`'s `truncate` fit claims it "keeps a one-line mode statement from pushing its Undo button off a narrow canvas". It does not. `textTruncated` was `false` in all 198 strip readings. The `<p>` is `min-w-0 truncate`, but the strip itself has no `min-w-0`, so it keeps its natural width (cause not proven). | `notice-strip.tsx:59-62`, `:98`; `m0-measurement.md` §2                                                           |
| `grow` does keep the strip inside the outlet. At 348 px that costs 4–11 lines.                                                                                                                                                                                                                                             | readings `width.fine.json` `edit-one/grow` (`w` 348.1, `textLines` 5)                                             |
| The 120 px stage floor is a journey guard for the diagram-corner cluster. It is not an ADR.                                                                                                                                                                                                                                | `e2e-minimap/viewport-cluster.spec.ts:515-528`; `docs/TECH_DEBT.md` #488 (closed as a margin)                     |
| The owner's Surface reports `pointer: fine`. The coarse cells model other tablets, not his machine.                                                                                                                                                                                                                        | ADR-0180 D2; ADR-0118 D7                                                                                          |
| The plan facts hold the Recalculate control and the pen's `role="status"` region, so they cannot be hidden to make room.                                                                                                                                                                                                   | `plan-facts.tsx:168`, `:180`                                                                                      |
| A command surface wraps and never hides (ADR-0109 D1). The toolbar's fold-into-overflow mechanism was deleted (ADR-0185).                                                                                                                                                                                                  | ADR-0109 D1; ADR-0185                                                                                             |
| The offer is an **event**: no live role, announced once through the polite region, no timer. The plan-wide offer is a **condition**.                                                                                                                                                                                       | ADR-0132 D1; spec §4.7                                                                                            |
| The reason is stated on the object, and the deck's chip stays count-only.                                                                                                                                                                                                                                                  | ADR-0186 D1, D4                                                                                                   |

## 2. Options

The cost figures marked **(M0)** were measured. Those marked **(est.)** are estimates and are what the M0b pass
(§4) must read before anything is built (ADR-0142).

|                                       | **A. A row of its own, only when it does not fit** (recommended)                                                                                                                                                                                                                                                                                                                                                                                    | **B. Compact trigger plus `Menu` at narrow widths**                                                                                                                                                                                                    | **C. No dock message at narrow widths; the object carries it**                                                                                                                                           | **D. The facts yield their line while the offer shows**                                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Mechanism**                         | The offer strip marks itself `data-dock-row`. The outlet gains one rule, `has-[[data-dock-row]]:basis-auto`, so while such a strip is present the outlet's basis is its content. The row's existing `flex-wrap` then puts it beside the facts where it fits, and on a full-width line of its own where it does not. The strip uses `messageFit="grow"` and `density="comfortable"`. It is pure CSS: no JS measurement (ADR-0109 D1), no breakpoint. | A short trigger (`2 bars left behind ▾`) opens the APG `Menu`: a `MenuSection` heading, then **Follow logic** and **Keep it here**. Above some width the full strip renders instead, which needs both renderings with one hidden by a container query. | The strip is not rendered at narrow widths. The planner learns from the count chip rising, the polite announcement, and the selection bar's caption plus Follow logic when they select the stranded bar. | While an offer is shown, the facts are hidden, so the outlet has the whole first line.                                                 |
| **1024 × 600 fine, nothing selected** | Edit-one is one line on its own row. Long name, several, and link plus offer are about two lines. Stage 402 → ≈348 (one line, **M0** +54 from the 1-line own-row cell) or ≈328 (two lines, **est.**).                                                                                                                                                                                                                                               | One line beside the facts. About +6 px, as the shipped band (**M0** control: foot 57 vs 51). The sentence is one press away.                                                                                                                           | +0 px. A sighted planner is told nothing visible at the moment it happens.                                                                                                                               | About +0–20 px. Facts, Recalculate and the pen status disappear.                                                                       |
| **1024 × 600 coarse**                 | Nothing selected: stage 278 → ≈212 (**M0** a 66 px line; 2 lines **est.** ≈192). Bar selected: stage 138/122 → **72/56** (**M0**), the same as the shipped Linked band today.                                                                                                                                                                                                                                                                       | Nothing selected: about +14. Bar selected: the trigger still needs a line under the 3-line selection bar, so ≈ −52 (**est.**). The floor is still breached.                                                                                            | +0                                                                                                                                                                                                       | The bar-selected case still breaches, because the facts already sit on their own line there.                                           |
| **1440 / 1646 / 1912**                | Unchanged where the strip fits beside the facts. At 1912: +6 fine, +14 touch (**M0**). Long variants take their own line instead of wrapping (**est.** about +54 at 1440 fine, which is already the measured cost there).                                                                                                                                                                                                                           | Full strip, as the spec has it.                                                                                                                                                                                                                        | Full strip.                                                                                                                                                                                              | Full strip.                                                                                                                            |
| **Keyboard / screen reader**          | As spec §4.7, unchanged. Native buttons, DOM order is outlet first, so the reading order matches the new visual order (strip line above facts line). Announced once. No timer. ADR-0135 hand-off.                                                                                                                                                                                                                                                   | Adds a menu: trigger `aria-haspopup`, arrow keys, Esc. The actions are one press deeper only at narrow widths, so the operation differs by width. The announcement still carries the full sentence.                                                    | The announcement fires, but there is no visible counterpart, so SC-5's "reachable" means selecting B first. Fails the owner's finding for sighted users at 1024.                                         | Removes a live region (the pen status) and a control (Recalculate) while the offer shows. Fails WCAG 4.1.3 robustness and ADR-0109 D1. |
| **Reuses**                            | `NoticeStrip`, `Button`, and the outlet's existing `has-[…]` floor pattern. No primitive changes. ADR-0111 is not engaged.                                                                                                                                                                                                                                                                                                                          | `Menu`, `MenuSection`, `Button`, `NoticeStrip`. This is a new "strip folds into a menu" pattern, the overflow idea ADR-0185 deleted from the toolbar, now in the dock.                                                                                 | Selection bar, caption, chip. A width switch is still needed to drop the strip.                                                                                                                          | `PlanFacts` gains a hide state. This is one-off.                                                                                       |
| **ADRs it would amend**               | ADR-0187 D3: a marked notice strip, not the selection bar, may take its own row on any pointer. ADR-0092 D2 / ADR-0114 D1: an event strip may cost its own line while it waits. Recorded inside ADR-0216; no separate ADR.                                                                                                                                                                                                                          | ADR-0109 D1 and ADR-0185 (hiding in the dock); a new pattern in `COMPONENT_LIBRARY.md`.                                                                                                                                                                | Spec §0 and US-1 (the core promise) at narrow widths.                                                                                                                                                    | ADR-0109 D1, ADR-0114 D4.                                                                                                              |
| **Measure before building**           | M0b (§4): every variant in the five cells plus 1120/1250/1280, both pointers, three selection states, Diagram and Gantt, 200 % text.                                                                                                                                                                                                                                                                                                                | The same, plus the trigger's coarse line and the width at which it switches.                                                                                                                                                                           | No measurement can make it satisfy US-1 at 1024.                                                                                                                                                         | Not worth measuring.                                                                                                                   |
| **Verdict**                           | **Recommended**                                                                                                                                                                                                                                                                                                                                                                                                                                     | Viable fallback. Rejected: adds a hiding pattern and does not fix the coarse floor.                                                                                                                                                                    | Rejected: does not solve the problem it exists for.                                                                                                                                                      | Rejected: hides a control and a live region.                                                                                           |

**Not offered:** putting the strip above the scene (ADR-0092 D2 and D6a, which keep every strip in one place), a
toast with a timer (WCAG 2.2.1, spec §4.7), and shortening the copy (M0 C12: the buttons alone leave about 100 px).

### The shipped `Linked “A” → “B” (FS).` band

M0's control reading does **not** show it overflowing at 1024. With the measured names it is 333.8 px in a 348 px
outlet, `overflowsOutletBy: 0` on both pointers (readings `width.fine.json` and `width.coarse.json`, control cell,
nothing selected). What M0 does show:

1. **On coarse 1024 × 600 with a bar selected it already takes the stage to 72/56 px.** That breaches the 120 px
   guard. #488 measured only the selection bar, and that journey never arms the Link tool.
2. **It has the same latent overflow with long names.** `truncate` never engages, so a sentence naming two long
   activities will exceed 348 px and cover its own Undo. This was **not measured**, and is inferred from
   `notice-strip.tsx:98` plus 198 readings with `textTruncated: false`. `LayoutResolvedStrip` (two buttons,
   `LayoutResolvedStrip.tsx:38`) and the history result strip likely share it. Not measured either.

**Where it belongs:** the `linked` face **carrying the offer** is the offer strip, so it is in this epic (spec §4.6
already makes it one strip). Mechanism A fixes it by construction. The bare `linked` face and the other dock strips,
plus `NoticeStrip`'s false `truncate` docblock, belong in **their own register row**. They are a live defect that
exists without this feature, they touch every dock strip's height at 1024, and each has its own journeys. Applying
A to them is one attribute per strip once this epic has landed the outlet rule. M0b reads them in the same harness so
the row starts with evidence (Q3).

## 3. Recommendation

**Option A.** It is the smallest structure that fits:

- one attribute on one new strip;
- one `has-[…]` class on the existing outlet;
- an existing `NoticeStrip` fit and density.

It uses the row's existing wrap, so the strip goes beside the facts exactly when there is room and on its own line
when there is not. It needs no breakpoint, no JS, and no second rendering. The cost is a line of diagram height at
1024 for as long as the planner leaves the question unanswered. Both buttons return it.

It leaves one case unsolved, and it is better to say so than to absorb it: **coarse 1024 × 600 with a selection**. No
option measured here holds the 120 px floor there, because a 58 px strip plus an 8 px gap is more than the 2–18 px of
margin. The shipped Linked band already breaches it. I recommend accepting the breach **while an event strip awaits an
answer** (Q2), and stating that in the guard rather than hiding it.

### What changes in the spec (after approval)

- **§1 item 4:** delete "the first to move into the `⋯` under width pressure". M0 C5 found that the bar wraps and
  that the comment at `selection-actions.tsx:1048-1051` predates the wrapping deck.
- **§2 Edge cases, summary row:** a placed, flagged `WBS_SUMMARY` can exist (M0 C7, via a bound such as the data
  date). It is still excluded from both batches. The plan offer's N can read lower than the conflict chip, and M3's
  copy must not imply the two are equal.
- **§4.6:**
  - `FollowLogicStrip` uses `messageFit="grow"`, `density="comfortable"` and `data-dock-row`.
  - `CanvasDockOutlet` gains `has-[[data-dock-row]]:basis-auto`, with its reason written beside the existing two
    floors (`canvas-dock.tsx:104-132`).
  - `COMPONENT_LIBRARY.md` documents the marker next to `data-dock-wide`.
- **§4.9 (ADR-0216):** add "Amends ADR-0187 D3 (a marked notice strip may take its own row on any pointer; the
  selection bar's rule is unchanged)" and a D8 stating the coarse-floor exception if Q2 is accepted.
- **SC-6, replaced:** _At 1024 × 600, 1440 × 900 and 1912 × 1080, fine and coarse, in the Diagram and the Gantt,
  every offer variant (1) has every button self-hit, (2) causes no sideways scroll, and (3) wraps to at most two
  lines (three for the link-plus-offer). With nothing selected the stage stays at or above 120 px on both pointers.
  With a selection on a coarse pointer, the 120 px floor holds whenever no event strip is showing (Q2). Read in M0b,
  re-taken at M2._
- **Plan, M2 risk row, replaced:** "The offer does not fit the dock at 1024 → it takes its own row (amendment 1, A);
  M0b measures it; if a stop rule in §4 fires, fall back to B and come back to the owner."

### What changes in the plan

- **M0 needs a second, short pass (M0b, Task 0.4),** described in §4. It is measurement only, in the same
  `measure-toolbar/` harness, with nothing under `apps/web/src`.
- **M1 is unaffected and safe to build now.** C14 confirmed that the label is narrower (146 → 113.8 px fine, 154 →
  121.8 coarse) and moves no foot row at 1024 or 1440. At 1912 touch it **removes** a line (−48 px). M1 touches the
  selection bar's label, not the dock. It should record the 1912 figure beside `dock.spec.ts` as the plan says.
- **M2** gains a dependency on M0b and this amendment's approval. T2.2 builds A. Its tests add a `canvas-dock` unit
  case asserting that the class rule is present when a marked strip is mounted, and a journey cell at 1024 fine
  asserting self-hit buttons and no sideways scroll.
- **M3** is unchanged except the copy note on N (above).

## 4. M0b: what must be measured before A is built (ADR-0142)

The method is injected styles on the real page, as in M0 §2: add `data-dock-row` to the cloned strip, set
`grow`/`comfortable`, and add the outlet rule as an injected stylesheet.

**Cells:**

- 1024 × 600, 1120 × 700, 1250 × 800, 1280 × 800, 1440 × 900, 1646 × 1097 and 1912 × 1080;
- fine and coarse pointers;
- three selection states (nothing selected, a placed bar, a flagged bar);
- all five variants;
- **Diagram and Gantt** (the Gantt was not measured in M0);
- plus 1024 × 600 at 200 % text by a user style sheet (ADR-0187 D2, ADR-0213).

**Readings per cell:**

- strip lines;
- foot row and stage height;
- every button's self-hit;
- sideways scroll;
- whether the diagram-corner cluster is inside the stage;
- for the selection bar, its line count with and without the strip.

**Controls in the same run (for the Q3 row):**

- the bare Linked band with two 46-character names;
- `LayoutResolvedStrip` with a real sentence;
- each with and without the marker.

**Stop rules (any one returns this to the owner with B as the fallback):**

1. In any fine-pointer cell, a variant takes more than two lines (three for link-plus-offer), or a button is not self-hit.
2. At 1120–1250 fine with a selection, the strip's presence costs more than its own lines. This would be ADR-0187 D3's
   40 px returning because the selection bar takes the full row too. If so, try the alternative rule (marker only when
   no `data-dock-wide`/selection bar is in the outlet) and re-read before returning.
3. With nothing selected, the stage drops below 120 px in any cell at or above 1024 × 600.
4. Any Gantt cell differs from its Diagram cell by more than the strip's own height.

## 5. Questions for the owner (each with a recommended default)

1. **On a narrow window, may the message take a line of its own across the foot bar while it waits for your
   answer?** The diagram is about 55–75 px shorter until you press a button. **Default: yes (option A).** The
   alternative (B) hides the sentence and the buttons behind a small menu at narrow widths.
2. **On a 1024 × 600 touch tablet with a bar selected, the diagram drops to about 56–72 px while the message waits**
   (the Linked confirmation already does this today). **Accept it while a message is waiting, or not?** **Default:
   accept.** Either button, Esc, or your next edit restores the height. The floor check is reworded to "when no message
   is waiting" and gains a check that the message's buttons stay pressable there. If you say no, the epic cannot
   offer the message on that one screen and posture, and option C applies there only.
3. **The existing foot messages (the bare "Linked …" confirmation, "moved clear of an overlap", the undo result) can
   spill out of the same 350 px space when names are long. Fix them in this epic, or separately?** **Default:
   separately, as a new register row.** M0b gathers the evidence for it, and it is built straight after M2 using the
   same one-attribute change. It is an existing defect, and folding it in would widen this epic's journeys.

## 6. Corrections recorded

- **The brief said the shipped Linked band "alone already overflows the same way at 1024".** The readings show it fits
  (333.8 px in 348, `overflowsOutletBy: 0`, both pointers). Its measured exposure is the **coarse stage floor with a
  selection** (72/56 px). Its overflow with long names is inferred, not measured.
- **The brief said `#488` "under-states an existing exposure".** That is right in substance, but #488 is **closed**
  ("as a margin with the guard in place") and measured the selection bar only. The new exposure needs a new row or Q2's
  reworded guard, not a re-opened #488.
- **`NoticeStrip`'s `truncate` docblock** (`notice-strip.tsx:59-61`) claims a behaviour that 198 readings contradict.
  That is an ADR-0076 Class 3 claim, and it goes in the Q3 row.
- **M0's own summary** says the shipped strip "does the same" as the offer. That is true of the coarse floor and not of
  width overflow. §2 of the same record has it right.
