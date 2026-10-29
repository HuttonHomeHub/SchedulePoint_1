import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useCreateCodeType,
  useCreateCodeValue,
  useDeleteCodeType,
  useDeleteCodeValue,
  useEditCodeValue,
  useRenameCodeType,
  useReorderCodeTypes,
  useReorderCodeValues,
  useRestoreCodeType,
  useRestoreCodeValue,
} from './use-code-mutations';

import { apiFetch } from '@/lib/api/client';
import { activityKeys, codeKeys } from '@/lib/query/hierarchy-keys';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: vi.fn(),
}));

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidated: unknown[][] = [];
  vi.spyOn(qc, 'invalidateQueries').mockImplementation((filters) => {
    invalidated.push([...((filters?.queryKey ?? []) as unknown[])]);
    return Promise.resolve();
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper, invalidated };
}

const P = '/organizations/acme/plans/p1';
const sent = (): { path: string; init: RequestInit } => {
  const [path, init] = vi.mocked(apiFetch).mock.calls[0] ?? [];
  return { path: path as string, init: init as RequestInit };
};
const has = (invalidated: unknown[][], key: readonly unknown[]): boolean =>
  invalidated.some((k) => JSON.stringify(k) === JSON.stringify(key));

describe('the code writes', () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset().mockResolvedValue(undefined));

  it('create a type with a POST and refresh only the type list', async () => {
    const { wrapper, invalidated } = setup();
    const { result } = renderHook(() => useCreateCodeType('acme', 'p1'), { wrapper });
    await act(() => result.current.mutateAsync({ name: 'Area' }));
    expect(sent().path).toBe(`${P}/code-types`);
    expect(sent().init).toMatchObject({ method: 'POST', body: JSON.stringify({ name: 'Area' }) });
    expect(invalidated).toEqual([codeKeys.types('acme', 'p1')]);
  });

  it('rename and reorder types with a PATCH and refresh the type list', async () => {
    const { wrapper, invalidated } = setup();
    const rename = renderHook(() => useRenameCodeType('acme', 'p1'), { wrapper });
    await act(() =>
      rename.result.current.mutateAsync({ codeTypeId: 't1', name: 'Zone', version: 3 }),
    );
    expect(sent().path).toBe(`${P}/code-types/t1`);
    expect(sent().init).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ name: 'Zone', version: 3 }),
    });
    vi.mocked(apiFetch).mockClear();
    const reorder = renderHook(() => useReorderCodeTypes('acme', 'p1'), { wrapper });
    await act(() => reorder.result.current.mutateAsync({ order: [{ id: 't1', version: 4 }] }));
    expect(sent().path).toBe(`${P}/code-types/order`);
    expect(has(invalidated, codeKeys.types('acme', 'p1'))).toBe(true);
    expect(invalidated.some((k) => k.includes('activities'))).toBe(false);
  });

  it('create, edit and reorder values refresh that type’s values and never the activities', async () => {
    const { wrapper, invalidated } = setup();
    const create = renderHook(() => useCreateCodeValue('acme', 'p1'), { wrapper });
    await act(() =>
      create.result.current.mutateAsync({
        codeTypeId: 't1',
        shortCode: 'L1',
        description: 'Level 1',
      }),
    );
    expect(sent().path).toBe(`${P}/code-types/t1/values`);
    expect(JSON.parse(sent().init.body as string)).toEqual({
      shortCode: 'L1',
      description: 'Level 1',
    });
    // `valueCount` rides on the type, so the type list is re-read too.
    expect(has(invalidated, codeKeys.values('acme', 'p1', 't1'))).toBe(true);
    expect(has(invalidated, codeKeys.types('acme', 'p1'))).toBe(true);

    vi.mocked(apiFetch).mockClear();
    invalidated.length = 0;
    const edit = renderHook(() => useEditCodeValue('acme', 'p1'), { wrapper });
    await act(() =>
      edit.result.current.mutateAsync({
        codeValueId: 'v1',
        codeTypeId: 't1',
        shortCode: 'L1A',
        description: null,
        version: 2,
      }),
    );
    expect(sent().path).toBe(`${P}/code-values/v1`);
    // A rename needs no 2,000-activity refetch: `codes` holds ids. The type id is for the caches only.
    expect(JSON.parse(sent().init.body as string)).toEqual({
      shortCode: 'L1A',
      description: null,
      version: 2,
    });
    expect(invalidated.some((k) => k.includes('activities'))).toBe(false);
    expect(has(invalidated, codeKeys.namesAll('acme', 'p1'))).toBe(true);

    vi.mocked(apiFetch).mockClear();
    const reorder = renderHook(() => useReorderCodeValues('acme', 'p1'), { wrapper });
    await act(() =>
      reorder.result.current.mutateAsync({ codeTypeId: 't1', order: [{ id: 'v1', version: 1 }] }),
    );
    expect(sent().path).toBe(`${P}/code-types/t1/values/order`);
    expect(JSON.parse(sent().init.body as string)).toEqual({ order: [{ id: 'v1', version: 1 }] });
  });

  it.each([
    [
      'delete a type',
      () => useDeleteCodeType('acme', 'p1'),
      { codeTypeId: 't1', version: 2 },
      'DELETE',
      `${P}/code-types/t1?version=2`,
    ],
    [
      'restore a type',
      () => useRestoreCodeType('acme', 'p1'),
      { codeTypeId: 't1' },
      'POST',
      `${P}/code-types/t1/restore`,
    ],
    [
      'delete a value',
      () => useDeleteCodeValue('acme', 'p1'),
      { codeValueId: 'v1', codeTypeId: 't1' },
      'DELETE',
      `${P}/code-values/v1`,
    ],
    [
      'restore a value',
      () => useRestoreCodeValue('acme', 'p1'),
      { codeValueId: 'v1', codeTypeId: 't1' },
      'POST',
      `${P}/code-values/v1/restore`,
    ],
  ] as const)(
    '%s, then re-read the activities, whose codes read differently without any activity being written',
    async (_name, hook, input, method, path) => {
      const { wrapper, invalidated } = setup();
      const { result } = renderHook(hook as never, { wrapper }) as unknown as {
        result: { current: { mutateAsync: (i: unknown) => Promise<unknown> } };
      };
      await act(() => result.current.mutateAsync(input));
      expect(sent().path).toBe(path);
      expect(sent().init.method).toBe(method);
      expect(has(invalidated, activityKeys.listByPlan('acme', 'p1'))).toBe(true);
      expect(has(invalidated, activityKeys.details('acme'))).toBe(true);
      expect(has(invalidated, codeKeys.namesAll('acme', 'p1'))).toBe(true);
    },
  );

  it('settle a create type only after the list has been re-read, so the dialog can select it', async () => {
    const { qc, wrapper } = setup();
    let finish: () => void = () => undefined;
    vi.mocked(qc.invalidateQueries).mockImplementation(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    const { result } = renderHook(() => useCreateCodeType('acme', 'p1'), { wrapper });
    let resolved = false;
    void act(async () => {
      await result.current.mutateAsync({ name: 'Area' });
      resolved = true;
    });
    await waitFor(() => expect(qc.invalidateQueries).toHaveBeenCalled());
    expect(resolved).toBe(false);
    finish();
    await waitFor(() => expect(resolved).toBe(true));
  });
});
