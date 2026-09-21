# M-B-T1 — the thirteen journeys, converted and triaged

**FC-6, all five clauses.** Taken 2026-09-20 against the tree at `1eb9afe3` plus the thirteen pin
removals, on a quiet local Postgres.

---

## Clause 1 + 2 — the result

**13 of 13 green. Zero re-pins, zero skips.** Each suite was run through `scripts/e2e-local.sh
web:<suite>`, one at a time, nothing else touching the database.

| Suite            | Exit | Suite           | Exit |
| ---------------- | ---- | --------------- | ---- |
| `authoring`      | 0    | `library`       | 0    |
| `authoring-flow` | 0    | `multi-select`  | 0    |
| `copy-paste`     | 0    | `resource-view` | 0    |
| `gantt`          | 0    | `search-nav`    | 0    |
| `interchange`    | 0    | `share`         | 0    |
| `loe`            | 0    | `undo`          | 0    |
| `wbs`            | 0    |                 |      |

## Clause 3 — the failures, and why there are none to classify

**There were three, and all three were the instrument.** The first sweep reported `authoring`, `loe`
and `wbs` red, and `authoring`'s failure looked like a real product defect: the create popover closed
(so the activity persisted) and the diagram listbox stayed at zero options for the full 15 s — which
reads exactly like "the bar never plots under placement".

It is not what happened. Two other agents were working the same local `app_test` at the time — one
replaying 63 migrations into a populated fixture, one seeding the catalogue through the public API.
A second run of `authoring` failed **differently** (a 401 on the clients list immediately after the
organisation was created, a shape no flag can produce), which is the tell: a defect does not change
its symptom between two runs of the same code.

Re-run on a quiet database, `authoring` passed three consecutive times, and `loe`, `wbs` and `undo`
passed first time. The other nine were run afterwards and passed first time.

**This is recorded rather than dropped, because the near-miss is the finding.** The hypothesis under
construction when the second run came back was that ADR-0033's mandatory data date had removed
ADR-0032's "first draw pins the start to today", so a drawn activity never got an `earlyStart`. That
is a coherent, plausible, entirely false story about a real decision, and it would have produced a
"fix" to a journey that was correct all along — the ADR-0104 shape, where a suite is edited to pin
the broken state.

**It also names a gap in a guard that already exists.** `scripts/e2e-local.sh` refuses to run while
anything answers on 3000 or 5173 (ADR-0099's finding: a leftover dev server is silently adopted and a
config's flag pins never apply). It does **not** refuse while another process holds `app_test`, and
the failure mode is the same one that guard was written for — a result produced by the environment
and read as a result about the code. The seed agent hit the same wall independently and killed its
own `e2e-local.sh api` run rather than corrupt this one. Filed as `docs/TECH_DEBT.md` #349, with a candidate remedy (an advisory lock on `app_test`, refusing
with the holder rather than queueing) and the part of it that needs measuring first.

## Clause 4 — every pass, and what it did NOT buy

**None of the thirteen contains an assertion sensitive to placement being live. Not one.** That is
coverage this conversion did not buy, and it is stated first because thirteen green ticks otherwise
report it as success.

Three independent statements, weakest last:

**(a) Structural, and it is a proof rather than a survey.** Every plan any of these suites creates is
`EARLY` — nothing sets `schedulingMode`, and the API's default is `EARLY`. The Late-start overlay
defaults off. `barDateSourceFor(mode, lateOverlay)` (`apps/web/src/lib/bar-dates.ts:37-40`) returns
`'early'` for exactly that pair, and `barDatesFor` then reads `earlyStart`/`earlyFinish` — which is
byte-for-byte the flag-off path. So the bars in these thirteen suites are **provably** in the same
pixels with the flag on as with it off, and no assertion about a bar's position in any of them can
be sensitive to placement. This is the parity argument, not an observation that they happened to
agree.

**(b) Measured.** All thirteen were green pinned (they are CI steps) and are green unpinned. Thirteen
suites, two flag states, identical results.

**(c) Searched — the weakest, included because it covers what (a) does not.** Across all thirteen
directories, `Visual mode`, `Early mode`, `Late-start overlay`, `Clear visual placement`,
`Visual conflict`, `visualStart` and `schedulingMode` occur **zero** times. So no suite reaches the
mode chrome by name either.

**What the conversion DID buy, and it is not nothing.** **Nine** of the thirteen run a whole-page
`AxeBuilder` scan at `wcag2a`/`wcag2aa`: `authoring`, `authoring-flow`, `gantt`, `interchange`,
`library`, `loe`, `resource-view`, `share`, `undo`. The mode segmented control, the View ▾ overlay
entry and the Visual-conflict legend row are inside that scan with the flag on and were outside it
with the flag off. So the conversion bought **accessibility cover of the mode chrome in nine suites**
and **zero placement-behaviour cover in thirteen**.

(This paragraph said **ten** in its first draft, and listed `multi-select` as the tenth "via its own
spec" — a suite that runs no axe scan at all. A count nobody re-derived, in the file whose subject is
not mistaking a green tick for cover. Corrected by running `grep -rl AxeBuilder` over the thirteen
directories and counting the output rather than reading the earlier table.)

Per-suite, in the terms clause 4 asks for:

| Suite            | Placement-sensitive assertion? | Note                                                                             |
| ---------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| `authoring`      | No                             | Draws on an EARLY plan; bars provably identical. Axe now covers the mode chrome. |
| `authoring-flow` | No                             | Arm/disarm contract only. Axe now covers the mode chrome.                        |
| `copy-paste`     | No                             | No axe scan either — this suite gained nothing at all.                           |
| `gantt`          | No                             | Reads the same `barDateSourceFor` seam and is EARLY throughout. Axe gained.      |
| `interchange`    | No                             | Import target is always a new plan, and it is EARLY. Axe gained.                 |
| `library`        | No                             | Calendars/resources — no diagram assertion at all. Axe gained.                   |
| `loe`            | No                             | LOE spans on an EARLY plan. Axe gained.                                          |
| `multi-select`   | No                             | Selection arithmetic, mode-independent. No axe scan — gained nothing.            |
| `resource-view`  | No                             | Strip buckets read computed dates, EARLY. Axe gained.                            |
| `search-nav`     | No                             | Cycle ordering, mode-independent. No whole-page axe scan.                        |
| `share`          | No                             | Guest read; the share scope has no mode surface. Axe gained.                     |
| `undo`           | No                             | Inverses of EARLY-mode edits. Axe gained.                                        |
| `wbs`            | No                             | Band grouping, mode-independent. No whole-page axe scan.                         |

**The consequence for this epic, stated so it cannot be mistaken for a closed question.** Visual-mode
behaviour is exercised end to end by **three** suites in this repository, not one:

| suite                  | how it reaches Visual mode                                              |
| ---------------------- | ----------------------------------------------------------------------- |
| `e2e-workspace-chrome` | the `Visual mode` toggle, through the UI (`support.ts` `useVisualMode`) |
| `e2e-gantt-editing`    | `bar-drag.spec.ts:72` — a browser `fetch` PATCHing `schedulingMode`     |
| `e2e-gantt-editing`    | `grid-edit.spec.ts:175` — the same helper, copied                       |

**This paragraph said "exactly one" until the clause-5 review, and the error was ADR-0076's shape
exactly.** The sentence reads as a structural finding and names no command, and the command that
would have established it — a repo-wide grep for `schedulingMode` and `'VISUAL'` — was never run;
clause 4(c)'s grep was scoped to the thirteen directories, where the answer is genuinely zero. The
two `gantt-editing` specs reach Visual mode by a **direct API PATCH rather than an env pin**, so
every instrument this milestone used looked straight past them. Both files say so in their own
docblocks (`bar-drag.spec.ts:26-29`, `grid-edit.spec.ts:433-435`), and `falsification.md`'s
committed baseline already named `gantt-editing` among the non-pin docblocks.

**It matters because M-F-T4 breaks them.** That task removes `schedulingMode` from `UpdatePlanDto`,
and its own testing note specifies that the removed field must yield **422** — which is precisely
what `useVisualMode`'s PATCH will then receive, so the helper throws. Measured exactly rather than
estimated:

- **2 tests break outright** — `grid-edit.spec.ts:480` and `bar-drag.spec.ts:157`, the only two
  callers of that helper (`:175` and `:72` are the definitions).
- **2 more assert behaviour M-F deliberately changes** — `grid-edit.spec.ts:437` and
  `bar-drag.spec.ts:138`, the EARLY-mode siblings asserting that a typed date pins an SNET and a
  keyboard move writes a constraint. M-F-T3 makes both write a placement, so they do not break;
  they become **wrong**, which is worse.

So four tests are in scope and the two halves fail differently. **The review reported "four tests
break"**, which is right about the population and wrong about the mechanism — it counted each
file's helper definition as a call site. Recorded rather than repeated: an uncounted count inside a
review whose own subject is unverified claims is the same defect one level up.

The coverage this epic needs still comes from M-B-T3's seeded placements and from the journeys M-F
will own. What changed is that M-F now owns a **conversion**, not just new work.

## Clause 5 — review

**Run 2026-09-20 (`test-engineer`). Clause 5 is discharged.**

It re-derived clauses 1–3 independently and they hold: the 13 suites create only `EARLY` plans
(`schema.prisma:803` default, `create-plan.dto.ts:45` optional, and the plan-creation dialog has no
mode field at all), the pin count and its mechanics match the committed baseline, no pin survives
anywhere in all 49 Playwright configs, and no covert off-pin exists through `.env` — an empty
`VITE_SCHEDULING_MODES=` reaches `flagDefaultOn('')`, which returns `true`.

**One blocking finding**, folded above: the "exactly one suite" claim. Two non-blocking notes are
taken as read — M-B-T1 shipped as one combined commit where the plan said one per suite, and the
reviewer did not execute the 13 suites, which is a stated scope limit rather than a gap.
