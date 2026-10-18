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

---

# Second reading, after the one-sentence work

- **Record:** [./m7-after-second.json](./m7-after-second.json), the instrument's stdout unedited. Application and
  instrument both from this branch (`run.sha` `7d0cfb67`, plus the instrument change below, uncommitted when taken),
  tenant `shoot-co-1792307844246-1646`, taken 2026-10-18T07:25Z, same seeding command and same two widths. A fresh
  tenant again, so still not a same-tenant comparison with the first reading.
- The first reading is kept above, unedited.

## What the extra regions were (established, not suspected)

The first reading's suspicion, that `RoutePending`'s status was speaking beside the page's own, is **half right and
the other half matters**. The instrument now records each region's DOM path and whether it was still mounted at the
reading (`connected`). Run against clients, members, client-detail, plan-detail and plans-table at 1646 (the first
probe, before the judge changed), every extra region was one of three things, and **none was speaking at the same
time as the surface's sentence**:

| Extra region                                                                        | Path (last segments)                                                       | Mounted at the reading | What it is                                                                                                                          |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| "Loading…"                                                                          | `div > span` (`RoutePending`'s `role="status"`, a sibling of its skeleton) | no, on every site      | The route-pending screen, shown while the dev server compiled the chunk, unmounted before the page did.                             |
| "Loading invitations…", "Loading calendars…", "Loading projects…", "Loading plans…" | `section > div > div > div[data-loading-shape] > span`                     | no                     | A **different read** on the same page that the instrument does not hold, so it settled before the reading.                          |
| "1 project loaded."                                                                 | `div > div[data-testid=announcer]`                                         | yes                    | The navigator announcing a deep link's tree expansion on the shell's announcer. Another feature's result, not this surface's state. |

So the first reading counted every region that had **ever** held text. A region that has unmounted is not speaking, and
SC-4's wording is "while each group-A surface is pending: exactly one live region carries a sentence". The product
was not doubling up on any held surface. What it does do, on a cold navigation, is say "Loading…" (the route chunk)
and then, once the page has mounted, "Loading clients…" (the data): two sentences in **sequence** for one wait,
from two different pending surfaces. That is real, it is not what SC-4 grades, and it is left as built: `RoutePending`
is rendered instead of the route, so it cannot know the page it is waiting for will speak.

**Nothing in the product changed for this reading.** What changed is the instrument:

- `measure-loading-shapes.mjs` records `path` and `connected` for every region.
- `judgeSentences` counts the regions **mounted at the reading** and sets aside two classes it still lists
  (`unmounted`, and `shell`: a non-loading sentence on the shell announcer, which a loading sentence there would not be).
  Three self-test cases pin it; the first was verified red by making the judge ignore `connected`.
  This is a **change to the grader after seeing the result**, and it is stated as one. The argument for it is the spec's
  own wording and the DOM paths above, not the outcome; the first reading's records are untouched and are what the
  table above reports.

Unit tests pin the product side: `src/routes/pending-sentences.test.tsx` renders the clients table and the real members
page with reads that never resolve, and asserts exactly the sentences that surface owns and none inside `aria-busy`
(red-first: making `DataTable`'s shape `announce="none"` leaves zero regions and fails both).

## SC-4, per site (live regions mounted at the reading)

| Site             | First reading 1646 / 1024 (count, ever-held) | Second reading 1646 / 1024 | Speaking at the reading     | Set aside                                                   |
| ---------------- | -------------------------------------------- | -------------------------- | --------------------------- | ----------------------------------------------------------- |
| clients          | PASS 1 / FAIL 2                              | PASS 1 / PASS 1            | "Loading clients…"          | 1024: "Loading…" unmounted                                  |
| calendars        | FAIL 2 / FAIL 2                              | PASS 1 / PASS 1            | "Loading calendars…"        | 1024: "Loading…" unmounted                                  |
| resources        | PASS 1 / FAIL 2                              | PASS 1 / PASS 1            | "Loading resources…"        | "Loading…" unmounted                                        |
| members          | FAIL 3 / FAIL 3                              | PASS 1 / PASS 1            | "Loading members…"          | "Loading invitations…" (settled), "Loading…"                |
| audit-log        | FAIL 2 / FAIL 2                              | PASS 1 / PASS 1            | "Loading events…"           | 1024: "Loading…" unmounted                                  |
| recently-deleted | FAIL 2 / FAIL 2                              | PASS 1 / PASS 1            | "Loading recently deleted…" | 1024: "Loading…" unmounted                                  |
| client-detail    | PASS 1 / FAIL 2                              | **FAIL 0 / FAIL 0**        | nothing                     | "Loading projects…" (settled), "Loading…"                   |
| project-detail   | FAIL 2 / FAIL 2                              | **FAIL 0 / FAIL 0**        | nothing                     | "Loading plans…" (settled), "Loading…"                      |
| plan-detail      | FAIL 2 / FAIL 2                              | PASS 1 / PASS 1            | "Loading plan…"             | "Loading…" unmounted                                        |
| projects-table   | FAIL 2 / FAIL 2                              | PASS 1 / PASS 1            | "Loading projects…"         | "Loading…" unmounted                                        |
| plans-table      | FAIL 4 / FAIL 3                              | PASS 1 / PASS 1            | "Loading plans…"            | "Loading calendars…", "Loading…"; shell "1 project loaded." |

Nine of eleven sites pass at both widths, and the two widths now agree. **No live region is inside an `aria-busy`
subtree at any site.**

**client-detail and project-detail fail the other way: zero.** The instrument holds the client (or project) record, the
table below reads its own list and settles, and the page's header shape is `announce="none"` by design (the table's
sentence is "the one the page says while it loads", `client-detail.tsx:24`; `detail-pending.test.tsx:70,93` pin it). So
while only the record is outstanding, the page has the visible skeleton and an `sr-only` sentence that is not live, and
no one speaking. In the product's own ordering both reads start together and the record usually arrives first, so the
gap is narrow; it is nonetheless a pending surface with no spoken sentence, and the spec's "or zero where an enclosing
region speaks" does not cover it because the enclosing region has already gone. **Not changed, because it is a design
choice with two readings** (the header's sentence becomes polite, giving two simultaneous sentences when both reads are
in flight; or the table's sentence is withheld until the header settles, which couples two components). That is the
product owner's call.

## SC-2 and SC-3, second reading (reported, nothing changed)

Identical to the first reading at every site and width: the same verdicts, the same compared-anchor counts and the same
failing-anchor counts (SC-2 PASS only at resources and recently-deleted; FAIL at the other nine). SC-3: clients
Created 147/140 PASS, members Joined 147/140 PASS, audit-log When 161/159 PASS, project-detail Status 57/57 PASS;
calendars Working days 190/102 FAIL and plans Status 71/57 FAIL, as before; projects-table and client-detail
NOTHING_GRADED. SC-5: 11/11 PASS at both widths. The second reading therefore corroborates the first on every
criterion except SC-4, where the difference is in the grader and is explained above.

---

# Third reading, after the product owner's three answers (2026-10-18)

- **Record:** [./m7-after-third.json](./m7-after-third.json), the instrument's stdout unedited. Instrument and
  judge from the working tree on top of `13dcdcb2` (`run.sha`; the judge, the instrument and the two detail
  pages were uncommitted when taken), tenant `shoot-co-1792311493080-1646`, taken 2026-10-18T08:21Z, same
  seeding command and widths. A fresh tenant again: not a same-tenant comparison. The earlier readings stay
  above, unedited.
- **What changed since the second reading:** (1) the product owner's three decisions
  (`docs/DECISIONS.md`, 2026-10-18; spec SC-2, SC-3 and SC-4 carry dated notes), (2) the judge was changed to
  match the amended SC-2 text, and (3) client and project detail now speak (below). **The grader changed after
  seeing the result, again, and by the owner's instruction**; the judge's fixtures pin each new class and one
  was verified red by making the judge ignore a column's declared mode. The instrument now also records each
  table's row count and body height, so a shift under a table can be tested rather than argued.

## SC-4: what a screen reader hears on the client and project screens

One live sentence while anything is pending, none when all is settled. Verified by the real screens in
`pending-sentences.test.tsx` and by the instrument below.

| State                          | Client screen       | Project screen     |
| ------------------------------ | ------------------- | ------------------ |
| Heading read and list both out | "Loading projects…" | "Loading plans…"   |
| Heading read out, list settled | "Loading client…"   | "Loading project…" |
| Both settled                   | nothing             | nothing            |

The table's sentence is the existing `DataTable` status (polite, mounted empty and filled after mount, outside
any `aria-busy`). The heading's sentence is the same `LoadingShape`, now `polite` instead of `none` once the
page sees the list has settled. When the list settles first, the table's status unmounts and a new status
mounts empty and is filled straight after mount, so the sentence changes from "Loading projects…" to "Loading
client…" as two announcements in sequence, never together. A list that errors counts as settled, so the heading
sentence is then the page's one live sentence beside the table's error alert. The page asks for the list with
the same query as the table (same key), so no request is added.

## SC-4, third reading (live regions mounted at the reading)

All 11 sites PASS at both widths with exactly one sentence, including client-detail ("Loading client…") and
project-detail ("Loading project…"), which the second reading found speaking nothing. Two things worth knowing:
plan-detail at 1024 recorded "Loading…" (the route-level status, still mounted when the read was taken) where
1646 recorded "Loading plan…"; both are one sentence, and the difference is timing. No region is inside an
`aria-busy` subtree anywhere.

## SC-5

11/11 PASS at both widths.

## SC-3 (unchanged by this work)

Passing: clients Created 147/140, members Joined 147/140, audit-log When 161/159, project-detail Status 57/57.
`NOTHING_GRADED`: projects-table, client-detail. Unbaselined: resources, recently-deleted.
**Accepted, documented exceptions (owner, 2026-10-18; still FAIL in the record):** calendars Working days
190 pending / 102 settled (88 px over), plans Status 71 / 57 (14 px over), at both widths, applying the
spec's withdrawal clause. The re-argument: a worst-case sample over-reserves for ordinary data by an amount the
data decides; a median sample would under-reserve for the wide case; the owner kept the widest-value sample.

## SC-2, third reading (amended judge)

Verdict per site, the same at both widths. `reported` = graded as reported only, with the class.

| Site             | Verdict        | Compared | Reported (1646)                                                     | Absent by construction / appears below   |
| ---------------- | -------------- | -------- | ------------------------------------------------------------------- | ---------------------------------------- |
| clients          | PASS           | 5        | th Created dx -350 (follows upstream)                               | th Actions                               |
| calendars        | PASS           | 6        | th Working days dx -182 (follows upstream), th Scope dx -270 (auto) | th Actions                               |
| resources        | PASS           | 2        | none                                                                | none                                     |
| members          | **FAIL**       | 13       | th Email -219, th Role -56 (auto), th Joined -48 (follows upstream) | th Actions                               |
| audit-log        | PASS           | 7        | th Event -2, th By -33, th Subject +99 (auto)                       | none                                     |
| recently-deleted | PASS           | 2        | none                                                                | none                                     |
| client-detail    | PASS           | 4        | none                                                                | h1 (subject)                             |
| project-detail   | PASS           | 6        | none                                                                | h1 (subject); h2 Calendars appears below |
| plan-detail      | NOTHING_GRADED | 0        | none                                                                | h1 (subject)                             |
| projects-table   | PASS           | 4        | none                                                                | th Actions                               |
| plans-table      | **FAIL**       | 7        | th Status +263 (follows upstream), th Planned start +249 (auto)     | th Actions                               |

"Follows upstream" is the judge's own arithmetic, not a reading of the owner's words, and is flagged for
review: a `fit` column's heading moves by exactly the summed width change of the columns on its left (clients
Created -350 is exactly Name's 1124 to 774), all of which are `auto` / `bounded` / undeclared; where that sum
does not account for the move the heading fails. If the owner meant only a column's own declared mode, four
headings (clients Created, calendars Working days, members Joined, plans Status) go back to FAIL, and clients
and calendars with them.

**plan-detail is `NOTHING_GRADED`, not a pass:** the settled page's only anchor is the subject's h1, absent
by construction, so nothing about its stability is demonstrated. **Absent by construction is a reported
class, not a pass:** `th Actions` on five tables and the subject h1 on three pages are listed under
`absentByConstruction` in the record.

### What still fails after the amendment

Two sites, at both widths: the headings below the table on **members** (`h2 Pending invitations`,
`h2 What each role can do` and four `dt`, dy -62 at 1646 and -58 at 1024) and **plans-table** (`h2 Calendars`,
dy -66 at both). This is not shown to be row-count growth, and is not waved through. What the record
establishes (per-table rows and heights are now in it):

| Table (1646) | Placeholder    | Settled      | Body change | Shift of the heading below |
| ------------ | -------------- | ------------ | ----------- | -------------------------- |
| members      | 3 rows, 115 px | 1 row, 53 px | -62         | -62                        |
| plans-table  | 3 rows, 115 px | 1 row, 49 px | -66         | -66                        |

(1024: members 57 px settled, shift -58; plans the same as 1646.) The whole shift is the table body changing
height, and nothing above the table moved. But the placeholder rows are about 38 px each against 49 to 57 px
for a real row on this seed, so even the two-row reduction is not the whole of it: the placeholder block is 44
px (members) and 32 px (plans) shorter than three real rows. Whether the real rows are taller because they
carry a second line a skeleton cannot know about is **not established** here; it was not measured. So these
two are a placeholder-row-height question on top of the row count the spec accepts, and the spec's growth rule
does not cover the height half. The decision to take is whether a placeholder row should be as tall as a typical
real row on these two tables, or whether this is also accepted.

### Net

SC-2 after the amendment: 8 of 11 sites graded PASS, 1 `NOTHING_GRADED` (plan-detail), 2 FAIL (members,
plans-table), at both widths. Note that the 8 PASS include only anchors the amendment makes reportable; the
comparable anchors that remain (headings above the table, first body row) all hold at 0 px.

# Fourth reading, placeholder rows sized to a settled row (2026-10-18)

- **Record:** [./m7-after-fourth.json](./m7-after-fourth.json), the instrument's stdout unedited. Application, instrument and
  judge from `66ef9f30` (`run.sha`), tenant `shoot-co-1792313548118-1646`, taken 2026-10-18T08:52Z, same seeding
  command and widths. A fresh tenant: not a same-tenant comparison. Judge self-test passed first.
- **Cause, read from the code and the records (not guessed):** a settled row is its tallest control plus `py-2`
  twice plus the 1 px rule. Plans: a small `Button` (`--control-h-sm`, 32) gives 49, the figure `globals.css`
  records. Members: the role `Select` (`--control-h`, 36) gives 53. A placeholder cell held a 14 px bar or a
  20 px text line, so a row was about 38 px. The fix gives each placeholder cell `min-h-(--control-h-sm)`, the token the
  small button reads, so a placeholder row is 49 px and grows with a coarse pointer as the real row does.

| Site (both widths) | Third reading | Fourth reading                                         |
| ------------------ | ------------- | ------------------------------------------------------ |
| plans-table        | FAIL          | **PASS** (7 compared)                                  |
| members            | FAIL          | **FAIL**, shift -94 (1646) and -90 (1024)              |
| the other nine     | as before     | as before (8 PASS, plan-detail still `NOTHING_GRADED`) |

**Members still fails, and by more in absolute terms.** The placeholder body is now 147 px (3 x 49) against 1 row
of 53 px at 1646 (57 at 1024): the shift is -94 and -90, where it was -62 and -58. That is row-count growth the
spec accepts, but the judge explains it only when each placeholder row is within 1 px of a settled row, and
here it is 4 px short at 1646 (residual 12 over three rows) and 8 short at 1024 (residual 24). The 4 px is
the `Select` (36) against the small control (32) the shared placeholder reserves. Why the settled row is
57 px at 1024 (4 px more again) was not established. Closing members needs the skeleton to know a column holds
a form-height control, which is a new `Column` prop (an additive change to a shared component's public
contract, ADR-0105), or the roster's `Select` to be a small control (a UI change). Neither is made here.
