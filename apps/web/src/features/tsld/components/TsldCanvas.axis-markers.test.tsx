import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { RenderActivity } from '../render/render-model';
import { DEFAULT_VIEW_TOGGLES } from '../render/view-toggles';

import { RULER_HEIGHT, TsldCanvas } from './TsldCanvas';

/**
 * **The axis-marker rows** (`docs/TECH_DEBT.md` #148, `docs/specs/canvas-axis-markers/`).
 *
 * This is **replacement guard (a)**. What it replaces is worth stating, because the two guards it
 * succeeds were careful and correct and about the wrong subject: `paint.test.ts` asserted that
 * `TODAY_CHIP_TOP` sat clear of the cursor chip's footprint and that `DATA_DATE_CHIP_TOP` sat clear
 * of Today's, each with a docblock about not silently reintroducing a collision. **Both asked
 * whether the pills collided with each other. Nothing ever asked what was underneath them**, and a
 * bar occupies y 5–23 of a lane that starts wherever the planner last panned to.
 *
 * So the guards now look outward. This one pins both rows wholly inside the ruler band, which is the
 * static half of "a marker never covers a bar". The dynamic half — that no marker's rect actually
 * intersects the scene canvas's, at more than one pan position, with and without the pen — is
 * `apps/web/e2e-axis-markers/`, because it is a question about two elements in a real layout and
 * jsdom has none.
 */
const ACTIVITIES: RenderActivity[] = [
  {
    id: 'a1',
    type: 'TASK',
    laneIndex: 0,
    label: 'Excavate',
    earlyStart: '2026-03-16',
    earlyFinish: '2026-03-18',
    isCritical: false,
    isNearCritical: false,
  },
];

function renderCanvas(todayOffset = 1, todayFraction = 0): HTMLElement {
  const { container } = render(
    <TsldCanvas
      activities={ACTIVITIES}
      edges={[]}
      dataDate="2026-03-16"
      selectedId={null}
      onSelect={vi.fn()}
      fitSignal={0}
      todayOffset={todayOffset}
      todayFraction={todayFraction}
    />,
  );
  return container;
}

/** `top-3 h-3.5` / `bottom-0 h-3.5` as numbers, so the assertion reads the CLASS the row carries. */
function rowExtent(row: Element): { top: number; bottom: number } {
  const cls = row.className;
  const height = cls.includes('h-3.5') ? 14 : NaN;
  if (Number.isNaN(height)) throw new Error(`row has no recognised height class: ${cls}`);
  if (cls.includes('bottom-0')) return { top: RULER_HEIGHT - height, bottom: RULER_HEIGHT };
  const topMatch = /(?:^|\s)top-(\d+)(?:\s|$)/.exec(cls);
  if (!topMatch) throw new Error(`row is neither bottom-anchored nor top-anchored: ${cls}`);
  const top = Number(topMatch[1]) * 4; // Tailwind's 0.25rem step
  return { top, bottom: top + height };
}

/**
 * Give jsdom enough layout for the marker path to run at all.
 *
 * **Both halves matter and the first version had only one.** The canvas measures itself with
 * `getBoundingClientRect`, which jsdom answers with zeros, so `size.width` is 0 and `axisMarkers`
 * correctly culls every mark off a zero-pixel surface — without a container width this case would
 * pass vacuously against a product rendering no marker at all, which is the shape ADR-0081 records
 * shipping four times. But stubbing every element to 800 px is worse than useless: the label probe
 * is also an element, so every label measures 800 px, both marks clamp to 0 and the overlap rule
 * withholds Today *always*. So a `<span>` gets a per-character width and everything else the
 * container's.
 *
 * 6.5 px/char is a stand-in and is deliberately not presented as the product's metric — the real
 * widths are measured in a browser (`docs/specs/canvas-axis-markers/m0-measurements.md` M0-T1:
 * `Today` 41.1 px, `Data date` 62.6 px in this band). What this fixture needs is only that a label
 * is narrower than the surface and wider than nothing.
 */
function stubLayout(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const width = this.tagName === 'SPAN' ? this.textContent.length * 6.5 + 6 : 800;
    return {
      width,
      height: 400,
      top: 0,
      left: 0,
      right: width,
      bottom: 400,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  });
}

describe('the axis-marker rows live inside the ruler band', () => {
  it('renders both rows as descendants of the ruler, so they inherit its aria-hidden', () => {
    // Trap T8. The canvas already carries the parallel a11y listbox (ADR-0026 D7); a marker that
    // announced itself would be a second voice for a fact the listbox already states. Rendering
    // INSIDE the ruler is what makes that true without a second `aria-hidden` to keep in step —
    // and a sibling overlay is exactly the shape that would quietly stop being hidden.
    const container = renderCanvas();
    const ruler = container.querySelector('[data-testid="tsld-ruler"]');
    expect(ruler).toHaveAttribute('aria-hidden', 'true');
    for (const id of ['tsld-axis-markers', 'tsld-axis-markers-transient']) {
      const row = container.querySelector(`[data-testid="${id}"]`);
      expect(row, id).not.toBeNull();
      expect(ruler?.contains(row as Node), `${id} must be inside the ruler`).toBe(true);
    }
  });

  it('both rows lie wholly inside RULER_HEIGHT, and neither reaches the year row', () => {
    const container = renderCanvas();
    const persistent = rowExtent(container.querySelector('[data-testid="tsld-axis-markers"]')!);
    const transient = rowExtent(
      container.querySelector('[data-testid="tsld-axis-markers-transient"]')!,
    );

    for (const [name, extent] of Object.entries({ persistent, transient })) {
      expect(extent.top, `${name} row starts above the band`).toBeGreaterThanOrEqual(0);
      expect(extent.bottom, `${name} row overflows the band`).toBeLessThanOrEqual(RULER_HEIGHT);
    }

    // The year label occupies y 0–12 and is pinned at x = 0 (`time-scale.ts:213`). It is the one
    // thing in this band a reader cannot reconstruct from a neighbour — there is exactly one of it
    // — and a left-clamped marker is the COMMON case, not the edge case, because `fitToContent`
    // frames from the plan start. So no marker row may reach it. This is the answer to the spec's
    // CQ-2, chosen from the measured occupancy rather than from arithmetic, and it is the reason
    // the rows are 12–26 / 26–40 rather than the 4–20 / 22–38 the spec first proposed.
    const YEAR_ROW_BOTTOM = 12;
    expect(persistent.top).toBeGreaterThanOrEqual(YEAR_ROW_BOTTOM);
    expect(transient.top).toBeGreaterThanOrEqual(YEAR_ROW_BOTTOM);

    // …and the two rows do not overlap each other either.
    expect(transient.bottom).toBeLessThanOrEqual(persistent.top);
  });

  it('paints the persistent markers with the labels the model produced', async () => {
    // The seam between the pure model and the node pool, which no unit test of either half can see.
    //
    // **jsdom needs a width stubbed in, and that is a real limitation rather than a formality.**
    // The canvas measures itself with `getBoundingClientRect`, which jsdom answers with zeros, so
    // `size.width` is 0 and `axisMarkers` correctly CULLS everything — the marks are off a
    // zero-pixel surface. Without the stub this case would pass vacuously against a product that
    // renders no marker at all, which is the shape ADR-0081 records shipping four times.
    const rect = stubLayout();
    const container = renderCanvas();
    const row = container.querySelector('[data-testid="tsld-axis-markers"]');
    await waitFor(() => {
      expect(row?.querySelectorAll('[data-axis-marker]').length).toBeGreaterThan(0);
    });
    const marks = [...(row?.querySelectorAll('[data-axis-marker]') ?? [])];
    // jsdom has no layout, so every width measures 0 and every mark clamps to 0 — which is why
    // this asserts what they SAY and never where they sit.
    expect(marks.map((m) => m.textContent)).toEqual(['Data date', 'Today']);
    rect.mockRestore();
  });

  it('withholds the Today MARK when the two would collide, and keeps its rule (CQ-1)', async () => {
    // The measured overlap rule reaching the DOM. This fixture is a three-day plan, so
    // `fitToContent` zooms to the 200 px/day ceiling; a fifth of a day then puts the two rules
    // 40 px apart, inside the 52 px separation the two labels need
    // — so `Data date` keeps its word and `Today` keeps only its dashed rule, which is a documented
    // channel of its own (ADR-0056) named in both legends. Measured at M0-T2: this collision needs
    // the two within 1.1 days at Week and 0.5 at Day on a real 1297 px canvas, so on a real screen
    // it is close to the coincident case the model already merges.
    const rect = stubLayout();
    const container = renderCanvas(0, 0.2);
    const row = container.querySelector('[data-testid="tsld-axis-markers"]');
    await waitFor(() => {
      expect(row?.querySelectorAll('[data-axis-marker]:not([style*="display: none"])').length).toBe(
        1,
      );
    });
    expect(
      [...(row?.querySelectorAll('[data-axis-marker]') ?? [])].map((m) => m.textContent),
    ).toEqual(['Data date']);
    rect.mockRestore();
  });

  it('RETIRES a pooled marker rather than leaving it showing a stale label', async () => {
    // The transition the first version of this suite could not see, because every case was a fresh
    // `render()`: a pool that grows to two nodes and then needs one. A retired node keeps its text
    // and is hidden with `display: none`, so a reader who only counted `[data-axis-marker]` would
    // find the stale one and a reader who only checked `textContent` would too. Both halves are
    // asserted, which is why this case is not the same as the paired one above with a different
    // fixture.
    //
    // It also pins the shape a browser gate structurally cannot: `e2e-axis-markers` filters to
    // markers with a NON-ZERO rect, so a retired node is invisible to it by design (trap T13).
    // Nothing there would notice a pool that never retired.
    const rect = stubLayout();
    const { container, rerender } = render(
      <TsldCanvas
        activities={ACTIVITIES}
        edges={[]}
        dataDate="2026-03-16"
        selectedId={null}
        onSelect={vi.fn()}
        fitSignal={0}
        todayOffset={1}
        todayFraction={0}
      />,
    );
    const row = container.querySelector('[data-testid="tsld-axis-markers"]');
    const shown = (): HTMLElement[] =>
      [...(row?.querySelectorAll<HTMLElement>('[data-axis-marker]') ?? [])].filter(
        (n) => n.style.display !== 'none',
      );
    await waitFor(() => {
      expect(shown().map((n) => n.textContent)).toEqual(['Data date', 'Today']);
    });

    // Turn the Today toggle off: the model drops that mark, and the pool must retire its node.
    rerender(
      <TsldCanvas
        activities={ACTIVITIES}
        edges={[]}
        dataDate="2026-03-16"
        selectedId={null}
        onSelect={vi.fn()}
        fitSignal={0}
        todayOffset={1}
        todayFraction={0}
        view={{ ...DEFAULT_VIEW_TOGGLES, today: false }}
      />,
    );
    await waitFor(() => {
      expect(shown().map((n) => n.textContent)).toEqual(['Data date']);
    });
    // The retired node still exists in the pool — that is the point of a pool — and is hidden.
    const all = [...(row?.querySelectorAll<HTMLElement>('[data-axis-marker]') ?? [])];
    expect(all).toHaveLength(2);
    expect(all[1]?.style.display).toBe('none');
    rect.mockRestore();
  });
});
