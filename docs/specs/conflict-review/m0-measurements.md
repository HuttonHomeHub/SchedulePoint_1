# M0 — measurements and enumeration

Established 2026-08-13, against the tree at `1908960`. Each claim names what was **run or read**
(§19.10).

---

## M0-T2 — the filter's consumers: **four, not one, and not the images**

The spec's §3 said widening `matchesActivityFilter` changed "the one part of the epic that changes
what an existing control returns". Grepped:

| #   | Consumer                     | Site                                   | What widening does                 |
| --- | ---------------------------- | -------------------------------------- | ---------------------------------- |
| 1   | Canvas dimming               | `TsldPanel.tsx:1006`                   | More bars dim under "Has conflict" |
| 2   | Search-nav Enter cycle       | `search-matches.ts:54`                 | The cycle walks more activities    |
| 3   | Export **scope** + its count | `use-tsld-toolbar-context.tsx:305-319` | See below                          |
| 4   | The announced match count    | same memo                              | Announces a larger number          |

### The escalation to images was wrong, and this plan had repeated it

The architecture review said this changes what a filtered **PNG / PDF / printed programme**
contains. The spec, its commit message and the report to the product owner all carried that forward.
**Checked, and it is false:**

- `isMatching` reaches exactly one export: `export-csv.ts:148-153`, and only when
  `scope === 'matching'` — i.e. only when the planner explicitly picks "Matching activities
  only (N)" from the Export menu.
- `grep -c "dim\|isMatching\|filterAttrs" apps/web/src/features/tsld/export/render-export-image.ts`
  returns **0**. The image path takes no filter, dim or match input at all, so the exported PNG — and
  the PDF built from it — cannot change.

"Four consumers, not one" stands and the spec's correction is right. The escalation does not.
Recorded because repeating a reviewer's claim unchecked is the same failure as trusting a document,
one source along — and this epic is about that failure.

### Typecheck fallout, not runtime

Two fixture helpers construct bare `MatchableActivity` literals and will fail **typecheck** when it
grows: `lenses.test.ts:29-38` (`matchable()`), `search-matches.test.ts:8-19` (`row()`).

> **Corrected on contact: it is five files, not two.** Building M2-T1 surfaced three more —
> `search-escape.test.ts`, `search-match-identity.test.ts` and `use-search-navigation.test.ts`, all
> constructing `SearchableActivity` (which extends `MatchableActivity`). The enumeration was done by
> grepping the _type name_, which misses fixtures typed through a subtype. Harmless here — the
> compiler names every one and they are all one-line fixture edits — but the method was wrong, and
> an enumeration that undercounts is worth recording as such rather than quietly widened.

### The guest path — **checked, not assumed**

`guest-api.ts:190-235` already returns a full `ActivitySummary` with every flag present and zeroed,
so it compiles untouched. After widening, "Has conflict" is always false for a guest — which is what
it already is today. **The third-meaning concern raised in review evaporates** with the D-f
revision: it rested on `totalFloat` passing through while the other flags were zeroed, and
`negativeFloat` is no longer in the set.

## M0-T3 — the remedy routes

- `resources` is an existing `ActivityEditorPurpose` (`activity-editor-intent.ts:63-82`).
- `scheduling` is **not** — `'edit'` maps to `general`. Only the constraint route needs a new purpose.
- `clear-visual-placement` is a real wired command (`tsld-toolbar-items.tsx:2358-2396`), gated on a
  four-condition ladder (Visual mode + `canEditSchedule` + `!lateOverlayActive` + a selection)
  written as inline closures — so it must be **extracted to a named predicate** before the selection
  bar can share it.

## M0-T4 — the tests that must be rewritten

Read, with line numbers, so M3-T1 is sized honestly rather than as "≈ one PR":

- `tsld-toolbar-canvas-nav.test.tsx` — the chip asserted by `getByTitle('Conflict N of M: …')` at
  `:91` and `:111`; the button reached through `overflowItem('Next conflict')` at `:123`, `:131`,
  `:140`. The helper itself is `:59`, and it **opens the `⋯` first** because the item is tier 3
  today.
- `tsld-toolbar.test.tsx:335-353` — the flag-off parity pin. Its prose says _"since ADR-0090 M2 it is
  a tier-3 item — so flag-off its placeholder lives in the `⋯` rather than inline, which is what
  this now pins"_, and it queries `getByRole('menuitem', …)` after opening the overflow. Promoting
  the shared `nextConflictShape` moves the **placeholder** inline too, so both the assertion and the
  paragraph become false. The paragraph is the part a reader would otherwise trust.

## M0-T1 — the width measurement, and the defect it found

Measured 2026-08-14 by running `e2e-toolbar-fit` locally against a real API — not with the planned
static stub, because the gate already sweeps 2133 → 768 and reports each row's laid-out width
against its container, which is the same number the stub would have approximated.

**It went red, and the plan's expectation of what to do about it was wrong in both directions.**
N2 said this task "records, does not escalate". A red gate is not a thing to record — it is the
escalation guard firing — so it was diagnosed instead.

### What was measured

Promoting `next-conflict` from tier 3 to tier 1 (M2) put Row 1 **8 px past its 1008 px container at
1024** — `S4 View and navigate @ 1024`, `scrollWidth` 1016. Every other width in the sweep passed,
including the product owner's **1646**. Attributed by probe, not by reasoning: reverting only the
tier change turned the gate green, which is the whole attribution.

### The first hypothesis was wrong, and the way it was wrong is the point

The obvious cause was the new `next-conflict-status` read-out: a `render` item can never demote, so
its width is paid at every viewport, and the Project-finish chip has this exact defect recorded in
its own docblock (11 px at 1024, fixed with a `bandIsAtLeast(env.layout, 'compact')` floor). That
floor was written for the conflict read-out with the overhang cited as its evidence.

**It changed the overhang by exactly zero px.** The fixture plan carries no conflicts, so
`isVisible` was already false and the chip was never rendering at 1024. The floor is kept — the
argument for it stands on its own — but its docblock now withdraws the claim that it fixed
anything, rather than quietly keeping the story (ADR-0076 Class 3).

### The real cause is in `computeLadder`, and it predates this epic

Instrumenting the ladder's input at 1024 (temporary probe, reverted) showed:

```
available 1008  chrome 55  overflowWidth 41  allowDemotion true
core  today:146 zoom-out:32 zoom-in:32 fit:32 view:91 resource-view:32
      legend:32 search:252 filter:93 next-conflict:32 summary:126   (= 900)
candidates  [float-paths]
```

`1008 − 55 − 900 − (10 × 4 gaps) = 13` — so the ladder believed it had 13 px spare and demoted
nothing, while the row was painting a 41 px `⋯` for the un-admitted `float-paths`. `overflowWidth`
was subtracted **inside** the `budget < 0` branch, so Stage 2's shortfall test asked _"is this row
short without the button it is already rendering?"_ Any row over by less than the button's own width
answers no.

Stage 3 already had the rule right, in its own comment: with candidates present the `⋯` is charged
unconditionally and deliberately not released even when every candidate is admitted. The fix applies
that rule one stage earlier, so it is a **move rather than a new charge** — admission's arithmetic is
untouched. Three unit cases in `toolbar-ladder.test.ts`, the first verified red against the old code.

This is the fourth consecutive epic whose width expectation its own measurement contradicted
(ADR-0091 D4, ADR-0092 M4, ADR-0093's withdrawn width argument, this). It is starting to look like a
property of the ladder rather than four coincidences.
