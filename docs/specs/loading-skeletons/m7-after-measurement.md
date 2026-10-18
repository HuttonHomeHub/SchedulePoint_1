# M7 measurement: loading-state after the build (TECH_DEBT #234 + #341)

- **Spec:** [./spec.md](./spec.md) (SC-2, SC-3, SC-4, SC-5)
- **Records:** [./m0-baseline.json](./m0-baseline.json) (before), [./m7-after.json](./m7-after.json) (after), each the
  instrument's stdout, unedited. Baseline write-up: [./m0-measurement.md](./m0-measurement.md).
- **Instrument and judge:** `apps/web/scripts/measure-loading-shapes.mjs`, graded by
  `measure-loading-shapes.judge.mjs`. Every verdict below is the `verdict` field the judge wrote into the two records
  (the records hold the judge's output, not raw inputs); nothing here is re-graded by hand.

## Conditions, and how they differ from the baseline

|                                 | Baseline                                        | After                                                           |
| ------------------------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| Application under test          | `main` plus one unrelated fix (`186d2319`)      | `main` plus the whole batch including this branch at `11799ed9` |
| Instrument checkout (`run.sha`) | `1fa84654`                                      | `11799ed9`                                                      |
| Tenant                          | `shoot-co-1792271185901-1646`                   | `shoot-co-1792307417710-1646`                                   |
| Taken                           | 2026-10-17T21:06:34Z                            | 2026-10-18T07:10:28Z                                            |
| Seeding                         | `pnpm shoot --width 1646 --only plan-workspace` | the same command                                                |

Both tenants are the same seed seeded fresh, so their data is the same shape, but the tenant ids and dates differ, so
this is **not** a same-tenant comparison. Same sites, same two widths, same hold-and-release method. The run raised no
`NothingSettledError` and no site recorded an `error`. The same six site groups are not reached as in the baseline
(`notReached` in the record: staff console panels, earned value dialog, schedule summary strip, notes / history / WBS
members / calendar exceptions, guest plan view, accept invitation); they have no before or after and are not graded.

## Summary

| Criterion                       | Baseline                        | After                                                                |
| ------------------------------- | ------------------------------- | -------------------------------------------------------------------- |
| SC-5 reduced motion             | 11/11 sites PASS at both widths | 11/11 PASS at both widths                                            |
| SC-3 graded `fit` columns       | 1 of 10 readings PASS           | 8 of 10 readings PASS; 2 FAIL (calendars Working days, plans Status) |
| SC-2 anchors (1646 / 1024)      | 2 sites PASS                    | 2 sites PASS (the same two); 9 FAIL                                  |
| SC-4 one sentence (1646 / 1024) | 1 site PASS / 1 PASS            | 3 sites PASS at 1646 (clients, resources, client-detail); 0 at 1024  |

SC-2 and SC-4 are **not met**. SC-3 is met on three of five graded columns and fails on two. The two passing SC-2
sites pass as they did before, on two compared anchors each, so that pass says little.

## SC-5 (reduced motion)

PASS at every site and both widths, before and after (`runningAnimationsWhilePending` 0 throughout). A regression guard,
held.

## SC-3 (`fit` column pending width within 8 px of settled)

Only `fit` columns are graded. Pending / settled / delta in px; verdict at 1646 / 1024.

| Table     | Column       | Before 1646 (p/s/d) | After 1646 (p/s/d) | Before 1024 (p/s/d) | After 1024 (p/s/d) | Before      | After       |
| --------- | ------------ | ------------------- | ------------------ | ------------------- | ------------------ | ----------- | ----------- |
| clients   | Created      | 636/140/-496        | 147/140/-7         | 325/140/-185        | 147/140/-7         | FAIL / FAIL | PASS / PASS |
| calendars | Working days | 424/102/-322        | 190/102/-88        | 216/102/-114        | 190/102/-88        | FAIL / FAIL | FAIL / FAIL |
| members   | Joined       | 318/140/-178        | 147/140/-7         | 162/140/-22         | 147/140/-7         | FAIL / FAIL | PASS / PASS |
| audit-log | When         | 318/158/-160        | 161/159/-2         | 162/158/-4          | 161/159/-2         | FAIL / PASS | PASS / PASS |
| plans     | Status       | 424/57/-367         | 71/57/-14          | 216/57/-159         | 71/57/-14          | FAIL / FAIL | FAIL / FAIL |

Before: 1 of 10 readings pass. After: 8 of 10.

- **projects-table:** `NOTHING_GRADED` before and after (no `fit` column). Not a pass.
- **project-detail** (its plans table, Status `fit`): not captured in the baseline (pending was a spinner); after, 57/57/0
  PASS at both widths. **client-detail** after: `NOTHING_GRADED`.
- **resources, recently-deleted:** neither record has an `sc3` entry, before or after. The harness does not say why; still
  **unbaselined and ungraded**, so SC-3's "eight tables" is covered for six.

### SC-3 withdrawal clause, applied as written

The spec: "if M0 shows the sample-text remedy cannot reach 8 px on a `fit` column, the target is re-argued in writing in
`m0-measurement.md`, not quietly relaxed." The remedy has now been measured, and on two columns it did not reach 8 px.
The re-argument goes here, because this is where the evidence is, and `m0-measurement.md` is a record of the baseline
and is left unedited:

- **plans Status:** 71 pending against 57 settled, delta 14 px, at both widths. Pending is wider than settled by a
  constant, on the seeded plan. The column's declared `sample` is `PLAN_STATUS_LABELS.ARCHIVED`
  (`PlansTable.tsx:66`), the widest label, while the seeded plan carries a narrower one. This is read from the source
  constant and the two widths, not from a further measurement.
- **calendars Working days:** 190 pending against 102 settled, delta 88 px, at both widths. Its `sample` is the first six
  weekday labels joined (`CalendarsTable.tsx:243`), a worst case for a column whose seeded rows are narrower.
- **What this shows:** a worst-case sample over-reserves for ordinary data, by an amount that depends on the data and so
  cannot be driven to 8 px by any single sample. A sample the width of the median value would under-reserve for the wide
  case instead. The 8 px target is therefore not reachable for these two columns by this remedy as built.
- **Not decided here:** whether to keep 8 px and choose narrower samples, or to re-set the tolerance for worst-case-sample
  columns, is a spec change and the product owner's call. The target is **not relaxed by this document**: both columns
  are recorded as FAIL above and in the summary. The improvement is real (calendars -322 to -88, plans -367 to -14) and is
  not a pass.

## SC-2 (no shift above the fill line; |delta| <= 1 px)

Anchors present in both pictures are compared; `absent` anchors the pending picture does not contain. Failing anchors at
1646 x 1000 (dx, dy as recorded); 1024 x 600 fails the same anchors by different amounts unless noted.

| Site             | Shape before / after | Compared before / after | Verdict before / after (1646, 1024) | Failing anchors after (1646)                                                                                | Absent after                       |
| ---------------- | -------------------- | ----------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| clients          | skeleton / skeleton  | 3 / 5                   | FAIL, FAIL / FAIL, FAIL             | th Created dx -350                                                                                          | th Actions                         |
| calendars        | skeleton / skeleton  | 4 / 6                   | FAIL, FAIL / FAIL, FAIL             | th Working days dx -182; th Scope dx -270                                                                   | th Actions                         |
| resources        | skeleton / skeleton  | 2 / 2                   | PASS, PASS / PASS, PASS             | none                                                                                                        | none                               |
| members          | skeleton / skeleton  | 9 / 13                  | FAIL, FAIL / FAIL, FAIL             | th Email -219; th Joined -48; th Role -56; h2 Pending invitations, h2 What each role can do, 4 x dt: dy -62 | th Actions                         |
| audit-log        | skeleton / skeleton  | 3 / 7                   | FAIL, FAIL / FAIL, FAIL             | th Event -2; th By -33; th Subject +99                                                                      | none                               |
| recently-deleted | skeleton / skeleton  | 2 / 2                   | PASS, PASS / PASS, PASS             | none                                                                                                        | none                               |
| client-detail    | spinner / skeleton   | 0 / 4                   | FAIL, FAIL / FAIL, FAIL             | none comparable                                                                                             | h1 Northgate Developments          |
| project-detail   | spinner / skeleton   | 0 / 6                   | FAIL, FAIL / FAIL, FAIL             | none                                                                                                        | h1 Riverside Quarter, h2 Calendars |
| plan-detail      | skeleton / skeleton  | 0 / 0                   | FAIL, FAIL / FAIL, FAIL             | none comparable                                                                                             | h1 (title)                         |
| projects-table   | skeleton / skeleton  | 3 / 4                   | FAIL, FAIL / FAIL, FAIL             | none                                                                                                        | th Actions                         |
| plans-table      | skeleton / skeleton  | 5 / 7                   | FAIL, FAIL / FAIL, FAIL             | th Status +263; th Planned start +249; h2 Calendars dy -66                                                  | th Actions                         |

(project-detail and client-detail after: the judge lists no failing anchor, yet the verdict is FAIL; the cause is the
absent heading anchors, which the judge grades as a failure. Likewise projects-table.)

What changed: every baseline `first body row dy 20` is gone (clients, calendars, members, audit-log, projects-table,
plans-table). Client and project detail no longer show a spinner. Where this regressed or did not move:

- **Column heading x positions now fail** where they did not appear before because the headings were absent while
  pending. Pending header cells now exist, but a table whose columns are `auto` or undeclared lays out differently with
  skeleton cells than with data (clients Name is `auto`: 1124 pending against 774 settled, `sc3.columns`). The judge counts
  that as a shifted anchor. **This is a real gap against SC-2 as written**; the spec lists "a table's column headings"
  among the anchors and does not exempt `auto` columns from it.
- **Headings below a table moved further in two places:** members (dy -20 before, -62 after) and plans h2 Calendars
  (-24 before, -66 after). These sit below the table, and the spec accepts growth below the last placeholder because a
  skeleton cannot know a row count. Whether the whole of the -62 and -66 is that accepted growth is **not established**:
  the record does not separate row-count growth from the pending block's own height. They are graded FAIL here, not
  waved through.
- **Absent anchors that are unavoidable by construction:** a skeleton cannot know the subject's name, so h1 on the three
  detail pages is absent while pending. plan-detail has no other anchor, so `compared: 0` and nothing about its stability
  is demonstrated. This is a limit of what a skeleton can show, but the judge cannot pass it and the spec does not say it
  is excused. It is recorded as a FAIL with that reason, and `th Actions` absent on five tables is the same kind
  (its cell is `0` px while pending, `sc3.columns` Actions pending 0).
- **resources, recently-deleted** pass as before, on two anchors each.

SC-2 verdict: **not met** at 9 of 11 sites, at both widths.

## SC-4 (one sentence, none inside `aria-busy`)

Live regions that held text while pending (count; texts; inside `aria-busy`). The judge expects exactly 1.

| Site             | Before 1646                                    | After 1646                                                                       | After 1024                              |
| ---------------- | ---------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------- |
| clients          | 0                                              | **PASS** 1 ("Loading clients…")                                                  | FAIL 2 ("Loading…", "Loading clients…") |
| calendars        | FAIL 1 ("Loading…", in busy)                   | FAIL 2 ("Loading…", "Loading calendars…")                                        | FAIL 2                                  |
| resources        | 0                                              | **PASS** 1 ("Loading resources…")                                                | FAIL 2 ("Loading…", ...)                |
| members          | 0                                              | FAIL 3 ("Loading…", "Loading members…", "Loading invitations…")                  | FAIL 3                                  |
| audit-log        | FAIL 1 (in busy)                               | FAIL 2 ("Loading…", "Loading events…")                                           | FAIL 2                                  |
| recently-deleted | FAIL 1 (in busy)                               | FAIL 2 ("Loading…", "Loading recently deleted…")                                 | FAIL 2                                  |
| client-detail    | FAIL 1 (in busy)                               | **PASS** 1 ("Loading projects…")                                                 | FAIL 2                                  |
| project-detail   | 0                                              | FAIL 2 ("Loading…", "Loading plans…")                                            | FAIL 2                                  |
| plan-detail      | 0                                              | FAIL 2 ("Loading…", "Loading plan…")                                             | FAIL 2                                  |
| projects-table   | 0                                              | FAIL 2 ("Loading…", "Loading projects…")                                         | FAIL 2                                  |
| plans-table      | PASS 1 (the client page's "1 project loaded.") | FAIL 4 ("Loading…", "Loading plans…", "Loading calendars…", "1 project loaded.") | FAIL 3                                  |

- **Gained:** every site now has a sentence naming its subject, and **no live region is inside an `aria-busy` subtree
  at any site** (`insideBusy` empty throughout) against four in the baseline. The structural half of the contract held.
- **Failing:** the "exactly one" half. The extra region is mostly a generic "Loading…" beside the subject sentence. A
  status with that exact text and `role="status"` exists in `RoutePending` (`route-pending.tsx:38,41`), which is the
  likely source, since the instrument counts every region that held text at any time while the response is held. I did
  not establish that by instrumenting the run, so it is stated as the probable cause and not as a finding.
  Whether that counts as a defect or as the instrument double-counting a route-level region the spec's "or zero where an
  enclosing `StatusSection` / `RoutePending` speaks" clause already allows, is open: the judge as written grades it FAIL.
- **members** (3) and **plans-table** (4) carry two real subject sentences each (two sections load on the page), which is
  how many the page owns, but also fail "exactly one" as graded. plans-table's "1 project loaded." is the client page's
  settled message, as in the baseline.
- The 1646 and 1024 counts differ for the same site (clients PASS then FAIL), the timing dependence the baseline already
  warned of; neither width is more reliable.

SC-4 verdict: **not met** (3 of 11 at 1646, none at 1024), with the structural half met and the count half failing.

## What passed, what failed, and what this is not

- **Passed:** SC-5 everywhere; SC-3 on clients, members, audit-log and project-detail; no status inside `aria-busy`;
  the spinners on client and project detail are gone; the first-body-row offset is gone.
- **Failed, real gaps against the spec as written:** SC-2 header x positions on `auto`/undeclared columns, and the
  dy of the headings under members and plans tables (cause partly spec-accepted, not separated); SC-4's count at most
  sites; SC-3 on calendars and plans (see the clause).
- **Failed, by construction, undecided by the spec:** h1 and `th Actions` absent while pending; plan-detail has no
  comparable anchor.
- **Not measured:** the six groups under `notReached`; SC-3 on resources and recently-deleted; SC-1 (a grep, not this
  instrument); SC-6 (forced colours, `e2e-forced-colors`, not this instrument).
- **Not a same-tenant comparison** (see Conditions).
