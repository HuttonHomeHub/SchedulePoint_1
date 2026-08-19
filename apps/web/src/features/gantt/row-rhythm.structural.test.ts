import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { GANTT_ROW_HEIGHT } from './components/GanttPanel';

import { themeTokens } from '@/test/css-blocks';

/**
 * **One row rhythm, held across a boundary the compiler cannot see** (ADR-0097, CQ-B).
 *
 * The product owner asked for one rhythm at 28 rather than the Gantt's 32 and the tables'
 * something-else. The Gantt's virtualizer needs the height as a NUMBER before layout — its whole
 * design is "no measurement pass" (ADR-0059) — so it cannot read `--row-h`, and the value is
 * therefore stated twice: once in CSS for anything that lays out in CSS, once in TypeScript for
 * the virtualizer.
 *
 * Two declarations of one decision is exactly the drift this epic keeps finding, and the drift
 * would be invisible: a Gantt at 32 beside a table at 28 looks like two considered densities
 * rather than one forgotten edit. So the duplication is allowed and **pinned**, rather than
 * argued away.
 */
describe('the row rhythm', () => {
  it('is the same number in CSS and in the virtualizer', () => {
    const rowH = themeTokens(':root').get('--row-h');
    expect(rowH, '--row-h is not declared').toBeDefined();

    const rem = /^([\d.]+)rem$/.exec(rowH!.trim());
    expect(
      rem,
      `--row-h is "${rowH}", which this gate cannot compare to a pixel constant`,
    ).not.toBeNull();

    // 16 px root, which `html` never overrides — it sets only `text-size-adjust`, deliberately,
    // so a reader's own font-size preference still scales everything.
    expect(Number(rem![1]) * 16).toBe(GANTT_ROW_HEIGHT);
  });

  it('does not silently regress to the old 32', () => {
    // Named, because 32 is what four other constants in this file are still near and it is the
    // value a careless revert lands on.
    expect(GANTT_ROW_HEIGHT).toBe(28);
  });

  it('is not overridden by an html font-size rule', () => {
    // The conversion above assumes a 16 px root. If someone sets `html { font-size: … }` the
    // rem→px arithmetic stops holding and this gate would compare two unrelated numbers while
    // still passing — so the assumption is asserted rather than trusted.
    const css = readFileSync(join(process.cwd(), 'src/styles/globals.css'), 'utf8');
    const htmlBlock = /(?:^|\n)\s*html\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    // Comments stripped first, and a DECLARATION matched rather than the words. The first
    // version of this assertion failed against correct code, because the block's own comment
    // reads "never lock the root size in px" — a gate that cannot tell a rule from a sentence
    // about the rule.
    const declarations = htmlBlock.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(declarations).not.toMatch(/\bfont-size\s*:/);
  });
});
