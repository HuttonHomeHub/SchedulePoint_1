# M1-T0 — Measurement record

Evidence for [`implementation-plan.md`](implementation-plan.md) task M1-T0 (ADR-0113, ADR-0142): the
problem is measured before the remedy is built. Nothing here changes the product.

**Command** (run by the orchestrator, from the repository root, with the API and web dev server
available — the harness starts them if they are not already running):

```sh
pnpm --filter @repo/web measure:gantt --grep "M1-T0"
```

Spec: `apps/web/measure-gantt/column-truncation.spec.ts`. Output (gitignored):
`apps/web/measure-output/gantt-column-truncation.json` and `gantt-column-truncation.md`.

Fixture: ten activities with 15-character codes and up to three predecessors each, seeded through the
REST API by the spec (`docs/TEST_PLAYBOOK.md`'s `plan:scale-500` has short codes and single
predecessors). Viewports: 1646, 1024 and 390 px, each limb in a fresh browser context.

## (a) Truncated Code / Predecessors / other fixed-width cells at default widths

Results: pending — run by the orchestrator.

## (b) `barRegionWidth` against the visible chart after a `Grid width` drag

Results: pending — run by the orchestrator.

## (c) The Gantt at 390 px, where the fixed columns exceed the scroller

Results: pending — run by the orchestrator.

## (d) Touch drag of the `Grid width` separator

Results: pending — run by the orchestrator.
