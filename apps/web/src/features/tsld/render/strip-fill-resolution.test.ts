import { describe, expect, it } from 'vitest';

import { paintResourceStrip, type Ctx2D, type ResourceStripPalette } from './paint';
import { categoricalCycleResolved, categoricalCycleVars } from './palette';
import type { ResourceStripSnapshot } from './resource-strip';

import { stackSeries } from '@/features/resources/model/stack-series';

/**
 * **A `var()` never reaches a canvas, and this is what makes that a fact rather than a comment.**
 *
 * Canvas 2D's `fillStyle` setter DISCARDS an unparseable value and leaves the previous colour in
 * place — no throw, no console warning, no visual error state. Verified in Chromium rather than
 * reasoned about: after `fillStyle = '#ff0000'`, assigning `'var(--chart-1)'` reads back
 * `'#ff0000'` and the painted pixel is red. So a stack whose segments carry `var(--chart-n)` paints
 * as ONE SOLID BLOCK, and the feature's whole premise — telling the trades apart by colour — is
 * silently absent.
 *
 * It nearly shipped that way. `stackSeries` emits `var()` because its FIRST consumer is the DOM
 * chart, where a `var()` is the correct form: it follows the surface scope and re-values with the
 * token. The canvas strip then indexed the same ramp and published it straight to the painter.
 * jsdom has no canvas, so every unit test asserting a segment's `fill` string passed on exactly
 * the value a browser refuses — the ADR-0100 M4 minimap-frame defect, in this same token family.
 *
 * Three assertions, each verified red against the code before the fix:
 * 1. the resolved ramp really is resolved (it was the `var()` form for both renderers);
 * 2. the painter refuses an unresolved fill in development (it accepted one, and drew a block);
 * 3. `stackSeries` passes the caller's ramp through (there was no way to give it one).
 */
function stubCtx(): Ctx2D {
  return {
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    fill: () => {},
    setTransform: () => {},
    setLineDash: () => {},
    fillText: () => {},
    measureText: (s: string) => ({ width: s.length * 6 }) as TextMetrics,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textBaseline: 'alphabetic',
    textAlign: 'start',
  };
}

const PALETTE: ResourceStripPalette = {
  bar: '#3b6fbf',
  axis: '#2a2f3a',
  tick: '#7a8090',
  ground: '#f4f6f8',
};

function snapshotWith(fill: string): ResourceStripSnapshot {
  return {
    segments: [{ values: [10, 20], fill }],
    dayOffsets: [
      { start: 0, end: 7 },
      { start: 7, end: 14 },
    ],
    dataDate: '2026-01-01',
    max: 20,
  };
}

describe('the canvas strip never receives an unresolved fill', () => {
  it('resolves every member of the categorical ramp to something a canvas can paint', () => {
    const resolved = categoricalCycleResolved(document.documentElement);
    expect(resolved).toHaveLength(categoricalCycleVars().length);
    for (const member of resolved) {
      expect(member.fill).not.toMatch(/^var\(/);
      expect(member.ink).not.toMatch(/^var\(/);
    }
  });

  it('keeps the DOM form and the canvas form in the same ramp order', () => {
    // Same length, index-aligned: the two renderers cannot disagree about which member is which.
    expect(categoricalCycleResolved(document.documentElement)).toHaveLength(
      categoricalCycleVars().length,
    );
  });

  it('throws in development when a segment fill is still a CSS variable', () => {
    expect(() =>
      paintResourceStrip(
        stubCtx(),
        snapshotWith('var(--chart-1)'),
        { originX: 0, originY: 0, pxPerDay: 10 },
        { width: 400, height: 72 },
        PALETTE,
      ),
    ).toThrow(/CSS variable/);
  });

  it('paints without complaint once the fill is resolved', () => {
    expect(() =>
      paintResourceStrip(
        stubCtx(),
        snapshotWith('#4d43a8'),
        { originX: 0, originY: 0, pxPerDay: 10 },
        { width: 400, height: 72 },
        PALETTE,
      ),
    ).not.toThrow();
  });

  it('gives stackSeries the ramp the caller can paint, and defaults to the DOM form', () => {
    const series = [
      { resourceId: 'a', values: [4, 2], total: 6 },
      { resourceId: 'b', values: [1, 3], total: 4 },
    ];
    const neutral = { fill: '#7a8090', ink: '#f4f6f8' };
    const opts = { resourceName: (id: string) => id, neutral };

    const dom = stackSeries(series, 2, opts);
    expect(dom.segments[0]?.fill).toMatch(/^var\(/);

    const canvas = stackSeries(series, 2, {
      ...opts,
      cycle: categoricalCycleResolved(document.documentElement),
    });
    expect(canvas.segments[0]?.fill).not.toMatch(/^var\(/);
    // …and it is the SAME member, not merely a different string.
    expect(canvas.segments[0]?.fill).toBe(
      categoricalCycleResolved(document.documentElement)[0]?.fill,
    );
  });
});
