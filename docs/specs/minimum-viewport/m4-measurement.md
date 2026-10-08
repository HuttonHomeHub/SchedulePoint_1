# M4 — Fit at the floor: what changed, and what the arithmetic says cannot

Evidence for [`implementation-plan.md`](implementation-plan.md) M4 (ADR-0179, ADR-0113). Same harness, fixture and
caveats as [`m0-measurement.md`](m0-measurement.md): container Chromium, layout only, two seeded activities, the pen
taken, dock closed unless stated. The harness was throwaway and is not committed.

## Canvas height, before and after (CSS px)

| Viewport (fine)    | Header  | Deck lines | Canvas before | Canvas after | Dock-open height before / after |
| ------------------ | ------- | ---------- | ------------- | ------------ | ------------------------------- |
| 1024 × 600         | 88 → 40 | 4 → 4      | 226           | **274**      | 266 / **314**                   |
| 1024 × 640         | 88 → 40 | 4 → 4      | 266           | **314**      | 306 / **354**                   |
| 1024 × 768         | 88 → 40 | 4 → 4      | 394           | **442**      | 434 / **482**                   |
| 1280 × 800         | 40      | 3 → **2**  | 518           | **562**      | 558 / **602**                   |
| 1440 × 900         | 40      | 2          | 662           | 662          | unchanged                       |
| 1646 × 1097        | 40      | 2          | 859           | 859          | unchanged                       |
| 1912 × 948 (mouse) | 40      | 2          | 710           | 710          | unchanged                       |

| Viewport (coarse)          | Header   | Deck lines | Canvas before | Canvas after |
| -------------------------- | -------- | ---------- | ------------- | ------------ |
| 1024 × 600                 | 100 → 44 | 4 → 4      | 200           | **234**      |
| 1024 × 640                 | 100 → 44 | 4 → 4      | 218           | **274**      |
| 1280 × 800                 | 44       | 4          | 434           | 434          |
| 1440 × 900                 | 44       | 4 → **3**  | 534           | **586**      |
| 1646 × 1097                | 44       | 2          | 835           | 835          |
| 1912 × 948 (Surface-class) | 44       | 2          | 686           | 686          |

The product owner's two displays (1912 × 948 mouse, 1912 × 1114 touch) read identically before and after: the
Explorer ceiling is 420 from 1141 px up, the search field is 240 from 1600 px up, and the header already fitted.

## M4-T1 — the Explorer

- **Width: option (a).** `explorerCeiling(viewport) = viewport − 720 − 1` (the splitter), between the 200 minimum and
  the 420 maximum, so the stage never drops below 720 px. 720 is chosen from M0: the 276 default leaves 747 at 1024,
  the width the Gantt's 584 px pinned grid (#437) and a 400 px dock were judged at; 603 (the old 420 maximum) left a
  262 px diagram with a dock open. At 1024 the ceiling is 303, so the planner can still widen the Explorer by 27 px;
  from 1141 px the 420 maximum is reached. The clamp is a `ceiling` option on `useResizablePanelPrefs` that bounds the
  size **read back and set**, never the **stored** value (a stored 420 is still 420 after a visit at 1024: asserted
  in `command-surface.spec.ts`). `PanelResizer`'s `aria-valuemax` follows the ceiling.
- **Vertical:** the destinations block is 195 px (was 219) in windows under 704 px tall (rows `py-1`). That is all that
  is cheap: a coarse row is 44 px by ADR-0118, and the column already scrolls with a four-row tree (M2). What moved
  the Explorer's budget most is the header (+48 px on the column's height at the floor).

## M4-T2 — the deck

The four groups are **733, 513, 627 and 622 px** in a 1008 px row at 1024 (search field at 168). Any two sum past
1008, so the deck is four lines at the floor **by arithmetic**: three would need either a group to split across lines
(which the declared LOOK/DO rows exist to prevent) or about 250 px of labels removed from the DO row. The 1024 bound
therefore stays at 4. What was cheap and lossless:

- **The search field is 168 px below 1600 and 240 above** (`searchFieldWidth`), and its placeholder is "Search or
  filter…" (the accessible name is unchanged). LOOK is 1254 px; it fits a 1264 px row at 1280 with 10 px to spare.
  1280 fine goes 3 → 2 lines (+44 px of diagram); 1440 coarse goes 4 → 3 (+52).
- `command-surface.spec.ts`: 1280 now bounds the deck at 2 lines and LOOK at 1.

**Option for the product owner, not taken:** dropping the labels of Summary, Calendar and Export below 1280 px
(about 267 px) would put DO on one line and the floor deck at three (+44 px). It trades labelled commands for height
and is a design call; nothing here pre-empts it.

**M0's payoff #4 was wrong in its conclusion.** It says the one-line budget cited for `apply-levelling` "does not hold
at the floor, so a labelled `apply-levelling` is free". The budget is the DO row at 1280–1440, where it is one line
with 7 px to spare at 1280 (Author 627 + Plan 622 + 8 in 1264); a label would cost a line there. It stays
icon-only. The `ICON_ONLY` comment is correct.

No `Deck` keyboard behaviour was touched (ADR-0111 does not fire for this change).

## M4-T3 — wraps and clips

- **The header wraps no more at 1024.** Its first section (brand + plan identity) is capped at half the row
  (`max-w-1/2`), so a long plan name truncates (with its `title`) before the row wraps. The content did not shrink; the
  breadcrumb's earlier crumbs truncate too ("Rive… / Riverside Quarter - Phase …" with the fixture's 40-character
  name). 88 → 40 px fine, 100 → 44 coarse. `pen-status.spec.ts` now expects one line at 1024 (it expected two).
- **Open dock at 1024 × 600: 314 px, still under `DOCK_MIN_HEIGHT` 360.** It cannot reach 360 without a two-line deck.
  The constant's docblock now says it guards the panel's clamp only and is not met at the floor.
- **The activities table at 1024 × 600 with the panel expanded still shows no rows**, and this is arithmetic too: the
  diagram's 240 px minimum (`TsldPanel`'s `min-h-[240px]`) + the panel's 140 px minimum + 227 px of chrome + 51 px of
  foot is 658 px. The panel is clipped to ~82 px (its bar and the column headings). At 1280 × 800 it is fine. A fix is a
  trade of diagram for table at heights under ~660 px, which is a design decision (a follow-up), not a defect fix.
- **#466 is not part of this vertical budget.** It is the pane bar over a row's `⋯` at **320** px, below the floor and
  in the single-pane layout; nothing in the 1024 work touches it, so the row stays open.

## Not done, and why

- Coarse 1280 is still four lines (View 841 + Find 521 > 1264; Author 799 + Plan 662 > 1264). The 44 px controls mean
  the same saving would need ~200 px more; not cheap.
- Light-touch only on the Explorer's vertical budget (above): at 1024 × 600 the column still scrolls by ~74 px (fine).
