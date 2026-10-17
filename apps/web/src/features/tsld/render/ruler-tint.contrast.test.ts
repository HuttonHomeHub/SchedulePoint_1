import { describe, expect, it } from 'vitest';

import { compositeOver, contrastRatio, fmtRatio, parseColour } from '@/test/colour';
import { THEME_SELECTORS } from '@/test/css-blocks';
import { fillOf, ratio, resolve } from '@/test/scope-tokens';

/**
 * **The ruler's month tint** (`docs/TECH_DEBT.md` #58) is the canvas's own `--canvas-band` laid
 * behind the label rows, so the text on it is the pair this file holds. The ruler sits in
 * `<Surface tone="canvas">`, so these resolve the DIAGRAM's family. The three inks are the ruler's
 * own classes (`TsldCanvas.tsx`): the year row `text-foreground/70`, the month row
 * `text-foreground/90`, and the day row inheriting `text-muted-foreground`.
 */
describe('the ruler month tint', () => {
  const tokens = resolve(THEME_SELECTORS[0], 'canvas');

  /** WCAG ratio of `ink` at `alpha` over the opaque `fillToken`. */
  function inkOnFill(fillToken: string, inkToken: string, alpha: number): number {
    const fill = compositeOver(parseColour(tokens.get(fillToken)!), fillOf(tokens));
    const colour = parseColour(tokens.get(inkToken)!);
    const ink = compositeOver({ ...colour, alpha: colour.alpha * alpha }, fill);
    return contrastRatio(fill, ink);
  }

  it.each([
    ['the year row', '--foreground', 0.7],
    ['the month row', '--foreground', 0.9],
    ['the day row', '--muted-foreground', 1],
  ] as const)(
    '%s text stays at 4.5:1 or more on the ground and on the tint',
    (_row, ink, alpha) => {
      for (const ground of ['--canvas', '--canvas-band'] as const) {
        const value = inkOnFill(ground, ink, alpha);
        expect(value, `${ink}/${alpha} on ${ground} is ${fmtRatio(value)}`).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    },
  );

  it('is quieter than the quietest grid rule it sits beside', () => {
    const tint = ratio(tokens, '--canvas', '--canvas-band');
    const day = ratio(tokens, '--canvas', '--canvas-grid-day');
    expect(tint, `tint ${fmtRatio(tint)} vs day rule ${fmtRatio(day)}`).toBeLessThan(day);
    expect(tint, 'the tint must still be visible').toBeGreaterThan(1);
  });
});
