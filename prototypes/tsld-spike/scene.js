// Synthetic TSLD scene generator for the M0 prototype-at-scale spike (ADR-0026).
// Throwaway benchmark code — NOT app/feature code. Produces a plausibly-shaped
// network: activities spread across lanes and time, each with ~4 finish→start
// dependencies, a duration, and a critical flag, mirroring a real plan's density
// so the fps numbers are representative (not a best-case straight line).

/**
 * @param {number} count number of activities
 * @param {number} lanes number of vertical lanes to spread across
 * @returns {{activities: Array, deps: Array, maxDay: number, lanes: number}}
 */
// Realistic construction activity names so the on-canvas labels are representative in length
// (`{code} {name} · {n}d` ≈ 25–45 chars) — the truncation binary search + measureText cost scales
// with label length, so short "A123" labels understate the shipped per-frame text cost (ADR-0026).
const ACTIVITY_NAMES = [
  'Excavate foundations',
  'Pour concrete slab',
  'Erect structural steel',
  'Install curtain wall',
  'Rough-in electrical',
  'Rough-in plumbing',
  'Hang drywall partitions',
  'Mechanical ductwork',
  'Roof waterproofing',
  'Pour columns & cores',
  'Backfill & compact',
  'Set precast panels',
  'Fireproofing to steel',
  'Glazing to level',
  'Screed floors',
  'Install passenger lifts',
  'Tape & joint',
  'Ceiling grid & tiles',
  'Paint & decorate',
  'Commission HVAC',
  'Landscaping & hardstanding',
  'Snagging & handover',
  'Fit-out joinery',
  'Test & balance systems',
];

export function generateScene(count, lanes = Math.max(12, Math.round(Math.sqrt(count)))) {
  // Deterministic PRNG so runs are comparable (no Math.random — reproducible).
  let seed = 1234567;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const activities = new Array(count);
  const perLane = Math.ceil(count / lanes);
  let maxDay = 0;

  for (let i = 0; i < count; i += 1) {
    const lane = i % lanes;
    const indexInLane = Math.floor(i / lanes);
    // Activities march rightward within a lane, with jitter, so the network has
    // real horizontal spread (typical plan spans hundreds of working days).
    const startDay = Math.round(indexInLane * 4 + lane * 1.5 + rand() * 6);
    const duration = 1 + Math.floor(rand() * 10);
    maxDay = Math.max(maxDay, startDay + duration);
    activities[i] = {
      id: i,
      lane,
      startDay,
      duration,
      // A single spine per lane is "critical" — ~1/lanes of activities, realistic.
      isCritical: indexInLane === perLane - 1 || rand() < 0.06,
      isNearCritical: rand() < 0.1,
      // Realistic `{code} {name} · {n}d` label (see ACTIVITY_NAMES) — label length is the ADR's
      // dominant per-frame text expense (measureText + truncation), so this mirrors production.
      label: `A${1000 + ((i * 10) % 9000)} ${ACTIVITY_NAMES[i % ACTIVITY_NAMES.length]} · ${duration}d`,
    };
  }

  // ~4 dependencies per activity: mostly forward to nearby successors (FS), some
  // cross-lane, matching the brief's "×4 dependencies each" ceiling.
  const deps = [];
  for (let i = 0; i < count; i += 1) {
    const fanout = 2 + Math.floor(rand() * 4); // 2–5
    for (let k = 0; k < fanout; k += 1) {
      const target = i + 1 + Math.floor(rand() * 20);
      if (target < count) deps.push({ from: i, to: target });
    }
  }

  return { activities, deps, maxDay, lanes };
}
