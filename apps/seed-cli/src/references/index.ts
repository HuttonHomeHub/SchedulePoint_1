import type { SeedSpec } from '@repo/seed';

import { netpointReferencePlan } from './netpoint-power-plant.js';

/**
 * The **reference** tier: whole programmes transcribed from a published source, so the product can
 * be compared against the tool it is measured by. Each is checked against its source picture, not
 * against a one-sentence capability claim — which is why it is not the capability tier.
 */
export function referenceSpecs(): SeedSpec[] {
  return [netpointReferencePlan()];
}
