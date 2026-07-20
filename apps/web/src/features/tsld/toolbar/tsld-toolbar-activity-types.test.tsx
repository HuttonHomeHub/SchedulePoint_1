import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

/**
 * On-canvas advanced activity types (Stage D, `docs/specs/canvas-activity-types/`) — the Add
 * split-button's "Span between activities" section. This suite pins the flag ON (the flag-off parity
 * — today's disabled Level-of-effort + Hammock "Soon" placeholders — is covered by
 * `tsld-toolbar-authoring.test.tsx`). The Add split-button itself needs `CANVAS_AUTHORING` on, so both
 * flags are pinned here.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_AUTHORING_ENABLED: true,
  CANVAS_ACTIVITY_TYPES_ENABLED: true,
  SCHEDULING_MODES_ENABLED: false,
}));

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({
    summaryContent: null,
    projectFinishContent: null,
    hasDiagram: false,
    ...over,
  });
}

function renderDoRow(context: TsldToolbarContext) {
  const rows = splitByRow(buildTsldToolbarItems());
  return render(
    <Toolbar items={rows.do} context={context} label="Build and manage" authoringEnabled />,
  );
}

describe('TSLD toolbar — on-canvas advanced activity types (flag on)', () => {
  it('replaces the two "Soon" placeholders with ONE live "Level of Effort (hammock)" item', () => {
    renderDoRow(ctx());
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    // A single live item — no "Soon" tag, not disabled — that arms the LOE tool.
    const loe = screen.getByRole('menuitemradio', { name: /Level of Effort \(hammock\)/ });
    expect(loe).not.toHaveAttribute('aria-disabled', 'true');
    expect(loe).not.toHaveTextContent(/Soon/i);

    // No separate "Hammock" item (the LOE is the span-derived hammock — Q1), and no lingering disabled
    // "Level of effort" placeholder.
    expect(screen.queryByRole('menuitem', { name: /^Hammock/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^Level of effort$/ })).not.toBeInTheDocument();
  });

  it('arms the LOE endpoint-pick tool-mode when selected', () => {
    const toggleLoeSpanMode = vi.fn();
    renderDoRow(ctx({ toggleLoeSpanMode }));
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Level of Effort \(hammock\)/ }));
    expect(toggleLoeSpanMode).toHaveBeenCalledOnce();
  });

  it('reflects the armed state as checked (aria-checked)', () => {
    renderDoRow(ctx({ isLoeSpanning: true }));
    // Armed, the trigger label is the mid-pick prompt (B4), not "Add" — open via that name.
    fireEvent.click(screen.getByRole('button', { name: 'Pick start driver' }));
    expect(
      screen.getByRole('menuitemradio', { name: /Level of Effort \(hammock\)/ }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('reflects the armed LOE tool + mid-pick step on the Add trigger label (B4)', () => {
    // Before the first pick the trigger prompts for the start driver (mirroring LinkControl's
    // `Linking · FS`); once a start is picked it flips to the finish driver.
    const rows = splitByRow(buildTsldToolbarItems());
    const doToolbar = (context: TsldToolbarContext) => (
      <Toolbar items={rows.do} context={context} label="Build and manage" authoringEnabled />
    );
    const { rerender } = render(doToolbar(ctx({ isLoeSpanning: true, loeStartPicked: false })));
    expect(screen.getByRole('button', { name: 'Pick start driver' })).toBeInTheDocument();

    rerender(doToolbar(ctx({ isLoeSpanning: true, loeStartPicked: true })));
    expect(screen.getByRole('button', { name: 'Pick finish driver' })).toBeInTheDocument();
  });

  it('shades the LOE item with a reason and stays inert below two activities (B5)', () => {
    const context = ctx({ loeSpanActivityCount: 1 });
    renderDoRow(context);
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    const loe = screen.getByRole('menuitemradio', { name: /Level of Effort \(hammock\)/ });
    expect(loe).toHaveAttribute('aria-disabled', 'true');
    expect(loe).toHaveTextContent('Add activities to span between them');

    // A disabled item never arms the tool.
    fireEvent.click(loe);
    expect(context.toggleLoeSpanMode).not.toHaveBeenCalled();
  });
});
