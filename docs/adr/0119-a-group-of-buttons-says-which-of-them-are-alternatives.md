# ADR-0119 — A group of buttons says which of them are alternatives

- **Status:** Accepted
- **Date:** 2026-08-30
- **Amends:** ADR-0031 (the toolbar-item registry & command taxonomy) — its **rendering** model,
  not its taxonomy. Builds on ADR-0091 (a mode is not a command), ADR-0109 D1 (a command surface
  wraps; it never hides), ADR-0112 D4 (the header row wraps below ~1480 px).
- **Closes:** `docs/TECH_DEBT.md` #201.

## Context

The plan header's mode row holds four controls:

```
MODE   Early mode | Visual mode | Diagram | Gantt
```

They are **two independent two-way switches**. `Early | Visual` is the plan's scheduling mode
(ADR-0033); `Diagram | Gantt` is which view of the plan is on screen (ADR-0059). Choosing `Gantt`
does not stop the plan scheduling in `Visual`, and choosing `Visual` does not change the view.

The seven-group taxonomy (ADR-0031) puts all four in `lens`, and `Toolbar` renders one
`role="group"` per taxonomy group. So the row is **one region, one accessible name, four identical
gaps**. Every claim there was re-derived from the code on 2026-08-30 rather than taken from the
register row, and the visual half is provable rather than photographic: `Toolbar.tsx:197` applies
`gap-1` uniformly to every child of a group, and the only differentiating chrome
(`ml-1 border-l pl-2`, `:199`) is gated on `i > 0` — i.e. it separates **taxonomy groups**, and all
four items are in one. There is no code path by which the gap between `Visual mode` and `Diagram`
can differ from the gap between `Early mode` and `Visual mode`.

A planner who reads that as one four-way choice, and expects `Gantt` to replace `Visual mode`, is
reading the picture correctly.

**The host had already gone as far as the primitive allowed.** `plan-workspace-toolbar.tsx` passed
`groupLabels={{ lens: 'Scheduling and view' }}`, a compound name, because the shared default is
`Display` — which is also the deck's `lens` group name, leaving two on-screen regions with one word.
That override was the honest thing to do; what it could not do is say where one switch ends, because
nothing in the markup knew.

### The accessibility claim, at its true strength

**No WCAG 2.2 success criterion applies.** This is stated plainly because this register records
overstating a citation once already (ADR-0082, where a defect raised as an accessibility blocker
turned out to have no applicable SC, and the overstatement was corrected rather than quietly
dropped).

- **1.3.1 Info and Relationships (A) — does not apply.** It requires relationships _conveyed through
  presentation_ to be programmatically determinable. Here the relationship is conveyed through
  presentation **not at all**; both channels are equally silent, so nothing visual is being withheld
  from the accessibility tree.
- **4.1.2 Name, Role, Value (A) — is met.** Each control has a name, the role `button`, and an
  accurate `aria-pressed`. A set of toggle buttons of which one is pressed is a weaker description
  than a radiogroup, not an incorrect one.
- **2.4.6 Headings and Labels (AA) — strained, not failed.** "Scheduling and view" _is_ descriptive
  of what the region contains. Its fault is that the region should not exist.

It is a **design-system and usability defect**, which is reason enough.

## Decision

### D1 — A taxonomy group may render as N named sub-groups

`ToolbarProps` gains `segmentLabels?: Record<string, string>`. When **every** item in a taxonomy
group carries a {@link ToolbarItem.segment} that the map names, the group renders one `role="group"`
per distinct segment in **first-appearance order**, each named from the map, with the existing
inter-group hairline between them. The outer wrapper keeps the layout and gives up its `role`.

The taxonomy stays **closed at seven**. ADR-0031's own words are that a new command "must pick an
existing group, it can't invent one", and that closure is the point; this amends how a group
_renders_, which is the smaller and more honest amendment.

### D2 — The precondition is all-or-nothing, and the fallback is today's rendering

A partial partition is refused: if any item lacks a labelled segment, the whole group renders exactly
as it does now. Putting some items in a named region and leaving the rest in an unnamed one is
**worse than the defect** — an unnamed region is a container a screen-reader user must enter to
discover holds nothing they were told about.

`partitionBySegment` is that rule in pure, DOM-free form, exported and tested on its own: the
interesting decision is "may this group be split at all", and asking it of the DOM turns a rule about
data into a rule about markup.

### D3 — Nested `role="group"` is avoided rather than reasoned about

The outer wrapper loses its role instead of containing the sub-groups as a parent group. Real AT
behaviour for nested groups is **not observable in this environment** — `docs/TECH_DEBT.md` #154
records that no screen reader runs in this repository's build container — so the design does not rest
on a guess about it.

### D4 — `demotionGroup` becomes `segment`

The field already existed and already declared exactly this fact. It was named for the one thing it
was ever _consumed_ for: keeping a pair together through the width ladder's demotion pass. **ADR-0109
D1 deleted that pass**, leaving a field named for a mechanism that no longer exists and read by
nothing — and two `defineToolbar` invariants whose comments cited `companionsOf`, a function that
went with the ladder (`docs/TECH_DEBT.md` #193).

Both invariants are **kept**, on ground the deleted pass no longer supplies: a segment is one switch,
and it may not span a tier or a row. The row invariant now guards something the product actually
does — a segment renders as one sub-group, and a sub-group cannot straddle two toolbars.

The rename is compiler-enforced across four declarations, one interface field, two test blocks and
one comment. `rg demotionGroup apps/web/src` returns one hit: the sentence in the field's own
docblock recording what it used to be called.

### D5 — "Plan view", not "View"

`Toolbar.tsx:44-46` records a UX review rejecting exactly this collision once: `View ▾` is the deck's
display-toggles trigger and `Display` is the `lens` default. A third "View" would give a
screen-reader user one word for a mode group, a menu of lenses and a trigger. Confirmed by the
product owner, 2026-08-30.

### D7 — The row's umbrella labels said "one mode", in both channels

Two things above the switches still asserted the unity the split denies, and **neither was reasoned
about** — unlike D5, which was careful about a collision one level down:

- The visible caption read `MODE`: one `aria-hidden` word spanning both switches. **Deleted.** It
  carried no information (an `aria-hidden` label reaches no AT user), removing it removes a false
  statement, and it _buys_ width on a width-critical row. ADR-0090 M2-T6 set the precedent by
  deleting this surface's other row-purpose captions.
- The toolbar's accessible name read `Plan mode` — a region containing a group named `Plan view`,
  so an AT user heard the container denying its own child, and "mode" three times at three nesting
  levels. Now **`Plan mode and view`**.

The rule the second one turns on is worth stating, because it looks like a reversal and is not: **a
compound name is wrong for a group and right for a container of two groups.** `Scheduling and view`
had to go because it named two switches as one region and could not say where either ended. Naming
a container by the two named groups inside it is the opposite — it describes what is really there.

### D6 — No feature flag

ADR-0088 D1: a `VITE_` constant is inlined at build time and has never been an operator rollback —
`apps/web/Dockerfile` declares one `VITE_` build arg and `docker-publish.yml` passes none, so every
published image carries every flag at its default. The rollback is a commit boundary.

## The measurement, and what it changed

The visible hairline costs width on a row that **wraps**, so its failure mode is a second line — 36 →
84 px, i.e. 48 px of canvas, on the surface eight consecutive epics have contradicted their own
width expectations about (ADR-0090 M4 → ADR-0115, always in the same direction).

So the verdict rule was **committed before the run** (`docs/specs/mode-toggles/falsification.md`, its
own commit) and the product owner pre-approved the withdraw branch: if the divider cost a line, the
accessible names would ship alone. It did not. Measured at four widths, the shipped row:

| width | container | `headerRowRequired` | header `lines` | `aboveCanvas` |
| ----- | --------- | ------------------- | -------------- | ------------- |
| 1920  | 1888      | 1507                | 1              | 228.0         |
| 1646  | 1614      | 1507                | 1              | 228.0         |
| 1440  | 1408      | 1507                | 2              | 326.0         |
| 1280  | 1248      | 1507                | 2              | 326.0         |

`aboveCanvas` is **unchanged as an equality**, not within a bound — ADR-0115 records a `<= 120 px`
bound that could not tell the fixed state from the broken one. The two widths that show two lines
were already wrapping before this change (ADR-0112 D4's designed behaviour below ~1480 px), and the
shipped figures match the pre-build prediction **to the pixel**.

**The instrument was wrong on its first run, and that is the part worth carrying.** It reported +5 px
against a predicted +13 at every width, which passes every rule just as 13 does — so the verdict
would have been identical and the number in the record would have been wrong. The cause was the
injection, not the layout: it applied the chrome to the `Diagram` **button**, and on a control that
already carries `px-2` an inline `padding-left: 8px` **replaces** its padding rather than adding a
group's. Caught by two cheap deliberate things: the delta disagreed with a prediction that had been
written down first, and the probe prints the text of the node it touched.

## Consequences

- **`Toolbar` gains one optional prop and one branch.** The keyboard model is untouched by
  construction — `focusableIds` is built from `resolved` before grouping and focus moves by a
  descendant query on the container, so neither can see a wrapper — and that is pinned by tests
  rather than argued, verified red by giving each sub-group its own `onKeyDown`.
- **93 pre-existing toolbar cases pass unchanged**, which is the dark-ship claim for the milestone
  that added the prop with no caller.
- **A silent regression is now a CI failure.** The all-or-nothing precondition is correct and
  invisible: an item added to the mode row without a segment would quietly reinstate the
  undifferentiated group. `plan-mode-segments.structural.test.ts` asserts both halves against the
  real registry and the real host map — never a restatement — and carries a **pinned positive**,
  because both assertions are vacuously true of an empty row and a build rendering no mode row at all
  would otherwise pass it perfectly.
- **The journey covers what a structural test cannot**: that the names survive a real render at a
  width where the row has wrapped (`e2e-workspace-fit/pen-status.spec.ts`, both line counts). No new
  Playwright config and no new CI step — adding either would have been an independent ADR-0105
  trigger.
- **The CPM engine is not imported and no migration runs**, so the ADR-0034 recalculation parity gate
  is untouched by construction.

## Alternatives considered

- **Radiogroup semantics (`role="radiogroup"` + `role="radio"`).** Rejected: the APG radio pattern is
  focus-follows-selection, so arrowing through the group _changes the plan's scheduling mode_ on the
  way past. That is a worse defect than the one being fixed, on a control that recalculates.
- **An eighth taxonomy group.** Rejected: it amends the closed union whose closure ADR-0031 says is
  the point, and it would make every future two-way switch a taxonomy question.
- **Two `<Toolbar>` instances side by side.** Genuinely tempting — zero primitive change — and
  rejected because it costs a **second tab stop** in the header for a naming fix, each toolbar would
  still render its own `lens` group inside itself (the same override problem twice), and
  `authoringEnabled` would be split across two components that must not disagree.
- **Visible per-pair captions as well as names.** Rejected on width: this row is the one the
  product is judged on, and the hairline carries the visual half at a measured zero cost.

  **This bullet's first version said "the hairline plus the existing `MODE` caption already carry
  the visual half", and that was false in a way that decided something.** The caption was one
  `aria-hidden` word spanning _both_ switches, so it asserted the single umbrella this decision
  exists to remove — it pulled against the split rather than reinforcing it. A claim about
  behaviour, unverified, used as evidence for a rejection: ADR-0076 Class 3, inside the document
  making the choice. Found by the ux gate. **The caption is now deleted** (D7), which is why the
  rejection still stands — on the hairline alone, which is what was actually measured.
