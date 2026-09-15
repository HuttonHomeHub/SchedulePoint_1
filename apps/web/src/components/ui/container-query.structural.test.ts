import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * **An element is never its own container query.**
 *
 * `container-type: inline-size` — which is what Tailwind's `@container` utility sets — establishes a
 * query container for that element's **descendants**. A `@md:` variant on the *same* element
 * therefore queries the nearest **ancestor** container, of which there is usually none, so the rule
 * never matches and the base class silently wins.
 *
 * It shipped that way in `stat-grid.tsx`, and nothing could see it. Every unit suite runs in jsdom,
 * which has no layout and no container queries at all; the contrast matrix resolves tokens; the
 * archetype gate checks which primitive is used, not whether its rule fires. Measured in Chromium
 * against the real console before the fix: the Mail card's `<dl>` reported
 * `container-type: inline-size`, `width: 1438px` and `grid-template-columns: 711px 711px` — two
 * columns in a 1,438 px card, under a `@md:grid-cols-3` that could never match. The `columns` prop
 * was inert in both of its modes.
 *
 * Two big figures spread across a wide card reads as a spacing decision, which is why a photograph
 * was the only thing that found it.
 *
 * **Under-inclusion is the failure mode to avoid here** (ADR-0131's own finding), so the scan reads
 * whole `className` expressions rather than lines: a `cn(` call split across four lines would hide
 * the pair from a per-line regex, and a gate that quietly reads less than it claims is worse than
 * none. Comments are stripped first — this docblock names the exact pair it forbids, and four gates
 * in this repository have now shipped a scan that matched its own prose.
 *
 * **Verified red** by putting `@container` back on the `<dl>` beside its `@md:grid-cols-4`.
 */
const ROOT = 'src';

/** Tailwind's container-query variants, including the arbitrary form `@[32rem]:`. */
const VARIANT = /@(?:xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|min-|max-|\[)[^\s'"`]*:/;

/** The utility that declares the container. `@container/name` is the named form. */
const DECLARES = /(?:^|[\s'"`])@container(?:\/[\w-]+)?(?=[\s'"`]|$)/;

/**
 * Every `className=` expression in a file, with balanced braces.
 *
 * A scanner rather than a regex because the offending pair is routinely split over several lines
 * inside a `cn(...)`, and `[\s\S]*?` to a closing brace would swallow the rest of the component.
 */
function classNameExpressions(source: string): string[] {
  const out: string[] = [];
  for (const match of source.matchAll(/className=/g)) {
    let i = (match.index ?? 0) + match[0].length;
    const quote = source[i];
    if (quote === '"' || quote === "'") {
      const end = source.indexOf(quote, i + 1);
      if (end !== -1) out.push(source.slice(i + 1, end));
      continue;
    }
    if (source[i] !== '{') continue;
    let depth = 0;
    const start = i;
    for (; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push(source.slice(start, i + 1));
  }
  return out;
}

describe('a container query never asks its own container', () => {
  const files = execFileSync('git', ['ls-files', ROOT], { cwd: process.cwd(), encoding: 'utf8' })
    .split('\n')
    .filter((path) => /\.tsx$/.test(path) && !/\.test\.tsx$/.test(path));

  const scanned = files.map((path) => ({
    path,
    expressions: classNameExpressions(
      readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, ''),
    ),
  }));

  /**
   * The pinned positive case. "No file declares both" passes perfectly over a scan that found no
   * files and over one that found no `@container` at all — the shape ADR-0093 records, where a green
   * suite cannot distinguish "the defect is gone" from "the subject is gone".
   */
  it('reads the components, and finds the containers that exist', () => {
    expect(scanned.length).toBeGreaterThan(200);
    const declaring = scanned.filter((file) => file.expressions.some((e) => DECLARES.test(e)));
    expect(
      declaring.length,
      'the scan found no `@container` anywhere — it has stopped reading the tree',
    ).toBeGreaterThan(0);
  });

  it('declares no container query on the element it queries', () => {
    const offenders = scanned.flatMap((file) =>
      file.expressions
        .filter((expression) => DECLARES.test(expression) && VARIANT.test(expression))
        .map((expression) => `${file.path}: ${expression.replace(/\s+/g, ' ').slice(0, 120)}`),
    );

    expect(
      offenders,
      'a `@md:`-style variant beside `@container` on one element can never match — put the ' +
        '`@container` on a wrapper and the variant on the child',
    ).toEqual([]);
  });
});
