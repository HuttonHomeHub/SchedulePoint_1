import type { ActivitySummary } from '@repo/types';

/**
 * What a surface that files activities under a summary reports to a host that records it for undo
 * (undo-redo M3): the rows as they were before the batch, the rows the batch returned, and — when the
 * surface knows better than the host what to call the step — a label.
 *
 * One call per batch, never per row: the endpoint is all-or-nothing on versions, and the history treats
 * it as one step.
 */
export type OnReparented = (
  before: readonly ActivitySummary[],
  after: readonly ActivitySummary[],
  label?: string,
) => void;
