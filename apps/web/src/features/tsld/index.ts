/** Public surface of the TSLD (Time-Scaled Logic Diagram) canvas feature (ADR-0026). */
export {
  TsldPanel,
  type TsldCreateInput,
  type TsldCreateOutcome,
  type TsldRepositionInput,
  type TsldRepositionOutcome,
  type TsldResizeInput,
  type TsldResizeOutcome,
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
