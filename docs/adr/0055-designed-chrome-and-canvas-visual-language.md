# ADR-0055: Surface scopes, a designed chrome band, and the canvas visual language

- **Status:** Accepted — S0–S5 landed; `VITE_DESIGNED_CHROME` and
  `VITE_CANVAS_VISUAL_LANGUAGE` flipped **default ON** 2026-07-26 (S5-T4)
- **Date:** 2026-07-26
- **Deciders:** James Ewbank (product) with Claude Code — ui-architect
- **Related:** ADR-0006 (tokens/shadcn/CVA — **amended**: adds surface-scoped token
  rebinding and three new token families), ADR-0026 (TSLD canvas rendering — **amended**:
  the ground gains a month-band pass and the DOM ruler is confirmed as DOM), ADR-0029
  (persistent app-shell — **amended**: the shell gains a chrome region and a toolbar slot
  above the rail row), ADR-0030 (canvas-first workspace), ADR-0031 (toolbar-item registry
  — **unchanged contract**; three of its shipped amendments are re-opened as product
  questions, see §8), ADR-0052 (canvas direct manipulation & visual refresh — **partially
  re-opened**: bar/link _constants_, not decisions), ADR-0054 (canvas live feedback).

## Context

The product owner's judgement is that SchedulePoint "doesn't look like a designed app",
and has supplied a reference build with a navy + amber corporate visual language: one
continuous dark band across the whole top of the screen carrying the brand mark, the
account chip and a two-row command bar; a light Project Explorer panel with an accent-bar
tree; and a cream diagram ground with alternating month tint bands, a tiered date ruler
and a red TODAY marker chip.

Underneath the aesthetic sits a **structural defect** that a UX review has already
verified in the Corporate theme, and which any chrome redesign would multiply:

- `components/layout/app-header.tsx:13-14` — the nav links carry
  `text-muted-foreground hover:text-foreground [&.active]:text-foreground`. On the navy
  band that is **2.8:1 idle** and **1.26:1 on hover and for the current page** — the
  current page is the least legible thing in the header.
- `components/layout/app-header.tsx:109` — `Button variant="outline"` ("Sign out") sets
  `bg-background` but never sets its own ink (`components/ui/button.tsx:13`), so it
  inherits the band's white foreground: **1.01:1, invisible**.
- `components/layout/app-header.tsx:103` (the user-email span),
  `components/layout/navigator/navigator-rail.tsx:95`,
  `features/system/components/AppVersionLine.tsx:17`, and
  `features/navigator/components/HierarchyTree.tsx:302-305` —
  `text-muted-foreground` / `text-destructive-text` on navy: **2.8:1 / 2.5:1**.
- `components/ui/button.tsx:13-14` — `ghost` and `outline` hard-code
  `hover:bg-accent hover:text-accent-foreground`. Those are _canvas_ tokens with no
  ambient awareness, so **any** button placed in chrome hovers with the wrong colour.

The root cause is not the individual class strings. It is that **there is exactly one
semantic token vocabulary, and it is tuned for the page/canvas surface.** The chrome
surface has a partial, ad-hoc family (`--app-header{,-foreground,-border}` at
`styles/globals.css:91-93`) and the rail has another (`--sidebar-*` at
`styles/globals.css:96-103`) — and **neither has a muted-foreground, a destructive-text,
a field surface, or a hover-accent that is validated against its own fill.** In light and
dark this was invisible because `--app-header` is byte-identical to `--background` and
`--accent` to `--sidebar-accent` (compare lines 32/91 and 100/48). Corporate is the first
theme where chrome and canvas genuinely diverge, so the latent bug surfaced. The redesign
makes that divergence permanent and, per the product decision below, **extends it to all
four themes** — so the defect must be fixed structurally, not class by class.

**Product decisions treated as fixed constraints:**

1. The chrome band applies to **all four themes** (navy in Corporate, a subtle grey in
   Light, near-black in Dark). Light and Dark change visibly; that is intended.
2. The canvas redesign is **full scope** — ground, banding, ruler, TODAY chip **and** a
   revisit of bar fills, corners, link weights and arrowheads. This deliberately re-opens
   ADR-0052's visual refresh.
3. The contrast defects above are fixed as part of this work.

**Forces that are not negotiable:**

- **No one-off styling, ever** (ADR-0006, `DESIGN_SYSTEM.md`). A redesign that adds a
  `className` override at every chrome call site is a failure even if it looks right.
- **WCAG 2.2 AA is a merge gate** (CLAUDE.md §13). Every fill/ink pair in every scope in
  every theme must be validated, not eyeballed.
- **ADR-0026's ≤ 4 ms p95 draw budget at 2,000 activities is a hard gate**, and the ruler
  is currently DOM (`features/tsld/components/TsldCanvas.tsx:1229-1246`), updated
  imperatively from the rAF loop.
- **ADR-0031's registry contract must keep working.** Commands are data; `<Toolbar>` is
  generic. No redesign may require editing `<Toolbar>` per command.
- **ADR-0029's shell mounts once.** Selection stays a projection of the URL; the rail must
  not remount on a plan switch.
- **The house owns its primitives** — no new headless dependency (CLAUDE.md §2).
- Every prior canvas ADR has preserved the recalc parity gate. This one is frontend-only
  and must too, structurally.

## Decision

### §1 — Surface scopes: one vocabulary, rebound per surface

We will introduce the concept of a **surface scope**: a region of the UI within which the
semantic token names keep their meaning but resolve to a different, surface-appropriate
family. Three scopes exist:

| Scope    | Where                                    | Marker                  |
| -------- | ---------------------------------------- | ----------------------- |
| _(page)_ | Everything by default — routes, dialogs  | none (the `:root` case) |
| `chrome` | The top band: header row + the toolbar   | `data-surface="chrome"` |
| `panel`  | The Project Explorer rail, docked panels | `data-surface="panel"`  |

The mechanism is **CSS custom-property rebinding at the scope boundary**, expressed once
in `apps/web/src/styles/globals.css`:

```css
[data-surface='chrome'] {
  --background: var(--chrome);
  --foreground: var(--chrome-foreground);
  --muted-foreground: var(--chrome-muted-foreground);
  --border: var(--chrome-border);
  --input: var(--chrome-border);
  --accent: var(--chrome-accent);
  --accent-foreground: var(--chrome-accent-foreground);
  --primary: var(--chrome-primary);
  --primary-foreground: var(--chrome-primary-foreground);
  --field: var(--chrome-field);
  --field-foreground: var(--chrome-field-foreground);
  --destructive-text: var(--chrome-destructive-text);
  --warning-text: var(--chrome-warning-text);
  --info-text: var(--chrome-info-text);
  --ring: var(--chrome-ring);
}
```

**This works, today, with zero component changes**, because of a property of the existing
setup that is worth stating precisely: `globals.css:266` declares `@theme inline`, which
means a utility compiles to the _referenced_ variable (`bg-background` →
`background-color: var(--background)`) rather than to a `:root`-resolved indirection. A
custom property redeclared on a descendant therefore changes every utility beneath it.
Had the theme block been non-`inline`, `--color-background` would have computed once on
`:root` and inherited as a fixed value, and this design would not work. **Removing
`inline` from that block is a breaking change to this ADR** and must be caught in review.

Consequences that fall out for free: `text-muted-foreground` in
`app-header.tsx:103`, `navigator-rail.tsx:95`, `AppVersionLine.tsx:17` and
`HierarchyTree.tsx:302-305`, and the `hover:bg-accent hover:text-accent-foreground` in
`button.tsx:13-14`, all become correct in chrome **without touching those files**. That
is the test of the mechanism: the fix is in one place, and the primitives stay
surface-agnostic.

**The chrome and panel families are deliberately given no Tailwind utilities.** They are
declared as plain custom properties in each theme block and are **not** added to
`@theme inline`, so `bg-chrome`, `text-chrome-foreground` etc. **do not exist**. The only
way to reach them is through the scope rule. This is the structural guard that makes the
boundary hard to violate: a developer cannot hand-apply a chrome colour to a canvas
component, because the class does not compile.

**One new _global_ semantic pair is added:** `--field` / `--field-foreground`, mapped in
`@theme inline` as `--color-field` / `--color-field-foreground`, defaulting at `:root` to
`--background` / `--foreground`. `Input` (`components/ui/input.tsx:17`), `Textarea`,
`Select`, `SearchField` and `Combobox` move from `bg-background` to `bg-field
text-field-foreground`. This is what expresses the reference's white date/filter fields on
navy: in chrome, `--field` is a light island; on the page it is unchanged. It is also the
honest answer to a defect — a field's surface has never been the same concept as the
page's, and pretending otherwise is what made the "Sign out" button invisible.

**Two new canvas tokens** (`--canvas`, `--canvas-band`) are added _with_ utilities — see
§4.

**`--app-header-*` is retired** in favour of `--chrome-*` (a rename plus a real family).
**`--sidebar-*` is superseded** by `--panel-*`; it is kept as an alias for one release
with a `@deprecated` comment, then deleted. Their replacement is the point: `--sidebar-*`
had a foreground, a primary, an accent, a border and a ring, and **no muted-foreground** —
the root cause of four of the five listed defects. A surface family is complete or it is
a trap.

**Applying a scope is a component, not a class.** `components/ui/surface.tsx` exports
`<Surface tone="chrome" | "panel">`, which renders a `div` (or `as`-element) carrying
`data-surface` plus `bg-background text-foreground` — which, inside its own scope, _are_
the chrome colours. Nesting the same tone twice is a dev-time invariant violation (fail
loud in dev, render anyway in prod — the `defineToolbar` precedent,
`components/ui/toolbar/toolbar-registry.ts`).

**Portals are outside every scope by construction.** `Menu`, `Dialog`, `Sheet` and
`Combobox`'s listbox render to `document.body`, so a menu opened from the navy toolbar
paints on `--popover`. That is correct and intended: an overlay belongs to the page, not
to the surface that summoned it. It is also the reason the account chip's contents (§3)
are safe.

### §2 — The chrome band: a shell-owned region with a toolbar slot

The header and the plan toolbar are today in **different DOM subtrees**: `AppHeader` is
rendered by `components/layout/navigator/app-shell.tsx:90`, above a flex row containing
the rail and `<main>`; the two `<Toolbar>` rows are rendered inside `<main>` by
`components/layout/workspace/plan-workspace-toolbar.tsx:473-491`. A continuous band across
the full width, with the rail starting _below_ it, cannot be achieved by styling alone.

We will restructure the shell from

```
column[ header ][ row( rail | main ) ]
```

to

```
column[ Surface tone=chrome ( header row + ChromeSlot ) ][ row( Surface tone=panel rail | main ) ]
```

The `ChromeSlot` is a **shell-owned mount point** plus a `ChromePortal` component: the
plan workspace keeps rendering `<Toolbar items={rows.look} context={ctx} …/>` exactly as
it does now, wrapped in `<ChromePortal>`, which `createPortal`s it into the shell's slot
node. The React tree is unchanged, so `usePlanWorkspaceModel`, the toolbar context and
every registry predicate keep working untouched. **ADR-0031's contract is not amended:**
commands are still data, `<Toolbar>` is still generic, the registry is not edited.

Two consequences must be handled explicitly, and are the riskiest part of this ADR:

1. **Native keydown listeners break.** React portals bubble events through the _React_
   tree, but `plan-workspace-toolbar.tsx:164` attaches the `?` shortcut with
   `root.addEventListener`, and `useUndoRedoKeybindings` (line 268) takes the same
   `rootRef`. Native listeners follow the **DOM** tree, so once the toolbar is portalled
   out of `rootRef`'s subtree, `?`, `Ctrl+Z` and `Ctrl+Shift+Z` stop firing while focus is
   on a toolbar control. The fix is to introduce a **workspace keyboard scope** that spans
   both nodes: a small `usePlanWorkspaceKeyScope` that attaches to the shell's chrome slot
   _and_ the workspace root (or, preferably, converts both to React `onKeyDown` on the two
   roots, which then works through the portal). This is a merge gate with a regression
   test per binding, not a follow-up.
2. **Focus order.** DOM order becomes brand → nav → account chip → toolbar row 1 → toolbar
   row 2 → rail → workspace. That is the correct reading order and an improvement on
   today; it must be asserted in the Playwright journey.

The band is **full-bleed**; `app-header.tsx:39`'s `max-w-6xl` centring is removed and the
comment at lines 37-38 promising "full-bleed shell alignment lands with the M3 view
migration" is retired. **Route bodies keep their `max-w-6xl` centring** (17 occurrences
across 10 route files). That is the deliberate resolution of the mismatch noted in that
comment: chrome is full-bleed, content is measure-capped. Un-centring ten list screens to
match the header would be a much larger, unrelated visual change with no reader benefit.

The **rail becomes a light panel** (`data-surface="panel"`), which in Corporate is a
material change from today's navy (`globals.css:250`). The reference shows it light, and
it is the right call: a navy rail beside a navy toolbar beside a cream canvas gives the
eye three competing regions; a single dark band with two light working surfaces gives it
one. The `sidebar ⇄ drawer at lg` contract (ADR-0029, `DESIGN_SYSTEM.md`) is unchanged —
only the token family and its values move.

**The plan's breadcrumb row stays OUT of the band, and that is a decision, not a leftover.**
With a plan open and the flag on, the stack reads: band row 1 (header) · band row 2 (View and
navigate) · band row 3 (Build and manage) · then, on the page surface, the plan's breadcrumb +
status + pen row. A reviewer reasonably asked whether that fourth, differently-coloured strip
undermines the "one designed surface" claim. Three reasons it belongs where it is:

1. **It names the content, not the app.** The band answers "what product am I in, and what can I
   do to a plan"; the breadcrumb answers "which plan am I looking at". Those are different
   questions, and a user scanning for the second one should not have to find it inside chrome.
2. **The plan name deserves page ink.** Inside the band it would render at chrome contrast on
   navy; on the page it is the same near-black as every other heading in the product. A plan's
   name is the most-read string on the screen.
3. **It caps the band at three rows.** A fourth row of chrome above the canvas is the "thicker
   wall" failure the band exists to avoid, and the band's height is already the thing this ADR's
   consequences flag as the change most likely to annoy a planner.

The seam is therefore intentional: dark chrome, then a light identity row, then the canvas. If it
reads as a wall in practice rather than as a hierarchy, the answer is to make the breadcrumb row
quieter (drop its bottom rule, tighten it) — **not** to move it into the band.

### §3 — Primitives

| Need              | Status             | Decision                                                                                                                           |
| ----------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Segmented control | exists, not shared | **Extract** `components/ui/segmented-control.tsx` from `workspace-view-toggle.tsx` (already an APG `radiogroup` with roving focus) |
| Toggle chip       | new                | **Add** `components/ui/toggle-chip.tsx` — `aria-pressed`, CVA, for _independent booleans_                                          |
| Split button      | menu-button today  | **Restyle, do not re-architect** — see below                                                                                       |
| Checkbox          | exists             | **Extend** `CheckboxField` (`components/ui/form.tsx:85`) with `density="compact"` for inline/toolbar use                           |
| Brand mark        | new                | **Add** `components/layout/brand-mark.tsx` (tier 2 — it carries brand copy, which primitives may not)                              |
| Account chip      | new (replaces two) | **Add** `components/layout/account-chip.tsx` — avatar + `Menu` (theme, email, sign out)                                            |
| Search field      | exists             | **Reuse** `components/ui/search-field.tsx` for both the rail search and the toolbar filter                                         |
| Badge             | exists             | **Reuse** `components/ui/badge.tsx` — presentational only; it is not a toggle chip                                                 |

Two rules go into `COMPONENT_LIBRARY.md` alongside these:

- **`SegmentedControl` for mutually-exclusive choices; `ToggleChip` for independent
  booleans.** The reference violates this — its All / Clients / Projects / Plans rail
  filter is single-select and is drawn as chips. It ships as a `SegmentedControl`.
- **A chip is never the only cue.** `Critical` / `Hide done` / `Chain` are filters that
  change what is on screen; their pressed state must be announced and must also change the
  announced result count (the `LIBRARY_SCOPING` M6 precedent, WCAG 4.1.3).

**On the split button.** `AddActivityControl`
(`features/tsld/toolbar/tsld-toolbar-items.tsx:210`) is a single APG menu-button — one
button containing icon + label + caret — deliberately, because `<Toolbar>`'s roving
tabindex model is **one focusable stop per registry item**
(`components/ui/toolbar/Toolbar.tsx:165-171`, keyed on `data-toolbar-item`). A _true_
split button is two stops inside one item, which that model cannot express — the same
limitation ADR-0031's two-row amendment already documented when it deferred the 2×2 zoom
pad. We will therefore **give the menu-button the split-button's visual treatment (a
divider before the caret) without splitting the control**, and record "composite toolbar
stops" as a deliberate deferral in `docs/TOOLBAR_ROADMAP.md`. Shipping a real split button
would require amending the `<Toolbar>` primitive's focus model, which is out of scope for
a visual redesign and would put the ADR-0031 a11y gate back on the table.

The account chip is not cosmetic: it **deletes** the header's exposed user-email span
(`app-header.tsx:101-108`, 2.8:1) and the `variant="outline"` Sign out button
(line 109, 1.01:1) by moving both into a portalled `Menu` on `--popover`. Two of the five
listed defects are fixed by removing the elements that carried them. `button.tsx:13`'s
`outline` variant is still fixed independently (it must set `text-foreground`; a variant
that specifies a fill and inherits its ink is a bug wherever it lands).

### §4 — The canvas visual language

**The ground and the month bands are canvas; the ruler and the TODAY chip are DOM.** That
split is the decision, and it is what keeps the ≤ 4 ms budget safe.

**Ground.** `TsldCanvas.tsx:1226` currently paints the diagram container `bg-card`, and
`render/palette.ts:54` resolves `handleHalo` from `--color-card` with a documented
rationale ("the canvas ground… the theme-inverse of the `outline` foreground"). We add a
first-class `--canvas` token (with a `bg-canvas` utility), re-point both, and add
`--canvas-band`. The palette's `handleHalo` comment and `palette.test.ts`'s pinned
contrast pairs move with it — **the theme-inverse pairing argument is load-bearing for the
lag handle's legibility on every bar fill and must be re-proved, not assumed.**

**Month banding** is a new **layer -0.5** in `render/paint.ts`, below the non-working wash
(layer 0, line 770) and the gridlines (layer 1, line 781), so weekend columns still read
_on top of_ the band. Its cost is bounded and small: `calendarBoundaries()`
(`render/time-scale.ts:162`) is already called every frame for the month/year gridlines,
walks by integer date rollover with no per-day `Date` parsing, and returns O(visible
months) boundaries. Banding is therefore **(visible months + 1) `fillRect` calls, one
extra `fillStyle` assignment, and zero text** — reusing a walk the frame already pays for.
At year zoom across a decade that is ~120 rects. This is comfortably inside budget and is
the cheapest thing in the epic.

**The ruler stays DOM**, and gets its redesign in DOM. It is already updated imperatively
from the rAF loop off the same `viewRef` the painter uses (`TsldCanvas.tsx:930-946`, with
a pooled zero-allocation reconcile in `syncRulerRow`, line 436), so it costs the canvas
draw budget **nothing**. Moving it into the painter would add a `fillText` per visible day
number at day zoom — precisely the cost ADR-0026 §1 identifies as "the dominant cost, and
the first thing to collapse at 2,000 nodes" — in exchange for worse text rendering. The
reference's tiered ruler (year centred, month names, day numbers) and its alternating
month tint are three more absolutely-positioned rows in that same band.

**The TODAY chip is DOM**, in the ruler band, positioned from the same `todayOffset` and
`screenXOfDay` the painter uses for the dashed line (`paint.ts:1134-1146`). It is
`aria-hidden` and `pointer-events-none` like the rest of the ruler
(`TsldCanvas.tsx:1230-1232`), so it cannot swallow a pan gesture, and it clamps out of
existence when today is off-screen. The dashed vertical stays on canvas. Canvas cost:
zero.

**One boundary walk, not two.** `rulerTicks()` and `calendarBoundaries()`
(`time-scale.ts:108` and `:162`) are two implementations of the same month/year rollover.
With the ruler drawing month tints in DOM and the painter drawing month bands on canvas,
a one-day disagreement between them is a visible seam. They are unified onto a single
exported walk, with a test asserting band edges and ruler ticks land on identical day
offsets across the zoom range.

**Bars and links: constants, not decisions.** ADR-0052 M4/M5 already shipped rounded
corners (`BAR_RADIUS`), the hairline `barStroke`, the 2 px emphasis outline, arrowheads,
deterministic fan-out, rounded elbows, dashed lag runs and the weight/dash driving cue.
The honest assessment is that **the visible gap between this app and the reference
screenshot is ~90 % chrome, ground and ruler, and ~10 % bar shape.** So the re-opening of
ADR-0052 is scoped to a **constants-only pass** — `BAR_RADIUS`, `EMPHASIS_STROKE_W`, link
line widths, arrowhead size, and the band/ground values — expressed as named constants in
`render/render-model.ts`, with existing paint tests updated. Explicitly **out of scope**:

- **No new shape vocabulary.** The existing shapes each carry WCAG 1.4.1 meaning that
  colour does not: milestone diamond, square resize marks, triangle visual-conflict badge,
  stacked-squares lane-overlap badge, rising-histogram over-allocation badge, two-tone disc
  lag handle, hatched float/drift tails. A decorative shape added for looks will collide
  with one of them.
- **No per-bar shadow or blur.** ADR-0052 already rejected this; `shadowBlur` forces a
  full-quality rasterisation path per bar. The reference's soft shadows are DOM cards.
  Elevation on canvas stays stroke-approximated.
- **No per-bar gradients.** A `createLinearGradient` per bar per frame is an allocation
  per bar per frame. If a gradient fill is wanted, it is **one gradient object per fill
  colour, cached alongside the resolved palette** and invalidated on the `useThemeVersion`
  bump — never per bar. This is the only route to a gradient that survives the budget.

**How it is measured.** Three gates, extending the precedents already in the tree:

1. **A counting-stub unit gate**, modelled exactly on
   `render/paint.dates-budget.test.ts` (the ADR-0054 M3-T5 gate): assert month banding adds
   **≤ visibleMonths + 1 `fillRect` calls and exactly zero `fillText`/`measureText`**, at
   day zoom _and_ at year zoom across a ten-year span (the pathological case), on the
   2,000-activity fixture. Assert the _shape_ of the cost, not a wall-clock number — a CI
   runner's absolute timings are noise.
2. **A browser re-confirmation** on the ADR-0026 §16 hardware envelope (mid-tier laptop +
   iPad-class Safari), using the `prototypes/tsld-spike/` harness at 500 and 2,000
   activities under a scripted pan/zoom sweep, reporting draw median and **p95 against the
   ≤ 4 ms bar**, in **all four themes** (Corporate's ground and bands are new fill work
   that light/dark did not have). This is the enablement gate for the flag flip, and the
   one measurement CI cannot make.
3. **A flag-off paint parity test** per milestone (the ADR-0052/0054 discipline), so
   rollback is byte-for-byte.

### §5 — Enforcement: making the boundary hard to violate

- **No utilities for the `chrome`/`panel` families** (§1). The class does not compile.
- **A contrast unit test** (`styles/token-contrast.test.ts`) parses `globals.css`, and for
  each of the four theme blocks × each of the three scopes asserts every declared
  (fill, ink) pair clears **4.5:1 for text and 3:1 for non-text/boundaries**, converting
  OKLCH → sRGB. This is the guard that actually prevents recurrence: every defect in the
  Context section is a contrast defect that no reviewer caught by reading class names. The
  computation precedent already exists in `render/lenses.test.ts` and
  `render/palette.test.ts`.
- **A structural seam test** asserting no file outside `styles/globals.css` and
  `components/ui/surface.tsx` mentions `--chrome`/`--panel`/`data-surface` (the ADR-0053
  "seam-set test" precedent).
- **An ESLint `no-restricted-syntax`** rule rejecting `style={{ ... }}` colour literals and
  raw `#`/`rgb(`/`oklch(` in `className` under `apps/web/src/components` — the standing
  "no one-off styling" rule, finally given teeth.
- **Playwright + `@axe-core/playwright`** over the shell in **all four themes**, asserting
  the five named defects specifically (nav idle, nav hover, nav current-page, account chip,
  rail muted text) rather than only "axe is clean".

### §6 — Scope and flags

Frontend-only. **No API, DTO, `@repo/types`, schema or CPM-engine change**, and no code
path from any of it back into `computeSchedule` — the ADR-0034 recalc parity gate is
structurally untouched, as it has been for every canvas ADR since 0026.

Two flags, because the two halves have different blast radii and different rollback
stories:

- **`VITE_DESIGNED_CHROME`** — the shell chrome band, the toolbar slot, the panel rail and
  the new primitives' chrome treatment. Flag-off renders today's shell byte-for-byte.
- **`VITE_CANVAS_VISUAL_LANGUAGE`** — the canvas ground, month banding, the redesigned
  ruler and the TODAY chip. Flag-off paints byte-for-byte (the parity paint test).

**The §1 token architecture and the defect fixes are NOT behind a flag.** They are an
accessibility fix, and gating an accessibility fix behind an in-progress redesign is how it
ends up shipping in six weeks instead of one. They are safe to land unflagged because at
that point `--chrome-*` in Light and Dark is valued **identically to today's
`--background`/`--foreground` family** — so Light and Dark are byte-identical and only
Corporate changes (from broken to correct). The all-themes _values_ land later, deliberately
(see §8).

### §7 — What this ADR does not change

ADR-0026's Canvas-2D choice, layering, culling, coordinate/viewport model and parallel
focusable DOM a11y layer. ADR-0029's URL-derived selection and mounted-once shell.
ADR-0030's resizable panels. **ADR-0031's registry contract** — the taxonomy, tiers,
overflow rule, pen-gating and roving-tabindex model are untouched; only where the rendered
`<Toolbar>` lands in the DOM changes. ADR-0052's Canvas-2D, no-shadow, token-only-colour
and retained-non-colour-cue decisions. The engine, the API and the parity gate.

### §8 — Where we are pushing back on the brief

Recorded here rather than quietly complied with, because each is a decision the product
owner should take knowingly.

1. **"All four themes change visibly" is the right end state, delivered in the wrong
   order.** We will build the chrome _structure_ for all four themes immediately, but hold
   Light's grey and Dark's near-black **values** until the enablement milestone, as a
   separately-reviewed change. Reason: flipping the structure and the values together makes
   every flag-off parity suite meaningless on the day it is most needed, and turns one
   reviewable diff into two entangled ones. The end state is unchanged; only the ordering
   is.
2. **The reference's white fields on navy are Corporate-specific.** A white field is right
   on navy and on grey; on Dark's near-black chrome it is a glare source. `--chrome-field`
   is therefore a **per-theme** value (light island in Corporate and Light, raised-dark in
   Dark), not a literal white. If the owner wants literal white everywhere, that is a
   deliberate Dark-theme regression and should be recorded as such.
3. **The reference's toolbar contradicts three shipped ADR-0031 amendments.** Its five
   separate Day/Week/Month/Quarter/Year buttons were consolidated into one `Zoom ▾`
   dropdown by the 2026-07-14 amendment **for a measured reason** — the Frame group was wide
   enough that width-driven overflow demoted tail items, so controls appeared to come and
   go. Reverting to five buttons re-creates that. If it is wanted, it must be a
   `SegmentedControl` registry item with the width risk re-accepted and re-measured, in a
   documented amendment.
4. **Do not ship the Gantt | Network segmented control.** The 2026-07-15 amendment §5 made
   the view-mode slot a genuinely hidden stub _because a second view does not exist_. A
   segmented control whose second option is inert is a lie in the primary command surface.
   It returns when a Network view does.
5. **"Hide done" is a new capability, not chrome.** `Critical` and `Chain` already exist
   (`VITE_CANVAS_LENSES`, `VITE_CANVAS_NAV`); a completed-activity filter does not, and
   needs its own spec rather than arriving as a pixel in a screenshot.
6. **Re-opening ADR-0052 buys little.** Its bar/link refresh is recent, measured and
   already rounded, hairlined, arrowheaded and fanned out. Constants-only (§4) captures
   nearly all the available gain for nearly none of the risk; a full re-do would re-open a
   WCAG 1.4.1 shape vocabulary that took three milestones to get right.

## Alternatives considered

- **A `chrome-*` utility family applied explicitly at each call site** (`bg-chrome`,
  `text-chrome-muted-foreground`, plus `variant="chrome-ghost"` on `Button`). The obvious
  build. **Rejected:** it multiplies every interactive primitive's variant matrix by the
  number of surfaces, cannot reach _inherited_ text at all (the header's plain `<span>`s),
  and makes "which surface am I on?" a fact each call site must remember — which is exactly
  the failure mode that produced all five listed defects. It also cannot be enforced; a
  forgotten `text-muted-foreground` still compiles and still looks fine in three of four
  themes.
- **A React `SurfaceContext` + `useSurface()` that components branch on in JS.**
  **Rejected:** `FRONTEND_ARCHITECTURE.md` ("Theme management") states outright that
  components never branch on theme in JS — tokens flip automatically. It would force every
  primitive to become surface-aware, cannot colour inherited text, adds a re-render on
  every surface change, and does nothing for the canvas painter, which reads computed
  values off the DOM anyway.
- **Per-theme overrides scoped by `.corporate .app-header { … }`.** **Rejected:** it
  encodes the _theme_ into the _component_, so every future theme re-opens every chrome
  component, and it is precisely the "no one-off styling" violation ADR-0006 exists to
  prevent.
- **Hoisting the plan toolbar's state into the shell so the band is one component.**
  **Rejected:** `usePlanWorkspaceModel` owns the plan queries, the pen/RBAC gating matrix
  and the TSLD callbacks; lifting it into `_authed` would make the shell plan-aware,
  contradicting ADR-0029's "the shell mounts once and knows only the URL", and would
  re-render the shell (and the rail) on every plan-state change. The portal keeps the React
  tree, the context and the registry exactly where they are.
- **Leaving the toolbar inside `<main>` and accepting an L-shaped band** (navy header
  full-width, navy toolbar only to the right of a light rail). Cheapest, and avoids the
  portal and the keydown-scope problem entirely. **Rejected** because it does not deliver
  the brief's single continuous top region, and because the resulting corner where three
  surfaces meet is exactly the kind of unresolved junction that reads as "not designed".
  It remains the fallback if the keyboard-scope work proves worse than estimated.
- **Moving the date ruler into the Canvas 2D painter** so band and ruler are one artefact.
  Tempting for the pixel-agreement problem §4 has to solve with a shared walk.
  **Rejected:** it spends the scarcest budget in the app (per-frame `fillText`) on the one
  thing DOM does better, for a problem a shared function solves for free.
- **A single `VITE_DESIGNED_UI` flag for chrome and canvas.** **Rejected:** the two halves
  have unrelated failure modes (focus/keyboard vs. draw budget) and unrelated reviewers; one
  flag means one can't be rolled back without the other.
- **Fixing the five contrast defects individually and shipping the redesign separately.**
  **Rejected:** each fix would be a call-site `className` override — a one-off styling
  violation — and the redesign would immediately create more of the same class. The defects
  are a symptom; the missing surface family is the disease.

## Consequences

**Positive.**

- The chrome/canvas boundary becomes a _structural_ fact with no utilities to violate it,
  rather than a convention. Every existing primitive works correctly on every surface with
  no change.
- Five verified WCAG failures are fixed in one place, and a computed contrast test makes
  their recurrence a failing build rather than a review miss.
- Two of the five are fixed by _deleting_ the offending elements (the exposed email and the
  invisible outline button) in favour of an account chip — less code, better hierarchy.
- The toolbar registry, the shell's mount-once property, the URL-as-selection rule, the
  canvas architecture and the recalc parity gate are all untouched.
- Month banding costs a walk the frame already performs; the ruler and TODAY chip cost the
  draw budget nothing at all.
- A fourth or fifth theme becomes a block of values, not a code change.

**Negative / accepted.**

- **The portalled toolbar breaks two native keydown scopes** (`?`, undo/redo) and must be
  re-scoped as part of the same change, with regression tests. This is the single riskiest
  item in the epic and the reason chrome is its own flag.
- **The rail changes colour in Corporate** (navy → light panel). Users of the Corporate
  theme will notice; it is intended, and it is a token-value change, not a structural one.
- **Two token families are retired** (`--app-header-*` immediately, `--sidebar-*` after one
  release with aliases). Any downstream override of those names breaks.
- **`Input` and friends move to `bg-field`.** Byte-identical at `:root` by construction, but
  it touches five primitives and their snapshots.
- **`--canvas` re-points `handleHalo`** (`render/palette.ts:54`), whose theme-inverse
  contrast pairing is pinned in `palette.test.ts`. That pairing must be re-proved against
  the new ground in all four themes, not assumed.
- The band's height changes between "plan open" (three rows) and "no plan" (one row),
  which resizes the workspace region on navigation. ADR-0030's viewport-preserve amendment
  already makes a canvas resize non-reframing, so this is absorbed — but it must be
  asserted, because a re-fit on every plan open would be a visible regression.

**Neutral / follow-ups.**

- `docs/DESIGN_SYSTEM.md` gains a **Surface scopes** section (the table in §1, the three
  families, the "families with no utilities" rule) and the `SegmentedControl` / `ToggleChip`
  / `Surface` entries in the component inventory.
  `docs/COMPONENT_LIBRARY.md` gains the two usage rules from §3 and the `Surface` contract.
  `docs/FRONTEND_ARCHITECTURE.md`'s "Theme management" gains the scope mechanism and the
  **`@theme inline` is load-bearing** warning. CLAUDE.md §16 and `docs/adr/README.md` gain
  this ADR (the index is also missing 0030–0037, 0046–0048 and 0054 — worth fixing in the
  same pass).
- `docs/TOOLBAR_ROADMAP.md` gains **composite toolbar stops** (the true split button, the
  2×2 zoom pad) as a documented deferral.
- Deferred to their own work: the "Hide done" filter (§8.5); a Network view and the
  view-mode segmented control (§8.4); a Gantt lens; the reference's floating bottom-right
  panel and "All changes saved" toast — the app has **no toaster primitive today**, so that
  is a genuine new primitive with its own live-region and dismissal contract, not a pixel.

## References

- Governing docs: `docs/DESIGN_SYSTEM.md` (tokens, Corporate theme, contrast rules),
  `docs/FRONTEND_ARCHITECTURE.md`, `docs/UX_STANDARDS.md`, `docs/COMPONENT_LIBRARY.md`,
  `docs/FRONTEND_QUALITY.md`; CLAUDE.md §12/§13/§15.
- Amends: ADR-0006 (§1), ADR-0026 (§4 — ground, band layer, DOM-ruler confirmation),
  ADR-0029 (§2 — the shell gains a chrome region above the rail row), ADR-0052 (§4 —
  constants-only).
- Builds on: ADR-0030, ADR-0031, ADR-0033, ADR-0049, ADR-0054.
- Token implementation: `apps/web/src/styles/globals.css` (`:root` 27-110, `.dark`
  115-170, `.corporate` 196-261, `@theme inline` 266-320).
- Defect sites: `apps/web/src/components/layout/app-header.tsx:13-14,39,101-123`;
  `apps/web/src/components/ui/button.tsx:13-14`;
  `apps/web/src/components/layout/navigator/navigator-rail.tsx:95`;
  `apps/web/src/features/system/components/AppVersionLine.tsx:17`;
  `apps/web/src/features/navigator/components/HierarchyTree.tsx:302-305`.
- Shell / toolbar seams: `apps/web/src/components/layout/navigator/app-shell.tsx:86-129`;
  `apps/web/src/components/layout/workspace/plan-workspace-toolbar.tsx:153-166,268-275,473-491`;
  `apps/web/src/components/ui/toolbar/Toolbar.tsx:165-171,234-309`.
- Canvas seams: `apps/web/src/features/tsld/components/TsldCanvas.tsx:98-107,430-459,930-946,1225-1255`;
  `apps/web/src/features/tsld/render/paint.ts:755-800,1130-1146`;
  `apps/web/src/features/tsld/render/time-scale.ts:108-189`;
  `apps/web/src/features/tsld/render/palette.ts:12-56`.
- Measurement precedents: `apps/web/src/features/tsld/render/paint.dates-budget.test.ts`
  (counting-stub budget gate), `prototypes/tsld-spike/` (ADR-0026 §9a browser harness).
- Architecture note (file map, sequencing, implementer checklist):
  `docs/specs/designed-ui/architecture-notes.md`.
