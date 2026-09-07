import { describe, expect, it } from 'vitest';

import { readDeviceFacts } from './device';

/**
 * The device description, and specifically the one distinction it exists to preserve: **"the browser
 * would not tell us" is not the same fact as "we did not ask"**, and neither is the same as a name.
 *
 * Q1 (product owner, 2026-09-07) is to RECORD the renderer string, with masked values recorded as
 * masked. A field that quietly reports "unknown GPU" for both cases would put a fiction in the one
 * column a reader trusts to explain an outlier — which is how #75's single legible reading became
 * legible at all.
 */
const stubWindow = (over: Partial<Record<string, unknown>> = {}): Window => {
  const base = {
    innerWidth: 1646,
    innerHeight: 1080,
    devicePixelRatio: 1.75,
    navigator: { userAgent: 'probe-test', hardwareConcurrency: 8 },
    document: { createElement: () => ({ getContext: () => null }) },
  };
  return { ...base, ...over } as unknown as Window;
};

describe('readDeviceFacts', () => {
  it('records the viewport and pixel ratio a Surface Pro actually reports', () => {
    const f = readDeviceFacts(stubWindow());
    expect(f.viewportWidth).toBe(1646);
    expect(f.devicePixelRatio).toBe(1.75);
    expect(f.hardwareConcurrency).toBe(8);
  });

  it('records a MASKED gpu as masked, not as an unknown name', () => {
    // The browser gave a context and refused the extension. That is a decision it made, and it is
    // different from having no WebGL at all.
    const win = stubWindow({
      document: {
        createElement: () => ({
          getContext: () => ({ getExtension: () => null, getParameter: () => 'generic' }),
        }),
      },
    });
    const f = readDeviceFacts(win);
    expect(f.gpu).toBeNull();
    expect(f.gpuMasked).toBe(true);
  });

  it('records NO WebGL as not-masked, because nothing was withheld', () => {
    const f = readDeviceFacts(stubWindow());
    expect(f.gpu).toBeNull();
    expect(f.gpuMasked).toBe(false);
  });

  it('records the adapter when the browser gives one', () => {
    const win = stubWindow({
      document: {
        createElement: () => ({
          getContext: () => ({
            getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 37446 }),
            getParameter: () => 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics, D3D11)',
          }),
        }),
      },
    });
    // The integrated-vs-discrete distinction. This exact shape is what made #75's reading legible.
    expect(readDeviceFacts(win).gpu).toMatch(/Iris/);
    expect(readDeviceFacts(win).gpuMasked).toBe(false);
  });

  it('survives a browser that throws on WebGL entirely', () => {
    // The probe measures Canvas 2D. WebGL is only how it asks what the GPU is called, so a browser
    // with WebGL disabled must degrade to "no name" rather than failing the whole run.
    const win = stubWindow({
      document: {
        createElement: () => ({
          getContext: () => {
            throw new Error('WebGL disabled');
          },
        }),
      },
    });
    expect(() => readDeviceFacts(win)).not.toThrow();
    expect(readDeviceFacts(win).gpu).toBeNull();
  });
});
