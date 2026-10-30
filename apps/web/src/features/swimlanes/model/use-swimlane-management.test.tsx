import type { SwimlaneSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSwimlaneActions } from './use-swimlane-actions';
import { useSwimlaneManagement } from './use-swimlane-management';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { gutterWidthForRoom } from '@/features/tsld/render/swimlane-gutter';
import type { Command } from '@/features/undo-redo';
import { apiFetch, apiFetchAllPages } from '@/lib/api/client';
import { swimlaneKeys } from '@/lib/query/hierarchy-keys';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: vi.fn(),
  apiFetchAllPages: vi.fn(),
}));

const row = (id: string, name: string, version = 1): SwimlaneSummary => ({
  id,
  planId: 'p1',
  name,
  position: 0,
  version,
  createdAt: '',
  updatedAt: '',
});

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(AnnouncerProvider, null, children),
    );
  return { queryClient, wrapper };
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(apiFetch).mockReset();
  vi.mocked(apiFetchAllPages)
    .mockReset()
    .mockResolvedValue([row('a', 'A'), row('b', 'B')]);
});

describe('useSwimlaneActions', () => {
  it('creates in order and records ONE undo step for the lot', async () => {
    let n = 0;
    vi.mocked(apiFetch).mockImplementation(() =>
      Promise.resolve(row(`s${String(n++)}`, `N${String(n)}`)),
    );
    const record = vi.fn<(c: Command) => void>();
    const { wrapper } = setup();
    const { result } = renderHook(() => useSwimlaneActions('acme', 'p1', record), { wrapper });
    await act(() => result.current.add(['Civil', 'Mechanical']));
    expect(
      vi.mocked(apiFetch).mock.calls.map(([, init]) => JSON.parse(init!.body as string).name),
    ).toEqual(['Civil', 'Mechanical']);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0]![0].label).toBe('Add 2 swimlanes');
  });

  it('records what was created even when a later create is refused, so Undo takes back exactly that', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(row('s0', 'Civil'))
      .mockRejectedValueOnce(new Error('A swimlane with that name exists.'));
    const record = vi.fn<(c: Command) => void>();
    const { wrapper } = setup();
    const { result } = renderHook(() => useSwimlaneActions('acme', 'p1', record), { wrapper });
    await act(async () => {
      await expect(result.current.add(['Civil', 'Civil'])).rejects.toThrow(/exists/);
    });
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0]![0].label).toBe('Add swimlane “Civil”');
  });

  it('records nothing when nothing was written', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('No.'));
    const record = vi.fn<(c: Command) => void>();
    const { wrapper } = setup();
    const { result } = renderHook(() => useSwimlaneActions('acme', 'p1', record), { wrapper });
    await act(async () => {
      await expect(result.current.rename(row('s0', 'Civil'), 'Civils')).rejects.toThrow('No.');
    });
    expect(record).not.toHaveBeenCalled();
  });

  it('does not let a fault in the history break a write that already landed', async () => {
    vi.mocked(apiFetch).mockResolvedValue(row('s0', 'Civils', 2));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { wrapper } = setup();
    const { result } = renderHook(
      () =>
        useSwimlaneActions('acme', 'p1', () => {
          throw new Error('history broke');
        }),
      { wrapper },
    );
    await act(async () => {
      await expect(result.current.rename(row('s0', 'Civil'), 'Civils')).resolves.toMatchObject({
        name: 'Civils',
      });
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('records a move, a delete and a rename, each as one step', async () => {
    const list = [row('a', 'A'), row('b', 'B')];
    vi.mocked(apiFetch)
      .mockResolvedValueOnce([list[1], list[0]]) // reorder
      .mockResolvedValueOnce(undefined) // delete
      .mockResolvedValueOnce(row('a', 'A2', 2)); // rename
    const record = vi.fn<(c: Command) => void>();
    const { wrapper } = setup();
    const { result } = renderHook(() => useSwimlaneActions('acme', 'p1', record), { wrapper });
    await act(async () => {
      expect(await result.current.move(list, 'b', -1)).toBe(true);
      await result.current.remove(list[0]!);
      await result.current.rename(list[0]!, 'A2');
    });
    expect(record.mock.calls.map(([c]) => c.label)).toEqual([
      'Move swimlane “B”',
      'Delete swimlane “A”',
      'Rename swimlane “A”',
    ]);
  });

  it('records a change of source as one step, and writes the plan record and nothing else', async () => {
    vi.mocked(apiFetch).mockClear();
    vi.mocked(apiFetch).mockResolvedValueOnce({ id: 'p1', version: 5 });
    const record = vi.fn<(c: Command) => void>();
    const { wrapper } = setup();
    const { result } = renderHook(() => useSwimlaneActions('acme', 'p1', record), { wrapper });
    await act(async () => {
      await result.current.switchSource(
        {
          id: 'p1',
          version: 4,
          swimlaneSource: 'MANUAL',
          swimlaneWbsLevel: null,
          swimlaneCodeTypeId: null,
        },
        { source: 'WBS', level: 2, codeTypeId: null },
      );
    });
    // One request, to the plan: no lane row, no swimlane and no activity is written, which is what
    // lets switching back return the old picture untouched.
    expect(vi.mocked(apiFetch).mock.calls).toEqual([
      [
        '/organizations/acme/plans/p1',
        {
          method: 'PATCH',
          body: JSON.stringify({ swimlaneSource: 'WBS', swimlaneWbsLevel: 2, version: 4 }),
        },
      ],
    ]);
    expect(record).toHaveBeenCalledTimes(1);
    expect(record.mock.calls[0]![0].label).toBe('Make swimlanes one per WBS group at level 2');
  });

  it('records no step for a change of source that was refused', async () => {
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('Version conflict.'));
    const record = vi.fn<(c: Command) => void>();
    const { wrapper } = setup();
    const { result } = renderHook(() => useSwimlaneActions('acme', 'p1', record), { wrapper });
    await act(async () => {
      await expect(
        result.current.switchSource(
          {
            id: 'p1',
            version: 4,
            swimlaneSource: 'WBS',
            swimlaneWbsLevel: 1,
            swimlaneCodeTypeId: null,
          },
          { source: 'MANUAL', level: null, codeTypeId: null },
        ),
      ).rejects.toThrow('Version conflict.');
    });
    expect(record).not.toHaveBeenCalled();
  });

  it('answers false, writing nothing, for a move off either end', async () => {
    const record = vi.fn<(c: Command) => void>();
    const { wrapper } = setup();
    const { result } = renderHook(() => useSwimlaneActions('acme', 'p1', record), { wrapper });
    await act(async () => {
      expect(await result.current.move([row('a', 'A')], 'a', -1)).toBe(false);
    });
    expect(apiFetch).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('returns the same object across renders with equal inputs', () => {
    const record = vi.fn();
    const { wrapper } = setup();
    const { result, rerender } = renderHook(() => useSwimlaneActions('acme', 'p1', record), {
      wrapper,
    });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

describe('useSwimlaneManagement', () => {
  const args: Parameters<typeof useSwimlaneManagement>[0] = {
    orgSlug: 'acme',
    planId: 'p1',
    plan: {
      id: 'p1',
      version: 4,
      swimlaneSource: 'MANUAL',
      swimlaneWbsLevel: null,
      swimlaneCodeTypeId: null,
    },
    shown: true,
    activities: [],
    gate: { writable: true, reason: null },
  };

  function mount(over: Partial<typeof args> = {}) {
    const { queryClient, wrapper } = setup();
    queryClient.setQueryData(swimlaneKeys.byPlan('acme', 'p1'), [row('a', 'A'), row('b', 'B')]);
    return renderHook((p: typeof args) => useSwimlaneManagement(p), {
      wrapper,
      initialProps: { ...args, ...over },
    });
  }

  it('reserves no width while swimlanes are not shown: the gutter is unmounted at 0', () => {
    expect(mount({ shown: false }).result.current.gutterWidthPx).toBe(0);
  });

  it('reserves the expanded width when shown, and the collapsed strip once the planner collapses it', () => {
    const { result } = mount();
    expect(result.current.gutterWidthPx).toBe(
      gutterWidthForRoom({ collapsed: false, room: true }).widthPx,
    );
    act(() => result.current.gutterActions.collapse.onToggle());
    expect(result.current.gutterWidthPx).toBe(
      gutterWidthForRoom({ collapsed: true, room: true }).widthPx,
    );
    expect(result.current.gutterActions.collapse.collapsed).toBe(true);
    // A device preference, kept on the device.
    expect(JSON.parse(localStorage.getItem('schedulepoint-swimlane-gutter')!)).toEqual({
      collapsed: true,
    });
  });

  it('is forced collapsed, and says so, when the canvas reports no room', async () => {
    const { result } = mount();
    act(() => result.current.onGutterRoomChange(false));
    expect(result.current.gutterActions.collapse).toMatchObject({
      collapsed: true,
      forcedByRoom: true,
    });
    expect(result.current.gutterWidthPx).toBe(
      gutterWidthForRoom({ collapsed: false, room: false }).widthPx,
    );
    await waitFor(() =>
      expect(screen.getByTestId('announcer')).toHaveTextContent(
        'Swimlane names collapsed: there is not enough room to show them.',
      ),
    );
    act(() => result.current.onGutterRoomChange(true));
    await waitFor(() =>
      expect(screen.getByTestId('announcer')).toHaveTextContent('Swimlane names expanded.'),
    );
  });

  it('does not announce a collapse the planner chose for themselves', async () => {
    const { result } = mount();
    act(() => result.current.gutterActions.collapse.onToggle());
    act(() => result.current.onGutterRoomChange(false));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.getByTestId('announcer')).toBeEmptyDOMElement();
  });

  it('opens Set up for a plan with none and Manage once it has some, with the matching label', () => {
    const none = mount({
      plan: {
        id: 'p1',
        version: 4,
        swimlaneSource: 'NONE',
        swimlaneWbsLevel: null,
        swimlaneCodeTypeId: null,
      },
    });
    expect(none.result.current.manageLabel).toBe('Set up swimlanes…');
    act(() => none.result.current.openSwimlanes());
    expect(none.result.current.dialogs.state).toMatchObject({ setup: true, manage: false });

    const some = mount();
    expect(some.result.current.manageLabel).toBe('Swimlanes…');
    act(() => some.result.current.openSwimlanes());
    expect(some.result.current.dialogs.state).toMatchObject({ setup: false, manage: true });
  });

  it('opens the rename and delete dialogs for the swimlane a gutter menu named', () => {
    const { result } = mount();
    act(() => result.current.gutterActions.onRename('a'));
    act(() => result.current.gutterActions.onDelete('b'));
    expect(result.current.dialogs.state).toMatchObject({ renameId: 'a', deleteId: 'b' });
    act(() => result.current.dialogs.close('renameId'));
    expect(result.current.dialogs.state.renameId).toBeNull();
  });

  it('returns focus to what held it when the dialog was requested, not where it has moved since', () => {
    document.body.insertAdjacentHTML(
      'beforeend',
      '<button id="opener">Opener</button><button id="other">Other</button>',
    );
    const { result } = mount();
    document.getElementById('opener')!.focus();
    act(() => result.current.openSwimlanes());
    // The lazy chunk resolves after focus has moved on.
    document.getElementById('other')!.focus();
    act(() => result.current.dialogs.close('manage'));
    expect(document.activeElement).toBe(document.getElementById('opener'));
    document.body.innerHTML = '';
  });

  it('moves a swimlane from the gutter through the reorder write', async () => {
    vi.mocked(apiFetch).mockResolvedValue([row('b', 'B'), row('a', 'A')]);
    const { result } = mount();
    // The dialogs are what open the list query; a move from the gutter reads the cache the scene holds.
    act(() => result.current.openSwimlanes());
    await waitFor(() => expect(result.current.dialogs.swimlanes).toHaveLength(2));
    // A block body: an arrow returning the promise would make `act` wait on it as an async act.
    act(() => {
      void result.current.gutterActions.onMove('b', -1);
    });
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/p1/swimlanes/order');
    expect(JSON.parse(init!.body as string)).toEqual({
      order: [
        { id: 'b', version: 1 },
        { id: 'a', version: 1 },
      ],
    });
  });

  it('says Set up for a hand-made plan with no swimlanes left (undoing a setup leaves MANUAL)', () => {
    const { result } = mount({ swimlaneCount: 0 });
    expect(result.current.manageLabel).toBe('Set up swimlanes…');
    act(() => result.current.openSwimlanes());
    expect(result.current.dialogs.state.setup).toBe(true);
  });

  it('lets only one gutter move run at a time, and says why a refused one failed in plain words', async () => {
    let finish: (v: unknown) => void = () => undefined;
    vi.mocked(apiFetch).mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const { result } = mount();
    act(() => result.current.openSwimlanes());
    await waitFor(() => expect(result.current.dialogs.swimlanes).toHaveLength(2));
    let first!: Promise<boolean>;
    let second!: Promise<boolean>;
    act(() => {
      first = result.current.gutterActions.onMove('b', -1);
      second = result.current.gutterActions.onMove('b', -1);
    });
    expect(await second).toBe(false);
    expect(apiFetch).toHaveBeenCalledTimes(1);
    finish([row('b', 'B'), row('a', 'A')]);
    expect(await first).toBe(true);

    vi.mocked(apiFetch).mockRejectedValueOnce(new Error('Version conflict.'));
    let third!: Promise<boolean>;
    act(() => {
      third = result.current.gutterActions.onMove('a', 1);
    });
    expect(await third).toBe(false);
    await waitFor(() =>
      expect(screen.getByTestId('announcer')).toHaveTextContent(
        'Could not move A: Version conflict.',
      ),
    );
  });

  describe('focus after a delete (the dialog would hand it to the label that has just gone)', () => {
    function surface(): void {
      document.body.insertAdjacentHTML(
        'beforeend',
        `<div data-testid="tsld-swimlane-gutter-labels" tabindex="-1">
           <button data-swimlane="b">B</button><button data-swimlane="none">none</button>
         </div>`,
      );
    }

    it('moves it to the neighbouring label once the dialog has closed and the row has left', async () => {
      surface();
      const rafs: FrameRequestCallback[] = [];
      const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        rafs.push(cb);
        return rafs.length;
      });
      const { queryClient, wrapper } = setup();
      queryClient.setQueryData(swimlaneKeys.byPlan('acme', 'p1'), [row('a', 'A'), row('b', 'B')]);
      const { result } = renderHook(() => useSwimlaneManagement(args), { wrapper });
      act(() => result.current.gutterActions.onDelete('a'));
      // Let the list the open dialog asked for settle before the deletion lands.
      await act(async () => {});
      // The confirmation succeeds: told first, then it closes.
      act(() => result.current.dialogs.afterDelete(row('a', 'A')));
      // Still listed, so nothing yet.
      act(() => result.current.dialogs.close('deleteId'));
      expect(rafs).toHaveLength(0);
      // The refetch lands without it.
      act(() => {
        queryClient.setQueryData(swimlaneKeys.byPlan('acme', 'p1'), [row('b', 'B')]);
      });
      await waitFor(() => expect(result.current.dialogs.swimlanes).toHaveLength(1));
      expect(rafs).toHaveLength(1);
      act(() => rafs[0]!(0));
      expect(document.activeElement).toHaveAttribute('data-swimlane', 'b');
      raf.mockRestore();
      document.body.innerHTML = '';
    });

    it('does nothing for a delete that was cancelled', () => {
      const raf = vi.spyOn(window, 'requestAnimationFrame');
      const { result } = mount();
      act(() => result.current.gutterActions.onDelete('a'));
      act(() => result.current.dialogs.close('deleteId'));
      expect(raf).not.toHaveBeenCalled();
      raf.mockRestore();
    });
  });

  describe('a plan whose swimlanes follow the WBS', () => {
    const wbs = {
      id: 'p1',
      version: 4,
      swimlaneSource: 'WBS',
      swimlaneWbsLevel: 2,
      swimlaneCodeTypeId: null,
    } as const;

    it('shades the gutter’s rows with the WBS reason, since a swimlane is a summary', () => {
      const { result } = mount({ plan: wbs });
      expect(result.current.gutterActions.rows).toEqual({
        writable: false,
        reason: expect.stringMatching(/^Swimlanes follow the WBS in this plan\./),
      });
    });

    it('never shades the corner’s Swimlanes… command with the WBS reason: it is the way out', () => {
      const { result } = mount({ plan: wbs });
      // The pen is held, so the command is open and says nothing about the WBS.
      expect(result.current.gutterActions.write).toEqual({ writable: true, reason: null });
    });

    it('leads with the pen’s own reason when the pen is why, because that one can be fixed', () => {
      const { result } = mount({
        plan: wbs,
        gate: { writable: false, reason: 'Start editing to change swimlanes.' },
      });
      expect(result.current.gutterActions.write.reason).toBe('Start editing to change swimlanes.');
      expect(result.current.gutterActions.rows?.reason).toBe('Start editing to change swimlanes.');
    });

    it('opens Manage, not Set up: the plan is set up, and Manage is where the source is changed', () => {
      const { result } = mount({ plan: wbs });
      expect(result.current.manageLabel).toBe('Swimlanes…');
      act(() => result.current.openSwimlanes());
      expect(result.current.dialogs.state).toMatchObject({ setup: false, manage: true });
      expect(result.current.dialogs.plan).toEqual(wbs);
    });
  });

  describe('a plan whose swimlanes follow a code', () => {
    const code = {
      id: 'p1',
      version: 4,
      swimlaneSource: 'ACTIVITY_CODE',
      swimlaneWbsLevel: null,
      swimlaneCodeTypeId: 'area',
    } as const;

    it('shades the gutter’s rows with the code reason, naming the code once its name has arrived', async () => {
      vi.mocked(apiFetchAllPages).mockResolvedValue([
        { id: 'area', planId: 'p1', name: 'Area', position: 0, version: 1 },
      ]);
      const { result } = mount({ plan: code });
      await waitFor(() =>
        expect(result.current.gutterActions.rows).toEqual({
          writable: false,
          reason:
            'Swimlanes follow Area in this plan. Rename or reorder its values in Codes…, or choose Swimlanes… to make them another way.',
        }),
      );
    });

    it('never shades the corner’s Swimlanes… command, and opens Manage', () => {
      const { result } = mount({ plan: code });
      expect(result.current.gutterActions.write).toEqual({ writable: true, reason: null });
      expect(result.current.manageLabel).toBe('Swimlanes…');
      expect(result.current.dialogs.plan).toEqual(code);
    });

    it('leads with the pen’s own reason when the pen is why', () => {
      const { result } = mount({
        plan: code,
        gate: { writable: false, reason: 'Start editing to change swimlanes.' },
      });
      expect(result.current.gutterActions.rows?.reason).toBe('Start editing to change swimlanes.');
    });
  });

  describe('identity: the canvas rewrites every label when the gutter model changes', () => {
    it('hands back the same actions and dialogs for a re-render with equal inputs', () => {
      const { result, rerender } = mount();
      const { gutterActions, dialogs } = result.current;
      rerender({ ...args, gate: { writable: true, reason: null } });
      expect(result.current.gutterActions).toBe(gutterActions);
      expect(result.current.dialogs).toBe(dialogs);
    });

    it('changes the actions when what they carry changes: the pen, or the collapse', () => {
      const { result, rerender } = mount();
      const before = result.current.gutterActions;
      rerender({
        ...args,
        gate: { writable: false, reason: 'Start editing to change swimlanes.' },
      });
      expect(result.current.gutterActions).not.toBe(before);
      expect(result.current.gutterActions.write).toEqual({
        writable: false,
        reason: 'Start editing to change swimlanes.',
      });
    });
  });
});
