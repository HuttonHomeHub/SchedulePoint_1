# ADR-0223: Accessibility basics as we build, a full sweep at milestones

- **Status:** Accepted — 2026-11-15 by the product owner, as written.
- **Date:** 2026-11-15
- **Deciders:** James Ewbank (product owner) and Claude Code.
- **Amends:**
  - ADR-0111 — its decision (a specialist review before release for every change to a shared primitive's
    keyboard or focus contract) is withdrawn and replaced by D3 below. Its diagnosis, that no gate can see this
    class of defect, still stands; what changes is when the human-style check happens.
  - CLAUDE.md §13 ("a merge requirement, not a nicety") and §19.13 (the ADR-0111 rule), worded as below once this
    is accepted. §21's Definition of Done keeps "accessibility", meaning D1 and D2.
- **Does not amend:** the WCAG 2.2 AA target, ADR-0179/ADR-0222's zoom and text-size obligations, or any
  existing gate.

## Context

The owner, 2026-11-15 (recorded in `docs/HANDOFF.md`, "What is next", item 3, PR #1386): keep the cheap basics
as work is built — keyboard operation, clear names on controls, browser zoom and larger text keep working — and
drop the rule that every change to focus, announcements or shared controls needs a browser accessibility review
before release. Run a full accessibility sweep at milestones instead. The reason: build the application first
rather than let accessibility slow it.

**What the per-change rule costs today.** ADR-0111 (2026-08-26) made an `accessibility-reviewer` run, and often a
`component-reviewer` run, a release step for any change to a shared primitive's keyboard or focus contract.
Since then the class it covers has widened in practice to most interactive work: the shared announcer, the
selection bar, the dock, split buttons and the pen messages all went through it in the 2026-11-13/14 session
(`docs/HANDOFF.md`, "What shipped" and the Environment notes on reviewer findings). Each run is minutes, but each
finding reopens a pull request, and a change cannot ship until its review comes back.

**What it found.** The rule earned its place: it caught #189 and #192 (ADR-0111's context), and twice in the last
session a reviewer running the component found a live region saying "Checking who's editing…" during a change
meant to be silent (`docs/HANDOFF.md`, Environment notes). This ADR does not claim those defects stop happening.
It moves when they are found, from before each release to the next sweep.

## Decision

**D1 — The basics are checked as every change is built.** These stay part of "done" for any user-facing change:

1. **Keyboard.** Everything that can be done with a pointer can be done with the keyboard, and focus is visible.
2. **Names.** Every control has a clear accessible name (an icon-only control names itself, ADR-0117).
3. **Zoom and text size.** Browser zoom and 200 % text keep working: nothing is cut off or unreachable
   (WCAG 1.4.4; ADR-0179 and ADR-0222).
4. **Meaning is not colour alone, and colours come from tokens**, which carry their contrast (§12).

The builder checks these as part of the work; no separate reviewer run is required for them.

**D2 — The automated gates stay as they are.** `eslint-plugin-jsx-a11y` in lint and the axe checks inside the
Playwright journeys keep running and keep failing a build (ADR-0164). They are computed and cheap, so nothing is
saved by removing them.

**D3 — A full accessibility sweep runs at milestones, not per change.**

- **When:** at the end of each epic, before its last release is called done, and at least once every three months,
  alongside the reconciliation pass (`docs/RECONCILE.md`).
- **What:** `accessibility-reviewer`, run against the real product in Chromium, over every screen and control the
  epic added or changed: keyboard routes, focus on open, close and removal, live-region announcements, names,
  zoom and 200 % text, forced colours and target sizes. `component-reviewer` joins when a shared primitive in
  `components/ui/` changed.
- **What happens to findings:** they are fixed and released before the next epic starts, in line with the owner's
  no-parked-list direction for the runbook. A finding that needs a spec (ADR-0105) gets one.

**D4 — The per-change review is no longer required, and is still allowed.** A builder or reviewer may still run
`accessibility-reviewer` on a single change when they suspect a problem; it is just not a release step.

**D5 — The target is unchanged.** SchedulePoint still aims at WCAG 2.2 AA. What changes is that conformance is
established at each sweep rather than claimed for every merge.

**The new wording, applied with this ADR:**

- CLAUDE.md §13, first bullet: "Target **WCAG 2.2 AA**. The basics (keyboard, names, zoom and text size, colour) are
  checked as every change is built, the automated checks gate every build, and a full sweep runs at the end of
  each epic (ADR-0223)."
- CLAUDE.md §19.13 is replaced by: "**Accessibility is swept at milestones** (ADR-0223). Check the basics as you
  build; run `accessibility-reviewer` over the epic's screens at its end, and fix what it finds before the next
  epic starts."

## Alternatives considered

- **Keep ADR-0111 as it is.** It works, but slows every interactive change; the owner declined it.
- **Drop the review entirely and rely on the gates.** ADR-0111 showed the gates cannot see this class of defect;
  without a sweep nothing would. Rejected.
- **Sweep only before 2.0 or before a sale.** Defects would pile up across many epics, and fixing focus code months
  later costs more. Rejected in favour of per-epic.

## Consequences

- Interactive changes ship without waiting for a reviewer run.
- **Defects of the #189/#192 kind can now reach the owner's host** and live until the next sweep: at most until
  the epic ends, and never longer than the three-month floor.
- A sweep finding can land in code built several changes earlier. It is fixed before the next epic, not deferred.
- `.claude/agents/accessibility-reviewer.md`'s description says to run it "PROACTIVELY after building interactive
  UI"; that line changes to "at the end of each epic (ADR-0223), or when a change is suspected" when this is
  accepted.
- `docs/TESTING.md`'s ADR-0111 paragraph changes the same way.

## References

- ADR-0111, ADR-0117, ADR-0164, ADR-0179, ADR-0222, ADR-0105; CLAUDE.md §13, §19.13, §21; `docs/RECONCILE.md`.
