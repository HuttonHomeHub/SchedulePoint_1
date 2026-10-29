import type { ActivitySummary } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { activityKeys } from '../api/use-activities';
import { deriveActivityEditorGating } from '../lib/activity-editor-gating';

import {
  ActivitiesTable,
  type ActivitiesTableCodeBulk,
  type ActivitiesTableSwimlanes,
} from './ActivitiesTable';

import type { SwimlaneAssignment } from '@/features/tsld/model/swimlane-assignment';
import { anActivity } from '@/test/activity-fixture';

/**
 * **The Codes row of the ticked-rows bar** (P6 activity codes, M3-T3). The table learns nothing of
 * codes: the host hands it a renderer, and this suite pins what only the table can get wrong — that
 * ticking appears when a renderer is given and not otherwise, that the renderer is given the ticked
 * rows at the live list's versions and the editor's own `codes` gate, and that the swimlane and WBS
 * bars still own the container when they are present.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  WBS_IMPROVEMENTS_ENABLED: true,
}));

const ROWS: ActivitySummary[] = [
  anActivity({ id: 'a1', name: 'Excavate', version: 4 }),
  anActivity({ id: 'a2', name: 'Blind', version: 7 }),
  anActivity({ id: 'sum', name: 'Substructure', type: 'WBS_SUMMARY' }),
];

const GATING = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: false,
  canWrite: true,
  canProgress: true,
  canReadCost: true,
});

function renderTable(
  codeBulk: ActivitiesTableCodeBulk | undefined,
  rows: ActivitySummary[] = ROWS,
  swimlanes?: ActivitiesTableSwimlanes,
) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(activityKeys.listByPlan('acme', 'pl1'), rows);
  return render(
    <QueryClientProvider client={queryClient}>
      <ActivitiesTable
        orgSlug="acme"
        planId="pl1"
        canEditSchedule
        editorGating={GATING}
        calendars={[]}
        onOpenEditor={() => {}}
        {...(codeBulk ? { codeBulk } : {})}
        {...(swimlanes ? { swimlanes } : {})}
      />
    </QueryClientProvider>,
  );
}

describe('ActivitiesTable — the Codes row', () => {
  it('offers no tick box on a plan with no summaries and no renderer: the table is as it was', () => {
    renderTable(undefined, [ROWS[0]!, ROWS[1]!]);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('offers tick boxes when a renderer is given, even with no summary to file things under', () => {
    renderTable(() => <p>Codes row</p>, [ROWS[0]!, ROWS[1]!]);
    expect(screen.getByRole('checkbox', { name: 'Select Excavate' })).toBeInTheDocument();
  });

  it('renders nothing until a row is ticked, then hands over the ticked rows as the list holds them', () => {
    const renderer = vi.fn<ActivitiesTableCodeBulk>(() => <p>Codes row</p>);
    renderTable(renderer, [ROWS[0]!, ROWS[1]!]);
    expect(renderer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Excavate' }));
    const input = renderer.mock.calls.at(-1)?.[0];
    expect(input?.activities.map((a) => [a.id, a.version])).toEqual([['a1', 4]]);
    expect(screen.getByText('Codes row')).toBeInTheDocument();
  });

  it('gives it the editor’s codes gate by identity: the pen reason is the editor’s sentence', () => {
    const renderer = vi.fn<ActivitiesTableCodeBulk>(() => null);
    renderTable(renderer, [ROWS[0]!, ROWS[1]!]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Excavate' }));
    expect(renderer.mock.calls.at(-1)?.[0].gate).toBe(GATING.codes);
    expect(GATING.codes).toBe(GATING.general);
  });

  it('is a companion inside the WBS bar when the plan has summaries, so the count is said once', () => {
    const renderer = vi.fn<ActivitiesTableCodeBulk>(() => <p>Codes row</p>);
    renderTable(renderer);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Excavate' }));
    expect(renderer.mock.calls.at(-1)?.[0].companion).toBe(true);
    expect(screen.getByText('Codes row')).toBeInTheDocument();
  });

  it('owns the container itself when nothing else does', () => {
    const renderer = vi.fn<ActivitiesTableCodeBulk>(() => <p>Codes row</p>);
    renderTable(renderer, [ROWS[0]!, ROWS[1]!]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Excavate' }));
    expect(renderer.mock.calls.at(-1)?.[0].companion).toBe(false);
  });

  it('clears the selection when the renderer reports a set landed', () => {
    const renderer: ActivitiesTableCodeBulk = ({ onDone }) => (
      <button type="button" onClick={onDone}>
        Done
      </button>
    );
    renderTable(renderer, [ROWS[0]!, ROWS[1]!]);
    const box = screen.getByRole('checkbox', { name: 'Select Excavate' });
    fireEvent.click(box);
    expect(box).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByRole('checkbox', { name: 'Select Excavate' })).not.toBeChecked();
  });

  it('sits inside the swimlane bar when there is one and no summary, so Clear selection is said once', () => {
    const assignment: SwimlaneAssignment = {
      shown: true,
      choices: [{ id: null, name: 'No swimlane' }],
      currentOf: () => null,
      assign: vi.fn(),
    };
    const renderer = vi.fn<ActivitiesTableCodeBulk>(() => <p>Codes row</p>);
    renderTable(renderer, [ROWS[0]!, ROWS[1]!], { source: 'MANUAL', assignment });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Excavate' }));
    expect(renderer.mock.calls.at(-1)?.[0].companion).toBe(true);
    expect(screen.getByText('Codes row')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Clear selection' })).toHaveLength(1);
  });
});
