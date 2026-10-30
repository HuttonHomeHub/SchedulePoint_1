import type { ActivitySummary, CodeTypeSummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import type { SwimlaneActions } from '../model/use-swimlane-actions';

import { SwimlaneManageDialog } from './SwimlaneManageDialog';
import { SwimlaneSetupDialog } from './SwimlaneSetupDialog';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { apiFetchAllPages, apiFetchEnvelope } from '@/lib/api/client';
import { anActivity } from '@/test/activity-fixture';
import { aType } from '@/test/codes-server';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: vi.fn(),
  apiFetchAllPages: vi.fn(),
  apiFetchEnvelope: vi.fn(),
}));

const GATE = { writable: true, reason: null as string | null };
const PEN = { writable: false, reason: 'Start editing to change swimlanes.' };

const AREA = aType('area', 'Area', 0);
const TRADE = aType('trade', 'Trade', 1);
const ROOM = aType('room', 'Room', 2);

const facts = (
  swimlaneSource: 'NONE' | 'MANUAL' | 'ACTIVITY_CODE',
  swimlaneCodeTypeId: string | null = null,
) => ({ id: 'p1', version: 7, swimlaneSource, swimlaneWbsLevel: null, swimlaneCodeTypeId });

/** Area: two values in use. Trade: one value, carried only by a WBS summary (so none in use). */
const ACTIVITIES: ActivitySummary[] = [
  anActivity({ id: 'a1', codes: [{ codeTypeId: 'area', codeValueId: 'gf' }] }),
  anActivity({ id: 'a2', codes: [{ codeTypeId: 'area', codeValueId: 'l1' }] }),
  anActivity({
    id: 's1',
    type: 'WBS_SUMMARY',
    codes: [{ codeTypeId: 'trade', codeValueId: 'civ' }],
  }),
];

/** 101 activities each carrying their own Room value: one past what swimlanes can show. */
const WIDE: ActivitySummary[] = Array.from({ length: 101 }, (_, i) =>
  anActivity({
    id: `w${String(i)}`,
    codes: [{ codeTypeId: 'room', codeValueId: `r${String(i)}` }],
  }),
);

function actions(overrides: Partial<SwimlaneActions> = {}): SwimlaneActions {
  return {
    add: vi.fn(),
    addAfter: vi.fn(),
    rename: vi.fn(),
    move: vi.fn(),
    remove: vi.fn(),
    setManualSource: vi.fn(),
    switchSource: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

let types: CodeTypeSummary[];
let queryClient: QueryClient;
const typesPending = { on: false };

beforeEach(() => {
  types = [AREA, TRADE, ROOM];
  typesPending.on = false;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(apiFetchAllPages)
    .mockReset()
    .mockImplementation((path: string) =>
      /\/code-types/.test(path) && !typesPending.on
        ? Promise.resolve([...types])
        : /\/code-types/.test(path)
          ? new Promise(() => undefined)
          : Promise.resolve([]),
    );
  vi.mocked(apiFetchEnvelope)
    .mockReset()
    .mockResolvedValue({ data: [], meta: { nextCursor: null, hasMore: false } });
});

const wrap = (ui: React.ReactElement): React.ReactElement => (
  <QueryClientProvider client={queryClient}>
    <AnnouncerProvider>{ui}</AnnouncerProvider>
  </QueryClientProvider>
);

const mountSetup = (
  a: SwimlaneActions,
  activities: readonly ActivitySummary[] | undefined,
  gate = GATE,
  onClose = vi.fn(),
) =>
  render(
    wrap(
      <SwimlaneSetupDialog
        open
        onClose={onClose}
        orgSlug="acme"
        plan={facts('NONE')}
        swimlanes={[]}
        activities={activities}
        actions={a}
        gate={gate}
      />,
    ),
  );

const mountManage = (
  a: SwimlaneActions,
  plan = facts('MANUAL'),
  activities: readonly ActivitySummary[] | undefined = ACTIVITIES,
  gate = GATE,
) =>
  render(
    wrap(
      <SwimlaneManageDialog
        open
        onClose={vi.fn()}
        orgSlug="acme"
        plan={plan}
        activities={activities}
        swimlanes={[]}
        memberCounts={new Map()}
        actions={a}
        gate={gate}
        onRename={vi.fn()}
        onDelete={vi.fn()}
      />,
    ),
  );

const codeCard = (): HTMLElement =>
  screen.getByRole('radio', { name: /^One per (code value|value of)/ });
const picker = (): HTMLElement => screen.getByRole('combobox', { name: 'Code' });
const announced = (): string => screen.getByTestId('announcer').textContent;

describe('the code card in the setup dialog', () => {
  it('names the card for the type it will use once the types are known, preselecting the first that can be chosen', async () => {
    mountSetup(actions(), ACTIVITIES);
    // Area is first and has two values in use; Trade's only carrier is a summary, so it has none.
    expect(await screen.findByRole('radio', { name: 'One per value of Area' })).toBeInTheDocument();
    fireEvent.click(codeCard());
    expect(picker()).toHaveValue('Area');
    expect(
      screen.getByText('Activities with no Area, and WBS summaries, are in “No Area”.'),
    ).toBeVisible();
  });

  it('writes the source with the type in one write, announces and closes', async () => {
    const a = actions();
    const onClose = vi.fn();
    mountSetup(a, ACTIVITIES, GATE, onClose);
    fireEvent.click(await screen.findByRole('radio', { name: 'One per value of Area' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set up swimlanes' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(a.switchSource).toHaveBeenCalledTimes(1);
    expect(a.switchSource).toHaveBeenCalledWith(facts('NONE'), {
      source: 'ACTIVITY_CODE',
      level: null,
      codeTypeId: 'area',
      codeTypeName: 'Area',
    });
    expect(a.add).not.toHaveBeenCalled();
    await waitFor(() => expect(announced()).toBe('Swimlanes set up: one per value of Area.'));
  });

  it('prefetches the chosen type’s values so the diagram regroups in one frame', async () => {
    mountSetup(actions(), ACTIVITIES);
    fireEvent.click(await screen.findByRole('radio', { name: 'One per value of Area' }));
    await waitFor(() =>
      expect(vi.mocked(apiFetchEnvelope)).toHaveBeenCalledWith(
        expect.stringContaining('/code-types/area/values'),
      ),
    );
  });

  it('does not read the values of a type until the card is chosen', async () => {
    mountSetup(actions(), ACTIVITIES);
    await screen.findByRole('radio', { name: 'One per value of Area' });
    expect(vi.mocked(apiFetchEnvelope)).not.toHaveBeenCalled();
  });

  it('shades each type that cannot be chosen, saying why, and keeps it reachable', async () => {
    mountSetup(actions(), [...ACTIVITIES, ...WIDE]);
    fireEvent.click(await screen.findByRole('radio', { name: 'One per value of Area' }));
    fireEvent.keyDown(picker(), { key: 'ArrowDown' });
    const trade = await screen.findByRole('option', { name: /^Trade/ });
    expect(trade).toHaveAttribute('aria-disabled', 'true');
    expect(trade).not.toHaveAttribute('disabled');
    expect(trade).toHaveTextContent('0 values in use');
    expect(trade).toHaveTextContent('No activity carries a value of Trade yet.');
    const room = screen.getByRole('option', { name: /^Room/ });
    expect(room).toHaveAttribute('aria-disabled', 'true');
    expect(room).toHaveTextContent('101 values in use');
    expect(room).toHaveTextContent('Room has 101 values in use. Swimlanes can show up to 100.');
    expect(screen.getByRole('option', { name: /^Area/ })).toHaveTextContent('2 values in use');
  });

  it('refuses a shaded type on Enter, keeping the list open and the choice where it was', async () => {
    mountSetup(actions(), [...ACTIVITIES, ...WIDE]);
    fireEvent.click(await screen.findByRole('radio', { name: 'One per value of Area' }));
    fireEvent.keyDown(picker(), { key: 'ArrowDown' });
    // Area, Trade (shaded), Room (shaded): arrow to Room and press Enter.
    fireEvent.keyDown(picker(), { key: 'ArrowDown' });
    fireEvent.keyDown(picker(), { key: 'ArrowDown' });
    fireEvent.keyDown(picker(), { key: 'Enter' });
    await waitFor(() =>
      expect(announced()).toBe('Room has 101 values in use. Swimlanes can show up to 100.'),
    );
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(picker(), { key: 'Escape' });
    expect(picker()).toHaveValue('Area');
  });

  it('closes an open type list on Escape and leaves the dialog open', async () => {
    const onClose = vi.fn();
    mountSetup(actions(), ACTIVITIES, GATE, onClose);
    fireEvent.click(await screen.findByRole('radio', { name: 'One per value of Area' }));
    fireEvent.keyDown(picker(), { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(picker(), { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shades the card, with its reason, when the plan has no codes', async () => {
    types = [];
    mountSetup(actions(), ACTIVITIES);
    await waitFor(() => expect(codeCard()).toHaveAttribute('aria-disabled', 'true'));
    expect(codeCard()).not.toHaveAttribute('disabled');
    expect(codeCard()).toHaveAccessibleDescription(
      'This plan has no codes yet. Add them with Codes… in the Activities panel.',
    );
  });

  it('shades the card when no code has values in use, and still shows each code’s own reason', async () => {
    mountSetup(actions(), [anActivity({ id: 'x' })]);
    await waitFor(() => expect(codeCard()).toHaveAttribute('aria-disabled', 'true'));
    expect(codeCard()).toHaveAccessibleDescription(
      /^No code has between 1 and 100 values in use\./,
    );
    // The sentence points at each code's reason, so the picker is on screen though the card is shaded:
    // open it and read one.
    fireEvent.keyDown(picker(), { key: 'ArrowDown' });
    const area = await screen.findByRole('option', { name: /^Area/ });
    expect(area).toHaveAttribute('aria-disabled', 'true');
    expect(area).toHaveAccessibleDescription(
      'No activity carries a value of Area yet. Set Area on some activities first.',
    );
  });

  it('says the activities have not loaded, rather than that there is nothing to choose', () => {
    mountSetup(actions(), undefined);
    expect(codeCard()).toHaveAttribute('aria-disabled', 'true');
    expect(codeCard()).toHaveAccessibleDescription('The plan’s activities have not loaded yet.');
  });

  it('falls back to by hand when the card was chosen while the codes loaded and none can be chosen', async () => {
    let release: (rows: CodeTypeSummary[]) => void = () => undefined;
    vi.mocked(apiFetchAllPages).mockImplementation((path: string) =>
      /\/code-types/.test(path)
        ? new Promise<never[]>((resolve) => {
            release = resolve as (rows: CodeTypeSummary[]) => void;
          })
        : Promise.resolve([]),
    );
    mountSetup(actions(), [anActivity({ id: 'x' })]);
    fireEvent.click(codeCard());
    expect(screen.getByRole('radio', { name: /^One per code value/ })).toBeChecked();
    release([AREA]);
    await waitFor(() => expect(screen.getByRole('radio', { name: 'By hand' })).toBeChecked());
  });

  it('claims no reason while the types are still on their way', () => {
    typesPending.on = true;
    mountSetup(actions(), ACTIVITIES);
    expect(codeCard()).not.toHaveAttribute('aria-disabled', 'true');
    expect(codeCard()).toHaveAccessibleName('One per code value');
  });

  it('shows the refusal and stays open when the server refuses the code', async () => {
    const a = actions({
      switchSource: vi
        .fn()
        .mockRejectedValue(new Error('That code has been deleted. Choose another.')),
    });
    mountSetup(a, ACTIVITIES);
    fireEvent.click(await screen.findByRole('radio', { name: 'One per value of Area' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set up swimlanes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not set up swimlanes: That code has been deleted. Choose another.',
    );
  });

  it('writes nothing without the pen, saying why', async () => {
    const a = actions();
    mountSetup(a, ACTIVITIES, PEN);
    fireEvent.click(await screen.findByRole('radio', { name: 'One per value of Area' }));
    const submit = screen.getByRole('button', { name: 'Set up swimlanes' });
    expect(submit).toHaveAttribute('aria-disabled', 'true');
    expect(submit).toHaveAccessibleDescription(/Start editing to change swimlanes\./);
    fireEvent.click(submit);
    expect(a.switchSource).not.toHaveBeenCalled();
  });

  it('has no axe violations with the picker open', async () => {
    const { baseElement } = mountSetup(actions(), [...ACTIVITIES, ...WIDE]);
    fireEvent.click(await screen.findByRole('radio', { name: 'One per value of Area' }));
    fireEvent.keyDown(picker(), { key: 'ArrowDown' });
    expect((await axe(baseElement)).violations).toEqual([]);
  });
});

describe('the code card in the manage dialog', () => {
  const switchButton = (): HTMLElement =>
    screen.getByRole('button', { name: /^(Use .+|Make by hand|Switching…)$/ });

  it('switches to the code in one write, names the button for it, and announces', async () => {
    const a = actions();
    mountManage(a);
    fireEvent.click(await screen.findByRole('radio', { name: 'One per value of Area' }));
    expect(switchButton()).toHaveAccessibleName('Use Area');
    fireEvent.click(switchButton());
    await waitFor(() =>
      expect(a.switchSource).toHaveBeenCalledWith(facts('MANUAL'), {
        source: 'ACTIVITY_CODE',
        level: null,
        codeTypeId: 'area',
        codeTypeName: 'Area',
      }),
    );
    await waitFor(() => expect(announced()).toBe('Swimlanes now follow Area.'));
  });

  it('starts on the plan’s own code and reads "already come from this", so the button has nothing to do', async () => {
    const a = actions();
    mountManage(a, facts('ACTIVITY_CODE', 'area'));
    await waitFor(() => expect(picker()).toHaveValue('Area'));
    expect(switchButton()).toHaveAttribute('aria-disabled', 'true');
    expect(switchButton()).toHaveAccessibleDescription('Swimlanes already come from this.');
    fireEvent.click(switchButton());
    expect(a.switchSource).not.toHaveBeenCalled();
  });

  it('keeps the plan’s code selected when it has since become unchoosable, and says so', async () => {
    // Trade is the plan's code, but its only carrier is a summary: shaded in the list, still the held one.
    mountManage(actions(), facts('ACTIVITY_CODE', 'trade'));
    await waitFor(() => expect(picker()).toHaveValue('Trade'));
    expect(switchButton()).toHaveAttribute('aria-disabled', 'true');
  });

  it('switches from one code to another as a switch of its own', async () => {
    types = [AREA, aType('trade', 'Trade', 1)];
    const both = [
      ...ACTIVITIES.slice(0, 2),
      anActivity({ id: 'a3', codes: [{ codeTypeId: 'trade', codeValueId: 'civ' }] }),
    ];
    const a = actions();
    mountManage(a, facts('ACTIVITY_CODE', 'area'), both);
    await waitFor(() => expect(picker()).toHaveValue('Area'));
    fireEvent.keyDown(picker(), { key: 'ArrowDown' });
    fireEvent.pointerDown(await screen.findByRole('option', { name: /^Trade/ }));
    expect(switchButton()).toHaveAccessibleName('Use Trade');
    fireEvent.click(switchButton());
    await waitFor(() =>
      expect(a.switchSource).toHaveBeenCalledWith(facts('ACTIVITY_CODE', 'area'), {
        source: 'ACTIVITY_CODE',
        level: null,
        codeTypeId: 'trade',
        codeTypeName: 'Trade',
      }),
    );
  });

  it('while a code leads, hides the hand-made list and says what is kept', async () => {
    mountManage(actions(), facts('ACTIVITY_CODE', 'area'));
    expect(screen.queryByRole('list', { name: 'Swimlanes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'New swimlane' })).not.toBeInTheDocument();
    expect(
      await screen.findByText(
        'Swimlanes follow Area: one for each value in use, in the order set in Codes…. Set an activity’s Area to move it.',
      ),
    ).toBeInTheDocument();
  });

  it('switches back to by hand in one write that names no code', async () => {
    const a = actions();
    mountManage(a, facts('ACTIVITY_CODE', 'area'));
    fireEvent.click(screen.getByRole('radio', { name: 'By hand' }));
    fireEvent.click(switchButton());
    await waitFor(() =>
      expect(a.switchSource).toHaveBeenCalledWith(facts('ACTIVITY_CODE', 'area'), {
        source: 'MANUAL',
        level: null,
        codeTypeId: null,
      }),
    );
  });

  it('refuses to write a shaded choice and says why instead', async () => {
    const a = actions();
    mountManage(a, facts('MANUAL'), [...ACTIVITIES, ...WIDE]);
    fireEvent.click(await screen.findByRole('radio', { name: 'One per value of Area' }));
    expect(picker()).toHaveValue('Area');
    fireEvent.keyDown(picker(), { key: 'ArrowDown' });
    const room = screen.getByRole('option', { name: /^Room/ });
    expect(within(room).getByText(/Swimlanes can show up to 100\./)).toBeInTheDocument();
    expect(a.switchSource).not.toHaveBeenCalled();
  });

  it('has no axe violations while a code leads', async () => {
    const { baseElement } = mountManage(actions(), facts('ACTIVITY_CODE', 'area'));
    await waitFor(() => expect(picker()).toHaveValue('Area'));
    expect((await axe(baseElement)).violations).toEqual([]);
  });
});
