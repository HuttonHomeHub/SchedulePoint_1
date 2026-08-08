/**
 * Ordering a selection into a chain, and refusing one that would close a cycle
 * (`docs/specs/canvas-multi-select/` M4-T5).
 *
 * Pure: no React, no DOM, no network — a sibling of `canvas-selection` and `render-model`.
 *
 * **The direction is the whole risk.** ADR-0064 was opened on a report that a link had been
 * recorded the wrong way round; the same mistake made twelve times at once is a programme nobody
 * can read and a planner cannot unpick by eye. So the order this module returns is previewed with
 * names and arrows before anything is written, and it is derived from **time, not pick order**:
 * a planner sweeping a marquee has expressed no sequence at all, and honouring the accident of
 * which bar the rectangle touched first would produce a chain that looks random.
 */

/** The minimum an activity has to expose to be chained. */
export interface ChainCandidate {
  readonly id: string;
  readonly name: string;
  /** The bar's start, as the canvas draws it (`YYYY-MM-DD`), or null when it has no dates yet. */
  readonly start: string | null;
}

/** An edge the chain would create, predecessor → successor. */
export interface ChainEdge {
  readonly predecessorId: string;
  readonly successorId: string;
}

/** An existing dependency, as the plan already holds it. */
export interface ExistingEdge {
  readonly predecessorId: string;
  readonly successorId: string;
}

/**
 * How many links one gesture may create.
 *
 * Each edge is its own round trip (there is no batch dependency endpoint), so an unbounded chain
 * over a select-all is N requests and a progress bar nobody asked for. Fifty is far past any real
 * sequence a planner draws by hand and well inside what the API answers promptly; above it the
 * action is shaded **with the number in the reason**, never silently truncated — a chain that
 * quietly stops at fifty is worse than one that refuses, because the plan then looks finished.
 */
export const MAX_CHAIN_LINKS = 50;

/**
 * Order candidates into the sequence a chain would follow.
 *
 * By **start date, then by name, then by id**. The two tie-breaks are not decoration: a programme
 * routinely holds several activities starting the same morning, and without a total order the
 * chain's direction would depend on the order the list happened to arrive in — which changes when
 * anything else on the plan is edited, so the same selection would chain differently on Tuesday.
 * Activities with no dates sort **last**, together, in the same name/id order: they cannot be
 * placed in time, and putting them first would make an undated bar the driver of dated work.
 */
export function orderChain(candidates: readonly ChainCandidate[]): ChainCandidate[] {
  return [...candidates].sort((a, b) => {
    if (a.start !== b.start) {
      if (a.start === null) return 1;
      if (b.start === null) return -1;
      return a.start < b.start ? -1 : 1;
    }
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
}

/** The edges an ordered chain would create — one per adjacent pair, in order. */
export function chainEdges(ordered: readonly ChainCandidate[]): ChainEdge[] {
  const edges: ChainEdge[] = [];
  for (let i = 0; i + 1 < ordered.length; i += 1) {
    const from = ordered[i];
    const to = ordered[i + 1];
    if (from && to) edges.push({ predecessorId: from.id, successorId: to.id });
  }
  return edges;
}

/**
 * Would this chain close a cycle, given what the plan already holds?
 *
 * Checked over the **resulting** graph — every existing edge plus every proposed one at once — not
 * edge by edge. Edge-by-edge checking passes a chain whose links are each individually legal and
 * whose combination is not: A→B is fine, B→C is fine, and if the plan already holds C→A the three
 * together are a loop that the server would then reject somewhere in the middle of the write loop,
 * leaving a partial chain. This is the `updateParents` "validated against the RESULTING tree" rule
 * applied to the dependency DAG (ADR-0021).
 */
export function chainWouldCycle(
  edges: readonly ChainEdge[],
  existing: readonly ExistingEdge[],
): boolean {
  const successors = new Map<string, string[]>();
  const add = (from: string, to: string): void => {
    const list = successors.get(from);
    if (list) list.push(to);
    else successors.set(from, [to]);
  };
  for (const e of existing) add(e.predecessorId, e.successorId);
  for (const e of edges) add(e.predecessorId, e.successorId);

  // Iterative DFS with the standard white/grey/black colouring. Iterative rather than recursive
  // because the graph is a whole plan's logic and a deep chain would blow the stack on exactly the
  // programmes where this matters.
  const state = new Map<string, 1 | 2>(); // 1 = on the current path, 2 = finished
  for (const root of successors.keys()) {
    if (state.get(root) === 2) continue;
    const stack: { node: string; index: number }[] = [{ node: root, index: 0 }];
    state.set(root, 1);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      if (!frame) break;
      const children = successors.get(frame.node) ?? [];
      if (frame.index >= children.length) {
        state.set(frame.node, 2);
        stack.pop();
        continue;
      }
      const child = children[frame.index];
      frame.index += 1;
      if (child === undefined) continue;
      const seen = state.get(child);
      if (seen === 1) return true; // back edge — a cycle
      if (seen === 2) continue;
      state.set(child, 1);
      stack.push({ node: child, index: 0 });
    }
  }
  return false;
}

/** Why a chain cannot be created, or null when it can. */
export type ChainRefusal =
  { kind: 'tooFew' } | { kind: 'tooMany'; limit: number; requested: number } | { kind: 'cycle' };

/**
 * The whole pre-check, in one call: order, build the edges, and say whether the gesture is legal.
 *
 * Returns the ordered candidates and edges **even when refused**, so the preview can still show a
 * planner what was going to happen — a refusal that hides its own subject leaves them guessing at
 * which two activities closed the loop.
 */
export function planChain(params: {
  candidates: readonly ChainCandidate[];
  existing: readonly ExistingEdge[];
  reversed?: boolean;
}): { ordered: ChainCandidate[]; edges: ChainEdge[]; refusal: ChainRefusal | null } {
  const ordered = params.reversed
    ? orderChain(params.candidates).reverse()
    : orderChain(params.candidates);
  const edges = chainEdges(ordered);
  const refusal: ChainRefusal | null =
    ordered.length < 2
      ? { kind: 'tooFew' }
      : edges.length > MAX_CHAIN_LINKS
        ? { kind: 'tooMany', limit: MAX_CHAIN_LINKS, requested: edges.length }
        : chainWouldCycle(edges, params.existing)
          ? { kind: 'cycle' }
          : null;
  return { ordered, edges, refusal };
}
