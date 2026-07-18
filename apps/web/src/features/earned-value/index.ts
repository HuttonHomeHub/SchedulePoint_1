/**
 * Public surface of the Earned-Value feature (EV4b, ADR-0042). The analysis panel + its read hook;
 * gated at the composition sites behind `VITE_EARNED_VALUE` (the read endpoint is already live).
 */
export { EarnedValuePanel } from './components/EarnedValuePanel';
export {
  useEarnedValue,
  earnedValueQueryOptions,
  isCostReadForbidden,
} from './api/use-earned-value';
