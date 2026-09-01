import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * **What the Logic *dialog* host passes its panel** (`docs/TECH_DEBT.md` #65).
 *
 * `ActivityLogicPanel` has two hosts under two flags: the editor's Logic tab (flag-on, pinned by
 * `plan-dialogs.convergence.test.tsx`) and this `DependencyEditor` dialog (flag-off). Only the
 * first was pinned, and **not because the second was judged safe** — every existing suite mocks
 * `DependencyEditor` with a component that discards its props, so nothing here has ever asserted
 * that `onAdded`, `onRemoved` or `onNudgeLag` reach it either. Adding a fourth seam without
 * closing that is how a host gets left behind; ADR-0080 records exactly that, with `bulk` wired
 * into one host and not the layout its flag selects, unit tests green throughout.
 *
 * Pinned by **identity**, like its sibling. The callbacks' behaviour has its own suite; what can
 * go wrong at a composition root is that a prop is never passed at all.
 *
 * Verified red by removing each of the four `on*` lines from `plan-dialogs.tsx` in turn.
 */

vi.mock('@/config/env', async () => ({
  ...(await vi.importActual<Record<string, unknown>>('@/config/env')),
  // Flag OFF: this host only mounts when Logic is a dialog rather than a tab.
  ACTIVITY_EDITOR_CONVERGENCE_ENABLED: false,
  CANVAS_DIRECT_MANIPULATION_ENABLED: true,
  ENTRY_ROUTES_ENABLED: false,
  NOTES_ENABLED: false,
  PROGRAMME_SCHEDULING_ENABLED: false,
  RESOURCES_ENABLED: false,
}));

const editorProps = vi.fn();
vi.mock('@/features/dependencies', () => ({
  DependencyEditor: (props: Record<string, unknown>) => {
    editorProps(props);
    return <div data-testid="dependency-editor" />;
  },
}));
vi.mock('@/features/plans', () => ({ PlanFormDialog: () => null }));
vi.mock('@/features/resources', () => ({ ActivityResourcesDialog: () => null }));
vi.mock('@/features/notes', () => ({ ActivityNotesSection: () => null }));
vi.mock('@/features/cross-plan-dependencies', () => ({ CrossPlanLinksSection: () => null }));

const { PlanDialogs } = await import('./plan-dialogs');
type Model = Parameters<typeof PlanDialogs>[0]['model'];

const recordDependencyAdd = vi.fn();
const recordDependencyRemove = vi.fn();
const recordDependencyEdit = vi.fn();
const nudgeDependencyLag = vi.fn();

function makeModel(over: Record<string, unknown> = {}): Model {
  return {
    orgSlug: 'acme',
    planId: 'p1',
    activities: { data: [], isPending: false, isError: false },
    calendars: { data: [], isPending: false, isError: false },
    plan: { data: { calendarId: null } },
    canManageLogic: true,
    logicActivity: undefined,
    logicRevealNotes: false,
    setLogicActivity: vi.fn(),
    recordDependencyAdd,
    recordDependencyRemove,
    recordDependencyEdit,
    nudgeDependencyLag,
    resourcesActivity: undefined,
    setResourcesActivity: vi.fn(),
    editPlanOpen: false,
    setEditPlanOpen: vi.fn(),
    ...over,
  } as unknown as Model;
}

describe('the Logic dialog host, flag-off', () => {
  beforeEach(() => editorProps.mockClear());

  it('hands the panel all four undo/edit seams, by identity', () => {
    render(<PlanDialogs model={makeModel()} plan={{ projectId: 'proj-1' } as never} />);
    const props = editorProps.mock.lastCall![0] as Record<string, unknown>;
    expect(props.onAdded).toBe(recordDependencyAdd);
    expect(props.onRemoved).toBe(recordDependencyRemove);
    expect(props.onEdited).toBe(recordDependencyEdit);
    expect(props.onNudgeLag).toBe(nudgeDependencyLag);
  });

  /**
   * The nudge is the one seam that is conditional — it needs the direct-manipulation flag AND the
   * write right. The other three are not gated here, because the panel already refuses to render
   * its own write controls without `canManageLogic`; passing a callback nothing can call is
   * cheaper than a second copy of that rule in a second place.
   */
  it('withholds only the lag nudge from a member who cannot manage logic', () => {
    render(
      <PlanDialogs
        model={makeModel({ canManageLogic: false })}
        plan={{ projectId: 'p' } as never}
      />,
    );
    const props = editorProps.mock.lastCall![0] as Record<string, unknown>;
    expect(props.onNudgeLag).toBeUndefined();
    expect(props.onEdited).toBe(recordDependencyEdit);
  });
});
