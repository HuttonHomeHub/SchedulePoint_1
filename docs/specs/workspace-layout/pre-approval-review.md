# Pre-approval review of the command-surface spec and plan

> The product owner asked that the spec and plan go through the review agents **before** approval,
> rather than at the M5 gate pass the plan schedules. Five specialists read
> `feature-spec.md`, `implementation-plan.md`, `m0-measurement.md` and `design.md`, plus the code.
> This document records what they found and what changed as a result. **No application code has been
> written.**
>
> Reviewing a _plan_ rather than a diff is unusual, and it earned its place immediately: the
> strongest finding below was reached **independently by two reviewers**, and it is a defect in the
> repair milestone — the one meant to ship on its own to fix a live production problem.

## The convergent finding — two reviewers, same defect, same group

**M1 proposes to measure the row's group chrome from the live DOM. Both `performance-reviewer` and
`component-reviewer` independently concluded that this creates a feedback loop, and both identified
the same trigger.**

The mechanism, stated the same way by both:

- M1-T3 puts a ref on each `role="group"` wrapper and reads `getBoundingClientRect()`.
- Those wrappers are rendered from `groups` (`Toolbar.tsx:300-311`), derived from `inlineBar`
  (`:232`), which is `bar.filter((r) => !overflowedIds.has(r.item.id))` — **filtered by the very
  state `computeOverflow` is about to set**. A measured chrome is therefore not an independent input
  to the decision; it is downstream of the previous decision.
- When a group's last inline member demotes, the group stops rendering and its
  `ml-1 border-l pl-2` rule (~13 px, `:331`) vanishes. The next pass sees a smaller chrome, has more
  budget, and can promote the item back — which recreates the rule, which shrinks the budget.

**The group this happens to is `help`, whose only two members are `legend` and `shortcuts`** — the
exact two items M0 measured as pointer-unreachable at 1920, and the two M1-T7 assigns the lowest
Row-1 priority, i.e. the first demoted whenever the row is tight. So the loop sits precisely at the
width the milestone exists to fix, not somewhere obscure.

`performance-reviewer` established the escalation path: `measure()`'s deps are
`[bar, demotable, autoLabelsFit]` (`:212`), **not** `overflowedIds`, so a `setOverflowedIds` alone
does not force a second pass — but a chrome change that flips `autoLabelsFit` does, and
`Toolbar.tsx:38-50`'s own docblock documents that toggle forcing a second pass. If that path is
taken the result is not a visible flicker but **a React re-render loop with no user interaction at
all**, each pass forcing a synchronous layout read of ~27 item boxes plus ~7 group boxes inside a
`useLayoutEffect`, on a page whose Canvas-2D paint is already 4–6× over its ADR-0065 budget.

The plan's stated mitigation — "deriving the chrome once per pass and holding it constant within
that pass", plus reuse of `widthCacheRef` — addresses a **different, already-solved problem**.
`widthCacheRef` (`:130-137`) damps a _demoted item's_ width collapsing to 0 because its node
unmounted; it says nothing about a _group wrapper_ disappearing. And intra-pass constancy says
nothing about whether pass N+1's chrome differs from pass N's.

### The resolution: compute the chrome, do not measure it

`performance-reviewer`'s recommendation, adopted:

Derive group chrome as a **pure function of the registry's static group membership** — which
`computeOverflow` already receives as `bar` — using named constants in the manner of the existing
`LABEL_CHROME_PX` (`Toolbar.tsx:23-29`), attributing the rule+gap saving to whichever demotion
empties a group of _all_ its bar members. This:

- removes the entanglement with `overflowedIds` **structurally**, rather than damping it;
- costs **zero** additional `getBoundingClientRect()`/`getComputedStyle()` calls per pass — the
  opposite direction from what M1-T3 proposed;
- is the same "derive, don't measure" argument `measureLabelWidth`'s docblock (`:41-46`) gives for
  why the _label_ loop was broken at the source, applied one level down.

The stated cost of computing — a constant that silently rots when a class changes — is covered by a
cheap structural string assertion plus the M1 browser gate itself, which is running anyway and fails
the moment a class change desyncs the constants from reality.

`component-reviewer` reached the same block from the API side and additionally required a
**stability assertion**: the four proposed gate checks are single snapshots and would pass on a
settled-but-wrong final state, missing a slow oscillation entirely.

## Blocking findings, by reviewer

### component-reviewer — 2 blocking

1. **No stabilising cache or convergence test for group chrome.** As above. Resolved by the
   compute-don't-measure decision plus the stability assertion.
2. **A primitive-tier task points at a consumer-tier component.** M2-T6 says to section the `⋯`
   "as the Add/Link/Export menus in the same file already are". **Verified independently:**
   `MenuSection` is a private, non-exported function at `tsld-toolbar-items.tsx:270` — a bare `<p>`
   with no ARIA role — and `components/ui/menu.tsx` exports only `useMenuTrigger`, `Menu` and
   `MenuItem`; the separators are hand-written inline per call site (`:388`). As written the task
   would make `components/ui/` either import from `features/` (a dependency-direction violation) or
   grow a copy. **It must extract `MenuSection` + a real separator into `menu.tsx` first.** Also
   unnoticed: `ToolbarOverflow` never receives `groupLabels` (`Toolbar.tsx:313` computes them and
   `:387-393` does not pass them down), so section headings need that prop threaded too.

Non-blocking but recorded rather than dropped: `selection-actions.tsx` renders the **same**
`<Toolbar>`, so the M1 fix propagates by construction — this specific fix structurally cannot become
the "one host and not its neighbour" bug this repository has shipped four times. But the floating
bar's own failure mode is different (it shrink-wraps to content and is only centre-clamped to the
viewport, `:358-361`), is covered by neither M0 nor the proposed gate, and post-M2 it can hold 8–9
`showLabel: 'always'` items. Out of scope, said so explicitly.

### ux-reviewer — all 7 earlier findings answered, 3 new blocking

**The most instructive: the fix for one finding recreates it one level down.**
`Toolbar.tsx:96-97` records that `lens` was named "Display" rather than "View" specifically so a
group named "View" would not contain a "View ▾" trigger. The plan adds a **`Plan ▾` trigger inside a
group whose accessible name is "Plan actions"** (`:102`), and M2-T6 overrides only **Row 1's**
`object` label — Row 2 is where `Plan ▾` lands. The group-name test must be extended from
group-vs-group to trigger-name-vs-containing-group-name.

**`Share & export ▾` can open a menu of nothing but refusals.** `export`/`print` gate on
`hasDiagram` (`tsld-toolbar-items.tsx:2492-2494`), `share` on `canShare` (Planner/Org-Admin only,
ADR-0051). So for **any Viewer or Contributor on a freshly created plan** — the state of every new
plan, not an edge case — all three shade simultaneously. ADR-0082 requires that a menu whose every
item would be shaded renders no trigger; the plan cites that rule to reject a different option and
does not apply it to its own new control.

**`Plan ▾` and `Summary ▾` do not differentiate.** Summary is already the hub that absorbed Plan
details and Edit plan (`:2443-2445`). Two triggers, one literally "Plan", on a surface about one
plan. Either fold `Plan ▾` into `Summary ▾` or rename one.

Suggested: Legend is buried two clicks deep while Shortcuts stays one click, though the spec names
them together as the two controls a Viewer most needs; M2-T5 has no development steps, unlike every
sibling; and M1's release note should frame the label loss as temporary and already scheduled for
reversal, not merely as "the labels changed".

### test-engineer — 3 blocking

1. **The proposed gate would not catch the defect it exists to catch, in one case.** `data-toolbar-item`
   is present regardless of rendered width, so a control shrunk to **0 visible width** by M1-T5's
   truncation remedy satisfies both "no box past the edge" (a 0-width box has 0 overhang) and
   "reachable set unchanged" (still in the DOM). **That is the original defect's exact shape**:
   present, reachable by naive query, pointer-dead. `reachability.spec.ts` already has the right
   instrument — `document.elementFromPoint` at the control's own centre — and the gate must use it.
2. **M2's relocations invalidate several vitest suites by shape, not by rename, and only one of five
   relocation features says so.** `tsld-toolbar-lenses.test.tsx:107-138` and
   `tsld-toolbar-resource-view.test.tsx:29-49` query `Colour · Criticality`, `Baseline overlay` and
   `Resource view` as top-level toolbar buttons; M2 turns `colour-by` into a radio group inside
   `View ▾` — a different interaction model, so those need rewrites, not renames. Without naming
   them, "the existing suites are the before/after oracle" quietly stops being true for the milestone
   that most needs one.
3. **M6-T1 names which seven harnesses convert but not what conversion means for two of them.**
   `playwright.programme.config.ts:63` and `playwright.notes.config.ts:61` pin
   `VITE_CANVAS_WORKSPACE: 'false'` **to stay pen-free**, a deliberate simplification rather than an
   incidental rollback pin — so it is not established that those journeys work at all against the
   surviving workspace. Given this is the exact failure class of ADR-0084 batch 1, M6-T1 must be
   decomposed per suite before execution.

Suggested, and **verified independently**: the spec's claim that no other config in the estate pins
zero `VITE_` vars is **false** — `playwright.calendar-shifts.config.ts` and
`playwright.staff.config.ts` both do (`env: { LOG_LEVEL: 'silent' }` and a mail URL respectively),
as does `playwright.measure-toolbar.config.ts`. It does not change the conclusion that neither is a
candidate host for a toolbar gate, but an unverified uniqueness claim asserted in an ADR is precisely
what ADR-0076 exists to stop. Also: two of the gate's eight widths (1600, 1280) were never in M0's
output, so the red run must report actual rather than predicted results for those; and
`measure.spec.ts:150-153`'s hardcoded `waitForTimeout(400)` is a CI-flake source that should be
carried across deliberately or replaced with a poll-until-stable read.

### performance-reviewer — 1 blocking

The convergent finding above. Non-blocking: M1-T4's proposed measurement exercises only the
**resize** trigger, while `use-tsld-toolbar-context.tsx:388-391` documents that `measure()` also
refires on legitimate context changes (selection, zoom preset, search, isolate mode) — which is the
path most likely to compete with canvas paint during actual use. It should be measured too, and per
house doctrine (ADR-0026/0065, `docs/TECH_DEBT.md` #75) by **call count rather than milliseconds**.

M2's consolidation is a straightforward reduction in `measure()` cost (fewer inline items ⇒ fewer
box reads) and changes neither bundle size nor code-splitting: `tsld-toolbar-items.tsx` has no
`lazy()`/dynamic `import()` today, and every destination is already imported by that same file.

### accessibility-reviewer — 2 blocking, and it settled the criterion

**The question this review existed to answer: WCAG 2.2 §2.5.8 Target Size (Minimum), AA, fails
cleanly at 1920 and 1440.** Not arguably. The Understanding text sizes the target for pointer
inputs by its _visible_ portion, not its intrinsic CSS box, so a 32 × 36 declared control with 0
rendered pixels in the hit-testable region is a 0 × 0 target. **None of the five exceptions
applies** — and the Equivalent exception fails for the reason that makes this bad rather than
cosmetic: at 1920 `overflowPresent` is `false`, so there is **no second control anywhere on the
page** offering "open Legend" or "reach the 14 commands behind the `⋯`".

One honest caveat to carry to the product owner: this extends the SC to a **0 px degenerate case**,
whereas its own examples enumerate targets that are small but visible. The reviewer believes that
extension correct and defensible; it is an extension nonetheless.

It also **corrected three citations I had left open**, all in the direction of claiming less:

- **2.1.1 Keyboard is satisfied, and not merely "arguable"** — the controls stay focusable and the
  native scroll-into-view reveals them. Say so plainly.
- **2.4.11 Focus Not Obscured does _not_ apply.** Its trigger is the state _at the moment focus is
  received_, and that is exactly the moment the browser scrolls the control into view. Citing it
  and withdrawing it under scrutiny is the unforced error this repository has made twice this week.
- **1.4.10 Reflow does not apply** — its scope is 320 CSS px; the measured range is 768–2133, and
  nothing here scrolls.

**The finding nobody had: the existing accessibility gate structurally cannot catch this, twice
over.** I re-ran it rather than trusting it:

```
id: target-size | enabled: false | tags: ["cat.sensory-and-visual-cues","wcag22aa","wcag258"]
selected by withTags([wcag2a,wcag2aa])?  false
selected by withTags([wcag22aa])?        true
```

`e2e-toolbar/toolbar.spec.ts:122` scans `withTags(['wcag2a', 'wcag2aa'])` — the **WCAG 2.0** tag
families — so the one rule that names this defect is excluded by tag; and axe-core 4.12.1 ships it
`enabled: false` regardless, because new-in-2.2 rules are opt-in. So "the axe scan stays green"
(S10, M5-T2) is true **and proves nothing about 2.5.8**. Adopted: widen the scan to `wcag22a`/
`wcag22aa` and pass `rules: { 'target-size': { enabled: true } }`, as a **second, independent** gate
beside the browser fit gate.

**Blocking 1 — the milestone's outcome statement overclaims against its own gate.** M1's header says
"no toolbar command is pointer-unreachable at any width, on either row", but at 960/768 its criteria
are S1 (box position) and S3 (set membership) — **neither is a pixel-reachability test**. M1-T5's
proposed `min-w-0` truncation remedy converts "94 px outside the box, 0 px visible" into "shrunk to
fit inside the box", and an icon button with no label to truncate can be squeezed to a sliver that
satisfies S1 and S3 and is **just as unclickable**. That is the original defect reproduced in
miniature, through the remedy proposed for the case M0 did not cover. This is the same conclusion
`test-engineer` reached from the test side — **a second independent convergence**. Fix: reuse
`reachability.spec.ts`'s `elementFromPoint` check, or assert a rendered-width floor of ≥ 24 px, for
every pinned Row-1 item at 960 and 768.

**Blocking 2 (M3 only) — an unhedged pixel claim used to justify not fixing a control.** The spec
asserts the split-button caret is "24 × 36, i.e. exactly on the 2.5.8 limit" and M3-T4 leaves it
alone on that basis. `IsolateControl`'s caret (`tsld-toolbar-items.tsx:1145-1160`) merges
`'rounded-l-none px-1'` over `toolbarControlVariants`, and tailwind-merge **replaces** `px-2`
entirely rather than adding to it; the base carries no `border`. So the content width is
`size-3.5` (14 px) + 4 + 4 = **~22 px** — under the minimum, not on it. The reviewer flags that this
is arithmetic against arithmetic and could itself be wrong. That is the point: the claim it
disputes was stated **without** the "derived, not observed" hedge the same document applies to every
other pixel figure, and a milestone decision rests on it. Measure it in M2-T0 before M3 decides.

Recommended, not blocking: no ADR-0082 "all-shaded ⇒ no trigger" test exists for the three new menu
triggers (**third independent hit on that finding**, after `ux-reviewer` reached it for
`Share & export ▾` specifically); relocated read-outs must be required to keep `aria-hidden` and gain
no competing live region; folding a conflict count into `Next conflict`'s accessible name renames a
control dynamically outside user action, worth a check; and **M4's header merge repeats a pattern
that has already caused two focus-loss bugs in that exact file** — `plan-workspace-toolbar.tsx:164-169`
and `:330-338` both carry comments explaining that a `rootRef`-scoped query silently found nothing
because `ChromePortal` moves the node out of the workspace root. Any new focus-return code must be
`document`-scoped like its two neighbours.

Confirmed rather than merely accepted: the "pinned items can never demote, so only removing them
closes the 960 floor" reasoning is correct (`Toolbar.tsx:153-156,172-174`,
`toolbar-registry.ts:117,295-333`), and the density rejection is sound — densifying buys ≈96 px
against a measured 94 px overshoot, i.e. it would **mask** the defect while regressing the Surface
Pro target.

## What the five passes actually bought

Three findings were reached **independently by two or more reviewers**, which is the strongest
signal available here:

| Finding                                                               | Found by                                 |
| --------------------------------------------------------------------- | ---------------------------------------- |
| Group-chrome measurement creates a feedback loop at the `help` group  | performance-reviewer, component-reviewer |
| The M1 gate's criteria would pass a control shrunk to 0 visible width | test-engineer, accessibility-reviewer    |
| No ADR-0082 all-shaded test for the new menu triggers                 | ux-reviewer, accessibility-reviewer      |

**Every blocking finding is a gap in what the plan tests or how one task is worded — none is a flaw
in what it proposes to build.** The direction (repair first, then consolidate, then a real
responsive ladder) survives all five reviews intact.

## Four measurements now specified, not opinions

`performance-reviewer` declined to assert figures it had not measured and instead specified exactly
what to run. Adopted into M1:

- **A — steady-state oscillation.** At 1920×1080 on a populated plan, capture the inline id-set and
  each item's labelled state for 20 consecutive `requestAnimationFrame` ticks with no input. Assert
  all 20 identical. This is the direct test for a loop with zero user interaction.
- **B — boundary oscillation.** Sweep 1900→1960 in 1 px steps, bracketing the width at which `help`
  first empties. Assert both the inline set and the labelled set are monotonic — nothing that
  disappears reappears within a monotonic sweep.
- **C — interaction-driven `measure()` cost.** Five seconds of ordinary interaction (ten selections,
  three zoom-preset changes, a search typed and cleared) with `performance.mark` bracketing
  `measure()`'s body, before and after M1-T3.
- **D — call-count budget.** A jsdom test spying on `getBoundingClientRect`/`getComputedStyle`,
  asserting the per-pass call shape rather than a timing — the ADR-0026/0065 convention.
