#!/usr/bin/env node
/**
 * **Every package in the resolved tree carries a licence somebody allowed by name.**
 *
 * `docs/specs/delivery-gates/` M4. Nothing here has ever checked: a dependency arriving under a
 * copyleft licence would have been installed, bundled and shipped, and failed nothing.
 *
 * ## An allow-list, never a deny-list
 *
 * A deny-list is silent about the licence nobody thought of, which is precisely the one that
 * matters. Anything the policy does not name — including a licence this parser cannot resolve — is
 * **unknown, and unknown fails**. That is the whole design: the gate's default answer is no.
 *
 * ## Whole tree, one tier, blocking (CQ-3)
 *
 * Not `--prod` only. A build tool can contaminate its output, so "it never ships" is an argument
 * this gate accepts only as a written exemption naming who checked. One tier because two would
 * need two scripts: `report()`'s `advisory` flag lowers a gate's whole exit code, so carrying a
 * dev tier as a warning would downgrade the runtime findings with it.
 *
 * ## The tool, and its shape
 *
 * `pnpm licenses list --json` (pnpm 10.4.1): an object keyed by SPDX identifier, each value an
 * array of `{ name, versions, paths, license, ... }`. That shape is **asserted** before anything is
 * read from it — a parse that silently yields nothing would report a clean tree, which is the
 * failure mode every other gate in this repository is built against.
 *
 * ## Three blind spots, stated rather than implied
 *
 *   1. It reads the **manifest-declared** licence. A package whose `license` field disagrees with
 *      its own LICENSE file is reported as its field says.
 *   2. It sees **packages**, not vendored code. Source copied into this repository under someone
 *      else's licence is invisible here.
 *   3. It says nothing about **attribution or NOTICE obligations** — whether a permitted licence's
 *      conditions are actually being met is a human question, and `licence-policy.json` carries the
 *      reasoning for the two that have any (MPL-2.0, CC-BY-4.0).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { report } from './lib/doc-register.mjs';

const NAME = 'check:licenses';
const root = new URL('..', import.meta.url).pathname;

/**
 * Resolve an SPDX expression against the allow-list.
 *
 * `OR` — any disjunct allowed is enough, which is what a dual-licensed package offers the consumer.
 * `AND` — every conjunct must be allowed, because the consumer is bound by all of them.
 * Anything else (a `WITH` exception, a nested mix this does not parse, an identifier not in the
 * list) is **unknown**, and unknown fails. Deliberately conservative: a licence this cannot read is
 * a licence nobody has read.
 */
export function isAllowed(expression, allow) {
  const expr = String(expression ?? '')
    .trim()
    .replace(/^\(|\)$/g, '')
    .trim();
  if (expr === '') return false;
  if (allow.has(expr)) return true;
  if (/ OR /i.test(expr) && !/ AND /i.test(expr)) {
    return expr.split(/ OR /i).some((part) => isAllowed(part, allow));
  }
  if (/ AND /i.test(expr) && !/ OR /i.test(expr)) {
    return expr.split(/ AND /i).every((part) => isAllowed(part, allow));
  }
  return false;
}

/** Run the gate against a tree, returning the exit code. `readTree` is injected so the suite can. */
export function runGate({ readTree, policyPath } = {}) {
  const problems = [];

  const policy = JSON.parse(
    readFileSync(policyPath ?? new URL('licence-policy.json', import.meta.url), 'utf8'),
  );

  const KNOWN_KEYS = new Set(['_', 'measuredAt', 'measuredBy', 'allow', 'exempt']);
  for (const key of Object.keys(policy)) {
    if (!KNOWN_KEYS.has(key)) {
      problems.push(
        `licence-policy.json has an unknown key "${key}". This gate reads a fixed set; a key it ` +
          'does not read is a policy nobody is enforcing.',
      );
    }
  }

  const allow = new Set(Object.keys(policy.allow ?? {}));
  const exempt = policy.exempt ?? {};

  let tree;
  try {
    tree = readTree ? readTree() : JSON.parse(runPnpm());
  } catch (error) {
    problems.push(
      `could not read the dependency tree: ${error instanceof Error ? error.message : error}\n` +
        '      The command is `pnpm licenses list --json` (written for pnpm 10.4.1). If its output ' +
        'shape has changed, fix this gate — do not delete it.',
    );
    return report({ name: NAME, problems, population: 0 });
  }

  // The shape assertion. An unexpected shape yields an empty walk, and an empty walk reports a
  // clean tree — the exact false green this whole file exists to prevent.
  if (tree === null || typeof tree !== 'object' || Array.isArray(tree)) {
    problems.push(
      'pnpm licenses list --json did not return an object keyed by licence identifier. ' +
        `It returned ${Array.isArray(tree) ? 'an array' : typeof tree}.`,
    );
    return report({ name: NAME, problems, population: 0 });
  }

  let population = 0;
  const seen = new Set();
  for (const [licence, packages] of Object.entries(tree)) {
    if (!Array.isArray(packages)) {
      problems.push(`the entry for "${licence}" is not an array of packages.`);
      continue;
    }
    for (const pkg of packages) {
      population += 1;
      const name = typeof pkg?.name === 'string' ? pkg.name : '(unnamed)';
      seen.add(name);

      // Workspace packages are this repository's own, `private: true` and unpublished. Asserted
      // by name rather than assumed: a `@repo/*` that ever became publishable would need a licence
      // like anything else, and skipping it silently is how that would go unnoticed.
      if (name.startsWith('@repo/')) continue;

      if (typeof exempt[name] === 'string' && exempt[name].trim() !== '') continue;
      if (isAllowed(licence, allow)) continue;

      problems.push(
        `${name} (${(pkg?.versions ?? []).join(', ') || '?'}) is "${licence}", which the policy ` +
          'does not allow.\n' +
          '      Two remedies: add the identifier to `allow` in scripts/licence-policy.json WITH ' +
          'the reasoning, or — if this one package is acceptable for a reason specific to it — add ' +
          'it to `exempt` naming who read its repository and when. Neither is a formality.',
      );
    }
  }

  // A stale exemption is an exemption nobody is reading.
  for (const name of Object.keys(exempt)) {
    if (name === '_' || seen.has(name)) continue;
    problems.push(
      `scripts/licence-policy.json exempts ${name}, which is not in the tree any more. Delete it.`,
    );
  }

  return report({
    name: NAME,
    problems,
    // ADR-0093: an empty tree satisfies every loop above perfectly, and a green run could not then
    // tell "every licence is allowed" from "no packages were found".
    population,
    summary: `${population} resolved packages, ${Object.keys(tree).length} distinct licence identifiers, ${Object.keys(exempt).length - 1} exemption(s).`,
  });
}

function runPnpm() {
  return execFileSync('pnpm', ['licenses', 'list', '--json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
}

if (process.argv[1] && process.argv[1].endsWith('check-licenses.mjs')) {
  process.exit(runGate());
}
