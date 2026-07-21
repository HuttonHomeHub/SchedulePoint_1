import type { ExportGraph } from './export-graph.js';

/**
 * Fixtures + a structural-equivalence relation for the export / round-trip tests (ADR-0050 M4, Task 4a.4).
 *
 * `buildExportGraph` returns a minimal, valid **core-network** export graph (plan + one calendar +
 * TASK/milestone activities + FS relationships); overrides let a test vary one slice. `toComparable`
 * projects either an {@link ExportGraph} or a re-imported {@link ImportGraph} onto the same normalised,
 * order-independent shape so the round-trip assertion (`export → importSchedule → equivalent`) is exact
 * for the core network **modulo the documented lossy coercions** (hours↔minutes, per-date exception
 * expansion) — which the fixtures avoid so the round trip is byte-clean.
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

/** A stable JSON key for a work window / shift, order-independent. */
function windowKey(w: { startMinute: number; endMinute: number }): string {
  return `${w.startMinute}-${w.endMinute}`;
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
  }>;
  dependencies: Array<{
    predecessorKey: string;
    successorKey: string;
    type: string;
    lagMinutes: number;
  }>;
}

/**
 * Project an export or re-imported graph onto the shared comparable shape (core network only). The
 * parameter is typed `ExportGraph`, which is a structural alias of the import graph, so a re-imported
 * `ImportGraph` is accepted here too (both collapse to the same normalised form).
 */
export function toComparable(graph: ExportGraph): ComparableGraph {
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
