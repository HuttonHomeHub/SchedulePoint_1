# Designed UI — frontend architecture notes

> Companion to [ADR-0055](../../adr/0055-designed-chrome-and-canvas-visual-language.md).
> The ADR records _what_ we decided and _why_; this note is the implementer's map — the
> concrete file layout, the sequencing, the risks, and the checklist. It is not a feature
> spec: the delivery-process artefacts (`feature-spec.md` / `implementation-plan.md`,
> `docs/PROCESS.md` §21) are still owed before code is written.

## 1. The problem in one paragraph

The app has one semantic token vocabulary and it is tuned for the page/canvas surface.
Chrome has a stub family (`--app-header-{,foreground,border}`) and the rail has another
(`--sidebar-*`), and neither has a muted-foreground, a coloured-ink token, a field surface
or a hover-accent validated against its own fill. Light and dark hid this because
`--app-header` is byte-identical to `--background` (`globals.css:32` vs `:91`) and
`--accent` to `--sidebar-accent` (`:48` vs `:100`). Corporate diverges, so the bug
surfaced. The redesign makes the divergence permanent and extends it to every theme, so
the fix has to be the vocabulary, not the call sites.

## 2. Token architecture at a glance

Three surface scopes, one vocabulary, rebound at the boundary.

```
:root / .dark / .corporate          declare THREE families:
  --background … --ring               the page family      (has utilities)
  --chrome-*                          the chrome family    (NO utilities)
  --panel-*                           the panel family     (NO utilities)
  --canvas, --canvas-band             the diagram ground   (has utilities)
  --field, --field-foreground         NEW page-level pair  (has utilities)

@theme inline { … }                 maps ONLY the page family + canvas + field
                                    → chrome/panel are unreachable from a class

[data-surface='chrome'] { --background: var(--chrome); --muted-foreground: … }
[data-surface='panel']  { --background: var(--panel);  --muted-foreground: … }
```

Why it works with no component changes: `@theme inline` (`globals.css:266`) compiles
`bg-background` to `background-color: var(--background)` — the _referenced_ variable, not a
`:root`-resolved indirection. Custom properties inherit, so redeclaring `--background` on a
subtree changes every utility beneath it. **Dropping `inline` from that block breaks this
entire design** — put it in the review checklist.

Rebound in `chrome`: `--background`, `--foreground`, `--muted-foreground`, `--border`,
`--input`, `--accent`, `--accent-foreground`, `--primary`, `--primary-foreground`,
`--field`, `--field-foreground`, `--destructive-text`, `--warning-text`, `--info-text`,
`--ring`. Deliberately **not** rebound: `--popover*`, `--card*` (overlays and raised
content belong to the page, and portalled surfaces are outside the scope anyway).

Defect → fix mapping, so nothing is fixed twice:

| #   | Site                                              | Measured    | Fixed by                                                                         |
| --- | ------------------------------------------------- | ----------- | -------------------------------------------------------------------------------- |
| 1   | `app-header.tsx:13-14` nav idle                   | 2.8:1       | scope rebinds `--muted-foreground` (no file change)                              |
| 2   | `app-header.tsx:13-14` nav hover / current page   | 1.26:1      | scope rebinds `--foreground` (no file change)                                    |
| 3   | `app-header.tsx:109` Sign out `variant="outline"` | 1.01:1      | element deleted → `AccountChip`; **and** `button.tsx:13` gains `text-foreground` |
| 4   | `app-header.tsx:103` user email                   | 2.8:1       | element deleted → `AccountChip` menu (on `--popover`)                            |
| 5   | `navigator-rail.tsx:95`, `AppVersionLine.tsx:17`  | 2.8:1       | `panel` scope rebinds `--muted-foreground`                                       |
| 6   | `HierarchyTree.tsx:302-305`                       | 2.5:1       | `panel` scope rebinds `--muted-foreground` / `--destructive-text`                |
| 7   | `button.tsx:13-14` ghost/outline hover            | wrong token | scope rebinds `--accent` / `--accent-foreground`                                 |

Note that #3 needs **both** halves. `variant="outline"` specifying a fill and inheriting
its ink is a bug on any surface; fix it even though the element that exposed it is going
away.

## 3. File map

**New**

```
apps/web/src/components/ui/surface.tsx              <Surface tone="chrome"|"panel">
apps/web/src/components/ui/surface.test.tsx
apps/web/src/components/ui/segmented-control.tsx    extracted from workspace-view-toggle
apps/web/src/components/ui/segmented-control.test.tsx
apps/web/src/components/ui/toggle-chip.tsx          aria-pressed boolean chip
apps/web/src/components/ui/toggle-chip.test.tsx
apps/web/src/components/layout/brand-mark.tsx       amber tile + wordmark
apps/web/src/components/layout/account-chip.tsx     avatar + Menu (theme, email, sign out)
apps/web/src/components/layout/chrome/chrome-band.tsx    the shell's <Surface tone="chrome">
apps/web/src/components/layout/chrome/chrome-slot.tsx    slot node + <ChromePortal>
apps/web/src/components/layout/chrome/chrome-slot.test.tsx
apps/web/src/styles/token-contrast.test.ts          4 themes x 3 scopes, computed
apps/web/src/features/tsld/render/paint.band-budget.test.ts
```

**Changed**

```
apps/web/src/styles/globals.css        + 3 families, + --field/--canvas, + scope rules
apps/web/src/components/ui/button.tsx  outline gains text-foreground (bug fix)
apps/web/src/components/ui/input.tsx   bg-background -> bg-field text-field-foreground
   (…and textarea.tsx, select.tsx, search-field.tsx, combobox.tsx for consistency)
apps/web/src/components/ui/form.tsx    CheckboxField gains density="compact"
apps/web/src/components/layout/app-header.tsx        full-bleed; brand mark; account chip
apps/web/src/components/layout/navigator/app-shell.tsx   chrome band above the rail row
apps/web/src/components/layout/navigator/navigator-rail.tsx  panel surface; filter control
apps/web/src/components/layout/workspace/workspace-view-toggle.tsx  -> SegmentedControl
apps/web/src/components/layout/workspace/plan-workspace-toolbar.tsx  <ChromePortal>; key scope
apps/web/src/features/tsld/components/TsldCanvas.tsx   bg-canvas; ruler redesign; TODAY chip
apps/web/src/features/tsld/render/paint.ts             layer -0.5 month bands
apps/web/src/features/tsld/render/palette.ts           + monthBand; handleHalo -> --color-canvas
apps/web/src/features/tsld/render/time-scale.ts        one shared boundary walk
apps/web/src/config/env.ts             + VITE_DESIGNED_CHROME, + VITE_CANVAS_VISUAL_LANGUAGE
```

**Deliberately unchanged:** `components/ui/toolbar/*` (the ADR-0031 registry, primitive,
overflow and roving-tabindex model), `features/tsld/toolbar/tsld-toolbar-items.tsx`'s item
definitions, every route file's `max-w-6xl` centring, `render/render-model.ts`'s geometry.

## 4. The chrome band's structure

Today (`components/layout/navigator/app-shell.tsx:89-115`):

```
div.flex.min-h-dvh.flex-col
  AppHeader                       <- sticky, max-w-6xl centred (app-header.tsx:39)
  div.flex.min-h-0.flex-1
    rail | RailResizer | main > Outlet
                                    ^ the two <Toolbar> rows live in here,
                                      inside plan-workspace-toolbar.tsx:473-491
```

Target:

```
div.flex.min-h-dvh.flex-col
  Surface tone="chrome"           <- ONE band, full-bleed, sticky
    HeaderRow                       BrandMark · org nav · AccountChip
    ChromeSlot                      <- portal target; empty when no plan is open
  div.flex.min-h-0.flex-1
    Surface tone="panel" (rail) | RailResizer | main > Outlet
```

`ChromePortal` is a thin `createPortal` into the slot node, published through a context the
shell provides. The workspace keeps rendering `<Toolbar items={rows.look} …/>` unchanged;
only the DOM destination moves. The React tree — and therefore
`usePlanWorkspaceModel`, `useTsldToolbarContext` and every registry predicate — is
untouched.

**The one thing that will break, and must be fixed in the same PR.** Two native listeners
are attached to the workspace root and will stop seeing toolbar keystrokes once the toolbar
leaves that DOM subtree (React portals bubble through the React tree; native listeners do
not):

- `plan-workspace-toolbar.tsx:153-166` — the `?` shortcut (`root.addEventListener`).
- `plan-workspace-toolbar.tsx:268-275` — `useUndoRedoKeybindings({ rootRef, … })`
  (`Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z`, `Ctrl+Y`).

Fix: convert both to a **workspace keyboard scope** spanning the chrome slot _and_ the
workspace root — cleanest as React `onKeyDown` on the two roots (which works through the
portal), otherwise a hook that attaches to both nodes. Regression test per binding, with
focus placed on a toolbar control. ADR-0048's "undo must not trigger browser Back" and
`TSLD_EDITING_ENABLED`'s `Alt+←/→` note both live here — do not regress them.

**Alignment.** The band is full-bleed and `app-header.tsx:39`'s `max-w-6xl` goes; route
bodies keep theirs (17 occurrences, 10 files). Retire the comment at `app-header.tsx:37-38`
that promises the opposite — "chrome full-bleed, content measure-capped" _is_ the
resolution.

**Fallback if the keyboard scope proves nasty:** leave the toolbar in `<main>` and accept an
L-shaped band (see ADR-0055 Alternatives). Cheap, no portal, no keydown problem, but it
does not deliver the brief's continuous top region.

## 5. Canvas notes

- **Ground.** `TsldCanvas.tsx:1226` `bg-card` → `bg-canvas`. `render/palette.ts:54` resolves
  `handleHalo` from `--color-card` _specifically because it is the canvas ground and the
  theme-inverse of `outline`_ — re-point it to `--color-canvas` and **re-prove the pinned
  pairings in `palette.test.ts` in all four themes.** That inverse is what makes one lag
  handle legible on every bar fill; do not assume it survives a ground change.
- **Month bands = layer -0.5** in `paint.ts`, below the non-working wash (line 770) and the
  gridlines (line 781), so weekends read on top of the band. Reuse `calendarBoundaries()`
  (`time-scale.ts:162`) — the frame already calls it for month/year gridlines, it walks by
  integer rollover with no per-day `Date` parsing, and it returns O(visible months). Cost:
  ≤ (visibleMonths + 1) `fillRect`, one `fillStyle`, zero text.
- **Ruler stays DOM** (`TsldCanvas.tsx:1229-1246`, synced by `syncRulerRow` at :436 from the
  same `viewRef` the painter uses). It costs the draw budget nothing; moving it in would add
  a `fillText` per visible day number at day zoom — the exact cost ADR-0026 §1 calls the
  dominant one. Redesign it in DOM: tiered rows, alternating month tint, sticky-left labels
  (already implemented via `clampLeft`).
- **TODAY chip is DOM**, in the ruler band, from the same `todayOffset` + `screenXOfDay`
  the dashed line uses (`paint.ts:1134`). Keep `aria-hidden` and `pointer-events-none`
  (`TsldCanvas.tsx:1230-1232`) or it will swallow pan gestures. Clamp/hide off-screen.
- **Unify the two boundary walks.** `rulerTicks()` (`time-scale.ts:108`) and
  `calendarBoundaries()` (`:162`) independently compute month/year rollovers. With DOM tints
  and canvas bands both drawing from them, a one-day disagreement is a visible seam. One
  exported walk, one test asserting identical day offsets across the zoom range.
- **Bars/links: constants only.** `BAR_RADIUS`, `EMPHASIS_STROKE_W`, link widths, arrowhead
  size. **No new shapes** — the vocabulary (diamond, square resize marks, triangle conflict,
  stacked squares overlap, histogram over-allocation, two-tone disc lag handle, hatched
  float/drift tails) carries WCAG 1.4.1 meaning colour does not. **No shadows/blur** per bar
  (ADR-0052 already rejected it). **No per-bar gradients** — if a gradient is wanted, it is
  one cached object per fill colour, invalidated on the `useThemeVersion` bump
  (`render/use-theme-version.ts`), never per bar per frame.

### What I do not believe can be done inside the budget

| Wanted                       | Verdict           | Why                                                                                  |
| ---------------------------- | ----------------- | ------------------------------------------------------------------------------------ |
| Soft shadows on bars         | **No**            | `shadowBlur` forces full-quality rasterisation per bar; already rejected in ADR-0052 |
| Per-bar gradient fills       | **No** (as drawn) | an allocation per bar per frame; viable only as a cached-per-colour object           |
| Ruler day numbers on canvas  | **No**            | `fillText` per visible day at day zoom is the dominant ADR-0026 cost                 |
| Month bands                  | **Yes**           | reuses an existing per-frame walk; ≤ visibleMonths+1 `fillRect`, no text             |
| Cream ground                 | **Yes**           | one `fillStyle` / CSS background                                                     |
| TODAY chip                   | **Yes**           | DOM; zero canvas cost                                                                |
| Rounded corners / arrowheads | **Yes**           | already shipped and measured (ADR-0052 M4/M5)                                        |

### How to measure it

1. **Counting-stub unit gate**, modelled on `render/paint.dates-budget.test.ts`: on the
   2,000-activity fixture, assert banding adds ≤ visibleMonths+1 `fillRect` and **exactly
   zero** `fillText`/`measureText`, at day zoom _and_ year zoom over a decade. Assert the
   _shape_ of the cost, not milliseconds — CI timings are noise.
2. **Browser re-confirmation** on the ADR-0026 §9 envelope (mid-tier laptop + iPad-class
   Safari) via `prototypes/tsld-spike/`, 500 and 2,000 activities, scripted pan/zoom,
   reporting draw median and **p95 vs the ≤ 4 ms bar**, in **all four themes**. This is the
   flag-flip gate.
3. **Flag-off paint parity test** per milestone (the ADR-0052/0054 discipline).

## 6. Sequencing

```
S0  Token architecture + defect fixes            UNFLAGGED   ← land first, alone
      3 families, --field, --canvas, scope rules, <Surface>,
      button.tsx outline ink, inputs -> bg-field,
      token-contrast.test.ts, seam test, lint rule
      Chrome/panel VALUES in light+dark = today's => byte-identical there;
      Corporate goes from broken to correct. Ships on its own merit.

S1  Primitives                                    UNFLAGGED   ← parallel after S0
      SegmentedControl (extract + re-point WorkspaceViewToggle),
      ToggleChip, CheckboxField density, BrandMark, AccountChip
      Each a pure refactor/addition with tests; two people can split this.

S2  Chrome band structure          VITE_DESIGNED_CHROME       ← RISKIEST
      ChromeBand + ChromeSlot + ChromePortal, full-bleed header,
      workspace keyboard scope (the ? / undo-redo fix), focus-order test

S3  Rail as panel                  VITE_DESIGNED_CHROME       ← parallel with S2
      panel surface, filter SegmentedControl, tree accent bars, + Client button

S4  Canvas visual language   VITE_CANVAS_VISUAL_LANGUAGE      ← parallel with S2/S3
      ground + bands + unified walk + ruler redesign + TODAY chip
      + constants pass over bars/links

S5  Enablement
      light/dark chrome VALUES land here (deliberate, separately reviewed),
      specialist reviews, browser draw-budget measurement in 4 themes,
      axe in 4 themes, flag flips, docs + ADR index + CLAUDE.md §16
```

**Must land first:** S0. Everything else assumes the scopes exist, and S0 is the
accessibility fix — it must not be held hostage to a redesign.

**Can be parallel:** S1 alongside the tail of S0; S2/S3/S4 alongside each other once S0 and
S1 are in (they touch disjoint files — chrome shell, rail, canvas).

**Riskiest, in order:**

1. **The portalled toolbar's keyboard scope** (§4). Two shipped keybinding contracts break
   silently — silently is the problem. Regression tests before the portal lands.
2. **The all-themes value change** (S5). It invalidates every flag-off parity suite the day
   it lands if done together with S2. Hence the split.
3. **`handleHalo` on the new ground.** A quiet, real a11y regression if the theme-inverse
   pairing isn't re-proved.
4. **Band height changing on navigation** (three toolbar rows appear when a plan opens).
   ADR-0030's viewport-preserve amendment should absorb it; assert it, because a re-fit on
   every plan open would be an obvious regression.
5. **Product/ADR conflicts** (ADR-0055 §8) — the five zoom buttons, the Gantt|Network
   toggle, "Hide done". Resolve these _before_ S2, not during.

## 7. Implementer checklist

**Tokens**

- [ ] `--chrome-*` and `--panel-*` declared in all four theme blocks, **complete** families
      (fill, foreground, muted-foreground, border, accent+fg, primary+fg, field+fg,
      destructive/warning/info-text, ring)
- [ ] Neither family added to `@theme inline` — verify `bg-chrome` does not compile
- [ ] `--field` / `--field-foreground` added _with_ utilities, defaulting to
      `--background`/`--foreground` at `:root`
- [ ] `--canvas` / `--canvas-band` added with utilities
- [ ] `[data-surface='chrome'|'panel']` rules rebind exactly the list in ADR-0055 §1
- [ ] `@theme inline` still says `inline` (a review-blocking check)
- [ ] `--app-header-*` removed; `--sidebar-*` aliased + `@deprecated`, with a removal issue

**Components**

- [ ] `<Surface>` is the only way to apply a scope; nested same-tone fails loud in dev
- [ ] `button.tsx` `outline` sets `text-foreground`
- [ ] `Input`/`Textarea`/`Select`/`SearchField`/`Combobox` on `bg-field`
- [ ] `SegmentedControl` extracted; `WorkspaceViewToggle` re-pointed, tests preserved
- [ ] `ToggleChip` announces its pressed state _and_ the resulting result count
- [ ] Add split-button keeps **one** roving-tabindex stop (see ADR-0055 §3); composite
      stops recorded in `docs/TOOLBAR_ROADMAP.md`
- [ ] `AccountChip` puts email + sign out in a portalled `Menu`; focus returns to the trigger

**Shell**

- [ ] Chrome band is one `<Surface>`, full-bleed, above the rail row
- [ ] `<ChromePortal>` keeps the React tree; the registry and `<Toolbar>` are unedited
- [ ] `?`, `Ctrl+Z`, `Ctrl+Shift+Z`, `Ctrl+Y` fire with focus on a toolbar control — one
      test each
- [ ] Tab order: brand → nav → account → row 1 → row 2 → rail → workspace
- [ ] Rail still does not remount on a plan switch (ADR-0029's whole point)
- [ ] Route bodies keep `max-w-6xl`; the `app-header.tsx:37-38` comment is retired

**Canvas**

- [ ] Bands at layer -0.5, under the non-working wash
- [ ] One shared month/year boundary walk; band edges === ruler ticks (tested)
- [ ] TODAY chip `aria-hidden` + `pointer-events-none`, clamped off-screen
- [ ] `handleHalo` re-pointed and `palette.test.ts` pairings re-proved in four themes
- [ ] `PrintPalette` stays **total** — every painter field resolves, bands included
- [ ] No new shapes, no shadows, no per-bar gradients

**Gates**

- [ ] `token-contrast.test.ts`: 4 themes × 3 scopes, 4.5:1 text / 3:1 non-text
- [ ] Seam test: `--chrome`/`--panel`/`data-surface` appear only in `globals.css` +
      `surface.tsx`
- [ ] `paint.band-budget.test.ts` green at day _and_ year zoom
- [ ] Flag-off paint + shell parity suites, kept and pinned (the rollback contract)
- [ ] Browser draw-budget p95 ≤ 4 ms @ 2,000, four themes, recorded with method + hardware
- [ ] Playwright + axe across all four themes, asserting the seven named defects
- [ ] `pnpm lint && pnpm typecheck && pnpm test` green; changeset added

**Docs (same PR as the code they describe)**

- [ ] `DESIGN_SYSTEM.md` — Surface scopes section + inventory entries
- [ ] `COMPONENT_LIBRARY.md` — `Surface`, `SegmentedControl`, `ToggleChip` contracts and
      the "segmented vs chip" rule
- [ ] `FRONTEND_ARCHITECTURE.md` — the scope mechanism + the `@theme inline` warning
- [ ] `TOOLBAR_ROADMAP.md` — composite toolbar stops
- [ ] `docs/adr/README.md` index + CLAUDE.md §16 (the index is also missing 0030–0037,
      0046–0048, 0054 — fix in the same pass)

## 8. Open product questions (block S2)

1. Five zoom buttons vs the shipped `Zoom ▾` consolidation (ADR-0031 amendment 2026-07-14,
   consolidated for a _measured_ overflow-churn reason). If reverting: a `SegmentedControl`
   registry item, width risk re-accepted and re-measured, in a documented amendment.
2. Gantt | Network segmented control — recommendation: **do not ship** until a Network view
   exists (ADR-0031 amendment 2026-07-15 §5 made it a hidden stub for exactly this reason).
3. "Hide done" — a new filter capability needing its own spec, not chrome work.
4. Literal white fields on Dark's near-black chrome — recommendation: per-theme
   `--chrome-field`, not literal white.
5. Light/Dark chrome values — recommendation: land at S5, separately reviewed, so the
   parity suites stay meaningful through S2–S4.
