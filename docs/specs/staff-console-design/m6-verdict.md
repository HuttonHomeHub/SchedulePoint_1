# M6 — the verdict, measured in one sitting

**Status:** Approved
**Taken:** 2026-09-15, Chromium, 1646 × 1000, §4.7 unhealthy recipe, one sitting.
**Instrument:** a one-off probe (`#165(e)`) driving the real product at `/staff`.

## 1. The two guards ran before any verdict was printed

**The `<h1>` guard.** The harness asserts the heading reads "Staff console" and **throws** otherwise,
because M0's first run reported `FC-1: 0 of 5 → FAIL` **from the sign-in screen**, in the format of a
real result. An instrument that cannot tell "the condition is absent" from "I am on the wrong screen"
is worse than none.

**The non-vacuity control.** Both conditions the recipe _turns on_ — `MAIL_SMTP_URL` unset and
`RETENTION_SWEEP_ENABLED=false` — must be present or the run is refused. The two ambient ones
(`MAIL_ALERT_URL`, `HEARTBEAT_URL`) are reported and can satisfy nothing, because they are empty by
default on every boot (CLAUDE.md §17) and M0's control passed against a **healthy** API by finding
exactly those.

Both passed on every run below.

## 2. FC-2 is measured in ONE sitting, which is the only way it means anything

`m0-measurement.md` §10 recorded the baseline drifting **+555 px on its own** with no product change,
because two of the page's tables only grow — and staff activity grows by roughly seven rows _every
time the console is opened_, including by the harness. So the before and after are taken minutes
apart against the same database: `git checkout 4c923ef5 -- apps/web/src`, measure, restore, measure.

|                                |     before |    after A |    after B |
| ------------------------------ | ---------: | ---------: | ---------: |
| Document height                | **15,286** | **12,770** | **12,696** |
| FC-1 conditions above the fold | **3 of 5** | **5 of 5** | **5 of 5** |
| Narrowest table                |    **798** |  **1,438** |  **1,438** |

The after-A/after-B spread is **74 px (0.6 %)** — the harness's own drift, and an order of magnitude
below the 2,516 px delta, which is what makes the verdict a verdict rather than noise. Reporting the
spread is not decoration: ADR-0128 records a machine whose no-change baseline moved by more than the
bar, and that run was honestly called INDETERMINATE.

## 3. All five conditions

| #         | condition                                                                                     | baseline  | measured                                                                                  | verdict  |
| --------- | --------------------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------- | -------- |
| **FC-1**  | every non-healthy condition named or counted within the first viewport                        | 3 of 5    | **5 of 5**                                                                                | **PASS** |
| **FC-1a** | `StaffStatusSummary` precedes every section in DOM order; each condition links to its section | —         | first section is `Status`; **5 links**; every target resolves and carries `tabindex="-1"` | **PASS** |
| **FC-2**  | document height ≤ the baseline, same state                                                    | 15,286 px | **12,696–12,770 px (−16.4 %)**                                                            | **PASS** |
| **FC-3**  | `weightSites()` outside `components/ui/` **falls** from 173; arbitrary sizing stays ≤ 17      | 173 / 17  | **168** (ratchet set to it; 167 fails naming 168) / **17**                                | **PASS** |
| **FC-4**  | no table narrower than the 798 px it measures today                                           | 798 px    | **1,438 px (+80 %)**, every table                                                         | **PASS** |

FC-1's detail at 1646, as scroll-position of each condition's own sentence against a 1,000 px fold:

| condition                   |        M0 |     now |
| --------------------------- | --------: | ------: |
| no mail transport           |       194 | **235** |
| failure alerting off        |       325 | **775** |
| heartbeat off               |       325 | **775** |
| retention sweeping disabled | **1,562** | **298** |
| unverified accounts         | **2,445** | **361** |

The two that failed are now the second and third things on the page, because the summary states them
rather than the reader having to reach the panel that owns them. That is the epic's justification
measured at both ends.

## 4. What the verdict does NOT establish

- **One width.** 1646 is the product owner's own screen and the width ADR-0091's retrospective
  established two whole epics had never measured at, so it is the right one — but 1280 and 1440 were
  measured only at M0, and the page's responsive behaviour below `md` is untested by this instrument.
- **One database.** The performance panel holds roughly fifteen accumulated sittings on this machine;
  an installation with none renders a much shorter page, and one with fifty renders a longer one.
  FC-2's ratio is not portable.
- **FC-2 remains the weakest of the five**, for the reason §6 of the plan gives and `m0-measurement.md`
  §10 gives independently: two columns shorten a page by construction. It is reported because it was
  committed, not because it decides anything. **FC-1 decides this epic, and it failed at M0.**
