#!/usr/bin/env node
import { writeFileSync } from 'node:fs';

import { negativeCases, scaleShapeOf, scaleSpec } from '@repo/seed';
import {
  formatNegativeReport,
  formatReport,
  runNegativeCase,
  SeedClient,
  SeedHttpError,
  seedPlan,
  type NegativeResult,
  type SeedReport,
} from '@repo/seed-http';

import { parseArgs, USAGE } from './args.js';
import { coverageReport, formatCoverage } from './capabilities/coverage.js';
import { capabilityFamilyKeys, capabilitySpecs } from './capabilities/index.js';
import { fixtureSpec } from './fixture.js';
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

/**
 * Every plan the catalogue can build, as `tier<TAB>seedName<TAB>name`.
 *
 * The scale tier is parameterised, so it contributes one row at the default size rather than an
 * infinite family — the playbook documents the tier, not each possible count.
 */
function planInventory(): string[] {
  const rows = [fixtureSpec(), ...capabilitySpecs(), scaleSpec({ activities: 500 })].map(
    (spec) => `${spec.tier}\t${spec.seedName}\t${spec.plan.name}`,
  );
  // The negative tier's hosts are throwaway and named per run, so the inventory lists the CASES —
  // which is what a playbook row about hostile input would name.
  for (const negative of negativeCases()) {
    rows.push(`negative\t${negative.id}\t${negative.description}`);
  }
  return rows;
}

async function main(): Promise<number> {
  const { args, coverage, listPlans } = parseArgs(process.argv.slice(2));

  // Reporting mode: answers "does the catalogue cover everything?" without a running instance, a
  // database or credentials. It is a property of the plans, not of any deployment.
  if (coverage) {
    process.stdout.write(`${formatCoverage(coverageReport(capabilitySpecs()))}\n`);
    return 0;
  }

  // Also a reporting mode, and also server-free: what the builders produce is a property of the
  // code, and `pnpm check:playbook` must be runnable in CI with no database and no credentials.
  if (listPlans) {
    for (const line of planInventory()) process.stdout.write(`${line}\n`);
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

  // The negative tier is not a set of plans to seed — it is a set of attempts to make. It has its
  // own runner and its own report, because "which plans were created" is the wrong question about
  // it: the answer worth having is what the API refused.
  if (args.tier === 'negative') {
    // Each case's host is throwaway and plan names are unique per project, so a run needs its own
    // namespace or a re-run collides with itself on every case.
    const runId = args.runId ?? String(Date.now());
    const results: NegativeResult[] = [];
    process.stderr.write(`Negative tier, run ${runId} — 18 hostile attempts.\n`);
    for (const negative of negativeCases(runId)) {
      process.stderr.write(`Attempting ${negative.id}…\n`);
      results.push(
        await runNegativeCase(client, { orgSlug: args.org, projectId: args.project }, negative),
      );
    }
    process.stdout.write(`${formatNegativeReport(results)}\n`);
    if (args.out !== undefined) {
      writeFileSync(args.out, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
      process.stderr.write(`Full report written to ${args.out}\n`);
    }
    // A disagreement is a product finding to read, not a process to fail — the same rule the plan
    // tiers follow. Only a case that never ran exits non-zero, because that one means the run did
    // not answer the question it was asked.
    return results.some((result) => result.outcome === 'INCONCLUSIVE') ? 3 : 0;
  }

  const specs = loadSpecs(args.tier, {
    ...(args.family === undefined ? {} : { family: args.family }),
    ...(args.activities === undefined ? {} : { activities: args.activities }),
  });
  if (specs.length === 0) {
    // Say which of the two names was wrong. "No specs for tier X" when the tier was fine and the
    // family was misspelt sends a reader looking in the wrong place.
    const reason = KNOWN_TIERS.includes(args.tier as (typeof KNOWN_TIERS)[number])
      ? `family "${args.family ?? ''}" — try one of: ${capabilityFamilyKeys().join(', ')}`
      : `tier "${args.tier}" — try one of: ${KNOWN_TIERS.join(', ')}`;
    process.stderr.write(`No plans for ${reason}\n`);
    return 1;
  }

  // A scale plan is thousands of writes, and the API throttles every client at 100 requests per
  // 60 s (`RATE_LIMIT_LIMIT`). The seeder does not raise it and does not route around it — it is an
  // ordinary client, and a seeder that quietly bypassed the limiter would stop measuring the thing
  // being measured. So the cost is stated up front rather than discovered forty minutes in.
  for (const spec of specs.filter((item) => item.tier === 'scale')) {
    const shape = scaleShapeOf(spec);
    const requests =
      shape.leaves +
      shape.summaries +
      shape.dependencies +
      shape.assignments +
      shape.progressed * 2;
    process.stderr.write(
      `${spec.seedName}: ${String(shape.leaves)} activities, ${String(shape.summaries)} WBS ` +
        `summaries, ${String(shape.dependencies)} links (${shape.edgesPerActivity.toFixed(2)} per ` +
        `activity), ${String(shape.assignments)} assignments.\n` +
        `  ≈ ${String(requests)} write requests. At the API's default 100/60 s throttle that is ` +
        `≈ ${String(Math.round(requests / 100))} minutes; raise RATE_LIMIT_LIMIT on an instance ` +
        'you own if you want it sooner.\n',
    );
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
