/**
 * The organisation export's column registry (ADR-0194): the single declarative source of which
 * models and columns leave the tenant boundary in the whole-organisation ZIP, how each is typed,
 * and — for everything that does not leave — the reason.
 *
 * It is the promised format (`docs/ORGANISATION_EXPORT_FORMAT.md`), not a database dump: the
 * database layout is deliberately not promised (ADR-0190), the file list and column names here are.
 * `export-census.structural.spec.ts` derives the model and field list from the Prisma schema and
 * fails when a model or a column has no decision here, so the format cannot silently fall behind.
 *
 * Include-by-default: a column is exported unless it is listed in `withheld` with a reason.
 * Relation fields are not columns and are not listed.
 */

/** How a column is written. `text` is the only kind the CSV formula guard touches (`-5.0000` must stay a number). */
export type ColumnKind =
  'text' | 'int' | 'bigint' | 'decimal' | 'instant' | 'date' | 'boolean' | 'enum' | 'json';

export interface ExportColumn {
  /** The key in the file. Every duration, lag and float column's name carries its unit (`…Minutes`, `…Days`). */
  readonly field: string;
  readonly kind: ColumnKind;
  /**
   * The Prisma field it is read from, when the exported name differs. The stored float columns are
   * minutes while the API serves the same names in working days, so the file renames them rather
   * than let a reader assume the API's unit.
   */
  readonly source?: string;
}

/**
 * How the rows of a file are reached (a hint to the streaming reader, not part of the format):
 * `self` the organisation's own row, `via-members` users joined from this organisation's
 * members, `org` by `organization_id`, `per-plan` one plan at a time, `by-parent` by the ids of
 * a parent table that has the organisation column (the child has none).
 */
export type ExportRead = 'self' | 'via-members' | 'org' | 'per-plan' | 'by-parent';

export interface ExportFile {
  /** The Prisma model name — what the census compares against the schema. */
  readonly model: string;
  readonly table: string;
  /** The file's stem: `json/<file>.json` and `csv/<file>.csv`. */
  readonly file: string;
  readonly read: ExportRead;
  readonly columns: readonly ExportColumn[];
  /** Scalar fields deliberately not exported, each with the reason it is safe to omit. */
  readonly withheld: Readonly<Record<string, string>>;
  /**
   * `promised` files are inside the compatibility promise. `informational` files record what the
   * product itself once did to the data; they may change or be dropped without a major version.
   */
  readonly stability: 'promised' | 'informational';
}

export interface ExcludedModel {
  readonly model: string;
  readonly table: string;
  /** A human-readable name for the manifest; database names are not part of the promise. */
  readonly label: string;
  readonly reason: string;
}

type ColumnSpec = `${string}:${ColumnKind}` | `${string}:${ColumnKind}=${string}`;

/** Parse the compact `field:kind` (or `field:kind=sourceField`) form so a 60-column table reads at a glance. */
function columns(...specs: readonly ColumnSpec[]): readonly ExportColumn[] {
  return specs.map((spec) => {
    const [field, rest] = spec.split(':') as [string, string];
    const [kind, source] = rest.split('=') as [ColumnKind, string | undefined];
    return source ? { field, kind, source } : { field, kind };
  });
}

const VERSION =
  'Internal optimistic-lock counter: meaningless outside this database and not part of the data.';
const DELETE_BATCH =
  'Restore bookkeeping that groups a cascade of deletions; meaningless outside this database.';
const TOKEN_DIGEST =
  'A digest of a bearer credential. Exporting it would hand over something that can be tested against a guessed token.';
const ACCOUNT_STATE =
  'The person’s account state, not organisation data. Only name, email and creation date identify a member.';
const AUDIT_NETWORK =
  'Never shown on the Audit log screen (ADR-0072): a colleague’s address and browser are a privacy cost with no matching benefit.';

/** The 28 files, in the order the ZIP lists them. */
export const EXPORT_FILES: readonly ExportFile[] = [
  {
    model: 'User',
    table: 'users',
    file: 'people',
    stability: 'promised',
    read: 'via-members',
    columns: columns('id:text', 'name:text', 'email:text', 'createdAt:instant'),
    withheld: {
      emailVerified: ACCOUNT_STATE,
      image: ACCOUNT_STATE,
      updatedAt: ACCOUNT_STATE,
    },
  },
  {
    model: 'Organization',
    table: 'organizations',
    file: 'organization',
    stability: 'promised',
    read: 'self',
    columns: columns(
      'id:text',
      'name:text',
      'slug:text',
      'createdAt:instant',
      'updatedAt:instant',
      'createdBy:text',
      'updatedBy:text',
      'deletedAt:instant',
    ),
    withheld: {
      version: VERSION,
    },
  },
  {
    model: 'OrgMember',
    table: 'org_members',
    file: 'members',
    stability: 'promised',
    read: 'org',
    columns: columns(
      'id:text',
      'organizationId:text',
      'userId:text',
      'role:enum',
      'createdAt:instant',
      'updatedAt:instant',
      'createdBy:text',
      'updatedBy:text',
      'deletedAt:instant',
    ),
    withheld: {
      version: VERSION,
    },
  },
  {
    model: 'Invitation',
    table: 'invitations',
    file: 'invitations',
    stability: 'promised',
    read: 'org',
    columns: columns(
      'id:text',
      'organizationId:text',
      'email:text',
      'role:enum',
      'status:enum',
      'expiresAt:instant',
      'acceptedByUserId:text',
      'acceptedAt:instant',
      'createdAt:instant',
      'updatedAt:instant',
      'createdBy:text',
      'updatedBy:text',
      'deletedAt:instant',
    ),
    withheld: {
      tokenHash: TOKEN_DIGEST,
      version: VERSION,
    },
  },
  {
    model: 'Client',
    table: 'clients',
    file: 'clients',
    stability: 'promised',
    read: 'org',
    columns: columns(
      'id:text',
      'organizationId:text',
      'name:text',
      'description:text',
      'createdAt:instant',
      'updatedAt:instant',
      'createdBy:text',
      'updatedBy:text',
      'deletedAt:instant',
    ),
    withheld: {
      version: VERSION,
      deleteBatchId: DELETE_BATCH,
    },
  },
  {
    model: 'Project',
    table: 'projects',
    file: 'projects',
    stability: 'promised',
    read: 'org',
    columns: columns(
      'id:text',
      'organizationId:text',
      'clientId:text',
      'name:text',
      'description:text',
      'createdAt:instant',
      'updatedAt:instant',
      'createdBy:text',
      'updatedBy:text',
      'deletedAt:instant',
    ),
    withheld: {
      version: VERSION,
      deleteBatchId: DELETE_BATCH,
    },
  },
  {
    model: 'Plan',
    table: 'plans',
    file: 'plans',
    stability: 'promised',
    read: 'org',
    columns: columns(
      'id:text',
      'organizationId:text',
      'projectId:text',
      'name:text',
      'description:text',
      'status:enum',
      'progressRecalcMode:enum',
      'useExpectedFinishDates:boolean',
      'criticalPathDefinition:enum',
      'criticalFloatThresholdMinutes:int',
      'totalFloatMode:enum',
      'makeOpenEndsCritical:boolean',
      'levelResources:boolean',
      'levelWithinFloatOnly:boolean',
      'ignoreExternalRelationships:boolean',
      'eacMethod:enum',
      'currencyCode:text',
      'plannedStart:date',
      'calendarId:text',
      'scheduleComputedAt:instant',
      'scheduleCriticalPathDefinition:enum',
      'scheduleCriticalFloatThresholdMinutes:int',
      'scheduleTotalFloatMode:enum',
      'scheduleMakeOpenEndsCritical:boolean',
      'scheduleInputsChangedAt:instant',
      'createdAt:instant',
      'updatedAt:instant',
      'createdBy:text',
      'updatedBy:text',
      'deletedAt:instant',
    ),
    withheld: {
      version: VERSION,
      deleteBatchId: DELETE_BATCH,
    },
  },
  {
    model: 'Activity',
    table: 'activities',
    file: 'activities',
    stability: 'promised',
    read: 'per-plan',
    columns: columns(
      'id:text',
      'organizationId:text',
      'planId:text',
      'code:text',
      'name:text',
      'description:text',
      'type:enum',
      'durationMinutes:int',
      'calendarId:text',
      'constraintType:enum',
      'constraintDate:date',
      'secondaryConstraintType:enum',
      'secondaryConstraintDate:date',
      'externalEarlyStart:instant',
      'externalLateFinish:instant',
      'durationType:enum',
      'laneIndex:int',
      'scheduleAsLateAsPossible:boolean',
      'levelingPriority:int',
      'status:enum',
      'percentComplete:int',
      'actualStart:date',
      'actualFinish:date',
      'remainingDurationMinutes:int',
      'suspendDate:date',
      'resumeDate:date',
      'expectedFinish:date',
      'percentCompleteType:enum',
      'physicalPercentComplete:int',
      'budgetedExpense:bigint',
      'actualExpense:bigint',
      'accrualType:enum',
      'parentId:text',
      'earlyStart:date',
      'earlyFinish:date',
      'lateStart:date',
      'lateFinish:date',
      'totalFloatMinutes:int=totalFloat',
      'freeFloatMinutes:int=freeFloat',
      'isCritical:boolean',
      'isNearCritical:boolean',
      'constraintViolated:boolean',
      'externalDriven:boolean',
      'loeNoSpan:boolean',
      'resourceDriverMissing:boolean',
      'visualStart:date',
      'visualEffectiveStart:date',
      'visualEffectiveFinish:date',
      'visualConflict:boolean',
      'visualDriftDays:int',
      'visualConflictReason:enum',
      'remainingFloatMinutes:int=remainingFloat',
      'leveledStart:date',
      'leveledFinish:date',
      'levelingDelayMinutes:int',
      'levelingWindowExceeded:boolean',
      'selfOverAllocated:boolean',
      'createdAt:instant',
      'updatedAt:instant',
      'createdBy:text',
      'updatedBy:text',
      'deletedAt:instant',
    ),
    withheld: {
      version: VERSION,
      deleteBatchId: DELETE_BATCH,
    },
  },
  {
    model: 'ActivityDependency',
    table: 'dependencies',
    file: 'dependencies',
    stability: 'promised',
    read: 'per-plan',
    columns: columns(
      'id:text',
      'organizationId:text',
      'planId:text',
      'predecessorId:text',
      'successorId:text',
      'type:enum',
      'lagMinutes:int',
      'lagCalendar:enum',
      'isDriving:boolean',
      'createdAt:instant',
      'updatedAt:instant',
      'createdBy:text',
      'updatedBy:text',
      'deletedAt:instant',
    ),
    withheld: {
      version: VERSION,
      deleteBatchId: DELETE_BATCH,
    },
  },
  {
    model: 'CrossPlanDependency',
    table: 'cross_plan_dependencies',
    file: 'cross-plan-dependencies',
    stability: 'promised',
    read: 'org',
    columns: columns(
      'id:text',
      'organizationId:text',
      'predecessorPlanId:text',
      'successorPlanId:text',
      'predecessorId:text',
      'successorId:text',
      'type:enum',
      'lagMinutes:int',
      'lagCalendar:enum',
      'createdAt:instant',
      'updatedAt:instant',
      'createdBy:text',
      'updatedBy:text',
      'deletedAt:instant',
    ),
    withheld: {
      version: VERSION,
      deleteBatchId: DELETE_BATCH,
    },
  },
  {
    model: 'Calendar',
    table: 'calendars',
    file: 'calendars',
    stability: 'promised',
    read: 'org',
    columns: columns(
      'id:text',
      'organizationId:text',
      'name:text',
      'description:text',
      'scope:enum',
      'projectId:text',
      'hoursPerDayMinutes:int',
      'archivedAt:instant',
      'createdAt:instant',
      'updatedAt:instant',
      'createdBy:text',
      'updatedBy:text',
      'deletedAt:instant',
    ),
    withheld: {
      version: VERSION,
      deleteBatchId: DELETE_BATCH,
    },
  },
  {
    model: 'CalendarException',
    table: 'calendar_exceptions',
    file: 'calendar-exceptions',
    stability: 'promised',
    read: 'org',
    columns: columns(
      'id:text',
      'organizationId:text',
      'calendarId:text',
      'startDate:date',
      'endDate:date',
      'label:text',
      'createdAt:instant',
      'updatedAt:instant',
      'createdBy:text',
      'updatedBy:text',
      'deletedAt:instant',
    ),
    withheld: {
      version: VERSION,
      deleteBatchId: DELETE_BATCH,
    },
  },
  {
    model: 'CalendarShift',
    table: 'calendar_shifts',
    file: 'calendar-shifts',
    stability: 'promised',
    read: 'by-parent',
    columns: columns(
      'id:text',
      'calendarId:text',
      'weekday:int',
      'startMinute:int',
      'endMinute:int',
      'createdAt:instant',
      'updatedAt:instant',
    ),
    withheld: {},
  },
  {
    model: 'CalendarExceptionWindow',
    table: 'calendar_exception_windows',
    file: 'calendar-exception-windows',
    stability: 'promised',
    read: 'by-parent',
    columns: columns(
      'id:text',
      'calendarExceptionId:text',
      'startMinute:int',
      'endMinute:int',
      'createdAt:instant',
      'updatedAt:instant',
    ),
    withheld: {},
  },
  {
    model: 'Baseline',
    table: 'baselines',
    file: 'baselines',
    stability: 'promised',
    read: 'org',
    columns: columns(
      'id:text',
      'organizationId:text',
      'planId:text',
      'name:text',
      'isActive:boolean',
      'capturedAt:instant',
      'dataDate:date',
      'capturedProjectFinish:date',
      'hoursPerDayMinutes:int',
      'costSnapshotLevel:enum',
      'revisionSnapshotLevel:enum',
      'placementSnapshotLevel:enum',
      'criticalPathDefinition:enum',
      'criticalFloatThresholdMinutes:int',
      'totalFloatMode:enum',
      'makeOpenEndsCritical:boolean',
      'createdAt:instant',
      'updatedAt:instant',
      'createdBy:text',
      'updatedBy:text',
      'deletedAt:instant',
    ),
    withheld: {
      version: VERSION,
      deleteBatchId: DELETE_BATCH,
    },
  },
  {
    model: 'BaselineActivity',
    table: 'baseline_activities',
    file: 'baseline-activities',
    stability: 'promised',
    read: 'org',
    columns: columns(
      'id:text',
      'organizationId:text',
      'baselineId:text',
      'sourceActivityId:text',
      'code:text',
      'name:text',
      'type:enum',
      'durationMinutes:int',
      'baselineStart:date',
      'baselineFinish:date',
      'lateStart:date',
      'lateFinish:date',
      'totalFloatMinutes:int=totalFloat',
      'isCritical:boolean',
      'budgetedCost:bigint',
      'budgetedExpense:bigint',
      'laneIndex:int',
      'parentId:text',
      'calendarId:text',
      'constraintType:enum',
      'constraintDate:date',
      'secondaryConstraintType:enum',
      'secondaryConstraintDate:date',
      'percentComplete:int',
      'actualStart:date',
      'actualFinish:date',
      'placedStart:date',
      'placedFinish:date',
      'visualStart:date',
      'createdAt:instant',
      'updatedAt:instant',
      'createdBy:text',
      'updatedBy:text',
      'deletedAt:instant',
    ),
    withheld: {
      version: VERSION,
      deleteBatchId: DELETE_BATCH,
    },
  },
  {
    model: 'BaselineAssignment',
    table: 'baseline_assignments',
    file: 'baseline-assignments',
    stability: 'promised',
    read: 'org',
    columns: columns(
      'id:text',
      'organizationId:text',
      'baselineId:text',
      'sourceAssignmentId:text',
      'sourceActivityId:text',
      'sourceResourceId:text',
      'budgetedCost:bigint',
      'lagMinutes:int',
      'createdAt:instant',
      'updatedAt:instant',
      'createdBy:text',
      'updatedBy:text',
      'deletedAt:instant',
    ),
    withheld: {
      version: VERSION,
      deleteBatchId: DELETE_BATCH,
    },
  },
  {
    model: 'BaselineDependency',
    table: 'baseline_dependencies',
    file: 'baseline-dependencies',
    stability: 'promised',
    read: 'org',
    columns: columns(
      'id:text',
      'organizationId:text',
      'baselineId:text',
      'sourceDependencyId:text',
      'sourcePredecessorId:text',
      'sourceSuccessorId:text',
      'type:enum',
      'lagMinutes:int',
      'lagCalendar:enum',
      'isDriving:boolean',
      'createdAt:instant',
      'updatedAt:instant',
      'createdBy:text',
      'updatedBy:text',
      'deletedAt:instant',
    ),
    withheld: {
      version: VERSION,
      deleteBatchId: DELETE_BATCH,
    },
  },
  {
    model: 'PlanShare',
    table: 'plan_shares',
    file: 'shares',
    stability: 'promised',
    read: 'org',
    columns: columns(
      'id:text',
      'organizationId:text',
      'planId:text',
      'label:text',
      'expiresAt:instant',
      'revokedAt:instant',
      'lastAccessedAt:instant',
      'createdAt:instant',
      'updatedAt:instant',
      'createdBy:text',
      'updatedBy:text',
      'deletedAt:instant',
    ),
    withheld: {
      tokenHash: TOKEN_DIGEST,
      version: VERSION,
      deleteBatchId: DELETE_BATCH,
    },
  },
  {
    model: 'PlacementMigration',
    table: 'placement_migrations',
    file: 'records-placement-migrations',
    stability: 'informational',
    read: 'per-plan',
    columns: columns(
      'id:text',
      'organizationId:text',
      'planId:text',
      'activityId:text',
      'activityCode:text',
      'activityName:text',
      'priorConstraintType:enum',
      'priorConstraintDate:date',
      'priorVisualStart:date',
      'migratedAt:instant',
    ),
    withheld: {},
  },
  {
    model: 'FmDateMigration',
    table: 'finish_milestone_date_migrations',
    file: 'records-finish-milestone-dates',
    stability: 'informational',
    read: 'per-plan',
    columns: columns(
      'id:text',
      'organizationId:text',
      'planId:text',
      'activityId:text',
      'activityCode:text',
      'activityName:text',
      'priorVisualStart:date',
      'migratedAt:instant',
    ),
    withheld: {},
  },
  {
    model: 'CrossPlanLagMigration',
    table: 'cross_plan_lag_migrations',
    file: 'records-cross-plan-lags',
    stability: 'informational',
    read: 'per-plan',
    columns: columns(
      'id:text',
      'organizationId:text',
      'planId:text',
      'crossPlanDependencyId:text',
      'lagCalendar:enum',
      'lagCalendarId:text',
      'dayFactorMinutes:int',
      'priorLagMinutes:int',
      'newLagMinutes:int',
      'migratedAt:instant',
    ),
    withheld: {},
  },
  {
    model: 'Resource',
    table: 'resources',
    file: 'resources',
    stability: 'promised',
    read: 'org',
    columns: columns(
      'id:text',
      'organizationId:text',
      'name:text',
      'code:text',
      'description:text',
      'kind:enum',
      'parentId:text',
      'calendarId:text',
      'maxUnitsPerHour:decimal',
      'costPerUnit:decimal',
      'archivedAt:instant',
      'createdAt:instant',
      'updatedAt:instant',
      'createdBy:text',
      'updatedBy:text',
      'deletedAt:instant',
    ),
    withheld: {
      version: VERSION,
      deleteBatchId: DELETE_BATCH,
    },
  },
  {
    model: 'ResourceAssignment',
    table: 'resource_assignments',
    file: 'assignments',
    stability: 'promised',
    read: 'org',
    columns: columns(
      'id:text',
      'organizationId:text',
      'activityId:text',
      'resourceId:text',
      'budgetedUnits:decimal',
      'unitsPerHour:decimal',
      'isDriving:boolean',
      'curveType:enum',
      'lagMinutes:int',
      'budgetedCost:bigint',
      'actualCost:bigint',
      'actualUnits:decimal',
      'createdAt:instant',
      'updatedAt:instant',
      'createdBy:text',
      'updatedBy:text',
      'deletedAt:instant',
    ),
    withheld: {
      version: VERSION,
      deleteBatchId: DELETE_BATCH,
    },
  },
  {
    model: 'ActivityStep',
    table: 'activity_steps',
    file: 'activity-steps',
    stability: 'promised',
    read: 'org',
    columns: columns(
      'id:text',
      'organizationId:text',
      'activityId:text',
      'seq:int',
      'name:text',
      'weight:decimal',
      'percentComplete:int',
      'createdAt:instant',
      'updatedAt:instant',
      'createdBy:text',
      'updatedBy:text',
      'deletedAt:instant',
    ),
    withheld: {
      version: VERSION,
      deleteBatchId: DELETE_BATCH,
    },
  },
  {
    model: 'ActivityHistoryEntry',
    table: 'activity_history_entries',
    file: 'activity-history',
    stability: 'promised',
    read: 'org',
    columns: columns(
      'id:text',
      'organizationId:text',
      'activityId:text',
      'actorUserId:text',
      'scope:enum',
      'firstRecordedAt:instant',
      'lastRecordedAt:instant',
      'editCount:int',
      'batchId:text',
      'batchSize:int',
      'origin:enum',
      'hasNonCostChange:boolean',
      'changes:json',
    ),
    withheld: {},
  },
  {
    model: 'Note',
    table: 'notes',
    file: 'notes',
    stability: 'promised',
    read: 'per-plan',
    columns: columns(
      'id:text',
      'organizationId:text',
      'entityType:enum',
      'planId:text',
      'activityId:text',
      'body:text',
      'createdAt:instant',
      'updatedAt:instant',
      'createdBy:text',
      'updatedBy:text',
      'deletedAt:instant',
    ),
    withheld: {
      version: VERSION,
      deleteBatchId: DELETE_BATCH,
    },
  },
  {
    model: 'AuditEvent',
    table: 'audit_events',
    file: 'audit-events',
    stability: 'promised',
    read: 'org',
    columns: columns(
      'id:text',
      'occurredAt:instant',
      'organizationId:text',
      'action:text',
      'outcome:enum',
      'actorType:enum',
      'actorUserId:text',
      'actorLabel:text',
      'subjectType:text',
      'subjectId:text',
      'subjectLabel:text',
      'changes:json',
      'correlationId:text',
    ),
    withheld: {
      ipAddress: AUDIT_NETWORK,
      userAgent: AUDIT_NETWORK,
    },
  },
];

/** The 7 models that are not exported at all, each with why. */
export const EXCLUDED_MODELS: readonly ExcludedModel[] = [
  {
    model: 'Session',
    label: 'sign-in sessions',
    table: 'sessions',
    reason:
      'Bearer session tokens, addresses and browsers: credentials of individuals, not organisation data.',
  },
  {
    model: 'Account',
    label: 'sign-in accounts and credentials',
    table: 'accounts',
    reason: 'Password hashes and sign-in provider tokens: credentials of individuals.',
  },
  {
    model: 'Verification',
    label: 'verification and password-reset secrets',
    table: 'verifications',
    reason: 'Single-use verification and password-reset secrets; they belong to no organisation.',
  },
  {
    model: 'PlanLock',
    label: 'live editing locks',
    table: 'plan_locks',
    reason:
      'The pen’s lease: expires in minutes and describes who is editing right now, not stored work.',
  },
  {
    model: 'MailEvent',
    label: 'mail delivery telemetry',
    table: 'mail_events',
    reason: 'Installation telemetry with no organisation, readable by staff only.',
  },
  {
    model: 'CspReport',
    label: 'browser security reports',
    table: 'csp_reports',
    reason: 'Installation telemetry with no organisation, readable by staff only.',
  },
  {
    model: 'PerfProbeResult',
    label: 'performance measurements',
    table: 'perf_probe_results',
    reason: 'Staff’s measurements of the installation, not organisation data.',
  },
];

/** The format's version. Adding a file or column is a minor change; removing or retyping is a major one. */
export const EXPORT_FORMAT_VERSION = '1.0';

/** The format's name, written to the manifest so a reader can tell what it holds. */
export const EXPORT_FORMAT_NAME = 'schedulepoint.organisation-export';

export const jsonPath = (file: ExportFile): string => `json/${file.file}.json`;
export const csvPath = (file: ExportFile): string => `csv/${file.file}.csv`;
