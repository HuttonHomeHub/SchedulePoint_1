import type { ActivitySummary } from '@repo/types';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

/**
 * Toolbar quick-wins with `VITE_NOTES` OFF but quick-wins ON (T6): the two notes-dependent items —
 * **Comments** and **Add note** — must be absent (not dead controls), since there is no notes surface
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

describe('TSLD toolbar quick-wins (VITE_NOTES off)', () => {
  it('hides Comments and Add note when notes are disabled (T6)', () => {
    renderRows(ctx());
    expect(screen.queryByRole('button', { name: 'Comments' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add note' })).not.toBeInTheDocument();
  });

  it('still offers the notes-independent quick-wins', () => {
    renderRows(ctx());
    expect(screen.getByRole('button', { name: 'Go to today' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Report progress…' })).toBeInTheDocument();
    expect(overflowItem('Clear visual placement')).toBeInTheDocument();
  });
});
