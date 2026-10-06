# M0 measurement: the staff console before the redesign

Taken 2026-10-06 for M0-T1 of [`implementation-plan.md`](./implementation-plan.md), so that every
success criterion in [`feature-spec.md`](./feature-spec.md) §1 has a "before" (ADR-0142).

- **Script:** `apps/web/scripts/measure-staff-console.mjs`. It counts audit rows itself, so it is run
  against a database it can read: `DATABASE_URL=… node scripts/measure-staff-console.mjs`.
- **Environment line (record, do not compare frame rates).** Local Playwright Chromium 141.0.7390.37
  (headless, software-rasterised), Vite dev server, API `0.88.0` in development, `STAFF_EMAILS`
  holding one address, **no mail transport and no alert URL** (the "attention" recipe), and a
  **fresh, freshly migrated database** for the sitting. Only heights and counts are compared. The
  sitting runs the widths in order against one database, so the staff activity table and the probe
  history grow between widths (50 activity entries by the 1368 reading); the rest height moves a
  few pixels for that reason, which is why the six 1280-and-wider readings differ by up to 50 px.
- **Target displays** (spec approval header): the desktop monitor 1920x1080 and the Surface at
  1368x912. 320, 390 and 1280 are kept for the WCAG reflow check and for continuity with the
  digest's screenshots. Heights are `documentElement.scrollHeight` in CSS px.

## Heights (SC-1, SC-10)

| Viewport  | At rest | After **Run diagnostics** | After **Check the probe works** | Diagnostics delta (SC-10) | Error state | Loading state |
| --------- | ------: | ------------------------: | ------------------------------: | ------------------------: | ----------: | ------------: |
| 320x640   |   5,356 |                     9,378 |                          13,417 |                    +4,022 |       4,780 |         4,648 |
| 390x844   |   7,092 |                    10,286 |                          13,489 |                    +3,194 |       4,987 |         4,903 |
| 1280x800  |   4,663 |                     6,398 |                           7,691 |                    +1,735 |       3,427 |         3,405 |
| 1368x912  |   4,664 |                     6,399 |                           7,692 |                    +1,735 |       3,428 |         3,406 |
| 1646x900  |   4,657 |                     6,392 |                           7,677 |                    +1,735 |       3,433 |         3,411 |
| 1920x1080 |   4,706 |                     6,441 |                           7,726 |                    +1,735 |       3,482 |         3,460 |

**Re-baselined criteria.** SC-1 at the Surface: **4,664 px at rest** (target: the spec's -35 %,
so at most about 3,030 px). SC-10 at the Surface: **+1,735 px** after Run diagnostics (the spec's
"at most +600 px" stands as the target, and the delta is the same at every width from 1280 up, which is
what a stack of full-width cards looks like). The 390 px figures above (7,092 and +3,194) differ
from the digest's 5,088 and +2,940 because the digest's database held different activity; they are
kept here only as the narrow-width reading, and phones are not a target.

## Overflow (SC-8, SC-11)

- **1280 px and wider, every state: nothing past the right edge**, and `<main>` does not overflow.
  So SC-11 at the Surface is **0 elements already**, and its target is held, not earned.
- **320 px at rest:** the document does not scroll sideways (`scrollWidth` 320) but a control is
  drawn past the edge: the Performance panel's measurement-mode `<select>` ends at `right=347`.
  At 320 px during a probe run the overlay's **Stop (keeps what is already measured)** button ends at
  `right=399`. WCAG 1.4.10 asks that nothing be lost or unusable, so both are M1 inputs (M1-T4).
- **390 px:** at rest nothing; during a run the same Stop button, `right=399`; after a probe check the
  document scrolls sideways (`scrollWidth` 542) because the sittings table's **Show** buttons end at
  `right=542`. Phones are not a target, but this is the same table that must still scroll in its own
  region at 320 px under WCAG reflow.

## The 390 px transient overflow (M1-T5)

The digest's `390-07b` (`BUTTON right=399` after confirming the probe check) **reproduced**: it is
the overlay's Stop button, present for the length of the run, at 320 px and at 390 px. It is the same
defect as spec §0.8 and M1-T4 fixes it; there is no second cause to look for.

## Sub-heading treatments (SC-2)

Counted as distinct computed (tag, size, weight, transform, tracking) over `main h3, main h4,
main summary`, with diagnostics results and a probe sitting on screen: **5**.

| Treatment                         | Where                                              |
| --------------------------------- | -------------------------------------------------- |
| `h3` 14 px, 600, tracking -0.35px | Mail, Retention, "Sweep of ..." and "All sittings" |
| `h3` 14 px, 500                   | the 16 diagnostics questions, "Plan loading"       |
| `h3` 14 px, 400                   | the four "Step n of 4" lines of a probe sitting    |
| `h3` 16 px, 500                   | the per-scale sitting titles ("2000 activities")   |
| `summary` 14 px, 400              | "Measure one thing"                                |

The digest counted 6. This method finds 5 on the elements it can see as headings; the sixth may be
a non-heading element styled as one (a `<p>` or `<div>`), which a tag-based count cannot find. The
criterion's target (one treatment) does not depend on which number is right, and **5 is the figure
M3 is measured against** with this method.

## Status row order (SC-12)

| State                                | Order                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| attention (no transport, alerts off) | Mail delivery, **Failure alerting**, Retention sweeping, Content-Security-Policy, Account verification |
| error (every read answers 500)       | Mail delivery, Retention sweeping, Content-Security-Policy, Account verification, **Failure alerting** |
| loading (every read held)            | same as error                                                                                          |

Failure alerting moves from second to last, so the order does depend on state. A healthy
installation was **not** measured: it needs a mail transport, an alert URL and an armed sweep that
this sitting did not have, and mocking the responses would measure the mock.

## Audited reads (SC-4)

`staff.panel_read` rows written: **6 per page load and 6 per reload, at every width** (counted in
`audit_events` before and after). The plan-loading section's installation read is deduplicated
into the same request.

## Announcements on load (SC-6)

Two readings, because the first depends on timing:

- **Polite regions holding text once the page has settled: 6** (Mail and Retention, Content-Security-Policy,
  accounts, installation, Performance, staff activity), at every width.
- Regions whose text **changed** within the first 5 seconds, as a `MutationObserver` saw them:
  between 2 and 5 depending on the sitting. That count is a race between the queries and the
  observer and is **not** used as the baseline.

The spec's "up to 7" is therefore **6** on a fresh page; M3's target (one page-level sentence) holds.

## Non-staff `/staff` beside `/no-such-path` (spec D-13)

A signed-in non-staff member at 1368x912 (screenshots from the sitting, not committed):

| Address         | Document title              | Page content                                                                                                                     |
| --------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `/staff`        | `Not found · SchedulePoint` | An `h1` "Not found", "There is nothing at this address. Go to SchedulePoint.", in a 896 px container offset 236 px from the left |
| `/no-such-path` | `SchedulePoint`             | The words "Not Found" in the top-left corner, no heading, no `<main>`, no link                                                   |

**They differ, in the title, the markup and the picture.** ADR-0086's property is that a non-staff
caller cannot tell `/staff` from a route that does not exist; today any caller can. That is a
security-relevant tell and it pre-dates this epic. It is **not fixed here** (spec D-13, plan M0-T1):
it is filed as `docs/TECH_DEBT.md` **#459** for security-reviewer. The redesign leaves the branch alone
except for the title behaviour in M1-T5.
