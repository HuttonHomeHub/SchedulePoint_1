import { labelWidths } from './layers/text-measure';
import { LABEL_FONT, type RenderActivity } from './render-model';
import { textWidthKey, textWidthKeys } from './row-text-layout';
import type { TsldViewToggles } from './view-toggles';

/**
 * **The widths the Tidy worker routes with** (links-and-labels M2-T3, spec §4.4).
 *
 * The worker has no `document`, so it cannot measure text. It is sent this table instead: every key
 * the text layout can ask for (`textWidthKeys`), measured on the main thread **through the painter's
 * own memo** (`labelWidths`), so each width is exactly the one the canvas is drawing with at the
 * moment of the press. The worker's `tableMeasure` throws on a key the table lacks, so a gap is a
 * failed search the dialog reports, never a silently wrong width.
 *
 * Built before the product's face loads, the table holds the fallback face's widths — which are the
 * widths the painter is using at that moment too, and that is the property wanted: the search scores
 * the picture on screen.
 */
export function textWidthTable(
  activities: readonly RenderActivity[],
  toggles: TsldViewToggles,
): [string, number][] {
  const ctx = document.createElement('canvas').getContext('2d');
  if (ctx === null) throw new Error('no 2D context to measure the text widths with');
  return textWidthKeys(activities, toggles).map(({ text, font }) => [
    textWidthKey(text, font),
    labelWidths.measure(
      text,
      (t) => {
        ctx.font = font ?? LABEL_FONT;
        return ctx.measureText(t).width;
      },
      font,
    ),
  ]);
}
