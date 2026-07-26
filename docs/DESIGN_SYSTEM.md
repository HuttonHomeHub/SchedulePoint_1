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

### Corporate theme (navy + amber)

A fourth picker entry, and a different _kind_ of thing from the three above: light,
dark and system are colour **schemes**; Corporate is a **brand skin** — navy chrome
around a light working canvas — that resolves as a light scheme. It is applied by a
`.corporate` class on `<html>`, a sibling of `.dark`; exactly one theme class is ever
stamped, and light stamps none (it is the `:root` baseline).

| Role                    | Colour                 | Token                                            |
| ----------------------- | ---------------------- | ------------------------------------------------ |
| Chrome (top bar, rail)  | Navy `#14213D`         | `--chrome`, `--panel` (see Surface scopes below) |
| Primary action (page)   | Navy `#14213D`         | `--primary` (ink: off-white)                     |
| Primary action (chrome) | Amber `#fca311`        | `--chrome-primary` (ink: navy, 7.9:1)            |
| Secondary surface       | Lighter navy `#1f3661` | `--secondary`, `--info`, `--accent` on chrome    |
| Page background         | Off-white `#f8f9fa`    | `--background`                                   |
| Body text               | `#333`                 | `--foreground`                                   |

Two rules make the palette work rather than merely look right on a swatch sheet:

1. **Amber is a fill on navy, never a fill on the page and never ink or a line on a light
   surface.** `#fca311` on `#f8f9fa` is **1.9:1** — it fails the 4.5:1 text bar, the 3:1
   non-text bar, and (the case that is easy to miss) the 3:1
   [1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast) bar a solid
   button's fill must clear against the page behind it. Darkening amber far enough to reach
   3:1 lands on the bronze `--warning` already uses. So on the page the primary action is
   the brand **navy** (12:1), and amber is the primary on the navy chrome, where it carries
   navy ink at **7.9:1**. Same rule for focus: the ring is navy on light surfaces (`--ring`)
   and amber on chrome (`--chrome-ring`, 7.9:1).
2. **Near-critical moved to bronze.** `--warning` is the TSLD's near-critical bar fill,
   and in light/dark it is essentially this same amber. With amber promoted to `--primary`
   (which is the ordinary bar fill), a normal bar and a near-critical bar would have been
   the same colour. Corporate shifts `--warning` to a deeper bronze so the canvas keeps
   three readable states — normal / near-critical / critical — on top of the dashed-outline
   shape cue that carries [WCAG 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color)
   regardless of hue.

Verified pairings (sRGB, WCAG 2.x): navy chrome / white text **16:1**; body `#333` on
off-white **12:1**; amber fill / navy ink **7.9:1**; destructive `#b91c1c` on off-white
**6.1:1**.

**The type scale is unchanged.** The palette's source description named Roboto; swapping
the typeface per theme would shift layout and pull a second font at runtime for no
accessibility or brand gain that colour doesn't already deliver. Corporate is a colour
theme.

### Surface scopes (ADR-0055)

A **theme** answers "what does this product look like". A **surface scope** answers "what
does this token mean _here_". Corporate is why the second question exists: its chrome is
navy while its page is off-white, so `--muted-foreground` cannot be one colour. The first
attempt gave the header three bespoke tokens and no muted grey, and every piece of secondary
text in the chrome fell back to the page's grey — invisible on navy, in six separate places.

There are three scopes:

| Scope    | Where                     | Applied by                 |
| -------- | ------------------------- | -------------------------- |
| _(page)_ | everything by default     | `:root` — nothing to apply |
| `chrome` | the top band              | `<Surface tone="chrome">`  |
| `panel`  | the Project Explorer rail | `<Surface tone="panel">`   |

Each theme block declares a **complete 15-token family** per scope — fill, foreground,
muted-foreground, border, accent (+ foreground), primary (+ foreground), field (+ foreground

- muted-foreground), destructive/warning/info text, and ring. A `[data-surface]` rule then
  rebinds the ordinary semantic names to that family. Inside a scope, `bg-background` **is**
  the header's navy and `text-muted-foreground` **is** a grey validated against it — so no
  descendant component changes at all, and none of them learn where they are.

Three rules keep this honest:

- **A family is complete or it is a trap.** A missing token silently falls through to the
  page's value, which is the original bug. `styles/token-architecture.test.ts` fails, naming
  the missing token.
- **The families have no Tailwind utilities.** `--chrome-*` and `--panel-*` are deliberately
  absent from `@theme inline`, so `bg-chrome` does not compile. `<Surface>` is the only route
  in, pinned by `components/ui/surface-seams.structural.test.ts`.
- **`@theme inline` is load-bearing.** `inline` is what makes utilities compile to
  `var(--token)` rather than a value resolved once at `:root`. Drop it and every scope
  silently stops working, with no error and a diff that looks like a tidy-up. Pinned by test.

**A field is not a surface.** `--field` / `--field-foreground` /
`--field-muted-foreground` are their own pair set, because an input inside the navy chrome
is white: its ink and its placeholder belong to the field's colour system, not the band's.

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
- **Comboboxes (pickers)** — the hand-rolled `Combobox` primitive
  (`components/ui/combobox.tsx`), WAI-ARIA APG "Combobox with List Autocomplete"
  on semantic HTML (no Radix): type-ahead filtering, `aria-activedescendant`
  keyboard operation, grouped options, trailing state/tier badges folded into the
  accessible name, tree indentation, a keyboard-operable "Load more" page (a real
  option at the end of the arrow-key sequence, not a pointer-only button), and an
  announced result count. Fully controlled and non-fetching — the consumer owns
  the query, the debounce and the paging. Use it wherever a native `<select>`
  would truncate or hide a large library; keep `<select>` for short, fixed option
  sets. See [`COMPONENT_LIBRARY.md`](COMPONENT_LIBRARY.md) for the usage contract.
- **Pagination** — shared control paired with the DataTable; disabled
  prev/next at bounds; announces page changes; keyboard operable.
- **Search** — the `SearchField` primitive (`components/ui/search-field.tsx`):
  a labelled input with a leading Lucide search icon and a real, keyboard-operable
  clear button (the native `type="search"` ✕ is Chromium-only and mouse-only, so it
  is suppressed). Debounce, loading/empty/error states and the query's home in URL
  search params belong to the consuming screen — see
  [`COMPONENT_LIBRARY.md`](COMPONENT_LIBRARY.md).
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
- **TSLD canvas text (labels)** — the Canvas 2D painter resolves its label
  colours from existing semantic tokens (no new CSS variables): text **inside** a
  bar uses that fill's paired `*-foreground` token (`--color-primary-foreground`
  over the on-schedule fill, `--color-destructive-foreground` over critical,
  `--color-warning-foreground` over near-critical) so it meets contrast in both
  themes; text **beside** a bar uses `--color-foreground` over the canvas ground.
  When adding on-canvas text, always pair it with the fill's `*-foreground` token
  rather than picking a raw colour, and keep the identity consistent with the
  activity's accessible name (one shared builder — WCAG 2.5.3).
- **TSLD canvas bar refresh (ADR-0052 M4)** — the refreshed bar layer adds only
  two palette entries, both existing tokens: `--color-border` as the calm
  hairline bar-definition stroke and `--color-muted-foreground` as the idle
  hover ring (distinct from the `--color-ring` selection). Everything else
  derives: the in-bar **progress band + front divider** draw in the bar's
  paired `*-foreground` label ink (or the Colour-by `barInk` override), and the
  LOE-bracket / WBS-summary glyph caps draw in the bar's own resolved fill —
  so the colour-mode lenses recolour whole glyphs and no one-off colour ever
  enters the canvas. Canvas palettes resolve once per theme bump
  (`use-theme-version.ts`), never per frame.
- **TSLD canvas link refresh (ADR-0052 M5)** — the refreshed link layer adds
  **no** palette entries: rounded elbows, fan-out and the dashed lag-run
  depiction restyle shape only (the run strokes in the existing
  `--color-muted-foreground` edge colour), and the incident-link
  hover/selection highlight reuses the `--color-ring` selection colour at the
  next line-weight step up, keeping each pass's dash state — the highlight and
  the driving cue are weight + dash changes, never colour alone.

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
