# Amendment 2: what M0b's fired stop rules mean, and option A′

- **Status:** Approved — by the product owner, 2026-11-11, with all defaults (Q1 the revised design and the M0c
  pass, Q2 fix the existing cut-off buttons first, Q3 judge 200 % text by reachability). **M0d passed 2026-11-11; folded**
  (with amendments 1 and 3, by [`amendment-3-after-m0c.md`](./amendment-3-after-m0c.md) §9: A′ plus the foot row's one trailing group, A″).
- **Amends:** [`amendment-1-offer-at-1024.md`](./amendment-1-offer-at-1024.md) §2 option A's mechanism, §3 "What changes in
  the spec" (§4.6 bullets), §4 (M0b's stop rules, replaced for M0c). Through it: [`feature-spec.md`](./feature-spec.md)
  §4.6, §4.7, SC-6; [`implementation-plan.md`](./implementation-plan.md) M0 (a third pass) and M2.
- **Author:** ui-architect, 2026-11-11. Nothing else in the repository is edited by this document. The spec, plan,
  ADR-0216's draft and `docs/TECH_DEBT.md` change only after approval.
- **Evidence base:** `m0-measurement.md` "M0b"; `readings/follow-logic-m0b-offer-row.fine.json` (cited by line);
  the probe `apps/web/measure-toolbar/follow-logic-m0b-offer-row.spec.ts`; the code cited inline. Pixel figures are
  from the container, not the owner's Surface (ADR-0128).

## Plain-English summary

The second measuring pass found three real problems. Only one of them was caused by the screens being broken.
(1) On a wide screen with a bar selected, the message cost an extra line. That is a mistake in my rule: it asked for
room for the selection bar and the message together. The fix is to ask for a fixed amount of room instead, which is
the same rule the foot bar already uses on touch screens. (2) At double text size the message became a thin column
up to 11 lines tall, because its three buttons stayed beside the words. The fix is to let the buttons drop under the
sentence when the space is narrow. (3) "Buttons not pressable at double text size" is mostly the measuring tool's
fault. At that size the whole screen scrolls by design, and the foot bar sits below the window before any message
appears. A short third pass (M0c) checks all three. Separately, the cut-off "Linked …" button is a real bug today and
should be fixed first, on its own.

## 1. What each fired rule means

The categories are the ones the brief set: **(a)** a real defect in option A; **(b)** a pre-existing condition option A
inherits; **(c)** a rule drawn wrongly.

### Rule 1 (fine pointer: more than two lines, or a button not self-hit), fired at 200 % only

It fired for three separate reasons, and each one is classified on its own.

| Part                                                                | Verdict                       | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buttons "not self-hit, clipped" with nothing selected (both routes) | **(b), probably; not proven** | At 200 % the shell enters `squat`, its one scrolling mode: row 3 becomes `100dvh` and the shell grid scrolls (`app-shell.tsx:133-160`, ADR-0213). The foot row is therefore below the 600 px window **before any strip exists**. At the root route the base reading has stage 421 and foot 163 (fine.json `text200`, l. 14614-14631), and the edit-one strip's top is at **y = 961** (l. 14654). At the browser-setting route the base has stage 485 and foot 99 (l. 15498-15514), and the strip's top is at **y = 681** (l. 15538). The probe's `selfHit` is `elementFromPoint` at the button's centre, which returns `null` for any point outside the viewport, and its `clipped` counts `bottom > innerHeight` (probe l. 223-236). Neither can tell "below the fold of a scroller" from "unreachable". |
| Line counts above 2 (or 3) at 200 %                                 | **(c)**                       | A line limit calibrated at 100 % cannot hold at 200 % in the same CSS width. Doubling the glyphs roughly doubles the lines. WCAG 1.4.4 asks for no loss of content or function, not a line count. The rule should never have applied its 100 % line limit to the 200 % cell.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| The **shape** of the 200 % strip: 4–11 lines of a 138–215 px column | **(a)**                       | Option A's strip keeps every button beside the sentence (`density="comfortable"` is `items-start`, and `NoticeStrip` is a non-wrapping `flex`; `notice-strip.tsx:23`, `:45`). At the root route the outlet is 715 px and the three buttons are 116 + 200 + 200 px, so the sentence gets **138 px** (link-plus-offer, `textClientW` 138, `textLines` 11, l. 14851-14853). The strip is 474 px tall. This is not the dock's base state. It is option A's strip.                                                                                                                                                                                                                                                                                                                                             |

**What separates (b) from (a) for the self-hit part (one measurement):** in the same 200 % cells, read the **base state**
and the **shipped Linked band**. Record the shell scroller's `scrollTop`, `scrollHeight` and `clientHeight`. Call
`scrollIntoView({ block: 'nearest' })` on each button, including the foot row's own Expand toggle, and only then take
`elementFromPoint`. Here is how to read the result. If the Expand toggle and the shipped Undo are self-hit after
scrolling, and option A's buttons are too, the M0b reading was the instrument. If the toggle is self-hit and option A's
buttons are not, that is (a). If neither is self-hit, the shell has a 1.4.4 defect at 200 % that predates this epic.
That would go in its own row. It would not block this epic.

### Rule 2 (1120–1250 fine with a selection), held, but drawn too narrowly: (c)

It held: extra 0 px in the Diagram and −40 px in the Gantt. But it asked about the cost of the strip only where I
expected ADR-0187 D3's 40 px. Rule 4 found that cost at 1646 and 1912. The correct form of rule 2 is "**extra ≤ 0 in every
cell**", with no width window. That rule would have fired at 1912 directly, rather than through a Gantt/Diagram comparison.

### Rule 3 (nothing selected, stage < 120), fired at 200 % by the root route only: **(a)**

The root route's base stage is 421 px (l. 14627), so the floor holds without the strip. Option A takes the stage to
**0** for link-plus-offer (l. 14840) and to **107** for the long name (l. 14692). The cause is the 138–215 px text column
from the rule 1 row above: an 11-line strip is 474 px. This is option A's doing, and §2's wrap mechanism removes the
cause. The browser-setting route holds (minimum 291). In that route the rem media queries move and the outlet is
992 px wide (l. 15529), so the sentence has room.

### Rule 4 (Gantt differs from Diagram by more than the strip), fired at 1912 mouse: **(a)**, with a (c) in its wording

**The mechanism is mine, and it is the alternative ADR-0187 had already rejected.** `has-[[data-dock-row]]:basis-auto`
sets the **outlet's** basis to its content. The outlet is one flex container holding the selection bar **and** the
strip. Its max-content is therefore bar + gap + strip on one line: at 1912, 1042 + 8 + 631 px, more than the
1235 px beside the facts. The outlet takes the whole row, so the facts (`shrink-0`, `plan-facts.tsx:120`) wrap to a line
of their own. Inside the outlet, the bar and the strip still need two lines. The extra 36–40 px is the facts' line. ADR-0187's
Alternatives (l. 54) rejected "a content basis … forces the own row where the bar fits beside the facts". Amendment 1
cited that rejection (§1, row 3) and then used a content basis anyway, reasoning about the strip alone. The strip is
never alone when a bar is selected.

The Gantt differs only because its selection bar is narrower. Bar plus strip fit beside the facts at 1912 and do not at
1646, which is why the Gantt shows the same extra at 1646 (M0b table, row "1280 to 1646"). **So the defect is "extra > 0",
and the Gantt/Diagram difference is only where it happened to be visible (c).** A rule on extra catches it in both views.

### The 731 vs 347.5 px outlet

**These are the same outlet element in both cases**, the `CanvasDockOutlet` div (`canvas-dock.tsx:133-137`), found by
the same selector (probe l. 137). It is not "live vs clone". The live readings at 1120, 1440 and 1912 match the clones'
outlets: 443.5, 763.5 and 1235.5 px (fine.json l. 23163, 23204, 23245). **Only the two 1024 live readings differ.**
Their `footH` is 97 against the clones' 51, and their `aboveFacts` is `true` (l. 23070-23074, 23118-23122). The 731 px
outlet is the outlet on **a line of its own**: the full row less `px-2`, the same figure as the coarse `data-dock-wide`
case.

The outlet's floor is 288 px (`not-empty:min-w-[min(18rem,100%)]`). It wraps only if the facts and the toggle take more
than about 435 px of the 731 px row. In the clone readings, the facts and the toggle take 383.5 px. Both 1024 live readings
were the **first read after an edit**: the Ctrl+Z (probe l. 422-441) and the Link (l. 481-504). The probe took them
400–500 ms after a resize from 1646, and it does not call `recalculate` until l. 514. The most likely cause is the
schedule-state region (`Recalculating…`, or a stale sentence plus **Recalculate**, `plan-facts.tsx:290-372`) showing in
the facts at that moment. That widens the facts past the outlet's floor. **Not proven:** the probe did not record
`data-schedule-state` or the facts' width. This is M0c's first reading (§3, R0).

Why it matters: the facts' width is a variable the M0b sweep held at its narrowest, because every clone reading followed
`recalculate`. The link-plus-offer face appears immediately after a link, which is when the region is most likely to
show.

## 2. The revised proposal: option A′

**Keep A's intent** (the offer takes a full line when it does not fit beside the facts, and the sentence is never
truncated). **Change two mechanisms and add one class.**

| #   | Element                        | Option A (M0b)                       | **Option A′**                                                                                 | What it fixes                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------ | ------------------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Outlet (`canvas-dock.tsx:136`) | `has-[[data-dock-row]]:basis-auto`   | `not-empty:has-[[data-dock-row]]:min-w-[min(36rem,100%)]` (a **floor**; the basis stays `0%`) | Rule 4. A floor asks for room for the strip, not for the bar plus the strip, so the outlet stays beside the facts wherever 36 rem fits. It is the existing `data-dock-wide` floor's shape and value, so the two rules cannot disagree whichever wins the cascade. `not-empty:` is in the class so it beats the 18 rem floor by specificity, not by source order (`app-shell.tsx:151-155` records a source-order-only win as a hazard). `min(…,100%)` is ADR-0187 D2. |
| 2   | Strip root                     | `flex` (no wrap), `items-start py-2` | adds `min-w-0 flex-wrap`                                                                      | Rules 1 and 3 at 200 %. The buttons drop below the sentence when the sentence would get less than its floor. `min-w-0` means the strip can never exceed its outlet (the Q3 defect's cause, §4).                                                                                                                                                                                                                                                                      |
| 3   | Sentence `<p>`                 | `flex-1`                             | `flex-1 min-w-[min(16rem,100%)]`                                                              | Sets when the buttons wrap. In a wrapping row the `<p>`'s hypothetical size is its floor, so the buttons move to the next line exactly when 16 rem plus the buttons does not fit. At 100 % (256 px) that never happens on the full 1024 line. At the 200 % root route (512 px) it always does, and the sentence gets about 690 px instead of 138.                                                                                                                    |
| 4   | Buttons                        | direct children                      | wrapped in one `div`: `ml-auto flex max-w-full flex-wrap justify-end gap-2`                   | The buttons move as one group and stay at the trailing edge. They wrap among themselves only if the group alone exceeds the line, which happens below the design floor.                                                                                                                                                                                                                                                                                              |
| 5   | Marker                         | `data-dock-row`                      | unchanged                                                                                     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

**Primitive shape.** Items 2–4 become one new `NoticeStrip` value, `messageFit="wrap"`. Only that value changes the root
class, the `<p>` class and wraps the children, so `grow` and `truncate` callers render byte-identical markup. It is a
variant on an existing primitive, not a new component. Its first caller is `FollowLogicStrip`. It changes no keyboard
contract, so ADR-0111 is not engaged. component-reviewer runs on it. The arbitrary `min(16rem,100%)` is recorded under
ADR-0187 D2 beside the two existing floors.

**Estimated effect (est.; M0c reads it).**

- 1912 mouse with a bar selected: the outlet stays at 1235 px beside the facts and the strip takes the line under the bar.
  Cost about 58 px, not 98. Extra 0.
- 1120–1250 with a selection: 36 rem plus the facts exceeds the row, so the outlet still takes its own line. This is the
  same geometry as M0b, where extra was 0.
- 200 % root route, link-plus-offer: about 2 text lines plus a 64 px button line, so a strip of about 170 px, not 474.
  The stage stays well above 120.

**Considered and not recommended**

- **A plus `min-w-0` and truncation as the 200 % floor.** This truncates the activity name, and for this strip the
  name is the content. At 200 % that is a loss of content (1.4.4). The only full-text channel is the polite announcement,
  which a sighted low-vision reader does not get. `min-w-0` is kept as a safety net in A′ (item 2), never as the layout.
- **Offer only when nothing is selected; the object carries it otherwise.** The commonest state after a lengthening is
  the **edited** bar selected, not the stranded one (`m0-measurement.md` §2, "the real state right after a lengthening").
  Suppressing the offer then hides it in exactly the US-1 moment. A narrower version would suppress only when the
  selection is the stranded bar, where the bar's caption and **Follow logic** already say it (ADR-0186 D1). That version
  makes an event strip appear and vanish as the planner clicks, after its one announcement has already fired, which
  ADR-0132's event model does not allow for. After A′ fixes rule 4 it would also save nothing outside coarse 1024, which Q2
  of amendment 1 already accepted.
- **Capping the strip's lines (`line-clamp-2`).** It hides the end of the sentence at 200 % with no non-hover way to read
  it (ADR-0117/0204). Rejected for the same 1.4.4 reason.
- **The marker rule restricted to "no selection bar in the outlet"** (M0b's alternative): measured worse, +66 to
  +146 px at 1120–1250. Superseded by item 1, which addresses the cause instead.

**Where the link-plus-offer face renders.** In the Diagram, the mode rung renders **before** the selection bar
(`TsldPanel.tsx:3327` vs `:3338`). Every lower rung renders after it (`:3480`, `:3495`). In the Gantt the bar comes
first (`plan-workspace-toolbar.tsx:1971-1977`). Spec §4.7's "after the canvas and the selection bar" is therefore false
for the link-plus-offer face in the Diagram. The fix is in the spec, not the code: §4.7 should say the link-plus-offer
face keeps the mode band's position, so it reads before the bar. M0b's probe appended every strip (probe l. 311), so its
Diagram link-plus-offer readings are not in product order. Rule 4's finding does not depend on order under a content
basis. A′'s line placement does depend on order, so M0c must insert in product order.

## 3. M0c: a third, short pass

The harness is the same file, extended (`measure:toolbar`), with nothing under `apps/web/src`. Injected compiled CSS:

```css
[data-activities-bar] > div[class*='not-empty:min-w-']:not(:empty):has([data-dock-row]) {
  min-width: min(36rem, 100%);
}
[data-dock-row] {
  min-width: 0;
  flex-wrap: wrap;
}
[data-dock-row] > p {
  flex: 1 1 0%;
  min-width: min(16rem, 100%);
}
[data-dock-row] > [data-dock-row-actions] {
  margin-inline-start: auto;
  display: flex;
  max-width: 100%;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}
```

The cloned buttons go inside one `<div data-dock-row-actions>`. In the Diagram, link-plus-offer is inserted **before**
`[role="toolbar"][aria-label^="Actions for"]` and every other variant is appended. In the Gantt every variant is appended.

**New fields in every reading:**

- the facts' `data-schedule-state` and box width;
- the shell scroller's `scrollTop`, `scrollHeight` and `clientHeight`, and whether `squat` is engaged (the computed
  `overflow-y` of the shell grid);
- the outlet's computed `min-width`;
- for each button, `selfHit` in place **and** after `scrollIntoView({ block: 'nearest' })`, and the same pair for the foot
  row's Expand toggle.

**Readings**

- **R0, first (the 731 px question).** The live Linked band with long names at 1024 × 600 mouse, read immediately after
  the link and again 3 s later, each time with the facts' state and width. Expected: the region is present in the first
  read and the outlet is 731 px; it is gone in the second and the outlet is about 347 px.
- **R1, controls at 200 %.** Both routes, mouse and finger, nothing selected and the flagged bar selected, Diagram and
  Gantt. Read the base state, then the shipped Linked band with long names (with and without `min-w-0` on the strip).
  This separates rule 1's self-hit (b) from (a).
- **R2, A′ at 100 %.** The M0b grid unchanged: 7 widths × 2 pointers × 3 selections × 2 views × 5 variants.
- **R3, A′ with the facts widened.** 1024, 1280 and 1440, mouse, both selections, Diagram, all five variants, with the
  schedule-state region showing. Use the stale sentence plus **Recalculate**, held by not recalculating, or injected as
  the workspace-visual-polish pass did.
- **R4, A′ at 200 %.** The R1 cells, all five variants.

**Stop rules.** Each is judged against **the same cell's base state**, so none can fire on what the dock already does:

1. **S1 (100 %).** A strip button is not self-hit after `scrollIntoView`. Or the foot row or the page scrolls sideways when
   the base state in that cell does not.
2. **S2 (100 %, every cell, both views, both facts states).** Extra > 4 px. Extra is cost − strip height − 8 px when the
   strip sits on a line below a selection bar, as M0b defined it.
3. **S3 (100 %).** With nothing selected, the stage is < 120 px.
4. **S4 (100 %).** The sentence takes more than 2 lines (3 for link-plus-offer).
5. **S5 (200 %, either route).** Any one of:
   - a strip button is not self-hit after `scrollIntoView` in a cell where the base's Expand toggle is;
   - the strip adds sideways scroll the base lacks;
   - with nothing selected, the stage is < 120 px where the base stage is ≥ 120.

   Line counts at 200 % are **reported, never judged**.

**Not judged, reported:** coarse 1024 × 600 with a selection. Amendment 1's Q2 accepted 52–68 px there while the message
waits. A′ does not change that cell's geometry, because the `data-dock-wide` floor already puts the outlet on its own line.

**Decision rules after M0c**

- **No stop rule fires:** A′ is folded in. That covers spec §4.6, a corrected §4.7, SC-6 reworded to S1–S5, the plan's M2,
  and ADR-0216's "Amends ADR-0187 D3" line, which now reads: "a marked notice strip carries the 36 rem own-row floor on any
  pointer; the selection bar's rule is unchanged".
- **S3 or S4 alone fires:** re-read once with the `<p>` floor at 20 rem, then return.
- **S1, S2 or S5 fires and R1 shows the base state passing the same test:** abandon A′ for **B** and return to the owner.
  In that case the defect is in the strip or the outlet rule, and no class change has a clear next step.
- **R1 shows the base state failing S5's self-hit test (the shell itself at 200 %):** that is a separate shell defect. It
  goes in its own register row and does not stop this epic.
- **C is never the fallback.** It cannot satisfy US-1 at 1024 (amendment 1 §2).

## 4. The existing foot messages: fix first, as their own row

**Yes. File and ship it before M2, independent of this epic.** It is a shipped defect inside the design floor. With two
46-character names at 1024 × 600 on a mouse, the Linked band's **Undo** is not pressable (`selfHit` false at 1120, l.
23182; clipped at 1024, l. 23144). The undo result's two buttons and the layout notice's **Dismiss** fail the same way
(M0b "existing messages" table).

- **Cause.** A flex item's automatic minimum width is its min-content width. The `<p>` is `white-space: nowrap`
  (`truncate`), so the strip's min-content is the whole sentence plus its buttons. The `<p>`'s own `min-w-0`
  (`notice-strip.tsx:98`) applies inside the strip, not to the strip inside the outlet. The 47 readings with
  `minWidth: auto` agree.
- **The change.** Add `min-w-0` to `noticeStripVariants`' base classes (`notice-strip.tsx:23`). Correct the false
  `messageFit` docblock (`:58-61`, an ADR-0076 Class 3 claim).
- **Tests.** A unit assertion on the root class, and one case in the existing dock journey at 1024 mouse with long names
  asserting **Undo** is self-hit. That is no new config and no new surface, so a register row is the right vehicle
  (ADR-0105).
- **The cost.** The Linked sentence is cut to about 252 of 675 px. That is strictly better than today: today the sentence
  is cut too, by the window edge or under the facts, and the button is lost with it. The full sentence is still announced
  once through the polite region.
- **Follow-up, not in that row.** Moving the bare Linked band to `messageFit="wrap"` plus `data-dock-row`, so it shows its
  names in full, once M2 has landed A′.
- **Before it ships,** read `EditConflictBanner` (a `grow` caller) at 1024 in the same journey. M0b did not measure a `grow`
  strip with `min-w-0`.

Doing it first also gives M0c a cleaner base: R1's shipped-band control then reads the fixed product.

## 5. Questions for the owner (each with a recommended default)

1. **May the offer use the revised layout (A′)?** It takes a full line on narrow windows as before, but on a wide
   screen with a bar selected it now costs one line, not two. At double text size its buttons drop under the sentence
   instead of squeezing it into a thin column. One short measuring pass (M0c) confirms this before anything is built.
   **Default: yes.**
2. **Fix the existing cut-off "Linked …", "Undid …" and "moved clear of an overlap" buttons now, as their own small
   change, before this epic continues?** The long sentence gets shortened with "…", and the buttons become pressable.
   **Default: yes, first.**
3. **At double text size, judge the offer by "every button can be reached (scrolling is allowed, as for the rest of the
   screen at that size), nothing scrolls sideways, and the diagram keeps 120 px with nothing selected", not by a line
   count?** **Default: yes.** A line count measured at normal size cannot hold at double size, and WCAG asks for nothing
   lost, not for a number of lines.

## 6. Corrections recorded

- **Amendment 1 (mine).** "On a wide screen like yours (1646 or 1912) nothing changes" is false with a bar selected
  (+94 to +98 px). "The row's existing wrap puts it beside the facts exactly when there is room" is false whenever the
  outlet also holds a selection bar. The content basis I proposed is the alternative ADR-0187 rejected (§1, rule 4).
- **M0b: "with nothing selected its buttons end up past the window's edge" is not established as a defect.** At 200 %
  the shell scrolls by design (`squat`), the foot row is below the window in the base state, and the instrument cannot
  separate the two (§1, rule 1).
- **M0b: "why the live Linked band's outlet was 731 px … while the injected clone's was 347.5".** The framing is wrong.
  The live and clone outlets agree at 1120, 1440 and 1912. Only the two 1024 live readings, each the first after an edit,
  differ, and they show the outlet on its own line (§1).
- **M0b: Diagram readings for link-plus-offer are not in product order.** The probe appends; the product renders that
  face before the selection bar (§2).
- **M0b: rule 4's cause is given as "the plan facts take a line of their own".** That is the symptom. The cause is the
  content basis resolving to the outlet's whole max-content (§1).
- **Spec §4.7: "both strips sit in the dock in DOM order after the canvas and the selection bar".** This is false in the
  Diagram for the link-plus-offer face (§2), and is to be corrected on approval.
