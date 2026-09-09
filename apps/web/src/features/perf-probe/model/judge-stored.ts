import type { ProbeResultRow } from '../api/probe-results';

import {
  judgeAbsolute,
  judgeRun,
  NothingToJudgeError,
  type AbsoluteJudgeResult,
  type JudgeResult,
  type PhaseTiming,
  type RunPair,
  type Verdict,
} from './judge';
import { verdictLabel, verdictNote } from './verdict-copy';

/**
 * The verdict for a **stored** reading, derived on read by the one shared judge.
 *
 * **This is the other half of the decision that gives `perf_probe_results` no `verdict` column.**
 * ADR-0128 D5 says the server stores samples and the thresholds they were measured against and does
 * not judge, so that changing a bar cannot reinterpret history and the rule keeps one home — and
 * then nothing called the judge on a stored row, so the history table showed no verdict at all. The
 * approved spec's US-3 names the verdict as the first thing a history row must carry, and the M5 ux
 * review found it missing. The table's own docblock argued against a strawman while it was: calling
 * the shared judge on read is not a second copy of the rule, it IS the rule, applied where the row
 * is read rather than where it was written.
 *
 * `null` when the row cannot be read at all — a shape this bundle does not recognise, which is
 * reachable because a newer web release can store a scenario an older one does not know (the same
 * skew argument that keeps `scenario_id` shape-checked rather than value-checked). An unreadable row
 * renders as unreadable, never as a failure.
 */
/** The judged shape, mirroring a live limb's `result` union so one formatter serves both. */
export type StoredJudged =
  | { readonly kind: 'difference'; readonly judged: JudgeResult }
  | { readonly kind: 'absolute'; readonly judged: AbsoluteJudgeResult }
  | { readonly kind: 'unjudgeable'; readonly message: string };

export interface StoredVerdict {
  readonly verdict: Verdict;
  readonly label: string;
  /** The sentence that goes with it, where a verdict alone would mislead. */
  readonly note: string | null;
}

/**
 * The **full** judged shape for a stored row, in the same union a live limb carries.
 *
 * Extracted from {@link judgeStoredRow} rather than written beside it, because the copied block
 * prints the figures and the table cell prints only the verdict — and two derivations of one
 * judgement drift invisibly, each looking right alone (the ADR-0065 `routeOrthogonal` argument, and
 * ADR-0121's `stackSeries`). So there is one call to the judge and two views of its answer.
 *
 * `null` when the row is a shape this bundle cannot read at all; `unjudgeable` when the judge
 * REFUSED, which is a fact about the reading rather than an error to swallow.
 */
export function storedJudgedResult(row: ProbeResultRow): StoredJudged | null {
  const thresholds = row.thresholds;
  const minFps = numberAt(thresholds, 'minFps');
  const gated = thresholds.gated === true;
  if (minFps === null) return null;

  try {
    const judged =
      row.limbKind === 'difference'
        ? judgeRun({
            pairs: row.samples as readonly RunPair[],
            counts: {
              visibleChangedBars: numberAt(row.counts, 'visibleChangedBars') ?? 0,
              visibleBars: numberAt(row.counts, 'visibleBars') ?? 0,
              visibleChangedLinks: numberAt(row.counts, 'visibleChangedLinks') ?? 0,
              visibleLinks: numberAt(row.counts, 'visibleLinks') ?? 0,
            },
            barPp: numberAt(thresholds, 'barPp') ?? 0,
            minFps,
            gated,
          })
        : judgeAbsolute({
            runs: row.samples as readonly PhaseTiming[],
            visibleBars: numberAt(row.counts, 'visibleBars') ?? 0,
            minVisibleBars: numberAt(thresholds, 'minVisibleBars') ?? 0,
            minFps,
            gated,
          });

    return row.limbKind === 'difference'
      ? { kind: 'difference', judged: judged as JudgeResult }
      : { kind: 'absolute', judged: judged as AbsoluteJudgeResult };
  } catch (error) {
    // The judge refusing is a fact about the reading, not an error to swallow — it is why the
    // fourth verdict value exists. Anything else is a shape this bundle cannot read, and is
    // reported as unreadable rather than dressed as a result.
    if (error instanceof NothingToJudgeError) {
      return { kind: 'unjudgeable', message: firstLine(error.message) };
    }
    return null;
  }
}

export function judgeStoredRow(row: ProbeResultRow): StoredVerdict | null {
  const result = storedJudgedResult(row);
  if (result === null) return null;

  if (result.kind === 'unjudgeable') {
    return { verdict: 'INDETERMINATE', label: 'CANNOT BE JUDGED', note: result.message };
  }

  const judged = result.judged;
  return {
    verdict: judged.verdict,
    label: verdictLabel(judged.verdict),
    note: verdictNote(judged.verdict, {
      gated: row.thresholds.gated === true,
      repeats: row.samples.length,
      indeterminateReason: judged.indeterminateReason,
      // Only a difference run has a ceiling to hit. `judgeAbsolute` returns no `saturated`, so
      // this is `undefined` there rather than `false` — "not a difference run" and "measured and
      // fine" are different facts, and the optional field keeps them apart.
      saturated: 'saturated' in judged ? judged.saturated : undefined,
    }),
  };
}

function numberAt(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function firstLine(message: string): string {
  return (message.split('\n')[0] ?? message).replace(/^[A-Z -]+—\s*/, '');
}
