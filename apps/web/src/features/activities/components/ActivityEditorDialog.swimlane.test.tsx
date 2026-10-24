import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
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

function mount(swimlaneSlot?: React.ReactNode) {
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

  it('renders the host’s control in the General tab, inside its form and before Save general', () => {
    mount(<div data-testid="swimlane-slot">Swimlane control</div>);
    const slot = screen.getByTestId('swimlane-slot');
    const form = slot.closest('form');
    expect(form).not.toBeNull();
    const save = within(form!).getByRole('button', { name: 'Save general' });
    expect(slot.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
