import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * FC-1's harness names things in the product. This asserts the product still has them.
 *
 * **The defect this exists for shipped twice in this epic and was invisible both times.**
 * `scripts/measure-overview.mjs` locates each of Q4–Q7 by a `[data-overview-*]` attribute and
 * scopes the search INSIDE a named section. At M0 it named all four attributes as "absent today,
 * and named here so the AFTER run measures the same thing the BEFORE run failed to find" — and
 * then M2 shipped freshness and M3 shipped finish/variance/flags, and **neither grew the hook**.
 * `grep -rn "data-overview-" apps/web/src` returned nothing on the day M4 started. Separately,
 * three of the four `region` values still said `Recently changed` after M3 moved those facts into a
 * section of their own.
 *
 * Either fault produces the same thing: a **plausible FAIL** about a screen that answers the
 * question perfectly. That is worse than a crash, because the obvious reading of it is "the layout
 * is wrong", which sends the next milestone to re-order a screen that was already right. It is the
 * harness's own recorded failure mode (`FC-1: 0 of 7` printed over a page whose sections were
 * plainly on screen in the same session's screenshot) one turn along, and it is exactly the class
 * ADR-0058 says to replace vigilance with a computed check for — vigilance having now failed twice.
 *
 * **What this does NOT prove**, stated rather than left implicit: it checks that the attribute
 * occurs in the feature's source and that the region name occurs as a rendered `title`. It does not
 * prove the attribute lands on the element that carries the answer, nor that the titled element is
 * a landmark whose accessible name is that string. Those are questions about a real layout, and the
 * harness itself is the instrument for them — this gate's job is to stop the harness being pointed
 * at something that cannot exist.
 */

const FEATURE_DIR = join(import.meta.dirname, '.');
const HARNESS = readFileSync(
  join(FEATURE_DIR, '..', '..', '..', 'scripts', 'measure-overview.mjs'),
  'utf8',
);

/** Every `.ts`/`.tsx` under the overview feature, read once. */
function sourcesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourcesUnder(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(readFileSync(full, 'utf8'));
    }
  }
  return out;
}

const FEATURE_SOURCE = sourcesUnder(FEATURE_DIR).join('\n');

/**
 * The `QUESTIONS` table, read out of the harness rather than restated here — a restatement is the
 * hand-copy that produced the other silently-wrong verdict in this epic (`m3-measurement.md` §1).
 */
function questions(): { id: string; region: string; answer: string }[] {
  const at = HARNESS.indexOf('const QUESTIONS = [');
  expect(at, 'the harness no longer declares QUESTIONS — this gate is grading nothing').not.toBe(
    -1,
  );
  const body = HARNESS.slice(at, HARNESS.indexOf('\n];', at));
  return [...body.matchAll(/\{[^{}]*?id:\s*'(Q\d+)'[^{}]*?\}/gs)].map((m) => {
    const block = m[0];
    return {
      id: m[1] ?? '',
      region: /region:\s*'([^']*)'/.exec(block)?.[1] ?? '',
      answer: /answer:\s*'([^']*)'/.exec(block)?.[1] ?? '',
    };
  });
}

describe("FC-1's hooks exist in the product", () => {
  // Non-vacuity, first and separately: every assertion below is "for each question", and a parse
  // that found none passes all of them perfectly (ADR-0093's rule — a green suite must not be
  // unable to tell "all correct" from "found nothing").
  // `questions()` is also called at COLLECTION time by the two `it.each` blocks below, so a
  // harness this cannot parse errors the whole file rather than reporting a tidy single failure.
  // That is the right way round and is left alone deliberately: a gate that cannot find its subject
  // should be loud, not green (the `axe.validateContext` precedent — it throws on an empty include
  // rather than scanning nothing).
  it('reads every question out of the harness', () => {
    const qs = questions();
    expect(qs.length).toBe(7);
    expect(qs.every((q) => q.region !== '' && q.answer !== '')).toBe(true);

    /*
      **The FILTERED subset is pinned too, and the first version of this gate did not do that.**

      The attribute block below iterates `questions().filter(q => q.answer.startsWith('[data-'))`,
      and a derived subset that comes back empty makes an `it.each` produce **zero** sub-tests while
      the file still reports green. The M6 test review proved it rather than raised it: dropping the
      brackets from the four answers in the harness — `'[data-overview-freshness]'` becoming
      `'data-overview-freshness'` — took that block from four assertions to none, and the suite said
      "passed".

      That is this file's own docblock happening to this file. It exists because the harness could
      name a selector the product did not have, producing a plausible FAIL; the gate could name a
      selector the harness did not have, producing a plausible PASS. Same shape, opposite polarity,
      and the silent-green direction is the worse one.

      The sibling gate in the same diff gets this right — `freshness-copy.structural.test.ts` pins
      `files.length` in a case separate from its fixed-size `it.each(BANNED)` — so the pattern was
      one file away (ADR-0093).
    */
    expect(qs.filter((q) => q.answer.startsWith('[data-')).length).toBe(4);
  });

  it.each(questions().filter((q) => q.answer.startsWith('[data-')))(
    '$id is located by an attribute the product renders: $answer',
    ({ answer }) => {
      const attribute = answer.slice(1, -1);
      expect(FEATURE_SOURCE, `${answer} appears nowhere in features/overview`).toContain(attribute);
    },
  );

  it.each([...new Set(questions().map((q) => q.region))])(
    'the section named %s is one the product renders',
    (region) => {
      expect(FEATURE_SOURCE, `no section is titled "${region}"`).toContain(`title="${region}"`);
    },
  );
});
