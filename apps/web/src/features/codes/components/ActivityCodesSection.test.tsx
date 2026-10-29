import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { ActivityCodesSection } from './ActivityCodesSection';

import {
  UnsavedWorkProvider,
  useUnsavedWorkReports,
} from '@/components/layout/unsaved-work/unsaved-work-provider';
import { AnnouncerProvider } from '@/components/ui/announcer';
import { ActivityEditorDialog } from '@/features/activities/components/ActivityEditorDialog';
import { deriveActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';
import type { Command } from '@/features/undo-redo';
import { ApiFetchError, apiFetch, apiFetchAllPages, apiFetchEnvelope } from '@/lib/api/client';
import { codesServer, type CodesServer } from '@/test/codes-server';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch: vi.fn(),
  apiFetchAllPages: vi.fn(),
  apiFetchEnvelope: vi.fn(),
}));

/**
 * **The editor's Codes section, in the real editor** (P6 activity codes, M3-T3): its own scope and its
 * own Save, so the General tab holds two Saves that each send only their own fields (ADR-0060 §3).
 */
const gatingFor = (role: 'planner' | 'viewer', pen: 'held' | 'notHeld' = 'held') =>
  deriveActivityEditorGating({
    penManaged: true,
    holdsPen: pen === 'held',
    canWrite: role === 'planner',
    canProgress: true,
    canReadCost: true,
  });

const baseActivity = (over: Partial<ActivitySummary> = {}): ActivitySummary =>
  ({
    id: 'act-1',
    planId: 'p1',
    name: 'Pour slab',
    code: 'A100',
    type: 'TASK',
    parentId: null,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    durationDays: 5,
    percentCompleteType: 'DURATION',
    accrualType: 'UNIFORM',
    version: 4,
    codes: [
      { codeTypeId: 'area', codeValueId: 'gf' },
      { codeTypeId: 'trade', codeValueId: 'civ' },
    ],
    ...over,
  }) as ActivitySummary;

/** A plan that never used codes: the key is absent, not empty. */
const withoutCodes = (): ActivitySummary => {
  const { codes: _codes, ...rest } = baseActivity();
  return rest;
};

let server: CodesServer;
const record = vi.fn<(command: Command) => void>();
/** Every request the editor itself makes (the General PATCH), apart from the codes ones. */
const generalPatches: { version: number; [key: string]: unknown }[] = [];

function wire(): void {
  vi.mocked(apiFetchAllPages).mockReset().mockImplementation(server.api.apiFetchAllPages);
  vi.mocked(apiFetchEnvelope).mockReset().mockImplementation(server.api.apiFetchEnvelope);
  vi.mocked(apiFetch)
    .mockReset()
    .mockImplementation((path, init) => {
      if (init?.method === 'PATCH' && /\/activities\/act-1$/.test(path)) {
        const body = JSON.parse(init.body as string) as { version: number };
        generalPatches.push(body);
        return Promise.resolve({ ...baseActivity(), version: body.version + 1 });
      }
      return server.api.apiFetch(path, init);
    });
}

function Readout(): React.ReactElement {
  const reports = useUnsavedWorkReports();
  return (
    <output data-testid="reg">
      {reports.flatMap((r) => r.scopes.map((s) => s.label)).join('|')}
    </output>
  );
}

/** The editor open on General, with the section composed in the way the host composes it. */
function Host({
  row,
  gating,
}: {
  row: ActivitySummary;
  gating: ReturnType<typeof gatingFor>;
}): React.ReactElement {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false, retryDelay: 0, staleTime: 30_000 } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <AnnouncerProvider>
        <UnsavedWorkProvider>
          <Readout />
          <ActivityEditorDialog
            orgSlug="acme"
            planId="p1"
            open
            onClose={() => {}}
            gating={gating}
            planActivities={[row]}
            activity={row}
            intent={{ activityId: row.id, tab: 'general' }}
            codesSlot={(state) => (
              <ActivityCodesSection orgSlug="acme" planId="p1" state={state} record={record} />
            )}
          />
        </UnsavedWorkProvider>
      </AnnouncerProvider>
    </QueryClientProvider>
  );
}

const picker = (name: string): HTMLElement => screen.getByRole('combobox', { name });

/** Open a picker with the keyboard and commit the option whose text matches. */
async function pick(typeName: string, optionName: string): Promise<void> {
  const input = picker(typeName);
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  const list = within(screen.getByRole('listbox', { name: `Show ${typeName} values` }));
  const option = await list.findByRole('option', { name: new RegExp(optionName) });
  const index = list.getAllByRole('option').indexOf(option);
  for (let i = 0; i < index; i += 1) fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
}

beforeEach(() => {
  server = codesServer();
  generalPatches.length = 0;
  record.mockReset();
  wire();
});

describe('the Codes section in the editor', () => {
  it('shows one labelled picker per type, each with its current value, from ONE names request', async () => {
    render(<Host row={baseActivity()} gating={gatingFor('planner')} />);
    await waitFor(() => expect(picker('Area')).toHaveValue('GF — Ground floor'), { timeout: 5000 });
    expect(picker('Trade')).toHaveValue('CIV — Civil and groundworks');
    // Phase has no value: None, not blank.
    expect(picker('Phase')).toHaveValue('None');
    expect(server.readCount(/code-values\?id=/)).toBe(1);
    // …and not one values request, until a picker is opened.
    expect(server.readCount(/\/values\?/)).toBe(0);
  });

  it('loads a type’s values the first time its picker is opened, and only that type’s', async () => {
    render(<Host row={baseActivity()} gating={gatingFor('planner')} />);
    await waitFor(() => expect(picker('Area')).toHaveValue('GF — Ground floor'), { timeout: 5000 });
    await pick('Area', 'Roof');
    expect(server.readCount(/code-types\/area\/values/)).toBe(1);
    expect(server.readCount(/code-types\/trade\/values/)).toBe(0);
  });

  it('sends ONLY the changed type, with the activity’s version, to the codes endpoint', async () => {
    render(<Host row={baseActivity()} gating={gatingFor('planner')} />);
    await waitFor(() => expect(picker('Area')).toHaveValue('GF — Ground floor'), { timeout: 5000 });
    await pick('Trade', 'Mechanical');
    fireEvent.click(screen.getByRole('button', { name: 'Save codes' }));
    await waitFor(() => expect(record).toHaveBeenCalledOnce());
    expect(server.writes).toHaveLength(1);
    expect(server.writes[0]?.path).toBe('/organizations/acme/plans/p1/activities/codes');
    expect(server.writes[0]?.body).toEqual({
      activities: [
        { id: 'act-1', version: 4, codes: [{ codeTypeId: 'trade', codeValueId: 'mep' }] },
      ],
    });
    // The codes write carries no definition field, and records one undo step labelled by name.
    expect(generalPatches).toHaveLength(0);
    expect(record.mock.calls[0]?.[0].label).toBe('Set Trade on “Pour slab”');
  });

  it('names the form by the section heading, and does not save on an implicit submit', async () => {
    render(<Host row={baseActivity()} gating={gatingFor('planner')} />);
    await waitFor(() => expect(picker('Area')).toHaveValue('GF — Ground floor'), { timeout: 5000 });
    await pick('Trade', 'Mechanical');
    const form = screen.getByRole('form', { name: 'Codes' });
    expect(form).toHaveAttribute('aria-labelledby');
    // Enter in a picker with its list open and nothing highlighted submits with no submitter.
    fireEvent.submit(form);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(server.writes).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Save codes' }));
    await waitFor(() => expect(server.writes).toHaveLength(1));
  });

  it('says Saved. and is clean again once the save lands', async () => {
    render(<Host row={baseActivity()} gating={gatingFor('planner')} />);
    await waitFor(() => expect(picker('Area')).toHaveValue('GF — Ground floor'), { timeout: 5000 });
    await pick('Trade', 'Mechanical');
    expect(screen.getByTestId('reg')).toHaveTextContent('Codes');
    fireEvent.click(screen.getByRole('button', { name: 'Save codes' }));
    await waitFor(() => expect(screen.getByTestId('reg')).toHaveTextContent(/^$/), {
      timeout: 5000,
    });
    expect(screen.getByText('Saved.')).toBeInTheDocument();
    expect(screen.getByTestId('announcer')).toHaveTextContent('Codes saved.');
  });

  it('keeps the two Saves apart: Save general sends no codes', async () => {
    render(<Host row={baseActivity()} gating={gatingFor('planner')} />);
    await waitFor(() => expect(picker('Area')).toHaveValue('GF — Ground floor'), { timeout: 5000 });
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Pour slab 2' } });
    await pick('Trade', 'Mechanical');
    fireEvent.click(screen.getByRole('button', { name: 'Save general' }));
    await waitFor(() => expect(generalPatches).toHaveLength(1));
    expect(Object.keys(generalPatches[0]!)).not.toContain('codes');
    expect(Object.keys(generalPatches[0]!)).not.toContain('codeTypeId');
    // …and the codes choice is still waiting for its own Save.
    expect(server.writes).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Save codes' })).toHaveAttribute(
      'aria-disabled',
      'false',
    );
  });

  it('is counted by the close confirmation and the navigation guard, and by the General tab’s dot', async () => {
    render(<Host row={baseActivity()} gating={gatingFor('planner')} />);
    await waitFor(() => expect(picker('Area')).toHaveValue('GF — Ground floor'), { timeout: 5000 });
    await pick('Trade', 'Mechanical');
    expect(screen.getByTestId('reg')).toHaveTextContent('Codes');
    expect(screen.getByRole('tab', { name: /General/ })).toHaveAccessibleName(/unsaved changes/);
  });

  it('does not treat choosing what is already saved as a change', async () => {
    render(<Host row={baseActivity()} gating={gatingFor('planner')} />);
    await waitFor(() => expect(picker('Area')).toHaveValue('GF — Ground floor'), { timeout: 5000 });
    await pick('Area', 'Ground floor');
    expect(screen.getByTestId('reg')).toHaveTextContent(/^$/);
    expect(screen.getByRole('button', { name: 'Save codes' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('clears a type with None, sending null', async () => {
    render(<Host row={baseActivity()} gating={gatingFor('planner')} />);
    await waitFor(() => expect(picker('Area')).toHaveValue('GF — Ground floor'), { timeout: 5000 });
    await pick('Area', 'None');
    fireEvent.click(screen.getByRole('button', { name: 'Save codes' }));
    await waitFor(() => expect(server.writes).toHaveLength(1));
    expect(server.writes[0]?.body).toEqual({
      activities: [{ id: 'act-1', version: 4, codes: [{ codeTypeId: 'area', codeValueId: null }] }],
    });
  });

  it('shows a failure in words, stays dirty, and records nothing', async () => {
    render(<Host row={baseActivity()} gating={gatingFor('planner')} />);
    await waitFor(() => expect(picker('Area')).toHaveValue('GF — Ground floor'), { timeout: 5000 });
    await pick('Trade', 'Mechanical');
    server.failNext = new ApiFetchError(409, {
      code: 'CONFLICT',
      message: 'Stale.',
      details: { reason: 'STALE_VERSION' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save codes' }));
    expect(await screen.findByText(/Could not save codes:/)).toBeInTheDocument();
    expect(record).not.toHaveBeenCalled();
    expect(screen.getByTestId('reg')).toHaveTextContent('Codes');
  });

  it('shades the pickers in place, with the pen sentence, for a Planner without the pen', async () => {
    render(<Host row={baseActivity()} gating={gatingFor('planner', 'notHeld')} />);
    await waitFor(() => expect(picker('Area')).toHaveValue('GF — Ground floor'), { timeout: 5000 });
    // Read-only, not disabled: the value stays focusable and copyable (ADR-0083 D1).
    expect(picker('Area')).toHaveAttribute('readonly');
    expect(picker('Area')).not.toBeDisabled();
    fireEvent.keyDown(picker('Area'), { key: 'ArrowDown' });
    expect(picker('Area')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Save codes' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('shows a role that can never write a read-only list, with no pickers and no Save', async () => {
    render(<Host row={baseActivity()} gating={gatingFor('viewer')} />);
    expect(await screen.findByText('Area:')).toBeInTheDocument();
    expect(screen.getByText('Ground floor')).toBeInTheDocument();
    expect(screen.getByText('Phase:')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Area' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save codes' })).not.toBeInTheDocument();
  });

  it('edits a WBS summary like any activity', async () => {
    render(<Host row={baseActivity({ type: 'WBS_SUMMARY' })} gating={gatingFor('planner')} />);
    await waitFor(() => expect(picker('Area')).toHaveValue('GF — Ground floor'), { timeout: 5000 });
    expect(picker('Area')).not.toHaveAttribute('readonly');
  });

  it('says there are no codes yet, to a writer and to a reader', async () => {
    server = codesServer({ types: [], values: [] });
    wire();
    const view = render(<Host row={withoutCodes()} gating={gatingFor('planner')} />);
    expect(
      await screen.findByText(
        'This plan has no codes yet. Add them with Codes… in the Activities panel.',
      ),
    ).toBeInTheDocument();
    view.unmount();
    render(<Host row={withoutCodes()} gating={gatingFor('viewer')} />);
    expect(await screen.findByText('This plan has no codes.')).toBeInTheDocument();
  });

  it('puts a failed load in the section with a way to try again', async () => {
    vi.mocked(apiFetchAllPages).mockRejectedValue(new Error('down'));
    render(<Host row={baseActivity()} gating={gatingFor('planner')} />);
    expect(await screen.findByText('Codes could not be loaded.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const view = render(<Host row={baseActivity()} gating={gatingFor('planner')} />);
    await waitFor(() => expect(picker('Area')).toHaveValue('GF — Ground floor'), { timeout: 5000 });
    expect((await axe(view.baseElement)).violations).toEqual([]);
  });
});
