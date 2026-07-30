/** Public surface of the TSLD (Time-Scaled Logic Diagram) canvas feature (ADR-0026). */
export {
  TsldPanel,
  type TsldCreateInput,
  type TsldCreateOutcome,
  type TsldRepositionInput,
  type TsldRepositionOutcome,
  type TsldResizeInput,
  type TsldResizeOutcome,
  type TsldLagInput,
  type TsldLagOutcome,
  type TsldLinkInput,
  type TsldLinkOutcome,
  type TsldLoeSpanInput,
  type TsldLoeSpanOutcome,
  type TsldEditOutcome,
} from './components/TsldPanel';
/** Calendar-day math (day offset → date) the route needs to map a create intent to a constraint. */
export { addCalendarDays } from './render/render-model';
/** The canvas working-day calendar shape (weekday mask + `date → isWorking` exceptions) for the
 * non-working shading — re-exported so composing routes (e.g. the guest view) can build one. */
export type { WorkingDayCalendar } from './render/time-scale';
/** Bar-date sourcing per scheduling mode + Late overlay (ADR-0033), for the workspace to derive. */
export { barDateSourceFor, type BarDateSource } from './render/to-render-model';
/** Coalesced keyboard lag nudge (ADR-0052 M3) — composed by the route into the Logic panel's
 * dependency rows (the dependencies keyboard surface), mirroring the duration nudge. */
export { useCoalescedLagNudge } from './interaction/use-coalesced-lag-nudge';
/** The Today marker's staleness tick (F6c, `VITE_CANVAS_TIME_AXIS`) + the pure fraction it drives
 * the workspace model composes both so the marker never goes stale across a session. */
export { useNow } from './render/use-now';
export { todayDayFraction } from './render/time-scale';
/**
 * The WBS band's pure geometry constants (ADR-0063). Exported for `features/wbs`, which owns the
 * band's *content* derivation and needs to know how tall the band that shows it will be — the one
 * allowed direction across this seam (D8 forbids `tsld → other feature`, not the reverse).
 */
export { wbsBandDepths, wbsBandHeight, WBS_BAND_MAX_DEPTH } from './render/wbs-band';
