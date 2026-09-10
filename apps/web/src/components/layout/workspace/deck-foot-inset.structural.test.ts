import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * **The activities row's inset copies the deck's, and now something fails when it stops** (console
 * epic M7).
 *
 * `activity-bottom-panel.tsx`'s own docblock says its `px-2 py-1` *"COPIES the deck's own content
 * inset … rather than judging one … keeps the two in step if the deck's inset ever moves"*. That is
 * a rule written in prose about two literals in two files, which is precisely the arrangement a
 * component review named as able to drift silently: change one and the other stays, and the only
 * symptom is four pixels nobody notices.
 *
 * **Read from the source text rather than rendered**, because the claim is about two authored
 * literals agreeing, not about what a browser computes from them — a rendered comparison would pass
 * against two different classes that happen to resolve to the same padding today, which is not the
 * property the docblock promises.
 *
 * Comments are stripped first. The ADR-0099 sizing ratchet learnt this the hard way and its sibling
 * learnt it twice: a scan over raw text counts the docblock EXPLAINING the value as a use of it, so
 * writing down the reasoning is what breaks the gate.
 */

const strip = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

/** Every `py-<n>` in a `px-2 py-<n>` pair, which is the shape both call sites use. */
const insetsIn = (path: string): string[] => {
  const src = strip(readFileSync(path, 'utf8'));
  return [...src.matchAll(/px-2\s+py-([\d.]+)/g)].map((m) => m[1] as string);
};

const DECK = 'src/components/layout/workspace/plan-workspace-toolbar.tsx';
const FOOT = 'src/components/layout/workspace/activity-bottom-panel.tsx';

describe('the deck and the activities row share one content inset', () => {
  it('uses the same vertical inset in both files', () => {
    const deck = insetsIn(DECK);
    const foot = insetsIn(FOOT);

    // The pinned positives, and they are not decoration: a regex that stopped matching would make
    // "every deck inset equals every foot inset" true of two empty lists, which is the shape this
    // repository keeps recording as green-and-meaningless.
    expect(deck.length, `no px-2 py-* inset found in ${DECK}`).toBeGreaterThan(0);
    expect(foot.length, `no px-2 py-* inset found in ${FOOT}`).toBeGreaterThan(0);

    expect(
      new Set([...deck, ...foot]).size,
      `the deck uses py-[${deck.join(', ')}] and the activities row py-[${foot.join(', ')}] — ` +
        'the row copies the deck by a rule written in its own docblock, so they must agree',
    ).toBe(1);
  });
});
