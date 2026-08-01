import type { ActivitySummary, DependencySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityLogicPanel } from './ActivityLogicPanel';

import { apiFetch, apiFetchAllPages } from '@/lib/api/client';

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, apiFetch: vi.fn(), apiFetchAllPages: vi.fn() };
});

const fetchAllPages = vi.mocked(apiFetchAllPages);
const fetchOne = vi.mocked(apiFetch);

const OTHERS = [
  { id: 'a1', code: 'A10', name: 'Excavate' },
  { id: 'c1', code: null, name: 'Cure' },
] as unknown as ActivitySummary[];

const ACTIVITY = {
  id: 'b1',
  planId: 'pl1',
  code: 'B10',
  name: 'Pour slab',
} as unknown as ActivitySummary;

function link(overrides: Partial<DependencySummary> = {}): DependencySummary {
  return {
    id: 'd1',
    planId: 'pl1',
    type: 'FS',
    lagDays: 0,
    lagMinutes: 0,
    lagCalendar: 'PROJECT_DEFAULT',
    predecessor: { id: 'a1', code: 'A10', name: 'Excavate' },
    successor: { id: 'b1', code: 'B10', name: 'Pour slab' },
    isDriving: false,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

/** Mounted bare — no `Dialog`, which is the point: the tab hosts the same panel directly. */
function renderPanel(props: Partial<React.ComponentProps<typeof ActivityLogicPanel>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivityLogicPanel orgSlug="acme" planId="pl1" activity={ACTIVITY} {...props} />
    </QueryClientProvider>,
  );
}

describe('ActivityLogicPanel', () => {
  beforeEach(() => {
    fetchAllPages.mockReset();
    fetchOne.mockReset().mockResolvedValue({});
  });

  it('renders both directions standalone, outside any dialog', async () => {
    fetchAllPages.mockResolvedValue([link()]);
    renderPanel();
    // Each table shows the OTHER end of its links, so one row names the predecessor and the
    // other names this activity as the successor's counterpart.
    expect(await screen.findByText('Excavate')).toBeInTheDocument();
    expect(screen.getByText('Pour slab')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Predecessors' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Successors' })).toBeInTheDocument();
  });

  it('shows each direction’s loading state while its query is in flight', () => {
    fetchAllPages.mockReturnValue(new Promise(() => {}));
    renderPanel();
    expect(screen.getByText('Loading predecessors…')).toBeInTheDocument();
    expect(screen.getByText('Loading successors…')).toBeInTheDocument();
  });

  it('shows an empty state per direction', async () => {
    fetchAllPages.mockResolvedValue([]);
    renderPanel();
    expect(await screen.findByText(/No predecessors/)).toBeInTheDocument();
    expect(screen.getByText(/No successors/)).toBeInTheDocument();
  });

  it('surfaces a load failure rather than an empty list', async () => {
    fetchAllPages.mockRejectedValue(new Error('offline'));
    renderPanel();
    expect(await screen.findByText(/Couldn’t load predecessors/)).toBeInTheDocument();
    expect(screen.getByText(/Couldn’t load successors/)).toBeInTheDocument();
  });

  it('hides write affordances for a reader', async () => {
    fetchAllPages.mockResolvedValue([link()]);
    renderPanel();
    await screen.findByText('Excavate');
    expect(screen.queryByRole('button', { name: 'Add predecessor' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Edit link/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove link/ })).not.toBeInTheDocument();
  });

  it('carries its own edit/remove affordances and the inline add form for a logic manager — the panel is self-sufficient wherever it is mounted', async () => {
    fetchAllPages.mockResolvedValue([link()]);
    renderPanel({ canManageLogic: true, planActivities: OTHERS });
    await screen.findByText('Excavate');
    expect(screen.getByRole('group', { name: 'Add a link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit link to Excavate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove link to Pour slab' })).toBeInTheDocument();
  });

  it('issues no request while disabled — a host may mount it before it is showing', async () => {
    fetchAllPages.mockResolvedValue([]);
    renderPanel({ enabled: false });
    // Nothing to wait for on the happy path, so assert the negative after a settle tick.
    await waitFor(() => expect(fetchAllPages).not.toHaveBeenCalled());
    expect(screen.getByRole('heading', { name: 'Predecessors' })).toBeInTheDocument();
  });

  // ── Add a link, inline (was AddDependencyDialog) ────────────────────────────────────────────
  //
  // These assertions came with the dialog this section replaced. They are the reason the
  // replacement can be trusted: same endpoint, same body, same inline rejections, same empty
  // state — reached without opening a second modal.

  function renderWriter(options: ActivitySummary[] = OTHERS) {
    fetchAllPages.mockResolvedValue([]);
    return renderPanel({ canManageLogic: true, planActivities: options });
  }

  it('adds a predecessor: the chosen activity → this one', async () => {
    renderWriter();
    fireEvent.change(screen.getByLabelText('Predecessor activity'), { target: { value: 'a1' } });
    fireEvent.change(screen.getByLabelText(/Lag \(working days/), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));

    await waitFor(() => expect(fetchOne).toHaveBeenCalled());
    const [path, init] = fetchOne.mock.calls[0]!;
    expect(path).toBe('/organizations/acme/plans/pl1/dependencies');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      predecessorId: 'a1',
      successorId: 'b1',
      type: 'FS',
      lagDays: 2,
      lagCalendar: 'PROJECT_DEFAULT', // the default when the selector isn't touched
    });
  });

  it('adds a successor once the direction is switched: this activity → the chosen one', async () => {
    renderWriter();
    fireEvent.change(screen.getByLabelText('Link it as'), { target: { value: 'successor' } });
    fireEvent.change(screen.getByLabelText('Successor activity'), { target: { value: 'c1' } });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'SS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));

    await waitFor(() => expect(fetchOne).toHaveBeenCalled());
    const body = JSON.parse(fetchOne.mock.calls[0]![1]?.body as string);
    expect(body).toMatchObject({ predecessorId: 'b1', successorId: 'c1', type: 'SS' });
  });

  it('sends the chosen 24-hour lag calendar (M3, ADR-0036 §6)', async () => {
    renderWriter();
    fireEvent.change(screen.getByLabelText('Predecessor activity'), { target: { value: 'a1' } });
    fireEvent.change(screen.getByLabelText('Lag calendar'), {
      target: { value: 'TWENTY_FOUR_HOUR' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));

    await waitFor(() => expect(fetchOne).toHaveBeenCalled());
    const [, init] = fetchOne.mock.calls[0]!;
    expect(JSON.parse(init?.body as string)).toMatchObject({ lagCalendar: 'TWENTY_FOUR_HOUR' });
  });

  it('relabels the lag field to calendar days once 24-hour (elapsed) is chosen (M3)', () => {
    renderWriter();
    // Default lag calendar → the unit is working days.
    expect(screen.getByLabelText(/Lag \(working days/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Lag calendar'), {
      target: { value: 'TWENTY_FOUR_HOUR' },
    });
    // An elapsed lag is counted in calendar days, so the label must track the choice.
    expect(screen.getByLabelText(/Lag \(calendar days/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Lag \(working days/)).not.toBeInTheDocument();
  });

  it('relabels the activity picker with the direction', () => {
    renderWriter();
    expect(screen.getByLabelText('Predecessor activity')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Link it as'), { target: { value: 'successor' } });
    expect(screen.getByLabelText('Successor activity')).toBeInTheDocument();
  });

  it('surfaces a server rejection (e.g. a cycle) inline', async () => {
    fetchOne.mockRejectedValue(new Error('This dependency would create a cycle in the schedule.'));
    renderWriter();
    fireEvent.change(screen.getByLabelText('Predecessor activity'), { target: { value: 'a1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));

    await waitFor(() => expect(screen.getByText(/would create a cycle/)).toBeInTheDocument());
  });

  it('shows a way-out empty state when the plan has no other activities', () => {
    renderWriter([]);
    expect(screen.getByText(/no other activities to link to/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Predecessor activity')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add link' })).not.toBeInTheDocument();
  });

  it('requires choosing an activity', async () => {
    renderWriter();
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
    await waitFor(() =>
      expect(screen.getAllByText('Choose an activity.').length).toBeGreaterThan(0),
    );
    expect(fetchOne).not.toHaveBeenCalled();
  });

  it('reports the created edge exactly once, so undo is symmetric with remove', async () => {
    const onAdded = vi.fn();
    fetchOne.mockResolvedValue({ id: 'new-dep', planId: 'pl1' });
    fetchAllPages.mockResolvedValue([]);
    renderPanel({ canManageLogic: true, planActivities: OTHERS, onAdded });
    fireEvent.change(screen.getByLabelText('Predecessor activity'), { target: { value: 'a1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));

    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    // The command needs the SERVER's row (it holds the new id undo deletes), not the form values.
    expect(onAdded).toHaveBeenCalledWith(expect.objectContaining({ id: 'new-dep' }));
  });

  it('explains a refused add rather than hiding it, when the host can say why', () => {
    fetchAllPages.mockResolvedValue([]);
    renderPanel({ planActivities: OTHERS, manageLogicReason: 'Take the pen to change logic.' });
    const add = screen.getByRole('button', { name: 'Add link' });
    expect(add).toHaveAttribute('aria-disabled', 'true');
    // Associated, not merely adjacent — proximity is not association in the a11y tree.
    const describedBy = add.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      'Take the pen to change logic.',
    );
  });

  it('hides the add form entirely for a reader the host cannot explain the refusal to', () => {
    fetchAllPages.mockResolvedValue([]);
    renderPanel({ planActivities: OTHERS });
    expect(screen.queryByRole('group', { name: 'Add a link' })).not.toBeInTheDocument();
  });
});
