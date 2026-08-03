# @repo/api

## 0.40.0

### Minor Changes

- [#223](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/223) [`8781957`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8781957f4d2399215ac00915599354c3ab5621c3) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Import: repair duplicate activity **names**, not just codes.

  An activity's name is unique per plan, but the interchange validate/repair step only
  de-duplicated codes — so a file with repeated names passed the whole pipeline reporting zero
  repairs and then failed on the unique index inside the commit, rolling the entire import back.
  That is the normal shape of a real P6 export, which makes the code unique and repeats names per
  zone and per level. Later duplicates are now suffixed and reported like every other repair, and
  both the code and name repairs honour their field's length ceiling.

  The generic conflict message no longer says "A resource with these details already exists" — it
  meant a REST resource, but this product has a resource library, so the message sent readers to a
  panel with nothing in it.

### Patch Changes

- Updated dependencies [[`8781957`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8781957f4d2399215ac00915599354c3ab5621c3)]:
  - @repo/interchange@0.9.0

## 0.39.0

### Minor Changes

- [#221](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/221) [`2788c77`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/2788c77e7866b9d722ca00635f7afafa08a5b86c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - **Breaking:** remove the day-denominated `relativeFloat` from the float-paths response.

  `GET …/schedule/float-paths` shipped in `api-v0.38.0` carrying two float figures: `relativeFloatMinutes`
  (the engine's, correct) and `relativeFloat` (days, computed as a flat `minutes / 1440` and marked
  deprecated). The day field is now gone. Read `relativeFloatMinutes` and convert against the calendar
  you are presenting on.

  It was retained one release on the argument that "deleting it breaks an existing reader for no gain".
  There are no readers — the web client has only ever read the minutes field — so that argument had
  nothing behind it, and what remained was a field returning a **plausible wrong number**: on an
  eight-hour calendar one working day of relative float (480 minutes) came back as `0`, which does not
  read as an error, it reads as "on the driving path". A wrong value that looks right is worse than an
  absent one, because the only thing between it and the next consumer is a description nobody has to
  read. Deprecation warns whoever looks; removal is checked by the compiler.

  There is deliberately no replacement day field. A float path can span activities on different
  calendars, and after ADR-0068 a day is a per-calendar quantity — so the envelope has no single factor
  to divide by. Picking one and being wrong for the rest is exactly what the removed field did.

  Also in this change, on the web side:

  - **The derived-duration preview in the resource assignment row was measuring days at a flat 1440**
    — the same defect one surface along, still live. "Duration becomes …" told a planner on an
    eight-hour calendar that a one-working-day derivation was **"0.3 days"**. It now takes the
    activity's `hoursPerDay` as a required, never-defaulted parameter (ADR-0070's rule) and renders in
    the same `d`/`h`/`m` grammar the duration field itself uses, degrading to hours and minutes when
    the calendar has not resolved rather than guessing a factor.
  - The "spell minutes without a day factor" arithmetic had been written out in **three** places. It is
    now one shared `formatWorkingMinutesNoDays`; the assignment-lag field and the float-paths panel
    both delegate to it.
  - A stale docblock on `ScheduleService.floatPaths` still described the return as "working days
    (÷1440)" — it had gone on saying so after the behaviour changed underneath it, which is the
    ADR-0058 failure one method along from the fix.

### Patch Changes

- Updated dependencies [[`2788c77`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/2788c77e7866b9d722ca00635f7afafa08a5b86c)]:
  - @repo/types@0.23.0

## 0.38.0

### Minor Changes

- [#219](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/219) [`874037f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/874037facb4de56143f98e120df8dd655fbdad31) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Report float-path relative float in working **minutes**, and say when the list was truncated.

  `GET …/schedule/float-paths` divided the engine's working minutes by a flat 1440. Total float is
  measured on the **activity's own** calendar (ADR-0037 §4, ADR-0068), so on an eight-hour calendar one
  working day of relative float — 480 minutes — rounded to **0**, indistinguishable from the driving
  path, and larger figures were understated threefold. Six working days read as "2 days".

  Nothing consumed the field, which is the only reason it never bit; the audit's F8 had named this
  exact conversion as unchecked. Building a surface for it is what would have made it bite, so the fix
  lands first and on its own.

  - **`relativeFloatMinutes`** carries the engine's figure with no conversion. Convert for display
    against the calendar you are presenting on — never against a flat 1440.
  - **`relativeFloat`** (days) is retained and deprecated rather than removed: deleting it breaks any
    existing reader for no gain. Its description now states the arithmetic that makes it wrong.
  - **`hasMorePaths`** on the envelope, so a reader can honestly say "the first N" instead of implying
    the list is every path into the target. Derived by asking the analysis for `maxPaths + 1` and
    slicing.

  **The CPM engine is not modified** — `hasMorePaths` is a service-level probe rather than a new engine
  field, and a structural test now fails CI if `computeSchedule`'s or `computeFloatPaths`'s signature
  moves. The ADR-0034 recalc parity gate is untouched, and the existing engine goldens pass unedited.

  The unit is pinned by an API e2e on a real eight-hour calendar, built as a twin of the existing
  24-hour case so the two differ in exactly one thing.

### Patch Changes

- [#219](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/219) [`874037f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/874037facb4de56143f98e120df8dd655fbdad31) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Turn the **Float paths** panel on by default (`VITE_FLOAT_PATHS`) — audit F4, M4.

  The engine has computed multiple float paths since ADR-0035 §19 and the endpoint has exposed them
  since the reconciliation pass; nothing in the web client referenced either. A planner asking the
  compression-planning question — "if I shorten the critical path, what binds next, and by how much?" —
  can now ask it in the product: pick a target, read the ranked chains with the relative float on each,
  and expand one to recede everything off it in whichever view is showing.

  Enabling it ran the five specialist gates over the combined M0–M3 diff, which found **twelve**
  blocking defects in code that had already passed a human read — the recurring shape (ADR-0064 §7) of
  a correct pattern applied to one control and not its neighbour. The ones worth naming:

  - A chain member the client does not hold was styled unactivatable with `pointer-events-none`, which
    styles a refusal without enforcing it — a keyboard `Enter` walked straight past it into a selection
    of an activity that is not there. Now a real click guard.
  - The Gantt's de-emphasis was carried by **opacity alone** (WCAG 1.4.1) and announced on the activity
    rows but not on the WBS bucket rows. Both fixed; the marker's wording is single-sourced, because
    the canvas listbox renders it too.
  - The Gantt never fed the workspace selection at all — a **pre-existing** defect this epic did not
    introduce. Clicking a bar in the chart set the logic activity but not the workspace's selected
    activity, so every surface derived from it (this panel's target suggestion among them) was blind to
    a click in one of the app's two views.

  The API change is the security gate's one hardening suggestion, taken: a per-IP throttle (20 requests
  / 60 s) on `GET …/schedule/float-paths`, declared in OpenAPI. Unlike the earned-value and histogram
  reads beside it, this endpoint is **not** a persisted read-model — it runs a full `computeSchedule`
  per request.

  A flag-on Playwright journey (`apps/web/e2e-float-paths/`, its own CI step) drives the panel against
  a real API with the pen enforced on an eight-hour calendar, asserting the stored
  `relativeFloatMinutes` from the API alongside the `+1d` the planner reads — the only place the
  per-calendar conversion this epic exists to have fixed can be checked end to end. The flag-off parity
  suite is kept unchanged: it is the rollback contract.

- Updated dependencies [[`874037f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/874037facb4de56143f98e120df8dd655fbdad31)]:
  - @repo/types@0.22.0

## 0.37.0

### Minor Changes

- [#211](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/211) [`5acf551`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5acf551ee0891948440798a74662e40d9917b985) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Freeze per-assignment cost in a baseline, so a lagged planned value is exact

  A cost baseline froze **one number per activity**. That is enough to time-phase a whole activity's
  cost and not enough to time-phase it **per resource** — which is what a per-assignment join lag asks
  for, because a crane arriving on day four spends its share of the money over a different window from
  the crew that started on day one. Splitting a frozen total by **live** budget shares reallocates
  committed money using a mix that has changed since the commitment.

  Capturing a baseline now also records, per active assignment, its resolved budgeted cost **and its
  join lag at capture**. The lag is frozen for the same reason the cost is: a snapshot holding frozen
  money while reading the live lag would phase committed cost through a window somebody edited
  afterwards. The components come from the same expression that sums the activity total, so the
  decomposition adds up to its own total by construction rather than by two spellings agreeing.

  **Baselines captured before this cannot be back-filled** — a breakdown that was never recorded is not
  recoverable from a frozen total. Those keep the approximate split for the life of the baseline, and
  the Earned-Value response now says so: the new `costPhasingApproximatedCount` counts the activities
  whose lagged split was approximated rather than read from the baseline's own breakdown, and
  re-capturing the baseline is what clears it. It is `0` when there is no cost baseline at all, because
  a live-budget planned value has nothing to approximate.

  Which path a baseline is on is read from a stored discriminator and never inferred from whether
  component rows exist: an assignment-free plan's baseline has zero component rows and is nonetheless
  exact, while a pre-feature baseline has zero rows and can only be approximated — the same observation
  with opposite answers. Capturing components does not by itself move any planned value; a baseline
  whose components all joined with their activity is byte-identical to before.

- [#211](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/211) [`5acf551`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5acf551ee0891948440798a74662e40d9917b985) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Phase a late-joining resource's cost from the day it arrives

  Earned Value time-phased a leaf activity's planned value with **one** percentage over **one** window,
  so a crew joining three days into a fortnight had its cost recognised as if it had been there from the
  first day. PV now splits into cost components: the activity's own expense keeps the activity's window
  (it belongs to no resource), and each assignment phases over `[start + lag, finish)` on the activity's
  calendar.

  **The zero-lag path takes the previous expression verbatim, and that is a hard requirement rather than
  an optimisation.** Summing rounded per-component values can differ from rounding one total by a minor
  unit, and a silent ±1 on the planned value of every plan already in the system is exactly the class of
  defect that survives review. An activity reaches the component sum only when a lag asks it to, and the
  new `costPhasingLaggedCount` on the Earned-Value response is the observable proof of which path ran —
  `0` on every plan with no lag.

  Accrual stays a property of the **activity** (ADR-0044 §32), which produces one asymmetry worth
  knowing before writing a test against it: under `END` a lag is a **no-op**, because everything is
  recognised at the finish whatever time the resource arrived; under `START` a lagged assignment
  recognises when its resource joins, not when the activity starts. Same enum, opposite sensitivity. A
  lag at or past the span collapses the component to a point and then behaves exactly like an existing
  zero-duration activity — reusing that convention rather than inventing a rule for the degenerate case.

  A lag phases PV and nothing else: earned value, actual cost and budget at completion are unchanged for
  a lagged plan, and there is a test that says so. Wiring a lag into the performance percent would make
  a late crew look like less work done, which is a different and wrong claim.

- [#211](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/211) [`5acf551`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5acf551ee0891948440798a74662e40d9917b985) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Show a resource's join lag in the loading histogram

  The histogram read-model built its input with a hard-coded `lagMinutes: 0` under a comment stating
  that SchedulePoint does not model a per-assignment lag column. That column landed in the previous
  change, so the comment was already false — it would have outlived the column by a milestone had the
  findings register not named it. The repository now selects the stored lag and the caller passes it
  through, measured on the same activity calendar the span is.

  The seed catalogue closes the matching gap. `res_assignment_lag` was one of the two capabilities
  `seed --coverage` reported as **excepted** with the reason "an assignment has no lag field: work
  starts with its activity" — true of the data model at the time and badly underselling the position,
  since the engine half was already built and tested. That exception is deleted and the key is now
  **reached** by `A_LAG` in `plan:capability-resources`: a twin of `A_BELL` differing in exactly one
  thing, so the two histograms are a controlled contrast rather than two unrelated pictures.
  `docs/TEST_PLAYBOOK.md` says what right and wrong look like for the pair, and the fixture's
  `assignment_lag_h` now maps into the seeded plan instead of being dropped.

  Two tasks the plan asked for were **not** built, because measuring their premises showed both to be
  false, and both are recorded in the plan rather than quietly skipped. A typed "lag unreachable" error
  mapped to a 422 was written and reverted: the working-time port does not throw for any legal lag — a
  calendar working one minute per week walks the full ten-year ceiling and returns a date in the year
  102,759 — so the `catch` would have been permanently dead code carrying a docblock asserting a defect
  that does not exist. And the N34 hostile cases do not belong in the seed negative tier, which is
  pinned to the conformance fixture's own case list; they live at the DTO boundary and in the API e2e,
  where they run.

  **The CPM engine is not modified and the ADR-0034 recalculation parity gate is untouched** — the
  histogram is a read-model and `computeSchedule` has never seen an assignment.

- [#211](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/211) [`5acf551`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5acf551ee0891948440798a74662e40d9917b985) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Report the per-assignment join lag as an interchange gap instead of losing it silently.

  A join delay authored in SchedulePoint (ADR-0071) has no counterpart in any interchange format this
  repository has verified, so an export cannot carry it and an import cannot recover one. That was
  already true before this change — what was missing is that nobody was told.

  The canonical model now carries `lagMinutes` on an assignment, and both halves of the asymmetry are
  stated in the `InterchangeReport`:

  - **Export** knows exactly what is lost, so it reports a `drop` finding **only when** assignments
    actually carry a delay, counting them.
  - **Import** cannot know whether the source file held one, so it reports the gap **unconditionally**
    whenever a file brings assignments at all — for XER, that P6's own export was checked and carries
    no such field; for MSPDI, that no equivalent has been verified.

  The ADR-0050 mapping-contract table moves in lock-step. No schedule dates change: `lagMinutes` is
  read by no parser and written by no emitter, deliberately, and the CPM engine is not involved.

- [#211](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/211) [`5acf551`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5acf551ee0891948440798a74662e40d9917b985) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Stop levelling from reserving a resource for days it never takes

  The levelling pass held a resource for the **whole** of an activity, so a crew that only joins on day
  three was nevertheless reserved from day one. Anything else needing that resource was pushed out for
  capacity nobody was using — safe, but pessimistic, and it produced a levelled programme longer than
  the resources actually require.

  With a stored join lag (ADR-0071 §1) the pass now demands each resource only over
  `[start + lag, finish)` on the activity's own calendar. A lag at or past the span reserves nothing at
  all, which is the honest reading of a window with no working time in it.

  The placement search had to change with it. One merged feasible/blackout timeline could answer for
  every resource on an activity while they all shared the activity's span; once two resources on one
  activity ask about **different** windows, it cannot. The search now works on per-resource candidate
  starts — the earliest start, plus each blackout end translated back by that resource's own lag — and
  takes the first that clears every resource's own window. Termination is still inherent (the largest
  candidate lies past every blackout) and the `O(k log k)` bound is preserved.

  **ADR-0041's parity argument is restated rather than repeated, and that is the substantive part.** It
  was one sentence; it is now two claims of different strength. Gate A — with `levelResources` off the
  pass never runs and the lag is never loaded — is unchanged and still structural. Gate B — with
  levelling on and every lag zero, output is byte-identical to before — is **no longer structurally
  impossible to break**, because both the occupancy model and the search were rewritten. It is held
  instead by a corpus of snapshots captured **before** `level.ts` was touched, across the eight shapes
  the pass branches on. A snapshot taken afterwards would have asserted the refactor against itself.

  The `O(k log k)` boundedness now has a calendar-port **call-count** gate beside the wall-clock assert:
  a candidate list that grew with the span rather than with the placed intervals would still be correct,
  still pass every behavioural test, and quietly reintroduce the per-minute scan ADR-0041 §F forbids.
  Measured 477 calls unlagged and 634 lagged over 40 contending activities, against ~1,600 for quadratic
  and ~57,600 for a per-minute scan.

  **`computeSchedule` is not modified and the ADR-0034 recalculation parity gate is untouched** — the
  CPM network pass has never seen an assignment.

- [#211](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/211) [`5acf551`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5acf551ee0891948440798a74662e40d9917b985) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Store a resource's join lag — the delay before a crew arrives on an activity

  The CPM engine's resource-histogram read-model has taken a per-assignment `lagMinutes` since the
  ADR-0044 rung-5 slice, shifts the effective span by it, and is scored against the fixture's own
  24-hour lag case — and **nothing in the product could store one**. This is the surface audit's
  inverted finding (F6): normally storage supports what no write path can produce; here the engine
  supported what no storage could hold, with the coverage report recording the omission as if it were a
  design decision ("an assignment has no lag field: work starts with its activity").

  `resource_assignments.lag_minutes` now exists — working minutes, measured on the **activity's own**
  calendar (ADR-0037), on both write DTOs, on the assignment response and on
  `ResourceAssignmentSummary`. Constant `DEFAULT 0`, so every existing assignment keeps today's
  behaviour exactly: the resource joins with the activity.

  The column is **unsigned**, deliberately unlike a dependency's signed lag. A negative dependency lag
  is a lead and means something; a resource joining before the work starts does not. More to the point,
  a signed column would be a trap rather than harmless symmetry — the read-model applies the lag only
  when `> 0` (a parity fast path for the common zero case), so a stored negative would be silently
  discarded and the assignment would behave as unlagged with the API having said yes. The DTO's
  `@Min(0)` is the primary reject (N34); the database CHECK is defence in depth.

  `lagMinutes` is **never cost-gated**. A lag is a scheduling fact, not money, so a Viewer reads a real
  value while `budgetedCost`/`actualCost` are withheld — pinned by an e2e case rather than asserted,
  because gating it would make a Viewer's picture of when the resource arrives disagree with a
  Planner's.

  This is ADR-0071 M0: storage and the API. The histogram, levelling and earned-value passes read the
  stored lag in M1–M3; the planner-facing control lands in M4. **The CPM engine is not modified and the
  ADR-0034 recalculation parity gate is untouched.**

### Patch Changes

- Updated dependencies [[`5acf551`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5acf551ee0891948440798a74662e40d9917b985), [`5acf551`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5acf551ee0891948440798a74662e40d9917b985), [`5acf551`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5acf551ee0891948440798a74662e40d9917b985), [`5acf551`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5acf551ee0891948440798a74662e40d9917b985)]:
  - @repo/types@0.21.0
  - @repo/interchange@0.8.0

## 0.36.0

### Minor Changes

- [#209](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/209) [`be6d973`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/be6d9734df22b68d863bbb746250a5942983f39a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The critical float threshold is stored in working minutes, not days

  `criticalFloatThreshold` was documented and validated as whole working **days**, and the service
  converted it for the engine at a flat `× 1440`. The engine then compared that against a total float
  measured in working minutes on the **activity's own** calendar. On a 24-hour calendar those agree;
  on an eight-hour one a planner asking for a 1-day threshold got three working days of float treated
  as critical. ADR-0068's defect one field along (surface audit F8).

  The field becomes `criticalFloatThresholdMinutes` — working minutes, stored as compared, no lossy
  conversion in between. A plan-level _day_ threshold is unfixable by choosing a better factor: a
  mixed-calendar plan compares one threshold against floats measured on several different day lengths,
  so there is no correct scalar. Minutes is the only representation that is unambiguous for every
  activity.

  **Breaking:** the field is renamed on the update DTO, the plan response and `PlanSummary`. Pre-1.0,
  so a minor bump. `forbidNonWhitelisted` is on, so a client still sending `criticalFloatThreshold`
  gets a 422 naming the property rather than a quietly wrong schedule — which is the point of renaming
  rather than redefining in place.

  Existing data is backfilled at `× 1440`, the same factor the service applied on every recalculation
  since the column shipped, so the engine receives an identical number and no plan's persisted
  criticality changes. The backfill multiplies in `bigint` and clamps at the ten-year ceiling, because
  the DTO carried no upper bound and an overflow would abort the migration — which on a self-migrating
  image means the API does not boot.

  It also fixes a latent disagreement in the ADR-0066 pairwise harness, which fed the seed spec's day
  number straight into the engine's minutes option with no conversion while the service multiplied.
  The differential has been comparing two different thresholds, and stayed green only because the
  default is 0.

- [#209](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/209) [`be6d973`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/be6d9734df22b68d863bbb746250a5942983f39a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - One calendar exception can cover a shutdown, instead of fourteen separate days

  `calendar_exceptions` has stored a **range** since the table was created — `start_date`, `end_date`,
  and a Postgres exclusion constraint over `daterange(start_date, end_date, '[]')` to stop two
  exceptions overlapping — the read DTO has always returned `endDate`, and the CPM engine has always
  scheduled across the whole span. Only the write paths collapsed it, so a Christmas fortnight, a
  two-week turnaround or a plant shutdown had to be entered as ten to fourteen separate one-day
  exceptions, one at a time, on a schema and a read model that both described the range the planner
  actually meant (surface audit F2).

  The exception editor now takes **From** and **To (optional)** — empty still means a single day,
  which is what a date on its own has always meant, so nothing a planner already knows how to enter
  changes. Existing exceptions read back exactly as before.

  An exception's **last** day is also editable. Its **first** day still is not: moving an exception is
  indistinguishable from deleting one and adding another, which the neighbouring actions already do
  visibly — but extending a shutdown by two days is not moving anything, it is the edit a planner most
  often needs, and the alternative is the delete-then-recreate the edit endpoint exists to remove
  (there is a window in between during which a holiday is an ordinary working day, and a
  recalculation landing in it schedules work).

  A range that ends before it starts is a 422 naming both dates — an empty range is the one shape the
  overlap constraint cannot express, because it overlaps nothing. A span that would collide with the
  next exception along is the same 409 as adding a duplicate day, from the same translation of the
  same constraint. A span longer than 10,000 days is refused: a year typed as 2226 rather than 2026 is
  a typo, and it is also the bound the engine's calendar build now relies on, since it expands each
  exception once per recalculation and the "single day, so O(E)" premise no longer holds.

- [#209](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/209) [`be6d973`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/be6d9734df22b68d863bbb746250a5942983f39a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Report a four-hour remainder, instead of rounding it to "no work left"

  ADR-0070 made an activity's **duration** sub-day authorable and left its **remaining work** a
  whole-number days box. So a planner could type `4h` for the duration, report progress, and then
  state the remainder only as `0` or `1` day — and on an incomplete activity `0` is not a rounding
  artefact, it is also the value that means _no work left_. The asymmetry sharpened it: the derived
  remaining (percent × duration) is minute-exact, so stating the remainder explicitly was **less**
  precise than saying nothing (surface audit F3).

  `remainingDurationMinutes` joins the progress DTO as the mutually-exclusive sibling of
  `remainingDurationDays` — the same pair `api-v0.34.0` gave duration and lag — and the activity
  response and `ActivitySummary` now carry it, so a sub-day remainder can be read back exactly rather
  than as the `0` its day field rounds to.

  The progress editor's field takes the same `d`/`h`/`m` grammar as a duration, reusing that field's
  predicate, degrade rule and flag rather than a second reading of `2d 4h`. Blank still means "derive
  it from percent complete" — which is the one thing this field has that a duration does not, and the
  only part the shared module does not own. Where the calendar's working hours cannot be resolved it
  degrades to whole days, which is the same code path as flag-off, so the rollback contract and the
  not-yet-loaded state cannot rot apart.

  The seeder now sends the minutes its spec already held, instead of rounding them and recording the
  loss as an approximation — a sub-day remainder in a seeded plan was never what the spec asked for.

  With this, `pnpm check:surface-contract` reports **zero gaps**: every writable field on a scheduling
  DTO and every CPM engine input has a surface a planner can reach, or a written reason why not.

### Patch Changes

- Updated dependencies [[`be6d973`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/be6d9734df22b68d863bbb746250a5942983f39a), [`be6d973`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/be6d9734df22b68d863bbb746250a5942983f39a), [`be6d973`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/be6d9734df22b68d863bbb746250a5942983f39a)]:
  - @repo/types@0.20.0

## 0.35.0

### Minor Changes

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - A baseline freezes the calendar's hours-per-day, so a snapshot stays a snapshot

  ADR-0025's central call is that a baseline is a frozen **copy**, not a reference. With the day↔minute
  factor living only on `calendars`, editing a calendar's hours-per-day would have retroactively
  changed what a two-year-old baseline reported as its captured durations and its variance — a
  snapshot that moves is not a snapshot.

  `baselines.hours_per_day_minutes` is captured at freeze alongside the data date and the project
  finish, and both the snapshot DTO and the variance calculation read **it**, never the live
  calendar's. So a baseline taken on a 24-hour calendar keeps reporting 24-hour days even after the
  calendar moves to an 8-hour week, which is the only reading under which "we planned 10 days and took
  12" means anything a year later.

  Every existing baseline carries the 24-hour default, so nothing any of them reports changes.

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - A calendar carries an hours-per-day (ADR-0068, schema + write seam)

  `durationDays` has always been converted to stored minutes by multiplying by 1440. That was correct
  for every calendar in the system, because until `api-v0.34.0` nothing could author a weekly pattern
  that was not full days. Now that an 08:00–17:00 week is authorable, an activity entered as "1 day"
  on one is 1440 working minutes — **2.67 working days**, because the calendar only supplies 540 a day.

  `calendars.hours_per_day_minutes` is Primavera P6's `day_hr_cnt`, and it becomes the day↔minute
  factor for every day-denominated field measured on that calendar. `POST`/`PATCH` accept an explicit
  `hoursPerDay` in hours (fractional allowed — 7.5 is 450 minutes exactly); the read exposes
  `hoursPerDay` beside `hoursPerDayMinutes`, the pair an activity already exposes for its duration.

  Omit it and the service derives a default **from the pattern being written, once, and stores it** —
  the modal working day among the days that work. It is deliberately not derived on read: that would
  make the factor a function of the shift rows, so shortening one Friday would silently reinterpret
  the stored duration of every activity on the calendar, with no pen held and no recalculation asked
  for. It also has no answer for a window-only calendar, where every candidate rule derives zero and
  `durationDays × 0` zeroes the activity.

  `baselines.hours_per_day_minutes` captures the factor at freeze, applying ADR-0025's snapshot-copy
  rule — otherwise a later calendar edit would rewrite what a two-year-old baseline reports.

  **Nothing changes yet.** The default is 1440, the constant the services already multiply by, so every
  existing calendar, plan, activity and baseline reads exactly as before; and the CPM engine cannot see
  the column at all — its calendar port is built from shift and exception rows — so the recalculation
  parity gate is structurally untouched. Wiring the factor through the duration, lag, float and
  interchange seams is the next slice.

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Durations are measured on the calendar's working day, not on a 24-hour one

  An activity entered as "1 day" was stored as 1440 working minutes on every calendar. On an
  08:00–17:00 week — 540 working minutes a day — the engine correctly scheduled that across **2.67
  working days**, so a five-day activity drawn as five columns on the canvas snapped to thirteen after
  the next recalculation.

  `durationDays` and `remainingDurationDays` now convert on the activity's **effective calendar**
  (its own if it names one, otherwise the plan's) using that calendar's `hoursPerDay` — ADR-0068,
  Primavera P6's `day_hr_cnt`. The write resolves the factor **inside the transaction**, after the
  calendar guard, so a PATCH that changes the calendar and the duration together cannot convert
  against the old week.

  Reads use the same factor, because they have to: with only the write converted, saving "2 days"
  would store the right minutes and read back as "1". The service attaches the factor to each row and
  the response mappers use it — a required property, so a service that forgets to decorate is a
  compile error rather than a response quietly reporting every duration against 24-hour days. The
  guest share view resolves it the same way, so a guest and a member can never see a different number
  of days for the same activity.

  Every existing calendar carries the 24-hour default, so **nothing changes for any existing plan**;
  and the CPM engine still cannot see the column, so the recalculation parity gate is untouched.
  Dependency lag, the persisted float columns and baseline durations still use the old constant and
  are the next slice.

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Edit a calendar exception instead of deleting and recreating it

  An exception could be created and deleted, never edited. Correcting a day's hours meant
  delete-then-recreate: two writes, a new id, and a window in which a holiday had become an ordinary
  working day — one a recalculation landing between them would have scheduled work on.
  `CalendarException.version` existed in the schema, was returned on every read, and was never used for
  a write.

  `PATCH …/calendars/:calendarId/exceptions/:exceptionId` replaces the day's windows as a set, or edits
  only the label when neither `windows` nor `isWorking` is sent. It refuses the same contradictions the
  create refuses — both spellings at once, an empty array, unsorted or overlapping windows — through the
  same shared validator, so an edit can never reach a state a create could not.

  Two versions are in play and both matter. The write is gated on the **exception's** version: a stale
  one is a 409, because someone else changed those hours since they were read. It then bumps the
  **calendar's**, exactly as create and delete already do, so a client holding a stale calendar is told
  as well.

  The date is deliberately not editable — moving an exception is deleting one and adding another, which
  the two surrounding endpoints already do visibly.

  Anti-IDOR by shape rather than by check: the exception is reached only through a lookup that requires
  its calendar id too, and that calendar has already been resolved inside the caller's organisation. An
  exception belonging to a different calendar is a 404 even when the caller may write to both, and the
  e2e suite asserts exactly that case.

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Author a dated exception's hours, and stop answering 500 for an empty calendar (TECH_DEBT [#79](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/79)/[#80](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/80))

  `api-v0.34.0` made the weekly pattern authorable as intraday shift windows. The dated-exception half
  was the same defect one table over: `createException` derived a day's windows from the `isWorking`
  boolean, so a worked exception was always a **whole** worked day. A half-day before a holiday, a
  short-crew shutdown day, and the hours a window-only calendar exists to carry were all unauthorable,
  while `calendar_exception_windows` sat in the schema and the engine read it every recalculation.

  `windows` now joins `isWorking` on the exception DTO — mutually exclusive, since `isWorking` is
  shorthand for the whole-day case and sending both would be two answers to one question. An empty
  `windows` array is refused so "no working time" has exactly one spelling. Both forms resolve through
  one `exceptionWindowRowsFor` shared with the interchange batch, which previously carried its own
  inline copy of the rule. `windows` is on the read DTO too: without it an authored half-day would be
  invisible the moment it was saved.

  `endDate` is exposed on the exception read. Storage has always held a range and the DTO returned
  only `startDate` — an end date the client could not see is one it could not be told changed. Only a
  single day is authorable, so it equals `date` for every exception this API creates; the point is
  that the contract stops hiding a column.

  **A live 500 is fixed with it.** Accepting `workingWeekdays: 0` in `api-v0.34.0` (TECH_DEBT [#79](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/79))
  lifted the DTO bound without mapping the engine guard it had been standing in for. A brand-new
  window-only calendar has no working time until it carries an exception, and recalculating a plan on
  one threw out of `buildWorkingTimeCalendar` into an opaque `INTERNAL_ERROR` — a user-caused,
  user-fixable state reported as a server fault, naming neither the calendar nor the fix, reachable in
  two clicks with no flag. It is now a 422 `CALENDAR_HAS_NO_WORKING_TIME` carrying the calendar's name
  and what to add, raised as a named `EmptyWorkingTimeCalendarError` (the engine is the only layer that
  sees both the weekly pattern and the exceptions; the service is the only one that can phrase the
  rejection). The window-only shape stays valid — the second regression test recalculates the same
  calendar successfully once one working exception gives it hours.

  `@repo/types` gains `CalendarWindow`/`CalendarShift`, `shifts` on `CalendarSummary`, and
  `windows`/`endDate` on `CalendarExceptionSummary`, plus `WorkingWeekdays.toFullDayShifts` — the one
  statement of what a weekday mask means in the storage form the engine schedules on, now shared by
  the API's write path and the client instead of restated on each side.

  The CPM engine's scheduling is unchanged: it has read shift and window rows since ADR-0036, so the
  recalculation parity gate is untouched. Every field is additive and existing clients keep today's
  behaviour.

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Float is persisted in the activity's own calendar days

  `total_float`, `free_float` and `visual_drift_days` are stored **in days**, converted from engine
  minutes by the recalculation's own batched write. They divided by a flat 1440 while durations had
  just moved to the calendar's working day — so one span would have read as "3 days of work with 1 day
  of float", which is not a smaller change than converting them but an incoherent one.

  They now take the factor of the calendar each activity actually schedules on, which is where
  ADR-0035 already says its total float is measured — so the unit and the measurement finally agree.
  The factor is resolved once per distinct calendar in the plan, so a 2,000-activity plan on three
  calendars costs three rows.

  The **cross-plan derivation deliberately keeps a fixed 1440**, and now says so in a comment. It is
  the one place a day-denominated value becomes engine input, and its arithmetic walks _calendar_ days
  over a date-only value — feeding it a working-hours-scaled number would compound two approximations
  exactly where the result moves dates. ADR-0068 §3b originally said the opposite; building it showed
  that to be wrong and the ADR is corrected rather than quietly followed.

  Every existing calendar carries the 24-hour default, so no existing plan's float changes.

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Round-trip a P6 calendar's standard working day, and store its shift windows verbatim.

  `day_hr_cnt` was read on import and thrown away, and hard-coded as `8` on export. It is the
  day↔minute factor for every duration measured on that calendar (ADR-0068), so importing an 8-hour
  P6 calendar re-read the file's own durations at 24 h/day — a 5-day task arriving as 2 — and
  exporting a 24-hour calendar claimed an 8-hour day, so the same plan came back three times longer.
  It now maps both ways in XER (absent ⇒ the target derives it); MSPDI has no per-calendar
  equivalent, so an MSPDI export reports the drop rather than inventing a figure.

  The import also stops flattening calendars. It wrote a weekday mask as full-day shifts and reduced
  each exception to worked/not-worked, because nothing could store or author a partial day; ADR-0036's
  shift rows and ADR-0067's window editor removed that constraint. A P6 07:00–15:30 calendar now
  imports as a 07:00–15:30 calendar.

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Relationship lag is measured on its lag calendar's working day

  `lagDays` converted at a flat 1440 minutes, so a "1 day lag" on an 08:00–17:00 calendar was three
  working days of delay — the same defect durations had, on the other half of the network.

  It now converts on the calendar the relationship's `lagCalendar` names (ADR-0068 §4): the
  predecessor's, the successor's, the plan's, or — for `TWENTY_FOUR_HOUR` — a **hard-pinned 1440**,
  because escaping working-time arithmetic is the entire meaning of that option.

  The factor therefore varies **per dependency row**, not per plan, so one page of a plan's logic can
  need several. The endpoint calendars ride on the join the read already does, and a page costs one
  extra lookup. A PATCH that switches `lagCalendar` and edits `lagDays` in the same call converts
  against the option it is switching **to**.

  Every existing calendar carries the 24-hour default, so no existing plan changes.

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Imported programmes now open laid out, instead of one activity per lane (ADR-0069).

  An import gave each activity a lane matching its position in the source file, so a 500-activity XER
  opened as 500 lanes holding one bar each — nothing wrong with the data, but the first diagram a
  planner sees of a schedule they have just brought over from P6 was unreadable. The commit now packs
  lanes after recalculating, using the same packer the canvas's Auto-arrange has always used, which is
  extracted to a shared package so the two cannot drift apart. A layout failure leaves the imported
  plan in place rather than discarding it.

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Close the shift editor's seven deferred findings (TECH_DEBT [#82](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/82)).

  An import's calendar windows are now sorted, de-duplicated of empty spans and merged where they
  overlap — each one a reported repair rather than an opaque 500 from a recalculation days later —
  and a standard working day below the domain's floor is raised instead of rounding to zero stored
  minutes. The calendar library table stops showing a two-shift calendar and a plain Mon–Fri one as
  the same row. Window problems clear as you correct them once they are on screen, an overlapping
  pair flags both of its rows, and adding or removing a dated exception on an organisation calendar
  takes the same `calendar:manage_org` capability that editing one already did.

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Read activity durations in days, hours and minutes (ADR-0070, behind `VITE_SUB_DAY_DURATIONS`)

  The engine has scheduled sub-day work for a year and the API has accepted `durationMinutes` since
  `api-v0.34.0`, but the activity editor offered a whole-number **days** box — so a four-hour lift or a
  90-minute commissioning step could be imported, scheduled and exported, and never typed.

  Behind the new flag the duration field reads text with a `d`/`h`/`m` grammar (`2d 4h`, `90m`,
  `1.5d`); a bare number still means days, so every value already in use keeps its meaning. The
  day↔minute factor comes from the calendar the form currently selects (ADR-0068), and where it is not
  known the field stays in whole working days rather than guessing.

  Also fixed, unflagged: a canvas move resent the activity's **rounded** duration, silently flattening
  a sub-day activity to zero days; it now round-trips the exact stored minutes. `durationMinutes` and
  `lagMinutes` join the shared `@repo/types` shapes and the guest share DTOs, so a shared programme no
  longer shows a four-hour activity as `0 d` with no way to tell it from a milestone.

### Patch Changes

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Build `@repo/layout` in the images and in CI, and gate the build contract

  ADR-0069 added a third shared workspace package and its own Consequences section named the
  obligation that comes with one (ADR-0019: a shared package ships compiled output, so every consumer
  must build it first). The three lines that discharge it — the `COPY` and the `pnpm --filter … build`
  in each app's Dockerfile, plus the CI e2e job's direct "Build shared packages" step — were never
  added, so both images and the Playwright web server failed with
  `Cannot find module '@repo/layout'`: an error naming a module that plainly exists.

  Nothing local could see it. A developer's checkout already has `packages/layout/dist` from an
  earlier build, so the whole pre-push gate passes — lint, typecheck, 3,323 unit tests, the API e2e
  against a real Postgres, and both flag-on journeys — and the failure appears only on a clean
  machine, minutes into CI, inside `nest build`.

  `pnpm check:build-contract` now asserts it: every `@repo/*` an app lists in `dependencies` is
  COPYd and built in that app's Dockerfile and built in the CI step. It runs in the quality job
  beside the doc-link and playbook checks, needs no database, and was verified to fail against the
  exact defect before being wired in.

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Reject an empty calendar at the baseline-variance seam too, not just at recalculation

  The `CALENDAR_HAS_NO_WORKING_TIME` mapping shipped a moment ago at
  `ScheduleService.resolveCalendar`. `BaselinesService.resolveCalendar` builds a calendar port the same
  way, from the same rows, and still threw — so a variance read on a calendar with no working time
  answered the same opaque 500 the recalculation had just stopped answering.

  Both now go through one `buildPlanCalendarOrReject` in `plan-calendar.ts` rather than a catch at each
  seam. Two copies of the rule would be free to drift, and the half that drifted would be the one
  nobody exercises — which is precisely what the first version of this fix did, silently, until the
  second seam got a test of its own.

  Worth recording how that test behaved: its first version passed with a 200, because variance
  short-circuits to an empty result before resolving a calendar when the plan has no active baseline.
  A green test that never reaches the code it names is worse than no test, and the fix was to the test,
  not the product.

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Seed calendars with their real shift windows, and add the `capability-shift-calendars` plan.

  The seeder sent a weekday mask and an `isWorking` flag, so a `SeedSpec` two-shift calendar was
  created as a 24-hour one: the intraday half of ADR-0036 was demonstrated by nothing, and the
  coverage report excepted six capability keys for a cause (`no write path accepts shift windows`)
  that stopped being true in api-v0.34.0. It now sends `shifts` and exception `windows` verbatim,
  plus the calendar's `hoursPerDay` (ADR-0068).

  `capability-shift-calendars` is the plan that could not previously exist: nine calendars whose
  working **days** are identical and whose **hours** are not — eight-hour, two-shift, twelve-hour,
  round-the-clock, split-day, short-Friday, nights across midnight, window-only, and one whose stated
  standard day deliberately disagrees with its week. Two of them agreeing means the hours are not
  being read. Its `docs/TEST_PLAYBOOK.md` row says so, and the six excepted keys are now reached.

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fold the ten blocking findings from the shift-editor epic's five specialist gates (ADR-0067 M4).

  The largest was a **dead end**: a calendar with no working week — the shutdown/turnaround shape the
  epic exists to make authorable — could be created by the Window-only preset and then never saved
  again, because the form kept a hidden `workingWeekdays >= 1` rule that the shift editor does not
  render. Save was refused by a control that was not on screen.

  Also folded: the night-shift affordance the ADR describes now exists (it wrote instructions for
  doing the arithmetic by hand, and left the helper that does it with no callers); focus is claimed on
  opening a per-row exception edit and handed back on closing it; three Save/Add buttons move off the
  native `disabled` attribute onto the `aria-disabled` + inert-class pair, including one that
  announced as unavailable while staying fully clickable; the hours-per-day advisory and warning are
  `aria-describedby`-linked to the field and the warning stops interrupting on every keystroke;
  adding and removing a period announces the settled result; a read-only week says why it is
  read-only; the two menu triggers use the shared `Button` instead of re-declaring its recipe by hand;
  the create dialog widens to fit the week editor it now carries; and one duplicate element id.

  On the API side this is documentation accuracy, not behaviour: `docs/API.md` gains the
  standard-working-day section and the `CALENDAR_HAS_NO_WORKING_TIME` 422, which is now declared on
  the three routes that can return it, and every `…Days` field's OpenAPI description says which
  calendar's day it is measured in.

- Updated dependencies [[`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581), [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581), [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581), [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581), [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581)]:
  - @repo/types@0.19.0
  - @repo/interchange@0.7.0

## 0.34.0

### Minor Changes

- [#205](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/205) [`8e106b1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8e106b1f65d0fae50bb98a1a9dffdf4771f8b92d) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Author intraday shift patterns through the public API (TECH_DEBT [#80](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/80))

  ADR-0036 shipped split shifts, night shifts crossing midnight and asymmetric weeks in the engine
  and in storage. Nothing in the product could create one: the repository derived every calendar's
  shifts from a 7-bit weekday mask, so every calendar in every database was a whole-day calendar and
  the minute-granular machinery underneath was exercised only by unit tests and the conformance
  adapter. A planner on a two-shift site could not describe their working week at all, and the
  schedule they got was silently a whole-day approximation of it.

  The calendar create/update DTOs take a `shifts` array of `{weekday, startMinute, endMinute}` —
  the storage form — mutually exclusive with `workingWeekdays`, which is shorthand for full-day
  windows on the named days. Either replaces the whole week as a set. `shifts` is also on the read
  DTO: `workingWeekdays` is derived from it and can only say whether a day works at all, so without
  that a saved split shift would be invisible the moment it was stored.

  Windows are validated at the boundary — sorted, non-overlapping within each day, `start < end`.
  The engine asserts the same thing, but at _recalculation_ time, which surfaces an overlap authored
  on Monday as a failed schedule run on Wednesday pointing at the plan rather than the calendar.
  An unsorted array is rejected rather than quietly sorted: storage is order-sensitive, and
  reordering an author's input hides which pair they got wrong.

- [#205](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/205) [`8e106b1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8e106b1f65d0fae50bb98a1a9dffdf4771f8b92d) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Author sub-day durations and lags through the public API (TECH_DEBT [#78](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/78))

  ADR-0036 moved storage and the CPM engine to working-**minutes** and shipped intraday shift
  calendars, but the public DTOs exposed only whole days. The asymmetry was the defect: the
  interchange commit writes `duration_minutes` directly, so a 4-hour activity **imported and scheduled
  correctly** — and then no client, including the web app, could create a comparable one, and any edit
  touching the duration silently rounded it to whole days.

  `durationMinutes` joins `durationDays` on the activity create/update DTOs, and `lagMinutes` joins
  `lagDays` on the dependency ones. Each pair is mutually exclusive: sending both is a 422 naming the
  pair, not a silent preference for one — a client sending `durationDays: 2` and `durationMinutes: 240`
  has a bug, and picking a winner hides it behind a schedule that is quietly not what was asked for.

  Both minute fields are also exposed on the **read** DTOs. Without that, a client could author a
  4-hour activity and only ever see it as `durationDays: 0` — a write path that is technically present
  and practically useless.

  Two things the debt entry did not anticipate, both found while wiring it:

  - The milestone-must-be-zero rule keyed off `durationDays` alone, so a milestone could have acquired
    a duration by being asked for in minutes. It now covers both fields and names whichever it fired on.
  - The ADR-0040 duration-type recompute used `durationDays !== undefined` as its "is this a duration
    edit?" test. A minutes-only edit would have skipped it silently, leaving
    `Units = Duration × Units/Time` false with nothing saying so. It now takes an explicit boolean.

  The day fields are unchanged for every existing client, and the CPM engine is untouched — minutes
  were always the unit it schedules on.

- [#205](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/205) [`8e106b1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8e106b1f65d0fae50bb98a1a9dffdf4771f8b92d) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Accept a window-only calendar (TECH_DEBT [#79](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/79))

  ADR-0036 §2 made a window-only base week valid — every weekday non-working, all working time
  arriving from dated exception windows, the shape a plant turnaround or a shutdown programme needs —
  and said the old "mask must be non-zero" guard was replaced by the engine's
  `buildWorkingTimeCalendar` check. That check is strictly stronger: it counts the exception windows
  as well as the base week, so it can tell a turnaround calendar apart from a calendar on which
  nothing can ever be scheduled, which a weekday mask alone cannot.

  The DTO's `@Min(1)` was never relaxed to match, so for a year the engine supported the shape and the
  API answered 422 with no workaround. This is that unfinished migration, not a new capability.

  `MIN_WORKING_WEEKDAYS_MASK` moves 1 → 0 and both calendar DTOs pick it up through the shared
  constant. The calendar **form** keeps its own "at least one working day" rule, stated locally rather
  than borrowed from the shared helper: it cannot author the exception windows a window-only calendar
  needs, so offering the empty week there would build a calendar that fails at the next
  recalculation. That bound lifts with the shift-pattern editor ([#80](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/80), web slice).

### Patch Changes

- Updated dependencies [[`8e106b1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8e106b1f65d0fae50bb98a1a9dffdf4771f8b92d)]:
  - @repo/types@0.18.0

## 0.33.0

### Minor Changes

- [#202](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/202) [`d118978`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/d118978979e50385c28234198cc06c2606d952ff) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Import: ask about a resource-name collision instead of blocking on it

  Importing a file that names a resource the organisation already has — under that name but not
  under a code that identifies it as the same row — used to fail with a bare
  `409 A resource with these details already exists.`, with no way forward short of renaming or
  deleting the library row by hand.

  The dry-run now reports each collision (`report.resourceCollisions`), naming the incoming
  resource and the library row it clashes with, and the commit takes an answer per resource in a
  new `resourceResolutions` field: `REUSE_EXISTING` binds the imported assignments to the row
  already there, `CREATE_COPY` creates a separate resource under a disambiguated name so the
  file's own rate and calendar survive. Both answers are recorded as `repair` findings on the
  post-commit report — "reuse" silently drops the file's rate and calendar for that resource, and
  that is worth saying out loud.

  A collision left unanswered fails the commit with a named list
  (`422 UNRESOLVED_RESOURCE_COLLISIONS`) rather than being guessed: a resource library is
  org-global, and levelling, over-allocation and Earned Value all read from one pool, so reusing
  the wrong row and duplicating one crew are both wrong in ways a report line cannot undo. A code
  match is still an identity match and asks nothing.

  The import dialog gains a third step listing each clash with the library row it clashes with,
  and a choice per resource. Confirm stays shaded with the reason attached to it (`aria-disabled`,
  not the native attribute — a natively-disabled button leaves the tab order and takes the reason
  with it) until every one is answered. Answers are discarded whenever the report is re-fetched:
  an answer belongs to the report that raised it.

  `SegmentedControl` now accepts `value={null}` for a question with no answer yet, and gives the
  first option the group's tab stop — otherwise every option is `tabIndex={-1}` and an unanswered
  group is unreachable by keyboard (WCAG 2.1.1).

### Patch Changes

- [#202](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/202) [`d118978`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/d118978979e50385c28234198cc06c2606d952ff) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Import and export P6 Level-of-Effort activities instead of flattening them to tasks

  `CANONICAL_ACTIVITY_TYPES` omitted `LEVEL_OF_EFFORT`, so an XER's `TT_LOE` was coerced to `TASK`
  (reported as an approximation) and export had no mapping back. The comment called it "out of scope" —
  true when written, and untrue from the day the LOE engine shipped (ADR-0035 §21).

  The cost was not a missing feature but a wrong one. An LOE derives its span from its logic (earliest
  SS-predecessor start → latest FF-successor finish) and never drives anything; a `TASK` schedules from
  a duration and does. So an imported supervision or site-management LOE became an ordinary task and
  changed the schedule around it.

  XER now round-trips it exactly, duration included — P6 writes one and the engine consumes it as a lag
  bound, so dropping it would be lossy for no gain. MSPDI has no equivalent, so an LOE still writes as
  an ordinary task there, but is now **reported per activity** rather than silently. `HAMMOCK` stays
  out of scope on the honest test: the enum has the label, but no engine code consumes it.

- [#204](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/204) [`745e7a3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/745e7a3264eb65cf94dce6547573cacca9e1187a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix: exporting a plan no longer turns every Level of Effort activity into a task. `export.service.ts` coerced `LEVEL_OF_EFFORT` to `TASK` before the emitter saw it, justified by a docblock that stopped being true when the importer was fixed. XER has `TT_LOE`, the adapter reads it and the emitter writes it — only this function stood in the way, so export → re-import silently downgraded every LOE. Found by the new ADR-0066 M5.4 round-trip diff.

- [#204](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/204) [`745e7a3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/745e7a3264eb65cf94dce6547573cacca9e1187a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the seed catalogue's foundation: the pure `SeedSpec` model and the HTTP seeder (ADR-0066)

  Internal tooling — no runtime behaviour changes. The API gains one unit test pinning its enums
  against `@repo/seed`'s hand-maintained copy, so a new enum member cannot silently make a
  capability unseedable.

- Updated dependencies [[`d118978`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/d118978979e50385c28234198cc06c2606d952ff), [`d118978`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/d118978979e50385c28234198cc06c2606d952ff)]:
  - @repo/interchange@0.6.0

## 0.32.1

### Patch Changes

- [#200](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/200) [`1943e0e`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1943e0efb7ebb7bf7c428625126a5be577fd28f0) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix WBS summary rollup: the activity's WBS parent never reached the CPM engine

  `loadActivities` did not select `parentId` and `toEngineActivity` did not pass it, so every
  `WBS_SUMMARY` arrived at `computeSchedule` with no visible children and took the ADR-0035 §24
  empty-summary branch — collapsing to a zero-length point on the project data date. On an imported
  P6 programme that meant every phase bar drew as a 2px sliver on the project start instead of
  spanning its work.

  Nothing errored, because the empty-summary collapse is a defined answer, and the engine's own
  rollup suite passes `parentId` in directly so it stayed green. The regression test therefore sits
  at the service seam, nested two levels deep so it also covers the deepest-first ordering.

## 0.32.0

### Minor Changes

- [#195](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/195) [`22bc960`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/22bc960b641afd5426dc1d383d4ae7a64d069c73) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - WBS improvements: table multi-select, the band in the exported picture, and default-on.

  The epic's last three milestones. **M4b** adds bulk assign to the activities table — a selection
  column and a bar that files the ticked activities under one summary (or back to the top level),
  sharing the same minimal, version-carrying batch the Members panel sends. **M5** puts the pinned WBS
  band into the exported PNG/PDF and the derived Unassigned bucket into the printed programme, so the
  picture matches the screen; the band's derivation is now a single shared function rather than one
  copy per surface. **M6** ran the deferred specialist gates over the whole epic diff and flips
  `VITE_WBS_IMPROVEMENTS` **default-on**.

  The gates found four defects that had passed a human read, each folded with a regression test:

  - selecting a summary while the band was on lost the entire canvas selection-actions bar — the band
    lifts summaries out of the scene, and the anchor lookup only consulted the scene, so Dissolve and
    Edit left the screen _and_ the tab order for exactly the objects the band exists to show;
  - the Assign button used the native `disabled` attribute, which blurs to `<body>` the instant it
    flips, on a control that flips twice per save;
  - `POST …/activities/:id/dissolve` mutated its children's optimistic-lock `version` and returned
    `204`, leaving every cached child silently stale — it now returns the promoted rows at their new
    versions (**a breaking change to that endpoint's response**);
  - and it read those children's new parent from a snapshot taken _before_ the lock it takes to make
    that read safe.

  `PATCH …/activities/parents` also makes `parentId` required-but-nullable, so a forgotten field is a
  validation error rather than a silent promotion to the top level, and a row naming itself as its
  parent is now `422 SELF_PARENT` rather than sharing `PARENT_CYCLE` with the `409` case.

  Rollback: `VITE_WBS_IMPROVEMENTS=false`. Every flag-off parity suite is kept and pinned.

## 0.31.0

### Minor Changes

- [#193](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/193) [`8f94a06`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8f94a06a11b5ae35775196e8e0dfdcdb95cab09d) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the batch WBS membership write, `PATCH …/plans/:planId/activities/parents`.

  Files one or more of a plan's activities under a summary — or, on a null `parentId`, back at the
  top level — in a single all-or-nothing transaction, so managing a summary's whole membership in one
  place either lands wholesale or not at all. Modelled on the existing `positions` batch, but
  structural: `parentId` feeds the engine's WBS rollup, so a committed batch leaves the plan's
  computed dates stale until the next recalculation.

  Validated against the **resulting** tree rather than the current one. A row-by-row check against
  pre-state would accept a batch like "A under B" plus "B under A" — each row files a childless
  top-level summary under another, so each passes alone, while together they close a cycle. The batch
  is overlaid on the plan's current edges and the whole result is walked, which is also cheaper than
  a per-row ancestor walk.

- [#193](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/193) [`8f94a06`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8f94a06a11b5ae35775196e8e0dfdcdb95cab09d) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add `POST …/activities/:activityId/dissolve` — remove a WBS grouping, keep the work.

  Promotes the summary's direct children to its own parent (or the top level), then soft-deletes the
  now-childless summary, in one transaction under the plan advisory lock, so a child can never be
  stranded between the two writes: the count of active activities falls by exactly one.

  Deliberately a separate endpoint rather than a flag on `DELETE`, which cascades to the whole
  subtree. That cascade is right when the work is genuinely cancelled and catastrophic when the
  planner only meant to drop a level of grouping, so the destructive reading must never be the
  default. A nested branch keeps its shape — a grandchild stays under its own parent, which simply
  moves up a level. Restoring a dissolved summary brings back the summary alone.

### Patch Changes

- [#193](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/193) [`8f94a06`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8f94a06a11b5ae35775196e8e0dfdcdb95cab09d) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Serialise WBS re-parenting with the plan advisory lock.

  `assertValidParent` walks an activity's ancestor chain and then writes on the strength of what it
  read, but its two callers — activity create and activity update — ran that read-then-write without
  the per-plan advisory lock ADR-0038 invariant (a) assumes. Two concurrent mirror re-parents (A under
  B, B under A) could each read a still-acyclic tree, both pass, and leave the WBS parent tree cyclic;
  optimistic `version` cannot catch it, because each request writes only its own row at exactly the
  version it read.

  Both callers now take `acquirePlanWriteLock` — only on the branch that sets a non-null parent, so an
  ordinary edit and a top-level create are unchanged, and before the calendar guard's lock so this
  service has one acquisition order.

## 0.30.1

### Patch Changes

- [#191](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/191) [`75d1069`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/75d1069c2e8c4e7621ba46fda57d559d889cc070) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Declare the 423 the resource-assignment routes can already return

  `ResourceAssignmentService` asserts the plan edit-lock on create, update and delete, and an e2e case
  pins it — but none of the three routes carried `@ApiLockedResponse`, so the OpenAPI document did not
  mention the status. A client generated from the spec had no branch for it. Documentation only: no
  behaviour, permission or schema change. Closes TECH_DEBT [#61](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/61).

## 0.30.0

### Minor Changes

- [#185](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/185) [`8a9ae73`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8a9ae730b7b03d46d12be6bc0a5443c801e91863) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The weighted-steps replace now requires the plan edit-lock

  `PUT …/activities/:activityId/steps` asserts `assertHoldsPen` like every other
  activity write (ADR-0028, ADR-0060 §5). A steps replace bumps the parent
  activity's `version` and moves the physical %-complete rollup, so it is a
  structural write; until now the client required the pen and the server did not.
  The route declares its `423` in OpenAPI. The `GET` is unchanged and stays
  member-level.

  Two qualifications on the impact. `PLAN_EDIT_LOCK_ENFORCED` defaults to `false`
  and `assertHoldsPen` no-ops while it is off, so a default deployment sees no
  change today — it bites where enforcement is already on, and at the moment an
  operator enables it. And no user loses a visible affordance: every web path to
  this write already required the pen, so the change closes a gap between the
  client and the server rather than removing a capability.

## 0.29.0

### Minor Changes

- [#180](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/180) [`bd011eb`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/bd011eb9e99a233081096dfca0b21990d77ddf91) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - List endpoints no longer advertise a sort-direction param they ignore.

  `PaginationQueryDto` carried an `order` field, so every cursor-paginated list documented
  `?order=asc|desc` in its OpenAPI — while exactly one of them (a plan's baselines) actually read it.
  Everywhere else the value was accepted and discarded: a client sending `order=desc` got a `200` and
  the wrong page, with nothing in the response to suggest otherwise. A documented no-op is worse than
  an absent feature, because it looks like a contract.

  `order` now lives only on `ListBaselinesQueryDto`, the one list that honours it. Every other list
  keeps its fixed direction — which was always a product decision (a member roster reads oldest-first,
  a note thread newest-first) — and simply stops claiming otherwise.

  **Behaviour change:** because the API rejects unknown query params, sending `order` to a list that
  does not declare it is now a `422` rather than being silently ignored. No SchedulePoint client sends
  it. A list can opt back in by declaring `order` in its own query DTO and threading it into its
  `orderBy`; a `(created_at, id)` keyset reverses correctly provided both terms flip together.

### Patch Changes

- [#180](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/180) [`bd011eb`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/bd011eb9e99a233081096dfca0b21990d77ddf91) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The recycle bin reads one page instead of three.

  It paginated the union of the client, project and plan tables by fetching each table's own top page
  and merge-sorting in the service — reading three times as many rows as it returned. That cost was
  paid on every page, not once, because the recycle-bin screen follows the cursor to the end.

  One `UNION ALL … ORDER BY (deleted_at DESC, id ASC) LIMIT` now does the merge in the database and
  returns exactly the page asked for. Same rows, same order, same restorability.

## 0.28.0

### Minor Changes

- [#156](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/156) [`f2de423`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f2de42312711bf94864983a43bc96d06285f150e) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(api): give calendars a project scope tier (ADR-0053, M1 — backend only, no user-visible change yet)

  A calendar now belongs to one of two tiers: `ORG` (the shared organisation library — what every
  calendar was before, and still the default) or `PROJECT` (local to one project), so a one-off
  shutdown calendar no longer permanently pollutes the library every other project picks from.

  - `POST/PATCH …/calendars` accept `scope` + `projectId`; every calendar response carries them.
  - `GET …/calendars?scope=org|project|all` (default `org`, today's result set) and a new
    `GET …/projects/:projectId/calendars` returning the calendars usable in a project (its own
    plus all organisation ones).
  - A calendar can be promoted to the shared library at any time; narrowing it to one project is
    refused with 409 `CALENDAR_SCOPE_NARROWING_BLOCKED` while anything outside that project still
    uses it.
  - Assigning a project calendar outside its project is refused with 422 `CALENDAR_WRONG_SCOPE`
    (a resource may only hold an organisation-wide calendar: 422 `RESOURCE_REQUIRES_ORG_CALENDAR`).
  - Deleting a project now soft-deletes its project calendars with it, and restoring brings them
    back; shared calendars are never touched.
  - New `calendar:manage_org` permission gates writes to the shared library, granted to Planner and
    Org Admin — no role loses a capability.

  Existing data is entirely unaffected: every existing calendar is `ORG`-scoped and behaves exactly
  as before. The CPM engine is untouched and recalculation output is unchanged.

- [#156](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/156) [`f2de423`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f2de42312711bf94864983a43bc96d06285f150e) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(interchange): import calendars into the target project instead of the shared library (ADR-0053, M5)

  Importing a P6 or MS Project file used to create every one of its calendars in the shared
  **organisation** library, so importing three files could silently add a dozen `Standard 5 Day`
  calendars that every other project then had to scroll past. An import now creates its calendars **in
  the project you imported into**, where they belong — and where they are deleted with it.

  - A fresh import adds **zero rows** to the organisation calendar library.
  - A calendar an imported **resource** uses is still created organisation-wide (a resource can only
    hold an organisation calendar), and the report says so.
  - A file's **global** calendars land in the project with a "promote it to the library if other
    projects need it" note — or in the shared library outright if you send the new optional
    `globalCalendarScope=ORG` field with the upload.
  - P6's calendar type (`clndr_type`) is now **read on import and written on export**, so exporting a
    plan and importing it again preserves each calendar's tier. MS Project's format has no equivalent
    field, so an MSPDI export reports the tier as dropped rather than losing it silently.
  - A calendar name the project (or library) already holds is imported as
    `"Site 6-Day (imported 2026-07-26)"` and reported — never silently merged into the existing one,
    because two calendars sharing a name can have completely different working weeks. This also fixes
    importing two files that share a calendar name into the same project, which previously failed.

  Every decision above appears in the interchange report you review on the dry-run, so nothing about
  where a calendar went is a surprise. The CPM engine is untouched and recalculation output is
  unchanged.

- [#156](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/156) [`f2de423`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f2de42312711bf94864983a43bc96d06285f150e) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(api): archive, search and filter the calendar & resource libraries (ADR-0053, M4)

  Both shared libraries gain a **retire** action that is not a delete, and server-side search so a
  library stays usable past a page of rows.

  - **Archive / unarchive** — `POST …/calendars/:id/archive` · `…/unarchive` and
    `POST …/resources/:id/archive` · `…/unarchive` (204, version-gated). An archived calendar or
    resource is still entirely valid: it keeps every existing plan, activity, resource and
    assignment binding, and **keeps scheduling, levelling, loading the histogram and earning value
    exactly as before**. It is simply hidden from the libraries' default lists and from every
    picker.
  - **Archiving is deliberately not blocked by use** — that is the whole point, and the contrast
    with delete. It is the only way to retire a calendar that "this calendar is in use" (correctly)
    refuses to delete, and a resource can be retired while it still drives a live activity.
  - **Only new usages are refused** — assigning an archived resource to an activity is 422
    `RESOURCE_ARCHIVED`, and binding an archived calendar to a plan, activity or resource is 422
    `CALENDAR_ARCHIVED`. Editing an **existing** assignment still succeeds, and something already
    bound to a calendar that was archived afterwards stays fully editable.
  - **Search and filter** — `?q=` on both list endpoints (calendars by name; resources by name or
    code, case-insensitive), plus `?archived=exclude|include|only` on both and `?kind=` on
    resources, all cursor-paginated and combinable with the existing `scope` / `parentId` filters.
  - **Import matching** — an import that matches an archived resource now unarchives it and says so
    in the report, instead of silently creating assignments to a retired row.

  Every list default reproduces today's result set, `archivedAt` is an additive response field, and
  an archived row keeps its name and code so unarchiving can never fail. The CPM engine is untouched
  and recalculation output is unchanged.

- [#156](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/156) [`f2de423`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f2de42312711bf94864983a43bc96d06285f150e) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(api): organise the resource library into groups (ADR-0053 §3, M3)

  A resource pool of hundreds is now navigable. Resources can be nested under **groups**, without
  fragmenting the pool itself — it stays a single organisation-wide pool, which is what makes
  cross-plan over-allocation detection and resource levelling meaningful.

  - A new resource kind, **`GROUP`**, is a grouping node rather than a resource: it has no calendar,
    no capacity ceiling and no cost rate, and it can never be assigned to an activity (422
    `GROUP_NOT_ASSIGNABLE`).
  - Every resource carries a `parentId` (null = top level), settable on create and update.
    `GET …/resources?parentId=<id>` lists a group's contents and `?parentId=null` the top level;
    omitting it returns the whole library exactly as before.
  - Moves are validated server-side: a group can't contain itself (409 `RESOURCE_PARENT_CYCLE`),
    only a group can contain resources (422 `RESOURCE_PARENT_NOT_GROUP`), a parent in another
    organisation is simply not found, and nesting stops at 10 levels (422 `RESOURCE_TREE_TOO_DEEP`).
    Two people re-organising at once can't combine their moves into a loop.
  - Deleting a group deletes its whole contents together, unless something inside it is still
    assigned — in which case it is refused with the count of assigned resources in the group.
  - An assigned resource can't be turned into a group, and a group that still holds resources can't
    be turned back into one.

  Existing data is entirely unaffected: every existing resource is top-level and no resource is a
  group. The CPM engine, the levelling pass, the resource histogram and Earned Value are untouched
  and all read the same inputs as before — a group has no assignments, so it cannot appear in demand,
  capacity or cost. Recalculation output is byte-identical.

### Patch Changes

- Updated dependencies [[`f2de423`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f2de42312711bf94864983a43bc96d06285f150e), [`f2de423`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f2de42312711bf94864983a43bc96d06285f150e), [`f2de423`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f2de42312711bf94864983a43bc96d06285f150e), [`f2de423`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f2de42312711bf94864983a43bc96d06285f150e)]:
  - @repo/types@0.17.0
  - @repo/interchange@0.5.0

## 0.27.0

### Minor Changes

- [#140](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/140) [`bc4522f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/bc4522f1b254bd924d1f77a57cc8a4b12b65a7ad) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat: show the running API + web version in the app shell

  Adds a public `GET /api/v1/version` endpoint (unauthenticated, like `/health`) returning
  `{ data: { version } }` — the API's own package version, read once at startup. The web app bakes its
  own version at build time and renders a subtle `web x.y.z · api x.y.z` line in the Project Explorer
  rail footer (muted, non-interactive, screen-reader labelled), fetching the API version via a cached
  query. Makes the deployed versions visible in-product for support/debugging.

## 0.26.0

### Minor Changes

- [#138](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/138) [`7889f5c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7889f5cde753754511a9b4aa6712d55fb1f715c7) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat: show the running API + web version in the app shell

  Adds a public `GET /api/v1/version` endpoint (unauthenticated, like `/health`) returning
  `{ data: { version } }` — the API's own package version, read once at startup. The web app bakes its
  own version at build time and renders a subtle `web x.y.z · api x.y.z` line in the Project Explorer
  rail footer (muted, non-interactive, screen-reader labelled), fetching the API version via a cached
  query. Makes the deployed versions visible in-product for support/debugging.

## 0.25.0

### Minor Changes

- [#134](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/134) [`9017272`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90172724fee87b2930998168e4ddd7532c797549) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(api): session-less External-Guest read surface (ADR-0051 F-M3)

  Adds the app's **first unauthenticated data-read** endpoints — the session-less guest read path for a
  share link. Every route is `@Public()` (bypasses the session guard) and instead resolves an
  `Authorization: Bearer sp_share_<token>` header to its **one plan** via the existing `ShareTokenGuard`
  (uniform 404 on any dead / revoked / expired / deleted-plan token — no oracle).

  - `GET /api/v1/share/plan` — the plan header + its calendar (for the time axis) + the schedule summary
    (project finish, activity / critical / near-critical counts).
  - `GET /api/v1/share/activities` — the plan's activities, **cursor-paginated**: id, code, name, type,
    duration, CPM early/late + actual dates, total float, `isCritical`, lane, and progress
    (`status`, `percentComplete`).
  - `GET /api/v1/share/dependencies` — the plan's logic ties, **cursor-paginated**: id, predecessorId,
    successorId, type, lag.

  **Anti-IDOR by construction:** the handlers take **only** the `GuestPrincipal` the guard resolved — the
  plan id and organisation id come solely from the token, never from a request param/query/body (there are
  none). Reads go through the existing org-scoped domain repositories, scoped only by the token's
  `planId` + `organizationId`, and return **field-stripped, read-only** DTOs that carry **no**
  cost / Earned-Value / money, resources / assignments, baselines / variance, notes, audit columns,
  user identity, plan-lock holder, or token. Every response is served `X-Robots-Tag: noindex, nofollow`
  and `Referrer-Policy: no-referrer`, and the surface carries a **tighter per-IP rate limit** (30 / 60 s)
  than the global default (100 / 60 s), scoped to `/api/v1/share/*` only.

  **Read-only, write-free of engine state:** it reads the persisted CPM columns (no engine invocation), so
  the recalc parity gate is untouched. The single write is a best-effort, **coalesced** `last_accessed_at`
  telemetry touch (`touchLastAccessedIfStale`, at most once per 5 min per link), fired-and-forgotten so it
  never blocks or fails a read. A flagged web surface is F-M4.

  **Rate-limit hardening (from the F-M3 security review):** the per-IP guest limit relies on Express
  resolving the real client IP, so `configureHttpApp` now sets `trust proxy` from the existing
  `TRUSTED_PROXY_IPS` config (the same source Better Auth already trusts) — without it, behind a reverse
  proxy every request collapses onto the proxy IP and the per-IP bucket degrades into one shared global
  bucket. Set only when proxies are declared (production); off in dev/test. The remaining multi-replica
  gap (Nest `ThrottlerGuard` uses in-memory storage) is logged as tech-debt [#49](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/49).

## 0.24.0

### Minor Changes

- [#132](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/132) [`c44e4ae`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/c44e4ae33eaadbfc9854684f3ee9091af9b97dab) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(api): External-Guest share-link management API + `plan:share` (ADR-0051 F-M2)

  Adds the authenticated management surface for per-plan share links, nested under a plan:

  - `POST …/plans/:planId/shares` — create a revocable, optionally-expiring link. Returns **201**
    `{ url, share }`; the raw `sp_share_…` token is returned **once** in the URL's fragment
    (`…/share#<token>`) and never again (only its SHA-256 hash is stored). A non-future `expiresAt`
    is a **422** (`SHARE_EXPIRY_IN_PAST`).
  - `GET …/plans/:planId/shares` — list a plan's links, newest-first, **metadata only** (never a token).
  - `DELETE …/plans/:planId/shares/:shareId` — revoke, immediate and **idempotent** (204).

  Introduces the `plan:share` permission, granted to **Planner + Org Admin only** — sharing a plan
  outside the organisation is a governance act, deliberately not a Contributor/Viewer capability. Every
  method resolves the org from the caller's memberships (404 non-member), asserts `plan:share` (403), and
  scopes the target plan to that org (404 anti-IDOR); `organization_id` is copied from the resolved plan,
  never from client input. Non-scheduling and write-free of engine state — the CPM engine, the pen model
  (ADR-0028), and the recalc parity gate are untouched, and share writes are not pen-gated.

  The session-less guest read path and its rate-limiter are F-M3; a flagged web surface is F-M4.

## 0.23.0

### Minor Changes

- [#130](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/130) [`a56dcaf`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a56dcafb4dc5c6ebc8e9fc8b250706807c78d880) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(api): External-Guest share-link foundations — schema, token helper & guest-auth seam (ADR-0051 F-M1)

  The dark foundations for Stage F (per-plan share links). Adds a `plan_shares` table + migration: an org-scoped,
  soft-deleted, hashed-token grant to exactly one plan (`token_hash` stores only the SHA-256 of the raw bearer
  token, unique across all rows), with a `PlanShareRepository`. Extracts the invitation hashed-token util to a
  shared `common/tokens/token.ts` (`generateOpaqueToken(prefix)`/`hashToken`); invitations reuse it with an empty
  prefix, so their token format and stored hashes are byte-identical.

  Introduces the guest identity seam: `GuestPrincipal` — structurally distinct from the member `Principal` (no
  memberships, no `can()`), so a guest can never flow into a member service method — plus a `ShareTokenGuard` that
  resolves an `Authorization: Bearer sp_share_…` token to a live grant (not revoked / expired / soft-deleted) and
  re-checks the referenced plan is active, with a uniform 404 on every failure (no existence oracle). The plan
  soft-delete cascade (`HierarchyLifecycleService`) now sweeps and restores a plan's share links in the same batch.

  No routes are wired yet (management API is F-M2, guest reads are F-M3), so behaviour is unchanged. Read-only and
  write-free: the CPM engine, the pen model (ADR-0028), and the recalc parity golden suite are untouched.

## 0.22.0

### Minor Changes

- [#127](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/127) [`dcfeb5f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/dcfeb5f6a8f84c0a3201a400c36b0c2bae215548) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(interchange): read-only XER schedule export endpoint + `interchange:export` permission (ADR-0050 M4a)

  Adds `GET /api/v1/organizations/:orgSlug/plans/:planId/interchange/export/:format` (M4a: `format = xer`),
  a thin, read-only NestJS surface over the pure `@repo/interchange` exporter. It resolves the org from the
  caller's memberships (anti-IDOR), scopes the target plan to that org, reads the plan's core network
  (activities, dependencies, calendars — plus resources/assignments/constraints/progress, honestly reported as
  out-of-M4a-scope drops) into an `ExportGraph`, and streams the serialised `.xer` as an attachment. The
  interchange report rides in an `X-Interchange-Report` response header (compact JSON). No database writes, no
  migration, and the CPM engine + recalc parity golden suite are untouched.

  Introduces the `interchange:export` permission, granted to **every member** (Viewer upward) — export is a
  read-egress of on-screen-readable schedule data, unlike the Planner/Org-Admin-only `interchange:import`.

  The global response-envelope interceptor now passes binary `StreamableFile` responses through unwrapped, and
  CORS exposes `Content-Disposition` + `X-Interchange-Report` so a browser client can read them.

### Patch Changes

- [#127](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/127) [`dcfeb5f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/dcfeb5f6a8f84c0a3201a400c36b0c2bae215548) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(interchange): MS Project MSPDI export serialiser + format-agnostic export dispatch (ADR-0050 M4b)

  Proves, in reverse, ADR-0050's claim that "a format is a serialiser, not a second pipeline": the **same**
  canonical export model the M4a XER path serialises now also serialises to a valid Microsoft Project **MSPDI**
  `.xml`. Adds to the pure `@repo/interchange` package:

  - `mspdi-emit.ts` — the canonical → MSPDI `<Project>`/`<Calendars>`/`<Tasks>`/`<PredecessorLink>` element
    emitter (the inverse of the MSPDI adapter): activity type → `<Milestone>`/`<Duration>`, working-minutes →
    ISO-8601 `PT#H#M#S`, relationship type → link `<Type>` (`0=FF, 1=FS, 2=SF, 3=SS`), minutes lag →
    tenths-of-a-minute `<LinkLag>`, canonical calendar → `<WeekDays>/<WeekDay>` (`DayType` 1=Sunday…7=Saturday,
    `<WorkingTimes>`, `<TimePeriod>` exceptions). WBS summaries, constraints, progress, ALAP and
    resources/assignments are **dropped and reported** (M4c) reusing the XER emitter's finding shapes.
  - `mspdi-serialiser.ts` — serialises the element tree to UTF-8 XML bytes with the MS Project namespace + an
    XML declaration. All leaf text is XML-escaped (`& < > "`) so untrusted plan text can never break or inject
    structure; the output re-parses through the real `fast-xml-parser`-based `parseMspdi`.
  - `export-mspdi.ts` — the `exportMspdi` orchestrator (validate → limit → map → emit → serialise → report),
    reusing the shared graph-size ceilings and the format-agnostic `mapExportGraphToCanonical` unchanged.
  - `export-schedule.ts` — `exportSchedule({ graph, format })` dispatch (`xer` | `mspdi`), the write-direction
    mirror of `importSchedule`, so the caller stays format-blind.

  The CPM engine and its recalc parity golden suite are untouched (export never invokes the engine).

  The `@repo/api` export endpoint (`GET …/plans/:planId/interchange/export/:format`) now accepts
  `format = mspdi` (streamed as `application/xml`, `<slug>.xml`) alongside `xer`, via `exportSchedule`. The
  OpenAPI `format` enum and the 422 unsupported-format message are updated; everything else is identical.

- [#127](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/127) [`dcfeb5f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/dcfeb5f6a8f84c0a3201a400c36b0c2bae215548) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(interchange): rich-scope export parity (WBS, constraints, progress, resources) for XER + MSPDI (ADR-0050 M4c)

  Both exporters now serialise the **full plan**, not just its core network. `emitXerFromCanonical` and
  `emitMspdiFromCanonical` reverse the import adapters field-for-field so a rich plan round-trips (export →
  re-import → structural equivalence):

  - **WBS** — `PROJWBS` rows + `wbs_id` parentage (XER, reversing the `wbs:<id>` key convention) and
    `<Summary>` + `<OutlineLevel>` pre-order tasks (MSPDI).
  - **Constraints** — `cstr_type/date` (+ `cstr_type2/date2`), ALAP and expected-finish (XER — all 8 types
    exact); MSPDI's single `<ConstraintType>` slot + `<Deadline>` (mandatory types + a secondary constraint
    reported as approximations).
  - **Progress** — status/percent/physical/actuals/suspend/resume/expected-finish/remaining (XER — exact);
    MSPDI progress fields (no suspend/resume/expected-finish, one percent-complete measure — reported).
  - **Resources + assignments** — `RSRC`/`TASKRSRC` with the driving flag + production rate (XER — exact);
    MSPDI `<Resources>`/`<Assignments>` (no driving flag / rate — reported).

  The obsolete M4a/M4b **drop** findings for these categories are removed; a category reports a finding only
  when it is genuinely lossy. The API export path was already reading the rich fields into the export graph,
  so no service change was needed. The CPM engine and recalc parity golden suite are untouched (export is a
  pure read).

- Updated dependencies [[`dcfeb5f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/dcfeb5f6a8f84c0a3201a400c36b0c2bae215548), [`dcfeb5f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/dcfeb5f6a8f84c0a3201a400c36b0c2bae215548), [`dcfeb5f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/dcfeb5f6a8f84c0a3201a400c36b0c2bae215548)]:
  - @repo/interchange@0.4.0

## 0.21.0

### Minor Changes

- [#125](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/125) [`1886e03`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1886e03cf6c79070abc07dd3f211e690193981c4) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Wire Microsoft Project MSPDI import through the stack (ADR-0050, Stage C2 M3). A new format-agnostic
  `importSchedule` entry point in `@repo/interchange` detects the interchange format (Primavera P6 XER vs
  MS Project MSPDI XML) from the bytes and routes to the matching orchestrator — both produce the same
  import graph + report, so callers stay format-blind. The interchange commit/dry-run endpoints now call
  `importSchedule` instead of the XER-specific path, so an uploaded `.xml` MSPDI file imports through the
  exact same review→commit pipeline as `.xer` (an unrecognised file gets a single user-safe rejection). The
  web **Import from file…** dialog accepts `.xer` **or** `.xml`, with updated copy and the unparseable-file
  message naming both formats. On by default under the existing `VITE_SCHEDULE_INTERCHANGE` flag.

### Patch Changes

- Updated dependencies [[`1886e03`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1886e03cf6c79070abc07dd3f211e690193981c4), [`1886e03`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1886e03cf6c79070abc07dd3f211e690193981c4), [`1886e03`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1886e03cf6c79070abc07dd3f211e690193981c4)]:
  - @repo/interchange@0.3.0

## 0.20.0

### Minor Changes

- [#123](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/123) [`522b838`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/522b838be2b3fc3ff94c36b6b4fc9d7e77d310a6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Persist the Stage C2 M2 import graph (ADR-0050): the XER commit now creates a materially-complete P6
  import — the **WBS tree** (`WBS_SUMMARY` activities + `parentId`), **activity constraints** (primary +
  secondary + As-Late-As-Possible), **progress** (status, actual dates, remaining duration, physical %,
  suspend/resume, expected finish), and **resources + assignments**. Resources are org-scoped, so the
  importer **resolves-or-creates** — reusing an existing active org resource by code (else name) rather than
  blind-creating (which would collide with the org-unique partial-uniques and abort the import). All new
  rows go in via batched `createManyForImport` inside the existing single commit transaction (activities in
  one `createMany` so the WBS self-FK resolves at statement end), and `compensate` now unwinds assignments
  and import-created resources FK-safely on a phase-2 recalc failure. The pure pipeline already guarantees
  the invariants the domain services would (one-driver-per-activity, MATERIAL-never-drives, WBS acyclicity,
  progress consistency), so the batched writes never trip a DB constraint. The CPM engine and recalc are
  only invoked, never modified.

### Patch Changes

- Updated dependencies [[`522b838`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/522b838be2b3fc3ff94c36b6b4fc9d7e77d310a6)]:
  - @repo/interchange@0.2.0

## 0.19.0

### Minor Changes

- [#121](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/121) [`58c9c85`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/58c9c85a5dcbcb2ab2474efafe6cc1bdbb7afedb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the schedule-interchange **commit** endpoint (ADR-0050, Stage C2, Task 1.5).
  `POST …/organizations/:orgSlug/projects/:projectId/interchange/commit` re-accepts the multipart upload,
  re-parses it with the pure `@repo/interchange` pipeline (deterministic — the graph equals the reviewed
  dry-run), and in **one transaction** creates the plan with its calendars, activities and dependencies via
  the existing repositories (the same transaction-composition the domain services use), then **recalculates**
  the new plan (ADR-0022 — the CPM engine is only invoked, never modified) and returns
  `201 { data: { planId, report } }`. Same `interchange:import` permission, target-project org-scope
  (anti-IDOR) and 16 MiB byte cap as the dry-run. **Atomicity:** an unparseable file (422 before any write),
  a persistence rejection (duplicate plan/calendar name, duplicate/cyclic dependency — the whole transaction
  rolls back), or a recalculation failure (compensated) leaves **nothing created**. Calendars are imported to
  the M1 weekday-mask contract (intraday shifts approximated to worked weekdays); activities take a
  deterministic lane per source order.

- [#121](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/121) [`58c9c85`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/58c9c85a5dcbcb2ab2474efafe6cc1bdbb7afedb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the `interchange` NestJS module and the stateless schedule-interchange **dry-run** endpoint
  (ADR-0050, Stage C2, Task 1.4). `POST …/organizations/:orgSlug/projects/:projectId/interchange/dry-run`
  accepts a multipart file upload, enforces the new **`interchange:import`** permission (Planner + Org
  Admin) plus an org-scope check on the target project (anti-IDOR), caps the upload size at the HTTP
  boundary (16 MiB → 413), and runs the pure `@repo/interchange` pipeline to return the pre-commit
  `InterchangeReport` (mapped counts + approximation/repair/drop findings) — **without persisting anything**.
  An unrecognised/malformed file is a user-safe 422. The transactional commit endpoint (create the plan +
  recalculate) lands in a follow-up task.

### Patch Changes

- Updated dependencies [[`58c9c85`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/58c9c85a5dcbcb2ab2474efafe6cc1bdbb7afedb), [`58c9c85`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/58c9c85a5dcbcb2ab2474efafe6cc1bdbb7afedb), [`58c9c85`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/58c9c85a5dcbcb2ab2474efafe6cc1bdbb7afedb)]:
  - @repo/interchange@0.1.0

## 0.18.0

### Minor Changes

- [#98](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/98) [`c0e7cc2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/c0e7cc2864535bb85b621da481bcb76d092845fe) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Notes M1 — schema, permissions, shared types & cascade wiring (dark) (the Notes feature, ADR-0046).
  The storage + authorisation foundation for attributed, time-ordered note threads on entities (plans and
  activities in v1; client/project reserved). Nothing consumes it yet — no controller, no route, no UI —
  so `main` stays byte-identical: the API surface and the CPM engine are untouched.

  - **Schema (`@repo/api`)** — a new polymorphic `notes` table (`entity_type` discriminator + nullable
    typed FKs `plan_id`/`activity_id`) with an exactly-one-parent CHECK, a 1–5000-char plain-text body
    CHECK, and indexes for the plan/activity threads, the batch note-counts badge, and the cascade sweep.
    Every note carries a denormalised `plan_id` (an activity note copies its activity's), so a single
    sweep by `plan_id` catches PLAN + ACTIVITY notes with no double-count. See ADR-0046.
  - **Permissions (`@repo/api`)** — `note:read` (every member, part of `HIERARCHY_READ`) and a
    `note:create`/`note:update`/`note:delete` write group granted **Contributor upward** (like
    `activity:update_progress`): annotating an entity is non-structural, so it needs neither the
    hierarchy write nor the plan edit-lock pen. Author-ownership of edit/delete is a service-layer check.
  - **Lifecycle (`@repo/api`)** — `HierarchyLifecycleService` now sweeps and restores a plan/activity's
    notes as part of its soft-delete batch (no endpoint guard — a note has exactly one parent).
  - **Types (`@repo/types`)** — `NoteEntityType`, `NoteSummary`, and `ActivityNoteCount`.

- [#98](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/98) [`c0e7cc2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/c0e7cc2864535bb85b621da481bcb76d092845fe) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Notes M2 — the note-thread API (the Notes feature, ADR-0046). A new org-scoped `notes` NestJS module
  (copied from the reference template) exposing attributed, time-ordered note threads on plans and
  activities. Non-structural, so — like the activity-progress path — it is **not** plan-edit-lock ("pen")
  gated: a Contributor can annotate without seizing the editor lock.

  - **Routes** (`/api/v1/organizations/:orgSlug/…`): `GET/POST …/plans/:planId/notes`,
    `GET …/plans/:planId/notes/activity-counts` (the batch row-badge counts), `GET/POST
…/activities/:activityId/notes`, `PATCH …/notes/:noteId`, `DELETE …/notes/:noteId`. Lists are
    newest-first and paginated (`{data, meta}`).
  - **RBAC**: `note:read` for every member; `note:create/update/delete` Contributor-upward. Update and
    delete are further constrained to the note's **own author** (a service-layer row check → 403), so
    holding the permission is not enough to touch someone else's note.
  - **Invariants**: `organization_id`/`entity_type`/`plan_id`/`activity_id` are derived from the resolved
    parent, never from client input (`whitelist`/`forbidNonWhitelisted`); body is trimmed-then-validated
    (whitespace-only → 422, 1–5000 chars); optimistic `version` guard → 409; uniform 404 anti-IDOR on a
    foreign/other-org/deleted parent or note. A note deletes softly under its own batch.

  Covered by unit + Supertest e2e (RBAC, cross-author 403, 409, 422, anti-IDOR 404, not-pen-gated writes,
  grouped counts, and cascade-with-parent). The CPM engine and recalc parity gate are untouched.

### Patch Changes

- Updated dependencies [[`c0e7cc2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/c0e7cc2864535bb85b621da481bcb76d092845fe)]:
  - @repo/types@0.16.0

## 0.17.0

### Minor Changes

- [#96](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/96) [`7aa0132`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7aa0132662097a928224901833896b07df583f22) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Cross-plan dependency CRUD + the plan-level DAG invariant + authz (inter-project M2, ADR-0045 §3/§6,
  F3). A new `cross-plan-dependencies` NestJS module — a dark sibling of `dependencies` — lets a Planner
  draw a **live inter-project link** between two activities in **different plans of the same
  organisation**. Nothing consumes the edges yet (the derivation seam + programme recalc are F4/F5), so
  `main` stays byte-identical: the engine and schedule service are untouched.

  - **API (`@repo/api`)** — org-scoped `POST/GET/DELETE …/cross-plan-dependencies` (create derives both
    plan ids from the endpoint activities; never from input) plus per-plan (incoming) and per-activity
    (both-direction) list routes. Create loads **both** endpoints active in-org (anti-IDOR uniform 404),
    rejects a same-plan edge (**422 `CROSS_PLAN_SAME_PLAN`**, N31), and — under a new **org-scoped**
    advisory lock (a distinct key namespace from the per-plan write lock) inside one transaction —
    enforces the **plan-level DAG** (**409 `CROSS_PLAN_CYCLE_DETECTED`**, N30), asserts the pen on the
    **successor** plan (ADR-0028), and rejects a duplicate `(pred, succ, type)` (**409
    `DUPLICATE_CROSS_PLAN_DEPENDENCY`**, N33). Delete is pen-gated and soft. A new
    **`dependency:link_cross_plan`** permission (Planner + Org Admin) gates linking; reads reuse
    `dependency:read`.
  - **Types (`@repo/types`)** — `CrossPlanDependencySummary` (carries both plan ids, no `isDriving`) and
    `CROSS_PLAN_DEPENDENCY_CONFLICT_MESSAGES` (the one-voice N30/N31/N33 copy).

- [#96](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/96) [`7aa0132`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7aa0132662097a928224901833896b07df583f22) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Live cross-plan derivation seam + PARITY gate (inter-project M2, ADR-0045 §2 / ADR-0035 §30.5, F4). At
  recalc time the schedule service now derives each activity's effective external early-start /
  late-finish bounds from its **live** cross-plan edges' upstream **persisted** computed dates and folds
  them into the existing M1 `externalEarlyStart` / `externalLateFinish` inputs — so a downstream plan can
  track dates that live in another plan. The **pure CPM engine is untouched** (`compute.ts` / `level.ts` /
  `constraints.ts` unchanged): the derivation lives ABOVE the engine as a pure, engine-free helper
  (`cross-plan-derivation.ts`).

  - **Derivation (`deriveExternalInstants`)** — day-granular, mirroring the engine's forward/backward
    bound shapes: forward (external early start) from each **incoming** edge (FS→predEF+lag, SS→predES+lag,
    FF→predEF+lag−succDur, SF→predES+lag−succDur), composed with the M1 column by **later-of** (§30.1);
    backward (external late finish) from each **outgoing** edge (FS→succLS−lag, SS→succLS−lag+predDur,
    FF→succLF−lag, SF→succLF−lag+predDur), composed by **tighter-of** (§30.2). A never-calculated upstream
    contributes **no** bound and is counted (`crossPlanUpstreamMissingCount`, N32) — never an error.
  - **PARITY gate** — the cross-plan loads run **only** when a plan has ≥1 active cross-plan edge
    (`countActiveForPlan`); a plan with none takes the unchanged M1-column path, so the engine input — and
    therefore its output — is **byte-identical**. The whole existing engine + conformance golden suite
    passes unchanged.
  - **Observability** — `crossPlanUpstreamMissingCount` is threaded into the recalc structured log
    (absent/`null` on the no-cross-plan path, so existing summaries and goldens do not move).

  Inert on existing plans (no cross-plan edge ⇒ no behaviour change); `main` stays releasable.

- [#96](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/96) [`7aa0132`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7aa0132662097a928224901833896b07df583f22) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Cross-plan schedule staleness tracking (inter-project M2, ADR-0045 §5 / ADR-0035 §30.7, F6). Every CPM
  recalculation now stamps the plan's `schedule_computed_at` freshness cursor, and the schedule summary
  read tells a planner whether their plan is **stale** relative to its cross-plan upstreams — so they know
  to run a programme recalculate. Pull-only (no background push job); the pure engine is untouched.

  - **API (`@repo/api`)** — `recalculatePlan` stamps `schedule_computed_at = now()` inside the same
    engine-owned write path as the per-activity results (a raw `UPDATE plans …`, so it does **not** bump
    the plan's optimistic `version`/`updated_at`, ADR-0022). Both the single-plan recalc and the programme
    solve (which loops that unit, upstream-first) stamp every plan they write. `GET …/schedule/summary`
    computes staleness **on read**: guarded on the plan having ≥1 cross-plan edge, it resolves the plan's
    upstream closure (reusing `resolveProgrammeOrder`) and compares each upstream's cursor against the
    plan's in one batched query — flagging the plan stale iff any upstream is newer (or the plan was never
    computed while an upstream has).
  - **Types (`@repo/types`)** — two new **optional** fields on `PlanScheduleSummary`: `scheduleStale`
    and `staleUpstreamPlanIds`. They are **absent** for a plan with no cross-plan edges, so an ordinary
    single-plan summary response is byte-identical to before M2 (the parity gate holds). A programme
    recalculate — which recomputes the closure upstream-first — clears the staleness.

- [#96](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/96) [`7aa0132`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7aa0132662097a928224901833896b07df583f22) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Synchronous programme-recalc orchestration (inter-project M2, ADR-0045 §4 / ADR-0035 §30.8, F5). A new
  endpoint recalculates a target plan's **upstream cross-plan closure** in dependency order so the target's
  derived inter-project bounds (F4) read fresh upstream dates. The **pure CPM engine is untouched** and each
  plan is recalculated with the **existing** single-plan recalc transaction — no recalc body is duplicated.

  - **API (`@repo/api`)** — `POST …/plans/:planId/schedule/recalculate-programme` (`schedule:calculate`,
    Planner + Org Admin). A pure `resolveProgrammeOrder(targetPlanId, edges)` resolves the target's upstream
    closure in **topological order, upstream-first** (the target last), tie-broken by plan id so the order —
    and thus the per-plan advisory-lock acquisition order — is **stable and deadlock-free**. The
    orchestrator (`ScheduleService.recalculateProgramme`) loops the closure, invoking the shared single-plan
    recalc unit per plan (each its own ADR-0022 transaction + advisory lock + pen), so every downstream plan
    reads its upstreams' freshly-written dates. A residual plan-level cycle (unreachable given the F3 DAG
    invariant) fails loud (`ProgrammeCycleError` → alarm 500, nothing written).
  - **Fail-fast pen pre-check (default, ADR-0045 CQ-3)** — before any write, the pen is asserted on **every**
    closure plan, **collecting all** blocked plan ids in one pass; if any is held by another editor the whole
    solve is refused with a single **423 `PROGRAMME_PLANS_LOCKED`** carrying the `blockedPlanIds` list —
    nothing is written. Inert unless `PLAN_EDIT_LOCK_ENFORCED` is on.
  - **Result + roll-up** — the `200` response returns per-plan summaries (in recalculation order) plus a
    programme roll-up (`planCount`, and the summed **N32** `crossPlanUpstreamMissingCount`).
  - **Types (`@repo/types`)** — `ProgrammeScheduleResult` / `ProgrammeSchedulePlanResult` and the
    `ProgrammeScheduleLockedDetails` (`PROGRAMME_PLANS_LOCKED`) 423 payload.

  A programme with no cross-plan edges has a closure of just the target, so this is byte-identical to a
  single-plan recalc; `main` stays releasable.

### Patch Changes

- Updated dependencies [[`7aa0132`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7aa0132662097a928224901833896b07df583f22), [`7aa0132`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7aa0132662097a928224901833896b07df583f22), [`7aa0132`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7aa0132662097a928224901833896b07df583f22)]:
  - @repo/types@0.15.0

## 0.16.0

### Minor Changes

- [#94](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/94) [`4e78ff1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/4e78ff11f9468ed8511f2e780dc2072abacc7050) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Turn on the remaining eight off-by-default web surfaces (Resources, Duration types, Resource
  levelling, Earned Value, Cost accrual, Activity steps, Resource curves, Inter-project external dates)
  by flipping their `VITE_*` flags from default-off to default-on — after clearing every documented
  pre-flip blocker. The engine/API behind each surface was already live; this exposes it in the UI by
  default.

  Pre-flip remediation (TECH_DEBT [#38](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/38)/[#39](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/39)/[#40](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/40)/[#41](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/41)/[#44](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/44)):

  - **API (`@repo/api`)** — **Pen-gate resource-assignment writes** ([#39](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/39)): assign / edit / unassign now
    call `PlanEditLockService.assertHoldsPen` like the activity write path (a units/rate edit persists the
    owning activity's derived duration, a scheduling mutation), returning **423** to a non-holder when
    `PLAN_EDIT_LOCK_ENFORCED` is on; 423 e2e added. **Money overflow guards** (#40a): every integer
    minor-unit money field (`budgetedExpense`/`actualExpense`/`budgetedCost`/`actualCost`) gains
    `@Max(MONEY_MINOR_UNITS_MAX)` and every `Decimal(18,4)` field
    (`costPerUnit`/`maxUnitsPerHour`/`budgetedUnits`/`unitsPerHour`/`actualUnits`) `@Max(DECIMAL_18_4_MAX)`,
    so an over-range value is a clean **422** rather than a precision-loss / column-overflow 500; boundary
    specs added. **Engine-owned `external_driven`** ([#41](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/41)): a new per-activity boolean column mirroring
    `constraint_violated` (metadata-only migration), written by the recalc batched `unnest` UPDATE and
    aggregated in the read-summary so `externalDrivenCount` is truthful on a plain summary read.
  - **Types (`@repo/types`)** — `ActivitySummary` gains `externalDriven: boolean`; new
    `MONEY_MINOR_UNITS_MAX` / `DECIMAL_18_4_MAX` bounds.
  - **Web (`@repo/web`)** — **Row-actions `Menu`** ([#38](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/38)): the activities table's per-row actions move from
    a spread of ghost buttons to a single overflow `⋯` trigger opening the APG `Menu`
    (Logic/Progress/Resources/Steps/Edit/Delete, role-gated) — meeting the "dense row actions use a Menu,
    never hover-only" standard. **External badge** ([#41](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/41)): an "External" row badge in the Name cell mirrors
    the "Conflict" badge, driven by the engine's per-activity `externalDriven`. **Context gating** ([#44](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/44)):
    the Steps row action is coupled to Earned Value (its only consumer), and the resource loading-curve
    picker is hidden for zero-span milestones. Then all eight `flagDefaultOff` flags become `flagDefaultOn`.

  Parity: `compute.ts` and `level.ts` are untouched; `external_driven` is engine-owned output written on
  every recalc (false when not external-driven), so absent-data byte-parity holds and existing engine / EV
  goldens do not move. Not addressed here (documented follow-ups): #40b Contributor cost-progress wiring,
  [#42](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/42) shared `SelectField`, [#43](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/43) histogram bucket in URL.

### Patch Changes

- Updated dependencies [[`4e78ff1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/4e78ff11f9468ed8511f2e780dc2072abacc7050)]:
  - @repo/types@0.14.0

## 0.15.0

### Minor Changes

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Cost accrual (M7 rung 5, ADR-0044 F1 / ADR-0035 §32). Each activity gains a settable `accrualType`
  (`START` / `UNIFORM` (default) / `END`) that governs **when** its cost lump-sum is recognised in the
  Earned-Value read's Planned-Value time-phasing — `START` at the activity start, `END` at its finish,
  `UNIFORM` linearly — reshaping the cost / cash-flow S-curve. It **never changes a CPM date**, feeds the
  scheduler nothing, and is a pure read-model extension of `earned-value.ts`: `UNIFORM` (or absent) is
  byte-identical to the pre-ADR-0044 phasing (the parity gate), so the existing Earned-Value goldens stay
  green. The engine (`compute.ts`) and the levelling pass (`level.ts`) are untouched.

  - **API (`@repo/api`)** — the create/update activity DTOs, the activity response DTO, and the EV read
    path (`schedule.service.getEarnedValue` + `loadEarnedValueActivities`) all carry `accrualType`
    (reuses `activity:update`; the EV read stays `cost:read`-gated). `AccrualType` / `ACCRUAL_TYPES`
    round-trip through `@repo/types`.
  - **Types (`@repo/types`)** — `ActivitySummary` gains `accrualType: AccrualType`.
  - **Conformance** — the EV adapter reads the fixture's `expenses.accrual_type` and collapses per-expense
    → one activity value (ADR-0044 §Q4); new first-principles goldens assert the phased PV to the minor
    unit for **E001** (£45,000 crane mobilisation, `START` — full PV at the start), **E002** (£68,000,
    `UNIFORM` — 50% at mid-window) and **E004** (£3,500 retention, `END` — nothing until the finish), plus
    a `UNIFORM`→`START` flip differential. The `accrual_start` / `accrual_uniform` / `accrual_end`
    capability tags flip ✅ (32 ✅ / 1 ⚪); ADR-0035 gains an **Accepted §32**.
  - **Web (`@repo/web`)** — a **Cost accrual** select (Start / Uniform / End) in the activity form's
    "Cost & earned value" fieldset, behind the new **off-by-default** `VITE_COST_ACCRUAL` flag; wired
    through the create/update mutation and seeded from the row so a stored value round-trips when hidden.

  Deferred (later ADR-0044 slices, not in this change): the period-trend cost **S-curve** chart series
  (read-model + web), weighted **activity steps** (F2), and **resource loading curves** (F3).

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`272eb42`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/272eb420313809d0867ef81753ae4c705f631005) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - CPM **duration types** now drive the resource-units triad (M7 rung 4, ADR-0040). An activity carries a
  `durationType` (FIXED_DURATION_AND_UNITS_TIME (default) / FIXED_DURATION_AND_UNITS / FIXED_UNITS /
  FIXED_UNITS_TIME) and a driving resource assignment carries a `unitsPerHour` rate; editing any one of
  {duration, units, units/time} recomputes the correct **other** field via the pure `resolveTriad`
  function so `Units = Duration × Units/Time` stays true — and for FIXED_UNITS / FIXED_UNITS_TIME the
  **duration is derived** from the driving resource's units ÷ rate and fed to the CPM engine unchanged
  (the engine is untouched; the no-rate path is byte-identical). The recompute runs at the write boundary,
  in one optimistic-locked transaction spanning the activity + its driving assignment: an activity duration
  edit recomputes the assignment's units/rate; an assignment units/rate edit (with an `editedField`) can
  recompute the owning activity's duration — each bumping the sibling's `version`, documented per-endpoint.
  Boundary rejects: negative `unitsPerHour` (N19, `@Min(0)` + DB CHECK) and a zero rate on a units-driven
  recompute (N20, 422 `UNITS_PER_HOUR_ZERO`, before any division). Additive DTO fields (`durationType`,
  `unitsPerHour`, `editedField`) + response exposure; new shared types `DurationType` / `EditedField`.

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - EV2a: make the EV1 cost & percent-complete-type fields (ADR-0042) settable via the API. Passthrough only
  — no earned-value computation and no new endpoint (that is EV2b). Threads the already-landed schema columns
  through the create/update DTOs and the service/repository write paths so they persist without changing any
  behaviour. Client-settable inputs (all Planner/Org-Admin-gated writes): activities `percentCompleteType`
  (`DURATION` default / `UNITS` / `PHYSICAL`), `physicalPercentComplete` (0–100, N23), `budgetedExpense` /
  `actualExpense`; resources `costPerUnit` (cost rate, N22); assignments `budgetedCost` (null = derive later),
  `actualCost`, `actualUnits`; plan `eacMethod` (`CPI` default) / `currencyCode` (ISO-4217, nullable to clear).

  **Cost reads are Planner/Org-Admin only.** The commercially sensitive money **amounts** (`costPerUnit`,
  `budgetedCost` / `actualCost`, `budgetedExpense` / `actualExpense`) are deliberately NOT returned by the
  general entity GETs or in `@repo/types` summary types — they will be served only by the dedicated
  `cost:read`-gated Earned-Value read endpoint (EV2b), so a Viewer/Contributor can never read cost through a
  schedule read. The non-sensitive fields (`percentCompleteType`, `physicalPercentComplete`, `actualUnits` —
  a quantity like the already-public `budgetedUnits` —, `eacMethod`, `currencyCode`) remain in the summaries.
  Money on the wire is a plain `number` of minor units (`BIGINT` amounts → `Number(x)`, the `Decimal(18,4)`
  cost rate → `x.toNumber()`). Fully additive and behaviour-preserving: unset fields keep today's behaviour
  and nothing touches the CPM engine, recalc, or baseline capture.

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - EV2b: wire the **Earned-Value read endpoint** (ADR-0042 §2). A new `cost:read`-gated
  `GET /organizations/:orgSlug/plans/:planId/schedule/earned-value` returns the plan's P6 Earned-Value
  analysis (BAC, PV/BCWS, EV/BCWP, AC/ACWP → SV, CV, SPI, CPI → EAC, ETC, TCPI, VAC) per activity, rolled
  up over the WBS tree, and as a plan total. It is a **pure read**: it consumes the persisted CPM dates
  plus the cost / %-complete inputs and runs the dependency-free `computeEarnedValue` module — no lock, no
  recompute, no engine write, so the recalc parity gate is untouched.

  **RBAC:** `cost:read` is Planner + Org Admin only, so a Viewer/Contributor never reads the commercially
  sensitive money through a schedule read (403); an unknown/cross-org plan is a 404 (anti-IDOR), resolved
  from the caller's own memberships before any load.

  **Baseline cost snapshot (the ADR-0025 amendment):** baseline **capture** now freezes each activity's
  budgeted cost — `Σ assignments (budgetedCost ?? round(budgetedUnits × costPerUnit)) + budgetedExpense`
  — into `baseline_activities.budgeted_cost`, giving the active baseline a committed PV reference. A plan
  with no cost data snapshots an integer `0` (a real "no budget"), so a baseline captured now always
  stores a value; only a pre-EV baseline (SQL NULL) makes the read report `costBaselineMissing` and fall
  back to the live budget for PV. Additive and behaviour-preserving — the CPM engine, recalc, and the
  general reads are unchanged, and cost stays out of every non-`cost:read` response.

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Earned Value is now proven against the P6-class conformance fixture (EV3, ADR-0042 / ADR-0035 §29). A
  new fixture→EV adapter (`earned-value-adapter.ts`) grounds `computeEarnedValue` in real fixture cost and
  %-complete data — resource `price_per_unit`, assignment `budgeted_units`/`actual_units`, and `expenses`
  rows for `A4200`/`A7100`/`A8010`/`A6100`/`A3010`/`A10300` plus their two real WBS-summary ancestors
  (`W4000`/`W7000`) — with a first-principles golden (BAC/PV/EV/AC → SPI/CPI/EAC to the minor unit) and
  three differentials proving a flipped option changes the output: the `percentCompleteType` flip on
  `A4200` (the fixture's own physical-vs-duration divergence case), the `eacMethod` flip, and the
  cost-baseline present/absent flip. The `%-complete-type` (`pct_physical`/`pct_units`) and cost/EV
  (`cost_*`) halves of the capability matrix's deferred row flip to ✅ (resource curves, cost
  accrual/period trending, and activity steps stay ⚪, named later rungs). ADR-0035 gains an **Accepted**
  **§29** (percent-complete-type & earned-value semantics) plus **N22–N24**.

  The Earned-Value module and read endpoint also gain the **N24** read-time data-quality signal: a new
  `costWarningCount` on `PlanEarnedValue` / `PlanEarnedValueResult` counts leaf activities that show
  booked actual cost/units while apparently not started — surfaced, never rejected, so spend-without-
  progress (the exact CV signal) is visible rather than silently accepted. Additive field; `0` when no
  activity triggers it.

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - **EV4a — conditional per-role cost reads (ADR-0042).** The money **amount** fields are readable again on
  the general entity responses, but ONLY when the caller holds `cost:read` (Planner + Org Admin),
  org-scoped — a Viewer/Contributor still NEVER sees cost. This supersedes the earlier EV2a "remove cost
  from all reads" cut with the security reviewer's preferred conditional-field-inclusion, and unblocks the
  EV4 web edit forms (which must read the current cost to prefill and not clobber it on save).

  Re-exposed (as `number | null` on the wire; `null` = unset OR caller-not-permitted): resource
  `costPerUnit`; assignment `budgetedCost` / `actualCost`; activity `budgetedExpense` / `actualExpense`.
  The gate is threaded via a `canReadCost` boolean the service computes once from the already-resolved
  organisation (`principal.can('cost:read', org.id)` — never `canAnywhere`, to avoid a cross-tenant IDOR)
  and passes to each response DTO's `.from(entity, canReadCost)` mapper. Every read path that returns these
  entities (resource get + list, activity get + list + plan-activities list, assignment list) gates
  consistently and **fails closed** — a non-`cost:read` caller gets `null` for every cost field. The
  `cost:read`-gated Earned-Value endpoint (EV2b) is unchanged. The `%`-complete / units / EAC / currency
  fields are unaffected (they were never gated). No schema, engine, or write-DTO changes.

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - External / inter-project dates now persist and flow into the CPM recalc (ADR-0043 / ADR-0035 §30, M1).
  An activity carries two optional calendar-day fields `externalEarlyStart` (an SNET-shaped forward lower
  bound, floored at the data date) and `externalLateFinish` (an FNLT-shaped backward upper bound) — imported
  commitments gating it from another project; either, both, or neither may be set. They are **soft** bounds,
  never mandatory pins: the engine clamps early start UP to / late finish DOWN to them on the existing
  forward/backward passes and flags the activity external-driven, never setting `constraintViolated`. A new
  plan scheduling option `ignoreExternalRelationships` (default `false`, byte-parity) drops every external
  bound so a plan can be viewed on its own logic vs. gated by its neighbours. Boundary reject: an external
  late finish before the external early start when both are set returns **422** `EXTERNAL_FINISH_BEFORE_START`
  (N26), with a nullable-safe DB CHECK backstop. The recalc + `GET …/schedule/summary` roll-up expose an
  `externalDrivenCount` (engine-derived on a recalculation). Additive DTO/response fields on the activity and
  plan resources; new shared type fields on `ActivitySummary`, `PlanSummary`, and `PlanScheduleSummary`. The
  no-external / option-off path is byte-identical.

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`21818b7`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/21818b7af12c16f481d7547d6f9c1d0464a05a2c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Expose the **multiple-float-paths** analysis over REST (ADR-0035 §19), closing the one deferred piece of
  M6-F6. `GET /organizations/:orgSlug/plans/:planId/schedule/float-paths?target=&maxPaths=` returns the
  ranked contiguous driving chains into a target activity — path 0 the driving chain (relative float 0),
  branch paths in non-decreasing relative-float order, bounded by `maxPaths` (default 10, max 50). It is a
  read-only analysis (`schedule:read`, every member): it recomputes the schedule live through the same
  engine-input builder `recalculate` uses, so it can never drift from a recalculation, and never persists.
  Relative float is returned in working days. 422 if the plan has no start date; 404 if the target activity
  is not active in the plan; 400 if `target` is missing or not a UUID. Adds the shared `PlanFloatPath` /
  `PlanFloatPaths` types. Also a conformance-matrix reconcile: the Start-On/Finish-On both-pass pin, the
  N11 zero-working-hour hang guard, the N16 lag-horizon cap, and the minute-granular baseline (S01) are
  confirmed in-engine and marked supported (their notes had gone stale after the M1 minute rework).

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`a763a54`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a763a5488370935dfaa44b6dc68198f2706270a4) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Resource **levelling** is now proven against the P6-class conformance fixture and its summary counts are
  surfaced on the HTTP schedule-summary (M7 levelling rung, ADR-0041 / ADR-0035 §28). The conformance
  adapter gains an opt-in `honorLevelling` demand-model build (capacity from `max_units_per_hour`, demand
  from every active assignment's `units_per_hour`); scenario **S10** runs as a runnable **leveled-date**
  differential (NL-CRANE600 A6100/A6200 + NL-HYDROPUMP A7700/A7730 serialise; mandatory A10100/A10500 are
  never moved) with the pure early/late/float layer byte-identical to S01 (Q2), plus a first-principles
  levelling golden. The `Resource levelling` capability row + S10 flip ✅ in the capability matrix, and
  ADR-0035 §28 (levelling semantics) + N21 (negative-capacity reject) are Accepted.

  The schedule summary (`PlanScheduleSummary` / `PlanScheduleSummaryDto`, both the recalculate result and
  the read endpoint) now carries `leveledActivityCount`, `levelingWindowExceededCount`,
  `selfOverAllocatedCount` and `leveledProjectFinish` — a read-time aggregate over the plan's engine-owned
  leveled columns, `0` / `null` when the plan does not level (`levelResources` off — the byte-identical
  parity path). Additive fields only; no behaviour change when levelling is off.

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`7b29ccb`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7b29ccb64208a29aed92836dc46bc35cb691a05b) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - L1 resource-levelling schema fields wired through the API (ADR-0041, the additive DARK slice). Threads
  the already-landed schema columns through `@repo/types`, the DTOs, and the service/repository write paths
  so they round-trip without changing any behaviour. Client-settable inputs: `resources.maxUnitsPerHour`
  (capacity ceiling, null = uncapped, N21 `@Min(0)`), `activities.levelingPriority` (levelling tie-break,
  null = unset), and the plan options `plans.levelResources` / `plans.levelWithinFloatOnly`. Engine-owned
  overlay (response-echo only, never accepted from a write DTO): `activities.leveledStart` /
  `leveledFinish`, `levelingDelayDays` (echoed from stored `levelingDelayMinutes`), `levelingWindowExceeded`,
  and `selfOverAllocated` — all null/false until the L2 levelling pass writes them. Fully additive and
  byte-parity: with levelling off (the default) nothing runs and every plan recalculates unchanged. The L2
  engine pass and L3 conformance follow.

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`7952f5e`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7952f5e1c60119ff7ffb31f34908e401dfc2731e) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - CPM engine now schedules **Level-of-Effort** activities (M5-epic F1–F2, ADR-0035 §21). An LOE is a
  hammock: its dates are derived from the span of its earliest SS-predecessor start to its latest
  FF-successor finish, in a post-pass after the network is computed. An LOE **never drives or bounds a
  neighbour, never appears on the critical path or the project-finish/longest-path sets, and never inherits
  negative float** (its late dates are pinned to its early dates, so total float and free float are a
  non-negative 0). An LOE with no resolvable span — missing an SS predecessor or an FF successor — is
  **produced at a defined fallback and flagged** (N12), never rejected: a new engine-owned
  `activities.loe_no_span` boolean, written by the recalc's batched write and exposed as `loeNoSpan` on the
  activity schedule response and the `ActivitySummary` shared type, with a plan-level `loeNoSpanCount` on
  the schedule summary. With no `LEVEL_OF_EFFORT` activity present the new pass is a no-op and the
  golden/parity path is byte-identical; existing rows read `false` until the plan is recalculated.

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`816d0a0`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/816d0a09f262a1076f1a0aa1cd38b9590d2eec9b) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - M7.1 resource-model schema foundation (ADR-0039, the resource dimension of the CPM engine). Adds an
  org-scoped `resources` library (a sibling of the calendar library: name, optional code, a
  `kind` enum LABOUR/EQUIPMENT/MATERIAL, an optional own `calendarId`) and a `resource_assignments`
  join (activity ↔ resource with `budgetedUnits` + an `isDriving` flag), plus a new `RESOURCE_DEPENDENT`
  `ActivityType` member and an engine-owned `resource_driver_missing` flag on `activities` (its writer is
  the M7.2 engine rung). DB invariants: partial-uniques enforce ≤1 driving assignment per activity and no
  duplicate active `(activity, resource)`; a CHECK backs the N14 non-negative-units reject. Fully additive
  and byte-parity — with no resource present, every existing plan recalculates unchanged. `@repo/types`
  mirrors the new `ActivityType` member. Schema + migration only; the resources module, assignment API,
  and §23 scheduling follow.

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`62d7a97`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/62d7a974d752249fefa31ee7fea7e45e92a3e179) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - M7.1 resources module + resource-assignment API (ADR-0039, the resource dimension of the CPM engine).
  Adds an org-scoped resource library and the activity↔resource assignment join, mirroring the calendars
  module (soft-delete, cursor pagination, optimistic locking, deny-by-default RBAC + org scoping).

  New endpoints (all org-scoped): `POST/GET /organizations/:orgSlug/resources`,
  `GET/PATCH/DELETE /organizations/:orgSlug/resources/:resourceId`,
  `POST/GET /organizations/:orgSlug/activities/:activityId/assignments`, and
  `PATCH/DELETE /organizations/:orgSlug/assignments/:id`. New permissions: `resource:read` (every member)
  and `resource:create/update/delete/assign` (Planner + Org Admin only).

  Service-enforced invariants (ADR-0039): same-org for a resource's calendar and an assignment's
  activity/resource (the FK only scopes to the target table); `budgetedUnits` rejects negatives (N14);
  a resource in use by an active assignment can't be deleted (`RESOURCE_IN_USE`), and the existing
  `CALENDAR_IN_USE` guard now also counts resources; at most one driving assignment per activity — setting
  a driver is an in-transaction move; a `MATERIAL` resource may never drive. Adds the shared
  `ResourceKind` / `ResourceSummary` / `ResourceAssignmentSummary` types + a `RESOURCE_ERROR` map. The
  driving-resource-calendar scheduling (§23) and the `resource_driver_missing` writer follow in M7.2.

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Resource loading curves (M7 rung 5, ADR-0044 F3 / ADR-0035 §31) — **the final capability-matrix slice**.
  Each resource assignment gains a settable `curveType` (`UNIFORM` (default) / `BELL` / `FRONT_LOADED` /
  `BACK_LOADED` / `DOUBLE_PEAK`) — a named P6 loading curve — plus a new pure read-model
  (`resource-histogram.ts`) that distributes each assignment's `budgetedUnits` across its effective span
  (`start + assignment-lag → finish`, on the activity's own calendar, ADR-0037) per the named 21-point
  profile and aggregates a **units-over-time histogram per resource**, **conserving units** exactly
  (`Σ buckets === Σ budgetedUnits`). It moves **no CPM date**, owns **no engine column**, and does **NOT**
  feed the levelling pass this rung (Q2). `UNIFORM`/absent is a **flat** load — byte-identical to a
  flat-rate distribution — so the parity gate is trivial. `compute.ts` and `level.ts` are untouched.

  - **API (`@repo/api`)** — the create/update assignment DTOs, the assignment response DTO, and the
    assignment repository/service all carry `curveType` (reuses the existing `resource:assign` permission;
    a plain enum, not cost-gated). New `GET …/schedule/resource-histogram` endpoint (`schedule:read` — the
    units histogram is **schedule data, not cost**, Q5) with a `granularity` param (`DAY`/`WEEK`/`MONTH`)
    and offset paging over the per-resource series; the `meta` carries the shared bucket axis, series total,
    and `curveNormalisedCount` (N29). The new pure `computeResourceHistogram` read-model is a dependency-free
    sibling of `float-paths.ts` / `earned-value.ts`.
  - **Types (`@repo/types`)** — `ResourceCurveType` / `RESOURCE_CURVE_TYPES`, the histogram response types
    (`ResourceHistogram*`, `HistogramGranularity`), and `curveType` on `ResourceAssignmentSummary`.
  - **Conformance** — a new `resource-histogram-adapter.ts` reads the fixture's `resource_curves` +
    `assignments.curve`; the built-in profile constants are asserted **byte-equal to the fixture's
    profiles** (self-baselined, no external oracle, ADR-0034). Goldens prove **AS0026** (FRONT_LOADED,
    2400 u), **AS0042** (BACK_LOADED, 640 u), **AS0015** (BELL, 1200 u) and **AS0043** (DOUBLE_PEAK, 560 u)
    distribute to the exact profile shape and sum to `budgetedUnits`, plus a UNIFORM-vs-FRONT_LOADED
    differential (`resultsDiffer`), the assignment-lag case (**AS0027**), and **N29** (a profile not summing
    to 100 ⇒ normalise to the budget, units conserved, counted). The `res_curve_bell` /
    `res_curve_front_loaded` / `res_curve_back_loaded` / `res_curve_double_peak` capability tags flip ✅ —
    **closing the matrix (34 ✅ / 0 ⚪)**; ADR-0035 gains an **Accepted §31** + N29.
  - **Web (`@repo/web`)** — a **loading-curve picker** (Uniform / Bell / Front-loaded / Back-loaded /
    Double-peak) on the resource-assignment dialog and a **Resource histogram** read view (a bar chart with
    a keyboard-navigable data-table equivalent for WCAG 2.2 AA), behind the new **off-by-default**
    `VITE_RESOURCE_CURVES` flag; the picker round-trips through the assignment create/update mutation.

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`afd4690`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/afd4690ed6832ff43b4e551e530346bbaaaaec68) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - CPM engine now schedules **resource-dependent** activities on their driving resource's calendar (M7.2,
  ADR-0035 §23 / ADR-0039). When a `RESOURCE_DEPENDENT` activity has a driving resource assignment, the
  schedule service resolves the activity's calendar port to that **resource's** calendar before the pass
  runs (fallback chain: driving-resource calendar → the activity's own calendar → the plan default); the
  engine then treats the activity exactly like a `TASK` for logic, so its duration advances and its float
  is measured on the resource's calendar. A `RESOURCE_DEPENDENT` activity with **no** driving assignment is
  **produced at the fallback calendar and flagged** (§23), never dropped: a new engine-owned
  `activities.resource_driver_missing` boolean, written by the recalc's batched write and exposed as
  `resourceDriverMissing` on the activity schedule response and the `ActivitySummary` shared type, with a
  plan-level `resourceDriverMissingCount` on the schedule summary. With no `RESOURCE_DEPENDENT` activity
  present the resolution is skipped entirely and the golden/parity path is byte-identical; existing rows
  read `false` until the plan is recalculated.

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`7074b77`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7074b7703ff1b9bf784676a87c5a692a49741bc6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - WBS activity hierarchy foundation (M5-epic F5, ADR-0038 / ADR-0035 §24). Activities gain an adjacency-list
  `parentId` (a nullable self-reference) and a new `WBS_SUMMARY` activity type, the groundwork for
  WBS-summary rollup. The create/update API accepts `parentId` and the response echoes it; the service
  validates it is an **active `WBS_SUMMARY` in the same plan** (a foreign/cross-plan/deleted id reads as 404) and that re-parenting introduces **no cycle** in the WBS tree. A **WBS summary carries no logic**:
  the dependency-create path rejects a link whose endpoint is a summary (422). Governed by the new ADR-0038
  (adjacency-list over a materialised path; parent tree acyclic + same-plan, orthogonal to the dependency
  DAG). Schema-only + validation — the rollup engine (F6) and flagged web surface (F8) follow; every
  existing activity reads `parentId = null`, so the path is behaviour-preserving.

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`f62a361`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f62a361a998822e07fdcda1d9b061d230a43f969) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - CPM engine now rolls up **WBS-summary** activity dates from their branch (M5-epic F6–F7, ADR-0035 §24).
  A `WBS_SUMMARY` carries no logic (it has no dependencies); in a post-pass after the network is computed —
  running **after** the Level-of-Effort derivation and **deepest-first** so nested summaries resolve
  child-before-parent — each summary's dates are derived from its **direct children** in the `parentId`
  tree: earliest child start to latest child finish. A summary **never drives a successor, never appears on
  the critical path or the longest-path set, and never defines the project finish**; its late dates are
  pinned to the rolled-up early dates, so total float and free float are a by-convention 0. An **empty**
  summary (no children) collapses to the data date. The engine's `EngineActivity` gains a `parentId` input
  (the WBS containment tree, orthogonal to the dependency graph). With no `WBS_SUMMARY` activity present the
  new pass is a no-op and the golden/parity path is byte-identical. The engine-conformance harness now
  schedules the fixture's three summaries (W4000/W5000/W7000), building the `parentId` tree from the
  fixture's dotted `wbs` codes; supported activities rise from 124 to 127 (relationship counts unchanged —
  summaries carry no logic).

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Weighted activity steps (M7 rung 5, ADR-0044 F2 / ADR-0035 §33). An activity gains a **weighted progress
  step checklist** (`activity_steps` child table — `seq` / `name` / `weight` / `percentComplete`) whose
  weight-weighted mean `Σ(w·p)/Σw` becomes the activity's **PHYSICAL** %-complete and **wins** over the
  manual `physicalPercentComplete` when steps are present. Steps feed the ADR-0042 `PHYSICAL` Earned-Value
  measure only — they **never change a CPM date**; with no steps the manual field stands exactly (the
  byte-identical parity path, so the existing EV goldens stay green). The engine (`compute.ts`) and the
  levelling pass (`level.ts`) are untouched; the pure resolver already in `earned-value.ts`
  (`rollupPhysicalPercent`) is unchanged — this change only adds layers around it.

  - **API (`@repo/api`)** — a steps sub-resource following the reference-template layering
    (controller → service → repository, deny-by-default, org-scoped): `GET …/activities/:activityId/steps`
    (list active, seq-ordered) and `PUT …/activities/:activityId/steps` (`{ version, steps: [...] }`
    bulk-replace, Q3) — retained rows updated in place, new ones appended, removed ones soft-deleted, the
    server assigns `seq`, and the parent **activity's** `version` is optimistic-locked (stale ⇒ 409). Reuses
    `activity:update` (a step is activity-write) — no new permission. **N28** (a step `percentComplete`
    outside 0–100 ⇒ 422 `STEP_PERCENT_OUT_OF_RANGE`) and a negative `weight` are DTO-boundary rejects,
    backstopped by DB CHECKs. The EV read (`schedule.service.getEarnedValue` + `loadEarnedValueActivities`)
    loads each activity's active steps into the `PHYSICAL` rollup and reports a plan-level
    **`stepWeightZeroCount`** (N27 — all-zero-weight ⇒ manual fallback, never a divide-by-zero), mirroring
    `costWarningCount`. The soft-delete cascade is wired into `HierarchyLifecycleService` (steps sweep and
    restore with their activity under the same `delete_batch_id`, both directions).
  - **Types (`@repo/types`)** — new `ActivityStep`, `ActivityStepInput`, `ReplaceActivityStepsRequest`;
    `PlanEarnedValue` gains `stepWeightZeroCount`.
  - **Conformance** — the EV adapter reads the fixture's `steps` and attaches them to A4200 / A7100; new
    goldens assert the weighted-mean rollup **A4200 → 35.0005%** (the fixture's own
    `prog_rd_vs_pct_divergence` — steps-physical ≠ its 40% duration-%) and **A7100 → 0%**, a
    steps-present-vs-manual differential (`resultsDiffer`), and the N27 fallback + count. **N28** is
    DTO-tested. The `code_steps` capability tag flips ✅ (33 ✅ / 1 ⚪ — only resource curves remain);
    ADR-0035 gains an **Accepted §33** + N27/N28.
  - **Web (`@repo/web`)** — an `ActivityStepsEditor` (editable name / weight / %-complete rows with
    add/remove/reorder) opened from the activities table row menu behind the new **off-by-default**
    `VITE_ACTIVITY_STEPS` flag, showing the rolled-up physical % and a "steps override the manual %" note,
    wired to the bulk-PUT mutation (TanStack Query).

  Deferred (the last ADR-0044 slice, not in this change): **resource loading curves** (F3), the one
  remaining ⚪ capability row.

### Patch Changes

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`239aa77`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/239aa77b8dd89fafe9ec07b73e1c0db69f224b5b) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - WBS-summary soft-delete now cascades its `parentId` subtree (M5-epic F7.5, ADR-0038 / TECH_DEBT [#36](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/36)).
  Soft-deleting an activity resolves its active WBS subtree breadth-first — a leaf is just itself; a
  `WBS_SUMMARY` sweeps every descendant it heads — and stamps the whole subtree plus every incident
  dependency link with one `deleteBatchId`, so restoring the summary reactivates the branch together and
  a descendant deleted in an earlier batch is not resurrected. The restore guard is hardened
  symmetrically: an activity reactivates only while **both** its plan and (if grouped) its WBS-summary
  parent are active, so a separately-deleted child cannot come back under a still-deleted summary
  (`409 PARENT_DELETED`). Upholds ADR-0038's "no active row under a deleted ancestor" invariant on the
  `parent_id` axis, closing the gap before summaries become planner-creatable (F8). Service-only; a
  plan with no summaries is unaffected (every leaf resolves to itself).
- Updated dependencies [[`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1), [`272eb42`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/272eb420313809d0867ef81753ae4c705f631005), [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1), [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1), [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1), [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1), [`21818b7`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/21818b7af12c16f481d7547d6f9c1d0464a05a2c), [`a763a54`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a763a5488370935dfaa44b6dc68198f2706270a4), [`7b29ccb`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7b29ccb64208a29aed92836dc46bc35cb691a05b), [`7952f5e`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7952f5e1c60119ff7ffb31f34908e401dfc2731e), [`816d0a0`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/816d0a09f262a1076f1a0aa1cd38b9590d2eec9b), [`62d7a97`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/62d7a974d752249fefa31ee7fea7e45e92a3e179), [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1), [`afd4690`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/afd4690ed6832ff43b4e551e530346bbaaaaec68), [`7074b77`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7074b7703ff1b9bf784676a87c5a692a49741bc6), [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1)]:
  - @repo/types@0.13.0

## 0.14.0

### Minor Changes

- [#89](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/89) [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - CPM engine now computes **free float** (M6-F1, ADR-0035 §17–§20): how far each activity can slip without
  delaying the early start of any successor. It is measured on the activity's own working calendar
  (ADR-0037 §4), computed alongside total float, persisted to the new engine-owned `activities.free_float`
  column by the recalc's batched write, and exposed as `freeFloat` (whole working days) on the activity
  schedule response and the `ActivitySummary` shared type. An open end (no successors) carries its total
  float; free float is always ≤ total float. Existing rows read `null` until the plan is recalculated, and
  the golden/parity path is byte-identical.

- [#89](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/89) [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Selectable critical-path definition (M6-F2, ADR-0035 §17–§20). Plans gain two options:
  `criticalPathDefinition` (`TOTAL_FLOAT`, the P6 default, or `LONGEST_PATH`) and `criticalFloatThreshold`
  (whole working days, default 0). Under `LONGEST_PATH` the engine flags the contiguous chain of driving
  ties running back from the latest-finishing activities, so an open-ended, hugely-negative-float activity
  is no longer critical though it is under `TOTAL_FLOAT ≤ 0`. The threshold widens the total-float critical
  band. Both are echoed on the plan response and accepted on plan update; defaults are behaviour-preserving
  (the golden path and existing critical sets are unchanged). Conformance scenario **S07** now runs as a
  criticality-only differential.

- [#89](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/89) [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Make-open-ends-critical option (M6-F4, ADR-0035 §20). A new plan flag `makeOpenEndsCritical` (default
  off) flags every open-ended activity — one with no predecessors or no successors — as critical, OR-ed
  with the active critical definition so it only ever adds open ends, never a mid-chain member. It is
  threaded through recalculation, echoed on the plan response, and accepted on plan update. Default off
  is behaviour-preserving (existing critical sets unchanged). Conformance scenario **S08** now runs as a
  criticality-only differential.

- [#89](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/89) [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Selectable total-float measure (M6-F3, ADR-0035 §18). A new plan option `totalFloatMode`
  (`FINISH` — the P6 default — `START`, or `SMALLEST`) chooses how `totalFloat` is measured: late−early
  finish, late−early start, or the lesser. It is computed on the activity's own working calendar,
  threaded through recalculation, echoed on the plan response, and accepted on plan update; the default
  `FINISH` is behaviour-preserving (existing float is byte-identical).

  Documented semantic: because float is measured on the activity's own calendar for both sides
  (ADR-0037 §4), the three modes coincide for unprogressed activities and diverge only for progressed
  ones — so the conformance fixture's mixed-calendar S13 divergence is deliberately not reproduced (a
  P6 multi-calendar-measurement artefact; see the capability matrix and ADR-0035 §18).

### Patch Changes

- [#89](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/89) [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - ALAP zero-free-float refinement (M6-F5, ADR-0035 §11). An activity flagged As-Late-As-Possible is now
  placed as late as its successors allow, so its **`freeFloat` is 0** — the machine-readable signal of that
  placement — while its pure `earlyStart`/`lateStart`/`totalFloat` stay untouched (display-only, per §11).
  An open end with no successors falls back to its late dates. Completes the M4 ALAP flag with the
  free-float pass, flipping the `con_alap` and `float_zero_free` capability rows to supported.

- [#89](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/89) [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Multiple float-path analysis (M6-F6, ADR-0035 §19). A new pure, read-only engine function
  `computeFloatPaths(activities, edges, options, target, maxPaths)` returns the ranked **contiguous
  driving chains** into a target activity — path 0 the driving chain (relative float 0), later paths
  entered at increasing total float — bounded by `maxPaths` and a per-chain depth guard. Every activity
  belongs to exactly one path (a partition, not a total-float sort). Conformance scenario **S11** now
  runs as a path-shape assertion into the fixture target A12500. Engine-only; the read endpoint is
  deferred (see the plan and `docs/DECISIONS.md`).
- Updated dependencies [[`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a), [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a), [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a), [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a)]:
  - @repo/types@0.12.0

## 0.13.0

### Minor Changes

- [#86](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/86) [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add **Expected Finish** scheduling (M4-F5, ADR-0035 §9). A new per-activity `expectedFinish` target
  date plus a plan-level `useExpectedFinishDates` option: when the option is on, the CPM forward pass
  **recomputes** an in-progress activity's remaining work so its early finish lands on its expected
  finish (the day's working-end boundary), floored at the rescheduled start — a past target collapses the
  remaining to zero. When the option is off, or for a not-started/complete activity, the target is
  ignored and the schedule is byte-identical to the pure-progress path.

  `expectedFinish` is client-settable on the activity create/update DTOs and exposed on the activity
  response + shared `ActivitySummary`; `useExpectedFinishDates` is set via `UpdatePlanDto` and exposed on
  the plan response + shared `Plan` type, threaded through the recalculate contract like the progress
  recalc mode. The recalc log carries an `expectedFinishAppliedCount`. Two additive columns (a nullable
  activity date and a defaulted plan boolean) — no data migration; the golden suite is unchanged. The
  conformance golden (A6200) and the S12 on/off differential land with the F6 conformance slice.

- [#86](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/86) [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Mandatory constraints now **produce-and-flag** instead of being silently parked (M4-F2, ADR-0035 §7).
  `MANDATORY_START`/`MANDATORY_FINISH` still pin their date with the same MSO/MFO arithmetic, but when a
  pin drives an activity earlier than its logic allows the engine now **produces the (impossible)
  schedule as pinned and flags it** — a new engine-owned `constraintViolated` boolean on each activity —
  surfacing the broken relationship as negative float on the predecessor, and never repairing it. A pin
  the network can satisfy is not flagged.

  The schedule summary's dishonest `parkedConstraintCount` is **replaced** by two honest counts:
  `constraintViolationCount` (mandatory pins that broke logic) and `constraintWarningCount` (the N15 case
  — a Start-No-Earlier-Than dated before the data date, honoured but unable to pull work back). The
  recalc response, read summary, and structured recalc log all carry the new counts; the summary strip
  shows "Constraint conflicts" / "Constraint warnings" figures with accessible explanations in place of
  the old "Parked constraints" figure. Plans with no mandatory constraints are byte-identical (the
  golden suite is unchanged) and report both counts as zero.

- [#86](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/86) [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Activities can now be flagged **Schedule As-Late-As-Possible** (M4-F4, ADR-0035 §11). The new
  `scheduleAsLateAsPossible` boolean is a **display-only** placement preference: a flagged activity is
  rendered at its late-based position (its already-computed late dates), while the pure
  `early*`/`late*`/`totalFloat` schedule stays a pure function of the network — it is never a date
  constraint. The zero-**free**-float refinement (place only as late as successors allow) lands in M6;
  until then the late-based position is the render target.

  The flag is client-settable via the create/update DTOs, exposed read-only on the activity response and
  the shared `ActivitySummary`, threaded into the engine seam, and read on the recalc load. Additive,
  defaulted column — no data migration; the golden suite is unchanged (a new A9400-style golden pins the
  non-interference contract). The on-canvas editor for the flag is a later slice.

- [#86](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/86) [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Activities can now carry a **secondary schedule constraint** (M4-F3, ADR-0035 §10). The primary
  constraint drives the forward pass (early dates) as before; the new
  `secondaryConstraintType`/`secondaryConstraintDate` pair drives the backward pass (late dates) — the
  canonical pairing is a forward primary + a backward secondary (e.g. an SNET that moves the early start
  plus an FNLT that tightens the late finish). A secondary of a forward-only kind (SNET/FNET) is a
  documented no-op on the backward clamp, and an activity with no secondary is scheduled byte-identically
  (the golden suite is unchanged).

  The pair is client-settable via the create/update DTOs with the same both-or-neither pairing rule as
  the primary (mirrored by a DB CHECK constraint), exposed read-only on the activity response and the
  shared `ActivitySummary`, and read on the recalc load. Additive, nullable columns — no data migration.

- [#84](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/84) [`3111809`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/3111809cb46eb8c51848493ff6837dad6f717fbd) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Plan-level progress recalc mode (M2, ADR-0035 §1). Plans now carry a
  `progressRecalcMode` — `RETAINED_LOGIC` (default), `PROGRESS_OVERRIDE`, or
  `ACTUAL_DATES` — exposed on the plan response and settable via `PATCH` (like
  `schedulingMode`), and threaded into the CPM recalculation. It governs how an
  in-progress activity's remaining work treats predecessor logic when progress is
  out of sequence. Behaviour-preserving by default; an unprogressed plan is
  unaffected.

- [#84](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/84) [`3111809`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/3111809cb46eb8c51848493ff6837dad6f717fbd) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Progress write boundary hardening (M2, ADR-0035 §6). The progress endpoint now
  accepts `remainingDurationDays` (converted to stored minutes; null derives it
  from percent complete) and validates actuals against the plan's data date:

  - **N07** — an actual start/finish after the data date is rejected
    (`ACTUAL_AFTER_DATA_DATE`).
  - **N08** — a complete activity with no actual finish has its finish repaired to
    the data date (logged warning).
  - **N18** — remaining > 0 on a complete activity is repaired to 0 (logged warning).

  N06 (finish before/without start) is unchanged. Actuals never move.

- [#84](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/84) [`3111809`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/3111809cb46eb8c51848493ff6837dad6f717fbd) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Progress ingestion web controls (M2, ADR-0035), behind `VITE_PROGRESS_INGESTION`
  (off by default). When enabled:

  - The progress editor gains a **remaining duration** input (blank derives it from
    percent complete) plus **suspend / resume** dates for a paused activity — with
    client-side validation mirroring the API (resume ≥ suspend).
  - Plan settings gain a **recalc mode** picker — Retained Logic / Progress Override
    / Actual Dates — persisted with a targeted PATCH and applied on the next
    recalculation.

  The activity read model now exposes `remainingDurationDays`, `suspendDate`, and
  `resumeDate` (`@repo/types` + the activity response DTO), so the editor seeds and
  round-trips a stored value even with the inputs hidden. The engine, the settable
  API fields, and the plan recalc-mode column were already live; this slice only
  adds the flag-gated authoring UI.

- [#85](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/85) [`399afc8`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/399afc8893dd2f50441a0a922edf3571961beab8) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Surface progress-repair warnings and clarify the progress editor (M2 follow-up,
  ADR-0035 §6).

  - The progress endpoint (`PATCH …/activities/:id/progress`) now returns
    `meta.warnings` (a `ProgressWarning[]`) when it repairs a complete activity —
    `COMPLETE_WITHOUT_FINISH` (finish set to the data date) or
    `REMAINING_ON_COMPLETE` (remaining forced to zero). The write still succeeds and
    `data` reflects the corrected value; an ordinary report omits `meta`. Adds a
    reusable single-resource `ResourceEnvelope` for `{ data, meta }` responses.
  - The web progress editor announces those repairs on save, and a note makes clear
    the remaining/suspend/resume fields reschedule the remaining work rather than
    change the derived status.

- [#82](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/82) [`f382196`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f382196bc0d38fceec1938e8a30f5504389708ec) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Per-activity working-time calendars (M5, ADR-0037). Each activity can now carry its own
  `calendarId` (create/update/response API + shared `ActivitySummary`) — `null` inherits the plan
  default. The CPM engine moved to an **absolute working-instant** axis so each activity's duration,
  float, and dates are measured on **its own** calendar: a 24/7 commissioning activity inside a 5-day
  plan works across weekends, and a relationship's `PREDECESSOR`/`SUCCESSOR` lag now resolves to the
  endpoint activity's calendar (completing M3's forward-wiring). A plan where every activity inherits
  the plan calendar recalculates **byte-identically** (the golden suite is the parity gate). The
  activity calendar is validated in-org under the calendar advisory lock (like the plan picker), and
  the recalculation resolves each distinct calendar once (O(distinct calendars), not O(activities)).

### Patch Changes

- [#86](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/86) [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Conformance harness M4 flip (M4-F6). The differential adapter now **feeds** the fixture's advanced
  constraints instead of dropping them: the secondary constraint (§10), expected finish (§9) and
  as-late-as-possible (mapped to the placement flag, §11) are carried, and the mandatory pins pass
  through as produce-and-flag constraints (§7). Scenario **S12 (Expected Finish)** is now a runnable
  differential — it runs the S02 progressed network with the option on, so `resultsDiffer(S12, S02)`
  proves the fixture's A6200 lands on its expected finish. New negative-case assertions cover **N10**
  (an impossible mandatory pair is produced and flagged, never repaired) and **N15** (a constraint
  before the project start warns without pulling work back). The capability matrix flips the five M4
  rows (mandatory / expected-finish / secondary ✅, ALAP 🟡 with the M6 free-float note, zero-duration
  task ✅) plus S12, N01/N03, N10 and N15.

  Also refines Expected Finish (§9) to apply to **any incomplete activity** — an in-progress one's
  remaining and a not-started one's full duration — matching the ADR's A6200 (not-started) example; the
  backward pass uses the resized span so late dates stay consistent. Byte-parity of the golden suite is
  preserved (a new first-principles A6200 golden pins the resize).

- [#86](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/86) [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Engine: distinguish a zero-duration `TASK` from a milestone by **type**
  (`isMilestone`), not `duration === 0` (M4-F1, ADR-0035 §22). A zero-duration task
  keeps a real start + finish and is scheduled as a task; the project-finish
  tie-break's milestone privilege now keys off the milestone type. The change is
  date-neutral in the current model (the golden suite stays byte-identical) and
  expresses §22's intent in code.
- Updated dependencies [[`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb), [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb), [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb), [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb), [`3111809`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/3111809cb46eb8c51848493ff6837dad6f717fbd), [`3111809`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/3111809cb46eb8c51848493ff6837dad6f717fbd), [`399afc8`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/399afc8893dd2f50441a0a922edf3571961beab8), [`f382196`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f382196bc0d38fceec1938e8a30f5504389708ec)]:
  - @repo/types@0.11.0

## 0.12.0

### Minor Changes

- [#80](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/80) [`1cdc8b1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1cdc8b1d5ef80ddf6caa94fe90fff6b4c307893e) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Per-relationship lag calendars (M3, ADR-0036 §6). Dependencies gain a `lagCalendar`
  field (`PREDECESSOR` / `SUCCESSOR` / `TWENTY_FOUR_HOUR` / `PROJECT_DEFAULT`, default
  `PROJECT_DEFAULT`) exposed on the create/update/response API, with a lag-calendar selector
  on the dependency editor (and a lag-calendar label in the Logic panel's link lists). The CPM
  engine now measures each edge's lag on that calendar: `TWENTY_FOUR_HOUR` schedules the lag as
  **elapsed** time (e.g. concrete cure's `168h` = 7 elapsed days, not 7 working days), while the
  other three coincide with the plan calendar today (Predecessor/Successor become distinct once
  per-activity calendars land in M5). The default path is unchanged — a plan with no 24-Hour
  lag recalculates byte-identically.

### Patch Changes

- Updated dependencies [[`1cdc8b1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1cdc8b1d5ef80ddf6caa94fe90fff6b4c307893e)]:
  - @repo/types@0.10.0

## 0.11.0

### Minor Changes

- [#65](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/65) [`5e4e1a8`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5e4e1a88b56e6e561102d80129a711ecdcaeec8c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat: scheduling modes — mandatory project start + Visual planning (ADR-0033)

  Delivers ADR-0033's scheduling model. The **mandatory project start (M1)** is a live product
  change; the **Visual-planning surface (M2–M4)** ships behind the default-off `VITE_SCHEDULING_MODES`
  flag until enablement.

  **M1 — Mandatory project start (live):**

  - A plan can no longer exist without a start date. A backfill+NOT-NULL migration sets
    `plans.planned_start` for existing plans (CQ-6 chain: earliest active constraint date → actual
    start → creation day) and makes the column NOT NULL. `CreatePlanDto.plannedStart` is required (422
    without); `UpdatePlanDto` rejects an explicit `null` (the data date can be moved, never cleared).
    The web plan form requires it, and the ADR-0032 "first draw anchors to today" hack is gone.

  **M2–M4 — Visual planning (behind `VITE_SCHEDULING_MODES`):**

  - A plan-level `schedulingMode` (**Early** = computed-earliest CPM, **Visual** = hand-placed) with a
    toolbar mode selector, and a Planner-owned `Activity.visualStart` placement input fed through the
    engine's second, forward-only effective-Visual pass (placements pin the bar and push unplaced
    successors; the pure-network pass still owns early/late/float).
  - A Visual-mode canvas drag hand-places `visualStart` (no implicit SNET constraint); Early mode keeps
    the SNET path. Engine-owned conflict flags surface as an on-canvas warning triangle (shape, not
    colour-only) with a spoken read-out — placements are flagged, never auto-moved.
  - Navigation/data split: a "Go to date" view jump distinct from the persisted "Project start" anchor.
  - A read-only **Late-start overlay** renders bars from the late dates for float analysis (editing
    suppressed while on).

  Flag-off, the TSLD renders exactly as before.

### Patch Changes

- [#64](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/64) [`c073c75`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/c073c750d7c329286bd3106cb3f5e6dc3501ceb0) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat: scheduling-modes M0 dark foundations (ADR-0033)

  Additive, behind-the-flag foundations for the scheduling-modes feature — **no user-visible change**
  (nothing sets `visual_start` yet and no UI reads the flag; existing plans recalc identically):

  - **Schema (additive, reversible):** a `SchedulingMode` enum + `Plan.schedulingMode` (default `EARLY`),
    the Planner-owned `Activity.visualStart` placement input, and four engine-owned outputs
    (`visualEffectiveStart/Finish`, `visualConflict`, `visualDriftDays`) modelled like the CPM columns.
  - **Engine:** a second, forward-only _effective-Visual_ CPM pass — honours each `visualStart` exactly,
    pushes successors from the feasible finish, and emits the conflict/drift outputs. The pure
    forward/backward pass is untouched, so `early*`/`late*`/float stay a pure function of the network
    (proven by a golden-parity test).
  - **Recalc wiring:** `visual_start` feeds the engine and the four outputs are persisted by the same
    batched `unnest` UPDATE — still out of the optimistic-lock `version`/`updated_at` path.
  - **Flag:** `SCHEDULING_MODES_ENABLED` (`VITE_SCHEDULING_MODES`, default-off), gated on the canvas host.

  The mandatory-`plannedStart` migration and the UI (mode selector, Visual drag, Late overlay, Go-to-date)
  land in later milestones.

- Updated dependencies [[`5e4e1a8`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5e4e1a88b56e6e561102d80129a711ecdcaeec8c)]:
  - @repo/types@0.9.0

## 0.10.1

### Patch Changes

- Updated dependencies [[`32e843f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/32e843f4136460aa403c26ef45ac4496c82d1f6b)]:
  - @repo/types@0.8.0

## 0.10.0

### Minor Changes

- [#35](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/35) [`76b9041`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/76b9041c995eab9ee711082baf74dbd06cdb6263) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the server core of the single-editor **plan edit-lock** (ADR-0028) — the last precondition to
  enabling the built TSLD editing surface. A new `PlanLock` lease (heartbeat + TTL with explicit
  release; presence = held, absence = free) backs an `edit-lock` sub-resource under a plan:
  GET status, POST acquire (with `takeover`), POST heartbeat, POST request, POST handoff, and DELETE
  release. Lock-precondition failures return a new **423 Locked** (`code: "LOCKED"`), distinct from the
  409 optimistic conflict, with a machine-readable `reason`
  (`PLAN_EDIT_LOCK_REQUIRED | PLAN_EDIT_LOCK_HELD | PLAN_EDIT_LOCK_LOST`). The holder grain is the
  **user** (re-entrant across tabs), and any Planner can **request control** of a live lock and take
  over after a grace window — or immediately if the holder has gone inactive — while an Org Admin can
  override immediately; acquire/request/hand-off/take-over serialise under the existing plan advisory
  lock. New permissions `plan:acquire_lock` / `plan:request_control` (Planner + Org Admin) and
  `plan:override_lock` (Org Admin). `@repo/types` gains the `PlanEditLockStatus` / `PlanEditLockActor`
  contracts and the `PLAN_EDIT_LOCK_*` reason union. No UI yet and no endpoint is pen-gated in this
  slice — inert until the front end and the write-gate land; `main` stays releasable.

- [#35](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/35) [`76b9041`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/76b9041c995eab9ee711082baf74dbd06cdb6263) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the plan edit-lock **write-gate** (ADR-0028, M1 completion). Structural plan
  writes — activity create/update/delete/restore, the positions batch, dependency
  create/update/delete, and schedule recalculate — now assert the caller holds the
  plan edit-lock and return **423 `PLAN_EDIT_LOCK_REQUIRED`** otherwise (for graph
  writes and recalculate the check runs inside the plan advisory-lock transaction).
  The Contributor progress path, all reads, and plan-metadata edits stay ungated,
  and a holder sending a stale row `version` still gets the existing 409 — the two
  are distinct.

  The gate ships **behind a staged-rollout flag `PLAN_EDIT_LOCK_ENFORCED` (default
  off)**: enforcing it unconditionally would 423 the already-shipped, flag-on
  activities-table / dependency-editor / recalculate flows, which don't acquire a
  lock yet. So the whole mechanism lands inert; enforcement is enabled only once the
  front end acquires the pen across every editing entry point (edit-lock M2/M3).
  `main` stays releasable with no user-visible change.

### Patch Changes

- [#37](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/37) [`ce59178`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/ce591786a5e3db36db2b5e061eb2fb4941e05a6c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Harden the (flag-gated) TSLD on-canvas editing surface toward enablement — no
  user-visible change, both editing flags remain off by default.

  - **fix(web):** the coalesced keyboard-nudge now flushes a delta queued _behind_ an
    in-flight write on unmount (previously a `!busyRef` guard could silently drop it).
  - **perf(api):** the edit-lock heartbeat resolves the caller's own holder profile
    from the session instead of a `users` query — the common beat issues zero extra
    DB reads.
  - **test:** a flag-on Playwright harness (`test:e2e:edit`, wired into CI) that serves
    the app with the editing flags on and the API enforcing the lock, with pen-gating,
    single-actor pen-lifecycle, and keyboard-edit journeys (the latter automating the
    `Alt+←/→` history-suppression check on Chromium); plus a route-level `plan-detail`
    gating/reposition-seam test. Operators: see
    `docs/runbooks/tsld-editing-enablement.md` for the enablement procedure.

- Updated dependencies [[`76b9041`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/76b9041c995eab9ee711082baf74dbd06cdb6263)]:
  - @repo/types@0.7.0

## 0.9.0

### Minor Changes

- [#31](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/31) [`fd8de38`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/fd8de385fe7f84c11359871345470e07f8bbc3f7) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add a batch **lane-position** endpoint for the Time-Scaled Logic Diagram (M8 M4, ADR-0026):
  `PATCH /organizations/:orgSlug/plans/:planId/activities/positions`. It moves one or more of a
  plan's activities to new lanes (`laneIndex`) in a single **all-or-nothing** transaction —
  backing on-canvas lane drag and the upcoming auto-arrange. Every id must be an active activity
  in the plan+org (anti-IDOR) and still match its optimistic-lock `version`, or the whole batch
  is rejected (409) and nothing moves. Requires `activity:update` (Planner/Org Admin). It is
  layout only: no dates change and no CPM recalculation runs (x = time is engine-owned; y = lane
  is stored). A `DUPLICATE_POSITION_ID` (422) guards a batch that names the same activity twice.

## 0.8.0

### Minor Changes

- [#29](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/29) [`5c3fbf4`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5c3fbf47d3e900c3e73f9724713e8e677bcbc7c9) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add **live driving arrows** to the Time-Scaled Logic Diagram (M8 M3, ADR-0026).

  The CPM engine now computes, on every recalculate, whether each dependency is **driving** — the
  binding logic tie that sets its successor's early start (CPM/GPM "driver") — and persists it as the
  engine-owned `dependencies.is_driving` (ADR-0022 batched write; never touches `version`/`updated_at`,
  so a recalc stays invisible to optimistic locking). It's exposed as `DependencySummary.isDriving` on
  the dependency API. The flag is derived purely from the forward-pass timing, so computed dates are
  unchanged and the golden CPM suite still holds; an edge with slack, or one whose successor is clamped
  by a constraint above every incoming bound, is non-driving.

  On the TSLD canvas, driving links are now drawn **emphasised** — a heavier solid line — versus a thin
  dashed line for non-driving links, so "which relationships are actually driving the schedule" reads at
  a glance. The weight-plus-dash encoding never relies on colour (WCAG 1.4.1), matching the bar
  criticality cue, and the diagram legend gains **Driving link** / **Non-driving link** entries.

## 0.7.0

### Minor Changes

- [#24](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/24) [`300f386`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/300f38685578f1bc432c9b48051f58bc10c22883) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the baseline schema and permissions (M7, ADR-0025). New `baselines` and
  `baseline_activities` tables: a baseline is a named, frozen snapshot of a plan's
  schedule (the plan of record), and each `baseline_activities` row is a **self-contained
  copy** of an activity's identity and captured CPM dates — `source_activity_id` is a
  plain correlation UUID with **no foreign key**, so a baseline survives the source
  activities' 90-day hard purge and stays faithful even if a live activity is edited or
  deleted. A partial unique `uq_baselines_plan_active` guarantees **at most one active
  baseline per plan** in the database (not just in code); `uq_baselines_plan_name` keeps
  names unique per plan among live rows; both tables carry soft delete + batch restore and
  the documented scoped indexes (the `(baseline_id, source_activity_id)` index is the
  variance join key). Adds the `baseline:read` / `baseline:create` / `baseline:activate` /
  `baseline:delete` permissions (read for every member; write for Planner + Org Admin) and
  the shared `@repo/types` `BaselineSummary` / `BaselineDetail` / `BaselineActivitySnapshot`
  / `BaselineVarianceRow` / `PlanVarianceSummary` contracts. Schema and permissions only —
  the baselines module, variance read model, and web surface land next.

- [#24](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/24) [`300f386`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/300f38685578f1bc432c9b48051f58bc10c22883) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add baseline activate + delete with cascade (M7 Task B2, ADR-0025).
  `POST …/baselines/:id/activate` (200) makes a baseline the plan's active comparison
  baseline: under the plan write-lock it clears the current active row **before** setting
  the target, so the one-active-per-plan partial unique is never momentarily violated;
  it is idempotent and 404s if the baseline was deleted meanwhile. `DELETE …/baselines/:id`
  (204) soft-cascades the baseline and its snapshot rows under one `delete_batch_id`;
  deleting the active baseline simply leaves the plan with none active. Deny-by-default:
  `baseline:activate` / `baseline:delete` (Planner + Org Admin). The
  `HierarchyLifecycleService` now sweeps a plan's baselines (and their snapshot rows) into
  the batch when a plan/project/client is deleted, and restores them with the plan — so a
  baseline never dangles under a soft-deleted plan and comes back on restore with its active
  flag intact.

- [#24](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/24) [`300f386`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/300f38685578f1bc432c9b48051f58bc10c22883) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the baselines capture/list/get API (M7 Task B1, ADR-0025). A new plan-scoped
  `baselines` module (controller → `BaselinesService` → `BaselineRepository`) exposes
  `POST` (capture), `GET` (list, cursor-paginated newest-first) and `GET /:id` (with the
  frozen activity snapshots) under `/api/v1/organizations/:orgSlug/plans/:planId/baselines`.
  Capturing freezes the plan's currently-persisted computed activities as a self-contained
  snapshot **under the plan write-lock** (the same advisory lock as recalculation, ADR-0022),
  so a snapshot is never taken mid-recalculation; the batched `createMany` writes up to a
  plan's worth of snapshot rows in one statement. The plan's **first** baseline is captured
  active; later captures are inactive. Deny-by-default: reads need `baseline:read` (every
  member), capture needs `baseline:create` (Planner + Org Admin); every route re-resolves the
  org scope from the caller's memberships and the plan within it (anti-IDOR). Capturing an
  empty or never-calculated plan is a `422 SCHEDULE_NOT_CALCULATED`; a duplicate name is a
  `409 DUPLICATE_BASELINE`. Activate/delete and the variance read model land next.

- [#24](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/24) [`300f386`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/300f38685578f1bc432c9b48051f58bc10c22883) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the baseline variance read model (M7 Task C1, ADR-0025).
  `GET …/baselines/variance` joins the plan's live activities against the active baseline's
  snapshot on `source_activity_id` and returns per-activity **start/finish/float variance in
  working days** on the plan's calendar (reusing the engine's `workingDaysBetween` /
  `buildWorkingDayCalendar`, ADR-0024), signed so **positive = current later than baseline
  (behind)**, plus a `meta` roll-up (`PlanVarianceSummary`: active baseline id/name,
  `capturedAt`, worst finish slip, and counts behind / added / removed). An activity added
  after capture is `inBaseline: false`; a baselined activity no longer live is a `removed`
  row; a plan with no active baseline returns an empty list with `meta.baselineId = null`.
  The diff is a pure, exhaustively-unit-tested `computeVariance` helper. The read is bounded
  and plan-scoped (no cursor pagination — one build of the calendar, an O(n) join), so it
  stays within the M6/M7 performance budget; a CI smoke exercises it at 500 activities. The
  shared `Paginated` envelope now carries a typed `meta` so a bounded list can return the
  variance roll-up.

### Patch Changes

- Updated dependencies [[`300f386`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/300f38685578f1bc432c9b48051f58bc10c22883)]:
  - @repo/types@0.6.0

## 0.6.0

### Minor Changes

- [#22](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/22) [`5756fa0`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5756fa0932f7b45ba71a3ae30ee20ef996404a14) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the pure `buildWorkingDayCalendar` factory to the CPM engine (M5, ADR-0024):
  a real working-day calendar from a weekday bitmask + dated exceptions (holidays
  and worked-weekends), implemented behind the existing `WorkingDayCalendar` port
  with O(1) week arithmetic + O(log H) binary search over sorted exceptions — no
  day-by-day scan, so recalculation stays within the M6 performance budget. Correct
  by construction: pinned to a naive day-by-day reference by a differential test and
  to the inverse invariant `workingDaysBetween(from, addWorkingDays(from, n)) === n`.
  Still an internal library — nothing consumes it yet; the calendar CRUD module and
  engine wiring land next.

- [#22](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/22) [`5756fa0`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5756fa0932f7b45ba71a3ae30ee20ef996404a14) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the working-day calendar schema and permissions (M5, ADR-0024). New `calendars`
  and `calendar_exceptions` tables: an org-scoped calendar is a 7-bit `working_weekdays`
  mask (Monday…Sunday) plus dated exceptions (holidays / worked weekends), with a
  `working_weekdays > 0 AND <= 127` CHECK, partial-unique names/exception-dates among
  live rows, soft delete + batch restore, and the documented indexes (the active
  `(calendar_id, date)` unique doubles as the engine's exception load). Adds the
  `calendar:read` / `calendar:create` / `calendar:update` / `calendar:delete` permissions
  (read for every member; write for Planner + Org Admin) and the shared `@repo/types`
  `Calendar`/`CalendarException` shapes plus a pure `WorkingWeekdays` bitmask helper (the
  single source of truth the API DTO validates against and the web toggle group binds to).
  Schema and permissions only — the CRUD module and engine wiring land next.

- [#22](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/22) [`5756fa0`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5756fa0932f7b45ba71a3ae30ee20ef996404a14) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the working-day calendar library CRUD API (M5, ADR-0024). A new org-scoped
  `calendars` module (controller → `CalendarsService` → `CalendarRepository`) exposes
  list / create / get / update / delete calendars plus an exception editor
  (add / remove dated holidays and worked-weekends), all under
  `/api/v1/organizations/:orgSlug/calendars`. Deny-by-default: reads need
  `calendar:read` (every member), writes need `calendar:create|update|delete`
  (Planner + Org Admin); every route re-resolves the org scope from the caller's
  memberships (anti-IDOR). The weekday mask is validated 1–127 (422), calendar names
  are unique per org and exception dates unique per calendar (409
  `DUPLICATE_CALENDAR` / `DUPLICATE_EXCEPTION`), updates use optimistic locking, and
  delete is a self-contained soft-cascade over the calendar and its exceptions
  (adding/removing an exception bumps the calendar's version). The delete-in-use
  guard and plan assignment land next (Task C1); nothing consumes a calendar for
  scheduling yet.

- [#22](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/22) [`5756fa0`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5756fa0932f7b45ba71a3ae30ee20ef996404a14) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Wire calendars into plans (M5 Task C1, ADR-0024). Plans gain a nullable
  `calendar_id` (FK to calendars, RESTRICT, partial-indexed); a null calendar means
  all-days-work (M6 back-compat). Each organisation is seeded a **Standard (Mon–Fri)**
  calendar — on org create and backfilled for existing orgs by the migration — and new
  plans default to it. A Planner can assign a plan's calendar via `PATCH plans/:id`
  (`calendarId`, validated to be an active calendar in the same organisation — a
  foreign/unknown id is a 404, indistinguishable from missing; null clears it), and a
  calendar referenced by an active plan can no longer be deleted (409 `CALENDAR_IN_USE`).
  Calendar assignment and the delete-in-use guard serialise on a calendar-scoped advisory
  lock, so a plan can never be assigned a calendar that is being deleted. `Plan.calendarId` is added to `@repo/types` and the plan
  response. Recalculation still ignores the calendar until Task C2 wires it into the
  engine.

- [#22](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/22) [`5756fa0`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5756fa0932f7b45ba71a3ae30ee20ef996404a14) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Wire the working-day calendar into CPM recalculation (M5 Task C2, ADR-0024) — the
  engine now computes **true working-day dates**. `ScheduleService.recalculate` loads
  the plan's calendar (`working_weekdays` + active exceptions) as part of the locked
  recalc snapshot, builds a `WorkingDayCalendar` once via `buildWorkingDayCalendar`, and
  injects it at the existing `ComputeOptions.calendar` port seam — **the pure engine's
  pass code is unchanged**. A plan with no calendar (or a defensively-missing one) uses
  `allDaysWorkCalendar`, so the null path is byte-identical to M6 and the golden suite
  still holds. Early/late start & finish now skip the calendar's non-working weekdays and
  holiday dates, and the project finish absorbs them. The calendar used is recorded in the
  recalc audit log. The calendar maths is O(1) week arithmetic + O(log H) per call (built
  once per recalc), so recalculation stays within the M6 performance budget; a perf smoke
  at 500 activities now also runs on a real Mon–Fri calendar.

### Patch Changes

- Updated dependencies [[`5756fa0`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5756fa0932f7b45ba71a3ae30ee20ef996404a14), [`5756fa0`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5756fa0932f7b45ba71a3ae30ee20ef996404a14)]:
  - @repo/types@0.5.0

## 0.5.0

### Minor Changes

- [#20](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/20) [`9f614f2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9f614f22d9e233fb4783c4c81bc01bb9cc5b398c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Teach the CPM engine the six moderate schedule constraints. The forward pass
  clamps early dates (`SNET`, `FNET`, `MSO`, `MFO`) and the backward pass clamps
  late dates (`SNLT`, `FNLT`, `MSO`, `MFO`), converting each `constraintDate` to a
  working-day offset via the calendar port (ADR-0023). `MANDATORY_START` /
  `MANDATORY_FINISH` are parked as their moderate equivalents (`MSO` / `MFO`) and
  counted in the schedule summary's `parkedConstraintCount`. A constraint that the
  logic cannot satisfy surfaces as negative total float (and criticality), never
  an error.

- [#20](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/20) [`9f614f2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9f614f22d9e233fb4783c4c81bc01bb9cc5b398c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the CPM engine's forward/backward pass to the pure scheduling library:
  early/late start & finish, total float, and critical / near-critical flags,
  computed in continuous working-day offsets and mapped to inclusive calendar
  dates via the `WorkingDayCalendar` port (ADR-0023). Honours all four
  relationship types (FS/SS/FF/SF) with signed lag and zero-duration milestones,
  proven against a golden suite of hand-worked networks. Still an internal library
  (unwired) — the recalculate endpoint that persists these values lands next.

- [#20](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/20) [`9f614f2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9f614f22d9e233fb4783c4c81bc01bb9cc5b398c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Expose the CPM recalculation over HTTP: `POST
/organizations/:orgSlug/plans/:planId/schedule/recalculate` (permission
  `schedule:calculate`, Planner + Org Admin). It runs the engine, persists the
  computed columns, and returns the plan schedule summary (`200`); a plan with no
  start date returns `422 PLAN_START_REQUIRED`, and the unreachable DAG-invariant
  breach is logged distinctly and surfaces as an opaque `500`. Covered by an API
  e2e matrix (multi-path critical set, version/updated_by untouched, RBAC 403,
  IDOR/cross-org 404, 422 no-start) and a 500-activity performance smoke.

- [#20](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/20) [`9f614f2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9f614f22d9e233fb4783c4c81bc01bb9cc5b398c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Wire the CPM engine to persistence (ADR-0022). Add the `schedule` module with a
  `ScheduleService.recalculate` that — under the plan-scoped advisory lock shared
  with the dependency cycle check (ADR-0021) — loads a plan's active activities and
  edges, runs the pure engine, and writes the seven engine-owned columns via a
  single batched raw `UPDATE … FROM unnest(...)` that never touches `version` or
  `updated_at`. Introduce the `schedule:read` (every member) and `schedule:calculate`
  (Planner + Org Admin) permissions. The recalculation is not yet exposed over HTTP —
  the endpoint lands next.

- [#20](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/20) [`9f614f2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9f614f22d9e233fb4783c4c81bc01bb9cc5b398c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the read-side schedule summary: `GET
/organizations/:orgSlug/plans/:planId/schedule/summary` (permission
  `schedule:read`, every member) returns a plan's computed schedule roll-up from a
  single aggregate over the persisted engine columns — no recompute. It returns the
  identical `PlanScheduleSummary` shape as recalculate (data date, project finish,
  activity/critical/near-critical/parked counts), now a shared type in `@repo/types`.
  Null-safe for a never-calculated plan (null finish) and a plan with no start date
  (null data date).

### Patch Changes

- Updated dependencies [[`9f614f2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9f614f22d9e233fb4783c4c81bc01bb9cc5b398c)]:
  - @repo/types@0.4.0

## 0.4.0

### Minor Changes

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the Activity CRUD API — the leaf of the Client → Project → Plan → Activity
  hierarchy and the atomic unit of a schedule. Activities are created and listed
  under a parent plan (`POST`/`GET /organizations/:orgSlug/plans/:planId/activities`,
  cursor-paginated), and read/updated/soft-deleted/restored by id
  (`/organizations/:orgSlug/activities/:activityId` + `/restore`). Following the
  `plans` module: definition writes (name, code, description, type, duration,
  constraint, lane) are Planner + Org Admin only, org-scoped (anti-IDOR), with
  per-plan name and code uniqueness, optimistic locking, and soft-delete/restore
  via the shared four-level lifecycle (top-down `PARENT_DELETED` invariant). A
  milestone's duration is always coerced to 0, and a schedule constraint's type
  and date must be set (or cleared) together. Progress fields (status / % / actual
  dates) and the engine-owned CPM output columns are deliberately not writable
  here — progress gets its own Contributor-capable endpoint next.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the activity authorisation and lifecycle foundation. New permission codes
  `activity:read|create|update|delete|restore` follow the same Planner+Org-Admin
  "write" rule as the rest of the hierarchy, plus a separate
  `activity:update_progress` granted to Contributor upward — the first capability
  that distinguishes a Contributor from a Viewer, letting them report progress
  (status / % complete / actual dates) without being able to change logic. The
  shared `HierarchyLifecycleService` is extended from three levels to four:
  deleting a plan (or project, or client) now cascades to its activities in the
  same `delete_batch_id`, restoring the parent brings them back, and an activity
  can be soft-deleted/restored on its own (restore requires its parent plan to be
  active — `PARENT_DELETED` otherwise). Adds the `ActivitySummary`/`ActivityType`/
  `ActivityStatus`/`ConstraintType` cross-boundary contracts to `@repo/types`. The
  existing 3-level cascade is covered by regression tests.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the activity progress endpoint — `PATCH /organizations/:orgSlug/activities/:activityId/progress`.
  This is the Contributor-capable path: it requires only `activity:update_progress`
  (granted to Contributor upward), so a Contributor can record progress without the
  Planner-only `activity:update` that changes logic or definition — the first
  capability that distinguishes a Contributor from a Viewer. It moves
  `percentComplete` and the actual start/finish dates only; `status` is derived
  server-side (finish/100% → COMPLETE, start/any % → IN_PROGRESS, else NOT_STARTED)
  so it can never contradict the numbers, and an actual finish must have a start and
  cannot precede it (422). Definition endpoints continue to reject progress fields
  and vice-versa.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the `Activity` domain table — the leaf of the Client → Project → Plan →
  Activity hierarchy and the atomic unit of a schedule — plus the `ActivityType`,
  `ActivityStatus` and `ConstraintType` enums and their migration. Each activity is
  plan-scoped with a denormalised `organization_id` (copied from the parent plan),
  soft-delete + `delete_batch_id`, audit columns (TEXT `created_by`/`updated_by`),
  and an optimistic-locking `version`; name — and optional `code` — are unique per
  plan among live rows via partial-unique indexes. The full field set is persisted
  now (definition: type/duration/constraint/lane; progress: status/percent/actuals;
  engine-owned CPM outputs: early/late dates, total float, critical flags; and a
  reserved `calendar_id`) so the deferred dependencies/calendars/CPM/canvas slices
  are additive. Schema + migration only — no module or endpoint behaviour yet.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the Dependency CRUD API — the edges of a plan's schedule network. Dependencies
  are created and listed under a plan
  (`POST`/`GET /organizations/:orgSlug/plans/:planId/dependencies`, cursor-paginated),
  browsed by direction from an activity
  (`GET …/activities/:activityId/predecessors` and `…/successors`), and
  read/updated/soft-deleted by id (`/organizations/:orgSlug/dependencies/:dependencyId`).
  Following the activities module: writes are Planner + Org Admin only, org-scoped
  (anti-IDOR), with both endpoints loaded active and asserted to be in the same plan
  (no cross-plan links), the organisation/plan ids copied from the parent, per-plan
  `(predecessor, successor, type)` uniqueness (`409 DUPLICATE_DEPENDENCY`), a
  self-loop guard (`422 SELF_DEPENDENCY`), optimistic locking (type/lag only — the
  endpoints are immutable), and soft-delete via the shared lifecycle. Responses embed
  the endpoint activity summaries (no N+1). Cycle detection — the DAG guarantee of
  ADR-0021 — lands next.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Guarantee the plan's dependency graph stays acyclic (ADR-0021). Creating a
  dependency now runs its load-check-insert inside one transaction under a
  plan-scoped advisory lock: it loads the plan's active edges, walks forward from
  the proposed successor, and rejects the link with `409 CYCLE_DETECTED` if the
  predecessor is already reachable (which would close a cycle). The lock serialises
  concurrent creates within a plan, so the mirror-insert race (`A→B` ‖ `B→A`)
  resolves to exactly one success and one conflict — a cycle can never be persisted.
  Different plans never contend. A pure `wouldCreateCycle` detector (O(V+E)) is
  unit-tested for self/2-node/longer cycles and large graphs; an e2e race test
  asserts the concurrency guarantee.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Extend the shared HierarchyLifecycleService so soft-delete/restore includes
  activity dependencies (links). Deleting an activity now also soft-deletes its
  incident links (either direction) in the same batch; deleting a plan/project/
  client sweeps every link contained in the affected plans; a dependency can also
  be soft-deleted directly as its own leaf. Restore reactivates a batch's links
  **endpoint-guarded** — only where both endpoint activities are active — so a link
  whose other end was deleted separately stays soft-deleted (a bounded, documented
  edge case). The four-level M3 cascade/restore is unchanged and fully regression-
  covered.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the activity-dependency authorisation and contract foundation (ADR-0021). New
  `dependency:*` permission codes follow the hierarchy rule — `dependency:read` for
  every member, `dependency:create/update/delete` for Planner + Org Admin only
  (deliberately not Contributor). `@repo/types` gains the `DEPENDENCY_TYPES` const
  (FS/SS/FF/SF, source-of-truth kept in lock-step with the API's Prisma enum) and
  the `DependencySummary`/`DependencyEndpoint` contracts the dependency API and web
  logic editor agree on. Documentation: ADR-0021 records the DAG invariant and the
  service-layer cycle-prevention strategy; DECISIONS.md records the permission
  namespace and link cascade/restore behaviour.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the `ActivityDependency` schema — the typed, lagged logic edge between two
  activities that turns a plan's activities (nodes) into a schedule network. The new
  `dependencies` table carries a `DependencyType` enum (`FS`/`SS`/`FF`/`SF`, default
  `FS`) and a signed working-day `lag_days`, with denormalised `organization_id` and
  `plan_id` (both `RESTRICT` FKs, copied from the endpoints, never client input) and
  two `RESTRICT` FKs to `activities` via named self-relations
  (`Activity.predecessorLinks` / `successorLinks`). Follows the house standards: UUID
  v7 PK, snake_case, timestamptz UTC, TEXT audit ids, optimistic-locking `version`,
  soft delete + `delete_batch_id`. Integrity is enforced in the DB as defence in
  depth: a partial-unique index on `(predecessor_id, successor_id, type)` among live
  rows (per-type uniqueness — allows the SS+FF overlap ladder, blocks exact
  duplicates), a `CHECK` forbidding self-loops, and a `CHECK` bounding `lag_days` to
  −3650…3650, plus direction/plan/org and batch-restore indexes. Schema + migration
  only — the CRUD API, `dependency:*` permissions, cycle detection and lifecycle
  cascade land in follow-up tasks.

### Patch Changes

- Updated dependencies [[`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6)]:
  - @repo/types@0.3.0

## 0.3.0

### Minor Changes

- [#13](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/13) [`7c96a33`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7c96a3335182f90b0628d44f4c4e31b9748fed49) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the clients REST API — the top level of the Client → Project → Plan
  hierarchy. `GET/POST /organizations/:orgSlug/clients`,
  `GET/PATCH/DELETE /organizations/:orgSlug/clients/:clientId`, and
  `POST .../clients/:clientId/restore`. Reads are open to any member; create/
  update/delete/restore are Planner + Org Admin. Every route resolves the org
  scope from the caller's memberships (404 for non-members), names are unique per
  active org, updates use optimistic locking, and delete is a soft cascade to the
  client's projects and plans (restored together as one batch).

- [#13](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/13) [`7c96a33`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7c96a3335182f90b0628d44f4c4e31b9748fed49) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the plans REST API — the leaf level of the Client → Project → Plan
  hierarchy and the future host of activities and the TSLD. Create and list are
  nested under a parent project
  (`GET/POST /organizations/:orgSlug/projects/:projectId/plans`); item operations
  are flat by id (`GET/PATCH/DELETE /organizations/:orgSlug/plans/:planId` and
  `POST .../plans/:planId/restore`). Plans carry `status` (`DRAFT`/`ACTIVE`/
  `ARCHIVED`, default `DRAFT`) and an optional date-only `plannedStart`
  (`YYYY-MM-DD`, stored without timezone drift and validated as a real calendar
  day). Reads are open to any member; create/update/delete/restore are Planner +
  Org Admin. The parent project is resolved active and in-org first (404
  otherwise) and its organisation id is copied onto the plan; names are unique per
  project among active rows; updates use optimistic locking; delete is a soft
  delete (a plan is a leaf); and restore requires the parent project to be active
  (`PARENT_DELETED` otherwise).

- [#13](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/13) [`7c96a33`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7c96a3335182f90b0628d44f4c4e31b9748fed49) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the projects REST API — the middle level of the Client → Project → Plan
  hierarchy. Create and list are nested under a parent client
  (`GET/POST /organizations/:orgSlug/clients/:clientId/projects`); item operations
  are flat by id (`GET/PATCH/DELETE /organizations/:orgSlug/projects/:projectId`
  and `POST .../projects/:projectId/restore`). Reads are open to any member;
  create/update/delete/restore are Planner + Org Admin. The parent client is
  resolved active and in-org first (404 otherwise) and its organisation id is
  copied onto the project (never taken from input); names are unique per client
  among active rows; updates use optimistic locking; delete is a soft cascade to
  the project's plans; and restore brings the batch back but requires the parent
  client to be active (`PARENT_DELETED` otherwise).

- [#14](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/14) [`34f1604`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/34f160433f80c294f00114ab5c3847aa9ceebd37) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the organisation recycle-bin endpoint (`GET /organizations/:orgSlug/deleted`):
  one deletion-time-ordered, cursor-paginated list of soft-deleted clients,
  projects and plans, each carrying a `canRestore` flag that is false while an
  ancestor is still deleted (surfacing the top-down restore invariant). Reading
  requires hierarchy read (any member); restore stays on the existing per-entity,
  writer-only `.../{id}/restore` routes. Pagination is keyset over the union of the
  three tables by `(deletedAt, id)`.

- [#13](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/13) [`7c96a33`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7c96a3335182f90b0628d44f4c4e31b9748fed49) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the hierarchy authorisation and lifecycle foundation: `client|project|plan`
  read/create/update/delete/restore permission codes (read for every member,
  write for Planner + Org Admin), a shared `HierarchyLifecycleService` implementing
  cascade soft-delete + batch restore (one `delete_batch_id` per delete, top-down
  `PARENT_DELETED` invariant, `NAME_TAKEN` on colliding restore), and the
  `ClientSummary`/`ProjectSummary`/`PlanSummary`/`PlanStatus`/`DeletedHierarchyItem`
  cross-boundary types.

- [#13](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/13) [`7c96a33`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7c96a3335182f90b0628d44f4c4e31b9748fed49) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the `Client`, `Project`, and `Plan` domain-hierarchy tables (and the
  `PlanStatus` enum) plus their migration — the organisation-scoped containers the
  scheduling features hang off. Each follows the house standards (UUID v7 PKs,
  snake_case columns, timestamptz UTC, soft delete, audit, optimistic-locking
  `version`) and adds two reusable conventions: a denormalised `organization_id` on
  `Project`/`Plan` (copied from the parent for single-column scope/IDOR checks) and
  a `delete_batch_id` correlation column that groups a row and its subtree for
  cascade soft-delete and one-shot batch restore. Parent FKs are `ON DELETE
RESTRICT`; name uniqueness is per immediate parent among live rows via partial
  unique indexes. Schema and migration only — no module/endpoint behaviour yet.

### Patch Changes

- Updated dependencies [[`a3e9e01`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a3e9e01d4684f945b48cd116374a545d39a7f9bc)]:
  - @repo/types@0.2.2

## 0.2.1

### Patch Changes

- [#8](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/8) [`cfe1d24`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/cfe1d2485ff2d1b8deeaf4328c5691754c91da40) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix the API container crashing on boot with `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`.
  `@repo/types` shipped raw TypeScript (its `exports` pointed at `src/index.ts`),
  which tools transpile but plain Node cannot load — so the production image
  crashed when the compiled API `require`d it. `@repo/types` now builds to
  `dist/` (ESM + declarations) and its `exports` resolve to the compiled output at
  runtime, while the `development`/`types` conditions still point at source so
  dev, tests, and typecheck are unchanged. The API and web Docker builds compile
  `@repo/types` before the app, and `turbo dev` depends on it too.

- [#4](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/4) [`d69e335`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/d69e335041f51290b4acdfb107ac22d69de2e510) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix the API container build: `pnpm deploy` now passes `--legacy`. pnpm v10
  changed `pnpm deploy` to require `inject-workspace-packages=true` (or `--legacy`)
  and otherwise fails with `ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE`, which broke the
  `api` image build. The `--legacy` flag restores the pre-v10 deploy behaviour the
  multi-stage Dockerfile relies on.

- [#9](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/9) [`cd4b43c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/cd4b43cbc8746d886ebed89d2293746d28de8166) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix two production-image runtime crashes. The generated Prisma client was missing
  from the deployed image (`pnpm deploy` rebuilds node_modules from the store and
  drops it), so the API crashed with "@prisma/client did not initialize yet" — the
  Dockerfile now regenerates the client inside the deployed tree. And the logger
  no longer crashes in development mode when `pino-pretty` (a devDependency, absent
  from the production image) can't be loaded: it falls back to JSON logging.

- [#7](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/7) [`efbc61d`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/efbc61d3fcc379826607fc289766d93ab9d141ce) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Make the API container self-migrating and publish GitHub Releases. The API image
  now ships the Prisma CLI + schema/migrations and applies pending migrations on
  startup (`prisma migrate deploy`) via its entrypoint, so a fresh database is
  migrated automatically — no out-of-band step. The release workflow now also
  creates a GitHub Release for each `vX.Y.Z` tag so the Releases tab reflects
  published versions.
- Updated dependencies [[`cfe1d24`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/cfe1d2485ff2d1b8deeaf4328c5691754c91da40)]:
  - @repo/types@0.2.1

## 0.2.0

### Minor Changes

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add organisation invitations and a transactional-mail port. Org Admins can
  invite by email with a role (`POST /organizations/:orgSlug/invitations`), list
  pending invites, and revoke them; invitees preview by token
  (`POST /invitations/preview`) and accept (`POST /invitations/accept`) to join.
  Tokens are stored hashed (raw value returned once + emailed), invitations expire,
  and accept is transactional. Adds a `MailService` port with a logging stub
  adapter (the accept URL is also returned so onboarding works without a provider)
  and the shared `InvitationSummary`/`InvitationPreview` contracts to `@repo/types`.
  Introduces a `410 Gone` error for expired/revoked invitations.

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the organisations tenancy core. New `Organization` and `OrgMember` models
  (the canonical org-scoping foundation: UUID v7, soft-delete, audit, optimistic
  locking, partial-unique slug and one-membership-per-user indexes) and the
  `organizations` module: `POST /api/v1/organizations` (creator becomes Org Admin,
  atomically, with slug uniquification), `GET /api/v1/organizations` (the caller's
  orgs), and `GET /api/v1/organizations/:orgSlug` (404 for non-members —
  anti-enumeration). The auth seam now hydrates a principal's memberships and
  permissions from the database, so `/api/v1/me` returns real memberships and
  `principal.can(permission, orgId)` is enforced. Adds the shared
  `OrganizationSummary` contract to `@repo/types`.

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add membership management. New endpoints under the organisation scope:
  `GET /api/v1/organizations/:orgSlug/members` (cursor-paginated roster with user
  profiles), `PATCH .../members/:memberId` (change role, Org Admin only, with
  optimistic locking and the last-Org-Admin invariant), and
  `DELETE .../members/:memberId` (soft-delete, Org Admin only, last-admin
  protected). Every route resolves the org scope from the caller's memberships
  (404 for non-members; 403 for insufficient role). Adds the shared
  `OrgMemberSummary` contract to `@repo/types`.

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Harden the invitation-accept flow and fix accessibility gaps found in review.

  API: invitation acceptance now enforces a verified email when
  `AUTH_REQUIRE_EMAIL_VERIFICATION` is on — a single flag that also drives Better
  Auth's `requireEmailVerification`, so the email-match identity check becomes a
  real proof of mailbox ownership the moment the verification-email loop lands
  (default off for the alpha; ADR-0016).

  Web: split the destructive colour into a solid `destructive` (button/chip
  surface) and a readable `destructive-text` for coloured text and state borders,
  so error text, invalid-field borders, and the form error summary meet WCAG AA
  contrast in both themes. The invitation-link field now uses the shared input
  primitive (proper focus ring), and the accept-invite screen announces its
  loading→resolved transitions via a polite live region.

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Establish the core identity & tenancy model and adopt the SchedulePoint
  organisation role set (ADR-0016). `OrganizationRole` is now
  `ORG_ADMIN / PLANNER / CONTRIBUTOR / VIEWER` (replacing the placeholder
  `OWNER / MEMBER / VIEWER`); External Guest is modelled separately, not as a
  member role. The reference-feature role→permission map and RBAC tests are
  updated in step. No runtime behaviour changes yet.

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Wire up authentication and the current-user endpoint (walking skeleton). Mounts
  Better Auth (`/api/auth/*`, email + password, cookie sessions) behind the
  `AuthContextService` seam, adds the identity tables (`users`, `sessions`,
  `accounts`, `verifications`) as the first migration, and exposes an
  authenticated `GET /api/v1/me` returning the signed-in user and their
  organisation memberships. Adds the shared `MeResponse` / `SessionUser` /
  `OrganizationRole` contracts to `@repo/types`.

### Patch Changes

- Updated dependencies [[`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf), [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf), [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf), [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf)]:
  - @repo/types@0.2.0
