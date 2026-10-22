// @ts-check
/**
 * `e2e-local.sh`'s argument split (`docs/TECH_DEBT.md` #308).
 *
 * Only the REFUSALS are exercised here: they happen before the script touches Postgres, a port or a
 * browser, so they are safe to run anywhere. The accepting path starts a database and is covered by
 * actually running a target. Red-first: with the guard removed, the first three cases start the
 * Postgres bootstrap instead of exiting 2 (and fail here on the exit status).
 *
 * The run lock (#349) is exercised against STUB `pg_isready`, `su`, `sudo`, `psql` and `pnpm`
 * binaries on PATH, so no database is touched. That proves the script's side of the protocol — it
 * asks for `pg_try_advisory_lock`, refuses on `f` and on silence, proceeds on `t`, and releases its
 * session on exit — and NOT that Postgres grants and releases the lock as expected, which needs a
 * second real run (see the row's closing note).
 *
 * Run standalone: `node scripts/e2e-local.test.mjs`
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

// --- The database run lock (#349) -------------------------------------------------------------
const stubs = mkdtempSync(join(tmpdir(), 'e2e-local-stubs-'));
const stub = (/** @type {string} */ name, /** @type {string} */ body) => {
  writeFileSync(join(stubs, name), `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(join(stubs, name), 0o755);
};
const sessionLog = join(stubs, 'psql-sessions.log');
stub('pg_isready', 'exit 0');
// `su postgres -c` / `sudo -u postgres bash -c`: every bootstrap probe answers "1" and succeeds.
stub('su', 'echo 1');
stub('sudo', 'echo 1');
stub('pnpm', 'exit 0');
// STUB_LOCK picks what the lock session answers: t (granted), f (held elsewhere), dead (no connect).
stub(
  'psql',
  `
if [ "\$1" = "-qtA" ] && [ "\${3:-}" = "-c" ]; then echo "e2e-local[4242] (backend pid 99)"; exit 0; fi
[ "\$STUB_LOCK" = dead ] && exit 2
echo "session-start \$PGAPPNAME" >> "\$SESSION_LOG"
trap 'echo session-end >> "\$SESSION_LOG"' EXIT
IFS= read -r query
echo "\$query" >> "\$SESSION_LOG"
echo "\$STUB_LOCK"
cat >/dev/null
`,
);

/** @param {string} lock */
function runWithLock(lock) {
  return spawnSync('bash', [script, '--db-only'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${stubs}:${process.env.PATH}`,
      SP_E2E_LOG: '',
      STUB_LOCK: lock,
      SESSION_LOG: sessionLog,
    },
    timeout: 30_000,
  });
}

const held = runWithLock('f');
assert.equal(held.status, 1, `a held lock should refuse, got ${String(held.status)}`);
assert.match(held.stderr, /Another run already holds the lock/, 'message names the cause');
assert.match(held.stderr, /another scripts\/e2e-local\.sh run/, 'message names the likely holder');
assert.match(held.stderr, /e2e-local\[4242\] \(backend pid 99\)/, 'message names the holder');
assert.match(readFileSync(sessionLog, 'utf8'), /pg_try_advisory_lock\(349\)/, 'asks for the key');

const dead = runWithLock('dead');
assert.equal(dead.status, 1, `an unanswered lock should refuse, got ${String(dead.status)}`);
assert.match(dead.stderr, /refusing to run unguarded/, 'silence is a refusal, not a pass');

const granted = runWithLock('t');
assert.equal(granted.status, 0, `a granted lock should proceed, got ${String(granted.status)}`);
assert.match(granted.stdout, /run lock held/, 'says the lock is held');
assert.match(readFileSync(sessionLog, 'utf8'), /session-end/, 'the lock session ends with the run');

console.log('e2e-local.test: OK');
