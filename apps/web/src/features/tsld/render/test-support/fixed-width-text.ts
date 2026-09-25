import type { LayoutText } from '../layout-objective';
import { DEFAULT_VIEW_TOGGLES } from '../view-toggles';

/**
 * The text a routing or layout test reads (links-and-labels M2-T2): the default toggles and a
 * 6 px-per-character width, the same width the jsdom canvas stub (`src/test/setup.ts`), the recording
 * contexts and the probes measure with, so a test routes around the text a painted scene would draw.
 */
export const FIXED_WIDTH_TEXT: LayoutText = {
  measure: (text) => text.length * 6,
  toggles: DEFAULT_VIEW_TOGGLES,
};
