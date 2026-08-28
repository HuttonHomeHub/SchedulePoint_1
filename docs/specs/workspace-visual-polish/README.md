# Workspace visual polish — a seven-item pass

**Product-owner direction, 2026-08-28** (screenshot review of `web 0.110.0`), with four steers
taken by question before anything was built: the foot caption reads **SELECTION**, the canvas goes
**fully flush** (no card, no shadow), the status line pairs **dates on top**, and the deck's group
**fold is removed**. "Don't change anything just yet, just review" → reviewed → "write it up as a
small pass and build it in the order you think."

Per ADR-0105 this pass adds no new user-facing entry point, no Playwright config or CI step, and
no schema change; it DOES change a shared primitive's public contract (`Deck` loses fold), which
is why this spec exists rather than a register row — and why the §19.13 accessibility review runs
BEFORE release (the captions leave the deck's roving keyboard sequence).

## The items, with the current state read from the code (not from memory)

1. **Full-bleed shell.** The shell grid gives the chrome band `mt-3 mr-3 mb-2 ml-3`
   (`app-shell.tsx:434`) and the page gradient shows through as a grey frame around the band, the
   workspace and the foot. All shell margins go; surfaces meet the window edges. **A knowing
   reversal** of the 2026-08-24 redesign's frame — the PO who approved the frame is the one asking
   for it to go.
2. **Canvas fully flush.** The stage card
   (`plan-workspace-toolbar.tsx:1692` — `rounded-lg border shadow-md`, "a sheet of paper laid on
   the gradient") loses radius, border and shadow; the diagram runs edge to edge between the deck,
   the explorer, the docks and the foot. Same reversal, same authority.
3. **Amber accent on the foot.** `ChromeBandRow` carries `border-b-[3px] border-b-primary`
   (`chrome-band.tsx:80`) — the old Flask app's own device. The foot block (the whole dark region:
   activities/object row + status row) gains the mirror image: a 3px `--primary` rule along its
   TOP edge, so the two chrome bands bracket the diagram. Decorative rule → 1.4.11-exempt; the
   token, never a literal (the colour-literal lint rule stands).
4. **Foot padding standardised.** The foot rows sit tighter to their dark ground than the deck's
   content sits to the band. Measure the deck's inset in the browser at M0 and copy it — a copied
   measurement, not a judged one.
5. **Foot caption `SELECTION`.** The deck's rows carry caption labels (VIEW / FIND / AUTHOR /
   PLAN); the object bar gains one in the same visual style. SELECTION, not "Modify" (PO steer):
   half the bar's items are reads, and the bar's discriminator has been "the selected object"
   since ADR-0093. Plain label — after item 7 of this pass there is no caption interactivity to
   copy.
6. **Status line = two explicit pairs, dates on top.** Today `FactList` renders
   Activities · Data date · Finish · critical in one wrap-at-`max-w-64` flex, so the line split is
   luck of widths. It becomes two explicit rows: **Data date + Finish** (the plan's span), then
   **Activities + critical** (the population and its risk). The ADR-0114/0115 height arithmetic
   (row-gap 0, two 16px lines ≤ the 40px floor) is preserved and re-measured.
7. **One surface for the side panels.** The Project Explorer is `<Surface tone="panel">`
   (`explorer-column.tsx:135`); the right docks are `bg-card` on the page scope
   (`plan-workspace-toolbar.tsx` dock wrappers) — two mechanisms for one near-white, the exact
   split-pair class ADR-0097 names. The right docks join the `panel` surface scope; their panels'
   internals repaint by token with no component change.
8. **A dock pushes the canvas only.** Today the right docks (notes / Float paths / Health check)
   are full-height siblings of the stage-plus-foot column, so opening one narrows the foot — and a
   narrowed foot is exactly the wrap ADR-0114/0115 measured at 36–76px of lost diagram. The dock
   column moves to sit beside the CANVAS region only; the foot spans full width beneath both.
   **Measure first** (M0 geometry + before/after), and the `dock.spec.ts` height equalities are
   RE-DERIVED from the new layout, never widened.

## Order and why

M0 baseline (screenshots at 1646 + 1920, foot-inset and dock-geometry measurements) →
M1 full-bleed + flush (items 1–2; the ground everything else is judged on) →
M2 the foot band (items 3–5, one surface touched once) →
M3 status pairs (item 6) →
M4 dock surface scope (item 7) →
M5 dock-pushes-canvas-only (item 8, the one structural move, measured) →
M6 remove the deck fold (item from the steer; captions become static labels; delete
`FOLD_STORAGE_KEY`, the persisted set, `toggleFold`, the `hasActive` fold-guard and the caption
buttons' disclosure semantics) → reviews (accessibility per §19.13, ux over the whole pass) →
screenshots after → ship.

The fold removal goes LAST deliberately: it is the only primitive-contract change, so it rides
next to the review that gates it, and nothing earlier depends on it.

## What this pass does not do

No backend change of any kind — the CPM engine, the API and the database are untouched. No
feature flag (ADR-0088 D1); the rollback contract is the commit boundary per item. The shell's
`col-start-3` context-drawer column (TECH_DEBT #156, no production registrant) is out of scope.

## Definition of done

Every item photographed before/after at 1646 and 1920 via `scripts/shoot.mjs`; the ADR-0114
target-size sweep and the dock equalities green with re-derived values; accessibility + ux reviews
folded; prepush 13/13; base + workspace-chrome + health-check + gantt journeys green locally
(the #133 rule: a layout change sweeps the journeys); one changeset (`@repo/web` minor).

## M0 — measured (1646×900, Chromium, `scratchpad/m0-polish-probe.mjs`, 2026-08-28)

| Fact                                                    | Value                                                                                     |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Shell frame margins (band + workspace + foot vs window) | **12 px** each side (band x=12→1634, foot bottom 888 vs 900)                              |
| Deck content inset (band edge → first group card)       | **9 px**                                                                                  |
| Foot content inset                                      | **16 px** left, **≈1 px** top — the mismatch item 4 names                                 |
| Foot block                                              | ONE 41 px `chrome`-surface row (object bar + facts inline; no separate status strip)      |
| Stage card                                              | x289 y209 1345×638; canvas 596 px tall                                                    |
| Dock (Health open)                                      | full-height sibling, y 209→888; **narrows the foot 1345→944 px** and the canvas to 942 px |

Item 6's "status line" is therefore the facts' two wrapped lines INSIDE the 41 px row; item 8's
change moves the dock's bottom edge from 888 (foot bottom) to 847 (canvas bottom).

## After M1–M5 — re-measured (same probe, 2026-08-28)

| Fact                  | Value                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| Shell frame           | gone — band x 0→1646, foot right = window right                                                 |
| Dock (Health open)    | y 188→**845** — bottom is the foot's top, not the window's                                      |
| Foot with dock open   | x 277→1646 = **1369 px full width** (was 944; the M0 table's 1345 was the pre-full-bleed width) |
| Canvas with dock open | bottom **845** = dock bottom — the dock pushes the canvas only                                  |
| Foot row              | 55 px (was 41) — the deck-matched `py-1.5` + the 3 px amber rule, the padding the PO asked for  |
