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
