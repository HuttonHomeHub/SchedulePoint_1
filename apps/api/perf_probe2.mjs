import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
const orgId = process.env.ORG_ID;
const planId = process.env.PLAN_ID;
const batchId = process.env.BATCH_ID;

async function timeRuns(select, trials) {
  const times = [];
  let n = 0;
  for (let i = 0; i < trials; i++) {
    const start = performance.now();
    const rows = await prisma.activity.findMany({
      where: { organizationId: orgId, planId, deleteBatchId: batchId, deletedAt: { not: null } },
      select,
    });
    times.push(performance.now() - start);
    n = rows.length;
  }
  return { times, n };
}

async function main() {
  const trials = 6;
  const withParent = await timeRuns({ id: true, parentId: true }, trials);
  const idOnly = await timeRuns({ id: true }, trials);
  console.log('rows:', withParent.n);
  console.log('id+parentId (ms):', withParent.times.map((t) => t.toFixed(2)).join(', '));
  console.log('id-only     (ms):', idOnly.times.map((t) => t.toFixed(2)).join(', '));
  const median = (arr) => [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)];
  console.log('median id+parentId:', median(withParent.times).toFixed(2), 'ms');
  console.log('median id-only    :', median(idOnly.times).toFixed(2), 'ms');
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
