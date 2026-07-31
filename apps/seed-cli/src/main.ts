#!/usr/bin/env node
import { writeFileSync } from 'node:fs';

import { SeedClient, SeedHttpError } from './client.js';
import { formatReport, type SeedReport } from './report.js';
import { seedPlan } from './runner.js';
import { loadSpecs } from './specs.js';

/**
 * `schedulepoint-seed` — creates the ADR-0066 test catalogue in a **running** instance, over the
 * public REST API.
 *
 * It is an ordinary client: it signs in, obeys RBAC, and holds the plan edit-lock for structural
 * writes. Nothing here talks to a database. Run it against a dev machine or against the Compose host;
 * the only difference is the URL.
 *
 * ```
 * pnpm --filter @repo/seed-cli seed -- \
 *   --url http://localhost:3000 --org acme --project <uuid> \
 *   --email planner@example.com --password '…' --tier fixture
 * ```
 */

interface Args {
  url: string;
  org: string;
  project: string;
  email: string;
  password: string;
  tier: string;
  signUpName?: string;
  out?: string;
  concurrency?: number;
  verbose: boolean;
}

const USAGE = `
schedulepoint-seed — seed the SchedulePoint test catalogue into a running instance (ADR-0066)

Required
  --url <base>        Base URL of the instance, e.g. http://localhost:3000
  --org <slug>        Organisation slug to seed into
  --project <uuid>    Target project id (plans are created under it)
  --email <address>   A Planner or Org Admin in that organisation
  --password <pass>   Their password

Optional
  --tier <name>       fixture | capability | pairwise | scale | negative | all   (default: fixture)
  --sign-up <name>    Create the user if sign-in fails. Do NOT use against a shared host.
  --out <file>        Write the full JSON report here as well as summarising it
  --concurrency <n>   Requests in flight (default 6). Raise only against a machine you own.
  --verbose           Log every request

The seeder gets no privileged path. If it cannot create something as a Planner, a Planner cannot
either — that is reported as a FINDING, and the run continues so one gap cannot hide the rest.
`.trim();

function parseArgs(argv: readonly string[]): Args | null {
  const flags = new Map<string, string>();
  let verbose = false;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (token === '--verbose') {
      verbose = true;
      continue;
    }
    if (!token.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) continue;
    flags.set(token.slice(2), next);
    i += 1;
  }
  const required = ['url', 'org', 'project', 'email', 'password'] as const;
  if (required.some((key) => !flags.has(key))) return null;
  const concurrency = flags.get('concurrency');
  return {
    url: flags.get('url')!,
    org: flags.get('org')!,
    project: flags.get('project')!,
    email: flags.get('email')!,
    password: flags.get('password')!,
    tier: flags.get('tier') ?? 'fixture',
    ...(flags.has('sign-up') ? { signUpName: flags.get('sign-up')! } : {}),
    ...(flags.has('out') ? { out: flags.get('out')! } : {}),
    ...(concurrency === undefined ? {} : { concurrency: Number(concurrency) }),
    verbose,
  };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args === null) {
    process.stdout.write(`${USAGE}\n`);
    return 1;
  }

  const client = new SeedClient({
    baseUrl: args.url,
    ...(args.concurrency === undefined ? {} : { concurrency: args.concurrency }),
    ...(args.verbose
      ? {
          onRequest: ({ method, path, status, ms }) => {
            process.stderr.write(`  ${method} ${path} → ${status} (${ms} ms)\n`);
          },
        }
      : {}),
  });

  try {
    await client.authenticate({
      email: args.email,
      password: args.password,
      ...(args.signUpName === undefined ? {} : { signUpName: args.signUpName }),
    });
  } catch (error) {
    const message = error instanceof SeedHttpError ? error.message : String(error);
    process.stderr.write(`Could not sign in: ${message}\n`);
    return 2;
  }

  const specs = loadSpecs(args.tier);
  if (specs.length === 0) {
    process.stderr.write(`No specs for tier "${args.tier}".\n`);
    return 1;
  }

  const report: SeedReport = {
    baseUrl: args.url,
    orgSlug: args.org,
    projectId: args.project,
    plans: [],
  };
  // Deliberately sequential: each plan is a big burst of writes, and a seeder that saturates a
  // possibly-production instance to finish sooner is not a well-behaved client.
  for (const spec of specs) {
    process.stderr.write(`Seeding ${spec.seedName}…\n`);
    report.plans.push(await seedPlan(client, { orgSlug: args.org, projectId: args.project }, spec));
  }

  process.stdout.write(`${formatReport(report)}\n`);
  if (args.out !== undefined) {
    writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    process.stderr.write(`Full report written to ${args.out}\n`);
  }

  // A failed plan is an exit code; a FINDING is not. A finding means the product refused something,
  // which is information the run exists to produce — failing the process on it would make an
  // operator stop reading exactly when there is something to read.
  return report.plans.some((plan) => plan.planId === null) ? 3 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(1);
  });
