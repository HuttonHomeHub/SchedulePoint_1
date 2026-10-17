/**
 * **Redundant links — those no duration could make matter** (`docs/specs/redundant-link-advisory/`
 * §2.1 and §4.8, ADR-0196).
 *
 * A link is redundant when another path in the network pushes its successor at least as far as the
 * link does, **whatever the durations**, so deleting it cannot change any date or float. That is
 * stronger than "another path reaches the successor" (which would flag a `+5 day` link beside a
 * zero-lag chain, where the link is the one doing the work), and the price is stated rather than hidden:
 * links the rule cannot prove are counted as not checked (ADR-0127), never silently passed.
 *
 * **Engine-free.** This reads stored rows and imports nothing from the engine
 * (`health-engine-free.structural.spec.ts`). Soundness is therefore not argued here; it is proven
 * against the real engine by the differential oracle (`redundant-links.oracle.spec.ts`, over
 * `apps/api/test/support/redundant-links-oracle.ts`). If a clause below looks stricter than it needs
 * to be, the oracle's counterexamples (`m0-measurement.md`) say which ones were shown necessary and
 * which are conservative.
 *
 * **The rule, in the spec's vocabulary.** A link leaves its predecessor from end π (start or finish)
 * and binds its successor's end σ. A witness for `D = A → C` is a path `A → … → C` of other links with:
 * W1 no leads; W2 every intermediate is *transparent* and is entered at its start and left at its
 * finish; W3 the first link leaves A at an end at or after D's and the last binds C at an end at or
 * before D's; W4 if D has a positive lag, the chain's lags sum to at least it and every positive lag
 * on the chain is on D's lag calendar; W5 (single-calendar mode) lets W2 relax to "entered no later
 * than left" when A, C and every intermediate share one scheduling calendar.
 *
 * **Algorithm.** A max-plus dynamic programme per source activity and per mode, over the cone of
 * transparent activities its links reach, in topological order. A state is (activity, end it was
 * entered at, class of the first link's π); its value is the largest lag sum of a chain reaching it.
 * A candidate is judged by scanning its successor's incoming links for one that leaves a reached state
 * legally. A deterministic **relaxation budget** bounds the work: sources are processed in topological
 * order, so a capped result is the same every time, and what it did not reach is counted, not guessed.
 */

/** The token the web keys its caveat sentence on (`detail.rule`). */
export const REDUNDANT_LINKS_RULE = 'DOMINATED_UNDER_ANY_DURATION';

/**
 * The relaxation budget the service passes. Set from the M2 measurement (`m0-measurement.md`): high
 * enough that no measured plan reaches it, low enough that a dense plan answers in bounded time.
 */
export const DEFAULT_RELAXATION_LIMIT = 4_000_000;

/** The activity facts the rule reads. A structural subset of `HealthActivityInput`. */
export interface RedundantLinksActivity {
  id: string;
  code: string | null;
  name: string;
  type: string;
  status: string;
  constraintType: string | null;
  secondaryConstraintType: string | null;
  actualStart: string | null;
  actualFinish: string | null;
  /** The calendar the activity schedules on (driver → own → plan), as an id. */
  schedulingCalendarId: string;
}

/** The link facts the rule reads. A structural subset of `HealthDependencyInput`. */
export interface RedundantLinksDependency {
  id: string;
  predecessorId: string;
  successorId: string;
  type: string;
  lagMinutes: number;
  /** `24H`, or the id of the calendar the lag is measured on. */
  lagCalendarKey: string;
}

export interface RedundantLink {
  /** The redundant link's id. */
  linkId: string;
  /** The intermediate activities of the witness chain, in order; empty for a parallel link. */
  via: string[];
  /** For a parallel witness (no intermediates): the type of the other link between the same pair. */
  parallelType: string | null;
}

export interface RedundantLinksResult {
  /** Sorted by predecessor label, successor label, then link id: stable, so a capped list is too. */
  offenders: RedundantLink[];
  /** Links not checked: an endpoint that is not a candidate, an unknown endpoint, a cycle, or the cap. */
  unjudged: number;
  /** The deterministic relaxation budget ran out before every source was processed. */
  searchCapped: boolean;
  /** The stored graph has a cycle (ADR-0021 forbids it): nothing is flagged and every link is unjudged. */
  cyclic: boolean;
}

export interface RedundantLinksOptions {
  relaxationLimit: number;
}

/** Ends are ordered `S ≤ F`: every activity's finish is at or after its start. */
const S = 0;
const F = 1;

/** π (the predecessor end) and σ (the successor end) of each link type. */
const ENDS: Readonly<Record<string, { pi: 0 | 1; sigma: 0 | 1 }>> = {
  FS: { pi: F, sigma: S },
  SS: { pi: S, sigma: S },
  FF: { pi: F, sigma: F },
  SF: { pi: S, sigma: F },
};

/** Constraints that make an activity ignore its predecessors (ADR-0035 §7/§10; spec E10). */
const OVERRIDING_CONSTRAINTS: ReadonlySet<string> = new Set([
  'MSO',
  'MFO',
  'MANDATORY_START',
  'MANDATORY_FINISH',
]);

interface LinkRow {
  index: number;
  dep: RedundantLinksDependency;
  from: number;
  to: number;
  pi: 0 | 1;
  sigma: 0 | 1;
}

const label = (a: RedundantLinksActivity): string => a.code ?? a.name;

/** An activity a witness may pass through (spec §2.1). */
function isTransparent(a: RedundantLinksActivity): boolean {
  return (
    a.type !== 'LEVEL_OF_EFFORT' &&
    a.type !== 'WBS_SUMMARY' &&
    a.status === 'NOT_STARTED' &&
    a.actualStart === null &&
    a.actualFinish === null &&
    !(a.constraintType !== null && OVERRIDING_CONSTRAINTS.has(a.constraintType)) &&
    !(a.secondaryConstraintType !== null && OVERRIDING_CONSTRAINTS.has(a.secondaryConstraintType))
  );
}

/** A candidate link's endpoints: neither a level of effort nor a summary, and the successor transparent. */
function isCandidate(pred: RedundantLinksActivity, succ: RedundantLinksActivity): boolean {
  return (
    pred.type !== 'LEVEL_OF_EFFORT' &&
    pred.type !== 'WBS_SUMMARY' &&
    succ.type !== 'LEVEL_OF_EFFORT' &&
    succ.type !== 'WBS_SUMMARY' &&
    isTransparent(succ)
  );
}

/** Whether a link may sit on a witness chain in a search mode (W1, W4, and W5's key rule). */
function linkAllowed(dep: RedundantLinksDependency, mode: string | null, calendar: string | null) {
  if (dep.lagMinutes < 0) return false;
  if (dep.lagMinutes === 0) return true;
  // A positive lag: any key when D's own lag is not positive (`mode === null`), D's key otherwise.
  // Single-calendar mode additionally needs every non-zero lag on the shared calendar.
  if (mode !== null) return dep.lagCalendarKey === mode;
  return calendar === null || dep.lagCalendarKey === calendar;
}

export function findRedundantLinks(
  activities: readonly RedundantLinksActivity[],
  dependencies: readonly RedundantLinksDependency[],
  options: RedundantLinksOptions,
): RedundantLinksResult {
  const total = dependencies.length;
  const position = new Map(activities.map((a, i) => [a.id, i] as const));

  // Links with an endpoint outside the live activities are not checked (defensive: soft-delete
  // cascades should make this unreachable).
  const links: LinkRow[] = [];
  let unjudged = 0;
  for (const dep of dependencies) {
    const from = position.get(dep.predecessorId);
    const to = position.get(dep.successorId);
    const ends = ENDS[dep.type];
    if (from === undefined || to === undefined || ends === undefined) {
      unjudged += 1;
      continue;
    }
    links.push({ index: links.length, dep, from, to, pi: ends.pi, sigma: ends.sigma });
  }

  // Kahn over the activity DAG, stable by load order. Whatever it cannot place is on a cycle.
  const outLinks: LinkRow[][] = activities.map(() => []);
  const inLinks: LinkRow[][] = activities.map(() => []);
  const indegree = new Array<number>(activities.length).fill(0);
  for (const link of links) {
    outLinks[link.from]!.push(link);
    inLinks[link.to]!.push(link);
    indegree[link.to]! += 1;
  }
  const order: number[] = [];
  const queue: number[] = [];
  for (let i = 0; i < activities.length; i += 1) if (indegree[i] === 0) queue.push(i);
  for (let head = 0; head < queue.length; head += 1) {
    const at = queue[head]!;
    order.push(at);
    for (const link of outLinks[at]!) {
      indegree[link.to]! -= 1;
      if (indegree[link.to] === 0) queue.push(link.to);
    }
  }
  if (order.length !== activities.length) {
    return { offenders: [], unjudged: total, searchCapped: false, cyclic: true };
  }
  const topo = new Array<number>(activities.length).fill(0);
  order.forEach((at, rank) => {
    topo[at] = rank;
  });

  const transparent = activities.map(isTransparent);
  const calendarOf = activities.map((a) => a.schedulingCalendarId);

  // Candidates, grouped by source.
  const candidatesBySource = new Map<number, LinkRow[]>();
  for (const link of links) {
    if (!isCandidate(activities[link.from]!, activities[link.to]!)) {
      unjudged += 1;
      continue;
    }
    const list = candidatesBySource.get(link.from) ?? [];
    list.push(link);
    candidatesBySource.set(link.from, list);
  }
  const sources = [...candidatesBySource.keys()].sort((a, b) => topo[a]! - topo[b]!);

  // DP storage, allocated once and reset by touched index. State = position*4 + entered*2 + first.
  const stateCount = activities.length * 4;
  const value = new Float64Array(stateCount).fill(Number.NEGATIVE_INFINITY);
  const parentState = new Int32Array(stateCount).fill(-1);
  const parentLink = new Int32Array(stateCount).fill(-1);
  const touched: number[] = [];

  const offenders: RedundantLink[] = [];
  let remaining = options.relaxationLimit;
  let searchCapped = false;

  /**
   * One DP run for source `a`. Returns false if the budget ran out part-way (the run is then void).
   * `weak` is single-calendar mode (W5): K is the source's own calendar.
   */
  function runDp(a: number, mode: string | null, weak: boolean, stopAt: number): boolean {
    const kCalendar = weak ? calendarOf[a]! : null;
    const consider = (link: LinkRow, fromState: number, fromValue: number, first: number) => {
      const y = link.to;
      if (!transparent[y]) return;
      if (weak && calendarOf[y] !== kCalendar) return;
      const next = y * 4 + link.sigma * 2 + first;
      const candidate = fromValue + link.dep.lagMinutes;
      if (candidate > value[next]!) {
        if (value[next] === Number.NEGATIVE_INFINITY) touched.push(next);
        value[next] = candidate;
        parentState[next] = fromState;
        parentLink[next] = link.index;
      }
    };
    for (const link of outLinks[a]!) {
      remaining -= 1;
      if (!linkAllowed(link.dep, mode, kCalendar)) continue;
      consider(link, -1, 0, link.pi);
    }
    if (remaining < 0) return false;
    for (let rank = topo[a]! + 1; rank <= stopAt; rank += 1) {
      const x = order[rank]!;
      if (!transparent[x]) continue;
      for (let e = 0; e < 2; e += 1) {
        for (let first = 0; first < 2; first += 1) {
          const state = x * 4 + e * 2 + first;
          const have = value[state]!;
          if (have === Number.NEGATIVE_INFINITY) continue;
          for (const link of outLinks[x]!) {
            remaining -= 1;
            // W2: enter at S and leave at F; single-calendar mode relaxes to "entered no later than
            // left", never F then S.
            if (weak ? e > link.pi : !(e === S && link.pi === F)) continue;
            if (!linkAllowed(link.dep, mode, kCalendar)) continue;
            consider(link, state, have, first);
          }
          if (remaining < 0) return false;
        }
      }
    }
    return true;
  }

  function reset(): void {
    for (const state of touched) {
      value[state] = Number.NEGATIVE_INFINITY;
      parentState[state] = -1;
      parentLink[state] = -1;
    }
    touched.length = 0;
  }

  /** Walk parents back from a state to the source and name the intermediates in order. */
  function viaOf(state: number): string[] {
    const names: string[] = [];
    for (let at = state; at !== -1; at = parentState[at]!) {
      names.push(label(activities[Math.floor(at / 4)]!));
    }
    return names.reverse();
  }

  /** A witness for `d` among the states a finished run reached, or null. */
  function witness(d: LinkRow, mode: string | null, weak: boolean): RedundantLink | null {
    const kCalendar = weak ? calendarOf[d.from]! : null;
    for (const t of inLinks[d.to]!) {
      if (t.index === d.index) continue;
      if (t.sigma > d.sigma) continue; // W3: bind C at an end at or before D's
      if (!linkAllowed(t.dep, mode, kCalendar)) continue;
      const need = d.dep.lagMinutes > 0 ? d.dep.lagMinutes : Number.NEGATIVE_INFINITY;
      if (t.from === d.from) {
        // k = 1: another link between the same pair. W3's first-end rule applies to it directly.
        if (t.pi < d.pi) continue;
        if (t.dep.lagMinutes < need) continue;
        return { linkId: d.dep.id, via: [], parallelType: t.dep.type };
      }
      if (!transparent[t.from]) continue;
      for (let e = 0; e < 2; e += 1) {
        for (let first = 0; first < 2; first += 1) {
          // W3: the first link leaves A at an end at or after D's.
          if (first < d.pi) continue;
          const state = t.from * 4 + e * 2 + first;
          const have = value[state]!;
          if (have === Number.NEGATIVE_INFINITY) continue;
          if (weak ? e > t.pi : !(e === S && t.pi === F)) continue;
          if (have + t.dep.lagMinutes < need) continue;
          return { linkId: d.dep.id, via: viaOf(state), parallelType: null };
        }
      }
    }
    return null;
  }

  const decided = new Set<number>();
  for (const a of sources) {
    const candidates = candidatesBySource.get(a)!;
    let stopAt = 0;
    for (const d of candidates) stopAt = Math.max(stopAt, topo[d.to]!);

    // The modes this source's candidates need: calendar-free for a non-positive lag, and one per
    // positive-lag key; each in a general run and, where W5 can hold, a single-calendar run.
    const runs = new Map<string, { mode: string | null; weak: boolean; members: LinkRow[] }>();
    for (const d of candidates) {
      const mode = d.dep.lagMinutes > 0 ? d.dep.lagCalendarKey : null;
      const add = (weak: boolean) => {
        const key = `${mode ?? '*'}|${weak ? 'w' : 'g'}`;
        const run = runs.get(key) ?? { mode, weak, members: [] };
        run.members.push(d);
        runs.set(key, run);
      };
      add(false);
      const k = calendarOf[d.from]!;
      const weakAllowed =
        calendarOf[d.to] === k && (d.dep.lagMinutes === 0 || d.dep.lagCalendarKey === k);
      if (weakAllowed) add(true);
    }

    const found: RedundantLink[] = [];
    let completed = true;
    for (const run of runs.values()) {
      if (!runDp(a, run.mode, run.weak, stopAt)) {
        completed = false;
        reset();
        break;
      }
      for (const d of run.members) {
        if (decided.has(d.index)) continue;
        const w = witness(d, run.mode, run.weak);
        if (w !== null) {
          decided.add(d.index);
          found.push(w);
        }
      }
      reset();
    }
    if (!completed) {
      // The budget ran out part-way through this source: its results are void, so what it and every
      // later source would have judged is counted as not checked, deterministically.
      searchCapped = true;
      for (const rest of sources.slice(sources.indexOf(a))) {
        unjudged += candidatesBySource.get(rest)!.length;
      }
      break;
    }
    offenders.push(...found);
  }

  const names = new Map(activities.map((a) => [a.id, label(a)] as const));
  const byId = new Map(dependencies.map((d) => [d.id, d] as const));
  offenders.sort((x, y) => {
    const dx = byId.get(x.linkId)!;
    const dy = byId.get(y.linkId)!;
    const key = (d: RedundantLinksDependency): string[] => [
      names.get(d.predecessorId) ?? '',
      names.get(d.successorId) ?? '',
      d.id,
    ];
    const a = key(dx);
    const b = key(dy);
    for (let i = 0; i < a.length; i += 1) {
      if (a[i]! < b[i]!) return -1;
      if (a[i]! > b[i]!) return 1;
    }
    return 0;
  });

  return { offenders, unjudged, searchCapped, cyclic: false };
}
