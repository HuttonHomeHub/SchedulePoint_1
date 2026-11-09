import { describe, expect, it, vi } from 'vitest';

import { flagDefaultOff, flagDefaultOn } from './env';

describe('flagDefaultOn', () => {
  it('is on unless the operator explicitly opts out with "false" or "0"', () => {
    expect(flagDefaultOn(undefined)).toBe(true);
    expect(flagDefaultOn('')).toBe(true);
    expect(flagDefaultOn('true')).toBe(true);
    expect(flagDefaultOn('false')).toBe(false);
    expect(flagDefaultOn('0')).toBe(false);
  });
});

describe('flagDefaultOff', () => {
  it('is on ONLY for an explicit opt-in ("true"/"1")', () => {
    expect(flagDefaultOff('true')).toBe(true);
    expect(flagDefaultOff('1')).toBe(true);
  });

  it('stays off for undefined, blank, and anything else — the dark-by-default guard', () => {
    expect(flagDefaultOff(undefined)).toBe(false);
    expect(flagDefaultOff('')).toBe(false);
    expect(flagDefaultOff('false')).toBe(false);
    expect(flagDefaultOff('0')).toBe(false);
    expect(flagDefaultOff('TRUE')).toBe(false); // case-sensitive: only the literal "true"
    expect(flagDefaultOff('yes')).toBe(false);
  });
});

describe('CANVAS_AUTHORING_FLOW_ENABLED', () => {
  // Derived from the canvas-authoring flag, not read beside it: every surface behind it states or
  // steers a canvas-first authoring tool, so with canvas authoring off there is no armed tool to
  // state and the band/confirmation/quiescence would be inert scaffolding. Deriving the constant
  // makes that pair unrepresentable; this asserts the `&&` is actually the right way round.
  it('is off whenever canvas authoring is off, however it is set', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_CANVAS_AUTHORING', 'false');
    vi.stubEnv('VITE_CANVAS_AUTHORING_FLOW', 'true');
    const env = await import('./env');
    expect(env.CANVAS_AUTHORING_ENABLED).toBe(false);
    expect(env.CANVAS_AUTHORING_FLOW_ENABLED).toBe(false);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('defaults ON when nothing is set', async () => {
    vi.resetModules();
    const env = await import('./env');
    expect(env.CANVAS_AUTHORING_FLOW_ENABLED).toBe(true);
    vi.resetModules();
  });
});

describe('CANVAS_LINK_ROUTING_ENABLED', () => {
  // Derived from the direct-manipulation flag for a structural reason, not a stylistic one: the
  // routing is reached only through the refreshed link path's fanned anchors (`scene.visualRefresh`),
  // which is the sole branch composing `routeOrthogonal` directly. With direct manipulation off
  // there is no branch to enter, so the pair would be silently inert rather than merely unused.
  it('is off whenever direct manipulation is off, however it is set', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_CANVAS_DIRECT_MANIPULATION', 'false');
    vi.stubEnv('VITE_CANVAS_LINK_ROUTING', 'true');
    const env = await import('./env');
    expect(env.CANVAS_DIRECT_MANIPULATION_ENABLED).toBe(false);
    expect(env.CANVAS_LINK_ROUTING_ENABLED).toBe(false);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('can be switched off on its own — the rollback contract', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_CANVAS_LINK_ROUTING', 'false');
    const env = await import('./env');
    expect(env.CANVAS_DIRECT_MANIPULATION_ENABLED).toBe(true);
    expect(env.CANVAS_LINK_ROUTING_ENABLED).toBe(false);
    vi.unstubAllEnvs();
    vi.resetModules();
  });
});

describe('CANVAS_MULTI_SELECT_ENABLED', () => {
  // Derived from direct manipulation because of a KEYBOARD COLLISION, not a layering preference:
  // the legacy edge-drag reads `Shift` as the start-to-start chord, and the multi-select epic gives
  // `Shift`+click the span meaning (spec `docs/specs/canvas-multi-select/` CQ-2). A standalone flag
  // would let both be live at once, so the `&&` makes that state unrepresentable — and this test is
  // what stops the `&&` being "simplified" away by someone who reads it as decoration.
  it('is off whenever direct manipulation is off, however it is set', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_CANVAS_DIRECT_MANIPULATION', 'false');
    vi.stubEnv('VITE_CANVAS_MULTI_SELECT', 'true');
    const env = await import('./env');
    expect(env.CANVAS_DIRECT_MANIPULATION_ENABLED).toBe(false);
    expect(env.CANVAS_MULTI_SELECT_ENABLED).toBe(false);
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('defaults ON since the M5 gate pass', async () => {
    vi.resetModules();
    const env = await import('./env');
    expect(env.CANVAS_DIRECT_MANIPULATION_ENABLED).toBe(true);
    expect(env.CANVAS_MULTI_SELECT_ENABLED).toBe(true);
    vi.resetModules();
  });

  it('opts OUT on "false" or "0", and on nothing else', async () => {
    for (const [value, expected] of [
      ['false', false],
      ['0', false],
      // The helper's documented trap: a shouted "FALSE" reads as ON. Asserted rather than assumed,
      // because an operator who sets it that way gets silence, not an error — and this is now the
      // rollback switch, which is the worst place for a value that quietly does nothing.
      ['FALSE', true],
      ['no', true],
      ['true', true],
    ] as const) {
      vi.resetModules();
      vi.stubEnv('VITE_CANVAS_MULTI_SELECT', value);
      const env = await import('./env');
      expect(env.CANVAS_MULTI_SELECT_ENABLED, `VITE_CANVAS_MULTI_SELECT=${value}`).toBe(expected);
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });
});
