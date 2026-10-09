import type { TsldToolbarContext } from './tsld-toolbar-context';

/**
 * Wraps a command that acts on the diagram so it still means something when the diagram is out of
 * reach. Two things put it there, and the host answers each:
 *
 * - the short-body swap has hidden it (`docs/specs/short-screen-vertical-budget`, ADR-0180): the host
 *   collapses the activities panel and runs the command on the next frame;
 * - a dock has taken the whole row and the diagram is `inert` (`docs/specs/retire-single-pane-workspace`,
 *   ADR-0181): the host closes the open dock and runs the command on the next frame — except a
 *   command classed `dock`, which already replaces the open dock, and which closing first would turn
 *   from "close this one" into "reopen it".
 *
 * The third argument is therefore only ever `'dock'` (the type says so), and
 * `canvas-directed-commands.structural.test.tsx` holds every wrapped command's argument to
 * {@link COMMAND_CLASS}: a fifth dock command that forgets it, or a viewport command that claims it,
 * fails that test rather than misbehaving on a narrow window.
 *
 * Otherwise it runs at once. `when` lets a command that is only sometimes about the diagram say so for
 * the arguments it was given (the Find field's two-step Escape).
 */
export type WithDiagram = <A extends unknown[]>(
  command: (...args: A) => void,
  when?: (...args: A) => boolean,
  commandClass?: Extract<CommandClass, 'dock'>,
) => (...args: A) => void;

/** The host that has no swap to reckon with: every command runs at once. */
export const runInPlace: WithDiagram = (command) => command;

/**
 * What a toolbar-context command does to the diagram, which decides what it owes the swap.
 *
 * - `viewport`: moves or reads the canvas viewport; invisible while hidden, so collapse first.
 * - `tool`: arms a drawing tool; a tool armed while hidden has no target, so collapse first.
 * - `dock`: opens a right dock; a dock and an expanded panel are exclusive on a short body.
 * - `unaffected`: a display mark (the diagram reflects it on return) or a plan / data / output
 *   command whose subject is the plan or the selection and whose result the table shows.
 */
export type CommandClass = 'viewport' | 'tool' | 'dock' | 'unaffected';

type CommandKey = {
  [K in keyof TsldToolbarContext]-?: NonNullable<TsldToolbarContext[K]> extends (
    ...args: never[]
  ) => unknown
    ? K
    : never;
}[keyof TsldToolbarContext];

/**
 * Every function on {@link TsldToolbarContext}, classified. A `Record` over the interface's own
 * function keys, so adding a command to the context fails the typecheck until the author has chosen
 * a class; `canvas-directed-commands.structural.test.ts` then holds the built context to this table.
 */
export const COMMAND_CLASS: Record<CommandKey, CommandClass> = {
  setZoomPreset: 'viewport',
  stepZoom: 'viewport',
  fit: 'viewport',
  goToDate: 'viewport',
  zoomToSelection: 'viewport',
  goToNextConflict: 'viewport',
  goToMatch: 'viewport',
  // Typing in Find is text entry and the filter applies to the table too; only the second Escape,
  // which hands the planner to the diagram, is a diagram command (ADR-0079).
  escapeSearchField: 'viewport',

  toggleAddActivity: 'tool',
  setCreateType: 'tool',
  toggleLinkMode: 'tool',
  toggleLoeSpanMode: 'tool',
  toggleMarqueeMode: 'tool',

  toggleHealthCheck: 'dock',
  toggleRevisionCompare: 'dock',
  revealComments: 'dock',

  toggleView: 'unaffected',
  setPlanView: 'unaffected',
  scheduleRefusal: 'unaffected',
  setLinkType: 'unaffected',
  requestAutoArrange: 'unaffected',
  requestApplyLevelling: 'unaffected',
  undo: 'unaffected',
  redo: 'unaffected',
  historyEntries: 'unaffected',
  undoTo: 'unaffected',
  redoTo: 'unaffected',
  recalculate: 'unaffected',
  openBaselines: 'unaffected',
  openCalendar: 'unaffected',
  openEarnedValue: 'unaffected',
  openResourceHistogram: 'unaffected',
  openShare: 'unaffected',
  editPlan: 'unaffected',
  openShortcuts: 'unaffected',
  toggleResourceView: 'unaffected',
  toggleOverAllocation: 'unaffected',
  toggleLegend: 'unaffected',
  toggleMinimap: 'unaffected',
  setFilterQuery: 'unaffected',
  toggleFilterAttr: 'unaffected',
  setColourMode: 'unaffected',
  toggleBaselineOverlay: 'unaffected',
  toggleCompareOverlay: 'unaffected',
  toggleLevelledOverlay: 'unaffected',
  toggleIsolate: 'unaffected',
  setIsolateMode: 'unaffected',
  exportScheduleCsv: 'unaffected',
  exportDiagramPng: 'unaffected',
  exportDiagramPdf: 'unaffected',
  printDiagram: 'unaffected',
  dismissExportError: 'unaffected',
  exportInterchange: 'unaffected',
  dismissExportNotice: 'unaffected',
};
