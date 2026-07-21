# Implementation Plan: Schedule interchange — best-effort EXPORT (M4)

- **Feature spec:** [`feature-spec-export.md`](./feature-spec-export.md) (product-owner directed to
  completion; this plan is the build sequence)
- **Status:** Draft
- **Owner:** TBD

> Sequenced as thin vertical slices that keep `main` releasable. Everything ships **dark behind the
> existing `VITE_SCHEDULE_INTERCHANGE`** (web) + the interchange server flag — **no new flag** — flipped on
> only when a sub-milestone's gates (tests, a11y, security, devops, perf) are green (the burn-down ritual).
> Mirrors the M1–M3 import slicing exactly, in reverse.

## Breakdown

```mermaid
flowchart LR
  E[Epic: Schedule interchange] --> M4[M4 best-effort export]
  M4 --> A[M4a XER export: core network + report + round-trip harness]
  A --> B[M4b MSPDI export: same canonical export graph]
  B --> C[M4c parity: WBS · constraints · progress · resources]
  C --> D[M4d web Export ▾ surface + end-to-end round-trip conformance]
```

### Epic

**Schedule interchange** — let planners move schedules **between** SchedulePoint and P6 / MS Project,
best-effort and transparently. M1–M3 delivered import; **M4 delivers the reverse**, activating the
bidirectional canonical model ADR-0050 was designed around and adding a round-trip correctness gate.

---

### Milestone M4a — XER export: core network + report + round-trip harness (dark)

**Outcome:** the pure `@repo/interchange` package can turn a SchedulePoint **export graph** (plan +
calendars + activities + FS/SS/FF/SF relationships) into a valid Primavera `.xer` with an honest fidelity
report, and a **round-trip harness** proves export→re-import structural equivalence for the core network.
The API can read a plan and stream its `.xer`. Behind the flag; no web surface yet (curl/e2e only).

---

#### Feature: `@repo/interchange` export substrate + XER serialiser + round-trip harness

> **Description:** the pure, engine-free export dual of the import pipeline (export graph → canonical →
> XER bytes + report), plus the round-trip conformance harness — the strongest correctness gate.
> **Complexity:** L
> **Dependencies:** ADR-0050 M1 (canonical model, report model, XER parser — reused for round-trip).
> **Risks:** XER dialect strictness (P6 refuses malformed tables) → serialise against real-P6-round-trip
> fixtures + validate by re-parsing with the existing `parseXer`; lossy coercions (minutes → XER units) →
> named findings + round-trip tolerates them.
> **Testing requirements:** exhaustive serialiser unit fixtures; **round-trip** golden tests
> (export→`importSchedule`→structural-equivalence); an XER that re-parses cleanly.

##### Task 4a.1 — ADR-0050 M4 amendment + export-graph model + report docstring (≈ one PR)

- **Description:** amend ADR-0050 in place with the dated **"M4 status — best-effort export"** section
  (reverses "export deferred", records the reverse-pipeline mirror + bidirectional mapping contract);
  define `export-graph.ts` (the package-local SchedulePoint export graph, dual of `import-graph.ts`,
  sharing the enum vocabularies); note the `InterchangeReport` model is now bidirectional (docstring only).
- **Complexity:** M
- **Dependencies:** —
- **Risks:** over-coupling to the import graph → keep `export-graph.ts` separate, share only enums.
- **Testing:** type-check + Zod round-trip of the export-graph schema; a fixture export graph builder for
  downstream tests.
- **Development steps:**
  1. Edit `docs/adr/0050…` M4 section (done in this design pass) + References.
  2. Add `packages/interchange/src/export-graph.ts` (+ Zod, inferred types) and export it from `index.ts`.
  3. Docstring: `report.ts` findings now also describe export-side coercions.
  4. Update `CLAUDE.md` §16 ADR-0050 note; add a changeset (minor, pre-1.0).

##### Task 4a.2 — export-mapper (export graph → canonical) + fidelity findings

- **Description:** `mapPlanToCanonical(exportGraph)` — the dual of `mapper.ts`: domain vocabulary →
  format-neutral canonical model, emitting a `ReportFinding` for every export-side approximation (e.g. a
  SchedulePoint concept with no canonical/foreign home).
- **Complexity:** M
- **Dependencies:** 4a.1
- **Risks:** asymmetry vs. the import mapper → assert `map∘mapPlanToCanonical ≈ identity` on the shared
  vocabulary in tests.
- **Testing:** unit fixtures per entity kind; a findings-coverage test (every lossy field named).
- **Development steps:** implement mapper; emit findings; unit tests; docs.

##### Task 4a.3 — XER emitter + serialiser (canonical → `.xer` bytes)

- **Description:** `emitXerFromCanonical` (canonical → XER table rows) + `xer-serialiser.ts` (rows →
  `ERMHDR` + `%T/%F/%R/%E` blocks, CP1252 encode) for PROJECT/CALENDAR/TASK/TASKPRED; minutes → XER's
  duration/lag units with a named finding where lossy; sanitise/encode untrusted plan text.
- **Complexity:** L
- **Dependencies:** 4a.2; ADR-0036 (working-minutes), ADR-0023 (dates).
- **Risks:** encoding of non-CP1252 characters → substitute + report; P6 strictness → re-parse fixtures.
- **Testing:** serialiser unit fixtures (incl. non-ASCII, milestones, negative lag, empty plan);
  re-parse-with-`parseXer` assertion.
- **Development steps:** emitter; serialiser + encoder; caps; fixtures; docs.

##### Task 4a.4 — `exportXer` orchestrator + round-trip harness

- **Description:** `export-xer.ts` (`exportXer(exportGraph) → { ok, bytes, report } | { ok:false, error }`)
  wiring map→emit→serialise→report + the graph-size ceiling (reuse import's constants). Add the
  **round-trip harness**: export a fixture → `importSchedule` → assert structural equivalence (activity
  codes, (pred,succ,type) triples, calendar working pattern) modulo named lossy coercions.
- **Complexity:** L
- **Dependencies:** 4a.3; ADR-0034 conformance idiom.
- **Risks:** round-trip false-negatives from tolerated loss → define the equivalence relation explicitly +
  document tolerances (hours↔minutes, tenths-of-minute lag).
- **Testing:** orchestrator unit tests; round-trip golden tests across the core-network fixtures.
- **Development steps:** orchestrator; equivalence relation; round-trip harness; goldens; docs.

#### Feature: `interchange` module — read-side ExportService + XER endpoint

> **Description:** the thin, read-only API extension: read a plan via existing repositories into an export
> graph, call `exportXer`, stream the `.xer`.
> **Complexity:** M
> **Dependencies:** 4a.4; existing plan/activity/dependency/calendar repositories.
> **Risks:** N+1 reads over a large plan → batched read methods, mirror import's batched writes; IDOR on
> planId → anti-IDOR scope assertion + tests.
> **Testing requirements:** service unit tests; API e2e (authz matrix, scope, content-type, disposition).

##### Task 4a.5 — `interchange:export` permission + role→permission grant

- **Description:** add `INTERCHANGE_EXPORT = 'interchange:export'` to `interchange-permissions.ts`; grant it
  in `common/auth/org-permissions.ts` to Viewer + Contributor + Planner + Org Admin (CQ-1 default — a read).
- **Complexity:** S
- **Dependencies:** —
- **Risks:** granting a read to too many roles → default is deliberate (export = read of readable data);
  revisit only if CQ-1 flips.
- **Testing:** auth-matrix unit test (each role's `can('interchange:export')`).
- **Development steps:** permission constant; matrix grant; tests; docs (SECURITY_STANDARDS/API note).

##### Task 4a.6 — `ExportService` (read plan → export graph) + XER endpoint

- **Description:** `ExportService.exportPlan(principal, orgSlug, projectId, planId, format)` resolves scope
  (membership→404), asserts `interchange:export`, asserts plan in org+project (anti-IDOR), reads the plan's
  core network via existing repositories (add symmetric `find…ByPlan` read methods where missing) into the
  export graph, calls `exportXer`, returns `{ bytes, filename, report }`. Add the
  `GET …/plans/:planId/interchange/export/:format` route (M4a: `xer` only) streaming the file +
  `Content-Type`/`Content-Disposition`; report surfaced per CQ-2 default (response header / companion route).
- **Complexity:** M
- **Dependencies:** 4a.4, 4a.5
- **Risks:** streaming/encoding pitfalls → e2e asserts bytes + headers; filename injection → derive +
  sanitise from plan name, never client input.
- **Testing:** service unit (scope/authz/anti-IDOR, empty-plan valid export); API e2e (200 file, 403/404
  matrix, 413/422 too-large, content-type/disposition).
- **Development steps:** read methods; ExportService; controller route + OpenAPI decorators; logging; e2e.

---

### Milestone M4b — MSPDI export: same canonical export graph (dark)

**Outcome:** the same export graph serialises to a valid MS Project MSPDI `.xml` — proving, in reverse, the
ADR's "a format is a serialiser, not a second pipeline" claim. The endpoint accepts `format=mspdi`.

#### Feature: MSPDI emitter + serialiser + orchestrator + endpoint format

> **Complexity:** M
> **Dependencies:** M4a (canonical export graph, report, orchestrator shape, endpoint).
> **Risks:** XML escaping / MSPDI schema strictness → build with `fast-xml-parser`'s builder (correct
> escaping) or a carefully-escaped string builder; validate by re-parsing with the M3 `parseMspdi`.
> **Testing:** MSPDI serialiser fixtures; round-trip (export MSPDI → `importSchedule` → equivalence); MS
> Project open smoke (manual, documented).

##### Task 4b.1 — `emitMspdiFromCanonical` + `mspdi-serialiser.ts`

- **Description:** canonical → MSPDI `<Project>`/`<Calendars>`/`<Tasks>`/`<PredecessorLink>`; minutes →
  `PTnHnM` durations/lag (named finding where lossy); UTF-8 XML escaping of untrusted text.
- **Complexity:** M · **Dependencies:** M4a · **Risks:** escaping bugs → fixtures + re-parse assertion.
- **Testing:** serialiser fixtures (non-ASCII, milestones, link types 0–3); `parseMspdi` re-parse.
- **Development steps:** emitter; serialiser; fixtures; docs.

##### Task 4b.2 — `exportMspdi` + `exportSchedule` dispatch + `format=mspdi` route

- **Description:** `export-mspdi.ts` orchestrator; `export-schedule.ts` dispatches on requested format
  (dual of `importSchedule`); wire `mspdi` into the endpoint (`.xml`, `application/xml; charset=utf-8`).
- **Complexity:** M · **Dependencies:** 4b.1 · **Risks:** format dispatch drift → shared result union.
- **Testing:** orchestrator + round-trip goldens; API e2e for `mspdi` (content-type `.xml`, disposition).
- **Development steps:** orchestrators; dispatch; route format; e2e; docs; changeset.

---

### Milestone M4c — parity: WBS · constraints · progress · resources (dark)

**Outcome:** export reaches feature parity with the M2 import scope — WBS summaries + parentage,
constraints, progress, resources + assignments cross both formats, each lossy detail reported.

#### Feature: rich-scope export mapping (both formats)

> **Complexity:** L
> **Dependencies:** M4a + M4b; ADR-0038 (WBS), ADR-0035 §7–§12 (constraints), ADR-0035 §6/ADR-0042
> (progress), ADR-0039/0040 (resources/units).
> **Risks:** SchedulePoint-only concepts (levelling delay, EV curves, per-relationship lag calendars) with
> no foreign home → **dropped + reported**, core network unaffected; asymmetric constraint mapping →
> reuse the M2 import constraint table read in reverse.
> **Testing:** per-entity serialiser fixtures both formats; round-trip goldens extended to WBS/constraints/
> progress/resources; findings-coverage tests (every drop named).

##### Task 4c.1 — WBS + constraints in the export mapper/emitters (both formats)

- **Description:** `WBS_SUMMARY` + `parentId` → PROJWBS / MSPDI outline; constraint type/date (+ secondary,
  ALAP) → `cstr_type`/`cstr_type2` / MSPDI constraint types; extend the export graph + mapper + both
  emitters; report unmapped kinds.
- **Complexity:** L · **Dependencies:** M4b · **Risks:** ALAP/expected-finish edge kinds → reuse M2 tables.
- **Testing:** fixtures + round-trip incl. WBS tree + constraints; findings coverage.
- **Development steps:** graph fields; mapper; emitters; goldens; docs.

##### Task 4c.2 — progress + resources/assignments in the export mapper/emitters (both formats)

- **Description:** actuals/remaining/physical-% → progress tables; `Resource`/`ResourceAssignment` →
  RSRC/TASKRSRC / MSPDI resources+assignments; reserved cost/EV/levelling columns → dropped + reported.
- **Complexity:** L · **Dependencies:** 4c.1 · **Risks:** resource identity (org library) is export-simple
  (read-only) — no resolve-or-create needed; MATERIAL/driver flags preserved.
- **Testing:** fixtures + round-trip incl. progress + resources; findings coverage; graph-size ceilings.
- **Development steps:** graph fields; mapper; emitters; goldens; docs; changeset.

---

### Milestone M4d — web Export ▾ surface + end-to-end round-trip conformance (flip)

**Outcome:** the two items appear in the canvas **Export ▾** menu (self-gated + flag-gated), a planner
downloads `.xer`/`.xml` from the UI with a fidelity summary, and the full export→re-import round-trip is a
green conformance gate. **This is the milestone that flips the value on** for users.

#### Feature: Export-menu items + download hook + round-trip conformance

> **Complexity:** M
> **Dependencies:** M4a–M4c; the export/print stage's Export ▾ menu + `downloadBlob`.
> **Risks:** menu overcrowding / a11y → reuse the existing `MenuSection` + roving-tabindex primitives, one
> new section; capability gating leak → self-gate on `interchange:export`, not just the flag.
> **Testing:** component tests (gated render, disabled states, download trigger); a11y (menu semantics,
> focus, announce); e2e (pick format → file downloads); the round-trip conformance suite green in CI.

##### Task 4d.1 — `useExportPlan` hook + toolbar `exportInterchange` command

- **Description:** a hook that GETs the export URL, downloads via `downloadBlob`, surfaces the report
  (CQ-2); add `exportInterchange('xer'|'mspdi')` + `canExportInterchange` to the toolbar context.
- **Complexity:** S · **Dependencies:** 4a.6 (+ 4b.2) · **Risks:** report-shape drift → reuse
  `interchangeReportSchema`.
- **Testing:** hook unit (download trigger, error mapping); context command test.
- **Development steps:** hook; context command + capability; tests; docs.

##### Task 4d.2 — Export ▾ "Interchange" section (self-gated + flag-gated)

- **Description:** add the "Interchange" `MenuSection` with the two items to `ExportMenuControl`, rendered
  only when `SCHEDULE_INTERCHANGE_ENABLED` and the caller holds `interchange:export`; reuse the
  shade-don't-hide empty/uncomputed disabled pattern + the PDF-style in-flight spinner.
- **Complexity:** S · **Dependencies:** 4d.1 · **Risks:** one-off styling → design-system primitives only.
- **Testing:** component tests (gated on flag + capability, disabled reasons, both formats); a11y audit.
- **Development steps:** menu items; gating; states; component + a11y tests; docs.

##### Task 4d.3 — end-to-end round-trip conformance gate + flip

- **Description:** wire the export→re-import round-trip across the full fixture suite as a CI gate (pure
  package + an API e2e that exports a seeded plan and re-imports it); document the tolerances; flip
  `VITE_SCHEDULE_INTERCHANGE` export items on when all gates (tests, a11y, security, devops, perf) are
  green.
- **Complexity:** M · **Dependencies:** 4d.2 · **Risks:** flaky e2e → deterministic seeded plan, no clock.
- **Testing:** conformance suite green; API e2e round-trip; perf check on a 2,000-activity export.
- **Development steps:** conformance wiring; e2e; perf measure; docs (API.md, TOOLBAR_ROADMAP); changeset;
  flip.

## Sequencing & slices

M4a → M4b → M4c → M4d, each independently valuable and releasable **dark**. M4a establishes the pure export
substrate + XER + the round-trip harness (the correctness backbone) and a curl-testable endpoint; M4b adds
MSPDI on the same graph; M4c reaches M2-scope parity; M4d adds the user-facing menu + flips the value on.
Everything ships behind the **existing** `VITE_SCHEDULE_INTERCHANGE` flag + interchange server flag — **no
new flag**. `main` stays releasable at every task (flag-off = byte-for-byte today's product). Recommended
review agents per slice: **database-architect** (n/a — no schema, but confirm the read methods),
**api-reviewer** + **security-reviewer** (endpoints, authz, anti-IDOR, encoding, filename) on M4a.6/M4b.2,
**backend-performance-reviewer** (batched reads, ceiling, async decision) on M4a.6/M4c.2,
**test-engineer** (round-trip harness) throughout, **component-reviewer** + **accessibility-reviewer** +
**ux-reviewer** on M4d.

## Definition of Done (per task)

Each task's PR must satisfy the Feature Completion Criteria in [`docs/PROCESS.md`](../../PROCESS.md) (code,
tests ≥80% changed lines, docs incl. ADR-0050 M4 note + API.md, security review, performance, accessibility
for the menu, Docker build, CI green, changeset, version impact — minor pre-1.0).

## Risks & assumptions (rollup)

| Risk / assumption                                                   | Likelihood | Impact | Mitigation                                                                                                |
| ------------------------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------- |
| Exported file rejected by real P6 / MS Project (dialect strictness) | med        | high   | Serialise against real-tool round-trip fixtures; re-parse with `parseXer`/`parseMspdi`; manual open smoke |
| Round-trip false-negatives from tolerated lossy coercions           | med        | med    | Explicit, documented equivalence relation + tolerances (hours↔minutes, tenths-of-minute lag)              |
| Export exposes data a role shouldn't read (authz gap)               | low        | high   | Deny-by-default `interchange:export`, org-scope + anti-IDOR, full authz e2e matrix                        |
| Untrusted plan text breaks XER/XML output or enables injection      | low        | med    | CP1252 encode + substitute-and-report; XML escape via builder; filename derived+sanitised                 |
| Large plan blows the synchronous request budget                     | low        | med    | Graph-size ceiling (reuse import constants) → clean rejection; async deferred to a later slice (CQ-3)     |
| Assumption: export is a pure read (no engine, no recalc, no pen)    | —          | high   | Structural: export never imports the engine or a write path; asserted by tests                            |
| Assumption: Viewer may export (CQ-1)                                | —          | med    | Default in the matrix; a single grant flip if the product owner decides read-only ≠ export                |

## Critical questions (defaults stated; only these change design/scope)

1. **CQ-1 — Does Viewer get `interchange:export`?** _Default: **yes**_ — export is a read of data a Viewer
   can already see on the canvas, so it follows plan-read, not hierarchy-write. Flip to Contributor+ only if
   the product owner treats "download the whole schedule as a file" as more sensitive than on-screen read.
2. **CQ-2 — Is the fidelity report shown before download (dry-run style) or bundled with/after it?**
   _Default: **bundled after**_ — a single `GET` streams the file and returns the report (response header or
   a companion report route); the web shows a post-download "what changed" summary. (Import needs a
   pre-write dry-run because it mutates; export mutates nothing, so a blocking pre-confirm is unnecessary
   friction. Offer a pre-download preview only if planners ask.)
3. **CQ-3 — Synchronous-only at M4, or async-for-large from the start?** _Default: **synchronous-only**_
   with a graph-size ceiling (reuse import's `MAX_*`); async via BullMQ (ADR-0009) is a clean later slice,
   exactly as import treated large files.
4. **CQ-4 — Round-trip bar = structural equivalence accepting named lossy coercions (not byte-identity)?**
   _Default: **yes**_ — byte-identity is impossible across hours↔minutes and tenths-of-minute lag; the gate
   asserts structural equivalence (activity codes, (pred,succ,type) triples, calendar working pattern) with
   documented tolerances, each loss named in the report.
5. **CQ-5 — Does an empty plan export a valid (task-less) file or return an error?** _Default: **valid
   empty file**_ (project + calendars, zero tasks) — the menu item is shaded anyway, but a forced call
   yields a valid file, not an error.

Non-critical decisions (format in path vs. query, exact `Content-Type` for XER, MSPDI builder library
choice, report-transport header vs. companion route) have stated defaults in the spec §4 and do **not**
block the build.
