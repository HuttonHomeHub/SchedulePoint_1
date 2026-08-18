# The design — a vocabulary, its rules, and what each part is for

> This is the design, not a mood board. Every part below exists to remove a decision from a call
> site. Where a part would only make something prettier, it is not here.

---

## 0. The premise, in one paragraph

The token layer answers exactly one question — _"what colour is this?"_ — and it answers it in
exactly one dimension — _"which surface am I on?"_. That was the right size for a clients →
projects → plans shell. The product it now has to dress is a Canvas-2D time-scaled logic diagram, a
virtualized Gantt, a 28-stop command surface that must fit at 1646 CSS px, a four-tab activity
editor with per-scope permissions, WBS bands, two libraries, an audit log, a staff console and six
public screens. **The rewrite adds three axes and one surface**, and changes nothing that already
works.

| Axis                          | Today                                                     | After                                                                  |
| ----------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Colour**, scoped by surface | 5 scopes × 18 tokens × 3 themes. Works. Gated.            | 6 scopes (the diagram joins) + **role packs** for what a scope needs   |
| **Metric**, scoped by density | Does not exist. Five disagreeing constants in five files. | `[data-density]`, the `[data-surface]` mechanism reused                |
| **Type**, two ramps           | One ramp, top unused, data half absent                    | A prose ramp with a top, and a **data ramp** that owns tabular figures |
| **Meaning on the diagram**    | Borrowed from the page, ungated                           | A validated family, its own separation matrix, its own geometry tokens |

---

## 1. Surface scopes — keep the mechanism, add the diagram

### 1.1 What is not changing, and why that matters

ADR-0055's mechanism is correct and stays, unamended in substance:

- one semantic vocabulary rebound per surface by `[data-surface]`;
- the families are **absent from `@theme inline`**, so `bg-chrome` does not compile and `<Surface>`
  is the only route in (`surface-seams.structural.test.ts`);
- `@theme inline` is load-bearing and is pinned (`token-architecture.test.ts:104-110`);
- a family is **complete or it is a trap**;
- portals leave every scope, so overlays paint on `--popover`;
- **`--card` is deliberately not a rebound name**, so a `Card` means the same thing everywhere
  (`docs/DESIGN_SYSTEM.md:283-285`). **The promise is kept; the mechanism changes** — §1.5(c) makes a
  Card a _reset_ rather than an exception, because as an exception it is currently a split pair.
- **no descendant learns where it is.** This is the property everything else rests on.

I am not proposing a replacement mechanism, and I want to be explicit about why, because the mandate
says "blank canvas". A React `SurfaceContext` that components branch on, a per-surface CVA variant
matrix, and per-theme component overrides were all considered and rejected **by ADR-0055's own
Alternatives section, with reasons that have not changed** — and one of them (the variant matrix)
gets strictly worse with a sixth surface. Reopening a decision that is right, gated and load-bearing
would spend the epic's budget on a rewrite that produces the same file.

### 1.2 The sixth scope: `canvas`

**`SurfaceTone` gains `'canvas'`, and `resolveTsldPalette` reads its element rather than
`document.documentElement`.**

The argument, against ADR-0077 §1's five conditions — which is the bar this repository set for a new
scope and which a proposal must be measured by:

| condition                                                                    | verdict                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. The region keeps the semantic names and changes what they resolve to      | **Yes, and this is the whole trick.** `palette.ts` keeps reading `--color-primary`, `--color-destructive`, `--color-warning`, `--color-foreground`, `--color-muted-foreground`, `--color-ring`. Not one line of the painter changes. Only the element passed to `getComputedStyle` does.                                                                                                                                                    |
| 2. The fill is chosen for a reason the page's fill structurally cannot serve | **Yes.** The diagram's ground is a working surface, not a document surface — Corporate already gives it a warm value behind a flag (`globals.css:1014`) and **CQ-A is answered: a quiet ground in all three themes**, landing as a value in L4-2. More importantly, its inks must be validated **against that ground and against each other**, which the page family structurally cannot do because it is validated against `--background`. |
| 3. The family can be complete and every pair clears its bar by computation   | **Yes — and it is the reason to do it.** `diagnosis.md` §3.3 shows five pairs nothing computes today, two of which land below any floor anyone would set.                                                                                                                                                                                                                                                                                   |
| 4. At least one real consumer on the day it lands                            | **Five.** `resolveTsldPalette`, `resolveWbsBandPalette`, `resolveLensPalette`, `resolveResourceStripPalette`, and the Gantt's chart region (DOM).                                                                                                                                                                                                                                                                                           |
| 5. It goes through `<Surface>`                                               | **Yes**, and it is the condition that made this design work: the diagram container already exists as a `div` painted `bg-canvas`. It becomes `<Surface tone="canvas">`, and `resolveTsldPalette(root)` — whose signature **already takes an `Element`** (`palette.ts:12`) — is handed that node.                                                                                                                                            |

**Three consequences fall out for free, which is the test of a mechanism.**

- The Gantt's chart area takes `tone="canvas"` too. One drawing ground, one grid vocabulary, one bar
  palette, in both views of the same plan. That is ADR-0059's "the time axis is shared, not
  reimplemented" applied one level up: **the drawing surface is shared, not reimplemented.**
- `--canvas` and `--canvas-band` as _global_ tokens can be **retired**: inside the scope,
  `--background` **is** the diagram ground, so `bg-background` on the container and
  `token('--color-background')` in the painter both do the right thing. (Conditional on no remaining
  DOM consumer of `bg-canvas` — checked at L1, not assumed here.)
- `handleHalo`'s theme-inverse pairing argument (`palette.ts:69-77`) stops being a claim about
  `--card` and becomes a claim about the scope's own fill and its own foreground — i.e. it becomes
  true by construction instead of by coincidence.

**The one real risk**, stated so it is designed for rather than discovered: if the element handed to
`resolveTsldPalette` is not mounted, or is outside the scope, `getComputedStyle` silently returns
the page values and the diagram paints in page colours **with nothing failing anywhere** — which is
today's behaviour, so no test would notice the regression. L1 lands a guard and a test that asserts
the resolved fill differs from the page fill when the two token values differ.

### 1.3 Packs — how a family stays complete without every family carrying everything

The 18-token base stays **mandatory for every scope**. That rule is what makes a family trap-proof
and it is not weakened.

On top of it, a scope declares the **packs** it plays a role in. A pack is a small, named set of
tokens with no semantic sibling in the base vocabulary, and it comes with its **own** completeness
assertion and its **own** contrast pairs.

| Pack     | Members                                                                                         | Declared by | Why it is a pack and not base                                                                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PLOT`   | `-plot-band`, `-plot-grid-day`, `-plot-grid-month`, `-plot-grid-year`, `-plot-nonworking-hatch` | `canvas`    | A month band and three gridline tiers have no meaning on a header. Forcing `chrome` to declare them is five tokens nobody can use and five more chances to get a value wrong. |
| `GROUND` | `-ground`, `-ground-end`                                                                        | `auth`      | A gradient needs two stops and the base vocabulary has no word for the second one — the reasoning already written at `globals.css:246-249`, formalised.                       |

Everything else the diagram needs is a **rebind**, not a pack, and the discriminator is stated so the
next addition is not a judgement call:

> **If the thing has a semantic sibling in the base vocabulary, rebind it. If it does not, pack it.**

So: ordinary bar → `--primary`. Critical → `--destructive`. Near-critical → `--warning`. Link line →
`--muted-foreground`. Selection → `--ring`. Emphasis outline, beside-bar label and the data-date rule
→ `--foreground`. Non-working wash → `--muted`. Ground → `--background`. Month band → `PLOT`,
because "the alternating stripe under the diagram" is not any of the eighteen names.

### 1.4 Six is the ceiling this design plans for

`page`, `chrome`, `panel`, `brand`, `auth`, `canvas`. That is 6 × 18 = 108 base declarations per
theme, three themes, plus packs — and `diagnosis.md` §4.4 records that `brand` and `auth` alone are
108 declarations that must be identical across blocks, guarded by an assertion that exists because
the completeness sweep cannot see them.

**A seventh scope must show, in an ADR, what the sixth could not do for it**, in addition to
ADR-0077 §1's five conditions. Two candidates that will be proposed and should be refused unless
they clear that bar: a `dialog` scope (portals already leave every scope — a dialog is the page, and
that is correct), and a `print` scope (the print path is a _palette_, not a surface; it forces light
values, and giving it a scope means every future value change is applied a fourth time).

### 1.5 What belongs in the rebound family — a closure, not a longer list

This is the question `diagnosis.md` §2.3a poses and it is the most important structural decision in
the epic after the canvas scope. Three people have found a token outside `REBOUND_NAMES` one at a
time (the chrome stub, `--secondary`, `--destructive`), and each time the available answer was "add
that one". **A rule that fails once per discovery is not a rule.**

**The defect is never "a token is not rebound". The defect is a _pair whose two halves are governed
by different scopes._** `--background` is rebound and becomes navy; `--destructive` is not and keeps
the page's red; their ratio is then **2.92:1**, and it is nobody's decision — it is an accident of
which theme is on and where the component landed. Whereas `--secondary`/`--secondary-foreground` is
_self_-consistent as a fill-and-label pair and only becomes a defect against a rebound
`--background`. So the property to enforce is not membership; it is **governance agreement**.

Three parts, and they replace the count.

**(a) The page becomes an explicit family, `--page-*`.** Today the page's values _are_ the unqualified
names, so the unqualified names are simultaneously a source and a binding, and there is nothing to
restore _from_. Making `:root` bind `--background: var(--page)` &c. costs 18 lines, makes all six
scopes symmetric, and is the prerequisite for (c).

**(b) `REBOUND_NAMES` is computed as a closure, and asserted rather than authored.**

> Seed the set with the scope's fill and its foreground. Add any token that can be **composited with
> a member in a utility the build can compile** — a fill painted on it, ink painted on it, a boundary
> drawn against it. Iterate to a fixed point. That set is the rebound family.

Run over today's `@theme inline`, the closure pulls in what three people found separately —
`--destructive`, `--destructive-foreground`, `--destructive-hover`, `--secondary`,
`--secondary-foreground`, and the solid `--success`/`--warning`/`--info` triples — because each is a
fill a component can paint **on** a scoped `--background`. Nobody has to notice them.

**(c) A second fill inside a scope is a _reset_, not a member.** `--card` and `--popover` are not
family tokens and not exceptions: they are **surfaces in miniature**, and the honest way to keep
ADR-0055's promise that _"a `Card` means the same thing everywhere"_ inside a rebinding world is for
a `Card` to **restore the page family for its subtree** — `[data-surface='card'] { --background:
var(--card); --foreground: var(--card-foreground); --muted-foreground: var(--page-muted-foreground);
… }`. A reset is not a new vocabulary; it is the page's, re-entered.

**This closes a split pair nobody has raised.** `CardDescription` is `text-muted-foreground`
(`card.tsx:61`) on `bg-card` (`:10`). `--muted-foreground` **is** rebound; `--card` is not — so the
two halves of that pair are governed by different scopes, which is exactly the property §1.5 defines
the defect as.

> **Corrected on verification (2026-08-18).** This paragraph said "a live split pair" and gave the
> Project Explorer rail as the instance. It is **latent, not live**, and the rail is not an instance
> at all: the rail's `<Surface tone="panel">` regions contain the tree and the resizer, and a
> repository-wide search finds **no `<Card>` or `bg-card` inside any of the six `<Surface>` sites**.
> The only Card-family usage inside a scope is `auth-shell.tsx:66-70`, which renders `CardHeader` /
> `CardTitle` / `CardDescription` **without** a `<Card>` wrapper — so there is no `bg-card` — and its
> fill is `bg-background`, which IS rebound, so both halves sit in the `auth` scope and the pair does
> not split. Every other Card in the product renders inside `<main>`, which is outside every scope.
>
> The structural finding stands and is the reason the closure is right: the pair is compilable, so it
> is one component move away from being live, and nothing would report it. What does not stand is the
> word "live", and the distinction decides whether this ships on its own or inside the rewrite.
> Checked with a shell, which the session that wrote this paragraph did not have.

**So "complete" stops being a count and becomes a property:**

> **A scope is complete when no pair a compiled utility can composite is split across two scopes.**

17, then 18, then 19 was always the wrong instrument — it counts names, and the question is whether
any pair spans two families. The count becomes an output of the closure, and
`token-architecture.test.ts` asserts the _closure_, not a hand-written array.

**Its blind spot, stated:** the closure is computed from what a utility **can** compile, not from
what the product **does** render, so it will be a superset — it will govern pairs the product never
makes. That is the correct direction to be wrong in (a governed pair nobody renders costs three
lines of CSS; an ungoverned pair somebody renders costs a WCAG failure nobody can see coming), and it
is exactly the trade the `--destructive` fix took by _recording_ the 2.92:1 rather than asserting a
pairing the product does not currently make. Under the closure that judgement is no longer needed.

---

## 2. Colour — two changes, and the accent finally gets a job

### 2.1 `--primary` stops meaning two things

Today `--primary` means _"the thing you should press"_ on the chrome and _"an ordinary, non-critical
activity"_ on the diagram (`palette.ts:26`). Those are unrelated concepts sharing one token, and
`diagnosis.md` §3.2 shows what it cost: Corporate promoted amber to `--primary`, which made an
ordinary bar and a near-critical bar the same colour, so `--warning` was moved to bronze — **the
diagram was re-coloured because the button was.**

The canvas scope removes the coupling with no new name. Inside `[data-surface='canvas']`,
`--primary` is the ordinary-activity fill: a calm, structural colour chosen for legibility against
the plot ground and separation from the other two states. Outside it, `--primary` is the action
colour. The painter is unchanged. Corporate's bronze `--warning` survives on its own merits or is
withdrawn on them — **which is a decision someone gets to make, instead of a constraint they
inherit.**

### 2.2 The accent gets a placement rule

The rule, and it is the shortest useful sentence in this document:

> **The brand accent marks _where you are_ and _what will happen if you act_.
> It never marks _what something is_.**

| The accent may mark                                          | The accent may never mark                                   |
| ------------------------------------------------------------ | ----------------------------------------------------------- |
| the current nav item; the selected tree row; the active mode | a status (`--success`/`--warning`/`--info`/`--destructive`) |
| a pressed toggle; a checked control                          | a criticality, a float band, a drift, a conflict            |
| the primary action's fill                                    | a categorical series (`--chart-*`, a WBS group)             |
| the focus ring on its own surface                            | **anything on the diagram, ever**                           |

Three things this buys that a hue choice does not:

1. **It answers `diagnosis.md` §1.4 without inventing anything.** The corporate spec's D4 — the
   active nav item indicated by grey and weight, in a band where amber is already proven at 7.9:1 —
   is now a rule violation, not a taste question.
2. **It makes the amber/near-critical collision structurally impossible**, not managed. The accent
   is forbidden on the diagram by definition, because the diagram paints what things _are_.
3. **It is censusable.** `ACCENT_ROLES` is a `Record` of the roles the accent is bound to; adding one
   is a deliberate edit, removing one fails. That is the corporate spec's requested **C3**, with a
   rule behind it rather than a snapshot — a snapshot proves a binding did not change, a rule says
   whether the binding should exist.

**Its blind spot, stated:** a census proves _binding_, not _prominence_. It cannot tell you the
accent is a 28×28 px tile. The remedy for that is a person looking at a screen, and this document
does not pretend otherwise.

### 2.3 Four pairs join the matrix, and the list stops being hand-written

See §8.1. `--destructive`/`--destructive-foreground`, `--secondary`/`--secondary-foreground`,
`--card`/`--muted-foreground`, `--popover`/`--muted-foreground` — three of which pass, hand-computed
(`diagnosis.md` §2.3), and none of which anyone knew passed.

`--secondary` and `--destructive` are not "the nineteenth and twentieth names": they arrive because
the **closure** (§1.5b) pulls them in, along with everything else that can be painted on a scoped
`--background`. Closing the corporate spec's **G3** stops being a fix and becomes a consequence.

### 2.4 Interaction states are a token, and the rule is directional

`hover:bg-destructive/90` is not `--destructive`. It is `--destructive` composited at 90 % against
whatever sits behind it, which in Light lightens it toward white and took a Delete button's label to
**4.32:1** — a live WCAG 1.4.3 failure, found while asserting the rest state and fixed with a
`--destructive-hover` token in all three themes. **An opacity modifier is a different colour, and the
matrix measures tokens while the browser paints utilities.**

So: **an interaction state is a token, never a modifier**, and the rule for its value is the one that
fix established, adopted here unchanged because it generalises:

> **Hover moves the fill _away from the surface it sits on_.**

It reads as an inconsistency — Dark lightens, Light and Corporate darken — and it is not. Darkening
in Dark takes the fill to **2.96:1** against its own page, so the control would stop being
distinguishable from what it sits on **in the act of being hovered**. The direction is a per-theme
fact about which way there is room, not a global preference, and writing it down is what stops the
next person "fixing" the inconsistency.

Two consequences:

- `--{token}-hover` (and, where a design calls for one, `-active`) joins the **closure**, because it
  is a fill that carries ink and sits on a scoped surface.
- **"The surface it sits on" is the governing scope's fill**, not `--background` at `:root`. This is
  where §1.5 and this rule compose: a hover value derived against the page and rendered on navy is
  the same split-pair defect one state along.

`bg-primary/90` (`button.tsx:11`) and `bg-secondary/80` (`:12`) are the two remaining modifiers and
take the same treatment. Neither is measured anywhere today.

---

## 3. Metric — the axis that does not exist

### 3.1 The mechanism: density is a scope

`[data-density='compact' | 'default' | 'comfortable']`, rebinding a set of metric custom properties,
stamped by a `<Density>` component exactly as `<Surface>` stamps a tone. Same mechanism, same
guarantees, same reason: `docs/FRONTEND_ARCHITECTURE.md` states that components never branch on the
theme in JS, and a density that components branch on in JS would be a re-render per surface change
and a prop threaded through 989 files.

**One deliberate asymmetry with the colour families, because someone will otherwise "fix" it:**
metric tokens **do** get Tailwind utilities (`h-control-md`, `min-h-row`, `gap-section`). Colour
families must be unreachable because a component must never _choose_ a surface. Metric tokens must
be reachable because a component must be able to _say what kind of thing it is_ — `h-control-md` is
the statement "I am a medium control", and the density scope decides what that means. The class name
is the semantic; the value is the scope's.

### 3.2 The tokens

| Token                                   | Means                                                               | Value at L2, and where it goes                                                                          |
| --------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `--control-h-sm` / `-md` / `-lg`        | Control heights                                                     | **36 / 40 / 44 frozen at L2** (`button.tsx:22-24`), then **32 / 36 / 40 at L2b** — CQ-C, measured       |
| `--control-h-toolbar`                   | The command row's minor axis                                        | 36 px, frozen (`docs/TECH_DEBT.md` #127) — **already 36, which is why L2b's vertical gain is measured** |
| `--row-h`                               | A row of records                                                    | **28** (CQ-B, answered). Tree keeps 28; **Gantt moves 32 → 28** at L2; tables follow                    |
| `--ruler-h`                             | A time-axis band                                                    | **Unanswered** — stays per-surface (40 TSLD / 34 Gantt) until it is                                     |
| `--lane-h` / `--lane-bar-h`             | The diagram's row and bar                                           | 28 / 18 (`geometry.ts:35,37`)                                                                           |
| `--rule-w`                              | Divider / boundary weight                                           | 1 px everywhere today                                                                                   |
| `--gutter-page` / `-section` / `-field` | The three rhythms `DESIGN_SYSTEM.md:97` names and nothing expresses | 24 / 24 / 16 px                                                                                         |
| `--radius-plot`                         | The diagram's corner language                                       | 3 px (`render-model.ts:31`) — beside the DOM's 8 px                                                     |
| `--tap-min`                             | Minimum pointer target                                              | 24 px (WCAG 2.2 §2.5.8) / 44 px house rule                                                              |

### 3.3 Where a density comes from — the surface decides, not the user

| Region                                                  | Density       | Because                                                         |
| ------------------------------------------------------- | ------------- | --------------------------------------------------------------- |
| The plan workspace, its panels, the command band        | `compact`     | A planner is in it for 1–3 hours a day and every 4 px is canvas |
| Content pages, dialogs, forms, the organisation landing | `default`     | Read once, filled once. A form is not a cockpit                 |
| Anything under `@media (pointer: coarse)`               | `comfortable` | **This is the answer to `docs/TECH_DEBT.md` #127**              |

**No user-facing density setting.** A density toggle is a second product maintained forever
(ADR-0088's Class A argument), for a preference nobody has asked for.

**#127 is worth spelling out, because it is a concrete thing the current system structurally cannot
do.** The house rule is 44 × 44; the toolbar ships 40 × 36; the entry explains that raising the minor
axis adds 16 px to the vertical stack _"for every user, including the desktop users who reported the
problem, and it can be done under `pointer-coarse` alone only if the band's height is allowed to
differ by input device"_. With density as a scope, that is exactly what happens, once, in
`globals.css`, for every control in the product — instead of a per-control media query that some
controls get and their neighbours do not. And `docs/TECH_DEBT.md` **#133** ("every toolbar
measurement ever taken assumed a mouse") becomes a measurement the harness can take by stamping one
attribute.

### 3.4 The rule that keeps this from breaking the toolbar

ADR-0090 and ADR-0091 derive the command surface's band floors from **measured** control widths, and
`e2e-toolbar-fit` asserts them. Four epics in a row found that their width expectation was
contradicted by their own measurement (ADR-0091 D4, ADR-0092 M4, ADR-0093, ADR-0094 M0-T1).

> **Metric tokens land frozen at today's shipped values. Every later change to one is its own
> commit, with `pnpm --filter @repo/web measure:toolbar` and `test:e2e:toolbar-fit` at 1646 run
> before and after.**

This is ADR-0055 §8.1's ordering argument — structure before values, because flipping both together
makes every parity suite meaningless on the day it is needed — applied to metrics.

**CQ-C is answered: the control scale moves to 36 px in this epic** (departing from this design's own
default, which was to tokenise 40 and move later). The rule above is what makes that safe, and it is
not softened by the answer — **it is what the answer has to obey.** So the move is a landing of its
own (`migration.md` **L2b**), immediately after the frozen tokens land, and it is built as a
measurement rather than a value edit:

1. change the value;
2. re-run `measure:toolbar` **at 1646** — the product owner's actual screen, and the width ADR-0091's
   retrospective records nobody having measured for two whole epics;
3. **re-derive the band floors from what it reports** — never adjust them to make the existing gate
   pass, which would be tuning the instrument to the reading;
4. update `e2e-toolbar-fit`'s expectations to the measured values;
5. run **every** journey (ADR-0091 records three broken by a label change and found by CI rather than
   locally; `scripts/e2e-local.sh web` now covers the base one);
6. **measure and report the vertical gain rather than asserting one.** Reclaiming height is the point
   — chrome is 31 % of the workspace at 1646 — and four consecutive epics here have had exactly this
   kind of headline number contradicted by their own measurement. **If the gain turns out to be
   small, that is the finding**, and it is reported as one.

Note what step 6 implies and step 1 does not: a 4 px control height does not necessarily buy 4 px of
band. The command row's minor axis is `--control-h-toolbar` at 36 **already** (`docs/TECH_DEBT.md`
#127), so the band may not move at all, and the gain may land entirely in the tables, the forms and
the Explorer. That is a legitimate outcome and it is not the outcome the change is being made for, so
it is the one most worth measuring.

> **Confirmed with a shell (2026-08-18), so L2b starts from a fact rather than a prediction.**
> `ToolbarSplitButton.tsx:165` sets `min-h-9` — 36 px — directly on the control, and
> `plan-workspace-toolbar.tsx:1164` describes the two rows as `py-1` around a `min-h-9` control.
> Neither takes `Button`'s `h-10` default. So changing that default from 40 to 36 is very unlikely to
> move the command surface at all.
>
> That cuts both ways and both halves matter. **The risk is smaller than CQ-C's answer implied** — the
> band floors and `e2e-toolbar-fit` are derived from control _widths_ on a row whose height is already
> 36, so the change should not disturb them. **And the reward is somewhere else than expected**: the
> 4 px comes back in tables, forms, dialogs and the Project Explorer, not in the chrome above the
> canvas that the 31 % figure is about. Anyone approving L2b in the hope of reclaiming canvas height
> should know that before it is built, not after.

---

## 4. Type, elevation, radius, motion, icons

### 4.1 Two ramps, because prose and data are not the same reading task

**The prose ramp gets a top.** `--text-page` (the size `text-3xl` was documented for and never used),
then `--text-section`, `--text-subsection`, `--text-body`, `--text-meta`. `PageHeader` owns
`--text-page`; a structural test asserts no route sets its own `<h1>` size, so `diagnosis.md` §1.2
cannot recur one route at a time.

**The data ramp owns tabular figures, and that is the point.** `text-data` and `text-data-sm` are
Tailwind v4 `@utility` definitions that set size, line-height **and**
`font-variant-numeric: tabular-nums` together. A number cannot be typeset in this product without
getting tabular figures, because there is one way to typeset one.

That single change retires `diagnosis.md` §1.3 — 29 hand-applied `tabular-nums` across 18 files — and
the lint rule that goes with it (`tabular-nums` may not appear in a `className`) is what stops the
30th. It also gives the canvas painter a named font size to read instead of a literal, and the Gantt
cell, the table cell and the bar label finally agree.

**One nuance worth keeping:** `--font-mono` is used at 8 sites for identifiers and codes. That stays
separate. Tabular figures are for _quantities in columns_; monospace is for _strings you compare
character by character_. Two jobs, two tools.

### 4.2 Elevation — kept, and given a token so a theme can say which mechanism it uses

`diagnosis.md` §4.1 defends borders-first and it is not reopened. The refinement is that the model
already runs on **two** mechanisms and names one:

> **Elevation is carried by a shadow on light surfaces and by a fill step plus a brighter border on
> dark ones. A dark theme may set its shadow to `none`; that is the model working, not a missing
> value.**

`--elevation-1` (Card) / `-2` (menus, popovers) / `-3` (dialogs, sheets) become theme-scoped tokens.
Ten call sites change from `shadow-sm|md|lg` to `elevation-1|2|3`. The gain is small and honest: a
theme can finally express a depth decision, and the rule is written where the next person will read
it rather than being inferable only from noticing that Dark's shadows do nothing.

### 4.3 Radius and motion — not re-derived

`--radius: 0.625rem` gives `radius-md` = **8 px**, which is the previous Flask app's
`--border-radius` exactly (`corporate-brand/measurements.md`); the documented 150/200/300 ms band
contains that app's `0.2s`. Both are already right. `--radius-plot` is added because the diagram's
3 px corner is a module constant a theme cannot reach; `--motion-fast/base/slow` are added for
symmetry and are expected to stay identical in all three themes. If that turns out to be true after a
year, they are a token nobody needed and should be deleted, and this sentence is the note that says
so.

### 4.4 Iconography — the rule, and the four glyphs this document owes

The existing rule stands (Lucide only, 16 inline / 20 standalone, 1.5–2 px, accessible name
required). Two additions:

**The rule for choosing a mode glyph**, which is what `docs/TECH_DEBT.md` #126 is actually blocked
on: _a mode's glyph depicts the mode's **effect on the diagram**, not its name._ `Early` and `Visual`
are not nouns with pictures; they are two answers to "what decides where a bar sits". So the pair
should read as _computed_ versus _placed_, and it must be a **pair that only makes sense together** —
which is why #126's own conclusion, that doing the easy pair alone is the wrong move, is right.

**All four land together or none does**, and they land with `e2e-toolbar-fit` re-run, because the
reverted implementation measured four blank 16 px buttons and the gate caught it within the hour.
Candidate glyphs are named in the implementation plan and must be **verified against the installed
`lucide-react@^1.29.0`** before being written down as decided — naming an icon that does not exist in
the installed version is the ADR-0076 Class 2 shape.

**And the second prominence channel** (`diagnosis.md` §2.5, `docs/TECH_DEBT.md` #131): a dense
command row has exactly one way to signal importance — whether the label renders — so a demoted
control loses its name entirely and recovers it from a `title` a touch device never shows. The design
system supplies a second: **an icon-only control must carry a persistent name that is not
hover-dependent.** In practice that is a visible label at some band, or the label rendered beneath
the glyph at `comfortable` density, or the control not demoting. Which of the three is a per-item
decision; that it is one of the three is a rule.

---

## 5. What a page is

The vocabulary `diagnosis.md` §1.2 says does not exist:

- **`PageContainer`** — the frame currently copy-pasted 15 times. Owns the measure cap, the page
  gutter and the scroll relationship. One implementation, all themes.
- **`PageHeader`** — an optional eyebrow (breadcrumb or parent), the `<h1>` at `--text-page`, an
  optional description, and a **primary-action slot**. Owns the page-title size (so §4.1's structural
  test has something to point at) and, critically, owns _where the primary action sits_, which is
  currently "wherever the route put it" — `clients.tsx:14-17` puts it in a `justify-between` flex,
  `project-detail.tsx` does something else.
- **`SectionCard`** — a named section of a content screen: `Card`'s composition contract plus a real
  heading rank. `CardTitle` gains `level?: 1 | 2 | 3` defaulting to **2**, which deletes
  `staff.tsx:117-118`'s written workaround and fixes the `<h1>`-per-page violation everywhere else at
  the same time.
- **`EmptyState`** — icon, one-line explanation, one action. `docs/TECH_DEBT.md` #21(d), overdue, and
  the organisation landing needs three of them on the first screen a new customer sees.
- **`Skeleton`** — mirrors the final layout, first loads only. `docs/UX_STANDARDS.md` has required
  this for a year with no implementation anywhere.
- **`ListRow`** — a scannable linked row with primary / secondary / metadata ranks. Not a table:
  "recently changed" is a list of links, and forcing it into `<table>` misrepresents it to assistive
  technology and to the eye. This is what the landing page's feed and "jump back in" are made of.

`DataTable` gains what `docs/DESIGN_SYSTEM.md:419-423` already promised and it does not have: a
`numeric` flag on `Column<T>` (so alignment and tabular figures are a **property of the data**, not a
per-cell `cellClassName` that drifts one column at a time), a sticky header, and `Skeleton` rows in
place of the spinner.

**Tier placement:** `PageContainer`, `PageHeader` and `SectionCard` are `components/layout/` — they
carry page structure, following `brand-mark.tsx`'s precedent. `EmptyState`, `Skeleton` and `ListRow`
are `components/ui/` — they are reusable widgets with no page knowledge.

---

## 6. What this says to the organisation landing page (ADR-0098)

Its §0.3 lists five things the current vocabulary cannot express and asks that each be a requirement
on this rewrite rather than a one-off. Answering all five by name, so that epic can consume rather
than bridge:

| It needs                                          | This design supplies                                                                                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| An empty state                                    | `EmptyState` (§5). Lands in **L3**.                                                                                                                  |
| A skeleton                                        | `Skeleton` (§5). Lands in **L3**.                                                                                                                    |
| A page-section archetype with a real heading rank | `SectionCard` + `CardTitle level` (§5). The bridge that spec proposed **is** the answer; it does not need to be temporary.                           |
| A list / feed row                                 | `ListRow` (§5).                                                                                                                                      |
| Density as a system concept                       | `[data-density]` (§3). Its observation was right: **the landing page is `default` density** — reading, not cockpit — and it now has a word for that. |

And one thing it did not ask for but will need on its first draft: **the accent rule** (§2.2). A
landing page is where somebody reaches for a brand colour to make a section feel important. Under the
rule, the accent marks the current thing and the actionable thing — so "jump back in" may carry it on
its links' focus and hover, and a "what changed" row may not carry it at all, because a change is a
fact about the world, not a place you are.

---

## 7. What the diagram gets, specifically

Because "the design system reaches the canvas" is the claim, and a claim needs a list.

1. **A validated family.** 18 base tokens + the `PLOT` pack, per theme, with every ink measured
   against the diagram's own ground rather than the page's.
2. **A separation matrix** (§8.2) that no other surface needs: fills against the ground, fills against
   the **band** (a bar sits on two different grounds and nobody has ever checked the second), inks on
   their own fills, and **fill against fill** — the two states a planner most needs to tell apart
   across a wall of bars.
3. **Geometry tokens** — `--lane-h`, `--lane-bar-h`, `--radius-plot`, `--ruler-h`, `--rule-w` — so the
   diagram's rhythm is a theme decision rather than five constants in two files.
4. **A named text size**, from the data ramp, so a bar label, a Gantt cell and a table cell agree.
5. **The accent forbidden**, permanently and by rule, so a future brand change cannot walk into the
   float tails.

**And a hard performance rule that comes with it**, because this is the surface where a design system
can do real damage:

> **A metric or colour token may be resolved once per theme change or per resize, into the
> `PaintFrame` (ADR-0078). `getComputedStyle` may never appear inside a paint layer.**

The painter already resolves palettes once per `useThemeVersion` bump and never per frame. ADR-0065
measured the **pre-existing** painter at 16.7–23.1 ms p95 at 2,000 activities — 4–6× ADR-0026 §16's
≤ 4 ms, which `docs/TECH_DEBT.md` #75 has open. **This rewrite must not be the thing that makes #75
unmeasurable**, so L1 and L2 each re-run `apps/web/scripts/measure-link-routing.mjs` before and
after, and the numbers go in the milestone record. The harness exists; it has been run; there is no
excuse for reasoning about this one.

---

## 8. The gates — how each part is checked

Every gate below is either an extension of one that exists, or is modelled on a named precedent.
Each is **verified red first** where it should be red (ADR-0084 D5's rule, which ADR-0089 M6 records
catching a false "already covered" claim).

### 8.1 The **pair census** — the pair list stops being an inventory

`token-contrast.test.ts`'s `TEXT_PAIRS`/`NON_TEXT_PAIRS` are hand-written (`:86-153`), which is why
four pairs are missing and nobody noticed. An inventory goes stale every time the vocabulary grows —
ADR-0073 C4 recorded exactly that shape, where a hard-coded cap of `20` was overtaken by nineteen new
actions.

So the universe is **derived**: enumerate every `--color-*` fill and every `--color-*-foreground` /
`--color-*-text` ink from `@theme inline`, form the pairs a component can actually compile, and
assert that **every pair is either measured or explicitly classified with a reason**. Adding a token
without classifying its pairs fails the build.

**Three extensions, each one a defect somebody actually found:**

- **Alpha-modified fills are separate colours.** `bg-X/90` composites `--color-X` against its
  backdrop and is not `--color-X`. The census enumerates every `/\d+` colour modifier in
  `apps/web/src/**` (today: `button.tsx:11,12,19`) and measures the composite. This is the gate that
  would have caught the Delete button at **4.32:1** hovered while its rest state passed at 4.56:1 —
  the failure was in the modifier and nothing looked at modifiers.
- **A split pair is a failure by construction, not by ratio** (§1.5). If one half of a compiled pair
  is governed by a scope and the other is not, the census fails **regardless of the number**. That is
  what turns the `--background`/`--destructive` **2.92:1** finding from a judgement call — assert it,
  or record that the product does not currently make that pairing? — into a rule.
- **Both directions of an interaction state.** A `-hover` token is measured against its own label
  **and** against the governing scope's fill, because §2.4's rule is directional and a value derived
  against the wrong surface is a defect one state along.

Its blind spot, stated in its own docblock, because a census presented as proof is worse than none:
**it forces a classification, not a correct one.** A pair wrongly classified "never rendered" passes.
The census makes the omission impossible; it cannot make the judgement.

This is the gate that would have caught `--destructive`/`--destructive-foreground` at **4.56:1** on
the day it was declared, its hover at **4.32:1** on the day the modifier was written, `--secondary`
the day it was not rebound, and the `--background`/`--destructive` split the day a scope existed.
**Four findings, three finders, one gate.**

### 8.2 The **plot separation matrix** — new, and canvas-only

For each theme × each canvas flag state:

- every plot fill ≥ **3:1** against `--background` in the canvas scope (the ground) **and** against
  `-plot-band` (the striped ground);
- every plot fill's paired ink ≥ **4.5:1** on its own fill;
- every plot fill against every other plot fill — **reported in L0, asserted at ≥ 1.5:1 in L4**
  (CQ-D). Reported first because it is red today in two themes and a gate that fails on day one gets
  deleted rather than fixed (ADR-0058); the adjacent-surfaces block at `token-contrast.test.ts:189-213`
  is the precedent for a computed number that is printed rather than asserted.
- the same set for the **print** palette, because `resolvePrintPalette` resolves the same tokens onto
  paper (`palette.ts:109`) and a printed programme is a deliverable a scheduler hands to a client —
  and because a palette contract that is total on screen and partial on paper is how the two drift.

**Why fill-against-fill is the right number, and what it is _not_ — corrected on verification.** An
earlier draft justified it as "the monochrome-print test", on the reasoning that a WCAG ratio is a
luminance ratio and `resolvePrintPalette` puts these tokens on paper. **That justification does not
hold**: the print palette carries `outline` (`palette.ts:135`) and `paint.ts` strokes critical and
near-critical bars with it on the print path as on screen, so the solid-versus-dashed shape cue
survives a black-and-white printout and 1.4.1 is satisfied there too.

The honest justification is narrower and still sufficient. A luminance ratio is **the best available
proxy for "do these two read as different at a glance"**, which is the question a diagram made of
hundreds of bars actually poses — a planner scanning for the critical path is not inspecting stroke
patterns. **1.5:1 is a house number, not a standard**, and it is proposed rather than derived; that
is why CQ-D makes it a reported figure first and an assertion only once the values satisfy it. Anyone
raising the floor later owes a reason, and "WCAG says so" will not be it.

### 8.3 The **rhythm gate** — a metric may not be a literal

- ESLint rejects arbitrary sizing values (`h-[36px]`, `min-h-[2.25rem]`) in
  `components/**`/`features/**`, extending the existing colour-literal rule in
  `packages/config/eslint/react.js`. **Baseline: 27 arbitrary-value sites today** (searched across
  `apps/web/src/**/*.tsx`). It ships as a **ratchet at 27, never up** — the ADR-0058 coverage-ratchet
  pattern, set at the measured floor rather than an aspirational zero, because a gate that fails on
  day one gets deleted.
- `tabular-nums` may not appear in a `className` — use `text-data` (§4.1).
- A virtualized list's row height must come from `--row-h`, not a module constant. Structural test,
  naming `HierarchyTree.tsx`, `GanttPanel.tsx` and `geometry.ts` as the three call sites it covers.

### 8.4 The **page-frame** structural test

No file under `src/routes/` hand-rolls the page frame. `surface-seams.structural.test.ts`'s shape,
including its own hard-won note: **the protection is in the regex; the allowlist is what must not
grow** (ADR-0077 §1).

### 8.5 **Total records**, so a new member is a typecheck failure

`Record<SurfaceTone, SurfaceFamily>`, `Record<Density, MetricSet>`, `Record<PlotRole, FillAndInk>`,
`Record<AccentRole, TokenName>`. ADR-0094's `Record<ConflictKey, ConflictRemedy>` is the precedent
and its stated benefit is exactly the one wanted here: adding a flag becomes a typecheck failure
rather than a conflict reaching a planner with nothing behind it.

### 8.6 Existing gates, extended not replaced

`token-architecture.test.ts` gains: per-scope completeness = **the closure** (§1.5b) + declared
packs, replacing the hand-written `REBOUND_NAMES` array at `:83-102` with an assertion that the
declared rebind list **equals** the computed closure — so `--secondary`, `--destructive` and its
hover arrive without anyone noticing them; the `canvas` family joins `FAMILIES`; the
`[data-density]` layers get the same "a scoped layer restates its global layer in full" assertion
that the flag layers have (`:202-221`), because it is the same cascade trap.

`surface-seams.structural.test.ts` gains `canvas` **in its regexes**, not only in its allowlist —
ADR-0077 §1's implementation note, which is the one thing about that gate that is easy to get wrong.

---

## 9. How this makes "a correct pattern applied to one control and not its neighbour" impossible

This repository has recorded that defect shape in ADR-0059 M6, ADR-0062 M6, ADR-0064 §7 (four of
five findings), ADR-0067 M4, ADR-0073 C4, ADR-0080, ADR-0086 M6, ADR-0090 M5, ADR-0092 and ADR-0093.
It is the house defect. A design system that does not attack it directly is decoration.

Four mechanisms, in decreasing order of strength:

**1. Make the wrong thing not compile.** A colour family has no utility, so a component cannot choose
a surface (exists, kept). A metric literal fails lint, so a control cannot be sized one way here and
another there (§8.3). `tabular-nums` fails lint, so a number cannot be typeset two ways (§4.1). This
is the only mechanism that works while nobody is looking.

**2. Make the set total.** Where the system has an enumerable set, the mapping is a `Record`, so
adding a member without handling it is a typecheck failure (§8.5). This is what turns "somebody must
remember to update the other place" into "the compiler will tell you".

**3. Derive the inventory, never write it.** The pair census (§8.1) is the general form: any gate
whose contents are a hand-written list will eventually be shorter than the thing it guards. Four
missing contrast pairs and ADR-0073 C4's cap of `20` are the same failure.

**4. Remove the decision from the call site.** `PageHeader` decides where the primary action goes, so
twelve routes cannot each decide. `DataTable`'s `numeric` flag decides alignment, so a column cannot.
`EmptyState` decides what an empty list looks like. This is the weakest mechanism — a call site can
always not use the primitive — which is why each ships **with** a structural test (§8.4) rather than
with an instruction.

**What none of them covers, said plainly.** No gate can tell you a screen is beautiful, that a
hierarchy reads, or that an accent is prominent enough to be an accent. Mechanisms 1–4 make it
impossible for a _decision that was made_ to be applied inconsistently; they cannot make the decision.
That judgement stays with a person looking at a screen, and this design's honest contribution is that
it reduces the number of screens that person has to look at from every screen to every archetype.
