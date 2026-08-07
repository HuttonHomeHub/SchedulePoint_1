import { vi } from 'vitest';

import type { Ctx2D } from '../paint';

/**
 * Shared painter test doubles (ADR-0078 S0).
 *
 * These two helpers were duplicated across three suites — `paint.test.ts`,
 * `paint.data-date-parity.test.ts` and `paint.live-feedback.test.ts` — with byte-identical
 * `mockCtx` bodies and two subtly different `recordingCtx` signatures. They are promoted here
 * unchanged so the decomposition steps that follow have one recording surface to compare against,
 * rather than three that could drift apart while each suite stays green.
 *
 * Nothing here is new behaviour: both bodies are moved verbatim, and the only reconciliation is
 * that `recordingCtx` keeps `paint.test.ts`'s optional `base` parameter, which the parameterless
 * callers in the other two suites satisfy already.
 */

/**
 * A minimal 2D context whose every method is a spy.
 *
 * `measureText` returns a deterministic ~6px-per-glyph width so truncation and label-placement
 * assertions are stable — a real context's metrics depend on the font the environment happens to
 * have, which would make those tests machine-dependent.
 */
export function mockCtx() {
  return {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    setTransform: vi.fn(),
    setLineDash: vi.fn(),
    fillText: vi.fn(),
    // Deterministic width so truncation/placement tests are stable: ~6px per glyph.
    measureText: vi.fn((s: string) => ({ width: s.length * 6 }) as TextMetrics),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    textBaseline: 'alphabetic' as CanvasTextBaseline,
    textAlign: 'start' as CanvasTextAlign,
  };
}

/**
 * A recording ctx that logs method calls **and property assignments** in order, so two paints can
 * be compared byte-for-byte (`expect(b.log).toEqual(a.log)`).
 *
 * The property half is what makes this a paint-identity oracle rather than a call counter: the
 * painter communicates colour, alpha, dash and font entirely through assignment, so a proxy that
 * only trapped `get` would report two visibly different pictures as identical.
 */
export function recordingCtx(base: Record<string, unknown> = mockCtx()): {
  ctx: Ctx2D;
  log: string[];
} {
  const target: Record<string | symbol, unknown> = base;
  const log: string[] = [];
  const proxy = new Proxy(target, {
    get(t, prop) {
      const value = t[prop];
      if (typeof value === 'function') {
        return (...args: unknown[]) => {
          log.push(`${String(prop)}(${JSON.stringify(args)})`);
          return (value as (...a: unknown[]) => unknown)(...args);
        };
      }
      return value;
    },
    set(t, prop, value) {
      log.push(`${String(prop)}=${String(value)}`);
      t[prop] = value;
      return true;
    },
  });
  return { ctx: proxy as unknown as Ctx2D, log };
}
