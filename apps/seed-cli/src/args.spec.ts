import { describe, expect, it } from 'vitest';

import { parseArgs } from './args.js';
import { DEFAULT_SCALE_ACTIVITIES, KNOWN_TIERS, loadSpecs } from './specs.js';

/**
 * Argument parsing and tier resolution (ADR-0066 M2.3). Small surface, but two of these are
 * mistakes that produce a *plausible* wrong run rather than an error — the seeder cheerfully seeds
 * the default tier, and the operator finds out later that the family they asked for is not there.
 */
describe('parseArgs', () => {
  const required = [
    '--url',
    'http://localhost:3000',
    '--org',
    'acme',
    '--project',
    'p-1',
    '--email',
    'planner@example.com',
    '--password',
    'secret',
  ];

  it('requires the connection arguments, and shows usage without them', () => {
    expect(parseArgs(['--tier', 'capability']).args).toBeNull();
    expect(parseArgs(required).args).not.toBeNull();
  });

  it('defaults to the fixture tier', () => {
    expect(parseArgs(required).args?.tier).toBe('fixture');
  });

  it('reads --coverage without requiring a URL', () => {
    // The coverage table is a property of the plans, so demanding credentials to print it would
    // make the one question a reviewer asks the hardest one to answer.
    const parsed = parseArgs(['--coverage']);
    expect(parsed.coverage).toBe(true);
    expect(parsed.args).toBeNull();
  });

  it('does not let a value-less switch swallow the next flag', () => {
    // `--verbose --tier capability` must parse the tier. Treating every `--x` as taking a value is
    // the classic version of this bug, and it silently seeds the DEFAULT tier instead of erroring.
    const parsed = parseArgs([...required, '--verbose', '--tier', 'capability']);
    expect(parsed.args?.verbose).toBe(true);
    expect(parsed.args?.tier).toBe('capability');
  });

  it('carries --family through', () => {
    expect(parseArgs([...required, '--family', 'cost']).args?.family).toBe('cost');
    expect(parseArgs(required).args?.family).toBeUndefined();
  });
});

describe('loadSpecs', () => {
  it('resolves every advertised tier to at least one plan', () => {
    for (const tier of KNOWN_TIERS) expect(loadSpecs(tier).length, tier).toBeGreaterThan(0);
  });

  it('returns nothing for an unknown tier or family, rather than throwing', () => {
    expect(loadSpecs('pairwise')).toEqual([]);
    expect(loadSpecs('capability', { family: 'not-a-family' })).toEqual([]);
  });

  it('sizes the scale tier from --activities, and defaults without it', () => {
    const [sized] = loadSpecs('scale', { activities: 750 });
    const [defaulted] = loadSpecs('scale');
    expect(sized?.activities.filter((a) => a.type !== 'WBS_SUMMARY')).toHaveLength(750);
    expect(defaulted?.activities.filter((a) => a.type !== 'WBS_SUMMARY')).toHaveLength(
      DEFAULT_SCALE_ACTIVITIES,
    );
  });

  it('falls back to the default rather than generating an empty plan from NaN', () => {
    // `--activities lots` parses to NaN, which would flow through every count in the generator and
    // come out as a plan with nothing in it — a run that looks like it worked.
    expect(loadSpecs('scale', { activities: Number('lots') })[0]?.activities.length).toBe(
      loadSpecs('scale')[0]?.activities.length,
    );
  });

  it('keeps the scale tier out of `all`', () => {
    // `all` is what an operator types to get the catalogue. A scale plan is thousands of requests
    // and tens of minutes — something you ask for, never something a convenience alias does to you.
    expect(loadSpecs('all').some((spec) => spec.tier === 'scale')).toBe(false);
  });

  it('narrows the capability tier by family', () => {
    const all = loadSpecs('capability');
    const one = loadSpecs('capability', { family: 'cost' });
    expect(one.length).toBeGreaterThan(0);
    expect(one.length).toBeLessThan(all.length);
  });

  it('ignores --family on the fixture tier instead of returning nothing', () => {
    // The fixture is one plan with no families. Returning an empty list would read as "that family
    // does not exist" when the real answer is "that filter does not apply here".
    expect(loadSpecs('fixture', { family: 'cost' })).toHaveLength(1);
  });

  it('puts the fixture first in the `all` tier', () => {
    // A run interrupted part-way has then still produced the broadest plan the catalogue offers.
    expect(loadSpecs('all')[0]?.tier).toBe('fixture');
  });
});
