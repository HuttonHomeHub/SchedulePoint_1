/** The spec's floor (P2, CQ-4): fewer repeats than this cannot say anything about spread. */
export const MIN_RUNS = 5;

export interface Summary {
  runs: number;
  values: number[];
  min: number;
  max: number;
  median: number;
  /** `max - min`, in the unit of the values. */
  range: number;
  /** `range / median` as a percentage — the figure to hold against P2's 5% and 10% thresholds. */
  spreadPct: number;
}

/**
 * Median and spread of a population. **Refuses an empty or short one** rather than returning a
 * number: a verdict over no samples reads as a measurement (the plan's M0-T5 testing clause).
 */
export function summarise(label: string, values: readonly number[]): Summary {
  if (values.length < MIN_RUNS) {
    throw new Error(`${label}: ${String(values.length)} runs, need at least ${String(MIN_RUNS)}`);
  }
  if (values.some((v) => !Number.isFinite(v))) {
    throw new Error(`${label}: a run produced a non-finite value`);
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? (sorted[mid] ?? NaN)
      : ((sorted[mid - 1] ?? NaN) + (sorted[mid] ?? NaN)) / 2;
  const min = sorted[0] ?? NaN;
  const max = sorted[sorted.length - 1] ?? NaN;
  return {
    runs: sorted.length,
    values: [...values],
    min,
    max,
    median,
    range: max - min,
    spreadPct: median > 0 ? ((max - min) / median) * 100 : NaN,
  };
}
