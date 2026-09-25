/**
 * **Links-and-labels M0-T4 — which widths the text layers ask for, and the table that answers them.**
 *
 * `docs/specs/links-and-labels/feature-spec.md` §4.4. The Tidy worker has no `document`, so M2 sends it
 * a table of `(font, text) → width` built on the main thread from the painter's own memo. That is
 * only sound if the layout's questions are a finite set the table can be built from in advance. This
 * records every key the painter asks the shared `labelWidths` memo for, over several scenes, zooms,
 * lane layouts and canvas widths, and classifies each one against the set §4.4 predicts:
 *
 * - `label`, `label-prefix`, `ellipsis`: an activity's canvas label in its font (bold for a
 *   milestone), the ellipsis, and every prefix of the label plus the ellipsis, trimmed or not —
 *   `truncateToWidth`'s binary search (`geometry.ts:863-881`).
 * - `date`: `formatCanvasDate` of an activity's `earlyStart` or `earlyFinish`.
 * - `centre`: `centreItemText` of an activity, full or short (only with `centreItem` on).
 * - `wrap`: a word prefix of a label, or its remainder truncated — the two-line wrap. §4.4 leaves it
 *   out on purpose, because the router does not wrap (D-4); it is counted so that is visible.
 * - `gap`, `plate`: the link labels (gap label, lag plate). Not text layout; counted for M2-T3.
 * - `miss`: anything else. A miss is a call pattern §4.4 did not name, and is a finding.
 *
 * **Keys are recorded at the memo, not at `ctx.measureText`**, because the memo is what the worker's
 * table replaces. The memo is a module singleton, so this patches its `measure` for the duration of
 * a paint and restores it; a key already cached is still recorded, since the patch sits in front.
 */
import { readFileSync } from 'node:fs';

import { importXer } from '@repo/interchange';

import { netpointReferencePlan } from '../../seed-cli/src/references/netpoint-power-plant';
import { canvasLabel, centreItemText } from '../src/features/tsld/render/a11y';
import {
  formatCanvasDate,
  LABEL_ELLIPSIS,
  MILESTONE_LABEL_FONT,
} from '../src/features/tsld/render/geometry';
import { labelWidths } from '../src/features/tsld/render/layers/text-measure';
import {
  DEFAULT_VIEW_TOGGLES,
  paintScene,
  type TsldScene,
  type TsldViewToggles,
} from '../src/features/tsld/render/paint';
import { isMilestone, type Viewport } from '../src/features/tsld/render/render-model';

import { PALETTE, recordingCtx } from './crossing-probe';

export type KeyClass =
  'label' | 'label-prefix' | 'ellipsis' | 'wrap' | 'date' | 'centre' | 'gap' | 'plate' | 'miss';

/** A memo key as the memo forms it: the font only when one was passed (a milestone's bold). */
export const keyOf = (text: string, font: string | undefined): string =>
  font === undefined ? text : `${font}\u0000${text}`;

/** Record every memo key one paint asks for. */
export function recordKeys(
  scene: TsldScene,
  view: Viewport,
  size: { width: number; height: number },
  into: Set<string>,
): void {
  const original = labelWidths.measure.bind(labelWidths);
  labelWidths.measure = (text, measureText, font) => {
    into.add(keyOf(text, font));
    return original(text, measureText, font);
  };
  try {
    const { ctx } = recordingCtx();
    paintScene(ctx as Parameters<typeof paintScene>[0], scene, view, size, PALETTE, 1);
  } finally {
    labelWidths.measure = original;
  }
}

/**
 * The table §4.4 predicts for one scene and set of toggles: every key the text layout may ask for,
 * derived from the activities alone. Returned as the memo's own keys.
 */
export function predictedTable(scene: TsldScene, toggles: TsldViewToggles): Set<string> {
  const out = new Set<string>();
  const withCodes = toggles.activityCodes === true;
  for (const a of scene.activities) {
    const font = isMilestone(a.type) ? MILESTONE_LABEL_FONT : undefined;
    const label = canvasLabel({ code: a.code ?? null, name: a.label }, withCodes);
    out.add(keyOf(label, font));
    out.add(keyOf(LABEL_ELLIPSIS, font));
    for (let k = 0; k <= label.length; k += 1) {
      out.add(keyOf(label.slice(0, k) + LABEL_ELLIPSIS, font));
      out.add(keyOf(label.slice(0, k).trimEnd() + LABEL_ELLIPSIS, font));
    }
    if (a.earlyStart) out.add(keyOf(formatCanvasDate(a.earlyStart), undefined));
    if (a.earlyFinish) out.add(keyOf(formatCanvasDate(a.earlyFinish), undefined));
    if (toggles.centreItem === true && a.durationDays !== undefined) {
      const item = {
        durationDays: a.durationDays,
        remainingFloat: a.remainingFloat,
        milestone: isMilestone(a.type),
        summary: a.type === 'WBS_SUMMARY',
      };
      for (const form of ['full', 'short'] as const) {
        const t = centreItemText(item, form);
        if (t !== null) out.add(keyOf(t, undefined));
      }
    }
  }
  return out;
}

const GAP_LABEL = /^\d+d$|^\d+ cal d$/;
const LAG_PLATE = /^[+−]\d/;
const DATE_TEXT = /^\d{1,2} [A-Z][a-z]{2}$/;
const CENTRE_TEXT = /^\d+(\.\d+)?d( · -?\d+(\.\d+)?d float left)?$/;

/** Classify one recorded key against the scene's predicted table and its labels. */
export function classify(
  key: string,
  predicted: ReadonlySet<string>,
  scene: TsldScene,
  toggles: TsldViewToggles,
): KeyClass {
  const [fontOrText, maybeText] = key.split('\u0000');
  const text = maybeText ?? fontOrText!;
  if (predicted.has(key)) {
    if (text === LABEL_ELLIPSIS) return 'ellipsis';
    if (DATE_TEXT.test(text)) return 'date';
    // A short centre item (`5d`) is the same string as a gap label; in the predicted set it is the
    // centre item's, and the table holds it once either way.
    if (CENTRE_TEXT.test(text)) return 'centre';
    return text.endsWith(LABEL_ELLIPSIS) ? 'label-prefix' : 'label';
  }
  if (LAG_PLATE.test(text)) return 'plate';
  if (GAP_LABEL.test(text)) return 'gap';
  const withCodes = toggles.activityCodes === true;
  for (const a of scene.activities) {
    const label = canvasLabel({ code: a.code ?? null, name: a.label }, withCodes);
    const words = label.split(' ').filter((w) => w.length > 0);
    for (let k = 1; k < words.length; k += 1) {
      const head = words.slice(0, k).join(' ');
      const rest = words.slice(k).join(' ');
      if (text === head || text === rest) return 'wrap';
      if (text.endsWith(LABEL_ELLIPSIS) && rest.startsWith(text.slice(0, -1).trimEnd())) {
        return 'wrap';
      }
    }
  }
  return 'miss';
}

/** The NetPoint reference plan's activities keyed by seed key, with their names. */
export function referenceNames(): Map<string, string> {
  return new Map(netpointReferencePlan().activities.map((a) => [a.key, a.name]));
}

/** Unit 300's activities keyed by code, with their real P6 names. */
export function unit300Names(path: string): Map<string, string> {
  const result = importXer({ content: readFileSync(path), filename: 'p6_torture_test_v1.xer' });
  if (!result.ok) throw new Error(`Unit 300 import failed: ${result.error.code}`);
  return new Map(result.graph.activities.map((a) => [a.key, a.name]));
}

/** A scene with its labels replaced (and codes set to the old labels, so the toggle means something). */
export function withNames(scene: TsldScene, names: ReadonlyMap<string, string>): TsldScene {
  return {
    ...scene,
    activities: scene.activities.map((a) => ({
      ...a,
      code: a.code ?? a.id,
      label: names.get(a.id) ?? a.label,
    })),
  };
}

export { DEFAULT_VIEW_TOGGLES };
