/**
 * Public surface of the Gantt feature (ADR-0059, spec `docs/specs/gantt-view/`) — the grid-and-bar
 * projection of the same model, for the audience that does not read logic diagrams.
 *
 * Gated at the composition sites behind `VITE_GANTT_VIEW`. The view reads persisted computed
 * columns only: **nothing here imports the CPM engine**, which is what makes the ADR-0034 recalc
 * parity gate structurally untouched by this epic.
 */
export { GanttPanel } from './components/GanttPanel';
export { usePlanViewMode } from './use-plan-view-mode';
export {
  DEFAULT_PLAN_VIEW_MODE,
  PLAN_VIEW_MODES,
  PLAN_VIEW_MODE_LABELS,
  parsePlanViewMode,
  planViewModeSearch,
  type PlanViewMode,
} from './view-mode';
