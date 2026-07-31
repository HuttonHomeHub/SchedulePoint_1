import type { SeedSpec } from '@repo/seed';

import { capabilitySpecs } from './capabilities/index.js';
import { fixtureSpec } from './fixture.js';

/**
 * Resolve a `--tier` name to the specs it covers (ADR-0066). M1 shipped the fixture tier and M2 the
 * capability tier; the pairwise, scale and negative tiers land in M3–M5 and register here.
 *
 * An unknown tier returns an empty list rather than throwing, so the CLI can say which tiers exist
 * instead of a stack trace.
 */
export function loadSpecs(tier: string, family?: string): SeedSpec[] {
  switch (tier) {
    case 'fixture':
      // `--family` is a capability-tier filter; the fixture is one plan and has no families. Asking
      // for `--tier fixture --family cost` gets the fixture rather than nothing, because silently
      // returning an empty list here would read as "that family does not exist".
      return [fixtureSpec()];
    case 'capability':
      return capabilitySpecs(family);
    case 'all':
      // The fixture first: it is the one plan that exercises every capability at once, so a run
      // interrupted halfway has still produced the broadest thing the catalogue offers.
      return [fixtureSpec(), ...capabilitySpecs(family)];
    default:
      return [];
  }
}

/** The tiers `--tier` accepts today, for the CLI's usage text and its error message. */
export const KNOWN_TIERS = ['fixture', 'capability', 'all'] as const;
