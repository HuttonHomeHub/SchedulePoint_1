// @ts-check
/**
 * The boot refusal's baseline constant (ADR-0215, `apps/api/backup/schedulepoint-backup.sh`).
 *
 * `preflight` refuses a database by whether the 1.1 baseline is among its applied migrations, and it
 * names the baseline as a constant rather than reading the migrations folder it guards against. This
 * test is what keeps the constant honest: it must be the oldest directory under
 * `apps/api/prisma/migrations/`, and no directory may sort before it, which is the convention the
 * "older than the baseline" test depends on (Prisma orders migrations by name, bytewise).
 * A second squash renames the baseline, and this fails until the constant follows.
 *
 * Run standalone: `node scripts/check-baseline-name.test.mjs`
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = readFileSync(join(root, 'apps/api/backup/schedulepoint-backup.sh'), 'utf8');
const declared = /^BASELINE_MIGRATION="([^"]+)"$/m.exec(script)?.[1];
assert.ok(declared, 'schedulepoint-backup.sh declares BASELINE_MIGRATION');

const migrations = readdirSync(join(root, 'apps/api/prisma/migrations'), { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

assert.equal(migrations[0], declared, 'the constant is the oldest migration directory');
assert.equal(
  migrations.filter((m) => m < declared).length,
  0,
  'no migration directory sorts before the baseline',
);

console.log('check-baseline-name.test: OK');
