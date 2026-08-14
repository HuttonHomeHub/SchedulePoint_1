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

## M0-T1 — the width measurement

_(pending — measured with a static worst-case stub for the button AND the read-out pinned at its
`max-w-[14rem]` cap, per N2.)_
