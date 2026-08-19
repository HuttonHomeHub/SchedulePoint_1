import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compositeOver, contrastRatio, fmtRatio, parseColour } from '@/test/colour';
import { themeTokens } from '@/test/css-blocks';

/**
 * **The alpha-composited pair census** (ADR-0097 §8.1 / D12).
 *
 * `token-contrast.test.ts` reads TOKEN VALUES. That is the right instrument for `bg-primary` on
 * `--background`, and it is blind to `bg-warning/15` — an alpha modifier is not a token, it is a
 * compile-time instruction to composite one over whatever happens to be behind it. So the product's
 * tinted-wash pattern, which is how every status badge and every alert is painted, had **no gate at
 * all**.
 *
 * **Raised independently by `accessibility-reviewer` and `test-engineer`**, which is what moved it
 * from a nice-to-have to this file. Both named the same shipped consumers:
 *
 * - `badge.tsx` — `bg-destructive/10 text-destructive-text`, `bg-warning/15 text-warning-text`
 * - `alert.tsx` — `bg-destructive-text/10 text-destructive-text` and siblings, rendered on **every
 *   auth screen** (sign-in, forgot-password, reset-password), where the `auth` scope's inks
 *   deliberately differ from the page's
 *
 * **And this exact class has already bitten once.** `--destructive-hover` shipped as
 * `hover:bg-destructive/90`, which composited against the page rather than resolving to a value —
 * invisible to the token census, unmeasured by axe (which never measures a hover state), and live
 * at 4.32:1 on every Delete button until somebody noticed. The fix then was to make it a token. This
 * gate is what would have caught it.
 *
 * **Derived, not listed.** The pairs are scanned out of the source, so a component that adds a wash
 * tomorrow is covered without anyone extending an array — which is the same argument the closure
 * makes one layer up, and the same failure (`TEXT_PAIRS` growing one entry per discovery) it avoids.
 */

/** A `bg-X/NN` wash and the ink painted on it, found together in one class string. */
interface AlphaPair {
  file: string;
  fillToken: string;
  alpha: number;
  inkToken: string;
  className: string;
}

function sourceFiles(): string[] {
  const root = join(process.cwd(), 'src');
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  walk(root);
  return out;
}

/**
 * Find every `bg-<token>/<alpha>` that shares a class string with a `text-<token>`.
 *
 * Scoped to background+ink deliberately: a translucent BORDER is decoration and 1.4.11 exempts it
 * (the same reasoning `token-contrast.test.ts` records for `--border`), while a translucent FILL
 * under real text is the thing nobody was measuring.
 */
function findAlphaPairs(): AlphaPair[] {
  const root = join(process.cwd(), 'src');
  const pairs: AlphaPair[] = [];

  for (const file of sourceFiles()) {
    const source = readFileSync(file, 'utf8');
    // Class strings as authored — a quoted run containing at least one `bg-…/…`.
    for (const match of source.matchAll(/['"`]([^'"`\n]*\bbg-[\w-]+\/\d+[^'"`\n]*)['"`]/g)) {
      const className = match[1]!;
      const fill = /\bbg-([\w-]+)\/(\d+)\b/.exec(className);
      const ink = /\btext-([\w-]+)\b/.exec(className);
      if (!fill || !ink) continue;
      pairs.push({
        file: file.slice(root.length + 1),
        fillToken: `--${fill[1]!}`,
        alpha: Number(fill[2]) / 100,
        inkToken: `--${ink[1]!}`,
        className,
      });
    }
  }
  return pairs;
}

const SCOPES = ['page', 'chrome', 'panel', 'brand', 'auth'] as const;

/** Resolve a scope's tokens, replaying the `[data-surface]` rebind the way the cascade would. */
function resolve(scope: (typeof SCOPES)[number]): Map<string, string> {
  const tokens = new Map(themeTokens(':root'));
  if (scope === 'page') return tokens;
  for (const [name, value] of themeTokens(':root')) {
    const family = /^--(chrome|panel|brand|auth)-(.+)$/.exec(name);
    if (family && family[1] === scope) tokens.set(`--${family[2]!}`, value);
  }
  const base = tokens.get(`--${scope}`);
  if (base) tokens.set('--background', base);
  return tokens;
}

describe('alpha-composited fills are legible', () => {
  const pairs = findAlphaPairs();

  it('finds the washes the token census structurally cannot see', () => {
    // A positive assertion, so this suite cannot pass by scanning nothing. The ADR-0093 failure —
    // a gate that would pass equally if its subject vanished — is exactly what an empty scan is.
    expect(pairs.length, 'no alpha-composited pairs found; the scan is broken').toBeGreaterThan(3);
  });

  it.each(SCOPES)('%s: every wash carries its ink at 4.5:1', (scope) => {
    const tokens = resolve(scope);
    const failures: string[] = [];

    for (const pair of pairs) {
      const fillValue = tokens.get(pair.fillToken);
      const inkValue = tokens.get(pair.inkToken);
      const backdrop = tokens.get('--background');
      // A pair naming something that is not a token (an arbitrary colour, a Tailwind palette
      // entry) is out of scope here — the colour-literal lint rule owns that.
      if (!fillValue || !inkValue || !backdrop) continue;

      const ground = compositeOver(parseColour(backdrop), [1, 1, 1]);
      // The alpha comes from the UTILITY, not the token — `bg-warning/15` means "this token's
      // colour at 15%". Overriding it here is the whole point of the census.
      const composited = compositeOver({ ...parseColour(fillValue), alpha: pair.alpha }, ground);
      const ratio = contrastRatio(compositeOver(parseColour(inkValue), composited), composited);

      if (ratio < 4.5) {
        failures.push(
          `${pair.file}: ${pair.fillToken}/${pair.alpha * 100} + ${pair.inkToken} = ` +
            `${fmtRatio(ratio)} on ${scope}`,
        );
      }
    }

    expect(failures, failures.join('\n')).toEqual([]);
  });
});
