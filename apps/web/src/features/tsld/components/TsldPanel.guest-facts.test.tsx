import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * **A guest who selects an activity reads its facts** (`docs/specs/guest-activity-details/`, M1).
 * The line takes the hint row's place while something is selected, for `guestChrome` only, and the
 * announcer still receives only the option's own sentence, once.
 */
const announce = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announce }));

import { BAR_HEIGHT, BAR_PAD, DEFAULT_VIEWPORT, LANE_HEIGHT } from '../render/render-model';

import { TsldPanel } from './TsldPanel';

import { anActivity } from '@/test/activity-fixture';

const INSTRUCTION = 'Drag to pan, scroll to zoom. The critical path is highlighted.';

const ACTIVITIES = [
  anActivity({
    id: 'a1',
    code: 'A1020',
    name: 'Pour slab',
    laneIndex: 0,
    earlyStart: '2026-03-02',
    earlyFinish: '2026-03-13',
    visualEffectiveStart: '2026-03-03',
    visualEffectiveFinish: '2026-03-14',
    totalFloat: 4,
    percentComplete: 40,
    status: 'IN_PROGRESS',
  }),
  anActivity({
    id: 'a2',
    code: 'A1030',
    name: 'Cure',
    laneIndex: 1,
    earlyStart: '2026-03-16',
    earlyFinish: '2026-03-20',
    visualEffectiveStart: '2026-03-16',
    visualEffectiveFinish: '2026-03-20',
    totalFloat: 0,
    isCritical: true,
  }),
];

function mount(guestChrome: boolean) {
  return render(
    <TsldPanel
      activities={ACTIVITIES}
      dependencies={[]}
      dataDate="2026-03-02"
      todayIso="2026-03-10"
      canEdit={false}
      barDateSource="visual"
      fill
      showConstraintKey={false}
      {...(guestChrome ? { guestChrome } : {})}
    />,
  );
}

const listbox = () => screen.getByRole('listbox', { name: 'Activities in the diagram' });

describe('TsldPanel — a guest reads the selected activity', () => {
  beforeEach(() => announce.mockClear());

  it('shows the instruction with nothing selected', () => {
    mount(true);
    expect(screen.getByText(INSTRUCTION)).toBeInTheDocument();
    expect(screen.queryByTestId('guest-selection-facts')).toBeNull();
  });

  it('swaps the instruction for the facts on selection, and back on Escape', () => {
    mount(true);
    fireEvent.focus(listbox());
    const line = screen.getByTestId('guest-selection-facts');
    expect(screen.queryByText(INSTRUCTION)).toBeNull();
    expect(line).toHaveTextContent('Pour slab, A1020');
    expect(line).toHaveTextContent('Start03 Mar 2026');
    expect(line).toHaveTextContent('Finish14 Mar 2026');
    expect(line).toHaveTextContent('Total float4 d');
    expect(line).toHaveTextContent('Progress40%');
    expect(line).toHaveTextContent('StatusIn progress');

    fireEvent.keyDown(listbox(), { key: 'ArrowDown' });
    expect(screen.getByTestId('guest-selection-facts')).toHaveTextContent('Cure, A1030');
    expect(screen.getByTestId('guest-selection-facts')).toHaveTextContent(
      'Total float0 d · Critical',
    );

    fireEvent.keyDown(listbox(), { key: 'Escape' });
    expect(screen.queryByTestId('guest-selection-facts')).toBeNull();
    expect(screen.getByText(INSTRUCTION)).toBeInTheDocument();
  });

  it('says how many are selected when there are two or more, with no facts', () => {
    mount(true);
    fireEvent.focus(listbox());
    fireEvent.keyDown(listbox(), { key: 'a', ctrlKey: true });
    expect(screen.getByText('2 activities selected.')).toBeInTheDocument();
    expect(screen.queryByTestId('guest-selection-facts')).toBeNull();
  });

  it('has no focusable element, and the line is not a live region', () => {
    mount(true);
    fireEvent.focus(listbox());
    const line = screen.getByTestId('guest-selection-facts');
    expect(within(line).queryAllByRole('button')).toHaveLength(0);
    expect(line.querySelectorAll('a, button, input, select, textarea, [tabindex]')).toHaveLength(0);
    expect(line.closest('[aria-live]')).toBeNull();
    expect(line.getAttribute('role')).toBeNull();
  });

  it('announces the selection once, as before, and adds nothing for the line', () => {
    mount(true);
    fireEvent.focus(listbox());
    expect(announce).toHaveBeenCalledTimes(1);
    expect(String(announce.mock.calls[0]?.[0])).toContain('Pour slab');
  });

  it('swaps in the facts on a click on a bar, and back on a click on empty ground', () => {
    const { container } = mount(true);
    const canvas = container.querySelector('canvas');
    if (!canvas) throw new Error('canvas not rendered');
    const laneMid = (lane: number): number =>
      DEFAULT_VIEWPORT.originY + lane * LANE_HEIGHT + BAR_PAD + BAR_HEIGHT / 2;
    const press = (at: { clientX: number; clientY: number }): void => {
      fireEvent.pointerDown(canvas, { ...at, pointerId: 1 });
      fireEvent.pointerUp(canvas, { ...at, pointerId: 1 });
    };
    press({ clientX: 60, clientY: laneMid(0) });
    expect(screen.getByTestId('guest-selection-facts')).toHaveTextContent('Pour slab, A1020');
    press({ clientX: 420, clientY: laneMid(0) + 6 * LANE_HEIGHT });
    expect(screen.queryByTestId('guest-selection-facts')).toBeNull();
    expect(screen.getByText(INSTRUCTION)).toBeInTheDocument();
  });

  it('draws no facts line, and warns, when guestChrome is passed to a chromeless panel', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <TsldPanel
        activities={ACTIVITIES}
        dependencies={[]}
        dataDate="2026-03-02"
        canEdit={false}
        chromeless
        guestChrome
      />,
    );
    fireEvent.focus(listbox());
    expect(screen.queryByTestId('guest-selection-facts')).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('guestChrome has no effect'));
    warn.mockRestore();
  });

  it('renders the same DOM with guestChrome omitted as with guestChrome false (members unaffected)', () => {
    // React's generated ids differ between two roots; everything else must be identical.
    const dom = (props: { guestChrome?: boolean }): string => {
      const { container, unmount } = render(
        <TsldPanel
          activities={ACTIVITIES}
          dependencies={[]}
          dataDate="2026-03-02"
          todayIso="2026-03-10"
          canEdit={false}
          barDateSource="visual"
          {...props}
        />,
      );
      fireEvent.focus(listbox());
      const html = container.innerHTML.replace(/[«:_]r[_0-9a-z]*[»:_]/g, 'ID');
      unmount();
      return html;
    };
    expect(dom({ guestChrome: false })).toBe(dom({}));
  });

  it('leaves the row unchanged on selection without guestChrome', () => {
    mount(false);
    fireEvent.focus(listbox());
    expect(screen.queryByTestId('guest-selection-facts')).toBeNull();
    expect(screen.getByText(INSTRUCTION)).toBeInTheDocument();
  });
});
