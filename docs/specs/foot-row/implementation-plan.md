# Implementation Plan: The stable foot row

- **Status:** Draft — awaiting product-owner approval
- **Spec:** [`spec.md`](spec.md) · **Measurement:** [`m0-measurement.md`](m0-measurement.md)

## Breakdown

### Epic

Make the foot of the plan workspace one row that never moves and never clips, and give it the
command surface's visual language.

Frontend-only. The CPM engine is not imported and no migration runs, so the ADR-0034 recalculation
parity gate is untouched by construction. **No `VITE_` flag** — ADR-0088 D1 established that a
`VITE_` constant is inlined at build time and has never been an operator rollback; the rollback is a
commit boundary, and each milestone below is one revertible commit.

---

### Milestone 1 — Measure what is left, and close the open question (shippable: no)

**M1-T1 — measure the remaining dock strips.** OQ-1. Extend `m0-foot-row.spec.ts` to read the
intrinsic width of the link confirmation, the conflict banner, the empty-plan notice and the plural
selection bar, in the states that produce them.
_Complexity:_ S. _Risk:_ the harness has mis-picked its subject twice already — every reading
carries its `text`, and a strip that cannot be produced **fails** rather than recording a skip.
_Falsification condition, written now:_ if the widest remaining strip exceeds **100 px** at 1920,
D1's single row does not hold as designed and the spec is amended before M2 starts.

**M1-T2 — a fit gate, verified red.** A browser assertion that no control's right edge lies beyond
the row's, at 1280 / 1440 / 1646 / 1920, with a selection, in both panel states, on both the TSLD
and the Gantt. Verified red against today's code — it must name `Clear visual placement` at 1920 and
four controls at 1646.
_Complexity:_ M. _Note:_ sweep every pointer target, not `[data-toolbar-item]` — ADR-0110 D5 records
a gate missing a split button's caret for exactly that reason, and D4 adds one.

---

### Milestone 2 — The row stops moving, and stops clipping (shippable)

**M2-T1 — one foot row.** Merge the panel handle row and the bottom status strip into a single row
hosted below the panel; the panel expands above it. The facts move by re-declaring the ADR-0110 D1
outlet, not by a branch.

**M2-T2 — the row wraps rather than clips.** Whatever M2-T1 leaves over, the row must never hide a
control. This is what closes the live defect, and it lands here rather than at the end.

**M2-T3 — regression tests** for the invariant that expanding the panel changes no band height
(ADR-0092), asserted in a browser at both drawer states — open-or-closed alone passes equally
against a row reserving fixed width.
_Complexity:_ L. _Dependencies:_ M1.

---

### Milestone 3 — The strip, the pill, the labels (shippable)

**M3-T1 — hide the armed-tool statement, keep the live region.** `sr-only`, not removed. Move
`Esc to stop` onto the armed trigger's title.
**M3-T2 — the pen pill carries the name.** `Locked · Alexandra`, full sentence as the accessible
description. Withdraw the sentence from the facts.
**M3-T3 — the three relabels**, with the long form moved to `description` (WCAG 2.5.3).
_Complexity:_ M. _Tests:_ a case per lock state proving the name is present and the description is
the full sentence; a case proving arming still announces with nothing painted.

---

### Milestone 4 — The doors fold at narrow widths (shippable)

**M4-T1 — `Edit ▾` folding Logic / Resources / Steps / Edit**, `Progress` never folded. An identity
assertion that the folded trigger and the unfolded `Edit` read the **same** gate object, so the two
forms cannot drift on permission.
**M4-T2 — the threshold derived from measured content width**, never a hand-tuned breakpoint.
**M4-T3 — accessible names identical in both forms**, asserted, so an AT route does not change with
the window.
_Complexity:_ L. _Risk:_ the responsive-position concern recorded in spec D4. The gate from M1-T2
runs in both states.

---

### Milestone 5 — Card styling (shippable)

**M5-T1** — the bar takes the deck's card, geometry and icons; no group caption. Re-run M1-T2: card
padding changes the width, so the fit gate must pass again afterwards.
_Complexity:_ S.

---

### Milestone 6 — Gate pass, journey, ADR (shippable)

**M6-T1** — accessibility, ux, component and frontend-performance reviews over the combined diff.
**M6-T2** — a journey driving the real product: every action reachable at both widths, the panel
expanding without moving chrome, the pen pill naming a holder. Per ADR-0081 this lands with the
first user-facing milestone, so its skeleton starts at M2 and grows.
**M6-T3** — the ADR, recording D2's evidence (the trigger already states the mode), D4's decision
**and its recorded concern**, and the measurements that settled each.
_Complexity:_ M.

## Sequencing & slices

M1 → M2 → M3 → M4 → M5 → M6. M2 is the first shippable slice and closes the live defect; each later
milestone is independently revertible.

The **Author card move is not in this epic**. It needs ~112 px found in View / Find / Plan first,
which is its own consolidation pass with its own measurement.

## Definition of Done (per task)

Code, tests, `pnpm prepush` green, `scripts/e2e-local.sh web:<suite>` where a journey changed, docs
updated in the same commit, changeset for user-visible change.

## Risks & assumptions (rollup)

| #   | Risk                                                                     | Mitigation                                                                             |
| --- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| 1   | The remaining dock strips do not fit the 100 px of slack                 | M1-T1 measures them first, with a falsification condition that stops M2                |
| 2   | The responsive fold is the shape ADR-0091 M7 shipped a defect from       | Threshold derived not tuned; gate asserts both states; names identical in both         |
| 3   | The `Edit ▾` caret is wider than the 87 px assumed                       | The M0 figure is stated as a floor; M4 re-measures before the threshold is set         |
| 4   | Hiding the tool statement regresses a sighted keyboard user's `Esc` hint | It moves to the armed trigger's title and stays in the shortcuts sheet                 |
| 5   | The pill's name is wrong for a long or duplicate first name              | Reuses `firstName()` from `lock-copy.ts`; the full sentence remains as the description |
