/** Public surface of the dependencies feature. */
export {
  usePredecessors,
  useSuccessors,
  usePlanDependencies,
  predecessorsQueryOptions,
  successorsQueryOptions,
  planDependenciesQueryOptions,
  dependencyKeys,
} from './api/use-dependencies';
export {
  useCreateDependency,
  useUpdateDependency,
  useDeleteDependency,
} from './api/use-dependencies';
export { DependencyEditor } from './components/DependencyEditor';
export { ActivityLogicPanel } from './components/ActivityLogicPanel';
export { DEPENDENCY_TYPE_LABELS, formatLag } from './schemas/dependency-schemas';
export { lagHoursPerDay, ELAPSED_HOURS_PER_DAY } from './model/lag-factor';
export { resolveLagDragWrite, hasSubDayLag, type LagDragWrite } from './model/lag-drag';
