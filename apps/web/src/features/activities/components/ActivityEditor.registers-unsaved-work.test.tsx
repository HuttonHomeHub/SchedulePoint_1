import { type ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  UnsavedWorkProvider,
  useUnsavedWorkReports,
} from '@/components/layout/unsaved-work/unsaved-work-provider';
import {
  ActivityEditor,
  type ActivityEditorShell,
} from '@/features/activities/components/ActivityEditorDialog';
import { deriveActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';

const GATING = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: true,
  canWrite: true,
  canProgress: true,
  canReadCost: true,
});
const A = {
  id: 'a1',
  planId: 'plan-1',
  name: 'Excavate',
  code: 'A1',
  type: 'TASK',
  durationType: 'FIXED_DURATION_AND_UNITS_TIME',
  durationDays: 5,
  percentComplete: 0,
  percentCompleteType: 'DURATION',
  accrualType: 'UNIFORM',
  version: 1,
} as ActivitySummary;
const passthrough: ActivityEditorShell = ({ children }) => <>{children}</>;
function Readout(): React.ReactElement {
  const r = useUnsavedWorkReports();
  return (
    <output data-testid="reg">{r.flatMap((x) => x.scopes.map((s) => s.label)).join('|')}</output>
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

/**
 * **The seam between the editor and the shell registry** (unsaved-work guard).
 *
 * The editor's own suites mount it alone and the registry's suites use a synthetic registrant, so
 * neither can tell whether a real dirty scope reaches the real registry — which is the seam the
 * navigation guard reads. ADR-0081 records that shape as this repository's most repeated defect:
 * two halves that are each correct and a join nothing exercises.
 */
describe('editor registers with the shell registry', () => {
  it('a dirty scope appears in the registry', () => {
    const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={c}>
        <UnsavedWorkProvider>
          <Readout />
          <ActivityEditor
            shell={passthrough}
            orgSlug="acme"
            planId="plan-1"
            open
            onClose={() => {}}
            gating={GATING}
            planActivities={[A]}
            activity={A}
          />
        </UnsavedWorkProvider>
      </QueryClientProvider>,
    );
    expect(screen.getByTestId('reg').textContent).toBe('');
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Excavate — revised' } });
    expect(screen.getByTestId('reg').textContent).toBe('General');
  });
});
