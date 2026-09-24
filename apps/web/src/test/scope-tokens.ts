import { compositeOver, parseColour, relativeLuminance, type Srgb } from './colour';
import { blockBody, declarations, themeTokens, type ThemeSelector } from './css-blocks';

/**
 * Surface-scope token resolution, shared by the computed contrast matrix
 * (`styles/token-contrast.test.ts`) and by the colour solvers under `scripts/`.
 *
 * It moved here from the test file so a solver asks the **same** resolver the gate asks. A solver
 * holding its own copy would be measuring the copy (ADR-0124), and the two would disagree about a
 * pair only on the day a scope's rebinding changed.
 */

export type Scope = 'page' | 'chrome' | 'panel' | 'brand' | 'auth' | 'canvas' | 'print';
export const SCOPES: Scope[] = ['page', 'chrome', 'panel', 'brand', 'auth', 'canvas', 'print'];

/**
 * Resolve the tokens a component would actually see, given a theme and a surface scope —
 * i.e. replay the cascade by hand.
 *
 * **It used to take a third argument, `flagsOn`, and replay the flag-keyed value layers too**
 * (ADR-0055 §6). ADR-0097 folded those values into the one theme block, so the matrix is
 * half the size and every cell in it describes something a reader can actually reach — which
 * the flags-off half had stopped doing the day `VITE_` inlining made it unreachable
 * (ADR-0088).
 */
export function resolve(theme: ThemeSelector, scope: Scope): Map<string, string> {
  const tokens = new Map(themeTokens(theme));
  if (scope === 'page') return tokens;

  for (const [name, value] of declarations(blockBody(`[data-surface='${scope}']`))) {
    const source = /^var\((--[a-z0-9-]+)\)$/.exec(value)?.[1];
    const resolved = source === undefined ? value : tokens.get(source);
    if (resolved === undefined) throw new Error(`${scope} rebinds ${name} to an unknown ${value}`);
    tokens.set(name, resolved);
  }
  return tokens;
}

/** The opaque fill a scope paints, used as the backdrop for any translucent ink. */
export function fillOf(tokens: Map<string, string>): Srgb {
  const background = tokens.get('--background');
  if (background === undefined) throw new Error('no --background');
  return compositeOver(parseColour(background), [1, 1, 1]);
}

export function ratio(tokens: Map<string, string>, fillToken: string, inkToken: string): number {
  const fillValue = tokens.get(fillToken);
  const inkValue = tokens.get(inkToken);
  if (fillValue === undefined) throw new Error(`${fillToken} is not declared`);
  if (inkValue === undefined) throw new Error(`${inkToken} is not declared`);
  const surface = fillOf(tokens);
  const fill = compositeOver(parseColour(fillValue), surface);
  const ink = compositeOver(parseColour(inkValue), fill);
  const a = relativeLuminance(fill);
  const b = relativeLuminance(ink);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
