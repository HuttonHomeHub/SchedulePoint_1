import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';
import { deriveActivityEditorGating } from '../lib/activity-editor-gating';

import { ActivitiesTable } from './ActivitiesTable';

/**
 * The table's **Make milestone…** row action (ADR-0162 decision 4), driven.
 *
 * The canvas bar and the Gantt row menu render the one registry item; this roster is hand-kept, so
 * `make-milestone-label.structural.test.ts` pins its label and `make-milestone-gate-identity.test.tsx`
 * its gate object. Neither presses the item. The M6 UX review found this third entry point with no
 * interaction coverage of its own, so these cases open the row's menu and press it. Focus return
 * after the dialog closes is a browser question (a native `<dialog>`'s restore), which the
 * workspace-chrome and Gantt journeys answer for the shared dialog.
 */

const BASE: Pick<
  ActivitySummary,
  'id' | 'name' | 'type' | 'parentId' | 'durationMinutes' | 'resourceAssignmentCount'
> = {
  id: 'a1',
  name: 'Handover',
  type: 'TASK',
  parentId: null,
  durationMinutes: 0,
  resourceAssignmentCount: 0,
};

function renderTable(row: Partial<ActivitySummary>, onMakeMilestone = vi.fn()) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(activityKeys.listByPlan('acme', 'pl1'), [{ ...BASE, ...row }]);
  render(
    <QueryClientProvider client={queryClient}>
      <ActivitiesTable
        onOpenEditor={() => {}}
        onMakeMilestone={onMakeMilestone}
        orgSlug="acme"
        planId="pl1"
        canEditSchedule
        editorGating={deriveActivityEditorGating({
          penManaged: true,
          holdsPen: true,
          canWrite: true,
          canProgress: false,
          canReadCost: true,
        })}
        calendars={[]}
      />
    </QueryClientProvider>,
  );
  return onMakeMilestone;
}

function openMenuFor(name: string): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }));
  return screen.getByRole('menu');
}

describe('ActivitiesTable — Make milestone… row action', () => {
  it('offers it on a zero-duration task and hands the row to the host', () => {
    const onMakeMilestone = renderTable({});
    fireEvent.click(
      within(openMenuFor('Handover')).getByRole('menuitem', { name: /^Make milestone…/ }),
    );
    expect(onMakeMilestone).toHaveBeenCalledTimes(1);
    expect(onMakeMilestone.mock.calls[0]?.[0]).toMatchObject({ id: 'a1' });
  });

  it('omits it on a task that has a duration', () => {
    renderTable({ durationMinutes: 480, resourceAssignmentCount: null });
    expect(
      within(openMenuFor('Handover')).queryByRole('menuitem', { name: /^Make milestone…/ }),
    ).not.toBeInTheDocument();
  });

  it('shades it with the reason when the task still has resource assignments', () => {
    const onMakeMilestone = renderTable({ resourceAssignmentCount: 1 });
    const item = within(openMenuFor('Handover')).getByRole('menuitem', {
      name: /^Make milestone…/,
    });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveAccessibleDescription(
      'It has 1 resource assignment. A milestone does no work; remove it in Resources first.',
    );
    fireEvent.click(item);
    expect(onMakeMilestone).not.toHaveBeenCalled();
  });
});
