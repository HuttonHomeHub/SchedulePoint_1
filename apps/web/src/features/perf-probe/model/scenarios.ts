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

/**
 * One measured scale within a scenario, with the floor that applies AT that scale.
 *
 * **A scenario needs more than one floor, and M1's single `minFps` could not express that.** ADR-0026
 * §9's gate is not one number: Canvas 2D passes if it sustains **≥ 45 fps at 500 activities and
 * ≥ 30 fps at 2,000** under sustained pan/zoom/drag. Writing one `minFps: 30` per scenario silently
 * judged the 500-activity case against the 2,000-activity floor — a third easier than the gate
 * actually is, which would have reported a pass the ADR does not grant. Found by reading §9 rather
 * than by anything failing.
 */
export interface ScenarioLimb {
  readonly id: string;
  /** How many activities the scene is built at. */
  readonly activities: number;
  /** P2 at THIS scale. */
  readonly minFps: number;
  /** Where the floor comes from, so a reader can check it rather than trust it. */
  readonly source: string;
}

export interface ScenarioDefinition {
  readonly id: ScenarioId;
  /** What an operator sees in the picker. */
  readonly label: string;
  /** One sentence: what this measurement answers, in the terms the decision is made in. */
  readonly question: string;
  /**
   * Bumped when the **scene or the protocol** changes, so a reader knows two stored rows measured
   * the same thing.
   *
   * The rule is written here because a version nobody owns bumping is decoration: a scene that
   * changed without a bump makes two incomparable readings look comparable, which is the single
   * failure `perf_probe_results` exists to prevent. Changing a THRESHOLD is not a bump — thresholds
   * are stored on the row beside the numbers, so a reading stays judgeable against the bar it was
   * actually taken under. Changing what is drawn, how many frames are measured, or how a phase is
   * paced IS one.
   */
  readonly version: number;
  /** P1 — the largest dropped-frame difference that still counts as no cost, in percentage points. */
  readonly barPp: number;
  /**
   * The scales this scenario is measured at, each with its own floor.
   *
   * One limb is normal; two is what ADR-0026 §9 requires of the draw budget. Ordered smallest
   * first, and **the first limb is what a single-limb caller gets** — which is how the existing CLI
   * keeps behaving exactly as it did.
   */
  readonly limbs: readonly ScenarioLimb[];
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
    version: 1,
    barPp: MAX_DROPPED_DELTA_PP,
    // One limb: this scenario asks a DIFFERENCE question (does the overlay cost anything?), and the
    // difference is measured at one scale. The absolute floor is the 2,000-activity one because that
    // is the ceiling ADR-0026 states, and it is the floor the existing CLI has always applied.
    limbs: [
      {
        id: 'scale-2000',
        activities: 2000,
        minFps: MIN_FPS,
        source: 'ADR-0026 §9 — ≥ 30 fps at the 2,000-activity ceiling.',
      },
    ],
    gated: true,
    decision:
      'Whether `View ▾ ▸ Compare on diagram` can be default-on. ANSWERED 2026-09-08 on the product ' +
      "owner's own machine — delta -0.19 pp against a 2.00 pp bar at 60.0 fps, so the overlay costs " +
      'nothing detectable at the working zoom, and they turned it on (ADR-0127 D8b). The scenario ' +
      'stays: it is now the regression guard for that default rather than the question behind it.',
  },
  {
    id: 'canvas-draw',
    label: 'Canvas draw budget',
    question: 'Does the shipped painter hold its frame rate under sustained pan?',
    version: 1,
    barPp: MAX_DROPPED_DELTA_PP,
    /**
     * **Both limbs of ADR-0026 §9's gate, and the 500 one has never been measured.**
     *
     * `docs/TECH_DEBT.md` #75's own closing sentence named it: "the genuinely open residue is the
     * 500-activity limb and the unattributed ~8 ms at Fit". Every reading that row carried was at
     * 2,000, so the easier half of the gate — the one a planner's ordinary plan actually sits at —
     * had been asserted and never checked.
     *
     * **Measured 2026-09-08, on the first run of this panel that asked**: 59.8 fps at Week and
     * 57.2 at Fit, both against the 45 fps floor. The limb stays, because a floor nothing checks is
     * how it went unmeasured for a year in the first place — but its `source` no longer claims it
     * never has been. #75 item 5 carries the numbers.
     */
    limbs: [
      {
        id: 'scale-500',
        activities: 500,
        minFps: 45,
        source: 'ADR-0026 §9 — ≥ 45 fps at 500 activities.',
      },
      {
        id: 'scale-2000',
        activities: 2000,
        minFps: MIN_FPS,
        source: 'ADR-0026 §9 — ≥ 30 fps at the 2,000-activity ceiling.',
      },
    ],
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
