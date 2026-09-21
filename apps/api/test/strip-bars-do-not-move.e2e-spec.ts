import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * **FC-10 clause C — the bars do not move, proved on a real plan** (one-planning-surface M-I,
 * `docs/specs/one-planning-surface/falsification.md`).
 *
 * **This exists because nothing executed that clause, in a milestone whose whole safety promise it
 * is.** `strip-drag-constraints-migration.e2e-spec.ts` claims FC-10 "clauses C and D" in its
 * docblock and then says, correctly, that it writes `early_start` and friends directly because "a
 * recalculation here would be a second subject". That is the right decision for **that** file's
 * subject — what the migration READS — and it is exactly why this claim was left undischarged: the
 * clause is about what the ENGINE produces either side of the strip, and no case in the epic calls
 * it. One document asserted the claim and denied it a hundred lines apart. Found by the M-J-T1
 * database review.
 *
 * **Both halves are asserted — the bars staying put as an equality over the whole plan, and the
 * downstream change positively rather than merely tolerated.** Asserting only the first passes
 * against a migration that did nothing; asserting only the second passes against one that moved
 * every bar.
 *
 * **Verified red against three mutations of the shipped SQL, with the assertion each one hit:**
 *
 * | Mutation                                                    | Caught by                                    |
 * | ----------------------------------------------------------- | -------------------------------------------- |
 * | `SET "visual_start" = NULL` (strip writes no placement)     | the whole-plan drawn-span equality           |
 * | `AND a."early_start" IS NOT NULL` (converts every class)    | the same equality — the inert bar jumps back |
 * | `AND … AND FALSE` (converts nothing)                        | `HOLD` still carrying its constraint         |
 *
 * The second is why `SPINE2` carries an **inert** constraint. Without it the fixture holds one
 * SNET, that SNET is binding, and widening the migration's `WHERE` to convert every class converts
 * exactly the same row — so the mutation would be indistinguishable from the shipped behaviour and
 * the case would pass against it. The first version of this file did, and it was checked.
 *
 * **Why the float rises is the point of the epic rather than a side effect.** A binding
 * `START_NO_EARLIER_THAN` binds through Pass 1: it pushes the activity's earliest start, and that
 * push propagates to every successor, consuming their float. A hand-placement does not — Pass 1
 * never sees `visual_start`. So stripping a binding constraint leaves the bar where it was drawn
 * (Pass 2 now reads the placement the strip wrote, at the same date the constraint had pinned) and
 * hands the network back the slack the constraint was holding.
 *
 * **The SQL is read from the shipped migration file**, never restated, for the same reason its
 * sibling gives: a copy would pass while the file it claims to test drifted.
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

const MIGRATION_SQL = readFileSync(
  join(
    __dirname,
    '..',
    'prisma',
    'migrations',
    '20260921120000_strip_drag_constraints',
    'migration.sql',
  ),
  'utf8',
);

/**
 * The executable statements, with `--` comments stripped.
 *
 * Deliberately a **copy of the sibling's helper rather than a shared import**: that file asserts
 * the statement count as one of its own claims, and a shared helper edited to suit this file would
 * silently change what that assertion means. Both are eight lines.
 */
function statementsOf(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

interface Actor {
  agent: ReturnType<typeof request.agent>;
}

interface Row {
  id: string;
  code: string;
  earlyStart: string | null;
  earlyFinish: string | null;
  visualEffectiveStart: string | null;
  visualEffectiveFinish: string | null;
  totalFloat: number | null;
  constraintType: string | null;
  constraintDate: string | null;
  visualStart: string | null;
}

describe.skipIf(!hasDatabase)('The strip leaves every bar where it is (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.LOG_LEVEL ??= 'silent';
    const { AppModule } = await import('../src/app.module');
    const { PrismaService: Token } = await import('../src/prisma/prisma.service');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: false,
      bodyParser: false,
    });
    configureHttpApp(app as NestExpressApplication);
    await app.init();
    prisma = app.get(Token);
  });

  beforeEach(async () => {
    await clearDomainData(prisma);
  });

  afterAll(async () => {
    await clearDomainData(prisma);
    await app?.close();
  });

  const server = () => app.getHttpServer();

  async function applyMigration(): Promise<void> {
    const statements = statementsOf(MIGRATION_SQL);
    await prisma.$transaction(async (tx) => {
      for (const statement of statements) await tx.$executeRawUnsafe(statement);
    });
  }

  /**
   * A chain whose middle link carries a **binding** `SNET`, built entirely through the public API,
   * hung off a **longer independent spine** that fixes the project finish.
   *
   * `HOLD`'s logic-earliest is the 7th (`LEAD` is 2 days from the 5th); the constraint pins it to
   * the **12th**, which is later, so Pass 1 clamps to the constraint and
   * `early_start = constraint_date` — the binding class, arithmetically. `AFTER` is its successor
   * and is where the float comes back.
   *
   * **The spine is not scenery, and its absence made the first version of this case fail against a
   * perfectly correct migration.** Total float is measured against the **project finish**, and that
   * finish is the maximum of every early finish — so on a plan where the constrained chain IS the
   * longest path, stripping the constraint pulls the whole project finish in with it and the chain
   * stays critical at zero float in both states. The float that "comes back" is only observable
   * where something else holds the finish still. `SPINE1`+`SPINE2` (20 working days against the
   * branch's 7) do that, and they are also a second control: nothing about them may move.
   *
   * `SLACK` is a second successor of `LEAD` with nothing downstream of it. It is the **branch**
   * control: if the strip somehow re-ran the network differently, an untouched sibling would move
   * too, and a test asserting only that SOMETHING gained float cannot tell "the constraint was
   * released" from "everything shifted".
   */
  async function seedBindingChain(): Promise<{ actor: Actor; planId: string; base: string }> {
    const agent = request.agent(server());
    await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: 'strip', email: 'strip-admin@example.com', password: PASSWORD })
      .expect(200);
    const actor: Actor = { agent };

    await agent.post('/api/v1/organizations').send({ name: 'Acme' }).expect(201);
    const client = await agent
      .post('/api/v1/organizations/acme/clients')
      .send({ name: 'Northgate' })
      .expect(201);
    const project = await agent
      .post(`/api/v1/organizations/acme/clients/${client.body.data.id}/projects`)
      .send({ name: 'Riverside' })
      .expect(201);
    const plan = await agent
      .post(`/api/v1/organizations/acme/projects/${project.body.data.id}/plans`)
      .send({ name: 'Strip', plannedStart: '2026-01-05' })
      .expect(201);
    const planId = plan.body.data.id as string;
    const base = `/api/v1/organizations/acme/plans/${planId}/activities`;

    const create = async (body: object): Promise<string> => {
      const res = await agent.post(base).send(body).expect(201);
      return res.body.data.id as string;
    };

    // The spine: 20 working days, no constraint, nothing linking it to the branch below. It fixes
    // the project finish so the branch's float is measurable.
    const spine1 = await create({ name: 'Spine one', code: 'SPINE1', durationDays: 10 });
    // `SPINE2` carries an **inert** SNET — its logic-earliest is the 19th and the constraint names
    // the 6th, so the `max` discards it and `early_start > constraint_date`. It is here to make the
    // four-class predicate observable from this file: without it the fixture holds one SNET, that
    // SNET is binding, and widening the migration's WHERE to convert every class converts exactly
    // the same row, so the mutation is indistinguishable from the shipped behaviour. Converting an
    // inert one would place this bar on the 6th — thirteen working days before logic allows — and
    // the equality below is what refuses it.
    const spine2 = await create({
      name: 'Spine two',
      code: 'SPINE2',
      durationDays: 10,
      constraintType: 'SNET',
      constraintDate: '2026-01-06',
    });

    const lead = await create({ name: 'Lead-in', code: 'LEAD', durationDays: 2 });
    const hold = await create({
      name: 'Hold point',
      code: 'HOLD',
      durationDays: 3,
      constraintType: 'SNET',
      constraintDate: '2026-01-12',
    });
    const after = await create({ name: 'Follow-on', code: 'AFTER', durationDays: 2 });
    const slack = await create({ name: 'Off the path', code: 'SLACK', durationDays: 1 });

    const link = async (predecessorId: string, successorId: string) =>
      agent
        .post(`/api/v1/organizations/acme/plans/${planId}/dependencies`)
        .send({ predecessorId, successorId, type: 'FS' })
        .expect(201);
    await link(spine1, spine2);
    await link(lead, hold);
    await link(hold, after);
    await link(lead, slack);

    await agent
      .post(`/api/v1/organizations/acme/plans/${planId}/schedule/recalculate`)
      .send({})
      .expect(200);

    return { actor, planId, base };
  }

  const readRows = async (actor: Actor, base: string): Promise<Map<string, Row>> => {
    const list = await actor.agent.get(`${base}?limit=100`).expect(200);
    return new Map((list.body.data as Row[]).map((r) => [r.code, r]));
  };

  it('leaves every drawn bar identical, and hands the successor back its float', async () => {
    const { actor, planId, base } = await seedBindingChain();
    const before = await readRows(actor, base);

    // The fixture is only worth what it contains (ADR-0093): assert the class is present before
    // asserting anything about converting it, or a seeding change that stopped the constraint
    // binding would leave every assertion below green about nothing.
    expect(before.get('HOLD')!.constraintType).toBe('SNET');
    expect(before.get('HOLD')!.earlyStart).toBe('2026-01-12');
    expect(before.get('HOLD')!.constraintDate).toBe('2026-01-12');
    expect(before.get('HOLD')!.visualStart).toBeNull();
    // And that the spine — not the constrained branch — holds the project finish. Without this the
    // float half of the case measures nothing, which is exactly how its first version failed.
    expect(before.get('SPINE2')!.earlyFinish! > before.get('AFTER')!.earlyFinish!).toBe(true);
    expect(before.get('AFTER')!.totalFloat!).toBeGreaterThan(0);
    // And that the inert row really is inert, arithmetically, rather than by intention.
    expect(before.get('SPINE2')!.constraintType).toBe('SNET');
    expect(before.get('SPINE2')!.earlyStart! > before.get('SPINE2')!.constraintDate!).toBe(true);

    await applyMigration();
    await actor.agent
      .post(`/api/v1/organizations/acme/plans/${planId}/schedule/recalculate`)
      .send({})
      .expect(200);
    const after = await readRows(actor, base);

    // Half one: every bar in the plan is drawn where it was. Asserted over the WHOLE plan as one
    // comparison rather than per row, so a bar that moved cannot hide behind the first failure.
    const drawn = (rows: Map<string, Row>) =>
      [...rows.values()]
        .map(
          (r) => `${r.code} ${String(r.visualEffectiveStart)}..${String(r.visualEffectiveFinish)}`,
        )
        .sort();
    expect(drawn(after)).toEqual(drawn(before));

    // And the constrained bar in particular is still at the date the constraint used to pin it to,
    // now carried by the placement the strip wrote.
    expect(after.get('HOLD')!.constraintType).toBeNull();
    expect(after.get('HOLD')!.constraintDate).toBeNull();
    expect(after.get('HOLD')!.visualStart).toBe('2026-01-12');
    expect(after.get('HOLD')!.visualEffectiveStart).toBe('2026-01-12');

    // Half two, positively: the network downstream changed. `HOLD`'s earliest falls back to what
    // logic alone allows, and its successor gains the float the constraint was holding.
    expect(after.get('HOLD')!.earlyStart).not.toBe(before.get('HOLD')!.earlyStart);
    expect(after.get('AFTER')!.totalFloat!).toBeGreaterThan(before.get('AFTER')!.totalFloat!);

    // The controls: a sibling branch with no constraint on it, and the spine that holds the finish,
    // are untouched in both directions — so "the float rose" cannot be satisfied by the whole
    // network having shifted.
    expect(after.get('SLACK')!.earlyStart).toBe(before.get('SLACK')!.earlyStart);
    expect(after.get('SLACK')!.totalFloat).toBe(before.get('SLACK')!.totalFloat);
    expect(after.get('SPINE2')!.earlyFinish).toBe(before.get('SPINE2')!.earlyFinish);
    expect(after.get('SPINE2')!.totalFloat).toBe(before.get('SPINE2')!.totalFloat);
    // The inert constraint is still there, still doing nothing — left alone, not converted.
    expect(after.get('SPINE2')!.constraintType).toBe('SNET');
    expect(after.get('SPINE2')!.visualStart).toBeNull();
  });
});
