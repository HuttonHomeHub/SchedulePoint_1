import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

/**
 * The flag-on Share item (`VITE_GUEST_SHARE_LINKS=true`, ADR-0051 F-M4): the `share` id resolves to a
 * real command that opens the member `ShareLinksDialog` (`openShare`), additionally gated on the caller
 * holding `plan:share` (`ctx.canShare`) — a non-holder sees it shaded with a reason (shade-don't-hide).
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_AUTHORING_ENABLED: true,
  SCHEDULING_MODES_ENABLED: true,
  GUEST_SHARE_LINKS_ENABLED: true,
}));

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({ summaryContent: null, ...over });
}

function renderRows(context: TsldToolbarContext) {
  const rows = splitByRow(buildTsldToolbarItems());
  return render(
    <div>
      <Toolbar items={rows.strip} context={context} label="Plan commands" authoringEnabled />
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

describe('TSLD toolbar Share (VITE_GUEST_SHARE_LINKS on)', () => {
  it('opens the Share dialog for a caller who holds plan:share', () => {
    const openShare = vi.fn();
    renderRows(ctx({ openShare, canShare: true }));
    openDeliver();
    const btn = screen.getByRole('menuitem', { name: 'Share…' });
    expect(btn).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(btn);
    expect(openShare).toHaveBeenCalledTimes(1);
  });

  it('shades the item with a reason for a caller without plan:share (never removed)', () => {
    const openShare = vi.fn();
    renderRows(ctx({ openShare, canShare: false }));
    openDeliver();
    const btn = screen.getByRole('menuitem', { name: 'Share…' });
    expect(btn).toHaveAttribute('aria-disabled', 'true');
    // A `MenuItem` links its reason by `aria-describedby` rather than folding it into a `title`
    // (ADR-0082): announced on focus, where a tooltip is not. The guarantee is unchanged; only the
    // channel it travels on did, and this asserts the channel the destination actually uses.
    expect(btn).toHaveAccessibleDescription('You don’t have permission to share this plan');
    fireEvent.click(btn);
    expect(openShare).not.toHaveBeenCalled();
  });
});
