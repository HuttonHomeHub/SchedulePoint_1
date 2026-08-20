# Graphite — consolidated implementation plan

Six specialist reviews over `design.md` + ADR-0099. This replaces the first-draft plan.
**Five of six returned BLOCKING findings.** What follows is the resolution, not a digest.

---

## A. What the reviews changed about the design

### A1. My own numbers disagreed with themselves (architecture, component, performance — all three found it independently)

|         | ADR-0099   | `design.md` |
| ------- | ---------- | ----------- |
| Rail    | 38 px      | 46 px       |
| Drawer  | **186 px** | **224 px**  |
| Toolbar | 29 px      | 36 px       |

Not cosmetic: 186 vs 224 decides whether `FieldGrid`'s container query can ever fire; 29
vs 36 decides whether a control clears WCAG 2.5.8 with padding. **Resolved to the brief's
numbers (46 / 36) and a resizable drawer (below). ADR-0099 is amended, not left to
diverge.**

### A2. §4a is solved by geometry, not by measurement (architecture)

The toolbar must not resize with the drawer. The answer is one CSS grid in the shell:

```
columns:  minmax(0,1fr)   auto      46px
          /* stage      | drawer | rail */
rows:     auto   minmax(0,1fr)   auto
          /* command | body | status */

command strip → col 1/3, row 1     drawer → col 2, row 2
main          → col 1,   row 2     rail   → col 3, rows 1/4
status bar    → col 1/3, row 3
```

The strip spans columns 1–2, so **the drawer's width is inside its span**. Opening the
drawer redistributes width between `<main>` and the drawer and changes the strip by zero.
No `ResizeObserver`, no measurement, and no way to break it without changing
`grid-column`. Rows 1 and 3 are `auto`, so an unfilled slot is a zero-height row and the
twelve non-plan screens keep the frame they have.

### A3. The drawer cannot be a fixed 224 px (component, UX, architecture)

`Tabs orientation="vertical"`'s rail is `w-52` = **208 px** — 93 % of a 224 px drawer
before any content. `DESIGN_SYSTEM.md` records that the editor takes the 896 px `xl`
dialog _because_ a narrow single column was tried and rejected.

**Resolved:** the drawer is **resizable 224–420, default 300**, on the existing
`PanelResizer` + `useResizablePanelPrefs` (which already supports an end-anchored panel via
`reverseKeys`). Tabs become a **horizontal strip**, never the vertical rail. `FieldGrid`
pairs will stack at the narrow end — accepted and stated, not discovered.

### A4. The trailing rail needs a skip link, and there isn't one anywhere (architecture)

Today a keyboard user tabs header → rail → main. Trailing, they tab command strip → stage
→ status → drawer → rail: navigation stops being first, on all thirteen routes. That is
**WCAG 2.4.1 Bypass Blocks**, and `apps/web/src` contains no skip link at all. One lands in
the same commit as the move. DOM order is the visual order — **never** `order:`,
`row-reverse` or `direction: rtl`, each of which decouples focus from reading order.

### A5. My milestone order would have broken thirteen routes (architecture)

The first plan put the rail at M2. Deleting the top bar removes the brand link, org
switcher, account chip and the below-`lg` Explorer trigger from **all thirteen** authed
routes — one commit _before_ the Explorer has anywhere to live. Reordered to
**frame → occupants → contents**, where the first slice is pure structure whose acceptance
condition is a **pixel-identical screenshot**.

### A6. Moving the activities table would silently undo ADR-0092 (architecture)

`ActivityPanelCollapsedBar` **is** the `CanvasDockOutlet`'s host. If the table becomes a
drawer panel, the dock falls back to rendering in place and every transient strip goes back
above the scene — reversing an epic that shipped six days ago at a measured 0 px cost. The
status bar becomes the dock's new host.

### A7. Three right-edge claimants (UX, architecture)

Notes and Float paths are both right-docked today under an explicit "the right edge holds
one dock at a time" rule. Adding the rail makes three. **Notes folds into the drawer's
Comments subject** — one claimant removed. **Float paths is undecided** (D3 below).

### A8. Palette defects in code already shipped (UX)

`today` and `conflict` both resolve to **the same token as `critical`** — three distinct
facts painting identically, which breaks the rule the palette is built on. Also: D6 says
azure is the only interactive colour while `DESIGN_SYSTEM.md` documents **amber** as
chrome's primary and focus ring. One of those is now wrong and must be settled in writing.

### A9. The drawer has no "close", and nothing guards that (component, test)

ADR-0060 M6 shipped a confirmation before discarding unsaved work across independently
dirty scopes — triggered by dialog close. A drawer never closes; **selecting a different
bar is the implicit dismiss**, and nothing covers that path. Silently discarding an edit
mid-keystroke is what we would ship by default.

### A10. The drawer must not re-seed on every recalculation (performance)

`activities.data` gets a **fresh array reference on every recalc**, so `.find()` returns a
new object even when the activity is unchanged. A permanently-mounted drawer keyed on
object identity re-seeds its forms on every recalculation anywhere in the plan. Key the
re-seed on `(activityId, version)`. Resources/Cost tabs must lazy-mount, not fetch on every
canvas click.

### A11. The rail's letter shortcuts are a WCAG failure as specified (accessibility)

`V A L M N` as bare accelerators with no focus scoping is **SC 2.1.4 Character Key
Shortcuts (A)**. Typing "a" in the drawer's Name field, a Duration input or the Filter box
would re-arm the Add tool and eat the keystroke. This app has shipped this exact defect
once — ADR-0079's Escape handler was a `window` listener that fired regardless of focus,
and lost a planner the Link tool mid-search. Single letters are strictly worse than Escape.
**Required: the same target guard, plus either a remap or restriction to stage focus.**

### A12. The trailing rail is Tab-order-last after an entire Gantt grid (accessibility)

DOM-order-matches-visual (A4) fixes the _sequencing_ criterion but creates an operability
problem it does not solve: a keyboard planner reaches the five tools only after the toolbar,
~15 drawer fields and a `treegrid` that can hold hundreds of virtualized rows. Two
mitigations, both required: the rail gets **its own labelled landmark** so AT can jump
straight to it, and **arming a tool moves focus to the stage** rather than stranding it at
the far right. The guarded shortcuts stop being a convenience and become the primary route.

### A13. Magnification loses the armed-tool state (accessibility)

At 200–400 % a magnifier user viewing the grid on the left cannot see the rail on the
right, so discovering which tool is live means panning the full viewport after every mode
change. ADR-0064 already built the fix for exactly this — the **mode statement band in the
chrome above the scene**. Graphite keeps it; it is not redundant with the rail's
`aria-pressed`.

### A14. The status bar will race its own announcements (accessibility)

`announcer.tsx` is a **single shared app-wide polite region** that clears-then-sets on an
animation frame. Wire the whole status bar to it and one recalculation — which changes
finish, critical count and save state together — drops at least one message silently. Only
**transitions that need proactive notice** announce; facts a reader can look at do not; and
where several must change together they compose into **one** sentence through **one**
`announce()`.

### A15. The Gantt split is a fork in component shape, not a styling choice (accessibility)

Today the Gantt is one `role="treegrid"` whose rows already span grid and timeline. Split
into two panes it must be either **one row spanning both via CSS Grid** or an explicit
`aria-owns`/`aria-rowindex` association. Two visually-aligned tables would break row/bar
correspondence the moment they scroll a row apart. **Decide before either is built.** The
splitter is an APG window-splitter — `role="separator"`, `aria-valuenow`, arrow-key
resize — not a mouse-only handle (SC 2.1.1).

### A16. The drawer's Escape, focus and empty state are all unspecified (accessibility)

There is **no existing non-modal persistent panel in this codebase** — `Dialog` and `Sheet`
are both native `<dialog>` + `showModal()`. So the drawer is a genuinely new pattern and
inherits none of the modal's free protections. Required commitments: Escape becomes an
explicit rung in ADR-0080's existing ladder using ADR-0079's target guard, never a new
listener; **focus stays on the stage** on selection change (moving it into the drawer would
yank focus on every chain-nav keystroke), with the subject change carried by the existing
`describeActivity` announcement rather than a second competing one; an explicit **empty
state**, never stale data from the last selection; ADR-0093's exact plural phrasing when
N > 1; and below `lg`, where it must overlay, it becomes **modal** — reuse `Sheet`, do not
invent a second overlay contract.

### A17. The warm hue is already doing six jobs (accessibility)

Critical fill, today, conflict badge, near-critical fill, over-allocation badge,
lane-overlap badge — disambiguated **only by shape**, at 7–9 px badge sizes. The proposal
is a **two-tone split within warm**: red-orange for "the schedule is in trouble" (critical,
today, conflict), amber for "resource/placement caution" (near-critical, over-allocation,
lane-overlap) — as a **redundant** cue on top of the shapes, which stay load-bearing. And a
hard rule: the solid/dashed **outline cue must survive any repaint**. It is the only thing
making a 1.5–1.70:1 lightness-only separation satisfy SC 1.4.1 at all. A tidier borderless
bar silently reopens the defect M1 fixed.

---

## B. The gate that comes before everything

**M0 — measure, decide nothing else.** Five consecutive epics in this register had their
width expectation contradicted by their own measurement (ADR-0090, 0091 D4, 0092 M4, 0093,
0097 Landing C). Graphite deletes the `⋯` — the escape hatch that made those failures
embarrassing rather than broken. Deleting the ladder on the strength of a mockup would be
the sixth.

M0 delivers, with falsification conditions written **before** the runs:

1. Natural width of the six toolbar groups + two mode segments + finish read-out at
   1280 / 1440 / 1646 / 1920, with a **real plan name** and a **resolved** finish chip
   (the widest state of every dynamic item, not the typical one).
2. The ADR-0061 primitives at 224 px — does a horizontal `Tabs` fit four labels, where does
   `FieldGrid` land, does `ContextStrip` read.
3. A **command census**: `buildTsldToolbarItems()`'s real set diffed against design.md §3's 38. A registered command in none of the homes is silently dropped today and nothing
   would report it.
4. Canvas draw budget re-measured at Graphite's chrome height — less chrome means more
   visible rows, and `TECH_DEBT.md` #75 already records the painter 4–6× over its stated
   budget.

**M0 gates M5. If the strip does not fit at 1280, the strip narrows — it does not get
shaved for a sixth epic.**

---

## C. Milestones

| #       | Slice                                                         | Ends with                                                                                                                |
| ------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **M0**  | Measure (no product code)                                     | A measurement document; falsification conditions stated first                                                            |
| **M1**  | Palette — _landed_                                            | Confirm the new pairs are gated; fix A8                                                                                  |
| **M2**  | The shell grid — _landed_ (`m2-shell-grid.md`)                | **Pixel-identical screenshots.** If not, the grid is wrong and it is cheap to learn here                                 |
| **M3**  | Rail; top bar deleted — _landed_ (`m3-rail-and-skip-link.md`) | Re-shoot all nine non-plan screens; axe on five routes                                                                   |
| **M4**  | Drawer — _landed_ (`m4-context-drawer.md`)                    | A Playwright assertion that the strip's `getBoundingClientRect().width` is **unchanged** across drawer open/close/resize |
| **M5**  | The single command strip — _landed_ (`m5-command-strip.md`)   | `e2e-toolbar-fit` **rewritten, not retired**; Escape target guard re-asserted                                            |
| **M6**  | Drawer as the activity context — replaces the modal           | Every existing `ActivityEditorDialog.*.test.tsx` passes **unchanged** (the ADR-0062 bar)                                 |
| **M7**  | Status bar; dock re-hosted; `Recalculate` becomes a state     | Three states — not calculated / calculating / calculated-zero-critical — must not collapse into one sentence             |
| **M8**  | Gantt grid beside chart                                       | **One** virtualizer, not two synced scrollers; row heights identical by construction                                     |
| **M9**  | Diagram stage; WBS colouring                                  | `sceneTopOffset` re-derived, not re-assumed                                                                              |
| **M10** | Gate pass                                                     | Five specialists; screenshots at four widths **plus a coarse-pointer run**                                               |

Standing gates every slice: `pnpm lint && typecheck && test`, plus `scripts/e2e-local.sh web`
(the base journey), plus **the full sweep on any slice that moves a label or a
layout** — locating controls by `[data-toolbar-item]`, never by copy.

**When the sweep runs, decided rather than drifted into.** `scripts/e2e-sweep.sh` is 33 suites and
about **two hours** on this machine, and six milestones remain. ADR-0096's own record says it "is
not a per-change step — its trigger is a change every journey passes through". Applying that
literally:

| Milestone      | Changes                            | Under every journey?                | Sweep    |
| -------------- | ---------------------------------- | ----------------------------------- | -------- |
| M3, M4         | the app shell                      | yes                                 | ran      |
| M5             | the command surface                | yes — every plan                    | yes      |
| M6, M7, M8, M9 | the editor / dock / Gantt / canvas | no — the affected suites cover them | targeted |
| M10            | gate pass                          | —                                   | yes      |

For M6–M9 the gate is the base journey plus the suites that drive the changed surface; M10's sweep
is the backstop. Running two-hour sweeps back to back for epic-internal states nobody will ship
buys confidence in a configuration that never existed.

---

## D. Decisions the product owner must make

**D1 — Drawer width and content split.** Resizable 224–420 (default 300) is the resolution
above. Confirm, or say the drawer should be wider still and Logic/Resources/Cost move into
it wholesale rather than staying dialogs at first.

**D2 — What carries CRITICAL when bars are coloured by WBS.** Colour is spoken for. The
candidates are an outline, a heavier end cap, a hatch, or the critical path drawn as an
emphasis pass over any fill. This is planner judgement.

**D3 — Float paths: a sixth drawer subject, or a stage overlay.** It cannot stay a third
right-hand dock.

**D4 — Chrome's accent: amber or azure.** `DESIGN_SYSTEM.md` documents amber as chrome's
primary and ring; ADR-0099 D6 says azure is the only interactive colour. Whichever wins,
the other document changes in the same commit.

---

## E. Divergence risks, named

- Deleting the ladder before M0 measures — the exact mistake ADR-0099 was written about.
- Hand-rolling the rail's tool buttons instead of registering them: the five modal tools
  need arm/disarm, Escape precedence, announcement and pen gating, and the registry already
  gives all five. Hand-rolling is how one control gets it and its neighbour does not.
- A new `rail` surface scope — costs a complete 31-name family for no vocabulary `chrome`
  lacks.
- Overlaying the drawer over the stage to keep the toolbar fixed. It works, and it
  reintroduces the obstruction ADR-0092 removed. The grid does the same job for free.

**D5 — The Gantt split's row model.** One `role="row"` spanning grid and chart via CSS
Grid, or two containers joined by `aria-owns`. Different component shapes; deciding after
building means rebuilding.

**D6 — Two-tone warm.** Split the warm family so critical/today/conflict and
near-critical/over-allocation/lane-overlap read differently, or keep one warm hue carrying
six meanings separated by shape alone at badge size.

---

## F. Decisions — RESOLVED 2026-08-19

Product owner: _"Go with your recommendations. Also alter anything layout wise if it doesn't
work, such as where the float path and the right toolbar are. If it's not working, alter it
rather than work around stuff. You have approval to change layout if agents agree."_

### F0 — LAYOUT CHANGED: rail moves to the LEADING edge, drawer to the TRAILING edge

**The arrangement we picked does not deliver the thing it was picked for.** The rail went
right so the Gantt's activity grid could start at the leading edge like P6 — but the drawer
stayed left, so the grid does not reach the leading edge. It reaches 224–420 px in, behind a
properties panel. The stated goal was unmet by construction and nobody spotted it, including
me, until the reviews forced the layout to be reasoned about as a whole.

Three independent blocking findings all resolve by swapping the two:

| Finding                   | Cause                                                                                             | Resolved by rail-left                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Accessibility A12         | Rail is Tab-order-last, after the toolbar, ~15 drawer fields and a `treegrid` of hundreds of rows | Rail is the first stop after the skip link                            |
| Accessibility A13         | At 200–400 % a magnifier user viewing the grid (left) cannot see the armed tool (right)           | Tools and grid share the leading edge                                 |
| UX B6 / architecture §3.6 | Rail + Notes + Float paths = three claimants on one edge                                          | Notes and Float paths fold into the drawer; **one** trailing occupant |

**Final layout:**

```
┌──────────────────────────────────────────────────────────────┐
│  TOOLBAR — spans stage + drawer, fixed (col 1/3, row 1)       │
├────┬────────────────────────────────────┬────────────────────┤
│RAIL│  STAGE                              │  DRAWER            │
│ 46 │  Gantt: grid │ splitter │ chart     │  224–420, resizable│
│ px │  Diagram: WBS band + plot           │  (trailing)        │
├────┴────────────────────────────────────┴────────────────────┤
│  STATUS BAR                                                   │
└──────────────────────────────────────────────────────────────┘
```

The Gantt grid now starts **46 px** from the leading edge instead of 224–420 px behind a
panel — which is as close to the original request as any arrangement gets while the product
has a tool rail at all. This is also the Figma / Illustrator / Sketch arrangement: tools
lead, inspector trails.

**Cost, stated:** 46 px of leading edge. Accepted.

### F1 — Drawer: resizable 224–420, default 300

Horizontal tab strip, never ADR-0061's vertical rail (which is 208 px on its own). Logic,
Resources and Cost move in with Details and Progress — **all five subjects in the drawer** —
because the resizable upper bound makes it viable and leaving three in dialogs would keep the
modal this epic exists to retire. `FieldGrid` pairs stack below ~384 px: accepted and stated.

### F2 — Criticality survives WBS colouring as an OUTLINE

When bar fill is driven by WBS, the critical path is drawn as a **2 px outline in the
critical hue plus the existing solid/dashed outline cue**, over any fill. Chosen over end
caps (too small at Week zoom), hatch (already the non-working channel) and weight (already
the driving-link channel). It satisfies SC 1.4.1 on its own, since it is a shape, and it is
the one channel `paint.ts` has spare. Colour-by is a **mode** — Criticality (default) / WBS /
Activity code / Float / Resource — extending the existing opt-in float lens rather than
inventing a mechanism.

### F3 — Float paths becomes a drawer subject

Sixth panel switch beside Explorer, Properties, Resources, Comments, Baselines. It stops
being a dock, which is what makes the trailing edge single-occupant.

### F4 — Chrome's accent is AZURE; the amber rule is superseded

ADR-0099 D6 wins over `DESIGN_SYSTEM.md`'s amber-on-chrome rule, because the amber rule
exists to solve a problem Graphite deletes: amber was chrome's primary _because_ the old
navy chrome could not carry a legible blue. Graphite's chrome is graphite, azure clears
6.33:1 on it, and one interactive colour across chrome, page and plot is worth more than
continuity with a rule written for a surface that no longer exists. `DESIGN_SYSTEM.md`
changes in the same commit. Amber survives as the brand mark and as `warning`.

### F5 — Gantt split: ONE row spanning both panes

CSS Grid, `grid-column` placement, DOM order matching visual order. Not two containers
joined by `aria-owns` — that is a correspondence that can go stale, and a stale one is
invisible until an AT user hits it. One virtualizer, one `role="row"`, one coordinate frame
for the link overlay.

### F6 — Warm splits two-tone

Red-orange for _the schedule is in trouble_ (critical, today, conflict); amber for
_resource/placement caution_ (near-critical, over-allocation, lane-overlap). Redundant on
top of the shape cues, which stay load-bearing. Fixes the `today`/`conflict`/`critical`
aliasing defect (A8) as a side effect rather than a separate patch.
