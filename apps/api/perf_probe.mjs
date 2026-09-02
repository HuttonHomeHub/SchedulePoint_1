import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

const batchId = process.env.BATCH_ID;

async function main() {
  const org = await prisma.organization.findFirst({ where: { slug: 'perf-org-probe' } });
  const plan = await prisma.plan.findFirst({ where: { organizationId: org.id } });

  const trials = 8;
  const timesParentId = [];
  const timesIdOnly = [];

  for (let i = 0; i < trials; i++) {
    const start = performance.now();
    const rows = await prisma.activity.findMany({
      where: {
        organizationId: org.id,
        planId: plan.id,
        deleteBatchId: batchId,
        deletedAt: { not: null },
      },
      select: { id: true, parentId: true },
    });
    const ms = performance.now() - start;
    timesParentId.push(ms);
    if (i === 0) console.log('rows fetched (id+parentId):', rows.length);
  }

  for (let i = 0; i < trials; i++) {
    const start = performance.now();
    const rows = await prisma.activity.findMany({
      where: {
        organizationId: org.id,
        planId: plan.id,
        deleteBatchId: batchId,
        deletedAt: { not: null },
      },
      select: { id: true },
    });
    const ms = performance.now() - start;
    timesIdOnly.push(ms);
    if (i === 0) console.log('rows fetched (id only):', rows.length);
  }

  const fmt = (arr) => arr.map((x) => x.toFixed(2)).join(', ');
  console.log('id+parentId trials (ms):', fmt(timesParentId));
  console.log('id-only    trials (ms):', fmt(timesIdOnly));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
