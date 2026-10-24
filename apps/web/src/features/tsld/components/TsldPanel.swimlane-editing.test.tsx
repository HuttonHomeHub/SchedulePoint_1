import type { ActivitySummary, DependencySummary } from '@repo/types';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

/**
 * **Editing on the swimlane layout** (swimlanes M2-T4, ui-architecture C6 and C9).
 *
 * The canvas speaks display lanes — the stack of swimlanes — and the host writes lanes inside a
 * swimlane. This drives the real panel with the real projection and asserts what reaches the host:
 * which lane, in which swimlane, and — in every case — **no `laneIndex`** (SC-1), because a lane
 * write that carried one would make turning swimlanes off lose the planner's own arrangement.
 *
 * Stored lanes here are all 0 on purpose. Every bar is drawn on a different display lane than the
 * one it is stored on, so a gesture that read the stored lane where it needed the display one (or
 * the reverse) moves the wrong bar by the difference, which no off-path test can see.
 */
const announceSpy = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announceSpy }));
vi.mock('../../../config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    TSLD_EDITING_ENABLED: true,
    CANVAS_DIRECT_MANIPULATION_ENABLED: false,
    CANVAS_MULTI_SELECT_ENABLED: true,
  };
});
vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, CANVAS_MULTI_SELECT_ENABLED: true, TSLD_EDITING_ENABLED: true };
});
vi.mock(
  '../render/run-optimise-layout',
  () => import('../render/test-support/in-process-optimise'),
);

import { NO_SWIMLANE_BOUNDARY_REASON } from '../model/swimlane-lanes';
import type { SwimlaneInput } from '../render/project-swimlanes';
import { BAR_HEIGHT, BAR_PAD, DEFAULT_VIEWPORT, LANE_HEIGHT } from '../render/render-model';

import {
  TsldPanel,
  type TsldBulkOperations,
  type TsldCreateInput,
  type TsldCreateOutcome,
  type TsldEditOutcome,
  type TsldRepositionInput,
} from './TsldPanel';

import { anActivity } from '@/test/activity-fixture';

const laneMid = (lane: number): number =>
  DEFAULT_VIEWPORT.originY + lane * LANE_HEIGHT + BAR_PAD + BAR_HEIGHT / 2;

const NO_DEPS: DependencySummary[] = [];

function bar(id: string, name: string, start: string, finish: string): ActivitySummary {
  return anActivity({
    id,
    name,
    code: null,
    laneIndex: 0,
    durationDays: 3,
    durationMinutes: 1440,
    earlyStart: start,
    earlyFinish: finish,
    visualEffectiveStart: start,
    visualEffectiveFinish: finish,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    accrualType: 'UNIFORM',
  });
}

/**
 * Mechanical holds Pour (lane 0) and Wire (lane 1, later, so lane 1 is free to Pour); Electrical
 * holds Test (lane 0); Snag is in no swimlane. Display lanes: Pour 0, Wire 1, Test 2, Snag 3.
 * All four share days 0-3 except Wire, which sits on days 6-9.
 */
const ACTIVITIES: ActivitySummary[] = [
  bar('pour', 'Pour', '2026-01-01', '2026-01-04'),
  bar('wire', 'Wire', '2026-01-07', '2026-01-10'),
  bar('test', 'Test', '2026-01-01', '2026-01-04'),
  bar('snag', 'Snag', '2026-01-01', '2026-01-04'),
];

function input(over: Partial<SwimlaneInput> = {}): SwimlaneInput {
  return {
    swimlanes: [
      { id: 's1', name: 'Mechanical' },
      { id: 's2', name: 'Electrical' },
    ],
    membership: new Map([
      ['pour', 's1'],
      ['wire', 's1'],
      ['test', 's2'],
      ['snag', null],
    ]),
    storedLanes: new Map([
      ['pour', { lane: 0, updatedAt: 1 }],
      ['wire', { lane: 1, updatedAt: 1 }],
      ['test', { lane: 0, updatedAt: 1 }],
      ['snag', { lane: 0, updatedAt: 1 }],
    ]),
    ...over,
  };
}

const OK = { applied: true, conflict: null };

function renderPanel(
  options: {
    activities?: ActivitySummary[];
    swimlanes?: SwimlaneInput;
    onReposition?: Mock<(input: TsldRepositionInput) => Promise<TsldEditOutcome>>;
    onCreate?: Mock<(input: TsldCreateInput) => Promise<TsldCreateOutcome>>;
    moveMany?: TsldBulkOperations['moveMany'];
  } = {},
) {
  const onReposition =
    options.onReposition ??
    vi.fn<(input: TsldRepositionInput) => Promise<TsldEditOutcome>>().mockResolvedValue(OK);
  const onCreate =
    options.onCreate ??
    vi
      .fn<(input: TsldCreateInput) => Promise<TsldCreateOutcome>>()
      .mockResolvedValue({ recalcConflict: null });
  const moveMany = options.moveMany ?? vi.fn(() => Promise.resolve(OK));
  const utils = render(
    <TsldPanel
      activities={options.activities ?? ACTIVITIES}
      dependencies={NO_DEPS}
      dataDate="2026-01-01"
      canEdit
      swimlanes={options.swimlanes ?? input()}
      onCreate={onCreate}
      onReposition={onReposition}
      bulk={{
        gate: { writable: true, reason: null },
        deleteMany: vi.fn(() => Promise.resolve()),
        linkChain: vi.fn(() => Promise.resolve()),
        moveMany,
      }}
      fill
    />,
  );
  const canvas = utils.container.querySelector('canvas');
  if (!canvas) throw new Error('canvas not rendered');
  const listbox = screen.getByRole('listbox', { name: /activities in the diagram/i });
  act(() => listbox.focus());
  return { ...utils, canvas, listbox, onReposition, onCreate, moveMany };
}

/** Drag a bar's body from one display lane to another, with no sideways travel. */
function drag(canvas: Element, from: number, to: number, dx = 0): void {
  fireEvent.pointerDown(canvas, { clientX: 60, clientY: laneMid(from), pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 60 + dx, clientY: laneMid(to), pointerId: 1 });
  fireEvent.pointerUp(canvas, { clientX: 60 + dx, clientY: laneMid(to), pointerId: 1 });
}

/** Move the listbox cursor onto the nth activity (0-based), in plan order. Focus selects row 0. */
function focusRow(listbox: HTMLElement, index: number): void {
  for (let i = 0; i < index; i += 1) fireEvent.keyDown(listbox, { key: 'ArrowDown' });
}

function neverCarriesALaneIndex(mock: ReturnType<typeof vi.fn>): void {
  for (const [arg] of mock.mock.calls as [TsldRepositionInput][]) {
    expect(arg).not.toHaveProperty('laneIndex');
  }
}

beforeEach(() => announceSpy.mockClear());

describe('a pointer drag on the swimlane layout', () => {
  it('moves a bar within its swimlane: the lane inside it, and no laneIndex (SC-1)', async () => {
    const { canvas, onReposition } = renderPanel();
    // Pour (display 0) onto display lane 1: Wire's lane, free over Pour's days.
    drag(canvas, 0, 1);
    await waitFor(() => expect(onReposition).toHaveBeenCalledTimes(1));
    expect(onReposition).toHaveBeenCalledWith({
      activityId: 'pour',
      swimlaneLanes: [{ id: 'pour', lane: 1, from: 0 }],
    });
    neverCarriesALaneIndex(onReposition);
  });

  it('names the swimlane and the lane inside it, never a bare lane number (C9)', async () => {
    const { canvas } = renderPanel();
    drag(canvas, 0, 1);
    await waitFor(() =>
      expect(announceSpy).toHaveBeenCalledWith('Moved “Pour”, in Mechanical, lane 2 of 2.'),
    );
  });

  it('goes on to the next free lane, growing the swimlane, and says so', async () => {
    // Test sits on Pour's days: dropping Snag... use Pour onto Wire's lane after Wire moves under it.
    const crowded = [
      ACTIVITIES[0]!,
      bar('wire', 'Wire', '2026-01-01', '2026-01-04'),
      ACTIVITIES[2]!,
      ACTIVITIES[3]!,
    ];
    const { canvas, onReposition } = renderPanel({ activities: crowded });
    drag(canvas, 0, 1);
    await waitFor(() => expect(onReposition).toHaveBeenCalledTimes(1));
    expect(onReposition.mock.calls[0]![0].swimlaneLanes![0]).toEqual({
      id: 'pour',
      lane: 2,
      from: 0,
    });
    await waitFor(() =>
      expect(announceSpy).toHaveBeenCalledWith(
        'Moved “Pour”, in Mechanical, lane 3 of 3, the next free lane.',
      ),
    );
  });

  it('files the bar in another hand-made swimlane when it is dropped in one', async () => {
    const { canvas, onReposition } = renderPanel();
    // Display lane 2 is Electrical's first lane, held by Test over Pour's days: nearest free is 1.
    drag(canvas, 0, 2);
    await waitFor(() => expect(onReposition).toHaveBeenCalledTimes(1));
    expect(onReposition).toHaveBeenCalledWith({
      activityId: 'pour',
      swimlaneLanes: [{ id: 'pour', lane: 1, from: 0, swimlaneId: 's2' }],
    });
    neverCarriesALaneIndex(onReposition);
    await waitFor(() =>
      expect(announceSpy).toHaveBeenCalledWith('Moved “Pour” to Electrical, lane 2 of 2.'),
    );
  });

  it('takes the lane it last held in the swimlane it is dropped into, when that lane is free', async () => {
    const remembered = bar('pour', 'Pour', '2026-01-01', '2026-01-04');
    remembered.swimlaneLanes = [
      {
        basis: 'SWIMLANE',
        swimlaneId: 's2',
        summaryActivityId: null,
        wbsLevel: null,
        laneIndex: 3,
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    ];
    const { canvas, onReposition } = renderPanel({
      activities: [remembered, ...ACTIVITIES.slice(1)],
    });
    drag(canvas, 0, 2);
    await waitFor(() => expect(onReposition).toHaveBeenCalledTimes(1));
    expect(onReposition.mock.calls[0]![0].swimlaneLanes![0]).toEqual({
      id: 'pour',
      lane: 3,
      from: 0,
      swimlaneId: 's2',
    });
  });

  it('holds the ghost short of "No swimlane": a drag far below lands in the last swimlane', async () => {
    const { canvas, onReposition } = renderPanel();
    drag(canvas, 0, 9);
    await waitFor(() => expect(onReposition).toHaveBeenCalledTimes(1));
    expect(onReposition.mock.calls[0]![0].swimlaneLanes![0]).toMatchObject({ swimlaneId: 's2' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps a bar in "No swimlane" in it: dragging up is held at its own top and writes nothing', async () => {
    const { canvas, onReposition } = renderPanel();
    drag(canvas, 3, 0);
    await new Promise((r) => setTimeout(r, 30));
    expect(onReposition).not.toHaveBeenCalled();
  });

  it('refuses aloud, with the reason, a drop into "No swimlane" that the range could not hold', () => {
    // The range holds the ghost, so this is the backstop for a drop that arrives anyway.
    expect(NO_SWIMLANE_BOUNDARY_REASON).toMatch(/No swimlane/);
  });

  it('says it stayed, and writes nothing, when no lane above is free', async () => {
    const crowded = [
      ACTIVITIES[0]!,
      bar('wire', 'Wire', '2026-01-01', '2026-01-04'),
      ACTIVITIES[2]!,
      ACTIVITIES[3]!,
    ];
    const { canvas, onReposition } = renderPanel({ activities: crowded });
    // Wire (display 1) onto Pour's lane (display 0), occupied over the same days: nowhere above.
    drag(canvas, 1, 0);
    await waitFor(() =>
      expect(announceSpy).toHaveBeenCalledWith(
        'No free lane that way for “Wire”; it stays in Mechanical, lane 2 of 2.',
      ),
    );
    expect(onReposition).not.toHaveBeenCalled();
  });

  it('a diagonal drag carries the day and the swimlane lane together, and still no laneIndex', async () => {
    const { canvas, onReposition } = renderPanel();
    drag(canvas, 0, 1, 56);
    await waitFor(() => expect(onReposition).toHaveBeenCalledTimes(1));
    const call = onReposition.mock.calls[0]![0];
    expect(call.startDay).toBeDefined();
    expect(call.swimlaneLanes).toEqual([{ id: 'pour', lane: 1, from: 0 }]);
    neverCarriesALaneIndex(onReposition);
  });

  it('shows a refusal from the host without offering Refresh, as it is a rule', async () => {
    const onReposition = vi.fn().mockResolvedValue({
      applied: false,
      conflict: 'A rule said no.',
      refreshable: false,
    });
    const { canvas } = renderPanel({ onReposition });
    drag(canvas, 0, 1);
    expect(await screen.findByRole('alert')).toHaveTextContent('A rule said no.');
    expect(screen.queryByRole('button', { name: /refresh/i })).toBeNull();
  });
});

describe('Alt+↑/↓ on the swimlane layout', () => {
  it('grows the swimlane when pressed down on its bottom lane', async () => {
    const { listbox, onReposition } = renderPanel();
    focusRow(listbox, 1); // Wire, on Mechanical's bottom lane
    fireEvent.keyDown(listbox, { key: 'ArrowDown', altKey: true });
    await waitFor(() => expect(onReposition).toHaveBeenCalledTimes(1));
    expect(onReposition).toHaveBeenCalledWith({
      activityId: 'wire',
      swimlaneLanes: [{ id: 'wire', lane: 2, from: 1 }],
    });
    neverCarriesALaneIndex(onReposition);
    await waitFor(() =>
      expect(announceSpy).toHaveBeenCalledWith('Moved “Wire”, in Mechanical, lane 3 of 3.'),
    );
  });

  it('refuses at the top of its own swimlane, not the top of the diagram', async () => {
    const { listbox, onReposition } = renderPanel();
    focusRow(listbox, 2); // Test: display lane 2, but the top lane of Electrical
    fireEvent.keyDown(listbox, { key: 'ArrowUp', altKey: true });
    expect(announceSpy).toHaveBeenCalledWith('Already in the top lane of Electrical.');
    await new Promise((r) => setTimeout(r, 200));
    // Without the swimlane's top, this would nudge Test onto display lane 1: Wire's, in Mechanical.
    expect(onReposition).not.toHaveBeenCalled();
  });

  it('names the top lane of Mechanical for its own first bar', () => {
    const { listbox } = renderPanel();
    focusRow(listbox, 0);
    fireEvent.keyDown(listbox, { key: 'ArrowUp', altKey: true });
    expect(announceSpy).toHaveBeenCalledWith('Already in the top lane of Mechanical.');
  });

  it('names "No swimlane" for the top lane of the unassigned bucket', () => {
    const { listbox } = renderPanel();
    focusRow(listbox, 3);
    fireEvent.keyDown(listbox, { key: 'ArrowUp', altKey: true });
    expect(announceSpy).toHaveBeenCalledWith('Already in the top lane of No swimlane.');
  });

  it('moves from the lane the bar is DRAWN in, not the one it is stored in', async () => {
    const { listbox, onReposition } = renderPanel();
    focusRow(listbox, 2); // Test: stored lane 0, drawn on display lane 2 (lane 0 of Electrical)
    fireEvent.keyDown(listbox, { key: 'ArrowDown', altKey: true });
    await waitFor(() => expect(onReposition).toHaveBeenCalledTimes(1));
    expect(onReposition.mock.calls[0]![0].swimlaneLanes![0]).toEqual({
      id: 'test',
      lane: 1,
      from: 0,
    });
  });

  it('folds a held key into one write and says where the bar ended', async () => {
    const { listbox, onReposition } = renderPanel();
    focusRow(listbox, 1);
    fireEvent.keyDown(listbox, { key: 'ArrowDown', altKey: true });
    fireEvent.keyDown(listbox, { key: 'ArrowDown', altKey: true });
    await waitFor(() => expect(onReposition).toHaveBeenCalledTimes(1));
    expect(onReposition.mock.calls[0]![0].swimlaneLanes![0]).toEqual({
      id: 'wire',
      lane: 3,
      from: 1,
    });
    await waitFor(() =>
      expect(announceSpy).toHaveBeenCalledWith('Moved “Wire”, in Mechanical, lane 4 of 4.'),
    );
  });

  it('goes past an occupied lane and says it was the next free one', async () => {
    const crowded = [
      ACTIVITIES[0]!,
      bar('wire', 'Wire', '2026-01-01', '2026-01-04'),
      ACTIVITIES[2]!,
      ACTIVITIES[3]!,
    ];
    const { listbox, onReposition } = renderPanel({ activities: crowded });
    focusRow(listbox, 0); // Pour, Wire holds the lane below over the same days
    fireEvent.keyDown(listbox, { key: 'ArrowDown', altKey: true });
    await waitFor(() => expect(onReposition).toHaveBeenCalledTimes(1));
    expect(onReposition.mock.calls[0]![0].swimlaneLanes![0]).toEqual({
      id: 'pour',
      lane: 2,
      from: 0,
    });
    await waitFor(() =>
      expect(announceSpy).toHaveBeenCalledWith(
        'Moved “Pour”, in Mechanical, lane 3 of 3, the next free lane.',
      ),
    );
  });

  it('still moves in time with Alt+→, writing no lane at all', async () => {
    const { listbox, onReposition } = renderPanel();
    focusRow(listbox, 0);
    fireEvent.keyDown(listbox, { key: 'ArrowRight', altKey: true });
    await waitFor(() =>
      expect(onReposition).toHaveBeenCalledWith({ activityId: 'pour', startDay: 1 }),
    );
  });
});

describe('a plural move on the swimlane layout', () => {
  function select(listbox: HTMLElement, first: number, last: number): void {
    focusRow(listbox, first);
    for (let i = first; i < last; i += 1) {
      fireEvent.keyDown(listbox, { key: 'ArrowDown', shiftKey: true });
    }
  }

  it('hands the host no lane delta: each bar’s lane inside its own swimlane instead', async () => {
    const { listbox, moveMany } = renderPanel();
    select(listbox, 0, 1); // Pour and Wire
    fireEvent.keyDown(listbox, { key: 'ArrowDown', altKey: true });
    await waitFor(() => expect(moveMany).toHaveBeenCalledTimes(1));
    const [rows, delta, options] = (moveMany as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(delta).toEqual({ dayDelta: 0, laneDelta: 0 });
    expect(options.swimlaneLanes).toEqual([
      { id: 'pour', lane: 1, from: 0 },
      { id: 'wire', lane: 2, from: 1 },
    ]);
    // The rows are the STORED ones, which is all the write may be built from.
    expect((rows as ActivitySummary[]).map((r) => r.laneIndex)).toEqual([0, 0]);
  });

  it('keeps each bar in its own swimlane when the set spans two', async () => {
    const { listbox, moveMany } = renderPanel();
    select(listbox, 1, 2); // Wire (Mechanical, lane 1) and Test (Electrical, lane 0)
    fireEvent.keyDown(listbox, { key: 'ArrowDown', altKey: true });
    await waitFor(() => expect(moveMany).toHaveBeenCalledTimes(1));
    const options = (moveMany as ReturnType<typeof vi.fn>).mock.calls[0]![2];
    expect(options.swimlaneLanes).toEqual([
      { id: 'wire', lane: 2, from: 1 },
      { id: 'test', lane: 1, from: 0 },
    ]);
    for (const row of options.swimlaneLanes) expect(row).not.toHaveProperty('swimlaneId');
  });

  it('refuses the whole set when one bar is on the top lane of its own swimlane', async () => {
    const { listbox, moveMany } = renderPanel();
    select(listbox, 1, 2); // Wire and Test: Test is on Electrical's top lane (display lane 2)
    fireEvent.keyDown(listbox, { key: 'ArrowUp', altKey: true });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /already in the top lane of its swimlane, so none moved/,
    );
    // Display-lane arithmetic alone would have let both through: Test 2 → 1 and Wire 1 → 0.
    expect(moveMany).not.toHaveBeenCalled();
  });

  it('a plural drag moves each bar by the same lanes inside its own swimlane', async () => {
    const { canvas, listbox, moveMany } = renderPanel();
    select(listbox, 0, 1);
    fireEvent.pointerDown(canvas, { clientX: 60, clientY: laneMid(0), pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 60, clientY: laneMid(1), pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 60, clientY: laneMid(1), pointerId: 1 });
    await waitFor(() => expect(moveMany).toHaveBeenCalledTimes(1));
    const [, delta, options] = (moveMany as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(delta).toEqual({ dayDelta: 0, laneDelta: 0 });
    expect(options.swimlaneLanes).toEqual([
      { id: 'pour', lane: 1, from: 0 },
      { id: 'wire', lane: 2, from: 1 },
    ]);
  });

  it('says what a refusal from the write path says, without offering Refresh', async () => {
    const moveMany = vi.fn(() =>
      Promise.resolve({ applied: false, conflict: 'Too many.', refreshable: false }),
    );
    const { listbox } = renderPanel({ moveMany });
    select(listbox, 0, 1);
    fireEvent.keyDown(listbox, { key: 'ArrowDown', altKey: true });
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many.');
    expect(screen.queryByRole('button', { name: /refresh/i })).toBeNull();
  });
});

describe('create on the swimlane layout', () => {
  async function drawAt(canvas: Element, lane: number): Promise<void> {
    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }));
    // Clear of every bar (they sit on days 0-3 and 6-9), so the press is on empty ground.
    fireEvent.pointerDown(canvas, { clientX: 400, clientY: laneMid(lane), pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 460, clientY: laneMid(lane), pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 460, clientY: laneMid(lane), pointerId: 1 });
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Fix' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to plan' }));
  }

  it('joins the swimlane drawn under the click, at its lane inside it', async () => {
    const { canvas, onCreate } = renderPanel();
    await drawAt(canvas, 2); // Electrical's first lane, free at these days
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    const created = onCreate.mock.calls[0]![0];
    expect(created.swimlane).toEqual({ swimlaneId: 's2', lane: 0, materialised: [] });
    expect(created.name).toBe('Fix');
  });

  it('takes the first free lane of the swimlane-free layout, not the lane it was drawn on', async () => {
    const { canvas, onCreate } = renderPanel();
    await drawAt(canvas, 2);
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    // Every stored lane is 0 and these days are free there; the click was on DISPLAY lane 2.
    expect(onCreate.mock.calls[0]![0].laneIndex).toBe(0);
  });

  it('files nothing for a click in "No swimlane"', async () => {
    const { canvas, onCreate } = renderPanel();
    await drawAt(canvas, 3);
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0]![0].swimlane).toMatchObject({ swimlaneId: null });
  });

  it('opens from the keyboard on the focused bar’s drawn lane and files it in that swimlane', async () => {
    const { listbox, onCreate } = renderPanel();
    focusRow(listbox, 2); // Test: Electrical, drawn on display lane 2
    fireEvent.keyDown(listbox, { key: 'n' });
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Fix' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to plan' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    // Test holds lane 0 of Electrical over the same day: nearest free is the one below.
    expect(onCreate.mock.calls[0]![0].swimlane).toMatchObject({ swimlaneId: 's2', lane: 1 });
  });
});

describe('off the swimlane layout nothing changes', () => {
  it('a lane drag is still a laneIndex move and a create still carries no swimlane', async () => {
    const onReposition = vi.fn().mockResolvedValue(OK);
    const onCreate = vi.fn().mockResolvedValue({ recalcConflict: null });
    const { container } = render(
      <TsldPanel
        activities={[ACTIVITIES[0]!]}
        dependencies={NO_DEPS}
        dataDate="2026-01-01"
        canEdit
        onCreate={onCreate}
        onReposition={onReposition}
      />,
    );
    const canvas = container.querySelector('canvas')!;
    drag(canvas, 0, 2);
    await waitFor(() =>
      expect(onReposition).toHaveBeenCalledWith({ activityId: 'pour', laneIndex: 2 }),
    );
    expect(onReposition.mock.calls[0]![0]).not.toHaveProperty('swimlaneLanes');
    fireEvent.click(screen.getByRole('button', { name: 'Add activity' }));
    fireEvent.pointerDown(canvas, { clientX: 400, clientY: laneMid(1), pointerId: 2 });
    fireEvent.pointerUp(canvas, { clientX: 400, clientY: laneMid(1), pointerId: 2 });
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Fix' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to plan' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(onCreate.mock.calls[0]![0]).not.toHaveProperty('swimlane');
    expect(onCreate.mock.calls[0]![0].laneIndex).toBe(1);
  });
});
