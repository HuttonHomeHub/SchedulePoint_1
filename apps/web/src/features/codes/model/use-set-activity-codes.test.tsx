import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { planCodeAssignment } from './code-assignment-plan';
import {
  CodeSwimlaneLanePlannerProvider,
  type CodeSwimlaneLanePlanner,
} from './code-swimlane-lanes';
import { useSetActivityCodes } from './use-set-activity-codes';

import { ApiFetchError, apiFetch } from '@/lib/api/client';
import { planKeys } from '@/lib/query/hierarchy-keys';
import { anActivity } from '@/test/activity-fixture';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: vi.fn(),
}));

const PLAN = planCodeAssignment(
  [anActivity({ id: 'a1', name: 'Piling', version: 3, codes: [] })],
  new Map([['area', 'rf']]),
);
const REQUEST = { plan: PLAN, typeNames: ['Area'], valueNames: new Map<string, string>() };
const LANES = { lanesCodeTypeId: 'area', lanes: [{ id: 'a1', version: 3, laneIndex: 2 }] };

function mount(planner: CodeSwimlaneLanePlanner | null, record = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(CodeSwimlaneLanePlannerProvider, { value: planner }, children),
    );
  const hook = renderHook(() => useSetActivityCodes('acme', 'p1', record), { wrapper });
  return { ...hook, record, queryClient };
}

const bodyOf = (): Record<string, unknown> =>
  JSON.parse(vi.mocked(apiFetch).mock.calls[0]![1]!.body as string) as Record<string, unknown>;

beforeEach(() => {
  vi.mocked(apiFetch).mockReset().mockResolvedValue([]);
});

describe('useSetActivityCodes', () => {
  it('asks the workspace’s planner for the lanes when the caller names none', async () => {
    const planner = vi.fn<CodeSwimlaneLanePlanner>(() => LANES);
    const { result } = mount(planner);
    await result.current(REQUEST);
    expect(planner).toHaveBeenCalledWith(PLAN);
    expect(bodyOf()).toEqual({ activities: PLAN.rows, ...LANES });
  });

  it('sends the lanes the caller planned, and none when it says none', async () => {
    const planner = vi.fn<CodeSwimlaneLanePlanner>(() => LANES);
    const { result } = mount(planner);
    await result.current({ ...REQUEST, lanes: null });
    expect(bodyOf()).toEqual({ activities: PLAN.rows });
    expect(planner).not.toHaveBeenCalled();
  });

  it('writes codes alone with no provider, exactly as before swimlanes could come from a code', async () => {
    const { result } = mount(null);
    await result.current(REQUEST);
    expect(bodyOf()).toEqual({ activities: PLAN.rows });
  });

  it('gives the undo step a label of the caller’s choosing, and the planner to replay with', async () => {
    const planner = vi.fn<CodeSwimlaneLanePlanner>(() => LANES);
    const { result, record } = mount(planner);
    await result.current({ ...REQUEST, label: 'Move “Piling” to Roof' });
    const command = record.mock.calls[0]![0] as { label: string };
    expect(command.label).toBe('Move “Piling” to Roof');
    await result.current(REQUEST);
    expect((record.mock.calls[1]![0] as { label: string }).label).toBe('Set Area on “Piling”');
  });

  it('refreshes the plan when the server says the swimlane source changed, and still rejects', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(409, {
        code: 'CONFLICT',
        message: 'The swimlanes changed.',
        details: { reason: 'SWIMLANE_SOURCE_CHANGED' },
      }),
    );
    const { result, queryClient, record } = mount(() => LANES);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    await expect(result.current(REQUEST)).rejects.toBeInstanceOf(ApiFetchError);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: planKeys.detail('acme', 'p1') });
    expect(record).not.toHaveBeenCalled();
  });
});
