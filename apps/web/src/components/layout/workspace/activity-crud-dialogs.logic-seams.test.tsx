import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Host wiring for the convergence epic: **Logic** is a tab of the one editor, so the seams that
 * used to be wired into a separate Logic dialog (undo recording for a removed link, the coalesced
 * keyboard lag nudge, the cross-plan section) must arrive at the editor.
 *
 * Each of those three is named in the plan as a thing that dies silently when a surface moves: the
 * chord still fires, the undo stack just quietly stops recording. Hence one assertion each, at the
 * seam rather than through the panel.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_DIRECT_MANIPULATION_ENABLED: true,
}));

vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => vi.fn() }));

vi.mock('@/features/cross-plan-dependencies', () => ({
  CrossPlanLinksSection: () => <div data-testid="cross-plan-section" />,
}));

vi.mock('@/features/wbs', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useDissolveSummaryInSwimlanes: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/notes', () => ({ ActivityNotesSection: () => null }));
vi.mock('@/features/plans', () => ({ PlanFormDialog: () => null }));
vi.mock('@/features/resources', () => ({ ActivityResourcesDialog: () => null }));

/** Captures what the editor was handed, so the seams can be asserted without the real panel. */
const editorProps = vi.fn();
// **Partial**, not total — the `@/features/dependencies` lesson, one feature along. A total mock
// blanks every export the workspace host imports, not only the ones this suite meant to stub, so a
// host that starts importing one more symbol fails these at COLLECTION with "no export is defined
// on the mock". ADR-0095 M5-T4/T5 did exactly that twice (`useUpdateActivityParents`, then
// `ActivityCreateDialog`).
vi.mock('@/features/activities', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  // Explicit, even though the spread supplies it: the REAL dialog calls `useCreateActivity` and
  // this suite mounts without a `QueryClientProvider`. The spread stops a new import breaking
  // collection; the stub stops a mounted one demanding a provider — two different failures.
  ActivityCreateDialog: () => null,
  useDeleteActivity: () => ({ mutate: vi.fn(), isPending: false }),
  useBulkDeleteActivities: () => ({ mutateAsync: vi.fn() }),
  useRestoreDeleteBatch: () => ({ mutateAsync: vi.fn() }),
  isMilestoneType: () => false,
  ActivityFormDialog: () => null,
  ActivityProgressDialog: () => null,
  ActivityStepsDialog: () => null,
  ActivityEditorDialog: (props: Record<string, unknown>) => {
    editorProps(props);
    return <div data-testid="activity-editor" />;
  },
}));

const { ActivityCrudDialogs } = await import('./activity-crud-dialogs');
type Model = Parameters<typeof ActivityCrudDialogs>[0]['model'];

const ACTIVITY = { id: 'a1', name: 'Excavate', type: 'TASK', durationType: 'FIXED_DURATION' };

const recordDependencyRemove = vi.fn();
const recordDependencyEdit = vi.fn();
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
    recordDependencyEdit,
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

describe('the workspace host of the activity editor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hands the editor the undo seam for a removed link', () => {
    render(<ActivityCrudDialogs model={makeModel()} />);
    const props = editorProps.mock.calls[0]![0] as { logic?: { onRemoved?: unknown } };
    expect(props.logic?.onRemoved).toBe(recordDependencyRemove);
  });

  /**
   * `docs/TECH_DEBT.md` #65. Pinned by **identity** rather than by rendering the dialog and
   * saving: what can go wrong here is not the callback's behaviour — its own suite covers that —
   * but a host that never passes it (ADR-0080 records `bulk` being wired into one host and not
   * the layout its flag selected, unit tests green throughout).
   */
  it('hands the editor the undo seam for an edited link', () => {
    render(<ActivityCrudDialogs model={makeModel()} />);
    const props = editorProps.mock.calls[0]![0] as { logic?: { onEdited?: unknown } };
    expect(props.logic?.onEdited).toBe(recordDependencyEdit);
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
