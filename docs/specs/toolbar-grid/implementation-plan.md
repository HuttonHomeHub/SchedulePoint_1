# Implementation Plan: The toolbar as a grid: dividers, switches and shared columns

- **Feature spec:** [`feature-spec.md`](feature-spec.md)
- **Status:** Accepted — shipped (ADR-0189). Approved 2026-10-12 by the product owner (CQ-1 (a), CQ-2 (a), CQ-3 (a)); built as M0-M3 and M5, M4 (shared columns) withdrawn by the owner after M0; signed off 2026-10-12
- **Owner:** web

> **Owner decisions after M0 (2026-10-12).** M0 fired two stop rules and the owner answered both:
>
> 1. **The shared column is dropped.** It fits only at 2160 px and wider (3 of 12 pointer-stage cells), and both of
>    the owner's screens are 1912 wide. Requirement 3 (shared columns), §4.2, §4.5, the `leadColumn` prop, every
>    column success criterion and milestone **M4** are withdrawn. They stay below as history; they are not built.
> 2. **The gear and the D-4 inset rules apply from 79 rem (1264 px) up only.** Below that, the gear stays after
>    Earned value and the Author group has no extra rules, so at 1024 fine every row keeps today's line count in
>    every state, Link armed included (DO has 5.2 px free there; the gear costs 12 px and the rules 24 px, measured,
>    M0). "Move gear on big only" was the owner's answer; the rules follow it because they break the same floor.

## Breakdown

The three critical questions in the spec (CQ-1 search outline, CQ-2 locked Author outline, CQ-3 column against
command) are **gates**. A milestone does not start until its gate is answered. M0 needs none of them.

```mermaid
flowchart LR
  M0[M0 Measure: column fit, widths, contrast, photos before] --> M1
  Q2[[CQ-2 locked Author]] --> M1[M1 Dividers replace boxes; row marks and ring gone]
  M1 --> M2[M2 Switches and joined units]
  Q1[[CQ-1 search outline]] --> M2
  M2 --> M3[M3 Stray bits and quiet icons]
  M3 --> M4[M4 Shared columns]
  Q3[[CQ-3 column vs command]] --> M4
  M4 --> M5[M5 Photographs, ADR, docs, close-out]
```

### Epic

**The toolbar as a grid.** The command deck keeps every command, row and keyboard behaviour. It loses its
decorative boxes and stray marks, gains switch and joined shapes for the controls that are one unit, and lines its
two rows up on a shared column. Roadmap theme: UI consistency, following ADR-0185.

**For every milestone:**

- No flag (ADR-0088 D1). Each milestone is a commit boundary and names its entry point (ADR-0081).
- The **builder** agent implements. No schema, so the database-architect is not involved.
- Run `pnpm prepush`, plus `scripts/e2e-local.sh web:<suite>` for every changed journey, before pushing.
- **Any change to a promoted control's width or a row's free width re-takes
  `promotion-widths.{fine,coarse}.json` and re-derives `promotion-ladder.ts` in the same PR.** This uses the
  ADR-0185 M5 procedure (two harness runs, `measure-toolbar/promotion-widths.mjs`). Without it, the SC-18 (a)
  journey in `e2e-promotion` fails CI, because its tolerance is 2 px. This affects M1, M2, M3 and M4.
- Add a `@repo/web` changeset for each user-visible milestone.
- Re-read every `file:line` before using it. They were read on 2026-10-12.

**The common entry point.** Every user-facing milestone is reached the same way: open any plan; the command deck is
the band under the header. No new entry point is created.

---

### Milestone M0: Measure (ships dark)

**Outcome:** `docs/specs/toolbar-grid/m0-measurement.md`, a go or no-go, and the "before" photographs.
**Result (2026-10-12):** done. The record is [`m0-measurement.md`](m0-measurement.md). **Stop rules 1 and 3 fire** (Link
armed misses its line at 1024 fine once the gear moves; the shared column fits at no stage on today's tree and at
three of twelve after M1 to M3), and rule 2 sets D-1 to `'roomy-fine'`. **No-go for M1 to M4 as specified until the owner
answers the two questions in `m0-measurement.md` §10.**
**Entry point:** `Ships dark: a measurement record and a harness spec.`
**Journey:** none (a harness, ADR-0081 §3).

#### Feature: the M0 record

> **Description:** take every reading the later milestones depend on, before any code changes.
> **Complexity:** M
> **Dependencies:** none
> **Risks:** the harness measures the wrong state → it uses the M5/M6 fixture (long plan name, a conflict, a peer
> who can hold the pen) and every state listed below.
> **Testing requirements:** none (a harness is not a gate).

##### Task M0-T1: the harness and readings (≈ one PR)

- **Description:** `apps/web/measure-toolbar/toolbar-grid-m0.spec.ts` in the existing **non-CI**
  `playwright.measure-toolbar.config.ts`.
- **Complexity:** M
- **Dependencies:** none
- **Risks:** a cross-sitting reading → readings at the same cell are taken in one sitting (CLAUDE.md §17's canvas
  lesson: a reading taken in one sitting is not comparable with one from another).
- **Testing:** none.
- **Cells:** 1024 × 600, 1280 × 800, 1440 × 900, 1600 × 900, **1646 × 1097**, **1912 × 1080**, 2160 × 1200,
  2560 × 1440, and 640 × 480 for the scroll line. **Both pointers.**
- **States:** pen held; pen not held; a cycling conflict read-out; a peer holding the pen; Add armed with its longest
  label ("Adding Finish milestone", with no colon: measured, M0); Link armed; Gantt view.
- **What it reads:**
  1. **Lead group widths** (View, Author) and the free gap per row, per cell, pointer and state.
  2. **Column fit:** at each stage, `max(View, Author)`, the pad the narrower row needs, and that row's worst-state
     free width after promotion less `safetyPx`. **Does the column fit, stage by stage?**
  3. **Prototype costs** (a local, uncommitted branch with each change alone):
     - group gap 8 → 24 px from 79 rem;
     - Baseline's word (from 79 rem);
     - Colour caption `text-xs` → `text-sm`;
     - the undo track, and Recent edits' glyph swap;
     - "Add:" dropped from the milestone labels;
     - the gear moved to the row's end.
  4. **Floor check:** with every prototype on, is each row still one line at 1024 fine in every state, and ≤ 4 lines
     on touch?
  5. **Today's contrast**, computed from the tokens: pill, hairline, ring, search outline. Also P1 to P7 as
     proposed.
  6. **Forced colours today:** is the chosen Diagram | Gantt segment distinguishable? (It decides how much SC-5's
     forced-colours case has to add.)
  7. **Photographs, before:** 1024 × 600, 1280 × 800, 1646 × 1097 and 1912 × 1080, both pointers, pen held, pen not
     held, conflict, peer's pen.
- **Run with:**
  `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome DATABASE_URL=postgresql://app:app@localhost:5432/app_test pnpm --filter @repo/web measure:toolbar -- toolbar-grid-m0`
  (the ADR-0185 M0 invocation; confirm the browser path still exists).
- **Development steps:**
  1. Write the harness and run it twice.
  2. Write the record with **§0 "what contradicts the spec"** first.
  3. Replace every **estimate** in the spec with a reading.

##### Task M0-T2: premises and the stop rules (same PR)

1. **Floor:** if any prototype makes a row miss one line at 1024 fine in any state, **stop and ask**. Do not compact
   another item.
2. **Baseline on touch:** if LOOK wraps at coarse 1280 with a conflict and the word showing, D-1 falls back to
   `'roomy-fine'`. Record which.
3. **Column:** list the stages where it fits. If it fits at **no** stage on either pointer, **stop and ask**: the
   owner's third requirement cannot be met as specified.
4. **Ladder moves:** list every promoted entry whose stage would move when the widths are re-taken.
5. **Suite impact:** every test that reads a pill, a row mark, the ring, the undo order or the caption size, with
   `file:line`.

---

### Milestone M1: Dividers replace boxes

**Outcome:** groups are split by dividers and space. No pills, no row marks, no Export/Share ring.
**Entry point:** any plan → the command deck.
**Journey:** `e2e-workspace-fit/command-surface.spec.ts`, new case "no group paints a box, and no divider starts or
ends a line, in every state, at every cell" (both pointers).
**Gate:** CQ-2 answered.

#### Feature: group dividers

> **Description:** R1 and the deletions in spec §4.4.
> **Complexity:** M
> **Dependencies:** M0
> **Risks:** the line-start clip hides something real → only pseudo-elements sit outside a row's box; menus,
> popovers and tooltips are portalled (spec §4.4). The row seam below 1024 moves to a `border-l` (verified in
> `narrow-shell.spec.ts`). Safari's `overflow: clip` is 16+, inside the Chromium-first envelope (CLAUDE.md §17).
> **Testing requirements:** unit, structural, contrast pairs P1 and P2, and the journey above.

##### Task M1-T1: the divider and the deletions (≈ one PR)

- **Description:**
  - Add `DECK_GROUP_DIVIDER` to `toolbar-styles.ts`.
  - Delete `DECK_GROUP_PILL`, `DECK_CLOSING_SECTION` and `DECK_ROW_MARK`. Delete `DECK_GROUP_PILL_LOCKED` if CQ-2 is
    (a); under (b), keep it as a dashed outline that applies only while the pen is not held.
  - In `Deck.tsx`: give every group except the first on its row a leading divider; give each row
    `overflow-x-clip`; use group gap 8 px, and 24 px from `@roomy/deck:`; move the scroll-line row seam to the second
    row's `max-lg:border-l`; delete the `Eye`/`Wrench` imports.
  - Correct the docblocks that describe the pill, the mark and the ring (`Deck.tsx:89-94`, `:387-394`, `:432-450`,
    `:489-491`; `toolbar-styles.ts:114-134`, which says "one seam vocabulary"; there are now two marks, and why).
- **Complexity:** M
- **Dependencies:** M0
- **Risks:** the floor loses its reserve → the wider gap is from 79 rem only, and M0-T2 item 1 is the stop rule.
- **Testing:**
  - `deck-seams.structural.test.tsx` rewritten: it refuses the four deleted constants, refuses a group fill or
    border, and requires the row clip.
  - `toolbar-styles.test.ts`: drop the locked-pill forced-colours case under CQ-2 (a).
  - `Deck.test.tsx`: no `[data-deck-row-mark]`; one divider between each pair of adjacent groups.
  - `token-contrast.test.ts`: P1 (≥ 2:1) and P2 (the divider outranks the rule).
  - The journey above, **verified red** by removing the clip (ADR-0110): touch 1024 must then show a leading divider.
- **Development steps:**
  1. Constants and `Deck` changes.
  2. Tests, red first for the clip.
  3. Re-take `promotion-widths.*.json` (the gap changes free widths from 79 rem) and re-derive the ladder.
  4. Update the `command-surface.spec.ts` cases that named the pill or the mark.
  5. Run `e2e-workspace-fit`, `e2e-promotion`, `e2e-narrow-shell` and `e2e-toolbar` locally.
  6. Changeset.

> **M1 status (2026-10-12): built on `feat/toolbar-grid-m1`, not yet merged.** Three things differ from the
> text above, each found by a journey. (1) A **trailing group that wraps alone** is right-aligned, so the row's
> left clip cannot hide its leading divider; its divider is drawn by an empty `aria-hidden` flex item before it
> (`DECK_TRAILING_SPACER`) whose right edge is the row's right edge when the group wraps. (2) The clip is
> `overflow: clip` on both axes with `overflow-clip-margin: 5px` (`deck-row-clip`), not `overflow-x-clip`: the
> forced-colours focus outline reaches 4 px, the margin applies only when both axes clip, and the dividers hang
> past it (`e2e-workspace-fit/deck-focus-ring.spec.ts`). (3) Every group stays `relative` after the pill goes,
> or its `sr-only` spans escape the scrolling line below `lg`. Widths were re-taken: coarse L3 and L4 swap
> stages (L3 90 to 135 rem, L4 135 to 90 rem), nothing else moves.

---

### Milestone M2: Switches and joined units

**Outcome:** Colour and Diagram | Gantt look like switches. Undo, Redo and Recent edits are one unit. The search field
is recessed.
**Entry point:** any plan → the command deck (Colour on the LOOK row from its stage; Diagram | Gantt in the header;
undo on the DO row).
**Journey:** `command-surface.spec.ts`, new case "a choice of one is a track with one raised member, and the roving
walk keeps its stop count", plus a new case in `e2e-forced-colors/`.
**Gate:** CQ-1 answered.
**Before release:** **accessibility-reviewer and component-reviewer run on the built branch** (CLAUDE.md §19.13). They
check: the wrappers inside the roving container; focus visibility on a raised member; the Redo / Recent edits order;
forced colours.

#### Feature: clusters and tracks

> **Description:** R2 in spec §4.4.
> **Complexity:** L
> **Dependencies:** M1
> **Risks:**
>
> - A wrapper enters the roving walk → it carries no `data-toolbar-focusable`, no role and no tabindex. A
>   structural test pins this, and the existing roving-walk journey must pass unchanged.
> - A member shrinks below 36 / 44 px → the raised fill is drawn inset inside the member's box (D-7). The 24 × 24
>   and 44 × 44 sweeps must pass unchanged.
> - The selected underline and the inset fill compete for `box-shadow` → the builder composes them in one value, or
>   draws the fill with `background-clip`; the component reviewer checks.
>   **Testing requirements:** unit (`toolbar-registry`, `Deck`, `Toolbar`), structural, P3 to P7, the journeys,
>   forced colours.

##### Task M2-T1: the registry and primitive support (≈ one PR)

- **Description:** add `cluster` to `ToolbarItem` and `PromotableEntry`, and pass it through `derivePromotedItems`.
  `defineToolbar` refuses a non-contiguous cluster or one that spans sections. `Deck` and `Toolbar` wrap clustered
  runs in a `<span>` styled `TOOLBAR_TRACK`. `switch` members paint the raised `selected` fill inside their box.
  `Toolbar`'s segment wrapper takes `TOOLBAR_TRACK` **and keeps its `role="group"` and its name** (review B2). A raised
  member takes `forced-colors:bg-[Highlight]` and `forced-colors:[color:HighlightText]` with
  `forced-color-adjust: none` (a border would move the box; the opt-out is what stops the UA's `Canvas` backplate).
- **Complexity:** L
- **Dependencies:** M1
- **Risks:** as above.
- **Testing:** `toolbar-registry.test.ts` (contiguity, sections); `Deck.test.tsx` and `Toolbar.test.tsx` (the wrapper
  has no role, name or tabindex; stop count unchanged); `plan-mode-segments.structural.test.ts` still passes.
- **Development steps:**
  1. Registry types and checks.
  2. Rendering in `Deck` and `Toolbar`.
  3. `TOOLBAR_TRACK` and the raised treatment in `toolbar-styles.ts`.
  4. Tests.
  5. Update `COMPONENT_LIBRARY.md` for the new field.

##### Task M2-T2: the uses (≈ one PR)

- **Description:**
  - **Colour set:** `cluster: switch` (`promotion-entries.tsx:133-152`); its caption at `text-sm` muted
    (`toolbar-promotion.tsx:196-204`).
  - **Link "Type" set:** `cluster: joined` (D-3).
  - **Undo, Redo, Recent edits:** `cluster: joined`; order 8 / 9 / 10 (`tsld-toolbar-items.tsx:2571-2612`).
  - **Search field:** outline per CQ-1, via a token value change if (a).
  - **Device sheet:** one item in `device-checklist.md` (tap Undo, Redo, Recent edits and the three Colour options
    ten times each, tablet posture), with a note in its header.
- **Complexity:** M
- **Dependencies:** M2-T1
- **Risks:**
  - The reorder breaks journeys that arrow across undo → M0-T2 item 5 lists them; update them in this PR.
  - Changing `--chrome-input` reaches the other chrome fields (the organisation switcher, any chrome input) → if
    CQ-1 is (a), scope it to the deck's search field with its own class, or accept the wider change and photograph
    it. The builder records which.
- **Testing:** `tsld-toolbar-undo-redo.test.tsx` (order, cluster); P3 to P7 in `token-contrast.test.ts`; the
  journeys above; `e2e-forced-colors`.
- **Development steps:**
  1. The item changes.
  2. Re-take `promotion-widths.*.json` (caption and track widths) and re-derive the ladder.
  3. Run the suites locally, including `e2e-forced-colors`.
  4. Accessibility and component reviews on the branch, then fold their findings.
  5. Changeset.

**M2 status (2026-10-12): built on `feat/toolbar-grid-m2`, from M1's head `06bfd80e`; the two reviews in step 4 have not
run yet.** What shipped, and where it differs from the text above:

- **`cluster` and `ClusterTrack`** (`toolbar-registry.ts`, `ClusterTrack.tsx`, `toolbar-styles.ts`:
  `TOOLBAR_TRACK`, `TOOLBAR_TRACK_SWITCH`). The wrapper is a plain `<span>`; a set's caption rides inside one
  non-wrapping unit with its track (the review's optional nowrap unit, taken). `Toolbar`'s `Diagram | Gantt` wrapper
  keeps `role="group"` and `aria-label="Plan view"` and is asserted to (`toolbar-segments.test.tsx`).
- **Colour is a `switch`, the Link "Type" set is `joined`, Undo / Redo / Recent edits is `joined` in that order**
  (`promotion-entries.tsx`, `tsld-toolbar-items.tsx`: orders 8, 9, 10). **The `History` glyph on Recent edits is M3-T1's,
  not M2's, and was not built here.**
- **The search outline** is `--chrome-input-quiet` (`oklch(0.53 0.02 264)`, CQ-1 (a)), **scoped to the deck's search
  field with its own token** rather than changing `--chrome-input`: that token is also every other chrome field's outline
  and the segmented control's option boundary, none of which was photographed.
- **Forced colours differ from the plan's text**: `Highlight` / `HighlightText` with `forced-color-adjust: none`, not a
  border (see the spec's R2). Found by looking at the first build: without the opt-out the chosen label disappeared.
- **Citation fixed:** ADR-0119 D2 is the all-or-nothing partition rule; the flat-set decision is #154
  (`promotion-entries.tsx:130-134`). (The text this plan was reviewed against carried the wrong one; it is not in this
  file as written, and the spec's D2 line now names both.)
- **Widths re-taken** (`promotion-widths.{fine,coarse}.json`, two harness runs): Colour's caption +5.9 px, Link "Type"'s
  +4.4 px, the DO row 6 px narrower (the undo track). **No ladder move.** One thing the plan did not foresee: the harness
  summed a set's member rects and added `itemGapPx` (4 px) between them, but a track joins its members with 1 px, so a
  set in a track was charged 3 px per join too much. Left alone, that made `L6` (Has conflict only) miss coarse 2160 by a
  few pixels while SC-18 (b) found it would fit. `promotion-widths.mjs` now charges the track at the width the browser measured for its
  `[data-toolbar-cluster]` wrapper (recorded as `clusterWidths`, replacing a declared join count), and `promotion.spec.ts`
  SC-18 (a) both counts that wrapper as one flex item and asserts it is its members' widths plus 1 px per join. (The first
  version declared the saving in the harness and subtracted the same constant in the spec, so the two cancelled and a track
  regressed to `gap-1` stayed green while the row overfilled by about 6 px per set; verified red by making that change.)
  Colour's caption grew +5.9 px (`text-xs` to `text-sm`) and the joins saved about 6 px, so the net is near zero and neither
  hides the other. With that the ladder is
  unchanged.
- **Journeys:** `command-surface.spec.ts` gains "a choice of one is a track with one raised member…" (fine and touch);
  `deck-tracks-forced-colors.spec.ts` (in `e2e-workspace-fit`, with `forcedColors` as a per-test option) holds that the
  chosen and unchosen member differ and has the `forcedColors: 'none'` control. No journey arrows across Undo's old order
  (`e2e-undo` finds the controls by name), so none needed editing.

---

### Milestone M3: Stray bits and quiet icons

**Outcome:** the remaining stray bits are explained, and icons are a step quieter than labels.
**Entry point:** any plan → the command deck.
**Journey:** `command-surface.spec.ts`: the "icon-only" case (`:1323`) now names three items; the label-in-name sweep
(`:1675`) covers Baseline, Start milestone and Finish milestone; a new case "Settings… is the DO row's last control";
a new case for SC-12 (the pen is the only saturated control at rest, at 1912).

#### Feature: stray bits

> **Description:** R3 in spec §4.4, except the items done in M1 and M2.
> **Complexity:** M
> **Dependencies:** M2
> **Risks:**
>
> - Baseline's word wraps a touch row → D-1's fallback to `'roomy-fine'`, decided at M0.
> - `groupTail` sorts wrongly against a derived item (Share… sorts at `trigger.order + rank / 100`,
>   `toolbar-promotion.tsx:207-216`) → `groupTail` is a separate section after every member section, not an `order`
>   value, so it cannot tie.
>   **Testing requirements:** unit, structural, journeys.

##### Task M3-T1: labels, glyphs and placement (≈ one PR)

- **Description:**
  - `visibleLabel` on the lens promotion record, and **Baseline** with `'roomy'` (`tsld-toolbar-items.tsx:359-371`).
  - `visibleLabel` "Start milestone" / "Finish milestone" (`promotion-entries.tsx:265-285`).
  - `History` glyph on Recent edits (`:2522`). Register it in `scripts/dependency-claims.json` if a docblock asserts
    it exists.
  - New registry fields `ruleBefore` (on Add and on Undo) and `groupTail` (on the gear). `Deck` honours both.
  - Record the owner's 2026-10-12 reversal in the Baseline docblock, which today says "Icon-only at every width (M6,
    owner decision 2026-10-10)".
- **Complexity:** M
- **Dependencies:** M2
- **Risks:** as above.
- **Testing:** `toolbar-registry.test.ts` (`groupTail`, `ruleBefore`); `Deck.test.tsx`; `roomy-items.structural.test.ts`
  (Baseline is `'roomy'`); the journeys above.
- **Development steps:**
  1. Fields and rendering.
  2. Item changes.
  3. Re-take the widths and re-derive the ladder.
  4. Suites.
  5. Changeset.

#### Feature: quiet icons

> **Description:** R4 in spec §4.4.
> **Complexity:** M
> **Dependencies:** M3-T1 (can run in parallel)
> **Risks:**
>
> - An icon-only control turns muted and looks shaded → the helper keeps `--foreground` for icon-only, including
>   `'roomy'` below the container. A unit case covers each label state.
> - The rule leaks to the selection bar → it is opt-in (`quietIcons`), passed only by the band (D-5).
>   **Testing requirements:** unit and structural tests, and the SC-12 journey.

##### Task M3-T2: the icon helper (≈ one PR)

- **Description:** `toolbarIconClass(labelState, state)` in `toolbar-styles.ts`. It is called by `ToolbarButton`,
  `ToolbarPopover`, `ToolbarSplitButton` and every custom `render` trigger. `Deck` and the header toolbars pass
  `quietIcons`.
- **Complexity:** M
- **Dependencies:** none within M3
- **Risks:** a custom trigger is missed → a structural test refuses an icon wrapper that does not use the helper
  (the `toolbar-label.structural.test.ts` precedent).
- **Testing:** `toolbar-styles.test.ts` (each label state and state); the new structural test; the SC-12 journey.
- **Development steps:**
  1. Helper.
  2. Consumers.
  3. Tests.
  4. Changeset.

**M3 status (2026-10-12): built on `feat/toolbar-grid-m3`, from M2's head `ace25a04`; accessibility-reviewer has not yet
driven it.** What shipped, and where it differs from the text above:

- **Baseline is `'roomy-fine'`, not `'roomy'`** (the owner's M0 decision, `m0-measurement.md` §5), with `visibleLabel`
  "Baseline" on the lens promotion record (`tsld-toolbar-items.tsx`) and the owner's 2026-10-12 reversal recorded in its
  docblock. The two milestone presets print "Start milestone" / "Finish milestone" (`promotion-entries.tsx`) and keep
  "Add: …" as the name. Recent edits wears `History`.
- **`ruleBefore` and `groupTail`** are registry fields (`toolbar-registry.ts`) with the `defineToolbar` refusals the unit
  tests pin. Both apply **from 80 rem of window only** (the owner's decision 2 after M0). The rules are a wrapper
  that is `display: contents` below the roomy container (`DECK_RULE_BEFORE`); **the gear cannot be moved by CSS**, because
  an `order` would put the screen and the roving walk in different orders (WCAG 1.3.2, 2.4.3), so `Deck` moves it in the
  DOM from a media query read in its own file (`use-deck-tail-room.ts`, `DECK_TAIL_ROOM_QUERY`). The plan did not say so.
- **The tail query is spelled `(width >= 80rem)`, not the first stage's `(min-width: 80rem)`, on purpose.** The
  `M5_UNPROMOTED` harness answers "stage not reached" by exact string; with the same string the first build of this
  milestone left the gear where it was in the unpromoted reading, and exempting it let stage one's promotions through
  and overstated every natural width by about 120 px. Found by the widths not adding up (LOOK +175 px for a 57 px word).
- **`toolbarIconClass(labelState, state)`** is in `toolbar-styles.ts`; `quietIcons` is a prop on `ToolbarButton`,
  `ToolbarPopover`, `ToolbarSplitButton` and `Toolbar`, and a required member of `ToolbarItemRenderApi` (a custom
  trigger states it). `Deck` passes it, and so do the header's two toolbars (Plan details, Plan view); the selection bar and
  the diagram-corner cluster do not. A `'roomy'` glyph is muted only while its word shows and then `inherit`s, not
  `text-foreground`: a shaded icon-only control would otherwise turn full ink. `toolbar-icon.structural.test.ts` is the
  structural test.
- **The "icon-only" case in `command-surface.spec.ts` now names three items** (it sat at `:1323` in the plan and at `:1438` now;
  the line numbers in this section had moved). Baseline moved to the roomy list, and the coarse case asserts its word never
  shows under touch.
- **Widths re-taken, and the fine ladder moved** (coarse did not): L6 135 to 160 rem; P1 80 to 90; P2 119.5 to 100;
  P3 135 to 119.5; P4 80 where it was 90; P6 100 to 119.5; P7 90 to 135. LOOK's natural width at 1280 rose by 57.3 px (the word),
  DO's by the gear and the two rules; the milestone words gave 33.5 px back each.
- **Journeys:** four new `command-surface.spec.ts` cases (the milestone words, the gear last from 80 rem and not below, the rules
  from 80 rem and not below, SC-12 at 1912) and, in `floor-states.spec.ts`, **Link armed at 1024 fine is one DO line** (the proof of the
  owner's decision 1) and Add armed keeps the two DO lines it has today with "Adding Finish milestone".

---

### Milestone M4: Shared columns (WITHDRAWN by the owner after M0, 2026-10-12; not built)

**Outcome:** from 1280 px, the two rows share a lead column wherever it fits.
**Entry point:** any plan, at a window 1280 px or wider → the command deck.
**Journey:** `command-surface.spec.ts`, new case "the lead groups share a width and no row gains a line, at every stage
cell, both pointers, base and worst states". The `e2e-promotion` SC-17/18 cases re-run against the re-taken JSON.
**Gate:** CQ-3 answered.

#### Feature: the lead column

> **Description:** spec §4.5.
> **Complexity:** M
> **Dependencies:** M3 (the widths must be final)
> **Risks:**
>
> - The column costs a line → `computeLeadColumn` sets `none` wherever the pad exceeds the narrower row's
>   worst-state room less 2 px; SC-10 asserts it; the LINES gate is unchanged.
> - An unmeasured state is wider → the column is a minimum, so that row's divider moves right and nothing clips.
>   Record the state in `docs/TECH_DEBT.md` if found.
> - The column and the ladder disagree → promotion is computed first and the column second; both are pinned to the
>   same committed JSON by unit tests.
>   **Testing requirements:** unit (`computeLeadColumn`, the pinned table), `Deck.test.tsx` (`leadColumn` sets the
>   variable; only each row's first group takes it; never below `lg`), journeys.

##### Task M4-T1: data and the pure function (≈ one PR, ships dark)

- **Description:** extend the harness and `promotion-widths.*.json` with lead group widths (widest state) per stage
  and pointer. Add `deck-lead-column.ts` with `computeLeadColumn` and the committed `DECK_LEAD_COLUMN`, plus a test
  that pins one to the other.
- **Complexity:** M
- **Dependencies:** M3
- **Risks:** a JSON shape change breaks `computePromotionStages` → the new fields are additive and its test still
  passes.
- **Testing:** `deck-lead-column.test.ts`; `promotion-ladder.test.ts` unchanged.
- **Entry point:** `Ships dark: a table and a function nothing renders yet; M4-T2 surfaces it.`
- **Development steps:**
  1. Harness fields.
  2. Two runs.
  3. The function and the table.
  4. The pin test.

##### Task M4-T2: render it (≈ one PR)

- **Description:** `Deck` gains `leadColumn?: string`. It sets `--deck-lead-col` on its root, and each row's first
  group takes `lg:min-w-(--deck-lead-col)`. `plan-workspace-toolbar.tsx` passes the value from `usePromotionStage`.
- **Complexity:** S
- **Dependencies:** M4-T1
- **Risks:** an inline custom property reads as one-off styling → it comes from a committed table, the same kind of
  computed value as a menu's `position: fixed` coordinates. The component reviewer confirms.
- **Testing:** `Deck.test.tsx`; the journey above; `narrow-shell.spec.ts` (no column below 1024).
- **Development steps:**
  1. Prop and classes.
  2. The consumer.
  3. Journey, red first by setting an over-wide column at one stage.
  4. Changeset.

---

### Milestone M5: Photographs, ADR and close-out

**Outcome:** the owner signs off from photographs, the ADR is filed, and the docs match the code.
**Entry point:** `Ships dark: documents, a measurement record and a landmark fix with its own journey (T3).`
**Journey:** T3's axe `region` case on a plan page.

#### Feature: close-out

> **Description:** the record, the ADR, the docs, #491 and #493.
> **Complexity:** M
> **Dependencies:** M4
> **Risks:** sign-off is claimed by the record → the record holds the photos only; the ADR records the owner's
> words (the `m6-measurement.md` precedent).
> **Testing requirements:** `pnpm check:adr-coverage`, `check:counts`, `check:spec-status`, `check:claims`; T3's journey.

##### Task M5-T1: the after record and photographs (≈ one PR)

- **Description:** `m-final-measurement.md`: the M0 cells and states again, the contrast pairs as computed, the stages
  where the column is set, ladder moves, bundle size (`check:bundle-size`, ceiling 18.00 KiB CSS), and the "after"
  photographs at 1024 × 600, 1280 × 800, 1646 × 1097 and 1912 × 1080, both pointers, four states.
- **Complexity:** S
- **Dependencies:** M4
- **Risks:** none beyond the above.
- **Testing:** none (record).
- **Development steps:**
  1. Run the harness.
  2. Write the record.
  3. Hand the photos to the owner.

**M5-T1 status (2026-10-12): recorded in `m-final-measurement.md`, photographs in `photos/after-*`; sign-off not given.**
M4 was withdrawn, so "the stages where the column is set" reads "not applicable: M4 withdrawn 2026-10-12" there. The CSS
ceiling the record reads against is **19.00 KiB**, not this task's 18.00 (M3 raised it; the build reads 18.05 KiB). The
harness gained `M0_TAG=after`, which writes `photos/after-*` and cannot overwrite the M0 set.

##### Task M5-T2: ADR and docs (≈ one PR)

- **Description:**
  - File ADR-0189 (or the next free number) from spec §4.9, with the owner's sign-off words.
  - Add an amendment note to ADR-0185 (D3; D8 V1, V2, V3, V4) and its status line.
  - Add one line to `CLAUDE.md` §16, and update the §1 counts with `pnpm check:counts`.
  - `DESIGN_SYSTEM.md`: the toolbar section (dividers and rules, tracks, icon ink, no boxes).
  - `UX_STANDARDS.md` and `COMPONENT_LIBRARY.md` (the registry fields).
  - Flip both headers to `Accepted — shipped (ADR-NNNN)`.
  - `docs/TECH_DEBT.md`: a row for D-5's follow-up (quiet icons on the selection bar): filed at the M3 review as #498; any unmeasured wide state
    found at M4.
- **Complexity:** S
- **Dependencies:** M5-T1, owner sign-off
- **Testing:** the `check:*` gates via `pnpm prepush`.
- **Development steps:**
  1. ADR.
  2. Register line.
  3. Docs.
  4. Gates.

##### Task M5-T3: #493, the band landmark (≈ one PR)

- **Description:** #493's trigger is "the next change to the chrome band", so it fires on this epic. Give the band a
  named landmark and run axe `region` on a plan page in `command-surface.spec.ts`. The owner may split this out; it is
  its own PR either way.
- **Complexity:** S
- **Dependencies:** none (may run any time after M1)
- **Risks:** a landmark name collides with an existing one → the accessibility reviewer picks the name.
- **Testing:** the axe case, red first on today's tree (it fails today, per #493).
- **Development steps:**
  1. Landmark.
  2. Journey.
  3. Close #493.
  4. Changeset.

##### Task M5-T4: #491, CI time

- **Description:** this epic adds cases to existing suites but no config or CI step. #491's trigger includes "the
  next journey added". Re-measure the four web shards from a CI run, update `scripts/e2e-durations.json`, and either
  re-pack or record ADR-0138's trigger as fired.
- **Complexity:** S
- **Dependencies:** M4
- **Testing:** the CI run itself.
- **Development steps:**
  1. Read the shard wall times.
  2. Re-pack or record.
  3. Update #491.

**M5-T4 status (2026-10-12): re-measured from CI run `38290423490`; no re-pack, ADR-0138's trigger recorded as fired in
#491.** The web shards ran 766 / 1,172 / 1,089 / 962 s (suite steps 657 / 1,070 / 995 / 845 s, 3,567 s in all) and
`scripts/e2e-durations.json` was re-harvested from that run. A re-pack edits `ci.yml`, which this task does not touch,
and the arithmetic in #491 says a perfect four-way pack would still sit above the API job; the choice between the two
remedies is the owner's.

## Sequencing & slices

1. **M0** first, always. Its stop rules can change M1 to M4.
2. **M1, M2, M3 and M4 each ship on their own and keep `main` releasable.** Each is visible and has its own journey.
   Each re-takes the widths so `e2e-promotion` stays green.
3. **M4 must come last of the build milestones**, because the column is computed from final widths.
4. **M3-T2** (quiet icons) can run alongside M3-T1. **M5-T3** (#493) can run any time after M1.
5. No flag at any point (ADR-0088 D1). The rollback for any slice is reverting its commit.

**Suites that need re-baselining or new cases:**

| Suite / file                                                 | What changes                                                            |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `deck-seams.structural.test.tsx`                             | Rewritten (M1)                                                          |
| `toolbar-styles.test.ts`                                     | Locked-pill case (M1, CQ-2); icon helper (M3)                           |
| `Deck.test.tsx`, `Toolbar.test.tsx`                          | Dividers, wrappers, fields, `leadColumn`                                |
| `tsld-toolbar-undo-redo.test.tsx`                            | Order and cluster (M2)                                                  |
| `token-contrast.test.ts`                                     | P1 to P7                                                                |
| `promotion-widths.{fine,coarse}.json`, `promotion-ladder.ts` | Re-taken at M1, M2, M3 and M4                                           |
| `e2e-workspace-fit/command-surface.spec.ts`                  | New cases (M1 to M4); `:1323` now three icon-only items                 |
| `e2e-workspace-fit/promotion.spec.ts`                        | Re-run against re-taken widths; any `NARROW` width that assumed a stage |
| `e2e-forced-colors/`                                         | One new case (M2)                                                       |
| `e2e-narrow-shell/narrow-shell.spec.ts`                      | Unchanged, must pass (row seam moved, no column below 1024)             |
| `e2e-toolbar/toolbar.spec.ts`                                | Re-run; update any locator on the undo order                            |

**CI time.** No new Playwright config and no new CI step. New cases are added to suites already in CI
(`ci.yml:546`, `:941`, `:953`, `:980`, `:1147`). **Estimate:** 30 to 60 s of added journey time in total, mostly
`command-surface.spec.ts`'s per-cell cases. It is not measured until a CI run. M5-T4 re-measures the shards, because
#491 is open and its trigger includes "the next journey added".

## Definition of Done (per task)

Each task's PR meets the Feature Completion Criteria in [`docs/PROCESS.md`](../../PROCESS.md): code, tests (the
pre-push gate **run**, including `scripts/e2e-local.sh web:<suite>` for each changed journey), docs, security (none
here), performance (bundle checked), accessibility (journeys; the reviews before M2 ships), Docker build, CI green,
changeset, and version impact.

## Risks & assumptions (rollup)

| Risk / assumption                                                                                          | Likelihood                                                                                         | Impact | Mitigation                                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| The shared column fits at few or no stages (DO's free gap is 14.5 px fine at 1440, `m6-measurement.md:68`) | **realised** (measured, M0: no stage today, three of twelve after M1 to M3)                        | med    | M0 measured it; the stop rule fired; the owner decides                                                              |
| A visual change breaks the two-line floor at 1024 (28.7 px LOOK reserve with a conflict)                   | **realised in one state** (measured, M0: Link armed, DO 5.2 px free; the gear move alone wraps it) | high   | Wider gaps and Baseline's word only from 79 rem; M0 prototype check; the owner decides                              |
| Removing the pill brings back the leading-seam defect                                                      | med                                                                                                | med    | Row `overflow-x: clip`; a journey verified red without it                                                           |
| The raised member is hard to see in forced colours                                                         | med                                                                                                | med    | A system-colour border; a forced-colours journey case                                                               |
| The search field fails 1.4.11 without its outline                                                          | high if dropped                                                                                    | high   | CQ-1 default keeps a ≥ 3:1 outline                                                                                  |
| Width changes make SC-18 (a) fail CI                                                                       | high                                                                                               | med    | Re-take the JSON in the same PR at every width-changing milestone                                                   |
| The Redo / Recent edits reorder confuses keyboard users or journeys                                        | low                                                                                                | low    | Screen order equals DOM order; journeys updated; accessibility review                                               |
| `--chrome-input` change (CQ-1 (a)) reaches other chrome fields                                             | med                                                                                                | low    | Scope to the deck's field, or photograph the other uses                                                             |
| The owner prefers the mock-up's 30 px controls or brighter raised colour                                   | low                                                                                                | low    | D-7 and D-8 state why; the photographs show the result                                                              |
| My contrast estimates are off                                                                              | med                                                                                                | low    | M0 computed every pair from the tokens and all estimates held (measured, M0); `token-contrast.test.ts` asserts them |
| CI time grows past #491's trigger again                                                                    | med                                                                                                | low    | No new config; M5-T4 re-measures and re-packs                                                                       |
