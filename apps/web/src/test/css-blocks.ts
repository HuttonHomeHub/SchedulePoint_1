import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A minimal reader for `globals.css` used by the two token suites.
 *
 * Deliberately a regex over top-level blocks rather than a real CSS parser: the file is
 * hand-authored, flat, and the point of these tests is that they fail when someone
 * *restructures* it. A tolerant parser would keep passing through exactly the edits we
 * want to catch.
 */

const GLOBALS = join(dirname(fileURLToPath(import.meta.url)), '..', 'styles', 'globals.css');

let cached: string | null = null;

export function readGlobalsCss(): string {
  cached ??= readFileSync(GLOBALS, 'utf8');
  return cached;
}

/** Strip `/* … *\/` comments so a token named in prose is never mistaken for a declaration. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Whether a top-level block with this exact selector exists. */
export function hasBlock(selector: string): boolean {
  return readGlobalsCss().includes(`\n${selector} {`);
}

/**
 * The body of the top-level block with the given selector, comments removed.
 * Throws when the selector is absent — a renamed theme block must fail loudly, not silently
 * reduce the suite to zero assertions.
 */
export function blockBody(selector: string): string {
  const css = readGlobalsCss();
  const start = css.indexOf(`\n${selector} {`);
  if (start === -1) throw new Error(`globals.css has no top-level "${selector} { … }" block`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('\n}', open);
  if (close === -1) throw new Error(`globals.css: "${selector}" block is not closed`);
  return stripComments(css.slice(open + 1, close));
}

/** Every `--name: value;` declaration in a block body, in source order. */
export function declarations(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const match of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    out.set(match[1]!, match[2]!.trim());
  }
  return out;
}

/**
 * Every theme block in the product. **One** (ADR-0097) — and a LIST rather than a constant,
 * because that is what keeps the mechanism honest: adding a dark theme back is one entry
 * here plus a block of values, and every gate that iterates this list picks it up with no
 * further change.
 *
 * A one-element list is deliberately not collapsed to `':root'`. Doing so would let a
 * spacing scale or a type ramp be declared at `:root` "because that is where tokens live",
 * which is exactly how the single-theme promise dies quietly — the `token-architecture`
 * suite's "no design token outside a theme or scope-rebind block" assertion is written
 * against this list.
 */
export const THEME_SELECTORS = [':root'] as const;
export type ThemeSelector = (typeof THEME_SELECTORS)[number];

/**
 * Follow `var()` aliases to a literal value, the way a browser resolves them.
 *
 * ADR-0097 §1.5a gave the page its own `--page-*` family and made the unqualified names alias it
 * (`--background: var(--page-background)`), so six scopes are symmetric instead of five plus a
 * special case. Every gate that reads a token then met `var(--page-background)` where it expected
 * a colour, and a contrast matrix cannot composite a variable reference.
 *
 * Resolved here once rather than in each gate. The loop handles chains because `--field:
 * var(--background)` on top of the page family is two hops, and it refuses to run forever on a
 * cycle rather than hanging a run with no explanation. A name it cannot resolve is left alone:
 * a scope family token (`--chrome-primary`) is resolved by the scope, not by the theme.
 */
function resolveAliases(tokens: Map<string, string>): Map<string, string> {
  const out = new Map(tokens);
  for (const [name, value] of out) {
    let current = value.trim();
    const seen = new Set<string>([name]);
    let alias = /^var\((--[\w-]+)\)$/.exec(current);
    while (alias) {
      const target = alias[1]!;
      if (seen.has(target)) {
        throw new Error(`token alias cycle: ${[...seen, target].join(' -> ')}`);
      }
      seen.add(target);
      const next = out.get(target);
      if (next === undefined) break;
      current = next.trim();
      alias = /^var\((--[\w-]+)\)$/.exec(current);
    }
    out.set(name, current);
  }
  return out;
}

/**
 * Resolved declarations for a theme. With one theme this is `:root`'s own block; the merge
 * a second theme would need is written out rather than assumed, so the shape of "add dark
 * back" is visible here rather than rediscovered.
 */
export function themeTokens(selector: ThemeSelector): Map<string, string> {
  const root = declarations(blockBody(':root'));
  if (selector === ':root') return resolveAliases(root);
  const merged = new Map(root);
  for (const [name, value] of declarations(blockBody(selector))) merged.set(name, value);
  return resolveAliases(merged);
}
