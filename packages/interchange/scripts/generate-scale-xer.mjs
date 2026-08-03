/**
 * Generate a large, realistically-shaped `.xer` for measuring the TSLD canvas (TECH_DEBT #75).
 *
 * ADR-0026 §9's gate is stated at **2,000 activities**, and nobody has a plan that big
 * to point a browser at. Seeding one needs the ADR-0066 HTTP seeder, which needs a checkout and a
 * toolchain — the exact barrier that left the budget unmeasured for months. Importing a file does
 * not: it is an ordinary product feature, so an operator can drag this in and have a 2,000-activity
 * plan in the instance they already run.
 *
 * **It is built with the repo's own `exportXer` and then read back with the repo's own `importXer`,**
 * rather than by writing `.xer` text by hand. A hand-rolled emitter would be a second opinion about
 * the format, and the first thing anyone would learn from a hand-rolled file is that it does not
 * import — after they had already spent the download. Round-tripping it here means the check that
 * matters has already run: if `importXer` maps it back to the activity count we generated, the app's
 * parser will too, because it is the same function.
 *
 * **The shape is the load-bearing part, not the count.** ADR-0066 M4 recorded a scale generator that
 * held every declared number while laying the plan nose-to-tail, so it spanned 28 years, "whole plan"
 * zoom culled nine bars in ten, and the benchmark reported a very pretty 4.6 ms — for an almost empty
 * screen. So the forty bands here run **concurrently** — gathered by a per-phase milestone rather
 * than chained end to end — and the generator computes the longest path and refuses to write a plan
 * spanning more than three years. That guard is the point: the defect it catches produced a number
 * that looked like the budget being met, so it has to fail the run rather than print a caveat.
 *
 * Usage:  node packages/interchange/scripts/generate-scale-xer.mjs [activities] [out.xer]
 */

import { writeFileSync } from 'node:fs';

/** Trade names, so the diagram reads as a programme rather than "Task 1..2000". */
const TASK_NAMES = [
  'Excavate',
  'Blind',
  'Reinforce',
  'Formwork',
  'Pour',
  'Strike',
  'Backfill',
  'Block work',
  'Steel erect',
  'Metal deck',
  'Roof',
  'Cladding',
  'Glazing',
  'Partitions',
  'M&E first fix',
  'Screed',
  'Plaster',
  'M&E second fix',
  'Joinery',
  'Decorate',
  'Commission',
  'Snag',
];

import { exportXer, importXer } from '../dist/index.js';

const TARGET = Number.parseInt(process.argv[2] ?? '2000', 10);
const OUT = process.argv[3] ?? 'schedulepoint-scale-2000.xer';

/** Working days per task. Short enough that a band is months, not years. */
const TASK_DAYS = 3;
const MINUTES_PER_DAY = 8 * 60;
/** How far into the next band a cross-band link reaches, in tasks. Keeps the link from binding. */
const PHASE_STAGGER_TASKS = 10;
const PHASES = 8;
const BANDS_PER_PHASE = 5;
/** How many of a band's tasks reach forward into the next band. Higher = denser cross-band logic. */
const CROSS_LINK_DIVISOR = 25;

const calendars = [
  {
    key: 'CAL-STD',
    name: 'Standard 5-day 8-hour',
    scope: 'PROJECT',
    hoursPerDay: 8,
    // Monday(0) to Friday(4), 08:00–12:00 and 13:00–17:00 — two windows a day, which is also what
    // makes this exercise ADR-0036's intraday shift patterns rather than a whole-day mask.
    shifts: [0, 1, 2, 3, 4].flatMap((weekday) => [
      { weekday, startMinute: 8 * 60, endMinute: 12 * 60 },
      { weekday, startMinute: 13 * 60, endMinute: 17 * 60 },
    ]),
    exceptions: [],
  },
];

const activities = [];
const dependencies = [];

const push = (a) =>
  activities.push({
    calendarKey: 'CAL-STD',
    parentKey: null,
    constraintType: null,
    constraintDate: null,
    secondaryConstraintType: null,
    secondaryConstraintDate: null,
    scheduleAsLateAsPossible: false,
    progress: null,
    ...a,
  });

const link = (predecessorKey, successorKey, type = 'FS', lagMinutes = 0) =>
  dependencies.push({
    key: `R-${String(dependencies.length + 1).padStart(6, '0')}`,
    predecessorKey,
    successorKey,
    type,
    lagMinutes,
  });

// Budget the tasks across the fixed WBS shape so the total lands on TARGET. The summaries and the
// per-phase milestone are activities too (a summary is drawn as a bar), so they come out of it.
const structural = PHASES + PHASES * BANDS_PER_PHASE + PHASES; // phases + bands + milestones
const tasksPerBand = Math.max(1, Math.round((TARGET - structural) / (PHASES * BANDS_PER_PHASE)));

/** Band-local task keys, kept so the cross-links can reach into a band without re-deriving names. */
const bandTasks = [];

for (let p = 0; p < PHASES; p += 1) {
  const phaseKey = `P${String(p + 1).padStart(2, '0')}`;
  push({
    key: phaseKey,
    code: phaseKey,
    name: `Phase ${String(p + 1)}`,
    type: 'WBS_SUMMARY',
    durationMinutes: 0,
  });

  for (let b = 0; b < BANDS_PER_PHASE; b += 1) {
    const bandKey = `${phaseKey}-B${String(b + 1)}`;
    push({
      key: bandKey,
      code: bandKey,
      name: `Phase ${String(p + 1)} — Band ${String(b + 1)}`,
      type: 'WBS_SUMMARY',
      durationMinutes: 0,
      parentKey: phaseKey,
    });

    const keys = [];
    for (let t = 0; t < tasksPerBand; t += 1) {
      const key = `${bandKey}-T${String(t + 1).padStart(3, '0')}`;
      push({
        key,
        code: key,
        // The band suffix is not decoration. `uq_activities_plan_name` makes an activity's NAME
        // unique per plan, and the first version of this generator reused the 22 trade names across
        // all 40 bands — 1,911 duplicates, which the import rejected. See the assertion below.
        name: `${TASK_NAMES[t % TASK_NAMES.length]} ${String(t + 1)} — ${bandKey}`,
        type: 'TASK',
        durationMinutes: TASK_DAYS * MINUTES_PER_DAY,
        parentKey: bandKey,
      });
      // The in-band chain. This is what gives the band a real duration; everything else is width.
      if (t > 0) link(keys[t - 1], key);
      keys.push(key);
    }
    bandTasks.push({ phase: p, band: b, keys });
  }

  // One phase-completion milestone, driven by the last task of each band in the phase. This is what
  // gathers concurrent bands without serialising them — the difference between a plan that spans a
  // year and one that spans 28.
  const msKey = `${phaseKey}-MS`;
  push({
    key: msKey,
    code: msKey,
    name: `Phase ${String(p + 1)} complete`,
    type: 'FINISH_MILESTONE',
    durationMinutes: 0,
  });
  for (const band of bandTasks.filter((x) => x.phase === p)) {
    link(band.keys[band.keys.length - 1], msKey);
  }
}

// Cross-band logic, always from a lower band index to a higher one so the graph is acyclic **by
// construction** rather than by a check. Real programmes are densely linked inside a band and
// sparsely across bands, and that asymmetry is exactly what the canvas's viewport cull exploits —
// a lattice where every edge spans seven lanes defeats the cull and is not a plan (ADR-0065).
// `CROSS_LINK_DIVISOR` sets how many of a band's tasks reach forward; the run prints the resulting
// links-per-activity rather than this comment asserting a figure the arithmetic might miss.
for (let i = 0; i + 1 < bandTasks.length; i += 1) {
  const from = bandTasks[i];
  const to = bandTasks[i + 1];
  const stride = Math.max(1, Math.floor(from.keys.length / CROSS_LINK_DIVISOR));
  for (let t = stride; t < from.keys.length - stride; t += stride) {
    const target = to.keys[Math.min(to.keys.length - 1, t + PHASE_STAGGER_TASKS)];
    if (target) link(from.keys[t], target);
  }
}

const graph = {
  plan: {
    name: `Scale programme (${String(activities.length)} activities)`,
    dataDate: '2026-01-05',
    defaultCalendarKey: 'CAL-STD',
  },
  calendars,
  activities,
  dependencies,
  resources: [],
  assignments: [],
};

/**
 * Longest path through the dependency DAG, in working days — the span guard the header promises.
 *
 * Computed here rather than by importing the CPM engine, deliberately: this generator has no
 * business depending on the engine, and the question is only "does this plan fill a viewport or
 * stretch to the horizon", which FS-chain arithmetic answers. It is a floor on the real span
 * (calendar dates are longer, since weekends are skipped), which is the safe direction — if the
 * floor is already over the ceiling, the shape is wrong.
 */
function longestPathWorkingDays() {
  const durationOf = new Map(
    activities.map((a) => [a.key, Math.round(a.durationMinutes / MINUTES_PER_DAY)]),
  );
  const successors = new Map();
  const indegree = new Map(activities.map((a) => [a.key, 0]));
  for (const d of dependencies) {
    if (!successors.has(d.predecessorKey)) successors.set(d.predecessorKey, []);
    successors.get(d.predecessorKey).push(d.successorKey);
    indegree.set(d.successorKey, (indegree.get(d.successorKey) ?? 0) + 1);
  }
  const finish = new Map(activities.map((a) => [a.key, durationOf.get(a.key) ?? 0]));
  const queue = [...indegree].filter(([, n]) => n === 0).map(([k]) => k);
  let settled = 0;
  while (queue.length > 0) {
    const key = queue.shift();
    settled += 1;
    for (const next of successors.get(key) ?? []) {
      const candidate = finish.get(key) + (durationOf.get(next) ?? 0);
      if (candidate > finish.get(next)) finish.set(next, candidate);
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  // A node left unsettled means a cycle, which the cross-band rule is supposed to make impossible.
  if (settled !== activities.length) return Number.POSITIVE_INFINITY;
  return Math.max(...finish.values());
}

/**
 * Activity **names** must be unique within a plan, not just codes (`uq_activities_plan_name`).
 *
 * This is asserted here because the pure import pipeline does not check it: `validate` de-duplicates
 * codes and says nothing about names, so a file with 1,911 duplicate names parsed clean, reported
 * zero repairs, and then failed at the database with "A resource with these details already exists"
 * — a message about REST resources that reads as a message about the resource library. The first
 * version of this generator shipped exactly that file.
 */
for (const field of ['name', 'code']) {
  const seen = new Set();
  const duplicates = new Set();
  for (const a of activities) {
    if (seen.has(a[field])) duplicates.add(a[field]);
    seen.add(a[field]);
  }
  if (duplicates.size > 0) {
    const sample = [...duplicates].slice(0, 3).join(', ');
    console.error(
      `${String(duplicates.size)} duplicate activity ${field}s (e.g. ${sample}). ` +
        `\`uq_activities_plan_name\`/\`uq_activities_plan_code\` would reject this import.`,
    );
    process.exit(1);
  }
}

const SPAN_CEILING_WORKING_DAYS = 3 * 260; // three years of five-day weeks
const spanDays = longestPathWorkingDays();
if (!Number.isFinite(spanDays)) {
  console.error('The generated graph has a cycle — the cross-band rule is not holding.');
  process.exit(1);
}
if (spanDays > SPAN_CEILING_WORKING_DAYS) {
  console.error(
    `Longest path is ${String(spanDays)} working days (over ${String(SPAN_CEILING_WORKING_DAYS)}). ` +
      'A plan this long culls almost everything at whole-plan zoom and would produce a flattering, ' +
      'meaningless draw figure — the ADR-0066 nose-to-tail defect. Refusing to write it.',
  );
  process.exit(1);
}

const exported = exportXer({ graph });
if (!exported.ok) {
  console.error(`exportXer rejected the generated graph: ${exported.error.code}`);
  process.exit(1);
}

// Read it back with the importer the product uses. This is the check that makes the file worth
// sending: a graph that serialises but does not parse is exactly the failure a hand-rolled emitter
// would have produced, and it would have been discovered by the operator, not here.
const text = Buffer.from(exported.bytes).toString('utf8');
const reimported = importXer({ content: text, filename: OUT });
if (!reimported.ok) {
  console.error(`Round trip FAILED at ${reimported.error.stage}: ${reimported.error.message}`);
  process.exit(1);
}
const back = reimported.graph.activities.length;
if (back !== activities.length) {
  console.error(`Round trip lost activities: generated ${activities.length}, re-imported ${back}.`);
  process.exit(1);
}

writeFileSync(OUT, text);

const links = dependencies.length;
console.log(`Wrote ${OUT}`);
console.log(
  `  activities    ${activities.length} (${tasksPerBand} tasks x ${PHASES * BANDS_PER_PHASE} bands + summaries + milestones)`,
);
console.log(`  dependencies  ${links} (${(links / activities.length).toFixed(2)} per activity)`);
console.log(`  round trip    OK — importXer read back all ${back} activities`);
console.log(
  `  span          ${spanDays} working days (~${Math.round((spanDays / 260) * 12)} months)`,
);
console.log(`  size          ${(text.length / 1024 / 1024).toFixed(1)} MB`);
