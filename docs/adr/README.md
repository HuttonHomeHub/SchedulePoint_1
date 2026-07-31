# Architecture Decision Records (ADRs)

This directory holds our Architecture Decision Records — short documents that
capture a significant, architecturally-relevant decision, its context, and its
consequences. The practice itself is described in
[ADR-0001](0001-record-architecture-decisions.md).

## Why

Decisions have long lifespans and their rationale is easily lost. ADRs give
future maintainers (human or AI) the _why_, not just the _what_.

## Conventions

- One decision per file, named `NNNN-title-in-kebab-case.md` (zero-padded,
  monotonically increasing).
- Statuses: `Proposed`, `Accepted`, `Superseded by ADR-XXXX`, `Deprecated`.
- **ADRs are immutable once accepted.** To change a decision, add a new ADR that
  supersedes the old one; update the old one's status to point at it. Never
  delete an ADR.
- Use [`_template.md`](_template.md) as the starting point.

## Index

| ADR                                                                       | Title                                              | Status             |
| ------------------------------------------------------------------------- | -------------------------------------------------- | ------------------ |
| [0001](0001-record-architecture-decisions.md)                             | Record architecture decisions                      | Accepted           |
| [0002](0002-monorepo-with-turborepo-and-pnpm.md)                          | Monorepo with Turborepo and pnpm                   | Accepted           |
| [0003](0003-authentication-with-better-auth.md)                           | Authentication with Better Auth                    | Accepted           |
| [0004](0004-frontend-state-management.md)                                 | Frontend state management                          | Accepted           |
| [0005](0005-routing-with-tanstack-router.md)                              | Routing with TanStack Router                       | Accepted           |
| [0006](0006-styling-and-design-tokens.md)                                 | Styling and design tokens                          | Accepted           |
| [0007](0007-forms-and-validation.md)                                      | Forms and validation                               | Accepted           |
| [0008](0008-backend-modular-monolith.md)                                  | Backend modular monolith                           | Accepted           |
| [0009](0009-background-processing-bullmq.md)                              | Background processing (BullMQ)                     | Accepted           |
| [0010](0010-caching-with-redis.md)                                        | Caching with Redis                                 | Accepted           |
| [0011](0011-object-storage-abstraction.md)                                | Object storage abstraction                         | Accepted           |
| [0012](0012-authorization-rbac-scoped.md)                                 | Authorisation: RBAC + scoping                      | Accepted           |
| [0013](0013-observability-otel-pino.md)                                   | Observability (OTel + Pino)                        | Accepted           |
| [0014](0014-reference-feature-as-non-shipping-template.md)                | Reference feature → non-shipping template          | Superseded by 0057 |
| [0015](0015-template-driven-feature-development.md)                       | Template-driven feature development                | Superseded by 0057 |
| [0016](0016-core-identity-tenancy-role-model.md)                          | Core identity & tenancy role model                 | Accepted           |
| [0017](0017-release-tagging-and-image-publishing.md)                      | Release tagging & image publishing                 | Accepted           |
| [0018](0018-self-migrating-container-image.md)                            | Self-migrating container image                     | Accepted           |
| [0019](0019-shared-package-build-contract.md)                             | Shared-package build contract                      | Accepted           |
| [0020](0020-ci-image-smoke-boot.md)                                       | CI image build & smoke-boot                        | Accepted           |
| [0021](0021-dependency-graph-dag-invariant.md)                            | Dependency graph DAG invariant                     | Accepted           |
| [0022](0022-cpm-execution-and-persistence-model.md)                       | CPM execution & persistence model                  | Accepted           |
| [0023](0023-cpm-scheduling-date-convention.md)                            | CPM scheduling date convention                     | Accepted           |
| [0024](0024-working-day-calendars.md)                                     | Working-day calendars                              | Accepted           |
| [0025](0025-baselines-snapshot-and-variance.md)                           | Baselines — snapshot & variance                    | Accepted           |
| [0026](0026-tsld-canvas-rendering-and-architecture.md)                    | TSLD canvas rendering & architecture               | Accepted           |
| [0027](0027-per-package-release-tagging.md)                               | Per-package release tagging & versions             | Accepted           |
| [0028](0028-plan-edit-lock.md)                                            | Single-editor plan edit-lock                       | Accepted           |
| [0029](0029-persistent-hierarchy-navigator.md)                            | Persistent app-shell & hierarchy navigator         | Proposed           |
| [0030](0030-canvas-first-plan-workspace.md)                               | Canvas-first plan workspace                        | Proposed           |
| [0031](0031-tsld-toolbar-registry-and-taxonomy.md)                        | TSLD toolbar-item registry & taxonomy              | Proposed           |
| [0032](0032-canvas-first-plan-authoring.md)                               | Canvas-first plan authoring                        | Proposed           |
| [0033](0033-scheduling-modes-and-canvas-planning.md)                      | Scheduling modes & a de-overloaded plan start      | Accepted           |
| [0034](0034-engine-conformance-methodology.md)                            | Engine conformance & validation methodology        | Accepted           |
| [0035](0035-schedulepoint-cpm-semantics.md)                               | SchedulePoint CPM semantics (golden contract)      | Proposed           |
| [0036](0036-hour-granular-calendars-and-durations.md)                     | Hour/shift-granular calendars & durations          | Accepted           |
| [0037](0037-per-activity-calendars-and-instant-axis.md)                   | Per-activity calendars & the instant axis          | Accepted           |
| [0038](0038-wbs-activity-hierarchy.md)                                    | WBS activity hierarchy (parent tree)               | Accepted           |
| [0039](0039-resource-model-and-resource-calendar-scheduling.md)           | Resource model & resource-calendar scheduling      | Accepted           |
| [0040](0040-duration-types-and-resource-units.md)                         | Duration types & the resource-units model          | Accepted           |
| [0041](0041-resource-levelling.md)                                        | Resource levelling (opt-in second pass)            | Accepted           |
| [0042](0042-percent-complete-types-and-earned-value.md)                   | Percent-complete types & Earned Value              | Accepted           |
| [0043](0043-inter-project-external-dates.md)                              | Inter-project external dates (M1)                  | Accepted           |
| [0044](0044-resource-curves-accrual-steps.md)                             | Resource curves, cost accrual & weighted steps     | Accepted           |
| [0045](0045-live-cross-plan-programme-scheduling.md)                      | Live cross-plan / programme scheduling (M2)        | Accepted           |
| [0046](0046-polymorphic-entity-notes.md)                                  | Polymorphic entity notes                           | Accepted           |
| [0047](0047-automatic-redeploy-on-release.md)                             | Automatic redeploy of released images              | Accepted           |
| [0048](0048-undo-redo-command-stack.md)                                   | Client-side command-stack undo/redo                | Accepted           |
| [0049](0049-canvas-axis-aligned-resource-strip.md)                        | Canvas-axis-aligned resource strip                 | Proposed           |
| [0050](0050-schedule-interchange-canonical-model.md)                      | Schedule interchange: canonical model + import     | Accepted           |
| [0051](0051-external-guest-share-links.md)                                | External-Guest per-plan share links                | Accepted           |
| [0052](0052-canvas-direct-manipulation-and-visual-refresh.md)             | TSLD direct manipulation & visual refresh          | Accepted           |
| [0053](0053-calendar-scoping-and-resource-management.md)                  | Calendar scoping tiers & resource management       | Accepted           |
| [0054](0054-canvas-live-feedback-and-float-visualisation.md)              | Canvas live feedback & float visualisation         | Accepted           |
| [0055](0055-designed-chrome-and-canvas-visual-language.md)                | Surface scopes, designed chrome & canvas UI        | Accepted           |
| [0056](0056-tsld-time-axis-legibility-and-preset-framing.md)              | TSLD time-axis legibility & preset framing         | Accepted           |
| [0057](0057-real-modules-replace-the-reference-template.md)               | Real modules replace the reference template        | Accepted           |
| [0058](0058-drift-control-and-the-reconciliation-pass.md)                 | Drift control & the reconciliation pass            | Accepted           |
| [0059](0059-gantt-view-rendering-substrate-and-the-view-seam.md)          | Gantt view: rendering substrate & view seam        | Accepted           |
| [0060](0060-tabbed-activity-editor-and-per-scope-save.md)                 | Tabbed activity editor & per-scope save            | Accepted           |
| [0061](0061-dialog-layout-system.md)                                      | Dialog layout: form primitives & two-pane editor   | Accepted           |
| [0062](0062-activity-editor-convergence-logic-resources-notes-as-tabs.md) | Activity-editor convergence: Logic/Resources/Notes | Accepted           |
| [0063](0063-pinned-wbs-band-and-the-canvas-band-model.md)                 | The pinned WBS band & the canvas band model        | Accepted           |
| [0064](0064-canvas-authoring-flow.md)                                     | Canvas authoring flow & recalculation quiescence   | Accepted           |
| [0065](0065-canvas-link-routing.md)                                       | Canvas link routing: orthogonal corridors          | Accepted           |
| [0066](0066-the-seed-catalogue-and-the-engine-as-oracle.md)               | The seed catalogue & the engine as oracle          | Accepted           |
