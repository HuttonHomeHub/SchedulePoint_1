# M0 measurement: loading-state baseline (TECH_DEBT #234 + #341)

- **Spec:** [./spec.md](./spec.md) (success criteria SC-2, SC-3, SC-4, SC-5)
- **Record:** [./m0-baseline.json](./m0-baseline.json), the instrument's stdout, unedited.
- **Instrument:** `apps/web/scripts/measure-loading-shapes.mjs` (judge in
  `measure-loading-shapes.judge.mjs`, self-test `measure-loading-shapes.judge.test.mjs`).

ADR-0142: the remedy is measured before it is built. Every figure below is read from
`m0-baseline.json`; nothing is estimated.

## How it was taken

- **Application code under test:** an unmodified tree, `main` plus one unrelated fix
  (`186d2319`), served by a dev API on :3000 and the Vite dev server on :5173. None of this epic's
  changes were present in the app under test.
- **Instrument code:** run from the epic branch (`run.sha` in the record, `1fa84654`, is the
  instrument's checkout, not the application's).
- **Tenant:** `shoot-co-1792271185901-1646`, created by `pnpm shoot --width 1646 --only
plan-workspace`; client `Northgate Developments`, project `Riverside Quarter`, plan `Riverside
— Phase 2 Substructure`.
- **Taken:** 2026-10-17T21:06:34Z. Widths 1646 x 1000 and 1024 x 600. Each site's read is held by a
  `page.route` the script releases; pending and settled pictures are compared. SC-5 is read in a
  second context with `reducedMotion: 'reduce'`.
- **Control:** the run aborts (`NothingSettledError`) if a site's settled picture shows no content,
  so a skeleton cannot be read as content (ADR-0146's M6 lesson). No site raised it; no site
  recorded an `error`.

## Not reached (recorded, not skipped)

`notReached` in the record lists what the harness cannot drive today. These sites have **no
baseline** and are not graded here:

- the staff console's accounts, installation, mail, retention, alerting and security panels (need a
  verified `STAFF_EMAILS` account and the staff API config);
- the earned value dialog (needs cost data and a command click);
- the schedule summary strip (needs the toolbar popover open);
- notes, activity history, WBS members and calendar exceptions (need an activity or calendar
  selected first);
- the guest plan view (needs a live share token, and a dead one for the oracle comparison);
- the accept-invitation card (needs an invitation token).

The harness produced eleven records: the eight SC-3 tables (Projects and Plans measured as the list
on the client and project pages) and client, project and plan detail.

## SC-5 (reduced motion)

**PASS at every site and both widths:** `runningAnimationsWhilePending` is 0 for all eleven.
Nothing was animating in the baseline under `reduce`, so SC-5 has no failing baseline to improve;
it is a regression guard from here.

## SC-2 (no shift above the fill line; target |delta| <= 1 px)

`compared` is the number of anchors present in both pictures; `absent while pending` is anchors
the pending picture does not contain at all. A site that shows a spinner has no anchors to compare
(`compared: 0`) and fails by construction.

| Site             | Pending shape | Compared | Verdict (1646 / 1024) | Failing anchors (1646 x 1000)                                                              | Absent while pending                                                                           |
| ---------------- | ------------- | -------- | --------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| clients          | skeleton      | 3        | FAIL / FAIL           | first body row dy 20                                                                       | th Name, Created, Actions                                                                      |
| calendars        | skeleton      | 4        | FAIL / FAIL           | th Actions dx -381; first body row dy 20                                                   | th Name, Working days, Scope                                                                   |
| resources        | skeleton      | 2        | PASS / PASS           | none                                                                                       | none                                                                                           |
| members          | skeleton      | 9        | FAIL / FAIL           | h2 Pending invitations, h2 What each role can do, dt x4 (all dy -20); first body row dy 20 | th Name, Email, Joined, Role, Actions                                                          |
| audit-log        | skeleton      | 3        | FAIL / FAIL           | first body row dy 20                                                                       | th When, Event, By, Subject                                                                    |
| recently-deleted | skeleton      | 2        | PASS / PASS           | none                                                                                       | none                                                                                           |
| client-detail    | spinner       | 0        | FAIL / FAIL           | none comparable                                                                            | h1 Northgate Developments, h2 Projects, th Name, Actions, first body row                       |
| project-detail   | spinner       | 0        | FAIL / FAIL           | none comparable                                                                            | h1 Riverside Quarter, h2 Plans, th Name, Status, Planned start, Actions, h2 Calendars, 1st row |
| plan-detail      | skeleton      | 0        | FAIL / FAIL           | none comparable                                                                            | h1 Riverside — Phase 2 Substructure                                                            |
| projects-table   | skeleton      | 3        | FAIL / FAIL           | first body row dy 20                                                                       | th Name, Actions                                                                               |
| plans-table      | skeleton      | 5        | FAIL / FAIL           | th Actions dx -238; h2 Calendars dy -24; first body row dy 20                              | th Name, Status, Planned start                                                                 |

At 1024 x 600 the same anchors fail by the same kinds of amount (for example calendars th Actions
dx -178, members headings dy -16, plans h2 Calendars dy -24, plans th Actions dx -116).

**Reading.** The recurring `first body row dy 20` is the table skeleton's first row sitting 20 px
below the settled first row; the likely cause is the pending table having no real header row, which
this record does not itself establish. Two of the eleven sites (resources, recently-deleted) pass, and they pass with only two
anchors compared, so the pass says little. Client and project detail are not shifted so much as
absent: a centred spinner shows none of the page's anchors.

## SC-3 (#341: `fit` column width within 8 px of settled)

Only `fit` columns are graded; `auto`/`bounded`/undeclared columns are reported.

### Graded `fit` columns

| Table     | Column       | Pending (px) 1646 | Settled 1646 | Delta 1646 | Pending 1024 | Settled 1024 | Delta 1024 | Verdict 1646 / 1024 |
| --------- | ------------ | ----------------- | ------------ | ---------- | ------------ | ------------ | ---------- | ------------------- |
| clients   | Created      | 636               | 140          | -496       | 325          | 140          | -185       | FAIL / FAIL         |
| calendars | Working days | 424               | 102          | -322       | 216          | 102          | -114       | FAIL / FAIL         |
| members   | Joined       | 318               | 140          | -178       | 162          | 140          | -22        | FAIL / FAIL         |
| audit-log | When         | 318               | 158          | -160       | 162          | 158          | -4         | FAIL / PASS         |
| plans     | Status       | 424               | 57           | -367       | 216          | 57           | -159       | FAIL / FAIL         |

Nine of the ten graded readings (five columns, two widths) fail, all by 22 px or more; the single PASS (audit-log
When at 1024) passes only because the equal-share skeleton column happens to land near the settled
width. The pending width of every column in a table is the same number (the table's width divided
by its columns), which is the #341 defect in the record.

### Tables with no graded column

- **projects-table:** `NOTHING_GRADED`. Its columns are `Name` (undeclared) and `Actions`
  (undeclared); it has no `fit` column, so the harness records no verdict. The Actions column is
  `0` px while pending at both widths (settled 493 and 252 px).
- **resources, recently-deleted:** the record has **no `sc3` entry** for either, so no column
  widths were captured. The harness does not record why; it is not established here whether the
  tenant simply had no rows to settle into. These two tables are therefore **unbaselined** for SC-3.

### Reported (not graded)

`Actions` is `0` px pending on every table that has one (clients, calendars, members, projects,
plans), against 116 to 493 px settled. `auto` columns move by up to 138 px (clients Name, 1646) and
the undeclared plans Name column by 253 px at 1646.

## SC-4 (one sentence; the status never inside an `aria-busy` subtree)

The harness grades every site against an expectation of exactly one live region, none inside
`aria-busy`. It has no per-site "zero is correct where an enclosing region speaks" setting, so a
count of 0 grades FAIL even where that could be the right end state; read the `count` column, not
only the verdict.

| Site                                                                     | Live regions holding text (1646) | Inside `aria-busy` | Verdict 1646 | Count at 1024 |
| ------------------------------------------------------------------------ | -------------------------------- | ------------------ | ------------ | ------------- |
| clients, resources, members, project-detail, plan-detail, projects-table | 0                                | n/a                | FAIL         | 0             |
| calendars                                                                | 1 ("Loading…")                   | yes                | FAIL         | 0             |
| audit-log                                                                | 1 ("Loading…")                   | yes                | FAIL         | 0             |
| recently-deleted                                                         | 1 ("Loading…")                   | yes                | FAIL         | 0             |
| client-detail                                                            | 1 ("Loading…")                   | yes                | FAIL         | 0             |
| plans-table                                                              | 1 ("1 project loaded.")          | no                 | PASS         | 1             |

Two things the table does not settle:

- The four sites that read `Loading…` at 1646 (calendars, audit-log, recently-deleted, client-detail) read nothing at 1024 x 600. The record does
  not say why; the live-region census is timing-dependent for a late-filled status, and this
  baseline is **not** evidence that those sites are silent at 1024 or announce at 1646.
- The one PASS (plans-table) is a **different surface's** status ("1 project loaded." is the
  client page's settled announcement, still on screen while the Plans read is held). It is not a
  loading sentence for the table, so it is counted but not a baseline for the new contract.

What the baseline does establish: where a `Loading…` status existed at all, it sat inside an
`aria-busy` subtree (four sites at 1646), and no site that renders a table skeleton exposed a
loading sentence naming its subject.

### Table headings exposed while pending

`tableHeadingsExposedWhilePending` counts column headings in the accessibility tree during
loading: clients 3, calendars 4, resources 5, members 5, audit-log 4, recently-deleted 4,
projects-table 2, plans-table 4 (both widths); client, project and plan detail 0. These are
the unlabelled placeholder headings #341 describes and the figure M2's `aria-hidden` skeleton
should take to 0.

## Classification: confirmed or changed by the run

- **Confirmed:** the eight resource tables render a skeleton, client and project detail render a
  centred spinner, plan detail renders a skeleton (group-A classification in spec section 1.1).
- **Not confirmed (not reached):** all six sites listed under "Not reached".
- **Changed:** none.

## SC-2's 1 px and SC-3's 8 px

- **SC-2, 1 px:** kept. The failures above are 16 to 381 px, so no tolerance choice between 1 px
  and several px changes any verdict in this baseline; the figure is not tested by it either way.
- **SC-3, 8 px:** kept. The failing `fit` deltas are 22 to 496 px; the single pass is -4 px. The
  withdrawal clause (re-argue in writing if the sample-text remedy cannot reach 8 px) is not yet
  engaged: no sample-sized pending table has been measured. M2's re-run decides it.
- **Defect 5 (late-filled status and `aria-busy` interaction):** recorded as **open**. No real
  screen-reader observation is owed (owner decision): the contract is conservative by design, the
  status is never placed inside an `aria-busy` subtree, and that is checked by reading and by the
  structural gate rather than by device.
