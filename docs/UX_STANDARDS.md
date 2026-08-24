# UX Standards

> Project-wide UX principles every screen must uphold. These complement the
> visual rules in [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) and the technical
> patterns in [`FRONTEND_ARCHITECTURE.md`](FRONTEND_ARCHITECTURE.md). The goal:
> SchedulePoint should feel like a polished, trustworthy commercial planning
> tool — the kind of software a planner trusts with a programme they are
> accountable for.

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
   unambiguous, and never surprising. A planner is accountable for these dates:
   a computed value must never look hand-entered, and a hand-entered one must
   never look computed.
7. **Never move a planner's work silently.** Where the engine disagrees with a
   hand placement, flag it — highlight the conflict, do not auto-correct it
   (ADR-0033). Trust is lost the first time the tool "helpfully" moves something.

## Every page must have

- **A consistent layout** built from the shared, mounted-once app shell — the
  chrome band, the Project Explorer rail, and one workspace region (ADR-0029).
  No bespoke page chrome.
- **A page header** with a title (single `<h1>`), optional breadcrumb for depth,
  and a right-aligned primary action slot.
- **Clear hierarchy** using the type and spacing scales — not ad-hoc sizes.
- **The right surface scope.** Anything inside the chrome band or a panel wraps
  in `<Surface>` so its semantic tokens rebind to that surface's palette
  (ADR-0055). A component must never learn where it is; it must never reach for
  a colour literal to compensate.
- **Intuitive navigation:** current location reflected in the Project Explorer
  and breadcrumbs; back/forward and deep links always work (URL-driven state).
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
- **A confirmation must name what is actually destroyed — including what the user
  did not select.** If an action cascades, say so and say how much: "Delete the
  summary “X” and the 12 activities below it?" A generic "Delete “X”? You can
  restore it later." on an action that removes a subtree is not a warning, it is
  a reassurance about the wrong thing. Where a non-destructive alternative exists
  (dissolve vs. delete), the confirmation is the right place to point at it.
  Derive the count from data already loaded, and when it is not available say
  what happens without inventing a number — a wrong count is worse than none.
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
  - **An action the reader cannot take right now is shaded with the reason, not
    removed** (ADR-0082, extending ADR-0062 M6 into the menu tier). Hiding it
    means a planner never learns the row can do the thing, and never learns what
    would let them — and it made one operation wear two mental models depending
    on whether they were on the table or the canvas. Shaded items stay arrow-key
    stops so the reason is reachable by keyboard. **Omit** only when the action
    does not apply to that object, its flag is off, or there is nothing to show;
    when **every** item would be shaded, show no trigger at all.
  - The reason names the next step in the app's existing words ("Start editing
    to change this activity"), never a bare "Read-only" and never an invented
    fourth variant of a sentence the toolbar already has.

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

- Primary navigation in the **docked Project Explorer** on the leading edge
  (Client → Project → Plan, ADR-0109 D2), which also carries the organisation's
  six destinations — one navigator, not two; secondary via the workspace's own
  chrome (the plan command deck's captioned groups, ADR-0031's taxonomy rendered
  by ADR-0109 D1); tertiary via in-context menus. Don't exceed this depth
  without review.
- **An action's surface is decided by its subject.** An action whose subject is
  the selected object belongs on the object's surface; the command surface
  carries actions whose subject is the plan or the view (ADR-0093, gated by
  `selection-duplication.structural.test.ts`). A **fact** belongs on the status
  bar, and a control that answers a condition belongs beside the condition it
  answers — which is why Recalculate is offered only when the schedule is behind
  the plan (ADR-0109 D3).
- Breadcrumbs for anything two or more levels deep.
- Deep-linkable everything: filters, tabs, and pagination live in the URL so a
  view can be shared and restored.

## Responsive behaviour

- **Mobile-first.** Design the small-screen experience first; it is not a
  degraded desktop.
- The Project Explorer folds to a 34 px **spine** — never to nothing, because a
  panel that vanishes leaves a reader with no way back — and becomes an
  off-canvas `Sheet` below `lg` (64rem). Its spine keeps the organisation's
  destinations: folding it is how a planner buys canvas width, and it must not
  take the product's secondary navigation with it. The plan workspace swaps
  from split panes to a single-pane toggle below `md` (48rem);
  tables scroll horizontally within a bordered container; dialogs become
  full-height sheets on small screens where appropriate.
- Touch targets ≥ 44px; hover-only affordances always have a non-hover
  equivalent.
- **The canvas is not exempt.** The TSLD surface must stay usable at every
  breakpoint the shell supports, and every canvas affordance needs a keyboard
  and screen-reader equivalent in the parallel DOM layer (ADR-0026).

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
