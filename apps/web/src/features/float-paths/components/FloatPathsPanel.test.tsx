import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildFloatPathRows } from '../model/float-path-rows';

import { FloatPathsPanel, type FloatPathsPanelProps } from './FloatPathsPanel';

/**
 * The panel's **state matrix**. Every branch here is one a planner will actually reach, and three
 * of them are the ones a naive implementation collapses: error rendered as empty (a failure
 * presented as a finding), "never calculated" rendered as an error (a normal state presented as a
 * fault), and the driving path labelled `+0d` (a measurement of nothing, where the name belongs).
 */

const announce = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announce }));

const ACTIVITIES = [
  {
    id: 't',
    code: 'T',
    name: 'Handover',
    earlyStart: '2026-03-02',
    earlyFinish: '2026-03-02',
    totalFloat: 0,
    calendarId: null,
  },
  {
    id: 'a',
    code: 'A',
    name: 'Fit out',
    earlyStart: '2026-02-02',
    earlyFinish: '2026-02-27',
    totalFloat: 0,
    calendarId: null,
  },
  {
    id: 'b',
    code: 'B',
    name: 'Landscaping',
    earlyStart: '2026-02-09',
    earlyFinish: '2026-02-20',
    totalFloat: 1,
    calendarId: null,
  },
];

function model(
  paths: { index: number; relativeFloatMinutes: number; activityIds: string[] }[],
  hasMorePaths = false,
) {
  return buildFloatPathRows({
    paths,
    targetActivityId: 't',
    hasMorePaths,
    activities: ACTIVITIES,
    planCalendarId: 'cal-8h',
    targetHoursPerDay: 8,
  });
}

const TWO_PATHS = [
  { index: 0, relativeFloatMinutes: 0, activityIds: ['t', 'a'] },
  { index: 1, relativeFloatMinutes: 480, activityIds: ['b'] },
];

/**
 * The panel takes **explicit props**, not a hook result — so a test fabricates exactly what the
 * component reads and nothing else. (It used to take the whole 18-field hook object; five of those
 * fields were never read inside the component, and every test had to invent them anyway.)
 */
function props(over: Partial<FloatPathsPanelProps> = {}): FloatPathsPanelProps {
  return {
    model: model(TWO_PATHS),
    selectedPathIndex: null,
    isPending: false,
    isError: false,
    planNotScheduled: false,
    targetMissing: false,
    canShowMore: false,
    suggestedTargetId: null,
    suggestedTargetName: null,
    onSelectPath: vi.fn(),
    onSetTarget: vi.fn(),
    onShowMore: vi.fn(),
    onRetry: vi.fn(),
    onClose: vi.fn(),
    onActivateActivity: vi.fn(),
    ...over,
  };
}

function renderPanel(over: Partial<FloatPathsPanelProps> = {}) {
  const p = props(over);
  render(<FloatPathsPanel {...p} />);
  return { panel: p, onActivate: p.onActivateActivity };
}

describe('FloatPathsPanel', () => {
  it('names the target and labels path 0 Driving, not "+0d"', () => {
    renderPanel();
    // The target is named in the header. (It is also a chain member, so scope the query.)
    expect(screen.getByRole('region', { name: 'Float paths' })).toHaveTextContent(
      /Paths into\s*Handover/,
    );
    expect(screen.getByRole('button', { name: /Driving/ })).toBeInTheDocument();
    expect(screen.queryByText('+0d')).not.toBeInTheDocument();
  });

  it('labels a branch path with its relative float on the target calendar', () => {
    // 480 minutes on an eight-hour calendar is ONE working day. Divided by a flat 1440 it would
    // read as "0d" and be indistinguishable from the driving path — the defect M0 fixed.
    renderPanel();
    expect(screen.getByRole('button', { name: /\+1d/ })).toBeInTheDocument();
  });

  it('expands a path, which is also how it is selected for emphasis', () => {
    const { panel: p } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /\+1d/ }));
    expect(p.onSelectPath).toHaveBeenCalledWith(1);
  });

  it('collapses a selected path back to no emphasis', () => {
    const { panel: p } = renderPanel({ selectedPathIndex: 1 });
    fireEvent.click(screen.getByRole('button', { name: /\+1d/ }));
    expect(p.onSelectPath).toHaveBeenCalledWith(null);
  });

  it('activates a chain member through the one shared go-to seam', () => {
    const onActivate = vi.fn();
    renderPanel({ selectedPathIndex: 0, onActivateActivity: onActivate });
    fireEvent.click(screen.getByRole('button', { name: /Fit out/ }));
    expect(onActivate).toHaveBeenCalledWith('a');
  });

  it('shows a busy state while the analysis runs — this request is a CPM computation', () => {
    renderPanel({ isPending: true, model: null });
    expect(screen.getByText(/calculating float paths/i)).toBeInTheDocument();
  });

  it('explains a never-calculated plan rather than reporting an error', () => {
    renderPanel({ planNotScheduled: true, isError: true, model: null });
    // The SHARED sentence for this 422, not a second one invented for this panel.
    expect(screen.getByRole('status')).toHaveTextContent(/no float paths to rank yet/i);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says so when the sticky target has left the plan', () => {
    renderPanel({ targetMissing: true, isError: true, model: null });
    expect(screen.getByText(/no longer in the plan/i)).toBeInTheDocument();
  });

  it('reports a failure as an alert with a Retry — never as an empty list', () => {
    const { panel: p } = renderPanel({ isError: true, model: null });
    expect(screen.getByRole('alert')).toHaveTextContent(/could not be run/i);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(p.onRetry).toHaveBeenCalledOnce();
    // Empty and error are different sentences, and only one of them is showing.
    expect(screen.queryByText(/no predecessors/i)).not.toBeInTheDocument();
  });

  it('words the empty case as a fact about the activity, not a failure', () => {
    renderPanel({ model: model([]) });
    expect(screen.getByText(/no predecessors/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('admits truncation, and offers Show more only while more can be asked for', () => {
    const { panel: p } = renderPanel({ model: model(TWO_PATHS, true), canShowMore: true });
    expect(screen.getByText(/showing the first 2 paths/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(p.onShowMore).toHaveBeenCalledOnce();
  });

  it('states the truncation without a Show more when already at the ceiling', () => {
    renderPanel({ model: model(TWO_PATHS, true), canShowMore: false });
    expect(screen.getByText(/showing the first 2 paths/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });

  it('discloses a mixed-calendar comparison rather than suppressing the number (CQ-3)', () => {
    const mixed = buildFloatPathRows({
      paths: TWO_PATHS,
      targetActivityId: 't',
      hasMorePaths: false,
      activities: [ACTIVITIES[0]!, { ...ACTIVITIES[1]!, calendarId: 'cal-24h' }, ACTIVITIES[2]!],
      planCalendarId: 'cal-8h',
      targetHoursPerDay: 8,
    });
    renderPanel({ model: mixed });
    expect(screen.getByText(/more than one calendar/i)).toBeInTheDocument();
    // The figure is still there — suppressing it was the rejected alternative.
    expect(screen.getByRole('button', { name: /\+1d/ })).toBeInTheDocument();
  });

  it('offers the selection as a new target when it is not already the target', () => {
    const { panel: p } = renderPanel({
      suggestedTargetId: 'b',
      suggestedTargetName: 'Landscaping',
    });
    fireEvent.click(screen.getByRole('button', { name: /Use Landscaping/ }));
    expect(p.onSetTarget).toHaveBeenCalledWith('b');
  });

  it('keeps a member the client does not hold, marked and un-activatable', () => {
    const onActivate = vi.fn();
    renderPanel({
      selectedPathIndex: 0,
      model: model([{ index: 0, relativeFloatMinutes: 0, activityIds: ['t', 'gone'] }]),
      onActivateActivity: onActivate,
    });
    const missing = screen.getByRole('button', { name: /not in the loaded activities/i });
    expect(missing).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(missing);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('closes from its own header', () => {
    const { panel: p } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Close float paths' }));
    expect(p.onClose).toHaveBeenCalledOnce();
  });

  it('closes on Escape — a docked column has no native cancel', () => {
    const { panel: p } = renderPanel();
    fireEvent.keyDown(screen.getByRole('region', { name: 'Float paths' }), { key: 'Escape' });
    expect(p.onClose).toHaveBeenCalledOnce();
  });

  it('announces the settled count, then the selected path — one message at a time', () => {
    // The app's live region holds ONE message with no queue, so two writes in a commit lose the
    // first. The selected-path sentence already carries "of n", so it replaces the count rather
    // than racing it.
    announce.mockClear();
    const { rerender } = render(<FloatPathsPanel {...props()} />);
    expect(announce).toHaveBeenCalledWith('2 float paths found.');
    announce.mockClear();
    rerender(<FloatPathsPanel {...props({ selectedPathIndex: 1 })} />);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(
      'Showing path 2 of 2 — 1 activity, +1d above the driving path.',
    );
  });

  it('announces the driving path by name, not as a zero ordinal', () => {
    announce.mockClear();
    render(<FloatPathsPanel {...props({ selectedPathIndex: 0 })} />);
    expect(announce).toHaveBeenCalledWith('Showing the driving path — 2 activities.');
  });

  it('announces every non-success state — none of them is silent', () => {
    // A screen-reader user who armed the tool on a large plan waited in total silence before this:
    // the busy state, the never-calculated state, the missing target and the failure each changed
    // the panel's whole content with nothing spoken (WCAG 4.1.3).
    const states: [Partial<FloatPathsPanelProps>, RegExp][] = [
      [{ isPending: true, model: null }, /calculating float paths/i],
      [{ planNotScheduled: true, isError: true, model: null }, /no float paths to rank yet/i],
      [{ targetMissing: true, isError: true, model: null }, /no longer in the plan/i],
      [{ isError: true, model: null }, /could not be run/i],
    ];
    for (const [state, expected] of states) {
      announce.mockClear();
      const { unmount } = render(<FloatPathsPanel {...props(state)} />);
      expect(announce.mock.calls.flat().join(' ')).toMatch(expected);
      unmount();
    }
  });

  it('says what a negative relative float means rather than negating "above"', () => {
    // A branch MORE critical than a floating target is a real engine output. "−1d above the
    // driving path" is nonsense read aloud, and a bare "−1d" reads as breakage.
    announce.mockClear();
    render(
      <FloatPathsPanel
        {...props({
          selectedPathIndex: 1,
          model: model([
            { index: 0, relativeFloatMinutes: 0, activityIds: ['t'] },
            { index: 1, relativeFloatMinutes: -480, activityIds: ['b'] },
          ]),
        })}
      />,
    );
    expect(screen.getByText('(more critical than the target)')).toBeInTheDocument();
    expect(announce).toHaveBeenCalledWith(
      'Showing path 2 of 2 — 1 activity, −1d — more critical than the target.',
    );
  });

  it('offers Recalculate on a never-calculated plan, with the shared sentence for the state', () => {
    const onRecalculate = vi.fn();
    renderPanel({ planNotScheduled: true, isError: true, model: null, onRecalculate });
    expect(screen.getByRole('status')).toHaveTextContent(/no float paths to rank yet/i);
    fireEvent.click(screen.getByRole('button', { name: 'Recalculate' }));
    expect(onRecalculate).toHaveBeenCalledOnce();
  });

  it('withholds Recalculate from someone who may not run it, but still explains the state', () => {
    renderPanel({ planNotScheduled: true, isError: true, model: null });
    expect(screen.queryByRole('button', { name: 'Recalculate' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
