import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ActivityEditor, type ActivityEditorShell } from './ActivityEditorDialog';

import { deriveActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';

/**
 * **The subject-change guard** (Graphite M6-T3).
 *
 * A modal gets this for free: it is the only thing on screen, so the activity it is editing cannot
 * change while it is open. A drawer sits beside a live canvas, and selecting another bar is one
 * click — at which point `useScopeForm`'s `[open, activity?.id]` effect re-seeds all three scopes
 * and every unsaved edit is gone with no cue that it happened.
 *
 * These cases render the editor in a **passthrough shell** — no `<Dialog>` — which is the drawer's
 * chrome, because that is the arrangement where the hazard exists.
 *
 * **What makes each assertion discriminate**, stated because the T2 tests in this epic did not and
 * had to be corrected: the first case asserts the field still holds the typed value AFTER the
 * subject prop changed, which is exactly what re-seeding destroys; the second asserts the field
 * shows the NEW subject's value, which only happens if the adopt path ran. Both were verified red
 * against the pre-guard component.
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
    percentCompleteType: 'DURATION',
    accrualType: 'UNIFORM',
    version: 1,
  } as ActivitySummary;
}

const A = row('a1', 'Excavate');
const B = row('a2', 'Pour slab');

/** The drawer's chrome: the children, and nothing around them. */
const passthrough: ActivityEditorShell = ({ children }) => <>{children}</>;

function mount(props: { activity: ActivitySummary; onSubjectHeld?: (id: string) => void }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ActivityEditor
        shell={passthrough}
        orgSlug="acme"
        planId="plan-1"
        open
        onClose={() => {}}
        gating={GATING}
        planActivities={[A, B]}
        {...props}
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

function nameField(): HTMLInputElement {
  return screen.getByLabelText<HTMLInputElement>(/^Name/);
}

describe('the activity editor holds its subject while work is unsaved', () => {
  it('keeps the typed value and asks, rather than re-seeding, when the subject changes', async () => {
    const { rerender } = mount({ activity: A });
    fireEvent.change(nameField(), { target: { value: 'Excavate — revised' } });
    expect(nameField().value).toBe('Excavate — revised');

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={client}>
        <ActivityEditor
          shell={passthrough}
          orgSlug="acme"
          planId="plan-1"
          open
          onClose={() => {}}
          gating={GATING}
          planActivities={[A, B]}
          activity={B}
        />
      </QueryClientProvider>,
    );

    // The confirmation names BOTH the work at risk and where it is going — a discard prompt that
    // does not say what you are switching to cannot be answered.
    await waitFor(() => expect(screen.getByText(/Discard unsaved changes\?/)).toBeInTheDocument());
    expect(screen.getByText(/Switching to Pour slab will discard them/)).toBeInTheDocument();
    // **The assertion that discriminates**: the draft is still there. Re-seeding is precisely what
    // would have replaced it with "Pour slab".
    expect(nameField().value).toBe('Excavate — revised');
    expect(screen.getByRole('button', { name: 'Keep editing' })).toBeInTheDocument();
  });

  it('adopts the new subject when the planner discards', async () => {
    const { rerender } = mount({ activity: A });
    fireEvent.change(nameField(), { target: { value: 'Excavate — revised' } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={client}>
        <ActivityEditor
          shell={passthrough}
          orgSlug="acme"
          planId="plan-1"
          open
          onClose={() => {}}
          gating={GATING}
          planActivities={[A, B]}
          activity={B}
        />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText(/Discard unsaved changes\?/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(nameField().value).toBe('Pour slab'));
  });

  it('puts the host back when the planner keeps editing', async () => {
    const held = vi.fn();
    const { rerender } = mount({ activity: A, onSubjectHeld: held });
    fireEvent.change(nameField(), { target: { value: 'Excavate — revised' } });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={client}>
        <ActivityEditor
          shell={passthrough}
          orgSlug="acme"
          planId="plan-1"
          open
          onClose={() => {}}
          gating={GATING}
          planActivities={[A, B]}
          activity={B}
          onSubjectHeld={held}
        />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText(/Discard unsaved changes\?/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    // Named with the id the editor is HOLDING, not the one it refused — the host has to know what
    // to re-select, and the refused one is what the canvas already shows.
    expect(held).toHaveBeenCalledWith('a1');
    expect(nameField().value).toBe('Excavate — revised');
  });

  it('adopts a new subject silently when nothing is unsaved', async () => {
    const { rerender } = mount({ activity: A });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={client}>
        <ActivityEditor
          shell={passthrough}
          orgSlug="acme"
          planId="plan-1"
          open
          onClose={() => {}}
          gating={GATING}
          planActivities={[A, B]}
          activity={B}
        />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(nameField().value).toBe('Pour slab'));
    expect(screen.queryByText(/Discard unsaved changes\?/)).not.toBeInTheDocument();
  });
});
