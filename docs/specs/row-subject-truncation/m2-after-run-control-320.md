> Raw harness output, `web 0.183.1`, taken 2026-10-09 on the shipped M1 tree (b65b505, 07686b2). Without the 200-character plan. SC-2 control: 32 x W at 320 x 800.

# M0 — the organisation landing, measured before anything is built

- **Taken:** 2026-10-09T16:28:57.750Z
- **Build:** `web 0.183.1 · api 0.88.1` (read off the shell footer, not assumed — see the harness docblock)
- **Organisation:** `m0-landing-1791563329232`, seeded by `landing-fixture.mjs`
- **Non-vacuity control:** PASS, 9 states asserted positively before any measurement

## FC-5 — requests to `…/overview` on one landing load

Counted **1** (bar: exactly 1).

## What the fixture holds

| Plan          | id                                     |
| ------------- | -------------------------------------- |
| projectId     | `01a1217e-f945-7971-b2d9-5abd346d3b29` |
| late          | `01a1217e-fa16-7bc0-ad93-67740f6e2b63` |
| onPlan        | `01a1217e-fb59-71d2-8c7f-0e2ad0a9dd4c` |
| stale         | `01a1217e-fc3d-7e41-8305-03e7edf2b241` |
| never         | `01a1217e-fd2e-7411-9e58-11e6809ba885` |
| violating     | `01a1217e-fdc4-7b81-aad7-6ff5fae9191d` |
| empty         | `01a1217e-fead-7b90-ba14-9cc4682f4f97` |
| liveInvite    | `01a1217e-ff16-7001-8760-7cf0fdac1bca` |
| expiredInvite | `01a1217e-ff25-7133-844a-a1675e21546d` |

## Row-subject matrix (maxima plan: no)

| Cell             | Rows | Names clipped | Contexts clipped | Old instrument truncated runs | Name shown px / chars (median) | Context shown px / chars (median) | Median row h | Rows >1 line | min name col (chars) | doc overflow-x | Trailing clipped | Trailing beneath / of | Trailing off first line | Overlaps |
| ---------------- | ---: | ------------: | ---------------: | ----------------------------: | ------------------------------ | --------------------------------- | -----------: | -----------: | -------------------: | -------------: | ---------------: | --------------------: | ----------------------: | -------: |
| 1024x600         |   17 |             0 |                0 |                             0 | 239 px / 29                    | 284 px / 39                       |           81 |           16 |                   51 |              0 |                0 |                0 / 16 |                       0 |        0 |
| 1280x800         |   17 |             0 |                0 |                             0 | 239 px / 29                    | 284 px / 39                       |           61 |            6 |                   77 |              0 |                0 |                0 / 16 |                       0 |        0 |
| 1465x900         |   17 |             0 |                0 |                             0 | 239 px / 29                    | 284 px / 39                       |           61 |            3 |                   97 |              0 |                0 |                0 / 16 |                       0 |        0 |
| 1477x900         |   17 |             0 |                0 |                             0 | 239 px / 29                    | 284 px / 39                       |           81 |           17 |                   37 |              0 |                0 |                0 / 16 |                       0 |        0 |
| 1646x1000        |   17 |             0 |                0 |                             0 | 239 px / 29                    | 284 px / 39                       |           81 |           16 |                   45 |              0 |                0 |                0 / 16 |                       0 |        0 |
| 1912x948         |   17 |             0 |                0 |                             0 | 239 px / 29                    | 284 px / 39                       |           81 |           11 |                   54 |              0 |                0 |                0 / 16 |                       0 |        0 |
| 1912x1114        |   17 |             0 |                0 |                             0 | 239 px / 29                    | 284 px / 39                       |           81 |           11 |                   54 |              0 |                0 |                0 / 16 |                       0 |        0 |
| 320x800          |   17 |             0 |                0 |                             0 | 239 px / 29                    | 280 px / 39                       |          145 |           17 |                   23 |              0 |                0 |               16 / 16 |                       0 |        0 |
| 1280x800 font200 |   17 |             0 |                0 |                             0 | 479 px / 29                    | 561 px / 39                       |          248 |           17 |                   25 |              0 |                0 |                0 / 16 |                       0 |        0 |
| 1912x948 font200 |   17 |             0 |                0 |                             0 | 479 px / 29                    | 567 px / 39                       |          121 |            6 |                   58 |              0 |                0 |                0 / 16 |                       0 |        0 |
| 1280x800 spacing |   17 |             0 |                0 |                             0 | 306 px / 29                    | 365 px / 39                       |          143 |           11 |                   72 |              0 |                0 |                0 / 16 |                      16 |        0 |
| 1477x900 spacing |   17 |             0 |                0 |                             0 | 306 px / 29                    | 358 px / 39                       |          187 |           17 |                   32 |              0 |                0 |                0 / 16 |                      16 |        0 |
| 1912x948 spacing |   17 |             0 |                0 |                             0 | 306 px / 29                    | 365 px / 39                       |          143 |           17 |                   49 |              0 |                0 |                0 / 16 |                      16 |        0 |

### Per-cell detail: clipped subjects, whole rows per box

- **1024x600** (grid 699, tracks 699)
  - main scroll 2459/549; boxes: Jump back in: 1/1 whole, box 138 px, body 2459/549, min name col 68 ch; Where the work stands: 0/8 whole, box 829 px, body 2459/549, min name col 55 ch; Recently changed: 0/8 whole, box 853 px, body 2459/549, min name col 51 ch
- **1280x800** (grid 955, tracks 955)
  - main scroll 2115/749; boxes: Jump back in: 1/1 whole, box 138 px, body 2115/749, min name col 94 ch; Where the work stands: 0/8 whole, box 669 px, body 2115/749, min name col 81 ch; Recently changed: 0/8 whole, box 669 px, body 2115/749, min name col 77 ch
- **1465x900** (grid 1140, tracks 1140)
  - main scroll 2055/849; boxes: Jump back in: 1/1 whole, box 138 px, body 2055/849, min name col 114 ch; Where the work stands: 0/8 whole, box 629 px, body 2055/849, min name col 100 ch; Recently changed: 0/8 whole, box 649 px, body 2055/849, min name col 97 ch
- **1477x900** (grid 1152, tracks 564 + 564)
  - main scroll 849/849; boxes: Jump back in: 1/1 whole, box 463 px, body 389/389, min name col 54 ch; Where the work stands: 0/8 whole, box 234 px, body 755/116, min name col 40 ch; Recently changed: 1/8 whole, box 234 px, body 779/136, min name col 37 ch
- **1646x1000** (grid 1321, tracks 649 + 649)
  - main scroll 949/949; boxes: Jump back in: 1/1 whole, box 463 px, body 389/389, min name col 62 ch; Where the work stands: 2/8 whole, box 334 px, body 755/236, min name col 49 ch; Recently changed: 2/8 whole, box 334 px, body 755/236, min name col 45 ch
- **1912x948** (grid 1488, tracks 732 + 732)
  - main scroll 897/897; boxes: Jump back in: 1/1 whole, box 463 px, body 389/389, min name col 71 ch; Where the work stands: 1/8 whole, box 282 px, body 631/184, min name col 58 ch; Recently changed: 1/8 whole, box 282 px, body 731/184, min name col 54 ch
- **1912x1114** (grid 1488, tracks 732 + 732)
  - main scroll 1063/1063; boxes: Jump back in: 1/1 whole, box 463 px, body 389/389, min name col 71 ch; Where the work stands: 3/8 whole, box 448 px, body 631/350, min name col 58 ch; Recently changed: 3/8 whole, box 448 px, body 731/350, min name col 54 ch
- **320x800** (grid 272, tracks 272)
  - main scroll 3887/701; boxes: Jump back in: 1/1 whole, box 202 px, body 3887/701, min name col 23 ch; Where the work stands: 0/8 whole, box 1469 px, body 3887/701, min name col 23 ch; Recently changed: 0/8 whole, box 1385 px, body 3887/701, min name col 23 ch
- **1280x800 font200** (grid 907, tracks 907)
  - main scroll 6043/701; boxes: Jump back in: 1/1 whole, box 314 px, body 6043/701, min name col 42 ch; Where the work stands: 0/8 whole, box 2105 px, body 6043/701, min name col 29 ch; Recently changed: 0/8 whole, box 2353 px, body 6043/701, min name col 25 ch
- **1912x948 font200** (grid 1539, tracks 1539)
  - main scroll 4323/849; boxes: Jump back in: 1/1 whole, box 274 px, body 4323/849, min name col 75 ch; Where the work stands: 0/8 whole, box 1329 px, body 4323/849, min name col 62 ch; Recently changed: 0/8 whole, box 1449 px, body 4323/849, min name col 58 ch
- **1280x800 spacing** (grid 955, tracks 955)
  - main scroll 3646/749; boxes: Jump back in: 1/1 whole, box 170 px, body 3646/749, min name col 94 ch; Where the work stands: 0/8 whole, box 1273 px, body 3646/749, min name col 77 ch; Recently changed: 0/8 whole, box 1357 px, body 3646/749, min name col 72 ch
- **1477x900 spacing** (grid 1152, tracks 564 + 564)
  - main scroll 1018/849; boxes: Jump back in: 1/1 whole, box 637 px, body 563/563, min name col 54 ch; Where the work stands: 0/8 whole, box 220 px, body 1446/72, min name col 37 ch; Recently changed: 0/8 whole, box 220 px, body 1590/93, min name col 32 ch
- **1912x948 spacing** (grid 1488, tracks 732 + 732)
  - main scroll 1018/897; boxes: Jump back in: 1/1 whole, box 637 px, body 563/563, min name col 71 ch; Where the work stands: 0/8 whole, box 220 px, body 1254/72, min name col 54 ch; Recently changed: 0/8 whole, box 220 px, body 1254/93, min name col 49 ch

### SC-2 positive control (32 x W injected into one context, 320 x 800)

- subject #0 ("Dockside — Quay Wall Reconstruction, Dockside Rege"): context clipped before = false, after = true (60/71 ch shown). Verdict: PASS (the probe saw the injected overflow)
