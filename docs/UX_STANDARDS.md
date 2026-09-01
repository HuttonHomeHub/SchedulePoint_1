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
| **Empty**   | One-line explanation; an icon and an action where each is truthful  |
| **Error**   | Friendly message + retry; never a raw error or blank screen         |
| **Partial** | Show what's available; indicate what's still loading                |
| **Success** | Clear confirmation (toast/inline); update the view optimistically   |

### Not everything that renders nothing is an empty state

The Empty row above said "Icon + one-line explanation + primary action" until
2026-09-01, and the primitive it describes has never required either the icon or
the action. That was not pedantry: a required action forces a lie on the case a
Viewer meets most, where the honest answer is that they cannot act and should
ask a Planner, and a button that refuses them is worse than no button
(`components/ui/page/empty-state.tsx`). Both are optional; an icon is usually
wrong at section size.

The sharper failure is the opposite one — dressing something that is **not** an
absence as one. Thirty-four hand-rolled dashed boxes were counted across the app
and **seven were the wrong shape entirely**, including three failed requests
rendered as "nothing found" (a request that errored and a request that succeeded
and found nothing are different facts — ADR-0073 C1) and two permission refusals
wearing an absence's costume. So decide the shape from what the region is
saying, not from the fact that it is blank:

| What the region is saying                                 | Shape                                                                                                                                           |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Nothing exists here yet, and you might create it          | `EmptyState` — `size="page"` for a whole screen, `size="section"` inside a card. `DataTable` frames its own.                                    |
| Nothing matches the filter                                | `EmptyState size="section"` **plus a way back** — the two must never read alike                                                                 |
| Nothing here yet, in a panel or dock where room is scarce | `NoticeStrip emphasis="dashed"`                                                                                                                 |
| You may not see this                                      | `NoticeStrip tone="info" emphasis="solid"` — a refusal names why it is shut (ADR-0082), and solid says the state is settled rather than pending |
| The request failed                                        | The error shape — `role="alert"` and a retry, never a dashed box                                                                                |
| A step has not been taken yet ("choose a file above")     | Prose. Nothing is missing; giving it a frame announces a problem the screen does not have                                                       |
| A settled good outcome ("nothing needs you")              | A sentence. Not a state at all                                                                                                                  |

Enforced by `components/ui/page/empty-state.structural.test.ts`, which fails on a
hand-rolled dashed box outside a three-entry allow-list, and fails again when an
entry stops being needed.

## Interaction standards

- **Feedback within 100ms** for any interaction (press state, focus, spinner).
- **An icon-only control names itself to every input** (ADR-0117): its name appears on hover, on
  keyboard focus, and on a coarse-pointer long-press — via `useTooltip({ purpose: 'name-echo' })`,
  never via `title`, which is hover-only and therefore names the control to a mouse and to nobody
  else. A long-press shows the name **without** firing the command; a tap fires the command and
  shows nothing. The binding `title` discriminator table is in
  [`COMPONENT_LIBRARY.md`](COMPONENT_LIBRARY.md) §`useTooltip`.
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
  - **One deliberate exception, and it is open rather than settled.** ADR-0112 D1
    moved the edit-lock's _sentence_ to the plan's facts row while its badge and
    every hand-off control stayed on the plan's identity line, to free 155 px on a
    row measured to have four pixels of headroom. For the six of ten lock states
    that pair a sentence with an action, the condition and the control it answers
    are now at opposite ends of the screen — a real cost, raised by the ux review,
    put to the product owner with the width consequence, and accepted on the basis
    that the badge still names the state beside the buttons and that the question
    is better answered from use than from review. **Do not read this as licence to
    separate a control from its condition elsewhere**; read it as one case with a
    named trigger to revisit (a report about the taken-over or take-over states).
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
- **Target size (ADR-0118).** WCAG 2.2 §2.5.8 (**24 px**, level AA) is the floor
  everywhere and is gated by `e2e-workspace-fit`. Under **`pointer: coarse`** the
  house rule is **≥ 44 px** — which is §2.5.5 _Enhanced_, level **AAA**, so it is
  ours rather than the law's, and a trade made against it should know that. The
  fine-pointer default stays **36 px** (`--control-h`, ADR-0097 CQ-C): measured,
  coarse-only 44 px costs a mouse user **0 px** of diagram and a touch user 16 px
  of 808. A surface that cannot meet the house rule is **named in ADR-0118 §D1
  with the equivalent it offers a non-pointer user**, and the list has **two**
  entries: a breadcrumb crumb (a truncated crumb's width is the space left over, so
  no CSS makes it 44px wide — a box was built, measured **16 × 44**, and withdrawn),
  and `icon-sm`'s dense-row consumers, whose containers are fixed independently of
  them (`docs/TECH_DEBT.md` #215). This sentence read "that list is empty today"
  until 2026-08-29 — written when it was true and left standing when ADR-0118 §D6
  added the first entry, which is the drift class that ADR exists to close, in the
  standards doc that states the rule.
  Hover-only affordances always have a non-hover equivalent.
- **The canvas is not exempt.** The TSLD surface must stay usable at every
  breakpoint the shell supports, and every canvas affordance needs a keyboard
  and screen-reader equivalent in the parallel DOM layer (ADR-0026).

### Give-way order in a fixed-height chrome row (ADR-0110)

A chrome row whose height is fixed — the workspace foot, the command band, the
status row — has a **width budget its occupants must be ranked against, and the
ranking is declared rather than emergent**. Three rules, each of which this
product got wrong once:

- **A fact relocates; it never disappears.** The plan's facts (activity count,
  critical count, project finish, schedule state) render in the collapsed
  activities row when that row exists and in the shell's status row when it does
  not. Below `md` the activities row **is not mounted at all** — measured, not
  assumed — so a merge that took the row's existence for granted would have
  deleted the plan's facts on exactly the screens with least room to lose them.
- **Two hosts, one mechanism: a registry, never a branch.** An outlet registers
  itself, the component renders into it, and it renders **in place** when no
  outlet is registered. The in-place fallback is not a courtesy — it is what
  makes the three states one mechanism instead of three conditionals to get
  wrong.
- **A collapse is triggered by the row's pressure, not by its own width.** A
  container query on the cluster asks "am I narrow?", and what decides whether
  the cluster should shed its labels is whether the **row** is tight, which
  depends on what else is docked beside it and is known only at the row.
  Tailwind's `@container` also applies `contain: inline-size`, so an auto-width
  `shrink-0` flex item stops sizing to its content: the first attempt collapsed
  the facts to **24 × 48 px** with all five present and overflowing, every unit
  suite green because jsdom has no layout.

Where labels can be shed at all, prefer **always showing them** over a
disclosure: a row that hides four facts behind a press has traded a width
problem for a discoverability one.

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
