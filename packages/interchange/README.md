# @repo/interchange

The **pure, engine-free schedule-interchange substrate** for SchedulePoint (ADR-0050) — the half of the
XER / MS Project **import** feature that needs no database, no HTTP, and no engine. Persistence,
authorisation and orchestration live in the thin NestJS `interchange` module (a later M1 task) that
consumes this package's compiled build (ADR-0019) and reuses existing domain services. This mirrors the
`packages/engine-conformance` (pure) + `apps/api` (harness) split (ADR-0034).

## What's here

```text
src/
  canonical.ts   # the FORMAT-AGNOSTIC canonical model (project/activity/relationship/calendar)
                 #   + Zod schemas — M1 network scope only (WBS/constraints/progress/resources = M2)
  report.ts      # the InterchangeReport (detected format/version, mapped counts, approximations,
                 #   repairs, drops) — the runtime instance of the ADR-0050 mapping contract
  index.ts       # barrel
```

Still to land in M1 (kept out of this skeleton — Tasks 1.2/1.3):

- an **XER parser** (`ERMHDR` signature/version, `%T/%F/%R` table blocks, CP1252 decode) → canonical,
- a **mapper** canonical → SchedulePoint import-DTO graph, and
- the **validate / repair / report** step (ADR-0035: dangling edge, duplicate `(pred,succ,type)`,
  cycle-break, duplicate code, unit coercion) that emits the `InterchangeReport`.

MSPDI (`.xml`, via `fast-xml-parser`) is M3; export and `.mpp` are explicit, out-of-v1 follow-ons.

## Usage

```ts
import { canonicalModelSchema, interchangeReportSchema } from '@repo/interchange';
import type { CanonicalModel, InterchangeReport } from '@repo/interchange';

const model: CanonicalModel = canonicalModelSchema.parse(rawFromParser);
const report: InterchangeReport = interchangeReportSchema.parse(rawReport);
```

The Zod schemas are **shared** with the web import review dialog (feature spec §2), so the client and
the package validate the same shapes.

## Design rules (ADR-0050)

- **Pure and engine-free.** No side effects, no Prisma, no `apps/api` import. The CPM engine and the
  recalculate **parity golden suite are untouched** — interchange has no path to them.
- **One canonical model, N parsers.** Every format is parsed into the same graph; the mapper and the
  validate/repair/report step speak only canonical.
- **No silent data loss.** Every source entity is mapped (counted) or named in the report as
  approximated / repaired / dropped, with a reason. The report shape is extensible (open `entity`
  string) so M2 adds report entries, not a schema change.
- **Working-minutes + ADR-0023 dates.** Durations/lags are already normalised to working-minutes
  (ADR-0036) by the time they reach the canonical model.

## How CI uses it

`pnpm test` (via Turbo) runs this package's Vitest suite in the standard quality job — no database, no
browser, no engine. `pnpm build` emits the `dist` + `.d.ts` the API and web typecheck against
(ADR-0019).
