# M0 — the organisation landing, measured before anything is built

- **Taken:** 2026-10-09T07:24:05.175Z
- **Build:** `web 0.181.1 · api 0.88.1` (read off the shell footer, not assumed — see the harness docblock)
- **Organisation:** `m0-landing-1791530636188`, seeded by `landing-fixture.mjs`
- **Non-vacuity control:** PASS, 9 states asserted positively before any measurement

## FC-5 — requests to `…/overview` on one landing load

Counted **1** (bar: exactly 1).

## What the fixture holds

| Plan          | id                                     |
| ------------- | -------------------------------------- |
| projectId     | `01a11f8c-21d1-7102-aaad-ee1dc21e84b8` |
| late          | `01a11f8c-22c5-79a1-94f6-188bcea82e0c` |
| onPlan        | `01a11f8c-23fa-7672-bc99-d53493a60d2e` |
| stale         | `01a11f8c-24c8-7260-b939-a306192633e3` |
| never         | `01a11f8c-259d-7ea1-b72c-c8b05b303501` |
| violating     | `01a11f8c-2638-7e72-8a5f-47cc85dee8d8` |
| empty         | `01a11f8c-271c-7762-a6a7-5a17728c8468` |
| liveInvite    | `01a11f8c-2783-79b0-a486-833a6dc453bd` |
| expiredInvite | `01a11f8c-2792-7582-a870-15902cba75e9` |

## Split matrix (landing-two-columns M0)

| Window      | Explorer | Screen  | Grid | Tracks    | Distinct tops | Boxes wholly visible | main scroll (h/client) | Doc overflow-x | Wrapped runs | Truncated runs |
| ----------- | -------- | ------- | ---: | --------- | ------------: | -------------------: | ---------------------- | -------------: | -----------: | -------------: |
| 1024 × 600  | default  | landing |  699 | 699       |             4 |               1 of 4 | 1056/549               |              0 |            0 |             17 |
| 1024 × 600  | default  | members |  699 | 699       |             5 |               3 of 5 | 915/549                |              0 |            4 |              0 |
| 1272 × 1800 | default  | landing |  947 | 947       |             4 |               4 of 4 | 1749/1749              |              0 |            0 |              3 |
| 1272 × 1800 | default  | members |  947 | 947       |             5 |               5 of 5 | 1749/1749              |              0 |            0 |              0 |
| 1280 × 800  | default  | landing |  955 | 955       |             4 |               2 of 4 | 1056/749               |              0 |            0 |              3 |
| 1280 × 800  | default  | members |  955 | 955       |             5 |               4 of 5 | 911/749                |              0 |            0 |              0 |
| 1349 × 800  | default  | landing | 1024 | 1024      |             4 |               2 of 4 | 1056/749               |              0 |            0 |              3 |
| 1349 × 800  | default  | members | 1024 | 1024      |             5 |               4 of 5 | 911/749                |              0 |            0 |              0 |
| 1358 × 636  | default  | landing | 1033 | 1033      |             4 |               2 of 4 | 1056/585               |              0 |            0 |              3 |
| 1358 × 636  | default  | members | 1033 | 1033      |             5 |               4 of 5 | 911/585                |              0 |            0 |              0 |
| 1440 × 900  | default  | landing | 1115 | 1115      |             4 |               3 of 4 | 1056/849               |              0 |            0 |              2 |
| 1440 × 900  | default  | members | 1115 | 1115      |             5 |               4 of 5 | 911/849                |              0 |            0 |              0 |
| 1477 × 900  | default  | landing | 1152 | 564 + 564 |             2 |               2 of 4 | 933/849                |              0 |            1 |             18 |
| 1477 × 900  | default  | members | 1152 | 564 + 564 |             4 |               5 of 5 | 849/849                |              0 |            2 |              0 |
| 1912 × 948  | default  | landing | 1488 | 732 + 732 |             2 |               2 of 4 | 933/897                |              0 |            0 |             11 |
| 1912 × 948  | default  | members | 1488 | 732 + 732 |             4 |               5 of 5 | 897/897                |              0 |            0 |              0 |
| 1912 × 1114 | default  | landing | 1488 | 732 + 732 |             2 |               4 of 4 | 1063/1063              |              0 |            0 |             11 |
| 1912 × 1114 | default  | members | 1488 | 732 + 732 |             4 |               5 of 5 | 1063/1063              |              0 |            0 |              0 |
| 1280 × 800  | folded   | landing | 1187 | 582 + 582 |             2 |               2 of 4 | 933/749                |              0 |            1 |             18 |
| 1280 × 800  | folded   | members | 1187 | 582 + 582 |             4 |               5 of 5 | 749/749                |              0 |            0 |              0 |
| 1280 × 800  | 420      | landing |  811 | 811       |             4 |               2 of 4 | 1056/749               |              0 |            0 |              3 |
| 1280 × 800  | 420      | members |  811 | 811       |             5 |               4 of 5 | 911/749                |              0 |            0 |              0 |
| 1440 × 900  | folded   | landing | 1347 | 662 + 662 |             2 |               2 of 4 | 933/849                |              0 |            0 |             17 |
| 1440 × 900  | folded   | members | 1347 | 662 + 662 |             4 |               5 of 5 | 849/849                |              0 |            0 |              0 |
| 1440 × 900  | 420      | landing |  971 | 971       |             4 |               3 of 4 | 1056/849               |              0 |            0 |              3 |
| 1440 × 900  | 420      | members |  971 | 971       |             5 |               4 of 5 | 911/849                |              0 |            0 |              0 |

### Wrapped and truncated runs, per cell

- **1024x600 default landing** (grid 699, tracks 699)
  - truncated — Jump back in: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (264 of 584 px)
  - truncated — Where the work stands: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (107 of 584 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (262 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (262 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (262 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (262 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (262 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (262 of 284 px)
  - truncated — Where the work stands: "Dockside Regeneration · Harbourside Estates" (241 of 284 px)
  - truncated — Recently changed: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (99 of 584 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (232 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (232 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (232 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (232 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (232 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (232 of 284 px)
  - truncated — Recently changed: "Dockside Regeneration · Harbourside Estates" (212 of 284 px)
- **1024x600 default members** (grid 699, tracks 699)
  - wraps — Roster: "Ada Lovelace"
  - wraps — Roster: "m0-overview-1791530636188@example.com"
  - wraps — Organisation members: "Ada Lovelace"
  - wraps — Organisation members: "m0-overview-1791530636188@example.com"
- **1272x1800 default landing** (grid 947, tracks 947)
  - truncated — Jump back in: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (460 of 584 px)
  - truncated — Where the work stands: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (303 of 584 px)
  - truncated — Recently changed: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (295 of 584 px)
- **1280x800 default landing** (grid 955, tracks 955)
  - truncated — Jump back in: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (467 of 584 px)
  - truncated — Where the work stands: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (310 of 584 px)
  - truncated — Recently changed: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (301 of 584 px)
- **1349x800 default landing** (grid 1024, tracks 1024)
  - truncated — Jump back in: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (521 of 584 px)
  - truncated — Where the work stands: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (364 of 584 px)
  - truncated — Recently changed: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (356 of 584 px)
- **1358x636 default landing** (grid 1033, tracks 1033)
  - truncated — Jump back in: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (528 of 584 px)
  - truncated — Where the work stands: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (371 of 584 px)
  - truncated — Recently changed: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (363 of 584 px)
- **1440x900 default landing** (grid 1115, tracks 1115)
  - truncated — Where the work stands: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (436 of 584 px)
  - truncated — Recently changed: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (428 of 584 px)
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
- **1280x800 420 landing** (grid 811, tracks 811)
  - truncated — Jump back in: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (353 of 584 px)
  - truncated — Where the work stands: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (196 of 584 px)
  - truncated — Recently changed: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (187 of 584 px)
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
- **1440x900 420 landing** (grid 971, tracks 971)
  - truncated — Jump back in: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (479 of 584 px)
  - truncated — Where the work stands: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (322 of 584 px)
  - truncated — Recently changed: "Estuary Crossing Programme — Western Approaches · Northern Ports and H" (314 of 584 px)

### Region heights, per cell

- 1024x600 default landing: Jump back in=220; Needs your attention=220; Where the work stands=220; Recently changed=220
- 1024x600 default members: Roster=184; Organisation members=94; Pending invitations=273; Invited people=151; What each role can do=302
- 1272x1800 default landing: Jump back in=220; Needs your attention=443; Where the work stands=443; Recently changed=443
- 1272x1800 default members: Roster=180; Organisation members=90; Pending invitations=273; Invited people=151; What each role can do=302
- 1280x800 default landing: Jump back in=220; Needs your attention=220; Where the work stands=220; Recently changed=220
- 1280x800 default members: Roster=180; Organisation members=90; Pending invitations=273; Invited people=151; What each role can do=302
- 1349x800 default landing: Jump back in=220; Needs your attention=220; Where the work stands=220; Recently changed=220
- 1349x800 default members: Roster=180; Organisation members=90; Pending invitations=273; Invited people=151; What each role can do=302
- 1358x636 default landing: Jump back in=220; Needs your attention=220; Where the work stands=220; Recently changed=220
- 1358x636 default members: Roster=180; Organisation members=90; Pending invitations=273; Invited people=151; What each role can do=302
- 1440x900 default landing: Jump back in=220; Needs your attention=220; Where the work stands=220; Recently changed=220
- 1440x900 default members: Roster=180; Organisation members=90; Pending invitations=273; Invited people=151; What each role can do=302
- 1477x900 default landing: Jump back in=585; Needs your attention=585; Where the work stands=220; Recently changed=220
- 1477x900 default members: Roster=180; Organisation members=90; Pending invitations=273; Invited people=151; What each role can do=342
- 1912x948 default landing: Jump back in=585; Needs your attention=585; Where the work stands=220; Recently changed=220
- 1912x948 default members: Roster=180; Organisation members=90; Pending invitations=273; Invited people=151; What each role can do=302
- 1912x1114 default landing: Jump back in=585; Needs your attention=585; Where the work stands=326; Recently changed=326
- 1912x1114 default members: Roster=180; Organisation members=90; Pending invitations=273; Invited people=151; What each role can do=302
- 1280x800 folded landing: Jump back in=585; Needs your attention=585; Where the work stands=220; Recently changed=220
- 1280x800 folded members: Roster=180; Organisation members=90; Pending invitations=273; Invited people=151; What each role can do=302
- 1280x800 420 landing: Jump back in=220; Needs your attention=220; Where the work stands=220; Recently changed=220
- 1280x800 420 members: Roster=180; Organisation members=90; Pending invitations=273; Invited people=151; What each role can do=302
- 1440x900 folded landing: Jump back in=585; Needs your attention=585; Where the work stands=220; Recently changed=220
- 1440x900 folded members: Roster=180; Organisation members=90; Pending invitations=273; Invited people=151; What each role can do=302
- 1440x900 420 landing: Jump back in=220; Needs your attention=220; Where the work stands=220; Recently changed=220
- 1440x900 420 members: Roster=180; Organisation members=90; Pending invitations=273; Invited people=151; What each role can do=302
