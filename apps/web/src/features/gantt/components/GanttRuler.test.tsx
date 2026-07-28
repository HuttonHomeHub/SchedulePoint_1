import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { GanttRuler } from './GanttRuler';

// Scoped to the ruler's own wrapper: `container` is itself a div, so a `div > div` selector would
// count the wrapper as a tick and never report zero.
const ticks = (container: HTMLElement): Element[] => [
  ...(container.firstElementChild?.children ?? []),
];
const majorTicks = (container: HTMLElement): Element[] =>
  ticks(container).filter((t) => t.className.includes('inset-y-0'));

describe('GanttRuler', () => {
  it('marks every month boundary in the rendered width', () => {
    // 120 days from 1 Feb reaches into June: Mar, Apr, May, Jun starts, plus Feb 1 itself.
    const { container } = render(<GanttRuler anchorIso="2026-02-01" widthPx={120} pxPerDay={1} />);
    expect(majorTicks(container)).toHaveLength(5);
  });

  it('labels a month tick with its month and year', () => {
    const { container } = render(<GanttRuler anchorIso="2026-03-01" widthPx={10} pxPerDay={1} />);
    expect(container.textContent).toMatch(/Mar/);
    expect(container.textContent).toMatch(/2026/);
  });

  // A tick per day below ~14px is illegible hatching, not information.
  it('omits day ticks when they would be too close to read', () => {
    const { container } = render(<GanttRuler anchorIso="2026-02-02" widthPx={280} pxPerDay={4} />);
    const minor = ticks(container).filter((t) => !t.className.includes('inset-y-0'));
    expect(minor).toHaveLength(0);
  });

  it('draws day ticks once each has room', () => {
    const { container } = render(<GanttRuler anchorIso="2026-02-02" widthPx={280} pxPerDay={20} />);
    const minor = ticks(container).filter((t) => !t.className.includes('inset-y-0'));
    expect(minor.length).toBeGreaterThan(0);
  });

  // Iteration is bounded by the rendered width, not the plan's duration — a ten-year programme
  // must not cost ten years of ticks.
  it('costs the same for a long plan as a short one at the same width', () => {
    const short = render(<GanttRuler anchorIso="2026-02-02" widthPx={200} pxPerDay={2} />);
    const long = render(<GanttRuler anchorIso="2016-02-02" widthPx={200} pxPerDay={2} />);
    expect(ticks(long.container).length).toBeLessThanOrEqual(ticks(short.container).length + 2);
  });

  it('renders nothing for a zero width rather than looping', () => {
    const { container } = render(<GanttRuler anchorIso="2026-02-02" widthPx={0} pxPerDay={6} />);
    expect(ticks(container)).toHaveLength(0);
  });

  it('renders nothing for a non-positive scale', () => {
    const { container } = render(<GanttRuler anchorIso="2026-02-02" widthPx={200} pxPerDay={0} />);
    expect(ticks(container)).toHaveLength(0);
  });

  // The row text carries the dates; the ruler is decoration over the bars.
  it('is hidden from assistive technology', () => {
    const { container } = render(<GanttRuler anchorIso="2026-02-02" widthPx={200} pxPerDay={6} />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});
