import { type Locator, type Page } from '@playwright/test';

import { ganttRow } from './support';

/**
 * Helpers shared by the forced-colours journey (`forced-colors.spec.ts`) and its measurement
 * (`measure-gantt/forced-colors-m2.spec.ts`), so the two read the same elements the same way
 * (`docs/TECH_DEBT.md` #505, ADR-0191).
 *
 * The marks are found by the classes that define them rather than by a test hook: the Gantt's
 * bars carry no `data-` handle beyond the armed state, and a hook added for a test would be a
 * public contract. A class this file leans on that is renamed fails the pinned positive in the
 * journey (the mark is not found), never silently.
 */

export const SYSTEM_COLOURS = [
  'Canvas',
  'CanvasText',
  'Highlight',
  'HighlightText',
  'GrayText',
  'ButtonText',
] as const;
export type SystemColour = (typeof SYSTEM_COLOURS)[number];

/** Each system colour as this browser resolves it right now, read from a probe, never assumed. */
export async function systemColours(page: Page): Promise<Record<SystemColour, string>> {
  return page.evaluate((names) => {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:fixed;top:0;left:0';
    document.body.append(probe);
    const out = {} as Record<SystemColour, string>;
    for (const name of names) {
      probe.style.color = name;
      out[name] = getComputedStyle(probe).color;
    }
    probe.remove();
    return out;
  }, SYSTEM_COLOURS);
}

export interface Computed {
  color: string;
  backgroundColor: string;
  borderColor: string;
  borderWidth: string;
  borderStyle: string;
  boxShadow: string;
  opacity: string;
  forcedColorAdjust: string;
  outlineStyle: string;
  outlineColor: string;
  outlineWidth: string;
  borderLeftWidth: string;
  left: string;
  top: string;
}

/** The computed properties a forced-colours rule can change, from the live element. */
export function computed(target: Locator): Promise<Computed> {
  return target.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      color: style.color,
      backgroundColor: style.backgroundColor,
      borderColor: style.borderTopColor,
      borderWidth: style.borderTopWidth,
      borderStyle: style.borderTopStyle,
      boxShadow: style.boxShadow,
      opacity: style.opacity,
      forcedColorAdjust: style.forcedColorAdjust,
      outlineStyle: style.outlineStyle,
      outlineColor: style.outlineColor,
      outlineWidth: style.outlineWidth,
      borderLeftWidth: style.borderLeftWidth,
      left: style.left,
      top: style.top,
    };
  });
}

/** A row's chart cell is its last gridcell. */
const chartCell = (page: Page, name: string): Locator =>
  ganttRow(page, name).getByRole('gridcell').last();

/** The marks of one activity's row, each a locator that may match nothing (a milestone has no bar). */
export function marksOf(page: Page, name: string) {
  const cell = chartCell(page, name);
  const bar = cell.locator('span[class~="h-3.5"]');
  return {
    row: ganttRow(page, name),
    bar,
    progress: bar.locator('span[class~="inset-y-0"]'),
    milestone: cell.locator('span[class~="rotate-45"]'),
    floatTail: cell.locator('span[class~="border-l-0"]'),
    ghost: cell.locator('span[class~="bottom-0.5"]'),
  };
}

/** A picture of the element's box, padded a little so an edge or a ring is inside it. */
async function pictureOf(page: Page, target: Locator): Promise<Buffer> {
  const box = await target.boundingBox();
  if (box === null) throw new Error('the mark has no box to photograph');
  return page.screenshot({
    clip: { x: box.x - 3, y: box.y - 3, width: box.width + 6, height: box.height + 6 },
  });
}

/**
 * **Whether the mark is visible at all**: the same box photographed with the mark and then with the
 * mark hidden. Identical pictures mean the mark paints nothing a reader can see, whatever its
 * computed colours say. Supplementary to the computed read, the way `focus-ring.spec.ts` uses it.
 */
export async function differsFromAbsent(page: Page, target: Locator): Promise<boolean> {
  await page.mouse.move(2, 2);
  const present = await pictureOf(page, target);
  await target.evaluate((node) => {
    (node as HTMLElement).style.visibility = 'hidden';
  });
  const absent = await pictureOf(page, target);
  await target.evaluate((node) => {
    (node as HTMLElement).style.visibility = '';
  });
  return !present.equals(absent);
}

/** A pseudo-element's computed paint: the selected row's edge is one, so it has no locator of its own. */
export function pseudoOf(
  target: Locator,
  which: '::before' | '::after',
): Promise<{ backgroundColor: string; width: string; position: string; content: string }> {
  return target.evaluate((node, pseudo) => {
    const style = getComputedStyle(node, pseudo);
    return {
      backgroundColor: style.backgroundColor,
      width: style.width,
      position: style.position,
      content: style.content,
    };
  }, which);
}

/**
 * The colour a control is painted on: the first non-transparent `background-color` walking up from
 * it. A focus ring is only a ring if it differs from this (WCAG 2.2 §2.4.11, §1.4.11).
 */
export function colourBehind(target: Locator): Promise<string> {
  return target.evaluate((node) => {
    for (let el = node.parentElement; el !== null; el = el.parentElement) {
      const bg = getComputedStyle(el).backgroundColor;
      if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
    }
    return 'rgba(0, 0, 0, 0)';
  });
}
