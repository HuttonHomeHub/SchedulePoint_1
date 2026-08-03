/**
 * The feature's **public** surface — what the workspace outside this folder consumes, and nothing
 * more. Everything else (the hook, the row model, the formatter) is imported directly by its
 * siblings inside the folder, the way `features/gantt` does it.
 *
 * `OFF_FLOAT_PATH_LABEL` is here because BOTH views render it and neither is inside this feature.
 */
export { FloatPathsPanel } from './components/FloatPathsPanel';
export { OFF_FLOAT_PATH_LABEL } from './model/float-path-rows';
export {
  useFloatPathsPanel,
  type UseFloatPathsPanelInput,
  type UseFloatPathsPanelResult,
} from './model/use-float-paths-panel';
export {
  useFloatPathsPanelPrefs,
  FLOAT_PATHS_PANEL_MIN_WIDTH,
} from './use-float-paths-panel-prefs';
