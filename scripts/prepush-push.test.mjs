// @ts-check
/**
 * Tests for `prepush.sh --push` (`docs/TECH_DEBT.md` #280): the gate and the push in one process.
 *
 * Each case builds a throwaway repository with a local bare remote and a stub `package.json`
 * (no-op `lint`/`typecheck`/`test`, plus whichever `check:*` gates the case needs), copies the real
 * `prepush.sh` into it, and asserts on the remote's ref — the one thing the incident got wrong.
 * `scripts/prepush.sh` cd's to its own parent directory, so the copy gates the stub, not this repo.
 *
 * **Verified red** by making the push unconditional (dropping the `failed` test before `exec git
 * push`): the FAIL, replay, HEAD-moved cases then advance the remote and fail. Dropping the
 * dirty-tree, `--dry-run` and `--checks` refusals fails their cases the same way.
 *
 * Run standalone: `node scripts/prepush-push.test.mjs`
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'prepush.sh');
const NOOP = 'node -e 0';

/** @param {string} cwd @param {string[]} args */
function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

/**
 * @param {Record<string, string>} gates extra `check:*` scripts
 * @returns {{ work: string, remote: string, root: string }}
 */
function fixture(gates) {
  const root = mkdtempSync(join(tmpdir(), 'prepush-push-'));
  const remote = join(root, 'remote.git');
  const work = join(root, 'work');
  git(root, ['init', '-q', '--bare', '-b', 'main', remote]);
  git(root, ['clone', '-q', remote, work]);
  git(work, ['config', 'user.email', 't@example.test']);
  git(work, ['config', 'user.name', 'T']);
  mkdirSync(join(work, 'scripts'));
  copyFileSync(SCRIPT, join(work, 'scripts/prepush.sh'));
  const scripts = {
    lint: NOOP,
    typecheck: NOOP,
    test: NOOP,
    'prepush:push': 'bash scripts/prepush.sh --push',
    ...gates,
  };
  writeFileSync(
    join(work, 'package.json'),
    JSON.stringify({ name: 'stub', private: true, scripts }),
  );
  git(work, ['add', '-A']);
  git(work, ['commit', '-q', '-m', 'base']);
  git(work, ['push', '-q', 'origin', 'HEAD:main']);
  // One commit that exists only locally, so a push visibly advances the remote.
  git(work, ['commit', '-q', '--allow-empty', '-m', 'to push']);
  return { work, remote, root };
}

/** @param {string} remote */
const remoteMain = (remote) => git(remote, ['rev-parse', 'main']);

/** @param {string} cwd @param {string[]} args */
function sh(cwd, args) {
  const r = spawnSync(args[0] ?? '', args.slice(1), { cwd, encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

const cases = [];
/** @param {string} name @param {() => void} fn */
const it = (name, fn) => cases.push([name, fn]);

/** @param {Record<string, string>} gates @param {(f: ReturnType<typeof fixture>) => void} body */
function withFixture(gates, body) {
  const f = fixture(gates);
  try {
    body(f);
  } finally {
    rmSync(f.root, { recursive: true, force: true });
  }
}

it('pushes through pnpm when every gate is green', () =>
  withFixture({ 'check:pass': NOOP }, (f) => {
    const before = remoteMain(f.remote);
    const r = sh(f.work, ['pnpm', 'prepush:push', 'origin', 'HEAD:main']);
    assert.equal(r.status, 0, r.out);
    assert.notEqual(remoteMain(f.remote), before);
    assert.equal(remoteMain(f.remote), git(f.work, ['rev-parse', 'HEAD']));
  }));

it('does not push and says NOT PUSHED when a gate fails', () =>
  withFixture({ 'check:fail': 'node -e process.exit(1)' }, (f) => {
    const before = remoteMain(f.remote);
    const r = sh(f.work, ['bash', 'scripts/prepush.sh', '--push', 'origin', 'HEAD:main']);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /FAILED: check:fail/);
    assert.match(r.out, /NOT PUSHED/);
    assert.equal(remoteMain(f.remote), before);
  }));

it('the #280 replay: a red gate piped through tail still does not push', () =>
  withFixture({ 'check:fail': 'node -e process.exit(1)' }, (f) => {
    const before = remoteMain(f.remote);
    const r = sh(f.work, [
      'bash',
      '-c',
      'bash scripts/prepush.sh --push origin HEAD:main 2>&1 | tail -5 && echo CHAIN-CONTINUED',
    ]);
    assert.match(r.out, /CHAIN-CONTINUED/, 'the pipe must still hide the exit status, as it did');
    assert.equal(remoteMain(f.remote), before);
  }));

it('an advisory WARN still pushes', () =>
  withFixture({ 'check:reconcile-due': 'node -e process.exit(2)' }, (f) => {
    const r = sh(f.work, ['bash', 'scripts/prepush.sh', '--push', 'origin', 'HEAD:main']);
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /WARN/);
    assert.equal(remoteMain(f.remote), git(f.work, ['rev-parse', 'HEAD']));
  }));

it('refuses a dirty tree before running any gate', () =>
  withFixture({ 'check:pass': NOOP }, (f) => {
    const before = remoteMain(f.remote);
    writeFileSync(join(f.work, 'untracked.txt'), 'x');
    const r = sh(f.work, ['bash', 'scripts/prepush.sh', '--push', 'origin', 'HEAD:main']);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /working tree is dirty/);
    assert.doesNotMatch(r.out, /Pre-push gate/, 'no gate may have started');
    assert.equal(remoteMain(f.remote), before);
  }));

it('refuses, before any gate, a push that --dry-run rejects', () =>
  withFixture({ 'check:pass': NOOP }, (f) => {
    const r = sh(f.work, ['bash', 'scripts/prepush.sh', '--push', 'no-such-remote', 'main']);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /--dry-run/);
    assert.doesNotMatch(r.out, /Pre-push gate/);
  }));

it('refuses when HEAD moves during the run', () =>
  withFixture({ 'check:move': 'git commit -q --allow-empty -m moved' }, (f) => {
    const before = remoteMain(f.remote);
    const r = sh(f.work, ['bash', 'scripts/prepush.sh', '--push', 'origin', 'HEAD:main']);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /NOT PUSHED: HEAD moved/);
    assert.equal(remoteMain(f.remote), before);
  }));

it('refuses --checks together with --push', () =>
  withFixture({ 'check:pass': NOOP }, (f) => {
    const before = remoteMain(f.remote);
    const r = sh(f.work, [
      'bash',
      'scripts/prepush.sh',
      '--checks',
      '--push',
      'origin',
      'HEAD:main',
    ]);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /Refusing/);
    assert.equal(remoteMain(f.remote), before);
  }));

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
  } catch (e) {
    failed++;
    console.error(`FAIL  ${name}\n${e instanceof Error ? e.message : e}`);
  }
}
if (failed > 0) process.exit(1);
console.log(`prepush-push: ${cases.length} cases ok`);
