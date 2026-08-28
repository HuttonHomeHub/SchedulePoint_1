import type {
  HealthActivityInput,
  HealthBaselineInput,
  HealthComputeInput,
  HealthDependencyInput,
} from './compute-health';

/**
 * Unit-test fixtures for the pure health model. Defaults describe a healthy, scheduled, one-task
 * plan; every spec overrides only what its case is about, so a change to the defaults fails the
 * cases that relied on them rather than silently re-basing them.
 */

let seq = 0;
const nextId = (prefix: string): string => `${prefix}-${++seq}`;

export function activity(overrides: Partial<HealthActivityInput> = {}): HealthActivityInput {
  const id = overrides.id ?? nextId('act');
  return {
    id,
    code: null,
    name: `Activity ${id}`,
    type: 'TASK',
    status: 'NOT_STARTED',
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    totalFloat: 0,
    durationMinutes: 480,
    remainingDurationMinutes: null,
    percentComplete: 0,
    actualStart: null,
    actualFinish: null,
    earlyStart: '2026-03-02',
    earlyFinish: '2026-03-03',
    dayFactorMinutes: 480,
    hasAssignment: true,
    ...overrides,
  };
}

export function dependency(
  overrides: Partial<HealthDependencyInput> &
    Pick<HealthDependencyInput, 'predecessorId' | 'successorId'>,
): HealthDependencyInput {
  return {
    id: nextId('dep'),
    type: 'FS',
    lagMinutes: 0,
    ...overrides,
  };
}

export function baseline(overrides: Partial<HealthBaselineInput> = {}): HealthBaselineInput {
  return {
    id: nextId('bl'),
    name: 'Baseline',
    capturedAt: '2026-03-02T00:00:00.000Z',
    capturedProjectFinish: null,
    activities: [],
    ...overrides,
  };
}

export function computeInput(overrides: Partial<HealthComputeInput> = {}): HealthComputeInput {
  return {
    plan: {
      id: 'plan-1',
      name: 'Test plan',
      dataDate: '2026-03-02',
      computedAt: '2026-03-02T08:00:00.000Z',
      schedulingMode: 'EARLY',
      ...(overrides.plan ?? {}),
    },
    activities: overrides.activities ?? [activity()],
    dependencies: overrides.dependencies ?? [],
    baseline: overrides.baseline !== undefined ? overrides.baseline : null,
    // Calendar-day arithmetic is a fine stand-in for the injected walker in unit tests: the model
    // never inspects the function, and CPLI's cases assert against THIS rule's output.
    workingDaysBetween:
      overrides.workingDaysBetween ??
      ((from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)),
  };
}
