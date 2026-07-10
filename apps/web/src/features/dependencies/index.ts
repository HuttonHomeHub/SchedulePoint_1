/** Public surface of the dependencies feature. */
export {
  usePredecessors,
  useSuccessors,
  predecessorsQueryOptions,
  successorsQueryOptions,
  dependencyKeys,
} from './api/use-dependencies';
export { DependencyEditor } from './components/DependencyEditor';
export { DEPENDENCY_TYPE_LABELS, formatLag } from './schemas/dependency-schemas';
