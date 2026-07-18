/**
 * Live cross-plan / programme scheduling — the inter-project M2 web feature (ADR-0045, F8). Public
 * surface: the activity-panel {@link CrossPlanLinksSection}. Everything here is exposed only behind
 * `VITE_PROGRAMME_SCHEDULING` (see `@/config/env`) by its hosts.
 */
export { CrossPlanLinksSection } from './components/CrossPlanLinksSection';
export { AddCrossPlanLinkDialog } from './components/AddCrossPlanLinkDialog';
export {
  useActivityCrossPlanLinks,
  useCreateCrossPlanLink,
  useDeleteCrossPlanLink,
  crossPlanDependencyKeys,
} from './api/use-cross-plan-dependencies';
