import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { deriveCodesGate, type CodesGate } from '../model/codes-gating';

import { CodesDialog } from './CodesDialog';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { ApiFetchError, apiFetch, apiFetchAllPages, apiFetchEnvelope } from '@/lib/api/client';
import { anActivity } from '@/test/activity-fixture';
import { aType, aValue, codesServer, type CodesServer } from '@/test/codes-server';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: vi.fn(),
  apiFetchAllPages: vi.fn(),
  apiFetchEnvelope: vi.fn(),
}));

const OPEN: CodesGate = deriveCodesGate({ writable: true, reason: null, roleDenied: false });
const PEN: CodesGate = deriveCodesGate({
  writable: false,
  reason: 'Start editing to change codes.',
  roleDenied: false,
});
const ROLE: CodesGate = deriveCodesGate({
  writable: false,
  reason: 'Your role cannot change codes.',
  roleDenied: true,
});

/** Three activities on L1, one on GF, and one on Trade MEP — the delete sentences count from these. */
const ACTIVITIES: ActivitySummary[] = [
  ...['a1', 'a2', 'a3'].map((id) =>
    anActivity({ id, codes: [{ codeTypeId: 'area', codeValueId: 'l1' }] }),
  ),
  anActivity({ id: 'a4', codes: [{ codeTypeId: 'area', codeValueId: 'gf' }] }),
  anActivity({ id: 'a5', codes: [{ codeTypeId: 'trade', codeValueId: 'mep' }] }),
];

let server: CodesServer;

/** Point the mocked client at the current server. */
function wire(): void {
  vi.mocked(apiFetchAllPages).mockReset().mockImplementation(server.api.apiFetchAllPages);
  vi.mocked(apiFetchEnvelope).mockReset().mockImplementation(server.api.apiFetchEnvelope);
  vi.mocked(apiFetch).mockReset().mockImplementation(server.api.apiFetch);
}
const record = vi.fn();
const onClose = vi.fn();
let queryClient: QueryClient;

function tree(gate: CodesGate = OPEN, open = true): React.ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <AnnouncerProvider>
        <CodesDialog
          open={open}
          onClose={onClose}
          orgSlug="acme"
          planId="p1"
          activities={ACTIVITIES}
          gate={gate}
          record={record}
        />
      </AnnouncerProvider>
    </QueryClientProvider>
  );
}

function mount(gate: CodesGate = OPEN) {
  const view = render(tree(gate));
  return {
    ...view,
    reopen: (next: CodesGate) => view.rerender(tree(next)),
  };
}

const announced = (): string => screen.getByTestId('announcer').textContent;
const dialog = (): HTMLElement => screen.getByRole('dialog', { name: 'Codes' });
const settled = async (typeName = 'Area'): Promise<void> => {
  await screen.findByRole('heading', { name: new RegExp(`^${typeName} · `) });
  await screen.findByRole('table', { name: `${typeName} values` });
};
/**
 * Focus an element the way a browser does: `focus()` and the `focusin` that follows it. This jsdom
 * does not send the second, and React's `onFocus` listens for it.
 */
const focusLikeABrowser = (element: HTMLElement): void => {
  act(() => {
    element.focus();
    fireEvent.focusIn(element);
  });
};
const shortCodes = (typeName = 'Area'): string[] =>
  within(screen.getByRole('table', { name: `${typeName} values` }))
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0]?.textContent ?? '');

beforeEach(() => {
  server = codesServer();
  wire();
  record.mockReset();
  onClose.mockReset();
  // The app's own staleness (`lib/query/query-client.ts`): without it every remount refetches.
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0, staleTime: 30_000 } },
  });
});

describe('opening the dialog', () => {
  it('shows the types as a rail in order and the first type’s values beside it', async () => {
    mount();
    await settled();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Area',
      'Trade',
      'Phase',
    ]);
    expect(screen.getByRole('tablist', { name: 'Code types' })).toHaveAttribute(
      'aria-orientation',
      'vertical',
    );
    expect(shortCodes()).toEqual(['GF', 'L1', 'L2', 'RF']);
    expect(screen.getByRole('heading', { name: 'Area · 4 values' })).toBeInTheDocument();
  });

  it('costs TWO requests — the types without values, then the first type’s values — and no more', async () => {
    mount();
    await settled();
    expect(server.requests).toEqual([
      'GET /organizations/acme/plans/p1/code-types?values=none',
      'GET /organizations/acme/plans/p1/code-types/area/values?limit=1000',
    ]);
  });

  it('describes itself in the product’s word and never calls the classification an activity code', async () => {
    mount();
    await settled();
    expect(dialog()).toHaveAccessibleDescription(
      'P6 activity codes. Changes apply at once. Each is one step you can undo.',
    );
    expect(dialog().textContent).not.toMatch(/activity code(?!s\.)/i);
  });

  it('fetches nothing while it is shut', () => {
    render(tree(OPEN, false));
    expect(server.requests).toEqual([]);
  });

  it('puts focus on the selected tab', async () => {
    mount();
    await settled();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Area' })).toHaveFocus());
  });

  it('has no axe violations', async () => {
    const { baseElement } = mount();
    await settled();
    expect((await axe(baseElement)).violations).toEqual([]);
  });
});

describe('arrowing through the rail', () => {
  it('reads each uncached type once: ten types make ten value requests, and going back makes none', async () => {
    const many = {
      types: Array.from({ length: 10 }, (_, i) => aType(`t${String(i)}`, `Type ${String(i)}`, i)),
      values: Array.from({ length: 10 }, (_, i) =>
        aValue(`v${String(i)}`, `t${String(i)}`, `V${String(i)}`, 0),
      ),
    };
    server = codesServer(many);
    wire();
    mount();
    await settled('Type 0');
    for (let i = 1; i < 10; i += 1) {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'ArrowDown' });
      await settled(`Type ${String(i)}`);
    }
    expect(server.readCount(/\/values\?limit/)).toBe(10);
    for (let i = 8; i >= 0; i -= 1) {
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'ArrowUp' });
      await settled(`Type ${String(i)}`);
    }
    expect(server.readCount(/\/values\?limit/)).toBe(10);
    // …and the types themselves were read once.
    expect(server.readCount(/code-types\?values=none$/)).toBe(1);
  });
});

describe('the states', () => {
  it('says one sentence while the types load, in the settled shape', async () => {
    vi.mocked(apiFetchAllPages).mockImplementation(() => new Promise(() => undefined));
    mount();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Loading codes…'));
  });

  it('shows an error with Try again, and no Add form, when the types cannot be read', async () => {
    // Refused every time: the list's own single retry would otherwise read the second attempt.
    vi.mocked(apiFetchAllPages).mockRejectedValue(new Error('offline'));
    mount();
    expect(await screen.findByText('Codes could not be loaded.')).toBeInTheDocument();
    expect(screen.queryByLabelText('New code type')).not.toBeInTheDocument();
    vi.mocked(apiFetchAllPages).mockImplementation(server.api.apiFetchAllPages);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await settled();
  });

  it('says what to do when the plan has no codes, and puts focus in the Add form', async () => {
    server = codesServer({ types: [], values: [] });
    wire();
    mount();
    expect(
      await screen.findByText(
        'This plan has no codes yet. Add a code type, such as Area or Trade.',
      ),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('New code type')).toHaveFocus());
  });

  it('says the same without the invitation to a reader who cannot add', async () => {
    server = codesServer({ types: [], values: [] });
    wire();
    mount(ROLE);
    expect(await screen.findByText('This plan has no codes yet.')).toBeInTheDocument();
    expect(screen.queryByLabelText('New code type')).not.toBeInTheDocument();
  });

  it('gives the pane its own empty and error states while the rail stays usable', async () => {
    mount();
    await settled();
    fireEvent.click(screen.getByRole('tab', { name: 'Trade' }));
    await settled('Trade');
    server.values.set('phase', []);
    fireEvent.click(screen.getByRole('tab', { name: 'Phase' }));
    expect(await screen.findByText('Phase has no values yet. Add one below.')).toBeInTheDocument();

    vi.mocked(apiFetchEnvelope).mockRejectedValue(new Error('offline'));
    server.types.push(aType('system', 'System', 3));
    await act(() => queryClient.invalidateQueries());
    fireEvent.click(await screen.findByRole('tab', { name: 'System' }));
    expect(await screen.findByText('System’s values could not be loaded.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Area' })).toBeEnabled();
  });
});

describe('adding', () => {
  it('adds a type, selects its tab, announces it, and moves focus to its Add value field', async () => {
    mount();
    await settled();
    fireEvent.change(screen.getByLabelText('New code type'), { target: { value: ' System ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add code type' }));
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'System', selected: true })).toBeInTheDocument(),
    );
    expect(server.writes[0]).toMatchObject({ method: 'POST', body: { name: 'System' } });
    expect(announced()).toBe('Code type System added.');
    await waitFor(() => expect(screen.getByLabelText('Short code')).toHaveFocus());
    expect(record).toHaveBeenCalledTimes(1);
    expect((record.mock.calls[0]?.[0] as { label: string }).label).toBe('Add code type “System”');
  });

  it('refuses a duplicate name beside the field, ignoring case, and sends nothing', async () => {
    mount();
    await settled();
    fireEvent.change(screen.getByLabelText('New code type'), { target: { value: 'trade' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add code type' }));
    expect(
      await screen.findByText('A code type called “trade” already exists.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('New code type')).toHaveFocus();
    expect(server.writes).toEqual([]);
  });

  it('adds a value, clears the field, keeps focus there, and announces it', async () => {
    mount();
    await settled();
    const field = screen.getByLabelText('Short code');
    fireEvent.change(field, { target: { value: 'L3' } });
    fireEvent.change(screen.getByLabelText('Description (optional)'), {
      target: { value: 'Level 3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add value' }));
    await waitFor(() => expect(announced()).toBe('Value L3 added to Area.'));
    expect(server.writes[0]).toMatchObject({
      method: 'POST',
      path: '/organizations/acme/plans/p1/code-types/area/values',
      body: { shortCode: 'L3', description: 'Level 3' },
    });
    await waitFor(() => expect(shortCodes()).toEqual(['GF', 'L1', 'L2', 'RF', 'L3']));
    expect(screen.getByLabelText('Short code')).toHaveValue('');
    expect(screen.getByLabelText('Short code')).toHaveFocus();
  });

  it('refuses a short code the type already has, and says the type’s name', async () => {
    mount();
    await settled();
    fireEvent.change(screen.getByLabelText('Short code'), { target: { value: 'l1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add value' }));
    expect(await screen.findByText('Area already has a value “l1”.')).toBeInTheDocument();
    expect(screen.getByLabelText('Short code')).toHaveFocus();
    expect(server.writes).toEqual([]);
  });

  it('puts the server’s refusal in words under the form', async () => {
    mount();
    await settled();
    server.failNext = new ApiFetchError(409, {
      code: 'CONFLICT',
      message: 'taken',
      details: { reason: 'CODE_VALUE_TAKEN' },
    });
    fireEvent.change(screen.getByLabelText('Short code'), { target: { value: 'L9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add value' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not add L9: Area already has a value with that short code',
    );
  });
});

describe('renaming and editing', () => {
  it('renames a type from the pane, and the rail and heading follow', async () => {
    mount();
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Rename…' }));
    const rename = await screen.findByRole('dialog', { name: 'Rename code type' });
    const field = within(rename).getByLabelText('Name');
    await waitFor(() => expect(field).toHaveFocus());
    fireEvent.change(field, { target: { value: 'Zone' } });
    fireEvent.click(within(rename).getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Zone' })).toBeInTheDocument());
    expect(announced()).toBe('Code type renamed to Zone.');
    expect(server.writes[0]).toMatchObject({ method: 'PATCH', body: { name: 'Zone', version: 1 } });
  });

  it('edits a value’s short code and clears its description with null', async () => {
    mount();
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit L2' }));
    const edit = await screen.findByRole('dialog', { name: 'Edit value' });
    fireEvent.change(within(edit).getByLabelText('Short code'), { target: { value: ' L2A ' } });
    fireEvent.change(within(edit).getByLabelText('Description'), { target: { value: '' } });
    fireEvent.click(within(edit).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(announced()).toBe('Value L2A updated.'));
    expect(server.writes[0]).toMatchObject({
      method: 'PATCH',
      path: '/organizations/acme/plans/p1/code-values/l2',
      body: { shortCode: 'L2A', description: null, version: 3 },
    });
  });

  it('does not offer a short code another value of the type already has', async () => {
    mount();
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit L2' }));
    const edit = await screen.findByRole('dialog', { name: 'Edit value' });
    fireEvent.change(within(edit).getByLabelText('Short code'), { target: { value: 'gf' } });
    fireEvent.click(within(edit).getByRole('button', { name: 'Save' }));
    expect(await within(edit).findByText('Area already has a value “gf”.')).toBeInTheDocument();
    expect(server.writes).toEqual([]);
  });
});

describe('moving', () => {
  it('moves a value up sending EVERY live value with its current version, and keeps focus on the control', async () => {
    mount();
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Move RF up' }));
    await waitFor(() => expect(announced()).toBe('RF moved to position 3 of 4.'));
    expect(server.writes[0]).toMatchObject({
      method: 'PATCH',
      path: '/organizations/acme/plans/p1/code-types/area/values/order',
      body: {
        order: [
          { id: 'gf', version: 1 },
          { id: 'l1', version: 2 },
          { id: 'rf', version: 4 },
          { id: 'l2', version: 3 },
        ],
      },
    });
    await waitFor(() => expect(shortCodes()).toEqual(['GF', 'L1', 'RF', 'L2']));
    expect(screen.getByRole('button', { name: 'Move RF up' })).toHaveFocus();
    expect((record.mock.calls[0]?.[0] as { label: string }).label).toBe('Move value “RF”');
  });

  it('shades a move that has nowhere to go and says why, without sending anything', async () => {
    mount();
    await settled();
    const first = screen.getByRole('button', { name: 'Move GF up' });
    expect(first).toHaveAttribute('aria-disabled', 'true');
    expect(first).toHaveAccessibleDescription('GF is already first.');
    fireEvent.click(first);
    expect(screen.getByRole('button', { name: 'Move RF down' })).toHaveAccessibleDescription(
      'RF is already last.',
    );
    expect(server.writes).toEqual([]);
  });

  it('moves a type down from the pane and re-orders the rail', async () => {
    mount();
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Move down' }));
    await waitFor(() =>
      expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
        'Trade',
        'Area',
        'Phase',
      ]),
    );
    expect(announced()).toBe('Area moved to position 2 of 3.');
    expect((record.mock.calls[0]?.[0] as { label: string }).label).toBe('Move code type “Area”');
  });

  it('shades Move up on the first type', async () => {
    mount();
    await settled();
    expect(screen.getByRole('button', { name: 'Move up' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Move up' })).toHaveAccessibleDescription(
      'Area is already first.',
    );
  });
});

describe('deleting', () => {
  it('counts the carriers from the activities in memory, and deletes with the version', async () => {
    mount();
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete L1' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Delete L1?' });
    expect(confirm).toHaveAccessibleDescription(
      '3 activities carry it. They will read as having no Area until you restore it.',
    );
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete value' }));
    await waitFor(() => expect(announced()).toBe('Value L1 deleted. Undo brings it back.'));
    expect(server.writes[0]).toMatchObject({
      method: 'DELETE',
      path: '/organizations/acme/plans/p1/code-values/l1?version=2',
    });
    expect((record.mock.calls[0]?.[0] as { label: string }).label).toBe('Delete value “L1”');
  });

  it('hands focus to the next row’s Delete once the row has left', async () => {
    mount();
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete L1' }));
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete value' }));
    await waitFor(() => expect(shortCodes()).toEqual(['GF', 'L2', 'RF']));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete L2' })).toHaveFocus());
  });

  it('says nobody carries a value nobody carries', async () => {
    mount();
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete L2' }));
    expect(
      await screen.findByRole('alertdialog', { name: 'Delete L2?' }),
    ).toHaveAccessibleDescription(
      'No activity carries it. You can restore it from Deleted values.',
    );
  });

  it('shows the server’s refusal inside the confirmation and leaves the value there', async () => {
    mount();
    await settled();
    server.failNext = new ApiFetchError(409, { code: 'CONFLICT', message: 'stale' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete L1' }));
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete value' }));
    expect(await within(confirm).findByRole('alert')).toHaveTextContent(
      'Could not delete L1: the codes were changed by someone else.',
    );
  });

  it('deletes a type with its values, selects the neighbouring tab and focuses it', async () => {
    mount();
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete…' }));
    const confirm = await screen.findByRole('alertdialog', {
      name: 'Delete Area and its 4 values?',
    });
    expect(confirm).toHaveAccessibleDescription(
      '4 activities carry a value of Area. They will read as having no Area until you restore it.',
    );
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete code type' }));
    await waitFor(() =>
      expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Trade', 'Phase']),
    );
    await settled('Trade');
    expect(screen.getByRole('tab', { name: 'Trade', selected: true })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Trade' })).toHaveFocus());
    expect((record.mock.calls[0]?.[0] as { label: string }).label).toBe('Delete code type “Area”');
  });

  it('puts the Q3 sentence in the confirmation when the swimlanes are made from the type', async () => {
    mount();
    await settled();
    server.failNext = new ApiFetchError(409, {
      code: 'CONFLICT',
      message: 'source',
      details: { reason: 'CODE_TYPE_IS_SWIMLANE_SOURCE' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete…' }));
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete code type' }));
    expect(await within(confirm).findByRole('alert')).toHaveTextContent(
      'the swimlanes are made from Area. Choose another swimlane source first.',
    );
  });
});

describe('when somebody else changes the list', () => {
  it('hands focus to the same action on the neighbouring row when a colleague deletes the row you were on', async () => {
    mount();
    await settled();
    focusLikeABrowser(screen.getByRole('button', { name: 'Delete L1' }));
    server.removeValueBehindMyBack('area', 'l1');
    await act(() => queryClient.invalidateQueries());
    await waitFor(() => expect(shortCodes()).toEqual(['GF', 'L2', 'RF']));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Delete L2' })).toHaveFocus());
  });

  it('selects the neighbouring tab and focuses it when a colleague deletes the selected type', async () => {
    mount();
    await settled();
    fireEvent.click(screen.getByRole('tab', { name: 'Trade' }));
    await settled('Trade');
    focusLikeABrowser(screen.getByRole('tab', { name: 'Trade' }));
    server.removeTypeBehindMyBack('trade');
    await act(() => queryClient.invalidateQueries());
    await waitFor(() =>
      expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Area', 'Phase']),
    );
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Phase', selected: true })).toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Phase' })).toHaveFocus());
  });

  it('leaves focus alone when the reader had already moved on to something that is still there', async () => {
    mount();
    await settled();
    fireEvent.click(screen.getByRole('tab', { name: 'Trade' }));
    await settled('Trade');
    const field = screen.getByLabelText('New code type');
    focusLikeABrowser(field);
    server.removeTypeBehindMyBack('trade');
    await act(() => queryClient.invalidateQueries());
    await waitFor(() =>
      expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Area', 'Phase']),
    );
    expect(field).toHaveFocus();
  });
});

describe('the pen and the role', () => {
  it('shades every write in place with one visible sentence they all point to', async () => {
    mount(PEN);
    await settled();
    const sentence = screen.getAllByText('Start editing to change codes.');
    expect(sentence).toHaveLength(1);
    for (const name of [
      'Add code type',
      'Add value',
      'Rename…',
      'Delete…',
      'Edit L1',
      'Delete L1',
    ]) {
      const control = screen.getByRole('button', { name });
      expect(control).toHaveAttribute('aria-disabled', 'true');
      expect(control).not.toBeDisabled();
      expect(control).toHaveAccessibleDescription(/Start editing to change codes\./);
    }
    expect(screen.getByLabelText('New code type')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Short code')).toHaveAttribute('readonly');
  });

  it('sends nothing when a shaded control is pressed', async () => {
    mount(PEN);
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Add code type' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete L1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move RF up' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(server.writes).toEqual([]);
  });

  it('shades in place when the pen is lost mid-dialog, and focus does not move', async () => {
    const { reopen } = mount(OPEN);
    await settled();
    const control = screen.getByRole('button', { name: 'Delete L2' });
    control.focus();
    reopen(PEN);
    expect(screen.getByRole('button', { name: 'Delete L2' })).toBe(control);
    expect(control).toHaveFocus();
    expect(control).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Start editing to change codes.')).toBeInTheDocument();
  });

  it('shows a role that can never write a read-only list: no forms, no row actions, no restore lists', async () => {
    mount(ROLE);
    await settled();
    expect(shortCodes()).toEqual(['GF', 'L1', 'L2', 'RF']);
    expect(screen.getByText('Your role cannot change codes.')).toBeInTheDocument();
    for (const name of [
      'Add code type',
      'Add value',
      'Rename…',
      'Delete…',
      'Edit L1',
      'Move down',
    ]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Deleted code types' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deleted values' })).not.toBeInTheDocument();
    // Still readable, and Close is still there.
    expect(screen.getAllByRole('button', { name: 'Close' }).length).toBeGreaterThan(0);
  });
});

describe('restoring', () => {
  it('reads nothing deleted until the list is opened, then restores a type and records it', async () => {
    server.types.push(aType('old', 'Old area', 3, { deletedAt: '2026-09-01T00:00:00Z' }));
    mount();
    await settled();
    expect(server.readCount(/include=deleted/)).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Deleted code types' }));
    const restore = await screen.findByRole('button', { name: 'Restore Old area' });
    expect(server.readCount(/include=deleted/)).toBe(1);
    fireEvent.click(restore);
    await waitFor(() => expect(announced()).toBe('Code type Old area restored.'));
    expect(server.writes[0]).toMatchObject({
      method: 'POST',
      path: '/organizations/acme/plans/p1/code-types/old/restore',
    });
    expect((record.mock.calls[0]?.[0] as { label: string }).label).toBe(
      'Restore code type “Old area”',
    );
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Old area' })).toBeInTheDocument());
  });

  it('says nothing is deleted when nothing is', async () => {
    mount();
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Deleted values' }));
    expect(await screen.findByText('Nothing deleted.')).toBeInTheDocument();
  });

  it('lists a type’s deleted values by short code and description, and restores one', async () => {
    server.values
      .get('area')
      ?.push(aValue('old', 'area', 'B1', 4, 'Basement', { deletedAt: '2026-09-01T00:00:00Z' }));
    mount();
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Deleted values' }));
    expect(await screen.findByText(/B1 — Basement/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore B1 — Basement' }));
    await waitFor(() => expect(announced()).toBe('Value B1 restored.'));
    expect((record.mock.calls[0]?.[0] as { label: string }).label).toBe(
      'Restore value “B1” of Area',
    );
  });

  it('shades Restore without the pen but keeps the list readable', async () => {
    server.types.push(aType('old', 'Old area', 3, { deletedAt: '2026-09-01T00:00:00Z' }));
    mount(PEN);
    await settled();
    fireEvent.click(screen.getByRole('button', { name: 'Deleted code types' }));
    const restore = await screen.findByRole('button', { name: 'Restore Old area' });
    expect(restore).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(restore);
    expect(server.writes).toEqual([]);
  });
});

describe('closing', () => {
  it('asks its host to close from Close, and forgets the selected type for the next opening', async () => {
    const { rerender } = mount();
    await settled();
    fireEvent.click(screen.getByRole('tab', { name: 'Trade' }));
    await settled('Trade');
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!);
    expect(onClose).toHaveBeenCalledTimes(1);
    rerender(tree(OPEN, false));
    rerender(tree(OPEN, true));
    await settled('Area');
  });
});
