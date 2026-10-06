# M3 measurement: the staff console after the grouped layout

Taken 2026-10-06 for M3 of [`implementation-plan.md`](./implementation-plan.md), against the "before" in
[`m0-measurement.md`](./m0-measurement.md) (ADR-0142). **Performance is still fully open at rest in M3
(its collapse is M4)**, so the height criteria that depend on it are read as "M3's share" and finish in M4.

- **Script:** `apps/web/scripts/measure-staff-console.mjs` (two selectors updated for `h3` box titles and
  the `h4` sub-heading rank), `WIDTHS=1368x912,1920x1080`.
- **Environment (record, do not compare frame rates).** Local Playwright Chromium (headless,
  software-rasterised), Vite dev server, API `0.88.0` in development, `STAFF_EMAILS` holding one address,
  **no mail transport and no alert URL** (the "attention" recipe), a **fresh, freshly migrated database**.
  Widths run in order against one database, so the 1920 sitting includes the probe sittings the 1368 sitting
  stored, exactly as in M0. **The 1368x912 column is the clean comparison.**

| #     | Criterion                                   | M0 (1368x912)      | M3 (1368x912)                                                 | Target           | Met                   |
| ----- | ------------------------------------------- | ------------------ | ------------------------------------------------------------- | ---------------- | --------------------- |
| SC-1  | Page height at rest                         | 4,664 px           | **3,468 px (-25.6 %)**                                        | <= 3,030 (-35 %) | **No, by design: M4** |
| SC-2  | Sub-heading treatments                      | 5                  | **3** measured (2 expected after a later tweak)               | 1                | **No: M4** (see note) |
| SC-3  | Rows linking to a box no other row links to | 2 of 5             | **5 of 5** (gate + unit test)                                 | 5 of 5           | Yes                   |
| SC-4  | Audited reads per load                      | 6                  | **6** (measured, both widths)                                 | 6                | Yes                   |
| SC-5  | Audited reads per Refresh                   | n/a                | **6** (journey diff + request count)                          | exactly 6        | Yes                   |
| SC-6  | Polite regions holding text after load      | 6                  | **1** (the page sentence)                                     | 1                | Yes                   |
| SC-7  | axe violations at 320 and 1280              | 0 at 1280          | 0 at both (journey)                                           | 0                | Yes                   |
| SC-8  | `<main>` overflow at 320                    | none (+2 controls) | none (journey)                                                | none             | Yes                   |
| SC-9  | Resting prose naming ADR / env var / SQL    | 6+                 | 0 (`copy.structural.test.ts`)                                 | 0                | Yes                   |
| SC-10 | Height delta after Run diagnostics          | +1,735 px          | **+174 px**                                                   | <= +600          | Yes                   |
| SC-11 | Elements past the right edge                | 0                  | **0** at rest, after diagnostics, after a probe check         | 0                | Yes                   |
| SC-12 | Status row order across states              | changed            | **identical** in attention, mostly-healthy, error and loading | identical        | Yes (see below)       |

At 1920x1080: rest 4,660 (4,706 before; includes the 1368 sitting's stored probe sittings), diagnostics
+174 (was +1,735), 0 elements past the edge, 6 audited reads per load and per reload.

**SC-1.** The page lost about 1,200 px to the grouping, the shorter boxes and the compact diagnostics, and
the target needs Performance collapsed, which the plan places in M4 (Performance is still about 560 px at
rest). M4's reading is the one judged against the target.

**SC-2.** Measured 3 treatments: `SubSection`'s `h4` (600), the Plan-loading headings (`h4`, 500, while the
section still hand-wrote its weight) and `Measure one thing`'s `summary`. After the reading, the loading
section's two headings were given the same weight as `SubSection` (they already take their rank from the
heading context), which should leave 2; **that was not re-measured.** The last one is the `summary`, which M4
turns into a `SubSection`.

**SC-12.** Measured in four states: attention (mail not set up, alerts off), error (every read 500),
loading (every read held) and a mostly-healthy state with a mail transport, both alert URLs and the sweep
armed (four of five rows OK; the fifth was one unconfirmed account the measurement itself created). The
order was Mail delivery, Clearing old records, Browser security reports, Unconfirmed accounts, Alerts every
time. **A state with all five OK was not reached**, for the reason in the previous sentence; the order is a
property of the code (`CHECK_IDS` order, no sort) and `console-status.test.ts` pins it for every state.

**SC-6.** The one polite region holding text is the page's `Staff console loaded. 2 things need attention.`
Boxes hold their resting sentence as plain text and write to their region only on a later change.
