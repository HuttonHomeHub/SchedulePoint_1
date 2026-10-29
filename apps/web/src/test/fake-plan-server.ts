import type {
  ActivityStep,
  ActivitySummary,
  CodeTypeSummary,
  CodeValueSummary,
  CrossPlanDependencySummary,
  DependencySummary,
  EditedField,
  ResourceAssignmentSummary,
} from '@repo/types';
import { vi } from 'vitest';

import type { ReplayContext } from '@/features/undo-redo/replay';
import { ApiFetchError } from '@/lib/api/client';

/** A complete dependency row for tests, overridable field by field. */
export function aDependency(overrides: Partial<DependencySummary> = {}): DependencySummary {
  return {
    id: 'd1',
    planId: 'p1',
    type: 'FS',
    lagDays: 0,
    lagMinutes: 0,
    lagCalendar: 'PROJECT_DEFAULT',
    predecessor: { id: 'a1', code: null, name: 'Excavate' },
    successor: { id: 'a2', code: null, name: 'Pour' },
    isDriving: false,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/** A complete resource-assignment row for tests, overridable field by field. */
export function anAssignment(
  overrides: Partial<ResourceAssignmentSummary> = {},
): ResourceAssignmentSummary {
  return {
    id: 'as1',
    activityId: 'a1',
    resourceId: 'r1',
    budgetedUnits: 8,
    unitsPerHour: null,
    isDriving: false,
    curveType: 'UNIFORM',
    lagMinutes: 0,
    actualUnits: 0,
    budgetedCost: null,
    actualCost: 0,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/** A complete activity step for tests, overridable field by field. */
export function aStep(overrides: Partial<ActivityStep> = {}): ActivityStep {
  return {
    id: 's1',
    activityId: 'a1',
    seq: 1,
    name: 'Pour',
    weight: 1,
    percentComplete: 0,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/** A complete cross-plan link for tests, overridable field by field. */
export function aCrossPlanLink(
  overrides: Partial<CrossPlanDependencySummary> = {},
): CrossPlanDependencySummary {
  return {
    id: 'x1',
    predecessorPlanId: 'p2',
    successorPlanId: 'p1',
    type: 'FS',
    lagDays: 0,
    lagMinutes: 0,
    lagCalendar: 'PROJECT_DEFAULT',
    predecessor: { id: 'o1', code: null, name: 'Other plan work' },
    successor: { id: 'a1', code: null, name: 'Excavate' },
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const conflict = (reason?: string): ApiFetchError =>
  new ApiFetchError(409, {
    code: 'CONFLICT',
    message: 'The record changed.',
    ...(reason === undefined ? {} : { details: { reason } }),
  });

/**
 * An in-memory plan standing in for the server, so a command's replay can be exercised end to end:
 * its pre-check reads real rows and its write goes through mutation fakes that enforce the optimistic
 * lock (a write at any version but the row's CURRENT one is a 409, exactly as the API answers).
 *
 * `edit` is somebody else's write — an unrecorded one, from another path or another user — which
 * changes the row and bumps its version. `normalise` is the server's own rewriting of a saved row
 * (a milestone's re-expressed dates, a snapped placement), applied to every write's result, which is
 * what lets a test prove a step still applies when the stored value is not the sent one.
 */
export function fakePlanServer(
  seed: {
    activities?: ActivitySummary[];
    dependencies?: DependencySummary[];
    assignments?: ResourceAssignmentSummary[];
    /** Steps by the activity they hang off. */
    steps?: Record<string, ActivityStep[]>;
    crossPlanLinks?: CrossPlanDependencySummary[];
    /** The plan's code types, live or deleted (`deletedAt`), without their values. */
    codeTypes?: CodeTypeSummary[];
    /** The plan's code values, live or deleted, of any seeded type. */
    codeValues?: CodeValueSummary[];
  } = {},
  options: { normalise?: (row: ActivitySummary) => void } = {},
) {
  const activities = new Map((seed.activities ?? []).map((a) => [a.id, { ...a }]));
  const dependencies = new Map((seed.dependencies ?? []).map((d) => [d.id, { ...d }]));
  const assignments = new Map((seed.assignments ?? []).map((a) => [a.id, { ...a }]));
  const steps = new Map(
    Object.entries(seed.steps ?? {}).map(([id, list]) => [id, list.map((step) => ({ ...step }))]),
  );
  const crossPlanLinks = new Map((seed.crossPlanLinks ?? []).map((l) => [l.id, { ...l }]));
  // Types and values live in one map each, deleted rows included: a read filters them, a restore
  // clears the flag, which is what makes a restore id-stable here as on the server.
  const codeTypes = new Map((seed.codeTypes ?? []).map((t) => [t.id, { ...t }]));
  const codeValues = new Map((seed.codeValues ?? []).map((v) => [v.id, { ...v }]));
  // The values a type's delete took, so its restore brings back exactly those.
  const takenWithType = new Map<string, string[]>();
  let nextAssignment = 100;
  let nextStep = 100;
  let nextCrossLink = 100;
  // What each delete swept: the activities (a summary's subtree included) and the links touching
  // them, which the server cascades with the row and `restore-batch` puts back.
  const deleted = new Map<string, { rows: ActivitySummary[]; links: DependencySummary[] }>();
  let nextBatch = 1;
  let nextDependency = 100;

  const rowOf = (id: string): ActivitySummary => {
    const row = activities.get(id);
    if (row === undefined) throw new ApiFetchError(404, { code: 'NOT_FOUND', message: 'Gone.' });
    return row;
  };
  /** A delete's optional `?version=N`: absent is unguarded, present must match (409 STALE_VERSION). */
  const staleGuard = (row: { version: number }, version: number | undefined): void => {
    if (version !== undefined && row.version !== version) throw conflict('STALE_VERSION');
  };
  const idAndVersion = <K extends string>(
    input: string | ({ version?: number | undefined } & Record<K, string>),
    key: K,
  ): { id: string; version: number | undefined } =>
    typeof input === 'string'
      ? { id: input, version: undefined }
      : { id: input[key], version: input.version };
  const lock = (row: { version: number }, version: number): void => {
    if (row.version !== version) throw conflict();
  };
  const write = (
    id: string,
    version: number,
    fields: Partial<ActivitySummary>,
  ): ActivitySummary => {
    const row = rowOf(id);
    lock(row, version);
    Object.assign(row, fields);
    options.normalise?.(row);
    row.version += 1;
    return { ...row };
  };

  const sweep = (ids: readonly string[]): string => {
    const all = new Set<string>();
    const visit = (id: string): void => {
      if (all.has(id)) return;
      all.add(id);
      for (const row of activities.values()) if (row.parentId === id) visit(row.id);
    };
    ids.forEach(visit);
    const deleteBatchId = `batch-${nextBatch++}`;
    const links = [...dependencies.values()].filter(
      (d) => all.has(d.predecessor.id) || all.has(d.successor.id),
    );
    deleted.set(deleteBatchId, { rows: [...all].map((id) => ({ ...rowOf(id) })), links });
    for (const id of all) activities.delete(id);
    for (const link of links) dependencies.delete(link.id);
    return deleteBatchId;
  };

  const byPosition = <T extends { position: number; id: string }>(rows: Iterable<T>): T[] =>
    [...rows].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const liveTypes = (): CodeTypeSummary[] =>
    byPosition([...codeTypes.values()].filter((t) => t.deletedAt === null));
  const liveValues = (codeTypeId: string): CodeValueSummary[] =>
    byPosition(
      [...codeValues.values()].filter((v) => v.codeTypeId === codeTypeId && v.deletedAt === null),
    );
  const typeOf = (id: string): CodeTypeSummary => {
    const row = codeTypes.get(id);
    if (row === undefined || row.deletedAt !== null) {
      throw new ApiFetchError(404, { code: 'NOT_FOUND', message: 'Gone.' });
    }
    return row;
  };
  const valueOf = (id: string): CodeValueSummary => {
    const row = codeValues.get(id);
    if (row === undefined || row.deletedAt !== null) {
      throw new ApiFetchError(404, { code: 'NOT_FOUND', message: 'Gone.' });
    }
    return row;
  };
  /** Both reorders: every live row exactly once, each at its CURRENT version, else the whole write is refused. */
  const reorder = <T extends { id: string; position: number; version: number }>(
    live: T[],
    order: { id: string; version: number }[],
  ): T[] => {
    if (order.length !== live.length || order.some((o) => !live.some((row) => row.id === o.id))) {
      throw conflict('STALE_VERSION');
    }
    for (const o of order)
      lock(
        live.find((row) => row.id === o.id)!,
        o.version,
      );
    return order.map((o, position) => {
      const row = live.find((r) => r.id === o.id)!;
      row.position = position;
      row.version += 1;
      return { ...row };
    });
  };

  const ctx: ReplayContext = {
    readLinksOf: (ids) => {
      const wanted = new Set(ids);
      return Promise.resolve(
        new Map(
          [...dependencies.values()]
            .filter((d) => wanted.has(d.predecessor.id) || wanted.has(d.successor.id))
            .map((d) => [d.id, { ...d }] as const),
        ),
      );
    },
    readChildrenOf: (parentIds) => {
      const wanted = new Set(parentIds);
      return Promise.resolve(
        new Map(
          [...activities.values()]
            .filter((a) => a.parentId !== null && wanted.has(a.parentId))
            .map((a) => [a.id, { ...a }] as const),
        ),
      );
    },
    readActivities: (ids) =>
      Promise.resolve(
        new Map(ids.flatMap((id) => (activities.has(id) ? [[id, { ...rowOf(id) }] as const] : []))),
      ),
    readSteps: (activityId) =>
      Promise.resolve(
        activities.has(activityId)
          ? (steps.get(activityId) ?? []).map((step) => ({ ...step }))
          : undefined,
      ),
    readAssignments: (activityId) =>
      Promise.resolve(
        activities.has(activityId)
          ? [...assignments.values()]
              .filter((a) => a.activityId === activityId)
              .map((a) => ({ ...a }))
          : undefined,
      ),
    // This fake holds no swimlanes: the swimlane commands are tested against their own small store.
    readSwimlanes: () => Promise.resolve([]),
    readCodeTypes: () => Promise.resolve(liveTypes().map((type) => ({ ...type }))),
    readCodeValues: (codeTypeId) => {
      const type = codeTypes.get(codeTypeId);
      return Promise.resolve(
        type === undefined || type.deletedAt !== null
          ? undefined
          : liveValues(codeTypeId).map((value) => ({ ...value })),
      );
    },
    readPlan: () => Promise.resolve(undefined),
    readCrossPlanLink: (id) => {
      const link = crossPlanLinks.get(id);
      return Promise.resolve(link === undefined ? undefined : { ...link });
    },
    readDependencies: (ids) =>
      Promise.resolve(
        new Map(
          ids.flatMap((id) => {
            const row = dependencies.get(id);
            return row === undefined ? [] : [[id, { ...row }] as const];
          }),
        ),
      ),
  };

  const assignmentOf = (id: string): ResourceAssignmentSummary => {
    const row = assignments.get(id);
    if (row === undefined) throw new ApiFetchError(404, { code: 'NOT_FOUND', message: 'Gone.' });
    return row;
  };
  /** Setting a driver is a move: the server clears the activity's previous driver in the same write. */
  const clearDrivers = (activityId: string, exceptId?: string): void => {
    for (const other of assignments.values()) {
      if (other.activityId === activityId && other.isDriving && other.id !== exceptId) {
        other.isDriving = false;
        other.version += 1;
      }
    }
  };

  const mutations = {
    renameCodeType: vi.fn((input: { codeTypeId: string; name: string; version: number }) => {
      const row = typeOf(input.codeTypeId);
      lock(row, input.version);
      row.name = input.name;
      row.version += 1;
      return Promise.resolve({ ...row });
    }),
    reorderCodeTypes: vi.fn((input: { order: { id: string; version: number }[] }) =>
      Promise.resolve(reorder(liveTypes(), input.order)),
    ),
    deleteCodeType: vi.fn((input: { codeTypeId: string; version?: number }) => {
      const row = typeOf(input.codeTypeId);
      staleGuard(row, input.version);
      const taken = liveValues(row.id);
      const at = new Date().toISOString();
      for (const value of taken) value.deletedAt = at;
      takenWithType.set(
        row.id,
        taken.map((value) => value.id),
      );
      row.deletedAt = at;
      row.version += 1;
      return Promise.resolve();
    }),
    restoreCodeType: vi.fn((input: { codeTypeId: string }) => {
      const row = codeTypes.get(input.codeTypeId);
      if (row?.deletedAt == null) {
        throw new ApiFetchError(404, { code: 'NOT_FOUND', message: 'Gone.' });
      }
      row.deletedAt = null;
      row.version += 1;
      for (const id of takenWithType.get(row.id) ?? []) {
        const value = codeValues.get(id);
        if (value) value.deletedAt = null;
      }
      return Promise.resolve({ ...row });
    }),
    editCodeValue: vi.fn(
      (input: {
        codeValueId: string;
        codeTypeId: string;
        shortCode?: string;
        description?: string | null;
        version: number;
      }) => {
        const row = valueOf(input.codeValueId);
        lock(row, input.version);
        if (input.shortCode !== undefined) row.shortCode = input.shortCode;
        if (input.description !== undefined) row.description = input.description;
        row.version += 1;
        return Promise.resolve({ ...row });
      },
    ),
    reorderCodeValues: vi.fn(
      (input: { codeTypeId: string; order: { id: string; version: number }[] }) =>
        Promise.resolve(reorder(liveValues(input.codeTypeId), input.order)),
    ),
    deleteCodeValue: vi.fn(
      (input: { codeValueId: string; codeTypeId: string; version?: number }) => {
        const row = valueOf(input.codeValueId);
        staleGuard(row, input.version);
        row.deletedAt = new Date().toISOString();
        row.version += 1;
        return Promise.resolve();
      },
    ),
    restoreCodeValue: vi.fn((input: { codeValueId: string; codeTypeId: string }) => {
      const row = codeValues.get(input.codeValueId);
      if (row?.deletedAt == null) {
        throw new ApiFetchError(404, { code: 'NOT_FOUND', message: 'Gone.' });
      }
      // The server refuses to restore a value onto a deleted type, and says which parent it is.
      if (codeTypes.get(row.codeTypeId)?.deletedAt != null) throw conflict('PARENT_DELETED');
      row.deletedAt = null;
      row.version += 1;
      return Promise.resolve({ ...row });
    }),
    updateParents: vi.fn(
      (input: { parents: { id: string; parentId: string | null; version: number }[] }) => {
        // All-or-nothing, like the endpoint: one stale row refuses the lot and writes none.
        for (const p of input.parents) lock(rowOf(p.id), p.version);
        return Promise.resolve(
          input.parents.map((p) => write(p.id, p.version, { parentId: p.parentId })),
        );
      },
    ),
    replaceSteps: vi.fn(
      (input: {
        activityId: string;
        version: number;
        steps: { name: string; weight: number; percentComplete: number }[];
      }) => {
        // The replace bumps the parent activity, whose version it is locked on.
        write(input.activityId, input.version, {});
        const saved = input.steps.map((step, i) =>
          aStep({ ...step, id: `s${nextStep++}`, activityId: input.activityId, seq: i + 1 }),
        );
        steps.set(input.activityId, saved);
        return Promise.resolve(saved.map((step) => ({ ...step })));
      },
    ),
    createAssignment: vi.fn(
      (input: {
        activityId: string;
        body: {
          resourceId: string;
          budgetedUnits: number;
          unitsPerHour?: number;
          isDriving: boolean;
          curveType?: ResourceAssignmentSummary['curveType'];
          budgetedCost?: number;
          actualCost?: number;
          actualUnits?: number;
          lagMinutes?: number;
        };
      }) => {
        rowOf(input.activityId);
        const taken = [...assignments.values()].some(
          (a) => a.activityId === input.activityId && a.resourceId === input.body.resourceId,
        );
        if (taken) throw conflict('DUPLICATE_ASSIGNMENT');
        if (input.body.isDriving) clearDrivers(input.activityId);
        const { budgetedUnits, isDriving, resourceId } = input.body;
        const row = anAssignment({
          id: `as${nextAssignment++}`,
          activityId: input.activityId,
          resourceId,
          budgetedUnits,
          isDriving,
          unitsPerHour: input.body.unitsPerHour ?? null,
          ...(input.body.curveType === undefined ? {} : { curveType: input.body.curveType }),
          budgetedCost: input.body.budgetedCost ?? null,
          actualCost: input.body.actualCost ?? 0,
          actualUnits: input.body.actualUnits ?? 0,
          lagMinutes: input.body.lagMinutes ?? 0,
        });
        assignments.set(row.id, row);
        return Promise.resolve({ ...row });
      },
    ),
    updateAssignment: vi.fn(
      (input: {
        assignmentId: string;
        activityId: string;
        version: number;
        budgetedUnits?: number;
        unitsPerHour?: number;
        isDriving?: boolean;
        curveType?: ResourceAssignmentSummary['curveType'];
        editedField?: EditedField;
        budgetedCost?: number | null;
        actualCost?: number;
        actualUnits?: number;
        lagMinutes?: number;
      }) => {
        const row = assignmentOf(input.assignmentId);
        lock(row, input.version);
        const { budgetedUnits, unitsPerHour, isDriving, curveType } = input;
        const { budgetedCost, actualCost, actualUnits, lagMinutes } = input;
        if (isDriving === true) clearDrivers(row.activityId, row.id);
        Object.assign(row, {
          ...(budgetedUnits === undefined ? {} : { budgetedUnits }),
          ...(unitsPerHour === undefined ? {} : { unitsPerHour }),
          ...(isDriving === undefined ? {} : { isDriving }),
          ...(curveType === undefined ? {} : { curveType }),
          ...(budgetedCost === undefined ? {} : { budgetedCost }),
          ...(actualCost === undefined ? {} : { actualCost }),
          ...(actualUnits === undefined ? {} : { actualUnits }),
          ...(lagMinutes === undefined ? {} : { lagMinutes }),
        });
        row.version += 1;
        return Promise.resolve({ ...row });
      },
    ),
    deleteAssignment: vi.fn(
      (input: { assignmentId: string; activityId: string; version?: number | undefined }) => {
        staleGuard(assignmentOf(input.assignmentId), input.version);
        assignments.delete(input.assignmentId);
        return Promise.resolve();
      },
    ),
    createCrossPlanLink: vi.fn(
      (input: {
        predecessorActivityId: string;
        successorActivityId: string;
        type: CrossPlanDependencySummary['type'];
        lagDays: number;
        lagCalendar: CrossPlanDependencySummary['lagCalendar'];
      }) => {
        const exists = [...crossPlanLinks.values()].some(
          (l) =>
            l.predecessor.id === input.predecessorActivityId &&
            l.successor.id === input.successorActivityId &&
            l.type === input.type,
        );
        if (exists) throw conflict('DUPLICATE_DEPENDENCY');
        const row = aCrossPlanLink({
          id: `x${nextCrossLink++}`,
          type: input.type,
          lagDays: input.lagDays,
          lagMinutes: input.lagDays * 480,
          lagCalendar: input.lagCalendar,
          predecessor: { id: input.predecessorActivityId, code: null, name: 'Other plan work' },
          successor: {
            id: input.successorActivityId,
            code: null,
            name: activities.get(input.successorActivityId)?.name ?? 'Activity',
          },
        });
        crossPlanLinks.set(row.id, row);
        return Promise.resolve({ ...row });
      },
    ),
    deleteCrossPlanLink: vi.fn((id: string) => {
      if (!crossPlanLinks.delete(id)) {
        throw new ApiFetchError(404, { code: 'NOT_FOUND', message: 'Gone.' });
      }
      return Promise.resolve();
    }),
    patchFields: vi.fn(
      (input: { activityId: string; version: number; patch: Record<string, unknown> }) =>
        Promise.resolve(
          write(input.activityId, input.version, input.patch as Partial<ActivitySummary>),
        ),
    ),
    repositionLane: vi.fn((input: { activityId: string; laneIndex: number; version: number }) =>
      Promise.resolve(write(input.activityId, input.version, { laneIndex: input.laneIndex })),
    ),
    setVisualStart: vi.fn(
      (input: {
        activityId: string;
        visualStart: string | null;
        durationDays?: number;
        laneIndex?: number;
        version: number;
      }) =>
        Promise.resolve(
          write(input.activityId, input.version, {
            visualStart: input.visualStart,
            ...(input.laneIndex !== undefined ? { laneIndex: input.laneIndex } : {}),
            ...(input.durationDays !== undefined
              ? { durationDays: input.durationDays, durationMinutes: input.durationDays * 480 }
              : {}),
          }),
        ),
    ),
    batchPositions: vi.fn(
      (input: { positions: { id: string; laneIndex: number; version: number }[] }) => {
        // All-or-nothing, like the endpoint: one stale row refuses the lot and writes none.
        for (const p of input.positions) lock(rowOf(p.id), p.version);
        return Promise.resolve(
          input.positions.map((p) => write(p.id, p.version, { laneIndex: p.laneIndex })),
        );
      },
    ),
    batchPlacements: vi.fn(
      (input: {
        placements: {
          id: string;
          version: number;
          constraintType: ActivitySummary['constraintType'];
          constraintDate: string | null;
          visualStart: string | null;
          laneIndex: number | null;
        }[];
      }) => {
        for (const p of input.placements) lock(rowOf(p.id), p.version);
        return Promise.resolve(
          input.placements.map(({ id, version, laneIndex, ...fields }) =>
            write(id, version, { ...fields, ...(laneIndex !== null ? { laneIndex } : {}) }),
          ),
        );
      },
    ),
    /** Promote every child to the summary's own parent, then delete the summary alone — as the endpoint does. */
    dissolve: vi.fn((input: string | { activityId: string; version?: number | undefined }) => {
      const { id, version } = idAndVersion(input, 'activityId');
      const summary = rowOf(id);
      staleGuard(summary, version);
      const promoted = [...activities.values()]
        .filter((a) => a.parentId === id)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((child) => {
          child.parentId = summary.parentId;
          child.version += 1;
          return { id: child.id, parentId: child.parentId, version: child.version };
        });
      return Promise.resolve({ promoted, deleteBatchId: sweep([id]) });
    }),
    deleteActivity: vi.fn(
      (input: string | { activityId: string; version?: number | undefined }) => {
        const { id, version } = idAndVersion(input, 'activityId');
        staleGuard(rowOf(id), version);
        return Promise.resolve({ deleteBatchId: sweep([id]) });
      },
    ),
    bulkDelete: vi.fn((input: { activities: { id: string; version: number }[] }) => {
      for (const a of input.activities) lock(rowOf(a.id), a.version);
      return Promise.resolve({
        deleteBatchId: sweep(input.activities.map((a) => a.id)),
        activityCount: input.activities.length,
        dependencyCount: 0,
      });
    }),
    restoreBatch: vi.fn((input: { deleteBatchId: string }) => {
      const batch = deleted.get(input.deleteBatchId);
      if (batch === undefined) {
        throw new ApiFetchError(404, { code: 'NOT_FOUND', message: 'Gone.' });
      }
      deleted.delete(input.deleteBatchId);
      for (const link of batch.links) dependencies.set(link.id, { ...link });
      return Promise.resolve(
        batch.rows.map((row) => {
          const restored = { ...row, version: row.version + 1 };
          activities.set(restored.id, restored);
          return { ...restored };
        }),
      );
    }),
    updateDependency: vi.fn(
      (input: {
        dependencyId: string;
        type: DependencySummary['type'];
        lagCalendar: DependencySummary['lagCalendar'];
        version: number;
        lagDays?: number;
        lagMinutes?: number;
      }) => {
        const row = dependencies.get(input.dependencyId);
        if (row === undefined)
          throw new ApiFetchError(404, { code: 'NOT_FOUND', message: 'Gone.' });
        lock(row, input.version);
        row.type = input.type;
        row.lagCalendar = input.lagCalendar;
        if (input.lagMinutes !== undefined) {
          row.lagMinutes = input.lagMinutes;
          row.lagDays = Math.round(input.lagMinutes / 480);
        }
        if (input.lagDays !== undefined) {
          row.lagDays = input.lagDays;
          row.lagMinutes = input.lagDays * 480;
        }
        row.version += 1;
        return Promise.resolve({ ...row });
      },
    ),
    createDependency: vi.fn(
      (input: {
        planId: string;
        predecessorId: string;
        successorId: string;
        type: DependencySummary['type'];
        lagMinutes?: number;
        lagDays?: number;
        lagCalendar: DependencySummary['lagCalendar'];
      }) => {
        const exists = [...dependencies.values()].some(
          (d) =>
            d.predecessor.id === input.predecessorId &&
            d.successor.id === input.successorId &&
            d.type === input.type,
        );
        if (exists) throw conflict('DUPLICATE_DEPENDENCY');
        const row = aDependency({
          id: `d${nextDependency++}`,
          planId: input.planId,
          type: input.type,
          lagMinutes: input.lagMinutes ?? (input.lagDays ?? 0) * 480,
          lagCalendar: input.lagCalendar,
          predecessor: {
            id: input.predecessorId,
            code: null,
            name: rowOf(input.predecessorId).name,
          },
          successor: { id: input.successorId, code: null, name: rowOf(input.successorId).name },
        });
        dependencies.set(row.id, row);
        return Promise.resolve({ ...row });
      },
    ),
    deleteDependency: vi.fn(
      (input: string | { dependencyId: string; version?: number | undefined }) => {
        const { id, version } = idAndVersion(input, 'dependencyId');
        const row = dependencies.get(id);
        if (row === undefined)
          throw new ApiFetchError(404, { code: 'NOT_FOUND', message: 'Gone.' });
        staleGuard(row, version);
        dependencies.delete(id);
        return Promise.resolve();
      },
    ),
  };

  return {
    ctx,
    mutations,
    activities,
    dependencies,
    assignments,
    steps,
    crossPlanLinks,
    codeTypes,
    codeValues,
    /** Somebody else's write to a code type: changes it and bumps its version. */
    editCodeType: (id: string, fields: Partial<CodeTypeSummary>): void => {
      const row = typeOf(id);
      Object.assign(row, fields);
      row.version += 1;
    },
    /** Somebody else's write to a code value. */
    editCodeValueRow: (id: string, fields: Partial<CodeValueSummary>): void => {
      const row = valueOf(id);
      Object.assign(row, fields);
      row.version += 1;
    },
    /** The plan's live code types and a type's live values, as a read would answer: copies, so a captured "before" cannot move under a test. */
    liveCodeTypes: (): CodeTypeSummary[] => liveTypes().map((type) => ({ ...type })),
    liveCodeValues: (codeTypeId: string): CodeValueSummary[] =>
      liveValues(codeTypeId).map((value) => ({ ...value })),
    /** Somebody else's write to an assignment: changes it and bumps its version. */
    editAssignment: (id: string, fields: Partial<ResourceAssignmentSummary>): void => {
      const row = assignmentOf(id);
      Object.assign(row, fields);
      row.version += 1;
    },
    removeAssignment: (id: string): void => {
      assignments.delete(id);
    },
    /** Somebody else's steps save: the list becomes `list`, in order. */
    setSteps: (activityId: string, list: ActivityStep[]): void => {
      steps.set(
        activityId,
        list.map((step) => ({ ...step })),
      );
    },
    editCrossPlanLink: (id: string, fields: Partial<CrossPlanDependencySummary>): void => {
      const row = crossPlanLinks.get(id);
      if (row === undefined) throw new Error(`no cross-plan link ${id}`);
      Object.assign(row, fields);
      row.version += 1;
    },
    removeCrossPlanLink: (id: string): void => {
      crossPlanLinks.delete(id);
    },
    /** Somebody else's write: changes the row and bumps its version, and nothing records it. */
    edit: (id: string, fields: Partial<ActivitySummary>): void => {
      const row = rowOf(id);
      Object.assign(row, fields);
      row.version += 1;
    },
    editDependency: (id: string, fields: Partial<DependencySummary>): void => {
      const row = dependencies.get(id);
      if (row === undefined) throw new Error(`no dependency ${id}`);
      Object.assign(row, fields);
      row.version += 1;
    },
    /** Somebody else's delete. */
    remove: (id: string): void => {
      activities.delete(id);
    },
    removeDependency: (id: string): void => {
      dependencies.delete(id);
    },
    /** The row as the server holds it now. */
    row: (id: string): ActivitySummary => ({ ...rowOf(id) }),
    /** The link as the server holds it now — a copy, so a captured "before" cannot move under a test. */
    link: (id: string): DependencySummary | undefined => {
      const row = dependencies.get(id);
      return row === undefined ? undefined : { ...row };
    },
  };
}

/**
 * A stand-in for `apiFetchAllPages` that answers the plan's lists (and one activity's predecessors
 * and successors) from a {@link fakePlanServer}, so the real replay context (`usePlanUndoRedo`'s
 * `fetchQuery` reads) can run under a test without a network.
 */
export function pagedReader(server: ReturnType<typeof fakePlanServer>) {
  return (path: string): Promise<unknown[]> => {
    const links = /\/activities\/([^/]+)\/(predecessors|successors)$/.exec(path);
    if (links) {
      const [, id, which] = links;
      return Promise.resolve(
        [...server.dependencies.values()].filter((d) =>
          which === 'predecessors' ? d.successor.id === id : d.predecessor.id === id,
        ),
      );
    }
    if (path.endsWith('/dependencies')) return Promise.resolve([...server.dependencies.values()]);
    if (path.endsWith('/activities')) return Promise.resolve([...server.activities.values()]);
    return Promise.reject(new Error(`pagedReader: no list for ${path}`));
  };
}

/** A stand-in for `apiFetch`: `GET …/activities/:id` and `GET …/dependencies/:id`, 404 when gone. */
export function detailReader(server: ReturnType<typeof fakePlanServer>) {
  return (path: string): Promise<unknown> => {
    const match = /\/(activities|dependencies)\/([^/]+)$/.exec(path);
    const row = match
      ? (match[1] === 'activities' ? server.activities : server.dependencies).get(match[2] ?? '')
      : undefined;
    return row === undefined
      ? Promise.reject(new ApiFetchError(404, { code: 'NOT_FOUND', message: 'Gone.' }))
      : Promise.resolve({ ...row });
  };
}
