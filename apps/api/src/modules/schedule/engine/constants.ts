/**
 * Shared, engine-wide constants for the CPM/GPM scheduling core.
 *
 * The near-critical band is a fixed, product-wide threshold: an activity is
 * near-critical when its total float is greater than zero but no more than this
 * many working **minutes** (ADR-0036). 7,200 = 5 working days at 1,440 min/day,
 * preserving the M6 five-working-day band. A per-plan, planner-tunable threshold
 * is a deliberate, additive follow-up — not a hidden magic number.
 */
export const NEAR_CRITICAL_THRESHOLD_MINUTES = 5 * 1440;
