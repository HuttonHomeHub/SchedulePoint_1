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
      // The title repeats the label ONLY when the button is icon-only, because then it is the
      // single thing identifying which control is refusing. A labelled button already shows its
      // name, so the tooltip carries the reason alone. Derived from the rendered button rather
      // than hard-coded, so this case keeps working whichever side of that line an item is on.
      // NOT `hasAttribute('aria-label')` — that was the first shape and it is wrong, because
      // `ToolbarButton` also sets `aria-label` on a LABELLED button once a reason is linked by
      // `aria-describedby`. The discriminator is whether the visible label is rendered, and the
      // label span is the button's first text node.
      const iconOnly = !btn.textContent?.startsWith(name);
      expect(btn).toHaveAttribute('title', iconOnly ? `${name} — Coming soon` : 'Coming soon');
    }
    // **Clear visual start was a fourth here and is deliberately gone** (ADR-0094 M4-T1).
    // It moved to the selection bar, which registers it behind the SAME `VITE_TOOLBAR_QUICK_WINS`
    // flag — so the rollback contract survives, it is just not this surface's any more. Asserted as
    // an absence rather than dropped from the list: a census that quietly shrinks is how a
    // capability goes missing without anything failing (ADR-0073 C4's shape).
    expect(screen.queryByRole('button', { name: 'Clear visual start' })).not.toBeInTheDocument();
  });
});
