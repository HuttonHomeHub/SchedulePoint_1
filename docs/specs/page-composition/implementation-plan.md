# Implementation Plan: Page composition — measure, frame, density and information

- **Feature spec:** [`./feature-spec.md`](./feature-spec.md) — **Accepted — shipped (ADR-0146)**
- **Status:** Accepted
- **Owner:** web

---

## What the answers changed

The product owner answered all four critical questions on 2026-09-17 (spec §1.10). Three of the four
were the analyst's recommendation and change nothing here. **D1 was not**, and it changes the plan in
three places — recorded rather than absorbed, because a plan edited silently to match an answer is a
plan nobody can audit.

**M1 gets smaller, not larger.** D1 reuses `max-w-screen-2xl` rather than minting a 1400px token, so
M1-T1 stops being "declare a token, justify a value, add a `WIDTHS` key, re-point the default" and
becomes **change one value and dispose of the duplicate key**. The ADR-0097 theme-contract gate is no
longer engaged (no token is declared), and `docs/DESIGN_SYSTEM.md` records a changed value rather than
a new concept. What M1 _gains_ is the `wide`-retirement work in M1-T1a, which is smaller than the
token work it replaces.

**The M1+M2 ordering constraint holds and tightens.** It held because widening the page while the
fixed caps remain makes the wrapping worse. D1 widens **further** than the rejected proposal would
have — 1488px instead of 1352px at 1920, i.e. **384px of new width instead of 248px** — so the
surplus handed to uncapped columns beside a still-capped `Working days` is larger, and the interim
state is more visibly wrong. Same constraint, more of it.

**M2's blast radius trebled, and that is a census correction rather than a consequence of any
answer.** 15 cap declarations across 5 files, not 2 (spec §1.2.4, §4.4.1). `ProjectCalendarsSection`
and `PlansTable` put caps on **Client detail and Project detail** — two complained-about screens —
and `staff.tsx` carries nine. M2-T2 is re-scoped accordingly and split, because the staff console's
caps are not a defect today and must be asserted pixel-unchanged rather than redesigned.

**Three reviewers move from conditional to in scope** (D3 ships the API change): `api-reviewer`,
`security-reviewer`, `backend-performance-reviewer`. `database-architect` was already unconditional.

**No falsification condition was invalidated and none was weakened.** FC-1's wording is unchanged and
it becomes materially _easier_ — under the rejected 1400 proposal it was **unsatisfiable**, because
the overview and staff console would have stayed at 1488 while the nine screens moved to 1352 (spec
§1.10 D1). FC-3's bar is unchanged (monotonic non-regression) and its _expected_ delta is restated:
**+204px at 1646 and +384px at 1920**, against +204/+248 under the rejected proposal. The M0 baseline
is the same 1104/1488 either way, so no baseline number is carried forward wrongly.

---

## Breakdown

```mermaid
flowchart LR
  E[Epic: Page composition] --> M0[M0 Measure]
  M0 --> M1[M1 Measure + frame]
  M1 --> M2[M2 Column model]
  M2 --> M3[M3 Filters + controls]
  M3 --> M4[M4 Members]
  M4 --> M5[M5 Detail screens]
  M5 --> M6[M6 Audit + Recently deleted]
  M6 --> M7[M7 Forced colours]
  M7 --> M8[M8 Gate pass]
```

### Epic

**Page composition** — the nine non-canvas screens plus the overview share a measure, a frame, a
column model and a density, so that using the same components becomes the same page. Maps to the
`docs/ROADMAP.md` theme that ADR-0145 opened; proposes **ADR-0146**.

**No `VITE_` feature flag** (ADR-0088 D1). The rollback is a commit boundary, and every milestone
below is independently revertible — which is a sequencing obligation, not a hope, and is why M1 and
M2 are constrained to one release (see _Sequencing_).

---

## Milestone 0 — Measure, and commit the conditions

**Outcome:** a committed baseline and a committed set of falsification conditions. Nothing about the
product changes.
**Ships dark: nothing is reachable and nothing is built.** This milestone exists because this
repository has eight consecutive recorded instances of a width expectation contradicted by its own
measurement, and because ADR-0143's entire finding was that a screen had never been photographed.
**Journey:** none — no user-facing capability. The journey lands with **M1**, the first milestone a
planner can see (ADR-0081 §2).

---

#### Feature: The M0 measurement

> **Description:** Photograph and measure every in-scope screen at 1280 / 1646 / 1920, establish the
> claims the spec marks `[TO MEASURE — M0]`, and commit `falsification.md` **before** any remedy
> exists.
> **Complexity:** M
> **Dependencies:** none
> **Risks:** the harness measures a fixture that is not the one in the screenshots → reuse
> `shoot.mjs`'s own sign-up + seed, as `measure-page-drift.mjs` already does (`:10-11`); a run left
> going while the next edit lands measures a half-applied tree (ADR-0099's recorded failure) → one
> sitting, tree verified clean, recorded in the output.
> **Testing requirements:** none — this milestone produces evidence, not behaviour.

##### Task M0-T1 — Re-shoot the nine screens and record the Explorer width

- **Description:** `pnpm --filter @repo/web shoot` at all three widths. Confirm the shot list already
  covers every in-scope screen (read: `shoot.mjs:425-430,432,647-654` covers clients, calendars,
  resources, members, recently-deleted, audit-log, project-detail, client-detail, my-activity — so
  `docs/TECH_DEBT.md` #319's class does **not** recur here, and saying so is part of the task).
- **Complexity:** S
- **Dependencies:** none
- **Risks:** the Explorer is a resizable drawer, so every `x` is conditional on a width the harness
  must record — `measure-page-drift.mjs:164-171` already does this; confirm it is in the output and
  do not compare two runs that disagree about it.
- **Testing:** n/a
- **Development steps:**
  1. Run the shoot at 1280 / 1646 / 1920; commit the contact sheet reference into `m0-measurement.md`.
  2. Record the Explorer width at each, at **both** its 200px and 420px extremes.
  3. Record, per screen: content width, page height, fold position of the first row, card fill ratio.

##### Task M0-T2 — Establish the five unverified claims

- **Description:** Answer each `[TO MEASURE — M0]` in the spec by running something.
- **Complexity:** M
- **Dependencies:** M0-T1
- **Risks:** a claim confirmed by reading rather than running is exactly ADR-0076 Class 3 → each
  answer names the command or the probe.
- **Testing:** n/a
- **Development steps:**
  1. **Recently deleted's clipped restore control** — is the ellipsis an ancestor `overflow-hidden`
     or `text-overflow` in the control? `Button`'s CVA base carries `whitespace-nowrap` and no
     `truncate` (`button.tsx:7`), so the cause is not in source and must be observed.
  2. **`w-px whitespace-nowrap` under `table-layout: auto`** — confirm a `fit` column resolves to
     its content width and surrenders surplus; and confirm what happens when the summed `fit`
     min-content widths exceed the container.
  3. **The `forced-colors` cascade question** (spec §4.7) — does an unlayered
     `@media (forced-colors: active)` block in `globals.css` beat Tailwind's layered
     `focus-visible:outline-none`? Author a throwaway block, measure in Chromium, record the answer.
     **This decides D5's shape and must not be reasoned about.**
  4. **Reflow floor** — `documentElement.scrollWidth` at 320px CSS width for all nine screens,
     **today**, so FC-6 has a baseline and a pre-existing failure is not mistaken for a regression.
  5. **The audit filter bar's overflow** — re-derive `AuditFilterBar.tsx:118-122`'s "~246px over at
     every width" against the current tree rather than quoting it forward.

##### Task M0-T3 — Commit `falsification.md`

- **Description:** Write FC-1…FC-8 with their baselines and withdrawal clauses, **before** M1 opens.
- **Complexity:** S
- **Dependencies:** M0-T1, M0-T2
- **Risks:** a condition written after the remedy is worth nothing (ADR-0142 D4) → this task is a
  merge gate on M1 starting.
- **Testing:** n/a
- **Development steps:**
  1. Write each condition with its baseline number and the instrument that judges it.
  2. State FC-6 as **non-negotiable and without a withdrawal clause** (spec §1.9).
  3. Record the D1 arithmetic table (spec §4.2) with the **measured** Explorer width substituted —
     at **both** 1646 and 1920, since the two behave differently and the first version of this spec
     generalised from the wrong one.

##### Task M0-T4 — Build the wrap/fit probe

- **Description:** Extend `measure-page-drift.mjs` (or add a sibling) to report, per table column:
  used width, content min-content width, and **whether any cell renders more than one line**.
- **Complexity:** M
- **Dependencies:** M0-T1
- **Risks:** a probe that reports zero findings because it selected nothing — the ADR-0093 /
  ADR-0108 shape → it carries a **pinned positive case**: it must report the two known wraps
  (Calendars `Working days`, Resources `Code`) on today's code, and the run that proves it is
  committed. A probe that cannot see today's defect cannot judge tomorrow's fix.
- **Testing:** verified red against the current tree, by construction.
- **Development steps:**
  1. Measure line count per cell via `getClientRects().length` against `lineHeight`.
  2. Assert the two known wraps appear; commit that output as the probe's own proof.
  3. Report per-column slack so FC-2 and the `fit` assignments can be judged.

---

## Milestone 1 — The measure and the frame

**Outcome:** every in-scope screen is the same width as the landing, and every list sits in a titled
box with a count.
**Entry point:** no new control — the capability is the screens themselves. A planner reaches it by
opening **Clients**, **Calendars**, **Resources**, **Recently deleted**, **Audit log** or **My
activity** from the Project Explorer; each now renders its rows inside a named section carrying a
count.
**Journey:** `apps/web/e2e-page-composition/composition.spec.ts` — **lands here, not at the gate
pass** (ADR-0081 §2). First step: open Clients, assert the rows are inside a `region` named
`Clients`, assert the section states a count, and assert the content width equals the overview's at
the same viewport. It grows through M2–M7.

---

#### Feature: One measure (D1)

> **Description:** `PageContainer`'s `default` is repointed to the existing `max-w-screen-2xl`
> (1488px content). **No new token.** `wide` is retired as a now-duplicate key; `narrow` and `full`
> survive as declared exceptions.
> **Complexity:** S–M (**smaller than before D1** — see _What the answers changed_)
> **Dependencies:** M0 complete and `falsification.md` committed
> **Risks:** the ceiling costs a screen width at some viewport (FC-3) → measured at all three widths
> before merge; a hard-coded `w-*` breaks reflow → the census forbids anything but `max-w-*`;
> retiring `wide` leaves two docblocks citing a name that no longer exists → corrected in the same
> commit (the ADR-0071 lesson).
> **Testing requirements:** unit (the surviving measures resolve), structural (M1-T2), FC-1 + FC-3 +
> FC-6 measured.

##### Task M1-T1 — Repoint `default`

- **Description:** `WIDTHS.default` becomes `max-w-screen-2xl`. One value.
- **Complexity:** S
- **Dependencies:** none (D1 is answered)
- **Risks:** **this reaches all 13 `PageContainer` files at once** (spec §3.1), including
  `plan-detail`'s not-found state and the staff console — intended, and measured at M1-T3 rather than
  assumed. **No token is declared**, so the ADR-0097 theme-contract gate is not engaged.
- **Testing:** unit on `PageContainer`; FC-1/FC-3 at M1-T3.
- **Development steps:**
  1. Change the value; update the docblock to say **why the default carries it** — ten screens got
     the narrow measure by saying nothing, which is the failure mode a call-site conversion leaves
     armed.
  2. Rewrite `narrow`'s stale docblock (`page-container.tsx:9-14` justifies it by the organisation
     overview, which no longer uses it; its real consumer is `staff.tsx:107`, a refusal page).
  3. Update `docs/DESIGN_SYSTEM.md` — a changed value, not a new concept.

##### Task M1-T1a — Retire `wide`

- **Description:** Delete the now-duplicate key and its two call sites.
- **Complexity:** S
- **Dependencies:** M1-T1
- **Risks:** two names for one value is the drift this epic removes → the key goes rather than
  becoming an alias; a docblock citing the retired name rots → both are corrected here.
- **Testing:** typecheck is the primary gate (the prop's union narrows); FC-1 must now hold for the
  overview and staff console, which were previously the exceptions.
- **Development steps:**
  1. Drop `width="wide"` from `OverviewScreen.tsx:180` and `staff.tsx:139`.
  2. Remove the key from `WIDTHS` and the prop union.
  3. Correct `page-grid.tsx:32` and `staff.tsx:210`, which both cite `width="wide"` by name.

##### Task M1-T2 — The measure census

- **Description:** A structural test asserting every route uses `PageContainer` at the default, that
  any explicit `width` is on a **named, reasoned** exception list, and that `/account` is on a
  **second** list of screens that deliberately opt out of the archetype entirely.
- **Complexity:** M
- **Dependencies:** M1-T1a
- **Risks:** a census that passes because it matched nothing — the ADR-0108 failure, where a
  "nothing is unclassified" assertion passed against a glob matching zero files → **pinned positive
  cases on both lists** (`staff.tsx:107` on the `narrow` list, `/account` on the opt-out list), each
  verified red.
- **Testing:** the test itself; verified red three ways.
- **Development steps:**
  1. Derive the roster from `src/routes/*.tsx` + `features/**/screens` rather than hard-coding it
     (ADR-0136's rule); assert it finds all **13** files (spec §3.1).
  2. Assert default-or-declared-exception; assert both exception lists are non-empty.
  3. Assert `/account` **does not** use `PageContainer` — turning its documented exception into a
     checked one. Its own comment records that its archetype adoption is currently ungated and can
     regress silently; this is the cheapest place to close that.
  4. Verify red: (a) a route with an undeclared `width`; (b) an empty roster; (c) `/account`
     converted to `PageContainer`.

##### Task M1-T3 — Measure FC-1, FC-3, FC-6

- **Description:** Re-run the instruments and record against the M0 baseline.
- **Complexity:** S
- **Dependencies:** M1-T1
- **Risks:** a regression at one width hidden by a gain at another → all three widths reported,
  monotonic non-regression asserted per screen per width.
- **Testing:** measurement recorded in `m1-measurement.md`.
- **Development steps:**
  1. Run drift + reflow probes at 1280 / 1646 / 1920 and at 320.
  2. Record the result **including any condition that failed**, before deciding what to do about it.

---

#### Feature: One frame

> **Description:** Six screens gain a `SectionCard`; `SectionCard` gains a count slot; `flush`
> becomes true full-bleed so a table and its heading share a left edge.
> **Complexity:** M
> **Dependencies:** M1-T1
> **Risks:** the count is fetched separately and disagrees with the rows → it comes from the same
> response (spec §4.8); a screen's existing suite breaks → the suites query by role and caption, so
> a frame with an accessible name should pass them **unchanged** — and any that does not is read as a
> finding, not fixed by relaxing the assertion.
> **Testing requirements:** unit per screen; FC-4 census; existing suites pass unchanged.

##### Task M1-T4 — `SectionCard` count slot and the `flush` inset fix

- **Description:** Add `count`; make `flush` remove the header's horizontal padding so heading and
  first cell align (spec §4.3).
- **Complexity:** M
- **Dependencies:** none
- **Risks:** `flush`'s two existing consumers (`client-detail.tsx:75`, `project-detail.tsx:118`)
  change appearance → that is the intent, and it is measured; the docblock's current claim that the
  table "has its own padding" is **false** and is corrected in the same commit rather than left.
- **Testing:** unit asserting heading and first-cell left edges align; a browser assertion, because
  jsdom has no layout and cannot see this at all.
- **Development steps:**
  1. Add `count`, rendered in the header, wired to the existing announcement hook — never a second
     live region.
  2. Change `flush`; correct the false docblock.
  3. Add the alignment assertion to the journey (it is a layout fact; only a browser can judge it).

##### Task M1-T5 — Frame the six unframed screens

- **Description:** Clients, Calendars, Resources, Recently deleted, Audit log, My activity each wrap
  their list in a `SectionCard` with a count. Filter rows move **inside** the section (spec §4.6).
- **Complexity:** M
- **Dependencies:** M1-T4
- **Risks:** boxing the filter bar separately, which `AuditFilterBar.tsx:57-62` explicitly rejected →
  one frame, not two; the reason is preserved in the new comment.
- **Testing:** per-screen unit; existing suites unchanged; FC-4.
- **Development steps:**
  1. Wrap each list; name each section; wire the count.
  2. Move each filter row inside its section.
  3. Add `page-frame.structural.test.ts` — derived roster, pinned positive case, verified red.

##### Task M1-T6 — The journey

- **Description:** New Playwright project `e2e-page-composition` + its CI step.
- **Complexity:** M
- **Dependencies:** M1-T5
- **Risks:** **a new Playwright config and CI step are themselves ADR-0105 triggers** — planned here,
  not discovered; `check:ci-roster` (ADR-0136) refuses a script without its roster entry, so both
  land in one commit. Locating a control by copy rather than by role breaks on the next label change
  (ADR-0091's recorded rule) → locate by role and accessible name.
- **Testing:** the journey is the test.
- **Development steps:**
  1. Add the config, the `test:e2e:page-composition` script, the CI step **and** the
     `ci-roster.json` entry together.
  2. Add the suite to `scripts/e2e-sweep.sh`'s derived list.
  3. First steps: framed rows, stated count, width parity with the overview, heading/cell alignment.

---

## Milestone 2 — The column model

**Outcome:** no cell wraps while its table has room. **This milestone may not be deferred past a
release boundary from M1** — see _Sequencing_.
**Entry point:** the same six list screens plus Members, Client detail and Project detail; a planner
sees `Working days` and `Code` on one line.
**Journey:** extends M1-T6 — assert no in-scope table cell renders more than one line at 1646.

---

#### Feature: `Column.width`

> **Description:** `DataTable` gains a three-value width discriminator; the four ADR-0145 M4-T2 fixed
> caps are replaced; `#335` is resolved so a caller can declare a width without restating padding.
> **Complexity:** L
> **Dependencies:** M0-T4 (the probe), M1 (the measure)
> **Risks:** `#335`'s conversion silently restores padding to the seven sites that deliberately omit
> it → every site is read and converted explicitly before the merge lands (ADR-0145 M4 declined this
> fix for exactly that reason, and this epic must not inherit the decision without re-reading);
> `w-px` behaves differently from expectation → M0-T2 step 2 settles it before this task opens.
> **Testing requirements:** unit on the primitive; FC-2 across every table at three widths; the
> ADR-0097 weight ratchet (FC-7) must not rise.

##### Task M2-T1 — Read and convert every `headClassName` / `cellClassName`

- **Description:** Census the estate's class overrides; convert the seven that omit `py-2`; then make
  `DataTable` compose with `cn` rather than replace with `??`.
- **Complexity:** M
- **Dependencies:** none
- **Risks:** the merge changes padding on a column nobody looked at → the census is exhaustive and
  committed; `docs/TECH_DEBT.md` #335 closes or is re-scoped with a reason.
- **Testing:** a structural test that no override restates the default; per-table unit assertions.
- **Development steps:**
  1. Enumerate every override (`ResourcesTable`, `CalendarsTable`, `RecentlyDeletedTable`,
     `AuditEventList`, `ActivitiesTable`, `DependencyTable`, `staff`, …).
  2. Convert each to a merge-safe form; record the seven `py-2` omissions and what each becomes.
  3. Switch the four `??` sites to `cn`; run the weight ratchet.

##### Task M2-T2 — Add `Column.width` and convert the six defect-bearing caps

- **Description:** Implement `fit` / `bounded` / `auto`; convert the caps on the four screens whose
  measure changes — `CalendarsTable.tsx:220`, `ResourcesTable.tsx:287,292,303`,
  `ProjectCalendarsSection.tsx:129`, `PlansTable.tsx:62`. Assign per spec §4.4.
- **Complexity:** M
- **Dependencies:** M2-T1
- **Risks:** a `fit` column whose content is genuinely unbounded truncates → the assignment table is
  reviewed per column and anything unbounded is `auto`; the responsive `hidden … lg:table-cell`
  columns must keep their breakpoint behaviour → asserted per column.
- **Testing:** unit; FC-2 at 1280/1646/1920; reflow at 320 unchanged.
- **Development steps:**
  1. Add the prop; document the three values and **why `w-px whitespace-nowrap`** rather than a
     `rem` cap — it is a function of content, so it survives a measure change, which is precisely the
     property the fixed caps lacked and which D1's wider measure exposes.
  2. Convert the six; **correct** `ResourcesTable`'s call-site comment rather than deleting it, so
     the next reader learns what changed and why.
  3. Re-run M0-T4's probe; the two pinned wraps must be absent, and
     `ProjectCalendarsSection`'s — which the first census missed and which is on a complained-about
     screen — must be checked explicitly rather than assumed to follow from Calendars.

##### Task M2-T2a — Convert the staff console's nine caps, pixel-unchanged

- **Description:** `staff.tsx:291,296,303,464,468,472,811,892,897` move onto the column model.
- **Complexity:** S
- **Dependencies:** M2-T2
- **Risks:** **these are not a defect today** — the console was already at `wide`, so they were
  measured against a 1438px table (ADR-0143) and are at their final width. Converting them is a cost
  this epic pays to avoid leaving one table in the product on the retired mechanism, which is how 15
  caps accumulated. The risk is a silent visual regression on a screen redesigned six weeks ago →
  **the acceptance condition is pixel-unchanged**, asserted, and any movement is a finding rather
  than an outcome.
- **Testing:** shot-diff of the staff console before/after at all three widths; two `break-all`
  columns (`md:w-96`, `md:w-80`) checked individually, since they are the ones a `fit` conversion
  would most plausibly change.
- **Development steps:** convert; shot-diff; record the result including any column that moved.

##### Task M2-T3 — Apply the `—` rule

- **Description:** `Description` leaves Clients and Calendars; `Group` leaves Resources; both become
  secondary lines present only when non-null. `Calendar` stays (rule 4).
- **Complexity:** M
- **Dependencies:** M2-T2
- **Risks:** removing `Group` loses the text carrier for tree nesting that
  `ResourcesTable.tsx:252-256` deliberately added for WCAG 2.2 → the secondary line **is** that
  carrier and the test asserting nesting is conveyed in text must pass unchanged, not be rewritten.
- **Testing:** unit per table; the existing nesting assertion passes unchanged.
- **Development steps:**
  1. Move each field to a secondary line under the row subject.
  2. Delete the column; assert the column set is static (does not vary with data).
  3. Record the rule in `docs/DESIGN_SYSTEM.md`.

---

## Milestone 3 — Filters and controls

**Outcome:** the audit filter bar reads as one designed control group; search fields stop absorbing
the row; the coverage disclosure looks like a control.
**Entry point:** **Audit log** — the `Outcome` options are visibly controls; and every list screen's
search field is the width of a search field.
**Journey:** extends M1-T6 — assert each `Outcome` radio has a visible boundary at rest.

---

#### Feature: A resting segmented control

> **Description:** `SegmentedControl` gains an unselected affordance so it does not read as text.
> **Complexity:** M
> **Dependencies:** none
> **Risks:** **this changes a shared primitive** — ADR-0111 §19.13 applies. The semantics must not
> change: roving `tabindex`, Arrow/Home/End, focus-follows-selection, `aria-checked`, and the
> unselected-group tab-stop rule (`segmented-control.tsx:123`) are all untouched, and the existing
> suite passes **unchanged** as the proof.
> **Testing requirements:** unit (appearance + unchanged keyboard model); contrast matrix; **review
> by `accessibility-reviewer` and `component-reviewer` before release, not at M8**.

##### Task M3-T1 — The resting treatment

- **Description:** Give the group a track and each option a boundary at rest, tokens only.
- **Complexity:** M
- **Dependencies:** none
- **Risks:** a new token pair that is not complete across the families it belongs to, or that is
  absent from `@theme inline` — ADR-0100 M4's defect, where a pair missing from `@theme inline`
  painted nothing in a real browser while the contrast gate stayed green → reuse `ToggleChip`'s
  existing `border-input`, which is already complete and already gated, rather than minting one.
- **Testing:** `token-contrast.test.ts` (1.4.11 at 3:1 for a control boundary); a browser assertion
  that the rendered boundary is non-zero.
- **Development steps:**
  1. Add the resting boundary reusing existing tokens; no colour literals.
  2. Assert the keyboard model is byte-identical by running the existing suite unchanged.
  3. Send to the two reviewers **before** merging.

##### Task M3-T2 — Bound `SearchField`

- **Description:** A default maximum measure on the field, overridable.
- **Complexity:** S
- **Dependencies:** none
- **Risks:** a fixed width breaks the wrap at narrow widths → `max-w-*` only, never `w-*`.
- **Testing:** unit; reflow at 320 unchanged.
- **Development steps:** add the default; remove `flex-1` from the three call sites that pass it;
  re-measure the filter rows.

##### Task M3-T3 — The disclosure affordance

- **Description:** `CoverageDisclosure` gains a chevron that reflects `aria-expanded`.
- **Complexity:** S
- **Dependencies:** none
- **Risks:** touching the accessible mechanics, which are correct and were established by a CDP
  measurement recorded in the docblock → **only** the visual layer changes; `aria-expanded`,
  `aria-controls` and the `sr-only`-not-`hidden` rule are untouched, and its existing test passes
  unchanged.
- **Testing:** unit; the existing `coverage-disclosure.test.tsx` passes unchanged.
- **Development steps:** add the icon; assert rotation follows state; assert the a11y assertions are
  untouched.

---

## Milestone 4 — Members

**Outcome:** Members is two-column with richer sections (product-owner decision 3 — both).
**Entry point:** **Members** in the Project Explorer — a summary, a roster showing `Joined`, pending
invitations showing `Expires`, and a panel describing the roles.
**Journey:** extends M1-T6 — open Members, assert three named regions and the `Joined` column.

---

#### Feature: The Members composition

> **Description:** `PageGrid` layout; `joinedAt` and `expiresAt` rendered; a roles panel; a summary
> strip if it earns its place.
> **Complexity:** M
> **Dependencies:** M1, M2
> **Risks:** the invitations section must stay **omitted** for non-admins, not rendered empty
> (`members.tsx:15-19`, ADR-0082) → pinned by a test; a `narrow` section with one item reproduces the
> overview's ragged column → measured, and the roles panel exists partly to be an honest occupant.
> **Testing requirements:** unit; permission omission pinned; FC-8 (nothing pushed below the fold).

##### Task M4-T1 — Layout and fields

- **Description:** Wrap in `PageGrid`; Roster `wide`, Invitations + roles `narrow`; add `Joined` and
  `Expires`.
- **Complexity:** M
- **Dependencies:** M1-T4
- **Risks:** **none on the API** — `OrgMemberSummary.joinedAt` and `InvitationSummary.expiresAt` are
  already on the wire (`packages/types/src/index.ts:145`, `:101`), verified by reading the type. No
  backend work, no `database-architect`, no changeset for API surface.
- **Testing:** unit; existing members suites pass unchanged.
- **Development steps:** compose the grid; add the two columns as `fit`; render dates through the
  shared `formatTimestamp` helper, never a per-render `Intl` (ADR-0144's recorded finding).

##### Task M4-T2 — The summary strip, or not

- **Description:** Build the strip **only** if it says something the first page of rows does not.
- **Complexity:** S
- **Dependencies:** M4-T1
- **Risks:** a strip that restates what is visible is decoration and fails decision 4 → the test is
  explicit: on a two-member organisation it says nothing new, so it is withheld below a threshold or
  states composition only where composition is not visible.
- **Testing:** FC-8; unit on the threshold.
- **Development steps:** measure; build or withdraw; **record the withdrawal if it is withdrawn**,
  because a decision not to build is a result.

---

## Milestone 5 — The detail screens

**Outcome:** Client detail and Project detail describe their subjects.
**Entry point:** **Clients → a client** (subject facts beside the description; framed Projects with a
count) and **a project** (Plans, plus Calendars defaulting to the project's own with the inherited
count stated).
**Journey:** extends M1-T6 — follow a client link, assert the subject facts and the framed count.

---

#### Feature: Subject facts and the `PageHeader` aside

> **Description:** `PageHeader` gains an `aside` slot; the detail screens fill it.
> **Complexity:** M
> **Dependencies:** M1
> **Risks:** the aside re-creates the 267-vs-736px divergence `page-header.tsx:47-54` fixed → the
> description keeps `flex-1 max-w-prose`; the aside is a sibling with its own `shrink-0`.
> **Testing requirements:** unit; FC-1 unaffected.

##### Task M5-T1 — The `aside` slot

- **Complexity:** S · **Dependencies:** none
- **Risks:** an aside that wraps under the title at narrow widths and looks like a stray paragraph →
  it stacks below `md` deliberately and is asserted there.
- **Testing:** unit at two widths.
- **Development steps:** add the slot; document that it is for facts about the subject, not actions.

##### Task M5-T2 — D3: counts, measured first, no index unless demanded

- **Description:** Add `projectCount` / `planCount` to the existing reads — **after** measuring the
  aggregate. **Decided and in scope** (spec §1.10 D3).
- **Complexity:** M
- **Dependencies:** **`database-architect` engaged first (CLAUDE.md §19.3, unconditional)**
- **Risks:** an aggregate whose cost is assumed → measured against the seed catalogue's scale tiers
  with the bar committed **before** the run; an index proposed to make it index-only → weighed
  against ADR-0144's measurement, **default do not build**; the count absent on failure →
  **omitted, never `0`** (a zero is a claim, ADR-0126).
- **Testing:** API e2e; a committed measurement doc; **`api-reviewer`, `security-reviewer` and
  `backend-performance-reviewer` — now in scope rather than conditional**, since this ships the API
  change. Security's specific question: a count must not leak a resource's existence across an
  organisation boundary.
- **Development steps:**
  1. Run `database-architect` on the query shape **before** writing it; record its output **even if
     it is "no schema change"** — that is a decision, not a skipped step.
  2. Commit the cost bar; measure; decide. **Carry ADR-0144's reasoning, not just its citation**: an
     index is justified only if the measurement demands one _and_ it does not put a write-path cost
     on every recalculation (that epic measured HOT 28.4% → 0.0% and index growth +92% → +447%) to
     make a detail page's count cheaper.
  3. Update `docs/API.md` + OpenAPI + a changeset in the same PR.
  4. If the measurement fails the bar: **withdraw the counts** and enrich the detail screens from
     fields already on the wire. M5 survives without them.

##### Task M5-T3 — D2: the project's calendars

- **Description:** Default the section to the project's own calendars; state the inherited
  organisation count in a sentence; keep the full list one reveal away. **Decided** (spec §1.10 D2).
- **Complexity:** M
- **Dependencies:** none
- **Risks:** a reader concludes ADR-0053 M2's tier rule moved → **it did not, and the spec says so
  explicitly** (§4.6). That guarantee is about the **picker** never offering a calendar the write
  seam would 422, and **the picker's source is not changed by this epic**; only this section's
  default view is. That distinction is the acceptance condition, not a note.
- **Testing:** unit; the existing `ProjectCalendarsSection.test.tsx` passes **unchanged** where it
  concerns the picker — which is the proof the guarantee survived, rather than an assertion that it
  did.
- **Development steps:**
  1. Default to the project's own; add the reveal carrying its count.
  2. Assert the picker's source is untouched, by identity rather than by inspection.
  3. Note that this section also carries a converted cap (M2-T2) — the two changes land on the same
     component and must be measured together.

---

## Milestone 6 — Audit log and Recently deleted

**Outcome:** no permanently blank column; the blocked-restore explanation is legible.
**Entry point:** **Audit log** (a non-success outcome shows on its row; no `Outcome` header) and
**Recently deleted** (the "Restore X first…" control reads in full).
**Journey:** extends M1-T6 — assert no blank column header and an unclipped restore control.

---

#### Feature: Outcome on the row; restore legible

> **Complexity:** M · **Dependencies:** M2 (the column model), M0-T2 step 1 (the clipping cause)
> **Risks:** dropping the `sr-only` "Succeeded" is a silent WCAG regression → it is preserved and
> pinned by a test verified red against its removal.
> **Testing requirements:** unit; journey; a11y review.

##### Task M6-T1 — Fold `Outcome` into the row

- **Complexity:** M · **Dependencies:** M2-T3
- **Risks:** a badge that carries outcome by colour alone → text, per the existing comment's own rule
  (WCAG 1.4.1).
- **Testing:** unit for all three outcomes; the `sr-only` assertion verified red.
- **Development steps:** render non-success as a badge on the row; keep `sr-only` on success; delete
  the column; assert the announcement is unchanged.

##### Task M6-T2 — Fix the restore clipping

- **Complexity:** S · **Dependencies:** M0-T2 step 1
- **Risks:** fixing a symptom whose cause was guessed → M0 established it; the fix names it.
- **Testing:** browser assertion that the control's `scrollWidth ≤ clientWidth`.
- **Development steps:** apply the fix the measured cause implies; assert in the journey.

---

## Milestone 7 — Forced colours (`docs/TECH_DEBT.md` #324)

**Outcome:** a focus indicator exists under Windows High Contrast.
**Entry point:** no new control. **This milestone ships a mode, not a surface** — under
`forced-colors: none` the product is pixel-identical (FC-5's second clause). The capability is
reachable by any keyboard user in High Contrast on any screen.
**Journey:** a new `forcedColors: 'active'` Playwright **project** over the existing journey, plus
the focus assertions.

---

#### Feature: A visible focus indicator in forced colours

> **Complexity:** M
> **Dependencies:** M0-T2 step 3 (the cascade question, **answered by measurement**)
> **Risks:** the global block is defeated by Tailwind's layered utility and ships doing nothing,
> silently — the exact shape of a gate that passes for the wrong reason → M0 settles it in a browser
> first, and FC-5 is verified red against the current code; `!important` reached for before the
> cascade is understood → forbidden until M0's answer is in.
> **Testing requirements:** FC-5 across the primitive census; pixel-identity under
> `forced-colors: none`; **`accessibility-reviewer` + `component-reviewer` before release
> (ADR-0111 §19.13)**.

##### Task M7-T1 — The global block

- **Complexity:** S · **Dependencies:** M0-T2 step 3
- **Risks:** as above.
- **Testing:** FC-5, verified red first.
- **Development steps:** author the block at the placement M0 established; assert focus changes
  pixels under emulation; assert nothing changes without it.

##### Task M7-T2 — Migrate the primitives and census the convention

- **Complexity:** M · **Dependencies:** M7-T1
- **Risks:** a census that counts prose — the fourth recorded scan-matching-docblock failure in this
  repository → the scan strips comments, and a fixture pins that it does.
- **Testing:** `focus-ring.structural.test.ts`, verified red both ways.
- **Development steps:** pair the ring with a transparent outline in the shared CVA bases; add the
  census; close or re-scope `#324` with the measurement.

##### Task M7-T3 — The `forcedColors` project and its CI step

- **Complexity:** S · **Dependencies:** M7-T1
- **Risks:** **a Playwright config and CI step are ADR-0105 triggers** — planned, and
  `check:ci-roster` requires the roster entry in the same commit.
- **Testing:** the project is the test.
- **Development steps:** add the project, the script, the CI step, the roster entry and the sweep
  entry together.

---

## Milestone 8 — The gate pass

**Outcome:** the epic's own premise applied to itself.
**Entry point:** none — **this milestone ships no capability.** It runs the specialist reviews over
the combined diff, folds every blocking finding with a regression test verified red first, and
re-derives every headline number from the shipped code rather than carrying it forward.
**Journey:** the full `e2e-page-composition` suite, plus the `forcedColors` project, plus a sweep of
**every** journey — `scripts/e2e-sweep.sh`, because ADR-0091's recorded rule is that after any label
or layout change you run all of them, not the one CI happened to name.

---

#### Feature: Specialist review and re-measurement

> **Complexity:** L
> **Dependencies:** M1–M7
> **Risks:** a review that re-reads the epic's own claims instead of the code → each reviewer is
> asked to re-derive the numbers; a finding folded without a test → every fix carries one, verified
> red first.
> **Testing requirements:** all gates; all eight falsification conditions re-judged against the
> shipped code in **one sitting** (ADR-0143's recorded finding that this estate's baselines drift
> between sittings).

##### Task M8-T1 — Reviews

- **Complexity:** M · **Dependencies:** M1–M7
- **Development steps:** run `ux-reviewer`, `accessibility-reviewer`, `component-reviewer`,
  `performance-reviewer`, **`api-reviewer`, `security-reviewer` and `backend-performance-reviewer`**
  over the whole diff — the last three are **in scope, not conditional**, because D3 ships the API
  change. If M5-T2's measurement withdrew the counts, record that the three were run against a diff
  with no API change **and say so**, so "not run" cannot read as an oversight.

##### Task M8-T2 — Re-measure and close

- **Complexity:** M · **Dependencies:** M8-T1
- **Development steps:**
  1. Re-run every instrument in one sitting; report the run-to-run spread beside each delta, so a
     verdict is a verdict rather than noise (ADR-0128's `INDETERMINATE` lesson).
  2. Judge all eight conditions; **record any that failed and what was done** — withdrawn, or the
     bar re-argued, never quietly softened.
  3. File ADR-0146; add the `CLAUDE.md` §16 register entry **in the same commit** (ADR-0071 /
     `docs/TECH_DEBT.md` #291 — this register has missed an entry three times, and
     `check:adr-coverage` structurally cannot see that file).
  4. Set both artefacts' `**Status:**` headers to `Accepted — shipped (ADR-0146)`
     (`check:spec-status`, ADR-0131).
  5. Update `docs/DESIGN_SYSTEM.md`, `docs/UX_STANDARDS.md`, `docs/ROADMAP.md`, `docs/TECH_DEBT.md`;
     add a changeset.

---

## Sequencing & slices

| Slice       | Releasable alone?     | Note                                                                                   |
| ----------- | --------------------- | -------------------------------------------------------------------------------------- |
| M0          | yes — nothing changes | evidence only                                                                          |
| **M1 + M2** | **together**          | **See below. This is the one hard constraint in the plan.**                            |
| M3          | yes                   | primitive + three screens                                                              |
| M4          | yes                   | Members only                                                                           |
| M5          | yes                   | detail screens; D3's counts may be withdrawn on measurement without affecting the rest |
| M6          | yes                   | two screens                                                                            |
| M7          | yes                   | orthogonal; could ship first if #324 is urgent                                         |
| M8          | yes                   | no capability                                                                          |

**Why M1 and M2 may not be separated by a release — and why D1 tightens it.** Spec §1.2.4: widening
the page while ADR-0145 M4-T2's fixed `rem` caps remain gives the surplus to the uncapped columns and
leaves `Working days` at 176px and `Code` at 96px **still wrapping, next to more unused width**.
Shipping M1 alone makes the most visible complaint in the product owner's report _worse_.

D1 makes this **more** true, not less: 1488px at 1920 rather than the rejected proposal's 1352px is
**384px of new width instead of 248px**, so the interim state is more visibly wrong, and the caps now
sit on **four** screens rather than two (`ProjectCalendarsSection` and `PlansTable` put them on
Client and Project detail). They may be separate PRs; they may not be separate releases.

M7 is independent of everything else and could be pulled forward if `#324` is judged urgent on its
own merits — it is a level-A defect across the whole product.

**No feature flag** (ADR-0088 D1). Each milestone is one revertible commit boundary, and the
milestone order is chosen so that reverting any one of them leaves a coherent product.

## Definition of Done (per task)

Each task's PR satisfies the Feature Completion Criteria in [`docs/PROCESS.md`](../../PROCESS.md).
Specifically for this epic:

- `pnpm prepush` — **one command**, which derives its own gate list (CLAUDE.md §19.8).
- `scripts/e2e-local.sh web:page-composition` for any milestone touching a screen; `…api` for M5-T2.
- After **any** label or layout change, `scripts/e2e-sweep.sh` — not only the suite CI names.
- Existing suites pass **unchanged**. Any that does not is read as a finding before it is edited.

## Risks & assumptions (rollup)

| Risk / assumption                                                                                     | Likelihood | Impact                                         | Mitigation                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The widening expectation is contradicted by its own measurement (nine-for-nine in this register)      | **high**   | med                                            | FC-1/FC-3 committed at M0 with baselines. **The earlier framing of this row was wrong and is corrected**: it said the exposure was small because the ceiling is inert at the owner's 1646px Surface Pro. True at 1646 and **not at 1920**, which is where the screenshots came from and where D1 is worth 384px. Stated at both widths (spec §4.2) |
| The staff console's nine caps move visually under M2-T2a                                              | med        | med                                            | not a defect today; acceptance condition is **pixel-unchanged**, shot-diffed at three widths, any movement a finding                                                                                                                                                                                                                               |
| A census undercount re-scopes a milestone mid-flight (it already happened twice: 2 caps → 4 → **15**) | med        | med                                            | every census in this plan is derived and asserted against a count, never hand-listed (M1-T2, M2-T1)                                                                                                                                                                                                                                                |
| `w-px whitespace-nowrap` does not behave as expected                                                  | med        | **high** — the whole column model              | M0-T2 step 2 settles it in a browser before M2 opens; fallback is content-derived `ch` caps                                                                                                                                                                                                                                                        |
| The `forced-colors` block is defeated by the cascade and ships inert                                  | med        | **high** — a gate passing for the wrong reason | M0-T2 step 3; FC-5 verified red first                                                                                                                                                                                                                                                                                                              |
| `#335`'s merge silently restores padding somewhere                                                    | med        | med                                            | every override read and converted explicitly (M2-T1); ADR-0145 declined this for the same reason and the decision is re-taken, not inherited                                                                                                                                                                                                       |
| D3's aggregate is expensive at scale                                                                  | med        | med                                            | measured before it ships, bar committed first; withdrawable without affecting M5                                                                                                                                                                                                                                                                   |
| A screen's existing suite breaks                                                                      | med        | low                                            | suites query by role and caption; a break is a finding                                                                                                                                                                                                                                                                                             |
| Framing pushes the first row below the fold                                                           | med        | med                                            | FC-8; a strip that does not earn its place is withdrawn                                                                                                                                                                                                                                                                                            |
| Reflow regresses at 320px                                                                             | low        | **high** — merge requirement                   | FC-6 has no withdrawal clause; baseline at M0, re-judged at M8                                                                                                                                                                                                                                                                                     |
| Members' `narrow` column is as ragged as the overview's                                               | med        | low                                            | measured; the roles panel is an honest occupant                                                                                                                                                                                                                                                                                                    |
| The primitive changes break a keyboard model                                                          | low        | **high**                                       | ADR-0111 §19.13 — reviewed **before** release; existing suites unchanged as the proof                                                                                                                                                                                                                                                              |
| "Desktop" is later read as a reflow waiver                                                            | med        | **high**                                       | stated in the spec §1.9 and carried into `docs/UX_STANDARDS.md` at M8                                                                                                                                                                                                                                                                              |
