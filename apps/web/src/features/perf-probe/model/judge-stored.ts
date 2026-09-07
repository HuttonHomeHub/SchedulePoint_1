import type { ProbeResultRow } from '../api/probe-results';

import {
  judgeAbsolute,
  judgeRun,
  NothingToJudgeError,
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
export interface StoredVerdict {
  readonly verdict: Verdict;
  readonly label: string;
  /** The sentence that goes with it, where a verdict alone would mislead. */
  readonly note: string | null;
}

export function judgeStoredRow(row: ProbeResultRow): StoredVerdict | null {
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

    return {
      verdict: judged.verdict,
      label: verdictLabel(judged.verdict),
      note: verdictNote(judged.verdict, {
        gated,
        repeats: row.samples.length,
        indeterminateReason: judged.indeterminateReason,
      }),
    };
  } catch (error) {
    // The judge refusing is a fact about the reading, not an error to swallow — it is why the
    // fourth verdict value exists. Anything else is a shape this bundle cannot read, and is
    // reported as unreadable rather than dressed as a result.
    if (error instanceof NothingToJudgeError) {
      return {
        verdict: 'INDETERMINATE',
        label: 'CANNOT BE JUDGED',
        note: firstLine(error.message),
      };
    }
    return null;
  }
}

function numberAt(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function firstLine(message: string): string {
  return (message.split('\n')[0] ?? message).replace(/^[A-Z -]+—\s*/, '');
}
