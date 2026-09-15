# M0 — the organisation landing, measured before anything is built

- **Taken:** 2026-09-15T12:56:04.640Z
- **Build:** `web 0.131.0 · api 0.64.0` (read off the shell footer, not assumed — see the harness docblock)
- **Organisation:** `m0-landing-1789476954523`, seeded by `landing-fixture.mjs`
- **Non-vacuity control:** PASS, 9 states asserted positively before any measurement

## FC-1 — is each question answered above the fold at 1646 × 1000?

| Q   | Question                                  | Answering element                           |  `y` | Above the fold? |
| --- | ----------------------------------------- | ------------------------------------------- | ---: | --------------- |
| Q1  | Where was I?                              | `a` — "Dockside — Quay Wall Reconstruction" |  238 | **yes**         |
| Q2  | What changed while I was away, and who?   | `a` — "Dockside — Ancillary works 6"        | 1742 | **no**          |
| Q3  | Is anything waiting on me?                | `a` — "Dockside — Lock Gate Refurbishment"  |  420 | **yes**         |
| Q4  | Are these figures current, or stale?      | `p` — "Not yet calculated"                  | 1786 | **no**          |
| Q5  | When does each programme finish?          | `p` — "No finish date yet"                  |  951 | **yes**         |
| Q6  | Has that moved against what we committed? | `p` — "No activities yet"                   |  973 | **yes**         |
| Q7  | Is anything flagged in the schedule?      | `ul` — "1 constraint broken by logic"       | 1560 | **no**          |

**FC-1 baseline: 4 of 7 answered above the fold.** Bar for the after run: 7 of 7.

## FC-4 — each section's rendered content width

| Width | Section               | Content width |
| ----: | --------------------- | ------------: |
|  1646 | Jump back in          |           846 |
|  1646 | Needs your attention  |           846 |
|  1646 | Where the work stands |           846 |
|  1646 | Recently changed      |           846 |
|  1440 | Jump back in          |           846 |
|  1440 | Needs your attention  |           846 |
|  1440 | Where the work stands |           846 |
|  1440 | Recently changed      |           846 |
|  1280 | Jump back in          |           846 |
|  1280 | Needs your attention  |           846 |
|  1280 | Where the work stands |           846 |
|  1280 | Recently changed      |           846 |

## Section geometry at 1646 (the input to the ordering decision)

| Section               |  top | height | rows | bottom |
| --------------------- | ---: | -----: | ---: | -----: |
| Jump back in          |  155 |    158 |    0 |    313 |
| Needs your attention  |  337 |    463 |    0 |    800 |
| Where the work stands |  824 |    789 |    1 |   1613 |
| Recently changed      | 1637 |    749 |    0 |   2386 |

Page content runs to **2386 px**; the fold is 1000.

## FC-5 — requests to `…/overview` on one landing load

Counted **1** (bar: exactly 1).

## What the fixture holds

| Plan          | id                                     |
| ------------- | -------------------------------------- |
| projectId     | `01a0a523-6dc8-7032-b486-16b3c09ea16d` |
| late          | `01a0a523-6de0-77a0-aae8-ac149b643b0b` |
| onPlan        | `01a0a523-6f2b-77f1-b37e-f26cdcde8f41` |
| stale         | `01a0a523-704c-77d1-a2c3-b2890313e407` |
| never         | `01a0a523-7140-7c90-a12f-633b3ee5c2bc` |
| violating     | `01a0a523-7210-7b43-881c-60a88c261366` |
| empty         | `01a0a523-731a-7ee0-868d-e73cc914ffaa` |
| liveInvite    | `01a0a523-73b0-7753-914a-b5be4f4e4f23` |
| expiredInvite | `01a0a523-73c5-7752-b186-b08e8271cad4` |
