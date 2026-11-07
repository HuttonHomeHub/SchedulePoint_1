# M0-T2: the prediction, committed before any M1 code

- **Written:** 2026-11-07, after `m0/red-run.md` and before a line of `apps/api/src` changes. This
  commit contains this file alone. M1 runs every line below and records agreement and disagreement in
  `m1/red-run.md`; a line that turns out wrong is reported as wrong, not edited here.
- **The change being predicted:** the engine reports the placed and late instants it dates its
  dates from, and the cross-plan derivation reads a supplied instant for the anchor its edge type
  needs, instead of reading the stored date (spec D-1, D-3; CQ-1 = B, so every remote type, not only
  zero-span). Production passes null in M1; the harnesses pass the instants.

## 1. The 24 fixture cases

Key: `middle | cut | longer`, as `DIVERGES` names them.

**Flip from different to equal (five):**

1. `a start milestone on the weekend calendar|M->K|false`
2. `a start milestone on the weekend calendar|M->K|true`
3. `a zero-duration task on the weekend calendar|M->K|false`
4. `a zero-duration task on the weekend calendar|M->K|true`
5. `a finish milestone on the plan calendar|W->M|true`

Why they flip: `K` reads `M`'s placed start instant (Monday 06-28 00:00), not the stored Saturday date,
so it starts Monday 06-28 as in one plan; and `W` reads `M`'s late finish instant (Monday 07-05 08:00),
not the Friday date, so its float is `1440` as in one plan.

**Stay different (one):** `a finish milestone on the weekend calendar|M->K|false`. Nothing about a
stored value changes what the upstream plan computes about itself (spec §1, "The third shape").
Predicted to stay an expected failure with the same `M` late-date difference (Sunday 06-27 across
plans, Monday 06-28 in one plan).

**Stay equal (eighteen):** every other case. The instant the engine reports for a task finishing on a
day boundary, or for a milestone the date readers already read correctly, is the instant the date
reader reconstructs, so reading the instant instead changes no bound. Specifically predicted unchanged:
every `W->M` case except item 5, every plan-calendar start milestone and zero-duration task, and the
`longer` weekend finish milestone.

**The numbers case and the non-vacuity case** (`the row's numbers hold`, `non-vacuity`): unchanged.
**The three "what a stored date cannot say" witnesses**: unchanged. They assert about one plan or
about the stored date, neither of which moves.

## 2. The twin matrix (1,728 cells plus the mixed-calendar axis)

**Stays all-equal.** The matrix's remote activities are whole-day tasks and finish milestones with
nothing placed and nothing progressed. For those, the instant the engine reports equals the instant
`finishDateInstant` / `startDateInstant` / `finishMilestoneRemoteInstant` reconstruct from the stored
date (that is exactly what ADR-0161 proved). So supplying instants from the real engine result changes
no derived bound in any cell, and the characterisation spec's mismatch tally stays at zero.

One thing this prediction does not rely on and M1 must check: the weekend-pair finish milestone cells
in the mixed axis. They are the cells most likely to hold a disagreement (a milestone dated Sunday read
on a weekday calendar), so if any cell moves it is predicted to be one of those, and it would move
toward the one-plan answer, not away.

## 3. A progressed upstream pair (not in any fixture today)

Case P1, **a complete upstream task** (`actualFinish` typed, a date): its `visualEffectiveFinish` is the
actual finish date and the engine's placed finish instant is the instant it used for its successors.
Predicted **equal** to today: the date reader reads the end of the actual finish day on the task's
calendar, which is the instant the engine uses.

Case P2, **an in-progress upstream task** (started, remaining duration set so it ends mid-day):
today the derivation reads the end of that day's working time. Predicted: the downstream bound moves
**earlier or stays**, never later (the instant is the exact remaining-duration end, which is at or
before the end of its day). The downstream dates differ only where the downstream calendar works
between the exact end and the end of the day.

## 4. A placed finish milestone upstream

Hand-placed (ADR-0148 M-H) with a typed day. The engine's placed finish instant is the end of the typed
day (ADR-0207 D2); the date reader today returns the last working minute of that day when it falls
after the day's start, else midnight. Predicted:

- On a day with no working time on the milestone's calendar (a Sunday on a weekday calendar): **equal**,
  both are the end of the day.
- On a working day: the instant is the end of the day and the date reader gives the last working
  minute of it, so the downstream start differs **only** if the downstream calendar works in the gap
  between them, and then the instant-read is **later**, not earlier. This is the one place the change
  is predicted to move a date later. It matches one plan's Pass 2 (which also reads the end of the
  typed day) and is outside the stated parity domain (a placed upstream), so it is expected and is
  reported as such, not treated as a regression. If no cell of the sub-day axis exercises a placed
  finish milestone, this case is covered by a unit test of the derivation only.

## 5. The sub-day axis (CQ-1 = B)

Fixture: the upstream remote task takes **four working hours** (240 minutes) on the eight-hour calendar
(08:00 to 16:00), so it finishes at 12:00; every other axis as in the matrix.

- **Forward, FS lag 0 into a task on a calendar working that afternoon** (`eightHour`, `standard`,
  `twentyFourHour` as downstream): today the successor starts when the day ends (16:00 or the next
  morning). Predicted: with the instant it starts at **12:00**, equal to the one-plan twin. Cells
  that turn equal: all forward FS and FF cells whose downstream calendar works between 12:00 and
  the end of the day; the SS and SF forward cells read the start instant, which was already exact
  for a task (today's `startDateInstant` rolls to the day's first working minute, which is the true
  start), so they are predicted **unchanged and equal**.
- **Backward** (the remote successor's late start mid-day): today reads the first working minute of
  its late-start day; the instant gives the exact late start. Predicted: the predecessor's late finish
  bound moves **later** (looser), i.e. float returns to the upstream work, for FS and SS cells whose
  late-start instant is not the day's first working minute. FF and SF read the late finish, a day
  boundary in this fixture, so predicted unchanged.
- **Direction.** Every forward successor start moves earlier or stays, and every backward bound moves
  later or stays. Nothing moves the opposite way except the placed-finish case in section 4.
- **Before the instants are read** (M1-T2, supplied null): the sub-day axis is predicted **different**
  in the cells above, which is the ADR-0161 sub-day edge, so the axis has its own red evidence.

## 6. What is predicted not to change at all

- Every existing field of every `EngineResult` for every engine spec input (FC-4): the four new
  fields are appended and nothing existing is recomputed.
- The derivation output for any edge whose four instants are null (FC-5): byte-identical to today.
- Production: the service passes null in M1, so no stored date, float or flag anywhere changes.
