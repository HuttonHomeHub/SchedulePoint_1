# Design System

> The single source of truth for SchedulePoint's visual language and component
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
- **Primitives:** owned as source in `components/ui/`, in the
  [shadcn/ui](https://ui.shadcn.com) tradition — but **hand-rolled on semantic
  HTML and the WAI-ARIA APG patterns. There is no Radix dependency, and adding
  one is an ADR-level decision, not a convenience.** `Dialog`/`Sheet` sit on the
  native `<dialog>` element; `Menu`, `Combobox`, `Toolbar` and
  `SegmentedControl` implement their APG pattern directly. Variants via
  `class-variance-authority` + `cn()`.
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
| `border`                     | Decorative dividers/hairlines (1.4.11-exempt)         |
| `input`                      | **Control** boundaries — its own value, ≥ 3:1         |
| `ring`                       | Focus indicator                                       |
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
  | `text-3xl`  | 1.875rem / 2.25rem | _(unused — see below)_      |

> **`text-3xl` is declared and used by nothing** — zero call sites in `apps/web/src`, verified by
> search rather than by memory. Its row said "Page titles", which was wrong twice over: page titles
> come from the `PageHeader` archetype, which renders `text-2xl`. It is **kept rather than deleted**,
> because a type ramp is a designed sequence and a scale with a hole in it invites the next person to
> reach past the gap; an unused top step costs three custom properties. If a display context ever
> wants it, it is there and it is the right size.

- **Weights:** 400 body, 500 medium (labels/buttons), 600 semibold (headings).
  Avoid heavier weights except for display.
- **One `<h1>` per page**; heading levels never skip (a11y).

### Spacing scale

Tailwind's **4px base** (`0.25rem` per step): `1`=4px, `2`=8px, `3`=12px,
`4`=16px, `6`=24px, `8`=32px, `12`=48px, `16`=64px. Use scale steps only — no
arbitrary values. Standard rhythm: `4` within components, `6`–`8` between
groups, `8`–`12` between page sections.

### Sizing scale

Controls share a height scale for alignment: **sm 32px**, **md 36px (default)**, **lg 44px**.
Content width is capped with container utilities (e.g. `max-w-screen-xl`) rather than fixed pixel
widths.

The two common sizes are **tokens, not utilities** — `--control-h` (2.25rem) and `--control-h-sm`
(2rem), consumed as `h-(--control-h)` — so the scale is a theme decision that moves in one place
rather than a class each control remembers. `lg` is still the literal `h-11`, and `icon` is
`size-10`.

> **This said `h-8` / `h-9` / `h-10` and named 40px for `lg`.** All three were wrong after ADR-0097
> tokenised the scale and the product owner took the default from 40px to 36px: the utilities are
> gone from the two sizes that matter, and `lg` is 44px rather than 40. Corrected by reading
> `button.tsx` and `globals.css`, which is the only way a number like this is ever right.

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

#### The toolbar layout-mode ladder (ADR-0090)

A dense command row does **not** use the breakpoints above, and the difference is deliberate rather
than an oversight: those are **viewport** widths, and a toolbar's problem is the width of **its own
container** — a row inside a panel beside an open activity editor has a fraction of the viewport to
work with, and a viewport media query cannot see that. So the ladder is resolved from the measured
container via `resolveLayoutMode(width, current)`
(`apps/web/src/components/ui/toolbar/toolbar-registry.ts`):

| mode          | container ≥ | what changes                                  |
| ------------- | ----------- | --------------------------------------------- |
| `comfortable` | 1536 px     | labels where `showLabel: 'auto'` affords them |
| `compact`     | 1280 px     | tighter control padding, fewer labels         |
| `condensed`   | 1024 px     | icon-only for most groups                     |
| `collapsed`   | 0           | the minimum that still reaches every command  |

Two properties are load-bearing and easy to lose in a refactor:

- **Hysteresis is asymmetric.** A row narrows immediately but only widens after clearing the target
  rung's floor by `TOOLBAR_LAYOUT_HYSTERESIS_PX` (48 px), walking **one rung at a time**. Narrowing
  late clips controls; widening early makes a window-edge drag re-lay the row out on every pixel of
  hand tremor.
- **A preset is a command, not a derivation.** Resizing preserves the scale a user chose; it never
  re-derives it (ADR-0056).

Authoring rule: a control's `showLabel` is **presentation** and its `tier` is **priority**. Do not
conflate them — they were one property once, which meant a static per-item flag decided a question
that is really about the width available at render time (ADR-0031, TECH_DEBT #61).

### One theme

**There is one theme and no picker** (ADR-0097). It is declared at `:root`, no class is stamped on
`<html>`, and every stored preference — `dark`, `light`, `system`, or anything else — resolves to
"stamp nothing", which is what makes a flash of the wrong theme structurally impossible rather than
merely avoided.

> **This heading read "Dark & light mode — both are first-class. Preference is light / dark /
> **system**; the `.dark` class on `<html>` flips every token … reviewers check both" until
> 2026-08-19 — immediately above a section that opens "this is now the product's only theme".** Two
> answers on one page, and the wrong one first. Corrected rather than deleted, because the
> instruction it carried ("reviewers check both") was a real habit and a reader needs to know it has
> lapsed rather than to find it silently gone.

The mechanism that would carry a future dark theme is **kept live rather than deleted**:
`theme-boot.js` still runs and still has its test, `THEME_SELECTORS` is a one-element list, and
`Theme` stays a union. The cost of bringing dark back is a block of values and one entry — about 110
declarations, comparable to what `.dark` used to hold. What that does **not** buy is the judgement:
choosing those values is a week of design work, and a dark diagram whose colours carry meaning needs
its plot separations re-derived rather than re-tinted (`--plot-*`, ADR-0097 Landing E).

### The palette (Graphite)

**This is the product's only theme, and it is declared at `:root`** (ADR-0097) — no class is
stamped on `<html>`, and there is no picker. `apps/web/src/styles/globals.css` is the source of
truth for every value; this section is the **rule**, not a second copy of the values, because a
document restating numbers it does not own is how the previous version of this section came to be
wrong about all of them.

> **This section described the navy-and-amber palette until the 2026-08-20 reconciliation pass — a
> day after ADR-0099 replaced it.** It said "Navy chrome around a light working canvas", gave
> `--chrome` as navy `#14213D` and the page as off-white `#f8f9fa`, and closed with four verified
> ratios computed against those grounds. The live tokens are `--chrome: oklch(0.154 0.009 264.3)`
> and `--page-background: oklch(0.177 0.011 260.6)` — a dark graphite chrome around a dark graphite
> page. This is the governing document for colour: the one a next author opens before choosing one.
> Kept as a note rather than deleted, because the rules below survived the repalette and the reason
> they exist is the interesting part.

**One rule underneath it: _cool means interface, warm means attention._** Azure is the only
interactive colour, so anything blue is something you can press or have selected. Warm is reserved
for the schedule telling you something — critical, near-critical, conflict, today. A control that
borrows a warm hue and a bar that borrows the interactive one both break the same promise.

Two consequences worth stating, because both were learnt the expensive way:

1. **A pair is measured, not eyeballed.** ADR-0099 computed the palette before anything was drawn
   and two of the first choices failed: the critical / non-critical pair at **1.23:1** — the single
   most important distinction in the product, differing in hue and almost nothing else — and a white
   label on the critical fill at 3.77:1. Both are now separated on **lightness**, and the selection
   ring sits **outside** the bar because no one ring colour clears both fills.
2. **The diagram has its own family** (`--plot-*`, ADR-0097 Landing E), so the ordinary bar fill is
   not the page's primary button. A theme need never again recolour the canvas because it recoloured
   a control. The three bar states are separated by measurement and `token-contrast.test.ts` asserts
   it rather than a reader checking a swatch; the shape cue (solid outline critical, dashed
   near-critical) carries
   [WCAG 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color) regardless of hue.

Every pair that matters is asserted by `styles/token-contrast.test.ts` across the surface scopes
below. **Do not quote a ratio here** — quote the gate.

**The typeface is Space Grotesk** (ADR-0097), chosen from four candidates rendered on real product
chrome. The palette's source description named Roboto; a per-theme typeface was rejected on the
reasoning that it would shift layout and pull a second font at runtime for no accessibility or brand
gain colour does not already deliver — and with one theme the question no longer arises.

### Surface scopes (ADR-0055)

A **surface scope** answers "what does this token mean _here_". It exists because one product
carries regions whose grounds are genuinely different — when it was written, a navy chrome band
above an off-white page; under Graphite, a near-black rail and command band against a slightly
lighter graphite stage — so `--muted-foreground` cannot be one colour. The mechanism outlived the
palette that motivated it, which is the argument for it. The first attempt gave the header three bespoke tokens
and no muted grey, and every piece of secondary text in the chrome fell through to the page's grey:
invisible on navy, in six separate places.

> **This section used to explain scopes via the Corporate theme, which no longer exists.** ADR-0097
> collapsed the product to one theme, so a scope is now the only mechanism by which a token means
> two things — which makes it more load-bearing than when it was one of two. The old text also said
> "three scopes" and "a complete 17-token family" while a passage further down said five: two
> answers on one page, which is worse than either being wrong alone.

There are **six** scopes — the page plus five:

| Scope    | Where                            | Applied by                 |
| -------- | -------------------------------- | -------------------------- |
| _(page)_ | everything by default            | `:root` — nothing to apply |
| `chrome` | the top band                     | `<Surface tone="chrome">`  |
| `panel`  | the Project Explorer rail        | `<Surface tone="panel">`   |
| `brand`  | the public screens' navy panel   | `<Surface tone="brand">`   |
| `auth`   | the card that panel is joined to | `<Surface tone="auth">`    |
| `canvas` | the diagram, and the Gantt panel | `<Surface tone="canvas">`  |

`:root` declares a **complete family of 31 names** per scope: the 18-name base — fill, foreground,
muted (+ foreground), border, input, accent (+ foreground), primary (+ foreground), field
(+ foreground, + muted-foreground), destructive/success/warning/info **text**, and ring — plus the
**13 closure members** the status fills pull in (`destructive`, `secondary`, `success`, `warning`,
`info` and their foregrounds, and the three hover fills). A `[data-surface]` rule then rebinds the
ordinary semantic names to that family. Inside a scope, `bg-background` **is** the header's navy or
the diagram's ground, and `text-muted-foreground` **is** a grey validated against it — so no
descendant component changes at all, and none of them learn where they are.

**The count is an output, not a target.** `styles/token-architecture.test.ts` derives the family by
closure from what a compiled utility can composite, so "31" is what that computation currently
returns rather than a number anybody chose. Quoting it here is a convenience for the reader; the
gate is the authority, and it was 18 before the closure and will move again.

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

**There are six scopes, and the bar for a seventh is written down.** `chrome` (the app's top band),
`panel` (the navigator rail), the page (`:root`), `brand` (the public screens' navy panel) and
`auth` (the card beside it) since ADR-0077, and `canvas` (the diagram and the Gantt panel) since
ADR-0097 Landing E.

> This sentence said "five, and the bar for a sixth" and dated itself — _"this sentence becomes
> wrong the day it lands"_. It landed; the sentence is corrected rather than left for a reader to
> notice the caveat. **A seventh is a bigger commitment than the sixth was**: the bar (ADR-0077 §1,
> five conditions) has not changed, but a scope now costs 31 declarations rather than 18, thirteen
> of which need a derived value clearing its own pairs against that surface's fill.

Those last two were the odd ones, and **ADR-0097 changed why they exist without changing that they
do**. They were justified as **theme-invariant** — identical in Light, Dark and Corporate, because a
signed-out visitor cannot choose a theme and `theme-boot.js` chose one for them. There is now **one
theme**, so that argument distinguishes nothing and is dead.

They survive on a better reason they had all along: they are **designed differently from the page**,
and measurably. `auth` was proposed for retirement on the strength of the dead argument; measuring it
reversed the decision — 15 of its 18 tokens differ from their page counterparts and **12 differ
perceptibly**, led by a focus ring at Δ0.39 OKLCH that ADR-0077 M7 derived up from a failing 2.02:1
to clear WCAG 1.4.11. Retiring it would have discarded that derivation along with the field fill,
four status inks and the white card that separates the login from an off-white page. Two gates now
pin it (`token-architecture.test.ts`), so if a later change quietly aligns `auth` to the page it
really has become dead weight and can be retired deliberately — rather than left as 18 aliases that
look like a decision and are not one.

**Do not "fix" either to follow the theme.** The login is deliberately one fixed look.

A scope is a whole parallel vocabulary that every future value change must be applied to once more,
so **add one only when all five of ADR-0077 §1's conditions hold**. The load-bearing one: the
region's fill must be chosen for a reason the page's fill structurally cannot serve. If descendants
would have to know where they are, it is not a scope — it is a component with props.

**A scope cannot repaint a `Card`.** `--card` is deliberately not a rebound name, so a
component that needs a scope-coloured container builds one from `bg-background` rather than wrapping
`Card` — which is what `AuthShell` does. This is a feature: `Card` means the same thing everywhere.

**A field is not a surface.** `--field` / `--field-foreground` /
`--field-muted-foreground` are their own pair set, because an input inside the navy chrome
is white: its ink and its placeholder belong to the field's colour system, not the band's.

**A control boundary is not a divider.** `--input` and `--border` once shared a value, and
because `--field` is deliberately identical to the surface it sits on, that made a text
field's outline — the only thing saying a field is there — 1.26:1 in every theme. WCAG 1.4.11
exempts a decorative separator and does **not** exempt this, so `--input` is now its own
per-surface token held at ≥ 3:1 by `styles/token-contrast.test.ts`. Reach for `border-input`
on anything whose edge identifies a control (fields, `outline` buttons, an unfilled chip);
`border-border` is for dividers only.

**No raw colour literals in `className` or `style`.** A literal cannot follow a surface scope
and is invisible to `token-contrast.test.ts`, so a hard-coded `#666` looks right on the page
and disappears on navy with nothing in the build to say so. The lint rule lives in
`packages/config/eslint/react.js`. It covers `src/components/**`, `src/features/**` and — since
2026-08-06 (ADR-0077 M0-T3) — **`src/routes/**` and `src/app/**`, which is where every public,
signed-out screen lives**: until then a hard-coded navy on the brand panel itself would have
linted clean, on the one surface a stranger sees first. The Canvas 2D painter is exempt
(`fillStyle` takes a string, and `render/palette.ts` resolves tokens at runtime). A `mask-image`
alpha stop is a legitimate literal — the browser reads the gradient's alpha, so it is never
painted — and takes a scoped `eslint-disable-next-line` saying so, never a rewrite to `black`,
which would slip past the regex while changing nothing.

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

## Page archetypes (ADR-0097 Landing A)

Six components in `apps/web/src/components/ui/page/` decide, **once**, what every
screen's frame, heading, section, empty state, loading shape and row look like.
Before them the frame was hand-written **fourteen** times and the page heading
**sixteen** — fourteen and sixteen chances for one screen to be padded or ranked
differently from its neighbour, and no way to change the measure once.

| Archetype                     | Owns                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `PageContainer`               | the measure, centring and padding. Renders a `<div>`, **never a landmark** — the app shell already provides the single `<main>` |
| `PageHeader`                  | the page's one `<h1>`, its `aria-describedby` description, and the primary action                                               |
| `SectionCard`                 | a section's heading **rank** (`<h2>`), and a named `<section>` so each section is a `region` a screen-reader user can jump to   |
| `EmptyState`                  | what a screen or a section says when it holds nothing — two sizes, and the action is **optional**                               |
| `Skeleton`                    | the loading **material** only; each archetype owns its own loading **shape**                                                    |
| `ListRow` / `ListRowSkeleton` | one row's rhythm (`--row-h`), and the skeleton that matches it exactly                                                          |

**The authoring rule: reach for the archetype, or raise the requirement — never
invent a one-off.** A hand-rolled frame that happens to match today's archetype
looks identical on screen and drifts the first time either changes, which is a
defect nobody can see. A screen that needs something these do not offer wants a
seventh archetype, not a bespoke layout in a feature folder.

Two things `EmptyState` is deliberately **not** for. An action it cannot offer is
not a degenerate case: a Viewer who cannot act is told who can, and a required
`action` prop would force that into a lie. And a settled one-liner like "Nothing
needs you right now" is a **fact**, not an absence to be resolved — giving it an
icon and a frame dresses a good outcome as a problem.

## Component standards

Every component below is built **once** as a design-system primitive/composite
and reused. Each must ship: typed props, all interaction states
(default/hover/active/focus/disabled), light+dark correctness, keyboard +
screen-reader support, and a test. Detailed authoring rules are in
[`COMPONENT_LIBRARY.md`](COMPONENT_LIBRARY.md).

Entries marked **_(not built)_** are the standard for that pattern **when we
first need it** — no such primitive exists in `components/ui/` today. Don't cite
one as though it were available; build it to the entry, then drop the marker.
`ls apps/web/src/components/ui/` is the authoritative inventory.

- **Buttons** — variants `primary | secondary | outline | ghost | destructive |
link`; sizes `sm | md | lg | icon`; icon buttons require `aria-label`. One
  primary action per view.
  **A control that blocks itself during its own mutation uses `aria-disabled`
  plus a submit/click guard — never the native `disabled` attribute.** A native
  disabled control is removed from the tab order the instant the request starts
  and put back when it settles, so a keyboard user is thrown to `<body>` and
  returned twice per action; the guard is what actually prevents the double
  submit. This has now been re-learnt at ADR-0060 M6, ADR-0063 M6 and ADR-0074
  M2 (`TECH_DEBT` #17a) — it is a rule, not a judgement call. Native `disabled`
  remains correct for a control that is **statically** unavailable (no
  permission, nothing selected), where nothing flips underneath the user.
  **This clause is narrowed for _fields_ — see "Forms & inputs" below, and read
  the two together.** ADR-0083 D2 corrects it twice: "no permission" is not
  static (the ADR-0028 pen can be taken by a peer mid-session, so the clause
  names as its example the one case that disproves it), and static-versus-
  flipping is the wrong axis for a field anyway. It is the right axis for a
  button, whose only loss on being disabled is operability. **The button ruling
  above is untouched and correct.**
- **Forms & inputs** — label, optional description, error, and required
  indicator standardised via the `Form` primitive (ADR-0007). Consistent field
  heights (sizing scale); `aria-invalid` + linked error text.

  **A gated field is read-only, not disabled** (ADR-0083). A field's loss on
  being disabled is not operability but **readability**: the value leaves the
  tab order, cannot be copied, and — until this rule — was exempt from the
  contrast floor, so "you may not edit this" was implemented as "you may not
  read this either". Native `disabled` keeps exactly **two** jobs on a field:
  the options have not loaded, and a field above this one has not been answered.
  Both hold no value, and both resolve by the reader's own next action.
  Everything else — permission, pen, in-flight save, domain rule — is a `gate`.

  | Control                              | Gated treatment                                                                                             |
  | ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
  | Text-ish `input`, `textarea`         | `readOnly`. **No `aria-disabled`** — the field _is_ operable, and saying otherwise is a false announcement. |
  | `checkbox`                           | `aria-disabled` + `preventDefault()` on `click`. Stays in the tab order.                                    |
  | Native `select`                      | Native `disabled` — a named exception: there is no read-only `<select>`.                                    |
  | `Combobox`                           | `readOnly` on its text input, `aria-disabled` on its toggle, listbox refuses to open.                       |
  | `Button` / `MenuItem` / toolbar item | Unchanged — `aria-disabled` + guard (above, and ADR-0082).                                                  |

  The discriminator, so the next control is not a judgement call: **a control
  whose only operation is to change its value takes `aria-disabled` plus a guard
  on the one event that changes it; a control with operations beyond changing
  its value — caret placement, selection, copy — takes `readOnly`, because that
  removes mutation and keeps the rest.**

  **How.** Wrap the group in `FieldGateProvider gate={…}` (`components/ui/field-gate.tsx`)
  and pass **nothing** to the fields: the reason renders once, above them, and
  every field inside describes itself with that node. A field needing its own
  sentence passes `gate={…}` (nearest reason wins); a field that must stay live
  inside a read-only region passes `gate={null}`.

  **Shade what has something to read; omit what does not.** An edit form shades
  its fields, all of them, plus the Save. A **create** form — whose fields are
  empty by definition — collapses to its heading plus the reason, because a row
  of blank shaded controls is neither readable nor fillable.

  **There is no gated fill.** The draft proposed moving the fill to `--muted`
  and the computed contrast matrix refused it; a follow-up probe showed the
  failure is structural rather than `--muted`'s (ADR-0083 §"RESOLVED"). The state
  is carried by a **lock glyph** beside the label and by the visible reason —
  a shape and a sentence, neither of them colour (WCAG 1.4.1).

  `field-gate.structural.test.ts` enforces this: no governed control may take a
  `disabled` whose expression mentions `writable`, `canWrite`, `holdsPen`,
  `gate`, `gating`, `isPending` or `readOnly`. The rule needs the gate because
  the rule alone is what the codebase already had — 38 call sites each deciding
  independently — and the API alone is what ADR-0082 and ADR-0064 both record
  failing: a correct pattern applied to one control and not its neighbour.

- **Tables (DataTable)** — one table component owning the four **states** every resource list
  needs: loading (a labelled spinner), error with retry, empty (the caller supplies the icon, copy
  and optional action), and populated. Semantic `<table>` markup with scoped headers, an optional
  per-row detail `<tr>` (`renderDetail`), and a focusable scroll region that can be
  `aria-describedby`-linked to prose qualifying what the rows mean. Responsive: horizontal scroll in
  a bordered container; never break the page layout.

  > **This entry claimed five features the component does not have** — sortable headers, pagination,
  > row selection, a sticky header and per-column alignment — and was corrected by reading
  > `components/ui/data-table.tsx` rather than by trusting it. Consumers that sort or select do it
  > themselves today. That is not a to-do list: a shared primitive earns each of those when a second
  > consumer needs it, and writing them down as though they exist is how a reader plans around a
  > capability that isn't there. Loading is a **spinner**, not skeleton rows.

- **Cards** — `card` surface, `radius-lg`, `shadow-sm`, standard padding;
  slots for header/title, content, footer/actions.
- **Navigation** — top-level via the Project Explorer rail (a hand-rolled ARIA
  `tree`, ADR-0029); consistent active/hover states from tokens; current item
  marked `aria-current="page"`.
- **The rail** — persistent on `lg+` (64rem), collapsible to a drawer below;
  keyboard navigable; resizable via the shared `PanelResizer`; remembers its
  collapsed and sized state.
- **Dialogs / sheets** — the hand-rolled `Dialog`/`Sheet` primitives on the
  native `<dialog>` element (no Radix): focus trap, `Esc` to close, focus return,
  labelled by title, inert backdrop. Sheets for side panels; dialogs centered.
  Destructive confirmations use `ConfirmDialog` (`role="alertdialog"`), whose
  busy confirm button uses `aria-disabled` (not native `disabled`) so it keeps
  focus during the mutation.
- **Alerts** — `components/ui/alert.tsx`, tones `error | success | info`. The one
  treatment a message about what just happened gets: a 4px left accent bar, a
  low-opacity tint of the same hue, a leading icon. Geometry taken from the
  previous Flask app (`static/css/auth.css:99-136`); colours are the
  `--*-text` tokens, never that app's hex values, because a literal cannot follow
  a surface scope and is invisible to `token-contrast.test.ts`.
  **The live-region role is derived from the tone and is not a prop** —
  `role="alert"` for an error (it interrupts a task in progress),
  `role="status"` for success and info (they report something finished). Making
  it a prop would let two call sites answer the same question differently.
  **The authoring rule that goes with it: _a field's problem belongs to the
  field; the alert belongs to the form_.** Field validation renders inline under
  its control and nowhere else; server and form-level facts get the alert. Never
  both — stating one problem twice was live on all five auth forms until
  ADR-0077 §9. Where several fields fail at once, `FormProblemCount` shows a
  **count** (never the messages again), and only from two problems up: React Hook
  Form already moves focus to the first invalid field, which is the case WCAG
  4.1.3 exempts.
- **Notifications (toasts)** — **_(not built)_**. Today, feedback is inline and
  in place: the mutating control owns its pending/error state, and asynchronous
  results are announced through the shared `Announcer` live region. When a
  toaster is introduced: a single toaster; variants
  `info | success | warning | error`; polite live region; auto-dismiss (persist
  errors); optional action; never the sole channel for critical info.
- **Badges** — status/label chips using status tokens; text/icon in addition to
  colour; sizes `sm | md`.
- **Breadcrumbs** — for depth ≥ 2; last item is current page (`aria-current`);
  collapse middle items on small screens.
- **Tabs** — **_(not built)_**. The app has deliberately avoided tabs so far:
  the workspace uses `SegmentedControl` for a mutually-exclusive pane choice and
  the toolbar's grouped rows for command surfacing. If a genuine tab pattern is
  needed, hand-roll the APG `tablist` (roving focus, arrow-key navigation,
  panels labelled by their tab) — do not reach for a component library. Never
  use tabs to hide critical primary actions.
- **Surface scopes** — `Surface` (`components/ui/surface.tsx`) marks a region as `chrome`
  (the top band) or `panel` (the Project Explorer). Inside a scope the ordinary semantic
  names resolve to that surface's own validated family, so descendants need no change. A
  scope is a component, not a class — the families have no Tailwind utilities, so `bg-chrome`
  does not compile. See "Surface scopes (ADR-0055)" above.
- **Segmented control** — `SegmentedControl` (`components/ui/segmented-control.tsx`), the APG
  `radiogroup`: a **mutually-exclusive** choice from a known set (Diagram _or_ Activities),
  roving tabindex, Arrow/Home/End, focus follows selection.
- **Toggle chip** — `ToggleChip` (`components/ui/toggle-chip.tsx`), an `aria-pressed` button for
  an **independent boolean** ("also show this"). Pressed state changes fill **and** border, never
  hue alone. Pair it with an announced result count — a chip that filters silently is a WCAG 4.1.3
  miss. Choosing between this and a segmented control is semantic, not visual: see
  [`COMPONENT_LIBRARY.md`](COMPONENT_LIBRARY.md).
- **Account chip** — `AccountChip` (`components/layout/account-chip.tsx`), the initials avatar +
  caret opening the account menu (theme radio group, signed-in email, sign out). The caret is
  required, not decoration: a bare circle of initials is indistinguishable from an avatar.
- **Menus (dropdown/context)** — the hand-rolled `Menu`/`MenuItem` primitive
  (`components/ui/menu.tsx`), WAI-ARIA APG "Menu Button" on semantic HTML (no
  Radix): portal-rendered and anchored to a trigger or pointer point, roving
  arrow-key focus, `Esc`/`Tab`/click-away dismissal, and focus-return to the
  trigger. Used for the Project Explorer row-actions (context) menu. A shared
  Command palette pattern for power users remains a future addition.
  **A menu item that is unavailable is shaded, not hidden — and stays an
  arrow-key stop** (`aria-disabled`, `disabledReason` linked by
  `aria-describedby`, ADR-0082). This is the one place the "native `disabled` is
  fine when nothing flips underneath the user" clause above does **not** extend
  to: the APG's _Developing a Keyboard Interface_ practice names "Menu items in a
  Menu or menu bar" among the controls to keep focusable when disabled, because a
  reason a keyboard user cannot reach is not a reason. **Omit** an item only when
  it does not apply to the object (Dissolve on a non-summary), when its flag is
  off, or when there is nothing to show at all; **shade with a reason** when it is
  shut by a state the reader can change (the ADR-0028 pen) or by their role. When
  every item would be shaded, render **no trigger** rather than a menu of
  refusals. See [`COMPONENT_LIBRARY.md`](COMPONENT_LIBRARY.md) for the contract.
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
- **Pagination** — **_(no shared control)_**. The API paginates by **cursor**,
  so screens surface a keyboard-reachable "Load more" as the last row in the
  arrow-key sequence rather than numbered pages, and announce the settled result
  count. A shared control only makes sense if offset paging is ever introduced.
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
- **Skeletons** — **_(no shared primitive)_**. The standard stands — mirror the
  final layout to prevent layout shift, first loads only, not quick refetches —
  but each screen currently hand-writes its own. Extract a primitive the third
  time it is written, not the first.
- **Charts** — **_(not built; no chart library is a dependency)_**. The two
  graphical surfaces in the app — the TSLD canvas and the resource demand strip
  — are hand-drawn Canvas 2D, which is why no charting dependency exists. If a
  conventional chart is ever needed: one wrapper on one library; `chart-1…5`
  tokens in order; always axis labels, legend, an accessible summary/table
  alternative, and empty/loading states. Adding the library is an ADR-level
  decision (bundle cost, ADR-0026's draw budget).
- **Dashboards** — **_(not built)_**. When one lands: a responsive grid of
  cards/KPIs with consistent spacing and a clear scan order (most important
  top-left); each widget handles its own loading/empty/error state
  independently.
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
- **TSLD Today pill (`VITE_CANVAS_TIME_AXIS`, tsld-toolbar-canvas-refinements F6b, ADR-0056)** — one
  new token, `--color-destructive-foreground` reused as `todayInk` (no new CSS variable — every
  theme already defines it for its destructive-hue text), added to both palette resolvers as the
  pill's label colour against the existing `palette.today` (destructive-hue) fill. The pill
  deliberately mirrors the ADR-0054 cursor date chip's geometry (`TODAY_CHIP_TOP` sits 4px below
  the cursor chip's own footprint, `TODAY_CHIP_H` matches `CURSOR_CHIP_H`) but stays in the **Today
  hue**, never the cursor's neutral chip colour — the two chips can never collide (different rows)
  and are never mistaken for each other (different hue). It draws only alongside the fractional
  line (`scene.todayFraction` present, from `todayDayFraction`/`useNow`), never on the flag-off
  midnight-boundary line, so the flag-off canvas gains no new draw calls.
- **TSLD time-axis gridline tiers (`VITE_CANVAS_TIME_AXIS`, tsld-toolbar-canvas-refinements F5)** —
  three new tokens, `--canvas-grid-day` / `--canvas-grid-month` / `--canvas-grid-year`, authored per
  theme block beside `--canvas` / `--canvas-band` (mapped in `@theme inline` as
  `--color-canvas-grid-*`) and added to **both** `resolveTsldPalette` and `resolvePrintPalette` (the
  painter palette contract is total). Day is a step **lighter** than `--border`, month sits
  approximately **at** `--border`, year is a step **stronger** — two cues (weight _and_ colour), so
  the day → month → year hierarchy survives monochrome print and colour-blind reading. The existing
  `gridLine` field (`--color-border`) is kept unchanged as the flag-off value.
- **TSLD non-working hatch (`VITE_CANVAS_TIME_AXIS`, tsld-toolbar-canvas-refinements F7a,
  ADR-0056)** — one new token, `--canvas-nonworking-hatch`, authored per theme block beside
  `--canvas-band` (mapped as `--color-canvas-nonworking-hatch`) and added to both palette
  resolvers. A step **stronger** than the `--color-muted` wash it draws over, so a weekend/holiday
  differs from the month band by **kind** (a diagonal `CanvasPattern` stripe), not just a darker
  shade of grey. Reuses the ADR-0054 float-tail hatch's 6px rhythm — one hatch language, not two.
  Guarded: an offscreen 2D context that can't be created (older browsers, minimal test contexts)
  falls back to the existing flat fill, so the `fillRect` count never changes either way. The
  month-band ground (ADR-0055 §4) gains its own `View▾ → Structure → Month bands` switch in the
  same milestone — `VITE_CANVAS_VISUAL_LANGUAGE` stays the gate and default; the switch only lets
  a user turn an existing layer off for the session.
- **TSLD marker channels & the data-date line (`VITE_CANVAS_DATA_DATE`, canvas status & feedback
  M1; proposes ADR-0078)** — the canvas's full-height and near-full-height marks each own a
  **channel** (shape + weight + hue), decided as one vocabulary rather than per-mark, because
  ADR-0056 already had to reason about the dash channel in the absence of such a record. The table
  is the constraint the next canvas mark must obey:

  | Mark                            | Channel                             | Rationale                                                                     |
  | ------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
  | Gridline tiers (day/month/year) | solid, hairline, border-family hues | Structure. Never dashed (ADR-0056).                                           |
  | **Data date**                   | **solid, 2 px, foreground**         | The schedule's own pivot — a fact of the programme, permanent, authoritative. |
  | Today                           | dashed, 1.5 px, destructive         | Wall-clock now: a _moving_ cue, and the dash says so.                         |
  | Cursor guideline (ADR-0054)     | dashed, ring hue, transient         | Follows the pointer; exists only during a gesture.                            |

  Shape (solid vs dashed) and weight distinguish the data date from Today **without relying on
  hue** — that is what makes the pair WCAG 1.4.1-safe rather than merely pretty. The palette pair
  is `dataDate`/`dataDateInk`, resolved from `--color-foreground`/`--color-background` in **both**
  `resolveTsldPalette` and `resolvePrintPalette` (the painter palette contract is total; pinned in
  `palette.test.ts`). `--color-info` — P6's blue, the semantically obvious pick — was measured and
  **rejected**: in all three shipped themes it is a near neighbour of `--color-primary`, the
  on-schedule bar fill, and a "distinct" line in the bar hue on a diagram whose entire content is
  bars is not distinct. The foreground token's one collision is the 1.5 px critical-bar outline —
  a bar-shaped stroke, not a full-height rule — noted and accepted. **The coincidence rule:** when
  the data-date and Today rules round to the same screen pixel, exactly one line draws (the
  data-date treatment) with one merged `Data date · today` pill — two coincident lines are a
  rendering artefact, not two facts. Each pill has its own **derived** row constant
  (`DATA_DATE_CHIP_TOP = TODAY_CHIP_TOP + TODAY_CHIP_H + 4`), never a literal, so the clamped
  pills can never overlap.

---

## Form layout (ADR-0061)

**A dialog body is never a bare list of fields.** For eighteen dialogs it was exactly that — one
`flex flex-col gap-4` around one field or around nine — so the structure said nothing about which
fields belonged together or which mattered. The vocabulary that replaces it lives in
`components/ui/form-layout.tsx` and is the only sanctioned way to lay a form out.

**`FormSection`** — a named group of related fields.

- The title is what the group **is**, in a planner's words: `Constraints`, `Availability`,
  `Cost & earned value`. Never `Section 2`, never `Other`.
- `description` is one sentence on what the group **does**, when the title can't carry it alone. It
  is linked with `aria-describedby`, so it is announced with the group.
- `aside` is a status for the group as a whole — `None set`, `Priority 500`, `3 on this activity`.
  This is what lets a reader skip a section honestly.
- Sections separate themselves. **Never hand-place a `border-t` between them**, and keep them as
  **consecutive siblings** — an error summary or a banner belongs outside their wrapper, because the
  first section drops its rule via `:first-child`.
- It renders `role="group"` + a real `<h3>`, not `<fieldset>`/`<legend>`. A `<legend>` only captions
  its fieldset as the first child (so no status can sit beside it), and a fieldset's
  `min-width: min-content` overflows a narrow dialog. Do not "fix" this back to a fieldset.

**`FieldGrid`** — two columns **only when two controls are one decision**: a constraint and its
date, a lag and the calendar counting it, a resource and its units. Two unrelated fields side by
side is worse than stacking them.

- `columns="lead"` weights the first column ~4:3, for a wide chooser governing a narrow value.
- Wrap a full-width child (a textarea, a save bar) in `FieldGridFull` — never hand-write
  `col-span-2`.
- Wrap the body once in `FieldGridContainer`. The grid is a **container query**, not a breakpoint:
  a dialog's width comes from its size preset, not from the viewport, so `sm:` would give a 448px
  dialog and an 896px dialog the same answer.

**`ContextStrip`** — the read-only facts an edit is _about_, kept on screen while it is made (the
activity editor's computed dates and float). Read-only by contract: **no interactive children,
ever**. The moment a fact becomes editable it is a field and belongs in a `FormSection`. When the
facts don't exist yet, render **nothing** — a row of em dashes reads as breakage, not as
"not computed yet".

**Dialog sizes.** `md` (448px) is a simple record form. `lg` (672px) is a dense one or a list. `xl`
(896px) is **for the two-pane rail layout only** — widening a single-column form to 896px produces
900px-long input rows, which is worse than the 448px it came from. `body="flush"` goes with `xl`: it
pads only the header, caps the height, and lets the pane own the scroll.

**Which shape a dialog takes:**

| Archetype                                       | Layout                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| Simple record (≤ ~4 fields)                     | No sections. `md`. Leave it alone.                                                   |
| Dense record                                    | 2–3 `FormSection`s, `FieldGrid` for pairs. `lg`.                                     |
| Multi-scope editor (today: the activity editor) | Vertical `Tabs` rail + pane, `xl` + `body="flush"`.                                  |
| List / manage                                   | What exists **first**, then a `New …` section below it — inline, never a sub-dialog. |
| Process / wizard                                | Numbered sections; every step present, carrying its own empty/pending/result state.  |
| Confirm / reference                             | Untouched.                                                                           |

**A create form never opens a dialog from inside a dialog.** The Logic panel's **Add a link** and
the Resources panel's **Assign a resource** are sections below the list they add to. A modal over a
modal buries the surface's main action behind a detour, and the new row appearing in the list above
is better feedback than a dialog closing over one. A control the current member cannot use is
**shaded with its reason** (`ScopeSaveBar`) rather than hidden — but only when the host can say
what the reason actually is; a fused permission boolean cannot, and an invented sentence is worse
than none. The same rule governs the **whole section**: shown-and-shaded when there is a reason to
give, hidden when there is not — a Viewer who can never add a link should not meet the form at all.
Hiding it from someone who normally _may_ write, such as a Planner who has not taken the pen, is the
lit-but-inert dead end inverted and reads as breakage rather than as a rule (ADR-0062).

**Labels never say `(optional)`.** It was on eleven of twenty-two labels in one dialog, which is
enough that it stopped meaning anything. Where optionality matters, the section description or the
field hint says so in a sentence.

---

## Content & formatting

- Currency and dates via `Intl` APIs (locale-aware); money stored/handled as
  integer minor units (see [`API.md`](API.md)). No hard-coded currency symbols
  or date formats — i18n is on the [roadmap](ROADMAP.md).
- Microcopy: plain, concise, sentence case; consistent terminology; actionable
  error and empty-state text.

### The `…` convention on control labels (ADR-0091)

An ellipsis means **activating this opens something that needs more input before anything happens** —
`Schedule settings…`, `Report progress…`. It is a promise that nothing is about to change yet.

A control that already renders a **disclosure caret** does not take one. The caret has said it, and
saying it twice is noise on a dense row. So `Go to date` is correct without an ellipsis: it is a
`ToolbarPopover`, and that primitive always renders a `ChevronDown`.

This was raised as an inconsistency and audited before anything was edited; under the rule that
actually applies, **the set was already consistent**, so the audit's outcome was to write the rule
down rather than change a label. `ellipsis-convention.structural.test.ts` gates the half a machine
can see — a disclosure item must never carry the character — and says in its own docblock that the
converse is a review question, not something the gate covers.

## Governance

- Changing a token changes the whole app — token edits require review and a note
  here. New component patterns are added to the design system, never inlined at
  a call site. The **UX Reviewer** and **Component Reviewer** agents enforce
  consistency and the no-one-off-styling rule.
