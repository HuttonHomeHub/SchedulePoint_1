/** Public surface of the resources feature (M7.1, ADR-0039). */
export {
  useResources,
  useResource,
  useCreateResource,
  useUpdateResource,
  useDeleteResource,
  useAssignments,
  useCreateAssignment,
  useUpdateAssignment,
  useDeleteAssignment,
  resourcesQueryOptions,
  resourceQueryOptions,
  assignmentsQueryOptions,
  resourceKeys,
  assignmentKeys,
} from './api/use-resources';
export { ResourcesTable } from './components/ResourcesTable';
export { CreateResourceButton } from './components/CreateResourceButton';
export { ResourceFormDialog } from './components/ResourceFormDialog';
export { ActivityResourcesDialog } from './components/ActivityResourcesDialog';
export {
  RESOURCE_KIND_LABELS,
  resourceFormSchema,
  assignmentFormSchema,
  validateUnitsPerHour,
} from './schemas/resource-schemas';
export { previewDerivedDuration, formatDurationDays } from './schemas/duration-triad';
