import { PrismaClient, type Prisma } from '@prisma/client';

import { chunkIds } from '../common/db/id-chunks';
import {
  ACTIVITY_BUDGET_PER_RUN,
  SCOPE_BUDGET_PER_RUN,
  resolveExpiryScope,
  selectExpiryCandidates,
  type ExpiryKind,
  type ExpiryReader,
  type ExpiryRoot,
} from '../common/hierarchy/hierarchy-expiry.candidates';
import { validateEnv } from '../config/env.validation';

/**
 * **`clear-out-preview` — what the recycle bin's clear-out would permanently remove, read-only.**
 *
 * Run by the operator in the stack folder:
 * `docker compose exec api node dist/cli/clear-out-preview.js`
 * (ADR-0193 D1; `apps/api/Dockerfile` copies `dist`, so nothing else ships it).
 *
 * ## Three properties, each pinned by `src/cli/clear-out-preview.structural.spec.ts`
 *
 * 1. **One derivation.** The list comes from {@link selectExpiryCandidates}, the function the hourly
 *    sweep calls, so the preview cannot promise less than the sweep deletes.
 * 2. **It cannot start the application.** No Nest, no `AppModule`: constructing the expiry service
 *    with the switch on would start a second sweep in this process. This file talks to a bare
 *    `PrismaClient` and imports only the pure selector.
 * 3. **Its session refuses writes.** One connection, made read-only as its first statement and
 *    verified, so a bug here is a Postgres error rather than a deletion.
 *
 * ## Output goes to stdout only
 *
 * It prints customer names, which is why it never uses the application logger: the log is a rotated
 * file on the host, and the names belong in the operator's terminal and nowhere durable.
 */

/** How many items are printed per list before the rest are summarised. */
export const PREVIEW_ROW_CAP = 200;
/** The look-ahead list's horizon. */
export const DUE_SOON_DAYS = 7;
const DAY_MS = 86_400_000;

export interface PreviewSettings {
  enabled: boolean;
  retentionDays: number;
  sweepIntervalMinutes: number;
}

export interface PreviewItem {
  kind: ExpiryKind;
  id: string;
  name: string;
  organizationId: string;
  deletedAt: Date;
  /** Whole days since the period ran out (negative: still to run). */
  daysPast: number;
  projects: number;
  plans: number;
  activities: number;
  overdue: boolean;
}

export interface PreviewData {
  now: Date;
  settings: PreviewSettings;
  organizations: Map<string, string>;
  due: PreviewItem[];
  dueSoon: PreviewItem[];
}

type PreviewReader = ExpiryReader & Pick<Prisma.TransactionClient, 'activity' | 'organization'>;

/**
 * Activities in a scope, counted the way the runner deletes them: by plan, chunked.
 *
 * soft-delete: any-state — the runner deletes every activity of the plan, deleted ones included.
 */
async function countActivities(reader: PreviewReader, planIds: readonly string[]): Promise<number> {
  let total = 0;
  for (const chunk of chunkIds(planIds)) {
    total += await reader.activity.count({ where: { planId: { in: chunk } } });
  }
  return total;
}

async function describeRoot(
  reader: PreviewReader,
  root: ExpiryRoot,
  now: Date,
  settings: PreviewSettings,
): Promise<PreviewItem> {
  const scope = await resolveExpiryScope(reader, root);
  const dueAt = root.deletedAt.getTime() + settings.retentionDays * DAY_MS;
  const pastMs = now.getTime() - dueAt;
  return {
    kind: root.kind,
    id: root.id,
    name: root.name,
    organizationId: root.organizationId,
    deletedAt: root.deletedAt,
    daysPast: pastMs >= 0 ? Math.floor(pastMs / DAY_MS) : -Math.ceil(-pastMs / DAY_MS),
    projects: scope.projectIds.length,
    plans: scope.planIds.length,
    activities: await countActivities(reader, scope.planIds),
    // A removal that has not happened a full day plus one interval after it was due is not just
    // waiting its turn in a large backlog: something is stopping it (the sweep escalates this at ERROR).
    overdue: settings.enabled && pastMs > DAY_MS + settings.sweepIntervalMinutes * 60_000,
  };
}

/**
 * Everything the preview prints, gathered with reads only.
 *
 * soft-delete: any-state — organisations are named whatever their own state; the list is of work.
 * Exported so the end-to-end suite can run
 * it on the same database and instant as the sweep and compare the two sets.
 */
export async function collectPreview(
  reader: PreviewReader,
  now: Date,
  settings: PreviewSettings,
): Promise<PreviewData> {
  const cutoff = new Date(now.getTime() - settings.retentionDays * DAY_MS);
  const soonCutoff = new Date(cutoff.getTime() + DUE_SOON_DAYS * DAY_MS);

  const dueRoots = await selectExpiryCandidates(reader, { cutoff });
  const dueIds = new Set(dueRoots.map((r) => `${r.kind}:${r.id}`));
  const soonRoots = (await selectExpiryCandidates(reader, { cutoff: soonCutoff })).filter(
    (r) => !dueIds.has(`${r.kind}:${r.id}`),
  );

  const due: PreviewItem[] = [];
  for (const root of dueRoots) due.push(await describeRoot(reader, root, now, settings));
  const dueSoon: PreviewItem[] = [];
  for (const root of soonRoots) dueSoon.push(await describeRoot(reader, root, now, settings));

  const orgIds = [...new Set([...due, ...dueSoon].map((i) => i.organizationId))];
  const organizations = new Map<string, string>();
  for (const chunk of chunkIds(orgIds)) {
    const rows = await reader.organization.findMany({
      where: { id: { in: chunk } },
      select: { id: true, name: true },
    });
    for (const row of rows) organizations.set(row.id, row.name);
  }

  return { now, settings, organizations, due, dueSoon };
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function utcMinute(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function contents(item: PreviewItem): string {
  const parts: string[] = [];
  if (item.kind === 'client') parts.push(plural(item.projects, 'project'));
  if (item.kind !== 'plan') parts.push(plural(item.plans, 'plan'));
  parts.push(plural(item.activities, 'activity', 'activities'));
  return `with ${parts.join(', ')}`;
}

function when(item: PreviewItem, due: boolean): string {
  const date = item.deletedAt.toISOString().slice(0, 10);
  if (!due) return `deleted ${date} (due in ${plural(-item.daysPast, 'day')})`;
  return `deleted ${date} (${plural(item.daysPast, 'day')} past)`;
}

function renderList(data: PreviewData, items: PreviewItem[], due: boolean): string[] {
  const shown = items
    .slice()
    .sort((a, b) => a.deletedAt.getTime() - b.deletedAt.getTime())
    .slice(0, PREVIEW_ROW_CAP);
  const byOrg = new Map<string, PreviewItem[]>();
  for (const item of shown) {
    const list = byOrg.get(item.organizationId) ?? [];
    list.push(item);
    byOrg.set(item.organizationId, list);
  }
  const lines: string[] = [];
  const orgName = (id: string) => data.organizations.get(id) ?? id;
  for (const [orgId, list] of [...byOrg].sort((a, b) =>
    orgName(a[0]).localeCompare(orgName(b[0])),
  )) {
    lines.push(`Organisation "${orgName(orgId)}"`);
    for (const item of list) {
      const kind = item.kind.charAt(0).toUpperCase() + item.kind.slice(1);
      const flag = item.overdue ? '  OVERDUE — send this output to the maintainers' : '';
      lines.push(
        `  ${kind.padEnd(7)} "${item.name}"  ${when(item, due)}  ${contents(item)}${flag}`,
      );
    }
  }
  if (items.length > shown.length) {
    lines.push(
      `…and ${items.length - shown.length} more not listed here (the oldest ${PREVIEW_ROW_CAP} are shown; the totals include all).`,
    );
  }
  return lines;
}

function totals(items: PreviewItem[]): string {
  const roots = (kind: ExpiryKind) => items.filter((i) => i.kind === kind).length;
  const rootPart = (['client', 'project', 'plan'] as const)
    .filter((k) => roots(k) > 0)
    .map((k) => plural(roots(k), k))
    .join(', ');
  const projects = items.reduce((n, i) => n + i.projects, 0);
  const plans = items.reduce((n, i) => n + i.plans, 0);
  const activities = items.reduce((n, i) => n + i.activities, 0);
  return `${rootPart} (${plural(projects, 'project')}, ${plural(plans, 'plan')}, ${plural(activities, 'activity', 'activities')})`;
}

/** The whole report, as the operator reads it. Pure: no clock, no database. */
export function renderPreview(data: PreviewData): string {
  const { settings, due, dueSoon, now } = data;
  const out: string[] = [];
  out.push(`SchedulePoint clear-out preview — ${utcMinute(now)}`);
  out.push(
    settings.enabled
      ? `The clear-out is ON on this server. Period: ${plural(settings.retentionDays, 'day')}.`
      : `The clear-out is OFF on this server. Period: ${plural(settings.retentionDays, 'day')}.`,
  );
  out.push('');

  if (due.length === 0) {
    out.push(
      `Nothing is past its ${plural(settings.retentionDays, 'day')}. Nothing ${
        settings.enabled
          ? 'is waiting to be removed'
          : 'would be removed if it were switched on now'
      }.`,
    );
  } else {
    out.push(
      settings.enabled
        ? 'Still waiting to be removed:'
        : 'If it were switched on now, these would be permanently removed:',
    );
    out.push('');
    out.push(...renderList(data, due, true));
  }

  if (dueSoon.length > 0) {
    out.push('');
    out.push(`Due within the next ${DUE_SOON_DAYS} days:`);
    out.push(...renderList(data, dueSoon, false));
  }

  if (due.length > 0) {
    out.push('');
    out.push(`Total now: ${totals(due)}.`);
    const activities = due.reduce((n, i) => n + i.activities, 0);
    const runs = Math.max(
      Math.ceil(due.length / SCOPE_BUDGET_PER_RUN),
      Math.ceil(activities / ACTIVITY_BUDGET_PER_RUN),
      1,
    );
    out.push(
      runs > 1
        ? `The first run takes only part of it: expect at least ${runs} hourly runs to clear it.`
        : 'The first run takes all of it.',
    );
  }
  out.push('Nothing has been changed.');
  return `${out.join('\n')}\n`;
}

/**
 * A client on ONE connection whose session is read-only from its first statement.
 *
 * One connection, because `SET SESSION CHARACTERISTICS` belongs to the connection that ran it: on a
 * pool, a later query could land on a writable one. The setting is then read back and the command
 * refuses to continue unless it took, so "read-only" is a fact it checked rather than assumed.
 */
export async function openReadOnlyClient(databaseUrl: string): Promise<PrismaClient> {
  const url = new URL(databaseUrl);
  url.searchParams.set('connection_limit', '1');
  const client = new PrismaClient({ datasourceUrl: url.toString(), log: [] });
  try {
    await client.$executeRaw`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`;
    const rows = await client.$queryRaw<
      { transaction_read_only: string }[]
    >`SHOW transaction_read_only`;
    if (rows[0]?.transaction_read_only !== 'on') {
      throw new Error('the database session did not become read-only');
    }
  } catch (error) {
    await client.$disconnect();
    throw error;
  }
  return client;
}

/** A Prisma error's code (initialisation errors name it `errorCode`), else the error's class. */
function errorCode(error: unknown): string {
  const { code, errorCode: initCode } = error as { code?: string; errorCode?: string };
  return code ?? initCode ?? (error instanceof Error ? error.name : 'unknown');
}

/** Entry point. Exit codes: 0 report printed, 1 database trouble, 2 invalid settings. */
export async function main(): Promise<number> {
  let env: ReturnType<typeof validateEnv>;
  try {
    env = validateEnv(process.env);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 2;
  }

  let client: PrismaClient;
  try {
    client = await openReadOnlyClient(env.DATABASE_URL);
  } catch (error) {
    const code = errorCode(error);
    process.stderr.write(
      `Could not reach the database (error ${code}). Nothing has been changed.\n`,
    );
    return 1;
  }
  try {
    const data = await collectPreview(client, new Date(), {
      enabled: env.RETENTION_HIERARCHY_ENABLED,
      retentionDays: env.RETENTION_HIERARCHY_DAYS,
      sweepIntervalMinutes: env.RETENTION_SWEEP_INTERVAL_MINUTES,
    });
    process.stdout.write(renderPreview(data));
    return 0;
  } catch (error) {
    // The class of failure only: a Prisma message can quote the query, and names stay off the log.
    const code = errorCode(error);
    process.stderr.write(
      `The preview could not be completed (database error ${code}). Nothing has been changed.\n`,
    );
    return 1;
  } finally {
    await client.$disconnect();
  }
}

if (require.main === module) {
  void main().then((code) => {
    process.exitCode = code;
  });
}
