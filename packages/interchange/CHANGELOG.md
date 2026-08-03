# @repo/interchange

## 0.9.0

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

## 0.8.0

### Minor Changes

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

## 0.7.0

### Minor Changes

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

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Close the shift editor's seven deferred findings (TECH_DEBT [#82](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/82)).

  An import's calendar windows are now sorted, de-duplicated of empty spans and merged where they
  overlap — each one a reported repair rather than an opaque 500 from a recalculation days later —
  and a standard working day below the domain's floor is raised instead of rounding to zero stored
  minutes. The calendar library table stops showing a two-shift calendar and a plain Mon–Fri one as
  the same row. Window problems clear as you correct them once they are on screen, an overlapping
  pair flags both of its rows, and adding or removing a dated exception on an organisation calendar
  takes the same `calendar:manage_org` capability that editing one already did.

## 0.6.0

### Minor Changes

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

## 0.5.0

### Minor Changes

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

## 0.4.0

### Minor Changes

- [#127](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/127) [`dcfeb5f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/dcfeb5f6a8f84c0a3201a400c36b0c2bae215548) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the pure XER **export** substrate (ADR-0050 M4a) — the engine-free reverse of the import pipeline. A
  SchedulePoint export graph maps to the shared canonical model, emits the P6 `PROJECT`/`CALENDAR`/`TASK`/
  `TASKPRED` tables (reversing the `TT_*`/`PR_*` enums, working-minutes→hours, and the `clndr_data`
  work-pattern blob), and serialises to a re-parseable UTF-8 `.xer` via `exportXer`, alongside a fidelity
  `InterchangeReport` that names every best-effort drop (WBS/constraints/progress/resources land in M4c). A
  round-trip harness proves export → re-import structural equivalence for the core network. The CPM engine
  and the recalc parity golden suite are untouched (export never invokes the engine).

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

## 0.3.0

### Minor Changes

- [#125](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/125) [`1886e03`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1886e03cf6c79070abc07dd3f211e690193981c4) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add Microsoft Project **MSPDI (`.xml`) import** (ADR-0050, Stage C2 M3 — pure package). A second parser

  - adapter (`mspdi-parser`, `mspdi-calendar`, `mspdi-adapter`, `importMspdi`) feed the **same**
    format-agnostic canonical model the XER path produces, so the mapper, validate/repair/report, graph-size
    ceilings and report shape are reused unchanged — MSPDI is a parser, not a second pipeline. Maps the MS
    Project vocabulary: `<Task>` (incl. `<Summary>`→`WBS_SUMMARY` + outline-level parentage, `<Milestone>`,
    `PT#H#M#S` durations, `<ConstraintType>` 0–7, `<PercentComplete>`/actuals/remaining), nested
    `<PredecessorLink>` (link types 0–3, tenths-of-a-minute lag), `<Calendar>` week-days + exceptions,
    `<Resource>` (types 0–2) and `<Assignment>`. Parsing uses `fast-xml-parser` configured for untrusted
    input — `processEntities: false` (no entity expansion → no billion-laughs / XXE), external entities
    inert, plus byte + node-count caps — with typed, user-safe rejections. `.mpp` (proprietary binary) is
    rejected with a guiding message to export MSPDI XML instead. The CPM engine + recalc parity golden suite
    are untouched. API routing + web `.xml` acceptance land separately.

- [#125](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/125) [`1886e03`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1886e03cf6c79070abc07dd3f211e690193981c4) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Wire Microsoft Project MSPDI import through the stack (ADR-0050, Stage C2 M3). A new format-agnostic
  `importSchedule` entry point in `@repo/interchange` detects the interchange format (Primavera P6 XER vs
  MS Project MSPDI XML) from the bytes and routes to the matching orchestrator — both produce the same
  import graph + report, so callers stay format-blind. The interchange commit/dry-run endpoints now call
  `importSchedule` instead of the XER-specific path, so an uploaded `.xml` MSPDI file imports through the
  exact same review→commit pipeline as `.xer` (an unrecognised file gets a single user-safe rejection). The
  web **Import from file…** dialog accepts `.xer` **or** `.xml`, with updated copy and the unparseable-file
  message naming both formats. On by default under the existing `VITE_SCHEDULE_INTERCHANGE` flag.

### Patch Changes

- [#125](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/125) [`1886e03`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1886e03cf6c79070abc07dd3f211e690193981c4) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Bound the total number of dated exceptions a single MSPDI `<Calendar>` may
  accumulate (`MAX_CALENDAR_EXCEPTIONS`, enforced during accumulation and failing
  closed with a reported drop). The existing per-range day bound stopped one
  hostile `<TimePeriod>`, but a file could pack many maximal ranges to amplify a
  small upload into millions of exception objects — an unbounded memory
  amplification reachable from the read-only dry-run. The importer now stays
  memory-bounded regardless of input.

## 0.2.0

### Minor Changes

- [#123](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/123) [`522b838`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/522b838be2b3fc3ff94c36b6b4fc9d7e77d310a6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Extend the XER import pipeline to a materially-complete P6 network (ADR-0050, Stage C2 M2 — pure
  package). Beyond M1's core network, the canonical model + import graph now carry: the **WBS tree**
  (`PROJWBS`→`WBS_SUMMARY` + `parentId`, prefixed `wbs:` key space), **activity constraints** incl.
  secondary and `As-Late-As-Possible` (the full P6 `CS_*`→SchedulePoint `ConstraintType` map, with
  `CS_EXPFIN` routed to Expected Finish and unrecognised kinds dropped-and-reported), **progress + status**
  (`status_code`, actual dates, remaining duration, physical %, suspend/resume, expected finish), and
  **resources + assignments** (`RSRC`→resources, `TASKRSRC`→assignments, `TT_Rsrc`→`RESOURCE_DEPENDENT`).
  Because the importer persists via `createMany` (bypassing the domain services), the validate/repair step
  now enforces the invariants the services would: WBS parent resolution + acyclicity + summary-carries-no-logic,
  constraint type/date pairing, progress consistency (status derivation, N08/N18, resume≥suspend, percent
  clamps), and assignment rules (dangling drop, `(activity,resource)` de-dup, MATERIAL-never-drives,
  at-most-one-driver-per-activity) — every fix reported, nothing dropped silently. Additive; the CPM engine
  and recalc parity golden suite are untouched. API persistence of the new fields lands separately.

## 0.1.0

### Minor Changes

- [#121](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/121) [`58c9c85`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/58c9c85a5dcbcb2ab2474efafe6cc1bdbb7afedb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Introduce the pure, engine-free `@repo/interchange` package (ADR-0050): the format-agnostic canonical
  schedule-interchange model (project / activity / relationship / calendar, M1 network scope) and the
  `InterchangeReport` shape, with shared Zod schemas. This is the parse → canonical → map →
  validate/repair/report substrate for XER / MS Project import; the XER parser, mapper, API module and
  review UI land in later M1 tasks. No user-facing surface yet (behind `VITE_SCHEDULE_INTERCHANGE`); the
  CPM engine and its recalc parity golden suite are untouched.

- [#121](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/121) [`58c9c85`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/58c9c85a5dcbcb2ab2474efafe6cc1bdbb7afedb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the XER→canonical→import-graph mapper and validate/repair/report pipeline to `@repo/interchange`
  (ADR-0050, Task 1.3). The pure, engine-free pipeline is: an **XER→canonical adapter** (P6 field names,
  `TT_*`/`PR_*` enums, hours→working-minutes coercion, a pragmatic `clndr_data` calendar parser), a
  **canonical→import-graph mapper** (a package-local SchedulePoint-shaped graph — weekday minute shifts,
  dated exception windows, keyed activities/dependencies), and the ADR-0035 **validate/repair/report**
  step (dangling-edge drop, duplicate `(pred,succ,type)` de-dup, deterministic cycle-break to honour the
  ADR-0021 DAG invariant, duplicate-code suffixing, unit coercion, unmapped-kind + dropped-table
  reporting). A single `importXer` orchestrator returns a domain-valid import graph plus a fully-populated
  `InterchangeReport` — nothing is silently dropped. Still no user-facing surface (the API module + review
  UI are later M1 tasks); the CPM engine and its recalc parity golden suite are untouched.

### Patch Changes

- [#121](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/121) [`58c9c85`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/58c9c85a5dcbcb2ab2474efafe6cc1bdbb7afedb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Harden the XER parser against prototype pollution / remote property injection. A `%F` field list is
  attacker-controlled, so a crafted `.xer` could declare a column literally named `__proto__`,
  `constructor` or `prototype` and — when used as a dynamic object key — pollute `Object.prototype`.
  Parsed rows are now a `Map<string, string>` rather than a plain object (`XerTable.rows` is
  `ReadonlyArray<ReadonlyMap<string, string>>`, read via `row.get(name)`), so an arbitrary file-supplied
  column name can never be written as an object property. Real imports are unaffected. Fixes two CodeQL
  `js/remote-property-injection` (high) findings.
