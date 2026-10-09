# M0 measurement: the split matrix, and SC-6 applied literally

- **Taken:** 2026-10-09, build `web 0.181.1 · api 0.88.1` (read off the shell footer), headless
  Chromium in the dev container. Layout only; no frame-rate claim (plan M0-T1 risk).
- **Instrument:** `apps/web/scripts/measure-overview.mjs`, extended with the split matrix
  (`SP_SPLIT_ONLY=1` skips the older FC sections). It throws if a cell finds fewer than the four
  landing regions (three on Members), and the non-vacuity control still runs first (9 states).
- **Raw output:** [`m0-raw-run.md`](./m0-raw-run.md) (every cell, every wrapped and truncated run).
  **Photographs:** [`m0/`](./m0/) — `landing-` and `members-` at each cell, `-tall` where the page
  scrolls inside `main` (window grown to 2400 px so every box is visible).
- **Fixture:** the seeded landing plus one deliberately long, ordinary-length programme: plan
  `Berth 4 Deepening — Dredging and Revetment Works, Stage 2B` (57 chars) in project
  `Estuary Crossing Programme — Western Approaches` of client
  `Northern Ports and Harbours Authority`. The seeded plans' own pair is
  `Dockside Regeneration · Harbourside Estates` (284 px of text).

## 1. What was measured (Explorer default unless stated)

Grid and tracks match the spec's §3.1 derivation to the pixel at every cell it predicted
(955/466 at 1280, 1115/546 at 1440, 1488/732 at 1912; 699/338 at 1024 is now **measured**, not derived).

| Window         | Explorer | Grid | Tracks        | Landing boxes wholly visible | Doc overflow-x | Long plan name wraps (Needs your attention) |
| -------------- | -------- | ---: | ------------- | ---------------------------: | -------------: | ------------------------------------------- |
| 1024 × 600     | default  |  699 | 338 + 338     |                       2 of 4 |              0 | **yes**                                     |
| 1272 × 1800    | default  |  947 | 462 + 462     |                       4 of 4 |              0 | **yes**                                     |
| 1280 × 800     | default  |  955 | 466 + 466     |                       2 of 4 |              0 | **yes**                                     |
| **1349 × 800** | default  | 1024 | **500 + 500** |                       2 of 4 |              0 | **yes**                                     |
| **1358 × 636** | default  | 1033 | **505 + 505** |                       2 of 4 |              0 | **yes**                                     |
| 1440 × 900     | default  | 1115 | 546 + 546     |                       2 of 4 |              0 | no                                          |
| **1477 × 900** | default  | 1152 | **564 + 564** |                       2 of 4 |              0 | no                                          |
| 1912 × 948     | default  | 1488 | 732 + 732     |                       2 of 4 |              0 | no                                          |
| 1912 × 1114    | default  | 1488 | 732 + 732     |                       4 of 4 |              0 | no                                          |
| 1280 × 800     | folded   | 1187 | 582 + 582     |                       2 of 4 |              0 | no                                          |
| 1280 × 800     | 420      |  811 | 394 + 394     |                       2 of 4 |              0 | **yes**                                     |
| 1440 × 900     | folded   | 1347 | 662 + 662     |                       2 of 4 |              0 | no                                          |
| 1440 × 900     | 420      |  971 | 474 + 474     |                       2 of 4 |              0 | **yes**                                     |

Other readings the spec asked for: the surface upright (1272 × 1800) shows **all four boxes** whole
in two columns today (the height is an estimate until read off `/pointer-check.html`); at 1280 × 800
two of four are whole today and the main area scrolls 945/749.

## 2. SC-6, applied literally

SC-6 says: at the narrowest `@5xl` pair (windows 1349 and 1358), **no plan name wraps to a second
line and no `project · client` subtitle is truncated mid-word** on the landing, and no wrapped cell
in Members' paired sections. If any does, move to `@6xl` and re-take SC-6 at 1477/1486.

**At 1349 and 1358, `@5xl`: the rule FAILS, on two clauses.**

1. **A plan name wraps to a second line.** Only the 57-character programme, only in "Needs your
   attention" (the one box whose names wrap rather than truncate), at 500 and 505 px tracks
   (photograph `landing-1349x800-default-tall.png`). It does not wrap at 546 (1440) or above.
2. **Subtitles are truncated mid-word.** `Dockside Regeneration · Harbourside Estates` shows 103 of
   284 px in "Where the work stands" and 73 of 284 in "Recently changed" at 1349 (`Docksid…`,
   `Dockside Reg…`).

**Re-taken at `@6xl`'s narrowest pair (1477, 564 px tracks):** clause 1 passes (no name wraps). **Clause
2 still fails** — the same subtitle shows 154 of 284 px in "Where the work stands" and 124 in
"Recently changed".

## 3. The finding that stops M1: SC-6's second clause fails at today's accepted layout

At **1912 × 948 and 1912 × 1114 — 732 px tracks, the layout this spec says stays "pixel for pixel"
unchanged and which both of the product owner's screens use — the same subtitle is still truncated
mid-word**: 258 of 284 px in "Recently changed" (`Harbourside E…`, photograph
`landing-1912x948-default.png`) and 267 of 284 in "Where the work stands". The ordinary plan names
`Dockside — Ancillary work…` truncate there too, and the 57-character programme's subtitle shows
290 of 584 px in "Jump back in".

So clause 2 cannot be met at **any** width the spec considers, including the baseline it protects,
and it therefore cannot choose between `@5xl` and `@6xl`. Its premise — that a wide enough column
renders `project · client` whole — is false for this row component: `RowSubject` gives the context
a `shrink-[3] truncate` span beside a name, a `Draft` badge and a trailing actor and time, and 732 px
is not enough once those share the line (`list-row.tsx:50-58`).

Three further premise points the measurement corrects:

- **The "plan name wraps at 466" claim is stale for most boxes.** Rows in "Jump back in", "Where the
  work stands" and "Recently changed" are single-line (`RowSubject`, `truncate`); names there
  **truncate with an ellipsis, they do not wrap**. Only "Needs your attention" wraps a name, and
  only the long one. At 1280 with the seeded names (35 characters or fewer) no name wraps anywhere.
- **Clause 1 alone does discriminate**, but only because of the 57-character fixture name I chose:
  it wraps up to 505 px and not at 546. A shorter name moves that boundary down; a longer one moves
  it up. It is a property of the fixture, not of the product.
- **Members' paired sections show no wrapped table cell at 1349 or 1477.** The only wrapped runs
  are the prose paragraphs in "What each role can do" (three at 1349, two at 1477, none at 1912) —
  ordinary prose, not a table cell. So Members gives no evidence for either threshold.

## 4. Verdict, and what is needed from the product owner

**CQ-2 is not decided by SC-6.** Read literally: `@5xl` fails (both clauses) and `@6xl` fails (clause
2), and clause 2 fails at 1912 as well, so no threshold passes. Read as only the clause that can
discriminate (clause 1, name wrap), `@6xl` passes and `@5xl` fails on a fixture name I chose. I have
not picked a threshold, because either choice would be me rewriting the approved rule.

Per the brief, **M1 has not started**. Options for the product owner:

- **(a)** Accept clause 1 as the operative test and choose `@6xl` (72rem; landing/Members split at a
  1477 window with the Explorer at 276, one 1151 px column below it). This puts 1440 laptops into one
  column of 1115 px, which the spec called the cost of `@6xl` (§4.5).
- **(b)** Restate clause 2 as a comparison against the 1912 baseline (the subtitle shows no less
  than 80 % of what it shows at 732 px: 258 of 284 → 206 px). At that bar `@5xl` fails (73–103 px
  at 1349) and `@6xl` fails (106–154 at 1477); no two-column width below the 732 px baseline passes, so
  this reading amounts to "never split below 1912", which argues against the feature rather than for a
  threshold.
- **(c)** Treat the subtitle as the thing to fix (give the context more of the line, or move it
  under the name), a `RowSubject` change that is its own spec (a component's public contract,
  ADR-0105), and decide the grid threshold on name wrap and column width alone.

The one conclusion the data supports without choosing: **the container-query mechanism (SC-3) is
still right** — the Explorer swing is visible in the table (a 1280 window gives a 1187 grid folded
and an 811 grid at 420; a 1440 window gives 1347 and 971), and a viewport query cannot see it.

## 5. Decision (2026-10-09)

Option (a) was taken by the coordinator under the product owner's delegation ("CQ-2 by M0
photographs"): the name-wrap clause is the operative test and the threshold is **`@6xl` (72rem) for
the landing, Members and the staff console**. The subtitle clause fails at the 1912 baseline, so it
cannot discriminate and is dropped as a threshold test; the truncation is a pre-existing `RowSubject`
defect at every width (`docs/TECH_DEBT.md` #472, its own spec, `RowSubject` untouched here). The
product owner can object. Consequence stated without softening: a 1440 laptop gets one 1115 px
column. The spec carries a dated amendment; ADR-0182 states the amended rule.
