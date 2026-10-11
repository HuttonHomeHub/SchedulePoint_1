> Raw harness output, `web 0.183.1`, taken 2026-10-09 on the shipped M1 tree (b65b505, 07686b2). With the 200 + 200 + 200 plan (SP_ROW_SUBJECT_MAXIMA=1). SC-2 control: 32 x W at 320 x 800. Taken before the needs-attention height line was added to the harness.

# M0 — the organisation landing, measured before anything is built

- **Taken:** 2026-10-09T16:29:41.405Z
- **Build:** `web 0.183.1 · api 0.88.1` (read off the shell footer, not assumed — see the harness docblock)
- **Organisation:** `m0-landing-1791563372338`, seeded by `landing-fixture.mjs`
- **Non-vacuity control:** PASS, 9 states asserted positively before any measurement

## FC-5 — requests to `…/overview` on one landing load

Counted **1** (bar: exactly 1).

## What the fixture holds

| Plan          | id                                     |
| ------------- | -------------------------------------- |
| projectId     | `01a1217f-a36a-7d51-a7a6-d4ad2b7648a7` |
| late          | `01a1217f-a44a-7603-9439-ae64f530f621` |
| onPlan        | `01a1217f-a575-7030-a4ac-dab42403af04` |
| stale         | `01a1217f-a650-78c1-9e65-e53516ea17aa` |
| never         | `01a1217f-a720-7f42-bcdd-b624992d6beb` |
| violating     | `01a1217f-a7ca-7982-8d66-dd62f51b50ba` |
| empty         | `01a1217f-a8c5-7e93-bcea-b3735ed75ff3` |
| liveInvite    | `01a1217f-a939-76e0-9ad0-ac0264bed02c` |
| expiredInvite | `01a1217f-a949-76a1-8a83-a83724b25eb6` |

## Row-subject matrix (maxima plan: YES)

| Cell             | Rows | Names clipped | Contexts clipped | Old instrument truncated runs | Name shown px / chars (median) | Context shown px / chars (median) | Median row h | Rows >1 line | min name col (chars) | doc overflow-x | Trailing clipped | Trailing beneath / of | Trailing off first line | Overlaps |
| ---------------- | ---: | ------------: | ---------------: | ----------------------------: | ------------------------------ | --------------------------------- | -----------: | -----------: | -------------------: | -------------: | ---------------: | --------------------: | ----------------------: | -------: |
| 1024x600         |   17 |             0 |                0 |                             0 | 239 px / 29                    | 284 px / 39                       |           81 |           16 |                   51 |              0 |                0 |                0 / 16 |                       0 |        0 |
| 1280x800         |   17 |             0 |                0 |                             0 | 239 px / 29                    | 284 px / 39                       |           61 |            8 |                   77 |              0 |                0 |                0 / 16 |                       0 |        0 |
| 1465x900         |   17 |             0 |                0 |                             0 | 239 px / 29                    | 284 px / 39                       |           61 |            5 |                   97 |              0 |                0 |                0 / 16 |                       0 |        0 |
| 1477x900         |   17 |             0 |                0 |                             0 | 239 px / 29                    | 284 px / 39                       |           81 |           17 |                   37 |              0 |                0 |                0 / 16 |                       0 |        0 |
| 1646x1000        |   17 |             0 |                0 |                             0 | 239 px / 29                    | 284 px / 39                       |           81 |           16 |                   45 |              0 |                0 |                0 / 16 |                       0 |        0 |
| 1912x948         |   17 |             0 |                0 |                             0 | 239 px / 29                    | 284 px / 39                       |           81 |           12 |                   54 |              0 |                0 |                0 / 16 |                       0 |        0 |
| 1912x1114        |   17 |             0 |                0 |                             0 | 239 px / 29                    | 284 px / 39                       |           81 |           12 |                   54 |              0 |                0 |                0 / 16 |                       0 |        0 |
| 320x800          |   17 |             0 |                0 |                             0 | 239 px / 29                    | 280 px / 39                       |          145 |           17 |                   23 |              0 |                0 |               16 / 16 |                       0 |        0 |
| 1280x800 font200 |   17 |             0 |                0 |                             0 | 479 px / 29                    | 567 px / 39                       |          249 |           17 |                   25 |              0 |                0 |                0 / 16 |                       0 |        0 |
| 1912x948 font200 |   17 |             0 |                0 |                             0 | 479 px / 29                    | 567 px / 39                       |          121 |            8 |                   58 |              0 |                0 |                0 / 16 |                       0 |        0 |
| 1280x800 spacing |   17 |             0 |                0 |                             0 | 306 px / 29                    | 365 px / 39                       |          143 |           12 |                   72 |              0 |                0 |                0 / 16 |                      16 |        0 |
| 1477x900 spacing |   17 |             0 |                0 |                             0 | 306 px / 29                    | 365 px / 39                       |          188 |           17 |                   32 |              0 |                0 |                0 / 16 |                      16 |        0 |
| 1912x948 spacing |   17 |             0 |                0 |                             0 | 306 px / 29                    | 365 px / 39                       |          143 |           17 |                   49 |              0 |                0 |                0 / 16 |                      16 |        0 |

### Per-cell detail: clipped subjects, whole rows per box

- **1024x600** (grid 699, tracks 699)
  - main scroll 2803/549; boxes: Jump back in: 1/1 whole, box 138 px, body 2803/549, min name col 68 ch; Where the work stands: 0/8 whole, box 1001 px, body 2803/549, min name col 55 ch; Recently changed: 0/8 whole, box 1025 px, body 2803/549, min name col 51 ch
- **1280x800** (grid 955, tracks 955)
  - main scroll 2371/749; boxes: Jump back in: 1/1 whole, box 138 px, body 2371/749, min name col 94 ch; Where the work stands: 0/8 whole, box 797 px, body 2371/749, min name col 81 ch; Recently changed: 0/8 whole, box 797 px, body 2371/749, min name col 77 ch
- **1465x900** (grid 1140, tracks 1140)
  - main scroll 2263/849; boxes: Jump back in: 1/1 whole, box 138 px, body 2263/849, min name col 114 ch; Where the work stands: 0/8 whole, box 733 px, body 2263/849, min name col 100 ch; Recently changed: 0/8 whole, box 753 px, body 2263/849, min name col 97 ch
- **1477x900** (grid 1152, tracks 564 + 564)
  - main scroll 849/849; boxes: Jump back in: 1/1 whole, box 463 px, body 389/389, min name col 54 ch; Where the work stands: 0/8 whole, box 234 px, body 991/116, min name col 40 ch; Recently changed: 0/8 whole, box 234 px, body 1059/136, min name col 37 ch
- **1646x1000** (grid 1321, tracks 649 + 649)
  - main scroll 949/949; boxes: Jump back in: 1/1 whole, box 463 px, body 389/389, min name col 62 ch; Where the work stands: 0/8 whole, box 334 px, body 947/236, min name col 49 ch; Recently changed: 0/8 whole, box 334 px, body 971/236, min name col 45 ch
- **1912x948** (grid 1488, tracks 732 + 732)
  - main scroll 897/897; boxes: Jump back in: 1/1 whole, box 463 px, body 389/389, min name col 71 ch; Where the work stands: 0/8 whole, box 282 px, body 823/184, min name col 58 ch; Recently changed: 0/8 whole, box 282 px, body 903/184, min name col 54 ch
- **1912x1114** (grid 1488, tracks 732 + 732)
  - main scroll 1063/1063; boxes: Jump back in: 1/1 whole, box 463 px, body 389/389, min name col 71 ch; Where the work stands: 1/8 whole, box 448 px, body 823/350, min name col 58 ch; Recently changed: 1/8 whole, box 448 px, body 903/350, min name col 54 ch
- **320x800** (grid 272, tracks 272)
  - main scroll 4743/701; boxes: Jump back in: 1/1 whole, box 202 px, body 4743/701, min name col 23 ch; Where the work stands: 0/8 whole, box 1897 px, body 4743/701, min name col 23 ch; Recently changed: 0/8 whole, box 1813 px, body 4743/701, min name col 23 ch
- **1280x800 font200** (grid 907, tracks 907)
  - main scroll 7499/701; boxes: Jump back in: 1/1 whole, box 314 px, body 7499/701, min name col 42 ch; Where the work stands: 0/8 whole, box 2793 px, body 7499/701, min name col 29 ch; Recently changed: 0/8 whole, box 3121 px, body 7499/701, min name col 25 ch
- **1912x948 font200** (grid 1539, tracks 1539)
  - main scroll 5003/849; boxes: Jump back in: 1/1 whole, box 274 px, body 5003/849, min name col 75 ch; Where the work stands: 0/8 whole, box 1625 px, body 5003/849, min name col 62 ch; Recently changed: 0/8 whole, box 1833 px, body 5003/849, min name col 58 ch
- **1280x800 spacing** (grid 955, tracks 955)
  - main scroll 3976/749; boxes: Jump back in: 1/1 whole, box 170 px, body 3976/749, min name col 94 ch; Where the work stands: 0/8 whole, box 1426 px, body 3976/749, min name col 77 ch; Recently changed: 0/8 whole, box 1534 px, body 3976/749, min name col 72 ch
- **1477x900 spacing** (grid 1152, tracks 564 + 564)
  - main scroll 1018/849; boxes: Jump back in: 1/1 whole, box 637 px, body 563/563, min name col 54 ch; Where the work stands: 0/8 whole, box 220 px, body 1800/72, min name col 37 ch; Recently changed: 0/8 whole, box 220 px, body 1986/93, min name col 32 ch
- **1912x948 spacing** (grid 1488, tracks 732 + 732)
  - main scroll 1018/897; boxes: Jump back in: 1/1 whole, box 637 px, body 563/563, min name col 71 ch; Where the work stands: 0/8 whole, box 220 px, body 1497/72, min name col 54 ch; Recently changed: 0/8 whole, box 220 px, body 1518/93, min name col 49 ch

### SC-2 positive control (32 x W injected into one context, 320 x 800)

- subject #0 ("Dockside — Quay Wall Reconstruction, Dockside Rege"): context clipped before = false, after = true (60/71 ch shown). Verdict: PASS (the probe saw the injected overflow)
