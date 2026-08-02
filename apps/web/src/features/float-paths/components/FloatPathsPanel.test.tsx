import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildFloatPathRows } from '../model/float-path-rows';
import type { UseFloatPathsPanelResult } from '../model/use-float-paths-panel';

import { FloatPathsPanel } from './FloatPathsPanel';

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

function panel(over: Partial<UseFloatPathsPanelResult> = {}): UseFloatPathsPanelResult {
  return {
    open: true,
    targetId: 't',
    selectedPathIndex: null,
    maxPaths: 10,
    model: model(TWO_PATHS),
    isPending: false,
    isError: false,
    planNotScheduled: false,
    targetMissing: false,
    emphasisIds: new Set<string>(),
    canShowMore: false,
    suggestedTargetId: null,
    openWith: vi.fn(),
    close: vi.fn(),
    setTarget: vi.fn(),
    selectPath: vi.fn(),
    showMore: vi.fn(),
    retry: vi.fn(),
    ...over,
  };
}

function renderPanel(over: Partial<UseFloatPathsPanelResult> = {}, onActivate = vi.fn()) {
  const p = panel(over);
  render(<FloatPathsPanel panel={p} suggestedTargetName={null} onActivateActivity={onActivate} />);
  return { panel: p, onActivate };
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
    expect(p.selectPath).toHaveBeenCalledWith(1);
  });

  it('collapses a selected path back to no emphasis', () => {
    const { panel: p } = renderPanel({ selectedPathIndex: 1 });
    fireEvent.click(screen.getByRole('button', { name: /\+1d/ }));
    expect(p.selectPath).toHaveBeenCalledWith(null);
  });

  it('activates a chain member through the one shared go-to seam', () => {
    const onActivate = vi.fn();
    renderPanel({ selectedPathIndex: 0 }, onActivate);
    fireEvent.click(screen.getByRole('button', { name: /Fit out/ }));
    expect(onActivate).toHaveBeenCalledWith('a');
  });

  it('shows a busy state while the analysis runs — this request is a CPM computation', () => {
    renderPanel({ isPending: true, model: null });
    expect(screen.getByText(/calculating float paths/i)).toBeInTheDocument();
  });

  it('explains a never-calculated plan rather than reporting an error', () => {
    renderPanel({ planNotScheduled: true, isError: true, model: null });
    expect(screen.getByText(/has not been calculated yet/i)).toBeInTheDocument();
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
    expect(p.retry).toHaveBeenCalledOnce();
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
    expect(p.showMore).toHaveBeenCalledOnce();
  });

  it('states the truncation without a Show more when already at the ceiling', () => {
    renderPanel({ model: model(TWO_PATHS, true), canShowMore: false, maxPaths: 50 });
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
    const p = panel({ suggestedTargetId: 'b' });
    render(
      <FloatPathsPanel panel={p} suggestedTargetName="Landscaping" onActivateActivity={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Use Landscaping/ }));
    expect(p.setTarget).toHaveBeenCalledWith('b');
  });

  it('keeps a member the client does not hold, marked and un-activatable', () => {
    const onActivate = vi.fn();
    renderPanel(
      {
        selectedPathIndex: 0,
        model: model([{ index: 0, relativeFloatMinutes: 0, activityIds: ['t', 'gone'] }]),
      },
      onActivate,
    );
    const missing = screen.getByRole('button', { name: /not in the loaded activities/i });
    expect(missing).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(missing);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it('closes from its own header', () => {
    const { panel: p } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Close float paths' }));
    expect(p.close).toHaveBeenCalledOnce();
  });

  it('closes on Escape — a docked column has no native cancel', () => {
    const { panel: p } = renderPanel();
    fireEvent.keyDown(screen.getByRole('region', { name: 'Float paths' }), { key: 'Escape' });
    expect(p.close).toHaveBeenCalledOnce();
  });

  it('announces the settled result count, and the selected path once', () => {
    announce.mockClear();
    const { rerender } = render(
      <FloatPathsPanel panel={panel()} suggestedTargetName={null} onActivateActivity={vi.fn()} />,
    );
    expect(announce).toHaveBeenCalledWith('2 float paths found.');
    announce.mockClear();
    rerender(
      <FloatPathsPanel
        panel={panel({ selectedPathIndex: 1 })}
        suggestedTargetName={null}
        onActivateActivity={vi.fn()}
      />,
    );
    expect(announce).toHaveBeenCalledWith(
      'Showing path 2 of 2 — 1 activity, +1d above the driving path.',
    );
  });

  it('announces the driving path by name, not as a zero ordinal', () => {
    announce.mockClear();
    render(
      <FloatPathsPanel
        panel={panel({ selectedPathIndex: 0 })}
        suggestedTargetName={null}
        onActivateActivity={vi.fn()}
      />,
    );
    expect(announce).toHaveBeenCalledWith('Showing the driving path — 2 activities.');
  });
});
