import type { CodeTypeSummary, CodeValueSummary } from '@repo/types';

import { ApiFetchError } from '@/lib/api/client';

/**
 * A plan's codes behind `@/lib/api/client`, for the dialog's component tests: the three reads the
 * screens use and the ten writes, applied to one in-memory store, with every request recorded so a
 * test can count them. Not a mock of the hooks — the real hooks run against it — which is what lets a
 * test prove how many requests opening the dialog costs.
 */
export interface CodesServer {
  types: CodeTypeSummary[];
  values: Map<string, CodeValueSummary[]>;
  /** Every request the client made, `GET …` / `POST …`, in order. */
  requests: string[];
  /** The writes only, with their parsed bodies. */
  writes: { method: string; path: string; body: unknown }[];
  /** The next write is refused with this, once. */
  failNext: ApiFetchError | null;
  readCount: (matching: RegExp) => number;
  api: {
    apiFetchAllPages: (path: string) => Promise<unknown[]>;
    apiFetchEnvelope: (
      path: string,
    ) => Promise<{ data: unknown; meta?: { nextCursor: string | null; hasMore: boolean } }>;
    apiFetch: (path: string, init?: RequestInit) => Promise<unknown>;
  };
  /** Somebody else's delete of a value, with no request from this client. */
  removeValueBehindMyBack: (typeId: string, valueId: string) => void;
  removeTypeBehindMyBack: (typeId: string) => void;
}

export const aType = (
  id: string,
  name: string,
  position: number,
  extra: Partial<CodeTypeSummary> = {},
): CodeTypeSummary => ({
  id,
  planId: 'p1',
  name,
  position,
  version: 1,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  ...extra,
});

export const aValue = (
  id: string,
  codeTypeId: string,
  shortCode: string,
  position: number,
  description: string | null = null,
  extra: Partial<CodeValueSummary> = {},
): CodeValueSummary => ({
  id,
  codeTypeId,
  shortCode,
  description,
  position,
  version: position + 1,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  ...extra,
});

/** The seeded `plan:capability-codes` catalogue: Area (GF, L1, L2, RF), Trade (five), Phase (three). */
export function seededCodes(): { types: CodeTypeSummary[]; values: CodeValueSummary[] } {
  return {
    types: [aType('area', 'Area', 0), aType('trade', 'Trade', 1), aType('phase', 'Phase', 2)],
    values: [
      aValue('gf', 'area', 'GF', 0, 'Ground floor'),
      aValue('l1', 'area', 'L1', 1, 'Level 1'),
      aValue('l2', 'area', 'L2', 2, 'Level 2'),
      aValue('rf', 'area', 'RF', 3, 'Roof'),
      aValue('civ', 'trade', 'CIV', 0, 'Civil and groundworks'),
      aValue('str', 'trade', 'STR', 1, 'Structural steel'),
      aValue('mep', 'trade', 'MEP', 2, 'Mechanical, electrical and plumbing'),
      aValue('env', 'trade', 'ENV', 3, 'Building envelope'),
      aValue('fin', 'trade', 'FIN', 4, 'Finishes'),
      aValue('ph1', 'phase', 'PH1', 0),
      aValue('ph2', 'phase', 'PH2', 1),
      aValue('ph3', 'phase', 'PH3', 2),
    ],
  };
}

const gone = (): ApiFetchError =>
  new ApiFetchError(404, { code: 'NOT_FOUND', message: 'Not found.' });

export function codesServer(
  seed: { types: CodeTypeSummary[]; values: CodeValueSummary[] } = seededCodes(),
): CodesServer {
  const types = seed.types.map((t) => ({ ...t }));
  const values = new Map<string, CodeValueSummary[]>();
  for (const type of types) values.set(type.id, []);
  for (const value of seed.values) values.get(value.codeTypeId)?.push({ ...value });
  let next = 100;

  // In `position` order, as the API reads them (`ORDER BY position, id`).
  const live = <T extends { deletedAt: string | null; position: number; id: string }>(
    rows: T[],
  ): T[] =>
    rows
      .filter((r) => r.deletedAt === null)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const typeOf = (id: string): CodeTypeSummary => {
    const t = types.find((x) => x.id === id);
    if (t === undefined) throw gone();
    return t;
  };
  const valueOf = (id: string): CodeValueSummary => {
    for (const list of values.values()) {
      const v = list.find((x) => x.id === id);
      if (v) return v;
    }
    throw gone();
  };
  const withCount = (t: CodeTypeSummary): CodeTypeSummary => ({
    ...t,
    valueCount: live(values.get(t.id) ?? []).length,
  });
  const reorder = <T extends { id: string; position: number; version: number }>(
    list: T[],
    order: { id: string; version: number }[],
  ): T[] =>
    order.map((o, position) => {
      const row = list.find((x) => x.id === o.id);
      if (row === undefined) throw gone();
      row.position = position;
      row.version += 1;
      return { ...row };
    });

  const server: CodesServer = {
    types,
    values,
    requests: [],
    writes: [],
    failNext: null,
    readCount: (matching) => server.requests.filter((r) => matching.test(r)).length,
    removeValueBehindMyBack: (typeId, valueId) => {
      const list = values.get(typeId) ?? [];
      const row = list.find((v) => v.id === valueId);
      if (row) row.deletedAt = '2026-10-01T00:00:00Z';
    },
    removeTypeBehindMyBack: (typeId) => {
      typeOf(typeId).deletedAt = '2026-10-01T00:00:00Z';
    },
    api: {
      apiFetchAllPages: (path) => {
        server.requests.push(`GET ${path}`);
        if (/\/code-types\?values=none&include=deleted$/.test(path)) {
          return Promise.resolve(types.filter((t) => t.deletedAt !== null).map(withCount));
        }
        if (/\/code-types\?values=none$/.test(path)) {
          return Promise.resolve(live(types).map(withCount));
        }
        return Promise.reject(new Error(`unexpected list ${path}`));
      },
      apiFetchEnvelope: (path) => {
        server.requests.push(`GET ${path}`);
        const match = /\/code-types\/([^/?]+)\/values\?(include=deleted&)?limit=1000$/.exec(path);
        if (!match) return Promise.reject(new Error(`unexpected envelope ${path}`));
        const type = types.find((t) => t.id === match[1]);
        if (type === undefined || type.deletedAt !== null) return Promise.reject(gone());
        const all = values.get(type.id) ?? [];
        const rows = match[2]
          ? [...all].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
          : live(all);
        return Promise.resolve({
          data: rows.map((r) => ({ ...r })),
          meta: { nextCursor: null, hasMore: false },
        });
      },
      apiFetch: (path, init) => {
        const method = init?.method ?? 'GET';
        const body: unknown = init?.body ? JSON.parse(init.body as string) : undefined;
        server.requests.push(`${method} ${path}`);
        if (method !== 'GET') server.writes.push({ method, path, body });
        if (server.failNext && method !== 'GET') {
          const error = server.failNext;
          server.failNext = null;
          return Promise.reject(error);
        }
        const tail = path.replace(/^.*\/plans\/p1\//, '');
        let m: RegExpExecArray | null;
        // Naming ids (`GET …/code-values?id=a&id=b`): deleted values and values of deleted types are
        // named too, and an id nothing holds is simply absent, as on the server.
        if (method === 'GET' && (m = /^code-values\?(.+)$/.exec(tail))) {
          const ids = new URLSearchParams(m[1]).getAll('id');
          const found = ids.flatMap((id) => {
            for (const [typeId, list] of values) {
              const row = list.find((v) => v.id === id);
              if (row === undefined) continue;
              const type = typeOf(typeId);
              return [{ ...row, codeTypeName: type.name, codeTypeDeletedAt: type.deletedAt }];
            }
            return [];
          });
          return Promise.resolve(found);
        }
        // The codes write: records the request and answers each named row at its next version.
        if (method === 'PATCH' && tail === 'activities/codes') {
          const rows = (body as { activities: { id: string; version: number }[] }).activities;
          return Promise.resolve(rows.map((row) => ({ id: row.id, version: row.version + 1 })));
        }
        if (method === 'POST' && tail === 'code-types') {
          const t = aType(`new-${String(next++)}`, (body as { name: string }).name, types.length);
          types.push(t);
          values.set(t.id, []);
          return Promise.resolve({ ...t });
        }
        if (method === 'PATCH' && tail === 'code-types/order') {
          const rows = reorder(
            live(types),
            (body as { order: { id: string; version: number }[] }).order,
          );
          return Promise.resolve(rows);
        }
        if ((m = /^code-types\/([^/?]+)\/values\/order$/.exec(tail)) && method === 'PATCH') {
          const list = live(values.get(m[1] ?? '') ?? []);
          return Promise.resolve(
            reorder(list, (body as { order: { id: string; version: number }[] }).order),
          );
        }
        if ((m = /^code-types\/([^/?]+)\/values$/.exec(tail)) && method === 'POST') {
          const b = body as { shortCode: string; description?: string };
          const list = values.get(m[1] ?? '') ?? [];
          const v = aValue(
            `new-${String(next++)}`,
            m[1] ?? '',
            b.shortCode,
            list.length,
            b.description ?? null,
          );
          list.push(v);
          return Promise.resolve({ ...v });
        }
        if ((m = /^code-types\/([^/?]+)\/restore$/.exec(tail)) && method === 'POST') {
          const t = typeOf(m[1] ?? '');
          t.deletedAt = null;
          return Promise.resolve(withCount(t));
        }
        if ((m = /^code-types\/([^/?]+)(?:\?.*)?$/.exec(tail))) {
          const t = typeOf(m[1] ?? '');
          if (method === 'PATCH') {
            t.name = (body as { name: string }).name;
            t.version += 1;
            return Promise.resolve({ ...t });
          }
          if (method === 'DELETE') {
            t.deletedAt = '2026-10-02T00:00:00Z';
            return Promise.resolve(undefined);
          }
        }
        if ((m = /^code-values\/([^/?]+)\/restore$/.exec(tail)) && method === 'POST') {
          const v = valueOf(m[1] ?? '');
          v.deletedAt = null;
          return Promise.resolve({ ...v });
        }
        if ((m = /^code-values\/([^/?]+)/.exec(tail))) {
          const v = valueOf(m[1] ?? '');
          if (method === 'PATCH') {
            const b = body as { shortCode?: string; description?: string | null };
            if (b.shortCode !== undefined) v.shortCode = b.shortCode;
            if (b.description !== undefined) v.description = b.description;
            v.version += 1;
            return Promise.resolve({ ...v });
          }
          if (method === 'DELETE') {
            v.deletedAt = '2026-10-02T00:00:00Z';
            return Promise.resolve(undefined);
          }
        }
        return Promise.reject(new Error(`unexpected write ${method} ${path}`));
      },
    },
  };
  return server;
}
