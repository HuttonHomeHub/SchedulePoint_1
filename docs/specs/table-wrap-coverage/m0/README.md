# M0 — the before-state, and two readings nobody had taken

**Taken:** 2026-09-19, **one sitting**, tenant `shoot-co-1789834496636`, one pair of dev servers.
**Tree:** the working tree at `2f256848` (the conditions commit) plus `measure-grid-tracks.mjs`,
which this milestone adds. Stated explicitly because `run.sha` records `HEAD`, which is not
necessarily the tree that was served.
**No run used `EXPECT_KNOWN_WRAPS=0`.** Each probe's pinned-case line is in §1.

---

## 1. The baseline reproduces on a fresh tenant

| Width  | Pinned case                                                | Findings |
| ------ | ---------------------------------------------------------- | -------- |
| 1280px | `every screen measured; audit-log wraps`                   | 5        |
| 1646px | `every screen measured; no width-keyed wrap at this width` | 2        |
| 1920px | `every screen measured; no width-keyed wrap at this width` | 2        |

Members `Sent` and `Status` at all three widths; audit-log `Event`/`By`/`Subject` at 1280 only.
Identical to `unrendered-row-facts/m3/cf-*.json` on a **different** tenant, which is the small piece
of evidence that says these are not fixture artefacts.

## 2. The finding that decides the gate's rule: **a slack test would fire on nothing**

`falsification.md` FC-2 turns on the audit log's wraps being **legitimate** (declared `auto`) while
Members' are not (`auto` by omission). The tempting alternative — gate on whether the table has
spare width, which is what the existing assertion's **title** and **failure message** both claim —
was checked against the data rather than reasoned about:

| Width  | Screen    | Column(s)                | Table slack |
| ------ | --------- | ------------------------ | ----------- |
| 1280px | members   | `Sent`, `Status`         | **−229**    |
| 1280px | audit-log | `Event`, `By`, `Subject` | **−156**    |
| 1646px | members   | `Sent`, `Status`         | **−149**    |
| 1920px | members   | `Sent`, `Status`         | **−66**     |

**Zero of the nine wraps in the measured estate sit in a table with positive slack.** A slack-gated
rule therefore fires on **nothing at all** — it would excuse the defect this epic exists to catch
and the legitimate case alike, and would be a gate incapable of failing. The `auto` declaration is
the only discriminator that separates them, which is what ADR-0146's column model already says and
what the assertion never implemented.

**The misleading framing is in two places, not one.** Beyond the test title at
`composition.spec.ts:232`, the assertion's own failure message reads
`${path} has a cell wrapping inside a table with room` — so a red run **prints** a slack claim the
body never tested. Both are corrected at M1.

## 3. Reading A — the grid's tracks, measured for the first time

`falsification.md` deliberately quotes no box-model figure because 905 and 519 at 1280 "are not in
the ratio `grid-cols-2` implies". Measured, they are not meant to be: **905 is the Roster table**,
which spans both tracks, and 519 is the invitations table. The tracks themselves are exactly equal.

| Width  | Grid width | Tracks    | Gap | Card inset | Available to the table |
| ------ | ---------- | --------- | --- | ---------- | ---------------------- |
| 1280px | 955        | 466 + 466 | 24  | 25 a side  | **416**                |
| 1646px | 1321       | 649 + 649 | 24  | 25 a side  | **599**                |
| 1920px | 1488       | 732 + 732 | 24  | 25 a side  | **682**                |

So the prediction that was withheld is now available and the epic no longer has to avoid depending
on it. `PageGrid`'s narrow track is **half the content column minus the gap**, on all three of its
consumers — the landing and `/staff` report the same tracks at the same widths.

## 4. Reading A's unplanned finding: **at 1280 the table overflows its own card**

| Width  | Available | Table renders | Result                        |
| ------ | --------- | ------------- | ----------------------------- |
| 1280px | 416       | **519**       | **overflows the card by 103** |
| 1646px | 599       | 599           | fits exactly                  |
| 1920px | 682       | 682           | fits exactly                  |

At 1646 and 1920 the table fills its card and wraps its cells. **At 1280 it cannot even reach
min-content inside the card**: squeezed to 519 (its wrapped minimum) against 416 available, it
overflows by 103px into `DataTable`'s own horizontal scroll region. The page does not overflow
(`docScrolls: false`, `overflowsBy: 0` at all three widths), so this is contained rather than a
WCAG 1.4.10 failure — but it is a second, distinct failure mode on one table that the register row
does not mention and the spec's arithmetic did not predict.

**It changes a candidate's cost.** C0 (`width: 'fit'`) is carried as a control expected to fail
because it converts a wrap into a horizontal scrollbar — and at 1280 **that is already the state**,
independently of any candidate. Only a candidate that reduces the table's **min-content** removes
it, which is the fold family (C2) and not the grid change (C1).

_(It also explains an ambiguity hit earlier today: a unit test asking for
`getByRole('region', { name: 'Pending invitations' })` matched two elements — the `SectionCard` and
this scroll region. That was worked around by naming the card's element; the scroll region is why
it exists.)_

## 5. Reading B — Members at 320px

`drift-*.json` records `docScrolls: false` and `overflowsBy: 0` at 1280/1646/1920. Members is
**absent** from the journey's 320px reflow sweep (`composition.spec.ts:504`), so FC-6's baseline is
taken at M1 with the widened roster rather than guessed at here; it is recorded as **owed, not
taken**, rather than quietly dropped.

## 6. An observation, filed as neither a finding nor work

`pnpm shoot` reports `3 shot(s) FAILED … 1646/org-home, 1920/org-home, 1280/org-home` on **every**
run today, across four separate sittings. It does not affect any probe here — they navigate
themselves and org-home is a declared table-free screen — so it is recorded rather than chased.
Worth a row if it is still failing next time somebody needs a landing screenshot.
