import type { ProbeResultRow } from '../api/probe-results';

import {
  judgeAbsolute,
  judgeRun,
  NothingToJudgeError,
  type AbsoluteJudgeResult,
  type JudgeResult,
  type PhaseTiming,
  type RunPair,
} from './judge';

/**
 * The verdict for a **stored** reading, derived on read by the one shared judge.
 *
 * **This is the other half of the decision that gives `perf_probe_results` no `verdict` column.**
 * ADR-0128 D5 says the server stores samples and the thresholds they were measured against and does
 * not judge, so that changing a bar cannot reinterpret history and the rule keeps one home — and
 * then nothing called the judge on a stored row, so the history showed no verdict at all. The
 * approved spec's US-3 names the verdict as the first thing a history row must carry, and the M5 ux
 * review found it missing. Calling the shared judge on read is not a second copy of the rule, it IS
 * the rule, applied where the row is read rather than where it was written.
 *
 * `null` when the row cannot be read at all — a shape this bundle does not recognise, which is
 * reachable because a newer web release can store a scenario an older one does not know (the same
 * skew argument that keeps `scenario_id` shape-checked rather than value-checked). An unreadable row
 * renders as unreadable, never as a failure.
 *
 * **There is ONE exported derivation here, and there used to be two.** `judgeStoredRow` returned a
 * flattened `{ verdict, label, note }` for the flat history table's cell; M6 replaced that table
 * with `probe-sittings.tsx`, whose `VerdictCell` reads this union directly — and the flattened
 * version was left behind with **only its own test as a caller**, while
 * `saturation-renderers.test.ts` went on enumerating this file as a renderer that must pass
 * `saturated`. A renderer that renders nothing, still counted as covered: ADR-0093's shape inside
 * the gate written to prevent it. Found by the M7 component review, not by anything failing. It had
 * also already drifted — it labelled an unreadable row `CANNOT BE JUDGED` where the live cell says
 * `Not readable by this version`, which is the two-wordings divergence dead code exists to hide.
 */
/** The judged shape, mirroring a live limb's `result` union so one formatter serves both. */
export type StoredJudged =
  | { readonly kind: 'difference'; readonly judged: JudgeResult }
  | { readonly kind: 'absolute'; readonly judged: AbsoluteJudgeResult }
  | { readonly kind: 'unjudgeable'; readonly message: string };

/**
 * The **full** judged shape for a stored row, in the same union a live limb carries.
 *
 * **One call to the judge, and every view reads its answer.** The copied block prints the figures
 * and the table cell prints only the verdict; two derivations of one judgement drift invisibly,
 * each looking right alone (the ADR-0065 `routeOrthogonal` argument, and ADR-0121's `stackSeries`).
 * That is exactly what the deleted `judgeStoredRow` had started to do.
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
            // From the stored row, so a reading re-judged from history gets the same ceiling rule
            // as the run that produced it (`docs/TECH_DEBT.md` #275). NOT `?? 0` like its
            // neighbours: zero is a plausible-looking number that would make the ceiling infinite
            // and silently disable the rule, where `NaN` is the honest "this row records no usable
            // interval" the judge is written to skip on. `idleIntervalMs` is non-nullable on the
            // API row, so this coalesce is defence against an older shape rather than an expected
            // path.
            idleInterval: row.idleIntervalMs ?? Number.NaN,
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

function numberAt(source: Record<string, unknown>, key: string): number | null {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function firstLine(message: string): string {
  return (message.split('\n')[0] ?? message).replace(/^[A-Z -]+—\s*/, '');
}
