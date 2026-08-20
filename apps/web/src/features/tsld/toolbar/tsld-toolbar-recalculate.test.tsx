import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

/**
 * **The Recalculate command's busy state** (M5 T5.2).
 *
 * A recalculation moved every bar on the canvas and the one control that triggers it never moved:
 * the whole in-flight state was a tooltip string on a greyed button, which a planner watching the
 * diagram is not looking at. The icon now spins.
 *
 * A spin alone would be a lie of omission, though — `globals.css`'s global
 * `@media (prefers-reduced-motion: reduce)` rule cuts **every** animation in the app to 0.01 ms, so
 * a motion-averse planner gets a stationary spinner and no signal at all. That is why the same fact
 * is carried in two motion-independent channels beside it: `aria-busy` on the control, and the
 * pre-existing "Recalculating…" disabled reason. This suite pins all three together, because the
 * one that is easiest to delete in a later refactor is the one nobody can see.
 *
 * `recalcPending` is the **shared** coalescer's `isPending` (`use-tsld-toolbar-context.tsx`), so
 * these assertions hold for the debounced auto-recalculation after a canvas edit exactly as they do
 * for a press of this button.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_AUTHORING_ENABLED: true,
  SCHEDULING_MODES_ENABLED: false,
}));

function renderDoRow(over: Partial<TsldToolbarContext> = {}) {
  const rows = splitByRow(buildTsldToolbarItems());
  return render(
    <Toolbar
      items={rows.strip}
      context={makeTsldToolbarContext({
        summaryContent: null,
        canRecalc: true,
        ...over,
      })}
      label="Plan commands"
      authoringEnabled
    />,
  );
}

function recalculateButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Recalculate' });
}

/** The button's rendered icon (decorative, so it is not reachable by role). */
function iconOf(button: HTMLElement): SVGElement {
  const svg = button.querySelector('svg');
  if (!svg) throw new Error('Recalculate rendered no icon');
  return svg;
}

describe('TSLD toolbar — Recalculate busy state', () => {
  it('spins the icon while a recalculation is in flight', () => {
    renderDoRow({ recalcPending: true });
    expect(iconOf(recalculateButton())).toHaveClass('animate-spin');
  });

  it('shows the resting icon when idle, with no animation', () => {
    renderDoRow({ recalcPending: false });
    expect(iconOf(recalculateButton())).not.toHaveClass('animate-spin');
  });

  it('carries aria-busy and stays disabled with its reason while in flight', () => {
    renderDoRow({ recalcPending: true });
    const button = recalculateButton();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    // **`Recalculate — Recalculating…`, not the reason alone** (ADR-0099 M10). This item stopped
    // pinning its label, so in a row that cannot afford the word it renders icon-only — and an
    // icon-only control's tooltip has to carry its NAME as well as its reason, or a pointer user is
    // told "Recalculating…" by a button they cannot identify. The `—` form is `ToolbarButton`'s, not
    // this item's; what changed here is only which side of the label policy this command sits on.
    expect(button).toHaveAttribute('title', 'Recalculate — Recalculating…');
  });

  it('carries no aria-busy when idle', () => {
    renderDoRow({ recalcPending: false });
    const button = recalculateButton();
    expect(button).not.toHaveAttribute('aria-busy');
    expect(button).not.toHaveAttribute('aria-disabled');
  });

  it('keeps the pen-gated reason when the pen is not held, busy or not', () => {
    // Both halves of "the pen is not held": recalculation is pen-gated exactly as schedule editing
    // is, so a fixture setting only one is describing a state the model cannot produce.
    renderDoRow({ recalcPending: false, canRecalc: false, canEditSchedule: false });
    expect(recalculateButton()).toHaveAttribute(
      'title',
      'Recalculate — Start editing to recalculate.',
    );
  });

  /**
   * **The reduced-motion branch.** jsdom evaluates no stylesheet, so the global rule cannot be
   * exercised directly — what *is* testable, and what actually matters, is that the busy state does
   * not depend on the animation at all. With `prefers-reduced-motion: reduce` reported by
   * `matchMedia`, every non-motion cue is still there, and the animation is expressed as Tailwind's
   * `animate-spin` (which the global rule neutralises) rather than a bespoke inline animation that
   * would escape it.
   */
  it('conveys the busy state without motion under prefers-reduced-motion', () => {
    const matchMedia = vi.fn((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    vi.stubGlobal('matchMedia', matchMedia);
    try {
      renderDoRow({ recalcPending: true });
      const button = recalculateButton();
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(button).toHaveAttribute('title', 'Recalculate — Recalculating…');
      const icon = iconOf(button);
      expect(icon).toHaveClass('animate-spin');
      expect(icon.getAttribute('style')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
