> Raw harness output, `web 0.183.1`, taken 2026-10-09 on the shipped M1 tree (b65b505, 07686b2). The unchanged tree for comparison: list-row.tsx temporarily restored to its pre-M1 text (b65b505^), harness unchanged otherwise; the overlap column fires on the old tree because Chrome returns a second rect for a truncated run. SC-2 control 32 x W at 1280 x 800.

# M0 — the organisation landing, measured before anything is built

- **Taken:** 2026-10-09T16:31:47.841Z
- **Build:** `web 0.183.1 · api 0.88.1` (read off the shell footer, not assumed — see the harness docblock)
- **Organisation:** `m0-landing-1791563499120`, seeded by `landing-fixture.mjs`
- **Non-vacuity control:** PASS, 9 states asserted positively before any measurement

## FC-5 — requests to `…/overview` on one landing load

Counted **1** (bar: exactly 1).

## What the fixture holds

| Plan          | id                                     |
| ------------- | -------------------------------------- |
| projectId     | `01a12181-9141-7e50-910b-fbfb8b478388` |
| late          | `01a12181-9223-7160-b17e-29451639a2b9` |
| onPlan        | `01a12181-937e-7b10-bb79-3e4cd47d223c` |
| stale         | `01a12181-946b-77d0-a2c9-f6d37ec6a68f` |
| never         | `01a12181-9566-7e93-a48b-8bac8f135630` |
| violating     | `01a12181-9612-70e3-a560-2577495b9a08` |
| empty         | `01a12181-973a-7701-b7ee-ac315f8b1d92` |
| liveInvite    | `01a12181-97a8-79c0-b0e2-ee7215d19c38` |
| expiredInvite | `01a12181-97b7-7342-a226-4010e661611d` |

## Row-subject matrix (maxima plan: no)

| Cell             | Rows | Names clipped | Contexts clipped | Old instrument truncated runs | Name shown px / chars (median) | Context shown px / chars (median) | Median row h | Rows >1 line | min name col (chars) | doc overflow-x | Trailing clipped | Trailing beneath / of | Trailing off first line | Overlaps |
| ---------------- | ---: | ------------: | ---------------: | ----------------------------: | ------------------------------ | --------------------------------- | -----------: | -----------: | -------------------: | -------------: | ---------------: | --------------------: | ----------------------: | -------: |
| 1024x600         |   17 |            16 |               16 |                            16 | 208 px / 23                    | 232 px / 31                       |           61 |            0 |                   51 |              0 |                0 |                0 / 16 |                       0 |       46 |
| 1280x800         |   17 |             6 |                6 |                             6 | 213 px / 24                    | 284 px / 39                       |           61 |            0 |                   57 |              0 |                0 |                0 / 16 |                       0 |       20 |
| 1465x900         |   17 |             3 |                3 |                             3 | 213 px / 24                    | 284 px / 39                       |           61 |            0 |                   57 |              0 |                0 |                0 / 16 |                       0 |        8 |
| 1477x900         |   17 |            17 |               17 |                            17 | 181 px / 20                    | 124 px / 16                       |           61 |            0 |                   37 |              0 |                0 |                0 / 16 |                       0 |       58 |
| 1646x1000        |   17 |            16 |               16 |                            16 | 198 px / 22                    | 191 px / 25                       |           61 |            0 |                   45 |              0 |                0 |                0 / 16 |                       0 |       56 |
| 1912x948         |   17 |            11 |               11 |                            11 | 213 px / 24                    | 258 px / 35                       |           61 |            0 |                   54 |              0 |                0 |                0 / 16 |                       0 |       36 |
| 1912x1114        |   17 |            11 |               11 |                            11 | 213 px / 24                    | 258 px / 35                       |           61 |            0 |                   54 |              0 |                0 |                0 / 16 |                       0 |       36 |
| 320x800          |   17 |            17 |               17 |                            17 | 42 px / 4                      | 0 px / 0                          |           81 |            0 |                    6 |              0 |                0 |                0 / 16 |                      16 |       52 |
| 1280x800 font200 |   17 |            17 |               17 |                            17 | 317 px / 18                    | 73 px / 4                         |          121 |            0 |                   25 |              0 |                0 |                0 / 16 |                       0 |       66 |
| 1912x948 font200 |   17 |             6 |                6 |                             6 | 426 px / 24                    | 567 px / 39                       |          121 |            0 |                   57 |              0 |                0 |                0 / 16 |                       0 |       26 |
| 1280x800 spacing |   17 |            11 |               11 |                            11 | 277 px / 24                    | 361 px / 38                       |          122 |            0 |                   72 |              0 |                0 |                0 / 16 |                      16 |       36 |
| 1477x900 spacing |   17 |            17 |               17 |                            17 | 207 px / 18                    | 49 px / 5                         |          122 |            0 |                   32 |              0 |                0 |                0 / 16 |                      16 |       78 |
| 1912x948 spacing |   17 |            17 |               17 |                            17 | 241 px / 21                    | 183 px / 20                       |          122 |            0 |                   49 |              0 |                0 |                0 / 16 |                      16 |       60 |

### Per-cell detail: clipped subjects, whole rows per box

- **1024x600** (grid 699, tracks 699)
  - needs-attention row heights: 61, 61, 61, 61, 61, 60
  - main scroll 1995/549; boxes: Jump back in: 1/1 whole, box 138 px, body 1995/549, min name col 59 ch; Where the work stands: 0/8 whole, box 609 px, body 1995/549, min name col 55 ch; Recently changed: 0/8 whole, box 609 px, body 1995/549, min name col 51 ch
  - Where the work stands: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2BDr" name CLIPPED 36/49 ch (341/461 px); context CLIPPED 17/76 ch (128/584 px)
  - Where the work stands: "EDF - Hynamics ProposalDraftEstuary Crossing Programme — Wes" name CLIPPED 16/20 ch (156/184 px); context CLIPPED 39/76 ch (314/584 px)
  - Where the work stands: "NetPoint reference: power-plant programmeDraftEstuary Crossi" name CLIPPED 31/38 ch (257/326 px); context CLIPPED 26/76 ch (213/584 px)
  - Where the work stands: "Dockside — Ancillary works 6DraftDockside Regeneration · Har" name CLIPPED 23/24 ch (208/213 px); context CLIPPED 35/39 ch (262/284 px)
  - Where the work stands: "Dockside — Ancillary works 5DraftDockside Regeneration · Har" name CLIPPED 23/24 ch (208/213 px); context CLIPPED 35/39 ch (262/284 px)
  - Where the work stands: "Dockside — Ancillary works 4DraftDockside Regeneration · Har" name CLIPPED 23/24 ch (208/213 px); context CLIPPED 35/39 ch (262/284 px)
  - Where the work stands: "Dockside — Ancillary works 3DraftDockside Regeneration · Har" name CLIPPED 23/24 ch (208/213 px); context CLIPPED 35/39 ch (262/284 px)
  - Where the work stands: "Dockside — Ancillary works 2DraftDockside Regeneration · Har" name CLIPPED 23/24 ch (208/213 px); context CLIPPED 35/39 ch (262/284 px)
  - Recently changed: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2BDr" name CLIPPED 35/49 ch (333/461 px); context CLIPPED 14/76 ch (99/584 px)
  - Recently changed: "EDF - Hynamics ProposalDraftEstuary Crossing Programme — Wes" name CLIPPED 15/20 ch (152/184 px); context CLIPPED 35/76 ch (280/584 px)
  - Recently changed: "NetPoint reference: power-plant programmeDraftEstuary Crossi" name CLIPPED 30/38 ch (251/326 px); context CLIPPED 24/76 ch (181/584 px)
  - Recently changed: "Dockside — Ancillary works 6DraftDockside Regeneration · Har" name CLIPPED 23/24 ch (200/213 px); context CLIPPED 31/39 ch (232/284 px)
  - Recently changed: "Dockside — Ancillary works 5DraftDockside Regeneration · Har" name CLIPPED 23/24 ch (200/213 px); context CLIPPED 31/39 ch (232/284 px)
  - Recently changed: "Dockside — Ancillary works 4DraftDockside Regeneration · Har" name CLIPPED 23/24 ch (200/213 px); context CLIPPED 31/39 ch (232/284 px)
  - Recently changed: "Dockside — Ancillary works 3DraftDockside Regeneration · Har" name CLIPPED 23/24 ch (200/213 px); context CLIPPED 31/39 ch (232/284 px)
  - Recently changed: "Dockside — Ancillary works 2DraftDockside Regeneration · Har" name CLIPPED 23/24 ch (200/213 px); context CLIPPED 31/39 ch (232/284 px)
- **1280x800** (grid 955, tracks 955)
  - needs-attention row heights: 61, 61, 61, 61, 61, 60
  - main scroll 1995/749; boxes: Jump back in: 1/1 whole, box 138 px, body 1995/749, min name col 59 ch; Where the work stands: 0/8 whole, box 609 px, body 1995/749, min name col 57 ch; Recently changed: 0/8 whole, box 609 px, body 1995/749, min name col 57 ch
  - Where the work stands: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2BDr" name CLIPPED 42/49 ch (395/461 px); context CLIPPED 42/76 ch (331/584 px)
  - Where the work stands: "EDF - Hynamics ProposalDraftEstuary Crossing Programme — Wes" name CLIPPED 19/20 ch (180/184 px); context CLIPPED 69/76 ch (545/584 px)
  - Where the work stands: "NetPoint reference: power-plant programmeDraftEstuary Crossi" name CLIPPED 35/38 ch (297/326 px); context CLIPPED 55/76 ch (428/584 px)
  - Recently changed: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2BDr" name CLIPPED 41/49 ch (387/461 px); context CLIPPED 38/76 ch (301/584 px)
  - Recently changed: "EDF - Hynamics ProposalDraftEstuary Crossing Programme — Wes" name CLIPPED 18/20 ch (176/184 px); context CLIPPED 65/76 ch (512/584 px)
  - Recently changed: "NetPoint reference: power-plant programmeDraftEstuary Crossi" name CLIPPED 35/38 ch (291/326 px); context CLIPPED 50/76 ch (397/584 px)
- **1465x900** (grid 1140, tracks 1140)
  - needs-attention row heights: 61, 61, 61, 61, 61, 60
  - main scroll 1995/849; boxes: Jump back in: 1/1 whole, box 138 px, body 1995/849, min name col 59 ch; Where the work stands: 0/8 whole, box 609 px, body 1995/849, min name col 57 ch; Recently changed: 0/8 whole, box 609 px, body 1995/849, min name col 57 ch
  - Where the work stands: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2BDr" name CLIPPED 46/49 ch (433/461 px); context CLIPPED 60/76 ch (477/584 px)
  - Recently changed: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2BDr" name CLIPPED 45/49 ch (425/461 px); context CLIPPED 57/76 ch (448/584 px)
  - Recently changed: "NetPoint reference: power-plant programmeDraftEstuary Crossi" name CLIPPED 37/38 ch (320/326 px); context CLIPPED 70/76 ch (553/584 px)
- **1477x900** (grid 1152, tracks 564 + 564)
  - needs-attention row heights: 61, 61, 61, 61, 61, 60
  - main scroll 849/849; boxes: Jump back in: 1/1 whole, box 463 px, body 389/389, min name col 54 ch; Where the work stands: 1/8 whole, box 234 px, body 511/116, min name col 40 ch; Recently changed: 2/8 whole, box 234 px, body 511/136, min name col 37 ch
  - Jump back in: "Dockside — Quay Wall ReconstructionDockside Regeneration · H" name CLIPPED 29/31 ch (263/276 px); context CLIPPED 32/39 ch (243/284 px)
  - Where the work stands: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2BDr" name CLIPPED 33/49 ch (313/461 px); context CLIPPED 3/76 ch (21/584 px)
  - Where the work stands: "EDF - Hynamics ProposalDraftEstuary Crossing Programme — Wes" name CLIPPED 14/20 ch (143/184 px); context CLIPPED 24/76 ch (192/584 px)
  - Where the work stands: "NetPoint reference: power-plant programmeDraftEstuary Crossi" name CLIPPED 28/38 ch (236/326 px); context CLIPPED 14/76 ch (99/584 px)
  - Where the work stands: "Dockside — Ancillary works 6DraftDockside Regeneration · Har" name CLIPPED 20/24 ch (181/213 px); context CLIPPED 21/39 ch (154/284 px)
  - Where the work stands: "Dockside — Ancillary works 5DraftDockside Regeneration · Har" name CLIPPED 20/24 ch (181/213 px); context CLIPPED 21/39 ch (154/284 px)
  - Where the work stands: "Dockside — Ancillary works 4DraftDockside Regeneration · Har" name CLIPPED 20/24 ch (181/213 px); context CLIPPED 21/39 ch (154/284 px)
  - Where the work stands: "Dockside — Ancillary works 3DraftDockside Regeneration · Har" name CLIPPED 20/24 ch (181/213 px); context CLIPPED 21/39 ch (154/284 px)
  - Where the work stands: "Dockside — Ancillary works 2DraftDockside Regeneration · Har" name CLIPPED 20/24 ch (181/213 px); context CLIPPED 21/39 ch (154/284 px)
  - Recently changed: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2BDr" name CLIPPED 31/49 ch (297/461 px); context CLIPPED 0/76 ch (0/584 px)
  - Recently changed: "EDF - Hynamics ProposalDraftEstuary Crossing Programme — Wes" name CLIPPED 14/20 ch (139/184 px); context CLIPPED 21/76 ch (158/584 px)
  - Recently changed: "NetPoint reference: power-plant programmeDraftEstuary Crossi" name CLIPPED 27/38 ch (230/326 px); context CLIPPED 9/76 ch (67/584 px)
  - Recently changed: "Dockside — Ancillary works 6DraftDockside Regeneration · Har" name CLIPPED 19/24 ch (173/213 px); context CLIPPED 16/39 ch (124/284 px)
  - Recently changed: "Dockside — Ancillary works 5DraftDockside Regeneration · Har" name CLIPPED 19/24 ch (173/213 px); context CLIPPED 16/39 ch (124/284 px)
  - Recently changed: "Dockside — Ancillary works 4DraftDockside Regeneration · Har" name CLIPPED 19/24 ch (173/213 px); context CLIPPED 16/39 ch (124/284 px)
  - Recently changed: "Dockside — Ancillary works 3DraftDockside Regeneration · Har" name CLIPPED 19/24 ch (173/213 px); context CLIPPED 16/39 ch (124/284 px)
  - Recently changed: "Dockside — Ancillary works 2DraftDockside Regeneration · Har" name CLIPPED 19/24 ch (173/213 px); context CLIPPED 16/39 ch (124/284 px)
- **1646x1000** (grid 1321, tracks 649 + 649)
  - needs-attention row heights: 61, 61, 61, 61, 61, 60
  - main scroll 949/949; boxes: Jump back in: 1/1 whole, box 463 px, body 389/389, min name col 59 ch; Where the work stands: 3/8 whole, box 334 px, body 511/236, min name col 49 ch; Recently changed: 3/8 whole, box 334 px, body 511/236, min name col 45 ch
  - Where the work stands: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2BDr" name CLIPPED 34/49 ch (331/461 px); context CLIPPED 12/76 ch (88/584 px)
  - Where the work stands: "EDF - Hynamics ProposalDraftEstuary Crossing Programme — Wes" name CLIPPED 15/20 ch (151/184 px); context CLIPPED 33/76 ch (268/584 px)
  - Where the work stands: "NetPoint reference: power-plant programmeDraftEstuary Crossi" name CLIPPED 29/38 ch (249/326 px); context CLIPPED 22/76 ch (170/584 px)
  - Where the work stands: "Dockside — Ancillary works 6DraftDockside Regeneration · Har" name CLIPPED 22/24 ch (198/213 px); context CLIPPED 30/39 ch (221/284 px)
  - Where the work stands: "Dockside — Ancillary works 5DraftDockside Regeneration · Har" name CLIPPED 22/24 ch (198/213 px); context CLIPPED 30/39 ch (221/284 px)
  - Where the work stands: "Dockside — Ancillary works 4DraftDockside Regeneration · Har" name CLIPPED 22/24 ch (198/213 px); context CLIPPED 30/39 ch (221/284 px)
  - Where the work stands: "Dockside — Ancillary works 3DraftDockside Regeneration · Har" name CLIPPED 22/24 ch (198/213 px); context CLIPPED 30/39 ch (221/284 px)
  - Where the work stands: "Dockside — Ancillary works 2DraftDockside Regeneration · Har" name CLIPPED 22/24 ch (198/213 px); context CLIPPED 30/39 ch (221/284 px)
  - Recently changed: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2BDr" name CLIPPED 34/49 ch (323/461 px); context CLIPPED 7/76 ch (59/584 px)
  - Recently changed: "EDF - Hynamics ProposalDraftEstuary Crossing Programme — Wes" name CLIPPED 15/20 ch (147/184 px); context CLIPPED 29/76 ch (234/584 px)
  - Recently changed: "NetPoint reference: power-plant programmeDraftEstuary Crossi" name CLIPPED 29/38 ch (243/326 px); context CLIPPED 19/76 ch (138/584 px)
  - Recently changed: "Dockside — Ancillary works 6DraftDockside Regeneration · Har" name CLIPPED 21/24 ch (190/213 px); context CLIPPED 25/39 ch (191/284 px)
  - Recently changed: "Dockside — Ancillary works 5DraftDockside Regeneration · Har" name CLIPPED 21/24 ch (190/213 px); context CLIPPED 25/39 ch (191/284 px)
  - Recently changed: "Dockside — Ancillary works 4DraftDockside Regeneration · Har" name CLIPPED 21/24 ch (190/213 px); context CLIPPED 25/39 ch (191/284 px)
  - Recently changed: "Dockside — Ancillary works 3DraftDockside Regeneration · Har" name CLIPPED 21/24 ch (190/213 px); context CLIPPED 25/39 ch (191/284 px)
  - Recently changed: "Dockside — Ancillary works 2DraftDockside Regeneration · Har" name CLIPPED 21/24 ch (190/213 px); context CLIPPED 25/39 ch (191/284 px)
- **1912x948** (grid 1488, tracks 732 + 732)
  - needs-attention row heights: 61, 61, 61, 61, 61, 60
  - main scroll 897/897; boxes: Jump back in: 1/1 whole, box 463 px, body 389/389, min name col 59 ch; Where the work stands: 3/8 whole, box 282 px, body 511/184, min name col 57 ch; Recently changed: 3/8 whole, box 282 px, body 511/184, min name col 54 ch
  - Where the work stands: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2BDr" name CLIPPED 36/49 ch (348/461 px); context CLIPPED 21/76 ch (154/584 px)
  - Where the work stands: "EDF - Hynamics ProposalDraftEstuary Crossing Programme — Wes" name CLIPPED 16/20 ch (159/184 px); context CLIPPED 43/76 ch (344/584 px)
  - Where the work stands: "NetPoint reference: power-plant programmeDraftEstuary Crossi" name CLIPPED 31/38 ch (262/326 px); context CLIPPED 30/76 ch (240/584 px)
  - Recently changed: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2BDr" name CLIPPED 36/49 ch (340/461 px); context CLIPPED 17/76 ch (125/584 px)
  - Recently changed: "EDF - Hynamics ProposalDraftEstuary Crossing Programme — Wes" name CLIPPED 16/20 ch (155/184 px); context CLIPPED 39/76 ch (310/584 px)
  - Recently changed: "NetPoint reference: power-plant programmeDraftEstuary Crossi" name CLIPPED 31/38 ch (256/326 px); context CLIPPED 25/76 ch (209/584 px)
  - Recently changed: "Dockside — Ancillary works 6DraftDockside Regeneration · Har" name CLIPPED 23/24 ch (207/213 px); context CLIPPED 35/39 ch (258/284 px)
  - Recently changed: "Dockside — Ancillary works 5DraftDockside Regeneration · Har" name CLIPPED 23/24 ch (207/213 px); context CLIPPED 35/39 ch (258/284 px)
  - Recently changed: "Dockside — Ancillary works 4DraftDockside Regeneration · Har" name CLIPPED 23/24 ch (207/213 px); context CLIPPED 35/39 ch (258/284 px)
  - Recently changed: "Dockside — Ancillary works 3DraftDockside Regeneration · Har" name CLIPPED 23/24 ch (207/213 px); context CLIPPED 35/39 ch (258/284 px)
  - Recently changed: "Dockside — Ancillary works 2DraftDockside Regeneration · Har" name CLIPPED 23/24 ch (207/213 px); context CLIPPED 35/39 ch (258/284 px)
- **1912x1114** (grid 1488, tracks 732 + 732)
  - needs-attention row heights: 61, 61, 61, 61, 61, 60
  - main scroll 1063/1063; boxes: Jump back in: 1/1 whole, box 463 px, body 389/389, min name col 59 ch; Where the work stands: 5/8 whole, box 448 px, body 511/350, min name col 57 ch; Recently changed: 5/8 whole, box 448 px, body 511/350, min name col 54 ch
  - Where the work stands: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2BDr" name CLIPPED 36/49 ch (348/461 px); context CLIPPED 21/76 ch (154/584 px)
  - Where the work stands: "EDF - Hynamics ProposalDraftEstuary Crossing Programme — Wes" name CLIPPED 16/20 ch (159/184 px); context CLIPPED 43/76 ch (344/584 px)
  - Where the work stands: "NetPoint reference: power-plant programmeDraftEstuary Crossi" name CLIPPED 31/38 ch (262/326 px); context CLIPPED 30/76 ch (240/584 px)
  - Recently changed: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2BDr" name CLIPPED 36/49 ch (340/461 px); context CLIPPED 17/76 ch (125/584 px)
  - Recently changed: "EDF - Hynamics ProposalDraftEstuary Crossing Programme — Wes" name CLIPPED 16/20 ch (155/184 px); context CLIPPED 39/76 ch (310/584 px)
  - Recently changed: "NetPoint reference: power-plant programmeDraftEstuary Crossi" name CLIPPED 31/38 ch (256/326 px); context CLIPPED 25/76 ch (209/584 px)
  - Recently changed: "Dockside — Ancillary works 6DraftDockside Regeneration · Har" name CLIPPED 23/24 ch (207/213 px); context CLIPPED 35/39 ch (258/284 px)
  - Recently changed: "Dockside — Ancillary works 5DraftDockside Regeneration · Har" name CLIPPED 23/24 ch (207/213 px); context CLIPPED 35/39 ch (258/284 px)
  - Recently changed: "Dockside — Ancillary works 4DraftDockside Regeneration · Har" name CLIPPED 23/24 ch (207/213 px); context CLIPPED 35/39 ch (258/284 px)
  - Recently changed: "Dockside — Ancillary works 3DraftDockside Regeneration · Har" name CLIPPED 23/24 ch (207/213 px); context CLIPPED 35/39 ch (258/284 px)
  - Recently changed: "Dockside — Ancillary works 2DraftDockside Regeneration · Har" name CLIPPED 23/24 ch (207/213 px); context CLIPPED 35/39 ch (258/284 px)
- **320x800** (grid 272, tracks 272)
  - needs-attention row heights: 85, 85, 85, 85, 85, 80
  - main scroll 2631/701; boxes: Jump back in: 1/1 whole, box 138 px, body 2631/701, min name col 23 ch; Where the work stands: 0/8 whole, box 873 px, body 2631/701, min name col 10 ch; Recently changed: 0/8 whole, box 789 px, body 2631/701, min name col 6 ch
  - Jump back in: "Dockside — Quay Wall ReconstructionDockside Regeneration · H" name CLIPPED 19/31 ch (191/276 px); context CLIPPED 2/39 ch (23/284 px)
  - Where the work stands: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2BDr" name CLIPPED 5/49 ch (42/461 px); context CLIPPED 0/76 ch (0/584 px)
  - Where the work stands: "EDF - Hynamics ProposalDraftEstuary Crossing Programme — Wes" name CLIPPED 4/20 ch (42/184 px); context CLIPPED 0/76 ch (0/584 px)
  - Where the work stands: "NetPoint reference: power-plant programmeDraftEstuary Crossi" name CLIPPED 4/38 ch (42/326 px); context CLIPPED 0/76 ch (0/584 px)
  - Where the work stands: "Dockside — Ancillary works 6DraftDockside Regeneration · Har" name CLIPPED 4/24 ch (42/213 px); context CLIPPED 0/39 ch (0/284 px)
  - Where the work stands: "Dockside — Ancillary works 5DraftDockside Regeneration · Har" name CLIPPED 4/24 ch (42/213 px); context CLIPPED 0/39 ch (0/284 px)
  - Where the work stands: "Dockside — Ancillary works 4DraftDockside Regeneration · Har" name CLIPPED 4/24 ch (42/213 px); context CLIPPED 0/39 ch (0/284 px)
  - Where the work stands: "Dockside — Ancillary works 3DraftDockside Regeneration · Har" name CLIPPED 4/24 ch (42/213 px); context CLIPPED 0/39 ch (0/284 px)
  - Where the work stands: "Dockside — Ancillary works 2DraftDockside Regeneration · Har" name CLIPPED 4/24 ch (42/213 px); context CLIPPED 0/39 ch (0/284 px)
  - Recently changed: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2BDr" name CLIPPED 0/49 ch (5/461 px); context CLIPPED 0/76 ch (0/584 px)
  - Recently changed: "EDF - Hynamics ProposalDraftEstuary Crossing Programme — Wes" name CLIPPED 0/20 ch (5/184 px); context CLIPPED 0/76 ch (0/584 px)
  - Recently changed: "NetPoint reference: power-plant programmeDraftEstuary Crossi" name CLIPPED 0/38 ch (5/326 px); context CLIPPED 0/76 ch (0/584 px)
  - Recently changed: "Dockside — Ancillary works 6DraftDockside Regeneration · Har" name CLIPPED 0/24 ch (5/213 px); context CLIPPED 0/39 ch (0/284 px)
  - Recently changed: "Dockside — Ancillary works 5DraftDockside Regeneration · Har" name CLIPPED 0/24 ch (5/213 px); context CLIPPED 0/39 ch (0/284 px)
  - Recently changed: "Dockside — Ancillary works 4DraftDockside Regeneration · Har" name CLIPPED 0/24 ch (5/213 px); context CLIPPED 0/39 ch (0/284 px)
  - Recently changed: "Dockside — Ancillary works 3DraftDockside Regeneration · Har" name CLIPPED 0/24 ch (5/213 px); context CLIPPED 0/39 ch (0/284 px)
  - Recently changed: "Dockside — Ancillary works 2DraftDockside Regeneration · Har" name CLIPPED 0/24 ch (5/213 px); context CLIPPED 0/39 ch (0/284 px)
- **1280x800 font200** (grid 907, tracks 907)
  - needs-attention row heights: 121, 121, 121, 121, 121, 120
  - main scroll 4003/701; boxes: Jump back in: 1/1 whole, box 274 px, body 4003/701, min name col 42 ch; Where the work stands: 0/8 whole, box 1249 px, body 4003/701, min name col 29 ch; Recently changed: 0/8 whole, box 1209 px, body 4003/701, min name col 25 ch
  - Jump back in: "Dockside — Quay Wall ReconstructionDockside Regeneration · H" name CLIPPED 25/31 ch (472/551 px); context CLIPPED 21/39 ch (321/567 px)
  - Where the work stands: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2BDr" name CLIPPED 24/49 ch (450/922 px); context CLIPPED 0/76 ch (0/1167 px)
  - Where the work stands: "EDF - Hynamics ProposalDraftEstuary Crossing Programme — Wes" name CLIPPED 13/20 ch (265/368 px); context CLIPPED 13/76 ch (185/1167 px)
  - Where the work stands: "NetPoint reference: power-plant programmeDraftEstuary Crossi" name CLIPPED 26/38 ch (437/652 px); context CLIPPED 0/76 ch (13/1167 px)
  - Where the work stands: "Dockside — Ancillary works 6DraftDockside Regeneration · Har" name CLIPPED 18/24 ch (317/426 px); context CLIPPED 8/39 ch (132/567 px)
  - Where the work stands: "Dockside — Ancillary works 5DraftDockside Regeneration · Har" name CLIPPED 18/24 ch (317/426 px); context CLIPPED 8/39 ch (132/567 px)
  - Where the work stands: "Dockside — Ancillary works 4DraftDockside Regeneration · Har" name CLIPPED 18/24 ch (317/426 px); context CLIPPED 8/39 ch (132/567 px)
  - Where the work stands: "Dockside — Ancillary works 3DraftDockside Regeneration · Har" name CLIPPED 18/24 ch (317/426 px); context CLIPPED 8/39 ch (132/567 px)
  - Where the work stands: "Dockside — Ancillary works 2DraftDockside Regeneration · Har" name CLIPPED 18/24 ch (317/426 px); context CLIPPED 8/39 ch (132/567 px)
  - Recently changed: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2BDr" name CLIPPED 19/49 ch (375/922 px); context CLIPPED 0/76 ch (0/1167 px)
  - Recently changed: "EDF - Hynamics ProposalDraftEstuary Crossing Programme — Wes" name CLIPPED 12/20 ch (258/368 px); context CLIPPED 7/76 ch (117/1167 px)
  - Recently changed: "NetPoint reference: power-plant programmeDraftEstuary Crossi" name CLIPPED 22/38 ch (375/652 px); context CLIPPED 0/76 ch (0/1167 px)
  - Recently changed: "Dockside — Ancillary works 6DraftDockside Regeneration · Har" name CLIPPED 17/24 ch (302/426 px); context CLIPPED 4/39 ch (73/567 px)
  - Recently changed: "Dockside — Ancillary works 5DraftDockside Regeneration · Har" name CLIPPED 17/24 ch (302/426 px); context CLIPPED 4/39 ch (73/567 px)
  - Recently changed: "Dockside — Ancillary works 4DraftDockside Regeneration · Har" name CLIPPED 17/24 ch (302/426 px); context CLIPPED 4/39 ch (73/567 px)
  - Recently changed: "Dockside — Ancillary works 3DraftDockside Regeneration · Har" name CLIPPED 17/24 ch (302/426 px); context CLIPPED 4/39 ch (73/567 px)
  - Recently changed: "Dockside — Ancillary works 2DraftDockside Regeneration · Har" name CLIPPED 17/24 ch (302/426 px); context CLIPPED 4/39 ch (73/567 px)
- **1912x948 font200** (grid 1539, tracks 1539)
  - needs-attention row heights: 121, 121, 121, 121, 121, 120
  - main scroll 3963/849; boxes: Jump back in: 1/1 whole, box 274 px, body 3963/849, min name col 59 ch; Where the work stands: 0/8 whole, box 1209 px, body 3963/849, min name col 57 ch; Recently changed: 0/8 whole, box 1209 px, body 3963/849, min name col 57 ch
  - Where the work stands: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2BDr" name CLIPPED 37/49 ch (712/922 px); context CLIPPED 24/76 ch (370/1167 px)
  - Where the work stands: "EDF - Hynamics ProposalDraftEstuary Crossing Programme — Wes" name CLIPPED 16/20 ch (325/368 px); context CLIPPED 48/76 ch (757/1167 px)
  - Where the work stands: "NetPoint reference: power-plant programmeDraftEstuary Crossi" name CLIPPED 32/38 ch (536/652 px); context CLIPPED 34/76 ch (546/1167 px)
  - Recently changed: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2BDr" name CLIPPED 36/49 ch (696/922 px); context CLIPPED 21/76 ch (310/1167 px)
  - Recently changed: "EDF - Hynamics ProposalDraftEstuary Crossing Programme — Wes" name CLIPPED 16/20 ch (318/368 px); context CLIPPED 43/76 ch (689/1167 px)
  - Recently changed: "NetPoint reference: power-plant programmeDraftEstuary Crossi" name CLIPPED 31/38 ch (524/652 px); context CLIPPED 30/76 ch (482/1167 px)
- **1280x800 spacing** (grid 955, tracks 955)
  - needs-attention row heights: 90, 90, 90, 90, 90, 89
  - main scroll 3289/749; boxes: Jump back in: 1/1 whole, box 170 px, body 3289/749, min name col 76 ch; Where the work stands: 0/8 whole, box 1147 px, body 3289/749, min name col 73 ch; Recently changed: 0/8 whole, box 1126 px, body 3289/749, min name col 72 ch
  - Where the work stands: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2BDr" name CLIPPED 36/49 ch (457/595 px); context CLIPPED 23/76 ch (228/755 px)
  - Where the work stands: "EDF - Hynamics ProposalDraftEstuary Crossing Programme — Wes" name CLIPPED 16/20 ch (207/236 px); context CLIPPED 47/76 ch (478/755 px)
  - Where the work stands: "NetPoint reference: power-plant programmeDraftEstuary Crossi" name CLIPPED 31/38 ch (338/412 px); context CLIPPED 33/76 ch (347/755 px)
  - Recently changed: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2BDr" name CLIPPED 36/49 ch (447/595 px); context CLIPPED 20/76 ch (190/755 px)
  - Recently changed: "EDF - Hynamics ProposalDraftEstuary Crossing Programme — Wes" name CLIPPED 16/20 ch (203/236 px); context CLIPPED 43/76 ch (435/755 px)
  - Recently changed: "NetPoint reference: power-plant programmeDraftEstuary Crossi" name CLIPPED 31/38 ch (331/412 px); context CLIPPED 30/76 ch (307/755 px)
  - Recently changed: "Dockside — Ancillary works 6DraftDockside Regeneration · Har" name CLIPPED 23/24 ch (276/277 px); context CLIPPED 38/39 ch (361/365 px)
  - Recently changed: "Dockside — Ancillary works 5DraftDockside Regeneration · Har" name CLIPPED 23/24 ch (276/277 px); context CLIPPED 38/39 ch (361/365 px)
  - Recently changed: "Dockside — Ancillary works 4DraftDockside Regeneration · Har" name CLIPPED 23/24 ch (276/277 px); context CLIPPED 38/39 ch (361/365 px)
  - Recently changed: "Dockside — Ancillary works 3DraftDockside Regeneration · Har" name CLIPPED 23/24 ch (276/277 px); context CLIPPED 38/39 ch (361/365 px)
  - Recently changed: "Dockside — Ancillary works 2DraftDockside Regeneration · Har" name CLIPPED 23/24 ch (276/277 px); context CLIPPED 38/39 ch (361/365 px)
- **1477x900 spacing** (grid 1152, tracks 564 + 564)
  - needs-attention row heights: 90, 90, 90, 90, 90, 89
  - main scroll 1018/849; boxes: Jump back in: 1/1 whole, box 637 px, body 563/563, min name col 54 ch; Where the work stands: 0/8 whole, box 220 px, body 999/72, min name col 37 ch; Recently changed: 0/8 whole, box 220 px, body 999/93, min name col 32 ch
  - Jump back in: "Dockside — Quay Wall ReconstructionDockside Regeneration · H" name CLIPPED 25/31 ch (301/353 px); context CLIPPED 21/39 ch (205/365 px)
  - Where the work stands: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2BDr" name CLIPPED 24/49 ch (294/595 px); context CLIPPED 0/76 ch (0/755 px)
  - Where the work stands: "EDF - Hynamics ProposalDraftEstuary Crossing Programme — Wes" name CLIPPED 13/20 ch (170/236 px); context CLIPPED 13/76 ch (124/755 px)
  - Where the work stands: "NetPoint reference: power-plant programmeDraftEstuary Crossi" name CLIPPED 26/38 ch (278/412 px); context CLIPPED 1/76 ch (16/755 px)
  - Where the work stands: "Dockside — Ancillary works 6DraftDockside Regeneration · Har" name CLIPPED 18/24 ch (207/277 px); context CLIPPED 8/39 ch (87/365 px)
  - Where the work stands: "Dockside — Ancillary works 5DraftDockside Regeneration · Har" name CLIPPED 18/24 ch (207/277 px); context CLIPPED 8/39 ch (87/365 px)
  - Where the work stands: "Dockside — Ancillary works 4DraftDockside Regeneration · Har" name CLIPPED 18/24 ch (207/277 px); context CLIPPED 8/39 ch (87/365 px)
  - Where the work stands: "Dockside — Ancillary works 3DraftDockside Regeneration · Har" name CLIPPED 18/24 ch (207/277 px); context CLIPPED 8/39 ch (87/365 px)
  - Where the work stands: "Dockside — Ancillary works 2DraftDockside Regeneration · Har" name CLIPPED 18/24 ch (207/277 px); context CLIPPED 8/39 ch (87/365 px)
  - Recently changed: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2BDr" name CLIPPED 19/49 ch (246/595 px); context CLIPPED 0/76 ch (0/755 px)
  - Recently changed: "EDF - Hynamics ProposalDraftEstuary Crossing Programme — Wes" name CLIPPED 12/20 ch (166/236 px); context CLIPPED 8/76 ch (81/755 px)
  - Recently changed: "NetPoint reference: power-plant programmeDraftEstuary Crossi" name CLIPPED 23/38 ch (246/412 px); context CLIPPED 0/76 ch (0/755 px)
  - Recently changed: "Dockside — Ancillary works 6DraftDockside Regeneration · Har" name CLIPPED 18/24 ch (197/277 px); context CLIPPED 5/39 ch (49/365 px)
  - Recently changed: "Dockside — Ancillary works 5DraftDockside Regeneration · Har" name CLIPPED 18/24 ch (197/277 px); context CLIPPED 5/39 ch (49/365 px)
  - Recently changed: "Dockside — Ancillary works 4DraftDockside Regeneration · Har" name CLIPPED 18/24 ch (197/277 px); context CLIPPED 5/39 ch (49/365 px)
  - Recently changed: "Dockside — Ancillary works 3DraftDockside Regeneration · Har" name CLIPPED 18/24 ch (197/277 px); context CLIPPED 5/39 ch (49/365 px)
  - Recently changed: "Dockside — Ancillary works 2DraftDockside Regeneration · Har" name CLIPPED 18/24 ch (197/277 px); context CLIPPED 5/39 ch (49/365 px)
- **1912x948 spacing** (grid 1488, tracks 732 + 732)
  - needs-attention row heights: 90, 90, 90, 90, 90, 89
  - main scroll 1018/897; boxes: Jump back in: 1/1 whole, box 637 px, body 563/563, min name col 71 ch; Where the work stands: 0/8 whole, box 220 px, body 999/72, min name col 54 ch; Recently changed: 0/8 whole, box 220 px, body 999/93, min name col 49 ch
  - Jump back in: "Dockside — Quay Wall ReconstructionDockside Regeneration · H" name CLIPPED 30/31 ch (342/353 px); context CLIPPED 35/39 ch (332/365 px)
  - Where the work stands: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2BDr" name CLIPPED 33/49 ch (411/595 px); context CLIPPED 6/76 ch (52/755 px)
  - Where the work stands: "EDF - Hynamics ProposalDraftEstuary Crossing Programme — Wes" name CLIPPED 14/20 ch (186/236 px); context CLIPPED 26/76 ch (276/755 px)
  - Where the work stands: "NetPoint reference: power-plant programmeDraftEstuary Crossi" name CLIPPED 29/38 ch (304/412 px); context CLIPPED 17/76 ch (159/755 px)
  - Where the work stands: "Dockside — Ancillary works 6DraftDockside Regeneration · Har" name CLIPPED 21/24 ch (241/277 px); context CLIPPED 22/39 ch (221/365 px)
  - Where the work stands: "Dockside — Ancillary works 5DraftDockside Regeneration · Har" name CLIPPED 21/24 ch (241/277 px); context CLIPPED 22/39 ch (221/365 px)
  - Where the work stands: "Dockside — Ancillary works 4DraftDockside Regeneration · Har" name CLIPPED 21/24 ch (241/277 px); context CLIPPED 22/39 ch (221/365 px)
  - Where the work stands: "Dockside — Ancillary works 3DraftDockside Regeneration · Har" name CLIPPED 21/24 ch (241/277 px); context CLIPPED 22/39 ch (221/365 px)
  - Where the work stands: "Dockside — Ancillary works 2DraftDockside Regeneration · Har" name CLIPPED 21/24 ch (241/277 px); context CLIPPED 22/39 ch (221/365 px)
  - Recently changed: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2BDr" name CLIPPED 32/49 ch (401/595 px); context CLIPPED 1/76 ch (14/755 px)
  - Recently changed: "EDF - Hynamics ProposalDraftEstuary Crossing Programme — Wes" name CLIPPED 14/20 ch (182/236 px); context CLIPPED 24/76 ch (233/755 px)
  - Recently changed: "NetPoint reference: power-plant programmeDraftEstuary Crossi" name CLIPPED 28/38 ch (296/412 px); context CLIPPED 13/76 ch (118/755 px)
  - Recently changed: "Dockside — Ancillary works 6DraftDockside Regeneration · Har" name CLIPPED 20/24 ch (231/277 px); context CLIPPED 20/39 ch (183/365 px)
  - Recently changed: "Dockside — Ancillary works 5DraftDockside Regeneration · Har" name CLIPPED 20/24 ch (231/277 px); context CLIPPED 20/39 ch (183/365 px)
  - Recently changed: "Dockside — Ancillary works 4DraftDockside Regeneration · Har" name CLIPPED 20/24 ch (231/277 px); context CLIPPED 20/39 ch (183/365 px)
  - Recently changed: "Dockside — Ancillary works 3DraftDockside Regeneration · Har" name CLIPPED 20/24 ch (231/277 px); context CLIPPED 20/39 ch (183/365 px)
  - Recently changed: "Dockside — Ancillary works 2DraftDockside Regeneration · Har" name CLIPPED 20/24 ch (231/277 px); context CLIPPED 20/39 ch (183/365 px)

### SC-2 positive control (32 x W injected into one context, 1280 x 800)

- subject #0 ("Dockside — Quay Wall ReconstructionDockside Regene"): context clipped before = false, after = true (66/71 ch shown). Verdict: PASS (the probe saw the injected overflow)
