/**
 * **Moved to `@/features/plan-actions/selection-actions` — this file is a re-export.**
 *
 * The plan's object-action registry is view-agnostic by decision (ADR-0093: an action whose subject
 * is the selected object belongs on the object's surface), and its only canvas-specific part is
 * already isolated behind `canvas: SelectionCanvasContext | null`. Leaving it inside one view's
 * feature folder meant the workspace and the Gantt would depend on `features/tsld` for the plan's
 * object actions, and the next Gantt-only action would be added to a TSLD file by whoever was
 * nearest. The leak ran the opposite way to the obvious one: the view-agnostic thing was stranded
 * inside a view.
 *
 * Re-exported rather than rewritten at every call site (ADR-0078's barrel-preserving move), so no
 * suite's imports change and the existing tests are the before/after oracle. The move is a rename
 * while the diff is a move; after M1 it would be a refactor.
 */
export * from '@/features/plan-actions/selection-actions';
