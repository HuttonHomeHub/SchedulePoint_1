/**
 * Colour maths for contrast assertions.
 *
 * Four test suites had each grown their own copy of an OKLCH → luminance helper
 * (`render/lenses.test.ts`, `render/palette.test.ts`, and the two token suites in
 * `styles/`). Four copies is four chances for one of them to be subtly wrong and quietly
 * pass — which is precisely the failure mode the Corporate-theme contrast defects were.
 *
 * Everything here is pure and dependency-free, so it can be imported from any test.
 */

/** An sRGB triple, gamma-encoded, each channel in `0..1`. */
export type Srgb = readonly [number, number, number];

/** A colour with an alpha channel — `alpha === 1` for the opaque case. */
export interface Colour {
  readonly srgb: Srgb;
  readonly alpha: number;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Gamma-encode a linear-light sRGB channel (IEC 61966-2-1). */
const encodeGamma = (x: number): number =>
  x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;

/** Linearise a gamma-encoded sRGB channel — the transform WCAG 1.4.3 specifies. */
const decodeGamma = (x: number): number =>
  x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;

/**
 * OKLCH → gamma-encoded sRGB. Out-of-gamut results are clamped per channel, which is what
 * a browser does when it renders one, so the ratio we compute is the ratio a user sees.
 */
export function oklchToSrgb(L: number, C: number, H: number): Srgb {
  const hr = (H * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return [
    clamp01(encodeGamma(clamp01(linear[0]!))),
    clamp01(encodeGamma(clamp01(linear[1]!))),
    clamp01(encodeGamma(clamp01(linear[2]!))),
  ];
}

/** `#rgb` / `#rrggbb` → gamma-encoded sRGB. */
export function hexToSrgb(hex: string): Srgb {
  const raw = hex.replace('#', '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ];
}

const OKLCH = /^oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)(?:\s*\/\s*([\d.]+)(%?))?\s*\)$/i;

/**
 * Parse a CSS colour value as written in `globals.css`: `oklch(L C H)`, `oklch(L C H / 10%)`
 * or a hex literal. Throws rather than returning a fallback — a token this cannot read is a
 * token the contrast suite would otherwise silently stop checking.
 */
export function parseColour(value: string): Colour {
  const text = value.trim();
  const match = OKLCH.exec(text);
  if (match) {
    const lightness = match[1]!.endsWith('%')
      ? Number.parseFloat(match[1]!) / 100
      : Number.parseFloat(match[1]!);
    const chroma = match[2]!.endsWith('%')
      ? (Number.parseFloat(match[2]!) / 100) * 0.4
      : Number.parseFloat(match[2]!);
    const hue = Number.parseFloat(match[3]!);
    const alphaRaw = match[4];
    const alpha =
      alphaRaw === undefined
        ? 1
        : match[5] === '%'
          ? Number.parseFloat(alphaRaw) / 100
          : Number.parseFloat(alphaRaw);
    return { srgb: oklchToSrgb(lightness, chroma, hue), alpha };
  }
  if (text.startsWith('#')) return { srgb: hexToSrgb(text), alpha: 1 };
  throw new Error(`parseColour: unsupported colour value "${value}"`);
}

/**
 * Flatten a translucent colour onto the fill behind it. Dark's borders and dividers are
 * written as `oklch(1 0 0 / 10%)`; treating that as opaque white would report a contrast
 * ratio no user ever sees. Compositing happens in gamma-encoded space, which is where the
 * browser does it.
 */
export function compositeOver(colour: Colour, backdrop: Srgb): Srgb {
  if (colour.alpha >= 1) return colour.srgb;
  const a = clamp01(colour.alpha);
  return [
    colour.srgb[0] * a + backdrop[0] * (1 - a),
    colour.srgb[1] * a + backdrop[1] * (1 - a),
    colour.srgb[2] * a + backdrop[2] * (1 - a),
  ];
}

/** WCAG relative luminance of a gamma-encoded sRGB triple. */
export function relativeLuminance(srgb: Srgb): number {
  const [r, g, b] = srgb.map(decodeGamma) as unknown as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two opaque colours — symmetric, `1`…`21`. */
export function contrastRatio(a: Srgb, b: Srgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Convenience: contrast between two OKLCH triples, the form most tokens are authored in. */
export function oklchContrast(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  return contrastRatio(oklchToSrgb(...a), oklchToSrgb(...b));
}

/**
 * Contrast between two CSS token VALUES, compositing either onto `backdrop` if it is
 * translucent. This is the entry point the token-contrast suite uses.
 */
export function tokenContrast(fill: string, ink: string, backdrop?: Srgb): number {
  const base = backdrop ?? compositeOver(parseColour(fill), [1, 1, 1]);
  const fillSrgb = compositeOver(parseColour(fill), base);
  const inkSrgb = compositeOver(parseColour(ink), fillSrgb);
  return contrastRatio(fillSrgb, inkSrgb);
}

/** Round to 2dp for readable failure messages. */
export function fmtRatio(ratio: number): string {
  return `${Math.round(ratio * 100) / 100}:1`;
}
