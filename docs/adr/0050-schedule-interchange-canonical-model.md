# ADR-0050: Schedule interchange — canonical model + import pipeline

- **Status:** Accepted (with M1) — behind `VITE_SCHEDULE_INTERCHANGE` (web) + a server flag
- **Date:** 2026-07-20
- **Deciders:** James Ewbank (with Claude Code — feature-analyst)

## Context

SchedulePoint's design-partner planners live in **Primavera P6** and **Microsoft
Project** today. The single biggest barrier to trying — let alone adopting — a
new scheduling tool is **re-keying an existing schedule by hand**: hundreds to
thousands of activities, their logic, calendars, WBS and progress. The brief
names this directly (§8 Should-have _"Import from XER / MPP (read-only,
best-effort) to lower switching cost"_; §17 risk _"XER / MPP import quality is
poor, blocking migration from P6"_). The toolbar burn-down deferred schedule
interchange to **Stage C2** (`docs/DECISIONS.md` C1 entry; `TOOLBAR_ROADMAP.md`
`export` row). Unlike Stages A–E and C1 — pure frontend wiring over already-shipped
data — interchange is **backend-heavy**: it parses two foreign file formats, maps
a foreign data model onto SchedulePoint's, validates/repairs/reports the mismatch,
and persists a whole new plan. It is the first burn-down stage that adds an API
surface, a new package, and a new ADR. The full spec is in
[`docs/specs/schedule-interchange/`](../specs/schedule-interchange/feature-spec.md).

The forces that shape the design:

- **Two foreign formats, one domain model.** A P6 **XER** (tab-delimited text
  table dump) and an MS Project **MSPDI** (`.xml`) express the same planning
  concepts — activities, typed lagged logic, calendars, WBS, resources, progress —
  with entirely different vocabularies and shapes. A per-format one-off importer
  would duplicate all of the domain-mapping and validation logic twice.
- **Best-effort fidelity with _no silent data loss_.** A foreign model never maps
  onto ours cleanly; the honest supported-field list (brief §17 mitigation) must be
  realised as a **live, per-import report**, not a static doc — every source entity
  is either mapped, or **named in the report** as approximated or dropped, with a
  reason. "Best-effort" that hides its losses is "silent data loss" (brief §17
  risk). This is exactly the **reject / repair / report** contract the engine
  conformance work already defined (ADR-0034/0035).
- **Permissive-licence + TS-stack constraints.** The brief (§15/§18) floated a
  Python parsing library / isolated worker. XER is tab-delimited **text** and MSPDI
  is **XML**, both first-class to parse in TypeScript with zero (XER) or one
  permissive (MSPDI: `fast-xml-parser`, MIT) dependency. A polyglot runtime + a
  second container + a serialisation boundary is pure cost that also breaks shared
  typing and CI-native unit testing.
- **The engine and its parity gate are sacred.** Interchange must **never** edit
  the CPM engine or the recalculate path; it produces the same domain inputs a
  hand-built plan would, then runs the standard synchronous recalculate (ADR-0022)
  unchanged. The recalc **parity golden suite stays untouched** — interchange has
  no way to reach it.
- **A proven precedent exists.** `packages/engine-conformance` (pure, engine-free,
  fixture-tested) + `apps/api` (the harness that drives the engine) is exactly the
  split this feature wants (ADR-0034): isolate the risky, format-specific code as
  pure, exhaustively-unit-testable functions; keep all persistence and orchestration
  in a thin Nest module that reuses existing domain services.

## Decision

We will build schedule interchange as a **two-layer** design: a **pure,
engine-free `@repo/interchange` package** and a **thin NestJS `interchange`
module** that owns the HTTP surface, authorisation, transactions and
orchestration, and **persists exclusively through existing feature services**.

Concretely:

1. **A format-agnostic _canonical interchange model_** (this M1 slice). Each source
   format is parsed into one shared, format-neutral graph — a canonical project,
   activities, relationships (FS/SS/FF/SF + lag in **working-minutes**, ADR-0036),
   and calendars (weekday work-windows + dated exceptions). The canonical model is
   the single vocabulary the rest of the pipeline speaks; adding a format adds a
   parser, not a second pipeline.

2. **Per-format parsers** feed the canonical model: an **XER** parser (tab-delimited
   `%T/%F/%R` table blocks, CP1252 decode, `ERMHDR` signature/version — M1), then an
   **MSPDI** parser (`fast-xml-parser`, XXE/entity-expansion off, node cap — M3). The
   parser is selected by **content signature**, never by file extension alone.

3. **A mapper** transforms the canonical model into a SchedulePoint **import-DTO
   graph** (plan + activities + dependencies + calendars for M1; WBS + constraints +
   progress + resources for M2), expressed in the domain's own DTO shapes so the
   commit step can hand them to existing services verbatim.

4. **An ADR-0035-aligned validate / repair / report step** runs over the mapped
   graph — dangling edge dropped, duplicate `(pred, succ, type)` de-duplicated
   (§13/N04), cyclic logic broken at a **deterministically-chosen** edge (never
   imported as a cyclic graph — ADR-0021 DAG invariant), duplicate activity codes
   suffixed, foreign units coerced to working-minutes — each recorded as a line in an
   **`InterchangeReport`** (detected format/version, mapped counts, approximations,
   repairs, drops). Never a silent change.

5. **A two-phase `dry-run → commit` pipeline.** The dry-run parses → maps →
   validates and returns the report **before any write**, so the planner consents to
   the losses; commit re-runs the pipeline and, in **one transaction**, creates the
   plan + calendars + activities + dependencies via the **existing** hierarchy /
   activities / dependencies / calendars services (never bespoke Prisma), then runs
   the standard synchronous **recalculate** (ADR-0022). Large files run the same
   pipeline inside a **BullMQ job** (ADR-0009).

6. **Housing.** All of steps 1–4 are **pure, side-effect-free, fixture-tested**
   functions in **`@repo/interchange`** (the build-contract shape of ADR-0019:
   compiled `dist` + `.d.ts`, consumed by the API and — its Zod schemas — the web
   review dialog). The **`interchange` NestJS module** (a later M1 task, copied from
   the reference-feature template) is the only place with side effects: upload,
   `interchange:import` + org-scope authorisation (ADR-0012), the transaction, and
   the recalc call.

7. **Scope.** **Import-first**: XER (M1/M2) then MSPDI (M3); **export deferred** to
   an optional, product-gated later milestone; **`.mpp` excluded** (proprietary
   binary OLE — the only robust reader is JVM-based and violates the stack +
   permissive-licence constraints; MSPDI is Microsoft's open, documented XML and
   covers the MS Project need). The import **target is always a new plan** under a
   chosen project — merge/update-in-place needs identity reconciliation + the
   edit-lock/pen (ADR-0028) and is a separate, larger feature. M1 imports the
   **core network** (activities, logic, calendars); WBS, constraints, progress and
   resources are M2.

### The mapping contract (the load-bearing table)

This table is a **living contract** — the honest, versioned statement of what does
and does not come across. It grows as the domain grows (each milestone adds rows /
resolves an "M2" note); the per-import `InterchangeReport` is its runtime instance.

| P6 XER (table) / MSPDI (element)                                                             | SchedulePoint                                        | Notes / approximations                                                                                               |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `PROJECT` / `<Project>`                                                                      | new `Plan` (+ data date → `plannedStart`)            | one plan per source project (multi-project → prompt-or-first-with-report, never silent partial)                      |
| `TASK` / `<Task>`                                                                            | `Activity` (type, `durationMinutes`, code, name)     | hours/days → working-minutes (ADR-0036); milestone flags → START/FINISH_MILESTONE                                    |
| `TASKPRED` / `<PredecessorLink>`                                                             | `ActivityDependency` (FS/SS/FF/SF, `lagMinutes`)     | lag units → minutes; dup `(pred,succ,type)` de-duped (§13/N04); cycles broken+flagged (ADR-0021)                     |
| `CALENDAR` / `<Calendar>`                                                                    | `Calendar` (+ `CalendarShift` + `CalendarException`) | weekday work-hours → shifts; holidays/exceptions → exception windows (ADR-0036); non-expressible detail reported     |
| `PROJWBS` / `<Task>` summary rows                                                            | `WBS_SUMMARY` activities + `parentId` tree           | ADR-0038; **M2 import / M4c export** (XER `wbs:<id>` key ⇄ `wbs_id`; MSPDI `<Summary>`+`<OutlineLevel>`)             |
| `TASK.cstr_type/date` (+ `cstr_type2/date2`)                                                 | `constraintType/Date` (+ secondary)                  | ADR-0035 §10; **M2 import / M4c export** — XER all 8 types + ALAP exact; MSP 1 slot (mandatory + secondary reported) |
| progress (`act_start/end`, `remain_drtn`, `phys_complete`)                                   | activity progress (ADR-0035 M2)                      | **M2 import / M4c export** — XER exact; MSP has no suspend/resume/expected-finish + one %-complete (reported)        |
| `RSRC` / `<Resource>`, `TASKRSRC` / `<Assignment>`                                           | `Resource` + `ResourceAssignment` (ADR-0039/0040)    | **M2 import / M4c export**; MATERIAL never a driver; MSP has no driving flag / production rate (reported)            |
| UDFs, activity-code matrices, cost accounts, roles, expenses, risk, financial periods, steps | —                                                    | **dropped + reported** (out of scope, brief §3/§8 Won't-have)                                                        |

## Alternatives considered

- **A Python parsing worker (brief §15's suggestion).** Rejected: XER is text and
  MSPDI is XML, both native to TS; a polyglot runtime + a second container + a
  serialisation boundary is pure cost and breaks shared typing and CI-native unit
  testing. The pure-package idiom (ADR-0034) honours the "isolated" spirit without a
  second language. Revisit **only** if `.mpp` (JVM/MPXJ) is ever pursued.
- **Per-format importers (no shared canonical model).** Rejected: duplicates every
  domain-mapping and validation rule twice (XER, then MSPDI), and triples once export
  arrives. The canonical model is the whole point — one mapping contract, N parsers.
- **`.mpp` support in v1.** Rejected: proprietary binary OLE compound document, no
  permissive TS/Node reader; MSPDI (open, documented XML, exportable from every MS
  Project version) serves the MS Project need. `.mpp` is a documented limitation.
- **Export-first.** Rejected: contradicts the brief's MoSCoW (XER export / full
  round-trip is a Won't-have "for now", §8) and delivers no switching-cost value.
  Kept as an explicit, product-gated later milestone.
- **Merge-into-existing-plan import.** Rejected for v1: identity reconciliation +
  conflict resolution + pen contention (ADR-0028). New-plan import is clean and
  rollback-safe (delete the plan).
- **One-shot import (no dry-run).** Rejected: best-effort mapping **must** show its
  losses before writing, or "best-effort" becomes silent data loss (brief §17 risk).
- **Bespoke persistence inside the interchange module.** Rejected: would
  duplicate/skew the domain invariants the existing services own (DAG, org-scope,
  calendars). The module reuses the services (reference-feature standard, CLAUDE.md
  §19.2).

## Consequences

- **Positive.** One mapping contract serves two (then, with export, four)
  directions. The risky, format-specific code is **pure, engine-free and
  exhaustively unit-testable** against fixtures (the ADR-0034 idiom), with its Zod
  schemas shared verbatim by the web review dialog. Best-effort fidelity is
  **documented and reported, never silent** — the mapping table's runtime instance
  is the per-import report. Reusing the existing services for every write means
  interchange never re-implements a domain rule (DAG, org-scope, calendars, audit,
  soft-delete, optimistic locking) and can never drift from them. Import is
  **rollback-safe** (a new plan; soft-delete to undo). Fully additive: flag-off is
  byte-for-byte today's product.

- **Negative / cost.** A new **package + module + dependency** (`fast-xml-parser`,
  MIT, at M3) to own and keep licence-clean (devops-reviewer). The **mapping table
  is a living contract** — every domain growth (a new activity type, constraint
  kind, resource attribute) obliges a mapping decision and a report line, or an
  explicit "dropped + reported" row; it must not silently fall behind the model.
  Untrusted-file parsing is a **first-class security surface** (XXE / entity
  expansion off, byte + node caps, encoding handling, no filename-as-path,
  rate-limited upload — security-reviewer gate).

- **Neutral / deferred, as explicit follow-ons.** **Export** (reuse the canonical
  model in reverse), **`.mpp`** (needs an isolated JVM/MPXJ worker), and
  **merge-into-existing-plan** are named, out-of-v1 milestones, not accidental gaps.
  M1 is the core network only; WBS / constraints / progress / resources are M2 — the
  report structure is deliberately left extensible so each adds report entries, not a
  schema change.

- **The CPM engine + recalc parity golden suite are untouched.** Interchange
  produces the same domain inputs a hand-built plan would and calls the unchanged
  recalculate (ADR-0022); it has no path to the engine or its golden suite. This is
  the structural parity gate.

## M2 status — WBS · constraints · progress · resources (shipped)

M2 extends the import from M1's core network to a **materially-complete P6 import**,
additively (same canonical model, same dry-run→commit pipeline, same
`VITE_SCHEDULE_INTERCHANGE` flag — no new endpoint or flip):

- **WBS** — `PROJWBS` rows → `WBS_SUMMARY` activities on a prefixed `wbs:` key space,
  `TASK.wbs_id` → the activity `parentId` self-FK (ADR-0038). Because the importer
  persists via `createMany` (bypassing `ActivitiesService.assertValidParent`), the
  pure `validate` step now enforces the service invariants itself: a parent resolves
  to an in-graph `WBS_SUMMARY`, the parent tree is acyclic, and a summary is never a
  dependency endpoint (such edges are dropped + reported).
- **Constraints** — the full P6 `cstr_type`/`cstr_type2` → SchedulePoint
  `ConstraintType` map (incl. `CS_ALAP` → the `scheduleAsLateAsPossible` flag and
  `CS_EXPFIN` → Expected Finish); an unrecognised kind is dropped + reported; type/date
  pairing is enforced in `validate`.
- **Progress** — `status_code`, actual dates, remaining duration, physical %,
  suspend/resume and expected finish, with the domain's own consistency repairs
  (status derivation, N08/N18, resume ≥ suspend, percent clamps) re-implemented in the
  pure step so the batched write can never trip a DB CHECK.
- **Resources** — `RSRC` → resources, `TASKRSRC` → assignments, `TT_Rsrc` →
  `RESOURCE_DEPENDENT` (ADR-0039/0040). Resources are **org-scoped**, so the commit
  **resolves-or-creates** — one batched, indexed `findMany` matches an existing active
  org resource by code (else name) and reuses it, else batch-inserts the new ones —
  rather than blind-creating (which would collide with the org-unique partial-uniques).
  `validate` guarantees ≤1 driver/activity, MATERIAL-never-drives, and
  `(activity,resource)` de-dup before persistence.

Hardening (M2 review fold): resource/assignment graph ceilings
(`MAX_RESOURCES`/`MAX_ASSIGNMENTS`) alongside the M1 activity/dependency caps; the
enum lookup tables are `Object.hasOwn`-guarded against `__proto__`/`toString`-class
keys; and a defensive `importGraphSchema.safeParse` runs before persistence. The CPM
engine + recalc parity gate remain untouched.

## M3 status — Microsoft Project MSPDI (`.xml`) import (shipped)

M3 adds a **second parser + adapter** for MS Project's MSPDI XML that feeds the _same_
canonical model — proving the ADR's core claim that a new format is a parser, not a
second pipeline. The `@repo/interchange` package gains `mspdi-parser` / `mspdi-calendar`
/ `mspdi-adapter` / `importMspdi`, plus a format-agnostic **`importSchedule`** entry
point that detects XER vs MSPDI from the bytes and routes to the matching orchestrator;
both produce the identical import graph + report, so the `interchange` module and web
dialog stay format-blind (the endpoints call `importSchedule`; the dialog accepts
`.xer` **or** `.xml`). MSPDI is parsed with **`fast-xml-parser`** configured for
untrusted input — `processEntities: false` (no entity expansion → no billion-laughs /
XXE), external entities inert — behind an input **byte cap + node-count cap**
(`DEFAULT_MSPDI_PARSE_CAPS`) and the shared graph-size ceilings. **`.mpp`** (proprietary
binary) is rejected with a message pointing the user to export MSPDI XML. The full
mapping is reused: tasks (incl. `<Summary>`→WBS + outline parentage, milestones, `PT`
durations, constraint types 0–7, progress), `<PredecessorLink>` (link types 0–3, lag),
calendars, resources and assignments. The CPM engine + recalc parity gate remain
untouched. **M4** (best-effort export) follows.

## M4 status — best-effort export (planned; reverses the "export deferred" scope)

- **Date:** 2026-07-21
- **Status of this section:** Accepted for build (product-owner directive to drive interchange to
  completion). Each sub-milestone (M4a–M4d) Accepts with its own slice, mirroring how M1–M3 shipped.

**Scope reversal, recorded in place (not a rewrite of history).** Decision §7 and the Consequences
"neutral/deferred" note listed **export** as an out-of-v1, product-gated follow-on. The product owner has
now directed that export be built. This section **reverses that deferral** and records why and how; the
original text stands as the historical decision, this section supersedes its "export deferred" clause. The
motivating forces are unchanged and, if anything, reinforced by the design:

- **The canonical model was chosen _because_ it is bidirectional.** The ADR's central "one mapping
  contract, N parsers" claim (and the rejection of per-format importers) was explicitly justified by
  export: _"triples once export arrives"_. Export is the payoff the architecture was designed for — the
  same `CanonicalModel` read in reverse, per-format **serialisers** instead of parsers, a
  canonical→domain **importer** replaced by a domain→canonical **exporter**.
- **Round-trip is the strongest correctness gate the interchange work can have.** Export → re-import →
  structural equivalence exercises the whole canonical model against itself, catching mapping asymmetries
  that neither direction's unit fixtures can.
- **Switching-cost value is now two-way.** Import lowers the cost of _adopting_ SchedulePoint; export
  removes the _lock-in_ objection ("can I get my schedule back out?") that blocks adoption in the first
  place. The brief's §8 "XER export / full round-trip = Won't-have _for now_" is exactly the deferred,
  now-activated milestone this ADR named.

**The reverse pipeline mirrors the import one, stage for stage** (all pure, engine-free, in
`@repo/interchange`; the CPM engine + recalc parity golden suite are structurally untouched — export is a
**pure read** and never invokes the engine):

| Import stage (existing)                      | Export stage (M4, this section)                                     |
| -------------------------------------------- | ------------------------------------------------------------------- |
| `parseXer` / `parseMspdi` (bytes → tables)   | `serialiseXer` / `serialiseMspdi` (tables → bytes)                  |
| `adaptXerToCanonical` (tables → canonical)   | `emitXerFromCanonical` (canonical → tables)                         |
| `mapCanonicalToImportGraph` (canonical → SP) | `mapPlanToCanonical` (SP **export graph** → canonical)              |
| `validateAndRepair` (SP graph → valid graph) | export-side **fidelity findings** (unrepresentable detail → report) |
| `importXer` / `importSchedule` orchestrators | `exportXer` / `exportMspdi` / `exportSchedule` orchestrators        |
| thin module `commit` (writes via services)   | thin module `export` (reads via repositories, streams the file)     |

**The mapping contract becomes bidirectional.** The load-bearing table above is now read both ways: every
row that says "hours/days → working-minutes" on import also says "working-minutes → source granularity"
on export, and each **lossy** direction (working-minutes → XER's day/hour units or MSPDI's `PTnHnM`,
richer SchedulePoint calendars → the source's weekday model, SchedulePoint-only concepts with no source
field) is a **fidelity finding** in the same `InterchangeReport` model — export is best-effort with **no
silent loss**, exactly as import is. Round-trip is **structurally equivalent, not byte-identical** where a
lossy coercion applies (the report names each).

**Authorisation, surface, flag.** A new `interchange:export` permission (Viewer + Contributor + Planner +
Org Admin, since export is a read — see the spec's permissions section) gates new **plan-scoped** export
endpoints that stream a `.xer` / `.xml` with the right `Content-Type` + `Content-Disposition`. The web
surface is the **existing** canvas **Export ▾** menu (from the export/print stage) extended with "Primavera
P6 (.xer)" / "MS Project (.xml)" items, self-gated on `interchange:export`, behind the **existing**
`VITE_SCHEDULE_INTERCHANGE` flag (no second entry point, no new flag).

**Sub-milestones** (each a releasable dark slice, mirroring M1–M3): **M4a** XER export of the core network
(project/activities/relationships/calendars) + the export-side report + the round-trip harness; **M4b**
MSPDI export reusing the same canonical export graph (proving the serialiser-not-pipeline claim in
reverse); **M4c** WBS + constraints + progress + resources/assignments parity; **M4d** the web Export-menu
surface + end-to-end round-trip conformance. Full detail in the spec + plan referenced below.

### M4c status — rich-scope export parity (shipped)

- **Date:** 2026-07-21
- **Status:** Accepted with this slice. Both emitters (`emitXerFromCanonical`, `emitMspdiFromCanonical`)
  now serialise the **full plan**, reversing the import adapters field-for-field, so a rich plan
  round-trips (export → re-import → structural equivalence) — not just its core network. The obsolete M4a/
  M4b **drop** findings for WBS / constraints / progress / ALAP / resources / assignments are removed; a
  category reports a finding only when it is **genuinely lossy**, never for data now fully emitted.

Exported dimensions, and where the two formats diverge (each divergence is an **approximation finding**,
never a silent drop):

- **WBS** — a `PROJWBS` row per `WBS_SUMMARY` (reversing the `wbs:<id>` key convention → bare `wbs_id`;
  the parent chain → `parent_wbs_id`, project-root = self/absent) and each real activity's `wbs_id`
  referencing its summary parent (XER); `<Task><Summary>` + `<OutlineLevel>` in pre-order DFS so the
  adapter's summary-stack inference reconstructs the tree (MSPDI). **Round-trips exactly in both.**
- **Constraints** — `cstr_type/date` (+ `cstr_type2/date2`) inverting `CSTR_TYPE_TO_CANONICAL`, ALAP →
  `CS_ALAP`, expected-finish via `reend_date` (XER — **all 8 types + ALAP round-trip exactly**). MSPDI has
  a **single** `<ConstraintType>` slot (`1 = ALAP, 2…7`): the 6 non-mandatory types + ALAP round-trip; the
  **2 mandatory** types have no MSP equivalent (dropped + reported); a **secondary** constraint rides
  `<Deadline>` (only an FNLT finish bound is re-readable) + reported.
- **Progress** — `status_code`/`complete_pct`/`phys_complete_pct`/`complete_pct_type`/`act_start_date`/
  `act_end_date`/`suspend_date`/`resume_date`/`reend_date`/`remain_drtn_hr_cnt` (XER — **exact**). MSPDI
  carries `<PercentComplete>`/`<PhysicalPercentComplete>`/`<ActualStart>`/`<ActualFinish>`/
  `<RemainingDuration>`; it has **no** suspend/resume/expected-finish and one percent-complete measure
  (re-read as duration-based) — those are reported.
- **Resources / assignments** — `RSRC` (inverting `RSRC_TYPE_TO_CANONICAL`) + `TASKRSRC`
  (`target_qty`/`target_qty_per_hr`/`driving_flag`/`act_reg_qty`) — XER round-trips the **driving flag +
  production rate exactly**. MSPDI `<Resources>`/`<Assignments>` carry neither a **driving flag** nor a
  per-assignment **production rate** (both reported); a reserved cost/max-units rate is lossy in both.

The round-trip test harness (`export.fixtures.ts`) gains a rich fixture + a `toComparable` extended over
the new dimensions, with a `format` argument that normalises MSP's two lossy assignment fields on both
sides so an MSPDI round trip still asserts full equality for everything MSP can represent. The API e2e
seeds a rich plan (WBS + constraint + progress + driving assignment) and round-trips it through both
formats. The CPM engine + recalc parity golden suite are untouched (export is a pure read).

## References

- Spec + plan: [`docs/specs/schedule-interchange/feature-spec.md`](../specs/schedule-interchange/feature-spec.md)
  (§4 solution design — the source of this ADR's outline + table) and
  [`implementation-plan.md`](../specs/schedule-interchange/implementation-plan.md)
  (M1 Task 1.1 = this ADR + the package skeleton).
- **M4 export** spec + plan (the reverse pipeline this ADR's M4 section records):
  [`feature-spec-export.md`](../specs/schedule-interchange/feature-spec-export.md) and
  [`implementation-plan-export.md`](../specs/schedule-interchange/implementation-plan-export.md).
- ADR-0019 (shared-package **build contract** — the `@repo/interchange` `dist`/`.d.ts`
  shape), ADR-0034/0035 (engine conformance + the **reject / repair / report**
  contract this pipeline reuses), ADR-0021 (dependency **DAG invariant** — cycles are
  broken, never imported), ADR-0022 (**CPM execution/recalculate** — reused
  unchanged), ADR-0023/0036 (**date convention + working-minute calendars** — the
  duration/lag/calendar target), ADR-0038 (**WBS** parent tree — M2), ADR-0039/0040
  (**resources** — M2), ADR-0009 (**BullMQ** for large-file async), ADR-0012/0016
  (**RBAC + tenancy** — `interchange:import`, Planner + Org Admin, org-scoped).
- Precedent: `packages/engine-conformance` (the pure, engine-free, fixture-tested
package split) + the reference-feature template (`docs/REFERENCE_FEATURE.md`, the
new module's shape).
</content>

</invoke>
