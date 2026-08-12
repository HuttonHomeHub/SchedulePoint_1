import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

/**
 * The rollback path (`VITE_GUEST_SHARE_LINKS=false`, ADR-0051 F-M4): with the share flag OFF, the
 * `share` id resolves to its existing `placeholderItem()` "Coming soon" stub — byte-for-byte the
 * pre-feature toolbar (disabled, "Share… — Coming soon", never wired to `openShare`). This guards the
 * flag's byte-identical-when-off contract; the flag-on matrix lives in `tsld-toolbar-share.test.tsx`.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_AUTHORING_ENABLED: true,
  SCHEDULING_MODES_ENABLED: true,
  GUEST_SHARE_LINKS_ENABLED: false,
}));

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({ summaryContent: null, ...over });
}

function renderRows(context: TsldToolbarContext) {
  const rows = splitByRow(buildTsldToolbarItems());
  return render(
    <div>
      <Toolbar items={rows.do} context={context} label="Build and manage" authoringEnabled />
    </div>,
  );
}

/**
 * Open the **Share & export** trigger (ADR-0090 M2-T4) and return to the caller.
 *
 * Share was its own Row-2 button; it is a row in this menu now. What the assertions below prove is
 * unchanged — that is the point of re-homing them rather than rewriting them.
 */
function openDeliver(): void {
  const trigger = screen.getByRole('button', { name: /Share & export/ });
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger);
}

describe('TSLD toolbar Share (VITE_GUEST_SHARE_LINKS off — rollback)', () => {
  it('offers no Share row at all inside Share & export', () => {
    // Share moved into the Share & export menu in ADR-0090 M2-T4 and took its flag with it. Its
    // Row-2 "Coming soon" placeholder is NOT reproduced as a menu row — the M2-T2 precedent: a
    // placeholder earns its place on a persistent row a planner scans, not inside a menu they have
    // to open to find it. So flag-off there is simply no such row, which is what this pins.
    const openShare = vi.fn();
    renderRows(ctx({ openShare, canShare: true }));
    openDeliver();
    expect(screen.queryByRole('menuitem', { name: 'Share…' })).not.toBeInTheDocument();
    expect(openShare).not.toHaveBeenCalled();
  });
});
