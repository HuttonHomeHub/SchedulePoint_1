# Implementation Plan: Schedule interchange (XER + MS Project import)

- **Feature spec:** `docs/specs/schedule-interchange/feature-spec.md` (Stage C2; awaiting approval)
- **Status:** Draft
- **Owner:** TBD

> Sequenced as thin vertical slices that keep `main` releasable. **Import-first** per the brief's MoSCoW
> (CQ-2); everything ships **dark behind `VITE_SCHEDULE_INTERCHANGE`** (web) + a server flag, flipped on
> only when a milestone's gates (tests, a11y, security, devops, perf) are green — the burn-down ritual.

## Breakdown

```mermaid
flowchart LR
  E[Epic: Schedule interchange] --> M1[M1 XER import: core network]
  M1 --> M2[M2 XER import: WBS · constraints · progress · resources]
  M2 --> M3[M3 MSPDI .xml import]
  M3 --> M4[M4 (optional, product-gated) best-effort export]
```

### Epic

**Schedule interchange** — let planners bring existing P6 / MS Project schedules into SchedulePoint
(best-effort, transparent), lowering switching cost (brief §8 Should-have / §17 risk). Maps to the
toolbar-placeholder burn-down (Stage C2) and the brief's interchange theme.

---

### Milestone M1 — XER import: core network (dark)

**Outcome:** a Planner uploads a single-project `.xer`, reviews an honest dry-run report, confirms, and
gets a new plan containing activities + relationships + calendars, recalculated and open on the canvas.
Behind the flag (default off). Establishes the package, the ADR, the pipeline, and the review UI.

---

#### Feature: `@repo/interchange` package + ADR-0050 + XER→network mapping

> **Description:** the pure, engine-free parse→canonical→map→validate/repair→report substrate for XER's
> core network (PROJECT/TASK/TASKPRED/CALENDAR), plus the architectural ADR.
> **Complexity:** L
> **Dependencies:** none new in the product.
> **Risks:** XER dialect/version variance → pin to fixtures from real P6 exports, version-gate + report;
> mapping fidelity → validate against engine-conformance schedules re-expressed as XER.
> **Testing requirements:** exhaustive unit fixtures (valid, malformed, dangling, dup, cyclic, encoding);
> round-trip parity vs native-built plans.

##### Task 1.1 — ADR-0050 + `@repo/interchange` skeleton (≈ one PR)

- **Description:** write ADR-0050 (canonical model, pipeline, package split, import-first, `.mpp`
  excluded, mapping-table contract); scaffold `packages/interchange` (build contract per ADR-0019),
  canonical model types + Zod, shared `@repo/types` where cross-boundary.
- **Complexity:** M
- **Dependencies:** —
- **Risks:** over-designing the canonical model → keep it to M1's network scope, extend per milestone.
- **Testing:** type-check + a trivial round-trip unit test; CI wiring for the new package.
- **Development steps:**
  1. Draft ADR-0050 from the spec §4 outline; get it reviewed (architectural sign-off).
  2. Scaffold the package (tsconfig/eslint presets, build, exports).
  3. Define the canonical interchange model + validation types; document the mapping table.
  4. Update `CLAUDE.md` §4/§16 and add a changeset.

##### Task 1.2 — XER parser (pure)

- **Description:** tokenise XER (`ERMHDR`, `%T/%F/%R/%E` table blocks, CP1252 decode) into typed rows for
  PROJECT/CALENDAR/TASK/TASKPRED; format + version detection; hard-reject non-XER.
- **Complexity:** M
- **Dependencies:** 1.1
- **Risks:** encoding/edge rows → fixture-driven; entity/size caps for safety.
- **Testing:** unit fixtures incl. truncated/garbage/large; detection + version cases.
- **Development steps:** parser + detector; caps; fixtures; docs.

##### Task 1.3 — Mapper + validate/repair/report (network scope)

- **Description:** map canonical XER → SchedulePoint import DTO graph (plan + activities + FS/SS/FF/SF
  deps + calendars→shifts/exceptions); apply ADR-0035 reject/repair/report (dangling, dup `(pred,succ,
type)`, cycle-break, dup-code, unit coercion → minutes); emit `InterchangeReport`.
- **Complexity:** L
- **Dependencies:** 1.2; DAG invariant (ADR-0021), calendars (ADR-0036), date convention (ADR-0023).
- **Risks:** cycle-break choice non-deterministic → deterministic edge selection + report; calendar
  fidelity → report non-expressible detail.
- **Testing:** mapper unit fixtures; **round-trip parity** vs native plans on conformance schedules.
- **Development steps:** mapper; validators; report builder; parity fixtures; docs.

#### Feature: `interchange` API module (dry-run + commit)

> **Description:** the thin NestJS module (copied from the reference template) exposing dry-run + commit,
> enforcing `interchange:import` + target-project org scope, and persisting via existing services.
> **Complexity:** L
> **Dependencies:** the package feature; hierarchy/activities/dependencies/calendars services; recalc.
> **Risks:** untrusted-file security; transaction size → batched creates + single recalc (ADR-0022).
> **Testing:** API e2e (dry-run/commit/authz/caps/malformed/malicious); security-reviewer sign-off.

##### Task 1.4 — Module + permissions + upload/dry-run endpoint

- **Description:** copy the reference template into `modules/interchange/`; add `interchange-permissions.ts`
  (`interchange:import` → Planner+Org Admin); multipart upload + caps; `dry-run` → report (no write).
- **Complexity:** M
- **Dependencies:** 1.3
- **Risks:** IDOR on target project → service org-scope check after load.
- **Testing:** e2e authz (role + org), caps, unrecognised/malformed → correct statuses; unit service tests.
- **Development steps:** module/DI; permissions; controller (thin) + DTOs; upload guardrails; OpenAPI;
  `API.md`; changeset.

##### Task 1.5 — Commit endpoint (create plan, recalc, audit)

- **Description:** `commit` creates plan+calendars+activities+deps in one txn via existing services, runs
  recalculate, returns `{ planId, report }`; optional `interchange_import` audit/report row
  (database-architect); structured events.
- **Complexity:** M
- **Dependencies:** 1.4; database-architect (if the audit table lands).
- **Risks:** partial write on failure → single txn + rollback; large graphs → batched writes.
- **Testing:** e2e commit → plan exists + recalculated + report; failure → nothing created;
  backend-performance-reviewer on write/recalc cost.
- **Development steps:** service orchestration + txn; (optional) migration; recalc; logging; tests; docs.

#### Feature: Import review UI (web, flagged)

> **Description:** the "Import from file…" entry + dry-run **review dialog** + commit + open-plan, behind
> `VITE_SCHEDULE_INTERCHANGE` + `interchange:import`.
> **Complexity:** M
> **Dependencies:** 1.4/1.5 endpoints; Project Explorer plan-create surface; Dialog primitive.
> **Risks:** a11y of the report table + progress; keep flag-off byte-identical.
> **Testing:** component (states + gating + flag-off), e2e/a11y (keyboard upload→review→confirm→open + announce).

##### Task 1.6 — Entry point + review dialog + wiring

- **Description:** `features/interchange/` (api hooks, Zod, components); "Import from file…" on the
  new-plan menu; review dialog (picker + target project + report table + confirm/cancel + download report);
  open the created plan; flag + `.env.example` + `vite-env.d.ts`.
- **Complexity:** M
- **Dependencies:** M1 API.
- **Risks:** flag-off regressions → default-off reader; report table a11y → accessibility-reviewer.
- **Testing:** component + e2e/a11y as above; flag-off snapshot unchanged.
- **Development steps:** flag; hooks; dialog + states; entry point; announcements; ux/a11y review; changeset.

---

### Milestone M2 — XER import: WBS · constraints · progress · resources

**Outcome:** imports now carry the WBS tree, primary+secondary constraints, progress + data date, and
resources/assignments — a materially complete P6 import. Extends the package + report; small additive PRs.

- **Feature: WBS + constraints + progress mapping** (M) — `PROJWBS`→`WBS_SUMMARY` + `parentId` tree
  (ADR-0038, acyclic/same-plan/summary-carries-no-logic invariants); constraints incl. secondary
  (ADR-0035 §10) with unsupported-kind coercion+report; progress (`act_*`, `remain_drtn`, `phys_complete`)
  - project data date (ADR-0035 M2). Tests: mapper fixtures + round-trip parity incl. progressed schedules.
- **Feature: Resources + assignments mapping** (M) — `RSRC`→`Resource` (kind; MATERIAL never a driver),
  `TASKRSRC`→`ResourceAssignment` (budgeted units, driving flag, units/time where present; ADR-0039/0040);
  reuse the resources service to persist. Tests: mapper fixtures + parity where resources drive dates.
- Each ships behind the same flag; the report grows a section per new area.

---

### Milestone M3 — MSPDI (`.xml`) import

**Outcome:** the same review→commit pipeline accepts MS Project MSPDI XML.

- **Feature: MSPDI parser + mapper** (L) — add `fast-xml-parser` (MIT; XXE/entity-expansion off, node cap;
  devops-reviewer), parse `<Project>/<Task>/<PredecessorLink>/<Calendar>/<Resource>/<Assignment>` into the
  **same canonical model**, reuse the M1/M2 validate/repair/report + commit unchanged; reject `.mpp` with a
  guiding message (CQ-3). Tests: MSPDI fixtures + round-trip parity; malicious-XML tests. Web: extend the
  picker allow-list to `.xml`; no new UI.

---

### Milestone M4 — Best-effort export (OPTIONAL · product-gated)

**Outcome (only if the CQ-2 decision opens it):** serialise a plan back to XER and/or MSPDI, resolving the
`export` toolbar placeholder's XER/MSP note. Reuses the canonical model in reverse (map SchedulePoint →
canonical → serialise). **Explicitly deferred** and contradicts the brief's current Won't-have; do not
build without a product decision.

- **Feature: XER/MSPDI serialisers + `interchange:export` + Export▾ menu items** (L) — pure serialisers;
  a read-egress permission (any viewer, like CSV); add "Schedule (XER)" / "Schedule (MS Project XML)" to
  the existing `export` menu (Stage C1). Tests: serialise→re-import round-trip; a11y.

## Sequencing & slices

1. **M1** first and whole (package + ADR + XER network + API + review UI) — the switching-cost core; flip
   the flag on when green. 2. **M2** additive mapping (WBS/constraints/progress, then resources) — each a
   small PR, report grows. 3. **M3** MSPDI reuses the pipeline. 4. **M4** only if product opens export.
   Every slice keeps `main` releasable; nothing touches the CPM engine or the recalc parity golden suite.

## Definition of Done (per task)

Each task's PR must satisfy the Feature Completion Criteria in [`docs/PROCESS.md`](../../PROCESS.md) (code,
tests ≥ 80% on changed code, docs, security review, performance, accessibility, Docker build, CI green,
changeset, version impact). Interchange PRs additionally require: **security-reviewer** (untrusted-file
parsing, RBAC/IDOR, caps), **api-reviewer** (endpoints/envelopes/OpenAPI), **backend-performance-reviewer**
(commit/recalc cost, no N+1), **database-architect** (if the audit table lands), **devops-reviewer** (the
XML-parser dependency licence/SBOM), and **accessibility-reviewer** (the review dialog).

## Risks & assumptions (rollup)

| Risk / assumption                                                      | Likelihood | Impact | Mitigation                                                                             |
| ---------------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------- |
| XER dialect/version variance breaks parsing                            | med        | med    | fixtures from real P6 exports; version-gate + report; reject unknown clearly           |
| Mapping introduces scheduling drift vs P6                              | med        | high   | round-trip parity vs conformance schedules; document every approximation in the report |
| Untrusted-file parsing (XXE / entity-expansion / oversized)            | med        | high   | entity expansion off, byte + node caps, encoding handling; security-reviewer gate      |
| "Best-effort" perceived as silent data loss                            | med        | med    | mandatory pre-commit dry-run report; no silent drops (ADR-0035 contract)               |
| Scope creep toward full P6 parity / `.mpp` / merge                     | high       | med    | brief §3/§8 boundaries; `.mpp` + merge + export explicitly out of v1 (CQ-3/4/2)        |
| Large-file commit blocks the request                                   | low        | med    | sync threshold + BullMQ job (ADR-0009); batched writes + single recalc                 |
| **Assumption:** import target is always a NEW plan (CQ-4)              | —          | —      | confirmed default; merge is a separate future feature                                  |
| **Assumption:** TS parsers (not a Python worker) are sufficient (CQ-5) | —          | —      | XER=text, MSPDI=XML; revisit only if `.mpp`/JVM is ever pursued                        |

</content>
