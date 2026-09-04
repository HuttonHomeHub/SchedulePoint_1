/**
 * **M0's engine input, built by the PRODUCT'S OWN builder.**
 *
 * The first harness built its input with `test/pairwise/spec-to-engine.ts` and measured a network
 * that schedules **differently from the product** — project finish 2026-10-27 against the API's
 * 2027-03-12, criticality 100 against 87. That mapper is correct where it lives: the pairwise
 * differential applies its approximations to both sides, where they cancel. They do not cancel when
 * the harness is compared against the product, and one of them (`roundToWholeDays`, which rounds to
 * the ELAPSED-day 1440 rather than the working-day 480) was measured and accounts for **one day** of
 * a four-and-a-half-month gap. Patching it was therefore not the answer.
 *
 * So this module does not map anything. It boots the real `AppModule`, takes the real
 * `ScheduleService`, and calls **`buildEngineGraph`** — the method whose own docblock says it is
 * "shared by `recalculate` and `floatPaths` so the two can never diverge in how they map the DB
 * graph onto the engine". A third caller that mapped independently would be exactly the drift that
 * method exists to prevent.
 *
 * **Two costs, stated rather than hidden.**
 *
 * 1. `buildEngineGraph` is `private`, so this reaches it through a cast. That is a deliberate choice
 *    for a **measurement harness**: the alternative is refactoring shipped code to serve a script,
 *    and M0's whole premise is that it may say no and be thrown away. If Tier 3 ships, M1 needs this
 *    builder legitimately and can extract it then, with the `completion-carrier.ts` precedent.
 * 2. It needs a **real database with the fixture plan seeded**. That is the point — it is what makes
 *    the Subject the plan `m0-condition.md` names rather than a lookalike.
 */
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { ScheduleService } from '../src/modules/schedule/schedule.service.js';
import type { ComputeOptions } from '../src/modules/schedule/engine/compute.js';
import type { EngineActivity, EngineEdge } from '../src/modules/schedule/engine/types.js';

export interface ProductEngineInput {
  activities: EngineActivity[];
  edges: EngineEdge[];
  options: ComputeOptions;
  leveling: unknown | null;
  planId: string;
  planName: string;
}

/** Load the fixture plan's engine input exactly as `recalculate` would build it. */
export async function loadProductEngineInput(planNameLike = '%torture%'): Promise<{
  input: ProductEngineInput;
  close: () => Promise<void>;
}> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const schedule = app.get(ScheduleService);

  const plan = await prisma.plan.findFirst({
    where: { name: { contains: 'torture' }, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (plan === null) {
    await app.close();
    throw new Error(
      'No fixture plan found. Seed it first:\n' +
        '  bash scripts/e2e-local.sh --db-only\n' +
        '  node apps/api/dist/main.js   (with DATABASE_URL, BETTER_AUTH_SECRET)\n' +
        '  pnpm --filter @repo/seed-cli seed -- --url http://localhost:3000 --org <slug> ' +
        '--project <uuid> --email <e> --password <p> --tier fixture',
    );
  }

  const dataDate = (plan as { plannedStart?: Date | null }).plannedStart;
  const dataDateIso =
    dataDate instanceof Date ? dataDate.toISOString().slice(0, 10) : String(dataDate ?? '');

  // The private builder, reached deliberately — see the docblock.
  const svc = schedule as unknown as {
    buildEngineGraph: (
      organizationId: string,
      plan: unknown,
      dataDate: string,
      tx: unknown,
    ) => Promise<{
      activities: EngineActivity[];
      edges: EngineEdge[];
      options: ComputeOptions;
      leveling: unknown | null;
    }>;
  };

  const graph = await prisma.$transaction((tx) =>
    svc.buildEngineGraph(plan.organizationId, plan, dataDateIso, tx),
  );

  return {
    input: {
      activities: graph.activities,
      edges: graph.edges,
      options: graph.options,
      leveling: graph.leveling,
      planId: plan.id,
      planName: plan.name,
    },
    close: () => app.close(),
  };
}
