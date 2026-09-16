# M8 — what a landing row costs, and what height there is to spend

**Status:** Measurement only. Nothing is built and no code changed; this is the baseline the design
is judged against, taken before any of it was designed (ADR-0142 D4).

**Three findings up front, because two of them change the request:**

1. **The page does not scroll, and never did.** The shell is an `h-dvh` grid with
   `overflow: hidden`; `<main>` is the scroll container. So "I don't want to scroll the main
   window" is about the **workspace region**, which at a 1000 px window holds 949 px and is asked
   to show 1302 — **353 px over**. That is where a height cap has to be applied, and it is not the
   document.
2. **At the product owner's own window height, four rows per box does not fit at today's row
   height.** A box's body is 313 px at a 1000 px window; the median row is 81 px, so it holds
   **three** — and two where a row carries flags. The "fix each box to 4 items" half of the request
   is not free; it is bought by the "tighten the rows" half.
3. **The two tall boxes cost twice what the two short ones do.** "Jump back in" and "Needs your
   attention" run 60–61 px a row; "Where the work stands" and "Recently changed" run 81, and a
   flagged row reaches **121 px at 1646** because its sentences wrap. Tightening the 81 px row to
   ~60 is what turns three rows into five.

- **Taken:** 2026-09-16T10:22:52.932Z
- **Build:** `web 0.133.0 · api 0.66.0` (read off the shell footer, not assumed)
- **Organisation:** `m8-density-1789554160664`, seeded by `landing-fixture.mjs`
- **Non-vacuity control:** PASS, 9 states asserted positively before any measurement

> Measured against the **shipped** screen — no flag, no code change — so these are a baseline a
> later run can be compared against.

## D0 — which element actually scrolls

Document: scrollHeight **1000**, clientHeight **1000** — **the page does not scroll at all.**

| Ancestor                                                               | display | overflow-y | client | scroll | scrolls? |
| ---------------------------------------------------------------------- | ------- | ---------- | -----: | -----: | -------- |
| `section.border-border bg-card text-card-foreground rounded-lg border` | block   | visible    |    339 |    339 | no       |
| `div.min-w-0`                                                          | block   | visible    |    341 |    341 | no       |
| `div.grid grid-cols-1 gap-6 md:grid-cols-2`                            | grid    | visible    |   1174 |   1174 | no       |
| `div.mt-6 flex flex-col gap-6`                                         | flex    | visible    |   1174 |   1174 | no       |
| `div.mx-auto w-full flex-1 p-6 max-w-screen-2xl`                       | block   | visible    |   1302 |   1302 | no       |
| `main.col-start-2 row-start-2 flex min-h-0 min-w-0 flex-col overfl`    | flex    | auto       |    949 |   1302 | **yes**  |
| `div.relative grid h-dvh grid-cols-[auto_minmax(0,1fr)] grid-rows`     | grid    | hidden     |   1000 |   1000 | no       |
| `div.`                                                                 | block   | visible    |   1000 |   1000 | no       |
| `body.h-full`                                                          | block   | visible    |   1000 |   1000 | no       |

## D2 — box anatomy at 1646 wide

| Box                   | box height | heading block | rows | row heights                     |
| --------------------- | ---------: | ------------: | ---: | ------------------------------- |
| Jump back in          |        341 |            73 |    4 | 61, 61, 61, 60                  |
| Needs your attention  |        280 |            73 |    3 | 61, 61, 60                      |
| Where the work stands |        809 |            97 |    8 | 121, 81, 81, 81, 81, 81, 81, 80 |
| Recently changed      |        749 |            97 |    8 | 81, 81, 81, 81, 81, 81, 81, 60  |

Rows across all boxes: **min 60, median 81, max 121** px.

Chrome above the first box: **155 px**. Document height: **1000 px**.

## D2 — box anatomy at 1920 wide

| Box                   | box height | heading block | rows | row heights                     |
| --------------------- | ---------: | ------------: | ---: | ------------------------------- |
| Jump back in          |        341 |            73 |    4 | 61, 61, 61, 60                  |
| Needs your attention  |        280 |            73 |    3 | 61, 61, 60                      |
| Where the work stands |        789 |            97 |    8 | 101, 81, 81, 81, 81, 81, 81, 80 |
| Recently changed      |        749 |            97 |    8 | 81, 81, 81, 81, 81, 81, 81, 60  |

Rows across all boxes: **min 60, median 81, max 101** px.

Chrome above the first box: **155 px**. Document height: **1000 px**.

## D1 / D3 / D4 — what fits, per viewport height

Grid row gap, read from the live grid: **24 px**.

### At 1646 wide

Worst heading block **97 px**; median row **81 px**; tallest row **121 px**.

| Viewport height | grid gets | each box | body after heading | rows @ median | rows @ tallest |
| --------------: | --------: | -------: | -----------------: | ------------: | -------------: |
|            1200 |      1021 |      510 |                413 |         **5** |              3 |
|            1080 |       901 |      450 |                353 |         **4** |              2 |
|            1000 |       821 |      410 |                313 |         **3** |              2 |
|             900 |       721 |      360 |                263 |         **3** |              2 |
|             800 |       621 |      310 |                213 |         **2** |              1 |
|             700 |       521 |      260 |                163 |         **2** |              1 |

### At 1920 wide

Worst heading block **97 px**; median row **81 px**; tallest row **101 px**.

| Viewport height | grid gets | each box | body after heading | rows @ median | rows @ tallest |
| --------------: | --------: | -------: | -----------------: | ------------: | -------------: |
|            1200 |      1021 |      510 |                413 |         **5** |              4 |
|            1080 |       901 |      450 |                353 |         **4** |              3 |
|            1000 |       821 |      410 |                313 |         **3** |              3 |
|             900 |       721 |      360 |                263 |         **3** |              2 |
|             800 |       621 |      310 |                213 |         **2** |              2 |
|             700 |       521 |      260 |                163 |         **2** |              1 |

## What this does not establish

- **The rows are the shipped ones.** Tightening them changes every figure in D3, which is why the
  tightening is a separate question and has to be settled first.
- **One fixture, one set of states.** A row wraps differently for a long plan name or a long
  client name, and the tallest row here is the tallest this fixture produces, not the tallest.
- **Nothing here measures readability**, which is the half of the request that is a judgement
  rather than an arithmetic.
