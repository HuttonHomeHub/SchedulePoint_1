import { type INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { LIBRARY_SEARCH_MAX_LENGTH, STANDARD_WEEKDAYS_MASK } from '@repo/types';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { configureHttpApp } from '../src/app-setup';
import type { PrismaService } from '../src/prisma/prisma.service';

import { clearDomainData } from './audit-reset';

/**
 * End-to-end tests for the SEARCH / FILTER surface (M4 of the library-scoping epic,
 * ADR-0053 §4, US-8), against a real PostgreSQL + Better Auth session — for BOTH shared
 * libraries (calendars and resources):
 *
 *  - `?q=` is a case-insensitive substring match — calendar NAME only, resource NAME **or**
 *    CODE — trimmed, with a whitespace-only term treated as no search at all, and a >100-char
 *    term rejected at the DTO (422);
 *  - `?kind=` narrows a resource list to one `ResourceKind` (including `GROUP`);
 *  - the tri-state `?archived=` filter (`exclude` default / `include` / `only`) on both
 *    libraries;
 *  - every filter COMPOSES with every other one, and with the pre-existing `?scope=`
 *    (calendars) / `?parentId=` (resources) filters, rather than one silently overriding
 *    another;
 *  - PAGINATION CORRECTNESS under a filter — the anti-truncation regression the epic cares
 *    about: seeding more rows than one page holds and walking `?cursor=` to `meta.hasMore ===
 *    false` must yield the complete, non-duplicated set of matches, never a truncated one;
 *  - cross-org isolation: another organisation's rows — archived or not — never leak into a
 *    search, whatever the filter combination.
 *
 * NOT covered here: the archive/unarchive action semantics themselves (see
 * `library-archive.e2e-spec.ts`) and the pre-existing `scope`/`parentId` filter behaviour on
 * their own (see `calendar-scope.e2e-spec.ts` / `resource-hierarchy.e2e-spec.ts`).
 */
const hasDatabase = Boolean(process.env.DATABASE_URL);
const ORIGIN = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';

interface Actor {
  agent: ReturnType<typeof request.agent>;
  userId: string;
}

describe.skipIf(!hasDatabase)('Library search / filter (e2e)', () => {
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

  async function resetDatabase(): Promise<void> {
    // Weighted steps hold `activity_id` (ADR-0044 §33), and they are the THIRD table to fail this
    // way — after `plan_shares` and `resource_assignments` (`docs/TECH_DEBT.md` #119a). Found the
    // same way and recorded here rather than in one file: a full API run on 2026-08-31 failed 282
    // tests across 10 files in `beforeEach` on `activity_steps_activity_id_fkey`, and by the time
    // anyone looked the database was clean, because a later suite in the same run had swept it.
    // The log was kept, which is the only reason this was diagnosable at all.
    // Baselines and their snapshot rows hold `plan_id` / `baseline_id` (ADR-0025), and they are the
    // FOURTH table to fail this way — after `plan_shares`, `resource_assignments` and
    // `activity_steps` (`docs/TECH_DEBT.md` #119a). Found on 2026-09-01, when a full API run failed
    // all 45 tests in `activities.e2e-spec.ts` on `baselines_plan_id_fkey`: 25 of 33 plan-sweeping
    // specs deleted plans without deleting baselines first, so a baseline surviving in the shared
    // `app_test` poisons whichever spec sweeps next. **Which writer left it is not claimed** — the
    // log names the constraint and not the producer, and every in-suite creator sweeps (directly, or
    // via `clearDomainData`), so the residue came from outside this run: an earlier aborted run or a
    // Playwright journey against the same database, exactly as #119a's 2026-08-28 entry describes.
    // Diagnosed the same day only because `scripts/e2e-local.sh` tees the whole log to a file — the
    // observer piped the command through `tail` exactly as that row warns them not to, and the
    // mechanism caught what the habit lost. That is ADR-0058 working as advertised.
    await prisma.baselineAssignment.deleteMany();
    await prisma.baselineActivity.deleteMany();
    await prisma.baseline.deleteMany();
    await prisma.activityStep.deleteMany();
    await prisma.resourceAssignment.deleteMany();
    await prisma.resource.updateMany({ data: { parentId: null } });
    // **The shared list, not a private copy** (`docs/TECH_DEBT.md` #119a). This hand-rolled its own
    // sweep and omitted `plan_shares`, so `plan.deleteMany()` died on `plan_shares_plan_id_fkey`
    // whenever a Playwright run left a share behind on the same database — the failure that took all
    // 45 of `activities.e2e-spec.ts` down. `clearDomainData` is a strict superset in the same
    // deepest-first order, ending identically, and it handles the append-only audit triggers itself.
    await clearDomainData(prisma);
  }

  afterAll(async () => {
    await resetDatabase().catch(() => undefined);
    await app?.close();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  const server = () => app.getHttpServer();
  const calendarsUrl = '/api/v1/organizations/acme/calendars';
  const resourcesUrl = '/api/v1/organizations/acme/resources';

  async function signUp(email: string): Promise<Actor> {
    const agent = request.agent(server());
    const res = await agent
      .post('/api/auth/sign-up/email')
      .set('Origin', ORIGIN)
      .send({ name: email.split('@')[0], email, password: PASSWORD })
      .expect(200);
    return { agent, userId: (res.body as { user: { id: string } }).user.id };
  }

  async function adminWithOrg(
    email = 'admin@example.com',
    name = 'Acme',
  ): Promise<{ actor: Actor; orgId: string; slug: string }> {
    const actor = await signUp(email);
    const res = await actor.agent.post('/api/v1/organizations').send({ name }).expect(201);
    return { actor, orgId: res.body.data.id as string, slug: res.body.data.slug as string };
  }

  async function createCalendar(
    actor: Actor,
    name: string,
    slug = 'acme',
  ): Promise<{ id: string; version: number }> {
    const res = await actor.agent
      .post(`/api/v1/organizations/${slug}/calendars`)
      .send({ name, workingWeekdays: STANDARD_WEEKDAYS_MASK })
      .expect(201);
    return { id: res.body.data.id as string, version: res.body.data.version as number };
  }

  async function createResource(
    actor: Actor,
    body: Record<string, unknown>,
    slug = 'acme',
  ): Promise<{ id: string; version: number }> {
    const res = await actor.agent
      .post(`/api/v1/organizations/${slug}/resources`)
      .send(body)
      .expect(201);
    return { id: res.body.data.id as string, version: res.body.data.version as number };
  }

  // -------------------------------------------------------------------------
  // `?q=` — name search (calendars) / name-or-code search (resources)
  // -------------------------------------------------------------------------

  it('filters calendars by ?q= — case-insensitive, trimmed, whitespace-only ⇒ no filter', async () => {
    const { actor } = await adminWithOrg();
    await createCalendar(actor, 'Winter Shutdown 25/26');
    await createCalendar(actor, 'Summer Hours');
    // Plus the org's seeded 'Standard'.

    const hit = await actor.agent.get(`${calendarsUrl}?q=winter`).expect(200);
    expect((hit.body.data as { name: string }[]).map((c) => c.name)).toEqual([
      'Winter Shutdown 25/26',
    ]);

    // Mixed-case, substring in the middle.
    const substring = await actor.agent.get(`${calendarsUrl}?q=SHUTDOWN`).expect(200);
    expect((substring.body.data as { name: string }[]).map((c) => c.name)).toEqual([
      'Winter Shutdown 25/26',
    ]);

    const noMatch = await actor.agent.get(`${calendarsUrl}?q=nonexistent`).expect(200);
    expect(noMatch.body.data).toHaveLength(0);

    // A whitespace-only term is no search at all — the full (default) list comes back.
    const blank = await actor.agent
      .get(`${calendarsUrl}?q=${encodeURIComponent('   ')}`)
      .expect(200);
    expect(blank.body.data).toHaveLength(3);
  });

  it('422s a ?q= over the max length (calendars and resources)', async () => {
    const { actor } = await adminWithOrg();
    const tooLong = 'x'.repeat(LIBRARY_SEARCH_MAX_LENGTH + 1);
    await actor.agent.get(`${calendarsUrl}?q=${tooLong}`).expect(422);
    await actor.agent.get(`${resourcesUrl}?q=${tooLong}`).expect(422);
    // Exactly at the limit is fine.
    const atLimit = 'x'.repeat(LIBRARY_SEARCH_MAX_LENGTH);
    await actor.agent.get(`${calendarsUrl}?q=${atLimit}`).expect(200);
  });

  it('filters resources by ?q= matching NAME OR CODE, case-insensitively', async () => {
    const { actor } = await adminWithOrg();
    await createResource(actor, { name: 'Excavator Crew', code: 'EXC-1', kind: 'EQUIPMENT' });
    await createResource(actor, { name: 'Concrete Crew', code: 'CONC-9', kind: 'LABOUR' });
    await createResource(actor, { name: 'Something Else', code: 'EXC-SPARE', kind: 'MATERIAL' });

    // Matches by NAME.
    const byName = await actor.agent.get(`${resourcesUrl}?q=excavator`).expect(200);
    expect((byName.body.data as { name: string }[]).map((r) => r.name)).toEqual(['Excavator Crew']);

    // Matches by CODE, on a row whose NAME does not match.
    const byCode = await actor.agent.get(`${resourcesUrl}?q=exc-spare`).expect(200);
    expect((byCode.body.data as { name: string }[]).map((r) => r.name)).toEqual(['Something Else']);

    // A term that hits BOTH a name and a different row's code returns the union.
    const both = await actor.agent.get(`${resourcesUrl}?q=exc`).expect(200);
    expect((both.body.data as { name: string }[]).map((r) => r.name).sort()).toEqual([
      'Excavator Crew',
      'Something Else',
    ]);
  });

  // -------------------------------------------------------------------------
  // `?kind=` (resources) and the tri-state `?archived=`, and their composition
  // -------------------------------------------------------------------------

  it('filters resources by ?kind=, including GROUP', async () => {
    const { actor } = await adminWithOrg();
    await createResource(actor, { name: 'Crew', kind: 'LABOUR' });
    await createResource(actor, { name: 'Crane', kind: 'EQUIPMENT' });
    await createResource(actor, { name: 'Concrete', kind: 'MATERIAL' });
    await createResource(actor, { name: 'Groundworks', kind: 'GROUP' });

    const labour = await actor.agent.get(`${resourcesUrl}?kind=LABOUR`).expect(200);
    expect((labour.body.data as { name: string }[]).map((r) => r.name)).toEqual(['Crew']);

    const groups = await actor.agent.get(`${resourcesUrl}?kind=GROUP`).expect(200);
    expect((groups.body.data as { name: string }[]).map((r) => r.name)).toEqual(['Groundworks']);
  });

  it('tri-states ?archived= exclude/include/only on both libraries', async () => {
    const { actor } = await adminWithOrg();
    const { id: activeResId } = await createResource(actor, { name: 'Active R', kind: 'LABOUR' });
    const { id: archivedResId, version: archivedResVersion } = await createResource(actor, {
      name: 'Archived R',
      kind: 'LABOUR',
    });
    await actor.agent
      .post(`${resourcesUrl}/${archivedResId}/archive`)
      .send({ version: archivedResVersion })
      .expect(204);

    const { id: activeCalId } = await createCalendar(actor, 'Active Cal');
    const { id: archivedCalId, version: archivedCalVersion } = await createCalendar(
      actor,
      'Archived Cal',
    );
    await actor.agent
      .post(`${calendarsUrl}/${archivedCalId}/archive`)
      .send({ version: archivedCalVersion })
      .expect(204);

    const resExclude = await actor.agent.get(`${resourcesUrl}?archived=exclude`).expect(200);
    expect((resExclude.body.data as { id: string }[]).map((r) => r.id)).toEqual([activeResId]);
    const resInclude = await actor.agent.get(`${resourcesUrl}?archived=include`).expect(200);
    expect((resInclude.body.data as { id: string }[]).map((r) => r.id).sort()).toEqual(
      [activeResId, archivedResId].sort(),
    );
    const resOnly = await actor.agent.get(`${resourcesUrl}?archived=only`).expect(200);
    expect((resOnly.body.data as { id: string }[]).map((r) => r.id)).toEqual([archivedResId]);

    const calExclude = await actor.agent.get(`${calendarsUrl}?archived=exclude`).expect(200);
    // The seeded 'Standard' calendar plus the active one just created.
    expect((calExclude.body.data as { id: string }[]).map((c) => c.id)).toContain(activeCalId);
    expect((calExclude.body.data as { id: string }[]).map((c) => c.id)).not.toContain(
      archivedCalId,
    );
    const calOnly = await actor.agent.get(`${calendarsUrl}?archived=only`).expect(200);
    expect((calOnly.body.data as { id: string }[]).map((c) => c.id)).toEqual([archivedCalId]);
  });

  it('composes ?q= + ?archived= + ?kind= (resources) without one clobbering another', async () => {
    const { actor } = await adminWithOrg();
    const { id: keep } = await createResource(actor, { name: 'Tower Crane', kind: 'EQUIPMENT' });
    const { id: archivedMatch, version: archivedMatchVersion } = await createResource(actor, {
      name: 'Tower Crane (old)',
      kind: 'EQUIPMENT',
    });
    await actor.agent
      .post(`${resourcesUrl}/${archivedMatch}/archive`)
      .send({ version: archivedMatchVersion })
      .expect(204);
    // A row that matches the search term but the WRONG kind — must be excluded.
    await createResource(actor, { name: 'Tower Crane Crew', kind: 'LABOUR' });
    // A row of the right kind and archived state but that does NOT match the search term.
    await createResource(actor, { name: 'Bulldozer', kind: 'EQUIPMENT' });

    const combined = await actor.agent
      .get(`${resourcesUrl}?q=tower crane&kind=EQUIPMENT&archived=only`)
      .expect(200);
    expect((combined.body.data as { id: string }[]).map((r) => r.id)).toEqual([archivedMatch]);

    const combinedActiveOnly = await actor.agent
      .get(`${resourcesUrl}?q=tower crane&kind=EQUIPMENT&archived=exclude`)
      .expect(200);
    expect((combinedActiveOnly.body.data as { id: string }[]).map((r) => r.id)).toEqual([keep]);
  });

  it('composes ?q= + ?scope= (calendars) without one clobbering another', async () => {
    const { actor, projectId } = await (async () => {
      const ctx = await adminWithOrg();
      const client = await prisma.client.create({
        data: { organizationId: ctx.orgId, name: 'C', createdBy: ctx.actor.userId },
      });
      const project = await prisma.project.create({
        data: {
          organizationId: ctx.orgId,
          clientId: client.id,
          name: 'P',
          createdBy: ctx.actor.userId,
        },
      });
      return { ...ctx, projectId: project.id };
    })();

    await actor.agent
      .post(calendarsUrl)
      .send({
        name: 'Winter Local',
        workingWeekdays: STANDARD_WEEKDAYS_MASK,
        scope: 'PROJECT',
        projectId,
      })
      .expect(201);
    await createCalendar(actor, 'Winter Shared');
    await createCalendar(actor, 'Summer Shared');

    // Default scope=org: only the shared Winter calendar matches (project one excluded by tier).
    const orgScoped = await actor.agent.get(`${calendarsUrl}?q=winter`).expect(200);
    expect((orgScoped.body.data as { name: string }[]).map((c) => c.name)).toEqual([
      'Winter Shared',
    ]);

    // scope=all: both Winter calendars match, the Summer one does not.
    const allScoped = await actor.agent.get(`${calendarsUrl}?q=winter&scope=all`).expect(200);
    expect((allScoped.body.data as { name: string }[]).map((c) => c.name).sort()).toEqual([
      'Winter Local',
      'Winter Shared',
    ]);
  });

  // -------------------------------------------------------------------------
  // Pagination correctness under a filter — the anti-truncation regression
  // -------------------------------------------------------------------------

  it('pages a filtered resource list to completeness with no truncation and no duplicates', async () => {
    const { actor } = await adminWithOrg();
    const matchingNames = Array.from(
      { length: 23 },
      (_, i) => `Crane Unit ${String(i).padStart(2, '0')}`,
    );
    for (const name of matchingNames) {
      await createResource(actor, { name, kind: 'EQUIPMENT' });
    }
    // Noise: matches neither the search term nor should ever appear in the paged union.
    await createResource(actor, { name: 'Bulldozer', kind: 'EQUIPMENT' });
    await createResource(actor, { name: 'Crew', kind: 'LABOUR' });

    const seenIds = new Set<string>();
    const seenNames: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    for (;;) {
      pages += 1;
      expect(pages).toBeLessThan(20); // guard against an infinite loop if hasMore never clears
      const query = new URLSearchParams({ q: 'Crane Unit', limit: '7' });
      if (cursor) query.set('cursor', cursor);
      const res = await actor.agent.get(`${resourcesUrl}?${query.toString()}`).expect(200);
      const items = res.body.data as { id: string; name: string }[];
      for (const item of items) {
        expect(seenIds.has(item.id)).toBe(false); // no duplicates across pages
        seenIds.add(item.id);
        seenNames.push(item.name);
      }
      const meta = res.body.meta as { nextCursor: string | null; hasMore: boolean };
      if (!meta.hasMore) break;
      expect(meta.nextCursor).not.toBeNull();
      cursor = meta.nextCursor as string;
    }

    // The union is exactly the matching set — nothing truncated, nothing extra.
    expect(seenNames.sort()).toEqual([...matchingNames].sort());
    expect(seenIds.size).toBe(matchingNames.length);
  });

  it('pages a filtered calendar list to completeness with no truncation and no duplicates', async () => {
    const { actor } = await adminWithOrg();
    const matchingNames = Array.from(
      { length: 21 },
      (_, i) => `Shutdown Week ${String(i).padStart(2, '0')}`,
    );
    for (const name of matchingNames) {
      await createCalendar(actor, name);
    }
    await createCalendar(actor, 'Unrelated');

    const seenIds = new Set<string>();
    const seenNames: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    for (;;) {
      pages += 1;
      expect(pages).toBeLessThan(20);
      const query = new URLSearchParams({ q: 'Shutdown Week', limit: '6' });
      if (cursor) query.set('cursor', cursor);
      const res = await actor.agent.get(`${calendarsUrl}?${query.toString()}`).expect(200);
      const items = res.body.data as { id: string; name: string }[];
      for (const item of items) {
        expect(seenIds.has(item.id)).toBe(false);
        seenIds.add(item.id);
        seenNames.push(item.name);
      }
      const meta = res.body.meta as { nextCursor: string | null; hasMore: boolean };
      if (!meta.hasMore) break;
      expect(meta.nextCursor).not.toBeNull();
      cursor = meta.nextCursor as string;
    }

    expect(seenNames.sort()).toEqual([...matchingNames].sort());
    expect(seenIds.size).toBe(matchingNames.length);
  });

  // -------------------------------------------------------------------------
  // Cross-org isolation
  // -------------------------------------------------------------------------

  it('never leaks another organisation’s rows into a search, archived or not', async () => {
    const { actor } = await adminWithOrg();
    await createResource(actor, { name: 'Shared Term Crew', kind: 'LABOUR' });
    const { id: activeCalId } = await createCalendar(actor, 'Shared Term Calendar');

    const other = await adminWithOrg('outsider@example.com', 'Other Co');
    const { id: otherResId, version: otherResVersion } = await createResource(
      other.actor,
      { name: 'Shared Term Crew', kind: 'LABOUR' },
      other.slug,
    );
    await other.actor.agent
      .post(`/api/v1/organizations/${other.slug}/resources/${otherResId}/archive`)
      .send({ version: otherResVersion })
      .expect(204);
    const { id: otherCalId, version: otherCalVersion } = await createCalendar(
      other.actor,
      'Shared Term Calendar',
      other.slug,
    );
    await other.actor.agent
      .post(`/api/v1/organizations/${other.slug}/calendars/${otherCalId}/archive`)
      .send({ version: otherCalVersion })
      .expect(204);

    const res = await actor.agent.get(`${resourcesUrl}?q=Shared Term&archived=include`).expect(200);
    expect((res.body.data as { id: string }[]).map((r) => r.id)).not.toContain(otherResId);

    const cal = await actor.agent.get(`${calendarsUrl}?q=Shared Term&archived=include`).expect(200);
    const calIds = (cal.body.data as { id: string }[]).map((c) => c.id);
    expect(calIds).toContain(activeCalId);
    expect(calIds).not.toContain(otherCalId);
  });
});
