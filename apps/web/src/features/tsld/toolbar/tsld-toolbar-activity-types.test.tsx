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
    hasDiagram: false,
    ...over,
  });
}

/**
 * The Add split-button's **caret**, which opens the kind menu. The primary region arms the tool
 * instead (ADR-0064 T3), so a test that opened the menu by clicking the label would silently arm
 * add-mode and assert against a menu that never opened.
 */
function openTypeMenu(): HTMLElement {
  return screen.getByRole('button', { name: /^Activity type:/ });
}

function renderDoRow(context: TsldToolbarContext) {
  const rows = splitByRow(buildTsldToolbarItems());
  return render(
    <Toolbar items={rows.strip} context={context} label="Plan commands" authoringEnabled />,
  );
}

describe('TSLD toolbar — on-canvas advanced activity types (flag on)', () => {
  it('replaces the two "Soon" placeholders with ONE live "Level of Effort (hammock)" item', () => {
    renderDoRow(ctx());
    fireEvent.click(openTypeMenu());

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
    fireEvent.click(openTypeMenu());
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Level of Effort \(hammock\)/ }));
    expect(toggleLoeSpanMode).toHaveBeenCalledOnce();
  });

  it('reflects the armed state as checked (aria-checked)', () => {
    renderDoRow(ctx({ isLoeSpanning: true }));
    // Armed, the trigger label is the mid-pick prompt (B4), not "Add" — open via that name.
    fireEvent.click(openTypeMenu());
    expect(
      screen.getByRole('menuitemradio', { name: /Level of Effort \(hammock\)/ }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('reflects the armed LOE tool + mid-pick step on the Add trigger label (B4)', () => {
    // Before the first pick the trigger prompts for the start driver (mirroring LinkControl's
    // `Linking · FS`); once a start is picked it flips to the finish driver.
    const rows = splitByRow(buildTsldToolbarItems());
    const doToolbar = (context: TsldToolbarContext) => (
      <Toolbar items={rows.strip} context={context} label="Plan commands" authoringEnabled />
    );
    const { rerender } = render(doToolbar(ctx({ isLoeSpanning: true, loeStartPicked: false })));
    expect(screen.getByRole('button', { name: 'Pick start driver' })).toBeInTheDocument();

    rerender(doToolbar(ctx({ isLoeSpanning: true, loeStartPicked: true })));
    expect(screen.getByRole('button', { name: 'Pick finish driver' })).toBeInTheDocument();
  });

  it('shades the LOE item with a reason and stays inert below two activities (B5)', () => {
    const context = ctx({ loeSpanActivityCount: 1 });
    renderDoRow(context);
    fireEvent.click(openTypeMenu());

    const loe = screen.getByRole('menuitemradio', { name: /Level of Effort \(hammock\)/ });
    expect(loe).toHaveAttribute('aria-disabled', 'true');
    expect(loe).toHaveTextContent('Add activities to span between them');

    // A disabled item never arms the tool.
    fireEvent.click(loe);
    expect(context.toggleLoeSpanMode).not.toHaveBeenCalled();
  });
});

/**
 * The **split-button look is a look, not a split button** (ADR-0055 §3, S1-T3). A true split
 * button is two focusable halves, which inside a toolbar means two roving-tabindex stops in one
 * item — re-opening the a11y gate ADR-0031 closed. The caret divider is therefore decoration on a
 * single control, and this pins that: if someone later makes the caret its own `<button>`, the
 * item count changes and this fails.
 */
describe('the Add control keeps one roving-tabindex stop', () => {
  it('renders the caret inside the trigger, not as a second focusable half', () => {
    const { container } = renderDoRow(ctx());
    const addStops = container.querySelectorAll('[data-toolbar-item="add-activity"]');
    expect(addStops).toHaveLength(1);
    expect(addStops[0]!.tagName).toBe('BUTTON');
    expect(addStops[0]!.querySelectorAll('button')).toHaveLength(0);
  });
});
