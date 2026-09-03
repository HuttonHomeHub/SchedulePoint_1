import { fixtureSpec, specToEngineInput, computeSchedule, selectCompletionCarrier } from './m0-attribution-prototype.mjs';

const base = specToEngineInput(fixtureSpec());
console.log('dataDate:', JSON.stringify(base.options.dataDate));
const c = computeSchedule(base.activities, base.edges, base.options);
const carrier = selectCompletionCarrier(base.activities, c.results)!;
const a = base.activities.find((x) => x.id === carrier.activityId)!;
console.log('carrier:', carrier.activityId, '| type', a.type, '| finish', carrier.earlyFinish, '| critical', carrier.isCritical);
console.log('carrier constraintType:', a.constraintType, 'constraintDate:', a.constraintDate);
const preds = base.edges.filter((e) => e.successorId === carrier.activityId);
console.log('carrier predecessors:', preds.length, preds.map((e)=>e.predecessorId).join(','));
// how many activities carry a mandatory constraint?
const mand = base.activities.filter((x) => (x.constraintType ?? '').startsWith('MANDATORY'));
console.log('mandatory-constrained activities:', mand.length, mand.map((m)=>`${m.id}:${m.constraintType}@${m.constraintDate}`).join(' '));
