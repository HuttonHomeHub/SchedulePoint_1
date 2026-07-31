import { scaleSpec, type SeedSpec } from '@repo/seed';

import { capabilitySpecs } from './capabilities/index.js';
import { fixtureSpec } from './fixture.js';

/** How many activities `--tier scale` generates when `--activities` is not given. */
export const DEFAULT_SCALE_ACTIVITIES = 500;

export interface LoadOptions {
  family?: string;
  /** `--tier scale` only: the number of non-summary activities to generate. */
  activities?: number;
}

/**
 * Resolve a `--tier` name to the specs it covers (ADR-0066). M1 shipped the fixture tier, M2 the
 * capability tier and M4 the scale tier; the negative tier lands in M5 and registers here.
 *
 * An unknown tier returns an empty list rather than throwing, so the CLI can say which tiers exist
 * instead of a stack trace.
 */
export function loadSpecs(tier: string, options: LoadOptions = {}): SeedSpec[] {
  switch (tier) {
    case 'fixture':
      // `--family` is a capability-tier filter; the fixture is one plan and has no families. Asking
      // for `--tier fixture --family cost` gets the fixture rather than nothing, because silently
      // returning an empty list here would read as "that family does not exist".
      return [fixtureSpec()];
    case 'capability':
      return capabilitySpecs(options.family);
    case 'scale': {
      // `Number('lots')` is NaN, and NaN would flow through every count in the generator and come
      // out as a plan with no activities in it — a run that looks like it worked. Fall back loudly.
      const requested = options.activities;
      const activities =
        requested === undefined || !Number.isFinite(requested) || requested < 1
          ? DEFAULT_SCALE_ACTIVITIES
          : requested;
      return [scaleSpec({ activities })];
    }
    case 'all':
      // The fixture first: it is the one plan that exercises every capability at once, so a run
      // interrupted halfway has still produced the broadest thing the catalogue offers. Scale is
      // deliberately NOT included: it is thousands of requests and tens of minutes, so it is
      // something an operator asks for, never something `all` does to them by surprise.
      return [fixtureSpec(), ...capabilitySpecs(options.family)];
    default:
      return [];
  }
}

/** The tiers `--tier` accepts today, for the CLI's usage text and its error message. */
export const KNOWN_TIERS = ['fixture', 'capability', 'scale', 'all'] as const;
