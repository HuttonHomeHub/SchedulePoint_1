/** Public surface of the TSLD (Time-Scaled Logic Diagram) canvas feature (ADR-0026). */
export {
  TsldPanel,
  type TsldCreateInput,
  type TsldCreateOutcome,
  type TsldRepositionInput,
  type TsldRepositionOutcome,
  type TsldLinkInput,
  type TsldLinkOutcome,
  type TsldEditOutcome,
} from './components/TsldPanel';
/** Calendar-day math (day offset → date) the route needs to map a create intent to a constraint. */
export { addCalendarDays } from './render/render-model';
