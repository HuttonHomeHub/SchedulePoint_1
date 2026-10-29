import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { CodeBulkAssignBar } from './CodeBulkAssignBar';

import { AnnouncerProvider } from '@/components/ui/announcer';
import type { Command } from '@/features/undo-redo';
import { ApiFetchError, apiFetch, apiFetchAllPages, apiFetchEnvelope } from '@/lib/api/client';
import { anActivity } from '@/test/activity-fixture';
import { codesServer, type CodesServer } from '@/test/codes-server';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: vi.fn(),
  apiFetchAllPages: vi.fn(),
  apiFetchEnvelope: vi.fn(),
}));

const OPEN = { writable: true, reason: null };
const PEN = { writable: false, reason: 'Start editing to change codes.' };

/** Two on Ground floor, one already on Roof, and one with no Area at all. */
const SELECTED: ActivitySummary[] = [
  anActivity({
    id: 'a1',
    name: 'Piling',
    version: 3,
    codes: [{ codeTypeId: 'area', codeValueId: 'gf' }],
  }),
  anActivity({
    id: 'a2',
    name: 'Pour',
    version: 5,
    codes: [{ codeTypeId: 'area', codeValueId: 'gf' }],
  }),
  anActivity({
    id: 'a3',
    name: 'Roofing',
    version: 1,
    codes: [{ codeTypeId: 'area', codeValueId: 'rf' }],
  }),
  anActivity({ id: 'a4', name: 'Fit out', version: 2, codes: [] }),
];

let server: CodesServer;
let queryClient: QueryClient;
const record = vi.fn<(command: Command) => void>();
const onDone = vi.fn();
const onClear = vi.fn();

function wire(): void {
  vi.mocked(apiFetchAllPages).mockReset().mockImplementation(server.api.apiFetchAllPages);
  vi.mocked(apiFetchEnvelope).mockReset().mockImplementation(server.api.apiFetchEnvelope);
  vi.mocked(apiFetch).mockReset().mockImplementation(server.api.apiFetch);
}

function mount(
  props: Partial<React.ComponentProps<typeof CodeBulkAssignBar>> = {},
): ReturnType<typeof render> {
  return render(
    <QueryClientProvider client={queryClient}>
      <AnnouncerProvider>
        <CodeBulkAssignBar
          orgSlug="acme"
          planId="p1"
          activities={SELECTED}
          gate={OPEN}
          record={record}
          onDone={onDone}
          onClear={onClear}
          {...props}
        />
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
}

/** Choose a type, then a value by its option text, the way a keyboard user does. */
async function choose(typeName: string, optionName: string): Promise<void> {
  await screen.findByRole('option', { name: typeName, hidden: true });
  fireEvent.change(screen.getByLabelText('Code type'), {
    target: { value: typeName === 'Area' ? 'area' : 'trade' },
  });
  const picker = screen.getByRole('combobox', { name: 'Value' });
  await waitFor(() => expect(picker).not.toBeDisabled());
  // ArrowDown opens the list on its first row (None); the primitive commits on pointer-down or Enter.
  fireEvent.keyDown(picker, { key: 'ArrowDown' });
  const list = within(screen.getByRole('listbox'));
  const option = await list.findByRole('option', { name: new RegExp(optionName) });
  const index = list.getAllByRole('option').indexOf(option);
  for (let i = 0; i < index; i += 1) fireEvent.keyDown(picker, { key: 'ArrowDown' });
  fireEvent.keyDown(picker, { key: 'Enter' });
}

beforeEach(() => {
  server = codesServer();
  wire();
  record.mockReset();
  onDone.mockReset();
  onClear.mockReset();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0, staleTime: 30_000 } },
  });
});

describe('CodeBulkAssignBar', () => {
  it('renders nothing when nothing is ticked', () => {
    mount({ activities: [] });
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
  });

  it('says what a press will do, and how many already have it, before it is pressed', async () => {
    mount();
    await choose('Area', 'Roof');
    expect(
      await screen.findByText('Sets Area to Roof on 3 activities. 1 is already set to it.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set Area' })).toHaveAttribute(
      'aria-disabled',
      'false',
    );
  });

  it('sends ONE request carrying only the rows that change, each at its own version', async () => {
    mount();
    await choose('Area', 'Roof');
    await screen.findByText(/^Sets Area to Roof/);
    fireEvent.click(screen.getByRole('button', { name: 'Set Area' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());

    expect(server.writes).toHaveLength(1);
    expect(server.writes[0]).toMatchObject({
      method: 'PATCH',
      path: '/organizations/acme/plans/p1/activities/codes',
    });
    expect(server.writes[0]?.body).toEqual({
      activities: [
        { id: 'a1', version: 3, codes: [{ codeTypeId: 'area', codeValueId: 'rf' }] },
        { id: 'a2', version: 5, codes: [{ codeTypeId: 'area', codeValueId: 'rf' }] },
        { id: 'a4', version: 2, codes: [{ codeTypeId: 'area', codeValueId: 'rf' }] },
      ],
    });
  });

  it('records ONE undo step for the whole set, labelled with the names', async () => {
    mount();
    await choose('Area', 'Roof');
    await screen.findByText(/^Sets Area to Roof/);
    fireEvent.click(screen.getByRole('button', { name: 'Set Area' }));
    await waitFor(() => expect(record).toHaveBeenCalledOnce());
    const command = record.mock.calls[0]?.[0];
    expect(command?.label).toBe('Set Area on 3 activities');
    expect(command?.subjects).toEqual(['a1', 'a2', 'a4']);
    expect(command?.affectsSchedule).toBe(false);
  });

  it('announces the set', async () => {
    mount();
    await choose('Area', 'Roof');
    await screen.findByText(/^Sets Area to Roof/);
    fireEvent.click(screen.getByRole('button', { name: 'Set Area' }));
    await waitFor(() =>
      expect(screen.getByTestId('announcer').textContent).toBe('Set Area to Roof on 3 activities.'),
    );
  });

  it('clears with None, and sends null for the rows that hold a value', async () => {
    mount();
    await choose('Area', 'None');
    expect(
      await screen.findByText('Clears Area on 3 activities. 1 already has no value.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Set Area' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    const rows = (server.writes[0]?.body as { activities: { codes: unknown[] }[] }).activities;
    expect(rows).toHaveLength(3);
    expect(rows[0]?.codes).toEqual([{ codeTypeId: 'area', codeValueId: null }]);
  });

  it('is shaded, not sending, when every ticked row already has the value', async () => {
    mount({ activities: [SELECTED[2]!] });
    await choose('Area', 'Roof');
    expect(await screen.findByText('It’s already set to that Area.')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Set Area' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    expect(server.writes).toHaveLength(0);
  });

  it('is shaded with the pen sentence, and a press writes nothing', async () => {
    mount({ gate: PEN });
    expect(await screen.findByText('Start editing to change codes.')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Set code' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    // Shaded, never natively disabled: it stays focusable (ADR-0204).
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(server.writes).toHaveLength(0);
  });

  it('shades above 2,000 changing rows, with the sentence, and sends nothing', async () => {
    const many = Array.from({ length: 2001 }, (_, i) =>
      anActivity({ id: `m${String(i)}`, name: `M${String(i)}`, codes: [] }),
    );
    mount({ activities: many });
    await choose('Area', 'Roof');
    expect(
      await screen.findByText(
        'You can set a code on up to 2,000 activities at a time. Untick some and try again.',
      ),
    ).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Set Area' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    expect(server.writes).toHaveLength(0);
  });

  it('allows exactly 2,000', async () => {
    const many = Array.from({ length: 2000 }, (_, i) =>
      anActivity({ id: `m${String(i)}`, name: `M${String(i)}`, codes: [] }),
    );
    mount({ activities: many });
    await choose('Area', 'Roof');
    await screen.findByText(/^Sets Area to Roof on 2,?000 activities/);
    expect(screen.getByRole('button', { name: 'Set Area' })).toHaveAttribute(
      'aria-disabled',
      'false',
    );
  });

  it('shows aria-busy and "Setting…" while the write runs, and refuses a second press', async () => {
    mount();
    await choose('Area', 'Roof');
    await screen.findByText(/^Sets Area to Roof/);
    let release: () => void = () => undefined;
    const real = server.api.apiFetch;
    vi.mocked(apiFetch).mockImplementation(
      (path, init) =>
        new Promise((resolve) => {
          release = () => resolve(real(path, init));
        }),
    );
    const button = screen.getByRole('button', { name: 'Set Area' });
    fireEvent.click(button);
    const busy = await screen.findByRole('button', { name: 'Setting…' });
    expect(busy).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(busy);
    release();
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce());
    expect(server.writes).toHaveLength(1);
  });

  it('says what went wrong in words, and does not hand over or record anything', async () => {
    mount();
    await choose('Area', 'Roof');
    await screen.findByText(/^Sets Area to Roof/);
    server.failNext = new ApiFetchError(409, {
      code: 'CONFLICT',
      message: 'Stale.',
      details: { reason: 'STALE_VERSION' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Set Area' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not set Area:');
    expect(onDone).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('offers Clear selection standing alone, and not as a companion', () => {
    const view = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(onClear).toHaveBeenCalledOnce();
    expect(screen.getByText('4 activities selected')).toBeInTheDocument();
    view.unmount();
    mount({ companion: true });
    expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument();
    expect(screen.queryByText('4 activities selected')).not.toBeInTheDocument();
  });

  it('loads a type’s values when the type is chosen, and no other type’s', async () => {
    mount();
    await screen.findByRole('option', { name: 'Area', hidden: true });
    expect(server.readCount(/\/values\?/)).toBe(0);
    fireEvent.change(screen.getByLabelText('Code type'), { target: { value: 'area' } });
    await waitFor(() => expect(server.readCount(/code-types\/area\/values/)).toBe(1));
    expect(server.readCount(/code-types\/trade\/values/)).toBe(0);
  });

  it('has no axe violations', async () => {
    const view = mount();
    await screen.findByRole('option', { name: 'Area', hidden: true });
    expect((await axe(view.container)).violations).toEqual([]);
  });
});
