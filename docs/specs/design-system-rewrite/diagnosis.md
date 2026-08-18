# Diagnosis — what is actually undesigned, and which kind of undesigned it is

> Every finding below names the file and line that established it. Where a number was computed
> rather than read, it says **hand-computed** and gives the inputs, because this session had no
> shell (`README.md` §"What was measured"). Nothing here is asserted from a brief — including this
> epic's own (ADR-0076 §19.10, whose two recorded failures both entered through one).

The brief asks for three categories to be kept apart, and they turn out to have very different
remedies:

- **§1 — Inherited a decision made for a different app.** The vocabulary was authored for a
  clients → projects → plans CRUD shell. These are the load-bearing ones.
- **§2 — Was never decided.** Nobody chose it; a default chose it, or fifteen call sites each chose
  it separately.
- **§3 — Semantics, and the one place the system does not reach.** The canvas.
- **§4 — Deliberate accepted trades, which are defended and stay.**

---

## §0. What is carried from `docs/specs/corporate-brand/`, and the one thing I contradict

### 0.1 Carried, not re-derived

That spec's §0.5 established eight findings by reading files. I take all eight as input. The three
that shape this design most:

- **D1 — a theme in this application can only express colour, structurally.** All 117 declarations
  in `.corporate` (`globals.css:508-730`) are colours; `--radius` is declared once at `:root:35` and
  no theme restates it; `@theme inline:1021-1079` maps colours, two font families and four radii
  derived from that one `--radius`. **This is the spine of the whole rewrite**, and §1 below is what
  happens when you follow it one step further than that spec needed to.
- **D5 — every content page hand-rolls the same frame.** `mx-auto w-full max-w-6xl flex-1 p-6`,
  verbatim, 15 times across 12 route files. Independently confirmed here: `max-w-6xl` returns 15
  hits under `apps/web/src/routes/`.
- **D7 — the control density is a component-library default.** `button.tsx:22-25` is
  `default h-10 / sm h-9 / lg h-11`; `docs/DESIGN_SYSTEM.md:102` documents `sm h-8 / md h-9 / lg
h-10`. Every step is one rung above the document.

### 0.2 The one I contradict, with the arithmetic

That spec's **G2** says `--destructive`/`--destructive-foreground` is absent from the contrast
matrix and that Light's value _"is a plausible sub-4.5:1 pair — i.e. a live WCAG 1.4.3 failure on
every Delete button in today's default theme"_.

**The absence is confirmed.** `token-contrast.test.ts` does not contain the string `--secondary`,
`--card`, `--popover`, or a `--destructive`/`--destructive-foreground` pair — searched, zero hits.
`TEXT_PAIRS` (`:86-120`) pairs the solid `--success`, `--warning` and `--info` with their
foregrounds and **skips `--destructive`**, which is the one an ordinary user meets most.

**The failure hypothesis does not hold, hand-computed.** Light's `--destructive` is
`oklch(0.577 0.245 27.325)` (`globals.css:58`) and `--destructive-foreground` is `oklch(0.985 0 0)`
(`:59`). Running the repository's own transform (`src/test/colour.ts:35-52` for OKLCH → sRGB,
`:119-122` for luminance, `:125-129` for the ratio) by hand:

| step                                                           | value                                 |
| -------------------------------------------------------------- | ------------------------------------- |
| `l' m' s'`                                                     | `0.687538` / `0.546843` / `0.412284`  |
| linear R G B (before the clamp)                                | `0.800406` / `-0.009501` / `0.003289` |
| linear R G B (after `clamp01`, which is what a browser paints) | `0.800406` / `0` / `0.003289`         |
| relative luminance of the fill                                 | **`0.17040`**                         |
| relative luminance of `oklch(0.985 0 0)` (= L³)                | **`0.95567`**                         |
| **ratio**                                                      | **`4.56:1`**                          |

So it **passes, by 0.06**.

**Confirmed independently, and the confirmation came with a defect I had missed.** While this
document was being written, the coordinator computed the same pair and got the same number — **rest
4.56:1** — and then computed the one I had not: `hover:bg-destructive/90` (`button.tsx:19`).
**4.32:1 hovered.** A live WCAG 1.4.3 failure on every Delete button in the default theme, now fixed
by a `--destructive-hover` token in all three themes.

Three things follow, and the third is the one that changes this design.

1. **The pair goes in the matrix, urgently.** It clears the bar by less than any other pair in the
   file.
2. **My arithmetic is not the record.** It agreed this time; `L0-T1` executes it anyway. If an
   executed figure ever disagrees with a hand-computed one in these documents, the hand-computed one
   is wrong and this paragraph is how (ADR-0076 Class 3).
3. **A token pair that passes can fail as rendered, and the reason is general.** `bg-destructive/90`
   is not `--destructive`; it is `--destructive` composited at 90 % against whatever is behind it,
   which in Light lightens it toward white. **The matrix measures tokens; the browser paints
   utilities.** I looked at the token and found a pass; the defect was in the modifier. Searched:
   `button.tsx:11,12,19` alone carries `/90`, `/80` and `/90`, and none of the three composites is
   measured anywhere. `design.md` §8.1 extends the pair census to cover alpha-modified fills for
   exactly this reason — **not** because a reviewer should remember to check them.

The greyscale note that makes the whole exercise worth doing: **for an achromatic `oklch(L 0 0)` the
relative luminance is exactly `L³`.** The three matrix rows of `oklchToSrgb` sum to 1.0 for a=b=0, so
every channel is `L³`, and `decodeGamma(encodeGamma(x)) = x`. That identity is used throughout this
document and is why the grey pairs can be checked without a computer.

---

## §1. Inherited from a different app — the load-bearing findings

### 1.1 The token layer has one axis, and the app needs three

D1 says a theme can only express colour. Follow it one step: **the design system as a whole has one
scoping mechanism, `[data-surface]`, and it carries one kind of value, colour.** Everything a
planning tool would want to vary — how tight a row is, how tall a control is, how heavy a rule is,
what a number looks like in a column — is either a Tailwind default, a shadcn-derived default, or a
`const` in a feature file.

The evidence is a list of five numbers that disagree, each authored by a different epic, none of them
a token:

| what                       | value | source                          |
| -------------------------- | ----: | ------------------------------- |
| Project Explorer tree row  |  28px | `HierarchyTree.tsx:26`          |
| TSLD lane                  |  28px | `render/geometry.ts:35`         |
| TSLD activity bar          |  18px | `render/geometry.ts:37`         |
| Gantt row                  |  32px | `GanttPanel.tsx:66`             |
| Gantt ruler band           |  34px | `GanttRuler.tsx:6`              |
| TSLD ruler band            |  40px | `TsldCanvas.tsx:140`            |
| toolbar control minor axis |  36px | `docs/TECH_DEBT.md` #127        |
| `Button` / `Input`         |  40px | `button.tsx:22`, `input.tsx:17` |

Two of those are worth stating as sentences rather than rows.

**Two rulers, 40 and 34, for the same time axis.** ADR-0059's load-bearing rule is _"the time axis is
shared, not reimplemented — a second date→pixel implementation is how two views drift about where a
Monday is"_. The **scale** was shared. The **band that draws it** was not, and it is 6 px different
between the two views of the same plan. Nobody has ever been wrong about a Monday because of it;
that is not the point. The point is that there was no place to put the decision, so it was taken
twice.

**Two row rhythms for the same object.** An activity is a 28 px row in the Explorer's ancestry, a
32 px row in the Gantt, and a `py-2` cell in the activities table. A planner switching views is
reading the same list at three densities.

### 1.2 The page has no primitive, so it has no decisions

D5's 15 copies are the symptom. The disease is that **there is nowhere for a page-level decision to
live**: no eyebrow, no page-header band, no consistent action placement, no measure rule, no
"sections of a screen" archetype. Changing what a page looks like means editing twelve files, which
is why nobody has, which is why the answer to "what does a SchedulePoint page look like" is
"`max-w-6xl p-6`, an `h1`, and whatever the feature put underneath".

Two consequences that are not obvious from the copy count:

- **`CardTitle` renders an `<h1>`** (`card.tsx:50`). `docs/DESIGN_SYSTEM.md:91` says one `<h1>` per
  page. The one screen that composes `Card` correctly works around it in a comment:
  `staff.tsx:117-118` — _"`CardTitle` is deliberately not used: it renders an `h1` and this page
  already has one. The composition contract is what was worth reusing, not the heading element."_
  **A call site opting out of a primitive's title part, with a written reason, is the system telling
  you the primitive is wrong.** It is also precisely the shape this repository keeps recording:
  a correct pattern applied to one control and not its neighbour — except here the "neighbour" is
  every other consumer, which quietly kept the `h1`.
- **The documented top of the type scale has never been used.** `docs/DESIGN_SYSTEM.md:87` assigns
  `text-3xl` to page titles. **`text-3xl` appears zero times under `apps/web/src`** — searched. Every
  route `<h1>` is `text-2xl font-semibold tracking-tight` and `CardTitle` is `text-xl`. So the
  hierarchy runs one step shallower than designed and nothing on a page announces itself as the page.

### 1.3 Numbers are formatted 29 times, by 18 files, and by no primitive

`tabular-nums` appears **29 times across 18 files** — `ActivitiesTable.tsx` (5), `staff.tsx` (3),
`EarnedValuePanel.tsx` (4), `FloatPathsPanel.tsx` (2), `ResourceLoadingTable.tsx` (2), and thirteen
others once each. `data-table.tsx` — the single table primitive — contains **none**: alignment and
figure style are a per-cell `cellClassName` decision (`:139`).

This is the diagnosis in miniature and it is worth dwelling on, because it is not a bug anywhere. A
scheduling product prints dates, durations, floats, lags, units and counts in columns; eighteen
authors each remembered that columns want tabular figures; the columns they remembered line up and
the ones they did not do not, and **no gate can tell the difference**, because both compile and both
look right in a diff. A design system whose whole job is to make that impossible has, here, made it
a matter of memory.

### 1.4 The brand accent has a contrast rule and no placement rule

Carried from the corporate spec's D3/D4 and extended. On the page surface, Corporate binds amber to
exactly two things — `--accent` (a pale hover wash, `:531`) and `--chart-1` (`:558`). Every solid on
a page is navy. The one solid amber an authenticated user sees at rest is the `BrandMark` tile at
**28×28 px**.

The extension: this is not an oversight, it is the **absence of a rule about what the accent is
for**. `globals.css:517-523` reasons correctly about where amber is _contrast-safe_ and then stops.
So the accent went where it could go rather than where it means something — and the collision that
followed (amber-as-primary versus amber-as-near-critical) was solved by moving `--warning` to bronze
in Corporate (`:544`), which is treating the symptom. §3.2 shows what the real collision is.

---

## §2. Never decided — a default decided it

### 2.1 `DataTable` is a fifth of what the document describes

`docs/DESIGN_SYSTEM.md:419-423` specifies _"sortable headers, pagination, row selection, sticky
header, per-column alignment (numbers right-aligned, tabular numerals), loading (skeleton rows),
empty, and error states"_.

`data-table.tsx` ships: a spinner (`:75-81`), an error with retry (`:83-94`), a caller-supplied empty
node (`:97`), a scroll region, `<thead>`/`<tbody>`, and an optional detail row. **No sticky header,
no sort, no selection, no pagination, no alignment, no tabular figures, no skeleton.** Sorting and
selection are done by consumers through `headerCell` (`:19`).

This is not a criticism of the component — it is a well-documented, honestly-scoped primitive. It is
a criticism of the document, which describes a table that does not exist, in the file that is meant
to be _"the single source of truth"_. Category: never decided; the doc was aspirational and the code
was pragmatic and they were never reconciled.

### 2.2 There is no empty state and no skeleton, and both are already on the register

`docs/TECH_DEBT.md` **#21(d)** — _"no shared `EmptyState` primitive; empty states are text-only"_.
`docs/DESIGN_SYSTEM.md:530-533` marks skeletons **_(no shared primitive)_** with the honest rule
_"extract a primitive the third time it is written, not the first"_.

It is past the third time, and the organisation-landing spec (§0.3) needs **three** empty states on
the first screen a new customer sees. The rule was right; the count moved.

### 2.3 The contrast matrix has a hand-maintained pair list, so it has holes

`token-contrast.test.ts` is the best gate in this repository and it is missing four pairs, for a
reason that is structural rather than careless: **the pair list is a hand-written inventory**
(`:86-153`), and an inventory goes stale every time the vocabulary grows. ADR-0073 C4 recorded
exactly this shape one layer out — an action-filter cap shipped as the literal `20` with a paragraph
explaining why nothing could reach it, and nineteen new actions made it reachable.

Confirmed absent, in every theme and every scope:

| pair                                         | who renders it                                               | verdict                                                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `--destructive` / `--destructive-foreground` | every Delete button (`button.tsx:19`)                        | **4.56:1 in Light**, hand-computed §0.2 — passes by 0.06                                                                                       |
| `--secondary` / `--secondary-foreground`     | `variant="secondary"` (`button.tsx:12`)                      | not computed here; and `--secondary` is **not a rebound name** (`token-architecture.test.ts:83-102`) so inside a scope it keeps the page value |
| `--card` / `--muted-foreground`              | **every `CardDescription`** (`card.tsx:61` on `card.tsx:10`) | Dark: `0.205³ = 0.00862` vs `0.708³ = 0.35489` → **6.91:1**, hand-computed — passes                                                            |
| `--popover` / `--muted-foreground`           | every menu and combobox listbox                              | same values as `--card` in Dark → **6.91:1** — passes                                                                                          |

**Three of the four pass.** The finding is not four defects; it is that **nobody knows they pass**,
and the file's own comment at `:101-104` already states the principle it then fails to apply
generally: _"an unasserted-but-available token pair is exactly the trap this suite exists to
remove"_. §8.1 of `design.md` turns that sentence into a derived gate.

### 2.3a The real shape: a pair whose two halves are governed by different scopes

Three people have now independently found a token outside `REBOUND_NAMES`
(`token-architecture.test.ts:83-102`) that would fail if a component ever landed somewhere new, and
each time the remedy proposed was "add that one". **That is a rule which fails once per discovery,
and it will keep discovering.**

The three, in the order they were found:

| #   | Token           | Found by                      | Number                                                                                              | Status                                                                                         |
| --- | --------------- | ----------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | the chrome stub | ADR-0055's own Context        | `text-muted-foreground` at **2.8:1**, `outline` Button at **1.01:1** on navy                        | **Live.** Fixed by inventing the mechanism                                                     |
| 2   | `--secondary`   | `corporate-brand` **G3**      | the lighter navy on navy, ~**1.4:1**                                                                | Latent — no `variant="secondary"` renders inside any of the six `<Surface>` sites              |
| 3   | `--destructive` | the `--destructive-hover` fix | `--background` vs `--destructive` = **2.92:1** at rest, **2.90:1** hovered, inside a scoped surface | Latent — `ConfirmDialog` is a modal `<dialog>` in the top layer, `BulkSelectionBar` is on page |

All three are the same defect: **`--background` is rebound and the fill beside it is not, so the two
halves of one composited pair are governed by different scopes.** The ratio between them is then not
a property anybody can reason about — it is an accident of which theme is on and where the component
landed.

Note what #2 and #3 have in common and what a "complete family" count cannot express: both are
**latent**, both were found by someone computing something else, and in both cases the honest record
was to write down the number and _not_ assert a pairing the product does not currently make (which is
what the `--destructive` fix did, in the test file, with the numbers). **A count of 17, then 18, then
19 tokens is the wrong instrument** — it says how many names a family has, and the question is
whether any compiled pair spans two families. `design.md` §1.5 replaces the count with a closure.

### 2.4 Iconography has a rule and a hole

`docs/DESIGN_SYSTEM.md:137-142` sets Lucide, 16/20, 1.5–2px, accessible names. Fine.

The hole is `docs/TECH_DEBT.md` **#126**: `mode-early`, `mode-visual`, `view-tsld` and `view-gantt`
carry **no `icon` field at all**, so the condensed toolbar band cannot demote them and they were
measured as four blank 16 px buttons — a WCAG 2.2 §2.5.8 failure caught by `e2e-toolbar-fit` S5. The
entry's own reason for filing it rather than fixing it is _"choosing a glyph for Early versus Visual
is a statement about what those modes are, and this milestone is about width"_.

**That statement is a design-system decision and this is the document that owes it.** Category:
never decided, and explicitly deferred to here.

### 2.5 An icon-only control names itself only on hover, and the target device has none

`docs/TECH_DEBT.md` **#131**. The command surface's only prominence channel is `showLabel`, so a
demoted control loses its name entirely and recovers it from a `title` attribute — which a touch
device never shows. The design system supplies exactly one prominence channel where a dense command
row needs two. §5 of `design.md` supplies the second.

---

## §3. The canvas — semantics, and the one place the system does not reach

This section is the reason the rewrite is worth doing rather than tidying.

### 3.1 The painter reads the **page** scope, on a ground that is not the page

`render/palette.ts:12` — `resolveTsldPalette(root: Element = document.documentElement)`. Every caller
uses the default (`TsldCanvas`, the WBS band, the lenses, the resource strip, the print path). So:

- `bar` is `--color-primary` **as resolved at `:root`** (`palette.ts:26`)
- `critical` is `--color-destructive` at `:root` (`:27`)
- `nearCritical` is `--color-warning` at `:root` (`:28`)
- `labelInside` is `--color-primary-foreground` at `:root` (`:57`)
- `edge` is `--color-muted-foreground` at `:root` (`:25`)

…and the surface they are painted on is `--color-canvas` (`:77`, `:81`), which is a **different
token from `--background`** and, in Corporate with the canvas flag on, a genuinely different colour
(`globals.css:1014`, a warm `oklch(0.988 0.006 90)`).

**That is ADR-0055's original bug, exactly, surviving in the one place ADR-0055 never reached.** That
decision's Context section describes a chrome surface with a partial family whose inks were
validated against the page: _"a surface family is complete or it is a trap"_. The canvas has a
**two-token family** — `--canvas`, `--canvas-band` — plus four loose additions, and **every ink on it
is validated against `--background`, which is not the surface it is painted on**.

It has not produced a visible defect yet for one reason and one reason only: in Light and Dark,
`--canvas` is byte-identical to `--card` and near-identical to `--background`
(`globals.css:206`, `:424`). The moment a theme gives the diagram a real ground — which CQ-A
proposes and which Corporate has already done behind a flag — it becomes the three-token header stub
again.

### 3.2 `--primary` means two different things, and that is the amber collision's real cause

On the chrome, `--primary` means **"the thing you should press"**. On the canvas, `--primary` means
**"an ordinary, non-critical activity"** (`palette.ts:26`). Those are not the same concept and there
is no reason a product's action colour should also be its default bar colour.

Corporate hit the consequence and treated the symptom. `globals.css:501-506` records it: amber was
promoted to `--primary`, which made an ordinary bar and a near-critical bar the same colour, so
`--warning` was moved to bronze. The bronze is a good colour and the reasoning is sound — but the
constraint it satisfies is invented. **The diagram should not be re-coloured because the button
was.** §2 of `design.md` removes the coupling instead.

### 3.3 The three bar states are separated by hue, not by lightness — and the print path is greyscale

Hand-computed, from `globals.css` via `src/test/colour.ts` (the achromatic identity `Y = L³` and the
full transform for the chromatic values). Relative luminance:

| theme     | ordinary (`--primary`) | near-critical (`--warning`) | critical (`--destructive`) | ground (`--canvas`) |
| --------- | ---------------------: | --------------------------: | -------------------------: | ------------------: |
| Light     |              `0.12328` |                   `0.44676` |                  `0.17040` |             `1.000` |
| Corporate |              `0.01571` |                   `0.16721` |                  `0.11204` |  `~0.964` (flag-on) |

Derived ratios:

| pair                      | Light      | Corporate  |
| ------------------------- | ---------- | ---------- |
| ordinary vs ground        | **6.06:1** | **15.4:1** |
| near-critical vs ground   | **2.11:1** | **4.67:1** |
| critical vs ground        | **4.76:1** | **6.26:1** |
| ordinary vs critical      | **1.27:1** | 2.47:1     |
| near-critical vs critical | 2.25:1     | **1.34:1** |
| ordinary vs near-critical | 2.65:1     | 3.31:1     |

Three things to say precisely, because two of them are easy to overstate and this register punishes
that (ADR-0082 corrected its own author for citing a success criterion that did not apply).

**This is not a WCAG 1.4.1 failure.** `paint.ts:450-451` gives criticality a **shape** cue — a solid
outline for critical, dashed for near-critical, none otherwise — drawn in `palette.outline`
(`--color-foreground`, ~19.8:1 on white). Colour is not the only channel and never was.

**Near-critical at 2.11:1 against the ground in Light is not automatically a 1.4.11 failure either**,
because the same emphasis outline draws the bar's boundary. It is, however, a bar whose **fill** is a
pale wash on white — and the ordinary bar, which has **no** outline (only `barStroke` =
`--color-border`, which is `oklch(0.922 0 0)` = **1.26:1** on white), is carried entirely by its fill.

**What is a real, unmitigated problem is the print path.** `resolvePrintPalette` (`palette.ts:109`)
resolves the **same tokens** with `.dark` cleared, and ADR-0059 M4 ships a printed programme a
scheduler hands to a client. A printed programme is routinely monochrome. **The fill-to-fill ratios
in the table above are exactly the greyscale test**, and in Light an ordinary bar and a critical bar
land **1.27:1** apart. On a black-and-white printout, the critical path — the single thing the
document exists to communicate — is distinguishable only by a 2 px outline weight.

**And none of it is gated.** `token-contrast.test.ts` contains the string `canvas` twice: once in a
comment (`:15`) and once as a flag-attribute name (`:22`). There is **no pair involving `--canvas`,
`--canvas-band`, `--canvas-grid-*` or `--canvas-nonworking-hatch` anywhere in the matrix.** The
matrix's own `fillOf` (`:66-70`) reads `--background`, so even if a canvas pair were added it would
be measured against the wrong surface until the canvas becomes a scope.

`render/palette.test.ts` does compute contrast — but on the **jsdom fallback strings** (`:50`, `:65`,
`:82`), not on the theme values, and its only theme-value work is the day/month gridline separation
(`:100-125`). The corporate spec's **G1** says the Corporate criticality triple is ungated; the
finding is broader — **it is ungated in all three themes, against the ground and against each
other.**

### 3.4 The diagram's geometry is not in the system at all

`BAR_RADIUS = 3` (`render-model.ts:31`), `EMPHASIS_STROKE_W = 2` (`:36`), `LANE_HEIGHT = 28`
(`geometry.ts:35`), `BAR_HEIGHT = 18` (`:37`), `MILESTONE_RADIUS = 7` (`:39`). Meanwhile
`--radius: 0.625rem` (`globals.css:35`) gives the DOM an 8 px corner. The corner language of the
diagram and the corner language of the app are two unrelated numbers in two unrelated files, and a
theme can reach neither.

---

## §4. Deliberate accepted trades — defended, and one refined

### 4.1 Borders over shadows — **keep it**

`docs/DESIGN_SYSTEM.md:124` says _"prefer `border` + low elevation on light surfaces"_ and the code
follows it exactly. Searched: `shadow-(sm|md|lg|xl|2xl|none)` appears at **10 sites**, and nine of
them are floating layers — `dialog.tsx:102`, `menu.tsx:205`, `combobox.tsx:511`,
`use-popover-panel.tsx:124`, `TsldLegendPanel.tsx:142`, `CreateActivityPopover.tsx:73`,
`resource-strip-panel.tsx:125`, `auth-shell.tsx:61`, `tabs.tsx:169` — plus `Card`'s `shadow-sm`.

**This is a decision, not flatness by neglect, and it is right.** A scheduling tool has an unusual
number of simultaneously-floating layers (a menu opened from a toolbar portalled into a chrome band,
over a popover, over a canvas overlay). Elevation is the one channel that currently says "this floats
above that", and raising every surface would spend it. The temptation to read the product owner's
"badly designed skin" as "needs shadows" should be resisted; §1 and §2 are the causes.

**One refinement, because the model is under-specified rather than wrong.** On a dark surface a
black shadow does nothing — Dark's `Card` is `oklch(0.205 0 0)` on a `oklch(0.145 0 0)` page, and
what actually separates them is the fill step plus `--border` at `oklch(1 0 0 / 10%)`. So the model
already runs on two mechanisms and only names one. `design.md` §4 gives elevation a token so a theme
can say which mechanism it uses, and writes the rule down.

### 4.2 Hand-rolled APG primitives, no component library — **keep it**

I am not proposing Radix, shadcn/ui, or a headless kit, and the reason is not ideology. The three
things this rewrite most needs — a surface-scoped token vocabulary, a density axis expressed in CSS
custom properties, and a canvas that resolves its palette from the DOM — are all **below** the layer
a component library operates at. A library would supply behaviour we already have (`Menu`,
`Combobox`, `Toolbar`, `Tabs`, `Dialog` are all shipped and tested against the APG) and would arrive
with its own opinions about exactly the layer we are rewriting. The honest cost of keeping it
hand-rolled is that `EmptyState`, `Skeleton`, `SectionCard` and `ListRow` are ours to write —
which is four small components, none of which has interaction behaviour worth importing.

Recorded so it is a decision made rather than an option not noticed.

### 4.3 Portals leave every scope — **keep it**

`surface.tsx:19-21`. A menu opened from the navy toolbar paints on `--popover`. Correct: an overlay
belongs to the page, not to the surface that summoned it. It also means **dialogs, menus and
comboboxes are unaffected by the canvas scope**, which removes an entire class of risk from §3's
change.

### 4.4 `brand` and `auth` are pinned and repeated per theme — **keep it, with the cost stated**

ADR-0077 §2 and §8.3. Two families of 18, declared identically in three theme blocks — 108
declarations that must never diverge, guarded by an assertion (`token-architecture.test.ts:72-80`)
that exists **because the completeness sweep structurally cannot see them**: `themeTokens()` merges
each theme over `:root`, so a member deleted from `.dark` is inherited and reads as present.

The obvious simplification — declare the pinned families once, outside the theme blocks — is
**rejected**, and ADR-0077's reason still holds: the repetition is what makes the values visible
where a reader looks for them, and `token-contrast.test.ts` resolves each theme independently. But
the cost is real and it compounds with every scope added, so `design.md` §1.4 caps the scope count
and says what the seventh would have to prove.

---

## §5. The shape of the whole thing, in one table

| Category                   | Finding                                                        | Remedy                                                   |
| -------------------------- | -------------------------------------------------------------- | -------------------------------------------------------- |
| Inherited (§1.1)           | One token axis; five disagreeing row/control heights           | A **metric** token kind + a density scope                |
| Inherited (§1.2)           | No page primitive; `CardTitle` is an `h1`; `text-3xl` unused   | Page vocabulary + a type ramp with a top                 |
| Inherited (§1.3)           | Tabular figures remembered 29 times by 18 files                | A **data** type ramp, applied by the primitive           |
| Inherited (§1.4)           | The accent has a contrast rule and no placement rule           | An **accent role** rule + a census gate                  |
| Never decided (§2.1, §2.2) | `DataTable` is a fifth of its spec; no `EmptyState`/`Skeleton` | Build the four archetypes                                |
| Never decided (§2.3)       | The contrast pair list is a hand-written inventory             | **Derive** the pair list from `@theme inline`            |
| Never decided (§2.4, §2.5) | Four toolbar segments have no icons; one prominence channel    | An icon rule + a second prominence channel               |
| **Semantics (§3)**         | **The canvas is outside the system and outside the gates**     | **The canvas becomes a surface scope**                   |
| **Split pairs (§2.3a)**    | **Three tokens found outside the rebound set, one at a time**  | **A closure rule, not a longer list** (`design.md` §1.5) |
| Deliberate (§4)            | Borders-first; hand-rolled primitives; portals; pinned brand   | **Kept**, one refined, one cost recorded                 |
