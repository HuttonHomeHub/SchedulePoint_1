# ADR-0216: A bar you placed stays put, and an edit that leaves it behind offers to let it follow

- **Status:** Accepted — 2026-11-11. The product owner approved the spec, the plan and amendments 1–3 on 2026-11-11 with
  all defaults (Q1 remove the placement, Q2 any edit, Q3 dock message only, Q4 rename to "Follow logic", Q5 no one-time
  explanation) and instructed "Drive this to completion and a release". M0, M0b, M0c and M0d (measurement) preceded it; M0d
  passed every stop rule. D1–D5 and D7–D10 ship with M2 (the edit offer and the layout); D6 (the whole-plan offer) ships with M3.
- **Date:** 2026-11-11
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Extends:** [ADR-0148](0148-visual-is-the-plan.md) (visual is the plan),
  [ADR-0153](0153-an-edit-moves-only-the-bar-that-caused-an-overlap.md) (an edit's consequence is resolved on the settle and
  is its own undo step), [ADR-0094](0094-one-meaning-of-conflict-and-a-remedy-on-the-object.md) (a conflict has a remedy).
  Cites the M1 amendment notes on ADR-0094 D5/D6 and [ADR-0186](0186-the-reason-a-conflict-exists-is-stated-on-the-object.md)
  D2: the placement remedy's label is "Follow logic".
- **Amends** (amendments 1–3, 2026-11-11):
  [ADR-0187](0187-a-selection-bar-leads-with-its-subject-and-a-floor-never-exceeds-its-row.md) D3 (a marked notice strip
  carries the 36 rem own-row floor on any pointer; the selection bar's rule is unchanged),
  [ADR-0092](0092-the-canvas-dock-and-the-diagram-s-vertical-budget.md) D2 and
  [ADR-0114](0114-a-row-that-cannot-shrink-never-wraps.md) D1 (an event strip may cost its own line while it waits), and
  ADR-0114 D2 (the facts and the panel toggle are one trailing group; D2's "the facts lead and the dock follows" has been
  untrue since foot-row-and-deck M3, `activity-bottom-panel.tsx`, and this ADR states that drift).
- **Spec:** [`docs/specs/placed-bar-follows-link/`](../specs/placed-bar-follows-link/feature-spec.md) · **Plan:**
  [`implementation-plan.md`](../specs/placed-bar-follows-link/implementation-plan.md) · **Readings:**
  [`m0-measurement.md`](../specs/placed-bar-follows-link/m0-measurement.md)
- **Builds on:** ADR-0028, ADR-0048, ADR-0064, ADR-0082, ADR-0088 (D1: no flag), ADR-0105, ADR-0132, ADR-0135, ADR-0167,
  ADR-0204.

## Context

ADR-0148 made a drawn bar a placement that logic never moves. The owner's first-time run (runbook 3.5–3.8) showed the
consequence is invisible when it happens: an edit strands a placed bar, the count rises, and the only remedy is a
single-bar command named for what it removes. There is no mode (ADR-0148 D1); the model is right and nothing on screen
teaches it.

## Decision

1. **D1 — A placed bar still never moves by itself.** ADR-0148's decision is unchanged. Everything here is an offer the
   planner accepts.
2. **D2 — The trigger is the consequence, not the gesture.** An offer is raised when a pen-holder's edit settles with a
   placed, non-summary activity **newly** `EARLIER_THAN_LOGIC`, excluding any activity whose placement that edit wrote
   (`strandedBy`, `follow-logic-offer.ts`). "Worsened" is not a trigger: the client has no measure of the logic bound.
   **A started activity is never offered** (an actual start is set): actuals freeze its bar, so Follow logic would clear
   the flag and move nothing, under a sentence ("stays where you placed it") that is not why it is where it is. The count
   chip still counts it and the selection bar's own Follow logic still clears it.
3. **D3 — Following is removing the placement.** `visualStart := null`, constraint round-tripped, lane unchanged, through the
   existing batch placement route and recorded with `bulkPlacementCommand`. For a stranded bar this is the same position as
   re-placing it at its logic date (Pass 2 already propagates the feasible start, `compute.ts:361`), so nothing downstream
   moves and no new conflict can arise; the difference is only that it now follows its logic. The selection bar's
   single-bar **Follow logic** is the same write as a one-row batch (a summary keeps the single PATCH, because the route
   refuses one).
4. **D4 — The offer is an event bound to the top undo step, with no time limit.** Announced once through the workspace's
   polite region; no live role on the strip; withdrawn by the next edit, undo or redo (or the pen going); consumed by a press.
   Accepting is its own undo step, and a consumed offer does not return when an undo puts its step back on top.
5. **D5 — The Link tool's confirmation carries the offer** rather than hiding it, because the armed tool outranks every
   lower dock strip. One strip, never two: the confirmation's sentence leads and the link's **Undo** stays beside
   **Follow logic**.
6. **D6 — A plan with early-placed bars offers to let all of them follow**, as a dismissible standing condition in the dock
   (the Arrange-offer pattern), never as a toolbar write in the `find` group. _(M3.)_
7. **D7 — No engine change, no schema change, no new endpoint, no flag** (ADR-0088 D1). The recalculation parity gate holds
   by construction.
8. **D8 — The 120 px stage floor is waived while an event strip awaits an answer, on a coarse 1024 × 600 window with a
   selection** (amendment 1, Q2; read in M0b–M0d: stage 52 against a base of 122 with the flagged bar). The strip is gone on
   either button, the next edit, undo or redo, and the floor holds again; with nothing selected it is never waived.
9. **D9 — The foot row packs the facts and its toggle as one item**, so no dock floor can strand the toggle on a line of its
   own. The band is the toggle's width plus a gap, in foot-row width, at any floor value; it exists in the dock as it shipped
   (a bar selected with "Recalculating…" or a stale sentence on a mouse; on a finger with current facts at 1210 to 1250,
   48 to 96 px, `docs/TECH_DEBT.md` #581), and M0d read the group at no cost anywhere.
10. **D10 — The press does not consume the offer; its outcome does, and every state is visible** (UX review of M2).
    Pressing **Follow logic** puts the strip into a busy state ("Moving …", both buttons `aria-disabled` with focus kept,
    presses ignored) that lasts through the write and the recalculation that moves the bars, so there is no double-submit.
    On success it becomes the existing result strip with **Undo** and its 15 s window, its sentence announced once. A stale
    version (409) and any other failure keep the offer, say so in the strip in plain English (the 409's sentence is
    `FOLLOW_LOGIC_CONFLICT`), announce it, and offer **Try again**; a lost pen (423) returns to asking and the pen banner
    speaks. A failure is logged with the activity ids and is never an unhandled rejection. **Keep it here** announces that the
    bar was kept and stays flagged. The offer's sentence is announced **when the strip is first on screen**, once, not when it
    is raised, because a higher-ranked band can hide it at the settle (ADR-0132); the Link tool's confirmation is announced
    at the link and the offer after it. The Link tool's carried Undo is labelled **Undo link**, and the two sentences are
    joined "… — but …". The buttons carry `aria-describedby` descriptions of what each does.
    Try again with no bar still stranded shows "Nothing to move: those bars already follow their logic." in the result strip with no Undo
    (nothing was written). A later edit ends any non-idle offer, so undoing it cannot bring a stale strip back, and the offer is
    rebound to its new undo step the moment that step is recorded.

### What the layout is, and why (amendments 1–3)

- `NoticeStrip` gains `messageFit="wrap"`: the root wraps, the sentence has a floor of `min(16rem, 100%)`, and the buttons are
  one group (`ml-auto flex max-w-full flex-wrap justify-end gap-2`) that drops under the sentence together. `grow` and
  `truncate` render byte-identical markup. The arbitrary `min(16rem,100%)` is recorded here beside ADR-0187 D2's two floors:
  the value is a CSS function of the row, which no spacing token expresses.
- `CanvasDockOutlet` gains `not-empty:has-[[data-dock-row]]:min-w-[min(36rem,100%)]`. It is a **floor**, never a content
  basis: the outlet's basis stays zero, the alternative ADR-0187 rejected and M0b re-measured (+94 to +98 px at 1912 with a bar
  selected). `not-empty:` is in the class so it beats the 18 rem floor by specificity and not by source order.
- `PlanActivitiesFootRow` wraps `PlanFactsOutlet` and the toggle in one `data-foot-trail` group. A wrapping flex row fills
  each line with each item's hypothetical size, and for the outlet that is its floor, never its content; with the toggle a
  separate item the line test has a third outcome (facts beside the outlet, toggle alone on the next line) for a foot-row
  width band of exactly the toggle's width plus a gap, at **any** floor value. With the two in one item the outlet is beside
  both or above both. Tab order and DOM order are unchanged, so no keyboard contract changes and ADR-0111 is not engaged.
  On a line of its own the facts now **trail beside the toggle** instead of starting at the leading edge, which is what the
  code already said ("the facts, now TRAILING").
- **ADR-0114 D2's drift, stated:** D2 says "the facts lead and the dock follows". The code has had the dock first and the facts
  trailing since foot-row-and-deck M3, and the docblock there records why D2's reason was false. This ADR amends D2 to the
  code.
- **`resolveDockStrip`'s order:** conflict › history failure › mode, except a `linked` confirmation when an edit offer exists ›
  history success › **follow-edit** › layout-resolved › empty › _follow-plan (M3)_ › arrange-offer › touch-hint.

## Alternatives considered

As spec §4.8, and amendment 3 §3 for the foot row. A container query on the row (sees the row's width, not the facts', which
varies by 350 px with the schedule state), a different floor (moves both thresholds, and the band with them), letting the strip
wrap inside the outlet (the outlet's line placement is decided by its floor, never its content) and a toggle `order` (puts the
toggle against the DOM and tab order) were each rejected there. The compact form with a menu (amendment 3 §7, "option B") was
specified as the fallback and **not built**: M0d passed.

## Consequences

- Two new dock rungs (one in M2, one in M3); the remedy's label changed in every journey that names it (M1).
- A cross-plan successor is not offered in the plan that drew the link; its own plan's whole-plan offer shows it when opened.
- A strip that marks itself `data-dock-row` costs a line of the diagram at narrow widths while it waits (about 50–60 px at 1024
  on a mouse); the facts sit at the trailing edge of a line the outlet has taken for itself.
- The selection bar's single-bar Follow logic records `bulkPlacementCommand`'s step where it recorded `visualStartCommand`'s.
- `NoticeStrip`'s public surface gains one value, and four existing strips may adopt it (`docs/TECH_DEBT.md` #580, its own
  change straight after M2).
  **Taken up (2026-11-12):** `CanvasModeBand`, `HistoryResultStrip`, `LayoutResolvedStrip` and `BulkSelectionBar` now use
  `messageFit="wrap"`, `density="comfortable"` and `data-dock-row`, so no dock sentence is cut. The decision is
  unchanged; it was extended to four more strips, and the `title` stop-gaps on three of them were removed.
