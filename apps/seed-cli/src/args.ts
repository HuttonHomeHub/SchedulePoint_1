/**
 * `schedulepoint-seed`'s argument surface, in its own module.
 *
 * Split from `main.ts` because that file invokes `main()` at import time — an entry point should —
 * and a test that imports the parser from there would run the whole CLI as a side effect of being
 * loaded. Small module, but the alternative is a test suite that talks to the network.
 */

interface Args {
  url: string;
  org: string;
  project: string;
  email: string;
  password: string;
  tier: string;
  family?: string;
  activities?: number;
  signUpName?: string;
  out?: string;
  concurrency?: number;
  verbose: boolean;
}

export const USAGE = `
schedulepoint-seed — seed the SchedulePoint test catalogue into a running instance (ADR-0066)

Required
  --url <base>        Base URL of the instance, e.g. http://localhost:3000
  --org <slug>        Organisation slug to seed into
  --project <uuid>    Target project id (plans are created under it)
  --email <address>   A Planner or Org Admin in that organisation
  --password <pass>   Their password

Optional
  --tier <name>       fixture | capability | scale | all   (default: fixture)
  --family <name>     Capability tier only: seed just one family (see --coverage for the list)
  --activities <n>    Scale tier only: activities to generate (default 500). A generated plan is
                      deterministic, so the same count always produces the same plan.
  --sign-up <name>    Create the user if sign-in fails. Do NOT use against a shared host.
  --out <file>        Write the full JSON report here as well as summarising it
  --concurrency <n>   Requests in flight (default 6). Raise only against a machine you own.
  --verbose           Log every request

Reporting only (no --url and no writes)
  --coverage          Print which of the fixture's capability keys the capability plans reach,
                      and which are unreachable through the product, with the reason for each

The seeder gets no privileged path. If it cannot create something as a Planner, a Planner cannot
either — that is reported as a FINDING, and the run continues so one gap cannot hide the rest.
`.trim();

/** The value-less switches, so `--coverage --tier capability` does not eat `--tier` as a value. */
const BOOLEAN_FLAGS = new Set(['verbose', 'coverage']);

export interface ParsedArgv {
  args: Args | null;
  /** Reporting mode: print the coverage table and exit without connecting to anything. */
  coverage: boolean;
}

export function parseArgs(argv: readonly string[]): ParsedArgv {
  const flags = new Map<string, string>();
  const switches = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (!token.startsWith('--')) continue;
    const name = token.slice(2);
    if (BOOLEAN_FLAGS.has(name)) {
      switches.add(name);
      continue;
    }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) continue;
    flags.set(name, next);
    i += 1;
  }

  const coverage = switches.has('coverage');
  const required = ['url', 'org', 'project', 'email', 'password'] as const;
  if (required.some((key) => !flags.has(key))) return { args: null, coverage };

  const concurrency = flags.get('concurrency');
  const activities = flags.get('activities');
  return {
    coverage,
    args: {
      url: flags.get('url')!,
      org: flags.get('org')!,
      project: flags.get('project')!,
      email: flags.get('email')!,
      password: flags.get('password')!,
      tier: flags.get('tier') ?? 'fixture',
      ...(flags.has('family') ? { family: flags.get('family')! } : {}),
      ...(activities === undefined ? {} : { activities: Number(activities) }),
      ...(flags.has('sign-up') ? { signUpName: flags.get('sign-up')! } : {}),
      ...(flags.has('out') ? { out: flags.get('out')! } : {}),
      ...(concurrency === undefined ? {} : { concurrency: Number(concurrency) }),
      verbose: switches.has('verbose'),
    },
  };
}
