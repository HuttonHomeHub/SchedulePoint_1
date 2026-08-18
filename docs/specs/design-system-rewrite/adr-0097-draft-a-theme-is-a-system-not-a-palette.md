# ADR-0097: A theme is a system, not a palette — three token axes, a sixth surface, and a closure instead of a list

- **Status:** **Proposed** — drafted 2026-08-18, stops for approval.
- **Date:** 2026-08-18
- **Deciders:** Product owner (the mandate; CQ-A–CQ-D); ui-architect. Inputs from the
  `corporate-brand` feature-analyst pass and from the `--destructive-hover` fix that landed the same
  day.
- **Spec:** [`../specs/design-system-rewrite/`](./README.md) — `diagnosis.md`, `design.md`,
  `hard-surfaces.md`, `migration.md`.
- **Amends:** **ADR-0055** (surface scopes — the mechanism is kept and extended along two new axes;
  §1's "complete or it is a trap" is _strengthened_ into a closure, not weakened). **ADR-0077**
  (the `brand`/`auth` scopes — theme-invariance untouched; §1's five-condition bar is applied to a
  sixth scope and gains a sixth condition). **ADR-0006** (tokens/CVA — the token layer gains kinds
  beyond colour).
- **Supersedes:** nothing.
- **Builds on:** ADR-0026 (canvas rendering), ADR-0059 (the Gantt substrate), ADR-0061 (form
  layout), ADR-0065 (the measured painter cost), ADR-0078 (canvas module boundaries and the
  per-frame context), ADR-0082/0083 (menu and field treatments), ADR-0088 (a `VITE_` flag is not an
  operator rollback), ADR-0090/0091 (the measured toolbar ladder).

> **On filing.** This document is drafted in `docs/specs/design-system-rewrite/` and is moved into
> `docs/adr/` as the **first** task of the implementation plan. ADR-0071 lived in a spec directory
> for its whole epic, was cited by number in shipped code, and was absent from the register until
> another spec tripped over it. It cannot arrive alone either: `scripts/check-counts.mjs:55`
> re-derives the ADR count from `docs/adr/`, so the file, the `CLAUDE.md` §16 entry, the banner count
> bump and the `docs/adr/README.md` row are **one commit**.
>
> **The number was assigned rather than derived.** Two other specs were in flight and one of them had
> also proposed 0097 (`corporate-brand/feature-spec.md` §4.12); the coordinator assigned this one
> 0097 and the landing page 0098. Recorded because ADR-0079 had to be renumbered when its number was
> taken between its plan and its milestone.

---

## Context

The product owner reopened the visual design system on 2026-08-18:

> _"For the theme and design you have a blank canvas. The theme and design were set at the beginning
> but as the app has developed it has been **constrained to existing design protocol**. This is your
> opportunity to **rewrite the theme and design from the ground up** based on the **full feature set
> we have today** and **what you think will come in the future**."_

And, on the existing `.corporate` skin: _"it looks and feels like a **badly designed skin**. I want
the corporate theme to be the main theme that the app is designed to."_ Corporate Dark is not
planned.

### The finding that turns the adjective into a work item

**A theme in this application can structurally express nothing but colour.** All 117 custom
properties `.corporate` declares (`globals.css:508-730`) are colours; `--radius` is declared once at
`:root:35` and no theme block restates it; `@theme inline:1021-1079` maps colours, two font families
and four radii derived from that one `--radius`. Established twice independently — by the
`corporate-brand` analyst pass (**D1**) and by the `--destructive-hover` fix.

So "it is a skin" is not only an aesthetic judgement. It is a description of what the mechanism
permits.

### Following it one step further

The design system as a whole has **one scoping mechanism** (`[data-surface]`) carrying **one kind of
value** (colour). Everything a planning tool would vary lives outside it:

| what                       | value | where it actually lives         |
| -------------------------- | ----: | ------------------------------- |
| Project Explorer tree row  |  28px | `HierarchyTree.tsx:26`          |
| TSLD lane / bar            | 28/18 | `render/geometry.ts:35,37`      |
| Gantt row                  |  32px | `GanttPanel.tsx:66`             |
| Gantt ruler                |  34px | `GanttRuler.tsx:6`              |
| TSLD ruler                 |  40px | `TsldCanvas.tsx:140`            |
| toolbar control minor axis |  36px | `docs/TECH_DEBT.md` #127        |
| `Button` / `Input`         |  40px | `button.tsx:22`, `input.tsx:17` |

Two rulers 6 px apart draw the same time axis of the same plan, in a product whose ADR-0059 rule is
_"the time axis is shared, not reimplemented"_ — the **scale** was shared; the **band** was not,
because there was nowhere to put the decision. `text-3xl`, which `docs/DESIGN_SYSTEM.md:87` assigns
to page titles, appears **zero** times in `apps/web/src`. `tabular-nums` appears **29 times across 18
files** and in no primitive. `mx-auto w-full max-w-6xl flex-1 p-6` appears verbatim **15 times across
12 route files**.

### And the one surface the system never reached

`render/palette.ts:12` resolves the diagram's palette from `document.documentElement`. So the bar
fill is the **page's** `--primary`, the critical fill is the **page's** `--destructive`, and the
label ink is the **page's** `--primary-foreground` — painted on `--canvas`, which is a different
token from `--background` and, in Corporate with the canvas flag on, a genuinely different colour.

That is ADR-0055's original defect — a partial family whose inks were validated against the wrong
fill — surviving in the one place ADR-0055 never reached. It has not surfaced only because
`--canvas` is byte-identical to `--card` in Light and Dark (`globals.css:206`, `:424`).

`token-contrast.test.ts` contains the string `canvas` **twice**: once in a comment and once as a
flag-attribute name. There is no pair involving `--canvas`, `--canvas-band`, `--canvas-grid-*` or
`--canvas-nonworking-hatch` anywhere in the matrix. Hand-computed from `globals.css`
(`diagnosis.md` §3.3), the three bar states are separated by **1.27:1** in Light (ordinary vs
critical) and **1.34:1** in Corporate (near-critical vs critical).

**That is a design-quality failure on the primary surface of a scheduling product, and it is
deliberately _not_ claimed as an accessibility one.** A draft of this ADR called it "the
monochrome-print legibility test", on the reasoning that `resolvePrintPalette` puts the same tokens
on paper. Verified with a shell: the print palette carries `outline` (`palette.ts:135`), `paint.ts`
strokes critical and near-critical bars with it on the print path as on screen, and two docblocks
state that the solid-versus-dashed shape cue is what satisfies 1.4.1. The figures are right —
recomputed independently — and the claim built on them was one step too strong. Corrected here rather
than dropped, which is ADR-0082's precedent for an overstated citation.

### And a rule that fails once per discovery

Three people have now found a token outside `REBOUND_NAMES` (`token-architecture.test.ts:83-102`)
that would fail if a component ever landed somewhere new — the original three-token chrome stub,
`--secondary` (`corporate-brand` G3, latent), and `--destructive` (`--background` vs `--destructive`
at **2.92:1** inside a scope, latent). Each time the available answer was "add that one".

---

## Decision

### D1 — The token layer gains three axes and keeps its mechanism

| Axis                              | Today                              | After                                                                   |
| --------------------------------- | ---------------------------------- | ----------------------------------------------------------------------- |
| **Colour**, scoped by surface     | 5 scopes × 18 names × 3 themes     | 6 scopes + **role packs** for what a scope actually plays               |
| **Metric**, scoped by **density** | Does not exist                     | `[data-density]`, reusing the `[data-surface]` mechanism                |
| **Type**, two ramps               | One ramp, top unused, no data half | A prose ramp **with a top**, and a **data ramp** owning tabular figures |
| **Meaning on the diagram**        | Borrowed from the page, ungated    | A validated family, a separation matrix, geometry tokens                |

ADR-0055's mechanism is **kept unamended in substance**: one vocabulary rebound per surface; the
families absent from `@theme inline` so `bg-chrome` does not compile; `@theme inline`'s `inline`
load-bearing; portals leave every scope; no descendant learns where it is.

A React `SurfaceContext`, a per-surface CVA variant matrix and per-theme component overrides were
**all rejected by ADR-0055's own Alternatives section** and the reasons have not changed — one of
them gets strictly worse with a sixth surface. Reopening a decision that is right, gated and
load-bearing would spend the epic on a rewrite producing the same file.

### D2 — The diagram becomes the sixth surface scope

`SurfaceTone` gains `'canvas'`; the TSLD diagram container and the Gantt chart region are wrapped in
`<Surface tone="canvas">`; `resolveTsldPalette` — **whose signature already takes an `Element`**
(`palette.ts:12`) — is handed that node instead of the document root, as are the WBS-band, lens,
resource-strip and **print** resolvers.

**Not one line of the painter changes.** It keeps reading `--color-primary`, `--color-destructive`,
`--color-warning`, `--color-foreground`, `--color-muted-foreground`, `--color-ring`; only the element
those names are resolved against does. That is condition 1 of ADR-0077 §1's bar met exactly, and all
five are argued in `design.md` §1.2.

Three consequences fall out for free, which is the test of a mechanism: **the Gantt gets the same
drawing ground** (ADR-0059's shared-axis rule applied one level up), the global `--canvas` /
`--canvas-band` tokens can be **retired** because inside the scope `--background` _is_ the diagram
ground, and `handleHalo`'s theme-inverse pairing argument becomes true by construction rather than by
coincidence.

### D3 — A scope declares **packs**, and the 18-token base stays mandatory

`PLOT` (`-plot-band`, three grid tiers, the non-working hatch) is declared by `canvas`; `GROUND`
(`-ground`, `-ground-end`) by `auth`. The discriminator: **if the thing has a semantic sibling in the
base vocabulary, rebind it; if it does not, pack it.** A month band is not one of the eighteen names;
a critical bar fill is `--destructive`.

The base stays mandatory for every scope. "Complete or it is a trap" is not weakened.

### D4 — `--primary` stops meaning two things

Inside the canvas scope `--primary` is _the ordinary activity fill_; outside it, _the action colour_.
Today it is both, which is why Corporate — having promoted amber to `--primary` — had to move
`--warning` to bronze so an ordinary bar and a near-critical bar were not the same colour
(`globals.css:501-506`). **The diagram was re-coloured because the button was.** The scope removes
the coupling with no new name, and the bronze survives on its own merits or is withdrawn on them.

### D5 — The accent gets a placement rule

> **The brand accent marks _where you are_ and _what will happen if you act_. It never marks _what
> something is_.**

So: the current nav item, the selected row, the active mode, a pressed toggle, the primary action's
fill, the focus ring on its own surface. **Never** a status, a criticality, a float band, a
categorical series, or anything on the diagram.

This makes the amber/near-critical collision **structurally impossible** rather than managed, and it
makes the placement censusable (`ACCENT_ROLES`, a total `Record`). Its blind spot is stated: a census
proves a _binding_, not _prominence_ — it cannot tell you the accent is a 28×28 px tile.

### D6 — "Complete" becomes a closure, not a count

This replaces the rule that has failed three times.

> **The defect is never "a token is not rebound". The defect is a pair whose two halves are governed
> by different scopes.**

Three parts:

1. **The page becomes an explicit family, `--page-*`**, so all six scopes are symmetric and the
   unqualified names are always a _binding_, never a source.
2. **`REBOUND_NAMES` is computed as a closure and asserted, not authored.** Seed with the scope's
   fill and foreground; add any token that can be composited with a member in a utility the build can
   compile; iterate to a fixed point. Over today's `@theme inline` that pulls in `--destructive`,
   `--destructive-foreground`, `--destructive-hover`, `--secondary`, `--secondary-foreground` and the
   three solid status triples — **without anyone having to notice them.**
3. **A second fill inside a scope is a _reset_, not a member.** `Card` and `Popover` restore the page
   family for their subtree. This _keeps_ ADR-0055's promise that a `Card` means the same thing
   everywhere, and it closes a **latent** split pair nobody has raised: `CardDescription` is
   `text-muted-foreground` (rebound) on `bg-card` (not rebound), so the two halves of one composited
   pair would be governed by different scopes.

   **Latent, not live, and the distinction is load-bearing** — it decides whether this ships on its
   own or inside the rewrite. Verified with a shell: there is **no `<Card>` and no `bg-card` inside
   any of the six `<Surface>` sites**. A draft of this ADR named the Project Explorer rail as the
   instance; it is not one — the rail's panel scopes hold the tree and the resizer. The only
   Card-family usage inside a scope is `auth-shell.tsx:66-70`, which renders
   `CardHeader`/`CardTitle`/`CardDescription` **without** a `<Card>` wrapper, on `bg-background`,
   which _is_ rebound — so both halves sit in `auth` and nothing splits.

   **This is the better argument for the closure, not a weaker one.** The pair is compilable, so it
   is one component move from being real, and nothing in the build would report it. A rule that
   depends on "it is broken today" can be falsified by a component moving the other way; a rule that
   depends on "this is one move from breaking and is unreportable" cannot.

**So: a scope is complete when no pair a compiled utility can composite is split across two scopes.**
The count becomes an output.

### D7 — An interaction state is a token, and the rule is directional

`hover:bg-destructive/90` is not `--destructive`; it is `--destructive` composited at 90 % against
its backdrop, which in Light took a Delete button's label to **4.32:1** — a live WCAG 1.4.3 failure,
found while asserting the rest state (which passes at **4.56:1**) and fixed with a
`--destructive-hover` token in all three themes.

> **Hover moves the fill _away from the surface it sits on_.**

It reads as an inconsistency — Dark lightens, Light and Corporate darken — and it is not: darkening
in Dark takes the fill to **2.96:1** against its own page, so the control would stop being
distinguishable from what it sits on in the act of being hovered. The direction is a per-theme fact
about which way there is room. `--{token}-hover` joins the closure, and "the surface it sits on" is
the **governing scope's** fill.

### D8 — Density is a scope, and the surface decides it

`[data-density='compact' | 'default' | 'comfortable']`, stamped by a `<Density>` component exactly as
`<Surface>` stamps a tone, and for the same reason: components never branch on the theme in JS.

The workspace and its panels are `compact`; content pages, dialogs and forms are `default`;
`@media (pointer: coarse)` resolves `comfortable`. **No user-facing density setting** — that is a
second product maintained forever (ADR-0088's Class A argument) for a preference nobody asked for.

**One deliberate asymmetry with the colour families:** metric tokens **do** get Tailwind utilities
(`h-control-md`). A colour family must be unreachable because a component must never _choose_ a
surface; a metric token must be reachable because a component must be able to say _what kind of thing
it is_, and the density scope decides what that means.

**And the rule that keeps the toolbar safe:** metric tokens land **frozen at today's shipped
values**, and every later change to one is its own commit with `measure:toolbar` and
`test:e2e:toolbar-fit` at **1646** run before and after. Four consecutive epics found their width
expectation contradicted by their own measurement (ADR-0091 D4, ADR-0092 M4, ADR-0093, ADR-0094
M0-T1); this one does not add a fifth by arithmetic.

### D9 — Two type ramps, and the data ramp owns tabular figures

The prose ramp gets a top (`--text-page`, the size `text-3xl` was documented for and never used),
owned by `PageHeader` so `diagnosis.md` §1.2 cannot recur one route at a time.

The **data ramp** (`text-data`, `text-data-sm`) sets size, line-height **and**
`font-variant-numeric: tabular-nums` together, so a number cannot be typeset in this product without
tabular figures. That retires 29 hand-applied `tabular-nums` across 18 files, and the lint rule that
goes with it stops the 30th. `--font-mono` stays separate: tabular figures are for _quantities in
columns_, monospace is for _strings you compare character by character_.

### D10 — A page becomes a component

`PageContainer`, `PageHeader`, `SectionCard`, `EmptyState`, `Skeleton`, `ListRow`. `CardTitle` gains
`level?: 1 | 2 | 3` defaulting to **2**, which deletes `staff.tsx:117-118`'s written workaround —
_"`CardTitle` is deliberately not used: it renders an `h1` and this page already has one"_ — and
fixes the one-`<h1>`-per-page violation everywhere else at the same time. `DataTable` gains a
`numeric` column flag, a sticky header and skeleton rows.

**`EmptyState` and `Skeleton` close `docs/TECH_DEBT.md` #21(d) and `docs/UX_STANDARDS.md`'s
year-old skeleton requirement**, and they land in L3 so the organisation-landing epic (ADR-0098)
**consumes** them rather than building the bridge its §0.3 offers to build.

### D11 — Elevation stays borders-first, and gets a token so a theme can say which mechanism it uses

`shadow-*` appears at **10 sites**, nine of them floating layers plus `Card`. That is a decision, not
flatness by neglect, and reading "badly designed skin" as "needs shadows" would spend the one channel
that says _this floats above that_ in a product with an unusual number of simultaneously-floating
layers.

The refinement is that the model already runs on **two** mechanisms and names one: on a dark surface
a black shadow does nothing, and what separates Dark's `Card` from its page is the fill step plus
`--border` at 10 % white. So `--elevation-1|2|3` become theme-scoped tokens and the rule is written
down: **elevation is carried by a shadow on light surfaces and by a fill step plus a brighter border
on dark ones; a dark theme may set its shadow to `none`, and that is the model working.**

### D12 — Four gates, each modelled on a named precedent

| Gate                           | What it does                                                                                                                                                                    | Precedent                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **The pair census**            | Derives the pair universe from `@theme inline`; every pair measured or classified with a reason. Covers **alpha-modified fills** and fails a **split pair regardless of ratio** | ADR-0073's route census             |
| **The plot separation matrix** | Plot fills vs the ground, vs the band, vs each other; inks on their own fills; **and the print palette**                                                                        | `token-contrast.test.ts:189-213`    |
| **The rhythm ratchet**         | No arbitrary sizing value; no `tabular-nums` in a `className`; no bare row-height constant. Set at the measured floor of **27**                                                 | ADR-0058's coverage ratchets        |
| **Total records**              | `Record<SurfaceTone, …>`, `Record<Density, …>`, `Record<PlotRole, …>`, `Record<AccentRole, …>` — a new member is a typecheck failure                                            | ADR-0094's `Record<ConflictKey, …>` |

Plus the page-frame structural test (`surface-seams.structural.test.ts`'s shape, **including its own
note that the protection is in the regex and the allowlist is what must not grow**), and the existing
architecture and contrast suites extended.

The pair census's blind spot is written into its own docblock: **it forces a classification, not a
correct one.** A pair wrongly classified "never rendered" passes.

### D13 — No feature flag, and the rollback is a commit boundary

A `VITE_` flag is not an operator rollback and never has been (ADR-0088: Vite inlines at build time,
the Dockerfile declares one `VITE_` build arg, the publish workflow passes none, `.dockerignore`
strips `**/.env`). A flag would also add a Class A alternative surface whose cap ADR-0088 D3 ratchets
**down**, and for a page-frame migration it is actively worse: two page layouts in twelve route
files, and the flag-off copy is the code nobody reads and everybody breaks.

Instead the epic is sequenced so that **L1 and L2 are byte-identical by construction** and their
rollback is therefore free, and L3 changes **no public component API**, so its rollback is a revert
rather than a rewrite (ADR-0078's barrel-preserving argument).

### D14 — Six scopes is the ceiling, and a seventh needs a sixth condition

`page`, `chrome`, `panel`, `brand`, `auth`, `canvas` — 6 × 18 base declarations per theme × 3 themes,
plus packs. `brand` and `auth` alone are 108 declarations that must stay identical, guarded by an
assertion that exists _because the completeness sweep structurally cannot see them_.

**A seventh scope must show, in an ADR, what the sixth could not do for it**, in addition to
ADR-0077 §1's five conditions. Two that will be proposed and should be refused: a `dialog` scope
(portals already leave every scope — a dialog _is_ the page, and that is correct) and a `print` scope
(the print path is a palette, not a surface).

---

## Alternatives considered

- **Re-derive Corporate's colour values.** The intuitive reading of "badly designed skin".
  **Rejected**, and by measurement rather than taste: ADR-0077 M7's computed matrix found two WCAG
  1.4.11 failures **in the old app's own values** and derived them to 3.01–3.36:1 at the same hue; a
  fresh sampling pass reintroduces both. The `corporate-brand` diagnosis shows the fault is not the
  colours — it is that there are only colours.
- **Promote amber to the page's `--primary`.** **Already rejected in code, with the measurement**:
  amber on the off-white page is 1.92:1 (`globals.css:517-523`), below the 3:1 that 1.4.11 asks of a
  fill identifying a control, and darkening it to 3:1 lands on the bronze `--warning` occupies.
- **Keep adding names to `REBOUND_NAMES` as they are discovered.** The status quo. **Rejected** —
  three finders, three additions, and the fourth is waiting. D6 replaces the list with a closure.
- **Make `--card` a rebound name.** Would fix the `CardDescription` split pair and would break
  ADR-0055's "a `Card` means the same thing everywhere". **Rejected** in favour of the reset (D6.3),
  which keeps the promise and fixes the pair.
- **A seventh `card` surface family.** Eighteen more tokens per theme for a container that wants four.
  **Rejected** — a reset re-enters the page's vocabulary rather than declaring a new one.
- **Adopt a component library (Radix, shadcn/ui, a headless kit).** **Rejected**, and this is the
  place to record it rather than to leave it as an assumption. The three things this rewrite most
  needs — surface-scoped tokens, a density axis in CSS custom properties, and a canvas that resolves
  its palette from the DOM — are all _below_ the layer a library operates at. A library would supply
  behaviour we already have (`Menu`, `Combobox`, `Toolbar`, `Tabs`, `Dialog`, all APG-conformant and
  tested) and arrive with opinions about exactly the layer being rewritten. The honest cost of not
  adopting one is four small components with no interaction behaviour worth importing.
- **A `VITE_DESIGN_SYSTEM_V2` flag.** **Rejected** — D13.
- **A Corporate-only structure**, with Light and Dark keeping today's layout. **Rejected**: it is a
  Class A alternative surface (ADR-0088), i.e. a second product maintained forever, and it means the
  two "secondary" themes are the ones nobody looks at _and_ the ones with a divergent codebase.
- **Add elevation everywhere as the cure for flatness.** **Rejected** — D11.
- **Move the diagram's ruler into the Canvas 2D painter** so band and ground are one artefact.
  **Rejected by ADR-0055 §4 already**, for the reason that has not changed: it spends the scarcest
  budget in the app (per-frame `fillText`) on the one thing the DOM does better.
- **Do the design work without a ui-architect pass.** **Rejected** — CLAUDE.md §20, and it is how
  this identity became a skin the first time.

---

## Consequences

### Positive

- **The diagram joins the design system.** The surface where colour is _semantic_ — critical path,
  near-critical, float tails, drift, conflicts, baseline variance — stops borrowing the page's values
  and starts being measured against its own ground, its own band, and itself, in every theme and on
  paper. That is the single largest correctness gain in the epic and it is invisible until the day a
  theme gives the diagram a real ground, which is exactly when it would have been a defect.
- **A theme can express a decision that is not a colour.** Density, rhythm, rule weight, elevation
  mechanism and the diagram's geometry become theme- and density-reachable.
- **A class of unreportable contrast defect becomes impossible rather than undiscovered.** The
  closure governs every compilable pair; the census covers alpha modifiers; a split pair fails
  regardless of ratio. Of the four instances that motivated it, **one was live** (`bg-destructive/90`
  at 4.32:1, found and fixed while this ADR was being drafted) and **three are latent** — and the
  latent ones are the better argument, because each is one component move from being real with
  nothing in the build that would say so.
- **Two long-standing debts close as consequences rather than as work:** `docs/TECH_DEBT.md` #21(d)
  (no `EmptyState`), and #127 (40 × 36 touch targets against a 44 × 44 house rule) — the latter
  because a density scope can raise a coarse-pointer target without adding 16 px to every desktop
  planner's band, which is the reason that entry is still open.
- **The organisation landing page (ADR-0098) is served rather than constrained.** All five things its
  §0.3 says the vocabulary cannot express are answered by name and land in L3.
- **A fourth theme becomes a block of values**, as ADR-0055 promised — but now including its
  non-colour decisions.

### Negative / accepted

- **`globals.css` gets substantially longer** — six base families plus packs plus metric layers plus
  `--page-*`, in three theme blocks, from 1,114 lines today. Editing one colour means editing it in
  more places, and only the gates stand between that and drift. **This is the epic's largest ongoing
  cost and it does not go away.**
- **Light and Dark change visibly**, and they were called "secondary". Shared structure means an epic
  commissioned for Corporate restructures the other two. This must be approved rather than
  discovered.
- **Between L2 and L4 the product is in a half-state** and will look slightly _more_ inconsistent —
  a real page title beside a card title that has not moved yet. That is the price of not flipping
  structure and values together, which is the trade ADR-0055 §8.1 made deliberately.
- **The plot separation gate ships red-if-asserted**, so it ships **reporting** (CQ-D) until L4. A
  reported number everyone learns to scroll past is a real risk; the mitigation is that L4's first
  commit is the one that satisfies it.
- **`resolveTsldPalette`'s root becomes load-bearing.** A function four callers share gains a way to
  be silently wrong — an unmounted or out-of-scope element resolves page values, which is today's
  behaviour and therefore invisible without a dedicated test. `resolvePrintPalette` is the one most
  likely to be missed.
- **Density-by-surface means a control's height depends on where it lands**, which is the opposite of
  the surface-scope property that no descendant learns where it is. Mitigated only by its being
  inherited CSS rather than a threaded prop.
- **The closure governs pairs the product never renders.** A superset, deliberately: a governed pair
  nobody paints costs three lines of CSS; an ungoverned pair somebody paints costs a failure nobody
  can see coming.
- **The scope count becomes the thing to defend.** Six is affordable; the seventh is where this
  becomes unmaintainable, and the only thing preventing it is a written bar and a reviewer applying
  it.

### Neutral / follow-ups

- `docs/DESIGN_SYSTEM.md` is **re-derived from the gates**, closing five drifts it carries today: the
  unused `text-3xl` page-title size, the 36-vs-40 control scale, a `DataTable` described with five
  features it does not have, "three scopes" at §230 against "five scopes" at §267, and "17-token
  family" against the gate's 18. `docs/COMPONENT_LIBRARY.md` gains six primitives;
  `docs/FRONTEND_ARCHITECTURE.md` gains the density axis and the canvas scope.
- `docs/TECH_DEBT.md` **#126** (four toolbar segments with no icons) is answered with a **rule** —
  a mode's glyph depicts the mode's effect on the diagram, not its name — and the constraint that all
  four land together. The glyph names must be **verified against the installed
  `lucide-react@^1.29.0`** before being written down; naming an icon that does not exist in the
  installed version is the ADR-0076 Class 2 shape.
- `docs/TECH_DEBT.md` **#131** (an icon-only control names itself only on hover, on a device with no
  hover) is answered with a second prominence channel: an icon-only control must carry a persistent,
  non-hover name.
- `docs/TECH_DEBT.md` **#75** (the canvas draw budget, measured at 4–6× ADR-0026 §16 and never
  re-set) is **not** answered here, and must not be quietly answered here. L1 and L2 each re-run
  `apps/web/scripts/measure-link-routing.mjs` and record the numbers, so this epic leaves it
  measurable.
- The **Corporate default flip** belongs to the sibling epic (`docs/specs/corporate-brand/`). If it
  lands first, ADR-0077 §2's premise **strengthens**: the pinned front door and the default
  application finally show one identity.

### The CPM engine and the recalculation parity gate

**The CPM engine is not imported and no migration runs.** This is client-side design-system work;
there is no code path into `computeSchedule` and no scheduling input is added, removed or defaulted.
The ADR-0034 parity gate is untouched **by construction** — in its honest form: there is nothing here
to hold parity for.

---

## What this ADR records about its own making

Three things, because this register is largely a record of claims that turned out false.

1. **This session had no shell.** Every ratio in the spec is either quoted from a file that computed
   it or **hand-computed** from `globals.css` using this repository's own transform
   (`src/test/colour.ts`). Each says which. **L0-T1 executes them.** The identity that made it
   possible is worth keeping: for an achromatic `oklch(L 0 0)`, relative luminance is exactly `L³`,
   because `oklchToSrgb`'s three matrix rows sum to 1.0 when `a = b = 0`.
2. **One hand-computed figure contradicted a sibling spec and was then confirmed independently.**
   `corporate-brand` G2 hypothesised that Light's `--destructive`/`--destructive-foreground` was a
   live 1.4.3 failure; hand-computation gave **4.56:1** — a pass by 0.06 — and the
   `--destructive-hover` fix computed the same number the same day.
3. **And the confirmation came with a defect this document had missed**, which changed a gate. The
   _hover_ state — `bg-destructive/90` — was **4.32:1**, a live failure. I had examined the token and
   found a pass; the defect was in the modifier. **The matrix measures tokens; the browser paints
   utilities.** D12's pair census covers alpha-modified fills because of that, not because a reviewer
   should remember to check them.
