import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
    const { container } = render(<GanttRuler anchorIso="2026-03-01" widthPx={30} pxPerDay={3} />);
    expect(container.textContent).toMatch(/Mar/);
    expect(container.textContent).toMatch(/2026/);
  });

  // Thinned labels keep their month line; an empty string must not become an empty, padded span.
  it('draws a month line with no text where the zoom leaves it unlabelled', () => {
    const { container } = render(
      <GanttRuler anchorIso="2026-01-01" widthPx={600} pxPerDay={1.1} />,
    );
    const lines = majorTicks(container);
    expect(lines).toHaveLength(19);
    const bare = lines.filter((t) => t.textContent === '');
    expect(bare.length).toBeGreaterThan(0);
    for (const t of bare) expect(t.querySelector('span')).toBeNull();
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

  // #501: jsdom has no layout, so the label probe reads zero and the default pitch stands; with a
  // measured width (200 % text) the same zoom must thin to a coarser step.
  describe('the measured label width', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    const labelCount = (container: HTMLElement): number =>
      [...container.querySelectorAll('span')].filter((s) => s.className.includes('text-muted'))
        .length;

    it('thins the labels when the probe measures wider than the default pitch covers', () => {
      // 1.07 px/day: a quarter is 97.7 px, so the default 64 px pitch labels every other month.
      const props = { anchorIso: '2026-01-01', widthPx: 700, pxPerDay: 1.07 };
      const unmeasured = render(<GanttRuler {...props} />);
      const before = labelCount(unmeasured.container);
      unmeasured.unmount();

      vi.stubGlobal(
        'ResizeObserver',
        class {
          observe(): void {}
          disconnect(): void {}
        },
      );
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        width: 99,
      } as DOMRect);
      const measured = render(<GanttRuler {...props} />);
      expect(labelCount(measured.container)).toBeLessThan(before);
    });
  });
});
