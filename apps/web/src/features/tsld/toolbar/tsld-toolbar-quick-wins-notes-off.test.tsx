import type { ActivitySummary } from '@repo/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

/**
 * Toolbar quick-wins with `VITE_NOTES` OFF but quick-wins ON (T6): the two notes-dependent items —
 * **Comments** must be absent (not a dead control), since there is no notes surface
 * to reveal / open. The other three quick-wins (Go-to-today / Update-progress / Clear-visual-placement)
 * are unaffected by `VITE_NOTES`. The flag-on-with-notes matrix lives in `tsld-toolbar-quick-wins.test.tsx`.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_AUTHORING_ENABLED: true,
  SCHEDULING_MODES_ENABLED: true,
  NOTES_ENABLED: false,
  UNDO_REDO_ENABLED: false,
  TOOLBAR_QUICK_WINS_ENABLED: true,
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

describe('TSLD toolbar quick-wins (VITE_NOTES off)', () => {
  it('hides Comments when notes are disabled (T6)', () => {
    renderRows(ctx());
    expect(screen.queryByRole('button', { name: 'Comments' })).not.toBeInTheDocument();
    // **`Add note` was asserted here too and has moved** to the object bar
    // (`docs/specs/object-bar-defects/` M2), where its own `NOTES_ENABLED` gate applies. Asserting
    // it here now would pass for the wrong reason — the item is absent from this surface in EVERY
    // flag state, so the case would say nothing about the flag it is named for.
  });

  it('still offers the notes-independent quick-win', () => {
    renderRows(ctx());
    // Singular since ADR-0094 M4-T1: Clear visual start was the other half and moved to the
    // selection bar (`selection-actions.clear-placement.test.tsx` covers it there), leaving
    // Go-to-today as the only quick-win on this surface that does not depend on notes. Reworded
    // rather than left plural, because a heading that promises two and shows one is the kind of
    // small inaccuracy this repository keeps finding a year later.
    expect(screen.getByRole('button', { name: 'Go to today' })).toBeInTheDocument();
  });
});
