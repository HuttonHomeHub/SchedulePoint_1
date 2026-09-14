import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **DOM order is reading order, and a two-column layout is lawful only if it stays that way.**
 *
 * WCAG 1.3.2 (Meaningful Sequence) is satisfied by a grid only when the DOM sequence IS the
 * intended reading sequence. The obvious implementation of "two columns" — a flat list of sections
 * re-ordered with CSS `order`, or back-filled with `grid-auto-flow: dense` — breaks that
 * **silently**: nothing looks wrong, every unit test passes, and a screen-reader user walks the
 * page in an order nobody chose. The design review found that neither the spec nor the plan had
 * stated this as an engineering constraint, in the one epic whose whole subject is a layout
 * (`docs/specs/staff-console-design/feature-spec.md` §8.11).
 *
 * So it is a gate rather than a paragraph, and it guards the **primitive**, not one screen: the
 * next surface to reach for `PageGrid` inherits the rule without having to know it exists.
 *
 * **Verified red** against `order-2` on the item and against `grid-flow-dense` on the container,
 * which are the two shapes this is written to catch.
 *
 * What it deliberately cannot see: a caller that hand-rolls its own `order` on a child it puts
 * INSIDE a `PageGridItem`. That is a real hole and the honest answer is that nothing here can close
 * it — a rule about arbitrary descendants would have to read every consumer's markup. The
 * compensating control is the journey's DOM-sequence assertion, which measures the rendered order
 * rather than the source.
 */
const PAGE_GRID = join(import.meta.dirname, 'page-grid.tsx');

/**
 * The shapes that displace an element from its DOM position.
 *
 * `order-` catches Tailwind's `order-1`/`order-last`/`order-[3]`; `grid-flow-*dense` catches the
 * back-filling variants; and the bare CSS properties catch an inline style doing it the long way.
 */
const DISPLACING = [
  { name: 'a Tailwind `order-*` utility', pattern: /\border-(?:\[|\d|first|last|none)/ },
  { name: 'a dense auto-flow', pattern: /grid-flow-(?:row-|col-)?dense|auto-flow:\s*[^;]*dense/ },
  { name: 'a raw CSS `order` declaration', pattern: /(?:^|[^-\w])order\s*:/ },
];

describe('PageGrid never displaces a section from its DOM position', () => {
  // Comments are stripped first. This file's own docblock names every pattern it forbids, and four
  // gates in this repository have now shipped a scan that matched its own prose — the failure mode
  // where writing down the reasoning is what makes the gate fail.
  const source = readFileSync(PAGE_GRID, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  // The pinned positive case: a scan over an empty string passes every assertion below.
  it('reads the primitive', () => {
    expect(source).toContain('grid-cols-1');
    expect(source, 'the scan lost the file it is written about').toContain('PageGridItem');
  });

  it.each(DISPLACING)('uses no $name', ({ pattern }) => {
    expect(pattern.test(source), `\`page-grid.tsx\` would re-order its children`).toBe(false);
  });
});
