# ADR-0090: The plan-workspace command surface — a row is a budget, and `order` is not a priority

- **Status:** Accepted (2026-08-11) — approved by the product owner after the M0 measurement and a
  five-specialist pre-approval review. **Corrected in place rather than superseded**, on the product
  owner's decision: it had never been Accepted, so nothing downstream depended on the withdrawn text.
- **Date:** 2026-08-11
- **Deciders:** James Ewbank (with Claude Code — ui-architect)
- **Related:** amends **ADR-0031** (toolbar registry, 7-group taxonomy, tiers, and its
  2026-07-14 / 2026-07-15 / 2026-07-15 amendments) and **ADR-0055 §3** (the chrome band).
  Builds on ADR-0030 (canvas-first workspace), ADR-0056 §1 (range-anchored presets),
  ADR-0064 §3 (no fourth overlay over the scene), ADR-0080 (the selection bar),
  ADR-0082 (shade with a reason), ADR-0088 (flag classification). Supersedes nothing.
  Design: [`docs/specs/workspace-layout/design.md`](../specs/workspace-layout/design.md).

## Context

The TSLD command surface is two rows holding **46 registered items** — 27 on Row 1
(_Navigate_), 19 on Row 2 (_Build_). The product owner reports it "does not work well" on a 24"
1920×1080 monitor at 100% browser scaling, and that **fewer controls are visible at 100% than at
90%**. Behaviour on a Surface Pro was unknown.

> ### Correction — this ADR was drafted without a shell, and M0 disproved three of its claims
>
> The paragraph immediately below said the reported symptom **is not a bug**. That is **false at
> every measured width except one**, and the three withdrawn claims are corrected in place below
> rather than deleted, because what this document got wrong is part of its record.
>
> **What was actually measured** (`docs/specs/workspace-layout/m0-measurement.md`, Chromium, real
> workspace, shipped flag defaults, on a plan with a computed schedule):
>
> | Viewport          | Row 1 over its container | `⋯`                       | Pointer-unreachable                       |
> | ----------------- | -----------------------: | ------------------------- | ----------------------------------------- |
> | 2133 (1920 @ 90%) |                    35 px | **absent**                | `shortcuts`                               |
> | **1920 @100%**    |               **109 px** | present, **0 px visible** | `legend`, `shortcuts`                     |
> | 1440              |                    79 px | present, **0 px visible** | —                                         |
> | 960               |                   459 px | present, **0 px visible** | `isolate-logic`, `finish-chip`, `summary` |
>
> 1. **"Every demoted command is reachable" — withdrawn.** At 1920 no `⋯` renders at all and two
>    controls are painted outside an `overflow-hidden` box at 0 px visible: pointer-unreachable,
>    keyboard-reachable only. **This fails WCAG 2.2 §2.5.8 Target Size (Minimum), AA**, with no
>    exception available — the Equivalent exception fails precisely because there is no `⋯` and
>    therefore no second route anywhere on the page. (2.1.1 is _satisfied_; 2.4.11 and 1.4.10 do
>    **not** apply — three citations claimed less after review, not more.)
> 2. **"≈2560 px before Row 1 can label itself" — withdrawn, and backwards.** At 1920, **21 of 24**
>    inline items are labelled. The 6.6 px/character estimate was substantially wrong. The labels are
>    not missing; **the labels are why the row breaks** — the promotion pass decides the row can
>    afford them, the row grows past its container, and the overflow pass does not catch the result.
> 3. **The ≈1256 px pinned-floor figure — withdrawn.** Measured at **1177 px** for Row 1, against an
>    872 px container at 960. The conclusion it supported survives: `render` items can never demote
>    (`Toolbar.tsx:153-156`), so no arithmetic closes a 305 px gap — only removing pinned items does.
>
> The 90%-vs-100% framing below is also incomplete: on a real plan the defect reaches **2133** too.
> There is no measured desktop width at which this surface is correct.

~~The reported symptom is not a bug. `Toolbar.tsx:385-395` renders a visible `⋯` whenever anything
overflows and every demoted command is reachable inside it with its reason
(`ToolbarOverflow.tsx:74-109`, ADR-0082); 90% zoom simply gives a 2133 CSS px viewport against
1920, and the row sits within one control's width of its demotion boundary.~~

**Reading the surface produced a larger finding, and it is the reason for this ADR.** ADR-0031's
2026-07-15 amendment adopted two rows on an explicit product-owner request: _"every control
visible **with its label**"_ and _"nothing working hidden in a `⋯`"_
(`0031-tsld-toolbar-registry-and-taxonomy.md:252-259`). ~~Computed from the shipped code: `'auto'`
labels cannot promote on Row 1 below a container of roughly **2560 px**, and on Row 2 below roughly
**2600 px** … what the owner sees instead is ~26 unlabelled glyphs.~~

**Measured, and the opposite is true: at 1920 Row 1 labels 21 of its 24 inline items.** The
acceptance criterion is met on the labelling axis and violated on the one nobody stated — the row
does not fit. The two rows exceed their containers by 109 px and 0 px respectively at 1920, and the
overflow pass does not fire, so the surplus is paid by controls falling out of an
`overflow-hidden` box rather than by labels being withheld. **The design has never met its own
acceptance criterion on the monitor it was designed for** — but the failure is _fit_, not
_labelling_, and this ADR asserted the reverse for the same reason it asserted the rest: nobody
had run it.

Three structural causes, each read from code rather than inferred:

1. **`order` is a within-group sort key reused as a cross-group demotion priority.**
   `toolbar-registry.ts:115` documents it as _"Sort order **within the group**"_;
   `computeOverflow` (`:310-318`) sorts the whole row's demotion queue by `order` descending.
   The measured consequence is that **Zoom −, Zoom +, Fit and Go-to-today demote before Legend
   and Keyboard shortcuts**, and on Row 2 that Comments, Share and Print lead the exit.
2. **The pinned set is the widest part of the row and cannot yield.** `Toolbar.tsx:153-156`
   demotes only `onActivate` items; every `render` item is pinned by rule (`:117`, _"you don't
   stuff a popover into a menu"_), and the overflow computation is handed
   `Math.max(0, available − pinnedWidth)` (`:181`). Row 1's nine pinned controls — a 240 px
   search field, four popover triggers that always render icon + label + chevron
   (`ToolbarPopover.tsx:133-139`), and two read-out chips — occupy **≈1256 px of an 1823 px
   bar at 1920**, before a single button is placed.
3. **The rows have no responsive story.** `plan-workspace-toolbar.tsx:241` switches panes below
   `md`; `Toolbar.tsx` has no breakpoint at all. At 1440 CSS px (Surface Pro landscape) roughly
   15 of Row 1's 16 buttons are in the `⋯`; at 960 (portrait) the container is **393 px below
   the pinned floor**.

Two smaller facts shape the answer. A **two-state switch can lose one state to the `⋯`** —
Early/Visual and Diagram/Gantt are each two independently-demotable tier-1 buttons, and the
higher `order` goes first. And **the plan's identity and pen status render _below_ the commands
they govern**: the band holds the app header and the portalled toolbar
(`chrome-band.tsx:37-40`), while the workspace's `<header>` renders after it
(`plan-workspace-toolbar.tsx:715` vs `:749`), so `CompactPenStatus` — the one fact explaining
why the whole Build row is shaded — sits underneath the row it explains.

## Decision

### D1 — A row is a budget, and consolidation is how labels become possible

We reject the framing that this is a sizing problem to be tuned. Forty-six labelled controls are
roughly 5,000 px of bar; no monitor the product owner will own fits them in two rows. The
2026-07-15 request is honoured by **reducing the surface to what a row can label**, not by
finding more width.

Target: **24 toolbar stops**, both rows labelled at 1920, no `⋯` at 1920 or 1440. **No command
is deleted** — twenty-two relocate to surfaces that already exist (`docs/specs/workspace-layout/
design.md` §4.1).

The three relocation rules are each derived from something already in the code, not from taste:

- **A command whose `isEnabled` requires a selection belongs on the selection bar.**
  `zoom-to-selection` (`:1763`), `isolate-logic` (`:2021`) and `float-paths` (`:2076`) all say so
  themselves. `selection-actions.tsx` already renders its own `<Toolbar>`, so this adds **no**
  new surface — which matters, because ADR-0064 §3 forbids a fourth overlay over the scene and
  that decision stands unchanged.
- **A display lens belongs in `View ▾`.** `ViewTogglesPanel` already groups Structure / Markers /
  Insight overlays (`:116-118`), and ADR-0056 M7 moved "Month bands" there on exactly this
  reasoning. `colour-by`, `baseline-overlay`, `resource-view`, `over-allocation` and `legend`
  follow it.
- **A fact is not a control.** `finish-chip` is `presentational: true` (`:2351-2357`) — a
  read-out the primitive had to be extended to accommodate (`ToolbarItem.presentational`,
  `Toolbar.tsx:246-252`), because there was nowhere else to put it. It moves to the plan header;
  `next-conflict-status` and `search-status` fold into the controls they describe. Zero
  non-operable stops remain in either toolbar.

### D2 — `priority` is separated from `order`, and it is the load-bearing fix

`ToolbarItem` gains `priority?: number`, defaulting to `order` so no existing item changes
behaviour by accident. `computeOverflow` sorts on `priority`; `resolveItems` keeps sorting on
`order`. The two docblocks say which question each answers.

This is separated from D1 deliberately: it is the smallest change that stops the surface losing
the _wrong_ controls, it is independently shippable, and **until it lands, any measurement of
the toolbar is measuring the wrong demotion order.**

### D3 — A segment is one demotion unit

Early|Visual and Diagram|Gantt demote as pairs or not at all. A two-state switch with one state
in a menu is not a switch. (ADR-0031's idiom — _a segment is two registry items whose `isActive`
reads one state_ — is kept; only the demotion grouping changes.)

### D4 — `TOOLBAR_GROUPS` renames `history` → `output`; the taxonomy stays at seven

Export, Print and Share are deliverables filed under `object` alongside Baselines and Schedule
settings, and because of the `order`-descending queue they were **the first three Row-2 items to
leave the bar** — while Export could not leave at all, because it happens to be a `render` menu
(`:2476-2480`). The deliverable set was already split by an implementation accident.

The group is renamed rather than added, because `TOOLBAR_GROUPS` is a closed `const` tuple whose
closure is the point (`toolbar-registry.ts:19-27`) and ADR-0031 §2 makes growing it an ADR-level
act — one this ADR declines to perform. **Re-using `history` as-is was rejected**: undo/redo were
deliberately moved _out_ of it into `tools` to keep the pen-gated set contiguous (`:2528-2529`),
and `Toolbar.tsx:104` announces the group's label to AT, so filing deliverables under "History"
would make an accessible name a false statement. `history` is not coming back; `output` takes
its slot and holds one stop, a `Share & export ▾` split-button.

### D5 — A `penGated` item may never leave the pen cluster

ADR-0031 §4 makes the read-only↔editing flip legible **as one contiguous shaded set**. Scatter
its members and that stops being true. `snap-to-grid` (`:2248`) and `clear-visual-placement`
(`:2277`) are pen-gated and therefore stay on Row 2, even though "a canvas behaviour toggle"
would otherwise argue for `View ▾`. Asserted by a test over the registry, not by review.

This is also why **Option D (one row of grouped menu-buttons) is rejected**: ADR-0082 rules that
a menu whose every item would be shaded renders no trigger, so a Viewer would watch `Build ▾`
vanish entirely — strictly worse than a shaded row. And Add / Link / Marquee are **modes**; a
mode you cannot see armed is verbatim the ADR-0064 defect.

### D6 — The `<Toolbar>` primitive gains a layout mode, read from the width it already measures

Four modes — Comfortable (≥1536), Compact (1280–1536), Condensed (1024–1280), Collapsed (<1024)
— derived from the **existing** `ResizeObserver` (`Toolbar.tsx:223-229`), not from a viewport
media query: two sources for one question is how they drift. Each boundary carries **48 px of
hysteresis**, the same instrument and the same reason as `LABEL_PROMOTION_MARGIN_PX`
(`Toolbar.tsx:31-36`) — a boundary with no dead-band flips the whole layout while a user drags a
window edge.

Computed: Surface Pro **landscape (1343 px container)** lands in Compact and fits every command
inline, icon-only, with an empty `⋯`; **portrait (863 px)** lands in Collapsed and fits with
389 px to spare. Both are broken today.

### D7 — The height is in the duplicated header band, not in the control

Densifying `toolbarControlVariants` from `min-h-9 px-2` to `min-h-8 px-1.5` returns **8 px** —
**1.1% of a 717 px canvas** — while moving a 32×36 control to 28×32, which still passes WCAG
2.5.8 (24×24; the spacing exception does not apply, since `gap-1` puts adjacent targets 4 px
apart) but fails `UX_STANDARDS.md:137`'s house `≥44 px` touch rule harder, on the exact device
being added to the target list.

**So we do not densify the shared CVA.** The vertical space is the **45 px plan-header band**,
which folds into the chrome band above Row 1 — fixing both the height and the reading order, so
identity, status, pen and the project finish sit **above** the commands that change them. Under
`@media (pointer: coarse)` the control keeps `min-h-9` and gains `px-3`, moving _toward_ the
house touch rule; the consolidated item count is the first time that has been affordable.

### D8 — No feature flag; the last Class A flag retires inside this epic

ADR-0088 D1: a `VITE_` flag is inlined at build time, `apps/web/Dockerfile` declares one `VITE_`
build arg and `docker-publish.yml` passes none, so **no operator can switch one off on a
deployed container**. A flag here buys no rollback. Worse, a flag selecting between two command
surfaces is **Class A**, and `scripts/flag-retirement.json:549` sets `classACap: 1` with
_"raising it needs an ADR"_. The mitigation is the ADR-0061/ADR-0077 one: small, individually
revertible commits.

This epic **is** the deferral trigger for the estate's last Class A flag:
`VITE_CANVAS_WORKSPACE` carries `deferredUntil.trigger = "epic-touch: plan workspace"`
(`scripts/flag-retirement.json:317-321`, debt `#122`). Following ADR-0089's pattern — do the work
that collects the payoff, convert the harnesses, then retire — the retirement is a terminal
milestone of this programme, and `classACap` ratchets 1 → 0.

**Measured, and it corrects the register:** `grep -n VITE_CANVAS_WORKSPACE
apps/web/playwright*.config.ts` shows **seven** configs still pinning it `'false'` —
`playwright.config.ts:70`, `edit:72`, `sub-day:68`, `programme:63`, `assignment-lag:73`,
`activity-editor:74`, `notes:61`. `docs/TECH_DEBT.md:2011-2012` was amended on 2026-08-11 to say
"five harnesses left rather than seven"; that is wrong. ADR-0089 converted `sub-day` and
`assignment-lag` off **`VITE_ACTIVITY_EDITOR_TABS`**, not off this flag — both still pin it. The
count is unchanged at seven, `scripts/flag-retirement.json:320` still lists all seven correctly,
and the register now contradicts its own debt row one day after it was edited. An ADR-0076
Class 1 failure, found only because CLAUDE.md §19.10 says to check the claim rather than cite it;
corrected in the same PR rather than stepped over (the ADR-0071 lesson).

## Alternatives considered

- **Repair in place only** (fix `priority`, cut the gutter, fold Legend/Shortcuts, densify).
  Rejected as a _terminus_, adopted as **Milestone 1**. ~~It moves the Row-1 pinned floor
  1256 → ~1160 px and the label requirement 1169 → ~960 px against 663 px available at 1920 — still
  no labels.~~ **Those figures are withdrawn** (see the correction in Context). What survives
  unchanged is the conclusion: the measured pinned floor is **1177 px** against an **872 px**
  container at Surface Pro portrait, `render` items can never demote (`Toolbar.tsx:153-156`), and no
  correction to the arithmetic closes a 305 px gap — only removing pinned items does. M1 is
  necessary and insufficient.

  **Approved to ship alone** (product owner, 2026-08-11), accepting that an honest budget will
  probably withdraw the 21 labels currently showing at 1920 until M2 restores them: a correct
  icon-only row beats an unclickable labelled one, and the 2.5.8 failure is live in production.

- **A vertical command rail beside the canvas.** The strongest answer to the height question —
  it trades the axis the surface has spare, since a TSLD is wide and starved of height.
  Rejected because both edges are spoken for: the left is the ADR-0029 Project Explorer rail, and
  `plan-workspace-toolbar.tsx:150-155` records that the right edge holds **one dock at a time**
  because _"two of them plus the Project Explorer rail on a 1280 px screen leaves the picture
  unreadable"_. A third permanent column takes width from a diagram whose scarce axis is
  horizontal, at every breakpoint, and makes Surface Pro portrait strictly worse. Separately,
  `Toolbar.tsx:320` is `aria-orientation="horizontal"` with one roving order; a rail is a second
  orientation to build and keep in step.
- **A third toolbar row.** Costs 45 px permanently (≈6% of the canvas), taking chrome above a
  953 px viewport to 244 px — 26% of the screen — and buys horizontal room that D1 shows is not
  needed. Rejected. Note that Row 2 already _is_ the conditional surface a third row would be.
- **One row of grouped menu-buttons.** Rejected on D5's three counts.
- **A new contextual surface floating over the canvas.** Rejected by ADR-0064 §3, unchanged.
- **Adding an eighth taxonomy group for deliverables.** Rejected: the closure of
  `TOOLBAR_GROUPS` is the property ADR-0031 §2 exists to defend. D4 renames instead.

## Milestone 2 as built (2026-08-11/12) — five decisions the plan did not contain

M2 shipped the consolidation. Five of its decisions were taken during the work rather than in this
document, and each is recorded here because each would otherwise read as an unexplained departure.

**1 · `float-paths` does not move to the selection bar.** The plan lists it beside
`zoom-to-selection` and `isolate-logic` on the grounds that its `isEnabled` requires a selection.
That conflates _needs a selection_ with _is a canvas command_. It is a view-agnostic analysis that
runs in the **Gantt** as well as the diagram — its ladder reads `activityCount`, deliberately not
`canvasActive` — so moving it to a bar only the canvas renders would have deleted it from the Gantt.
`float-paths-view-agnostic.structural.test.ts` exists to fail on exactly that.

**2 · The `View ▾` trigger annotates a non-default colour mode.** Folding `colour-by` into the
popover as a radio group leaves no trigger to name the active mode, and colour is the diagram's
dominant encoding — a planner who has coloured by WBS group and forgotten reads every criticality
judgement wrong. The trigger reads `View · WBS group` off-default and plain `View` at the default:
width spent on the surprising state, none on the ordinary one. A canvas-corner read-out was rejected
(a fifth persistent overlay), as was relying on the Legend (itself a toggle, moving into the same
popover).

**3 · The deliverables and analysis triggers are menu-buttons, and one is not called `Plan`.** The
plan specifies a split-button for `Share & export`; a split button's primary region performs the
primary action, and Export itself opens a menu, so it would have had a primary that opens a menu and
a caret that opens the same one. The requirements that mattered — one roving stop, focus restored to
the trigger — are met by a plain menu-button. `Plan ▾` became **`Analysis`** because it would have
sat inside a group whose `aria-label` is already "Plan actions" and next to Row 1's `Summary ▾`;
heard back to back, "Plan" and "Summary" do not say which holds what. `Schedule settings…` stayed
inline rather than joining it — it is the one that _changes_ how dates are computed rather than
reporting on them, and `docs/TECH_DEBT.md` #60 renamed it so the float measure could be found.

**4 · M2-T7's specification was wrong for this surface, and the test pins the opposite.** It calls
for a group whose every row would be shaded to render **no trigger**. That is ADR-0082's clause about
the Project Explorer's row menu, where a menu of nothing but refusals is a dead end and its absence
costs nothing. A toolbar is the opposite case: ADR-0031 §4 makes the read-only↔editing flip legible
by keeping the row's shape fixed and shading its members as a set, so removing a trigger by
permission would reflow the row for a Viewer — two people looking at the same plan would see
different bars. The rule here is **shade the trigger and say why**.

**5 · Labels at 1920 were bought with four tier-3 demotions, on the product owner's decision.**
Measured: Row 1 was ~360 px short, Row 2 ~128. `Next conflict`, `Float paths` and `Keyboard
shortcuts` on Row 1 and `Clear visual placement` on Row 2 moved to tier 3 — always in the `⋯`,
nothing deleted. The trade was put with the numbers rather than taken: **labelled commands at 1920,
or three fewer commands on the row.** Result, measured: Row 1 **14 inline / 13 labelled** (from 15 /
0), Row 2 **14 / 12** (from 19 / 0). §1.4 criterion 1 is met at 1920 for the first time.

Tier 3 rather than a low `priority` is load-bearing: `autoLabelsFit` sums the **whole bar**, so a
width-demoted item still pays for its label. Making the label sum read only the inline set is the
feedback loop `measureLabelWidth` exists to prevent. `showLabel: 'never'` was measured and rejected —
it sheds the label but keeps the 32 px and the gap, saving 308 px against a 360 px gap.

**Two defects the move exposed, both in code that predated it.** `Float paths` is a **toggle**, and
the `⋯` had only ever held plain actions: in the menu it announced no state at all. `MenuItem` gained
`checked` (`role="menuitemcheckbox"`), kept distinct from `selected` (`menuitemradio`) because a
toggle is not one of several. And closing its panel restored focus by querying the command's
`data-toolbar-item`, which now unmounts with the menu — focus was landing on `<body>` (WCAG 2.4.3);
it falls back to the `⋯`. Both were found by things that run the real product, not by review.

**The cost carried into M3.** `zoom-to-selection` and `isolate-logic` used to sit shaded on Row 1
saying "Select an activity first". They are now **absent** until a bar is selected — correct by
ADR-0082 (with no selection there is no object), and the one place M2 removes something from view
rather than relocating it. M3 must check that discoverability is not what got optimised away.

## Consequences

**The first consequence, and the one this ADR exists to record: it was wrong three times, and the
mechanism that caught it was its own.** The document ended in two falsifiable predictions
specifically because it was written without a shell. Both were falsified on the first run. That is
the mechanism working — but it means no figure here may be quoted without checking it against
`m0-measurement.md`, and it is why the M1 gate runs in a real browser rather than in jsdom, which
has no layout and would have reported this surface healthy forever.

**The second: a five-specialist review of the plan, before approval, found blocking defects in the
repair itself** — three of them reached independently by two reviewers each. Most consequentially,
the first draft of M1 proposed to _measure_ group chrome from the DOM, which would have created a
render loop at the `help` group, i.e. at `legend` and `shortcuts`, i.e. at exactly the two controls
this decision exists to make clickable. The chrome is now **derived** from static registry data.
Reviewing a plan rather than a diff is unusual here; on this evidence it should not be.

**Positive.** Both rows label themselves at 1920 — the outcome ADR-0031's 2026-07-15 amendment
asked for and has never delivered. Toolbar stops fall 46 → 24 with nothing deleted; roving-focus
sequences shorten by the same amount, and non-operable read-outs leave `role="toolbar"`
entirely. Surface Pro gets a designed answer in both orientations for the first time. The canvas
gains ≈45 px (≈6%) from the header merge, and the plan's identity and pen status finally render
above the commands they govern. `priority` makes demotion a stated decision instead of a
side-effect of left-to-right position. The consolidated item count makes a `pointer: coarse`
touch treatment affordable for the first time.

**Negative / trade-offs.** Twelve commands move behind a named trigger — which is what the
2026-07-15 amendment reversed, though it reversed _icons in an undifferentiated `⋯`_, and the
product already ships six named menu-buttons (`View ▾`, `Colour by ▾`, `Filter ▾`, `Export ▾`,
`Add ▾`, `Link ▾`). Three commands leave the persistent bar for the selection bar, so a planner
with no selection has no route to them — acceptable only because all three already refuse
without one. `View ▾` grows to six sections and must not become the new `⋯`; a future lens goes
in it only if it is a display toggle. The layout mode is new machinery in a primitive that has
been stable since ADR-0031.

**Residual, recorded rather than claimed closed.** Touch targets remain 36 px on the minor axis
against the house `≥44 px` rule; D7 improves the major axis and does not close the gap. That is
a debt row, not a fixed problem.

**Risk, stated plainly — and then resolved.** Every pixel figure in the design and in the first
draft of this ADR was computed from class names and an assumed 6.6 px/character metric at
`text-sm`, not measured; the authoring session had no shell. **M0 has since been run**
(`docs/specs/workspace-layout/m0-measurement.md`), and both predictions were **falsified**:

- **P1** predicted the Row-1 `⋯` at 1920 would hold exactly _Go to today_ and _Zoom to selection_.
  There is **no `⋯` at all** at 1920 — the row does not demote two items, it demotes nothing and
  lets controls fall out of the box.
- **P2** predicted every command would still be reachable at 960, with truncation rather than loss.
  The `⋯` is itself clipped to **0 px visible** there, and two pinned `render` items are too. **P2
  was named as the sharp one — "if any command proves unreachable, that outranks this ADR" — and it
  is the case.** The criterion is **2.5.8**, not the 2.1.1 guessed here: keyboard operation is
  intact, which is what makes this pointer-specific.

That resolution is why this ADR is now Accepted rather than Proposed, and why its Context carries a
correction block instead of the withdrawn text alone.

**Follow-ups.** `docs/DESIGN_SYSTEM.md` gains the toolbar layout-mode ladder; ADR-0031's
"add a command" recipe gains `priority` and the D5 rule; `docs/TECH_DEBT.md:2011-2012` is
corrected to seven harnesses; **CLAUDE.md §16 needs this ADR's register entry** — the authoring
session was not authorised to edit that file, and an unentered ADR is exactly how ADR-0071 came
to be cited by shipped code while absent from the register.

## References

- Design: [`docs/specs/workspace-layout/design.md`](../specs/workspace-layout/design.md)
- ADR-0031 and its three amendments (registry, taxonomy, tiers, the two-row split)
- ADR-0055 §3 (chrome band + `ChromePortal`), ADR-0056 §1 (range-anchored presets),
  ADR-0064 §3 (no fourth overlay), ADR-0080 (selection bar), ADR-0082 (shade with a reason),
  ADR-0088 D1–D3 (flag classification, `classACap`), ADR-0089 (do the work, then retire)
- Code: `components/ui/toolbar/{Toolbar.tsx,toolbar-registry.ts,ToolbarOverflow.tsx,ToolbarPopover.tsx,ToolbarButton.tsx,toolbar-styles.ts}`,
  `features/tsld/toolbar/{tsld-toolbar-items.tsx,selection-actions.tsx}`,
  `components/layout/workspace/plan-workspace-toolbar.tsx`,
  `components/layout/chrome/chrome-band.tsx`, `components/layout/navigator/app-shell.tsx`
- Register: `scripts/flag-retirement.json`, `docs/TECH_DEBT.md` #122
