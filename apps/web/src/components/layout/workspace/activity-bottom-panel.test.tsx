import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ActivityPanelCollapsedBar, PlanActivitiesFootRow } from './activity-bottom-panel';

/**
 * **The foot row's own branching, which had no unit coverage at all** (ADR-0115 M7; closes the
 * unit half of `docs/TECH_DEBT.md` #202(e)).
 *
 * The row is covered transitively through two callers and end to end by `dock.spec.ts`, and its
 * positional invariant genuinely needs a real layout — that part belongs in the journey and stays
 * there. What did not need a browser, and was pinned nowhere, is the branching: whether the
 * `chrome` scope actually reaches the row, whether `hostsPlanSlots` gates **both** outlets, and
 * whether the toggle renders when given and is absent when not.
 *
 * The middle one is not hypothetical. `hostsPlanSlots` shipped as `hostsDock`, guarding the dock
 * while `PlanFactsOutlet` registered unconditionally forty lines below the docblock explaining why
 * that is fatal — below `md` the whole panel sits in a `display: none` pane, so the plan's facts,
 * its schedule state, its only `Recalculate` and the pen's live region all portalled somewhere no
 * reader could reach them. That was caught by an architecture review, not by a test, and this is
 * the test.
 *
 * The surface assertion exists because ADR-0102's finding was that a scope can go unreached for a
 * long time with nothing reporting it — `resolveTsldPalette` read the page's family for months
 * because the canvas painter asked the wrong element. `chrome-band.test.tsx` sets the precedent of
 * asserting `data-surface` directly.
 */
vi.mock('./canvas-dock', () => ({
  CanvasDockOutlet: () => <div data-testid="dock-outlet" />,
}));
vi.mock('./plan-facts-host', () => ({
  PlanFactsOutlet: () => <div data-testid="facts-outlet" />,
}));

describe('PlanActivitiesFootRow', () => {
  it('paints on the chrome surface scope', () => {
    const { container } = render(<PlanActivitiesFootRow />);
    // **Verified red** by removing `<Surface tone="chrome">` from the component: the row renders a
    // plain `div` and this query finds nothing. Asserting the attribute rather than a colour is
    // deliberate — jsdom resolves no custom properties, so the scope is the only checkable half
    // here and the painted value is the journey's (`m2-result`, measured against the band's own
    // ground at three widths).
    expect(container.querySelector('[data-surface="chrome"]')).toBe(
      container.querySelector('[data-activities-bar]'),
    );
  });

  it('gates BOTH plan slots on `hostsPlanSlots`, never just one', () => {
    const { rerender } = render(<PlanActivitiesFootRow hostsPlanSlots />);
    expect(screen.getByTestId('dock-outlet')).toBeInTheDocument();
    expect(screen.getByTestId('facts-outlet')).toBeInTheDocument();

    rerender(<PlanActivitiesFootRow hostsPlanSlots={false} />);
    // The pair is the point. Guarding one and not the other is exactly what shipped once, and a
    // test asserting only the dock would have passed against it.
    expect(screen.queryByTestId('dock-outlet')).toBeNull();
    expect(screen.queryByTestId('facts-outlet')).toBeNull();
  });

  it('renders the toggle when given one, and nothing in its place when not', () => {
    const { rerender } = render(
      <PlanActivitiesFootRow toggle={<button type="button">Collapse</button>} />,
    );
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument();
    rerender(<PlanActivitiesFootRow />);
    expect(screen.queryByRole('button', { name: 'Collapse' })).toBeNull();
  });

  it('is the same row in the collapsed state, with an Expand control', () => {
    render(<ActivityPanelCollapsedBar onExpand={vi.fn()} />);
    // One component, two states — which is the whole of ADR-0114's foot-row decision. If the
    // collapsed bar ever stops rendering the shared row, the facts and the dock move again.
    expect(document.querySelector('[data-activities-bar]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Expand activities panel' })).toBeInTheDocument();
  });
});
