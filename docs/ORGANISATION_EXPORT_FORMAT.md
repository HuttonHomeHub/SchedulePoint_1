# The organisation export format

- **Format name:** `schedulepoint.organisation-export`
- **Version:** `1.0`
- **Decision:** [ADR-0194](adr/0194-an-organisations-export-is-a-promised-format-streamed-on-the-request.md)
- **Produced by:** the Org Admin's **Export data** (built in the milestones after this document; spec in
  [`specs/organisation-export/`](specs/organisation-export/feature-spec.md)).

This is the contract for the file an Org Admin downloads to take everything their organisation holds out
of SchedulePoint. It describes a **format**, not the database: the database layout is not promised
([ADR-0190](adr/0190-what-1-0-promises.md)), the files and columns below are. The column registry
(`apps/api/src/modules/organization-export/export-columns.ts`) is the code form of this page, and a
test fails when the two disagree, as the census fails when the schema gains a column the registry has
not decided about.

## What the download is

One ZIP named `schedulepoint-export-<organisation>-<UTC time>.zip`:

```text
README.txt              a plain-English guide, the same text for every export of a format version
json/<file>.json        a JSON array, one object per line: the complete, exact copy
csv/<file>.csv          the same rows for a spreadsheet
manifest.json           written last: every file with its rows, bytes and SHA-256, and what was left out
```

The JSON is authoritative; the CSV is a view of it. There are 28 files of each kind, listed below. Every
file is present even when it has no rows: its JSON is `[]` and its CSV is a header row only.

## How values are written

| Type       | JSON                                         | CSV                                 |
| ---------- | -------------------------------------------- | ----------------------------------- |
| text       | string                                       | string; see the formula guard below |
| int        | number                                       | the digits                          |
| bigint     | **decimal string**, exact                    | the same digits                     |
| decimal    | **decimal string**, exact, no trailing zeros | the same digits                     |
| instant    | ISO 8601 UTC, `2026-10-14T09:30:00.000Z`     | the same text                       |
| date       | calendar day, `2026-10-14`                   | the same text                       |
| boolean    | `true` / `false`                             | `true` / `false`                    |
| enum       | the enum's name, for example `TASK`          | the same text                       |
| json       | nested JSON                                  | compact JSON text in one cell       |
| any, empty | `null`                                       | an empty cell                       |

- **Money** amounts are whole numbers (bigint) of the minor unit (cents, pence) of the plan's currency; a
  rate such as a resource's `costPerUnit` is a decimal in the same unit. A plan with no currency states none. **Durations and lags** are minutes, named as stored. **Computed schedule columns**
  (early and late dates, float, criticality) are exported as stored; the export never recalculates.
- **Keys** are camelCase, as the API uses them. Each row carries the ids that join it to others.
- **CSV** is UTF-8 with a byte-order mark, comma-separated, CRLF line ends, RFC 4180 quoting, and a header
  row of the same keys as the JSON.
- **The formula guard.** A `text` cell that starts with `=`, `+`, `-` or `@` (or a tab or carriage return,
  or one of those after spaces) is prefixed with an apostrophe in the CSV so a spreadsheet does not run it.
  Numbers, dates and the other types are never prefixed: `-5.25` stays a number. The JSON keeps the exact text.
- **Order** is deterministic: rows by plan id, then row id (creation order).
- **Deleted items are included.** A client, project, plan or activity in the recycle bin, a removed member
  and a withdrawn invitation are exported with their `deletedAt` set.
- **One snapshot.** The export is one consistent read taken when it starts; edits made while it runs are
  not in it.

## The manifest

```json
{
  "format": "schedulepoint.organisation-export",
  "formatVersion": "1.0",
  "generatedAt": "2026-10-14T09:30:00.000Z",
  "generator": { "product": "SchedulePoint", "apiVersion": "0.93.0" },
  "organization": { "id": "…", "slug": "acme", "name": "Acme" },
  "exportedBy": { "userId": "…", "name": "…" },
  "snapshot": "consistent",
  "includesDeleted": true,
  "files": [
    {
      "path": "json/clients.json",
      "table": "clients",
      "kind": "json",
      "rows": 12,
      "bytes": 4096,
      "sha256": "…"
    }
  ],
  "excluded": [{ "what": "sessions", "reason": "…" }]
}
```

## Versioning

- Adding a file or a column is a **minor** change (`1.1`).
- Removing or renaming a file or column, or changing a column's type or meaning, is a **major** change
  (`2.0`) and, after 1.0, an API major.
- **Readers must ignore files and keys they do not know.** The manifest's `formatVersion` is the contract.
- Re-importing an export into SchedulePoint is not promised. The database backup
  ([ADR-0192](adr/0192-a-backup-is-a-file-the-image-writes-and-a-restore-never-overwrites.md)) is the
  restore path.

## What is never exported

- Credentials: password hashes, sign-in sessions, invitation and share-link token digests.
- The audit log's IP addresses and browser details, which the Audit log screen never shows either.
- People of other organisations, and audit events that belong to no organisation.
- Live editing locks, and the installation's own telemetry tables (listed at the end).
- Internal bookkeeping: the optimistic-lock `version` and the restore `deleteBatchId`.

The manifest lists every one of these with its reason.

## Files

### `people`

Table `users`: people who are or were members of this organisation. Files `json/people.json` and `csv/people.csv`.

| Column      | Type    |
| ----------- | ------- |
| `id`        | text    |
| `name`      | text    |
| `email`     | text    |
| `createdAt` | instant |

Not exported: `emailVerified`, `image`, `updatedAt`.

### `organization`

Table `organizations`: the organisation’s own row. Files `json/organization.json` and `csv/organization.csv`.

| Column      | Type    |
| ----------- | ------- |
| `id`        | text    |
| `name`      | text    |
| `slug`      | text    |
| `createdAt` | instant |
| `updatedAt` | instant |
| `createdBy` | text    |
| `updatedBy` | text    |
| `deletedAt` | instant |

Not exported: `version`.

### `members`

Table `org_members`: every row of the organisation. Files `json/members.json` and `csv/members.csv`.

| Column           | Type    |
| ---------------- | ------- |
| `id`             | text    |
| `organizationId` | text    |
| `userId`         | text    |
| `role`           | enum    |
| `createdAt`      | instant |
| `updatedAt`      | instant |
| `createdBy`      | text    |
| `updatedBy`      | text    |
| `deletedAt`      | instant |

Not exported: `version`.

### `invitations`

Table `invitations`: every row of the organisation. Files `json/invitations.json` and `csv/invitations.csv`.

| Column             | Type    |
| ------------------ | ------- |
| `id`               | text    |
| `organizationId`   | text    |
| `email`            | text    |
| `role`             | enum    |
| `status`           | enum    |
| `expiresAt`        | instant |
| `acceptedByUserId` | text    |
| `acceptedAt`       | instant |
| `createdAt`        | instant |
| `updatedAt`        | instant |
| `createdBy`        | text    |
| `updatedBy`        | text    |
| `deletedAt`        | instant |

Not exported: `tokenHash`, `version`.

### `clients`

Table `clients`: every row of the organisation. Files `json/clients.json` and `csv/clients.csv`.

| Column           | Type    |
| ---------------- | ------- |
| `id`             | text    |
| `organizationId` | text    |
| `name`           | text    |
| `description`    | text    |
| `createdAt`      | instant |
| `updatedAt`      | instant |
| `createdBy`      | text    |
| `updatedBy`      | text    |
| `deletedAt`      | instant |

Not exported: `version`, `deleteBatchId`.

### `projects`

Table `projects`: every row of the organisation. Files `json/projects.json` and `csv/projects.csv`.

| Column           | Type    |
| ---------------- | ------- |
| `id`             | text    |
| `organizationId` | text    |
| `clientId`       | text    |
| `name`           | text    |
| `description`    | text    |
| `createdAt`      | instant |
| `updatedAt`      | instant |
| `createdBy`      | text    |
| `updatedBy`      | text    |
| `deletedAt`      | instant |

Not exported: `version`, `deleteBatchId`.

### `plans`

Table `plans`: every row of the organisation. Files `json/plans.json` and `csv/plans.csv`.

| Column                                  | Type    |
| --------------------------------------- | ------- |
| `id`                                    | text    |
| `organizationId`                        | text    |
| `projectId`                             | text    |
| `name`                                  | text    |
| `description`                           | text    |
| `status`                                | enum    |
| `progressRecalcMode`                    | enum    |
| `useExpectedFinishDates`                | boolean |
| `criticalPathDefinition`                | enum    |
| `criticalFloatThresholdMinutes`         | int     |
| `totalFloatMode`                        | enum    |
| `makeOpenEndsCritical`                  | boolean |
| `levelResources`                        | boolean |
| `levelWithinFloatOnly`                  | boolean |
| `ignoreExternalRelationships`           | boolean |
| `eacMethod`                             | enum    |
| `currencyCode`                          | text    |
| `plannedStart`                          | date    |
| `calendarId`                            | text    |
| `scheduleComputedAt`                    | instant |
| `scheduleCriticalPathDefinition`        | enum    |
| `scheduleCriticalFloatThresholdMinutes` | int     |
| `scheduleTotalFloatMode`                | enum    |
| `scheduleMakeOpenEndsCritical`          | boolean |
| `scheduleInputsChangedAt`               | instant |
| `createdAt`                             | instant |
| `updatedAt`                             | instant |
| `createdBy`                             | text    |
| `updatedBy`                             | text    |
| `deletedAt`                             | instant |

Not exported: `version`, `deleteBatchId`.

### `activities`

Table `activities`: every row of the organisation. Files `json/activities.json` and `csv/activities.csv`.

| Column                     | Type    |
| -------------------------- | ------- |
| `id`                       | text    |
| `organizationId`           | text    |
| `planId`                   | text    |
| `code`                     | text    |
| `name`                     | text    |
| `description`              | text    |
| `type`                     | enum    |
| `durationMinutes`          | int     |
| `calendarId`               | text    |
| `constraintType`           | enum    |
| `constraintDate`           | date    |
| `secondaryConstraintType`  | enum    |
| `secondaryConstraintDate`  | date    |
| `externalEarlyStart`       | instant |
| `externalLateFinish`       | instant |
| `durationType`             | enum    |
| `laneIndex`                | int     |
| `scheduleAsLateAsPossible` | boolean |
| `levelingPriority`         | int     |
| `status`                   | enum    |
| `percentComplete`          | int     |
| `actualStart`              | date    |
| `actualFinish`             | date    |
| `remainingDurationMinutes` | int     |
| `suspendDate`              | date    |
| `resumeDate`               | date    |
| `expectedFinish`           | date    |
| `percentCompleteType`      | enum    |
| `physicalPercentComplete`  | int     |
| `budgetedExpense`          | bigint  |
| `actualExpense`            | bigint  |
| `accrualType`              | enum    |
| `parentId`                 | text    |
| `earlyStart`               | date    |
| `earlyFinish`              | date    |
| `lateStart`                | date    |
| `lateFinish`               | date    |
| `totalFloat`               | int     |
| `freeFloat`                | int     |
| `isCritical`               | boolean |
| `isNearCritical`           | boolean |
| `constraintViolated`       | boolean |
| `externalDriven`           | boolean |
| `loeNoSpan`                | boolean |
| `resourceDriverMissing`    | boolean |
| `visualStart`              | date    |
| `visualEffectiveStart`     | date    |
| `visualEffectiveFinish`    | date    |
| `visualConflict`           | boolean |
| `visualDriftDays`          | int     |
| `visualConflictReason`     | enum    |
| `remainingFloat`           | int     |
| `leveledStart`             | date    |
| `leveledFinish`            | date    |
| `levelingDelayMinutes`     | int     |
| `levelingWindowExceeded`   | boolean |
| `selfOverAllocated`        | boolean |
| `createdAt`                | instant |
| `updatedAt`                | instant |
| `createdBy`                | text    |
| `updatedBy`                | text    |
| `deletedAt`                | instant |

Not exported: `version`, `deleteBatchId`.

### `dependencies`

Table `dependencies`: every row of the organisation. Files `json/dependencies.json` and `csv/dependencies.csv`.

| Column           | Type    |
| ---------------- | ------- |
| `id`             | text    |
| `organizationId` | text    |
| `planId`         | text    |
| `predecessorId`  | text    |
| `successorId`    | text    |
| `type`           | enum    |
| `lagMinutes`     | int     |
| `lagCalendar`    | enum    |
| `isDriving`      | boolean |
| `createdAt`      | instant |
| `updatedAt`      | instant |
| `createdBy`      | text    |
| `updatedBy`      | text    |
| `deletedAt`      | instant |

Not exported: `version`, `deleteBatchId`.

### `cross-plan-dependencies`

Table `cross_plan_dependencies`: every row of the organisation. Files `json/cross-plan-dependencies.json` and `csv/cross-plan-dependencies.csv`.

| Column              | Type    |
| ------------------- | ------- |
| `id`                | text    |
| `organizationId`    | text    |
| `predecessorPlanId` | text    |
| `successorPlanId`   | text    |
| `predecessorId`     | text    |
| `successorId`       | text    |
| `type`              | enum    |
| `lagMinutes`        | int     |
| `lagCalendar`       | enum    |
| `createdAt`         | instant |
| `updatedAt`         | instant |
| `createdBy`         | text    |
| `updatedBy`         | text    |
| `deletedAt`         | instant |

Not exported: `version`, `deleteBatchId`.

### `calendars`

Table `calendars`: every row of the organisation. Files `json/calendars.json` and `csv/calendars.csv`.

| Column               | Type    |
| -------------------- | ------- |
| `id`                 | text    |
| `organizationId`     | text    |
| `name`               | text    |
| `description`        | text    |
| `scope`              | enum    |
| `projectId`          | text    |
| `hoursPerDayMinutes` | int     |
| `archivedAt`         | instant |
| `createdAt`          | instant |
| `updatedAt`          | instant |
| `createdBy`          | text    |
| `updatedBy`          | text    |
| `deletedAt`          | instant |

Not exported: `version`, `deleteBatchId`.

### `calendar-exceptions`

Table `calendar_exceptions`: every row of the organisation. Files `json/calendar-exceptions.json` and `csv/calendar-exceptions.csv`.

| Column           | Type    |
| ---------------- | ------- |
| `id`             | text    |
| `organizationId` | text    |
| `calendarId`     | text    |
| `startDate`      | date    |
| `endDate`        | date    |
| `label`          | text    |
| `createdAt`      | instant |
| `updatedAt`      | instant |
| `createdBy`      | text    |
| `updatedBy`      | text    |
| `deletedAt`      | instant |

Not exported: `version`, `deleteBatchId`.

### `calendar-shifts`

Table `calendar_shifts`: every row belonging to the organisation’s calendars. Files `json/calendar-shifts.json` and `csv/calendar-shifts.csv`.

| Column        | Type    |
| ------------- | ------- |
| `id`          | text    |
| `calendarId`  | text    |
| `weekday`     | int     |
| `startMinute` | int     |
| `endMinute`   | int     |
| `createdAt`   | instant |
| `updatedAt`   | instant |

### `calendar-exception-windows`

Table `calendar_exception_windows`: every row belonging to the organisation’s calendars. Files `json/calendar-exception-windows.json` and `csv/calendar-exception-windows.csv`.

| Column                | Type    |
| --------------------- | ------- |
| `id`                  | text    |
| `calendarExceptionId` | text    |
| `startMinute`         | int     |
| `endMinute`           | int     |
| `createdAt`           | instant |
| `updatedAt`           | instant |

### `baselines`

Table `baselines`: every row of the organisation. Files `json/baselines.json` and `csv/baselines.csv`.

| Column                          | Type    |
| ------------------------------- | ------- |
| `id`                            | text    |
| `organizationId`                | text    |
| `planId`                        | text    |
| `name`                          | text    |
| `isActive`                      | boolean |
| `capturedAt`                    | instant |
| `dataDate`                      | date    |
| `capturedProjectFinish`         | date    |
| `hoursPerDayMinutes`            | int     |
| `costSnapshotLevel`             | enum    |
| `revisionSnapshotLevel`         | enum    |
| `placementSnapshotLevel`        | enum    |
| `criticalPathDefinition`        | enum    |
| `criticalFloatThresholdMinutes` | int     |
| `totalFloatMode`                | enum    |
| `makeOpenEndsCritical`          | boolean |
| `createdAt`                     | instant |
| `updatedAt`                     | instant |
| `createdBy`                     | text    |
| `updatedBy`                     | text    |
| `deletedAt`                     | instant |

Not exported: `version`, `deleteBatchId`.

### `baseline-activities`

Table `baseline_activities`: every row of the organisation. Files `json/baseline-activities.json` and `csv/baseline-activities.csv`.

| Column                    | Type    |
| ------------------------- | ------- |
| `id`                      | text    |
| `organizationId`          | text    |
| `baselineId`              | text    |
| `sourceActivityId`        | text    |
| `code`                    | text    |
| `name`                    | text    |
| `type`                    | enum    |
| `durationMinutes`         | int     |
| `baselineStart`           | date    |
| `baselineFinish`          | date    |
| `lateStart`               | date    |
| `lateFinish`              | date    |
| `totalFloat`              | int     |
| `isCritical`              | boolean |
| `budgetedCost`            | bigint  |
| `budgetedExpense`         | bigint  |
| `laneIndex`               | int     |
| `parentId`                | text    |
| `calendarId`              | text    |
| `constraintType`          | enum    |
| `constraintDate`          | date    |
| `secondaryConstraintType` | enum    |
| `secondaryConstraintDate` | date    |
| `percentComplete`         | int     |
| `actualStart`             | date    |
| `actualFinish`            | date    |
| `placedStart`             | date    |
| `placedFinish`            | date    |
| `visualStart`             | date    |
| `createdAt`               | instant |
| `updatedAt`               | instant |
| `createdBy`               | text    |
| `updatedBy`               | text    |
| `deletedAt`               | instant |

Not exported: `version`, `deleteBatchId`.

### `baseline-assignments`

Table `baseline_assignments`: every row of the organisation. Files `json/baseline-assignments.json` and `csv/baseline-assignments.csv`.

| Column               | Type    |
| -------------------- | ------- |
| `id`                 | text    |
| `organizationId`     | text    |
| `baselineId`         | text    |
| `sourceAssignmentId` | text    |
| `sourceActivityId`   | text    |
| `sourceResourceId`   | text    |
| `budgetedCost`       | bigint  |
| `lagMinutes`         | int     |
| `createdAt`          | instant |
| `updatedAt`          | instant |
| `createdBy`          | text    |
| `updatedBy`          | text    |
| `deletedAt`          | instant |

Not exported: `version`, `deleteBatchId`.

### `baseline-dependencies`

Table `baseline_dependencies`: every row of the organisation. Files `json/baseline-dependencies.json` and `csv/baseline-dependencies.csv`.

| Column                | Type    |
| --------------------- | ------- |
| `id`                  | text    |
| `organizationId`      | text    |
| `baselineId`          | text    |
| `sourceDependencyId`  | text    |
| `sourcePredecessorId` | text    |
| `sourceSuccessorId`   | text    |
| `type`                | enum    |
| `lagMinutes`          | int     |
| `lagCalendar`         | enum    |
| `isDriving`           | boolean |
| `createdAt`           | instant |
| `updatedAt`           | instant |
| `createdBy`           | text    |
| `updatedBy`           | text    |
| `deletedAt`           | instant |

Not exported: `version`, `deleteBatchId`.

### `shares`

Table `plan_shares`: every row of the organisation. Files `json/shares.json` and `csv/shares.csv`.

| Column           | Type    |
| ---------------- | ------- |
| `id`             | text    |
| `organizationId` | text    |
| `planId`         | text    |
| `label`          | text    |
| `expiresAt`      | instant |
| `revokedAt`      | instant |
| `lastAccessedAt` | instant |
| `createdAt`      | instant |
| `updatedAt`      | instant |
| `createdBy`      | text    |
| `updatedBy`      | text    |
| `deletedAt`      | instant |

Not exported: `tokenHash`, `version`, `deleteBatchId`.

### `records-placement-migrations`

Table `placement_migrations`: every row of the organisation. Files `json/records-placement-migrations.json` and `csv/records-placement-migrations.csv`.

| Column                | Type    |
| --------------------- | ------- |
| `id`                  | text    |
| `organizationId`      | text    |
| `planId`              | text    |
| `activityId`          | text    |
| `activityCode`        | text    |
| `activityName`        | text    |
| `priorConstraintType` | enum    |
| `priorConstraintDate` | date    |
| `priorVisualStart`    | date    |
| `migratedAt`          | instant |

### `records-finish-milestone-dates`

Table `finish_milestone_date_migrations`: every row of the organisation. Files `json/records-finish-milestone-dates.json` and `csv/records-finish-milestone-dates.csv`.

| Column             | Type    |
| ------------------ | ------- |
| `id`               | text    |
| `organizationId`   | text    |
| `planId`           | text    |
| `activityId`       | text    |
| `activityCode`     | text    |
| `activityName`     | text    |
| `priorVisualStart` | date    |
| `migratedAt`       | instant |

### `records-cross-plan-lags`

Table `cross_plan_lag_migrations`: every row of the organisation. Files `json/records-cross-plan-lags.json` and `csv/records-cross-plan-lags.csv`.

| Column                  | Type    |
| ----------------------- | ------- |
| `id`                    | text    |
| `organizationId`        | text    |
| `planId`                | text    |
| `crossPlanDependencyId` | text    |
| `lagCalendar`           | enum    |
| `lagCalendarId`         | text    |
| `dayFactorMinutes`      | int     |
| `priorLagMinutes`       | int     |
| `newLagMinutes`         | int     |
| `migratedAt`            | instant |

### `resources`

Table `resources`: every row of the organisation. Files `json/resources.json` and `csv/resources.csv`.

| Column            | Type    |
| ----------------- | ------- |
| `id`              | text    |
| `organizationId`  | text    |
| `name`            | text    |
| `code`            | text    |
| `description`     | text    |
| `kind`            | enum    |
| `parentId`        | text    |
| `calendarId`      | text    |
| `maxUnitsPerHour` | decimal |
| `costPerUnit`     | decimal |
| `archivedAt`      | instant |
| `createdAt`       | instant |
| `updatedAt`       | instant |
| `createdBy`       | text    |
| `updatedBy`       | text    |
| `deletedAt`       | instant |

Not exported: `version`, `deleteBatchId`.

### `assignments`

Table `resource_assignments`: every row of the organisation. Files `json/assignments.json` and `csv/assignments.csv`.

| Column           | Type    |
| ---------------- | ------- |
| `id`             | text    |
| `organizationId` | text    |
| `activityId`     | text    |
| `resourceId`     | text    |
| `budgetedUnits`  | decimal |
| `unitsPerHour`   | decimal |
| `isDriving`      | boolean |
| `curveType`      | enum    |
| `lagMinutes`     | int     |
| `budgetedCost`   | bigint  |
| `actualCost`     | bigint  |
| `actualUnits`    | decimal |
| `createdAt`      | instant |
| `updatedAt`      | instant |
| `createdBy`      | text    |
| `updatedBy`      | text    |
| `deletedAt`      | instant |

Not exported: `version`, `deleteBatchId`.

### `activity-steps`

Table `activity_steps`: every row of the organisation. Files `json/activity-steps.json` and `csv/activity-steps.csv`.

| Column            | Type    |
| ----------------- | ------- |
| `id`              | text    |
| `organizationId`  | text    |
| `activityId`      | text    |
| `seq`             | int     |
| `name`            | text    |
| `weight`          | decimal |
| `percentComplete` | int     |
| `createdAt`       | instant |
| `updatedAt`       | instant |
| `createdBy`       | text    |
| `updatedBy`       | text    |
| `deletedAt`       | instant |

Not exported: `version`, `deleteBatchId`.

### `activity-history`

Table `activity_history_entries`: every row of the organisation. Files `json/activity-history.json` and `csv/activity-history.csv`.

| Column             | Type    |
| ------------------ | ------- |
| `id`               | text    |
| `organizationId`   | text    |
| `activityId`       | text    |
| `actorUserId`      | text    |
| `scope`            | enum    |
| `firstRecordedAt`  | instant |
| `lastRecordedAt`   | instant |
| `editCount`        | int     |
| `batchId`          | text    |
| `batchSize`        | int     |
| `origin`           | enum    |
| `hasNonCostChange` | boolean |
| `changes`          | json    |

### `notes`

Table `notes`: every row of the organisation. Files `json/notes.json` and `csv/notes.csv`.

| Column           | Type    |
| ---------------- | ------- |
| `id`             | text    |
| `organizationId` | text    |
| `entityType`     | enum    |
| `planId`         | text    |
| `activityId`     | text    |
| `body`           | text    |
| `createdAt`      | instant |
| `updatedAt`      | instant |
| `createdBy`      | text    |
| `updatedBy`      | text    |
| `deletedAt`      | instant |

Not exported: `version`, `deleteBatchId`.

### `audit-events`

Table `audit_events`: every row of the organisation. Files `json/audit-events.json` and `csv/audit-events.csv`.

| Column           | Type    |
| ---------------- | ------- |
| `id`             | text    |
| `occurredAt`     | instant |
| `organizationId` | text    |
| `action`         | text    |
| `outcome`        | enum    |
| `actorType`      | enum    |
| `actorUserId`    | text    |
| `actorLabel`     | text    |
| `subjectType`    | text    |
| `subjectId`      | text    |
| `subjectLabel`   | text    |
| `changes`        | json    |
| `correlationId`  | text    |

Not exported: `ipAddress`, `userAgent`.

## Excluded tables

| Table                | Why                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| `sessions`           | Bearer session tokens, addresses and browsers: credentials of individuals, not organisation data. |
| `accounts`           | Password hashes and sign-in provider tokens: credentials of individuals.                          |
| `verifications`      | Single-use verification and password-reset secrets; they belong to no organisation.               |
| `plan_locks`         | The pen’s lease: expires in minutes and describes who is editing right now, not stored work.      |
| `mail_events`        | Installation telemetry with no organisation, readable by staff only.                              |
| `csp_reports`        | Installation telemetry with no organisation, readable by staff only.                              |
| `perf_probe_results` | Staff’s measurements of the installation, not organisation data.                                  |
