# M2 after-reading: the page grid split, measured on the shipped tree against a fresh before

- **Taken:** 2026-10-19, one sitting, one API, one fixture harness, headless Chromium in the dev container.
  Layout only; no frame-rate claim.
- **After:** `origin/main` at `0b1a6254` (M1 is `2feb7eb9`, #909), build `web 0.194.1 · api 0.96.1`
  read off the shell footer.
- **Before:** `2feb7eb9^` (`87fb92d5`) in a second worktree, build `web 0.182.0 · api 0.96.1`
  (the footer reads the web version, so it differs; the API was the same process for both).
- **Instrument:** `apps/web/scripts/measure-overview.mjs` with `SP_SPLIT_ONLY=1`, the same script and
  `landing-fixture.mjs` for both runs, each against its own Vite server, each with a freshly seeded
  organisation (non-vacuity control PASS, 9 states, both runs).
  Not re-run here, because Playwright is run centrally: the `e2e-overview` journey, which carries SC-1's
  1600 reading, SC-3's focus and order, SC-4's 200 % and SC-5's axe (`overview.spec.ts:131-384`, `:596-624`).
- **Photographs:** [`m2/`](./m2/), `before-` and `after-` pairs at 1272 × 1800 and 1912 × 948, plus the
  after-tall page at 1280 and 1477. Every other cell is in M0's [`m0/`](./m0/) for the before side.

## 1. The split matrix, landing (Explorer default unless stated)

| Window          | Grid | Tracks before | Tracks after | Tops before → after | Boxes wholly visible before → after |
| --------------- | ---: | ------------- | ------------ | ------------------: | ----------------------------------: |
| 1024 × 600      |  699 | 338 + 338     | 699          |               2 → 4 |                          2 → 1 of 4 |
| **1272 × 1800** |  947 | 462 + 462     | 947          |               2 → 4 |                      **4 → 3 of 4** |
| 1280 × 800      |  955 | 466 + 466     | 955          |               2 → 4 |                          2 → 1 of 4 |
| 1349 × 800      | 1024 | 500 + 500     | 1024         |               2 → 4 |                          2 → 1 of 4 |
| 1358 × 636      | 1033 | 505 + 505     | 1033         |               2 → 4 |                          2 → 1 of 4 |
| 1440 × 900      | 1115 | 546 + 546     | 1115         |               2 → 4 |                          4 → 2 of 4 |
| 1477 × 900      | 1152 | 564 + 564     | 564 + 564    |               2 → 2 |                          4 → 4 of 4 |
| 1912 × 948      | 1488 | 732 + 732     | 732 + 732    |               2 → 2 |                          4 → 4 of 4 |
| 1912 × 1114     | 1488 | 732 + 732     | 732 + 732    |               2 → 2 |                          4 → 4 of 4 |
| 1280 × 800 fold | 1187 | 582 + 582     | 582 + 582    |               2 → 2 |                          2 → 2 of 4 |
| 1280 × 800 @420 |  811 | 394 + 394     | 811          |               2 → 4 |                          2 → 1 of 4 |
| 1440 × 900 fold | 1347 | 662 + 662     | 662 + 662    |               2 → 2 |                          4 → 4 of 4 |
| 1440 × 900 @420 |  971 | 474 + 474     | 971          |               2 → 4 |                          4 → 1 of 4 |

Document `overflow-x` is 0 in every cell, before and after, on both screens. The grid column is the
§3.1 derivation again to the pixel.

Region heights at 1912: **identical before and after** (948: 463 / 463 / 282 / 282; 1114: 463 / 463 /
448 / 448). Members' tracks at 1912 are 732 + 732 before and after.

## 2. The 1272 × 1800 reading (the Surface upright)

Boxes wholly visible without scrolling: **before 4 of 4, after 3 of 4.** The one-column page is 2076 px
tall in a 1749 px `main`; the fourth box, "Recently changed", starts at about y = 1520 and is cut. This
fixture holds eight programmes, so it is a fuller landing than a small organisation's. The height 1800 is
an estimate (the Surface upright is not measured by this sitting). Photographs:
[`before-landing-1272x1800.png`](./m2/before-landing-1272x1800.png),
[`after-landing-1272x1800.png`](./m2/after-landing-1272x1800.png).

## 3. Success criteria

| SC       | Verdict      | Evidence                                                                                                                                                                                                                                                                                          |
| -------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SC-1** | **met**      | 1280 × 800: four distinct tops (was two). Two tops at 1477 and 1912, the cells either side of 1600 (grid 1227 there, above the 1152 split); 1600 × 1000 itself is the journey's assertion and was not photographed in this sitting.                                                               |
| **SC-2** | **met**      | 732 + 732 at 1912 × 948 and 1912 × 1114, before and after; box heights identical; Members 732 + 732. `/staff` not measured in this sitting.                                                                                                                                                       |
| **SC-3** | **met**      | 1280 × 800 folded: 582 + 582 (≥ 500). 1440 × 900 at 420: one 971 px column. DOM order and focus-after-reflow are the journey's, not measured here.                                                                                                                                                |
| **SC-4** | **met**      | No horizontal overflow and no clipped section at 1024 × 600 on the landing and on Members (`overflow-x` 0). The 200 % case is the journey's, not measured here.                                                                                                                                   |
| **SC-5** | **not here** | axe is the journey's (`axeBoth`, both layouts); no axe run in this sitting.                                                                                                                                                                                                                       |
| **SC-6** | **met**      | As amended 2026-10-09 (the subtitle clause was dropped, the plan-name clause stands). At the narrowest two-column pair, 1477 (564 px tracks), "Needs your attention" has no wrapped plan name; the 57-character fixture name wraps in the chipped rows (photo), exactly as at 546 and 564 before. |

The truncation count is **0 in every cell after** (11 to 18 before): the long `project · client`
subtitle now wraps to a second line rather than clipping, which is `docs/TECH_DEBT.md` #472 (closed by ADR-0184,
2026-10-09, per its ledger line) landing between the two builds, not M1's. The harness counts those subtitle runs as "wrapped", so the
wrapped column reads higher after (7 against 1 at 1280); in the photographs no plan name wraps in one
column and the subtitle sits on one line.

## 4. What it costs

A one-column page is taller than two columns, so fewer boxes are wholly visible in a short window: 1 of 4
at 1280 × 800 (was 2) and 3 of 4 at the Surface upright (was 4). The rows themselves are comfortable
(955 px wide, nothing wraps, nothing truncates). That is the trade ADR-0182 accepted.
