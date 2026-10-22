// @ts-check
/**
 * `e2e-local.sh`'s argument split (`docs/TECH_DEBT.md` #308).
 *
 * Only the REFUSALS are exercised here: they happen before the script touches Postgres, a port or a
 * browser, so they are safe to run anywhere. The accepting path starts a database and is covered by
 * actually running a target. Red-first: with the guard removed, the first three cases start the
 * Postgres bootstrap instead of exiting 2 (and fail here on the exit status).
 *
 * Run standalone: `node scripts/e2e-local.test.mjs`
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = join(dirname(fileURLToPath(import.meta.url)), 'e2e-local.sh');

/** @param {string[]} args */
function run(args) {
  // SP_E2E_LOG= keeps the log-capture wrapper from writing a file for a run that exits at once.
  return spawnSync('bash', [script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, SP_E2E_LOG: '' },
    timeout: 20_000,
  });
}

for (const args of [
  ['api', 'web:wbs', '--', 'x.spec.ts'],
  ['web:wbs', 'measure:toolbar', '--', 'x.spec.ts'],
  ['api', '--', '--grep', 'x'],
  ['--', 'x.spec.ts'],
]) {
  const r = run(args);
  assert.equal(r.status, 2, `${args.join(' ')} should be refused, got ${String(r.status)}`);
  assert.match(r.stderr, /exactly one target/, `${args.join(' ')}: message names the rule`);
}

console.log('e2e-local.test: OK');
