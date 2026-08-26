/**
 * **The facts registry, now one named subject of a shared one** (the one-row header, 2026-08-26).
 *
 * The mechanism moved to `./plan-slot-host`, which serves the plan's facts and the pen's
 * live-region sentence under two names instead of two files. This module survives as a re-export
 * so every consumer and every suite that imported from here is **untouched** — which is how the
 * generalisation is known to have changed no behaviour, rather than merely believed to have
 * (the ADR-0078 barrel-preserving argument).
 *
 * New code should import from `./plan-slot-host`.
 */
export {
  PlanFactsHost,
  PlanFactsOutlet,
  PlanFactsProvider,
} from '@/components/layout/workspace/plan-slot-host';
