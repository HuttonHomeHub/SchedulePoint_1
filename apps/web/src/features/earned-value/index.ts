/**
 * Public surface of the Earned-Value feature (EV4b, ADR-0042). The analysis panel + its read hook;
 * composed at the sites that host it (the read endpoint is live).
 */
export { EarnedValuePanel } from './components/EarnedValuePanel';
export {
  useEarnedValue,
  earnedValueQueryOptions,
  isCostReadForbidden,
} from './api/use-earned-value';
