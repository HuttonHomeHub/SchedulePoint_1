/** Public surface of the baselines feature. */
export {
  useBaselines,
  useBaseline,
  useBaselineVariance,
  useCaptureBaseline,
  useActivateBaseline,
  useDeleteBaseline,
  baselinesQueryOptions,
  baselineQueryOptions,
  baselineKeys,
  type PlanVariance,
} from './api/use-baselines';
export { BaselinesPanel } from './components/BaselinesPanel';
export { CreateBaselineDialog } from './components/CreateBaselineDialog';
