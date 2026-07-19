/** Public surface of the undo-redo feature (ADR-0048). Dark until M3 wires the toolbar + keybindings. */
export {
  activityDefinitionInput,
  relaneCommand,
  repositionCommand,
  updateCommand,
  type Command,
  type RepositionLaneFn,
  type UpdateActivityFn,
  type UpdateActivityInput,
} from './commands';
export {
  usePlanEditHistory,
  MAX_HISTORY_DEPTH,
  type PlanEditHistory,
} from './use-plan-edit-history';
