import { type ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityEditor, type ActivityEditorShell } from './ActivityEditorDialog';

import { deriveActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';

/**
 * **The editor tells the truth about ALL six of its scopes** (unsaved-work guard, M2-T3).
 *
 * It named three. `dirtyScopeNames` covered General, Scheduling and Cost, while the Progress tab
 * holds three more forms of its own — `ReportedProgressPanel`, `ValueMeasurePanel` and
 * `WeightedStepsPanel`. `requestClose` returns `onClose()` outright when that array is empty, so a
 * planner who edited a weighted step and pressed Escape lost it with no confirmation at all. That
 * is `docs/TECH_DEBT.md` #63's second half, and it is what these cases pin.
 *
 * **Each was verified red against the pre-lift component**, where the Progress panels reported
 * nothing and the confirmation could not know they were dirty. The three General/Scheduling/Cost
 * cases are deliberately NOT re-tested here — `ActivityEditorDialog.test.tsx` already owns them,
 * and they passed unchanged through this refactor, which is what makes the replacement provably a
 * no-op for the scopes that already worked.
 */
const GATING = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: true,
  canWrite: true,
  canProgress: true,
  canReadCost: true,
});

function row(id: string, name: string): ActivitySummary {
  return {
    id,
    planId: 'plan-1',
    name,
    code: id.toUpperCase(),
    type: 'TASK',
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    durationDays: 5,
    percentComplete: 0,
    percentCompleteType: 'DURATION',
    accrualType: 'UNIFORM',
    version: 1,
  } as ActivitySummary;
}

const A = row('a1', 'Excavate');
const passthrough: ActivityEditorShell = ({ children }) => <>{children}</>;

function mount(onClose = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <ActivityEditor
        shell={passthrough}
        orgSlug="acme"
        planId="plan-1"
        open
        onClose={onClose}
        gating={GATING}
        planActivities={[A]}
        activity={A}
      />
    </QueryClientProvider>,
  );
  return { ...view, onClose };
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

async function openProgressTab(): Promise<void> {
  fireEvent.click(screen.getByRole('tab', { name: /progress/i }));
  await waitFor(() =>
    expect(screen.getByRole('tab', { name: /progress/i })).toHaveAttribute('aria-selected', 'true'),
  );
}

describe('the editor reports every dirty scope, not only the three it used to', () => {
  it('a dirty Progress-tab panel blocks the close', async () => {
    const { onClose } = mount();
    await openProgressTab();

    // `% complete` belongs to ValueMeasurePanel, not ReportedProgressPanel — established by
    // probing the rendered copy rather than assumed, after the first draft of this test asserted
    // the wrong scope name and failed against a component that was working correctly.
    fireEvent.change(await screen.findByLabelText(/% complete/i), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: /^close/i }));

    // The discriminator: pre-lift this closed silently, because the panel's dirtiness never
    // reached `dirtyScopeNames`.
    expect(onClose).not.toHaveBeenCalled();
    expect(
      await screen.findByRole('alertdialog', { name: /discard unsaved changes/i }),
    ).toBeInTheDocument();
  });

  it('names the specific scope in the confirmation, so the reader knows what is at risk', async () => {
    mount();
    await openProgressTab();
    fireEvent.change(await screen.findByLabelText(/% complete/i), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: /^close/i }));

    // Naming it is the point: "something is unsaved" sends the reader hunting across four tabs.
    // And the name must be the SECTION HEADING on screen — this asserted 'Value measure' until the
    // ux review found the scope labels were shorthand that appeared nowhere in the interface, with
    // 'Progress' additionally colliding with the name of the tab hosting all three panels.
    expect(
      await screen.findByText(/How value is measured has unsaved changes/i),
    ).toBeInTheDocument();
  });

  it('still closes silently when nothing anywhere is dirty', async () => {
    const { onClose } = mount();
    await openProgressTab();
    fireEvent.click(screen.getByRole('button', { name: /^close/i }));

    // The other half of the guard: a report that is dirty about everything is as useless as one
    // that is dirty about nothing, and over-warning is what gets a guard deleted.
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
