# M0 — the organisation landing, measured before anything is built

- **Taken:** 2026-10-09T06:50:03.164Z
- **Build:** `web 0.181.1 · api 0.88.1` (read off the shell footer, not assumed — see the harness docblock)
- **Organisation:** `m0-landing-1791528595071`, seeded by `landing-fixture.mjs`
- **Non-vacuity control:** PASS, 9 states asserted positively before any measurement

## FC-5 — requests to `…/overview` on one landing load

Counted **1** (bar: exactly 1).

## What the fixture holds

| Plan          | id                                     |
| ------------- | -------------------------------------- |
| projectId     | `01a11f6c-f8c0-73a1-b119-69ade124d041` |
| late          | `01a11f6c-f99c-7cb2-8c14-0ce15b799c8e` |
| onPlan        | `01a11f6c-fabe-7bf3-8db0-e0f21dc4e00f` |
| stale         | `01a11f6c-fb8d-7653-9434-9f46f0ad5c28` |
| never         | `01a11f6c-fc5f-7bf3-ba58-9cddec557148` |
| violating     | `01a11f6c-fd05-7321-a532-b1d592a41e39` |
| empty         | `01a11f6c-fdfb-7c42-a5bf-b67caf14091a` |
| liveInvite    | `01a11f6c-fe63-7330-83ba-300257192ee0` |
| expiredInvite | `01a11f6c-fe75-76b3-8632-156ef2219366` |

## Split matrix (landing-two-columns M0)

| Window      | Explorer | Screen  | Grid | Tracks    | Distinct tops | Boxes wholly visible | main scroll (h/client) | Doc overflow-x | Wrapped runs | Truncated runs |
| ----------- | -------- | ------- | ---: | --------- | ------------: | -------------------: | ---------------------- | -------------: | -----------: | -------------: |
| 1024 × 600  | default  | landing |  699 | 338 + 338 |             2 |               2 of 4 | 745/549                |              0 |            5 |             18 |
| 1024 × 600  | default  | members |  699 | 338 + 338 |             4 |               2 of 5 | 698/549                |              0 |            9 |              0 |
| 1272 × 1800 | default  | landing |  947 | 462 + 462 |             2 |               4 of 4 | 1749/1749              |              0 |            2 |             18 |
| 1272 × 1800 | default  | members |  947 | 462 + 462 |             4 |               5 of 5 | 1749/1749              |              0 |            3 |              0 |
| 1280 × 800  | default  | landing |  955 | 466 + 466 |             2 |               2 of 4 | 945/749                |              0 |            2 |             18 |
| 1280 × 800  | default  | members |  955 | 466 + 466 |             4 |               5 of 5 | 749/749                |              0 |            3 |              0 |
| 1349 × 800  | default  | landing | 1024 | 500 + 500 |             2 |               2 of 4 | 945/749                |              0 |            2 |             18 |
| 1349 × 800  | default  | members | 1024 | 500 + 500 |             4 |               5 of 5 | 749/749                |              0 |            3 |              0 |
| 1358 × 636  | default  | landing | 1033 | 505 + 505 |             2 |               2 of 4 | 781/585                |              0 |            2 |             18 |
| 1358 × 636  | default  | members | 1033 | 505 + 505 |             4 |               4 of 5 | 674/585                |              0 |            3 |              0 |
| 1440 × 900  | default  | landing | 1115 | 546 + 546 |             2 |               2 of 4 | 933/849                |              0 |            1 |             18 |
| 1440 × 900  | default  | members | 1115 | 546 + 546 |             4 |               5 of 5 | 849/849                |              0 |            2 |              0 |
| 1477 × 900  | default  | landing | 1152 | 564 + 564 |             2 |               2 of 4 | 933/849                |              0 |            1 |             18 |
| 1477 × 900  | default  | members | 1152 | 564 + 564 |             4 |               5 of 5 | 849/849                |              0 |            2 |              0 |
| 1912 × 948  | default  | landing | 1488 | 732 + 732 |             2 |               2 of 4 | 933/897                |              0 |            0 |             11 |
| 1912 × 948  | default  | members | 1488 | 732 + 732 |             4 |               5 of 5 | 897/897                |              0 |            0 |              0 |
| 1912 × 1114 | default  | landing | 1488 | 732 + 732 |             2 |               4 of 4 | 1063/1063              |              0 |            0 |             11 |
| 1912 × 1114 | default  | members | 1488 | 732 + 732 |             4 |               5 of 5 | 1063/1063              |              0 |            0 |              0 |
| 1280 × 800  | folded   | landing | 1187 | 582 + 582 |             2 |               2 of 4 | 933/749                |              0 |            1 |             18 |
| 1280 × 800  | folded   | members | 1187 | 582 + 582 |             4 |               5 of 5 | 749/749                |              0 |            0 |              0 |
| 1280 × 800  | 420      | landing |  811 | 394 + 394 |             2 |               2 of 4 | 945/749                |              0 |            5 |             18 |
| 1280 × 800  | 420      | members |  811 | 394 + 394 |             4 |               5 of 5 | 749/749                |              0 |            4 |              0 |
| 1440 × 900  | folded   | landing | 1347 | 662 + 662 |             2 |               2 of 4 | 933/849                |              0 |            0 |             17 |
| 1440 × 900  | folded   | members | 1347 | 662 + 662 |             4 |               5 of 5 | 849/849                |              0 |            0 |              0 |
| 1440 × 900  | 420      | landing |  971 | 474 + 474 |             2 |               2 of 4 | 957/849                |              0 |            2 |             18 |
| 1440 × 900  | 420      | members |  971 | 474 + 474 |             4 |               5 of 5 | 849/849                |              0 |            3 |              0 |

### Wrapped and truncated runs, per cell

- **1024x600 default landing** (grid 699, tracks 338 + 338)
  - wraps — Needs your attention: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2B"
  - wraps — Needs your attention: "It can no longer be accepted. Send it again from Members."
  - wraps — Where the work stands: "How each recently-changed programme is tracking against its baseline."
  - wraps — Where the work stands: "Finishing as planned in “Contract award”"
  - wraps — Recently changed: "Plans your organisation has worked on recently."
  - truncated — Jump back in: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (0 of 584 px)
  - truncated — Jump back in: "Dockside Regeneration · Harbourside Estates" (72 of 284 px)
  - truncated — Where the work stands: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (0 of 584 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (0 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (0 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (0 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (0 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (0 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (0 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (0 of 284 px)
  - truncated — Recently changed: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (0 of 584 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (0 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (0 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (0 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (0 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (0 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (0 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (0 of 284 px)
- **1024x600 default members** (grid 699, tracks 338 + 338)
  - wraps — Roster: "Ada Lovelace"
  - wraps — Roster: "m0-overview-1791528595071@example.com"
  - wraps — Organisation members: "Ada Lovelace"
  - wraps — Organisation members: "m0-overview-1791528595071@example.com"
  - wraps — Pending invitations: "People invited to this organisation who have not joined yet."
  - wraps — What each role can do: "Everything a Planner can do, plus members, settings and the shared lib"
  - wraps — What each role can do: "Full access to clients, projects, plans and activities, and can hold a"
  - wraps — What each role can do: "Updates progress and adds notes on assigned plans. Cannot change logic"
  - wraps — What each role can do: "Read-only access to shared plans in this organisation."
- **1272x1800 default landing** (grid 947, tracks 462 + 462)
  - wraps — Needs your attention: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2B"
  - wraps — Where the work stands: "How each recently-changed programme is tracking against its baseline."
  - truncated — Jump back in: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (76 of 584 px)
  - truncated — Jump back in: "Dockside Regeneration · Harbourside Estates" (166 of 284 px)
  - truncated — Where the work stands: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (0 of 584 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (72 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (72 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (72 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (72 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (72 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (72 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (56 of 284 px)
  - truncated — Recently changed: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (0 of 584 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (42 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (42 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (42 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (42 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (42 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (42 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (27 of 284 px)
- **1272x1800 default members** (grid 947, tracks 462 + 462)
  - wraps — What each role can do: "Everything a Planner can do, plus members, settings and the shared lib"
  - wraps — What each role can do: "Full access to clients, projects, plans and activities, and can hold a"
  - wraps — What each role can do: "Updates progress and adds notes on assigned plans. Cannot change logic"
- **1280x800 default landing** (grid 955, tracks 466 + 466)
  - wraps — Needs your attention: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2B"
  - wraps — Where the work stands: "How each recently-changed programme is tracking against its baseline."
  - truncated — Jump back in: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (79 of 584 px)
  - truncated — Jump back in: "Dockside Regeneration · Harbourside Estates" (169 of 284 px)
  - truncated — Where the work stands: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (0 of 584 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (75 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (75 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (75 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (75 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (75 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (75 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (59 of 284 px)
  - truncated — Recently changed: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (0 of 584 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (45 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (45 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (45 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (45 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (45 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (45 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (30 of 284 px)
- **1280x800 default members** (grid 955, tracks 466 + 466)
  - wraps — What each role can do: "Everything a Planner can do, plus members, settings and the shared lib"
  - wraps — What each role can do: "Full access to clients, projects, plans and activities, and can hold a"
  - wraps — What each role can do: "Updates progress and adds notes on assigned plans. Cannot change logic"
- **1349x800 default landing** (grid 1024, tracks 500 + 500)
  - wraps — Needs your attention: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2B"
  - wraps — Where the work stands: "How each recently-changed programme is tracking against its baseline."
  - truncated — Jump back in: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (107 of 584 px)
  - truncated — Jump back in: "Dockside Regeneration · Harbourside Estates" (195 of 284 px)
  - truncated — Where the work stands: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (0 of 584 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (103 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (103 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (103 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (103 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (103 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (103 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (86 of 284 px)
  - truncated — Recently changed: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (0 of 584 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (73 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (73 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (73 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (73 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (73 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (73 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (57 of 284 px)
- **1349x800 default members** (grid 1024, tracks 500 + 500)
  - wraps — What each role can do: "Everything a Planner can do, plus members, settings and the shared lib"
  - wraps — What each role can do: "Full access to clients, projects, plans and activities, and can hold a"
  - wraps — What each role can do: "Updates progress and adds notes on assigned plans. Cannot change logic"
- **1358x636 default landing** (grid 1033, tracks 505 + 505)
  - wraps — Needs your attention: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2B"
  - wraps — Where the work stands: "How each recently-changed programme is tracking against its baseline."
  - truncated — Jump back in: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (110 of 584 px)
  - truncated — Jump back in: "Dockside Regeneration · Harbourside Estates" (198 of 284 px)
  - truncated — Where the work stands: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (0 of 584 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (106 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (106 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (106 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (106 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (106 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (106 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (89 of 284 px)
  - truncated — Recently changed: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (0 of 584 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (76 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (76 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (76 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (76 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (76 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (76 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (60 of 284 px)
- **1358x636 default members** (grid 1033, tracks 505 + 505)
  - wraps — What each role can do: "Everything a Planner can do, plus members, settings and the shared lib"
  - wraps — What each role can do: "Full access to clients, projects, plans and activities, and can hold a"
  - wraps — What each role can do: "Updates progress and adds notes on assigned plans. Cannot change logic"
- **1440x900 default landing** (grid 1115, tracks 546 + 546)
  - wraps — Where the work stands: "How each recently-changed programme is tracking against its baseline."
  - truncated — Jump back in: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (143 of 584 px)
  - truncated — Jump back in: "Dockside Regeneration · Harbourside Estates" (229 of 284 px)
  - truncated — Where the work stands: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (0 of 584 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (139 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (139 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (139 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (139 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (139 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (139 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (121 of 284 px)
  - truncated — Recently changed: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (0 of 584 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (109 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (109 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (109 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (109 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (109 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (109 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (92 of 284 px)
- **1440x900 default members** (grid 1115, tracks 546 + 546)
  - wraps — What each role can do: "Full access to clients, projects, plans and activities, and can hold a"
  - wraps — What each role can do: "Updates progress and adds notes on assigned plans. Cannot change logic"
- **1477x900 default landing** (grid 1152, tracks 564 + 564)
  - wraps — Where the work stands: "How each recently-changed programme is tracking against its baseline."
  - truncated — Jump back in: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (157 of 584 px)
  - truncated — Jump back in: "Dockside Regeneration · Harbourside Estates" (243 of 284 px)
  - truncated — Where the work stands: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (0 of 584 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (154 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (154 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (154 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (154 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (154 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (154 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (136 of 284 px)
  - truncated — Recently changed: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (0 of 584 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (124 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (124 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (124 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (124 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (124 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (124 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (106 of 284 px)
- **1477x900 default members** (grid 1152, tracks 564 + 564)
  - wraps — What each role can do: "Full access to clients, projects, plans and activities, and can hold a"
  - wraps — What each role can do: "Updates progress and adds notes on assigned plans. Cannot change logic"
- **1912x948 default landing** (grid 1488, tracks 732 + 732)
  - truncated — Jump back in: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (290 of 584 px)
  - truncated — Where the work stands: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (133 of 584 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (267 of 284 px)
  - truncated — Recently changed: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (125 of 584 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (258 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (258 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (258 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (258 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (258 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (258 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (237 of 284 px)
- **1912x1114 default landing** (grid 1488, tracks 732 + 732)
  - truncated — Jump back in: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (290 of 584 px)
  - truncated — Where the work stands: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (133 of 584 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (267 of 284 px)
  - truncated — Recently changed: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (125 of 584 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (258 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (258 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (258 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (258 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (258 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (258 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (237 of 284 px)
- **1280x800 folded landing** (grid 1187, tracks 582 + 582)
  - wraps — Where the work stands: "How each recently-changed programme is tracking against its baseline."
  - truncated — Jump back in: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (171 of 584 px)
  - truncated — Jump back in: "Dockside Regeneration · Harbourside Estates" (257 of 284 px)
  - truncated — Where the work stands: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (14 of 584 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (168 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (168 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (168 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (168 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (168 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (168 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (149 of 284 px)
  - truncated — Recently changed: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (6 of 584 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (138 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (138 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (138 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (138 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (138 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (138 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (120 of 284 px)
- **1280x800 420 landing** (grid 811, tracks 394 + 394)
  - wraps — Needs your attention: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2B"
  - wraps — Needs your attention: "It can no longer be accepted. Send it again from Members."
  - wraps — Where the work stands: "How each recently-changed programme is tracking against its baseline."
  - wraps — Where the work stands: "Finishing as planned in “Contract award”"
  - wraps — Recently changed: "Plans your organisation has worked on recently."
  - truncated — Jump back in: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (22 of 584 px)
  - truncated — Jump back in: "Dockside Regeneration · Harbourside Estates" (115 of 284 px)
  - truncated — Where the work stands: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (0 of 584 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (17 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (17 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (17 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (17 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (17 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (17 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (3 of 284 px)
  - truncated — Recently changed: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (0 of 584 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (0 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (0 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (0 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (0 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (0 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (0 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (0 of 284 px)
- **1280x800 420 members** (grid 811, tracks 394 + 394)
  - wraps — Pending invitations: "People invited to this organisation who have not joined yet."
  - wraps — What each role can do: "Everything a Planner can do, plus members, settings and the shared lib"
  - wraps — What each role can do: "Full access to clients, projects, plans and activities, and can hold a"
  - wraps — What each role can do: "Updates progress and adds notes on assigned plans. Cannot change logic"
- **1440x900 folded landing** (grid 1347, tracks 662 + 662)
  - truncated — Jump back in: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (234 of 584 px)
  - truncated — Where the work stands: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (77 of 584 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (232 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (232 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (232 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (232 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (232 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (232 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (212 of 284 px)
  - truncated — Recently changed: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (69 of 584 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (202 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (202 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (202 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (202 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (202 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (202 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (182 of 284 px)
- **1440x900 420 landing** (grid 971, tracks 474 + 474)
  - wraps — Needs your attention: "Berth 4 Deepening — Dredging and Revetment Works, Stage 2B"
  - wraps — Where the work stands: "How each recently-changed programme is tracking against its baseline."
  - truncated — Jump back in: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (86 of 584 px)
  - truncated — Jump back in: "Dockside Regeneration · Harbourside Estates" (175 of 284 px)
  - truncated — Where the work stands: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (0 of 584 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (81 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (81 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (81 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (81 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (81 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (81 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (65 of 284 px)
  - truncated — Recently changed: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (0 of 584 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (51 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (51 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (51 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (51 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (51 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (51 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (36 of 284 px)
- **1440x900 420 members** (grid 971, tracks 474 + 474)
  - wraps — What each role can do: "Everything a Planner can do, plus members, settings and the shared lib"
  - wraps — What each role can do: "Full access to clients, projects, plans and activities, and can hold a"
  - wraps — What each role can do: "Updates progress and adds notes on assigned plans. Cannot change logic"

### Region heights, per cell

- 1024x600 default landing: Jump back in=397; Needs your attention=397; Where the work stands=220; Recently changed=220
- 1024x600 default members: Roster=184; Organisation members=94; Pending invitations=309; Invited people=167; What each role can do=382
- 1272x1800 default landing: Jump back in=609; Needs your attention=609; Where the work stands=988; Recently changed=988
- 1272x1800 default members: Roster=180; Organisation members=90; Pending invitations=289; Invited people=167; What each role can do=362
- 1280x800 default landing: Jump back in=597; Needs your attention=597; Where the work stands=220; Recently changed=220
- 1280x800 default members: Roster=180; Organisation members=90; Pending invitations=289; Invited people=167; What each role can do=362
- 1349x800 default landing: Jump back in=597; Needs your attention=597; Where the work stands=220; Recently changed=220
- 1349x800 default members: Roster=180; Organisation members=90; Pending invitations=289; Invited people=167; What each role can do=362
- 1358x636 default landing: Jump back in=433; Needs your attention=433; Where the work stands=220; Recently changed=220
- 1358x636 default members: Roster=180; Organisation members=90; Pending invitations=289; Invited people=167; What each role can do=362
- 1440x900 default landing: Jump back in=585; Needs your attention=585; Where the work stands=220; Recently changed=220
- 1440x900 default members: Roster=180; Organisation members=90; Pending invitations=273; Invited people=151; What each role can do=342
- 1477x900 default landing: Jump back in=585; Needs your attention=585; Where the work stands=220; Recently changed=220
- 1477x900 default members: Roster=180; Organisation members=90; Pending invitations=273; Invited people=151; What each role can do=342
- 1912x948 default landing: Jump back in=585; Needs your attention=585; Where the work stands=220; Recently changed=220
- 1912x948 default members: Roster=180; Organisation members=90; Pending invitations=273; Invited people=151; What each role can do=302
- 1912x1114 default landing: Jump back in=585; Needs your attention=585; Where the work stands=326; Recently changed=326
- 1912x1114 default members: Roster=180; Organisation members=90; Pending invitations=273; Invited people=151; What each role can do=302
- 1280x800 folded landing: Jump back in=585; Needs your attention=585; Where the work stands=220; Recently changed=220
- 1280x800 folded members: Roster=180; Organisation members=90; Pending invitations=273; Invited people=151; What each role can do=302
- 1280x800 420 landing: Jump back in=597; Needs your attention=597; Where the work stands=220; Recently changed=220
- 1280x800 420 members: Roster=180; Organisation members=90; Pending invitations=309; Invited people=167; What each role can do=362
- 1440x900 folded landing: Jump back in=585; Needs your attention=585; Where the work stands=220; Recently changed=220
- 1440x900 folded members: Roster=180; Organisation members=90; Pending invitations=273; Invited people=151; What each role can do=302
- 1440x900 420 landing: Jump back in=609; Needs your attention=609; Where the work stands=220; Recently changed=220
- 1440x900 420 members: Roster=180; Organisation members=90; Pending invitations=289; Invited people=167; What each role can do=362
