import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **Gate B — every consumer that reads a search param is classified once, one way**
 * (`docs/TECH_DEBT.md` #96, M2-T3).
 *
 * Gate A censuses **routes**, and structurally cannot see the other half of this defect: seven of
 * the eighteen params the app reads are declared by no `validateSearch` at all — `gsort`, `ghide`,
 * `gcollapsed` on the plan workspace, and `categories`, `outcome`, `from`, `to` on the two audit
 * screens. They work because a validator's return is *added to* the parsed search rather than
 * substituted for it (`router.js:685-696`), so a key nobody declares still arrives at its reader,
 * already coerced by the codec. A census keyed on validators would report those seven as covered by
 * saying nothing about them.
 *
 * So this censuses the **readers**. Each file whose comment-stripped source reads a search param is
 * either classified with where its real-parser coverage lives, or excluded with a written reason.
 * A new consumer fails this test until somebody decides which it is — which is the whole mechanism,
 * and the reason it is a census rather than a list of names in a comment (`docs/TECH_DEBT.md` #178,
 * #181 and #183 are three holes in one gate, every one a rule that went **quiet** rather than
 * wrong).
 *
 * **The positive case is pinned first and deliberately.** "Every unclassified consumer is a
 * failure" passes perfectly against a census that finds nothing — the ADR-0093 lesson, and the
 * failure `unsaved-work-census.structural.test.ts` hit on its own first run when a braced glob
 * matched no files.
 *
 * **Comments are stripped before matching**, because a docblock explaining `useSearch` would
 * otherwise count as calling it. That is the fourth scan-matching-prose defect this repository has
 * recorded (`reset-fills.structural.test.ts`, the ADR-0097 weight ratchet, ADR-0120's fixture), and
 * it is cheaper to copy the fix than to rediscover it.
 *
 * **Two things it cannot do, both measured rather than assumed.**
 *
 * 1. It proves a consumer has been *thought about*, never that its coverage actually crosses the
 *    parser. That is Gate A's job for the eight routes and the two suites' job for everything else.
 * 2. It censuses **tracked** files (`git ls-files`, the `overlay-position.structural.test.ts`
 *    precedent), so a brand-new consumer that has not been `git add`ed is invisible to it — checked
 *    by writing one and watching all three assertions pass. Locally that is a gate going quiet,
 *    which is the failure mode this file's own preamble complains about. It is accepted rather than
 *    worked around because CI checks the tree out, where every file is tracked, so the gate is
 *    sound at the moment it decides whether a change merges; and the alternative — walking the
 *    filesystem — sweeps in build output and anything a developer happens to have left lying
 *    around. Worth knowing before trusting a green local run on a file you have not staged.
 */
const WEB_SRC = join(process.cwd());

/** `useUrlFilterState` is included: it is how the four screens below reach `useSearch` at all. */
const READS_SEARCH =
  /\buseSearch\(|\bpickText\(|\bpickParam\(|\buseUrlFilterState\(|\bsearchString\(/;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function trackedSourceFiles(): string[] {
  return execFileSync('git', ['ls-files', '--', 'src/*.ts', 'src/*.tsx'], {
    cwd: WEB_SRC,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => f !== '' && !/\.(test|spec)\.tsx?$/.test(f));
}

/**
 * Every consumer, and where the real parser is crossed on its behalf. A value is a sentence, not a
 * boolean, because "why is this fine?" is the question a reader arrives with and a `true` answers
 * none of it.
 */
const CLASSIFIED: Record<string, string> = {
  // The helper itself, and the two suites that exercise it through `defaultParseSearch`.
  'lib/router/search-string.ts':
    'The rule itself. `search-string.test.ts` drives every case from a query string through the ' +
    'real parser.',

  // Route validators — Gate A refuses any of these without a case in `router-search.test.ts`.
  'app/router.tsx': 'All eight validators; covered by Gate A + `router-search.test.ts`.',
  'routes/sign-in.tsx': 'Reads `redirect`/`signedOut`, validated at the route (Gate A).',
  'routes/verify-email.tsx': 'Reads `email`/`verified`/`error`, validated at the route (Gate A).',
  'routes/reset-password.tsx': 'Reads `token`/`error`, validated at the route (Gate A).',
  'routes/forgot-password.tsx': 'Reads `email`, validated at the route (Gate A).',
  'routes/accept-invite.tsx': 'Reads `token`, validated at the route (Gate A).',

  // The shared readers, and the screens that use them.
  'hooks/use-url-filter-state.ts':
    '`pickText`/`pickParam` delegate to `searchString`; the coercion is covered by ' +
    '`search-string.test.ts` and end to end by `e2e-library/search-param-probe.spec.ts`.',
  'routes/calendars.tsx':
    'Library filters `q`/`scope`/`archived`. `q` is the milestone’s own journey case; the two ' +
    'enums are pinned as a measured no-op in `search-string.test.ts`.',
  'routes/resources.tsx': 'Library filters `q`/`kind`/`archived`; same coverage as calendars.',

  // The seven params no validator declares — the half Gate A cannot see.
  'features/audit/model/audit-filter.ts':
    'Parses the four UNDECLARED audit params (`categories`/`outcome`/`from`/`to`) through ' +
    '`searchString`; its own suite covers the vocabulary checks.',
  'routes/audit-log.tsx': 'Hosts the audit filter; the parsing is `audit-filter.ts`’s.',
  'routes/my-activity.tsx': 'Hosts the same audit filter; the parsing is `audit-filter.ts`’s.',
  'features/gantt/model/gantt-view-state.ts':
    'Parses the three UNDECLARED Gantt params (`gsort`/`ghide`/`gcollapsed`) through ' +
    '`searchString`; its own suite covers the shapes.',
  'features/gantt/model/use-gantt-view-state.ts':
    'Hosts the Gantt view state; the parsing is `gantt-view-state.ts`’s.',
  'features/gantt/use-plan-view-mode.ts':
    'Reads `view`, which IS declared — `/orgs/$orgSlug/plans/$planId`, covered by Gate A. Listed ' +
    'because it reads `useSearch` directly rather than through the route.',
};

/** The seven this gate was written for, pinned so an empty census cannot pass. */
const KNOWN_CONSUMERS = [
  'app/router.tsx',
  'hooks/use-url-filter-state.ts',
  'routes/calendars.tsx',
  'routes/resources.tsx',
  'features/audit/model/audit-filter.ts',
  'features/gantt/model/gantt-view-state.ts',
  'features/gantt/use-plan-view-mode.ts',
] as const;

function consumers(): string[] {
  return trackedSourceFiles()
    .filter((file) => READS_SEARCH.test(stripComments(readFileSync(join(WEB_SRC, file), 'utf8'))))
    .map((file) => file.replace(/^src\//, ''))
    .sort();
}

describe('Gate B — the search-consumer census', () => {
  it('B1 — finds the consumers it was written for, so a later assertion cannot pass vacuously', () => {
    const found = consumers();
    expect(found.length).toBeGreaterThan(0);
    expect(found).toEqual(expect.arrayContaining([...KNOWN_CONSUMERS]));
  });

  it('B2 — every consumer is classified, with a reason someone can read', () => {
    const unclassified = consumers().filter((file) => !(file in CLASSIFIED));
    expect(
      unclassified,
      'these read a search param and nobody has said where the real parser is crossed on their ' +
        'behalf — add them to CLASSIFIED in this file, with a sentence',
    ).toEqual([]);
  });

  it('B3 — the classification holds no entry for a file that no longer reads search', () => {
    // The mirror assertion. Without it the map becomes an archive: a stale entry keeps a deleted
    // consumer's reason alive and reads as coverage for something that is not there.
    const found = new Set(consumers());
    expect(Object.keys(CLASSIFIED).filter((file) => !found.has(file))).toEqual([]);
  });
});
