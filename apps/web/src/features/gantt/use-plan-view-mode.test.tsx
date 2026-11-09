import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const navigate = vi.fn();
let search: Record<string, unknown> = {};

vi.mock('@tanstack/react-router', () => ({
  useSearch: () => search,
  useNavigate: () => navigate,
}));

// Imported after the mocks.
import { usePlanViewMode } from './use-plan-view-mode';

beforeEach(() => {
  navigate.mockClear();
  search = {};
});

describe('usePlanViewMode', () => {
  it('reads ?view=gantt as the Gantt', () => {
    search = { view: 'gantt' };
    const { result } = renderHook(() => usePlanViewMode());
    expect(result.current[0]).toBe('gantt');
  });

  it('resolves an absent view to the diagram', () => {
    const { result } = renderHook(() => usePlanViewMode());
    expect(result.current[0]).toBe('tsld');
  });

  it('degrades an unrecognised view to the diagram rather than crashing', () => {
    search = { view: 'kanban' };
    const { result } = renderHook(() => usePlanViewMode());
    expect(result.current[0]).toBe('tsld');
  });

  it('navigates when asked to switch, and omits the default from the URL', () => {
    search = { view: 'gantt' };
    const { result } = renderHook(() => usePlanViewMode());
    result.current[1]('tsld');
    expect(navigate).toHaveBeenCalledTimes(1);
    const arg = navigate.mock.calls[0]?.[0] as {
      search: (prev: Record<string, string | undefined>) => Record<string, string | undefined>;
    };
    expect(arg.search({ view: 'gantt', other: 'x' })).toEqual({ other: 'x' });
  });
});
