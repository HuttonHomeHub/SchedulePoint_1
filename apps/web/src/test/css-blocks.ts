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

/** The three theme blocks, in the order a reader meets them. */
export const THEME_SELECTORS = [':root', '.dark', '.corporate'] as const;
export type ThemeSelector = (typeof THEME_SELECTORS)[number];

/** Resolved declarations per theme. `.dark`/`.corporate` inherit anything they don't restate. */
export function themeTokens(selector: ThemeSelector): Map<string, string> {
  const root = declarations(blockBody(':root'));
  if (selector === ':root') return root;
  const merged = new Map(root);
  for (const [name, value] of declarations(blockBody(selector))) merged.set(name, value);
  return merged;
}
