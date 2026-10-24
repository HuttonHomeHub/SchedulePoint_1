import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityEditorDialog } from './ActivityEditorDialog';

import { deriveActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';

/**
 * The editor's **Swimlane** section (swimlanes M2-T10, ui-architecture C10): the same Move to
 * swimlane… control the selection bars use, handed in as a slot because it plans its write against
 * the diagram's own projection. The editor only decides whether there is a section and where it sits.
 */
const TASK = {
  id: 'act-1',
  planId: 'plan-1',
  name: 'Pour slab',
  code: 'A100',
  type: 'TASK',
  parentId: null,
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  durationDays: 5,
  percentCompleteType: 'DURATION',
  accrualType: 'UNIFORM',
  version: 1,
} as ActivitySummary;

const GATING = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: true,
  canWrite: true,
  canProgress: true,
  canReadCost: true,
});

function mount(swimlaneSlot?: (s: { generalDirty: boolean }) => React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ActivityEditorDialog
        orgSlug="acme"
        planId="plan-1"
        open
        onClose={() => {}}
        activity={TASK}
        gating={GATING}
        planActivities={[TASK]}
        intent={{ activityId: 'act-1', tab: 'general' }}
        {...(swimlaneSlot ? { swimlaneSlot } : {})}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: [] }),
      } as unknown as Response),
    ),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('ActivityEditorDialog — the Swimlane section', () => {
  it('has no section while the host offers no swimlanes (source NONE)', () => {
    mount();
    expect(screen.queryByTestId('swimlane-slot')).toBeNull();
  });

  it('renders the host’s control in the General tab, after Save general', () => {
    mount(() => <div data-testid="swimlane-slot">Swimlane control</div>);
    const slot = screen.getByTestId('swimlane-slot');
    const save = screen.getByRole('button', { name: 'Save general' });
    expect(save.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sits outside the General form, in its own region, and is not part of Save general', () => {
    mount(() => <div data-testid="swimlane-slot">Swimlane control</div>);
    expect(screen.getByTestId('swimlane-slot').closest('form')).toBeNull();
  });

  it('says so when General has unsaved edits, and a Move leaves them and Save general working', async () => {
    const patches: { version: number; name?: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) => {
        if (init?.method === 'PATCH') {
          const body = JSON.parse(init.body as string) as { version: number; name?: string };
          patches.push(body);
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ data: { ...TASK, version: body.version + 1 } }),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ data: [] }),
        } as unknown as Response);
      }),
    );
    function Host() {
      // The Move bumps the row's version, as the positions batch does; the live query hands the new
      // row to the editor, which must neither reset its form nor save against the old version.
      const [row, setRow] = useState(TASK);
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      return (
        <QueryClientProvider client={client}>
          <ActivityEditorDialog
            orgSlug="acme"
            planId="plan-1"
            open
            onClose={() => {}}
            activity={row}
            gating={GATING}
            planActivities={[row]}
            intent={{ activityId: 'act-1', tab: 'general' }}
            swimlaneSlot={({ generalDirty }) => (
              <div data-testid="swimlane-slot">
                <button type="button" onClick={() => setRow({ ...row, version: row.version + 1 })}>
                  Fake move
                </button>
                {generalDirty ? <p>Your unsaved changes to this tab aren’t affected.</p> : null}
              </div>
            )}
          />
        </QueryClientProvider>
      );
    }
    render(<Host />);
    expect(screen.queryByText(/unsaved changes to this tab/)).toBeNull();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pour slab 2' } });
    expect(screen.getByText(/unsaved changes to this tab/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fake move' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Pour slab 2');

    fireEvent.click(screen.getByRole('button', { name: 'Save general' }));
    await waitFor(() => expect(patches).toHaveLength(1));
    expect(patches[0]).toMatchObject({ name: 'Pour slab 2', version: 2 });
  });
});
