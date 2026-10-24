import type { SwimlaneSummary } from '@repo/types';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type { SwimlaneActions } from '../model/use-swimlane-actions';

import { SwimlaneDeleteDialog } from './SwimlaneDeleteDialog';
import { SwimlaneDialogs } from './SwimlaneDialogs';
import { SwimlaneManageDialog } from './SwimlaneManageDialog';
import { SwimlaneRenameDialog } from './SwimlaneRenameDialog';
import { SwimlaneSetupDialog } from './SwimlaneSetupDialog';

import { AnnouncerProvider } from '@/components/ui/announcer';

const row = (id: string, name: string, version = 1): SwimlaneSummary => ({
  id,
  planId: 'p1',
  name,
  position: 0,
  version,
  createdAt: '',
  updatedAt: '',
});

const LIST = [row('a', 'Civil'), row('b', 'Mechanical', 3), row('c', 'Electrical')];
const GATE: { writable: boolean; reason: string | null } = { writable: true, reason: null };
const PEN = { writable: false, reason: 'Start editing to change swimlanes.' };

function actions(overrides: Partial<SwimlaneActions> = {}): SwimlaneActions {
  return {
    add: vi.fn((names: readonly string[]) =>
      Promise.resolve(names.map((name, i) => row(`n${String(i)}`, name))),
    ),
    addAfter: vi.fn(),
    rename: vi.fn((s: SwimlaneSummary, name: string) => Promise.resolve({ ...s, name })),
    move: vi.fn(() => Promise.resolve(true)),
    remove: vi.fn(() => Promise.resolve()),
    setManualSource: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

const withAnnouncer = (ui: React.ReactElement): React.ReactElement => (
  <AnnouncerProvider>{ui}</AnnouncerProvider>
);

const announced = (): string => screen.getByTestId('announcer').textContent;

describe('the setup dialog', () => {
  const mount = (a: SwimlaneActions, gate = GATE, onClose = vi.fn()) =>
    render(
      withAnnouncer(
        <SwimlaneSetupDialog
          open
          onClose={onClose}
          plan={{ id: 'p1', version: 7, swimlaneSource: 'NONE' }}
          swimlanes={[]}
          actions={a}
          gate={gate}
        />,
      ),
    );
  const type = (value: string): void => {
    fireEvent.change(screen.getByRole('textbox', { name: /Swimlane names/ }), {
      target: { value },
    });
  };
  const submit = (): void => {
    fireEvent.click(screen.getByRole('button', { name: 'Set up swimlanes' }));
  };

  it('creates the names in the order typed, then switches the plan to hand-made, and closes', async () => {
    const a = actions();
    const onClose = vi.fn();
    mount(a, GATE, onClose);
    type('Civil\nMechanical\n\nElectrical');
    submit();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(a.add).toHaveBeenCalledWith(['Civil', 'Mechanical', 'Electrical']);
    expect(a.setManualSource).toHaveBeenCalledWith({
      id: 'p1',
      version: 7,
      swimlaneSource: 'NONE',
    });
    // The swimlanes first: a source with nothing under it would show an empty gutter.
    expect(vi.mocked(a.add).mock.invocationCallOrder[0]!).toBeLessThan(
      vi.mocked(a.setManualSource).mock.invocationCallOrder[0]!,
    );
    await waitFor(() => expect(announced()).toBe('3 swimlanes set up.'));
  });

  it('offers by-hand only: the WBS option arrives with M3', () => {
    mount(actions());
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.getByText(/By hand/)).toBeInTheDocument();
  });

  it('writes nothing and names the problem when a name repeats or none is typed', async () => {
    const a = actions();
    mount(a);
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter at least one swimlane name.');
    type('Civil\ncivil');
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/);
    expect(a.add).not.toHaveBeenCalled();
  });

  it('after the source write fails, retries only the source: the swimlanes are not made twice', async () => {
    const a = actions({
      setManualSource: vi
        .fn()
        .mockRejectedValueOnce(new Error('Version conflict.'))
        .mockResolvedValue(undefined),
    });
    const onClose = vi.fn();
    mount(a, GATE, onClose);
    type('Civil');
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /swimlanes exist, but the plan could not be switched.*Version conflict\./,
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Finish setup' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(a.add).toHaveBeenCalledTimes(1);
    expect(a.setManualSource).toHaveBeenCalledTimes(2);
  });

  it('goes straight to the source when it opens on a plan that already has swimlanes but no source', async () => {
    // A setup that made the swimlanes, failed to switch the plan, was closed and opened again.
    const a = actions();
    const onClose = vi.fn();
    render(
      withAnnouncer(
        <SwimlaneSetupDialog
          open
          onClose={onClose}
          plan={{ id: 'p1', version: 7, swimlaneSource: 'NONE' }}
          swimlanes={LIST}
          actions={a}
          gate={GATE}
        />,
      ),
    );
    expect(screen.getByText(/3 swimlanes are already made/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Finish setup' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(a.add).not.toHaveBeenCalled();
    expect(a.setManualSource).toHaveBeenCalledTimes(1);
  });

  it('does not rewrite a source that is already hand-made (a setup after undoing one)', async () => {
    const a = actions();
    const onClose = vi.fn();
    render(
      withAnnouncer(
        <SwimlaneSetupDialog
          open
          onClose={onClose}
          plan={{ id: 'p1', version: 7, swimlaneSource: 'MANUAL' }}
          swimlanes={[]}
          actions={a}
          gate={GATE}
        />,
      ),
    );
    type('Civil');
    submit();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(a.add).toHaveBeenCalledWith(['Civil']);
    expect(a.setManualSource).not.toHaveBeenCalled();
  });

  it('puts focus in the field when it refuses, so the problem is where the caret is', async () => {
    mount(actions());
    submit();
    await screen.findByRole('alert');
    expect(screen.getByRole('textbox', { name: /Swimlane names/ })).toHaveFocus();
  });

  it('shades Set up without the pen, saying why, and writes nothing', () => {
    const a = actions();
    mount(a, PEN);
    expect(screen.getByRole('button', { name: 'Set up swimlanes' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('textbox', { name: /Swimlane names/ })).toHaveAccessibleDescription(
      /Start editing to change swimlanes\./,
    );
    type('x');
    submit();
    expect(a.add).not.toHaveBeenCalled();
  });

  it('has no axe violations', async () => {
    const { baseElement } = mount(actions());
    expect((await axe(baseElement)).violations).toEqual([]);
  });
});

describe('the manage dialog', () => {
  const mount = (
    a: SwimlaneActions,
    gate = GATE,
    extra: Partial<React.ComponentProps<typeof SwimlaneManageDialog>> = {},
  ) =>
    render(
      withAnnouncer(
        <SwimlaneManageDialog
          open
          onClose={vi.fn()}
          swimlanes={LIST}
          memberCounts={
            new Map([
              ['b', 14],
              ['a', 1],
            ])
          }
          actions={a}
          gate={gate}
          onRename={vi.fn()}
          onDelete={vi.fn()}
          {...extra}
        />,
      ),
    );

  it('lists each swimlane with how many activities it holds', () => {
    mount(actions());
    const items = within(screen.getByRole('list', { name: 'Swimlanes' })).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent(/^Civil1 activity/);
    expect(items[1]).toHaveTextContent(/^Mechanical14 activities/);
    expect(items[2]).toHaveTextContent(/^Electrical0 activities/);
  });

  it('adds a swimlane at the end and announces it', async () => {
    const a = actions();
    mount(a);
    fireEvent.change(screen.getByRole('textbox', { name: 'New swimlane' }), {
      target: { value: ' Plumbing ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add swimlane' }));
    await waitFor(() => expect(a.add).toHaveBeenCalledWith(['Plumbing']));
    await waitFor(() => expect(announced()).toBe('Swimlane Plumbing added.'));
    expect(screen.getByRole('textbox', { name: 'New swimlane' })).toHaveValue('');
  });

  it('refuses a name that is taken, ignoring case, before asking the server', () => {
    const a = actions();
    mount(a);
    fireEvent.change(screen.getByRole('textbox', { name: 'New swimlane' }), {
      target: { value: 'civil' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add swimlane' }));
    expect(screen.getByText(/already exists/)).toBeInTheDocument();
    expect(a.add).not.toHaveBeenCalled();
  });

  it('moves a swimlane up or down by its row’s own buttons and announces the new place', async () => {
    const a = actions();
    mount(a);
    fireEvent.click(screen.getByRole('button', { name: 'Move Mechanical up' }));
    await waitFor(() => expect(a.move).toHaveBeenCalledWith(LIST, 'b', -1));
    await waitFor(() => expect(announced()).toBe('Mechanical moved to position 1 of 3.'));
    fireEvent.click(screen.getByRole('button', { name: 'Move Mechanical down' }));
    await waitFor(() => expect(a.move).toHaveBeenLastCalledWith(LIST, 'b', 1));
  });

  it('shades the first row’s Move up and the last row’s Move down, each saying why', () => {
    const a = actions();
    mount(a);
    const up = screen.getByRole('button', { name: 'Move Civil up' });
    expect(up).toHaveAttribute('aria-disabled', 'true');
    expect(up).toHaveAccessibleDescription('Civil is already first.');
    const down = screen.getByRole('button', { name: 'Move Electrical down' });
    expect(down).toHaveAccessibleDescription('Electrical is already last.');
    fireEvent.click(up);
    expect(a.move).not.toHaveBeenCalled();
  });

  it('hands rename and delete to the dialogs stacked above it', () => {
    const onRename = vi.fn();
    const onDelete = vi.fn();
    mount(actions(), GATE, { onRename, onDelete });
    fireEvent.click(screen.getByRole('button', { name: 'Rename Mechanical' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Mechanical' }));
    expect(onRename).toHaveBeenCalledWith('b');
    expect(onDelete).toHaveBeenCalledWith('b');
  });

  it('shades every write without the pen, with the reason linked, and writes nothing', () => {
    const a = actions();
    const onDelete = vi.fn();
    mount(a, PEN, { onDelete });
    for (const name of [
      'Rename Mechanical',
      'Delete Mechanical',
      'Move Mechanical up',
      'Add swimlane',
    ]) {
      const button = screen.getByRole('button', { name });
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).toHaveAccessibleDescription(/Start editing to change swimlanes\./);
      fireEvent.click(button);
    }
    expect(a.move).not.toHaveBeenCalled();
    expect(a.add).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('shows a refusal from the server and stays open', async () => {
    const a = actions({ move: vi.fn().mockRejectedValue(new Error('Changed elsewhere.')) });
    mount(a);
    fireEvent.click(screen.getByRole('button', { name: 'Move Mechanical up' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not move Mechanical: Changed elsewhere.',
    );
  });

  it('puts focus in the New swimlane field when the name is refused', () => {
    mount(actions());
    fireEvent.change(screen.getByRole('textbox', { name: 'New swimlane' }), {
      target: { value: 'civil' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add swimlane' }));
    expect(screen.getByRole('textbox', { name: 'New swimlane' })).toHaveFocus();
  });

  it('says nothing about a name to a reader who cannot add at all', () => {
    mount(actions(), PEN);
    fireEvent.change(screen.getByRole('textbox', { name: 'New swimlane' }), {
      target: { value: 'civil' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add swimlane' }));
    expect(screen.queryByText(/already exists/)).not.toBeInTheDocument();
  });

  it('arms no refocus for a move that did not land, so it cannot steal focus later', async () => {
    const a = actions({ move: vi.fn().mockResolvedValue(false) });
    const { rerender } = mount(a);
    const button = screen.getByRole('button', { name: 'Move Mechanical up' });
    fireEvent.click(button);
    await waitFor(() => expect(a.move).toHaveBeenCalled());
    (document.activeElement as HTMLElement | null)?.blur();
    rerender(
      withAnnouncer(
        <SwimlaneManageDialog
          open
          onClose={vi.fn()}
          swimlanes={[LIST[1]!, LIST[0]!, LIST[2]!]}
          memberCounts={new Map()}
          actions={a}
          gate={GATE}
          onRename={vi.fn()}
          onDelete={vi.fn()}
        />,
      ),
    );
    expect(document.body).toHaveFocus();
  });

  it('says so when there are none', () => {
    mount(actions(), GATE, { swimlanes: [] });
    expect(screen.getByText(/No swimlanes yet/)).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { baseElement } = mount(actions());
    expect((await axe(baseElement)).violations).toEqual([]);
  });
});

describe('the rename dialog', () => {
  const mount = (a: SwimlaneActions, onClose = vi.fn(), gate = GATE) =>
    render(
      withAnnouncer(
        <SwimlaneRenameDialog
          open
          onClose={onClose}
          swimlane={LIST[1]!}
          otherNames={['Civil', 'Electrical']}
          actions={a}
          gate={gate}
        />,
      ),
    );

  it('starts on the current name, renames at the row’s version, announces and closes', async () => {
    const a = actions();
    const onClose = vi.fn();
    mount(a, onClose);
    const field = screen.getByRole('textbox', { name: 'Name' });
    expect(field).toHaveValue('Mechanical');
    fireEvent.change(field, { target: { value: ' Mech & Plumbing ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(a.rename).toHaveBeenCalledWith(LIST[1], 'Mech & Plumbing');
    await waitFor(() => expect(announced()).toBe('Swimlane renamed to Mech & Plumbing.'));
  });

  it('opens with focus in the field (focus, not just select), after the dialog has opened', async () => {
    mount(actions());
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus());
  });

  it('closes without a write when the name is unchanged', () => {
    const a = actions();
    const onClose = vi.fn();
    mount(a, onClose);
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(onClose).toHaveBeenCalled();
    expect(a.rename).not.toHaveBeenCalled();
  });

  it('refuses a name another swimlane has, ignoring case', () => {
    const a = actions();
    mount(a);
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'ELECTRICAL' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(screen.getByText(/already exists/)).toBeInTheDocument();
    expect(a.rename).not.toHaveBeenCalled();
  });

  it('has no axe violations', async () => {
    const { baseElement } = mount(actions());
    expect((await axe(baseElement)).violations).toEqual([]);
  });
});

describe('the delete confirmation', () => {
  const onDeleted = vi.fn();
  const mount = (
    a: SwimlaneActions,
    count: number,
    onClose = vi.fn(),
    onDeletedCb: (s: SwimlaneSummary) => void = vi.fn(),
  ) =>
    render(
      withAnnouncer(
        <SwimlaneDeleteDialog
          open
          onClose={onClose}
          swimlane={LIST[1]!}
          memberCount={count}
          actions={a}
          onDeleted={onDeletedCb}
        />,
      ),
    );

  it('says where the members go and that Undo brings them back', () => {
    mount(actions(), 12);
    const dialog = screen.getByRole('alertdialog', { name: 'Delete swimlane “Mechanical”?' });
    expect(dialog).toHaveAccessibleDescription(
      '12 activities will show under No swimlane. Press Undo (Ctrl+Z) to bring them back.',
    );
  });

  it('deletes at the swimlane’s version, announces, and closes', async () => {
    const a = actions();
    const onClose = vi.fn();
    mount(a, 3, onClose, onDeleted);
    fireEvent.click(screen.getByRole('button', { name: 'Delete swimlane' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(a.remove).toHaveBeenCalledWith(LIST[1]);
    // Told before it closes, so the host can choose where focus goes.
    expect(onDeleted).toHaveBeenCalledWith(LIST[1]);
    expect(onDeleted.mock.invocationCallOrder[0]!).toBeLessThan(
      onClose.mock.invocationCallOrder[0]!,
    );
    await waitFor(() =>
      expect(announced()).toBe('Swimlane Mechanical deleted. Undo brings it back.'),
    );
  });

  it('keeps the dialog open and shows the refusal when the delete fails', async () => {
    const a = actions({ remove: vi.fn().mockRejectedValue(new Error('Changed elsewhere.')) });
    const onClose = vi.fn();
    mount(a, 3, onClose);
    fireEvent.click(screen.getByRole('button', { name: 'Delete swimlane' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not delete Mechanical: Changed elsewhere.',
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('SwimlaneDialogs counts members only while a dialog is open', () => {
  /** An activities list that reports each time it is walked. */
  function countingActivities() {
    const walks = { n: 0 };
    const list: { swimlaneId: string | null }[] = [{ swimlaneId: 'a' }];
    const counted = new Proxy(list, {
      get(target, prop, receiver) {
        if (prop === Symbol.iterator) walks.n += 1;
        return Reflect.get(target, prop, receiver) as unknown;
      },
    });
    return { walks, counted: counted as never };
  }
  const state = (over: Partial<{ manage: boolean }> = {}) => ({
    setup: false,
    manage: over.manage ?? false,
    renameId: null,
    deleteId: null,
  });
  const props = (activities: never, manage: boolean) => ({
    state: state({ manage }),
    close: vi.fn(),
    openRename: vi.fn(),
    openDelete: vi.fn(),
    plan: { id: 'p1', version: 1, swimlaneSource: 'MANUAL' as const },
    afterDelete: vi.fn(),
    swimlanes: LIST,
    activities,
    actions: actions(),
    gate: GATE,
  });

  it('walks nothing while every dialog is shut, and once when one opens', () => {
    const { walks, counted } = countingActivities();
    const { rerender } = render(withAnnouncer(<SwimlaneDialogs {...props(counted, false)} />));
    expect(walks.n).toBe(0);
    rerender(withAnnouncer(<SwimlaneDialogs {...props(counted, true)} />));
    expect(walks.n).toBe(1);
  });
});
