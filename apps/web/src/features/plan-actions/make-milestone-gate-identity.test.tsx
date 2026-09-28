import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildSelectionBarContext } from './build-selection-context';
import type * as GateModule from './make-milestone-gate';
import * as gateModule from './make-milestone-gate';

import { activityKeys } from '@/features/activities/api/use-activities';
import { ActivitiesTable } from '@/features/activities/components/ActivitiesTable';
import { deriveActivityEditorGating } from '@/features/activities/lib/activity-editor-gating';
import { anActivity } from '@/test/activity-fixture';

/**
 * **Make milestone… shades from ONE gate object on every surface** (ADR-0162 decision 4, spec D6).
 *
 * The derivation takes the workspace's `activityEditorGating.general` and must be handed THAT
 * object, not a second `{ writable, reason }` assembled beside it. Two derivations of "may this
 * person write" both look right alone, and only a planner who met the same activity on two surfaces
 * would ever see them give different reasons (the ADR-0062 identity shape).
 *
 * **The table case is the one that means something.** The canvas bar and the Gantt row menu share
 * one registry item and one builder, so they cannot drift from each other; the activities table is
 * the one independent, hand-kept roster. The builder and host cases are confirmation.
 *
 * Verified red (M4 record): handing the table's derivation `{ ...gate }` fails the identity
 * assertion; handing it `{ writable: canEditSchedule, reason: null }` fails the sentence assertion.
 */
vi.mock('./make-milestone-gate', async (importOriginal) => {
  const actual = await importOriginal<typeof GateModule>();
  return { ...actual, deriveMakeMilestoneGate: vi.fn(actual.deriveMakeMilestoneGate) };
});

/** A Planner who does not hold the pen — built by the REAL derivation, never a literal. */
const GATING = deriveActivityEditorGating({
  penManaged: true,
  holdsPen: false,
  canWrite: true,
  canProgress: true,
  canReadCost: true,
});

const ZERO = anActivity({
  id: 'z1',
  name: 'Pour slab',
  durationDays: 0,
  durationMinutes: 0,
  resourceAssignmentCount: 0,
});

const derive = vi.mocked(gateModule.deriveMakeMilestoneGate);

describe('Make milestone… — one gate object on every surface', () => {
  it('the activities table derives from editorGating.general BY IDENTITY', () => {
    derive.mockClear();
    const queryClient = new QueryClient();
    queryClient.setQueryData(activityKeys.listByPlan('acme', 'pl1'), [ZERO]);
    render(
      <QueryClientProvider client={queryClient}>
        <ActivitiesTable
          onOpenEditor={() => {}}
          onMakeMilestone={() => {}}
          orgSlug="acme"
          planId="pl1"
          canEditSchedule={false}
          canReportProgress
          calendars={[]}
          editorGating={GATING}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Pour slab' }));

    expect(derive).toHaveBeenCalled();
    for (const [, gate] of derive.mock.calls) expect(gate).toBe(GATING.general);

    const item = screen.getByRole('menuitem', { name: gateModule.MAKE_MILESTONE_LABEL });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    // Character for character — the gate's own sentence, and a real one.
    expect(item).toHaveAccessibleDescription(GATING.general.reason ?? '');
    expect(GATING.general.reason ?? '').not.toBe('');
  });

  it('the selection-bar builder passes the gate through untouched', () => {
    derive.mockClear();
    const ctx = buildSelectionBarContext({
      canvas: null,
      activities: [ZERO],
      selectedId: 'z1',
      selectionCount: 1,
      canEditSchedule: false,
      scheduleRefusal: () => null,
      canReportProgress: true,
      canWriteNotes: true,
      onOpenLogic: () => {},
      onEdit: () => {},
      onDelete: () => {},
      definitionGate: GATING.general,
      onMakeMilestone: () => {},
    });
    expect(ctx?.definitionGate).toBe(GATING.general);
    expect(derive.mock.calls[0]?.[1]).toBe(GATING.general);
    expect(ctx?.makeMilestone).toEqual({
      applies: true,
      enabled: false,
      reason: GATING.general.reason,
    });
  });

  it('the builder omits the action when the host supplies no handler (never lit and inert)', () => {
    const ctx = buildSelectionBarContext({
      canvas: null,
      activities: [ZERO],
      selectedId: 'z1',
      selectionCount: 1,
      canEditSchedule: true,
      scheduleRefusal: () => null,
      canReportProgress: true,
      canWriteNotes: true,
      onOpenLogic: () => {},
      onEdit: () => {},
      onDelete: () => {},
      definitionGate: GATING.general,
    });
    expect(ctx?.makeMilestone).toEqual({ applies: false });
  });

  it('both workspace hosts hand the bar the model’s general gate', () => {
    // Structural, and labelled so: the canvas and Gantt bars share this builder, so the only thing
    // that can differ between them is what each host passes in. A render of the whole workspace to
    // read one prop would prove the same thing at forty times the cost.
    const root = join(import.meta.dirname, '..', '..');
    const workspace = readFileSync(
      join(root, 'components', 'layout', 'workspace', 'plan-workspace-toolbar.tsx'),
      'utf8',
    );
    expect(workspace).toContain('definitionGate={model.activityEditorGating.general}');
    expect(workspace).toContain('definitionGate: model.activityEditorGating.general,');
    const panel = readFileSync(
      join(root, 'features', 'tsld', 'components', 'TsldPanel.tsx'),
      'utf8',
    );
    const call = panel.slice(panel.indexOf('buildSelectionBarContext({'));
    expect(call.slice(0, call.indexOf('}),'))).toMatch(/\n\s+definitionGate,\n/);
  });
});
