/**
 * Shared, engine-wide constants for the CPM/GPM scheduling core.
 *
 * The near-critical band is a fixed, product-wide threshold in this slice (M6,
 * ADR-0023): an activity is near-critical when its total float is greater than
 * zero but no more than this many working days. A per-plan, planner-tunable
 * threshold is a deliberate, additive follow-up — not a hidden magic number.
 */
export const NEAR_CRITICAL_THRESHOLD_WORKING_DAYS = 5;
