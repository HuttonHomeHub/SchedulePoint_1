import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const RENDER = dirname(fileURLToPath(import.meta.url));

/** The painter's source with comments removed, so prose explaining a rule cannot satisfy it. */
function code(file: string): string {
  return readFileSync(join(RENDER, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * **Two layers, one question** (NetPoint grammar M2-T3, spec §4.2 G4 and #379).
 *
 * Where two bars meet, the node layer draws ONE disc and the date layer writes ONE date. If the two
 * layers each decided "meet" for themselves, a node could be shared where both dates print, or a
 * date withheld at a node drawn twice, and each layer would look right alone (the ADR-0065
 * one-implementation rule). So both ask `sharesNode`, and this file fails if the date layer grows
 * its own gap test back or the node pass stops going through `nodeMarks`.
 *
 * Its blind spot: it reads source text, so an adjacency test written with different variable names
 * would pass it. What it catches is the likely edit, which is restoring the inline comparison that
 * was there before.
 */
describe('the node and date layers share one adjacency predicate', () => {
  const paint = code('paint.ts');

  it('the date layer asks sharesNode, and no inline gap test remains', () => {
    expect(paint).toMatch(/!sharesNode\(rect, next\.rect\)/);
    expect(paint).not.toMatch(/next\.rect\.x\s*-\s*\(rect\.x\s*\+\s*rect\.w\)/);
  });

  it('the node pass takes its nodes from nodeMarks, which asks sharesNode', () => {
    expect(paint).toMatch(/paintNodes\(ctx, nodeMarks\(/);
    const model = code('render-model.ts');
    const body = /export function nodeMarks\([\s\S]*?\n}\n/.exec(model)?.[0] ?? '';
    expect(body, 'nodeMarks not found').not.toBe('');
    expect(body.match(/sharesNode\(/g)?.length).toBe(2);
  });
});
