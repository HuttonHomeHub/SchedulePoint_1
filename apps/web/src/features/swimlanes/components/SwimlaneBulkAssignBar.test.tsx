import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { SwimlaneBulkAssignBar } from './SwimlaneBulkAssignBar';

import { AnnouncerProvider } from '@/components/ui/announcer';
import type { SwimlaneAssignment } from '@/features/tsld/model/swimlane-assignment';

const WRITABLE = { writable: true, reason: null };

function assignment(over: Partial<SwimlaneAssignment> = {}): SwimlaneAssignment {
  return {
    shown: true,
    choices: [
      { id: 's1', name: 'Civil' },
      { id: 's2', name: 'Mechanical' },
      { id: null, name: 'No swimlane' },
    ],
    currentOf: () => null,
    assign: vi.fn(() => Promise.resolve({ applied: true, conflict: null, moved: 2 })),
    ...over,
  };
}

function renderBar(
  props: Partial<React.ComponentProps<typeof SwimlaneBulkAssignBar>> = {},
  a: SwimlaneAssignment = assignment(),
) {
  const onDone = vi.fn();
  const onClear = vi.fn();
  const view = render(
    <AnnouncerProvider>
      <SwimlaneBulkAssignBar
        assignment={a}
        ids={['a', 'b']}
        names={['Pour', 'Strip']}
        gate={WRITABLE}
        onDone={onDone}
        onClear={onClear}
        {...props}
      />
    </AnnouncerProvider>,
  );
  return { ...view, onDone, onClear, assignment: a };
}

const move = (): HTMLElement => screen.getByRole('button', { name: 'Move' });
const field = (): HTMLElement => screen.getByRole('combobox', { name: 'Move to swimlane' });

describe('SwimlaneBulkAssignBar', () => {
  it('renders nothing while nothing is selected', () => {
    renderBar({ ids: [], names: [] });
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move' })).toBeNull();
  });

  it('counts the selection and offers every swimlane plus No swimlane in the shared select', () => {
    renderBar();
    expect(screen.getByText('2 activities selected')).toBeInTheDocument();
    const options = Array.from(field().querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toEqual(['Choose a swimlane', 'Civil', 'Mechanical', 'No swimlane']);
  });

  it('keeps Move shaded with aria-disabled, never native disabled, until a swimlane is chosen', () => {
    const { assignment: a } = renderBar();
    expect(move()).toHaveAttribute('aria-disabled', 'true');
    expect(move()).not.toBeDisabled();
    fireEvent.click(move());
    expect(a.assign).not.toHaveBeenCalled();
  });

  it('moves the selection in one write and tells the host', async () => {
    const { assignment: a, onDone } = renderBar();
    fireEvent.change(field(), { target: { value: 's2' } });
    expect(move()).toHaveAttribute('aria-disabled', 'false');
    fireEvent.click(move());
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(a.assign).toHaveBeenCalledTimes(1);
    expect(a.assign).toHaveBeenCalledWith(['a', 'b'], 's2');
  });

  it('says why when the reader cannot write, and writes nothing', () => {
    const { assignment: a } = renderBar({
      gate: { writable: false, reason: 'Start editing to change swimlanes.' },
    });
    expect(screen.getByText('Start editing to change swimlanes.')).toBeInTheDocument();
    expect(move()).toHaveAttribute('aria-disabled', 'true');
    expect(move()).not.toBeDisabled();
    fireEvent.click(move());
    expect(a.assign).not.toHaveBeenCalled();
  });

  it('says so when every selected activity is already in the chosen swimlane', () => {
    renderBar({}, assignment({ currentOf: () => 's1' }));
    fireEvent.change(field(), { target: { value: 's1' } });
    expect(screen.getByText('All of them are already in Civil.')).toBeInTheDocument();
    expect(move()).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows a refusal from the write and does not tell the host it landed', async () => {
    const { onDone } = renderBar(
      {},
      assignment({
        assign: vi.fn(() =>
          Promise.resolve({
            applied: false,
            conflict: 'Someone else changed this.',
            refreshable: false,
          }),
        ),
      }),
    );
    fireEvent.change(field(), { target: { value: 's1' } });
    fireEvent.click(move());
    expect(await screen.findByRole('alert')).toHaveTextContent('Someone else changed this.');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('points at the View toggle when swimlanes are not drawn', () => {
    renderBar({}, assignment({ shown: false }));
    expect(screen.getByText(/Turn on Swimlanes in View to see them/)).toBeInTheDocument();
  });

  it('clears the selection on request', () => {
    const { onClear } = renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('leaves out the count and Clear when another bar already carries them', () => {
    renderBar({ companion: true });
    expect(screen.queryByText('2 activities selected')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear selection' })).toBeNull();
    expect(screen.getByRole('group', { name: 'Swimlane' })).toBeInTheDocument();
    expect(move()).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderBar();
    expect((await axe(container)).violations).toEqual([]);
  });
});
