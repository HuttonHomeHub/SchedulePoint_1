import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * **Flag-ON** host wiring for the convergence epic: with `VITE_ACTIVITY_EDITOR_CONVERGENCE` on,
 * **Logic** is a tab of the one editor, so the Logic dialog must not also be mounted — and the
 * seams that used to be wired into it (undo recording for a removed link, the coalesced keyboard
 * lag nudge, the cross-plan section) must arrive at the editor instead.
 *
 * Each of those three is named in the plan as a thing that dies silently when a surface moves: the
 * chord still fires, the undo stack just quietly stops recording. Hence one assertion each, at the
 * seam rather than through the panel.
 *
 * The flag-OFF counterpart is `activity-editor-convergence.flag-off.test.tsx`.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ACTIVITY_EDITOR_CONVERGENCE_ENABLED: true,
  CANVAS_DIRECT_MANIPULATION_ENABLED: true,
  ENTRY_ROUTES_ENABLED: true,
  RESOURCES_ENABLED: true,
  PROGRAMME_SCHEDULING_ENABLED: true,
}));

vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => vi.fn() }));

vi.mock('@/features/dependencies', () => ({
  DependencyEditor: () => <div data-testid="dependency-editor" />,
}));

vi.mock('@/features/cross-plan-dependencies', () => ({
  CrossPlanLinksSection: () => <div data-testid="cross-plan-section" />,
}));

vi.mock('@/features/notes', () => ({ ActivityNotesSection: () => null }));
vi.mock('@/features/plans', () => ({ PlanFormDialog: () => null }));
vi.mock('@/features/resources', () => ({
  ActivityResourcesDialog: () => <div data-testid="resources-dialog" />,
}));

/** Captures what the editor was handed, so the seams can be asserted without the real panel. */
const editorProps = vi.fn();
vi.mock('@/features/activities', () => ({
  useDeleteActivity: () => ({ mutate: vi.fn(), isPending: false }),
  useBulkDeleteActivities: () => ({ mutateAsync: vi.fn() }),
  useRestoreDeleteBatch: () => ({ mutateAsync: vi.fn() }),
  useDissolveSummary: () => ({ mutate: vi.fn(), isPending: false }),
  isMilestoneType: () => false,
  ActivityFormDialog: () => null,
  ActivityProgressDialog: () => null,
  ActivityStepsDialog: () => null,
  ActivityEditorDialog: (props: Record<string, unknown>) => {
    editorProps(props);
    return <div data-testid="activity-editor" />;
  },
}));

const { PlanDialogs } = await import('./plan-dialogs');
const { ActivityCrudDialogs } = await import('./activity-crud-dialogs');
type Model = Parameters<typeof PlanDialogs>[0]['model'];

const ACTIVITY = { id: 'a1', name: 'Excavate', type: 'TASK', durationType: 'FIXED_DURATION' };

const recordDependencyRemove = vi.fn();
const nudgeDependencyLag = vi.fn();

function makeModel(over: Record<string, unknown> = {}): Model {
  return {
    orgSlug: 'acme',
    planId: 'p1',
    activities: { data: [ACTIVITY], isPending: false, isError: false },
    calendars: { data: [], isPending: false, isError: false },
    // The plan row: the dialogs read its `calendarId` to resolve the duration field's
    // working-hours factor (ADR-0070). Absent leaves that field in whole working days.
    plan: { data: { calendarId: null } },
    canWrite: false,
    canManageLogic: true,
    canEditSchedule: true,
    canProgress: true,
    canWriteNotes: true,
    logicActivity: undefined,
    logicRevealNotes: false,
    setLogicActivity: vi.fn(),
    recordDependencyRemove,
    nudgeDependencyLag,
    resourcesActivity: undefined,
    setResourcesActivity: vi.fn(),
    progressActivity: undefined,
    setProgressActivityId: vi.fn(),
    stepsActivity: undefined,
    setStepsActivity: vi.fn(),
    editorIntent: { activityId: 'a1', tab: 'logic' },
    setEditorIntent: vi.fn(),
    activityEditorGating: {},
    editActivityId: null,
    deleteActivityId: null,
    setEditActivityId: vi.fn(),
    setDeleteActivityId: vi.fn(),
    recordActivityUpdate: vi.fn(),
    recordActivityDelete: vi.fn(),
    ...over,
  } as unknown as Model;
}

describe('the workspace hosts, with the convergence flag on', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not mount the Logic dialog — Logic is a tab of the one editor', () => {
    render(<PlanDialogs model={makeModel()} plan={{ projectId: 'proj-1' } as never} />);
    expect(screen.queryByTestId('dependency-editor')).not.toBeInTheDocument();
  });

  it('does not mount the Resources dialog either — Resources is the other tab', () => {
    render(<PlanDialogs model={makeModel()} plan={{ projectId: 'proj-1' } as never} />);
    expect(screen.queryByTestId('resources-dialog')).not.toBeInTheDocument();
  });

  it('hands the editor the undo seam for a removed link', () => {
    render(<ActivityCrudDialogs model={makeModel()} />);
    const props = editorProps.mock.calls[0]![0] as { logic?: { onRemoved?: unknown } };
    expect(props.logic?.onRemoved).toBe(recordDependencyRemove);
  });

  it('hands the editor the coalesced keyboard lag nudge', () => {
    render(<ActivityCrudDialogs model={makeModel()} />);
    const props = editorProps.mock.calls[0]![0] as { logic?: { onNudgeLag?: unknown } };
    expect(props.logic?.onNudgeLag).toBe(nudgeDependencyLag);
  });

  it('withholds the lag nudge from a member who cannot manage logic', () => {
    render(<ActivityCrudDialogs model={makeModel({ canManageLogic: false })} />);
    const props = editorProps.mock.calls[0]![0] as { logic?: { onNudgeLag?: unknown } };
    expect(props.logic?.onNudgeLag).toBeUndefined();
  });

  it('hands the editor the cross-plan section for the intended activity', () => {
    render(<ActivityCrudDialogs model={makeModel()} />);
    const props = editorProps.mock.calls[0]![0] as { logic?: { crossPlanSlot?: unknown } };
    expect(props.logic?.crossPlanSlot).toBeDefined();
  });
});
