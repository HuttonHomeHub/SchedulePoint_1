import { readDeviceFacts, type DeviceFacts } from '../model/device';
import {
  judgeAbsolute,
  judgeRun,
  NothingToJudgeError,
  type AbsoluteJudgeResult,
  type JudgeResult,
  type PhaseTiming,
  type RunPair,
} from '../model/judge';
import { measureIdleInterval, refuseRun, type Refusal } from '../model/pacing';
import { isGated, type ScenarioDefinition, type ScenarioPreset } from '../model/scenarios';
import { buildDrawScene, framingFor, runDrawPhase, type DrawFraming } from '../scenes/canvas-draw';
import { runRevisionDiff } from '../scenes/revision-diff';

import { APP_VERSION } from '@/config/env';
import { resolveTsldPalette } from '@/features/tsld/render/palette';

/**
 * The measurement itself, in the operator's own browser.
 *
 * **This module is the epic's load-bearing decision made concrete: the run happens HERE, on the
 * machine a planner uses, and never on a server.** The API runs headless in Docker, where Canvas 2D
 * can come from a software rasteriser; `m0-conditions.md` records that container's own no-change
 * baseline moving from 0.56 pp to 1.85 pp at 1646, and 0.93 pp to 10.00 pp at 1920, between two
 * runs an hour apart against a 2.00 pp bar. An authoritative-looking number from the wrong machine
 * is worse than no number, because somebody acts on it.
 *
 * **It is also the module the panel must NOT import statically.** `@repo/seed/scale` is 68,641 B
 * gzip against a staff chunk of 4,619 B, and the painter comes with it. The panel reaches this
 * through `await import(...)`, which is a split point; F2 gates the entry chunk and is written to
 * stop the epic rather than be renegotiated.
 */

/** How long a run takes, and — crucially — whether it is long enough to be judged at all. */
export type RunSize = 'quick' | 'full';

/** Stands in where {@link refuseRun} demands a number it will not read. Never a measurement. */
const PLACEHOLDER_INTERVAL_MS = 16.7;

/**
 * The two sizes, and why the short one produces **no verdict**.
 *
 * A `quick` run is one repeat of forty frames. With a single repeat there is no run-to-run spread,
 * so the INDETERMINATE rule — the one thing standing between a noisy machine and a confident wrong
 * answer — is structurally unable to fire; and forty frames is barely above the floor a percentile
 * needs. A verdict from that is exactly the "authoritative-looking number" this epic exists to
 * refuse, so a quick run reports its figures and stops.
 *
 * That is not a limitation worked around. It is what makes the control safe to offer for a sanity
 * check, and it is what lets the flag-on journey drive the real path inside a Playwright timeout.
 */
export const RUN_SIZES: Record<RunSize, { frames: number; repeats: number; label: string }> = {
  quick: { frames: 40, repeats: 1, label: 'Quick check (about 5 seconds)' },
  full: { frames: 180, repeats: 3, label: 'Full measurement (about 25 seconds)' },
};

/** Everything a reader needs to know what machine and what picture a number came from. */
export interface RunContext {
  readonly scenarioId: string;
  readonly scenarioLabel: string;
  /** The registry's version at run time — what makes two stored readings comparable. */
  readonly scenarioVersion: number;
  readonly preset: ScenarioPreset;
  readonly size: RunSize;
  readonly frames: number;
  readonly repeats: number;
  readonly viewport: { width: number; height: number };
  readonly idleInterval: number;
  readonly device: DeviceFacts;
  readonly startedAt: string;
  /** The bundle's own version, baked in at build time — see `config/env.ts`. */
  readonly appVersion: string;
  /**
   * The window lost keyboard focus at some point during the run, without being hidden.
   *
   * **Recorded, not refused, and the distinction is the point.** `document.hidden` is about
   * VISIBILITY and is a refusal, because a backgrounded tab is throttled to roughly 1 Hz and
   * measures the throttle. A blur is about FOCUS: the window is still painting at full rate, but
   * something else took the keyboard — and possibly some of the GPU. Refusing on that would reject
   * a run because the operator alt-tabbed to read a message, which is most runs; ignoring it would
   * throw away the one fact that explains an otherwise inexplicable outlier.
   *
   * So it goes on the row, and a reader comparing two figures can see which of them was taken with
   * the operator's full attention.
   */
  readonly lostFocusDuringRun: boolean;
}

/**
 * Everything the server stores for one limb, carried beside the judged result rather than derived
 * from it.
 *
 * **The judged result is the wrong source and that is the reason this exists.** `JudgeResult`
 * holds means and deltas; the numbers they were computed from are gone by then, and a limb the
 * judge REFUSED has no judged result at all while still having perfectly good numbers worth
 * keeping. The server does not judge (spec D5), so what it needs is the input, not the answer.
 *
 * `limbKind` is carried rather than read off `result.kind` for that second reason: an unjudgeable
 * limb's result kind is `unjudgeable`, which says nothing about how its samples are shaped.
 */
export interface LimbRecording {
  readonly limbKind: 'difference' | 'absolute';
  /** What the scene CONTAINED. Pair with `counts` and a cull becomes legible (ADR-0066). */
  readonly activityCount: number;
  readonly edgeCount: number;
  /** Non-vacuity numerators AND denominators, counted inside the viewport. */
  readonly counts: Record<string, number>;
  /** The bars this limb was judged against — stored so changing a bar cannot reinterpret history. */
  readonly thresholds: Record<string, number | boolean | string>;
  readonly pairs?: readonly RunPair[];
  readonly runs?: readonly PhaseTiming[];
}

/** One limb's outcome — a scenario may report more than one (ADR-0026 §9 gates two scales). */
export interface LimbOutcome {
  readonly limbId: string;
  readonly limbLabel: string;
  readonly sceneSummary: string;
  readonly pxPerDay: number;
  readonly visibleBars: number;
  readonly minFps: number;
  readonly source: string;
  /** What a recording POSTs. Absent from the report, which is prose for a person. */
  readonly recording: LimbRecording;
  readonly result:
    | { readonly kind: 'difference'; readonly judged: JudgeResult }
    | { readonly kind: 'absolute'; readonly judged: AbsoluteJudgeResult }
    /** The judge refused. **Not a FAIL** — see {@link NothingToJudgeError}. */
    | { readonly kind: 'unjudgeable'; readonly message: string };
}

export type ProbeOutcome =
  /** The run itself was invalid, so nothing was measured. See {@link refuseRun}. */
  | { readonly kind: 'refused'; readonly refusal: Refusal; readonly context: RunContext | null }
  | { readonly kind: 'measured'; readonly context: RunContext; readonly limbs: LimbOutcome[] };

export interface ProbeRunInput {
  readonly scenario: ScenarioDefinition;
  readonly preset: ScenarioPreset;
  readonly size: RunSize;
  readonly canvas: HTMLCanvasElement;
  /**
   * The element the palette is resolved from — the panel's `<Surface tone="canvas">`.
   *
   * **Required, never defaulted**, which is ADR-0102's finding turned into a compiler obligation:
   * `resolveTsldPalette` reading `document.documentElement` gives the PAGE's inks on a ground that
   * is not the page, and it does so silently. The colours barely move a paint timing, but a probe
   * that measures a picture the product never draws is the exact failure mode this epic is about.
   */
  readonly surfaceRoot: Element;
  readonly onProgress: (message: string) => void;
}

/**
 * Run a scenario and return either a refusal or a measurement.
 *
 * **It never throws for an ordinary bad run.** A hidden tab, a throttled clock, a missing 2D
 * context and a canvas that drew nothing are all *expected* on somebody's laptop, and each has a
 * sentence the operator can act on. Throwing would collapse them into "something went wrong", which
 * is the least useful thing this panel could say.
 */
export async function runProbe(input: ProbeRunInput): Promise<ProbeOutcome> {
  const { scenario, preset, size, canvas, surfaceRoot, onProgress } = input;
  const { frames, repeats } = RUN_SIZES[size];

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      kind: 'refused',
      // `refuseRun` checks the context FIRST and never reads the other fields on this path — they
      // are plausible placeholders, not measurements, and there is nothing to measure without a
      // context. The non-null assertion is safe for the same reason: `hasContext: false` always
      // returns a refusal.
      refusal: refuseRun({
        documentHidden: false,
        idleInterval: PLACEHOLDER_INTERVAL_MS,
        frameCount: frames,
        hasContext: false,
      })!,
      context: null,
    };
  }

  const viewport = { width: canvas.width, height: canvas.height };
  const palette = resolveTsldPalette(surfaceRoot);

  // Watch for the tab leaving the foreground AT ANY POINT, not just at the end. A backgrounded tab
  // throttles rAF to roughly 1 Hz and then reports a beautifully consistent interval — a reading
  // that looks more stable than a real one, which is why this is watched rather than sampled.
  let wentHidden = document.hidden;
  const onVisibility = (): void => {
    if (document.hidden) wentHidden = true;
  };
  document.addEventListener('visibilitychange', onVisibility);

  // Focus is a SEPARATE fact from visibility — see `RunContext.lostFocusDuringRun`. This one is
  // recorded and never refused.
  let lostFocus = false;
  const onBlur = (): void => {
    lostFocus = true;
  };
  window.addEventListener('blur', onBlur);

  try {
    onProgress('Measuring this display’s frame rate…');
    const idleInterval = await measureIdleInterval(60);

    const context: RunContext = {
      scenarioId: scenario.id,
      scenarioLabel: scenario.label,
      scenarioVersion: scenario.version,
      preset,
      size,
      frames,
      repeats,
      viewport,
      idleInterval,
      device: readDeviceFacts(),
      startedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      // Read after the run, below — this is the value at the moment the context is built and is
      // replaced when the phases finish.
      lostFocusDuringRun: false,
    };

    // A quick run is reported, never gated — one repeat has no spread, so the INDETERMINATE rule
    // cannot fire and a verdict from it would be exactly the confident wrong answer this refuses.
    const gated = size === 'full' && isGated(scenario, preset);

    // **One options object, not a positional list**, and that is a correction rather than a style
    // preference: the first version of this file took ten positional parameters and passed a
    // literal `16.7` where the measured display interval belonged. The compiler accepted it — both
    // slots are `number` — and the resulting run would have scored a 120 Hz machine as dropping
    // half its frames, which is the exact defect `measureIdleInterval` exists to prevent.
    const phase = {
      ctx,
      viewport,
      palette,
      scenario,
      preset,
      frames,
      repeats,
      idleInterval,
      gated,
      onProgress,
    };
    const limbs =
      scenario.id === 'revision-diff'
        ? await runDifferenceLimbs(phase)
        : await runAbsoluteLimbs(phase);

    const recorded = frames * repeats;
    const refusal = refuseRun({
      documentHidden: wentHidden || document.hidden,
      idleInterval,
      frameCount: recorded,
      hasContext: true,
    });
    const settled: RunContext = { ...context, lostFocusDuringRun: lostFocus };
    if (refusal) return { kind: 'refused', refusal, context: settled };

    return { kind: 'measured', context: settled, limbs };
  } finally {
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('blur', onBlur);
  }
}

/**
 * What both limb runners need.
 *
 * **One object rather than ten positional parameters**, because the first draft of this file was
 * the latter and put a literal `16.7` in the slot the measured display interval belonged in. Every
 * one of those parameters is a `number`, a `string` or a function, so the compiler had nothing to
 * say — and the resulting reading would have scored a 120 Hz machine as dropping half its frames.
 * A named field cannot be given to the wrong argument.
 */
interface PhaseInput {
  readonly ctx: CanvasRenderingContext2D;
  readonly viewport: { width: number; height: number };
  readonly palette: ReturnType<typeof resolveTsldPalette>;
  readonly scenario: ScenarioDefinition;
  readonly preset: ScenarioPreset;
  readonly frames: number;
  /** Repeats for an absolute scenario; PAIRS for a difference one — the same count, two names. */
  readonly repeats: number;
  /** The DISPLAY's own frame interval, measured. Never a constant — see the note above. */
  readonly idleInterval: number;
  readonly gated: boolean;
  readonly onProgress: (message: string) => void;
}

/** `revision-diff` — a paired question, so each repeat is a baseline and a treatment back to back. */
async function runDifferenceLimbs(phase: PhaseInput): Promise<LimbOutcome[]> {
  const { ctx, viewport, palette, scenario, preset, frames, gated, onProgress } = phase;
  const pairs = phase.repeats;
  const limb = scenario.limbs[0];
  if (!limb) return [];

  onProgress(`Drawing ${String(limb.activities)} activities, ${String(pairs)} paired runs…`);
  const outcome = await runRevisionDiff(ctx, viewport, palette, {
    scene: 'scale',
    preset,
    frames,
    pairs,
  });

  return [
    {
      limbId: limb.id,
      limbLabel: `${String(limb.activities)} activities`,
      sceneSummary: outcome.sceneSummary,
      pxPerDay: outcome.pxPerDay,
      visibleBars: outcome.counts.visibleBars,
      minFps: limb.minFps,
      source: limb.source,
      recording: {
        limbKind: 'difference',
        activityCount: outcome.activities,
        edgeCount: outcome.edges,
        counts: { ...outcome.counts },
        thresholds: {
          minFps: limb.minFps,
          gated,
          source: limb.source,
          barPp: scenario.barPp,
        },
        pairs: outcome.pairs,
      },
      result: judgeOrExplain(() => ({
        kind: 'difference' as const,
        judged: judgeRun({
          pairs: outcome.pairs,
          counts: outcome.counts,
          barPp: scenario.barPp,
          minFps: limb.minFps,
          gated,
        }),
      })),
    },
  ];
}

/** `canvas-draw` — an absolute question at each of ADR-0026 §9's two scales. */
async function runAbsoluteLimbs(phase: PhaseInput): Promise<LimbOutcome[]> {
  const {
    ctx,
    viewport,
    palette,
    scenario,
    preset,
    frames,
    repeats,
    idleInterval,
    gated,
    onProgress,
  } = phase;
  const limbs: LimbOutcome[] = [];

  for (const limb of scenario.limbs) {
    const scene = buildDrawScene(limb.activities);
    const framing: DrawFraming = framingFor(scene, preset, viewport);
    const runs: PhaseTiming[] = [];

    for (let i = 0; i < repeats; i += 1) {
      onProgress(
        `Drawing ${String(limb.activities)} activities — run ${String(i + 1)} of ${String(repeats)}…`,
      );
      runs.push(await runDrawPhase(ctx, scene, framing, viewport, palette, frames, idleInterval));
    }

    limbs.push({
      limbId: limb.id,
      limbLabel: `${String(limb.activities)} activities`,
      sceneSummary: scene.summary,
      pxPerDay: framing.pxPerDay,
      visibleBars: framing.visibleBars,
      minFps: limb.minFps,
      source: limb.source,
      recording: {
        limbKind: 'absolute',
        activityCount: scene.totalActivities,
        edgeCount: scene.totalEdges,
        counts: { visibleBars: framing.visibleBars },
        thresholds: {
          minFps: limb.minFps,
          gated,
          source: limb.source,
          minVisibleBars: framing.minVisibleBars,
        },
        runs,
      },
      result: judgeOrExplain(() => ({
        kind: 'absolute' as const,
        judged: judgeAbsolute({
          runs,
          visibleBars: framing.visibleBars,
          minVisibleBars: framing.minVisibleBars,
          minFps: limb.minFps,
          gated,
        }),
      })),
    });
  }

  return limbs;
}

/**
 * Turn the judge's refusal into a reportable outcome rather than an exception.
 *
 * The judge throws deliberately — a caller that cannot tell "this is bad" from "this proves
 * nothing" will report the first. Here that distinction is preserved as a **third result kind**,
 * so the panel can render the explanation without any pass/fail wording near it.
 */
function judgeOrExplain(judge: () => LimbOutcome['result']): LimbOutcome['result'] {
  try {
    return judge();
  } catch (error) {
    if (error instanceof NothingToJudgeError) {
      return { kind: 'unjudgeable', message: error.message };
    }
    throw error;
  }
}
