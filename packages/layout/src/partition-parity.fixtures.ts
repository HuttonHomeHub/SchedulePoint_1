import { nearestFreeRow, rowOccupancy } from './nearest-free-row.js';
import { packAroundCarried } from './pack-around.js';
import { packLanes, type PackItem } from './pack-lanes.js';

/**
 * The parity corpus for the optional swimlane partition (swimlanes epic M0-T2): a fixed, seeded set
 * of inputs and a runner that records what every partition-aware entry point answers for them.
 *
 * `partition-parity.golden.json` is that record taken on the code as it stood BEFORE the partition
 * parameter existed. The spec compares today's answers to it, so "absent partition is byte-identical
 * to the old behaviour" is checked against the old behaviour rather than against itself
 * (ADR-0110, ADR-0203 FC-R8).
 */

/** How the partition argument is passed: left off, or handed in as an explicit `undefined`. */
export type PartitionArgument = 'absent' | 'undefined';

/** mulberry32: a tiny seeded generator, so the corpus never depends on `Math.random`. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ParityCase {
  name: string;
  items: PackItem[];
  predecessorsOf: Map<string, string[]>;
}

export function parityCorpus(): ParityCase[] {
  const cases: ParityCase[] = [
    { name: 'empty', items: [], predecessorsOf: new Map() },
    {
      name: 'single bar',
      items: [{ id: 'a', startDay: 0, endDay: 3, laneIndex: 5 }],
      predecessorsOf: new Map(),
    },
    {
      name: 'three concurrent then a late successor',
      items: [
        { id: 'a', startDay: 0, endDay: 4, laneIndex: 0 },
        { id: 'b', startDay: 1, endDay: 5, laneIndex: 1 },
        { id: 'c', startDay: 2, endDay: 6, laneIndex: 2 },
        { id: 'x', startDay: 8, endDay: 9, laneIndex: 9 },
      ],
      predecessorsOf: new Map([['x', ['c']]]),
    },
  ];
  for (let seed = 1; seed <= 30; seed += 1) {
    const rand = seeded(seed);
    const count = 1 + Math.floor(rand() * 40);
    const items: PackItem[] = [];
    for (let n = 0; n < count; n += 1) {
      const startDay = Math.floor(rand() * 60);
      items.push({
        id: `i${String(n).padStart(2, '0')}`,
        startDay,
        endDay: startDay + (rand() < 0.15 ? 0 : Math.floor(rand() * 12)),
        laneIndex: Math.floor(rand() * 8),
      });
    }
    const predecessorsOf = new Map<string, string[]>();
    for (const it of items) {
      const preds = items.filter((p) => p.id !== it.id && rand() < 0.08).map((p) => p.id);
      if (preds.length > 0) predecessorsOf.set(it.id, preds);
    }
    cases.push({ name: `seeded ${seed}`, items, predecessorsOf });
  }
  return cases;
}

/** Every entry point, called with the partition argument left off or passed as `undefined`. */
export function runParityCorpus(mode: PartitionArgument): unknown {
  const absent = mode === 'absent';
  return parityCorpus().map(({ name, items, predecessorsOf }) => {
    const half = Math.floor(items.length / 2);
    const carried = items.slice(0, half);
    const movers = items.slice(half);

    const queries = items.map((mover) => {
      const others = items.filter((o) => o.id !== mover.id);
      return absent ? nearestFreeRow(mover, others) : nearestFreeRow(mover, others, undefined);
    });

    const occupancy = absent ? rowOccupancy(carried) : rowOccupancy(carried, undefined);
    const cascade = movers.map((mover) => {
      const lane = occupancy.nearestFree(mover);
      occupancy.add(mover, lane);
      return lane;
    });
    const afterMove = carried.map((c) => {
      occupancy.move(c.id, c.laneIndex + 3);
      return occupancy.nearestFree(c);
    });

    return {
      name,
      packed: absent ? packLanes(items) : packLanes(items, undefined, undefined),
      packedHinted: absent
        ? packLanes(items, predecessorsOf)
        : packLanes(items, predecessorsOf, undefined),
      queries,
      cascade,
      afterMove,
      around: packAroundCarried(carried, movers, predecessorsOf),
      aroundUnhinted: packAroundCarried(carried, movers),
    };
  });
}
