import type { ActivitySummary } from '@repo/types';
import { act, fireEvent, render, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TsldPanel } from './TsldPanel';

import { DEFAULT_VIEW_TOGGLES } from '@/features/tsld/render/paint';
import type { SwimlaneInput } from '@/features/tsld/render/project-swimlanes';
import { useTsldCanvasUiState } from '@/features/tsld/toolbar/use-tsld-canvas-ui-state';
import { anActivity } from '@/test/activity-fixture';

vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => vi.fn() }));

/**
 * The parallel listbox with swimlanes drawn (swimlanes M2-T10, ui-architecture C9). It carries the
 * review items from the T1 gate: the option count and text with a **non-null** swimlane input, which
 * the swimlane-free tests could not see, and the keyboard order following the rendered group order.
 *
 * Plan order is a (Mechanical), b (none), c (Civil), d (Mechanical). Swimlane order is Civil then
 * Mechanical then "No swimlane", so the rendered order is c, a, d, b.
 */
const day = (n: number): string => `2026-01-${String(n).padStart(2, '0')}`;
const bar = (id: string, name: string, start: number, laneIndex: number): ActivitySummary =>
  anActivity({
    id,
    name,
    laneIndex,
    earlyStart: day(start),
    earlyFinish: day(start + 2),
    visualEffectiveStart: day(start),
    visualEffectiveFinish: day(start + 2),
  });

const ACTIVITIES = [
  bar('a', 'Pour', 2, 0),
  bar('b', 'Wire', 2, 1),
  bar('c', 'Dig', 2, 2),
  bar('d', 'Cure', 8, 3),
];

const INPUT: SwimlaneInput = {
  swimlanes: [
    { id: 's1', name: 'Civil' },
    { id: 's2', name: 'Mechanical' },
  ],
  membership: new Map<string, string | null>([
    ['a', 's2'],
    ['b', null],
    ['c', 's1'],
    ['d', 's2'],
  ]),
  storedLanes: new Map(),
};

function Harness({ swimlanes }: { swimlanes: SwimlaneInput | null }) {
  const ui = useTsldCanvasUiState();
  return (
    <TsldPanel
      activities={ACTIVITIES}
      dependencies={[]}
      dataDate="2026-01-01"
      canEdit={false}
      swimlanes={swimlanes}
      canvasUi={{ ...ui, viewToggles: { ...DEFAULT_VIEW_TOGGLES } }}
    />
  );
}

const names = (nodes: HTMLElement[]): string[] =>
  nodes.map((n) => n.textContent?.split(',')[0] ?? '');

describe('TsldPanel listbox — grouped by swimlane', () => {
  it('has a group per swimlane, in swimlane order, "No swimlane" last, each named', () => {
    const { getByRole, getAllByRole } = render(<Harness swimlanes={INPUT} />);
    const groups = getAllByRole('group').filter((g) => getByRole('listbox').contains(g));
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual([
      'Civil',
      'Mechanical',
      'No swimlane',
    ]);
    expect(names(within(groups[0]!).getAllByRole('option'))).toEqual(['Dig']);
    // Plan order inside a group.
    expect(names(within(groups[1]!).getAllByRole('option'))).toEqual(['Pour', 'Cure']);
    expect(names(within(groups[2]!).getAllByRole('option'))).toEqual(['Wire']);
  });

  it('keeps the ADR-0063 §4 count: the same options as the flat list, none lost to a group', () => {
    const flat = render(<Harness swimlanes={null} />);
    const flatCount = flat.getAllByRole('option').length;
    flat.unmount();
    const grouped = render(<Harness swimlanes={INPUT} />);
    expect(flatCount).toBe(ACTIVITIES.length);
    expect(grouped.getAllByRole('option')).toHaveLength(flatCount);
  });

  it('says where each bar is in its swimlane, and no bare stored lane', () => {
    const { getAllByRole } = render(<Harness swimlanes={INPUT} />);
    const text = Object.fromEntries(
      getAllByRole('option').map((o) => [o.textContent?.split(',')[0], o.textContent ?? '']),
    );
    // Pour and Cure overlap nothing in time, so both sit in Mechanical's first lane.
    expect(text['Pour']).toContain(', in Mechanical, lane 1 of 1');
    expect(text['Dig']).toContain(', in Civil, lane 1 of 1');
    expect(text['Wire']).toContain(', in No swimlane, lane 1 of 1');
    for (const t of Object.values(text)) expect(t).not.toMatch(/, lane \d+(,|$)/);
  });

  it('walks the keyboard in the rendered order, not plan order', () => {
    const { getByRole, getAllByRole } = render(<Harness swimlanes={INPUT} />);
    const listbox = getByRole('listbox');
    const active = (): string =>
      getAllByRole('option')
        .find((o) => o.id === listbox.getAttribute('aria-activedescendant'))
        ?.textContent?.split(',')[0] ?? '';
    act(() => listbox.focus());
    // Focus selects the first RENDERED row, which is the first of the first group.
    expect(active()).toBe('Dig');
    const press = (key: string): void => void fireEvent.keyDown(listbox, { key });
    const walked: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      press('ArrowDown');
      walked.push(active());
    }
    expect(walked).toEqual(['Pour', 'Cure', 'Wire']);
    press('ArrowDown');
    expect(active()).toBe('Wire');
    press('ArrowUp');
    expect(active()).toBe('Cure');
    press('Home');
    expect(active()).toBe('Dig');
    press('End');
    expect(active()).toBe('Wire');
  });

  it('is the flat list in plan order when no swimlane input is given (SC-3)', () => {
    const { getByRole, getAllByRole } = render(<Harness swimlanes={null} />);
    expect(getAllByRole('group').filter((g) => getByRole('listbox').contains(g))).toHaveLength(0);
    expect(names(getAllByRole('option'))).toEqual(['Pour', 'Wire', 'Dig', 'Cure']);
  });
});
