import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SwimlaneAssignment } from '../model/swimlane-assignment';

import { BulkSelectionBar } from './BulkSelectionBar';
import { MoveToSwimlaneControl } from './MoveToSwimlaneControl';

const announce = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announce }));

/**
 * **Move to swimlane…** (swimlanes M2-T10, ui-architecture C10, feature-spec US-3): the shared
 * `SelectField` and Move button behind the selection bars and the activity editor. The write is the
 * host's; what is pinned here is what the control asks for, says, and refuses.
 */
const assign = vi.fn();
const assignment: SwimlaneAssignment = {
  shown: true,
  choices: [
    { id: 's1', name: 'Civil' },
    { id: 's2', name: 'Mechanical' },
    { id: null, name: 'No swimlane' },
  ],
  currentOf: (id) => (id === 'a' ? 's1' : null),
  assign,
};
const OPEN = { writable: true, reason: null };

const move = (): HTMLElement => screen.getByRole('button', { name: /^move$|moving/i });
const choose = (name: string): void =>
  void fireEvent.change(screen.getByLabelText('Move to'), {
    target: {
      value: Array.from(screen.getByLabelText('Move to').querySelectorAll('option')).find(
        (o) => o.textContent === name,
      )?.value,
    },
  });

beforeEach(() => {
  assign.mockReset();
  announce.mockClear();
  assign.mockResolvedValue({ applied: true, conflict: null, moved: 2 });
});

describe('MoveToSwimlaneControl', () => {
  it('lists the swimlanes in order with "No swimlane" last, and nothing chosen to begin with', () => {
    render(
      <MoveToSwimlaneControl
        assignment={assignment}
        ids={['a', 'b']}
        names={['A', 'B']}
        gate={OPEN}
      />,
    );
    const options = Array.from(screen.getByLabelText('Move to').querySelectorAll('option')).map(
      (o) => o.textContent,
    );
    expect(options).toEqual(['Choose a swimlane', 'Civil', 'Mechanical', 'No swimlane']);
    expect(move()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Choose where to move them.');
  });

  it('says what Move will do, counting only the activities that are not there already', () => {
    render(
      <MoveToSwimlaneControl
        assignment={assignment}
        ids={['a', 'b']}
        names={['A', 'B']}
        gate={OPEN}
      />,
    );
    choose('Civil');
    expect(screen.getByRole('status')).toHaveTextContent(
      '1 activity will move to Civil, keeping their dates. Undo puts it back.',
    );
    expect(move()).toHaveAttribute('aria-disabled', 'false');
  });

  it('keeps Move shut, and says why, when every one is in the swimlane already', () => {
    render(<MoveToSwimlaneControl assignment={assignment} ids={['a']} names={['A']} gate={OPEN} />);
    choose('Civil');
    expect(screen.getByRole('status')).toHaveTextContent('It is already in Civil.');
    fireEvent.click(move());
    expect(assign).not.toHaveBeenCalled();
  });

  it('assigns the ids to the chosen swimlane and announces the destination', async () => {
    const onDone = vi.fn();
    render(
      <MoveToSwimlaneControl
        assignment={assignment}
        ids={['b', 'c']}
        names={['B', 'C']}
        gate={OPEN}
        onDone={onDone}
      />,
    );
    choose('Mechanical');
    await act(() => Promise.resolve(fireEvent.click(move())));
    expect(assign).toHaveBeenCalledWith(['b', 'c'], 's2');
    expect(announce).toHaveBeenCalledWith('2 activities moved to Mechanical.');
    expect(onDone).toHaveBeenCalled();
  });

  it('sends null for "No swimlane", which a DOM value cannot carry', async () => {
    render(<MoveToSwimlaneControl assignment={assignment} ids={['a']} names={['A']} gate={OPEN} />);
    choose('No swimlane');
    await act(() => Promise.resolve(fireEvent.click(move())));
    expect(assign).toHaveBeenCalledWith(['a'], null);
  });

  it('names the one activity and where it landed, in the C9 form', async () => {
    assign.mockResolvedValue({
      applied: true,
      conflict: null,
      moved: 1,
      landed: {
        swimlane: 'Mechanical',
        lane: 1,
        count: 3,
        changedSwimlane: true,
        displayLane: 4,
        how: 'asked',
      },
    });
    render(
      <MoveToSwimlaneControl assignment={assignment} ids={['b']} names={['Pour']} gate={OPEN} />,
    );
    choose('Mechanical');
    await act(() => Promise.resolve(fireEvent.click(move())));
    expect(announce).toHaveBeenCalledWith('Moved “Pour” to Mechanical, lane 2 of 3.');
  });

  it('shows a refusal where the planner is looking, and announces nothing', async () => {
    assign.mockResolvedValue({ applied: false, conflict: 'Some are gone.' });
    render(<MoveToSwimlaneControl assignment={assignment} ids={['b']} names={['B']} gate={OPEN} />);
    choose('Civil');
    await act(() => Promise.resolve(fireEvent.click(move())));
    expect(screen.getByRole('alert')).toHaveTextContent('Some are gone.');
    expect(announce).not.toHaveBeenCalled();
  });

  it('does not say it twice: after a move the status reads where it went, with its live region off', async () => {
    render(<MoveToSwimlaneControl assignment={assignment} ids={['b']} names={['B']} gate={OPEN} />);
    choose('Civil');
    await act(() => Promise.resolve(fireEvent.click(move())));
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Moved to Civil.');
    expect(status).toHaveAttribute('aria-live', 'off');
    // Choosing again puts the prompt back and the region live.
    choose('Mechanical');
    expect(screen.getByRole('status')).not.toHaveAttribute('aria-live', 'off');
  });

  it('says a refusal with no reason in a sentence, and tells a stale one to reload', async () => {
    assign.mockResolvedValue({ applied: false, conflict: null });
    render(<MoveToSwimlaneControl assignment={assignment} ids={['b']} names={['B']} gate={OPEN} />);
    choose('Civil');
    await act(() => Promise.resolve(fireEvent.click(move())));
    expect(screen.getByRole('alert')).toHaveTextContent('Nothing was moved. Try again.');
    assign.mockResolvedValue({ applied: false, conflict: 'Someone else changed it.' });
    await act(() => Promise.resolve(fireEvent.click(move())));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Someone else changed it. Reload and try again.',
    );
    assign.mockResolvedValue({ applied: false, conflict: 'Too many.', refreshable: false });
    await act(() => Promise.resolve(fireEvent.click(move())));
    expect(screen.getByRole('alert')).toHaveTextContent(/^Too many\.$/);
  });

  it('words the prompt for one activity as "it", names the button for the editor, and links a standing hint', () => {
    render(
      <MoveToSwimlaneControl
        assignment={assignment}
        ids={['b']}
        names={['B']}
        gate={OPEN}
        buttonLabel="Move to swimlane"
        hint={<p>Moves the activity now.</p>}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Choose where to move it.');
    const button = screen.getByRole('button', { name: 'Move to swimlane' });
    expect(button).toHaveAccessibleDescription(/Moves the activity now\./);
    expect(screen.getByLabelText('Move to')).toHaveAccessibleDescription(
      /Moves the activity now\./,
    );
  });

  it('shows a failed write as an alert', async () => {
    assign.mockRejectedValue(new Error('Network down'));
    render(<MoveToSwimlaneControl assignment={assignment} ids={['b']} names={['B']} gate={OPEN} />);
    choose('Civil');
    await act(() => Promise.resolve(fireEvent.click(move())));
    expect(screen.getByRole('alert')).toHaveTextContent('Network down');
  });

  it('is shaded with the reason when the reader may not write, and never writes', () => {
    render(
      <MoveToSwimlaneControl
        assignment={assignment}
        ids={['b']}
        names={['B']}
        gate={{ writable: false, reason: 'Start editing to change swimlanes.' }}
      />,
    );
    expect(screen.getByLabelText('Move to')).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Start editing to change swimlanes.');
    // aria-disabled, not the native attribute: it stays in the tab order and keeps its focus.
    expect(move()).not.toBeDisabled();
    fireEvent.click(move());
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('BulkSelectionBar — Move to swimlane…', () => {
  const bar = (over: Partial<React.ComponentProps<typeof BulkSelectionBar>> = {}) =>
    render(
      <BulkSelectionBar
        count={3}
        primaryName="Pour"
        link={{ enabled: true, reason: null }}
        remove={{ enabled: true, reason: null }}
        onLink={vi.fn()}
        onDelete={vi.fn()}
        onClear={vi.fn()}
        {...over}
      />,
    );

  it('omits the button when swimlanes are not offered', () => {
    bar();
    expect(screen.queryByRole('button', { name: /move to swimlane/i })).toBeNull();
  });

  it('shades the trigger with the reason, and does not open, for a reader who may not write', () => {
    bar({
      moveToSwimlane: {
        assignment,
        ids: ['a', 'b'],
        names: ['A', 'B'],
        gate: { writable: false, reason: 'Start editing to change swimlanes.' },
      },
    });
    const trigger = screen.getByRole('button', { name: /move to swimlane/i });
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    expect(trigger).toHaveAccessibleDescription('Start editing to change swimlanes.');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('offers it for the whole selection, in a popover that opens the shared control', async () => {
    bar({
      moveToSwimlane: { assignment, ids: ['a', 'b', 'c'], names: ['A', 'B', 'C'], gate: OPEN },
    });
    const trigger = screen.getByRole('button', { name: /move to swimlane/i });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    choose('Mechanical');
    await act(() => Promise.resolve(fireEvent.click(move())));
    expect(assign).toHaveBeenCalledWith(['a', 'b', 'c'], 's2');
  });
});
