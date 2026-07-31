export {
  DIMENSIONS,
  reachableValues,
  unreachableValues,
  type Dimension,
  type DimensionAssignment,
  type DimensionValue,
} from './dimensions.js';
export { PAIRWISE_RULES, isLegal, violatedRule, type PairwiseRule } from './constraints.js';
export { buildCoveringArray, type CoveringArray, type Pair } from './covering-array.js';
export { describe, pairwiseSuite, type PairwiseCase, type PairwiseSuite } from './cases.js';
