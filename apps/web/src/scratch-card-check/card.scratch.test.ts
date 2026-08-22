import { describe, it, expect } from 'vitest';
import { compositeOver, parseColour, relativeLuminance, fmtRatio } from '@/test/colour';
import { blockBody, declarations, THEME_SELECTORS, themeTokens } from '@/test/css-blocks';

function resolve(theme: (typeof THEME_SELECTORS)[number], scope: string): Map<string, string> {
  const tokens = new Map(themeTokens(theme));
  if (scope === 'page') return tokens;
  for (const [name, value] of declarations(blockBody(`[data-surface='${scope}']`))) {
    const source = /^var\((--[a-z0-9-]+)\)$/.exec(value)?.[1];
    const resolved = source === undefined ? value : tokens.get(source);
    tokens.set(name, resolved!);
  }
  return tokens;
}
function fillOf(tokens: Map<string, string>) {
  const background = tokens.get('--background')!;
  return compositeOver(parseColour(background), [1, 1, 1]);
}
function ratio(tokens: Map<string, string>, fillToken: string, inkToken: string) {
  const fillValue = tokens.get(fillToken)!;
  const inkValue = tokens.get(inkToken)!;
  const surface = fillOf(tokens);
  const fill = compositeOver(parseColour(fillValue), surface);
  const ink = compositeOver(parseColour(inkValue), fill);
  const a = relativeLuminance(fill);
  const b = relativeLuminance(ink);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('scratch card check', () => {
  for (const theme of THEME_SELECTORS) {
    it(`card on canvas ${String(theme)}`, () => {
      const tokens = resolve(theme, 'canvas');
      const r = ratio(tokens, '--canvas', '--card');
      console.log(theme, 'card-vs-canvas', fmtRatio(r));
      const r2 = ratio(tokens, '--card', '--card-foreground');
      console.log(theme, 'card-fg-vs-card', fmtRatio(r2));
      const r3 = ratio(tokens, '--card', '--ring');
      console.log(theme, 'ring-vs-card', fmtRatio(r3));
      expect(true).toBe(true);
    });
  }
});

describe('ring vs canvas', () => {
  for (const theme of THEME_SELECTORS) {
    it(`ring on canvas ${String(theme)}`, () => {
      const tokens = resolve(theme, 'canvas');
      const r = ratio(tokens, '--canvas', '--ring');
      console.log(theme, 'ring-vs-canvas', fmtRatio(r));
      expect(true).toBe(true);
    });
  }
});
