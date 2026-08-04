# @repo/types

## 0.25.0

### Minor Changes

- [#231](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/231) [`746220c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/746220c412ebd4f28370f0b41c131b6f8792b962) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - fix: filtering the audit log by two categories at once no longer fails

  Choosing **Deletions** and **Access** together — or Deletions and Settings — was rejected by the
  API. The limit on how many event kinds one request may name was written down as a number when the
  log had twenty of them; the log now has thirty-nine, and two ordinary chips came to more than the
  old limit allowed. The limit is now worked out from the list of events itself, so it cannot fall
  behind again.

  Also from the same review pass:

  - An import that succeeded could return an error if its own log entry failed to save — and leave the
    plan locked for editing. The entry is now written on a best-effort basis, matching what the code
    around it already said it did: a missing line in the log, never a failed import.
  - The audit log's description of what it records had fallen a milestone behind what it actually
    records — it named deletions inside a plan but not scheduling settings, baselines, calendar and
    resource changes, or imports. It now describes the rule rather than listing examples.
  - "Clear filters" looked unavailable while still reacting to the mouse.
  - The filter row is no longer boxed, matching every other filtered list in the app.
  - The Outcome control is no longer announced twice by a screen reader.

- [#231](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/231) [`746220c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/746220c412ebd4f28370f0b41c131b6f8792b962) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat: record changes to the rules a plan is judged by in the audit log

  Five new audit events (ADR-0073 C3.2, family E): a plan's scheduling settings changed, a calendar's
  working time changed, and a baseline captured, activated or deleted.

  These are **updates**, which the log deliberately does not record in general — they earn a row
  because they change how _other people's_ work is evaluated. Moving a plan's data date, editing a
  shared calendar's working week, or activating a baseline re-dates or re-measures work owned by
  people who did not make the change and are not told.

  A plan row is emitted **only when a governance field actually moved**, and names the fields: a
  rename writes nothing, and resending the settings form unchanged writes nothing. A calendar row
  names _which kind_ of working time changed — the working week, the hours-per-day factor, or a dated
  exception — rather than dumping the hours, so the fact a reader needs is not buried. All three
  exception routes fold into the one action, because an exception is working time.

- [#231](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/231) [`746220c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/746220c412ebd4f28370f0b41c131b6f8792b962) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat: record where an imported programme came from in the audit log

  Importing a schedule now writes an audit event naming the file, the format, how many activities and
  links arrived, and how many findings the import report raised.

  A plan somebody built is a sequence of choices with a person behind each one. An imported plan
  arrived whole, from a file, and the file is not kept — so a week later nothing distinguishes five
  hundred imported activities from five hundred typed ones, and "where did this programme come from?"
  had no answer at all. Now it does, with a name and a time against it.

  A dry-run records nothing: it reads a file and changes nothing. A failed import records nothing
  either — including one that gets as far as creating the plan and is then rolled back.

  This completes the audit log's mutation coverage. Every route in the API is now either audited or
  explicitly and permanently excluded for a stated reason; there is no longer any route parked as
  "we'll decide later".

- [#231](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/231) [`746220c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/746220c412ebd4f28370f0b41c131b6f8792b962) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat: record what the shared calendar and resource libraries offer in the audit log

  Seven new events (ADR-0073 C3.3): a calendar deleted, retired, restored to use or moved between the
  shared and project tiers, and a resource deleted, retired or restored.

  **Retiring is the change this exists for.** An archived calendar or resource keeps scheduling
  exactly as it did, keeps every plan and assignment already using it, and refuses only a _new_ use.
  Nothing breaks and nobody is told — so the first anybody hears of it is a colleague asking why they
  can no longer pick something they used last month. That question now has an answer with a name and
  a time against it.

  Retiring and restoring are separate events rather than one with a flag, because the question a
  reader asks is "what was retired?". A single edit that changes a calendar's working week _and_ its
  tier records both, linked together, so neither fact hides inside the other. Deleting a resource
  group records one event carrying how many resources went with it, not one per resource.

  The web copy says "retired" rather than "archived" throughout, because nothing was deleted.

- [#231](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/231) [`746220c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/746220c412ebd4f28370f0b41c131b6f8792b962) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Narrow the audit log by category, outcome and date — behind `VITE_AUDIT_FILTERS` (default off).

  Seven distinct kinds of event arrived in one undifferentiated reverse-chronological stream. Both
  audit screens now carry a filter bar: category chips, an outcome choice and a date range, with the
  result in the URL so a narrowed view survives a reload and can be pasted to a colleague.

  Categories are questions a reader arrives with — Access, Deletions, Sign-ins — not the twenty
  machine names underneath. They never travel on the wire: the client expands the chosen ones into
  actions before building the request, so the API keeps one vocabulary and a category renamed for
  legibility is a copy change rather than a breaking API change.

  Which chips appear is derived from the vocabulary rather than listed. The organisation screen cannot
  offer Sign-ins (those rows carry no organisation, so the choice could only ever return nothing), and
  a category holding no actions yet stays off screen until its first action lands. A chip that can only
  answer "no events" is the defect this filter exists to remove.

  A narrowed view that finds nothing now says so, in different words from a log with nothing in it.

  Flag-off is byte-for-byte the current screens — no bar, and no filter parameter even with a filter
  sitting in the URL from a flag-on build.

- [#231](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/231) [`746220c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/746220c412ebd4f28370f0b41c131b6f8792b962) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat: record deletions and structural changes inside a plan in the audit log

  The audit log now answers "who removed this?" for work inside a plan, not only for clients,
  projects and plans themselves. Six new events (ADR-0073 C3.1, family D): an activity deleted or
  restored, a WBS summary dissolved, activities regrouped, and a logic link added or removed.

  Each is **one row per action, not per swept row** — deleting a summary with forty-one descendants
  records one event carrying the counts, so a reader can see that one person did one thing. A link
  records its **direction** by name, which is the fact planners most often need settled. Nothing is
  written when the write is refused by the edit-lock or rolled back.

  Also fixes a promise the log had never kept: a cascade delete of a client, project or plan recorded
  its batch id and not its **size**. All four levels now carry scalar counts.

  Editing an activity's own fields stays deliberately unrecorded — it changes nothing outside that
  activity, and the row already carries who last changed it. Both audit screens now say so instead of
  saying "not recorded yet".

## 0.24.0

### Minor Changes

- [#227](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/227) [`ec31372`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/ec31372edc9fd8534a7eee71670fc50660dfbaf1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the append-only audit log (ADR-0072), closing `docs/TECH_DEBT.md` [#14](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/14)(a)/(a2).

  Twenty events are recorded into a table the database itself refuses to update or delete —
  membership role changes and removals, invitations created, revoked and accepted, organisations
  created, guest share links minted and revoked, five authentication events, and hierarchy deletes
  and restores carrying the cascade's own batch id, so one user action reads as one row rather than
  forty.

  A share link is the widest permission change the product offers — it grants a read of plan data to
  somebody with no account, and revocation is the only way that grant ever ends — so it is recorded
  with the plan it exposed and how long for. Neither the raw token nor its hash goes anywhere near
  the payload: the token IS the credential and the hash is what the guard compares against, so either
  would turn an Org-Admin-readable log into a key store. The allow-list does not name them and the
  substring ban catches both words, and a test asserts the outcome against the stored row.

  Membership and hierarchy events are written **inside the caller's transaction**: an action that
  cannot be recorded does not happen. Authentication events invert that deliberately — there is no
  transaction to roll back, and refusing every sign-in because the audit table is unavailable would
  turn a logging fault into an outage.

  Two reads: `GET …/organizations/:slug/audit-events` for an Org Admin, and `GET /me/audit-events`
  for anyone. The self route takes no user id at all, so there is nothing to tamper with and no
  permission to hold — an ordinary member can see their own sign-in history without asking.

  Two screens behind `VITE_AUDIT_LOG` (**on by default**; set it to `false` to roll back to the prior
  product exactly — there is no write path here to leave behind): **Audit log** in the organisation
  nav for an Org Admin, and **My activity** in the account menu for everyone. Both render from one list component,
  so the two views cannot drift about how an event reads. A caller without `audit:read` is told so
  rather than shown an empty table — "no events" and "you may not see these" are the one distinction
  an audit log must never blur.

  Every route in the API is now gated on an audit decision: a new endpoint that is neither audited nor
  explicitly excused with a named reason fails CI.

## 0.23.0

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

## 0.22.0

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

## 0.21.0

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

## 0.20.0

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

## 0.19.0

### Minor Changes

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

## 0.18.0

### Minor Changes

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

## 0.17.0

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

## 0.16.0

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

## 0.15.0

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

## 0.14.0

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

## 0.13.0

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

## 0.12.0

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

## 0.11.0

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

## 0.10.0

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

## 0.9.0

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

## 0.8.0

### Minor Changes

- [#41](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/41) [`32e843f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/32e843f4136460aa403c26ef45ac4496c82d1f6b) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Close the "date constraints" loop in the UI. The activity form's constraint
  selector now offers only the **six** kinds the CPM engine honours exactly as
  labelled (`SNET`/`SNLT`/`FNET`/`FNLT`/`MSO`/`MFO`); the two `MANDATORY_*` kinds —
  which the engine silently parks as their moderate equivalents (ADR-0023 §6) — are
  no longer newly selectable, so a planner can't set a constraint that behaves
  differently than it reads. An activity that already carries a parked value keeps it
  as an honest, spelled-out option ("Mandatory start — applied as Must start on") and
  is **never silently changed** on open.

  A set constraint is now visible without opening each row: a text **Constraint**
  column in the activities table (`"SNET · 01 May 2026"`, with the full label as its
  accessible name), a small **pin** on the constrained edge of a bar on the TSLD
  canvas (a shape cue, not colour — with a legend entry and a spoken equivalent in the
  diagram's accessible listbox), and an explanation of the "Parked constraints" figure
  in the schedule summary.

  `@repo/types` gains `SELECTABLE_CONSTRAINT_TYPES` / `PARKED_CONSTRAINT_TYPES` /
  `isParkedConstraintType` (the honoured-as-labelled set, mirroring the engine). No
  API, database, or engine change — the constraint write path, optimistic locking, and
  pen gating are untouched.

## 0.7.0

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

## 0.6.0

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

## 0.5.0

### Minor Changes

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

## 0.4.0

### Minor Changes

- [#20](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/20) [`9f614f2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9f614f22d9e233fb4783c4c81bc01bb9cc5b398c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the read-side schedule summary: `GET
/organizations/:orgSlug/plans/:planId/schedule/summary` (permission
  `schedule:read`, every member) returns a plan's computed schedule roll-up from a
  single aggregate over the persisted engine columns — no recompute. It returns the
  identical `PlanScheduleSummary` shape as recalculate (data date, project finish,
  activity/critical/near-critical/parked counts), now a shared type in `@repo/types`.
  Null-safe for a never-calculated plan (null finish) and a plan with no start date
  (null data date).

## 0.3.0

### Minor Changes

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the activity-dependency authorisation and contract foundation (ADR-0021). New
  `dependency:*` permission codes follow the hierarchy rule — `dependency:read` for
  every member, `dependency:create/update/delete` for Planner + Org Admin only
  (deliberately not Contributor). `@repo/types` gains the `DEPENDENCY_TYPES` const
  (FS/SS/FF/SF, source-of-truth kept in lock-step with the API's Prisma enum) and
  the `DependencySummary`/`DependencyEndpoint` contracts the dependency API and web
  logic editor agree on. Documentation: ADR-0021 records the DAG invariant and the
  service-layer cycle-prevention strategy; DECISIONS.md records the permission
  namespace and link cascade/restore behaviour.

## 0.2.2

### Patch Changes

- [#10](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/10) [`a3e9e01`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a3e9e01d4684f945b48cd116374a545d39a7f9bc) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix `@repo/types` so it resolves under classic `tsc` without a prior build.
  Its top-level `types` field pointed at `./dist/index.d.ts`, but the API compiles
  with `moduleResolution: "Node"`, which ignores `exports` and reads that field —
  so any `tsc` run outside Turbo's `^build` graph (the `verify-template.sh`
  type-check and the e2e Playwright web server) failed with `TS2307` because
  `dist/` had not been built. The field now points at `./src/index.ts`, so
  type-checking resolves from source everywhere; the Node runtime is unaffected
  because it resolves the `exports.default` condition to `./dist/index.js`.

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

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Wire up authentication and the current-user endpoint (walking skeleton). Mounts
  Better Auth (`/api/auth/*`, email + password, cookie sessions) behind the
  `AuthContextService` seam, adds the identity tables (`users`, `sessions`,
  `accounts`, `verifications`) as the first migration, and exposes an
  authenticated `GET /api/v1/me` returning the signed-in user and their
  organisation memberships. Adds the shared `MeResponse` / `SessionUser` /
  `OrganizationRole` contracts to `@repo/types`.
