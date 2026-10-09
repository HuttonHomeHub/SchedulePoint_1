import { render, renderHook, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  ActivityBottomPanel,
  DIAGRAM_HIDDEN_NOTE,
  GANTT_HIDDEN_NOTE,
  TOOL_PUT_AWAY_NOTE,
  useActivityPanelModel,
} from './activity-bottom-panel';
import type { PlanWorkspaceModel } from './use-plan-workspace-model';

/**
 * The panel's half of the short-body swap: the header note and the Collapse handle. The layout half
 * (hiding the diagram row, focus, docks) is `plan-workspace-toolbar.test.tsx`'s.
 */
vi.mock('./canvas-dock', () => ({ CanvasDockOutlet: () => null }));
vi.mock('./plan-facts-host', () => ({ PlanFactsOutlet: () => null }));
vi.mock('@/features/activities', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ActivitiesTable: () => <div data-testid="activities-table" />,
  CreateActivityButton: () => null,
}));

const NOOP = (): void => {};

function panelModel() {
  const model = {
    orgSlug: 'acme',
    planId: 'pl1',
    canEditSchedule: false,
    canProgress: false,
    canWriteNotes: false,
    setEditorIntent: NOOP,
    onOpenLogic: NOOP,
    onResourcesActivity: NOOP,
    onMakeMilestone: NOOP,
    onDuplicateActivity: () => Promise.resolve(),
    calendars: { data: [], isPending: false, isError: false },
    activities: { data: [], isPending: false, isError: false },
    plan: { data: { calendarId: null } },
    variance: { data: undefined },
  } as unknown as PlanWorkspaceModel;
  return renderHook(() => useActivityPanelModel(model)).result.current;
}

describe('ActivityBottomPanel while the diagram is hidden', () => {
  it('says nothing about the diagram unless the host hid it', () => {
    render(<ActivityBottomPanel model={panelModel()} onCollapse={NOOP} />);
    expect(screen.queryByText(DIAGRAM_HIDDEN_NOTE)).not.toBeInTheDocument();
  });

  it('shows the note, and the put-away sentence only when a tool was disarmed', () => {
    const { rerender } = render(
      <ActivityBottomPanel model={panelModel()} onCollapse={NOOP} diagramHidden />,
    );
    expect(screen.getByText(DIAGRAM_HIDDEN_NOTE)).toBeInTheDocument();
    expect(screen.queryByText(new RegExp(TOOL_PUT_AWAY_NOTE))).not.toBeInTheDocument();

    rerender(
      <ActivityBottomPanel model={panelModel()} onCollapse={NOOP} diagramHidden toolDisarmed />,
    );
    expect(screen.getByText(`${DIAGRAM_HIDDEN_NOTE} ${TOOL_PUT_AWAY_NOTE}`)).toBeInTheDocument();
  });

  it('hands the host the Collapse button through collapseRef', () => {
    const collapseRef = createRef<HTMLButtonElement>();
    render(
      <ActivityBottomPanel model={panelModel()} onCollapse={NOOP} collapseRef={collapseRef} />,
    );
    expect(collapseRef.current).toBe(
      screen.getByRole('button', { name: 'Collapse activities panel' }),
    );
  });

  it('keeps the note text as one constant string', () => {
    expect(DIAGRAM_HIDDEN_NOTE).toBe('Diagram hidden. Collapse to return.');
    expect(GANTT_HIDDEN_NOTE).toBe('Gantt hidden. Collapse to return.');
  });

  it('names the Gantt when that is the view the swap hid', () => {
    render(
      <ActivityBottomPanel
        model={panelModel()}
        onCollapse={NOOP}
        diagramHidden
        hiddenView="gantt"
      />,
    );
    expect(screen.getByText(GANTT_HIDDEN_NOTE)).toBeInTheDocument();
    expect(screen.queryByText(DIAGRAM_HIDDEN_NOTE)).not.toBeInTheDocument();
  });

  it('describes Collapse by the note while the diagram is hidden, and not otherwise', () => {
    const { rerender } = render(
      <ActivityBottomPanel model={panelModel()} onCollapse={NOOP} diagramHidden toolDisarmed />,
    );
    const collapse = screen.getByRole('button', { name: 'Collapse activities panel' });
    const note = screen.getByText(`${DIAGRAM_HIDDEN_NOTE} ${TOOL_PUT_AWAY_NOTE}`);
    expect(note.id).not.toBe('');
    expect(collapse).toHaveAttribute('aria-describedby', note.id);
    // Described, not announced: the note is not a live region.
    expect(note).not.toHaveAttribute('aria-live');
    expect(note.closest('[role="status"], [role="alert"]')).toBeNull();

    rerender(<ActivityBottomPanel model={panelModel()} onCollapse={NOOP} />);
    expect(screen.getByRole('button', { name: 'Collapse activities panel' })).not.toHaveAttribute(
      'aria-describedby',
    );
  });
});
