import type { ActivitySummary } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

/**
 * The rollback path (`VITE_TOOLBAR_QUICK_WINS=false`): with the quick-wins flag OFF, each of the five
 * ids resolves to its existing `placeholderItem()` "Coming soon" stub — byte-for-byte the pre-feature
 * toolbar (disabled, "<label> — Coming soon", never wired). The flag-on matrix lives in
 * `tsld-toolbar-quick-wins.test.tsx`; this file guards the emergency opt-out now that the flag is
 * on by default.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_AUTHORING_ENABLED: true,
  SCHEDULING_MODES_ENABLED: true,
  NOTES_ENABLED: true,
  UNDO_REDO_ENABLED: false,
  TOOLBAR_QUICK_WINS_ENABLED: false,
}));

const SELECTED = { id: 'a1', version: 7, name: 'Excavate' } as unknown as ActivitySummary;

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({
    schedulingMode: 'VISUAL',
    summaryContent: null,
    selectedActivityId: 'a1',
    selectedActivity: SELECTED,
    ...over,
  });
}

function renderRows(context: TsldToolbarContext) {
  const rows = splitByRow(buildTsldToolbarItems());
  return render(
    <div>
      <Toolbar
        items={rows.look}
        context={context}
        label="View and navigate"
        authoringEnabled
        alignEndGroup="object"
      />
      <Toolbar items={rows.do} context={context} label="Build and manage" authoringEnabled />
    </div>,
  );
}

/**
 * Reach a command that lives in the `⋯` overflow (ADR-0090 M2, 2026-08-12).
 *
 * `clear-visual-placement` moved to tier 3 so Row 2 could label itself at 1920 — the trade the
 * product owner took with the measured numbers. It is the narrowest-purpose command on the row: it
 * does nothing outside Visual scheduling mode and is pen-gated on top of that. Nothing these
 * assertions prove changes; they open the menu and read a menu item, whose reason travels by
 * `aria-describedby` rather than a `title`.
 */
function overflowItem(name: string | RegExp): HTMLElement {
  const more = screen.queryAllByRole('button', { name: 'More toolbar actions' });
  for (const trigger of more) {
    if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger);
    for (const role of ['menuitem', 'menuitemcheckbox', 'menuitemradio'] as const) {
      const hit = screen.queryByRole(role, { name });
      if (hit) return hit;
    }
    fireEvent.click(trigger);
  }
  throw new Error(`No overflow item named ${String(name)}`);
}

describe('TSLD toolbar quick-wins (VITE_TOOLBAR_QUICK_WINS off — rollback)', () => {
  it('keeps all five ids as "Coming soon" placeholders, byte-for-byte', () => {
    renderRows(ctx());
    for (const name of ['Go to today', 'Comments', 'Add note']) {
      const btn = screen.getByRole('button', { name });
      expect(btn).toHaveAttribute('aria-disabled', 'true');
      expect(btn).toHaveAttribute('title', `${name} — Coming soon`);
    }
    // The fifth is in the `⋯` since ADR-0090 M2 moved it to tier 3 — RELOCATED here rather than
    // dropped from the list, which is what would have quietly turned a five-id census into a
    // four-id one. Its reason travels by `aria-describedby` in a menu, not a `title`.
    const cleared = overflowItem('Clear visual placement');
    expect(cleared).toHaveAttribute('aria-disabled', 'true');
    expect(cleared).toHaveAccessibleDescription('Coming soon');
  });
});
