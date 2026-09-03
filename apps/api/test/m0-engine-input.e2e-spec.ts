import { NestFactory } from '@nestjs/core';
import { afterAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module';
import { computeSchedule } from '../src/modules/schedule/engine/compute';
import { ScheduleService } from '../src/modules/schedule/schedule.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * **M0 — does the harness's engine input reproduce the PRODUCT's schedule?**
 *
 * This is a vitest spec and not a script for one reason, found by trying the other way: booting
 * `AppModule` under `tsx` fails DI resolution, because a transpile-only loader emits no decorator
 * metadata. Every e2e suite here boots it under vitest, which does. The first attempt also passed
 * `{ logger: false }` and got a silent exit 1 — the flag suppressed the very diagnostic that named
 * the cause.
 *
 * **It SKIPS when the fixture plan is not seeded**, so CI is unaffected. Seed it with
 * `pnpm --filter @repo/seed-cli seed -- … --tier fixture` and re-run to get the comparison.
 */
describe('M0 — engine input fidelity', () => {
  let close: (() => Promise<void>) | undefined;
  afterAll(async () => {
    if (close) await close();
  });

  it("reproduces the product's schedule for the seeded fixture plan", async () => {
    const app = await NestFactory.createApplicationContext(AppModule);
    close = () => app.close();
    const prisma = app.get(PrismaService);
    const schedule = app.get(ScheduleService);

    const plan = await prisma.plan.findFirst({
      where: { name: { contains: 'torture' }, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (plan === null) {
      console.warn('SKIP: no fixture plan seeded — seed the fixture tier and re-run.');
      return;
    }

    const planned = (plan as { plannedStart?: Date | null }).plannedStart;
    const dataDate =
      planned instanceof Date ? planned.toISOString().slice(0, 10) : String(planned ?? '');

    // The product's own builder, reached through a cast — deliberately, for a measurement. Its
    // docblock says it is shared by `recalculate` and `floatPaths` "so the two can never diverge in
    // how they map the DB graph onto the engine"; a third independent mapper is exactly that drift,
    // and the first harness proved it by scheduling a different plan.
    const svc = schedule as unknown as {
      buildEngineGraph: (
        organizationId: string,
        plan: unknown,
        dataDate: string,
        tx: unknown,
      ) => Promise<
        Parameters<typeof computeSchedule> extends never
          ? never
          : {
              activities: Parameters<typeof computeSchedule>[0] extends readonly (infer A)[]
                ? A[]
                : never;
              edges: Parameters<typeof computeSchedule>[1] extends readonly (infer E)[]
                ? E[]
                : never;
              options: Parameters<typeof computeSchedule>[2];
            }
      >;
    };

    const graph = await prisma.$transaction((tx) =>
      svc.buildEngineGraph(plan.organizationId, plan, dataDate, tx),
    );
    const summary = computeSchedule(graph.activities, graph.edges, graph.options).summary;

    console.log('PRODUCT BUILDER:', JSON.stringify(summary));
    expect(graph.activities.length).toBe(147);
    expect(graph.edges.length).toBe(188);
    // The playbook's own row for this plan (docs/TEST_PLAYBOOK.md:43).
    expect(summary.projectFinish).toBe('2027-03-12');
    expect(summary.criticalCount).toBe(87);
  }, 120_000);
});
