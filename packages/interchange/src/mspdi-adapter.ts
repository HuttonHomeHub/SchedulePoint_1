import type {
  CanonicalActivity,
  CanonicalActivityStatus,
  CanonicalActivityType,
  CanonicalAssignment,
  CanonicalCalendar,
  CanonicalConstraintType,
  CanonicalModel,
  CanonicalProgress,
  CanonicalProject,
  CanonicalRelationship,
  CanonicalRelationshipType,
  CanonicalResource,
  CanonicalResourceKind,
} from './canonical.js';
import { parseMspdiCalendar } from './mspdi-calendar.js';
import { childElements, childText, type MspdiDocument, type MspdiElement } from './mspdi-parser.js';
import type { ReportFinding } from './report.js';
import { fallbackWorkWeek } from './xer-calendar.js';

/**
 * The **MSPDI → canonical adapter** (ADR-0050, Task 3.3). This is the only place Microsoft Project's MSPDI
 * vocabulary and conventions live: element names (`<Task>`/`<PredecessorLink>`/`<Calendar>`/`<Resource>`),
 * the numeric enum spellings (`<Type>`/`<ConstraintType>`/`<DayType>`), the ISO-8601 `PT#H#M#S` duration
 * convention, the **tenths-of-a-minute** `<LinkLag>` unit, MSP's single-milestone / outline-level WBS
 * model, and the first-project rule. It turns a parsed {@link MspdiDocument} into the **same**
 * format-neutral {@link CanonicalModel} the XER path produces, plus a flat list of {@link ReportFinding}s
 * (unit coercions, unmapped kinds, dropped detail). Downstream steps — the mapper, validate/repair/report
 * and commit pipeline — never see an MSPDI concept, so they are reused unchanged (ADR-0050).
 *
 * Pure + deterministic: no I/O, clock or randomness. Structural impossibilities (no data date) are
 * returned as a typed error — everything else is coerced/mapped and reported, never thrown.
 */

// ---------------------------------------------------------------------------------------------------------
// MSPDI enum spellings (the MS Project vocabulary — kept together as the mapping contract's source values).
// ---------------------------------------------------------------------------------------------------------

/**
 * MSP `<PredecessorLink><Type>` → canonical relationship type. MSP numbers links `0 = FF, 1 = FS, 2 = SF,
 * 3 = SS`. Anything else → FS (coerced + reported).
 */
const LINK_TYPE_TO_CANONICAL: Readonly<Record<string, CanonicalRelationshipType>> = {
  '0': 'FF',
  '1': 'FS',
  '2': 'SF',
  '3': 'SS',
};

/**
 * MSP `<Task><ConstraintType>` → canonical `ConstraintType` (ADR-0035 §7). MSP numbers constraints
 * `0 = ASAP, 1 = ALAP, 2 = MSO, 3 = MFO, 4 = SNET, 5 = SNLT, 6 = FNET, 7 = FNLT`. `0` (ASAP) is the
 * unconstrained default (→ none) and `1` (ALAP) sets the activity flag; both are handled separately. Any
 * value outside `0–7` is dropped + reported.
 */
const CONSTRAINT_TYPE_TO_CANONICAL: Readonly<Record<string, CanonicalConstraintType>> = {
  '2': 'MSO',
  '3': 'MFO',
  '4': 'SNET',
  '5': 'SNLT',
  '6': 'FNET',
  '7': 'FNLT',
};

/**
 * MSP `<Resource><Type>` → canonical `ResourceKind` (ADR-0039). MSP numbers resources `0 = Material,
 * 1 = Work, 2 = Cost`. A Cost resource has no SchedulePoint equivalent and is approximated to `EQUIPMENT`
 * + reported; an unknown value → `LABOUR` + reported.
 */
const RESOURCE_TYPE_TO_CANONICAL: Readonly<Record<string, CanonicalResourceKind>> = {
  '0': 'MATERIAL',
  '1': 'LABOUR',
  '2': 'EQUIPMENT',
};

/**
 * Look up an enum value by an **attacker-controlled** MSPDI field value without inheriting an
 * `Object.prototype` member (a plain-object lookup would return real inherited members for magic keys like
 * `__proto__` / `constructor`, silently bypassing the "unmapped → coerce + report" branch). `Object.hasOwn`
 * makes every unrecognised source value miss, so the coerce-and-report contract holds for the whole key space.
 */
function lookup<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(table, key) ? table[key] : undefined;
}

/** Signed working-minute bound (± ~10 years) mirroring the domain `lag_minutes` / duration CHECK range. */
const MINUTE_BOUND = 5_256_000;

// ---------------------------------------------------------------------------------------------------------
// Typed adapter result.
// ---------------------------------------------------------------------------------------------------------

export interface MspdiAdaptError {
  readonly code: 'NO_DATA_DATE';
  readonly message: string;
}

export type MspdiAdaptResult =
  | { ok: true; model: CanonicalModel; findings: ReportFinding[] }
  | { ok: false; error: MspdiAdaptError };

// ---------------------------------------------------------------------------------------------------------
// Small typed accessors (MSPDI leaf values are `string`; a missing element is `undefined`).
// ---------------------------------------------------------------------------------------------------------

/** A finite numeric leaf value, or `undefined`. */
function numField(element: MspdiElement, name: string): number | undefined {
  const raw = childText(element, name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

/** The `YYYY-MM-DD` prefix of an MSP datetime leaf (`"2026-01-05T08:00:00"` → `"2026-01-05"`), or `undefined`. */
function isoDateField(element: MspdiElement, name: string): string | undefined {
  const raw = childText(element, name);
  if (raw === undefined) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  return match === null ? undefined : `${match[1]}-${match[2]}-${match[3]}`;
}

/** A coerced working-minute value plus flags when the conversion was lossy (rounded or clamped). */
interface Coerced {
  readonly minutes: number;
  readonly rounded: boolean;
  readonly clamped: boolean;
}

function clampMinutes(rawMinutes: number, signed: boolean): Coerced {
  let minutes = Math.round(rawMinutes);
  const rounded = Math.abs(rawMinutes - minutes) > 1e-9;
  const lower = signed ? -MINUTE_BOUND : 0;
  let clamped = false;
  if (minutes < lower) {
    minutes = lower;
    clamped = true;
  } else if (minutes > MINUTE_BOUND) {
    minutes = MINUTE_BOUND;
    clamped = true;
  }
  return { minutes, rounded, clamped };
}

/**
 * Parse an MSPDI duration to working-minutes. MSP writes durations as an ISO-8601 timespan
 * `P[nD]T[nH][nM][nS]` (e.g. `PT40H0M0S`); a bare number is accepted as a minute count. Returns the coerced
 * minutes + lossy flags, or `undefined` when the value is not a duration at all.
 */
function durationToMinutes(raw: string | undefined): Coerced | undefined {
  if (raw === undefined) return undefined;
  const iso = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(raw.trim());
  if (iso !== null && iso.slice(1).some((part) => part !== undefined)) {
    const days = Number(iso[1] ?? 0);
    const hours = Number(iso[2] ?? 0);
    const minutes = Number(iso[3] ?? 0);
    const seconds = Number(iso[4] ?? 0);
    return clampMinutes(days * 1440 + hours * 60 + minutes + seconds / 60, false);
  }
  const bare = Number(raw.trim());
  return Number.isFinite(bare) ? clampMinutes(bare, false) : undefined;
}

// ---------------------------------------------------------------------------------------------------------
// Constraints (primary + secondary + ALAP + Deadline, ADR-0035 §7–§12).
// ---------------------------------------------------------------------------------------------------------

interface MappedConstraints {
  readonly constraintType: CanonicalConstraintType | null;
  readonly constraintDate: string | null;
  readonly secondaryConstraintType: CanonicalConstraintType | null;
  readonly secondaryConstraintDate: string | null;
  readonly scheduleAsLateAsPossible: boolean;
}

/**
 * Map a task's `<ConstraintType>`/`<ConstraintDate>` (primary) and `<Deadline>` (→ a secondary FNLT
 * bound, MSP's soft finish target) to the canonical constraint slots + ALAP flag. `0` (ASAP) is no
 * constraint; `1` (ALAP) sets the flag; an out-of-range constraint value is dropped + reported. A missing
 * constraint date leaves the slot for the validate step to drop as an orphan.
 */
function mapConstraints(
  task: MspdiElement,
  taskId: string,
  findings: ReportFinding[],
): MappedConstraints {
  let constraintType: CanonicalConstraintType | null = null;
  let constraintDate: string | null = null;
  let scheduleAsLateAsPossible = false;

  const rawType = childText(task, 'ConstraintType');
  if (rawType !== undefined && rawType !== '0') {
    if (rawType === '1') {
      scheduleAsLateAsPossible = true;
    } else {
      const type = lookup(CONSTRAINT_TYPE_TO_CANONICAL, rawType);
      if (type === undefined) {
        findings.push({
          kind: 'approximation',
          entity: 'constraint',
          sourceRef: taskId,
          detail: `constraint type "${rawType}" is not supported and was dropped`,
          reason: 'unmapped constraint kind (ADR-0035 §7)',
        });
      } else {
        constraintType = type;
        constraintDate = isoDateField(task, 'ConstraintDate') ?? null;
      }
    }
  }

  // A <Deadline> is MSP's soft finish target → the secondary slot as an FNLT bound (approximation).
  let secondaryConstraintType: CanonicalConstraintType | null = null;
  let secondaryConstraintDate: string | null = null;
  const deadline = isoDateField(task, 'Deadline');
  if (deadline !== undefined) {
    secondaryConstraintType = 'FNLT';
    secondaryConstraintDate = deadline;
    findings.push({
      kind: 'approximation',
      entity: 'constraint',
      sourceRef: taskId,
      detail: `deadline ${deadline} imported as a secondary Finish-No-Later-Than constraint`,
      reason: 'MSP deadlines have no direct SchedulePoint equivalent (ADR-0035 §12)',
    });
  }

  return {
    constraintType,
    constraintDate,
    secondaryConstraintType,
    secondaryConstraintDate,
    scheduleAsLateAsPossible,
  };
}

// ---------------------------------------------------------------------------------------------------------
// Progress (ADR-0035 §6, ADR-0042).
// ---------------------------------------------------------------------------------------------------------

/**
 * Map a task's progress leaves to a {@link CanonicalProgress}, or null when the activity is un-progressed.
 * The source status is provisional (derived from the actuals) — the validate step owns the final status.
 * MSP has no suspend/resume/expected-finish, so those are null.
 */
function mapProgress(task: MspdiElement): CanonicalProgress | null {
  const percentRaw = numField(task, 'PercentComplete');
  const percentComplete = percentRaw === undefined ? 0 : Math.round(percentRaw);
  const physRaw = numField(task, 'PhysicalPercentComplete');
  const physicalPercentComplete = physRaw === undefined ? null : Math.round(physRaw);

  const actualStart = isoDateField(task, 'ActualStart') ?? null;
  const actualFinish = isoDateField(task, 'ActualFinish') ?? null;

  const remainCoerced = durationToMinutes(childText(task, 'RemainingDuration'));
  const remainingDurationMinutes = remainCoerced === undefined ? null : remainCoerced.minutes;

  // Provisional status; the validate step re-derives it from the (repaired) actuals.
  const status: CanonicalActivityStatus =
    actualFinish !== null || percentComplete >= 100
      ? 'COMPLETE'
      : actualStart !== null || percentComplete > 0
        ? 'IN_PROGRESS'
        : 'NOT_STARTED';

  const isDefault =
    status === 'NOT_STARTED' &&
    percentComplete === 0 &&
    physicalPercentComplete === null &&
    actualStart === null &&
    actualFinish === null &&
    remainingDurationMinutes === null;
  if (isDefault) return null;

  return {
    status,
    percentComplete,
    percentCompleteType: 'DURATION',
    physicalPercentComplete,
    actualStart,
    actualFinish,
    remainingDurationMinutes,
    suspendDate: null,
    resumeDate: null,
    expectedFinish: null,
  };
}

// ---------------------------------------------------------------------------------------------------------
// The adapter.
// ---------------------------------------------------------------------------------------------------------

export function adaptMspdiToCanonical(
  document: MspdiDocument,
  filename: string | null,
): MspdiAdaptResult {
  const findings: ReportFinding[] = [];
  const project = document.project;

  // --- Data date (mandatory) ------------------------------------------------------------------------
  const dataDate = isoDateField(project, 'CurrentDate') ?? isoDateField(project, 'StatusDate');
  if (dataDate === undefined) {
    return {
      ok: false,
      error: {
        code: 'NO_DATA_DATE',
        message: 'The MSPDI project has no data date (<CurrentDate> / <StatusDate>).',
      },
    };
  }

  const projectId = childText(project, 'UID') ?? 'PROJECT';

  // --- Calendars ------------------------------------------------------------------------------------
  const knownCalendarIds = new Set<string>();
  const calendars: CanonicalCalendar[] = [];
  for (const calendarsContainer of childElements(project, 'Calendars')) {
    for (const calendar of childElements(calendarsContainer, 'Calendar')) {
      const uid = childText(calendar, 'UID');
      if (uid === undefined) continue; // a calendar with no UID cannot be referenced.
      knownCalendarIds.add(uid);
      const name = childText(calendar, 'Name') ?? `Calendar ${uid}`;
      const parsed = parseMspdiCalendar(calendar, uid);
      findings.push(...parsed.findings);

      if (parsed.hasWorkingTime) {
        calendars.push({ id: uid, name, workWeek: parsed.workWeek, exceptions: parsed.exceptions });
      } else {
        calendars.push({
          id: uid,
          name,
          workWeek: fallbackWorkWeek(8),
          exceptions: parsed.exceptions,
        });
        findings.push({
          kind: 'approximation',
          entity: 'calendar',
          sourceRef: uid,
          detail: 'no readable weekly work pattern; approximated as Mon–Fri 08:00–16:00',
          reason: 'calendar working times absent or unreadable (ADR-0050)',
        });
      }
    }
  }
  if (calendars.length > 0) {
    findings.push({
      kind: 'drop',
      entity: 'calendar',
      sourceRef: null,
      detail:
        'MSP calendar attributes beyond weekly work windows + dated exceptions (base-calendar inheritance, recurrence rules) were not imported',
      reason: 'not expressible in the SchedulePoint calendar model (ADR-0036)',
    });
  }

  const projectCalendarUid = childText(project, 'CalendarUID');
  const defaultCalendarId =
    projectCalendarUid !== undefined && knownCalendarIds.has(projectCalendarUid)
      ? projectCalendarUid
      : (calendars[0]?.id ?? null);

  const canonicalProject: CanonicalProject = {
    id: projectId,
    name: childText(project, 'Name') ?? projectId,
    dataDate,
    defaultCalendarId,
  };

  // --- Tasks (activities + WBS via outline level) ---------------------------------------------------
  // MSP has no separate WBS table: a task with <Summary>=1 is a WBS_SUMMARY, and any task's WBS parent is
  // the nearest preceding task at a lower outline level (always a summary). A stack of open summaries,
  // walked in document order, yields each task's parent deterministically.
  const activities: CanonicalActivity[] = [];
  const relationships: CanonicalRelationship[] = [];
  const summaryStack: Array<{ uid: string; level: number }> = [];
  let relIndex = 0;

  for (const tasksContainer of childElements(project, 'Tasks')) {
    for (const task of childElements(tasksContainer, 'Task')) {
      const uid = childText(task, 'UID');
      if (uid === undefined) {
        findings.push({
          kind: 'drop',
          entity: 'activity',
          sourceRef: null,
          detail: 'a <Task> with no <UID> was not imported',
          reason: 'missing stable identifier',
        });
        continue;
      }

      const outlineLevel = Math.trunc(numField(task, 'OutlineLevel') ?? 1);
      while (summaryStack.length > 0) {
        const top = summaryStack[summaryStack.length - 1];
        if (top !== undefined && top.level >= outlineLevel) summaryStack.pop();
        else break;
      }
      const parentId = summaryStack[summaryStack.length - 1]?.uid ?? null;

      const isSummary = childText(task, 'Summary') === '1';
      const isMilestone = childText(task, 'Milestone') === '1';
      const predecessorLinks = childElements(task, 'PredecessorLink');

      let type: CanonicalActivityType;
      if (isSummary) {
        type = 'WBS_SUMMARY';
        summaryStack.push({ uid, level: outlineLevel });
      } else if (isMilestone) {
        // MSP has one milestone concept; a milestone that closes preceding work (has a predecessor) maps
        // to a FINISH milestone, otherwise a START milestone — a deterministic structural inference.
        type = predecessorLinks.length > 0 ? 'FINISH_MILESTONE' : 'START_MILESTONE';
      } else {
        type = 'TASK';
      }

      let durationMinutes = 0;
      if (type === 'TASK') {
        const coerced = durationToMinutes(childText(task, 'Duration'));
        durationMinutes = coerced?.minutes ?? 0;
        if (coerced !== undefined && (coerced.rounded || coerced.clamped)) {
          findings.push({
            kind: 'approximation',
            entity: 'activity',
            sourceRef: uid,
            detail: `duration → ${durationMinutes}min${coerced.clamped ? ' (clamped to range)' : ' (rounded)'}`,
            reason: 'duration coerced to working-minutes (ADR-0036)',
          });
        }
      }

      let code = childText(task, 'WBS') ?? childText(task, 'ID');
      if (code === undefined) {
        code = uid;
        findings.push({
          kind: 'approximation',
          entity: 'activity',
          sourceRef: uid,
          detail: `task had no WBS/ID code; using its UID "${uid}" as the code`,
          reason: 'code is required (ADR-0050)',
        });
      }

      const calendarUid = childText(task, 'CalendarUID');
      let resolvedCalendarId: string | null = null;
      if (calendarUid !== undefined && calendarUid !== '-1') {
        if (knownCalendarIds.has(calendarUid)) {
          resolvedCalendarId = calendarUid;
        } else {
          findings.push({
            kind: 'approximation',
            entity: 'activity',
            sourceRef: uid,
            detail: `activity calendar "${calendarUid}" is unknown; falls back to the plan default`,
            reason: 'unresolved calendar reference',
          });
        }
      }

      const constraints = mapConstraints(task, uid, findings);

      activities.push({
        id: uid,
        code,
        name: childText(task, 'Name') ?? code,
        type,
        durationMinutes,
        calendarId: resolvedCalendarId,
        parentId,
        constraintType: constraints.constraintType,
        constraintDate: constraints.constraintDate,
        secondaryConstraintType: constraints.secondaryConstraintType,
        secondaryConstraintDate: constraints.secondaryConstraintDate,
        scheduleAsLateAsPossible: constraints.scheduleAsLateAsPossible,
        progress: mapProgress(task),
      });

      // Predecessor links (nested in the successor task) → canonical relationships.
      for (const link of predecessorLinks) {
        const predId = childText(link, 'PredecessorUID');
        if (predId === undefined) {
          findings.push({
            kind: 'drop',
            entity: 'relationship',
            sourceRef: null,
            detail: `a <PredecessorLink> on ${uid} with no <PredecessorUID> was not imported`,
            reason: 'malformed relationship (ADR-0050)',
          });
          continue;
        }
        relIndex += 1;
        const rawType = childText(link, 'Type');
        let linkType = rawType === undefined ? undefined : lookup(LINK_TYPE_TO_CANONICAL, rawType);
        if (linkType === undefined) {
          linkType = 'FS';
          findings.push({
            kind: 'approximation',
            entity: 'relationship',
            sourceRef: `${predId}->${uid}`,
            detail: `relationship type "${rawType ?? '(none)'}" is not supported; imported as FS`,
            reason: 'unmapped relationship kind (ADR-0050)',
          });
        }

        // MSP stores <LinkLag> in tenths of a minute (independent of the display <LagFormat>).
        const linkLag = numField(link, 'LinkLag') ?? 0;
        const coerced = clampMinutes(linkLag / 10, true);
        if (coerced.rounded || coerced.clamped) {
          findings.push({
            kind: 'approximation',
            entity: 'relationship',
            sourceRef: `${predId}->${uid}`,
            detail: `lag → ${coerced.minutes}min${coerced.clamped ? ' (clamped to range)' : ' (rounded)'}`,
            reason: 'lag coerced to working-minutes (ADR-0036)',
          });
        }

        relationships.push({
          id: `REL-${relIndex}`,
          predecessorId: predId,
          successorId: uid,
          type: linkType,
          lagMinutes: coerced.minutes,
        });
      }
    }
  }

  // --- Resources (`<Resources><Resource>` → the org resource library, ADR-0039) ---------------------
  const resources: CanonicalResource[] = [];
  for (const resourcesContainer of childElements(project, 'Resources')) {
    for (const resource of childElements(resourcesContainer, 'Resource')) {
      const uid = childText(resource, 'UID');
      if (uid === undefined) {
        findings.push({
          kind: 'drop',
          entity: 'resource',
          sourceRef: null,
          detail: 'a <Resource> with no <UID> was not imported',
          reason: 'missing stable identifier',
        });
        continue;
      }
      // MSP's project-summary phantom resource (UID 0, no name) carries no data; skip it silently.
      const name = childText(resource, 'Name');
      if (uid === '0' && name === undefined) continue;

      const rawKind = childText(resource, 'Type');
      let kind = rawKind === undefined ? 'LABOUR' : lookup(RESOURCE_TYPE_TO_CANONICAL, rawKind);
      if (kind === undefined) {
        kind = 'LABOUR';
        findings.push({
          kind: 'approximation',
          entity: 'resource',
          sourceRef: uid,
          detail: `resource type "${rawKind}" is not supported; imported as LABOUR`,
          reason: 'unmapped resource kind (ADR-0039)',
        });
      } else if (rawKind === '2') {
        findings.push({
          kind: 'approximation',
          entity: 'resource',
          sourceRef: uid,
          detail: `cost resource "${name ?? uid}" imported as EQUIPMENT`,
          reason: 'cost resources have no direct SchedulePoint equivalent (ADR-0039)',
        });
      }

      resources.push({
        id: uid,
        name: name ?? uid,
        code: childText(resource, 'Code') ?? null,
        kind,
        calendarId: childText(resource, 'CalendarUID') ?? null,
        costPerUnit: null,
        maxUnitsPerHour: null,
      });
    }
  }

  // --- Assignments (`<Assignments><Assignment>` → ResourceAssignment, ADR-0039/0040) ----------------
  const assignments: CanonicalAssignment[] = [];
  let asgIndex = 0;
  for (const assignmentsContainer of childElements(project, 'Assignments')) {
    for (const assignment of childElements(assignmentsContainer, 'Assignment')) {
      const taskUid = childText(assignment, 'TaskUID');
      const resourceUid = childText(assignment, 'ResourceUID');
      if (taskUid === undefined || resourceUid === undefined || resourceUid === '-1') {
        findings.push({
          kind: 'drop',
          entity: 'assignment',
          sourceRef: childText(assignment, 'UID') ?? null,
          detail: 'an <Assignment> with a missing task/resource UID was not imported',
          reason: 'malformed assignment (ADR-0039)',
        });
        continue;
      }
      asgIndex += 1;

      // Budgeted units of work: <Work> hours (its PT duration) if present, else the raw <Units>.
      const work = durationToMinutes(childText(assignment, 'Work'));
      const budgetedUnits =
        work !== undefined ? work.minutes / 60 : Math.max(0, numField(assignment, 'Units') ?? 0);
      const actualWork = durationToMinutes(childText(assignment, 'ActualWork'));
      const actualUnits = actualWork === undefined ? 0 : Math.max(0, actualWork.minutes / 60);

      assignments.push({
        id: childText(assignment, 'UID') ?? `ASG-${asgIndex}`,
        activityId: taskUid,
        resourceId: resourceUid,
        budgetedUnits: Math.max(0, budgetedUnits),
        // MSP has no per-hour production rate on an assignment → the units triad stays inert (byte-parity).
        unitsPerHour: null,
        // MSP has no driving flag; no assignment drives by default (RESOURCE_DEPENDENT is not produced).
        isDriving: false,
        actualUnits,
      });
    }
  }

  const model: CanonicalModel = {
    source: {
      format: 'MSPDI',
      version: document.version,
      filename: filename === null || filename === '' ? null : filename,
    },
    project: canonicalProject,
    calendars,
    activities,
    relationships,
    resources,
    assignments,
  };

  return { ok: true, model, findings };
}
