import type { CodeTypeSummary, CodeValueSummary } from '@repo/types';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCodesActions } from './use-codes-actions';

const mocks = vi.hoisted(() => {
  const fns = {
    createType: vi.fn(),
    renameType: vi.fn(),
    reorderTypes: vi.fn(),
    deleteType: vi.fn(),
    restoreType: vi.fn(),
    createValue: vi.fn(),
    editValue: vi.fn(),
    reorderValues: vi.fn(),
    deleteValue: vi.fn(),
    restoreValue: vi.fn(),
  };
  return fns;
});

vi.mock('../api/use-code-mutations', () => ({
  useCreateCodeType: () => ({ mutateAsync: mocks.createType }),
  useRenameCodeType: () => ({ mutateAsync: mocks.renameType }),
  useReorderCodeTypes: () => ({ mutateAsync: mocks.reorderTypes }),
  useDeleteCodeType: () => ({ mutateAsync: mocks.deleteType }),
  useRestoreCodeType: () => ({ mutateAsync: mocks.restoreType }),
  useCreateCodeValue: () => ({ mutateAsync: mocks.createValue }),
  useEditCodeValue: () => ({ mutateAsync: mocks.editValue }),
  useReorderCodeValues: () => ({ mutateAsync: mocks.reorderValues }),
  useDeleteCodeValue: () => ({ mutateAsync: mocks.deleteValue }),
  useRestoreCodeValue: () => ({ mutateAsync: mocks.restoreValue }),
}));

const type = (id: string, name: string, version = 1): CodeTypeSummary => ({
  id,
  planId: 'p1',
  name,
  position: 0,
  version,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
});
const value = (id: string, shortCode: string, version = 1): CodeValueSummary => ({
  id,
  codeTypeId: 'area',
  shortCode,
  description: null,
  position: 0,
  version,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
});

describe('useCodesActions', () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset().mockResolvedValue(undefined);
  });

  it('records one labelled undo step after each write has landed', async () => {
    const record = vi.fn();
    mocks.createType.mockResolvedValue(type('t1', 'Area'));
    mocks.createValue.mockResolvedValue(value('v1', 'L1'));
    const { result } = renderHook(() => useCodesActions('acme', 'p1', record));

    await result.current.addType('Area');
    await result.current.addValue(type('t1', 'Area'), { shortCode: ' L1 ', description: '  ' });

    expect(record.mock.calls.map(([command]) => (command as { label: string }).label)).toEqual([
      'Add code type “Area”',
      'Add value “L1” to Area',
    ]);
    // A blank description is not sent; the short code is trimmed.
    expect(mocks.createValue).toHaveBeenCalledWith({ codeTypeId: 't1', shortCode: 'L1' });
  });

  it('records nothing when the write is refused, and lets the refusal through', async () => {
    const record = vi.fn();
    mocks.createType.mockRejectedValue(new Error('refused'));
    const { result } = renderHook(() => useCodesActions('acme', 'p1', record));
    await expect(result.current.addType('Area')).rejects.toThrow('refused');
    expect(record).not.toHaveBeenCalled();
  });

  it('never fails a write that has succeeded because its undo step could not be recorded', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.createType.mockResolvedValue(type('t1', 'Area'));
    const { result } = renderHook(() =>
      useCodesActions('acme', 'p1', () => {
        throw new Error('history is broken');
      }),
    );
    await expect(result.current.addType('Area')).resolves.toMatchObject({ id: 't1' });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('sends every live value with its current version on a reorder, and nothing at an end', async () => {
    const record = vi.fn();
    const list = [value('a', 'A', 3), value('b', 'B', 5), value('c', 'C', 2)];
    mocks.reorderValues.mockResolvedValue([list[1], list[0], list[2]]);
    const { result } = renderHook(() => useCodesActions('acme', 'p1', record));

    expect(await result.current.moveValue(list, 'area', 'a', -1)).toBe(false);
    expect(mocks.reorderValues).not.toHaveBeenCalled();

    expect(await result.current.moveValue(list, 'area', 'a', 1)).toBe(true);
    expect(mocks.reorderValues).toHaveBeenCalledWith({
      codeTypeId: 'area',
      order: [
        { id: 'b', version: 5 },
        { id: 'a', version: 3 },
        { id: 'c', version: 2 },
      ],
    });
    expect((record.mock.calls[0]?.[0] as { label: string }).label).toBe('Move value “A”');
  });

  it('clears a description with null on an edit, and sends the version the row was read at', async () => {
    mocks.editValue.mockResolvedValue(value('v1', 'L1', 2));
    const { result } = renderHook(() => useCodesActions('acme', 'p1'));
    await result.current.editValue(value('v1', 'L1', 4), { shortCode: ' L1 ', description: ' ' });
    expect(mocks.editValue).toHaveBeenCalledWith({
      codeValueId: 'v1',
      codeTypeId: 'area',
      shortCode: 'L1',
      description: null,
      version: 4,
    });
  });

  it('records a restore from the Deleted list as a Restore step, with the type’s name', async () => {
    const record = vi.fn();
    mocks.restoreValue.mockResolvedValue(value('v1', 'L1'));
    mocks.restoreType.mockResolvedValue(type('t1', 'Area'));
    const { result } = renderHook(() => useCodesActions('acme', 'p1', record));
    await result.current.restoreValue(type('area', 'Area'), value('v1', 'L1'));
    await result.current.restoreType(type('t1', 'Area'));
    expect(record.mock.calls.map(([command]) => (command as { label: string }).label)).toEqual([
      'Restore value “L1” of Area',
      'Restore code type “Area”',
    ]);
  });

  it('keeps one stable object across renders, so a memoised pane is not rebuilt', () => {
    const { result, rerender } = renderHook(() => useCodesActions('acme', 'p1'));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
