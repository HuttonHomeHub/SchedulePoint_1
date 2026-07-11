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
export { DEPENDENCY_TYPE_LABELS, formatLag } from './schemas/dependency-schemas';
