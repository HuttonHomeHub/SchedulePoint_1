# Implementation Plan: Conflict review

- **Spec:** [`feature-spec.md`](./feature-spec.md)
- **Status:** Draft — awaiting product-owner approval to build
- **Date:** 2026-08-13
- **Proposes:** ADR-0094

---

## Breakdown

### Epic

**A conflict count you can read without starting, and an action that fits the conflict you land
on.** Delivered as one epic (D-d), in milestones that each stand alone so a measurement can still
change the plan.

Frontend-only. **The CPM engine is not imported and no migration runs**, so the ADR-0034 parity gate
is untouched by construction; `database-architect` is not engaged because there is no schema to
design, not because a change was judged too small (§19.3).

---

### Milestone M0 — Measure before building · _dark_

Three epics running have had their width expectation contradicted by their own measurement. This
milestone exists so that does not happen a fourth time, and so the one decision that could go back
to the product owner surfaces before any code is written.

##### M0-T1 — Can Row 1 afford the button at 1646? (≈ small)

- **Do:** with `next-conflict` promoted to tier 1 and carrying a count label, measure Row 1 at 1646
  (and across the fit gate's widths): inline count, labelled count, whether the `⋯` appears, and
  **what, if anything, demotes**.
- **Baseline** (measured 2026-08-13, `progress-entry-convergence/m0-measurements.md`): Row 1 = 11
  inline / 10 labelled, `⋯` present. Row 2 = 13 inline / 11 labelled, no `⋯`.
- **The label is variable-width**, which the harness must account for: `3 conflicts` and
  `12 of 137` are not the same number of pixels. Measure the **worst realistic case**, not the
  fixture's.
- **If something demotes**, that trade goes back to the product owner with the names — it is not
  absorbed. **This task can stop the epic**, or change D-a to the icon+number variant they were
  offered.
- **Tests:** none (measurement). **Output:** `m0-measurements.md`.

##### M0-T2 — Confirm the two `conflict` meanings and their blast radius (≈ small)

- **Do:** enumerate every consumer of the Filter's `conflict` attribute and of `CONFLICT_FLAGS`,
  and confirm that widening the former breaks no other reader. `MatchableActivity` grows fields;
  check every construction site, including the Gantt and the share/guest projection, which
  deliberately zeroes engine flags.
- **Why:** this is the only part of the epic that changes what an **existing** control returns.
- **Tests:** the enumeration becomes M2's structural assertion.

##### M0-T3 — Confirm the per-type action map against the real editor (≈ small)

- **Do:** verify each of the four surviving types actually reaches something: `clear-visual-placement`'s
  real gates (Visual mode + pen + selection), and that the editor opens at **Scheduling** and
  **Resources** for the other two. A new `ActivityEditorPurpose` is needed for Scheduling — confirm
  no existing purpose already covers it before adding one.
- **Why:** D4 says "no action where there is none". That is only honest if the actions we DO claim
  are real. Establish by opening them, not by reading the type union.

---

### Milestone M1 — The button carries its count · _user-facing_

Entry point (ADR-0081): the Next-conflict control on Row 1 of the plan workspace command surface.

##### M1-T1 — Promote and label (≈ one PR)

- `tier: 3 → 1`; the label becomes count-bearing (`Next conflict` → `3 conflicts` → `2 of 3`).
- **Retire `next-conflict-status`.** One control, one statement — and it is a `presentational`
  member of a `role="toolbar"`, which exists only via the escape hatch written to describe it.
- Keep today's gating verbatim: `hasConflicts`, and the "no diagram" reason winning over the count.
- **Announcements:** `goToNextConflict` already speaks the full polite announcement. The visible
  count must not become a second live region saying the same thing twice — the mistake
  `CurrentConflictStatus` and the search read-out both explicitly avoid.
- **Tests:** the label at zero / idle / mid-cycle; the reason precedence; **no duplicate live
  region** (assert `aria-hidden` on the count, as its predecessor did).

##### M1-T2 — Hold the fit gate (≈ small)

- Extend `e2e-toolbar-fit` so the promoted item is swept like any other, at the **widest** label.
- **Risk named:** the gate reads `[data-toolbar-item]`, and a variable-width label is exactly the
  kind of thing that fits in the fixture and not in a real plan. Drive it with a plan that produces
  a two-digit count.

---

### Milestone M2 — One meaning of "conflict" · _user-facing_

##### M2-T1 — Widen the filter to the counted set (≈ one PR)

- Re-express the Filter's `conflict` attribute in terms of `CONFLICT_FLAGS` rather than a second
  predicate. `MatchableActivity` grows the fields the set reads.
- **Tests:** the filter now matches a broken-constraint activity that today it misses — **verified
  red first**. Plus a structural test that the two cannot diverge again: the filter's conflict
  predicate and the cycle's set are the same source.
- **Copy:** confirm "Has conflict" still reads correctly for the wider meaning; it should.

##### M2-T2 — `externalDriven` leaves the set (≈ small)

- Remove from `CONFLICT_FLAGS`. **Add nothing** — `ScheduleSummaryStrip` already reports
  `externalDrivenCount` (`:73,127,174`), verified 2026-08-13.
- **Tests:** an externally-driven activity with no other flag is **not** counted, **not** in the
  cycle and **not** matched by the filter; the summary strip still reports it.
- **Docs:** `conflicts.ts`'s docblock lists the set by name — update in the same commit, or it
  becomes the register's own drift class.

---

### Milestone M3 — The dock strip · _user-facing_

##### M3-T1 — The strip, per type (≈ one PR)

- Renders into `CanvasDock` (ADR-0092) — **zero canvas height**, asserted as an equality like the
  strips before it. Never over the scene (ADR-0064).
- Names the activity and the **first** matching reason (`CONFLICT_FLAGS` is already ordered for a
  multi-flag activity).
- The action is derived from the type, in one place, so the map cannot drift from the flag set.
- **Shaded, never hidden**, when the action exists but is shut (ADR-0082) — with the reason linked,
  not merely printed beside it.
- **No button at all** for negative float. That is the decision, not an oversight, and the strip's
  copy has to make the absence read as an explanation rather than a missing feature.
- **Tests:** one case per type including the no-button one; the zero-height equality; the shut-with-
  reason path.

##### M3-T2 — The Scheduling route (≈ small)

- Add the `ActivityEditorPurpose` M0-T3 established is missing, mapping to the `scheduling` tab.
- **Tests:** the purpose→tab mapping, beside its existing siblings.

---

### Milestone M4 — Gate pass and journey

##### M4-T1 — Specialist reviews (≈ small)

**ux-reviewer, accessibility-reviewer, component-reviewer** over the combined diff. This epic
touches copy, a live region, a variable-width control and a new strip — every one of those is a
category this register has recorded shipping a defect in.

> **Carry-over:** ADR-0093 shipped with these gates **not run**, because that session could not
> launch agents (`progress-entry-convergence/m2-review.md`). If this epic runs in a session that
> can, run them over **both** diffs. If it cannot, say so in the same words rather than ticking the
> box.

##### M4-T2 — Journey (≈ one PR)

- Extend `apps/web/e2e-workspace-chrome/` (1646, pen enforced, no `VITE_` pins) — no new CI step.
- **Assert:** the count is readable without cycling; stepping updates it; the strip appears in the
  dock and costs no height; the fix works for a hand-placed clash **against a real API**; the filter
  and the count agree on a plan carrying several flag types.
- Locate controls by `[data-toolbar-item]`, never by copy (ADR-0091's standing rule).
- **After any label or layout change, run every journey** — not only the suite CI names. See
  `docs/TESTING.md` for the local sweep trap (`pkill -f "nest start"` leaves the API alive).

---

### Milestone M5 — ADR-0094

##### M5-T1 — File it (≈ small)

- **Subject:** that a count is only worth carrying where it can be read without acting, and that a
  remedy offered per type beats one offered uniformly. Records F1 (two meanings of one word on one
  toolbar) and F2 (a flag that is a fact, not a fault) as the findings that reshaped the request.
- Register in `docs/adr/README.md`, CLAUDE.md §16 and `docs/ROADMAP.md` (`check:adr-coverage`
  demands one or a written exemption); re-run `check:counts`.
- **Record what the measurements changed**, including M0-T1's answer even — especially — if it
  contradicted this plan.

---

## Sequencing

```
M0 (measure, dark) ─► M1 (button) ─► M2 (one meaning) ─► M3 (strip) ─► M4 (gates) ─► M5 (ADR)
        │
        └── M0-T1 can send D-a back to the product owner before anything is built
```

M1 and M2 are each shippable alone. M3 depends on neither but reads best after M1.

## Definition of Done (per task)

Per §21, plus for this epic specifically:

- Pre-push gate **run**: `pnpm lint && pnpm typecheck && pnpm test`, plus
  `scripts/e2e-local.sh web:workspace-chrome` and `web:toolbar-fit`.
- Every width claim carries its measurement (§19.10). No claim that promoting the button is free.
- Behaviour-changing assertions **verified red first** — especially M2-T1, which changes what a
  shipped filter returns.

## Risks & assumptions (rollup)

| Risk                                                                    | Likelihood | Impact | Mitigation                                                                                                                    |
| ----------------------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Row 1 cannot afford the button and something demotes                    | **medium** | medium | M0-T1 measures first; the trade goes back to the product owner, with the icon+number variant as the fallback they already saw |
| The count label's width varies with the number                          | high       | low    | Measure the worst realistic case, not the fixture's                                                                           |
| Widening the filter breaks a consumer                                   | low        | medium | M0-T2 enumerates them before M2 touches anything                                                                              |
| The count becomes a second live region saying what is already announced | medium     | medium | M1-T1 asserts `aria-hidden`, as both existing read-outs do                                                                    |
| "No button" reads as a missing feature rather than a decision           | medium     | medium | M3-T1 owns the copy; M4-T1 points the UX gate at exactly this                                                                 |
| The specialist gates do not run again                                   | medium     | medium | M4-T1 states the carry-over explicitly rather than letting it lapse silently                                                  |

**Assumption to check, not trust:** that no existing `ActivityEditorPurpose` already reaches the
Scheduling tab. M0-T3 checks it.
