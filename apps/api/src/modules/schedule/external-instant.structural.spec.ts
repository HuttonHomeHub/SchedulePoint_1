import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { stripComments } from '../../common/contracts/cost-key-scan';

/**
 * **One producer of a timed external string, and one caller of it (#385 M1-T4, gate 2).**
 *
 * M1-T3 gave `clampExternalBackwardFinish` a branch that reads a value longer than ten characters as
 * the bound itself (spec D7). The parity argument for M1 (spec §4.8) rests on that branch being
 * reachable from nowhere but the cross-plan derivation: no persisted column produces a timed value,
 * and `formatExternalInstant` is the only thing that writes one for the seam. This gate holds both
 * halves:
 *
 * - `formatExternalInstant` is declared once, in `engine/instants.ts`;
 * - outside the engine, only `cross-plan-derivation.ts` refers to it (no caller yet: M2 is first);
 * - outside the engine, nothing refers to `absMinutesToInstant`, the engine's other formatter, which
 *   drops `T00:00` and so writes the midnight string a finish milestone reads a day late (spec E12);
 * - no source anywhere builds a `…THH:MM` string by hand except the two engine formatters.
 *
 * **Scope, stated so nobody reads this as covering more.** It catches drift in STRUCTURE (who
 * produces a timed string, who may call the producer), not in CONTENT: a wrong instant passed to the
 * right formatter is M2's goldens' to catch, and the engine's arithmetic is FC-5's. test-engineer
 * raised this in the agreement round and asked for no action.
 *
 * **Blind spots.** A timed string assembled some other way (an array `join`, a `Date` method, a
 * value read from somewhere else) is invisible to a source scan, and so is a caller reaching the
 * formatter through a re-export under another name. Spec and test files are not scanned: fixtures
 * may write any string. The pinned positive cases keep the scan from passing by finding nothing, and
 * the synthetic cases prove each pattern matches the defect it names.
 *
 * **Verified red** (ADR-0110 D5), each against a named mutation, then reverted:
 * - `schedule.service.ts` importing and calling `formatExternalInstant`: the caller assertion failed
 *   naming that file.
 * - `schedule.service.ts` importing `absMinutesToInstant` from `./engine/working-time-calendar`: the
 *   E12 assertion failed naming that file.
 * - `schedule.service.ts` building `` `${day}T${hh}:${mm}` ``: the hand-built assertion failed.
 * - a second `export function formatExternalInstant` in `schedule.service.ts`: the single-declaration
 *   assertion failed with two sites, and the caller assertion with it.
 * - `formatExternalInstant` renamed in `instants.ts`: the pinned declaration case failed.
 */

const SRC = join(__dirname, '..', '..');
const ENGINE = 'modules/schedule/engine/';
const HOME = 'modules/schedule/engine/instants.ts';
const ALLOWED_CALLERS = ['modules/schedule/cross-plan-derivation.ts'];
/** The two engine formatters that may write `…THH:MM`: the one for the seam, and the internal one. */
const TIMED_PRODUCERS = [HOME, 'modules/schedule/engine/working-time-calendar.ts'];

const DECLARATION = /(?:function\s+|(?:const|let|var)\s+)formatExternalInstant\b/g;
const REFERENCE = /\bformatExternalInstant\b/;
const E12_FORMATTER = /\babsMinutesToInstant\b/;
/**
 * A hand-built `…THH:MM` engine instant: a template `}T${…}:${…}` or `}T00:00`, or a quoted
 * `'T00:00'`, NOT followed by seconds. `${d}T00:00:00Z` (an ISO string handed to `Date.parse`,
 * which several read models build) is a different thing and is excluded by the lookahead.
 */
const TIMED_TEMPLATE =
  /\}T(?:\$\{[^}]*\}|\d{2}):(?:\$\{[^}]*\}|\d{2})(?![\d:])|['"]T\d{2}:\d{2}['"]/g;

/** Every non-spec TypeScript source under `apps/api/src`, as a path relative to it. */
function sources(): string[] {
  return (readdirSync(SRC, { recursive: true }) as string[])
    .map((f) => f.split(sep).join('/'))
    .filter(
      (f) =>
        f.endsWith('.ts') &&
        !f.endsWith('.spec.ts') &&
        !f.endsWith('.test.ts') &&
        !f.endsWith('.d.ts'),
    )
    .sort();
}

const files = sources();
const code = new Map(files.map((f) => [f, stripComments(readFileSync(join(SRC, f), 'utf8'))]));
const outsideEngine = files.filter((f) => !f.startsWith(ENGINE));

function declarationSites(): string[] {
  return files.flatMap((f) => [...code.get(f)!.matchAll(DECLARATION)].map(() => f));
}

function handBuilt(text: string): string[] {
  return [...text.matchAll(TIMED_TEMPLATE)].map((m) => m[0]);
}

describe('#385 M1-T4 gate 2: formatExternalInstant is the only producer of a timed string', () => {
  it('scanned apps/api/src (pinned: a scan that finds nothing proves nothing)', () => {
    expect(relative(SRC, join(__dirname, 'cross-plan-derivation.ts'))).toBe(
      'modules/schedule/cross-plan-derivation.ts',
    );
    expect(files).toContain(HOME);
    expect(files).toContain(ALLOWED_CALLERS[0]);
    expect(outsideEngine.length).toBeGreaterThan(100);
  });

  it('formatExternalInstant is declared exactly once, in engine/instants.ts (pinned)', () => {
    expect(declarationSites()).toEqual([HOME]);
  });

  it('outside the engine, only cross-plan-derivation.ts refers to formatExternalInstant', () => {
    const callers = outsideEngine.filter((f) => REFERENCE.test(code.get(f)!));
    expect(callers.filter((f) => !ALLOWED_CALLERS.includes(f))).toEqual([]);
  });

  it('outside the engine, nothing refers to absMinutesToInstant (the E12 formatter)', () => {
    expect(outsideEngine.filter((f) => E12_FORMATTER.test(code.get(f)!))).toEqual([]);
  });

  it('no source builds a timed instant by hand except the two engine formatters', () => {
    const builders = files.filter((f) => handBuilt(code.get(f)!).length > 0);
    // Pinned: the pattern finds both real producers, so a broken pattern cannot pass silently.
    expect(builders).toEqual(expect.arrayContaining(TIMED_PRODUCERS));
    expect(builders.filter((f) => !TIMED_PRODUCERS.includes(f))).toEqual([]);
  });

  it('the patterns see the defect they name (synthetic sources)', () => {
    expect(handBuilt('return `${date}T${h}:${m}`;')).toEqual(['}T${h}:${m}']);
    expect(handBuilt('return `${instant}T00:00`;')).toEqual(['}T00:00']);
    expect(handBuilt("const suffix = 'T00:00';")).toEqual(["'T00:00'"]);
    // An ISO string for Date.parse carries seconds and is not an engine instant.
    expect(handBuilt('Date.parse(`${to}T00:00:00Z`)')).toEqual([]);
    expect(handBuilt('new Date(`${date}T00:00:00.000Z`)')).toEqual([]);
    expect([...'export function formatExternalInstant(a) {}'.matchAll(DECLARATION)]).toHaveLength(
      1,
    );
    // A comment quoting the defect is not the defect.
    expect(REFERENCE.test(stripComments('// formatExternalInstant(abs)'))).toBe(false);
  });
});
