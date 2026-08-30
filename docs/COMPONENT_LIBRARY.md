# Component Library Guidelines

> How we build, name, document, and test reusable components. Complements
> [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) (what things look like) and
> [`FRONTEND_ARCHITECTURE.md`](FRONTEND_ARCHITECTURE.md) (where they live).

## The five qualities

Every reusable component must be:

- **Composable** — built from smaller primitives; exposes composition
  (children/slots) over configuration flags. Prefer `<Card><Card.Header/>…`
  patterns to a dozen boolean props.
- **Documented** — typed props with TSDoc, and (for primitives) a usage example.
- **Testable** — behaviour verifiable via Testing Library queries by role/label.
- **Accessible** — keyboard + screen-reader support and correct semantics
  built in, not bolted on.
- **Reusable** — no business logic, no feature-specific assumptions, no
  hard-coded copy. Content comes via props/children.

## Component tiers

| Tier                   | Location                                    | Contains                                                     | May depend on                         |
| ---------------------- | ------------------------------------------- | ------------------------------------------------------------ | ------------------------------------- |
| **Primitive**          | `components/ui/`                            | Design-system building blocks (Button, Input, Dialog, Sheet) | tokens, native `<dialog>`, `cn()`     |
| **Composite / layout** | `components/layout/`, feature `components/` | Assemblies (PageHeader, DataTable, BillCard)                 | primitives                            |
| **Route/page**         | `routes/`                                   | Screen composition + data                                    | composites, primitives, feature hooks |

Dependencies point **down** the tiers only. Primitives never import feature code.

## Naming conventions

- **Files & components:** `PascalCase` (`DataTable.tsx` exports `DataTable`).
  One primary component per file; co-locate tightly-coupled subcomponents.
- **Hooks:** `useCamelCase` (`useMediaQuery`), in `hooks/` (shared) or a
  feature's `hooks/`.
- **Types/interfaces:** `PascalCase`; a component's props are `‹Name›Props`.
- **Variants:** named, semantic values (`intent="destructive"`, `size="sm"`) —
  never style-leaking names like `blueBig`.
- **Booleans:** positive and prefixed (`isLoading`, `hasError`, `disabled`).
- **Event props:** `onX` for events, `onXChange` for controlled value changes.
- **Test files:** `‹Name›.test.tsx`, co-located with the component.
- **Feature public surface:** exported from the feature's `index.ts`; everything
  else is private to the feature.

## Component API rules

- **Props are minimal and typed.** No `any`. Extend the underlying element's
  props where sensible (`React.ComponentProps<'button'>`) so `className`,
  `aria-*`, and refs pass through.
- **Forward refs** on primitives that wrap a DOM node.
- **`className` merges**, it doesn't override — use `cn()` so callers can extend
  without breaking base styles. Do **not** expose `style` for theme-able values;
  use variants/tokens.
- **Variants via CVA.** Declare the variant matrix once; the component's type is
  derived from it. Call sites pick variants, never hand-write class strings.
- **Controlled/uncontrolled:** support both where it matters (inputs), following
  the conventional prop shape (`value`/`defaultValue`, `onValueChange`). Some
  primitives are deliberately **controlled-only** — `Combobox` is, because the
  consumer owns the query, the debounce and the paging.
- **No business logic or data fetching** inside reusable components — pass data
  and callbacks in. Fetching lives in feature `api/` hooks.
- **No hard-coded user-facing copy** in primitives/composites.

## Component lifecycle

```mermaid
flowchart LR
  A[Need identified] --> B{Exists already?}
  B -- yes --> C[Reuse / extend via variant]
  B -- no --> D{Reusable or one screen?}
  D -- reusable --> E[Design against tokens + a11y]
  E --> F[Build primitive/composite + tests + TSDoc]
  F --> G[Component Reviewer + A11y Reviewer]
  G --> H[Merge into design system]
  D -- one screen --> I[Build in the feature, still token-driven]
  H --> J[Maintain: version via changeset if behaviour changes]
  J --> K[Deprecate: mark, document replacement, remove when unused]
```

1. **Propose/justify** — reuse before building; extend before duplicating.
2. **Design** — against tokens and accessibility from the start.
3. **Build** — typed API, all states, light+dark, keyboard + SR support.
4. **Test** — behaviour and a11y (see below).
5. **Review** — Component + Accessibility reviewers (agents) for non-trivial
   components.
6. **Document** — props (TSDoc) and usage; add to the design-system inventory.
7. **Maintain** — behaviour-changing edits get a changeset; keep the API stable.
8. **Deprecate** — mark deprecated, document the replacement, remove once unused.
   Never leave two ways to do the same thing.

## Required states

A component with interaction or data must implement, and test, every applicable
state: default, hover, active/pressed, focus-visible, disabled, loading/busy,
error, empty, and selected/active. A missing state is an incomplete component.

## Testing requirements

- **Unit/behaviour** (Vitest + Testing Library): query by role/label, assert
  behaviour and accessible names — not implementation details or class names.
- **Interaction:** keyboard operability (Tab/Enter/Space/Esc/arrows as relevant)
  and focus behaviour for interactive components.
- **Variants:** at least a smoke render per variant/size.
- **Coverage:** meet the repo bar (`docs/TESTING.md`); every bug fix adds a
  regression test.
- Critical flows also get a Playwright journey with accessibility assertions.

## Primitive: `Menu` / `MenuItem` (`components/ui/menu.tsx`)

The single **action menu** primitive: a hand-rolled WAI-ARIA APG "Menu Button" on
semantic HTML (no new dependency), sibling to `Combobox`. Portal-rendered and anchored
to a viewport point, so one component serves a trigger button, a right-click context
menu and every popover a toolbar item raises. (It also served the **toolbar overflow**
until ADR-0109 D1 deleted the width ladder and the `⋯` with it — a command surface wraps
now, so there is nothing to demote into a menu.) Focus moves into the menu on open,
↑/↓/Home/End rove,
and Escape/Tab/selection return focus to `restoreFocusRef`.

Scope is deliberately minimal — a flat list of a handful of actions, no submenus and no
typeahead. Pair it with `useMenuTrigger()` rather than re-deriving the
ref + `getBoundingClientRect()` + `useState` dance at each call site.

### Unavailable items: shade, don't hide (ADR-0082)

This is the part most likely to be got wrong, because the primitive's own posture was
wrong until ADR-0082 and two of its call sites had comments asserting the opposite of
what the code did.

- **A shaded item is still an arrow-key stop.** `itemsOf` includes `aria-disabled`
  items. It used to filter them, and that one line meant a shaded item's reason was
  unreachable by keyboard — so there was no point writing one, so no call site did.
  The APG's _Developing a Keyboard Interface_ practice names "Menu items in a Menu or
  menu bar" among the controls to keep focusable when disabled.
- **`disabledReason` is a description, never part of the name.** It renders as an
  `sr-only` **sibling** of the button, linked by `aria-describedby`. Folding it into
  the label makes the name narrate state and repeats one sentence across every shaded
  item — the exact defect `ToolbarButton` fixed one primitive along, where thirteen
  existing tests caught the alternative the moment it was written.
- **`busy`** sets `aria-busy` for an item whose write is in flight. Never reach for the
  native `disabled` attribute here; it drops focus to `<body>` twice per action.
- **Omit vs. shade** — the discriminating rule, because "shade, never hide" degenerates
  without one:

  | Why it is unavailable                              | Treatment                     |
  | -------------------------------------------------- | ----------------------------- |
  | Does not apply to this object (Dissolve on a task) | **Omit**                      |
  | Feature flag off                                   | **Omit** (parity suites rely) |
  | Nothing to show at all                             | **Omit**                      |
  | Shut by a state the reader can change (the pen)    | **Shade + reason**            |
  | Shut by role                                       | **Shade + reason**            |
  | Not built yet                                      | **Shade + "Coming soon"**     |

- **When every item would be shaded, render no trigger.** A menu of nothing but
  refusals is not discoverability, and a menu with no enabled item has nothing to focus
  on open — which used to leave focus on the trigger, outside the portal, where the
  container's key handler never sees the arrows.
- **Derive the reason from the gate the feature already has**, not a second
  `{ writable, reason }` assembled beside it. `ActivitiesTable` shades from
  `editorGating.general` — the same `ScopeGate` object the activity editor uses — and an
  identity assertion pins it, so "this changes no permission" is checkable rather than
  claimed. A gate that is a bare boolean has no sentence to show, and inventing one is
  how a reader gets told "your role" when they merely lack the lock.

Behaviour + a11y contract: `components/ui/menu.test.tsx`.

## Primitive: `Combobox` (`components/ui/combobox.tsx`)

The single **picker** primitive: a hand-rolled WAI-ARIA APG "Combobox with List
Autocomplete" on semantic HTML (no new dependency), sibling to `Menu`. It exists
because a native `<select>` cannot type-ahead-filter against a server, page a
large library, or annotate an option with its tier/state — and ADR-0053 §4 needed
all three in four different pickers (plan calendar, activity calendar, resource
calendar, assignment resource) plus the resource-group tree picker.

**It never fetches.** It is fully controlled and deliberately presentational: the
consumer owns `options`, `query`/`onQueryChange` (so it picks its own debounce and
query key) and `onLoadMore`. That keeps feature code out of the primitive tier and
lets the same component sit over a paged server search, a plain array, or a tree.

```tsx
<Label htmlFor="plan-calendar">Calendar</Label>
<Combobox
  id="plan-calendar"
  value={calendarId}
  onChange={setCalendarId}
  query={query}
  onQueryChange={setQuery}          // debounce here when the search is server-side
  options={options}                 // { value, label, group?, badge?, depth?, disabled? }
  selectedLabel={current?.name}     // renders the current value even when filtered out
  groupLabels={{ org: 'Organisation calendars', project: 'This project’s calendars' }}
  emptyOption={{ label: 'None' }}   // selecting it emits ''
  loading={isFetching}
  hasMore={hasMore}
  onLoadMore={loadMore}
  emptyMessage="No calendars match your search."
/>
```

Behaviours worth knowing before reaching for it:

- **The current value always renders**, even when the page it came from is filtered
  away — `selectedLabel` supplies the text, falling back to `Loading…`/`Unavailable`.
  A selection can therefore never silently blank. That **includes `emptyOption`**:
  `value=''` renders its label ("None", "Inherit from plan", "Top level"), exactly as
  the native `<select value="">` it replaces did. `''` with no `emptyOption` is the
  only genuinely-unset state, and that is what `placeholder` is for.
- **`badge` is part of the option's accessible name** (`"Standard, Archived"`), not a
  decorative pill — state is announced as well as seen (WCAG 1.4.1).
- **`depth` indents** for a tree picker. Never the only cue: pair it with a badge, a
  group, or a text column elsewhere.
- **"No matches" reflects `options`, not the reachable rows** — an `emptyOption` or a
  still-rendered selection never disguises a search that matched nothing.
- **"Load more" is keyboard-operable** — it is a real option and the last stop in the
  arrow-key sequence (Enter loads the next page without closing the popup or moving the
  selection), because it is the only route to page 2+ of a server-searched library
  (WCAG 2.1.1). Opening upwards with ArrowUp lands on the last real option, never on it.
- **The listbox is in-flow (absolute), not portalled** — its consumers live inside the
  native `<dialog>` used by `Dialog`, where a body portal would render _behind_ the
  top layer.
- Escape is handled on a capture-phase document listener, so it dismisses the popup
  **without** closing a surrounding `Dialog`.

Scope is intentionally minimal: single-select, list autocomplete (typing filters; it
never rewrites the input), no multi-select and no free-text entry. A consumer needing
more should extend this primitive rather than fork it. Behaviour + a11y contract:
`components/ui/combobox.test.tsx`.

## Primitive: `SearchField` (`components/ui/search-field.tsx`)

The house **list search** control: a labelled input with a leading Lucide `Search`
icon and an explicit clear button, over the shared `Input` — the `DESIGN_SYSTEM.md`
"Search" contract made concrete.

It exists because `type="search"`'s native ✕ is Chromium-only and never
keyboard-reachable, so a bare `<Input type="search">` leaves keyboard and screen-reader
users no way to clear a term. The clear affordance here is a real `<button>` with an
accessible name; the native one is suppressed so there is exactly one.

```tsx
<SearchField
  label="Search calendars" // visible label, never placeholder-only
  placeholder="Search by name"
  clearLabel="Clear calendar search" // the button's accessible name
  value={term}
  onChange={setTerm}
/>
```

Presentational and fully controlled: the consumer owns the term, the debounce and the
fetch. It does **not** own URL state either — a list screen's search belongs in typed
search params, which is the route's job (`hooks/use-url-filter-state.ts`).

## Primitives: `SegmentedControl` and `ToggleChip` — and how to choose

Two controls that look similar and mean different things. The choice is **semantic**, not
visual, and getting it backwards misdescribes the control even when it renders correctly.

| Use                | When                                                                                                 | Semantics                             |
| ------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `SegmentedControl` | A **mutually-exclusive** choice from a known set — Diagram _or_ Activities, Day _or_ Month _or_ Year | APG `radiogroup`: "one of a set of N" |
| `ToggleChip`       | An **independent boolean** — Critical, Chain, Non-working. Each stands alone                         | `aria-pressed` button: "this is on"   |
| `Badge`            | Output, not a control                                                                                | Plain text                            |

`SegmentedControl` (`components/ui/segmented-control.tsx`) implements the APG radiogroup:
roving `tabindex`, Arrow/Home/End with wraparound, `aria-checked`, and **focus follows
selection** (the control is the thing being acted on, so leaving focus behind would strand the
user on an option that is no longer current). Callers supply `label`, `value`, `onChange`,
`options`, and may add sizing classes — never colour.

`value` may be **`null`** for a question with **no answer yet** — a choice the user must make
rather than one with a default (the import dialog's resource-name collisions). The APG rule then
applies and the primitive enforces it: the **first** option carries the group's single tab stop,
so an unanswered group is still reachable. Deriving the tab stop from `value === option` alone
would give every option `tabIndex={-1}` and make it keyboard-unreachable — a WCAG 2.1.1 failure
that renders perfectly. Do **not** reach for `null` to express a default; if one of the options is
the safe answer, pass it.

`ToggleChip` (`components/ui/toggle-chip.tsx`) is a CVA `aria-pressed` button. Its pressed
state changes **fill and border**, so it never signals state by hue alone (WCAG 1.4.1).
**A chip that filters owes an announcement**: filtering a list without changing an announced
result count leaves screen-reader users with no evidence anything happened (WCAG 4.1.3) — pair
it with `useResultCountAnnouncement` or an equivalent live region. A chip that is a **form
field** owes nothing extra: its own `aria-pressed` already reports the value, and there is no
result set to count.

The reference consumer is the **working-days picker** in `CalendarFormDialog`'s
`WeekdayToggleGroup` — seven independent booleans in a labelled `<fieldset>`, which is the
form-field case above. It is deliberately not a `SegmentedControl`: turning Monday on says
nothing about Tuesday, so "one of a set of N" would misdescribe it.

## Primitive: `Toolbar` — when a group partitions (`components/ui/toolbar/Toolbar.tsx`)

`Toolbar` renders a {@link ToolbarItem} registry as an APG `role="toolbar"`, with items
partitioned into the **closed seven-group taxonomy** (ADR-0031) and one `role="group"` per
taxonomy group. Sometimes one taxonomy group holds **two unrelated things**: the plan header's
mode row holds `Early mode | Visual mode` (a scheduling mode) and `Diagram | Gantt` (a view), all
four declared `group: 'lens'`.

Left alone that renders as one region, one accessible name and four identical gaps — so nothing
says where one switch ends and the next begins, in either channel (ADR-0119, `docs/TECH_DEBT.md`
#201).

**Declare a `segment` on each item and pass `segmentLabels`.**

```tsx
// on the items
{ id: 'mode-early', group: 'lens', segment: 'scheduling-mode', … }
{ id: 'view-tsld',  group: 'lens', segment: 'view-mode',       … }

// at the host
<Toolbar
  items={rows.mode}
  label="Plan mode and view"
  groupLabels={{ lens: 'Scheduling mode and view' }}
  segmentLabels={{ 'scheduling-mode': 'Scheduling mode', 'view-mode': 'Plan view' }}
/>
```

**The precondition is all-or-nothing.** Every item in the group must carry a `segment` that the
map names, or the whole group renders exactly as it does without the prop. That refusal is the
load-bearing half: a partial partition would put some items in a named region and leave the rest
in an unnamed one — a container a screen-reader user must enter to discover holds nothing they
were told about, which is worse than the undifferentiated group. `partitionBySegment`
(`toolbar-registry.ts`) is that rule in pure form; in development, a refused partition logs a
`console.warn` naming the group and its items, because a silent fallback is how a capability
regresses with nothing saying so.

**Three rules for a consumer:**

1. **Still pass `groupLabels`.** It is defence in depth, not decoration. If the precondition ever
   fails, the fallback names the region from there — and without it the region falls back to the
   taxonomy default (`Display` for `lens`), which is also the deck's `View ▾` neighbourhood: the
   exact collision a UX review rejected once already.
2. **Name the toolbar for what it contains, not for one of its groups.** A region named
   `Plan mode` holding a group named `Plan view` contradicts itself. A compound name is **wrong
   for a group** — it cannot say where one switch ends — and **right for a container of two
   groups**, which is naming two things that really are two.
3. **Add a structural test at the call site.** The all-or-nothing rule is correct and invisible:
   an item added later without a `segment` silently reinstates the single region.
   `plan-mode-segments.structural.test.ts` is the reference — assert that every item on the row
   has a segment and every segment is named, **against the real registry and the real map** rather
   than restatements of them, and carry a pinned positive, because both assertions are vacuously
   true of an empty array.

**Segments are not radio buttons.** `SegmentedControl` above is the APG radiogroup, where focus
follows selection. That is wrong here: arrowing through the mode row would _change the plan's
scheduling mode_ on the way past, on a control that recalculates. Toolbar items stay
`aria-pressed` toggle buttons — a weaker description than a radiogroup, not an incorrect one.

Two invariants in `defineToolbar` guard the field: a segment may not span a `tier` or a `row`. The
row one is live (each row renders its own `<Toolbar>`, so a split segment becomes two disconnected
one-item switches); the tier one is speculative and forward-only, and its comment says so.

## Primitive: `Tabs` (`components/ui/tabs.tsx`)

The WAI-ARIA APG `tablist` pattern, hand-rolled like `Menu` and `Combobox`. Controlled:
callers own `active` and pass `onChange`; the panel's content comes from a
`children: (active) => ReactNode` render prop, so there is exactly one panel in the DOM.

**It has one consumer** — `ActivityEditorDialog` — and is built for it deliberately. No
`renderTab` escape hatch, no orientation prop, no lazy-mount option. That is not an oversight
to be corrected the first time a second caller appears; it is the lesson `form.tsx` records,
where an escape hatch added "for flexibility" was removed the day it shipped. Add options when
a real second consumer needs them, and not before.

**Automatic activation.** Arrowing selects rather than merely focusing, which the APG
recommends when revealing a panel is cheap. Every panel's data is already in memory here, so
manual activation would only cost a keystroke.

**The panel is a tab stop (`tabIndex={0}`), which departs from the APG.** The APG suggests that
only for panels with no focusable children — guidance that assumes a panel which fits. Ours is
a scroll container inside a dialog, and a scrollable region that is not focusable cannot be
scrolled by keyboard at all. The conflict is real and **WCAG 2.1.1 wins**: the cost is one
extra tab stop, the alternative is content a keyboard user cannot reach. Recorded in ADR-0060
so it reads as a decision rather than a mistake.

**Markers are text, never colour** (WCAG 1.4.1). A `TabDescriptor`'s optional `marker` renders
a visible count badge or a presence dot **and** extends the tab's accessible name — "Scheduling,
3 problems". Its `label` is required for exactly that reason: a marker nobody can hear is
colour-only meaning, which is the specific way a validation error hides on an unfocused tab. An
unmarked tab's accessible name stays exactly its visible label, keeping name-in-label intact
(WCAG 2.5.3).

The tablist **scrolls horizontally rather than wrapping**: a wrapped tablist changes height as
markers appear and disappear, which reflows the panel under the user's cursor mid-edit.

## Layout: `BrandMark` and `AccountChip`

`BrandMark` (`components/layout/brand-mark.tsx`) is the tile + wordmark. The tile is
`bg-primary text-primary-foreground`, i.e. a token, so it resolves per surface scope: amber on the
navy chrome, navy on the page. Writing either as a literal would pin it to one surface and make it
unreadable on the other — which is the whole reason it is a token and not a colour.
The tile is `aria-hidden` — it repeats the wordmark's first letter, so exposing it would have a
screen reader announce "S SchedulePoint".

`AccountChip` (`components/layout/account-chip.tsx`) is an initials avatar opening a portalled
`Menu` with the signed-in email, the account screen, keyboard shortcuts and Sign out. It replaced
a theme-cycling button, an always-visible email and an `outline` Sign-out button — two of which
were that theme's worst contrast defects. **The theme choice itself is gone** (ADR-0097: one
theme), and this paragraph described it until 2026-08-19. Three things it must keep doing: the
trigger's
accessible name carries the email (initials identify nobody), focus returns to the trigger on
close, and the sign-out mutation's pending state disables the item so a second press cannot
fire a duplicate request.

> The sentence that followed — _"the theme is a **radio group** rather than a cycling button,
> because a cycle never tells the user what the other three options are"_ — described a control
> ADR-0097 removed. The **reasoning** is kept, in that ADR, because it is the argument against a
> cycling picker rather than an argument about this menu, and a future theme choice should not be a
> cycle either.

## Layout: `AuthShell` (`components/layout/auth-shell.tsx`)

The centred card every **public** screen sits in — sign-in, sign-up, accept-invite, and the
account-recovery screens (ADR-0074). It is the page's single `main` landmark, takes an optional
`title`/`description` (omit them when the children own their heading, as the accept-invite card
does), and reflects `busy` as `aria-busy`. **One width, 448px** — the `size` prop is gone
(ADR-0077 M2-T4): keeping both prior widths behind a prop preserved the very drift the convergence
existed to remove, so a reader who signed in and then accepted an invitation watched the card
change size for no reason they could name.

**The route owns the heading, including every terminal state.** A form that swaps its own body for
an outcome leaves the heading describing a task that is over — which is what `/reset-password` did,
keeping "Choose a new password" over a body that had already said the password was changed. Where a
screen has a terminal state, the route holds the mutation and renders it; the form keeps its fields.
`components/layout/auth-shell-assertions.ts` carries the one-`main`/one-`h1` assertion so 33 states
do not each hand-write it.

**It mounts `AnnouncerProvider`, and a public screen depends on that.** The app's provider lives
inside the authed shell, so out here `useAnnounce()` would otherwise resolve to the context's
no-op default and every "Check your email" / "That link has expired" would be announced to
nobody — silently, which is the only way that defect ever ships. Mounting the **same** provider
rather than hand-rolling a second live region is what keeps a component like
`ResendVerificationButton` working identically on a public screen and an authed one without
knowing where it is.

`InviteShell` is a thin named wrapper over it (no title) rather than a second
implementation: it was a near-copy that had already drifted on width and on whether it announced
anything, and three new public screens were about to make that five callers on two shells — the
ADR-0062 shape, where each looks right alone and only a reader who opens the same thing two ways
ever notices one is a version behind.

## Primitive: `ServerError` (`components/ui/server-error.tsx`)

The failure that came back from the server, given the same weight as the client-side validation
beside it (ADR-0077 M2-T1). It renders `role="alert"`, takes focus **once** when it appears, and
uses the bordered, tinted treatment `FormErrorSummary` already had — the defect it replaces is a
hierarchy inversion, where "enter a valid email" got a bordered block and "too many attempts" got a
bare red sentence, in six hand-assembled copies.

It takes a `message`, not an error object, and deliberately **knows nothing about HTTP**. A
primitive in `components/ui` that imported `AuthError` to branch on a 429 would be a one-off in a
`ui/` costume; the single place deciding what 429 means is `authErrorMessage()` in
`features/auth`, whose result callers pass in.

## Primitive: `textLinkVariants` (`components/ui/text-link.tsx`)

The inline text link. A `className` factory rather than a component — the same shape as
`buttonVariants`, and for a concrete reason: these are TanStack Router `<Link>`s, and wrapping one
loses the type-safe inference on `to`/`params`/`search` that catches a link to a route that does not
exist. `size: 'inherit'` (the default) takes the surrounding prose's size; `size: 'sm'` sizes itself.

**Reach for it, never for the classes.** It closed `docs/TECH_DEBT.md` #97(b), which was five
hand-written copies of `text-primary font-medium underline-offset-4 hover:underline` across the
public screens — and it adds the visible focus ring none of those copies had.

## Layout: `BrandPanel` and `TsldMotif` (`components/layout/`)

The dark navy panel beside the card on every public screen (ADR-0077). `BrandPanel` is a
`<Surface tone="brand" as="aside">` carrying `BrandMark`, the motif and the verbatim tagline; it is
`aria-hidden`, because the same three decorative facts on six screens should not be read aloud six
times and nothing in it is information available nowhere else.

**One `<aside>`, always rendered — only its proportion changes.** The obvious responsive shape is
two copies behind `hidden md:flex` / `md:hidden`, and it would break thirty suites silently: jsdom
has no CSS, so both land in the accessibility tree, `getByText` goes ambiguous and `getAllBy*`
assertions keep passing while asserting nothing. `brand-panel.test.tsx` counts the lockup for that
reason.

`TsldMotif` is inline SVG, not an asset: `img-src 'self' blob:` has no `data:`, so both a file and a
`data:` URI are fetches this origin pays for or refuses. Inline markup is neither, and it stays
inside the design system's reach — the colour-literal lint rule and the contrast matrix can both see
it. It draws from the **enclosing scope's** semantic names and never from `--chart-*`, which is not
rebound per surface and measured near 1.4:1 on the fixed navy panel.

## Primitive: `Surface` (`components/ui/surface.tsx`)

Marks a region as a **surface scope** (ADR-0055): the semantic token names keep their
meaning but resolve to a family validated for that surface.

```tsx
<Surface tone="chrome" as="header" className="border-border sticky top-0 border-b">
  {/* Descendants need no change: inside this scope, `text-muted-foreground` IS a grey
      validated against the header's fill. */}
</Surface>
```

**A scope is a component, not a class — deliberately.** The `--chrome-*` / `--panel-*`
families are not mapped into Tailwind's theme, so `bg-chrome` does not compile. There is no
class to hand-apply, which is what makes the boundary structural rather than a convention
someone has to remember. `surface-seams.structural.test.ts` pins the allowlist.

Contract:

- `tone` — `'chrome'` (the top band) or `'panel'` (the Project Explorer rail).
- `as` — the element to render (`header`, `nav`, `aside`…); defaults to `div`. Use
  `className="contents"` when the scope should be a pure colour context with no box.
- Renders `bg-background text-foreground`, which inside the scope _are_ the surface's own
  colours.
- **Nesting the same tone twice throws in development** and renders in production (the
  `defineToolbar` precedent): an inner scope rebinding names to the values they already
  hold means its author believes they are changing surface and are not.
- **Never branch on surface in JS.** The context exists only for that nesting check and is
  not exported. If a component needs to know where it is, the token vocabulary is
  incomplete — fix the family, not the component.

Overlays are outside every scope by construction: `Menu`, `Dialog`, `Sheet` and the
combobox listbox portal to `document.body`, so a menu opened from the navy toolbar paints
on `--popover`. That is intended — an overlay belongs to the page, not to the surface that
summoned it.

## Documentation requirements

- **TSDoc** on the component and any non-obvious prop.
- A short **usage example** for primitives (in the file header or a co-located
  example) showing the common case and one variant.
- Add the component to the inventory in [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md)
  when it becomes a shared standard.

## Anti-patterns (rejected in review)

- One-off styling or magic values instead of tokens/variants.
- Boolean-prop explosions instead of composition.
- Business logic, data fetching, or hard-coded copy inside reusable components.
- Duplicating an existing pattern instead of extending it.
- Removing focus outlines; `div`/`span` used as buttons; icon-only controls with
  no accessible name.

## Primitive: `useTooltip` (`components/ui/tooltip.tsx`)

A hand-rolled APG tooltip as a **hook** (ADR-0117, fix-slice M-B) — the trigger differs per
consumer (`usePopoverPanel`'s argument), so a wrapper component would need `cloneElement` and a
ref it cannot type. Spread `triggerProps` onto the trigger; render `tooltip` in the same JSX.

```tsx
const tip = useTooltip({ content: label, purpose: 'name-echo' });
return (
  <button {...tip.triggerProps} aria-label={label}>
    <Icon aria-hidden />
    {tip.tooltip}
  </button>
);
```

**`purpose` is the sharp edge and has no default.** `'name-echo'` — the content restates the
control's accessible name (the icon-only case): the panel is `aria-hidden` and NO
`aria-describedby` is added, or a screen reader hears "Zoom in, Zoom in". `'description'` — the
content carries something the name does not: `role="tooltip"`, linked while open. The caller
states which case they are in; the compiler enforces it.

WCAG 1.4.13 in full: **Dismissible** (Escape, claimed only while open, `preventDefault` ONLY —
never `stopPropagation`, because a tooltip arms from incidental hover/focus and must not withhold
the press from the canvas rung it was aimed at; focus unmoved), **Hoverable** (the pointer may
rest on the tip; 150 ms leave grace), **Persistent** (no auto-dismiss timer exists). Hover opens
at 400 ms; focus opens immediately; a **touch long-press** (500 ms) opens the name **without
firing the command** — the following click is swallowed; an outside press dismisses; a pen takes
the hover path only. At most one tooltip is open application-wide. Positioned by `overlay-position.ts`'s clamp and portalled via its
`portalTarget()` — never a private copy of either (`overlay-position.structural.test.ts`).

**When to reach for it — the `title` discriminator** (spec §4.2's table, binding):

| The `title` you are about to write is…                   | Do this instead                                                                              |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| an icon-only control's name                              | `useTooltip({ purpose: 'name-echo' })` — never `title`                                       |
| a truncated text's full value                            | keep native `title` (free, correct, not a control's name)                                    |
| a supplementary clause on a control with a visible label | keep native `title` (a copy decision, not a naming gap)                                      |
| a fact the accessible name does not carry                | `useTooltip({ purpose: 'description' })`, with its own review — it changes what AT announces |
