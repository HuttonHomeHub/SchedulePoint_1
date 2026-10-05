import type { ActivitySummary, DependencySummary } from '@repo/types';
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
  seed: { activities?: ActivitySummary[]; dependencies?: DependencySummary[] } = {},
  options: { normalise?: (row: ActivitySummary) => void } = {},
) {
  const activities = new Map((seed.activities ?? []).map((a) => [a.id, { ...a }]));
  const dependencies = new Map((seed.dependencies ?? []).map((d) => [d.id, { ...d }]));
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

  const mutations = {
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
    deleteActivity: vi.fn((id: string) => {
      rowOf(id);
      return Promise.resolve({ deleteBatchId: sweep([id]) });
    }),
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
    deleteDependency: vi.fn((id: string) => {
      if (!dependencies.delete(id)) {
        throw new ApiFetchError(404, { code: 'NOT_FOUND', message: 'Gone.' });
      }
      return Promise.resolve();
    }),
  };

  return {
    ctx,
    mutations,
    activities,
    dependencies,
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
