# Feature Spec: The page grid splits on the width it has (#333)

- **Status:** Draft — awaiting approval
- **Author(s):** feature-analyst
- **Date:** 2026-10-08
- **Tracking issue / epic:** `docs/TECH_DEBT.md` #333 (`:10387-10410`); named follow-up in
  `docs/specs/minimum-viewport/implementation-plan.md:358-359`
- **Roadmap link:** ADR-0179 follow-ups ("Next in line")
- **Related ADR(s):** ADR-0143 (`PageGrid`, span by demand), ADR-0146 D1 (one page measure),
  ADR-0179 D1 (1024 × 600 floor, Explorer at default width), ADR-0105 (why this is a spec).
  **A new short ADR is required** (§4.6): it changes the split rule of a shared primitive.

> **The brief's remedy does not fix the reported width, and this spec says so first.** "Two columns
> only from `xl`" means `@media (min-width: 80rem)` — **1280 px inclusive**
> (`node_modules/.pnpm/tailwindcss@4.3.3/.../theme.css:330`; `globals.css:41-43` overrides no
> default breakpoint, only adds `wide` = 100rem). So at the 1280 width #333 is about, an `xl:` split
> still gives two 466 px columns. Any viewport breakpoint would have to sit strictly above 1280, and
> every viewport breakpoint is blind to the Explorer, which moves the grid's width by up to 386 px at
> one window size (§3.1). This spec therefore recommends a **container query** instead.

## 1. Business understanding

### Problem

The organisation landing (`/orgs/$orgSlug`, `OverviewScreen.tsx:213-301`) pairs its four boxes in two
columns from Tailwind `md` (768 px) because that is `PageGrid`'s rule (`page-grid.tsx:54`). On a
narrower **designed** window (ADR-0179 D1: 1024 × 600 up, Explorer at 276) the columns are too narrow
for the rows: at 1280 a plan name wraps to two lines and its `project · client` subtitle truncates
mid-word (`m6-two-column.md:114-117`, `landing-1280.png`). At 1024 it is worse — about 338 px a column
(derived, §3.1) — and nothing has ever photographed it.

The primitive's own docblock already states the rule it fails: "two 366 px columns on a tablet would
reproduce the defect this component exists to avoid" (`page-grid.tsx:49-50`). It enforces that rule
with a **viewport** proxy chosen before the shell had a docked Explorer, so at the design floor it
produces columns narrower than the 366 px it calls a defect.

**Why now:** ADR-0179 made 1024–1440 the designed range, and its plan names this as a follow-up
(`minimum-viewport/implementation-plan.md:358-359`; `m0-measurement.md:175`, payoff list item 11).

### Problem statement re-verified (CLAUDE.md §19.11, "re-verify the PROBLEM")

| Claim in #333                                 | Re-checked against                                                                                                                            | Still true?                                                                                                                                                                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Columns are 464 px at 1280                    | `table-wrap-coverage/m0/README.md:54-58` (later sitting: grid 955, tracks **466 + 466**)                                                       | **Yes**, ±2 px. The m6 figure is section content width on build 0.132; the later figure is the track.                                                                                                                              |
| Split is `md:` in `PageGrid`                  | `page-grid.tsx:54` `grid grid-cols-1 gap-6 md:grid-cols-2`; `:74` `md:col-span-2`                                                             | Yes.                                                                                                                                                                                                                                |
| "Its other consumer is the staff console"     | `grep PageGrid apps/web/src`                                                                                                                 | **No — there are three consumers**: `OverviewScreen.tsx:213`, `features/staff/ui/staff-console-screen.tsx:261`, **and `routes/members.tsx:45`**. `table-wrap-coverage/m0/README.md:61-62` already said "all three of its consumers". |
| "Neither of the product owner's screens"      | Screens are now **1912 × 948** (monitor) and **1912 × 1114** (Surface, landscape) — ADR-0179:53, `minimum-viewport/feature-spec.md:409-410` | Yes, still unaffected (§2). Note #333 cites 1646 for the Surface; that figure is older. ADR-0179 also lists the Surface **upright at ~1272** (`minimum-viewport/feature-spec.md:422`), which **is** in the cramped band.             |
| "Below `md` the grid collapses to one column" | `page-grid.tsx:54`                                                                                                                            | Yes; and below 1024 is now outside the designed range anyway (ADR-0179 D1).                                                                                                                                                         |

### Users

Every organisation role lands here: Org Admin, Planner, Contributor, Viewer (the screen already
omits sections per role, `OverviewScreen.tsx:259`, `:285`). Org Admins also use Members. Staff use
`/staff`. External Guests never see any `PageGrid` screen. **No permission changes.**

### Primary use cases

1. A planner on a 13–14" laptop at Windows' default 150 % (~1272 wide, `minimum-viewport/feature-spec.md:425`)
   or a 1366 laptop opens the landing and reads it without names wrapping and subtitles truncating.
2. The product owner's Surface used **upright** (~1272 wide) shows the landing as one readable column
   rather than two cramped ones.
3. A planner who folds the Explorer gets two columns back at a width where they fit; one who drags it
   to its 420 px maximum gets one column where two would not.

### Expected outcomes — plain English, Explorer at its default width

| Window               | Landing today                     | Landing after                                                                                                | Members after                                                               | Staff console after |
| -------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ------------------- |
| **1024** (the floor) | two columns of ~338 px — cramped  | **one column, 699 px wide**; the four boxes stack and the main area scrolls                                  | three sections stacked                                                      | **one column**      |
| **1280**             | two columns of 466 px — cramped   | **one column, 955 px wide**; boxes stack at full height and the main area scrolls instead of each box       | stacked; the invitations table gets 955 px instead of 466                   | unchanged (two)     |
| 1366 laptop (~1358)  | two of ~505                       | two of ~505 (just over the threshold)                                                                        | unchanged                                                                   | unchanged           |
| 1440                 | two of ~545                       | two of ~545 — **unchanged** (under the default threshold; see CQ-2)                                          | unchanged                                                                   | unchanged           |
| **1912** (both of the product owner's screens, landscape) | two of 732 | **unchanged**, pixel for pixel                                                                    | unchanged                                                                   | unchanged           |

The staff console has no Explorer (`staff-console-screen.tsx:49-51`), so its grid is 277 px wider
than an org screen's at the same window (ADR-0146:40-41) and it splits from a ~1072 px window. Its
only change is in the 1024–1071 band.

### Success criteria (falsifiable)

- **SC-1** At 1280 × 800, Explorer default: the landing's four regions have **four distinct tops**
  (one column). At 1600 × 1000: **two** distinct tops (existing assertion, `overview.spec.ts:108-123`).
- **SC-2** At 1912 × 948 and 1912 × 1114: every landing track is **732 px** before and after (within
  1 px). Members and `/staff` tracks unchanged at 1912.
- **SC-3** At 1280 × 800 with the Explorer folded: two columns (tracks ≥ 500). At 1440 × 900 with the
  Explorer at 420: one column. (This is what a viewport breakpoint cannot do, so it is the test that
  the chosen mechanism is the one built.)
- **SC-4** No document overflow and no clipped section at 1024 × 600 on the landing and Members.
- **SC-5** Photographs at 1024, 1280 and 1440 show no two-line plan name caused by width in a paired
  column (product-owner judgement; this is the readability half no number captures).

### Open questions

- **CQ-1 (critical)** — change `PageGrid`'s rule for **all three consumers** (recommended), or add an
  opt-in prop so only the landing changes? See §4.5.
- **CQ-2 (critical, but answerable from M0's photographs)** — threshold: grid width **≥ 64rem**
  (columns ≥ 500 px; recommended) or ≥ 72rem (columns ≥ 564)?
- Defaults for everything else: no flag (ADR-0088 D1); rem-based threshold, so it scales with the
  reader's font size; the device checklist is not changed (§3.3).

## 2. Functional requirements

> **US-1** — As any organisation member on a window between 1024 and ~1350 px wide, I want the
> landing in one column, so that plan names and their subtitles are readable.
>
> - **Given** the Explorer at 276 and a 1280 window **when** I open the landing **then** the four
>   boxes stack in DOM order (Jump back in, Needs your attention, Where the work stands, Recently
>   changed) and none is height-capped.
> - **Given** a 1912 window **when** I open the landing **then** it is identical to today.

> **US-2** — As a planner who resizes or folds the Explorer, I want the landing to choose one or two
> columns from the room it actually has.
>
> - **Given** a 1280 window **when** I fold the Explorer **then** the landing becomes two columns
>   without reload; **when** I unfold it **then** it returns to one.

> **US-3** — As an Org Admin on a 1280 window, I want the Members page to stop squeezing the
> invitations table into half the page.
>
> - **Given** a 1280 window **when** I open Members **then** Roster, Pending invitations and "What each
>   role can do" stack at full width.

### Edge cases

- **Exactly at the threshold** (a 1024 px grid): two columns (min-width is inclusive).
- **Root font size raised** (e.g. 20 px): the threshold is 64rem = 1280 px of grid, so larger text
  stays single-column longer. That is the intent and matches `breakpoints.test.ts:40-45`'s convention.
- **Browser zoom on the 1912 monitor**: 150 % gives ~1275 CSS px → one column; 125 % gives ~1530 →
  two columns of ~589.
- **Single-column landing on a short window**: the M9 height cap is off below the split (as it is
  below `md` today, `OverviewScreen.tsx:229-231`), so `<main>` scrolls. Each `fill` body keeps its
  `tabIndex={0}` (`section-card.tsx:263`) although it no longer scrolls — an existing state, now
  reachable in the designed range; for the accessibility reviewer (Risk R4).
- **Empty organisation** branch (`OverviewScreen.tsx:197-211`) does not use `PageGrid` — unaffected.

### Permissions, validation, errors

None. Pure layout; no request, no data, no role logic changes.

## 3. Technical analysis

| Area           | Impact  | Notes                                                                                                                                                    |
| -------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend       | **low** | `page-grid.tsx` (container frame + split variant + `col-span-full`); `OverviewScreen.tsx:233` row-template variant; docblocks.                          |
| Backend / DB / API | none | —                                                                                                                                                        |
| Security       | none    | —                                                                                                                                                        |
| Performance    | none    | One extra `div` per grid; `container-type: inline-size` adds inline-size containment only. No JS.                                                        |
| Infrastructure | none    | No Playwright config or CI step added.                                                                                                                   |
| Testing        | low     | Unit structural tests; one journey assertion added to an existing suite; measurement harness re-run.                                                     |

### 3.1 The widths, verified

Grid width on an org screen = window − 277 (Explorer 276 + splitter; measured stage 747 at 1024,
`minimum-viewport/m0-measurement.md:47`) − 48 (`PageContainer` `p-6`, `page-container.tsx:62`),
capped at 1488 (`max-w-screen-2xl` less padding, `page-container.tsx:38`; ADR-0146:33). Track =
(grid − 24) / 2.

| Window | Grid (Explorer 276) | Track today | Grid, Explorer folded (34) | Grid, Explorer 420 | Source          |
| -----: | ------------------: | ----------: | -------------------------: | -----------------: | --------------- |
|   1024 |                 699 |         338 |                        942 | ≥ 672 (Explorer clamped by `STAGE_MIN_WIDTH`, `use-explorer-prefs.ts:38-44`) | derived         |
|   1280 |             **955** |     **466** |                       1198 |                811 | **measured** (`table-wrap-coverage/m0/README.md:56`) |
|   1440 |                1115 |         546 |                       1358 |                971 | derived (m6 measured 544) |
|   1646 |            **1321** |     **649** |                       1488 |               1177 | **measured** (`m0/README.md:57`; ADR-0146:40) |
|   1912 |                1488 |         732 |                       1488 |               1443 | **measured at 1920** (`m0/README.md:58`) |

The Explorer swing at one window is up to **386 px** of grid (folded vs 420; `use-explorer-prefs.ts:27-28`
and m0's measured spine). A viewport query cannot see it.

### 3.2 Two couplings the change must carry

1. **The landing's height cap is keyed to the same split.** `OverviewScreen.tsx:233`
   `md:grid-rows-[minmax(0,auto)_minmax(0,1fr)]` exists "only from `md`, where the grid is two
   columns" (`:229-231`). If the split moves and this does not, a single-column grid gets a two-row
   template, the second box is squeezed to its 220 px floor and the bottom two get implicit rows.
   Both must use one threshold, and a unit test reads both files to hold them together.
2. **`PageGridItem`'s `md:col-span-2`** (`page-grid.tsx:74`) would, in a one-column grid between
   768 px and the new split, create an implicit second column. It becomes `col-span-full`
   (`grid-column: 1 / -1`), which spans every explicit column in either mode and needs no breakpoint.
   Only Members' Roster uses `wide` today (`members.tsx:46`).

### 3.3 Component-contract and gate impact (ADR-0105)

- **Trigger crossed: a component's public contract.** `PageGrid` is a shared primitive
  (`components/ui/page/index.ts:32`). Under the recommended option its **behaviour** changes for all
  three consumers and its props gain one optional `frameClassName` (§4.4). That is why #333 could not
  be closed as a defect fix, and why this spec exists.
- **Not crossed:** no user-facing entry point is added (the landing exists), no Playwright config or
  CI step (one assertion joins `e2e-overview/overview.spec.ts`), no schema change.
- **Shared gate touched, not changed:** `container-query.structural.test.ts:41-44` already recognises
  `@5xl:` and forbids it beside `@container` on one element — the design puts them on different
  elements, as `stat-grid.tsx:80-94` does. `page-grid.structural.test.ts:53` still finds `grid-cols-1`.
- **Device checklist** (`docs/specs/gantt-coarse-pointer/device-checklist.md`): **not affected.** Its
  scope is the Gantt under finger and stylus (`:1-19`); no step opens the landing, Members or
  `/staff`. Nothing to update. The upright-Surface effect (one column at ~1272) goes in the hand-off
  as an observation, not into the sheet.

### Dependencies

None. ADR-0179 M4 does not have to land first; the two do not touch the same files.

## 4. Solution design

### 4.1 Architecture overview

```mermaid
flowchart TB
  subgraph Shell["App shell (h-dvh grid)"]
    EX["Project Explorer<br/>34 / 200–420 px"]
    subgraph MAIN["main (scroll container)"]
      PC["PageContainer p-6, max 1536"]
      PC --> FR["PageGrid frame<br/>@container (NEW)"]
      FR --> GR["grid: grid-cols-1<br/>@5xl:grid-cols-2 (was md:)"]
      GR --> I1["PageGridItem narrow"]
      GR --> I2["PageGridItem wide → col-span-full"]
    end
  end
  OV["OverviewScreen"] -. "rows: @5xl:grid-rows-[…] (was md:)" .-> GR
  EX -. "width changes the frame,<br/>the frame decides the split" .-> FR
```

### 4.2 Data flow

None: layout is resolved by the browser from the frame's inline size; no state, no JS, no query.

### 4.3 User flow

```mermaid
flowchart TD
  A[Open landing / Members / staff] --> B{PageGrid frame width ≥ 64rem?}
  B -- yes --> C[Two columns, spans by demand<br/>landing: top row fits, bottom row fills, boxes capped]
  B -- no --> D[One column in DOM order<br/>landing: no cap, main scrolls]
  C -- "fold Explorer / narrow window / raise font size" --> B
  D -- "unfold / widen / zoom out" --> B
```

### 4.4 Component changes

`components/ui/page/page-grid.tsx`:

- `PageGrid` renders **a frame `div` carrying `@container`** (plus `flex min-h-0 flex-col`) around
  the existing grid `div`. The grid becomes `grid min-h-0 flex-1 grid-cols-1 gap-6 @5xl:grid-cols-2`.
  `className` keeps its meaning (classes for the **grid**); a new optional **`frameClassName`**
  places the frame in its parent. The frame is a block or stretched flex child at all three call
  sites, so it takes its width from layout — not the auto-width flex-item case that collapsed
  `plan-facts.tsx:109-114`.
- `PageGridItem`: `md:col-span-2` → `col-span-full`.
- Docblock: the split is "the grid's own width ≥ 64rem, columns ≥ 500 px", replacing `:49-50`.

`features/overview/OverviewScreen.tsx`: `frameClassName="min-h-0 flex-1"`; the row template becomes
`@5xl:grid-rows-[minmax(0,auto)_minmax(0,1fr)]`; the `:229-231` comment is corrected.
`members.tsx` and `staff-console-screen.tsx` need **no edit** (their `className`/none still lands on
the grid). The stale `members.tsx:15-18` docblock ("`PageContainer`'s default is `max-w-6xl`") is
noted for the builder; it is unrelated and is not changed here.

### 4.5 Approach and alternatives (CQ-1)

| Option | What | Fixes 1280? | Sees the Explorer? | Other consumers | Verdict |
| ------ | ---- | ----------- | ------------------ | --------------- | ------- |
| **A. `xl:` viewport split** (the brief) | `md:` → `xl:` | **No** — `xl` is ≥ 1280 inclusive | No | All change at 768–1279 | Rejected: misses its own target |
| B. Higher viewport split (`wide:` 1600, or a new 81–85rem) | custom media query | Yes | No; a 1440 window with Explorer folded (1358 grid) goes to one column of 1358 px | All change | Rejected: a single column up to 1274 px wide at 1599 brings back the ~1104 px rows ADR-0098 narrowed (ADR-0146:18) |
| C. Landing-only class override | `className="md:grid-cols-1 @5xl:grid-cols-2"` on the landing | Yes | Yes, only if a container is declared by hand | None | Rejected: one-off styling (CLAUDE.md §12), fights the primitive's own rule through `twMerge`, and leaves `md:col-span-2` disagreeing |
| D. Opt-in prop (`split="md" \| "measure"`) | default unchanged | Yes, landing only | Yes | **Unchanged** | Acceptable fallback if CQ-1 is "landing only" |
| **E. Change the default to a container split (recommended)** | §4.4 | **Yes** | **Yes** | Members improves at 1024–1347; staff changes only at 1024–1071 | **Recommended** |

**Why E over D.** The primitive's docblock states a column-width rule (`page-grid.tsx:49-50`), and E
implements that rule rather than a proxy for it. The second consumer has measured evidence of the
same defect: Members' invitations table could not reach its min-content in a 466 px track at 1280
(`table-wrap-coverage/m0/README.md:66-74`) and still wraps there (`m5/verdict.md:41-44`). A prop
would keep a mode nobody wants and leave Members cramped. The cost is that `/staff` changes in
1024–1071, which no staff member has (staff tracks were never measured — `table-wrap-coverage/m2/README.md:133-137` —
so that is derived, not measured).

**Threshold (CQ-2).** Any threshold leaves either narrow pairs or a wide single column:

| Container threshold | Narrowest pair | Widest single column | Window where the landing splits (Explorer 276) |
| ------------------- | -------------: | -------------------: | ---------------------------------------------: |
| `@4xl` 56rem        |            436 |                  895 | ~1221 — narrower than the cramped 466; rejected |
| **`@5xl` 64rem**    |        **500** |             **1023** | **~1349**                                       |
| `@6xl` 72rem        |            564 |                 1151 | ~1477                                           |

`@5xl` keeps the widest single column between ADR-0098's accepted 846 and the 1104 it rejected;
`@6xl` would put 1440 laptops into one 1115 px column. M0's photographs at 1358 and 1440 settle
whether 500–545 px pairs read well; if they do not, `@6xl` is the fallback.

### 4.6 ADR

**Required, short** — "A page grid splits on the width it has". Outline:

- **Context:** `PageGrid` split by viewport (`md`) while ADR-0179 put a 34–420 px Explorer beside every
  org screen; columns of 338 px at the floor, under the primitive's own 366 px defect line.
- **Decision:** the split is a container query on the grid's own frame at 64rem; `wide` spans
  `col-span-full`; a consumer that keys anything else to the split uses the same variant, held by a test.
- **Alternatives:** A–D above.
- **Consequences:** three consumers change below ~1350 px; `/staff` in 1024–1071 only; the landing's
  height cap is off below the split; amends ADR-0143 D3's mechanism, not its span-by-demand rule.

No flag (ADR-0088 D1): the rollback is the commit.

### 4.7 Database / API changes

None.

## 5. Links

- Implementation plan: [`./implementation-plan.md`](./implementation-plan.md)
- Docs updated by the change: `docs/TECH_DEBT.md` #333 (closed), `docs/specs/minimum-viewport/implementation-plan.md:358`
  (marked taken), `docs/specs/organisation-landing-portfolio/m6-two-column.md` §4 (a forward note),
  `docs/COMPONENT_LIBRARY.md` / `DESIGN_SYSTEM.md` if either states the `md` split, CLAUDE.md §16
  (one line for the new ADR).
