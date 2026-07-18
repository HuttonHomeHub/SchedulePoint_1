# UX Standards

> Project-wide UX principles every screen must uphold. These complement the
> visual rules in [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) and the technical
> patterns in [`FRONTEND_ARCHITECTURE.md`](FRONTEND_ARCHITECTURE.md). The goal:
> Blank App should feel like a polished, trustworthy commercial SaaS product.

## Core principles

1. **Consistency beats novelty.** The same action looks and behaves the same
   everywhere. Reuse patterns; don't invent per-page interactions.
2. **Clear hierarchy.** Every screen has one obvious primary action and a clear
   visual order (title → key data → secondary detail → actions).
3. **Forgiving.** Prevent errors first (constraints, sensible defaults,
   confirmation for destructive acts); make recovery easy (undo where possible).
4. **Responsive & fast-feeling.** Works and feels good from 320px to widescreen;
   perceived performance is a feature.
5. **Accessible to everyone.** Keyboard and screen-reader users are first-class,
   not an afterthought.
6. **Trustworthy with data.** Numbers, amounts, and dates are precise,
   unambiguous, and never surprising (this matters most for money — see below).

## Every page must have

- **A consistent layout** built from the shared app shell (sidebar + header +
  page scaffold). No bespoke page chrome.
- **A page header** with a title (single `<h1>`), optional breadcrumb for depth,
  and a right-aligned primary action slot.
- **Clear hierarchy** using the type and spacing scales — not ad-hoc sizes.
- **Intuitive navigation:** current location reflected in the sidebar and
  breadcrumbs; back/forward and deep links always work (URL-driven state).
- **Full keyboard support:** logical tab order, visible focus, shortcuts where
  they help (documented, discoverable).
- **Accessibility compliance** to WCAG 2.2 AA (see design system).
- **Responsive behaviour** verified at `sm`, `md`, `lg`, `xl`.
- **Meaningful animation** only — transitions that aid continuity, never
  decoration; reduced-motion honoured.
- **Excellent perceived performance:** skeletons on first load, optimistic UI
  where safe, prefetch on intent, no layout shift.

## State coverage (the "every view" rule)

Every data-driven view explicitly designs **all** of these — a missing state is
a bug:

| State       | Standard                                                            |
| ----------- | ------------------------------------------------------------------- |
| **Loading** | Skeleton matching final layout (first load) / inline busy (actions) |
| **Empty**   | Icon + one-line explanation + primary action to proceed             |
| **Error**   | Friendly message + retry; never a raw error or blank screen         |
| **Partial** | Show what's available; indicate what's still loading                |
| **Success** | Clear confirmation (toast/inline); update the view optimistically   |

## Interaction standards

- **Feedback within 100ms** for any interaction (press state, focus, spinner).
- **Destructive actions** require explicit confirmation (AlertDialog) and use
  the `destructive` intent; prefer reversible actions with undo.
- **Forms:** inline validation on blur/submit (not on every keystroke), a clear
  error summary, disabled+busy submit while pending, and preserved input on
  error. Never lose a user's work.
- **Long operations:** show progress; keep the UI responsive; allow cancel where
  feasible.
- **Navigation:** never trap the user; provide a way back from every screen;
  external links open predictably and are marked.
- **Row / node actions:** dense list and tree rows expose their actions through a
  context menu (the `Menu` primitive, WAI-ARIA APG Menu Button) reachable **four
  ways** — a hover-revealed "⋯" button, right-click, the keyboard (ContextMenu /
  Shift+F10 on the focused row), and touch long-press — **never hover-only**. The
  menu roves focus with the arrow keys and returns focus to the trigger on
  Esc/Tab/selection.

## Content & tone

- Plain, concise, sentence case. Consistent terminology (a "project" is always a
  "project"). Action labels are verbs ("Add project", not "New").
  - **Exception — established metric names.** Feature and chrome labels stay sentence
    case ("Earned value", "Logic diagram"), but the standard EVM metric names shown as
    data — Budget at Completion, Planned Value, Earned Value, Actual Cost, Estimate at
    Completion, Schedule/Cost Performance Index, Schedule/Cost Variance — keep their
    Title Case as proper terms, and their acronyms (BAC, PV, EV, AC, SPI, CPI, …) carry
    an `<abbr title>` expansion the first place they appear.
- Error messages say what happened and what to do next — no blame, no jargon,
  no stack traces.
- Empty states are encouraging and actionable, not dead ends.
- Numbers, currency, and dates are locale-formatted (`Intl`); money is exact.

## Navigation & information architecture

- Primary navigation in the sidebar; secondary via tabs within a page; tertiary
  via in-context menus. Don't exceed this depth without review.
- Breadcrumbs for anything two or more levels deep.
- Deep-linkable everything: filters, tabs, and pagination live in the URL so a
  view can be shared and restored.

## Responsive behaviour

- **Mobile-first.** Design the small-screen experience first; it is not a
  degraded desktop.
- Sidebar collapses to a drawer below `lg`; tables scroll horizontally within a
  bordered container; dialogs become full-height sheets on small screens where
  appropriate.
- Touch targets ≥ 44px; hover-only affordances always have a non-hover
  equivalent.

## Perceived performance playbook

- Prefetch route data on link hover/focus (intent).
- Optimistic updates for safe mutations; roll back visibly on failure.
- Skeletons over spinners for content; keep skeleton and final layout identical.
- Avoid blocking the whole screen for partial data — stream in sections.

## Definition of done (UX)

- [ ] Uses the shared layout, tokens, and existing components (no one-offs)
- [ ] Single clear primary action and coherent hierarchy
- [ ] Loading, empty, error, and success states all present
- [ ] Fully keyboard operable with visible focus; screen-reader sensible
- [ ] Correct in light and dark, across `sm`–`xl`
- [ ] Motion is purposeful and respects reduced-motion
- [ ] Copy is clear, consistent, and actionable
