/**
 * Test-only helpers for building small, well-formed MSPDI (`.xml`) files from structured input, so the
 * adapter / import specs read as data, not as hand-typed XML. NOT exported from the package barrel — it is
 * imported directly by the `*.spec.ts` files. Pure string assembly; no I/O.
 */

const MSP_NS = 'http://schemas.microsoft.com/project';

/** A leaf `<Name>value</Name>` (omitted entirely when the value is undefined). */
function leaf(name: string, value: string | number | undefined): string {
  return value === undefined ? '' : `<${name}>${String(value)}</${name}>`;
}

/** A predecessor link nested in a successor task. */
export interface MspdiPredecessorSpec {
  readonly uid: string;
  /** MSP link type number: 0 FF, 1 FS, 2 SF, 3 SS (default 1 = FS). */
  readonly type?: string;
  /** `<LinkLag>` in tenths of a minute (default 0). */
  readonly linkLag?: string;
  readonly lagFormat?: string;
}

export interface MspdiTaskSpec {
  readonly uid: string;
  readonly id?: string;
  readonly name?: string;
  readonly wbs?: string;
  readonly outlineLevel?: number;
  readonly summary?: boolean;
  readonly milestone?: boolean;
  /** An ISO-8601 duration, e.g. `PT40H0M0S`. */
  readonly duration?: string;
  readonly calendarUid?: string;
  /** MSP constraint type number 0–7. */
  readonly constraintType?: string;
  readonly constraintDate?: string;
  readonly deadline?: string;
  readonly percentComplete?: string;
  readonly physicalPercentComplete?: string;
  readonly actualStart?: string;
  readonly actualFinish?: string;
  readonly remainingDuration?: string;
  readonly predecessors?: readonly MspdiPredecessorSpec[];
}

export interface MspdiResourceSpec {
  readonly uid: string;
  readonly name?: string;
  /** MSP resource type number: 0 Material, 1 Work, 2 Cost. */
  readonly type?: string;
  readonly code?: string;
  readonly calendarUid?: string;
}

export interface MspdiAssignmentSpec {
  readonly uid?: string;
  readonly taskUid: string;
  readonly resourceUid: string;
  /** An ISO-8601 work duration, e.g. `PT80H0M0S`. */
  readonly work?: string;
  readonly units?: string;
  readonly actualWork?: string;
}

/** A base-week WeekDay: `dayType` 1 (Sun)…7 (Sat); `working` adds an 08:00–16:00 window. */
export interface MspdiWeekDaySpec {
  readonly dayType: number;
  readonly working: boolean;
  readonly from?: string;
  readonly to?: string;
}

/** A dated exception WeekDay (`DayType 0`). */
export interface MspdiExceptionSpec {
  readonly fromDate: string;
  readonly toDate?: string;
  readonly working?: boolean;
  readonly from?: string;
  readonly to?: string;
}

export interface MspdiCalendarSpec {
  readonly uid: string;
  readonly name?: string;
  readonly weekDays?: readonly MspdiWeekDaySpec[];
  readonly exceptions?: readonly MspdiExceptionSpec[];
}

export interface MspdiProjectSpec {
  readonly uid?: string;
  readonly name?: string;
  readonly currentDate?: string;
  readonly statusDate?: string;
  readonly saveVersion?: string;
  readonly calendarUid?: string;
  readonly calendars?: readonly MspdiCalendarSpec[];
  readonly tasks?: readonly MspdiTaskSpec[];
  readonly resources?: readonly MspdiResourceSpec[];
  readonly assignments?: readonly MspdiAssignmentSpec[];
}

function workingTime(from = '08:00:00', to = '16:00:00'): string {
  return `<WorkingTime><FromTime>${from}</FromTime><ToTime>${to}</ToTime></WorkingTime>`;
}

function weekDayXml(day: MspdiWeekDaySpec): string {
  const times = day.working ? `<WorkingTimes>${workingTime(day.from, day.to)}</WorkingTimes>` : '';
  return `<WeekDay><DayType>${day.dayType}</DayType><DayWorking>${day.working ? 1 : 0}</DayWorking>${times}</WeekDay>`;
}

function exceptionXml(exc: MspdiExceptionSpec): string {
  const working = exc.working ?? false;
  const times = working ? `<WorkingTimes>${workingTime(exc.from, exc.to)}</WorkingTimes>` : '';
  const to = exc.toDate ?? exc.fromDate;
  return `<WeekDay><DayType>0</DayType><DayWorking>${working ? 1 : 0}</DayWorking><TimePeriod><FromDate>${exc.fromDate}</FromDate><ToDate>${to}</ToDate></TimePeriod>${times}</WeekDay>`;
}

/** A standard Mon–Fri 08:00–16:00 base week (MSP DayType 1=Sun…7=Sat). */
export function standardWeekDays(): MspdiWeekDaySpec[] {
  return [
    { dayType: 1, working: false },
    { dayType: 2, working: true },
    { dayType: 3, working: true },
    { dayType: 4, working: true },
    { dayType: 5, working: true },
    { dayType: 6, working: true },
    { dayType: 7, working: false },
  ];
}

function calendarXml(cal: MspdiCalendarSpec): string {
  const weekDays = (cal.weekDays ?? []).map(weekDayXml).join('');
  const exceptions = (cal.exceptions ?? []).map(exceptionXml).join('');
  return `<Calendar><UID>${cal.uid}</UID>${leaf('Name', cal.name)}<WeekDays>${weekDays}${exceptions}</WeekDays></Calendar>`;
}

function predecessorXml(pred: MspdiPredecessorSpec): string {
  return `<PredecessorLink><PredecessorUID>${pred.uid}</PredecessorUID>${leaf('Type', pred.type ?? '1')}${leaf('LinkLag', pred.linkLag ?? '0')}${leaf('LagFormat', pred.lagFormat)}</PredecessorLink>`;
}

function taskXml(task: MspdiTaskSpec): string {
  const parts = [
    `<UID>${task.uid}</UID>`,
    leaf('ID', task.id),
    leaf('Name', task.name),
    leaf('WBS', task.wbs),
    leaf('OutlineLevel', task.outlineLevel),
    leaf('Summary', task.summary ? '1' : undefined),
    leaf('Milestone', task.milestone ? '1' : undefined),
    leaf('Duration', task.duration),
    leaf('CalendarUID', task.calendarUid),
    leaf('ConstraintType', task.constraintType),
    leaf('ConstraintDate', task.constraintDate),
    leaf('Deadline', task.deadline),
    leaf('PercentComplete', task.percentComplete),
    leaf('PhysicalPercentComplete', task.physicalPercentComplete),
    leaf('ActualStart', task.actualStart),
    leaf('ActualFinish', task.actualFinish),
    leaf('RemainingDuration', task.remainingDuration),
    ...(task.predecessors ?? []).map(predecessorXml),
  ];
  return `<Task>${parts.join('')}</Task>`;
}

function resourceXml(resource: MspdiResourceSpec): string {
  return `<Resource><UID>${resource.uid}</UID>${leaf('Name', resource.name)}${leaf('Type', resource.type)}${leaf('Code', resource.code)}${leaf('CalendarUID', resource.calendarUid)}</Resource>`;
}

function assignmentXml(assignment: MspdiAssignmentSpec, index: number): string {
  return `<Assignment>${leaf('UID', assignment.uid ?? String(index))}<TaskUID>${assignment.taskUid}</TaskUID><ResourceUID>${assignment.resourceUid}</ResourceUID>${leaf('Work', assignment.work)}${leaf('Units', assignment.units)}${leaf('ActualWork', assignment.actualWork)}</Assignment>`;
}

/** Assemble a full MSPDI `<Project>` document string from a structured spec. */
export function buildMspdi(spec: MspdiProjectSpec): string {
  const calendars = (spec.calendars ?? []).map(calendarXml).join('');
  const tasks = (spec.tasks ?? []).map(taskXml).join('');
  const resources = (spec.resources ?? []).map(resourceXml).join('');
  const assignments = (spec.assignments ?? []).map((a, i) => assignmentXml(a, i + 1)).join('');

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    `<Project xmlns="${MSP_NS}">`,
    leaf('UID', spec.uid ?? 'P1'),
    leaf('Name', spec.name ?? 'Sample'),
    leaf('SaveVersion', spec.saveVersion ?? '14'),
    leaf('CurrentDate', spec.currentDate),
    leaf('StatusDate', spec.statusDate),
    leaf('CalendarUID', spec.calendarUid),
    `<Calendars>${calendars}</Calendars>`,
    `<Tasks>${tasks}</Tasks>`,
    `<Resources>${resources}</Resources>`,
    `<Assignments>${assignments}</Assignments>`,
    '</Project>',
  ].join('');
}
