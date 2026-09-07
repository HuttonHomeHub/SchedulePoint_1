/**
 * What machine a number came from.
 *
 * **A timing without its hardware is not comparable to anything**, which is the whole reason this
 * epic stores results at all: `docs/TECH_DEBT.md` #75 has one real-hardware reading, and it is
 * legible only because somebody recorded that the browser had chosen the machine's **integrated**
 * adapter on a laptop that also has a discrete one. Without that line the number reads as "the
 * painter is slow" instead of "this run used the wrong GPU".
 */

export interface DeviceFacts {
  /** CSS pixels, which is what the layout and the bars are sized in. */
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  /** Physical pixels per CSS pixel. The Surface Pro's 175 % scaling lives here. */
  readonly devicePixelRatio: number;
  /**
   * The GPU as the browser describes it, or a marker saying it would not say.
   *
   * **Q1, answered by the product owner on 2026-09-07: record it.** It is fingerprinting-adjacent,
   * and it is also the single most decision-relevant fact in the existing reading. The mitigations
   * are that only a staff member can reach this surface, and that the machine it names is their own.
   *
   * **A masked value is recorded AS masked, never guessed.** Browsers may withhold
   * `WEBGL_debug_renderer_info` (Firefox does by default, and privacy modes elsewhere do too), and
   * writing "unknown GPU" as though it were the adapter's name would put a fiction in the one field
   * a reader trusts to explain an outlier.
   */
  readonly gpu: string | null;
  /** True when the browser withheld the adapter rather than the probe failing to ask. */
  readonly gpuMasked: boolean;
  readonly userAgent: string;
  /** How many CPU threads the browser admits to, or null. Cheap, and it explains a noisy machine. */
  readonly hardwareConcurrency: number | null;
}

/**
 * Ask the browser about itself.
 *
 * Every field is best-effort and **absence is recorded as absence**. The probe would rather store a
 * null than a plausible invention, for the same reason the judge throws rather than guessing.
 */
export function readDeviceFacts(win: Window = window): DeviceFacts {
  const gpu = readGpu(win);
  return {
    viewportWidth: win.innerWidth,
    viewportHeight: win.innerHeight,
    devicePixelRatio: win.devicePixelRatio,
    gpu: gpu.value,
    gpuMasked: gpu.masked,
    userAgent: win.navigator.userAgent,
    hardwareConcurrency:
      typeof win.navigator.hardwareConcurrency === 'number'
        ? win.navigator.hardwareConcurrency
        : null,
  };
}

/**
 * The unmasked renderer string, if the browser will give one.
 *
 * Uses a throwaway WebGL context purely to ask — the probe itself paints with Canvas 2D, and this
 * context is released immediately. `WEBGL_debug_renderer_info` is the only way to see the actual
 * adapter; without it `getParameter(RENDERER)` returns a generic string that cannot distinguish an
 * integrated adapter from a discrete one, which is the distinction that made #75's reading legible.
 */
function readGpu(win: Window): { value: string | null; masked: boolean } {
  try {
    const canvas = win.document.createElement('canvas');
    const gl = canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl');
    if (!gl || !('getExtension' in gl)) return { value: null, masked: false };

    const info = gl.getExtension('WEBGL_debug_renderer_info');
    if (!info) {
      // The browser is withholding the adapter, not failing. Recorded as masked so a reader knows
      // the difference between "we could not ask" and "it would not say".
      return { value: null, masked: true };
    }
    const renderer = gl.getParameter(info.UNMASKED_RENDERER_WEBGL) as unknown;
    return typeof renderer === 'string' && renderer.length > 0
      ? { value: renderer, masked: false }
      : { value: null, masked: true };
  } catch {
    // A browser with WebGL disabled entirely. Not an error worth surfacing — the probe measures
    // Canvas 2D and does not need WebGL for anything but this description.
    return { value: null, masked: false };
  }
}
