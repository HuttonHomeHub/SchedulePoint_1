import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar } from '@/components/ui/toolbar/Toolbar';
import { DEFAULT_VIEW_TOGGLES } from '@/features/tsld/render/paint';

/**
 * Canvas-first authoring toolbar items (ADR-0032). The inline timeline start-date control is gated
 * on `VITE_CANVAS_AUTHORING`, so this file pins it on (the flag-off registry is covered by
 * `tsld-toolbar.test.tsx`).
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_AUTHORING_ENABLED: true,
}));

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return {
    zoomPreset: 'week',
    setZoomPreset: vi.fn(),
    stepZoom: vi.fn(),
    fit: vi.fn(),
    plannedStart: '2026-01-01',
    setPlannedStart: vi.fn(),
    viewToggles: DEFAULT_VIEW_TOGGLES,
    toggleView: vi.fn(),
    isAddingActivity: false,
    toggleAddActivity: vi.fn(),
    createType: 'TASK',
    setCreateType: vi.fn(),
    canLink: true,
    isLinking: false,
    toggleLinkMode: vi.fn(),
    linkType: 'FS',
    setLinkType: vi.fn(),
    canAutoArrange: false,
    requestAutoArrange: vi.fn(),
    canRecalc: true,
    recalcPending: false,
    recalculate: vi.fn(),
    openBaselines: vi.fn(),
    openCalendar: vi.fn(),
    openPlanDetails: vi.fn(),
    editPlan: vi.fn(),
    openShortcuts: vi.fn(),
    legendContent: null,
    summaryContent: null,
    projectFinishContent: null,
    hasDiagram: false,
    ...over,
  };
}

function renderToolbar(context: TsldToolbarContext) {
  return render(
    <Toolbar
      items={buildTsldToolbarItems()}
      context={context}
      label="Plan toolbar"
      authoringEnabled
    />,
  );
}

describe('TSLD toolbar — canvas-first authoring items (flag on)', () => {
  it('shows an editable timeline start-date input for a writer and writes on change', () => {
    const setPlannedStart = vi.fn();
    renderToolbar(ctx({ setPlannedStart }));
    const input = screen.getByLabelText('Timeline start');
    expect(input).toHaveValue('2026-01-01');
    fireEvent.change(input, { target: { value: '2026-02-15' } });
    expect(setPlannedStart).toHaveBeenCalledWith('2026-02-15');
  });

  it('renders the start date as static text for a read-only viewer (no setter)', () => {
    renderToolbar(ctx({ setPlannedStart: null }));
    // No editable date input…
    expect(screen.queryByLabelText('Timeline start')).not.toBeInTheDocument();
    // …but the date is shown, labelled, as a read-out.
    expect(screen.getByLabelText(/Timeline start:/)).toBeInTheDocument();
  });

  it('shows "Not set" when the plan has no start date yet', () => {
    renderToolbar(ctx({ plannedStart: null, setPlannedStart: null }));
    expect(screen.getByLabelText('Timeline start: Not set')).toBeInTheDocument();
  });

  describe('Add split-button (M4)', () => {
    it('opens a type menu and arms the picked kind', () => {
      const setCreateType = vi.fn();
      renderToolbar(ctx({ setCreateType }));
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      // The three draw kinds are offered as menu items…
      fireEvent.click(screen.getByRole('menuitem', { name: 'Start milestone' }));
      expect(setCreateType).toHaveBeenCalledWith('START_MILESTONE');
    });

    it('labels the button with the armed kind while adding', () => {
      renderToolbar(ctx({ isAddingActivity: true, createType: 'FINISH_MILESTONE' }));
      expect(screen.getByRole('button', { name: /Adding Finish milestone/ })).toBeInTheDocument();
    });

    it('offers "Stop adding" only while in add mode', () => {
      const toggleAddActivity = vi.fn();
      const { rerender } = renderToolbar(ctx({ isAddingActivity: true, toggleAddActivity }));
      fireEvent.click(screen.getByRole('button', { name: /Adding/ }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Stop adding' }));
      expect(toggleAddActivity).toHaveBeenCalledOnce();

      rerender(
        <Toolbar
          items={buildTsldToolbarItems()}
          context={ctx({ isAddingActivity: false })}
          label="Plan toolbar"
          authoringEnabled
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      expect(screen.queryByRole('menuitem', { name: 'Stop adding' })).not.toBeInTheDocument();
    });

    it('disables the split-button when the pen is not held (authoring off)', () => {
      render(
        <Toolbar
          items={buildTsldToolbarItems()}
          context={ctx()}
          label="Plan toolbar"
          authoringEnabled={false}
        />,
      );
      const addButton = screen.getByRole('button', { name: 'Add' });
      expect(addButton).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(addButton);
      // A disabled trigger never opens the menu.
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  describe('Link tool (M5)', () => {
    it('offers the Link tool and toggles link mode on click', () => {
      const toggleLinkMode = vi.fn();
      renderToolbar(ctx({ toggleLinkMode }));
      fireEvent.click(screen.getByRole('button', { name: 'Link activities' }));
      expect(toggleLinkMode).toHaveBeenCalledOnce();
    });

    it('hides the Link tool when the plan is not linkable', () => {
      renderToolbar(ctx({ canLink: false }));
      expect(screen.queryByRole('button', { name: 'Link activities' })).not.toBeInTheDocument();
    });

    it('shows the FS/SS/FF selector only while linking, and picks a type', () => {
      const setLinkType = vi.fn();
      const { rerender } = renderToolbar(ctx({ isLinking: false }));
      // Not shown when idle…
      expect(screen.queryByRole('button', { name: /Link type/ })).not.toBeInTheDocument();
      // …shown while linking.
      rerender(
        <Toolbar
          items={buildTsldToolbarItems()}
          context={ctx({ isLinking: true, linkType: 'FS', setLinkType })}
          label="Plan toolbar"
          authoringEnabled
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Link type: FS' }));
      fireEvent.click(screen.getByRole('menuitem', { name: /Start → Start/ }));
      expect(setLinkType).toHaveBeenCalledWith('SS');
    });
  });
});
