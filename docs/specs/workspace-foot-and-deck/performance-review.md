# Performance review — the foot row joins chrome, the deck gains a promoted lens

**Reviewer:** performance-reviewer · **Diff:** `git diff ceb351cf..HEAD -- apps/web/src` on
`claude/schedulepoint-project-setup-naacjj` · **Read first:** `m0-measurement.md` (authoritative
over `spec.md` where they disagree, per the epic's own note).

**Method.** Read the diff and its context; ran `pnpm --filter @repo/web build` (rolldown/Vite 8) at
`HEAD` and, in a separate `git worktree` at `ceb351cf`, to get real gzip byte counts rather than
reasoning about the icon/dependency graph from memory. Did not run a browser profiler (no Chrome
DevTools Performance trace was taken) — see §1, where that gap matters and is stated rather than
papered over.

**Verdict up front: pass.** Nothing here is a bundle, code-splitting or render-cost regression
worth blocking on. One item (§1) is a real question this review cannot fully close without a
profiler, and it is flagged as a suggestion with a concrete measurement recipe, not asserted as a
finding.

---

## 1. `<Surface tone="chrome">` on the foot row — style recalculation cost

`activity-bottom-panel.tsx:214-234` wraps `PlanActivitiesFootRow` in `<Surface tone="chrome">`
(previously a bare `<div>`). `Surface` (`components/ui/surface.tsx:99-116`) does nothing but set
`data-surface="chrome"` plus `bg-background text-foreground`; the CSS at
`globals.css:1033-1071` rebinds 29 custom properties on that selector (I counted the declarations
in that block directly — 29, not the ~31 estimated in the task, close enough that the discrepancy
is not interesting).

**What this costs, mechanically.** Custom properties are inherited like any other CSS property.
Setting `data-surface="chrome"` on this node does not, by itself, cause anything to recompute on
every re-render — the rebind is a static attribute-selector rule; it is evaluated once when the
node's attributes are set (i.e., once, since `tone="chrome"` never changes) and its resolved value
is then inherited by descendants exactly as any other custom property would be. The place a real
cost _could_ show up is narrower than "this subtree re-renders often": it is **first-time style
computation for newly-mounted nodes inside the scope**. Every time a child mounts here for the
first time (a `CanvasDock` transient strip appearing, a new `PlanFacts` leaf), the browser has to
resolve that node's `var(--background)`/`var(--foreground)`/etc. references, which means walking
the custom-property inheritance chain up to this node's rebind rather than to `:root`. That is one
extra level of indirection, not a variable-sized one, and it is paid once per newly-mounted node,
not once per re-render of already-mounted siblings.

**I have not profiled this, and I am not going to assert a number.** The honest way to settle it is
a Chrome DevTools Performance recording with "Recalculate Style" broken out, comparing a selection
toggle (or a `Recalculate` cycle) before and after this change, ideally with CSS custom-property
inheritance debugging (`chrome://inspect` doesn't show this cleanly; the practical proxy is the
"Recalculate Style" line's node count and duration in a trace). I would expect it to be immeasurable
against frame-budget noise, for one concrete, checkable reason rather than intuition: **this
repository already runs the identical mechanism on a much busier subtree.** `chrome-band.tsx:79`
wraps the header **and the entire command deck** — ~28-38 toolbar items whose `isActive`/
`isEnabled`/`disabledReason` predicates re-evaluate on every selection, schedule-state and pen
transition, plus the same `CanvasDock` portal outlets — in the same `<Surface tone="chrome">`
mechanism, and it has shipped default-on since Graphite (ADR-0099) with five subsequent
performance-adjacent gate passes (ADR-0090/0091/0092/0094/0109) and no recorded style-recalculation
finding anywhere in `docs/TECH_DEBT.md`. The foot row is a strict subset of that surface's content
(a facts list, one dock outlet, one collapse button) rebinding the identical 29 properties. If the
pattern were a measurable cost, the header/deck instance is where it would already have shown up,
under load this new instance cannot exceed.

**Suggestion, not blocking:** if this is ever worth confirming with a number, the recipe is above.
I would not spend the time before shipping — there is a much stronger prior (an already-shipped,
busier instance of the exact same mechanism) than there was reason to invent a new risk.

---

## 2. `clearPlacementApplies` threading through `TsldPanel` — memo dependency widening

Traced the full path: `plan-workspace-toolbar.tsx:715,856` (`clearVisualPlacementApplies({...})`,
a plain boolean-returning function, `conflict-remedy.ts` — new export, `Pick<...,
'schedulingMode'>` in, `boolean` out) → `TsldPanel.tsx:435` (prop) → `TsldPanel.tsx:552` (destructure)
→ `TsldPanel.tsx:1419` (into `buildSelectionBarContext`'s input) and `TsldPanel.tsx:1441` (into
the `useMemo` dependency array at `TsldPanel.tsx:1407-1451`) → `build-selection-context.ts:59,120`
→ `selection-actions.tsx:104,754` (`isVisible: (ctx) => ctx.clearPlacementApplies`).

**No memo is defeated.** `clearPlacementApplies` is a **primitive `boolean`** at every hop, not an
object or array — React's dependency-array comparison is `Object.is`, and a boolean compares by
value, so this cannot cause the `selectionCtx` `useMemo` to recompute any more often than
`clearPlacement` (already an object, already in that same array, already recreated fresh every
render at the call site — see below) already does. Adding it to the dependency array is exactly
correct and does not widen anything in a way that matters.

**The pre-existing situation this rides on, unchanged by this diff:** `clearPlacement` itself
(`plan-workspace-toolbar.tsx:711-718` and `:849-855`) is a **new object literal on every render**
of `ToolbarPlanWorkspace`, built by calling `clearVisualPlacementGate({...})` inline in JSX/object
props rather than being memoized. That means the `selectionCtx` `useMemo` inside `TsldPanel`
recomputes on every render of its parent regardless of whether `clearPlacementApplies` exists —
this diff adds a boolean to an already-perpetually-invalidated memo. It is not a regression this
diff introduces; it is a pre-existing (and, per the `Toolbar.tsx:104-106` comment on the sibling
primitive, apparently accepted) pattern that nothing downstream of `selectionCtx` is itself
`React.memo`'d (`SelectionActionsBar`, `selection-actions.tsx`, has no `memo()` wrapper), so a
stable reference for `selectionCtx` would have nothing to be compared against anyway. Worth naming
so nobody reads the `useMemo` at `TsldPanel.tsx:1407` as a real render-skipping boundary — it is not
one today, with or without this diff — but not something this diff makes worse. **Suggestion, not
blocking**, filed for whoever next touches this area: if `clearPlacement`/`clearPlacementApplies`
are ever hoisted to their own memo (keyed on `schedulingMode`, `canEditSchedule`,
`lateOverlayActive`, `scheduleRefusal`), `selectionCtx` would gain a real stability boundary — but
that is only worth doing once something downstream is actually `React.memo`'d to benefit from it,
per the existing sibling comment's own reasoning.

**`schedulingMode` derivation (`plan-workspace-toolbar.tsx:263`).** Confirmed against
`ceb351cf`: the ternary `plan?.schedulingMode === 'VISUAL' ? 'VISUAL' : 'EARLY'` was written out
inline, four times, at none of which it sat inside a `useMemo` (two were inline in JSX props at
`:694` (old) and one further inline literal in a plain object at `:830` (old), neither
memo-wrapped). Hoisting it to one `const` computed once per render (`:263`) is strictly cheaper —
a trivial string comparison run once instead of up to four times per render — and does not move
any computation _out_ of a memo, because none of the four call sites were ever inside one. This is
a correctness/DRY fix (ADR-0073 C4 / ADR-0094 M0 shape, as the docblock says) with a small,
positive performance side-effect, not a regression.

---

## 3. `plan-facts.tsx` wrapper `<div>` — extra DOM node

`plan-facts.tsx:139` (`<div className="flex max-w-64 flex-wrap items-center gap-x-4 gap-y-0">`)
wraps `<FactList>`. Confirmed by tracing callers (`plan-status-bar.tsx:44` → `<PlanFacts {...props}
/>` is the only production call site of `PlanFacts`, and `PlanFacts` is the only caller of
`FactList`) that this renders **once per plan status row** — it is not inside
`ActivitiesTable`'s virtualized rows, not inside a loop, and not repeated per activity. One extra
`<div>`, no `@container` (that treatment was explicitly withdrawn per the comment at
`plan-facts.tsx:109-127` and the new wrapper carries no containment class), no new context
subscription. Not a performance concern at any level of scrutiny.

---

## 4. `Baseline overlay` promoted onto the always-rendered deck

`tsld-toolbar-items.tsx:241-257` adds `promotion: { icon: <Layers className="size-4" />, order:
23 }` to the `baseline-overlay` lens toggle. Two things make the "per-render work" concern smaller
than it looks:

1. **The item list itself is built once, not per render.** `buildTsldToolbarItems()`
   (`tsld-toolbar-items.tsx:1969`) is called at `plan-workspace-toolbar.tsx:320` as
   `useMemo(() => buildTsldToolbarItems(), [])` — an **empty dependency array**. Promoting an item
   changes the one-time array `buildTsldToolbarItems()` returns; it does not add a per-render
   allocation or per-render array-construction cost. This mechanism (`promotion` + `lensTogglesIn`
   filtering, `tsld-toolbar-items.tsx:337-371`) already promotes two other lens toggles (`resources`
   at `:286`, `minimap-open` at `:317`, both pre-existing before this diff) — this is the third use
   of an established path, not new machinery.
2. **What _does_ run every render is `resolveItems`** (`toolbar-registry.ts:501-528`, called from
   `Deck`/`Toolbar` per render), which filters, sorts and maps the **whole** item array — now 28
   items where it was 27 (I count 3 currently-promoted lens toggles among ~38 total registry
   entries across both `View ▾` and deck placements; the deck's own rendered subset is the smaller
   number the task cites). This is a `.filter().sort().map()` over a few dozen plain objects calling
   trivial closures (`t.checked(ctx)`, `t.reason(ctx)` — simple field reads/comparisons, no I/O, no
   loops over activities). One more array element in a sort over ~30 is not a measurable addition
   against frame budget; there is no `ResizeObserver`, no `clientWidth` read, no text measurement in
   this path any more — that whole width-ladder machinery was deleted in ADR-0109
   (`Toolbar.tsx:64-79`'s own docblock records this explicitly), which is the load-bearing fact here:
   the thing that used to make "one more toolbar item" expensive (a synchronous DOM measurement
   pass) no longer exists.

**What genuinely changes, and is worth naming rather than dismissing:** before this diff,
`baseline-overlay`'s `checked`/`reason`/`toggle` closures only ran while `View ▾`'s popover was
open (a `Menu`/`Dialog` that mounts on demand). After, they run on every Deck render regardless of
whether anyone has ever opened that popover. Given point 2 above (a handful of trivial predicate
calls, no measurement, no DOM read), this is not worth blocking on — but it is the correct
generalisation of the question ("does the _existence_ of the button change per-render cost, not
just its promotion mechanism") and the answer is yes, by a de minimis amount consistent with the
other ~27 items already doing the same thing.

---

## 5. Bundle — measured, not assumed

`git diff ceb351cf..HEAD -- package.json pnpm-lock.yaml apps/web/package.json` is empty: **no
dependency was added, removed or re-pinned.** Confirmed `Layers` (used for the new `promotion` icon
at `tsld-toolbar-items.tsx:257`) was already imported and rendered in this same file before this
diff (`git show ceb351cf:...:1283`), so no new `lucide-react` icon module enters the graph.
`SquarePen`'s only removed import (`plan-summary-panel.tsx`) is still imported and used in
`plan-workspace-toolbar.tsx`, `plan-actions-menu.tsx` and `selection-actions.tsx`, so that icon
module stays in the bundle regardless — the net icon-import effect is genuinely zero modules, not
just "small."

**Measured the actual build**, base vs. head, in a `git worktree` at `ceb351cf` built with the same
toolchain (symlinked `node_modules` and workspace `packages/*/dist`, `pnpm build` = `tsc --noEmit &&
vite build`, both succeeded cleanly):

| asset                    | `ceb351cf` | `HEAD`    | delta     |
| ------------------------ | ---------- | --------- | --------- |
| main JS (raw bytes)      | 1,313,302  | 1,313,363 | **+61 B** |
| main JS (gzip -9, exact) | 380,348    | 380,412   | **+64 B** |
| CSS (raw bytes)          | 79,855     | 79,851    | **−4 B**  |

(Exact byte counts via `ls -la`/`gzip -9 | wc -c` on the built artefacts, not the rounded kB figures
`vite build`'s own reporter prints.) A +64-byte gzip delta for five commits touching ~24 files is
noise — consistent with "no dependency added" and with ADR-0107's own precedent of a +74-byte
gzip change being the falsification bar for "does this matter" on a bundle-size question in this
codebase. **Not blocking; confirmed rather than assumed, per the ask.**

---

## 6. The `measure-toolbar` harness estate cannot reach the production bundle

Checked three independent ways, because "confirm" was the instruction:

1. **No caller in `src/`.** `grep -rn "measure-toolbar" apps/web/src apps/web/index.html` returns
   nothing — nothing under the app's source tree imports anything from
   `apps/web/measure-toolbar/`.
2. **The build's only entry point is `src/main.tsx`.** `index.html:39` has exactly one
   `<script type="module" src="/src/main.tsx">`; `vite.config.ts` sets no
   `build.rollupOptions.input` that would add a second entry. Vite/Rolldown only bundles what is
   reachable from an entry point's static/dynamic import graph, and `measure-toolbar/*.spec.ts`
   files are not reachable from `main.tsx` by any import.
3. **The measured build confirms it directly.** The actual `pnpm build` output above shows a
   +64-byte gzip delta for the whole diff. `measure-toolbar/` gained several new spec files in this
   diff (`m0-*.spec.ts`, `m1-*.spec.ts`, etc. — dozens of KB of TypeScript); if any of that were
   reachable from the app entry, the delta would be many kilobytes, not 64 bytes. The build itself
   is the falsification test, and it passed.

Separately: `measure-toolbar/` is typechecked (via the `measure-*/**/*` glob in
`tsconfig.app.json`'s `include`, added for the reason its own comment gives — a hand-maintained
list silently omits new suites) and run only via `playwright test --config
playwright.measure-toolbar.config.ts` (`package.json:26`, `measure:toolbar`), which drives a
Node.js Playwright process against `pnpm dev`. That config is not referenced anywhere in
`.github/workflows/`, confirming it is a hand-run harness, not a CI gate — consistent with its own
docblock ("A measurement harness, not a gate"). None of this is a bundle-size question the way the
task worried it might be; the failure mode that would matter (harness code ending up in `dist/`)
is structurally impossible given a single, static entry point, and the measured build corroborates
it.

---

## Summary

| #   | Question                                             | Finding                                                                                                                                                                                                                                                            |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `Surface tone="chrome"` style recalc on the foot row | Not measured with a profiler; expected negligible because the identical mechanism already runs, unmeasured-as-a-problem, on a busier subtree (the header+deck). Suggestion: profile if ever in doubt, recipe given.                                                |
| 2   | `clearPlacementApplies` memo widening                | No memo defeated — it's a boolean at every hop. Rides an existing, already-unmemoized `clearPlacement` object recreation; not a regression. `schedulingMode` hoist reduces redundant computation, moves nothing out of a memo (none of the 4 sites were memoized). |
| 3   | `plan-facts.tsx` wrapper `<div>`                     | One extra node, once per status row, not virtualized, not looped. Non-issue.                                                                                                                                                                                       |
| 4   | Baseline overlay promoted to always-rendered deck    | Item list built once (`useMemo([])`), not per render. Per-render cost is one more cheap predicate evaluation in an already-existing `.filter/.sort/.map` over ~30 items, with no DOM measurement in the path (deleted by ADR-0109). De minimis.                    |
| 5   | Bundle                                               | Measured: **+64 bytes gzip** on the main chunk, **−4 bytes** on CSS. No dependency changes (confirmed via lockfile diff). Confirmed, not assumed.                                                                                                                  |
| 6   | `measure-toolbar/` harness estate                    | Cannot reach the bundle — no import from `src/`, single static entry point, and the measured build (+64 B) directly falsifies the failure mode. Not run in CI.                                                                                                     |

**Verdict: pass.** No blocking findings. One suggestion (§1, profile-if-in-doubt) recorded for
completeness; everything else is either measured-negligible or structurally incapable of being a
cost.
