import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { codeTypesQueryOptions } from '../api/use-code-types';

import { CodeAssignButton } from './CodeAssignButton';

import { AnnouncerProvider } from '@/components/ui/announcer';
import type { Command } from '@/features/undo-redo';
import { apiFetch, apiFetchAllPages, apiFetchEnvelope } from '@/lib/api/client';
import { anActivity } from '@/test/activity-fixture';
import { codesServer, type CodesServer } from '@/test/codes-server';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: vi.fn(),
  apiFetchAllPages: vi.fn(),
  apiFetchEnvelope: vi.fn(),
}));

const SELECTED: ActivitySummary[] = [
  anActivity({ id: 'a1', name: 'Piling', version: 3, codes: [] }),
  anActivity({ id: 'a2', name: 'Pour', version: 5, codes: [] }),
  anActivity({ id: 'a3', name: 'Roofing', version: 1, codes: [] }),
];

let server: CodesServer;
const record = vi.fn<(command: Command) => void>();

/** The host only offers the button once the plan's types are loaded, so the cache is warm here too. */
async function mount(gate = { writable: true, reason: null as string | null }): Promise<void> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, retryDelay: 0, staleTime: 30_000 } },
  });
  await queryClient.prefetchQuery(codeTypesQueryOptions('acme', 'p1'));
  render(
    <QueryClientProvider client={queryClient}>
      <AnnouncerProvider>
        <CodeAssignButton
          orgSlug="acme"
          planId="p1"
          activities={SELECTED}
          gate={gate}
          record={record}
        />
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  server = codesServer();
  vi.mocked(apiFetchAllPages).mockReset().mockImplementation(server.api.apiFetchAllPages);
  vi.mocked(apiFetchEnvelope).mockReset().mockImplementation(server.api.apiFetchEnvelope);
  vi.mocked(apiFetch).mockReset().mockImplementation(server.api.apiFetch);
  record.mockReset();
});

describe('CodeAssignButton', () => {
  it('opens a panel with focus on the code select', async () => {
    await mount();
    fireEvent.click(screen.getByRole('button', { name: 'Set code…' }));
    const select = await screen.findByLabelText('Code type');
    expect(select).toHaveFocus();
  });

  it('sets one value on every selected activity as ONE request and one undo record, then closes', async () => {
    await mount();
    const trigger = screen.getByRole('button', { name: 'Set code…' });
    fireEvent.click(trigger);
    await screen.findByRole('option', { name: 'Area', hidden: true });
    fireEvent.change(screen.getByLabelText('Code type'), { target: { value: 'area' } });
    const picker = screen.getByRole('combobox', { name: 'Value' });
    await waitFor(() => expect(picker).not.toBeDisabled());
    fireEvent.keyDown(picker, { key: 'ArrowDown' });
    const list = within(screen.getByRole('listbox'));
    const option = await list.findByRole('option', { name: /Roof/ });
    const index = list.getAllByRole('option').indexOf(option);
    for (let i = 0; i < index; i += 1) fireEvent.keyDown(picker, { key: 'ArrowDown' });
    fireEvent.keyDown(picker, { key: 'Enter' });
    await screen.findByText(/^Sets Area to Roof on 3 activities/);
    fireEvent.click(screen.getByRole('button', { name: 'Set Area' }));

    await waitFor(() => expect(screen.queryByLabelText('Code type')).toBeNull());
    expect(server.writes).toHaveLength(1);
    expect(record).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveFocus();
  });

  it('is shaded with its reason, and a press opens nothing', async () => {
    await mount({ writable: false, reason: 'Start editing to change codes.' });
    const trigger = screen.getByRole('button', { name: 'Set code…' });
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    expect(trigger).toHaveAccessibleDescription('Start editing to change codes.');
    fireEvent.click(trigger);
    expect(screen.queryByLabelText('Code type')).toBeNull();
  });
});
