# ADR-0179: The layout is designed from a laptop up, and says so below it

- **Status:** Proposed — 2026-10-08. Drafted with the `minimum-viewport` feature spec, which is
  awaiting the product owner's approval. The spec is deliberately **not linked by path** until it is
  Approved: `check:spec-status` S3 refuses a Draft spec that an ADR cites (ADR-0131 D1). The link is
  added at M1, when this ADR is Accepted.
- **Date:** 2026-10-08
- **Deciders:** James Ewbank (product owner — chose the floor "tablet landscape, about 1024 × 640"
  and asked for a polished page below it, 2026-10-08), with Claude Code
- **Amends:** ADR-0118 (retires its M4 addition of 390 × 844 to the coarse width list, `:235-238`)
- **Builds on:** ADR-0029 (the shell's `lg` switch), ADR-0077 (the brand surface), ADR-0088 D1 (no
  flag), ADR-0105 (why this needed a spec), ADR-0113 (measure the problem first)

## Context

The brief has always said this is not a phone product (`docs/PROJECT_BRIEF.md:30`, `:284`), and the
product owner has said so three times (`docs/specs/page-composition/feature-spec.md:404`,
`docs/adr/0146-a-page-has-one-measure-and-a-column-has-a-reason.md:12`, and on 2026-10-08:
_"using this on a phone is not required and the design rules should reflect this as its hamstringing
the GUI and layout"_). Each time the instruction was adopted inside one epic; the standing rules kept
saying **mobile-first** (`CLAUDE.md` §12, `docs/UX_STANDARDS.md:18`, `:329-330`,
`docs/DESIGN_SYSTEM.md:14`, `:203`, `docs/FRONTEND_ARCHITECTURE.md:356`), and gates kept requiring
the workspace at 390 px (`apps/web/playwright.narrow-shell.config.ts:45`,
`apps/web/e2e-workspace-fit/command-surface.spec.ts:1058`). Meanwhile the fine-pointer
command-surface sweep never measured anything below 1280 (`command-surface.spec.ts:38-43`).

Two forces pull the other way and are not negotiable here. **WCAG 2.2 AA is a merge requirement**
(CLAUDE.md §13): 1.4.10 Reflow is measured at 320 CSS px, which is a 1280 px window at 400 % zoom, so
"narrow" includes zoomed laptops and monitors, not only phones; 1.4.4 and 1.3.4 add text resize and
orientation. And **a coarse pointer is not a phone**: the product owner's Surface Pro is used by
finger and stylus at 1912 × 1114 (`docs/HANDOFF.md:38`).

## Decision

**D1 — The designed floor is 1024 × 600 CSS px** (height pending the product owner's CQ-1; he chose
"about 640" and 600 is recommended because a 1366 × 768 laptop leaves ~608–636 after browser and
taskbar, derived from his own measured 132 px overhead). Every layout is designed, optimised and
gated at and above it. 1024 is the shell's existing structural switch (`LG_QUERY`,
`apps/web/src/components/layout/navigator/app-shell.tsx:19`), so no breakpoint is invented.

**D2 — Below 1024 wide the signed-in app shows an on-brand page** — "SchedulePoint is designed for
larger screens" — built from the public screens' brand surface (ADR-0077: the ground, the floating
card, `BrandPanel`), stating the minimum and the current window size. It is mounted only in the
signed-in layout, so public screens, `/share` and `/staff` never show it (pending CQ-3). Width alone
triggers it; height never does.

**D3 — The page has a "Continue anyway" action, remembered per device** (pending CQ-2). After it, the
existing narrow fallbacks apply, maintained **for function, not design**: text, forms, dialogs,
menus, lists and navigation reflow to 320 px; the diagram, the Gantt, data tables and the
workspace's command band are two-dimensional content and may scroll both ways.

**D4 — Rules become desktop/tablet-first.** "Mobile-first" leaves every standing rule. Unprefixed
styles describe the designed layout; narrow fallbacks use `max-*` variants only where reflow needs
them. The reflow rules that are WCAG's (e.g. `DESIGN_SYSTEM.md:817`, `fit` columns are `md:`) stay.

**D5 — Gates follow.** The floor is added to the fine-pointer sweep; 390 px leaves the coarse sweep
(amending ADR-0118); phone-width layout assertions are retired; journeys below the floor are
re-scoped to the zoom band (640 × 480, a 1280 window at 200 %); 320 px reflow checks are kept.

**D6 — Coarse-pointer obligations are unchanged** at and above the floor (ADR-0118's 44 px house rule,
ADR-0177).

**D7 — No feature flag** (ADR-0088 D1).

## Alternatives considered

- **A hard block below the floor** — fails 1.4.10/1.4.4 for zoomed users (the product owner's own
  monitor at ~190 % and a 1366 laptop at ~135 % would be locked out) and 1.3.4 for upright tablets;
  would require a recorded AA deviation and a carve-out from CLAUDE.md §13. Rejected unless the
  product owner accepts that deviation explicitly (CQ-2 (c)).
- **Detect a small device (`screen.width`) instead of a small window** — Firefox reports
  `screen.width` in zoom-scaled CSS pixels (a 1600 display read 1067 at 150 %,
  [Mozilla bug 1292571](https://bugzilla.mozilla.org/show_bug.cgi?id=1292571)), so a zoomed laptop
  looks like a small device in the browser this was meant to spare; other engines' behaviour is
  undocumented in current sources. Not reliable; rejected.
- **Keep mobile-first and only retire a few gates** — leaves the rule that produced the problem;
  the instruction would be lost a fourth time.
- **Floor at 1180 or 1280** — tighter to real devices but leaves no margin for tablet zoom, and is
  not an existing switch; 1024 is.

## Consequences

- Design work starts at 1024 and goes up; nobody designs a phone layout first.
- The narrow fallback remains shipped code, smaller in ambition; a later milestone may simplify it
  (e.g. retire the below-`md` single-pane workspace) under its own spec.
- `docs/TECH_DEBT.md` #438 (Gantt at 390 px) closes as out of scope.
- A zoomed user meets the page once per device. Accepted cost.
- If CQ-2 is answered "hard block", this ADR is re-drafted to record the AA deviation before it can
  be Accepted.

## References

- `docs/PROJECT_BRIEF.md:30`, `:230`, `:284`; `docs/UX_STANDARDS.md:327-359`;
  `docs/DESIGN_SYSTEM.md:201-204`; `docs/FRONTEND_ARCHITECTURE.md:354-389`
- ADR-0029, ADR-0077, ADR-0088, ADR-0105, ADR-0113, ADR-0118, ADR-0131, ADR-0177
- WCAG 2.2 §1.4.10 Reflow, §1.4.4 Resize Text, §1.3.4 Orientation, §2.5.8 Target Size (Minimum)
