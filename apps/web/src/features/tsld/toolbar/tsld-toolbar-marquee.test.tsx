import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

/**
 * **The Marquee select toolbar item** (`docs/specs/canvas-multi-select/` M2-T4).
 *
 * `VITE_CANVAS_MULTI_SELECT` is derived from `VITE_CANVAS_DIRECT_MANIPULATION`, so both are mocked
 * on — a build with multi-select on and direct manipulation off cannot exist, and mocking only the
 * derived flag would test a state the product never reaches (the search-nav precedent).
 *
 * The assertion that carries the design is the **pen** one: this is the first tool in group 4 that
 * is not `penGated`, because selecting is a read (the ADR-0063 M4b rule). The rest of the authoring
 * cluster shades as one set when the pen is not held, and if the marquee had joined it by
 * inheritance a Viewer would be unable to sweep a rectangle to look at something.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_DIRECT_MANIPULATION_ENABLED: true,
  CANVAS_MULTI_SELECT_ENABLED: true,
}));

const toggleMarqueeMode = vi.fn();

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({
    toggleMarqueeMode,
    hasDiagram: true,
    canvasActive: true,
    ...over,
  });
}

/** `authoringEnabled` is the pen: false is a Viewer, or a writer who has not taken the lock. */
function renderDoRow(context: TsldToolbarContext, authoringEnabled: boolean) {
  const rows = splitByRow(buildTsldToolbarItems());
  return render(
    <Toolbar
      items={rows.strip}
      context={context}
      label="Author and act"
      authoringEnabled={authoringEnabled}
    />,
  );
}

const marquee = () => screen.getByRole('button', { name: /^select$/i });

describe('the Marquee select tool', () => {
  it('arms the tool when pressed', () => {
    toggleMarqueeMode.mockClear();
    renderDoRow(ctx(), true);
    fireEvent.click(marquee());
    expect(toggleMarqueeMode).toHaveBeenCalledOnce();
  });

  it('reflects the armed state as pressed, so the bar says which tool has the next click', () => {
    renderDoRow(ctx({ isMarqueeSelecting: true }), true);
    expect(marquee()).toHaveAttribute('aria-pressed', 'true');
  });

  it('stays operable without the pen — selecting is a read', () => {
    toggleMarqueeMode.mockClear();
    renderDoRow(ctx(), false);
    // Not merely present-but-shaded: it must actually fire. Every other tool in this group is
    // disabled here, which is exactly why this one is worth pinning.
    expect(marquee()).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(marquee());
    expect(toggleMarqueeMode).toHaveBeenCalledOnce();
  });
});
