# The design against the hard surfaces

> The test of a design system is not the button. It is whether the vocabulary survives contact with
> the four surfaces this product is actually made of. Each section below says what the surface gets,
> what it costs, and what would break.

---

## 1. The TSLD canvas at 2,000 activities

### What it gets

1. **A validated family** (`design.md` §1.2). Every ink it paints becomes a value measured against
   the diagram's own ground rather than the page's — closing `diagnosis.md` §3.1, which is the same
   defect ADR-0055 was written about, surviving in the one place ADR-0055 never reached.
2. **A separation matrix** (`design.md` §8.2), including the two things nobody checks: a fill against
   the **month band** (a bar sits on two grounds), and fill-against-fill, which **is** the
   monochrome-print test for a deliverable a scheduler hands to a client.
3. **`--primary` freed** to mean "an ordinary activity" here and "the action" everywhere else,
   retiring the constraint that pushed Corporate's near-critical to bronze.
4. **Geometry tokens** — `--lane-h`, `--lane-bar-h`, `--radius-plot`, `--ruler-h`, `--rule-w` — so
   `LANE_HEIGHT = 28` / `BAR_HEIGHT = 18` / `BAR_RADIUS = 3` stop being constants a theme cannot
   reach (`geometry.ts:35,37`, `render-model.ts:31`).
5. **The accent permanently forbidden**, by rule, so a future brand change cannot walk into the float
   tails.

### What it costs, per frame: nothing, and here is why that is not a hope

The painter resolves palettes **once per theme bump**, through `use-theme-version.ts`, because Canvas
2D `fillStyle` cannot take a `var()`. The canvas scope changes **which element** is passed to
`getComputedStyle` — same call, same count, one different argument (`palette.ts:12` already takes
`root: Element`).

The metric tokens are the genuine risk, and they get a rule rather than a hope:

> **A metric token is resolved once per theme change or per resize, into the `PaintFrame`
> (ADR-0078). `getComputedStyle` may never appear inside a paint layer.**

ADR-0078 already decomposes `paintScene` into layer painters taking one per-frame context; that
context is where a resolved `--lane-h` belongs. A `getComputedStyle` in a layer would be a forced
style recalculation per layer per frame, at 2,000 activities, on a painter ADR-0065 **measured** at
**16.7–23.1 ms p95** — already 4–6× ADR-0026 §16's ≤ 4 ms, with `docs/TECH_DEBT.md` **#75** open on
what to replace that budget with.

**So the rule about this epic and #75 is: do not make it unmeasurable.**
`apps/web/scripts/measure-link-routing.mjs` exists, has been run, and produces the numbers ADR-0065
quotes. **L1 and L2 each run it before and after**, and the figures go in the milestone record. This
is the one performance question in the epic where reasoning is not an option, because someone already
reasoned about this painter's cost and was wrong by a factor of five.

### What would break, and what catches it

| Failure                                                                      | Caught by                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The element handed to `resolveTsldPalette` is unmounted or outside the scope | A guard + a test asserting the resolved fill **differs** from the page fill when the two token values differ                                                                                                                                                                    |
| `resolvePrintPalette` keeps resolving at `document.documentElement`          | **This is a real trap.** It clears `.dark` and reads the root (`palette.ts:109-117`). If it is not moved into the scope, the printed diagram paints in page colours — today's bug, on paper. A test asserts both resolvers read the same scope, not merely the same token names |
| A layer reads a token per frame                                              | The ADR-0078 `PaintFrame` boundary + a counting-stub budget test, the `paint.dates-budget.test.ts` pattern                                                                                                                                                                      |
| A plot fill drifts against the ground or its neighbour                       | The separation matrix (`design.md` §8.2)                                                                                                                                                                                                                                        |

### One thing that changes visibly and should be expected

If CQ-A is answered yes, **Light and Dark gain a diagram ground distinct from `--card`** for the
first time. That is a visible change to the working surface of the primary view in two of three
themes, and it is a value change, so it lands in **L4** with its own commit and its own before/after.

---

## 2. The Gantt's virtualized rows

### What it gets

- **The same drawing ground.** The chart region takes `tone="canvas"`, so a bar in the Gantt and a
  bar in the TSLD are the same colour on the same ground for the same reason. That is ADR-0059's
  shared-time-axis rule applied one level up.
- **One ruler.** `--ruler-h` replaces `RULER_HEIGHT = 34` (`GanttRuler.tsx:6`) and
  `RULER_HEIGHT = 40` (`TsldCanvas.tsx:140`). Two bands, 6 px apart, drawing the same axis of the
  same plan.
- **One row rhythm** — CQ-B. `GANTT_ROW_HEIGHT = 32` (`GanttPanel.tsx:66`) becomes `--row-h`.
- **Tabular figures by construction.** `GanttCell.tsx:129` is `px-2 text-xs`; under the data ramp it
  is `text-data-sm` and gets tabular figures whether or not anybody remembered.
- **A `numeric` column concept** shared with `DataTable`, so a duration column in the grid and a
  duration column in the activities table align the same way.

### What it costs

Virtualization is measured off the row height (`GanttPanel.tsx:420`, `estimateSize`). If `--row-h`
becomes a CSS variable, the virtualizer needs a **number**, so it must be resolved once — on mount
and on a density change — never per row. Same rule as the canvas, different reason: `getComputedStyle`
inside `estimateSize` would run per measured row.

ADR-0095 measured the chart at **p95 71–74 ms** for 2,160 activities / 3,200 links with at-least-one-
endpoint culling. Nothing here touches that path; the link overlay's colour comes from
`--muted-foreground`, which the canvas scope now governs — and which the contrast matrix already pairs
against `--background` **and** `--accent` (`token-contrast.test.ts:144-145`), a pair added
speculatively before the arrows existed. Under the canvas scope those two pairs become correct rather
than approximate, because `--background` finally means the chart's ground.

### If CQ-B is answered "keep three"

Then `--row-h` is per-surface rather than global, and the Gantt keeps 32 while the tree keeps 28.
That is a legitimate answer — a Gantt row carries a bar and a tree row carries a label — but it must
be **a decision with a reason attached to the token**, not three files that never met.

---

## 3. The command surface at 1646 CSS px

This is the surface with the most measurement behind it and the least room, and the design's job here
is mostly to **not break it**.

### What the design system supplies, and what it does not

> **The design system supplies the control metrics. The ladder owns the decisions.**

`resolveLayoutMode`, the four bands, the 48 px asymmetric hysteresis, `computeLadder`,
`CHROME_RESIDUAL_PX`, the `⋯` costing, the "a shrink-to-fit row must never demote" rule and the
"the band width may never be an input to a fit decision" invariant are all ADR-0090/0091's and are
**untouched**. What changes is where `36`, `40` and `px-2`/`px-3` come from.

### The rule that keeps it safe

Metric tokens **land frozen at today's shipped values** (`design.md` §3.4). L2 is byte-identical by
construction and is proved so by running `measure:toolbar` and `test:e2e:toolbar-fit` at 1646 before
and after. **CQ-C is not answered in L2.** Four consecutive epics found their width expectation
contradicted by their own measurement (ADR-0091 D4, ADR-0092 M4, ADR-0093, ADR-0094 M0-T1); this one
does not add a fifth by arithmetic.

### What the design system does add, and it is two things the ladder has asked for

**A second prominence channel** (`diagnosis.md` §2.5, `docs/TECH_DEBT.md` #131). Today `showLabel` is
the only channel, so a demoted control loses its name and recovers it from a `title` that a touch
device never shows. The rule — _an icon-only control must carry a persistent, non-hover name_ — turns
that from a per-item oversight into something a component review can check on every item at once.

**The four missing glyphs** (`docs/TECH_DEBT.md` #126). `mode-early`, `mode-visual`, `view-tsld` and
`view-gantt` carry no `icon` field, so the condensed band cannot demote them; building it produced
four blank **16 px** buttons and `e2e-toolbar-fit` S5 failed it as a WCAG 2.2 §2.5.8 violation within
the hour. The entry's stated blocker is that choosing a glyph for Early versus Visual _"is a statement
about what those modes are"_ — which is a design-system decision, and this is the document that owes
it. `design.md` §4.4 gives the rule (depict the mode's **effect on the diagram**, not its name) and
the constraint (**all four together, or none** — doing the easy pair alone is the house defect).

**And the density scope answers #127** — the 40 × 36 touch target against a 44 × 44 house rule —
without adding 16 px to every desktop planner's band, which is the reason that entry is still open.

### What would break

A metric token that resolves differently inside the chrome scope than outside it. The command band is
inside `<Surface tone="chrome">`; density is a **separate** attribute and the two must not be
conflated. `[data-density]` is stamped by the workspace region, not by the surface — stated because
the obvious implementation is to fold density into `<Surface>`, and that would make the band's height
a function of its colour.

---

## 4. Tables and lists

`data-table.tsx` today: a spinner, an error, a caller-supplied empty node, `<thead>`/`<tbody>`, an
optional detail row. `docs/DESIGN_SYSTEM.md:419-423` describes sticky headers, sorting, selection,
pagination, numeric alignment, tabular figures and skeleton rows.

What it gets, and each closes a named gap rather than adding a feature:

| Addition                              | Closes                                                                                                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `numeric` flag on `Column<T>`         | 29 hand-applied `tabular-nums` across 18 files (`diagnosis.md` §1.3). Alignment becomes a property of the data, not a `cellClassName` that drifts one column at a time |
| `Skeleton` rows                       | `docs/UX_STANDARDS.md`'s year-old requirement with no implementation anywhere                                                                                          |
| A sticky header                       | The doc's own claim; and a 500-activity list is unreadable without one                                                                                                 |
| `--row-h`                             | CQ-B                                                                                                                                                                   |
| The `EmptyState` primitive as default | `docs/TECH_DEBT.md` #21(d)                                                                                                                                             |

**Deliberately not added: sorting and selection.** Both are done today by consumers through
`headerCell` (`data-table.tsx:19`) and both are genuinely per-screen — the WBS bulk-assign bar's
selection model (ADR-0063 M4b) is not the audit log's. Pulling them into the primitive would be a
component that has to know about permissions, which is how a table primitive becomes a framework.
Recorded as a decision so the doc can stop claiming them.

**`ListRow` is not a table**, and the discriminator matters for the landing page: a list of links with
supporting metadata is a list; forcing it into `<table>` misrepresents it to assistive technology and
to the eye. A row is a table row when its cells are **columns a reader compares across rows**.

---

## 5. Dialogs and forms

**ADR-0061's vocabulary is right and is not reopened.** `FormSection`, `FieldGrid`, `FieldGridFull`,
`FieldGridContainer`, `ContextStrip`, the four dialog sizes, the container-query rationale, the
archetype table, the "a create form never opens a dialog from inside a dialog" rule and the
"labels never say (optional)" rule all stand. Likewise ADR-0083's gated-field treatment and ADR-0082's
shaded menu items.

Three points of contact:

1. **Dialogs are `page` scope and `default` density.** Portals leave every surface scope by
   construction (`surface.tsx:19-21`), and that is correct. Density must not be inherited into a
   portal either: a form is read once and a toolbar is used a thousand times, and a `compact` dialog
   opened from the workspace would be the workspace's rhythm applied to a reading task.
2. **`--field` and `--input` are unchanged.** ADR-0055's "a field is not a surface" and "a control
   boundary is not a divider" are two of the sharpest decisions in the current system and both stay,
   with `--input` still gated at 3:1 as its own token.
3. **`ContextStrip` gets the data ramp.** It is the one place in a dialog that shows computed dates
   and float — quantities in a row — and it is exactly what `text-data` is for.

---

## 6. The public screens

**Untouched.** ADR-0077's `brand` and `auth` scopes are theme-invariant by decision, their values
were derived rather than sampled precisely because the sampled ones failed 1.4.11, and the login is
the best-designed screen in the product (`corporate-brand` D8).

Two consequences worth stating rather than leaving implicit:

- **The rewrite must not "fix" them to follow the theme.** `globals.css:155-177` says this in capital
  letters and it is right. The closure rule (`design.md` §1.5) applies to them like any other scope
  and will pull additional names into their families — that is a completeness change, not a
  theme-invariance change, and the `token-architecture.test.ts:72-80` literal-declaration assertion
  must be extended to cover whatever the closure adds, or the new members become inheritable and the
  invariance gate quietly stops covering them.
- **If Corporate becomes the default** (the sibling epic), ADR-0077 §2's premise **strengthens**: the
  pinned front door and the default application finally show the same identity. That is the
  relationship to record in the ADR — not an amendment, a consequence.

---

## 7. The staff console

`/staff` is the one screen already composing `Card` through its documented parts, and it does so
while **opting out of `CardTitle` in a written comment** because the primitive renders an `<h1>`
(`staff.tsx:117-118`).

It becomes the first consumer of `SectionCard` and of `CardTitle level`, and that comment is deleted.
That is a small thing and it is the clearest available proof that the system now serves the app rather
than the other way round: a call site that had to explain why it could not use a primitive stops
having to.

Otherwise: `page` scope, `default` density, `PageContainer` + `PageHeader`, and the Retention /
Mail / Security / Installation / Accounts / Activity panels become six `SectionCard`s instead of six
hand-rolled `p-4` blocks with one heading treatment written six times.

---

## 8. The organisation landing page (ADR-0098)

Answered in full at `design.md` §6. In summary: it consumes `PageContainer`, `PageHeader`,
`SectionCard`, `EmptyState`, `Skeleton` and `ListRow` rather than bridging them; it is **`default`
density**, which is the word its own spec observed it needed and could not name; and the accent rule
tells it where the brand may and may not appear on a feed.

**The sequencing that matters:** that spec says _"if ADR-0097 lands an `EmptyState`, a `Skeleton`, a
section archetype or a list-row archetype before the milestone that needs it, this epic consumes it
rather than building the bridge"_. **L3 is where they land**, and `migration.md` puts L3 early
deliberately for exactly this reason — a bridge built and then replaced is two implementations of one
thing, which is the ADR-0065 drift argument in a new place.

---

## 9. What this design does **not** solve

Said here rather than discovered later.

- **It does not make Corporate look designed by itself.** The vocabulary makes the decisions
  expressible and the mistakes catchable. Where the accent goes on a specific screen, what a page
  header contains, how far a card stands off its page — those are values, they land in L4, and they
  need a person and the product owner.
- **It does not measure prominence.** The accent census proves a binding, not that anyone can see it.
- **It does not touch the toolbar ladder's arithmetic**, which is the surface most likely to be
  reported as "still not right", and deliberately: four epics of measurement live there.
- **It does not resolve `docs/TECH_DEBT.md` #75.** The canvas draw budget is still unmeasured on the
  hardware envelope ADR-0026 §16 names. This epic's obligation is to leave that measurable and to
  re-run the harness that exists, not to answer it.
- **It does not add a chart library, a toaster or a command palette.** All three are absent, all three
are named as absent in `docs/DESIGN_SYSTEM.md`, and adding one under cover of a token rewrite is how
a design system becomes a framework.
</content>
