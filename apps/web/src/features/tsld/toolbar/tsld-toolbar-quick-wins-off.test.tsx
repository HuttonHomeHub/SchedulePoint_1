import type { ActivitySummary } from '@repo/types';
import { render, screen } from '@testing-library/react';
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
      <Toolbar items={rows.strip} context={context} label="Plan commands" authoringEnabled />
    </div>,
  );
}

describe('TSLD toolbar quick-wins (VITE_TOOLBAR_QUICK_WINS off — rollback)', () => {
  it('keeps the command-surface quick-win ids as "Coming soon" placeholders, byte-for-byte', () => {
    renderRows(ctx());
    for (const name of ['Go to today', 'Comments', 'Add note']) {
      const btn = screen.getByRole('button', { name });
      expect(btn).toHaveAttribute('aria-disabled', 'true');
      expect(btn).toHaveAttribute('title', `${name} — Coming soon`);
    }
    // **Clear visual placement was a fourth here and is deliberately gone** (ADR-0094 M4-T1).
    // It moved to the selection bar, which registers it behind the SAME `VITE_TOOLBAR_QUICK_WINS`
    // flag — so the rollback contract survives, it is just not this surface's any more. Asserted as
    // an absence rather than dropped from the list: a census that quietly shrinks is how a
    // capability goes missing without anything failing (ADR-0073 C4's shape).
    expect(
      screen.queryByRole('button', { name: 'Clear visual placement' }),
    ).not.toBeInTheDocument();
  });
});
