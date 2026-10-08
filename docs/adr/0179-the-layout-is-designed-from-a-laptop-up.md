# ADR-0179: The layout is designed from a laptop up, and says so below it

- **Status:** Proposed — 2026-10-08. Drafted with the `minimum-viewport` feature spec, which is
  awaiting the product owner's approval. The spec is deliberately **not linked by path** until it is
  Approved, because `check:spec-status` S3 refuses a Draft spec that an ADR cites (ADR-0131 D1). The
  link is added at M1, when this ADR is Accepted. Revised the same day after the accessibility, UX,
  component and ui-architect reviews.
- **Date:** 2026-10-08
- **Deciders:** James Ewbank (product owner) and Claude Code. On 2026-10-08 James:
  - chose the floor "tablet landscape, about 1024 × 640";
  - asked for a polished page below it;
  - answered the half-screen question: "keep 1024, half-screen is fine with continue".
- **Amends:**
  - ADR-0029 — `:110` "Mobile-first … non-negotiable" is withdrawn.
  - ADR-0118 — retires M4's 390 × 844 coarse width (`:235-238`). Below 1024, the 24 px target floor
    rests on the narrow-shell journey's axe `target-size` check.
- **Notes:**
  - ADR-0030 `:87` — the below-`md` toggle's reason changes from "a phone" to zoom.
  - ADR-0077 — its `auth` scope gains a signed-in consumer.
- **Builds on:** ADR-0088 D1 (no flag), ADR-0105 (why this needed a spec), ADR-0111 (keyboard
  contracts reviewed before release), ADR-0113 (measure the problem first), ADR-0169 (an editor's
  working state), ADR-0173 (per-device preferences)

## Context

The product owner, 2026-10-08, verbatim: _"i want to drop the phone aspect from this whole
application we should set a minimum screen size that this app works on. its going to be a laptop /
11inch tablet at the very lowest i would say. this is a big thing for me, using this on a phone is not
required and the design rules should reflect this as its hamstringing the GUI and layout"_.

The brief has always said this is not a phone product (`docs/PROJECT_BRIEF.md:30`, `:284`). He had
said it twice before (`docs/specs/page-composition/feature-spec.md:404`;
`docs/adr/0146-a-page-has-one-measure-and-a-column-has-a-reason.md:12`). Each time, the instruction
was adopted inside one epic, and the standing rules kept saying **mobile-first**:

- `CLAUDE.md` §12;
- `docs/UX_STANDARDS.md:18`, `:329-330`;
- `docs/DESIGN_SYSTEM.md:14`, `:203`;
- `docs/FRONTEND_ARCHITECTURE.md:356`;
- ADR-0029 `:110`.

The gates kept requiring the workspace at 390 px (`apps/web/playwright.narrow-shell.config.ts:45`,
`apps/web/e2e-workspace-fit/command-surface.spec.ts:1058`). Meanwhile the fine-pointer sweep never
measured anything below 1280 (`command-surface.spec.ts:38-43`).

Two forces are not negotiable.

- **WCAG 2.2 AA is a project merge requirement** (CLAUDE.md §13). 1.4.10 Reflow is measured at
  320 CSS px, which is a 1280 px window at 400 % zoom. 1.4.4 asks for 200 % text without loss of
  function. So "narrow" includes zoomed laptops and monitors, not only phones.
- **A coarse pointer is not a phone.** The product owner's Surface is used by finger and stylus at
  1912 × 1114 (`docs/HANDOFF.md:38`).

## Decision

**D1 — The designed floor is 1024 × 600 CSS px.** The height is pending CQ-1; 600 is recommended
because a 1366 × 768 laptop leaves about 608–636 after the browser and taskbar, worked out from the
product owner's measured 132 px overhead.

- Layouts are designed and gated at and above the floor, with the Explorer at its default width
  (276).
- 1024 is the shell's existing switch. One exported constant,
  `DESIGNED_MIN_WIDTH_QUERY = '(min-width: 64rem)'`, replaces `LG_QUERY` (`app-shell.tsx:19`) and is
  pinned to Tailwind `lg`.
- A window snapped to half a screen (~956) stays below the floor, by decision.

**D2 — Rules, not the cascade.**

- Tailwind's min-width cascade stays, and `md:`/`lg:` remain legal.
- The layout is **designed** at the floor and up.
- Below the floor, content must reflow (lists, forms, dialogs, menus, the Explorer sheet) but need
  not look designed.
- The two-dimensional surfaces — the diagram, the Gantt, data tables and the command band — may
  scroll in both directions.
- The designed layout wins any conflict.

What is freed is design effort and gates, not the reflow obligation.

**D3 — The notice is its own native `<dialog>`.**

- It lives in `components/layout/viewport-notice/`, **beside** `<AppShell/>` in `authed-layout.tsx`.
- It is opened with `showModal()` from `useLayoutEffect`, so there is no first-paint flash.
- "Closed" is `close()` on a dialog that **stays mounted**. The notice never unmounts the shell and
  never registers with `UnsavedWorkProvider`.
- It reuses `useNativeDialogClose` and treats `close` as the source of truth, because Chrome may close
  a modal opened without a user gesture without firing `cancel`.
- The duplicated open→`showModal` effect in `dialog.tsx` and `sheet.tsx` is extracted as
  `useNativeModal({ ref, open })`.
- It is **not** the `Dialog` primitive, which brings an `h2`, an X button and card widths the notice
  does not want.
- **Stacking.** If `NavigationGuard`'s dialog opens on Back while the notice is open, it stacks above
  the notice, and closing it returns to the notice.
- **The pen.** While the notice is open over a plan:
  - the edit-lock heartbeat continues;
  - `EditLockBanner` is inert;
  - a peer's takeover proceeds after the grace period, as for an idle window.

**D4 — When it appears.**

- **Full page:** only on load or pathname change while the window is below 1024 and the device has
  neither acknowledged it nor dismissed it this visit.
- **A live crossing never raises the modal or moves focus.** A window narrowed by zoom, drag or snap
  gets a slim, polite, non-modal banner at the top of the shell instead, carrying Continue anyway and
  Dismiss.
  - It waits ~300 ms before showing and never shows while a pointer button is down.
  - It hides at once on widening. There is no hysteresis band.
  - The full page follows at the next navigation if the window is still narrow and nothing has been
    chosen.
- **Only width triggers.** On-screen keyboards and pinch-zoom therefore never do.
- **Scope.** The notice is mounted only in the signed-in layout, so the public screens, `/share` and
  `/staff` never show it (pending CQ-3).

**D5 — Dismissal.**

- **Continue anyway** writes `schedulepoint:viewport-notice-acknowledged = '1'`:
  - it is read defensively against exactly `'1'`;
  - it falls back from local storage to session storage to module memory;
  - it is shared across tabs through the `storage` event;
  - it is exported for e2e.
- **Escape, a native close, or Dismiss** last the visit only.
- **Per device.** The acknowledgement is not swept at sign-out, because it describes the device and
  the reader, not the account (ADR-0173's precedent for column widths). There is no undo control;
  clearing site data resets it, which is an accepted limitation.
- **A dedicated module, not `useFirstUseHint`.** That hook stores a JSON map, fails open and has no
  visit tier, and extending it would change a working hook for one consumer.

**D6 — Focus.**

- The `h1` is focused on open.
- On close, native dialog restoration returns focus to the element that was recorded at open, if it
  is still connected. Otherwise focus goes to `<main id="main" tabIndex={-1}>` (`app-shell.tsx:198-203`).
  The shell has no heading to fall back to.
- Continue anyway is the first tab stop, because the tips hold no focusable controls. Sign out comes
  after it.
- The canvas's window Escape listener (`TsldCanvas.tsx:2050-2113`) gains a guard for
  `defaultPrevented` and `aNativeModalIsOpen()` (ADR-0111 review).

**D7 — Brand.**

- A presentational `BrandCard` (the ground, the floating card, `BrandPanel`) is extracted from
  `auth-shell.tsx:56-62`, taking `as` and a content-sized option.
- `AuthShell` keeps `main` and its fixed height, and the public screens are unchanged.
- The notice is distinguishable from a signed-out screen: it shows the signed-in user and
  organisation, and a Sign out link.
- Its visual is a token-built pictogram of a laptop beside a sideways tablet.
- There is no entrance animation.
- Under forced colours it has an opaque system-colour card and a visible focus ring.
- `BrandPanel` collapses to a strip below `md` or in short windows, so the `h1` and Continue fit
  without scrolling at 640 × 480, 667 × 375, 911 × 424 and 320 × 256.

**D8 — Copy states width, not promises.**

- The message: "It's designed for screens at least 1024 pixels wide. Your window is {w} pixels
  wide."
- The tips are ordered by pointer: a fine pointer gets "zoom out" first; a coarse pointer gets "turn
  your tablet sideways" first.
- Continue anyway is a secondary button after the tips, introduced by "Zoomed in on purpose? You can
  continue — the diagram and Gantt will need scrolling."
- No sentence claims that everything works the same.

**D9 — Gates follow.**

- The floor is added to the fine-pointer sweep.
- 390 px leaves the coarse sweep, and one 834 × 1112 axe and overflow check is kept.
- Phone devices and phone-width layout assertions are retired.
- Journeys below the floor are re-scoped to the zoom band: 640 × 480, plus 320 × 256 after Continue.
- The 320 px reflow checks are kept.
- The e2e pre-acknowledgement is opt-in, never automatic.

**D10 — The floor is made to fit.** A committed milestone measures and fixes the Explorer/stage budget
and the deck order at 1024. That is the payoff of D2.

**D11 — No feature flag** (ADR-0088 D1). Coarse-pointer obligations at and above the floor (ADR-0118's
44 px house rule, ADR-0177) are unchanged.

## WCAG reasoning

- **A documented minimum size does not take 1.4.10 or 1.4.4 out of a conformance claim.** They are the
  grounds for the way through: zoom makes a big screen narrow, so a page with no way past it removes
  all function from zoomed users.
- **1.3.4 Orientation is not engaged.** A width floor is not an orientation lock, because an upright
  and a sideways window are treated alike, by width.
- **WCAG does not name interstitials.** An explanatory page that is one keyboard press from full
  function, and is remembered, is the defensible reading. The accessibility reviewer agreed it at spec
  stage (2026-10-08) and re-reviews the built surface before release.

## Alternatives considered

- **A hard block below the floor.**
  - It fails 1.4.10 and 1.4.4 for anyone zoomed to about 186 % or more on the product owner's monitor,
    or about 135 % or more on a 1366 laptop.
  - It would need a recorded AA deviation and a carve-out from CLAUDE.md §13.
  - Rejected unless the product owner explicitly accepts that deviation.
- **Detecting a small device (`screen.width`) instead of a small window.**
  - Firefox reports `screen.width` in zoom-scaled CSS pixels: a 1600 px display read 1067 at 150 %
    ([Mozilla bug 1292571](https://bugzilla.mozilla.org/show_bug.cgi?id=1292571)). So a zoomed laptop
    looks like a small device in exactly the case this was meant to spare.
  - Current sources do not document other engines' behaviour.
  - Not reliable; rejected.
- **Raising the modal on any width crossing.** It steals focus from a field mid-edit during a zoom or a
  snap. Rejected in favour of D4's banner.
- **Reversing the cascade (`max-*` first).** It churns every component for no user benefit; D2 changes
  what is designed, not how Tailwind is written. Rejected.
- **Keeping mobile-first and retiring only a few gates.** It leaves the rule that produced the problem
  in place. Rejected.
- **A floor of 1180 or 1280, or ~940 for half-screen windows.** None of them is an existing switch.
  1180 and 1280 leave no room for zoom, and ~940 was declined by the product owner.

## Consequences

- Design work starts at 1024 and goes up, and the floor is made to fit (D10).
- The reflow fallback remains shipped code with a smaller ambition. A named follow-up may retire the
  below-`md` single-pane workspace, once accessibility agrees the command band is a toolbar kept in
  view.
- Two shared extractions (`useNativeModal`, `BrandCard`) and one canvas keyboard guard are reviewed
  under ADR-0111.
- `docs/TECH_DEBT.md` #438 closes as out of scope.
- A zoomed user meets the page once per device, which is an accepted cost.
- If CQ-2 is answered "hard block", this ADR is re-drafted to record the AA deviation before it can be
  Accepted.

## References

- `docs/PROJECT_BRIEF.md:30`, `:230`, `:284`; `docs/UX_STANDARDS.md:327-359`;
  `docs/DESIGN_SYSTEM.md:201-204`; `docs/FRONTEND_ARCHITECTURE.md:354-389`
- ADR-0029, ADR-0030, ADR-0077, ADR-0088, ADR-0105, ADR-0111, ADR-0113, ADR-0118, ADR-0131,
  ADR-0169, ADR-0173, ADR-0177
- WCAG 2.2 §1.4.10 Reflow, §1.4.4 Resize Text, §1.3.4 Orientation, §2.5.8 Target Size (Minimum)
