import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

/**
 * Canvas-first authoring toolbar items (ADR-0032) — the Row 2 · Do authoring cluster. Gated on
 * `VITE_CANVAS_AUTHORING`, so this file pins it on (the flag-off registry is covered by
 * `tsld-toolbar.test.tsx`). Scheduling-modes are pinned OFF here (the mode selector + Go-to-date are
 * covered by `tsld-toolbar-scheduling-modes.test.tsx`); the data-date control has left the toolbar.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_AUTHORING_ENABLED: true,
  SCHEDULING_MODES_ENABLED: false,
  // Pin on-canvas activity types OFF here: this authoring suite asserts the Add menu's disabled
  // "Span between" (Hammock / Level of effort) placeholders. The flag-on single "Level of Effort
  // (hammock)" live item is covered by tsld-toolbar-activity-types.test.tsx.
  CANVAS_ACTIVITY_TYPES_ENABLED: false,
}));

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({
    summaryContent: null,
    projectFinishContent: null,
    hasDiagram: false,
    ...over,
  });
}

/** The Row 2 · Do toolbar element (where the authoring cluster lives). */
function doRow(context: TsldToolbarContext, authoringEnabled = true) {
  const rows = splitByRow(buildTsldToolbarItems());
  return (
    <Toolbar
      items={rows.do}
      context={context}
      label="Build and manage"
      authoringEnabled={authoringEnabled}
    />
  );
}

function renderToolbar(context: TsldToolbarContext, authoringEnabled = true) {
  return render(doRow(context, authoringEnabled));
}

describe('TSLD toolbar — canvas-first authoring items (flag on)', () => {
  describe('Add split-button (M4)', () => {
    it('opens a type menu and arms the picked kind', () => {
      const setCreateType = vi.fn();
      renderToolbar(ctx({ setCreateType }));
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      // The three draw kinds are offered as single-choice (radio) menu items…
      fireEvent.click(screen.getByRole('menuitemradio', { name: 'Start milestone' }));
      expect(setCreateType).toHaveBeenCalledWith('START_MILESTONE');
    });

    it('previews Hammock / Level of effort as disabled "Span between" menu items', () => {
      renderToolbar(ctx());
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      for (const name of ['Hammock', 'Level of effort']) {
        const item = screen.getByRole('menuitem', { name: new RegExp(name) });
        expect(item).toHaveAttribute('aria-disabled', 'true');
      }
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

      rerender(doRow(ctx({ isAddingActivity: false })));
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      expect(screen.queryByRole('menuitem', { name: 'Stop adding' })).not.toBeInTheDocument();
    });

    it('disables the split-button when the pen is not held (authoring off)', () => {
      render(doRow(ctx(), false));
      const addButton = screen.getByRole('button', { name: 'Add' });
      expect(addButton).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(addButton);
      // A disabled trigger never opens the menu.
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  describe('Link split-button (M5)', () => {
    it('arms link-mode and the picked FS/SS/FF type from one menu (mirrors Add)', () => {
      const toggleLinkMode = vi.fn();
      const setLinkType = vi.fn();
      renderToolbar(ctx({ isLinking: false, toggleLinkMode, setLinkType }));
      // Idle label is "Link"; clicking opens the type menu (a split-button, like Add).
      fireEvent.click(screen.getByRole('button', { name: 'Link' }));
      fireEvent.click(screen.getByRole('menuitemradio', { name: /Start → Start/ }));
      // Picking a kind sets the type and enters link-mode in one gesture.
      expect(setLinkType).toHaveBeenCalledWith('SS');
      expect(toggleLinkMode).toHaveBeenCalledOnce();
    });

    it('labels the button with the armed type and offers "Stop linking" while linking', () => {
      const toggleLinkMode = vi.fn();
      renderToolbar(ctx({ isLinking: true, linkType: 'SS', toggleLinkMode }));
      fireEvent.click(screen.getByRole('button', { name: /Linking/ }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Stop linking' }));
      expect(toggleLinkMode).toHaveBeenCalledOnce();
    });

    it('shows the Link split-button shaded (not hidden) when the pen is not held', () => {
      // Two-row rule: shade-don't-hide — a viewer sees the disabled Link tool rather than a gap.
      renderToolbar(ctx(), false);
      expect(screen.getByRole('button', { name: 'Link' })).toHaveAttribute('aria-disabled', 'true');
    });
  });
});
