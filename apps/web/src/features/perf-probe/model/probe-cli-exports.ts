/**
 * The one module the CLI driver bundles.
 *
 * **A barrel with exactly one consumer, and it earns its keep**: `measure-revision-diff.mjs`
 * compiles this for Node with esbuild and `import()`s the result, so every symbol it needs has to
 * arrive from a single entry point. Without this the driver would bundle two files and the "one
 * judge, one registry" claim would depend on a script remembering to pull both.
 *
 * It re-exports and declares nothing of its own, so there is no logic here to drift.
 */
export {
  judgeRun,
  NothingToJudgeError,
  MAX_DROPPED_DELTA_PP,
  MIN_FPS,
  MIN_CHANGED_FRACTION,
  MIN_CHANGED_ABSOLUTE,
} from './judge';
export { SCENARIOS, scenarioById, isGated } from './scenarios';
// The saturation caveat, so the driver prints the SAME sentence as the three browser surfaces
// rather than a fourth wording of it. Found during M1-T2: the plan named three renderers of a
// delta and there are four — this file is not under `src/`, so the enumeration that catches a
// forgotten browser surface could not see it. The sweep is widened to reach here too.
export { SATURATED_CAVEAT } from './verdict-copy';
