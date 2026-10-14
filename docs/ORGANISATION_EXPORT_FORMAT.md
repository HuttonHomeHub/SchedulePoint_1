# The organisation export format

- **Format name:** `schedulepoint.organisation-export`
- **Version:** `1.0`
- **Decision:** [ADR-0194](adr/0194-an-organisations-export-is-a-promised-format-streamed-on-the-request.md)
- **Produced by:** the Org Admin's **Export data** (built in the milestones after this document; spec in
  [`specs/organisation-export/`](specs/organisation-export/feature-spec.md)).

This is the contract for the file an Org Admin downloads to take everything their organisation holds out
of SchedulePoint. It describes a **format**, not the database: the database layout is not promised
([ADR-0190](adr/0190-what-1-0-promises.md)), the files, keys and meanings below are. The column registry
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

- **Ids** are opaque text (UUIDs) and carry no order. Treat them as strings: compare them, never parse or order them for meaning.
- **Money** amounts are whole numbers (bigint) of the minor unit (cents, pence) of the plan's currency; a
  rate such as a resource's `costPerUnit` is a decimal in the same unit. A plan with no currency states none.
- **Units are in the name.** Every duration, lag, float and delay column ends in `Minutes` or `Days`, and the
  Notes column of each table says which. The API serves some of the same quantities in working days; the
  file never does, so a float here is `totalFloatMinutes`, not `totalFloat`.
- **Finish dates** (`earlyFinish`, `lateFinish`, `actualFinish`, `endDate` and the like) are the **inclusive
  last day**: the day the work finishes on, not the day after.
- **Computed and layout columns** (early and late dates, float, criticality, lane and placement columns) are
  exported as stored; the export never recalculates. Their meaning follows the scheduling engine of the
  version in the manifest's `generator.apiVersion`. That field is the product's version, not a property of
  the format; the format's version is `formatVersion`.
- **Keys** are camelCase. Each row carries the ids that join it to others.
- **CSV** is UTF-8 with a byte-order mark, comma-separated, CRLF line ends, RFC 4180 quoting, and a header
  row of the same keys as the JSON. A spreadsheet cell holds at most 32,767 characters, so a longer value is
  complete only in the JSON; import id columns as text so a spreadsheet does not reformat them.
- **The formula guard.** A `text` or `json` CSV cell that starts with `=`, `+`, `-` or `@` (or a tab,
  carriage return or line break, or one of those after spaces) is prefixed with an apostrophe so a
  spreadsheet does not run it. Numbers, dates and the other types are never prefixed: `-5.25` stays a number.
  **A CSV text cell may therefore begin with an apostrophe the data does not have; the JSON keeps the exact
  text.**
- **Order carries no meaning and is not promised.** Rows within a file are in a stable order for one
  export, but a reader must sort by whatever it needs and must not rely on the order, between files or
  between two exports.
- **Deleted items are included.** A client, project, plan or activity in the recycle bin, a removed member
  and a withdrawn invitation are exported with their `deletedAt` set.
- **One snapshot.** The export is one consistent read taken when it starts; edits made while it runs are
  not in it.

## Values that are open sets

`audit-events.action` and `audit-events.subjectType` are text drawn from vocabularies that grow. A new value
is a minor change, so a reader must tolerate values it does not know. `actorLabel` and `subjectLabel` are
free text copied at the time of the event.

## JSON columns

Two columns hold JSON rather than a scalar. Their **outer shape is promised; the keys inside are
informational**, because they follow the product's internal field names and may change without a major
version.

- `activity-history.changes`: an object keyed by item. A field item is `{ "from": …, "to": … }`; a link or
  resource-assignment item adds the other end and `from` / `to` states, or `null` where it did not exist.
  A description is recorded as its length and a truncated digest, never as text.
- `audit-events.changes`: `{ "before": { … }, "after": { … }, "truncated"?: true }`. Both sides are present
  even when a field appears on one; `truncated` is set when fields were dropped to fit the column.

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
      "file": "clients",
      "kind": "json",
      "rows": 12,
      "bytes": 4096,
      "sha256": "…",
      "stability": "promised"
    }
  ],
  "excluded": [{ "scope": "record-type", "name": "sign-in sessions", "reason": "…" }]
}
```

- `snapshot` and `includesDeleted` are reserved constants in 1.0 (`"consistent"` and `true`): an export has
  no options, so they cannot vary. They exist so a later version that adds one has somewhere to say so.
- `files[].stability` is `promised` or `informational` (see below). `files[].file` is the file's name as in
  the list below; no database name appears in the manifest.
- `excluded[].scope` is one of `record-type`, `column` or `rows` and is a closed set. For scope `column`,
  `name` is always `<file>.<field>`: the exported file's name and the name of the omitted column, a stable
  form. For the other scopes `name` and every `reason` are for a person to read and may be reworded.

## Versioning

- **To check compatibility, compare the major of `formatVersion` only** (the `1` of `1.0`). A reader written
  for `1.0` reads `1.4`; it does not read `2.0`.
- Adding a file or a column, or a new value of an enum, is a **minor** change (`1.1`).
- **New columns are appended at the end** of a file's column list, so a reader that takes columns by
  position keeps working within a major version.
- Removing or renaming a file or column, or changing a column's type, unit or meaning, is a **major** change
  (`2.0`) and, after 1.0, an API major.
- **Readers must ignore files and keys they do not know, and tolerate enum values they do not know.** The
  manifest's `formatVersion` is the contract.
- The three `records-*` files are **informational**: they note what the product itself once did to the data
  (a one-off migration). They are outside the compatibility promise and may change or be dropped in any
  version without a major. The manifest marks them `"stability": "informational"`. They are separate files
  rather than one, so that dropping one removes a file instead of rewriting a shared shape.
- Re-importing an export into SchedulePoint is not promised. The database backup
  ([ADR-0192](adr/0192-a-backup-is-a-file-the-image-writes-and-a-restore-never-overwrites.md)) is the
  restore path.

## What is never exported

- Credentials: password hashes, sign-in sessions, invitation and share-link token digests.
- The audit log's IP addresses and browser details, which the Audit log screen never shows either.
- People of other organisations, and audit events that belong to no organisation.
- Live editing locks, and the installation's own telemetry (listed at the end).
- Internal bookkeeping: the optimistic-lock `version` and the restore `deleteBatchId`.

The manifest lists every one of these with its reason.

## Enumerations

The values each enum column may hold today, by `file.column`. A newer minor version may add values.

- `members.role`: VIEWER, CONTRIBUTOR, PLANNER, ORG_ADMIN
- `invitations.role`: VIEWER, CONTRIBUTOR, PLANNER, ORG_ADMIN
- `invitations.status`: PENDING, ACCEPTED, REVOKED
- `plans.status`: DRAFT, ACTIVE, ARCHIVED
- `plans.progressRecalcMode`: RETAINED_LOGIC, PROGRESS_OVERRIDE, ACTUAL_DATES
- `plans.criticalPathDefinition`: TOTAL_FLOAT, LONGEST_PATH
- `plans.totalFloatMode`: START, FINISH, SMALLEST
- `plans.eacMethod`: CPI, REMAINING_AT_BUDGET, CPI_TIMES_SPI
- `plans.scheduleCriticalPathDefinition`: TOTAL_FLOAT, LONGEST_PATH
- `plans.scheduleTotalFloatMode`: START, FINISH, SMALLEST
- `activities.type`: TASK, START_MILESTONE, FINISH_MILESTONE, HAMMOCK, LEVEL_OF_EFFORT, WBS_SUMMARY, RESOURCE_DEPENDENT
- `activities.constraintType`: SNET, SNLT, FNET, FNLT, MSO, MFO, MANDATORY_START, MANDATORY_FINISH
- `activities.secondaryConstraintType`: SNET, SNLT, FNET, FNLT, MSO, MFO, MANDATORY_START, MANDATORY_FINISH
- `activities.durationType`: FIXED_DURATION_AND_UNITS_TIME, FIXED_DURATION_AND_UNITS, FIXED_UNITS, FIXED_UNITS_TIME
- `activities.status`: NOT_STARTED, IN_PROGRESS, COMPLETE
- `activities.percentCompleteType`: DURATION, UNITS, PHYSICAL
- `activities.accrualType`: START, UNIFORM, END
- `activities.visualConflictReason`: EARLIER_THAN_LOGIC, LATER_THAN_BOUND
- `dependencies.type`: FS, SS, FF, SF
- `dependencies.lagCalendar`: PREDECESSOR, SUCCESSOR, TWENTY_FOUR_HOUR, PROJECT_DEFAULT
- `cross-plan-dependencies.type`: FS, SS, FF, SF
- `cross-plan-dependencies.lagCalendar`: PREDECESSOR, SUCCESSOR, TWENTY_FOUR_HOUR, PROJECT_DEFAULT
- `calendars.scope`: ORG, PROJECT
- `baselines.costSnapshotLevel`: ACTIVITY, ASSIGNMENT
- `baselines.revisionSnapshotLevel`: NONE, FULL
- `baselines.placementSnapshotLevel`: NONE, FULL
- `baselines.criticalPathDefinition`: TOTAL_FLOAT, LONGEST_PATH
- `baselines.totalFloatMode`: START, FINISH, SMALLEST
- `baseline-activities.type`: TASK, START_MILESTONE, FINISH_MILESTONE, HAMMOCK, LEVEL_OF_EFFORT, WBS_SUMMARY, RESOURCE_DEPENDENT
- `baseline-activities.constraintType`: SNET, SNLT, FNET, FNLT, MSO, MFO, MANDATORY_START, MANDATORY_FINISH
- `baseline-activities.secondaryConstraintType`: SNET, SNLT, FNET, FNLT, MSO, MFO, MANDATORY_START, MANDATORY_FINISH
- `baseline-dependencies.type`: FS, SS, FF, SF
- `baseline-dependencies.lagCalendar`: PREDECESSOR, SUCCESSOR, TWENTY_FOUR_HOUR, PROJECT_DEFAULT
- `records-placement-migrations.priorConstraintType`: SNET, SNLT, FNET, FNLT, MSO, MFO, MANDATORY_START, MANDATORY_FINISH
- `records-cross-plan-lags.lagCalendar`: PREDECESSOR, SUCCESSOR, TWENTY_FOUR_HOUR, PROJECT_DEFAULT
- `resources.kind`: LABOUR, EQUIPMENT, MATERIAL, GROUP
- `assignments.curveType`: UNIFORM, BELL, FRONT_LOADED, BACK_LOADED, DOUBLE_PEAK
- `activity-history.scope`: DEFINITION, PROGRESS, PLACEMENT, LOGIC, RESOURCES
- `activity-history.origin`: ACTIVITY_DELETED, ACTIVITY_RESTORED, SUMMARY_DISSOLVED
- `notes.entityType`: PLAN, ACTIVITY
- `audit-events.outcome`: SUCCESS, DENIED, FAILURE
- `audit-events.actorType`: USER, GUEST, SYSTEM, ANONYMOUS, STAFF

## Files

### `people`

Rows: people who are or were members of this organisation. Files `json/people.json` and `csv/people.csv`.

| Column      | Type    | Notes |
| ----------- | ------- | ----- |
| `id`        | text    |       |
| `name`      | text    |       |
| `email`     | text    |       |
| `createdAt` | instant |       |

Not exported: `emailVerified`, `image`, `updatedAt`.

### `organization`

Rows: the organisation’s own row. Files `json/organization.json` and `csv/organization.csv`.

| Column      | Type    | Notes |
| ----------- | ------- | ----- |
| `id`        | text    |       |
| `name`      | text    |       |
| `slug`      | text    |       |
| `createdAt` | instant |       |
| `updatedAt` | instant |       |
| `createdBy` | text    |       |
| `updatedBy` | text    |       |
| `deletedAt` | instant |       |

Not exported: `version`.

### `members`

Rows: every row of the organisation. Files `json/members.json` and `csv/members.csv`.

| Column           | Type    | Notes |
| ---------------- | ------- | ----- |
| `id`             | text    |       |
| `organizationId` | text    |       |
| `userId`         | text    |       |
| `role`           | enum    |       |
| `createdAt`      | instant |       |
| `updatedAt`      | instant |       |
| `createdBy`      | text    |       |
| `updatedBy`      | text    |       |
| `deletedAt`      | instant |       |

Not exported: `version`.

### `invitations`

Rows: every row of the organisation. Files `json/invitations.json` and `csv/invitations.csv`.

| Column             | Type    | Notes |
| ------------------ | ------- | ----- |
| `id`               | text    |       |
| `organizationId`   | text    |       |
| `email`            | text    |       |
| `role`             | enum    |       |
| `status`           | enum    |       |
| `expiresAt`        | instant |       |
| `acceptedByUserId` | text    |       |
| `acceptedAt`       | instant |       |
| `createdAt`        | instant |       |
| `updatedAt`        | instant |       |
| `createdBy`        | text    |       |
| `updatedBy`        | text    |       |
| `deletedAt`        | instant |       |

Not exported: `tokenHash`, `version`.

### `clients`

Rows: every row of the organisation. Files `json/clients.json` and `csv/clients.csv`.

| Column           | Type    | Notes |
| ---------------- | ------- | ----- |
| `id`             | text    |       |
| `organizationId` | text    |       |
| `name`           | text    |       |
| `description`    | text    |       |
| `createdAt`      | instant |       |
| `updatedAt`      | instant |       |
| `createdBy`      | text    |       |
| `updatedBy`      | text    |       |
| `deletedAt`      | instant |       |

Not exported: `version`, `deleteBatchId`.

### `projects`

Rows: every row of the organisation. Files `json/projects.json` and `csv/projects.csv`.

| Column           | Type    | Notes |
| ---------------- | ------- | ----- |
| `id`             | text    |       |
| `organizationId` | text    |       |
| `clientId`       | text    |       |
| `name`           | text    |       |
| `description`    | text    |       |
| `createdAt`      | instant |       |
| `updatedAt`      | instant |       |
| `createdBy`      | text    |       |
| `updatedBy`      | text    |       |
| `deletedAt`      | instant |       |

Not exported: `version`, `deleteBatchId`.

### `plans`

Rows: every row of the organisation. Files `json/plans.json` and `csv/plans.csv`.

| Column                                  | Type    | Notes   |
| --------------------------------------- | ------- | ------- |
| `id`                                    | text    |         |
| `organizationId`                        | text    |         |
| `projectId`                             | text    |         |
| `name`                                  | text    |         |
| `description`                           | text    |         |
| `status`                                | enum    |         |
| `progressRecalcMode`                    | enum    |         |
| `useExpectedFinishDates`                | boolean |         |
| `criticalPathDefinition`                | enum    |         |
| `criticalFloatThresholdMinutes`         | int     | minutes |
| `totalFloatMode`                        | enum    |         |
| `makeOpenEndsCritical`                  | boolean |         |
| `levelResources`                        | boolean |         |
| `levelWithinFloatOnly`                  | boolean |         |
| `ignoreExternalRelationships`           | boolean |         |
| `eacMethod`                             | enum    |         |
| `currencyCode`                          | text    |         |
| `plannedStart`                          | date    |         |
| `calendarId`                            | text    |         |
| `scheduleComputedAt`                    | instant |         |
| `scheduleCriticalPathDefinition`        | enum    |         |
| `scheduleCriticalFloatThresholdMinutes` | int     | minutes |
| `scheduleTotalFloatMode`                | enum    |         |
| `scheduleMakeOpenEndsCritical`          | boolean |         |
| `scheduleInputsChangedAt`               | instant |         |
| `createdAt`                             | instant |         |
| `updatedAt`                             | instant |         |
| `createdBy`                             | text    |         |
| `updatedBy`                             | text    |         |
| `deletedAt`                             | instant |         |

Not exported: `version`, `deleteBatchId`.

### `activities`

Rows: every row of the organisation. Files `json/activities.json` and `csv/activities.csv`.

| Column                     | Type    | Notes                                                 |
| -------------------------- | ------- | ----------------------------------------------------- |
| `id`                       | text    |                                                       |
| `organizationId`           | text    |                                                       |
| `planId`                   | text    |                                                       |
| `code`                     | text    |                                                       |
| `name`                     | text    |                                                       |
| `description`              | text    |                                                       |
| `type`                     | enum    |                                                       |
| `durationMinutes`          | int     | minutes                                               |
| `calendarId`               | text    |                                                       |
| `constraintType`           | enum    |                                                       |
| `constraintDate`           | date    |                                                       |
| `secondaryConstraintType`  | enum    |                                                       |
| `secondaryConstraintDate`  | date    |                                                       |
| `externalEarlyStart`       | instant |                                                       |
| `externalLateFinish`       | instant |                                                       |
| `durationType`             | enum    |                                                       |
| `laneIndex`                | int     | diagram row number; 0 is the first row                |
| `scheduleAsLateAsPossible` | boolean |                                                       |
| `levelingPriority`         | int     | lower number = higher priority; empty = no preference |
| `status`                   | enum    |                                                       |
| `percentComplete`          | int     | whole percent, 0 to 100                               |
| `actualStart`              | date    |                                                       |
| `actualFinish`             | date    | inclusive last day                                    |
| `remainingDurationMinutes` | int     | minutes                                               |
| `suspendDate`              | date    |                                                       |
| `resumeDate`               | date    |                                                       |
| `expectedFinish`           | date    | inclusive last day                                    |
| `percentCompleteType`      | enum    |                                                       |
| `physicalPercentComplete`  | int     | whole percent, 0 to 100                               |
| `budgetedExpense`          | bigint  |                                                       |
| `actualExpense`            | bigint  |                                                       |
| `accrualType`              | enum    |                                                       |
| `parentId`                 | text    |                                                       |
| `earlyStart`               | date    |                                                       |
| `earlyFinish`              | date    | inclusive last day                                    |
| `lateStart`                | date    |                                                       |
| `lateFinish`               | date    | inclusive last day                                    |
| `totalFloatMinutes`        | int     | minutes                                               |
| `freeFloatMinutes`         | int     | minutes                                               |
| `isCritical`               | boolean |                                                       |
| `isNearCritical`           | boolean |                                                       |
| `constraintViolated`       | boolean |                                                       |
| `externalDriven`           | boolean |                                                       |
| `loeNoSpan`                | boolean |                                                       |
| `resourceDriverMissing`    | boolean |                                                       |
| `visualStart`              | date    |                                                       |
| `visualEffectiveStart`     | date    |                                                       |
| `visualEffectiveFinish`    | date    | inclusive last day                                    |
| `visualConflict`           | boolean |                                                       |
| `visualDriftDays`          | int     | days                                                  |
| `visualConflictReason`     | enum    |                                                       |
| `remainingFloatMinutes`    | int     | minutes                                               |
| `leveledStart`             | date    |                                                       |
| `leveledFinish`            | date    | inclusive last day                                    |
| `levelingDelayMinutes`     | int     | minutes                                               |
| `levelingWindowExceeded`   | boolean |                                                       |
| `selfOverAllocated`        | boolean |                                                       |
| `createdAt`                | instant |                                                       |
| `updatedAt`                | instant |                                                       |
| `createdBy`                | text    |                                                       |
| `updatedBy`                | text    |                                                       |
| `deletedAt`                | instant |                                                       |

Not exported: `version`, `deleteBatchId`.

### `dependencies`

Rows: every row of the organisation. Files `json/dependencies.json` and `csv/dependencies.csv`.

| Column           | Type    | Notes   |
| ---------------- | ------- | ------- |
| `id`             | text    |         |
| `organizationId` | text    |         |
| `planId`         | text    |         |
| `predecessorId`  | text    |         |
| `successorId`    | text    |         |
| `type`           | enum    |         |
| `lagMinutes`     | int     | minutes |
| `lagCalendar`    | enum    |         |
| `isDriving`      | boolean |         |
| `createdAt`      | instant |         |
| `updatedAt`      | instant |         |
| `createdBy`      | text    |         |
| `updatedBy`      | text    |         |
| `deletedAt`      | instant |         |

Not exported: `version`, `deleteBatchId`.

### `cross-plan-dependencies`

Rows: every row of the organisation. Files `json/cross-plan-dependencies.json` and `csv/cross-plan-dependencies.csv`.

| Column              | Type    | Notes   |
| ------------------- | ------- | ------- |
| `id`                | text    |         |
| `organizationId`    | text    |         |
| `predecessorPlanId` | text    |         |
| `successorPlanId`   | text    |         |
| `predecessorId`     | text    |         |
| `successorId`       | text    |         |
| `type`              | enum    |         |
| `lagMinutes`        | int     | minutes |
| `lagCalendar`       | enum    |         |
| `createdAt`         | instant |         |
| `updatedAt`         | instant |         |
| `createdBy`         | text    |         |
| `updatedBy`         | text    |         |
| `deletedAt`         | instant |         |

Not exported: `version`, `deleteBatchId`.

### `calendars`

Rows: every row of the organisation. Files `json/calendars.json` and `csv/calendars.csv`.

| Column           | Type    | Notes                                                        |
| ---------------- | ------- | ------------------------------------------------------------ |
| `id`             | text    |                                                              |
| `organizationId` | text    |                                                              |
| `name`           | text    |                                                              |
| `description`    | text    |                                                              |
| `scope`          | enum    |                                                              |
| `projectId`      | text    |                                                              |
| `workdayMinutes` | int     | minutes in a standard working day (converts days to minutes) |
| `archivedAt`     | instant |                                                              |
| `createdAt`      | instant |                                                              |
| `updatedAt`      | instant |                                                              |
| `createdBy`      | text    |                                                              |
| `updatedBy`      | text    |                                                              |
| `deletedAt`      | instant |                                                              |

Not exported: `version`, `deleteBatchId`.

### `calendar-exceptions`

Rows: every row of the organisation. Files `json/calendar-exceptions.json` and `csv/calendar-exceptions.csv`.

| Column           | Type    | Notes              |
| ---------------- | ------- | ------------------ |
| `id`             | text    |                    |
| `organizationId` | text    |                    |
| `calendarId`     | text    |                    |
| `startDate`      | date    |                    |
| `endDate`        | date    | inclusive last day |
| `label`          | text    |                    |
| `createdAt`      | instant |                    |
| `updatedAt`      | instant |                    |
| `createdBy`      | text    |                    |
| `updatedBy`      | text    |                    |
| `deletedAt`      | instant |                    |

Not exported: `version`, `deleteBatchId`.

### `calendar-shifts`

Rows: every row belonging to the organisation’s calendars. Files `json/calendar-shifts.json` and `csv/calendar-shifts.csv`.

| Column        | Type    | Notes                             |
| ------------- | ------- | --------------------------------- |
| `id`          | text    |                                   |
| `calendarId`  | text    |                                   |
| `weekday`     | int     | Monday = 0 … Sunday = 6           |
| `startMinute` | int     | minutes after midnight, 0 to 1440 |
| `endMinute`   | int     | minutes after midnight, 0 to 1440 |
| `createdAt`   | instant |                                   |
| `updatedAt`   | instant |                                   |

### `calendar-exception-windows`

Rows: every row belonging to the organisation’s calendars. Files `json/calendar-exception-windows.json` and `csv/calendar-exception-windows.csv`.

| Column                | Type    | Notes                             |
| --------------------- | ------- | --------------------------------- |
| `id`                  | text    |                                   |
| `calendarExceptionId` | text    |                                   |
| `startMinute`         | int     | minutes after midnight, 0 to 1440 |
| `endMinute`           | int     | minutes after midnight, 0 to 1440 |
| `createdAt`           | instant |                                   |
| `updatedAt`           | instant |                                   |

### `baselines`

Rows: every row of the organisation. Files `json/baselines.json` and `csv/baselines.csv`.

| Column                          | Type    | Notes                                                        |
| ------------------------------- | ------- | ------------------------------------------------------------ |
| `id`                            | text    |                                                              |
| `organizationId`                | text    |                                                              |
| `planId`                        | text    |                                                              |
| `name`                          | text    |                                                              |
| `isActive`                      | boolean |                                                              |
| `capturedAt`                    | instant |                                                              |
| `dataDate`                      | date    |                                                              |
| `capturedProjectFinish`         | date    | inclusive last day                                           |
| `workdayMinutes`                | int     | minutes in a standard working day (converts days to minutes) |
| `costSnapshotLevel`             | enum    |                                                              |
| `revisionSnapshotLevel`         | enum    |                                                              |
| `placementSnapshotLevel`        | enum    |                                                              |
| `criticalPathDefinition`        | enum    |                                                              |
| `criticalFloatThresholdMinutes` | int     | minutes                                                      |
| `totalFloatMode`                | enum    |                                                              |
| `makeOpenEndsCritical`          | boolean |                                                              |
| `createdAt`                     | instant |                                                              |
| `updatedAt`                     | instant |                                                              |
| `createdBy`                     | text    |                                                              |
| `updatedBy`                     | text    |                                                              |
| `deletedAt`                     | instant |                                                              |

Not exported: `version`, `deleteBatchId`.

### `baseline-activities`

Rows: every row of the organisation. Files `json/baseline-activities.json` and `csv/baseline-activities.csv`.

| Column                    | Type    | Notes                                  |
| ------------------------- | ------- | -------------------------------------- |
| `id`                      | text    |                                        |
| `organizationId`          | text    |                                        |
| `baselineId`              | text    |                                        |
| `sourceActivityId`        | text    |                                        |
| `code`                    | text    |                                        |
| `name`                    | text    |                                        |
| `type`                    | enum    |                                        |
| `durationMinutes`         | int     | minutes                                |
| `baselineStart`           | date    |                                        |
| `baselineFinish`          | date    | inclusive last day                     |
| `lateStart`               | date    |                                        |
| `lateFinish`              | date    | inclusive last day                     |
| `totalFloatMinutes`       | int     | minutes                                |
| `isCritical`              | boolean |                                        |
| `budgetedCost`            | bigint  |                                        |
| `budgetedExpense`         | bigint  |                                        |
| `laneIndex`               | int     | diagram row number; 0 is the first row |
| `parentId`                | text    |                                        |
| `calendarId`              | text    |                                        |
| `constraintType`          | enum    |                                        |
| `constraintDate`          | date    |                                        |
| `secondaryConstraintType` | enum    |                                        |
| `secondaryConstraintDate` | date    |                                        |
| `percentComplete`         | int     | whole percent, 0 to 100                |
| `actualStart`             | date    |                                        |
| `actualFinish`            | date    | inclusive last day                     |
| `placedStart`             | date    |                                        |
| `placedFinish`            | date    | inclusive last day                     |
| `visualStart`             | date    |                                        |
| `createdAt`               | instant |                                        |
| `updatedAt`               | instant |                                        |
| `createdBy`               | text    |                                        |
| `updatedBy`               | text    |                                        |
| `deletedAt`               | instant |                                        |

Not exported: `version`, `deleteBatchId`.

### `baseline-assignments`

Rows: every row of the organisation. Files `json/baseline-assignments.json` and `csv/baseline-assignments.csv`.

| Column               | Type    | Notes   |
| -------------------- | ------- | ------- |
| `id`                 | text    |         |
| `organizationId`     | text    |         |
| `baselineId`         | text    |         |
| `sourceAssignmentId` | text    |         |
| `sourceActivityId`   | text    |         |
| `sourceResourceId`   | text    |         |
| `budgetedCost`       | bigint  |         |
| `lagMinutes`         | int     | minutes |
| `createdAt`          | instant |         |
| `updatedAt`          | instant |         |
| `createdBy`          | text    |         |
| `updatedBy`          | text    |         |
| `deletedAt`          | instant |         |

Not exported: `version`, `deleteBatchId`.

### `baseline-dependencies`

Rows: every row of the organisation. Files `json/baseline-dependencies.json` and `csv/baseline-dependencies.csv`.

| Column                | Type    | Notes   |
| --------------------- | ------- | ------- |
| `id`                  | text    |         |
| `organizationId`      | text    |         |
| `baselineId`          | text    |         |
| `sourceDependencyId`  | text    |         |
| `sourcePredecessorId` | text    |         |
| `sourceSuccessorId`   | text    |         |
| `type`                | enum    |         |
| `lagMinutes`          | int     | minutes |
| `lagCalendar`         | enum    |         |
| `isDriving`           | boolean |         |
| `createdAt`           | instant |         |
| `updatedAt`           | instant |         |
| `createdBy`           | text    |         |
| `updatedBy`           | text    |         |
| `deletedAt`           | instant |         |

Not exported: `version`, `deleteBatchId`.

### `shares`

Rows: every row of the organisation. Files `json/shares.json` and `csv/shares.csv`.

| Column           | Type    | Notes |
| ---------------- | ------- | ----- |
| `id`             | text    |       |
| `organizationId` | text    |       |
| `planId`         | text    |       |
| `label`          | text    |       |
| `expiresAt`      | instant |       |
| `revokedAt`      | instant |       |
| `lastAccessedAt` | instant |       |
| `createdAt`      | instant |       |
| `updatedAt`      | instant |       |
| `createdBy`      | text    |       |
| `updatedBy`      | text    |       |
| `deletedAt`      | instant |       |

Not exported: `tokenHash`, `version`, `deleteBatchId`.

### `records-placement-migrations`

Rows: every row of the organisation. Files `json/records-placement-migrations.json` and `csv/records-placement-migrations.csv`.

**Informational:** outside the compatibility promise; it may change or be dropped without a major version.

| Column                | Type    | Notes |
| --------------------- | ------- | ----- |
| `id`                  | text    |       |
| `organizationId`      | text    |       |
| `planId`              | text    |       |
| `activityId`          | text    |       |
| `activityCode`        | text    |       |
| `activityName`        | text    |       |
| `priorConstraintType` | enum    |       |
| `priorConstraintDate` | date    |       |
| `priorVisualStart`    | date    |       |
| `migratedAt`          | instant |       |

### `records-finish-milestone-dates`

Rows: every row of the organisation. Files `json/records-finish-milestone-dates.json` and `csv/records-finish-milestone-dates.csv`.

**Informational:** outside the compatibility promise; it may change or be dropped without a major version.

| Column             | Type    | Notes |
| ------------------ | ------- | ----- |
| `id`               | text    |       |
| `organizationId`   | text    |       |
| `planId`           | text    |       |
| `activityId`       | text    |       |
| `activityCode`     | text    |       |
| `activityName`     | text    |       |
| `priorVisualStart` | date    |       |
| `migratedAt`       | instant |       |

### `records-cross-plan-lags`

Rows: every row of the organisation. Files `json/records-cross-plan-lags.json` and `csv/records-cross-plan-lags.csv`.

**Informational:** outside the compatibility promise; it may change or be dropped without a major version.

| Column                  | Type    | Notes   |
| ----------------------- | ------- | ------- |
| `id`                    | text    |         |
| `organizationId`        | text    |         |
| `planId`                | text    |         |
| `crossPlanDependencyId` | text    |         |
| `lagCalendar`           | enum    |         |
| `lagCalendarId`         | text    |         |
| `dayFactorMinutes`      | int     | minutes |
| `priorLagMinutes`       | int     | minutes |
| `newLagMinutes`         | int     | minutes |
| `migratedAt`            | instant |         |

### `resources`

Rows: every row of the organisation. Files `json/resources.json` and `csv/resources.csv`.

| Column            | Type    | Notes |
| ----------------- | ------- | ----- |
| `id`              | text    |       |
| `organizationId`  | text    |       |
| `name`            | text    |       |
| `code`            | text    |       |
| `description`     | text    |       |
| `kind`            | enum    |       |
| `parentId`        | text    |       |
| `calendarId`      | text    |       |
| `maxUnitsPerHour` | decimal |       |
| `costPerUnit`     | decimal |       |
| `archivedAt`      | instant |       |
| `createdAt`       | instant |       |
| `updatedAt`       | instant |       |
| `createdBy`       | text    |       |
| `updatedBy`       | text    |       |
| `deletedAt`       | instant |       |

Not exported: `version`, `deleteBatchId`.

### `assignments`

Rows: every row of the organisation. Files `json/assignments.json` and `csv/assignments.csv`.

| Column           | Type    | Notes   |
| ---------------- | ------- | ------- |
| `id`             | text    |         |
| `organizationId` | text    |         |
| `activityId`     | text    |         |
| `resourceId`     | text    |         |
| `budgetedUnits`  | decimal |         |
| `unitsPerHour`   | decimal |         |
| `isDriving`      | boolean |         |
| `curveType`      | enum    |         |
| `lagMinutes`     | int     | minutes |
| `budgetedCost`   | bigint  |         |
| `actualCost`     | bigint  |         |
| `actualUnits`    | decimal |         |
| `createdAt`      | instant |         |
| `updatedAt`      | instant |         |
| `createdBy`      | text    |         |
| `updatedBy`      | text    |         |
| `deletedAt`      | instant |         |

Not exported: `version`, `deleteBatchId`.

### `activity-steps`

Rows: every row of the organisation. Files `json/activity-steps.json` and `csv/activity-steps.csv`.

| Column            | Type    | Notes                                |
| ----------------- | ------- | ------------------------------------ |
| `id`              | text    |                                      |
| `organizationId`  | text    |                                      |
| `activityId`      | text    |                                      |
| `seq`             | int     | position in the checklist, 1 upwards |
| `name`            | text    |                                      |
| `weight`          | decimal |                                      |
| `percentComplete` | int     | whole percent, 0 to 100              |
| `createdAt`       | instant |                                      |
| `updatedAt`       | instant |                                      |
| `createdBy`       | text    |                                      |
| `updatedBy`       | text    |                                      |
| `deletedAt`       | instant |                                      |

Not exported: `version`, `deleteBatchId`.

### `activity-history`

Rows: every row of the organisation. Files `json/activity-history.json` and `csv/activity-history.csv`.

| Column             | Type    | Notes                  |
| ------------------ | ------- | ---------------------- |
| `id`               | text    |                        |
| `organizationId`   | text    |                        |
| `activityId`       | text    |                        |
| `actorUserId`      | text    |                        |
| `scope`            | enum    |                        |
| `firstRecordedAt`  | instant |                        |
| `lastRecordedAt`   | instant |                        |
| `editCount`        | int     |                        |
| `batchId`          | text    |                        |
| `batchSize`        | int     |                        |
| `origin`           | enum    |                        |
| `hasNonCostChange` | boolean |                        |
| `changes`          | json    | JSON; see JSON columns |

### `notes`

Rows: every row of the organisation. Files `json/notes.json` and `csv/notes.csv`.

| Column           | Type    | Notes |
| ---------------- | ------- | ----- |
| `id`             | text    |       |
| `organizationId` | text    |       |
| `entityType`     | enum    |       |
| `planId`         | text    |       |
| `activityId`     | text    |       |
| `body`           | text    |       |
| `createdAt`      | instant |       |
| `updatedAt`      | instant |       |
| `createdBy`      | text    |       |
| `updatedBy`      | text    |       |
| `deletedAt`      | instant |       |

Not exported: `version`, `deleteBatchId`.

### `audit-events`

Rows: every row of the organisation. Files `json/audit-events.json` and `csv/audit-events.csv`.

| Column           | Type    | Notes                                 |
| ---------------- | ------- | ------------------------------------- |
| `id`             | text    |                                       |
| `occurredAt`     | instant |                                       |
| `organizationId` | text    |                                       |
| `action`         | text    | open set; may grow in a minor version |
| `outcome`        | enum    |                                       |
| `actorType`      | enum    |                                       |
| `actorUserId`    | text    |                                       |
| `actorLabel`     | text    | free text, copied at the time         |
| `subjectType`    | text    | open set; may grow in a minor version |
| `subjectId`      | text    |                                       |
| `subjectLabel`   | text    | free text, copied at the time         |
| `changes`        | json    | JSON; see JSON columns                |
| `correlationId`  | text    |                                       |

Not exported: `ipAddress`, `userAgent`.

## Excluded record types

| Record type                             | Why                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| sign-in sessions                        | Bearer session tokens, addresses and browsers: credentials of individuals, not organisation data. |
| sign-in accounts and credentials        | Password hashes and sign-in provider tokens: credentials of individuals.                          |
| verification and password-reset secrets | Single-use verification and password-reset secrets; they belong to no organisation.               |
| live editing locks                      | The pen’s lease: expires in minutes and describes who is editing right now, not stored work.      |
| mail delivery telemetry                 | Installation telemetry with no organisation, readable by staff only.                              |
| browser security reports                | Installation telemetry with no organisation, readable by staff only.                              |
| performance measurements                | Staff’s measurements of the installation, not organisation data.                                  |
