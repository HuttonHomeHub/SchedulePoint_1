# Implementation Plan: The stable foot row

- **Status:** Draft — **rewritten 2026-08-26 after four blocking reviews**
- **Spec:** [`spec.md`](spec.md) · **Measurement:** [`m0-measurement.md`](m0-measurement.md)

## Breakdown

### Epic

Make the foot of the plan workspace stop clipping, stop juggling, and take fewer lines.

Frontend-only; the CPM engine is not imported and no migration runs. **No `VITE_` flag**
(ADR-0088 D1) — each milestone is one revertible commit.

**The sequencing changed in this rewrite.** The correctness fix is no longer buried inside the
restructure: it is one line and it ships first, alone.

---

### M1 — The row wraps (shippable, ships alone)

**M1-T1 — extend the existing reachability gate.** `apps/web/e2e-workspace-fit/command-surface.spec.ts`
already sweeps every pointer target with `elementFromPoint` at 1280/1440/1646/1920 (TECH_DEBT #186).
The selection bar is out of its scope **by decision** (#124). Widen it to include the bar, in both
panel states, on TSLD and Gantt. **Verified red first** — it must name `Clear visual placement` at
1920 and four controls at 1646.
_A second sweep is not written: two gates with one job disagree about what "reachable" means. This
closes the open half of #124._

**M1-T2 — drop `shrink-0`** from `selection-actions.tsx:845`, with `min-w-0`. Gate goes green.

**M1-T3 — the 2.4.11 question, answered with a screenshot.** Capture the focused state of a clipped
control at both widths before the fix. If focus does not fully reveal it, the ADR cites **SC 2.4.11**;
if it does, the ADR states pointer-operability without a number. **Do not assert either from prose.**

**M1-T4 — record the height cost** (41 → 77 at 1920, 41 → 117 at 1646) in the record, since it is
what M3 exists to reduce.

_Complexity:_ S. _Risk:_ none identified — the change is subtractive and measured.

---

### M2 — The mode statements, per kind (shippable)

**M2-T1 — withdraw `adding`, `loe`, `linking`; keep `marquee`, `linkPicking`, `linked`.** Decided in
`TsldPanel` where the statement is built.
**M2-T2 — the folded-trigger hole.** A withdrawn statement returns whenever its trigger is not
rendered — `Deck` folding unmounts a group's items and persists the fold set globally.
**M2-T3 — `Esc to stop` and the two shortcut clauses** onto the armed trigger as an
`aria-describedby`-linked `sr-only` sibling. **Never `title`** (recorded four times).
**M2-T4 — `dock.spec.ts:91-92`** asserts the statement `toBeVisible()`; it changes to assert the
kinds that remain. **An epic that edits an assertion says so in the ADR.**
_Complexity:_ M. _Tests:_ one per kind; a case proving the fold hole is closed.

---

### M3 — Height: the facts, the pen, one relabel (shippable)

**M3-T1 — the pen keeps its live region**; the pill gains the name, never on the `Editing` tone.
**M3-T2 — measure the pill** before building it. The 60–80 px figure is an estimate in a header
ADR-0112 measured at four pixels of headroom.
**M3-T3 — `Clear visual placement` → `Clear visual start`**, long form in `description` (WCAG 2.5.3).
The other relabels: `Report progress` → `Progress` was **taken** after the product owner chose to
rename the activities table with it (M3b — it bought a whole line at both widths); `Zoom to
selection` and `Clear placement` stay **declined** (spec D5, which this line contradicted until
the M7 architecture gate read the two side by side).
**M3-T4 — re-measure the wrapped row's line count** at both widths. This is the milestone's actual
acceptance: one line at 1920, at most two at 1646.
_Complexity:_ M.

---

### M4 — One foot row, facts leading (shippable)

**M4-T1 — one host mounts both outlets in both panel states.** Facts lead.
**M4-T2 — the expanded header's other content** — the `Activities` heading, `BaselineVarianceSummary`,
and below `md` the `CreateActivityButton` — is placed explicitly, not dropped by omission.
**M4-T3 — `PlanStatusBar`'s shell row** is emptied for this route; verify it collapses to zero
height rather than leaving a gutter.
**M4-T4 — extract `PlanActivitiesFootRow`** rather than growing two near-duplicate components with
parallel booleans.
**M4-T5 — the invariant test:** expanding the panel changes no band height, asserted in a browser at
both drawer states. Note ADR-0092's 0 px rule is about **strips**, not panel expansion — the spec's
first draft cited it against a state ADR-0092 never claimed.
_Complexity:_ L.

---

### M5 — The dock precedence policy (shippable)

**M5-T1** — at most one transient strip plus at most one selection bar, decided at source,
generalising `canvas-dock.tsx:87`. Asserted as an invariant.
_Complexity:_ M. _This replaces the first draft's OQ-1 width budget, which could only ever have
failed._

---

### M6 — Card styling (shippable)

**M6-T1** — `Deck.tsx:280`'s card moves to `toolbar-styles.ts`; both consumers import it.
**M6-T2** — re-derive the geometry for a 36 px row, or accept a taller row deliberately and amend
`dock.spec.ts:97,104` **with the reason in the ADR**. Rewrite `selection-actions.tsx:841-844`'s
comment; do not delete it.
_Complexity:_ M.

---

### M7 — Gate pass, journey, ADR (shippable)

**M7-T1** — the four reviews again, over the combined diff.
**M7-T2** — the journey grows from M1 onward, not from here (ADR-0081).
**M7-T3** — the ADR: the `shrink-0` finding and how it was reached; the three claims of mine the
reviews falsified; the per-kind statement table; the declined relabels; the declined IA critique;
and every assertion this epic edited.
_Complexity:_ M.

---

### Deferred, pending a product-owner decision

**The responsive fold (spec D8).** Approved when it was needed for fit; D1 removes that need. It now
buys height only, against five recorded costs. The question is with the product owner.

**The Author card move.** Needs ~112 px found in View / Find / Plan first — its own epic.

## Definition of Done (per task)

Code, tests, `pnpm prepush` green, `scripts/e2e-local.sh web:<suite>` where a journey changed, docs
updated in the same commit, changeset for user-visible change.

## Risks & assumptions (rollup)

| #   | Risk                                                                   | Mitigation                                                                     |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | The wrapped row is three lines at 1646 until M3 lands                  | M1 ships correctness; the height is stated, not hidden                         |
| 2   | 1753 px was the row's narrowest state                                  | M3-T4 re-measures in the stale-schedule + summary-selection + worst-lock state |
| 3   | Withdrawing a statement strands a planner whose trigger is folded away | M2-T2                                                                          |
| 4   | The pill's width is an estimate in a header with 4 px of headroom      | M3-T2 measures before building                                                 |
| 5   | M6 breaks a measured equality                                          | M6-T2 re-derives or amends deliberately, with the reason recorded              |
