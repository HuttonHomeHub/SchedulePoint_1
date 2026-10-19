/**
 * Shared, engine-wide constants for the CPM/GPM scheduling core.
 *
 * The near-critical band is a fixed, product-wide threshold of **working days**: an activity is
 * near-critical when its total float is greater than zero but no more than this many working days
 * of its OWN scheduling calendar (ADR-0036; ADR-0068 amended 2026-10-19). A working day is that
 * calendar's hours-per-day (`EngineActivity.dayFactorMinutes`), the same factor the float is shown
 * in, so the band agrees with the "d" a planner reads. It used to be a fixed 7,200 minutes, which
 * is 15 working days on an eight-hour calendar (`docs/TECH_DEBT.md` #522). A per-plan,
 * planner-tunable threshold is a deliberate, additive follow-up — not a hidden magic number.
 */
export const NEAR_CRITICAL_THRESHOLD_DAYS = 5;

/**
 * The working-day length, in minutes, when an activity states none: the 24-hour day, which is what
 * a plan with no calendar has (ADR-0068 §2) and what keeps every caller that does not pass a factor
 * on the pre-#522 band.
 */
export const DEFAULT_DAY_FACTOR_MINUTES = 1440;
