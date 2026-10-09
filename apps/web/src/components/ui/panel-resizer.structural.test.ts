import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **No `<PanelResizer>` call site overrides the divider's `touch-action`.**
 *
 * `PanelResizer` owns `touch-none` (TECH_DEBT #439): without it the browser takes a touch drag over
 * and ends it in `pointercancel` after a few pixels. `className` is merged last, so a `touch-*`
 * class at a call site would silently undo that for one divider, and no unit suite of the primitive
 * would notice. Verified red by injecting `touch-auto` at a call site.
 *
 * What it cannot see: a class assembled from a variable. The shape written for is the literal one.
 */
const WEB_SRC = join(import.meta.dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx$/.test(entry.name) && !entry.name.includes('.test.')) out.push(full);
  }
  return out;
}

/**
 * Every `<PanelResizer …>` opening tag, read to the `>` that closes it: a `>` inside braces
 * (an arrow function, a comparison) or a string does not end the tag.
 */
function openingTags(source: string): string[] {
  const tags: string[] = [];
  let from = source.indexOf('<PanelResizer');
  while (from !== -1) {
    let depth = 0;
    let quote: string | null = null;
    let i = from;
    for (; i < source.length; i += 1) {
      const ch = source.charAt(i);
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'" || ch === '`') quote = ch;
      else if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth === 0 && source.charAt(i - 1) !== '=') break;
    }
    tags.push(source.slice(from, i + 1));
    from = source.indexOf('<PanelResizer', i);
  }
  return tags;
}

describe('PanelResizer call sites', () => {
  it('finds the call sites it is meant to read', () => {
    const count = sourceFiles(WEB_SRC).reduce(
      (n, file) => n + openingTags(readFileSync(file, 'utf8')).length,
      0,
    );
    expect(count).toBeGreaterThanOrEqual(7);
  });

  it('none passes a touch-* class', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(WEB_SRC)) {
      for (const tag of openingTags(readFileSync(file, 'utf8'))) {
        if (/(?<![\w-])touch-[\w[]|\[touch-action:/.test(tag)) {
          offenders.push(relative(WEB_SRC, file).split(sep).join('/'));
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
