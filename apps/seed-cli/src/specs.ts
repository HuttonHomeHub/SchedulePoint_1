import type { SeedSpec } from '@repo/seed';

import { fixtureSpec } from './fixture.js';

/**
 * Resolve a `--tier` name to the specs it covers (ADR-0066). M1 ships the fixture tier only; the
 * capability, pairwise, scale and negative tiers land in M2–M5 and register here.
 *
 * An unknown tier returns an empty list rather than throwing, so the CLI can say which tiers exist
 * instead of a stack trace.
 */
export function loadSpecs(tier: string): SeedSpec[] {
  switch (tier) {
    case 'fixture':
    case 'all':
      return [fixtureSpec()];
    default:
      return [];
  }
}
