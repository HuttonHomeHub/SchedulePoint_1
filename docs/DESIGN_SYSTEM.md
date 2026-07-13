# Design System

> The single source of truth for Blank App' visual language and component
> standards. The token _implementation_ lives in
> [`apps/web/src/styles/globals.css`](../apps/web/src/styles/globals.css); this
> document is the spec and rationale. **No one-off component styling may ever
> exist** — everything derives from the tokens and primitives below.

## Principles

1. **Clarity over cleverness.** Data must be unambiguous and scannable.
2. **Consistency.** One way to do a thing; reuse primitives, never reinvent.
3. **Accessible by default** — WCAG 2.2 AA is a merge requirement.
4. **Mobile-first & responsive.** Design for small screens, enhance upward.
5. **Themeable.** Light and dark are first-class, driven by tokens.
6. **Token-driven.** No magic values; if it's visual, it's a token.

## Foundations

- **Framework:** React 19 function components + hooks.
- **Styling:** Tailwind CSS v4 (CSS-first) with semantic design tokens
  (ADR-0006). Components use semantic utilities (`bg-primary`,
  `text-muted-foreground`) — never raw palette values or magic hex.
- **Primitives:** [shadcn/ui](https://ui.shadcn.com) on Radix, owned as source
  in `components/ui/`. Variants via `class-variance-authority` + `cn()`.
- **Icons:** [Lucide](https://lucide.dev) (`lucide-react`).

---

## Tokens

### Colour

Authored in **OKLCH** for perceptual uniformity and reliable light/dark pairs.
Every colour is **semantic** (named by role, not hue) so themes flip
automatically. Full values (light + dark) are in `globals.css`.

| Token (role)                 | Purpose                                               |
| ---------------------------- | ----------------------------------------------------- |
| `background` / `foreground`  | Page surface and default text                         |
| `card` / `card-foreground`   | Raised content surface                                |
| `popover` / `*-foreground`   | Overlays (menus, popovers, tooltips)                  |
| `primary` / `*-foreground`   | Primary actions, active/brand emphasis                |
| `secondary` / `*-foreground` | Secondary surfaces/buttons                            |
| `muted` / `muted-foreground` | Subtle surfaces and secondary text                    |
| `accent` / `*-foreground`    | Hover/selected surfaces                               |
| `destructive` / `*-fg`       | Destructive **button/chip** surface + its foreground  |
| `destructive-text`           | Destructive **text & state borders** on page surfaces |
| `success` / `*-fg`           | Positive/confirmation status                          |
| `warning` / `*-fg`           | Caution status                                        |
| `warning-text`               | Caution **text** on page surfaces (e.g. status chips) |
| `info` / `*-fg`              | Informational status                                  |
| `border` / `input` / `ring`  | Lines, field borders, focus ring                      |
| `chart-1…5`                  | Categorical data-visualisation series                 |
| `sidebar*`                   | Navigation shell surface + states                     |

**Rules:** every solid-fill/foreground pair is validated to meet WCAG AA
(≥ 4.5:1 for text) in **both** themes — re-verify when editing any colour token.
A solid-surface token (e.g. `destructive`) is tuned for its light foreground and
is **not** guaranteed legible as text on the page; use its paired `*-text` token
(`destructive-text`) for coloured text and state borders on `background`/`card`,
which is validated to ≥ 4.5:1 (text) / ≥ 3:1 (border) in both themes.
Status is never conveyed by colour alone — always pair with an icon and/or text.

### Typography

- **Family:** `--font-sans` (Inter + system fallback); `--font-mono` for
  numeric/code contexts. Numeric columns (amounts, counts) may use tabular
  numerals.
- **Type scale** (Tailwind defaults; use these, don't invent sizes):

  | Token       | Size / line-height | Use                         |
  | ----------- | ------------------ | --------------------------- |
  | `text-xs`   | 0.75rem / 1rem     | Captions, meta              |
  | `text-sm`   | 0.875rem / 1.25rem | Secondary text, table cells |
  | `text-base` | 1rem / 1.5rem      | Body                        |
  | `text-lg`   | 1.125rem / 1.75rem | Lead text                   |
  | `text-xl`   | 1.25rem / 1.75rem  | Card titles                 |
  | `text-2xl`  | 1.5rem / 2rem      | Section headings            |
  | `text-3xl`  | 1.875rem / 2.25rem | Page titles                 |

- **Weights:** 400 body, 500 medium (labels/buttons), 600 semibold (headings).
  Avoid heavier weights except for display.
- **One `<h1>` per page**; heading levels never skip (a11y).

### Spacing scale

Tailwind's **4px base** (`0.25rem` per step): `1`=4px, `2`=8px, `3`=12px,
`4`=16px, `6`=24px, `8`=32px, `12`=48px, `16`=64px. Use scale steps only — no
arbitrary values. Standard rhythm: `4` within components, `6`–`8` between
groups, `8`–`12` between page sections.

### Sizing scale

Controls share a height scale for alignment: **sm 32px (`h-8`)**, **md 36px
(`h-9`, default)**, **lg 40px (`h-10`)**. Content width is capped with container
utilities (e.g. `max-w-screen-xl`) rather than fixed pixel widths.

### Border radius

Derived from one base (`--radius`, 0.625rem): `radius-sm`, `radius-md`,
`radius-lg`, `radius-xl`. Inputs/buttons use `md`; cards/dialogs use `lg`;
pills/avatars use `full`.

### Elevation (shadows)

A small, deliberate set — elevation signals layering, not decoration:

| Level | Token         | Use                        |
| ----- | ------------- | -------------------------- |
| 0     | `shadow-none` | Flush surfaces, table rows |
| 1     | `shadow-sm`   | Cards, subtle raise        |
| 2     | `shadow-md`   | Dropdowns, popovers        |
| 3     | `shadow-lg`   | Dialogs, sheets            |
| 4     | `shadow-xl`   | Transient emphasis (rare)  |

Prefer `border` + low elevation on light surfaces; avoid stacking heavy shadows.

### Motion — animations & transitions

- **Durations:** fast `150ms` (hover/press/colour), base `200ms` (most
  enter/exit), slow `300ms` (large surfaces: dialogs, sheets).
- **Easing:** `ease-out` for entrances, `ease-in` for exits, `ease-in-out` for
  moves. Standard Tailwind timing utilities.
- **Purposeful only:** motion communicates state/continuity, never decoration.
- **Reduced motion:** `prefers-reduced-motion` is honoured globally
  (`globals.css`) — animations collapse to near-instant.

### Iconography

- **Lucide** only, for a single consistent set. Default `size={16}` (inline) or
  `20` (standalone), `1.5`–`2px` stroke, `currentColor`.
- Interactive icons get an accessible name (`aria-label`) or adjacent text;
  decorative icons are `aria-hidden`. Never ship an icon-only control without a
  name.

### Breakpoints

Mobile-first Tailwind defaults: `sm 40rem` · `md 48rem` · `lg 64rem` ·
`xl 80rem` · `2xl 96rem`. Primary layout shift (sidebar ⇄ drawer) at `lg`.

### Dark & light mode

Both are first-class. Preference is light / dark / **system**; the `.dark` class
on `<html>` flips every token (theme management in
[`FRONTEND_ARCHITECTURE.md`](FRONTEND_ARCHITECTURE.md)). Components must look
correct in both — reviewers check both.

---

## Accessibility requirements (WCAG 2.2 AA — enforced)

- **Semantic HTML first**; ARIA only to fill genuine gaps.
- **Keyboard:** everything interactive is reachable and operable by keyboard,
  logical tab order, no traps (except intentional modal focus traps).
- **Visible focus:** a clear `ring` focus indicator on every focusable element;
  never remove outlines without an equivalent.
- **Focus management:** move focus on route change, dialog open/close; return
  focus to the trigger on close.
- **Contrast:** ≥ 4.5:1 body text, ≥ 3:1 large text and UI component boundaries.
- **Never colour alone** to convey meaning — pair with icon/text.
- **Forms:** programmatic label per control; errors linked via
  `aria-describedby` + `aria-invalid`; first invalid field focused on submit.
- **Targets:** ≥ 24×24px (prefer ≥ 44px on touch).
- **Motion:** honour reduced-motion. **Live regions** announce async updates
  (toasts, validation, loading completion).

Tooling: `eslint-plugin-jsx-a11y` (CI), automated a11y assertions in Playwright
journeys, and manual keyboard + screen-reader checks for significant UI. The
**Accessibility Reviewer** agent audits non-trivial UI.

---

## Component standards

Every component below is built **once** as a design-system primitive/composite
and reused. Each must ship: typed props, all interaction states
(default/hover/active/focus/disabled), light+dark correctness, keyboard +
screen-reader support, and a test. Detailed authoring rules are in
[`COMPONENT_LIBRARY.md`](COMPONENT_LIBRARY.md).

- **Buttons** — variants `primary | secondary | outline | ghost | destructive |
link`; sizes `sm | md | lg | icon`. Show pending state (spinner + disabled +
  `aria-busy`); icon buttons require `aria-label`. One primary action per view.
- **Forms & inputs** — label, optional description, error, and required
  indicator standardised via the `Form` primitive (ADR-0007). Consistent field
  heights (sizing scale); `aria-invalid` + linked error text; disabled/readonly
  styles defined once.
- **Tables (DataTable)** — one table component: sortable headers, pagination,
  row selection, sticky header, per-column alignment (numbers right-aligned,
  tabular numerals), loading (skeleton rows), empty, and error states. Semantic
  `<table>` markup with scoped headers. Responsive: horizontal scroll in a
  bordered container; never break the page layout.
- **Cards** — `card` surface, `radius-lg`, `shadow-sm`, standard padding;
  slots for header/title, content, footer/actions.
- **Navigation** — top-level via the sidebar; consistent active/hover states
  from tokens; current item marked `aria-current="page"`.
- **Sidebars** — persistent on `lg+`, collapsible to a drawer/sheet below;
  keyboard navigable; remembers collapsed state.
- **Dialogs / sheets** — the hand-rolled `Dialog`/`Sheet` primitives on the
  native `<dialog>` element (no Radix): focus trap, `Esc` to close, focus return,
  labelled by title, inert backdrop. Sheets for side panels; dialogs centered.
  Destructive confirmations use `ConfirmDialog` (`role="alertdialog"`), whose
  busy confirm button uses `aria-disabled` (not native `disabled`) so it keeps
  focus during the mutation.
- **Notifications (toasts)** — single toaster; variants
  `info | success | warning | error`; polite live region; auto-dismiss
  (persist errors); optional action; never the sole channel for critical info.
- **Badges** — status/label chips using status tokens; text/icon in addition to
  colour; sizes `sm | md`.
- **Breadcrumbs** — for depth ≥ 2; last item is current page (`aria-current`);
  collapse middle items on small screens.
- **Tabs** — Radix tabs; roving focus; arrow-key navigation; panels labelled by
  their tab. Don't use tabs to hide critical primary actions.
- **Menus (dropdown/context)** — the hand-rolled `Menu`/`MenuItem` primitive
  (`components/ui/menu.tsx`), WAI-ARIA APG "Menu Button" on semantic HTML (no
  Radix): portal-rendered and anchored to a trigger or pointer point, roving
  arrow-key focus, `Esc`/`Tab`/click-away dismissal, and focus-return to the
  trigger. Used for the Project Explorer row-actions (context) menu. A shared
  Command palette pattern for power users remains a future addition.
- **Pagination** — shared control paired with the DataTable; disabled
  prev/next at bounds; announces page changes; keyboard operable.
- **Search** — labelled input with a leading search icon, debounced, clearable;
  results expose loading/empty/error states; query reflected in URL search
  params where it drives a list.
- **Loading indicators** — Spinner (in-context) and progress (determinate work);
  buttons own their pending state. Prefer skeletons for content.
- **Empty states** — every list/table/dashboard has a designed empty state:
  icon, one-line explanation, and a primary action to move forward.
- **Skeletons** — mirror the final layout to prevent layout shift; used for
  first loads, not for quick refetches.
- **Charts** — one chart wrapper on a single library; use `chart-1…5` tokens in
  order; always provide axis labels, legend, accessible summary/table
  alternative, and empty/loading states. Follow the repo's dataviz guidance.
- **Dashboards** — a responsive grid of cards/KPIs/charts with consistent
  spacing and a clear scan order (most important top-left); each widget handles
  its own loading/empty/error state independently.

---

## Content & formatting

- Currency and dates via `Intl` APIs (locale-aware); money stored/handled as
  integer minor units (see [`API.md`](API.md)). No hard-coded currency symbols
  or date formats — i18n is on the [roadmap](ROADMAP.md).
- Microcopy: plain, concise, sentence case; consistent terminology; actionable
  error and empty-state text.

## Governance

- Changing a token changes the whole app — token edits require review and a note
  here. New component patterns are added to the design system, never inlined at
  a call site. The **UX Reviewer** and **Component Reviewer** agents enforce
  consistency and the no-one-off-styling rule.
