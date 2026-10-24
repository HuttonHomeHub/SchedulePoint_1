import type { ActivitySummary } from '@repo/types';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LANE_HEIGHT } from '../render/geometry';
import {
  GUTTER_LINE_PX,
  GUTTER_MIN_CONTAINER_PX,
  GUTTER_PAD_PX,
  SWIMLANE_GUTTER_COLLAPSED_PX,
  SWIMLANE_GUTTER_WIDTH_PX,
  type GutterSwimlane,
} from '../render/swimlane-gutter';

import { sceneOrigin } from './TsldCanvas';
import { TsldPanel } from './TsldPanel';

import { anActivity } from '@/test/activity-fixture';

/**
 * **The swimlane gutter is a left reservation, and an offset must not leak into an anchor**
 * (swimlanes epic M2-T3; `docs/specs/swimlanes/ui-architecture.md` C3; ADR-0063 §5's failure, in x).
 *
 * Three widths are exercised wherever it matters: **closed** (0 — the parity case), **open** (the
 * expanded gutter) and **collapsed** (the strip). The method is the same throughout: lay the scene
 * canvas out where the DOM would put it (`sceneOrigin` — `left` the gutter, `top` the ruler), move
 * the pointer to the SAME point relative to the scene, and require that what the product derives
 * from the pointer — the create popover's position, the cursor readout, the drag ghost's pixels —
 * is the same for every width, shifted only by what is a container offset by definition (the
 * popover, which is positioned against the container rather than the canvas).
 *
 * jsdom has no layout, so the geometry is stubbed in: every element is the container's 900 × 700
 * box except the two scene-sized canvases, which sit at the origin the DOM would give them.
 */

const WIDTHS = [
  ['closed', 0],
  ['open', SWIMLANE_GUTTER_WIDTH_PX],
  ['collapsed', SWIMLANE_GUTTER_COLLAPSED_PX],
] as const;

const CONTAINER = { width: 900, height: 700 };

const SWIMLANES: GutterSwimlane[] = [
  { id: 'a', name: 'Mechanical', firstLane: 0, laneCount: 3, activityCount: 2 },
  { id: null, name: null, firstLane: 3, laneCount: 1, activityCount: 1 },
];

function activity(): ActivitySummary {
  return anActivity({
    id: 'a1',
    code: null,
    durationDays: 3,
    durationMinutes: 1440,
    earlyStart: '2026-01-01',
    earlyFinish: '2026-01-03',
    lateStart: '2026-01-01',
    lateFinish: '2026-01-03',
    totalFloat: 0,
    durationType: 'FIXED_DURATION_AND_UNITS_TIME',
    accrualType: 'UNIFORM',
  });
}

function stubLayout(gutterWidthPx: number, containerWidth: number = CONTAINER.width): void {
  const origin = sceneOrigin(0, gutterWidthPx);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const layer = this.dataset['layer'];
    const onScene = layer === 'scene' || layer === 'interaction';
    const width =
      this.tagName === 'SPAN'
        ? this.textContent.length * 6.5 + 6
        : onScene
          ? containerWidth - origin.left
          : containerWidth;
    const height = onScene ? CONTAINER.height - origin.top : CONTAINER.height;
    const left = onScene ? origin.left : 0;
    const top = onScene ? origin.top : 0;
    return {
      width,
      height,
      left,
      top,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    };
  });
}

function mount(gutterWidthPx: number): ReturnType<typeof render> {
  stubLayout(gutterWidthPx);
  return render(
    <TsldPanel
      activities={[activity()]}
      dependencies={[]}
      dataDate="2026-01-01"
      canEdit
      onCreate={vi.fn().mockResolvedValue({ recalcConflict: null })}
      gutterWidthPx={gutterWidthPx}
      gutter={gutterWidthPx > 0 ? { swimlanes: SWIMLANES } : null}
    />,
  );
}

function sceneCanvas(container: HTMLElement): HTMLCanvasElement {
  const c = container.querySelector<HTMLCanvasElement>('canvas[data-layer="scene"]');
  if (!c) throw new Error('scene canvas not rendered');
  return c;
}

/** Records the ink drawn on the interaction canvas, keyed by canvas, so a test can compare pixels. */
function recordInteractionInk(): string[] {
  const ink: string[] = [];
  const original = HTMLCanvasElement.prototype.getContext;
  const wrapped = new WeakMap<HTMLCanvasElement, unknown>();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
    id: string,
  ) {
    const ctx = (original as (id: string) => Record<string, unknown> | null).call(this, id);
    if (!ctx || this.dataset['layer'] !== 'interaction') return ctx as never;
    let proxy = wrapped.get(this);
    if (!proxy) {
      proxy = new Proxy(ctx, {
        get(target, prop, receiver) {
          const value = Reflect.get(target, prop, receiver) as unknown;
          if (
            typeof value === 'function' &&
            ['fillRect', 'strokeRect', 'moveTo', 'lineTo', 'fillText'].includes(String(prop))
          ) {
            return (...args: unknown[]) => {
              ink.push(`${String(prop)}(${args.map((a) => String(a)).join(',')})`);
              return (value as (...a: unknown[]) => unknown)(...args);
            };
          }
          return value;
        },
      });
      wrapped.set(this, proxy);
    }
    return proxy as never;
  } as never);
  return ink;
}

afterEach(() => vi.restoreAllMocks());

describe('the create popover opens where the pointer was released', () => {
  it.each(WIDTHS)(
    'with the gutter %s, at the release point in container coordinates',
    async (_name, width) => {
      const { container } = mount(width);
      const origin = sceneOrigin(0, width);
      fireEvent.click(screen.getByRole('button', { name: 'Add activity' }));
      const canvas = sceneCanvas(container);
      // The same drag RELATIVE TO THE SCENE for every width: scene-local (60, 50) to (120, 50).
      const release = { clientX: origin.left + 120, clientY: origin.top + 50, pointerId: 1 };
      fireEvent.pointerDown(canvas, { ...release, clientX: origin.left + 60 });
      fireEvent.pointerMove(canvas, release);
      fireEvent.pointerUp(canvas, release);

      const popover = (await screen.findByLabelText('Name')).closest<HTMLElement>(
        '[style*="left"]',
      );
      expect(popover).not.toBeNull();
      // The container sits at (0, 0) in this stub, so its coordinates ARE client coordinates: a
      // popover that forgot the gutter would open `width` px to the left of the release.
      expect(popover!.style.left).toBe(`${String(release.clientX)}px`);
      expect(popover!.style.top).toBe(`${String(release.clientY)}px`);
    },
  );
});

describe('the cursor readout and the drag ghost are scene-local', () => {
  it('reads the same date and draws the same ghost pixels at every width', async () => {
    const results: { readout: string; ink: string[] }[] = [];
    for (const [, width] of WIDTHS) {
      const ink = recordInteractionInk();
      const { container, unmount } = mount(width);
      const origin = sceneOrigin(0, width);
      fireEvent.click(screen.getByRole('button', { name: 'Add activity' }));
      const canvas = sceneCanvas(container);
      fireEvent.pointerDown(canvas, {
        clientX: origin.left + 60,
        clientY: origin.top + 50,
        pointerId: 1,
      });
      fireEvent.pointerMove(canvas, {
        clientX: origin.left + 120,
        clientY: origin.top + 50,
        pointerId: 1,
      });
      const row = container.querySelector('[data-testid="tsld-axis-markers-transient"]')!;
      await waitFor(() => {
        expect(row.querySelector('[data-axis-marker="cursor"]')?.textContent).toBeTruthy();
      });
      await waitFor(() => {
        expect(ink.some((c) => c.startsWith('fillRect') || c.startsWith('strokeRect'))).toBe(true);
      });
      results.push({
        readout: row.querySelector('[data-axis-marker="cursor"]')!.textContent,
        ink: [...new Set(ink)].sort(),
      });
      unmount();
      vi.restoreAllMocks();
    }
    const [closed, ...others] = results;
    expect(closed!.readout).not.toBe('');
    for (const other of others) {
      expect(other.readout).toBe(closed!.readout);
      expect(other.ink).toEqual(closed!.ink);
    }
  });
});

describe('the reservation', () => {
  it.each(WIDTHS)("lays the stack out from the gutter's right edge with it %s", (_name, width) => {
    const { container } = mount(width);
    const origin = sceneOrigin(0, width);
    for (const sel of ['canvas[data-layer="scene"]', 'canvas[data-layer="interaction"]']) {
      const el = container.querySelector<HTMLElement>(sel)!;
      expect(el.style.top).toBe(`${String(origin.top)}px`);
      // Written only when there is a gutter: the closed DOM is attribute-for-attribute today's.
      expect(el.style.left).toBe(width > 0 ? `${String(width)}px` : '');
    }
    const ruler = container.querySelector<HTMLElement>('[data-testid="tsld-ruler"]')!;
    expect(ruler.style.left).toBe(width > 0 ? `${String(width)}px` : '');
    // `measure()` subtracts it from the width the scene is sized to.
    const interaction = container.querySelector<HTMLElement>('canvas[data-layer="interaction"]')!;
    expect(interaction.style.width).toBe(`${String(CONTAINER.width - width)}px`);
    expect(Boolean(screen.queryByTestId('tsld-swimlane-gutter'))).toBe(width > 0);
  });

  it('mounts no gutter at width 0 even when handed swimlanes', () => {
    stubLayout(0);
    render(
      <TsldPanel
        activities={[activity()]}
        dependencies={[]}
        dataDate="2026-01-01"
        gutter={{ swimlanes: SWIMLANES }}
      />,
    );
    expect(screen.queryByTestId('tsld-swimlane-gutter')).not.toBeInTheDocument();
  });

  it('writes the sticky labels from the frame loop, and the collapsed strip says the number', async () => {
    const expanded = mount(SWIMLANE_GUTTER_WIDTH_PX);
    const label = expanded.container.querySelector<HTMLElement>('[data-swimlane="a"]')!;
    expect(label.textContent).toBe('Mechanical');
    await waitFor(() => expect(label.style.display).toBe(''));
    expect(Number.parseFloat(label.style.height)).toBeGreaterThan(0);
    expect(Number.parseFloat(label.style.height)).toBeLessThanOrEqual(3 * LANE_HEIGHT);
    expanded.unmount();

    const collapsed = mount(SWIMLANE_GUTTER_COLLAPSED_PX);
    expect(collapsed.container.querySelector('[data-swimlane="a"]')!.textContent).toBe('1');
    // The full name is still reachable: the tooltip.
    expect(collapsed.container.querySelector('[data-swimlane="a"]')).toHaveAttribute(
      'title',
      'Mechanical',
    );
  });
});

describe('the room the container leaves for the expanded gutter', () => {
  const mountAt = (containerWidth: number): ReturnType<typeof vi.fn> => {
    stubLayout(SWIMLANE_GUTTER_COLLAPSED_PX, containerWidth);
    const onGutterRoomChange = vi.fn();
    render(
      <TsldPanel
        activities={[activity()]}
        dependencies={[]}
        dataDate="2026-01-01"
        gutterWidthPx={SWIMLANE_GUTTER_COLLAPSED_PX}
        gutter={{ swimlanes: SWIMLANES }}
        onGutterRoomChange={onGutterRoomChange}
      />,
    );
    return onGutterRoomChange;
  };

  it('is reported withdrawn one pixel under the threshold, so the control can say why', async () => {
    const reported = mountAt(GUTTER_MIN_CONTAINER_PX - 1);
    await waitFor(() => expect(reported).toHaveBeenLastCalledWith(false));
  });

  it('is reported present at the threshold, and never withdrawn on the way', async () => {
    const reported = mountAt(GUTTER_MIN_CONTAINER_PX);
    await waitFor(() => expect(reported).toHaveBeenCalled());
    expect(reported).not.toHaveBeenCalledWith(false);
  });
});

describe('the gutter DOM', () => {
  it('is visual only, marks a cut name, and ties its padding and line height to the model', () => {
    const { container } = mount(SWIMLANE_GUTTER_WIDTH_PX);
    expect(screen.getByTestId('tsld-swimlane-gutter')).toHaveAttribute('aria-hidden', 'true');
    const label = container.querySelector<HTMLElement>('[data-swimlane="a"]')!;
    expect(label).toHaveAttribute('data-cut', 'false');
    // The model reasons in px and the DOM in classes; this is the one place they are held together.
    expect(label).toHaveClass(`px-${String(GUTTER_PAD_PX / 4)}`);
    expect(label).toHaveClass(`py-${String(GUTTER_PAD_PX / 8)}`);
    expect(label).toHaveClass(`leading-${String(GUTTER_LINE_PX / 4)}`);
  });

  it('sets data-cut when a long name does not fit its swimlane', () => {
    stubLayout(SWIMLANE_GUTTER_WIDTH_PX);
    const long = 'Mechanical, electrical and plumbing first fix and second fix, commissioning';
    const { container } = render(
      <TsldPanel
        activities={[activity()]}
        dependencies={[]}
        dataDate="2026-01-01"
        gutterWidthPx={SWIMLANE_GUTTER_WIDTH_PX}
        gutter={{
          swimlanes: [{ id: 'a', name: long, firstLane: 0, laneCount: 1, activityCount: 1 }],
        }}
      />,
    );
    expect(container.querySelector('[data-swimlane="a"]')).toHaveAttribute('data-cut', 'true');
  });

  it('re-labels a gutter that is already mounted when it collapses, and keeps it positioned', async () => {
    stubLayout(SWIMLANE_GUTTER_WIDTH_PX);
    const props = { activities: [activity()], dependencies: [], dataDate: '2026-01-01' };
    const gutter = { swimlanes: SWIMLANES };
    const { container, rerender } = render(
      <TsldPanel {...props} gutterWidthPx={SWIMLANE_GUTTER_WIDTH_PX} gutter={gutter} />,
    );
    const label = (): HTMLElement => container.querySelector<HTMLElement>('[data-swimlane="a"]')!;
    await waitFor(() => expect(label().style.display).toBe(''));

    stubLayout(SWIMLANE_GUTTER_COLLAPSED_PX);
    rerender(<TsldPanel {...props} gutterWidthPx={SWIMLANE_GUTTER_COLLAPSED_PX} gutter={gutter} />);
    expect(label().textContent).toBe('1');
    await waitFor(() => expect(label().style.display).toBe(''));
    expect(Number.parseFloat(label().style.height)).toBeGreaterThan(0);
  });

  it('moves a label with a vertical pan, and hides one panned wholly out of view', async () => {
    const { container } = mount(SWIMLANE_GUTTER_WIDTH_PX);
    const canvas = sceneCanvas(container);
    const origin = sceneOrigin(0, SWIMLANE_GUTTER_WIDTH_PX);
    const a = container.querySelector<HTMLElement>('[data-swimlane="a"]')!;
    await waitFor(() => expect(a.style.display).toBe(''));
    const before = Number.parseFloat(a.style.top);
    expect(before).toBeGreaterThan(0);

    fireEvent.pointerDown(canvas, {
      clientX: origin.left + 300,
      clientY: origin.top + 300,
      pointerId: 1,
    });
    fireEvent.pointerMove(canvas, {
      clientX: origin.left + 300,
      clientY: origin.top + 300 - before,
      pointerId: 1,
    });
    await waitFor(() => expect(Number.parseFloat(a.style.top)).toBeLessThan(before));
    expect(Number.parseFloat(a.style.top)).toBe(0);

    fireEvent.pointerMove(canvas, {
      clientX: origin.left + 300,
      clientY: origin.top - 1000,
      pointerId: 1,
    });
    await waitFor(() => expect(a.style.display).toBe('none'));
  });
});
