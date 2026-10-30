import type { ActivitySummary, CodeTypeSummary, SwimlaneSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type { SwimlaneActions } from '../model/use-swimlane-actions';

import { SwimlaneDeleteDialog } from './SwimlaneDeleteDialog';
import { SwimlaneDialogs } from './SwimlaneDialogs';
import { SwimlaneManageDialog } from './SwimlaneManageDialog';
import { SwimlaneRenameDialog } from './SwimlaneRenameDialog';
import { SwimlaneSetupDialog } from './SwimlaneSetupDialog';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { apiFetch, apiFetchAllPages } from '@/lib/api/client';
import { anActivity } from '@/test/activity-fixture';

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

const LIST = [row('a', 'Civil'), row('b', 'Mechanical', 3), row('c', 'Electrical')];
const GATE: { writable: boolean; reason: string | null } = { writable: true, reason: null };
const PEN = { writable: false, reason: 'Start editing to change swimlanes.' };

const planFacts = (
  swimlaneSource: 'NONE' | 'MANUAL' | 'WBS' | 'ACTIVITY_CODE',
  swimlaneWbsLevel: number | null = null,
  version = 7,
  swimlaneCodeTypeId: string | null = null,
) => ({ id: 'p1', version, swimlaneSource, swimlaneWbsLevel, swimlaneCodeTypeId });

/** A tree with one summary at level 1 and two at level 2, so level 2 is the suggested one. */
const summary = (id: string, parentId: string | null, name = id): ActivitySummary =>
  anActivity({ id, name, parentId, type: 'WBS_SUMMARY' });
const WBS_PLAN: ActivitySummary[] = [
  summary('works', null, 'The Works'),
  summary('struct', 'works', 'Structure'),
  summary('mep', 'works', 'Services'),
  anActivity({ id: 't1', parentId: 'struct' }),
];

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
    switchSource: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

/** The plan's code types, as the picker reads them; each test sets what the server holds. */
let codeTypes: CodeTypeSummary[] = [];
let queryClient: QueryClient;

beforeEach(() => {
  codeTypes = [];
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(apiFetchAllPages)
    .mockReset()
    .mockImplementation((path: string) =>
      Promise.resolve(/\/code-types/.test(path) ? [...codeTypes] : []),
    );
  vi.mocked(apiFetch).mockReset().mockResolvedValue([]);
});

const withAnnouncer = (ui: React.ReactElement): React.ReactElement => (
  <QueryClientProvider client={queryClient}>
    <AnnouncerProvider>{ui}</AnnouncerProvider>
  </QueryClientProvider>
);

const announced = (): string => screen.getByTestId('announcer').textContent;

describe('the setup dialog', () => {
  const mount = (a: SwimlaneActions, gate = GATE, onClose = vi.fn()) =>
    render(
      withAnnouncer(
        <SwimlaneSetupDialog
          orgSlug="acme"
          open
          onClose={onClose}
          plan={planFacts('NONE')}
          swimlanes={[]}
          activities={WBS_PLAN}
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
    expect(a.setManualSource).toHaveBeenCalledWith(planFacts('NONE'));
    // The swimlanes first: a source with nothing under it would show an empty gutter.
    expect(vi.mocked(a.add).mock.invocationCallOrder[0]!).toBeLessThan(
      vi.mocked(a.setManualSource).mock.invocationCallOrder[0]!,
    );
    await waitFor(() => expect(announced()).toBe('3 swimlanes set up.'));
  });

  it('offers by hand, one per WBS group and one per code value, by hand first', () => {
    mount(actions());
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios[0]).toHaveAccessibleName('By hand');
    expect(radios[0]).toBeChecked();
    expect(radios[1]).toHaveAccessibleName('One per WBS group at level 2');
    expect(radios[2]).toHaveAccessibleName('One per code value');
  });

  it('preselects the shallowest level with two groups, not a lone "The Works"', () => {
    mount(actions());
    fireEvent.click(screen.getByRole('radio', { name: /One per WBS group/ }));
    const level = screen.getByRole('combobox', { name: 'WBS level' });
    expect(level).toHaveValue('2');
    expect(
      within(level)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Level 1: 1 group', 'Level 2: 2 groups (suggested)']);
    // The names field belongs to the hand-made option only.
    expect(screen.queryByRole('textbox', { name: /Swimlane names/ })).not.toBeInTheDocument();
  });

  it('sets up from the WBS in one write at the chosen level, announces and closes', async () => {
    const a = actions();
    const onClose = vi.fn();
    mount(a, GATE, onClose);
    fireEvent.click(screen.getByRole('radio', { name: /One per WBS group/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'WBS level' }), {
      target: { value: '1' },
    });
    submit();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(a.switchSource).toHaveBeenCalledWith(planFacts('NONE'), {
      source: 'WBS',
      level: 1,
      codeTypeId: null,
    });
    // No swimlane is made, and the by-hand source write is not the one used.
    expect(a.add).not.toHaveBeenCalled();
    expect(a.setManualSource).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(announced()).toBe('Swimlanes set up: one per WBS group at level 1.'),
    );
  });

  it('drops a names problem when the planner moves to the WBS, so it does not follow them', async () => {
    mount(actions());
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter at least one swimlane name.');
    fireEvent.click(screen.getByRole('radio', { name: /One per WBS group/ }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('writes the suggested level when the planner does not touch the select', async () => {
    const a = actions();
    mount(a);
    fireEvent.click(screen.getByRole('radio', { name: /One per WBS group/ }));
    submit();
    await waitFor(() =>
      expect(a.switchSource).toHaveBeenCalledWith(planFacts('NONE'), {
        source: 'WBS',
        level: 2,
        codeTypeId: null,
      }),
    );
  });

  it('shades the WBS option, with its reason, when the plan has no summary', () => {
    render(
      withAnnouncer(
        <SwimlaneSetupDialog
          orgSlug="acme"
          open
          onClose={vi.fn()}
          plan={planFacts('NONE')}
          swimlanes={[]}
          activities={[anActivity({ id: 'only' })]}
          actions={actions()}
          gate={GATE}
        />,
      ),
    );
    const option = screen.getByRole('radio', { name: 'One per WBS group' });
    expect(option).toHaveAttribute('aria-disabled', 'true');
    expect(option).toHaveAccessibleDescription(/no WBS summaries to make swimlanes from/);
    fireEvent.click(option);
    expect(screen.getByRole('radio', { name: 'By hand' })).toBeChecked();
  });

  it('says why while the activities are still loading', () => {
    render(
      withAnnouncer(
        <SwimlaneSetupDialog
          orgSlug="acme"
          open
          onClose={vi.fn()}
          plan={planFacts('NONE')}
          swimlanes={[]}
          activities={undefined}
          actions={actions()}
          gate={GATE}
        />,
      ),
    );
    expect(screen.getByRole('radio', { name: 'One per WBS group' })).toHaveAccessibleDescription(
      /have not loaded yet/,
    );
  });

  it('shows a refused WBS setup and stays open, writing nothing else', async () => {
    const a = actions({ switchSource: vi.fn().mockRejectedValue(new Error('Version conflict.')) });
    const onClose = vi.fn();
    mount(a, GATE, onClose);
    fireEvent.click(screen.getByRole('radio', { name: /One per WBS group/ }));
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not set up swimlanes: Version conflict.',
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shades a WBS setup without the pen, saying why, and writes nothing', () => {
    const a = actions();
    mount(a, PEN);
    fireEvent.click(screen.getByRole('radio', { name: /One per WBS group/ }));
    const button = screen.getByRole('button', { name: 'Set up swimlanes' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription('Start editing to change swimlanes.');
    submit();
    expect(a.switchSource).not.toHaveBeenCalled();
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
          orgSlug="acme"
          open
          onClose={onClose}
          plan={planFacts('NONE')}
          swimlanes={LIST}
          activities={WBS_PLAN}
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
          orgSlug="acme"
          open
          onClose={onClose}
          plan={planFacts('MANUAL')}
          swimlanes={[]}
          activities={WBS_PLAN}
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
          orgSlug="acme"
          open
          onClose={vi.fn()}
          plan={planFacts('MANUAL')}
          activities={WBS_PLAN}
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
          orgSlug="acme"
          open
          onClose={vi.fn()}
          plan={planFacts('MANUAL')}
          activities={WBS_PLAN}
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

  describe('where swimlanes come from', () => {
    const switchButton = (): HTMLElement =>
      screen.getByRole('button', { name: /^(Use WBS groups|Make by hand|Switching…)$/ });

    it('starts on what the plan holds, with the button shaded because there is nothing to change', () => {
      const a = actions();
      mount(a);
      expect(screen.getByRole('radio', { name: 'By hand' })).toBeChecked();
      expect(switchButton()).toHaveAttribute('aria-disabled', 'true');
      expect(switchButton()).toHaveAccessibleDescription('Swimlanes already come from this.');
      fireEvent.click(switchButton());
      expect(a.switchSource).not.toHaveBeenCalled();
    });

    it('switches to the WBS in one write at the plan’s version, as one undo step, and announces', async () => {
      const a = actions();
      mount(a);
      fireEvent.click(screen.getByRole('radio', { name: /One per WBS group/ }));
      expect(switchButton()).not.toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(switchButton());
      await waitFor(() =>
        expect(a.switchSource).toHaveBeenCalledWith(planFacts('MANUAL'), {
          source: 'WBS',
          level: 2,
          codeTypeId: null,
        }),
      );
      await waitFor(() => expect(announced()).toBe('Swimlanes now follow the WBS at level 2.'));
      // Nothing of the hand-made list is touched: it is kept for the way back.
      expect(a.remove).not.toHaveBeenCalled();
      expect(a.add).not.toHaveBeenCalled();
    });

    it('while the WBS leads, hides the hand-made list and says what is kept', () => {
      mount(actions(), GATE, { plan: planFacts('WBS', 2) });
      expect(screen.getByRole('radio', { name: /One per WBS group at level 2/ })).toBeChecked();
      expect(screen.queryByRole('list', { name: 'Swimlanes' })).not.toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: 'New swimlane' })).not.toBeInTheDocument();
      expect(
        screen.getByText(/follow the WBS at level 2.*you made by hand \(3\) are kept/),
      ).toBeInTheDocument();
    });

    it('switches back to by hand in one write that names no level', async () => {
      const a = actions();
      mount(a, GATE, { plan: planFacts('WBS', 2) });
      fireEvent.click(screen.getByRole('radio', { name: 'By hand' }));
      fireEvent.click(switchButton());
      await waitFor(() =>
        expect(a.switchSource).toHaveBeenCalledWith(planFacts('WBS', 2), {
          source: 'MANUAL',
          level: null,
          codeTypeId: null,
        }),
      );
      await waitFor(() => expect(announced()).toBe('Swimlanes are now made by hand.'));
    });

    it('changes the level of a WBS plan as a switch of its own', async () => {
      const a = actions();
      mount(a, GATE, { plan: planFacts('WBS', 2) });
      expect(switchButton()).toHaveAttribute('aria-disabled', 'true');
      fireEvent.change(screen.getByRole('combobox', { name: 'WBS level' }), {
        target: { value: '1' },
      });
      fireEvent.click(switchButton());
      await waitFor(() =>
        expect(a.switchSource).toHaveBeenCalledWith(planFacts('WBS', 2), {
          source: 'WBS',
          level: 1,
          codeTypeId: null,
        }),
      );
    });

    it('shades the source button without the pen, saying why, and writes nothing', () => {
      const a = actions();
      mount(a, PEN);
      fireEvent.click(screen.getByRole('radio', { name: /One per WBS group/ }));
      expect(switchButton()).toHaveAttribute('aria-disabled', 'true');
      expect(switchButton()).toHaveAccessibleDescription(/Start editing to change swimlanes\./);
      fireEvent.click(switchButton());
      expect(a.switchSource).not.toHaveBeenCalled();
    });

    it('shows a refusal and leaves the picker where the planner put it', async () => {
      const a = actions({
        switchSource: vi.fn().mockRejectedValue(new Error('Changed elsewhere.')),
      });
      mount(a);
      fireEvent.click(screen.getByRole('radio', { name: /One per WBS group/ }));
      fireEvent.click(switchButton());
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not change where swimlanes come from: Changed elsewhere.',
      );
      expect(screen.getByRole('radio', { name: /One per WBS group/ })).toBeChecked();
    });

    it('names its button for the pick, and says only the button applies a change of source', () => {
      mount(actions());
      expect(switchButton()).toHaveAccessibleName('Make by hand');
      fireEvent.click(screen.getByRole('radio', { name: /One per WBS group/ }));
      expect(switchButton()).toHaveAccessibleName('Use WBS groups');
      expect(screen.getByText(/changes nothing until you press the button below/)).toBeVisible();
    });

    it('shows a level that still holds a summary when the plan was saved at one that has emptied', () => {
      // Level 3 has no summary in WBS_PLAN: the select must not show it, nor would a switch write it.
      mount(actions(), GATE, { plan: planFacts('WBS', 3) });
      expect(screen.getByRole('combobox', { name: 'WBS level' })).toHaveValue('2');
      expect(switchButton()).not.toHaveAttribute('aria-disabled', 'true');
    });

    it('has no axe violations while the WBS leads', async () => {
      const { baseElement } = mount(actions(), GATE, { plan: planFacts('WBS', 2) });
      expect((await axe(baseElement)).violations).toEqual([]);
    });
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
    orgSlug: 'acme',
    plan: planFacts('MANUAL', null, 1),
    afterDelete: vi.fn(),
    swimlanes: LIST,
    activities,
    actions: actions(),
    gate: GATE,
  });

  it('walks nothing while every dialog is shut, and not again on a re-render once one is open', () => {
    const { walks, counted } = countingActivities();
    const { rerender } = render(withAnnouncer(<SwimlaneDialogs {...props(counted, false)} />));
    expect(walks.n).toBe(0);
    // Opening walks the list for the member counts and for the WBS levels the picker offers.
    rerender(withAnnouncer(<SwimlaneDialogs {...props(counted, true)} />));
    const opened = walks.n;
    expect(opened).toBeGreaterThan(0);
    rerender(withAnnouncer(<SwimlaneDialogs {...props(counted, true)} />));
    expect(walks.n).toBe(opened);
  });
});
