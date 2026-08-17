import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **ADR-0059 §4's objection, kept answered.**
 *
 * That decision shipped the Gantt with no dependency arrows because they "would drag the rejected
 * substrate back in through the side door". The phrase is about **routing** — obstacle avoidance
 * and corridor bundling (ADR-0065) — and routing cost is independent of the render target, so
 * choosing SVG over canvas does not by itself answer it. The spec's first draft did not say this
 * and neither did the ADR; it is the strongest argument for showing logic here and it was being
 * assumed.
 *
 * What actually answers it is the geometry. TSLD bars **share lanes**, so a link there must be
 * routed around bars sitting between its endpoints. Gantt rows are **one bar per row, vertically
 * separated**, so a link is an elbow through whitespace and there is nothing to avoid.
 *
 * That is a claim about the code, so it is a test rather than a paragraph. Two things must stay
 * true, and both are things a well-meaning contributor could undo while making the arrows prettier:
 *
 * 1. **No obstacle search.** The moment one appears, ADR-0059's objection is live again and the
 *    person adding it should have to say so in an ADR rather than in a commit.
 * 2. **No canvas painter.** The substrate is one SVG in the existing scroll container; reaching for
 *    the TSLD's painter — or mounting a second `<canvas>` — is the side door by its own name.
 *
 * **Its blind spot, stated.** It matches on identifiers, so a search written under different names
 * would pass. It is a tripwire on the obvious route, not a proof — the honest claim, and the same
 * one `coverage.structural.test.ts` makes about matching on labels.
 */

const LAYOUT_DIR = join(import.meta.dirname);
const FEATURE_DIR = join(import.meta.dirname, '..');

/** Every source file under a directory, recursively, excluding tests. */
function sourcesUnder(dir: string): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...sourcesUnder(full));
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (entry.name.includes('.test.')) continue;
    out.push({ path: full, text: readFileSync(full, 'utf8') });
  }
  return out;
}

/** Names an obstacle search would plausibly use. A tripwire, not a proof — see above. */
const OBSTACLE_TERMS = [
  'routeOrthogonal',
  'avoidBars',
  'obstacle',
  'corridor',
  'intersects',
  'occupied',
];

describe('the Gantt link overlay stays a simple elbow', () => {
  const linkPaths = readFileSync(join(LAYOUT_DIR, 'link-paths.ts'), 'utf8');

  it('names no obstacle search in the derivation', () => {
    const found = OBSTACLE_TERMS.filter((term) =>
      // Skip the docblock, which discusses routing at length precisely to explain why there is none.
      new RegExp(`^(?!\\s*[*/]).*\\b${term}\\b`, 'm').test(linkPaths),
    );
    expect(
      found,
      `link-paths.ts appears to route around obstacles (${found.join(', ')}).\n\n` +
        `That re-opens ADR-0059 §4's objection to arrows in the Gantt, which was answered by the ` +
        `geometry — one bar per row, vertically separated, so a link is an elbow through ` +
        `whitespace. If routing is genuinely needed, that is an ADR, not a commit.`,
    ).toEqual([]);
  });

  it('imports no canvas painter anywhere in the feature', () => {
    // The substrate is one SVG in the existing scroll container. A second `<canvas>`, or a reach
    // into the TSLD's painter, is the side door by its own name.
    const offenders = sourcesUnder(FEATURE_DIR).filter(
      ({ text }) =>
        /from '.*features\/tsld\/render\/paint/.test(text) || /getContext\(['"]2d/.test(text),
    );
    expect(
      offenders.map((o) => o.path),
      'the Gantt subtree reached for a canvas painter',
    ).toEqual([]);
  });

  it('scans a real corpus, so the two assertions above are not vacuous', () => {
    // Both checks pass trivially against an empty file list. The ADR-0081 shape: a green suite that
    // cannot distinguish "the rule holds" from "there was nothing to check".
    const sources = sourcesUnder(FEATURE_DIR);
    expect(sources.length).toBeGreaterThan(5);
    expect(linkPaths.length).toBeGreaterThan(500);
  });
});
