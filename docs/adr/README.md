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

| ADR                                                                         | Title                                                                   | Status             |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------ |
| [0001](0001-record-architecture-decisions.md)                               | Record architecture decisions                                           | Accepted           |
| [0002](0002-monorepo-with-turborepo-and-pnpm.md)                            | Monorepo with Turborepo and pnpm                                        | Accepted           |
| [0003](0003-authentication-with-better-auth.md)                             | Authentication with Better Auth                                         | Accepted           |
| [0004](0004-frontend-state-management.md)                                   | Frontend state management                                               | Accepted           |
| [0005](0005-routing-with-tanstack-router.md)                                | Routing with TanStack Router                                            | Accepted           |
| [0006](0006-styling-and-design-tokens.md)                                   | Styling and design tokens                                               | Accepted           |
| [0007](0007-forms-and-validation.md)                                        | Forms and validation                                                    | Accepted           |
| [0008](0008-backend-modular-monolith.md)                                    | Backend modular monolith                                                | Accepted           |
| [0009](0009-background-processing-bullmq.md)                                | Background processing (BullMQ)                                          | Accepted           |
| [0010](0010-caching-with-redis.md)                                          | Caching with Redis                                                      | Accepted           |
| [0011](0011-object-storage-abstraction.md)                                  | Object storage abstraction                                              | Accepted           |
| [0012](0012-authorization-rbac-scoped.md)                                   | Authorisation: RBAC + scoping                                           | Accepted           |
| [0013](0013-observability-otel-pino.md)                                     | Observability (OTel + Pino)                                             | Accepted           |
| [0014](0014-reference-feature-as-non-shipping-template.md)                  | Reference feature → non-shipping template                               | Superseded by 0057 |
| [0015](0015-template-driven-feature-development.md)                         | Template-driven feature development                                     | Superseded by 0057 |
| [0016](0016-core-identity-tenancy-role-model.md)                            | Core identity & tenancy role model                                      | Accepted           |
| [0017](0017-release-tagging-and-image-publishing.md)                        | Release tagging & image publishing                                      | Accepted           |
| [0018](0018-self-migrating-container-image.md)                              | Self-migrating container image                                          | Accepted           |
| [0019](0019-shared-package-build-contract.md)                               | Shared-package build contract                                           | Accepted           |
| [0020](0020-ci-image-smoke-boot.md)                                         | CI image build & smoke-boot                                             | Accepted           |
| [0021](0021-dependency-graph-dag-invariant.md)                              | Dependency graph DAG invariant                                          | Accepted           |
| [0022](0022-cpm-execution-and-persistence-model.md)                         | CPM execution & persistence model                                       | Accepted           |
| [0023](0023-cpm-scheduling-date-convention.md)                              | CPM scheduling date convention                                          | Accepted           |
| [0024](0024-working-day-calendars.md)                                       | Working-day calendars                                                   | Accepted           |
| [0025](0025-baselines-snapshot-and-variance.md)                             | Baselines — snapshot & variance                                         | Accepted           |
| [0026](0026-tsld-canvas-rendering-and-architecture.md)                      | TSLD canvas rendering & architecture                                    | Accepted           |
| [0027](0027-per-package-release-tagging.md)                                 | Per-package release tagging & versions                                  | Accepted           |
| [0028](0028-plan-edit-lock.md)                                              | Single-editor plan edit-lock                                            | Accepted           |
| [0029](0029-persistent-hierarchy-navigator.md)                              | Persistent app-shell & hierarchy navigator                              | Proposed           |
| [0030](0030-canvas-first-plan-workspace.md)                                 | Canvas-first plan workspace                                             | Proposed           |
| [0031](0031-tsld-toolbar-registry-and-taxonomy.md)                          | TSLD toolbar-item registry & taxonomy                                   | Proposed           |
| [0032](0032-canvas-first-plan-authoring.md)                                 | Canvas-first plan authoring                                             | Proposed           |
| [0033](0033-scheduling-modes-and-canvas-planning.md)                        | Scheduling modes & a de-overloaded plan start                           | Accepted           |
| [0034](0034-engine-conformance-methodology.md)                              | Engine conformance & validation methodology                             | Accepted           |
| [0035](0035-schedulepoint-cpm-semantics.md)                                 | SchedulePoint CPM semantics (golden contract)                           | Proposed           |
| [0036](0036-hour-granular-calendars-and-durations.md)                       | Hour/shift-granular calendars & durations                               | Accepted           |
| [0037](0037-per-activity-calendars-and-instant-axis.md)                     | Per-activity calendars & the instant axis                               | Accepted           |
| [0038](0038-wbs-activity-hierarchy.md)                                      | WBS activity hierarchy (parent tree)                                    | Accepted           |
| [0039](0039-resource-model-and-resource-calendar-scheduling.md)             | Resource model & resource-calendar scheduling                           | Accepted           |
| [0040](0040-duration-types-and-resource-units.md)                           | Duration types & the resource-units model                               | Accepted           |
| [0041](0041-resource-levelling.md)                                          | Resource levelling (opt-in second pass)                                 | Accepted           |
| [0042](0042-percent-complete-types-and-earned-value.md)                     | Percent-complete types & Earned Value                                   | Accepted           |
| [0043](0043-inter-project-external-dates.md)                                | Inter-project external dates (M1)                                       | Accepted           |
| [0044](0044-resource-curves-accrual-steps.md)                               | Resource curves, cost accrual & weighted steps                          | Accepted           |
| [0045](0045-live-cross-plan-programme-scheduling.md)                        | Live cross-plan / programme scheduling (M2)                             | Accepted           |
| [0046](0046-polymorphic-entity-notes.md)                                    | Polymorphic entity notes                                                | Accepted           |
| [0047](0047-automatic-redeploy-on-release.md)                               | Automatic redeploy of released images                                   | Accepted           |
| [0048](0048-undo-redo-command-stack.md)                                     | Client-side command-stack undo/redo                                     | Accepted           |
| [0049](0049-canvas-axis-aligned-resource-strip.md)                          | Canvas-axis-aligned resource strip                                      | Proposed           |
| [0050](0050-schedule-interchange-canonical-model.md)                        | Schedule interchange: canonical model + import                          | Accepted           |
| [0051](0051-external-guest-share-links.md)                                  | External-Guest per-plan share links                                     | Accepted           |
| [0052](0052-canvas-direct-manipulation-and-visual-refresh.md)               | TSLD direct manipulation & visual refresh                               | Accepted           |
| [0053](0053-calendar-scoping-and-resource-management.md)                    | Calendar scoping tiers & resource management                            | Accepted           |
| [0054](0054-canvas-live-feedback-and-float-visualisation.md)                | Canvas live feedback & float visualisation                              | Accepted           |
| [0055](0055-designed-chrome-and-canvas-visual-language.md)                  | Surface scopes, designed chrome & canvas UI                             | Accepted           |
| [0056](0056-tsld-time-axis-legibility-and-preset-framing.md)                | TSLD time-axis legibility & preset framing                              | Accepted           |
| [0057](0057-real-modules-replace-the-reference-template.md)                 | Real modules replace the reference template                             | Accepted           |
| [0058](0058-drift-control-and-the-reconciliation-pass.md)                   | Drift control & the reconciliation pass                                 | Accepted           |
| [0059](0059-gantt-view-rendering-substrate-and-the-view-seam.md)            | Gantt view: rendering substrate & view seam                             | Accepted           |
| [0060](0060-tabbed-activity-editor-and-per-scope-save.md)                   | Tabbed activity editor & per-scope save                                 | Accepted           |
| [0061](0061-dialog-layout-system.md)                                        | Dialog layout: form primitives & two-pane editor                        | Accepted           |
| [0062](0062-activity-editor-convergence-logic-resources-notes-as-tabs.md)   | Activity-editor convergence: Logic/Resources/Notes                      | Accepted           |
| [0063](0063-pinned-wbs-band-and-the-canvas-band-model.md)                   | The pinned WBS band & the canvas band model                             | Accepted           |
| [0064](0064-canvas-authoring-flow.md)                                       | Canvas authoring flow & recalculation quiescence                        | Accepted           |
| [0065](0065-canvas-link-routing.md)                                         | Canvas link routing: orthogonal corridors                               | Accepted           |
| [0066](0066-the-seed-catalogue-and-the-engine-as-oracle.md)                 | The seed catalogue & the engine as oracle                               | Accepted           |
| [0067](0067-calendar-shift-editor-and-storage-honesty.md)                   | Calendar shift editor & storage honesty                                 | Proposed           |
| [0068](0068-calendar-hours-per-day.md)                                      | A calendar carries an hours-per-day                                     | Accepted           |
| [0069](0069-shared-lane-layout-and-packing-at-import.md)                    | Shared lane layout & packing at import                                  | Accepted           |
| [0070](0070-sub-day-durations-and-lags-in-the-authoring-surface.md)         | Sub-day durations & lags in the authoring surface                       | Accepted           |
| [0071](0071-per-assignment-lag.md)                                          | Per-assignment lag & the parity arguments it costs                      | Accepted           |
| [0072](0072-append-only-audit-log.md)                                       | The append-only audit log                                               | Accepted           |
| [0073](0073-audit-coverage-and-actor-less-readability.md)                   | Audit coverage & actor-less readability                                 | Accepted           |
| [0074](0074-account-recovery-verification-enforcement-and-csp.md)           | Account recovery, verification enforcement & CSP                        | Accepted           |
| [0075](0075-mail-delivery-is-best-effort.md)                                | Mail delivery is best-effort                                            | Accepted           |
| [0076](0076-wrong-claims-are-a-defect-class.md)                             | Wrong claims are a defect class                                         | Accepted           |
| [0077](0077-public-screens-brand-surface.md)                                | The public screens' brand surface                                       | Accepted           |
| [0078](0078-canvas-module-boundaries.md)                                    | Canvas module boundaries & the per-frame context                        | Accepted           |
| [0079](0079-search-that-navigates.md)                                       | Search that navigates: cursor, Escape, zoom                             | Accepted           |
| [0080](0080-canvas-plural-selection.md)                                     | The canvas plural selection & bulk operations                           | Accepted           |
| [0081](0081-milestone-entry-point-and-journey.md)                           | A milestone is its entry point; the journey gates                       | Proposed           |
| [0082](0082-disabled-menu-items-stay-reachable.md)                          | A shaded menu item keeps its focus, and its reason                      | Proposed           |
| [0083](0083-shaded-form-fields.md)                                          | A gated form field is read-only, not disabled                           | Proposed           |
| [0084](0084-feature-flag-retirement.md)                                     | A feature flag has an expiry date                                       | Accepted           |
| [0085](0085-privacy-operations.md)                                          | Erasure collides with the audit log                                     | Accepted           |
| [0086](0086-staff-principal.md)                                             | A staff identity that cannot reach a customer                           | Accepted           |
| [0087](0087-scheduled-retention-sweep.md)                                   | Scheduled work, and a retention sweep                                   | Accepted           |
| [0088](0088-flag-classification.md)                                         | Feature flags are classified, not scheduled                             | Accepted           |
| [0089](0089-activity-field-vocabulary.md)                                   | One activity field vocabulary                                           | Accepted           |
| [0090](0090-the-plan-workspace-command-surface.md)                          | The plan-workspace command surface                                      | Accepted           |
| [0091](0091-modes-density-and-the-command-band.md)                          | A mode is not a command                                                 | Proposed           |
| [0092](0092-the-canvas-dock-and-the-diagram-s-vertical-budget.md)           | The canvas dock, and the vertical budget                                | Accepted           |
| [0093](0093-an-object-action-belongs-on-the-object.md)                      | An object action belongs on the object                                  | Accepted           |
| [0094](0094-one-meaning-of-conflict-and-a-remedy-on-the-object.md)          | One meaning of "conflict", a remedy on the object                       | Accepted           |
| [0095](0095-the-gantt-becomes-a-working-surface.md)                         | The Gantt becomes a working surface                                     | Accepted           |
| [0096](0096-deleted-work-expires-and-purge-is-refused.md)                   | Deleted work expires, and purge is refused                              | Accepted           |
| [0097](0097-a-theme-is-a-system-not-a-palette.md)                           | A theme is a system, not a palette                                      | Accepted           |
| [0098](0098-the-landing-is-the-organisation-overview.md)                    | The landing is the organisation overview                                | Accepted           |
| [0099](0099-graphite-the-workstation-in-rail-chrome.md)                     | Graphite — workstation density in rail chrome                           | Accepted           |
| [0100](0100-the-canvas-minimap-an-invariant-picture-and-a-dom-rectangle.md) | The canvas minimap — an invariant picture and a DOM rectangle           | Accepted           |
| [0101](0101-an-editor-is-a-dialog-not-a-drawer.md)                          | An editor is a dialog, not a drawer                                     | Accepted           |
| [0102](0102-the-light-corporate-theme.md)                                   | The light corporate theme, and the scope that never reached the painter | Accepted           |
| [0103](0103-paper-is-a-surface.md)                                          | Paper is a surface, and the exported diagram is the diagram             | Accepted           |
| [0104](0104-a-shell-control-whose-subject-is-an-organisation.md)            | A shell control whose subject is an organisation                        | Accepted           |
| [0105](0105-a-register-row-is-not-a-spec.md)                                | A register row is not a spec                                            | Accepted           |
| [0106](0106-a-rule-is-a-scene-mark-its-label-is-chrome.md)                  | A rule is a scene mark; its label is chrome                             | Accepted           |
| [0107](0107-a-migration-a-pristine-database-cannot-test.md)                 | A migration a pristine database cannot test                             | Accepted           |
| [0108](0108-a-modal-guards-the-canvas-and-nothing-else.md)                  | A modal guards the canvas and nothing else                              | Accepted           |
| [0109](0109-a-command-surface-wraps.md)                                     | A command surface wraps, and the leading edge belongs to the work       | Accepted           |
| [0110](0110-a-gate-is-verified-against-the-defect-it-names.md)              | A gate is verified against the defect it names                          | Accepted           |
| [0111](0111-a-primitives-keyboard-contract-is-reviewed-before-release.md)   | A shared primitive's keyboard contract is reviewed before release       | Accepted           |
| [0112](0112-a-header-row-wraps-and-a-pen-sentence-is-a-fact.md)             | A header row wraps, and a pen sentence is a fact                        | Accepted           |
| [0113](0113-measure-the-problem-before-designing-the-remedy.md)             | Measure the problem, not just the remedy                                | Accepted           |
| [0114](0114-a-row-that-cannot-shrink-never-wraps.md)                        | A row that cannot shrink is never asked to wrap                         | Accepted           |
| [0115](0115-a-bound-governs-what-it-encloses.md)                            | A bound governs what it encloses                                        | Accepted           |
