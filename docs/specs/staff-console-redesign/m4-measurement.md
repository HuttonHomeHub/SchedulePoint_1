# M4 measurement: the staff console with Performance folded

Taken 2026-10-06 for M4 of [`implementation-plan.md`](./implementation-plan.md), against
[`m0-measurement.md`](./m0-measurement.md) and [`m3-measurement.md`](./m3-measurement.md) (ADR-0142).

- **Script:** `apps/web/scripts/measure-staff-console.mjs` (now also reads the page with Performance opened),
  `WIDTHS=1368x912,1920x1080`.
- **Environment (record, do not compare frame rates).** Local headless Chromium, Vite dev server, API in
  development, `STAFF_EMAILS` holding one address, no mail transport and no alert URL, a **fresh, freshly migrated
  database** (dropped and recreated before the run; a first run on a reused database read 3,946 px and 7 audited
  reads because an earlier, interrupted run had left rows, and is not used). The 1368x912 column is the clean
  comparison.

| #     | Criterion                          | M0 (1368x912) | M3 (1368x912) | M4 (1368x912)                                        | Target           | Met |
| ----- | ---------------------------------- | ------------- | ------------- | ---------------------------------------------------- | ---------------- | --- |
| SC-1  | Page height at rest                | 4,664 px      | 3,468 px      | **2,905 px (-37.7 %)**                               | <= 3,030 (-35 %) | Yes |
| SC-2  | Sub-heading treatments             | 5             | 3             | **1** (`h4 14px 600`)                                | 1                | Yes |
| SC-4  | Audited reads per load / reload    | 6             | 6             | **6 / 6** (both widths)                              | 6                | Yes |
| SC-6  | Polite regions holding text        | 6             | 1             | **1** (the page sentence)                            | 1                | Yes |
| SC-10 | Height delta after Run diagnostics | +1,735 px     | +174 px       | **+174 px**                                          | <= +600          | Yes |
| SC-11 | Elements past the right edge       | 0             | 0             | **0** at rest, Performance open, after a probe check | 0                | Yes |

With Performance opened the page is 3,454 px at 1368x912 (+549 px over rest). At 1920x1080: rest 3,366 (it includes
the 1368 sitting's stored probe sittings), 6 audited reads per load and per reload, 0 elements past the edge.

**What it took to meet SC-1.** The first folded layout (summary line, intro line and a button on three rows) read
3,127 px, 97 px over. The box is now a title and one row (text beside the button), which is what the target needed;
about 120 px of the remaining box is the shared `StatusSection` chrome.

**Not measured here:** SC-7 and SC-8 (axe and `<main>` overflow at 320 px) are asserted by the journey, which now
also scans with Performance open; SC-12 is unchanged by this milestone.
