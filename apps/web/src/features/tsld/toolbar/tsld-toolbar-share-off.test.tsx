import { render, screen } from '@testing-library/react';
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
  return makeTsldToolbarContext({ summaryContent: null, projectFinishContent: null, ...over });
}

function renderRows(context: TsldToolbarContext) {
  const rows = splitByRow(buildTsldToolbarItems());
  return render(
    <div>
      <Toolbar items={rows.do} context={context} label="Build and manage" authoringEnabled />
    </div>,
  );
}

describe('TSLD toolbar Share (VITE_GUEST_SHARE_LINKS off — rollback)', () => {
  it('keeps the share id as a "Coming soon" placeholder, byte-for-byte', () => {
    const openShare = vi.fn();
    renderRows(ctx({ openShare, canShare: true }));
    const btn = screen.getByRole('button', { name: 'Share…' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    expect(btn).toHaveAttribute('title', 'Share… — Coming soon');
    // The placeholder is never wired to the opener even for a permitted caller.
    expect(openShare).not.toHaveBeenCalled();
  });
});
