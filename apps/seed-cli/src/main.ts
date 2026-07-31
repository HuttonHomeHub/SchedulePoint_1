#!/usr/bin/env node
import { writeFileSync } from 'node:fs';

import { parseArgs, USAGE } from './args.js';
import { coverageReport, formatCoverage } from './capabilities/coverage.js';
import { capabilityFamilyKeys, capabilitySpecs } from './capabilities/index.js';
import { SeedClient, SeedHttpError } from './client.js';
import { formatReport, type SeedReport } from './report.js';
import { seedPlan } from './runner.js';
import { KNOWN_TIERS, loadSpecs } from './specs.js';

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

async function main(): Promise<number> {
  const { args, coverage } = parseArgs(process.argv.slice(2));

  // Reporting mode: answers "does the catalogue cover everything?" without a running instance, a
  // database or credentials. It is a property of the plans, not of any deployment.
  if (coverage) {
    process.stdout.write(`${formatCoverage(coverageReport(capabilitySpecs()))}\n`);
    return 0;
  }

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

  const specs = loadSpecs(args.tier, args.family);
  if (specs.length === 0) {
    // Say which of the two names was wrong. "No specs for tier X" when the tier was fine and the
    // family was misspelt sends a reader looking in the wrong place.
    const reason = KNOWN_TIERS.includes(args.tier as (typeof KNOWN_TIERS)[number])
      ? `family "${args.family ?? ''}" — try one of: ${capabilityFamilyKeys().join(', ')}`
      : `tier "${args.tier}" — try one of: ${KNOWN_TIERS.join(', ')}`;
    process.stderr.write(`No plans for ${reason}\n`);
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

  // A failed plan is an exit code; a FINDING is not, and neither is `alreadyExists`. A finding
  // means the product refused something, which is information the run exists to produce — failing
  // the process on it would make an operator stop reading exactly when there is something to read.
  // `alreadyExists` means the plan is there and this run did not create it; exiting non-zero on a
  // re-run into the same project would make the honest case look like a broken one.
  return report.plans.some((plan) => plan.planId === null && !plan.alreadyExists) ? 3 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exit(1);
  });
