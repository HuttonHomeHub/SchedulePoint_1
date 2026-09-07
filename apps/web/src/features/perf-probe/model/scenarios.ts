import { MAX_DROPPED_DELTA_PP, MIN_FPS } from './judge';

/**
 * The named measurements this probe can take, and the bars each is judged against.
 *
 * **One registry, consumed by both the browser panel and the CLI driver** — the second half of M1's
 * "extract, never fork". The judge already refuses to be duplicated; this stops the *questions*
 * being duplicated too, which is the subtler drift: two callers can agree perfectly on how to judge
 * a number and disagree about which number they took.
 *
 * ## The scene is NOT imported here, and that is F2
 *
 * `@repo/seed/scale` is browser-safe (verified, M0-T3) and costs **68,641 B gzip** — against a staff
 * chunk that is currently **4,619 B**. A static import in this module would pull that into whatever
 * chunk reaches the registry, and the registry is reached by the panel's route.
 *
 * So a scenario carries a **loader**, never a scene: `() => import(...)` is a split point, and the
 * 68 kB is fetched when somebody actually presses Run. F2 gates the entry chunk at 397,471 B gzip
 * and is written to stop the epic rather than be renegotiated — this is the mechanism that keeps it
 * satisfied, and it is why the metadata below is deliberately free of anything heavy.
 */
export type ScenarioId = 'revision-diff' | 'canvas-draw';

/** Which framing the scene is measured at. Named rather than a number, because the two ask different questions. */
export type ScenarioPreset = 'week' | 'fit';

export interface ScenarioDefinition {
  readonly id: ScenarioId;
  /** What an operator sees in the picker. */
  readonly label: string;
  /** One sentence: what this measurement answers, in the terms the decision is made in. */
  readonly question: string;
  /** P1 — the largest dropped-frame difference that still counts as no cost, in percentage points. */
  readonly barPp: number;
  /** P2 — the absolute floor the treatment must hold. */
  readonly minFps: number;
  /**
   * Whether a verdict is produced at all.
   *
   * `false` means measured and **reported**, never gated — see {@link judgeRun}'s `gated`. A gate
   * that fails on day one gets deleted rather than fixed (ADR-0058), so a scenario whose baseline is
   * already known to be far outside the bar says so here rather than producing a FAIL nobody acts on.
   */
  readonly gated: boolean;
  /** Which decision this measurement feeds, so a reader can tell why it is worth taking. */
  readonly decision: string;
}

/**
 * The scenarios.
 *
 * **`canvas-draw` is not the revision overlay's sibling — it is the older, larger question.**
 * `docs/TECH_DEBT.md` #75 records that the canvas draw budget has exactly one real-hardware reading,
 * from 2026-08-03, and that five canvas epics have changed the painter since without re-deriving it.
 * Its real gate is **frames per second under sustained pan**, not a paint duration: at Fit the
 * measured p95 sat comfortably inside a 16.7 ms frame while 10.2 % of frames were still dropped, so
 * a duration budget was the wrong *quantity* rather than the wrong number.
 */
export const SCENARIOS: readonly ScenarioDefinition[] = [
  {
    id: 'revision-diff',
    label: 'Revision compare overlay',
    question: 'Does drawing the difference between two revisions cost the diagram its smoothness?',
    barPp: MAX_DROPPED_DELTA_PP,
    minFps: MIN_FPS,
    gated: true,
    decision:
      'Whether `View ▾ ▸ Compare on diagram` can be default-on. It ships off because this is ' +
      'unanswered, not because it was judged too expensive.',
  },
  {
    id: 'canvas-draw',
    label: 'Canvas draw budget',
    question: 'Does the shipped painter hold its frame rate under sustained pan?',
    barPp: MAX_DROPPED_DELTA_PP,
    minFps: MIN_FPS,
    // Reported, not gated, at the whole-plan framing — see the type's docblock and #75.
    gated: true,
    decision:
      'ADR-0026 §9, and `docs/TECH_DEBT.md` #75, whose single real-hardware reading is from ' +
      '2026-08-03 and predates five canvas epics.',
  },
];

export function scenarioById(id: ScenarioId): ScenarioDefinition {
  const found = SCENARIOS.find((s) => s.id === id);
  if (!found) {
    // Unreachable through the type, and thrown anyway: `ScenarioId` is a compile-time promise, and a
    // value crossing a wire (a stored row's id, a URL) has not been type-checked by anything.
    throw new Error(`Unknown scenario "${String(id)}".`);
  }
  return found;
}

/**
 * Whether a run at this preset produces a verdict.
 *
 * **The `fit` framing is never gated, for any scenario.** The shipped painter already drops ~10 % of
 * frames there on real hardware with no treatment at all, so a gate would fail on day one — and this
 * was the CLI's own rule, expressed inline as `preset !== 'fit'`. Naming it here means the panel
 * cannot reach a different conclusion from the CLI about the same run.
 */
export function isGated(scenario: ScenarioDefinition, preset: ScenarioPreset): boolean {
  return scenario.gated && preset !== 'fit';
}
