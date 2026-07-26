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
  Radix conventions (`value`/`defaultValue`, `onValueChange`).
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
  A selection can therefore never silently blank.
- **`badge` is part of the option's accessible name** (`"Standard, Archived"`), not a
  decorative pill — state is announced as well as seen (WCAG 1.4.1).
- **`depth` indents** for a tree picker. Never the only cue: pair it with a badge, a
  group, or a text column elsewhere.
- **"No matches" reflects `options`, not the reachable rows** — an `emptyOption` or a
  still-rendered selection never disguises a search that matched nothing.
- **The listbox is in-flow (absolute), not portalled** — its consumers live inside the
  native `<dialog>` used by `Dialog`, where a body portal would render _behind_ the
  top layer.
- Escape is handled on a capture-phase document listener, so it dismisses the popup
  **without** closing a surrounding `Dialog`.

Scope is intentionally minimal: single-select, list autocomplete (typing filters; it
never rewrites the input), no multi-select and no free-text entry. A consumer needing
more should extend this primitive rather than fork it. Behaviour + a11y contract:
`components/ui/combobox.test.tsx`.

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
