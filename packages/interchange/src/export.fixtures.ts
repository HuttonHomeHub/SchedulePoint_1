import type { ExportGraph } from './export-graph.js';

/**
 * Fixtures + a structural-equivalence relation for the export / round-trip tests (ADR-0050 M4, Task 4a.4;
 * extended for M4c's rich scope).
 *
 * `buildExportGraph` returns a minimal, valid **core-network** export graph (plan + one calendar +
 * TASK/milestone activities + FS relationships); `buildRichExportGraph` layers on M4c's full scope — WBS
 * summaries + nested activities, primary + secondary constraints, ALAP, a progressed activity (actuals +
 * %complete), and a resource + a driving assignment. Overrides let a test vary one slice.
 *
 * `toComparable` projects either an {@link ExportGraph} or a re-imported {@link ImportGraph} onto the same
 * normalised, order-independent shape so the round-trip assertion (`export → importSchedule → equivalent`)
 * is exact **modulo the documented lossy coercions**. The optional `format` argument controls that
 * modulo: XER (the default) round-trips the whole rich scope byte-clean, whereas MSPDI cannot represent a
 * driving flag or a per-assignment production rate, so passing `'MSPDI'` normalises those two lossy
 * assignment fields away on **both** sides of the comparison (the approximation is asserted separately).
 */

/** A deep-cloneable partial for overriding slices of the base export graph. */
export type ExportGraphOverrides = Partial<ExportGraph>;

/** A minimal valid core-network export graph: 2 tasks + 1 finish-milestone, 2 FS links, one Mon–Fri calendar. */
export function buildExportGraph(overrides: ExportGraphOverrides = {}): ExportGraph {
  const base: ExportGraph = {
    plan: {
      name: 'Sample Export',
      dataDate: '2026-01-05',
      defaultCalendarKey: 'CAL1',
    },
    calendars: [
      {
        key: 'CAL1',
        name: 'Standard',
        // Mon–Fri 08:00–16:00 (weekday 0 = Monday … 4 = Friday; minutes from midnight).
        shifts: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, startMinute: 480, endMinute: 960 })),
        exceptions: [
          { startDate: '2026-01-01', endDate: '2026-01-01', label: null, windows: [] }, // New Year holiday.
        ],
      },
    ],
    activities: [
      {
        key: 'A1',
        code: 'A1000',
        name: 'Mobilise',
        type: 'TASK',
        durationMinutes: 2400, // 5 working days @ 8h.
        calendarKey: 'CAL1',
        parentKey: null,
        constraintType: null,
        constraintDate: null,
        secondaryConstraintType: null,
        secondaryConstraintDate: null,
        scheduleAsLateAsPossible: false,
        progress: null,
      },
      {
        key: 'A2',
        code: 'A1010',
        name: 'Excavate',
        type: 'TASK',
        durationMinutes: 4800,
        calendarKey: null, // inherits the plan default.
        parentKey: null,
        constraintType: null,
        constraintDate: null,
        secondaryConstraintType: null,
        secondaryConstraintDate: null,
        scheduleAsLateAsPossible: false,
        progress: null,
      },
      {
        key: 'M1',
        code: 'MS100',
        name: 'Substructure complete',
        type: 'FINISH_MILESTONE',
        durationMinutes: 0,
        calendarKey: null,
        parentKey: null,
        constraintType: null,
        constraintDate: null,
        secondaryConstraintType: null,
        secondaryConstraintDate: null,
        scheduleAsLateAsPossible: false,
        progress: null,
      },
    ],
    dependencies: [
      { key: 'R1', predecessorKey: 'A1', successorKey: 'A2', type: 'FS', lagMinutes: 0 },
      { key: 'R2', predecessorKey: 'A2', successorKey: 'M1', type: 'FS', lagMinutes: 480 },
    ],
    resources: [],
    assignments: [],
  };

  return { ...base, ...overrides };
}

/**
 * A full-scope export graph exercising every M4c dimension so the round trip can prove they survive:
 *   - **WBS** — a nested summary tree (`wbs:100` → `wbs:110`) with real activities parented into it. The
 *     summary keys carry the adapter's `wbs:` prefix so the P6 `wbs:<id>` convention round-trips id-exact
 *     (XER strips the prefix into `wbs_id`; MSPDI keeps the UID verbatim).
 *   - **Constraints** — a primary Start-No-Earlier-Than + a secondary Finish-No-Later-Than on one task, and
 *     ALAP on another (the two never collide in a single slot).
 *   - **Progress** — an in-progress task with an actual start, %complete + physical %, and a remaining
 *     duration (duration-based, no suspend/resume/expected-finish, so it round-trips both formats).
 *   - **Resources** — one LABOUR resource driving one assignment (with budgeted + actual units).
 */
export function buildRichExportGraph(overrides: ExportGraphOverrides = {}): ExportGraph {
  const base: ExportGraph = {
    plan: { name: 'Rich Export', dataDate: '2026-01-05', defaultCalendarKey: 'CAL1' },
    calendars: [
      {
        key: 'CAL1',
        name: 'Standard',
        shifts: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, startMinute: 480, endMinute: 960 })),
        exceptions: [{ startDate: '2026-01-01', endDate: '2026-01-01', label: null, windows: [] }],
      },
    ],
    activities: [
      {
        key: 'wbs:100',
        code: 'W-ENG',
        name: 'Engineering',
        type: 'WBS_SUMMARY',
        durationMinutes: 0,
        calendarKey: null,
        parentKey: null,
        constraintType: null,
        constraintDate: null,
        secondaryConstraintType: null,
        secondaryConstraintDate: null,
        scheduleAsLateAsPossible: false,
        progress: null,
      },
      {
        key: 'wbs:110',
        code: 'W-DESIGN',
        name: 'Design',
        type: 'WBS_SUMMARY',
        durationMinutes: 0,
        calendarKey: null,
        parentKey: 'wbs:100', // nested summary.
        constraintType: null,
        constraintDate: null,
        secondaryConstraintType: null,
        secondaryConstraintDate: null,
        scheduleAsLateAsPossible: false,
        progress: null,
      },
      {
        key: 'A1',
        code: 'A1000',
        name: 'Mobilise',
        type: 'TASK',
        durationMinutes: 2400,
        calendarKey: 'CAL1',
        parentKey: 'wbs:100',
        // Primary + secondary constraint (both slots).
        constraintType: 'SNET',
        constraintDate: '2026-02-01',
        secondaryConstraintType: 'FNLT',
        secondaryConstraintDate: '2026-03-01',
        scheduleAsLateAsPossible: false,
        progress: null,
      },
      {
        key: 'A2',
        code: 'A1010',
        name: 'Detailed design',
        type: 'TASK',
        durationMinutes: 4800,
        calendarKey: null,
        parentKey: 'wbs:110',
        constraintType: null,
        constraintDate: null,
        secondaryConstraintType: null,
        secondaryConstraintDate: null,
        scheduleAsLateAsPossible: true, // ALAP.
        progress: null,
      },
      {
        key: 'A3',
        code: 'A1020',
        name: 'Excavate',
        type: 'TASK',
        durationMinutes: 2400,
        calendarKey: null,
        parentKey: null, // a root-level activity (no WBS parent).
        constraintType: null,
        constraintDate: null,
        secondaryConstraintType: null,
        secondaryConstraintDate: null,
        scheduleAsLateAsPossible: false,
        progress: {
          status: 'IN_PROGRESS',
          percentComplete: 40,
          percentCompleteType: 'DURATION',
          physicalPercentComplete: 35,
          actualStart: '2026-01-06',
          actualFinish: null,
          remainingDurationMinutes: 1440, // 3 working days @ 8h.
          suspendDate: null,
          resumeDate: null,
          expectedFinish: null,
        },
      },
      {
        key: 'M1',
        code: 'MS100',
        name: 'Design complete',
        type: 'FINISH_MILESTONE',
        durationMinutes: 0,
        calendarKey: null,
        parentKey: 'wbs:110',
        constraintType: null,
        constraintDate: null,
        secondaryConstraintType: null,
        secondaryConstraintDate: null,
        scheduleAsLateAsPossible: false,
        progress: null,
      },
    ],
    dependencies: [
      { key: 'R1', predecessorKey: 'A1', successorKey: 'A2', type: 'FS', lagMinutes: 0 },
      { key: 'R2', predecessorKey: 'A2', successorKey: 'M1', type: 'FS', lagMinutes: 480 },
      { key: 'R3', predecessorKey: 'A1', successorKey: 'A3', type: 'FS', lagMinutes: 0 },
    ],
    resources: [
      {
        key: 'R-CREW',
        name: 'Site Crew',
        code: 'CREW',
        kind: 'LABOUR',
        calendarKey: null,
        costPerUnit: null,
        maxUnitsPerHour: null,
      },
    ],
    assignments: [
      {
        key: 'AS1',
        activityKey: 'A3',
        resourceKey: 'R-CREW',
        budgetedUnits: 40,
        unitsPerHour: null,
        isDriving: true,
        actualUnits: 10,
      },
    ],
  };

  return { ...base, ...overrides };
}

/** A stable JSON key for a work window / shift, order-independent. */
function windowKey(w: { startMinute: number; endMinute: number }): string {
  return `${w.startMinute}-${w.endMinute}`;
}

/** The normalised, order-independent progress projection (null when un-progressed). */
interface ComparableProgress {
  status: string;
  percentComplete: number;
  percentCompleteType: string;
  physicalPercentComplete: number | null;
  actualStart: string | null;
  actualFinish: string | null;
  remainingDurationMinutes: number | null;
  suspendDate: string | null;
  resumeDate: string | null;
  expectedFinish: string | null;
}

/** The normalised, order-independent projection both an export graph and a re-imported graph collapse to. */
export interface ComparableGraph {
  plan: { name: string; dataDate: string; defaultCalendarKey: string | null };
  calendars: Array<{
    key: string;
    name: string;
    shifts: string[]; // "weekday:start-end", sorted.
    exceptions: Array<{ date: string; working: boolean; windows: string[] }>;
  }>;
  activities: Array<{
    key: string;
    code: string;
    name: string;
    type: string;
    durationMinutes: number;
    calendarKey: string | null;
    parentKey: string | null;
    constraintType: string | null;
    constraintDate: string | null;
    secondaryConstraintType: string | null;
    secondaryConstraintDate: string | null;
    scheduleAsLateAsPossible: boolean;
    progress: ComparableProgress | null;
  }>;
  dependencies: Array<{
    predecessorKey: string;
    successorKey: string;
    type: string;
    lagMinutes: number;
  }>;
  resources: Array<{
    key: string;
    name: string;
    code: string | null;
    kind: string;
    calendarKey: string | null;
  }>;
  assignments: Array<{
    activityKey: string;
    resourceKey: string;
    budgetedUnits: number;
    unitsPerHour: number | null;
    isDriving: boolean;
    actualUnits: number;
  }>;
}

/** The interchange format the comparison is scoped to; MSPDI drops a couple of assignment fields (see below). */
export type ComparableFormat = 'XER' | 'MSPDI';

function comparableProgress(
  progress: ExportGraph['activities'][number]['progress'],
): ComparableProgress | null {
  if (progress === null) return null;
  return {
    status: progress.status,
    percentComplete: progress.percentComplete,
    percentCompleteType: progress.percentCompleteType,
    physicalPercentComplete: progress.physicalPercentComplete,
    actualStart: progress.actualStart,
    actualFinish: progress.actualFinish,
    remainingDurationMinutes: progress.remainingDurationMinutes,
    suspendDate: progress.suspendDate,
    resumeDate: progress.resumeDate,
    expectedFinish: progress.expectedFinish,
  };
}

/**
 * Project an export or re-imported graph onto the shared comparable shape. The parameter is typed
 * `ExportGraph`, which is a structural alias of the import graph, so a re-imported `ImportGraph` is
 * accepted here too (both collapse to the same normalised form). `format` scopes the tolerated loss:
 * `'MSPDI'` normalises the two assignment fields Microsoft Project cannot carry (the driving flag and the
 * per-assignment production rate) on both sides, so an MSPDI round trip still asserts full data equality
 * for everything MSP *can* represent (the loss is asserted separately as an approximation finding).
 */
export function toComparable(
  graph: ExportGraph,
  format: ComparableFormat = 'XER',
): ComparableGraph {
  const mspdiLossy = format === 'MSPDI';
  return {
    plan: {
      name: graph.plan.name,
      dataDate: graph.plan.dataDate,
      defaultCalendarKey: graph.plan.defaultCalendarKey,
    },
    calendars: [...graph.calendars]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((calendar) => ({
        key: calendar.key,
        name: calendar.name,
        shifts: calendar.shifts.map((shift) => `${shift.weekday}:${windowKey(shift)}`).sort(),
        exceptions: [...calendar.exceptions]
          .flatMap((exception) => {
            // A multi-day export range expands to per-date exceptions on re-import; normalise both to
            // per-date rows keyed by date so the comparison is expansion-independent.
            const dates = expandInclusive(exception.startDate, exception.endDate);
            return dates.map((date) => ({
              date,
              working: exception.windows.length > 0,
              windows: exception.windows.map(windowKey).sort(),
            }));
          })
          .sort((a, b) => a.date.localeCompare(b.date)),
      })),
    activities: [...graph.activities]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((activity) => ({
        key: activity.key,
        code: activity.code,
        name: activity.name,
        type: activity.type,
        durationMinutes: activity.durationMinutes,
        calendarKey: activity.calendarKey,
        parentKey: activity.parentKey,
        constraintType: activity.constraintType,
        constraintDate: activity.constraintDate,
        secondaryConstraintType: activity.secondaryConstraintType,
        secondaryConstraintDate: activity.secondaryConstraintDate,
        scheduleAsLateAsPossible: activity.scheduleAsLateAsPossible,
        progress: comparableProgress(activity.progress),
      })),
    dependencies: [...graph.dependencies]
      .map((dependency) => ({
        predecessorKey: dependency.predecessorKey,
        successorKey: dependency.successorKey,
        type: dependency.type,
        lagMinutes: dependency.lagMinutes,
      }))
      .sort((a, b) =>
        `${a.predecessorKey}->${a.successorKey}:${a.type}`.localeCompare(
          `${b.predecessorKey}->${b.successorKey}:${b.type}`,
        ),
      ),
    resources: [...graph.resources]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((resource) => ({
        key: resource.key,
        name: resource.name,
        code: resource.code,
        kind: resource.kind,
        calendarKey: resource.calendarKey,
      })),
    assignments: [...graph.assignments]
      .map((assignment) => ({
        activityKey: assignment.activityKey,
        resourceKey: assignment.resourceKey,
        budgetedUnits: assignment.budgetedUnits,
        // MSP carries neither a driving flag nor a production rate → normalise both away for an MSPDI trip.
        unitsPerHour: mspdiLossy ? null : assignment.unitsPerHour,
        isDriving: mspdiLossy ? false : assignment.isDriving,
        actualUnits: assignment.actualUnits,
      }))
      .sort((a, b) =>
        `${a.activityKey}↦${a.resourceKey}`.localeCompare(`${b.activityKey}↦${b.resourceKey}`),
      ),
  };
}

/** Every `YYYY-MM-DD` in `[from, to]` inclusive (UTC arithmetic); single date when from === to. */
function expandInclusive(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [from];
  const out: string[] = [];
  for (let ms = start; ms <= end; ms += 86_400_000) {
    const d = new Date(ms);
    out.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
        d.getUTCDate(),
      ).padStart(2, '0')}`,
    );
  }
  return out;
}
