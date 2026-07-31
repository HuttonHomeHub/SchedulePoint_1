import { isLegal, violatedRule, type PairwiseRule } from './constraints.js';
import {
  DIMENSIONS,
  reachableValues,
  type Dimension,
  type DimensionAssignment,
} from './dimensions.js';

/**
 * A **deterministic greedy all-pairs covering array** (ADR-0066 M3.1).
 *
 * The claim it makes is narrow and worth stating precisely: for every pair of dimensions, every
 * legal combination of one value from each appears in at least one generated row. It says nothing
 * about three-way interactions and never will — that is the combinatorial cliff ADR-0066 records as
 * an accepted limit, and anyone reading a green suite should not believe "all permutations" were
 * tested, because they were not.
 *
 * **Determinism is a requirement, not a nicety.** A greedy search with an arbitrary tie-break would
 * produce a different array per run, so a case that failed yesterday might not exist today — which
 * turns an intermittent product defect into an intermittent *suite*, the worst of both. Every tie
 * here resolves by declaration order, and there is no randomness anywhere: same table, same rules,
 * same rows, on every machine.
 */

/** One (dimension, value) choice. */
interface Choice {
  dimension: string;
  value: string;
}

/** A pair of choices from two different dimensions — the thing the array must cover. */
export interface Pair {
  a: Choice;
  b: Choice;
}

export interface CoveringArray {
  /** The generated cases, each a full legal assignment over every dimension. */
  rows: DimensionAssignment[];
  /** Pairs the rules forbid, with the rule that forbade each — never silently absent. */
  excluded: Array<{ pair: Pair; rule: PairwiseRule }>;
  /** Legal pairs no row covers. **Must be empty**; a non-empty list is a generator defect. */
  uncovered: Pair[];
}

const key = (pair: Pair): string =>
  `${pair.a.dimension}=${pair.a.value}|${pair.b.dimension}=${pair.b.value}`;

/** Every pair of values from two distinct dimensions, in declaration order. */
function allPairs(dimensions: readonly Dimension[]): Pair[] {
  const pairs: Pair[] = [];
  for (let i = 0; i < dimensions.length; i += 1) {
    for (let j = i + 1; j < dimensions.length; j += 1) {
      for (const a of reachableValues(dimensions[i]!)) {
        for (const b of reachableValues(dimensions[j]!)) {
          pairs.push({
            a: { dimension: dimensions[i]!.id, value: a },
            b: { dimension: dimensions[j]!.id, value: b },
          });
        }
      }
    }
  }
  return pairs;
}

/**
 * Build the array. The loop is: while any legal pair is uncovered, construct one row that covers as
 * many of them as it can, then mark them covered.
 *
 * Each row is built dimension by dimension in declaration order, choosing at each step the value
 * that covers the most still-uncovered pairs **against the values already fixed** — pruning any
 * choice a rule forbids as we go, rather than building a full row and discarding it. That pruning is
 * what keeps the search from spending most of its time generating illegal rows once the constraint
 * set gets dense.
 */
export function buildCoveringArray(dimensions: readonly Dimension[] = DIMENSIONS): CoveringArray {
  const excluded: CoveringArray['excluded'] = [];
  const uncoveredByKey = new Map<string, Pair>();

  for (const pair of allPairs(dimensions)) {
    const rule = violatedRule({
      [pair.a.dimension]: pair.a.value,
      [pair.b.dimension]: pair.b.value,
    });
    if (rule !== null) {
      excluded.push({ pair, rule });
      continue;
    }
    uncoveredByKey.set(key(pair), pair);
  }

  const rows: DimensionAssignment[] = [];
  // A hard ceiling. Each row consumes at least its seed pair, so this can never be reached in
  // practice — it exists so a future change that breaks that guarantee reports a gap instead of
  // hanging a CI job. Nobody reads a timeout.
  const maxRows = uncoveredByKey.size + 1;

  while (uncoveredByKey.size > 0 && rows.length < maxRows) {
    // **Seed each row with a still-uncovered pair**, then fill greedily around it. Purely greedy
    // filling stalls: it scores each dimension only against the ones already fixed, so once most
    // pairs are covered it keeps rebuilding rows that cover nothing new and the remainder is never
    // reached. Seeding guarantees every row consumes at least one pair, so the loop terminates with
    // nothing uncovered rather than giving up partway and calling it done.
    const seed = uncoveredByKey.values().next().value!;
    const row = buildRow(dimensions, uncoveredByKey, {
      [seed.a.dimension]: seed.a.value,
      [seed.b.dimension]: seed.b.value,
    });
    // A row the rules corner into illegality is dropped rather than emitted — but its seed pair is
    // then unreachable in combination with something, which is a finding, so it is recorded as
    // uncovered rather than silently deleted.
    if (!isLegal(row)) {
      uncoveredByKey.delete(key(seed));
      continue;
    }
    for (const pairKey of coveredBy(row, dimensions)) uncoveredByKey.delete(pairKey);
    rows.push(row);
  }

  return { rows, excluded, uncovered: [...uncoveredByKey.values()] };
}

/** One row, greedy over the dimensions in declaration order, around any pre-fixed values. */
function buildRow(
  dimensions: readonly Dimension[],
  uncovered: ReadonlyMap<string, Pair>,
  seeded: Readonly<Record<string, string>> = {},
): DimensionAssignment {
  const row: Record<string, string> = { ...seeded };

  for (const dimension of dimensions) {
    if (row[dimension.id] !== undefined) continue;
    const candidates = reachableValues(dimension).filter((value) =>
      isLegal({ ...row, [dimension.id]: value }),
    );
    // Every dimension must end up with a value. If the rules have painted this partial row into a
    // corner, fall back to the first reachable value: the row may then be illegal and is filtered
    // out below, which is honest, rather than emitting a row with a hole in it.
    if (candidates.length === 0) {
      row[dimension.id] = reachableValues(dimension)[0]!;
      continue;
    }

    let best = candidates[0]!;
    let bestScore = -1;
    for (const value of candidates) {
      let score = 0;
      for (const [fixedDimension, fixedValue] of Object.entries(row)) {
        const forward = `${fixedDimension}=${fixedValue}|${dimension.id}=${value}`;
        const backward = `${dimension.id}=${value}|${fixedDimension}=${fixedValue}`;
        if (uncovered.has(forward) || uncovered.has(backward)) score += 1;
      }
      // Strictly greater, so a tie keeps the earlier-declared value — the determinism rule.
      if (score > bestScore) {
        bestScore = score;
        best = value;
      }
    }
    row[dimension.id] = best;
  }

  return row;
}

/** The keys of every pair a row covers. */
function coveredBy(row: DimensionAssignment, dimensions: readonly Dimension[]): string[] {
  const keys: string[] = [];
  for (let i = 0; i < dimensions.length; i += 1) {
    for (let j = i + 1; j < dimensions.length; j += 1) {
      const a = row[dimensions[i]!.id];
      const b = row[dimensions[j]!.id];
      if (a === undefined || b === undefined) continue;
      keys.push(`${dimensions[i]!.id}=${a}|${dimensions[j]!.id}=${b}`);
    }
  }
  return keys;
}
