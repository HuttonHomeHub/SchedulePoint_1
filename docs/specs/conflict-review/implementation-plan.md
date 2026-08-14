# Implementation Plan: Conflict review

- **Spec:** [`feature-spec.md`](./feature-spec.md)
- **Status:** **Approved to build**, 2026-08-13. Revised against the five-specialist pre-approval
  review, then **confirmed by all five on a second pass** — every blocking finding resolved. That
  second pass raised two more, both folded here: an accessibility gap (the read-out is `aria-hidden`)
  and **N1**, which sent one decision back to the product owner and simplified the epic.
- **Date:** 2026-08-13
- **Proposes:** ADR-0094

---

## What the review changed, up front

Approved in principle, then reviewed before a line was built (the ADR-0090 precedent). Five
specialists; **three findings reached independently by two or more of them**, which is the same
pattern that decision recorded.

| #   | Finding                                                                                                                                                                           | Effect                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | `ToolbarItem.label` is a static string; the count-on-button design was **refused once before, on measurement**, and the spec's justification for reversing that refusal was false | D1 reversed; the button work is **M3**                                  |
| 2   | `ConflictHit` carries display labels, not keys — a per-type remedy would match on UI copy (**3 reviewers**)                                                                       | New M1 type work, before anything else                                  |
| 3   | A new dock strip re-creates the ADR-0093 duplicate **and the gate cannot see it** (**2 reviewers**)                                                                               | **M4** re-shaped: no new strip                                          |
| 4   | The filter feeds **four** consumers, including the export/print scope                                                                                                             | M2 scope widened                                                        |
| 5   | Six existing tests + a flag-off parity pin must be rewritten                                                                                                                      | Inventoried in M0-T4, rewritten in M3-T1                                |
| 6   | `negativeFloat` is one root counted N times                                                                                                                                       | D-f: root-only → **dropped from the set** on the confirmation pass (N1) |

### What the confirmation pass added

All five reviewers confirmed their blocking findings resolved. Two new ones came back:

- **N1 (blocking, product-owner decision).** Root-only negative float recreates F1 — see M2-T2. The
  product owner dropped the flag instead, which **shrinks** the epic.
- **A11y (blocking, cheap).** The persistent read-out is `aria-hidden`, so an AT user still cannot
  read the count without acting — the exact requirement M3-T2 exists for. Folded into M3-T2 as an
  `aria-describedby` link to a non-live `sr-only` node, the search field's existing pattern.

And one correction to a claim **this plan repeated from a reviewer without checking**: widening the
filter does **not** change what a filtered PNG, PDF or printed programme contains. `isMatching`
reaches only the CSV export; `render-export-image.ts` has no filter input at all. "Four consumers,
not one" stands; the escalation to images does not.

---

## Breakdown

### Epic

**A conflict count you can read without acting, and a remedy that fits the conflict you land on.**

Frontend-only. **The CPM engine is not imported and no migration runs**, so the ADR-0034 parity gate
is untouched by construction; `database-architect` is not engaged because there is no schema to
design, not because a change was judged too small (§19.3).

---

### Milestone M0 — Measure and enumerate · _dark_

##### M0-T1 — What does promoting the button cost Row 1? (≈ small)

- **Measure with a static worst-case STUB**, not with the real change. The first version of this
  task required building the thing it was meant to gate — a dark measurement milestone cannot
  depend on the milestone it gates.
- Record at 1646 and across the fit gate's widths: inline count, labelled count, whether the `⋯`
  appears, and **what demotes**.
- **Re-derive the baseline here.** The first version inherited it from
  `progress-entry-convergence/m0-measurements.md` — but ADR-0093's own retrospective records the row
  composition changing in that same session. Inheriting another epic's numbers is the §19.10 failure
  in miniature.
- **The escalation path is CLOSED** (product owner): _"for the spacing i will accept what it comes
  out at for the time being"_. This task **records**; it does not decide. Name whatever demotes in
  the ADR, and do **not** switch mechanism to dodge a demotion — that would trade a recorded cost
  for an unrecorded one, which is what makes "for the time being" reversible.
- **Also measure the read-out's own withdrawal band**, since D1 now pins it at `compact`.
- **Stub the read-out at its WIDEST too, not only the button** (N2). It is capped at
  `max-w-[14rem]` = 224 px (`tsld-toolbar-items.tsx:1451`), it is **non-demotable** (a `render` item
  has no `onActivate`), and it swings from ~70 px idle to its cap on the first click. Against
  ADR-0091 M7's ~382 px of Row-1 slack at 1646, a promoted button plus a pinned chip at cap is most
  of it. Measuring only the button would measure the easy half.

##### M0-T2 — Enumerate all four filter consumers (≈ small)

The spec said one; there are four. Confirm each, and write down **specifically** what the widened
filter does to the **export / print scope** (`use-tsld-toolbar-context.tsx:305-319`) — it changes
what a filtered PNG, PDF or printed programme contains, and that consumer appeared nowhere in the
first version.

- Also confirm the two fixture helpers that will fail **typecheck** (not runtime) when
  `MatchableActivity` grows: `lenses.test.ts:29-38`, `search-matches.test.ts:8-19`.
- Also confirm `guest-api.ts` needs no change (it already returns every flag, zeroed) — record it as
  **checked**, not assumed.

##### M0-T3 — Confirm the remedy routes exist (≈ small)

Open each one rather than reading the type union. **Already established by the review:** `resources`
is an existing `ActivityEditorPurpose`; `scheduling` is **not**, so only the constraint route needs
a new purpose.

##### M0-T4 — Inventory the tests that must be rewritten (≈ small) · _new_

Not optional bookkeeping — this is what re-sizes M1. `tsld-toolbar-canvas-nav.test.tsx:83-141` has
six tests that legitimately go red: three assert the chip via `getByTitle`, three reach the button
through an `overflowItem()` helper that opens the `⋯` first because the item is tier 3 today. Plus
the flag-off parity pin at `tsld-toolbar.test.tsx:335-353`, whose prose narrates "tier-3 → `⋯`" and
becomes false — `nextConflictShape` is spread into both the flag-on and flag-off branches, so
promoting it moves the placeholder inline too.

---

### Milestone M1 — The types, before any behaviour · _dark_

**This milestone exists because the review found the plan's "cannot diverge" claim inexpressible as
the types stand.** Nothing here is user-visible.

##### M1-T1 — Narrow `ConflictFlag.key` to a closed `ConflictKey` union (≈ small)

Without it, no `Record<ConflictKey, Remedy>` can be total, and the compiler cannot force a decision
when a flag is added.

##### M1-T2 — Split `ConflictFlagFields` out of `ConflictableActivity` (≈ small)

`matches` currently takes `id`/`earlyStart`/`laneIndex`, which no predicate reads and which exist
only for `orderedConflicts`' sort. Reusing it for the filter would force `MatchableActivity` to grow
three fields it has no use for — bad coupling arriving through an over-broad signature.

##### M1-T3 — Carry the matched key on `ConflictHit` / `currentConflict` (≈ small)

Found independently by three reviewers. Without it the remedy map matches on display copy.

---

### Milestone M2 — One meaning of "conflict" · _user-facing_ · **runs BEFORE the button**

**Order flipped on review.** M2 changes the number M1 puts on the bar; shipping the count first
would publish a figure and then change its meaning in the next release.

##### M2-T1 — Widen the filter to the counted set (≈ one PR)

- Re-express the Filter's `conflict` attribute through `CONFLICT_FLAGS`. **Verified red first:** a
  broken-constraint activity that the filter misses today.
- **Two structural assertions**, on the `selection-duplication` precedent: the general one (the
  filter routes through `CONFLICT_FLAGS`, no hand-rolled boolean) plus **one pinned positive case**,
  so a degenerate empty state cannot pass by both sides trivially agreeing on nothing.
- **State the blind spot in the test's own docblock:** it proves the _rule_ is one source, not that
  both call sites read an equally fresh activity list. That half is the journey's (M5-T2).
- **Decide the guest meaning deliberately** — after widening, "Has conflict" means negative float
  only for a guest. State the reduced meaning or withhold the attribute.

##### M2-T2 — The counted set narrows from five to three (≈ small — **halved on review**)

- `externalDriven` out (D-c). `negativeFloat` out (D-f, **revised**).
- **Why root-only was withdrawn:** it recreates F1. `matchesActivityFilter` takes one activity, so a
  graph-dependent predicate cannot live there — count and cycle would show roots while the filter
  showed every affected activity, and M2-T1's structural assertion would have stayed **green**,
  because the divergence sits in a post-filter stage only one consumer runs. Put back to the product
  owner; they chose to drop it.
- **What that removes from this plan:** the edges parameter on `orderedConflicts`, the signature
  change across its four consumers, the graph-aware stage, the chain/diamond/fan-out/bridged test
  matrix, and the "no button" case in M4. Every flag stays a uniform `(activity) => boolean`.
- **Add nothing for either.** `ScheduleSummaryStrip` already reports `externalDrivenCount`; negative
  float already drives `isCritical` (ADR-0035 TF ≤ 0) and `FLOAT_BUCKETS[0]`.
- **Docs in the same commit** or it is the register's own drift class: `conflicts.ts`'s docblock,
  **`env.ts:573-574`** (which names the set) and `docs/specs/canvas-nav/`.
- **Tests:** an externally-driven activity and a negative-float activity, each with no other flag,
  are not counted, not cycled and not matched; `conflicts.test.ts:27-35`'s hardcoded five-key array
  becomes three.

---

### Milestone M3 — The button and its read-out · _user-facing_

Entry point (ADR-0081): the Next-conflict control and its read-out, Row 1.

##### M3-T1 — Promote the button, keep its verb (≈ one PR)

- `tier: 3 → 1`, **static** label. No primitive change; the accessible name keeps its verb at every
  width and in the `⋯`.
- Gating unchanged (`hasConflicts`; the no-diagram reason still wins).
- **Rewrite the seven tests M0-T4 inventoried**, including the flag-off parity pin's prose.

##### M3-T2 — Make the read-out persistent (≈ one PR)

- `isVisible`: `currentConflict != null` → `hasConflicts && band ≥ compact` (the Project-finish
  chip's precedent).
- Two states: `3 conflicts` idle → `2 of 3 · reason` stepping.
- **Verified red first, and the trap is named:** a loose "the count is visible" assertion passes
  green against today's code, because the chip already renders "Conflict i of n" while cycling. The
  assertion must pin the **idle** state — a count with nothing selected and no cycle started.
- **Keeps the reason on screen**, which is why the chip is no longer retired: retiring it before a
  replacement existed would have left sighted users cycling with no visible statement of what the
  current conflict is.
- **Link the button to it for AT** (confirmation-pass blocker): the read-out is `aria-hidden`, so on
  its own it gives a screen-reader user nothing until they activate — which defeats this task's own
  requirement. Give its text a stable id and point `next-conflict`'s `aria-describedby` at it,
  composed with the existing shaded-reason id when both apply. **Non-live, read on focus** — the
  search field's existing pattern (`tsld-toolbar-items.tsx:934-944`), never a second live region.
- **Two states the first version left undefined, now specified** (S6):
  - **Isolating** — `currentConflict` is null while `isolateActive` (`use-conflict-navigation.ts:72`),
    so a pinned read-out would silently drop from `2 of 3` back to `3 conflicts` mid-cycle. Decide
    and state which: hold the position, or say "paused while isolating".
  - **Filtered** — `orderedConflictHits` reads the whole plan, so `3 conflicts` shows while the
    filter dims to one visible. Now that the read-out is **persistent** this is on screen
    permanently rather than transiently, and it is F1 one layer along — the state most likely to be
    reported as a bug.

##### M3-T3 — Hold the fit gate (≈ small)

Sweep the promoted item like any other. The label is static now, so the "measure a two-digit count"
worry is gone — but the **read-out** is variable-width and pinned, so it is what the gate must watch.

---

### Milestone M4 — The remedies, on the surface that already exists · _user-facing_

##### M4-T1 — Move `clear-visual-placement` to the selection bar (≈ one PR)

- **Verify `selection-duplication.structural.test.ts` goes RED first** against the command-surface
  copy — proving the gate covers this by construction, which was the whole point.
- ADR-0093's own discriminator says this item belongs there anyway: its `isEnabled` consults the
  selection.
- Extract its four-condition gate (Visual mode + `canEditSchedule` + `!lateOverlayActive` +
  selection) into a **named shared predicate** — it is inline closures today, and the strip and the
  bar re-deriving it independently is exactly the drift this epic exists to remove elsewhere.

##### M4-T2 — Conditional remedy items on `selectionActionItems` (≈ one PR)

- Driven by a **total `Record<ConflictKey, Remedy>`** in the component layer.
- Reuse the `BulkActionGate` `{ enabled, reason }` shape rather than inventing a third gate object —
  `aria-disabled` never native, one `aria-describedby`-linked reason.
- **Opaque callbacks, not an imported `ActivityEditorPurpose`** — `features/tsld` must not import
  from `features/activities` (§5/§12); the composition root wires it, as the bar already does.
- ~~Negative float gets no button, and its copy must read as a decision.~~ **There is no longer a
  remedy-less type.** D-f's revision leaves three, all with a remedy, so this requirement — and the
  copy the UX review drafted for it — is vacuous. Struck rather than deleted, so a later proposal
  for a remedy-less flag is argued rather than slipped in.
- **Specify what happens after the one real fix succeeds** — it triggers a recalc that clears the
  very conflict the bar is describing. Unspecified in the first version, and it is the primary path
  the epic exists to create.
- **Tests:** one case per key; the **multi-flag precedence** case the spec names and the first
  version did not test; the shut-with-reason path.

##### M4-T3 — The Scheduling purpose (≈ small)

Only the constraint route needs one (M0-T3 established `resources` already exists).

---

### Milestone M5 — Gate pass and journey

##### M5-T1 — Specialist reviews over the built diff (≈ small)

The pre-approval pass reviewed the _plan_. This one reviews the _code_. **Include real-AT
verification** — the accessibility review flagged that the first version's mitigation ("assert
`aria-hidden` on the count") was **unsatisfiable as written**, and that announcement behaviour here
must be observed rather than reasoned about.

##### M5-T2 — Journey (≈ one PR)

- Extend `apps/web/e2e-workspace-chrome/` (1646, pen enforced, no `VITE_` pins).
- **Assert:** the count is readable with nothing selected and no cycle started; stepping updates it;
  the remedy works for a hand-placed clash against a real API; the filter and the count agree on a
  plan carrying several flag types; a five-activity negative-float chain counts one.
- **The dock height equality must be measured WITH a selection present** — the cycle selects, so
  that is the only state the remedies can occur in, and the outlet is `flex-wrap`. The first version
  asserted zero height as a fact before measuring it.
- **This assertion belongs here, not in Vitest**: jsdom has no layout and returns 0 either way, so a
  unit version would be true for the wrong reason (`dock.spec.ts:25-31` says exactly this).
- Locate controls by `[data-toolbar-item]`, never by copy. After any label or layout change, run
  **every** journey — see `docs/TESTING.md` for the local sweep trap.

---

### Milestone M6 — ADR-0094

Records the rule, and — more usefully — **what the pre-approval review changed**: a decision
reversed because its justification misquoted the comment it claimed to overturn, a remedy strip
withdrawn because it would have re-created a one-day-old duplicate invisibly to its own gate, and a
count narrowed twice because two of its five members were facts rather than faults.

Register in `docs/adr/README.md`, CLAUDE.md §16 and `docs/ROADMAP.md`; re-run `check:counts`.

---

## Sequencing

```
M0 (measure + enumerate) ─► M1 (types, dark) ─► M2 (one meaning) ─► M3 (button + read-out) ─► M4 (remedies) ─► M5 (gates) ─► M6 (ADR)
```

**M2 before M3 is the change.** The first version shipped the count first; the count's meaning is
what M2 settles.

## Definition of Done (per task)

Per §21, plus: the pre-push gate **run** (`pnpm lint && pnpm typecheck && pnpm test`, plus
`scripts/e2e-local.sh web:workspace-chrome` and `web:toolbar-fit`); every width claim carries its
measurement (§19.10); behaviour-changing assertions **verified red first**.

## Risks & assumptions (rollup)

| Risk                                                      | Likelihood | Impact   | Mitigation                                                                                   |
| --------------------------------------------------------- | ---------- | -------- | -------------------------------------------------------------------------------------------- |
| Promoting the button demotes something                    | medium     | low      | **Accepted in advance**; M0-T1 records what moved                                            |
| The widened filter changes an export's contents unnoticed | **medium** | **high** | M0-T2 names this consumer specifically; M5-T2 asserts it                                     |
| A remedy-less flag is proposed again later                | low        | medium   | D3 records why `negativeFloat` left, so the next proposal is argued rather than re-litigated |
| The remedy items crowd the selection bar                  | medium     | low      | They are conditional on the current conflict, so at most one shows                           |
| A future flag lands with no remedy                        | low        | medium   | The total `Record<ConflictKey, Remedy>` makes it a typecheck failure                         |

**Assumptions to check, not trust:** that `orderedConflicts` is the right home for a graph-aware
predicate (M2-T2), and that no consumer depends on `CONFLICT_FLAGS` being a uniform list of
per-activity predicates (M1-T1).
