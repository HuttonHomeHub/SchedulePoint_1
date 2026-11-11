# Amendment 3: what M0c's one fired rule means, option A″, and option B as the built fallback

- **Status:** Approved — under the product owner's instruction of 2026-11-11 to drive this work to completion and a
  release; the choice to try this refinement first, with option B built automatically if M0d fails, was reported to
  them the same evening.
- **Amends:** [`amendment-2-after-m0b.md`](./amendment-2-after-m0b.md) §2 (A′ gains one element), §3 (the decision rule, which
  could not be applied to S2 as written, and the stop rules, replaced for M0d). Through it:
  [`amendment-1-offer-at-1024.md`](./amendment-1-offer-at-1024.md) §2 option B (now specified to build);
  [`feature-spec.md`](./feature-spec.md) §1 item 4, §2 Edge cases, §4.6, §4.7, §4.9, SC-6;
  [`implementation-plan.md`](./implementation-plan.md) M0 (a fourth pass) and M2.
- **Author:** ui-architect, 2026-11-11. Nothing else in the repository is edited by this document.
- **Evidence base:** `m0-measurement.md` "M0c reading (2026-11-11)" and
  `readings/follow-logic-m0c-offer-row.fine.json`, both read in the builder's worktree
  (`.claude/worktrees/agent-a364d07151d6c6207/`, not yet on `main`), cited by line; the code cited inline. Pixel figures are
  from the container, not the owner's Surface (ADR-0128).

## Plain-English summary

The third measuring pass found one problem. In a window about 1210 to 1250 px wide, the new message fits beside the
plan facts, but the small "Expand" button at the end of the bottom bar no longer does, so it drops onto a line of its
own and the diagram loses 40 px. The cause is the bottom bar itself, not the message: the button is packed after the
facts as a separate item, so anything that takes room before the facts can strand it. Moving the facts and the button
into one group fixes it at every width, and it also fixes the same stranding that can happen today when the bar shows
"Recalculating…". I recommend trying that first in one short measuring pass (M0d). If any test fails, the compact
version you were told about (a short button that opens the sentence and the two choices) is built straight away,
with no further round of questions. The full sentence on screen is what you asked for, and this keeps it.

## 1. What M0c found, re-verified against the readings

| Claim (record or brief)                                                       | Verdict                                    | Evidence                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2 fires at 1250 × 800, mouse, a bar selected: foot 253 against 147, strip 58 | **Confirmed**                              | fine.json l. 39540 (base `footH` 147, outlet 573.5, bar 3 lines), l. 39591 (A′ `footH` 253, outlet 621.5, strip `h` 58), l. 39667 (toggle `top` 756, its own line)                                                                                                                                                                                                     |
| Below 1210 the outlet takes its own line and the bar's saved line pays for it | **Confirmed**                              | 1200, `placed-unflagged-selected`: base `footH` 127, bar 3 lines (l. 37967, 37992); A′ `footH` 185, outlet 907, bar **2** lines, strip 50 (l. 38018-38049). 185 − 127 − 50 − 8 = **0**                                                                                                                                                                                 |
| "Any other floor value leaves a similar band" (inferred, not measured)        | **True, and provable**                     | §2 below: the band is (toggle + gap) wide in **foot-row** width for every floor value, by the flex line-breaking rule. No reading is needed to establish it.                                                                                                                                                                                                           |
| The band is "narrow": window widths 1210–1250                                 | **Misleading**                             | It is 48 px of foot-row width. The foot row's width is the window less the Explorer (resizable 200–420 px, or a 34 px spine) and the facts' width varies by 350 px with the schedule state (327.5 current, 438 recalculating, 562–677 stale; record, R0 table). So the band lands at **any** window width for some Explorer width and facts state.                     |
| The band holds "Diagram and Gantt, all five variants" across 1210–1250        | **Only at 1250**                           | The 10 px sweep (`band`, fine.json from l. 36527) is Diagram and `edit-one` only; no `"view": "gantt"` entry exists after l. 36527. Gantt and the five variants were read at the 1250 grid cell only.                                                                                                                                                                  |
| The stranding needs a bar selected                                            | **No; it costs nothing extra without one** | 1250, nothing selected: A′ strip beside the facts on line 1, toggle alone on line 2 (`footH` 109 against 51, strip 58, toggle `top` 756 = strip `bottom` 756; l. 3545-3618). S2 scored it 0 because its formula excuses the strip's whole height even when the strip shares the facts' line. The cost happens to equal an own line's; the arrangement is the defect's. |
| Amendment 2's decision rule sends S2 to option B                              | **The rule is malformed (mine)**           | "S1, S2 or S5 fires **and R1 shows the base state passing the same test**". R1 is a 200 % control for S1 and S5; S2 has no base test, as the record itself notes. Read literally the rule never fires for S2; read as intended it sends to B. §6 replaces it with a rule that can be applied.                                                                          |

## 2. The cause, exactly

The foot row is `PlanActivitiesFootRow` (`apps/web/src/components/layout/workspace/activity-bottom-panel.tsx:550-564`): one
wrapping flex row (`flex flex-wrap gap-x-2 gap-y-0 px-2`) with **three** items in this order:

1. the dock outlet, `flex-1` (basis 0 %) with a `min-width` floor (`canvas-dock.tsx:136`): 18 rem when it holds anything,
   36 rem under A′ when it holds a `data-dock-row` strip;
2. the facts outlet, `flex max-w-full shrink-0` with an automatic basis (`plan-slot-host.tsx:130`), 327.5 px when current;
3. the toggle, `ml-auto shrink-0` (`FOOT_TOGGLE_CLASS`, `activity-bottom-panel.tsx:202`), 40 × 40 on a mouse.

A wrapping flex container fills each line greedily in order, using each item's **hypothetical** size: for the outlet that
is its basis (0) clamped up by its floor, never its content. So the line test is:

- outlet + facts share a line when `floor + 8 + facts ≤ row`;
- the toggle joins them only when `floor + 8 + facts + 8 + 40 ≤ row`.

Between those two thresholds the toggle, and only the toggle, wraps. At 1250 the row's content width is
573.5 + 8 + 327.5 + 8 + 40 = **957** (l. 39545, 39558, 39574). A′'s floor needs 576 + 8 + 327.5 = 911.5 ≤ 957 to sit beside
the facts, and 959.5 > 957 to keep the toggle: **2.5 px short**. The band is `[floor + facts + 8, floor + facts + 56)` of row
width for **any** floor and any facts width, which is why no floor value removes it.

**The shipped dock has the same band today**, at the 18 rem floor, whenever a selection bar is showing and the facts are
wide: with "Recalculating…" (438 px) at a foot row of 734–782 px (about 1027–1075 px windows at the default Explorer), with
the stale sentence plus **Recalculate** (627 px) at 923–971 px (about 1216–1264). **Derived, not read**: M0c's R3 read stale
facts at 1024, 1280 and 1440 only, all outside it. M0d reads it (§6, R3s).

## 3. The three refinements the brief named

| Candidate                                                                                    | Verdict                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (i-a) A container query on the foot row that sends the outlet to its own line (`basis-full`) | **Rejected.** A container query sees the row's width, not the facts' width, which varies by 350 px with the schedule state. Any threshold either strands the toggle in a wide-facts state or forces an own line where everything fits (the 1912 cost M0b found, by another route). It also needs a new breakpoint value with no derivation. |
| (i-b) The toggle kept on the facts' line **by structure**                                    | **Recommended (A″).** Facts and toggle become one flex item. The line test becomes `floor + 8 + (facts + 8 + 40) ≤ row`: the outlet is beside both or above both, and there is no third outcome. Exact for every floor, facts width, Explorer width and pointer (the coarse toggle's size is inside the group too).                         |
| (ii) A floor expressed against the row minus the toggle                                      | **Rejected, by §2's arithmetic.** Raising the floor by 48 px moves both thresholds by 48 px; the band moves with them. A floor is a single number tested before the toggle is.                                                                                                                                                              |
| (iii) Let the strip, not the toggle, be what wraps                                           | **Rejected.** The strip is inside the outlet; the outlet's line placement is decided by its floor, never its content, so nothing inside it can change which row item breaks. Letting the outlet go below its floor in the band is (ii).                                                                                                     |
| Toggle `order` or a negative-margin reservation                                              | **Rejected.** `order` puts the toggle at the leading edge, against the DOM and tab order (WCAG 2.4.3, 1.3.2) and against "the actions lead" (`activity-bottom-panel.tsx:457-475`). A negative margin is a one-off layout trick nothing else in the design system uses.                                                                      |

**A″ does not reintroduce ADR-0187's rejected content basis.** The outlet keeps its zero basis and its floor; the new group's
basis is `auto`, which is exactly what the facts (`shrink-0`, automatic basis) and the toggle each have today, summed. The
1912 cost is unchanged by construction: 576 + 8 + 375.5 = 959.5 fits beside an outlet of 1235 px, so the 1912 geometry
M0c read (strip under the bar, extra 0) is the same.

## 4. Option A″: the change

A″ is A′ (amendment 2 §2, items 1–5, unchanged) **plus one element** in `PlanActivitiesFootRow`:

```tsx
<CanvasDockOutlet />
<div data-foot-trail className="ml-auto flex max-w-full shrink-0 flex-wrap items-center gap-x-2 gap-y-0">
  <PlanFactsOutlet />
  {toggle}
</div>
```

- **`ml-auto`** keeps the group at the trailing edge of whichever line it lands on. On line 1 the outlet's `flex-1` takes the
  free space first, so it changes nothing there. On a line of its own the **facts now trail beside the toggle** instead of
  starting at the leading edge. That is the one visible change, and it is the rule the code already states ("the facts, now
  TRAILING", `activity-bottom-panel.tsx:552`); ux-reviewer judges it at M2.
- **`max-w-full flex-wrap`** keeps the 320 px reflow behaviour the row docblock describes (`:481-488`): the facts take the
  group's line and wrap inside it (`PlanFacts` is `max-w-full`, `plan-facts.tsx:120`), and the toggle wraps under them,
  still `ml-auto`.
- **Tab order and DOM order are unchanged** (outlet, facts, toggle). `focus-reachable.ts:27` and every test select by
  descendant (`[data-activities-bar] button`, `[data-activities-toggle]`); none selects the toggle as a direct child (searched
  `apps/web` for `activities-bar] >`: only the two measuring probes). No keyboard contract changes, so ADR-0111 is not
  engaged. `activity-bottom-panel.test.tsx:40-91` asserts classes and presence only, and holds.

**Injected for M0d** (the A′ stylesheet verbatim, `RULES_CSS` in the M0c probe, plus):

```css
[data-activities-bar] > [data-foot-trail] {
  margin-inline-start: auto;
  display: flex;
  max-width: 100%;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
  column-gap: 0.5rem;
  row-gap: 0;
}
```

and the group made in the page, then undone before anything React re-renders around it:

```js
const row = document.querySelector('[data-activities-bar]');
const facts = [...row.children].find((c) => c.querySelector('[data-schedule-state]'));
const toggle = row.querySelector(':scope > [data-activities-toggle]');
const group = document.createElement('div');
group.setAttribute('data-foot-trail', '');
facts.before(group);
group.append(facts, toggle);
// Restore BEFORE any view switch, panel expand/collapse, reload or route change (React removes
// these nodes from the row by parent, and would throw if they were still in the group):
group.before(facts, toggle);
group.remove();
```

**Cells A″ could move** (and so M0d re-reads): every cell where the outlet takes its own line (1024 mouse with a strip;
coarse 1024–1250 with a selection; every stale-facts cell) moves the facts to the trailing edge, height expected unchanged;
every cell where the toggle stood alone (A′ 1210–1250; the shipped dock with wide facts, §2) loses that line. At 1210–1250
A″'s geometry is 1200's, measured at extra 0 (§1). **Estimate, M0d reads it.**

## 5. A″ against option B, for this product and this owner

- **What the owner asked for** was that the screen says what happened. A″ shows the whole sentence and both choices on
  screen at every width from 1024 up. B shows a short count ("1 bar before its logic") and puts the sentence and both
  choices one press away at narrow widths, which on a 1024 laptop is most of the time.
- **What it costs.** A″ costs the diagram one line (about 50–60 px) at narrow widths while the message waits, which the owner
  already accepted (amendment 1, Q1); the fix in §4 removes the only case that cost more. B costs nothing at narrow widths
  but adds a pattern the design system deleted from the toolbar (ADR-0185: commands are promoted, never folded away) and
  needs its own exception in ADR-0216.
- **What it takes.** A″ is one wrapper element on top of the already-measured A′, read in one pass that the existing probe
  can run. B is a second rendering, a container query, a menu and its own pass.
- **Recommendation: A″,** with B pre-specified (§7) so a failure costs no further design round and no further question.

## 6. M0d: the fourth, short pass

Same harness (`measure:toolbar`), extend `follow-logic-m0c-offer-row.spec.ts` with a mode `A-double-prime` (A′ markup and
CSS plus §4's group) and a mode `base-grouped` (the shipped dock plus §4's group only), and the judge with S6–S7. Nothing
under `apps/web/src`. Product order as M0c (Diagram: link-plus-offer before the selection bar; Gantt: appended).

**New fields in every reading:** the foot row's content width; the facts' `top` and the toggle's `top` (S6); the group's
width; whether the facts sit at the leading or trailing edge of their line.

**Cells**

- **Sweep:** 1150 to 1330 in 10 px steps × 800 high; mouse and finger; `placed-unflagged-selected` and `flagged-bar-selected`;
  Diagram **and** Gantt; all five variants; modes `base`, `base-grouped`, `A-double-prime`.
- **Grid (regression):** 1024 × 600, 1120 × 700, 1280 × 800, 1440 × 900, 1646 × 1097, 1912 × 1080; mouse and finger; nothing
  selected, placed bar, flagged bar; Diagram and Gantt; five variants; the same three modes.
- **R3s, wide facts:** 1024, 1200–1270 in 10 px steps, 1280 and 1440; mouse; nothing selected and flagged bar; Diagram;
  real stale and the widest sentence (as M0c); modes `base`, `base-grouped`, `A-double-prime` (edit-one and link-plus-offer).
- **200 %:** 1024 × 600, root font and browser setting, Gantt root font; mouse and finger; three selections; five variants.
- **Row 580's four messages** (bare Linked band, undo result, layout-resolved notice, multi-select bar), long names: 1024,
  1210 to 1250 in 10 px steps, and 1280; mouse and finger; nothing selected and flagged bar (multi-select: its own state);
  modes shipped, `base-grouped`, and own-row (A″ markup on the strip: marker, wrap, action group).

**Stop rules** (each against the same cell's base; S2 against `base-grouped`, so a saving from the group cannot hide a
strip's cost):

1. **S1 (100 %).** A strip button not self-hit after `scrollIntoView`, or a sideways scroll the base lacks.
2. **S2 (100 %, every cell).** `extra > 4 px`, where `extra = cost − expected` and `expected` is: `strip.h + 8` when the strip
   is stacked under a selection bar; `strip.h` when it is on a line without the facts; `max(0, strip.h − baseLineH)` when it
   shares the facts' line (`baseLineH` is the base's foot height less its padding and border). This replaces M0c's formula,
   which excused a strip's full height when it shared a line (§1, row 6).
3. **S3 (100 %).** Nothing selected, stage < 120 px.
4. **S4 (100 %).** The sentence takes more than 2 lines (3 for link-plus-offer).
5. **S5 (200 %, either route).** As amendment 2 §3. Line counts reported, not judged.
6. **S6 (100 %, new, the defect named).** The toggle is not on the facts' line (`toggle.top` differs from the facts' line by
   more than half a line). **Verified red first:** the judge must fire S6 on M0c's own A′ readings at 1250 (l. 39667: toggle
   756, its own line) before M0d's verdict counts (ADR-0110).
7. **S7 (100 %, new, the group alone).** In any cell, `base-grouped`'s foot is taller than `base`'s, or its sideways scroll is
   new. Reported beside it, not judged: where the facts moved to the trailing edge.

**Decision rule**

- **No rule fires:** fold A″ (§9). Row 580 follows as §8.
- **Any rule fires:** build option B (§7) with no further design round. If only S7 fires, B is built without the group. If S6
  or S7 confirm the shipped dock's stranding (§2) and B is built, file it as a register row with the readings.
- C and D stay rejected (amendment 1 §2).

## 7. Option B, specified to build (only if M0d fails)

- **Where it switches:** the dock outlet becomes a named inline-size container, `@container/dock` added to
  `CanvasDockOutlet`'s classes. Its width never depends on its content (basis 0, explicit floors), so the containment
  changes no layout. A named token `--container-dock-offer: 36rem` sits in `globals.css` beside `--container-roomy`
  (no arbitrary value; rem, so 200 % text moves it). The variants go on the strip, never on the outlet itself
  (`container-query.structural.test.ts`). No `data-dock-row` marker and no 36 rem outlet floor: B never asks for its own row.
- **Two renderings in `FollowLogicStrip`, one shown:** `@min-dock-offer/dock:` shows the **full** form and hides the
  compact one; below it, the reverse. `display: none` takes the hidden one out of the tab order and the accessibility tree.
- **Full form:** A′'s strip (`messageFit="wrap"`, comfortable, action group), unchanged.
- **Compact form:** `NoticeStrip` compact density, same tone, no `role`. Its only content is one trigger, a `Button` with
  visible text `1 bar before its logic` / `N bars before their logic` (count only, so it never truncates a name) and a
  `ChevronDown` (`aria-hidden`). The visible text is the accessible name (ADR-0117). `aria-haspopup="menu"`, `aria-expanded`.
  `useMenuTrigger` (`menu.tsx:109`). For the link-plus-offer face, the shipped Linked band keeps its sentence and **Undo**,
  and the trigger follows **Undo**.
- **The menu:** the existing `Menu` (`menu.tsx:130`), `label` = the full offer sentence (the menu's accessible name, read
  when it opens), `openerRef` and `restoreFocusRef` = the trigger. Contents: `MenuSection` labelled with the subject
  (`Pour slab` / `Pour slab and 2 others`), then `MenuItem` **Follow logic** (shaded with `disabledReason` when the pen is not
  held, ADR-0204) and `MenuItem` **Keep it here**. No paragraph in the menu (`role="menu"` permits none, `menu.tsx:300-305`).
- **Announcement:** unchanged, the full sentence once through the workspace's polite region when the offer appears.
- **Keyboard and focus:** Tab reaches the trigger in the spec's DOM order. Press opens; focus moves to the first item;
  arrows, Home and End rove; Escape closes and returns focus to the trigger. Choosing an item runs it, the menu returns focus
  to the trigger, the offer is consumed, and the strip's ADR-0135 hand-off (`useContainerUnmountHandoff`) moves focus to the
  canvas listbox (Diagram) or the grid (Gantt). accessibility-reviewer runs before release on the double move (trigger, then
  hand-off). No primitive changes, so ADR-0111 is not engaged.
- **ADR-0216 then records** an exception to ADR-0109 D1 / ADR-0185 for one event strip in the dock, with this section's
  reasons.
- **Its own pass (M0e, minimal):** the M0d grid at 1024, 1120, 1250, 1280, 1440, 1912 plus 1210–1250 in 10 px steps; both
  pointers; nothing selected and flagged bar; Diagram and Gantt; five variants; 200 % both routes at 1024; R3's stale facts at
  1024 and 1250. Rules: S1, S3, S5, S6 as §6; S2 and S4 on the full form; for the compact form, one line (cost ≤ the shipped
  Linked band's in the same cell), trigger self-hit, and with the menu open every item self-hit inside the window. Read
  both forms at the switch width ±10 px. **If M0e fires a rule, that is the owner's decision**, reported with the readings.

## 8. Row 580 under this recommendation

- **Remedy:** the own-row treatment M0c measured (`m0-measurement.md` "Row 580" table): `messageFit="wrap"`,
  `density="comfortable"` and `data-dock-row` on the bare Linked band (`CanvasModeBand`), `HistoryResultStrip`,
  `LayoutResolvedStrip` and `BulkSelectionBar` (all four render `NoticeStrip`). Full sentence visible on all four without hover;
  +18 to +58 px at 1024 on a mouse while a message shows; the multi-select bar **−32 px** (194 → 122). `grow` stays rejected.
- **Vehicle:** its own PR immediately after M2, in the same release, under row 580 (no new entry point, no new primitive
  value: M2 lands `wrap`, the marker and the group). It is separate because it changes four strips' journeys and every link's
  confirmation height at 1024, and M2's journeys should not carry that. Before it ships, M0d's 1210–1250 message readings
  must hold S2 and S6 for all four.
- **If B is built:** row 580 still takes the own-row treatment, which then needs the outlet floor and the group for those
  four strips only; M0d's message readings decide it, and row 580's Next is updated with them.

## 9. What changes when M0d passes (all three amendments folded in one go)

**Spec**

- **Header:** related ADRs add ADR-0187, ADR-0092, ADR-0114.
- **§1 item 4:** delete "the first to move into the `⋯` under width pressure" (amendment 1 §3).
- **§2 Edge cases, summary row:** a placed, flagged `WBS_SUMMARY` can exist (M0 C7) and is excluded; the plan offer's N can
  read lower than the conflict chip (amendment 1 §3).
- **§4.6:**
  - `FollowLogicStrip` uses `messageFit="wrap"`, `density="comfortable"` and `data-dock-row`.
  - `NoticeStrip` gains `messageFit="wrap"`: root adds `flex-wrap` (`min-w-0` is already in the base, #579); the `<p>` is
    `flex-1 min-w-[min(16rem,100%)]`; children are wrapped in one `div` `ml-auto flex max-w-full flex-wrap justify-end gap-2`.
    `grow` and `truncate` render byte-identical markup. component-reviewer runs on it.
  - `CanvasDockOutlet` gains `not-empty:has-[[data-dock-row]]:min-w-[min(36rem,100%)]`, its reason written beside the two
    existing floors (`canvas-dock.tsx:104-132`).
  - `PlanActivitiesFootRow` wraps `PlanFactsOutlet` and the toggle in §4's group, with the §2 arithmetic as its docblock.
  - `COMPONENT_LIBRARY.md`: `data-dock-row` beside `data-dock-wide`; `messageFit="wrap"`; the foot row's trailing group.
- **§4.7:** "both strips sit in the dock in DOM order after the canvas and the selection bar" becomes: the link-plus-offer face
  keeps the mode band's position (before the selection bar in the Diagram, `TsldPanel.tsx:3327` against `:3338`); other faces
  follow the bar. On its own line the strip reads before the facts.
- **§4.9, ADR-0216 draft:** add "Amends ADR-0187 D3 (a marked notice strip carries the 36 rem own-row floor on any pointer;
  the selection bar's rule is unchanged), ADR-0092 D2 and ADR-0114 D1 (an event strip may cost its own line while it waits),
  and ADR-0114 D2 (the facts and the panel toggle are one trailing group)". Add **D8**: on a coarse 1024 × 600 window with a
  selection the 120 px stage floor is waived while an event strip awaits an answer (amendment 1 Q2). Add **D9**: the foot row
  packs the facts and its toggle as one item, so no dock floor can strand the toggle on a line of its own.
- **SC-6, replaced:** at 1024 × 600, 1250 × 800, 1440 × 900 and 1912 × 1080, fine and coarse, Diagram and Gantt, every offer
  variant: every button self-hit, no sideways scroll, at most two lines (three for link-plus-offer), the toggle on the facts'
  line; with nothing selected the stage ≥ 120 px; with a selection on a coarse pointer the floor holds whenever no event strip
  is showing (D8). Read in M0d, asserted at M2.

**Plan**

- **M0:** Task 0.4 (M0b), Task 0.5 (M0c), Task 0.6 (M0d), each pointing at its section of `m0-measurement.md`. The M0c record
  and readings land on `main` with M0d's.
- **M2, T2.2:** builds A″: the `NoticeStrip` value, the outlet class, the foot-row group, the strip. Tests: `notice-strip`
  unit (the `wrap` markup; `grow`/`truncate` unchanged); `canvas-dock` unit (the class present); `activity-bottom-panel` unit
  (facts and toggle inside one `data-foot-trail` element with `ml-auto max-w-full flex-wrap`; DOM order unchanged); a
  `dock.spec.ts` case at 1024 and 1250 fine with a bar selected (buttons self-hit, no sideways scroll, toggle on the facts'
  line). `narrow-shell` and `dock.spec.ts`'s existing deltas must stay green (`scripts/e2e-local.sh web:workspace-chrome`).
  Reviews: component (the primitive value), ux (the facts trailing on a second line), accessibility (§4.7).
- **M2, risk row, replaced:** "The offer does not fit beside the facts at narrow widths → it takes its own line, and the facts
  and toggle move as one group (amendments 2–3, A″); M0d measured it."
- **New Task 2.5 (or row 580's PR):** §8, after T2.4, same release.

**If B is built instead:** §4.6 takes §7's two renderings, the `dock` container and its token in place of the marker and
outlet floor; §4.7 adds the menu's keyboard and focus paragraph from §7; ADR-0216 records the ADR-0109 D1 / ADR-0185
exception instead of D9; SC-6 takes M0e's rules; the plan's M0 adds Task 0.7 (M0e).

## 10. The one decision that is the owner's

**May we try the one-line fix first (one short measuring pass), and build the compact version automatically if it fails?**
**Default: yes.** It replaces the fallback you approved with one more check before it, and it is the only route that keeps the
whole message on screen.

## 11. Corrections recorded

- **Amendment 2 (mine):** §2's "1120–1250 with a selection: … the same geometry as M0b, where extra was 0" is false at
  1210–1250 (§1). §3's decision rule cannot be applied to S2 (§1, last row); §6 replaces it.
- **M0c record:** "a floor at any other value leaves a band of the same kind" is stated as an unmeasured inference; it is
  provable (§2). "Diagram and Gantt, all five variants" across the band holds at 1250 only; the sweep was Diagram, `edit-one`
  (§1). The stranding also occurs with nothing selected at 1250, scored 0 by S2's formula (§1).
- **The brief:** "a narrow band" understates it: the band is a foot-row width, reached at other window widths by the Explorer's
  width or the facts' state (§1, §2).
- **Not this epic, recorded for whoever next reads it:** ADR-0114 D2 still says "the facts lead and the dock follows"
  (`0114-…md:86-88`); the code has had the facts trailing since foot-row-and-deck M3 (`activity-bottom-panel.tsx:457-475`), and
  the ADR carries no amendment note. §9's ADR-0216 line amends ADR-0114 D2 and should state that drift. Separately, ADR-0187
  D3's "costs 40 px at 1120 to 1250" on fine pointers may be this same stranding; **not read**, and no claim is made.
