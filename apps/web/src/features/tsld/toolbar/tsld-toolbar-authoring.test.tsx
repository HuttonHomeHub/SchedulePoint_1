import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

/** The Add split-button's caret — the kind menu's opener (the primary region arms the tool). */
function addCaret(): HTMLElement {
  return screen.getByRole('button', { name: /^Activity type:/ });
}

describe('TSLD toolbar — canvas-first authoring items (flag on)', () => {
  describe('Add split-button (M4)', () => {
    /**
     * **The arm/disarm contract** (ADR-0064 T3). The primary region arms the tool; it used to open
     * the kind menu and arm nothing, which left Add and its neighbour Link doing different things
     * on the same click. On a surface where the armed tool decides what the next canvas click
     * *means*, that difference is one click from an edit the planner did not intend.
     */
    it('arms add-mode from the primary region — it does not merely open the menu', () => {
      const toggleAddActivity = vi.fn();
      renderToolbar(ctx({ isAddingActivity: false, toggleAddActivity }));
      fireEvent.click(screen.getByRole('button', { name: 'Add' }));
      expect(toggleAddActivity).toHaveBeenCalledOnce();
      expect(screen.queryByRole('menuitemradio')).not.toBeInTheDocument();
    });

    it('disarms from the primary region while adding — the trigger is a toggle', () => {
      const toggleAddActivity = vi.fn();
      renderToolbar(ctx({ isAddingActivity: true, toggleAddActivity }));
      fireEvent.click(screen.getByRole('button', { name: /^Adding/ }));
      expect(toggleAddActivity).toHaveBeenCalledOnce();
    });

    /**
     * The Add trigger also reflects the **LOE** tool (B4), so its toggle follows whichever tool it
     * is currently reflecting. Routing an armed LOE through `toggleAddActivity` would swap one
     * armed tool for another — a trigger reading "Pick start driver" that starts drawing bars.
     */
    it('stops the LOE pick — not add-mode — when it is reflecting the LOE tool', () => {
      const toggleAddActivity = vi.fn();
      const toggleLoeSpanMode = vi.fn();
      renderToolbar(ctx({ isLoeSpanning: true, toggleAddActivity, toggleLoeSpanMode }));
      fireEvent.click(screen.getByRole('button', { name: 'Pick start driver' }));
      expect(toggleLoeSpanMode).toHaveBeenCalledOnce();
      expect(toggleAddActivity).not.toHaveBeenCalled();
    });

    it('reflects the armed state with aria-pressed', () => {
      renderToolbar(ctx({ isAddingActivity: false }));
      expect(screen.getByRole('button', { name: 'Add' })).toHaveAttribute('aria-pressed', 'false');
      cleanup();
      renderToolbar(ctx({ isAddingActivity: true }));
      expect(screen.getByRole('button', { name: /^Adding/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('keeps one tab stop: the caret is not tabbable', () => {
      renderToolbar(ctx());
      expect(addCaret()).toHaveAttribute('tabindex', '-1');
    });

    it('opens a type menu from the caret and arms the picked kind', () => {
      const setCreateType = vi.fn();
      renderToolbar(ctx({ setCreateType }));
      fireEvent.click(addCaret());
      // The three draw kinds are offered as single-choice (radio) menu items…
      fireEvent.click(screen.getByRole('menuitemradio', { name: 'Start milestone' }));
      expect(setCreateType).toHaveBeenCalledWith('START_MILESTONE');
    });

    it('previews Hammock / Level of effort as disabled "Span between" menu items', () => {
      renderToolbar(ctx());
      fireEvent.click(addCaret());
      for (const name of ['Hammock', 'Level of effort']) {
        const item = screen.getByRole('menuitem', { name: new RegExp(name) });
        expect(item).toHaveAttribute('aria-disabled', 'true');
      }
    });

    it('labels the button with the armed kind while adding', () => {
      renderToolbar(ctx({ isAddingActivity: true, createType: 'FINISH_MILESTONE' }));
      expect(screen.getByRole('button', { name: /Adding Finish milestone/ })).toBeInTheDocument();
    });

    it('offers "Stop adding" in the menu only while in add mode', () => {
      const toggleAddActivity = vi.fn();
      const { rerender } = renderToolbar(ctx({ isAddingActivity: true, toggleAddActivity }));
      fireEvent.click(addCaret());
      fireEvent.click(screen.getByRole('menuitem', { name: 'Stop adding' }));
      expect(toggleAddActivity).toHaveBeenCalledOnce();

      rerender(doRow(ctx({ isAddingActivity: false })));
      fireEvent.click(addCaret());
      expect(screen.queryByRole('menuitem', { name: 'Stop adding' })).not.toBeInTheDocument();
    });

    it('disables the split-button when the pen is not held (authoring off)', () => {
      render(doRow(ctx(), false));
      expect(screen.getByRole('button', { name: 'Add' })).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(addCaret());
      // A disabled trigger never opens the menu.
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
  });

  describe('Link split-button (M5)', () => {
    /**
     * **The named regression (ADR-0064, A1c).** The primary region arms the tool. It used to open
     * the type menu and arm *nothing*, which is how a planner could click "Link", click a bar, and
     * get a new activity: the Add tool was still armed and took the click. Measured before the fix:
     * 0 dependencies from 6 link attempts.
     */
    it('arms link-mode from the primary region — it does not merely open the menu', () => {
      const toggleLinkMode = vi.fn();
      renderToolbar(ctx({ isLinking: false, toggleLinkMode }));
      fireEvent.click(screen.getByRole('button', { name: 'Link' }));
      expect(toggleLinkMode).toHaveBeenCalledOnce();
      // …and no menu was opened by that click: the type list is the caret's job.
      expect(screen.queryByRole('menuitemradio')).not.toBeInTheDocument();
    });

    it('reflects the armed state with aria-pressed', () => {
      renderToolbar(ctx({ isLinking: false }));
      expect(screen.getByRole('button', { name: 'Link' })).toHaveAttribute('aria-pressed', 'false');
      cleanup();
      renderToolbar(ctx({ isLinking: true, linkType: 'SS' }));
      expect(screen.getByRole('button', { name: /Linking/ })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('arms link-mode and the picked FS/SS/FF type from the caret menu (mirrors Add)', () => {
      const toggleLinkMode = vi.fn();
      const setLinkType = vi.fn();
      renderToolbar(ctx({ isLinking: false, toggleLinkMode, setLinkType }));
      // The caret — not the label — opens the type menu.
      fireEvent.click(screen.getByRole('button', { name: /^Link type:/ }));
      fireEvent.click(screen.getByRole('menuitemradio', { name: /Start → Start/ }));
      // Picking a kind sets the type and enters link-mode in one gesture.
      expect(setLinkType).toHaveBeenCalledWith('SS');
      expect(toggleLinkMode).toHaveBeenCalledOnce();
    });

    it('keeps one tab stop: the caret is not tabbable', () => {
      renderToolbar(ctx());
      expect(screen.getByRole('button', { name: /^Link type:/ })).toHaveAttribute('tabindex', '-1');
    });

    it('labels the button with the armed type and offers "Stop linking" while linking', () => {
      const toggleLinkMode = vi.fn();
      renderToolbar(ctx({ isLinking: true, linkType: 'SS', toggleLinkMode }));
      fireEvent.click(screen.getByRole('button', { name: /^Link type:/ }));
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
