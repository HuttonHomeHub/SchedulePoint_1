import type { InterchangeReport } from '@repo/interchange';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { parseInterchangeReportHeader } from './use-export-plan';
import { useCommitImport, useDryRunImport } from './use-interchange';

/**
 * ADR-0162 D9 (closes `docs/TECH_DEBT.md` #387): **every web reader of the interchange report
 * tolerates a key it does not know.** The web and API images are published and recreated
 * independently (ADR-0047), so a browser tab loaded from one release routinely reads a report written
 * by the next. Before this, the reader's schema was `.strict()` at every level, and one new nested
 * count made the dry-run fail with "Something went wrong" in every stale tab.
 *
 * All three parse sites are driven here — the dry-run, the commit envelope and the export's report
 * header — because each reaches the schema by a different route, and a fix applied to one of them
 * and not its neighbours is the shape this register records most often. The extra keys sit at every
 * object level the report has (top level, `mapped`, a finding, a resource collision and the
 * collision's `existing` row): `#387`'s recorded instance was a **nested** count, so a
 * top-level-only fix would not have avoided it.
 *
 * Verified red against the `.strict()` schema this replaced: the three tolerance cases failed there
 * with `unrecognized_keys` at every level; the fourth (a wrong value for a known key) is a control
 * that must hold in both, and did.
 */

const KNOWN: InterchangeReport = {
  detectedFormat: 'XER',
  sourceVersion: '23.12',
  sourceFilename: 'unit-300.xer',
  mapped: { activities: 3, relationships: 2, calendars: 1, resources: 1 },
  approximations: [
    {
      kind: 'approximation',
      entity: 'activity',
      sourceRef: 'A100',
      detail: 'lag "3d" → 4320min',
      reason: 'hours to working minutes',
    },
  ],
  repairs: [],
  drops: [{ kind: 'drop', entity: 'udf', sourceRef: null, detail: 'user-defined fields' }],
  resourceCollisions: [
    {
      resourceKey: 'rsrc-1',
      name: 'Electrician',
      code: 'ELEC',
      existing: { id: 'lib-1', name: 'Electrician', code: null, archived: false },
    },
  ],
};

/** The same report as a newer API would send it: one unknown key at every object level. */
function withExtraKeys(): Record<string, unknown> {
  const report = structuredClone(KNOWN) as unknown as {
    mapped: Record<string, unknown>;
    approximations: Record<string, unknown>[];
    resourceCollisions: { existing: Record<string, unknown> }[] & Record<string, unknown>[];
  } & Record<string, unknown>;
  report.fromTheFuture = { anything: true };
  report.mapped.futureCount = 7;
  report.approximations[0]!.futureNote = 'a later field';
  report.resourceCollisions[0]!.futureFlag = true;
  report.resourceCollisions[0]!.existing.futureMarker = 'x';
  return report;
}

const fetchMock = vi.fn();

function respondWith(data: unknown): void {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}

const upload = { file: new File(['x'], 'unit-300.xer') };

describe('an interchange report carrying keys this bundle does not know (ADR-0162 D9)', () => {
  it('the dry-run accepts it, strips every unknown key and keeps every known field', async () => {
    respondWith(withExtraKeys());
    const { result } = renderHook(() => useDryRunImport('acme', 'project-1'), { wrapper });
    result.current.mutate(upload);
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual(KNOWN);
  });

  it('the commit envelope accepts it, and strips an unknown key on the envelope too', async () => {
    respondWith({ planId: 'plan-9', report: withExtraKeys(), futureEnvelopeKey: 1 });
    const { result } = renderHook(() => useCommitImport('acme', 'project-1'), { wrapper });
    result.current.mutate(upload);
    await waitFor(() => expect(result.current.isSuccess || result.current.isError).toBe(true));
    expect(result.current.error).toBeNull();
    expect(result.current.data).toEqual({ planId: 'plan-9', report: KNOWN });
  });

  it('the export report header accepts it and strips every unknown key', () => {
    expect(parseInterchangeReportHeader(JSON.stringify(withExtraKeys()))).toEqual(KNOWN);
  });

  it('still rejects a KNOWN key with the wrong value: tolerance is for keys, not for values', async () => {
    const bad = withExtraKeys() as { mapped: Record<string, unknown> };
    bad.mapped.activities = -1;
    expect(parseInterchangeReportHeader(JSON.stringify(bad))).toBeNull();

    respondWith(bad);
    const { result } = renderHook(() => useDryRunImport('acme', 'project-1'), { wrapper });
    result.current.mutate(upload);
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
