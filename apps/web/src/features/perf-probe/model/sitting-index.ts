import type { Verdict } from './judge';
import { canvasLabelOf, machineLabelOf, type Sitting } from './sitting';

/**
 * What one row of the sittings index says.
 *
 * **Derived here rather than in the cell renderers**, for the reason ADR-0121 records costing an
 * epic: a rule that lives in a renderer is a rule the next renderer restates, and the two only
 * disagree for a reader who compares them. The index and the expanded block describe the same
 * sittings, so anything they both state is derived once.
 *
 * It is deliberately NOT a severity ranking. `VerdictCell` already settles that an INDETERMINATE or
 * an ungraded reading "is not bad news, and colouring it as though it were would be the confident
 * wrong answer" — so the index states a **tally** of what a sitting holds and lets the reader rank
 * it, rather than inventing a worst-verdict order this product has never had.
 */
export interface SittingIndexRow {
  readonly id: string;
  /** The sitting itself, so a row can hand it to the detail slot without a second lookup. */
  readonly sitting: Sitting;
  /** When the operator pressed the button — the sitting's earliest reading. */
  readonly when: string;
  /** "Sweep" or "One reading" — the ACT, which is what `sweep_id` records (see `Sitting.kind`). */
  readonly kind: string;
  /**
   * How many readings it holds, against how many a complete sweep produces.
   *
   * `null` for a single press, which has no expected count to fall short of. A sweep states both,
   * because "2" and "2 of 6" are different facts and the row count cannot distinguish them — the
   * same reason the expanded block carries its `partial` alert rather than letting a short table
   * imply a short sitting.
   */
  readonly readings: number;
  readonly expectedReadings: number | null;
  readonly machine: string;
  /**
   * The canvas every reading shares, or the words for "they differ".
   *
   * **On the index because of `docs/TECH_DEBT.md` #261/#283**: readings are only comparable at the
   * same canvas, and a reader asked to compare sittings cannot do it from a list that omits the one
   * fact deciding which are comparable. That is falsification condition FC-C of
   * `docs/specs/staff-console-design/m7-probe-history.md`, and it is why this column is not
   * negotiable when the row is shortened.
   */
  readonly canvas: string;
  /**
   * Verdict counts, highest-signal first. Empty entries are dropped, never rendered as zeroes.
   *
   * **Each entry carries its own tone**, so a row holding a failure paints the failing segment and
   * leaves "5 passed" alone. Painting the whole string was the first version and it broke this
   * file's own stated rule one function down: an INDETERMINATE or an ungraded reading "is not bad
   * news, and colouring it as though it were would be the confident wrong answer" — which is just
   * as true of a PASS sitting next to a FAIL. Found by the M7 ux review.
   */
  readonly verdicts: readonly {
    readonly label: string;
    readonly count: number;
    readonly failing: boolean;
  }[];
  /** Whether any reading in this sitting FAILED — the one state the row paints. */
  readonly hasFailure: boolean;
}

/**
 * The order verdicts are tallied in.
 *
 * Highest-signal first so a reader scanning the column meets a failure before a pass, which is a
 * statement about **reading order** and not about severity — the counts are all stated either way.
 * `unjudgeable` is last and named for what it is: a row this bundle cannot read, which is a fact
 * about the reader's build rather than about the measurement.
 */
const TALLY_ORDER: readonly Verdict[] = ['FAIL', 'INDETERMINATE', 'REPORTED_ONLY', 'PASS'];

/** Short enough for a table cell; `verdictLabel`'s "REPORTED, NOT GRADED" is a sentence. */
const SHORT_LABEL: Record<Verdict, string> = {
  FAIL: 'failed',
  INDETERMINATE: 'indeterminate',
  REPORTED_ONLY: 'ungraded',
  PASS: 'passed',
};

export function sittingIndexRow(sitting: Sitting, expectedReadings: number): SittingIndexRow {
  const c = sitting.context;
  const counts = new Map<string, number>();
  let unreadable = 0;

  for (const limb of sitting.limbs) {
    if (limb.result.kind === 'unjudgeable') {
      unreadable += 1;
      continue;
    }
    const verdict = limb.result.judged.verdict;
    counts.set(verdict, (counts.get(verdict) ?? 0) + 1);
  }

  const verdicts = [
    ...TALLY_ORDER.filter((v) => (counts.get(v) ?? 0) > 0).map((v) => ({
      label: SHORT_LABEL[v],
      count: counts.get(v) ?? 0,
      failing: v === 'FAIL',
    })),
    ...(unreadable > 0
      ? [{ label: 'not readable by this version', count: unreadable, failing: false }]
      : []),
  ];

  return {
    id: sitting.id,
    sitting,
    when: new Date(c.startedAt).toLocaleString(),
    kind: sitting.kind === 'sweep' ? 'Sweep' : 'One reading',
    readings: sitting.limbs.length,
    // A single press has no expected count — it is not a sweep that fell short of one.
    expectedReadings: sitting.kind === 'sweep' ? expectedReadings : null,
    // **The SAME functions the expanded block's facts call**, not a second copy of the fallback
    // chain. They were duplicated until the M7 review pointed out that this file's own docblock
    // cites ADR-0121 about exactly that — a rule restated by the next renderer, disagreeing only
    // for a reader who compares them.
    machine: machineLabelOf(c),
    canvas: canvasLabelOf(c),
    verdicts,
    hasFailure: (counts.get('FAIL') ?? 0) > 0,
  };
}

/**
 * How a tally reads in a cell, and in the accessible name of the control beside it.
 *
 * One function so the two cannot drift — the row's visible text and the button that opens it are
 * describing the same sitting, and a reader using both channels should not meet two descriptions.
 */
export function describeVerdicts(row: SittingIndexRow): string {
  if (row.verdicts.length === 0) return 'no readings';
  return row.verdicts.map(verdictSegment).join(' · ');
}

/** One segment of the tally, so the cell and the sentence cannot word it differently. */
export function verdictSegment(entry: SittingIndexRow['verdicts'][number]): string {
  return `${String(entry.count)} ${entry.label}`;
}

/**
 * The caveats that decide whether a sitting's numbers can be compared with anything.
 *
 * The Canvas column exists because `docs/TECH_DEBT.md` #261/#283 establish that readings are
 * comparable only at equal canvas — and canvas is not the only such confound the sitting already
 * knows about. A sitting whose readings span hours was taken across a reboot, a resize or a
 * release; one where a reading lost the window was measured while the browser was throttling it.
 * Both are stated on the expanded block and were reachable only by opening each sitting in turn,
 * which is the cost the index exists to remove. Raised by the M7 ux review.
 */
export function sittingCaveats(
  sitting: Sitting,
  spreadMs: number | null,
  limitMs: number,
): string[] {
  return [
    ...(spreadMs !== null && spreadMs > limitMs ? ['Spans time'] : []),
    ...(sitting.context.anyReadingLostFocus ? ['Lost focus'] : []),
  ];
}

/**
 * How many readings a row holds, stated against the expected count when there is one.
 *
 * **`null` for a single press whose count adds nothing, because the kind beside it already says
 * so.** The first version returned a count unconditionally, and a row then read
 * **"One reading — 2 readings"** — self-contradictory, and not on an edge case: `canvas-draw` is
 * the panel's default scenario and measures two scales in one press, so that shape is the likeliest
 * single press there is. The expanded block's `sittingCaption` never had the defect, because it
 * deliberately appends a count only for a sweep; the index reintroduced the conflation that caption
 * was written to avoid. Found by the M7 ux review.
 *
 * A single press of SEVERAL readings still states the number — that is a fact the kind does not
 * carry. What is dropped is the tautology.
 */
export function describeReadings(row: SittingIndexRow): string | null {
  if (row.expectedReadings !== null) {
    return `${String(row.readings)} of ${String(row.expectedReadings)}`;
  }
  return row.readings === 1 ? null : `${String(row.readings)} readings`;
}
