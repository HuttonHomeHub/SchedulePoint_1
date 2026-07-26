/** Public surface of the resources feature (M7.1, ADR-0039). */
export {
  useResources,
  useResource,
  useCreateResource,
  useUpdateResource,
  useDeleteResource,
  useArchiveResource,
  useUnarchiveResource,
  useResourceSearch,
  useAssignments,
  useCreateAssignment,
  useUpdateAssignment,
  useDeleteAssignment,
  useResourceHistogram,
  resourcesQueryOptions,
  resourceSearchQueryOptions,
  resourceQueryOptions,
  assignmentsQueryOptions,
  resourceHistogramQueryOptions,
  resourceKeys,
  assignmentKeys,
} from './api/use-resources';
export { ResourcesTable } from './components/ResourcesTable';
export { CreateResourceButton } from './components/CreateResourceButton';
export { ResourceFormDialog } from './components/ResourceFormDialog';
export { ActivityResourcesDialog } from './components/ActivityResourcesDialog';
export { ResourceHistogram } from './components/ResourceHistogram';
export {
  BucketSizeSelect,
  ResourceLoadingTable,
  GRANULARITY_LABELS,
  formatUnits,
} from './components/ResourceLoadingTable';
export {
  RESOURCE_KIND_LABELS,
  RESOURCE_CURVE_LABELS,
  ANY_RESOURCE_KIND,
  DEFAULT_RESOURCE_LIBRARY_FILTERS,
  resourceFormSchema,
  assignmentFormSchema,
  type ResourceKindFilter,
  type ResourceLibraryFilters,
} from './schemas/resource-schemas';
