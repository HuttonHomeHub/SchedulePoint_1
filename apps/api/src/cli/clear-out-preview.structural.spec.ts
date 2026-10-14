import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **The gates on the clear-out preview** — an operator command that reads every organisation and
 * sits one import away from the code that permanently deletes.
 *
 * It must be incapable of deleting, and incapable of *starting* the thing that does. Three pins:
 *
 * 1. **It cannot boot the application.** Constructing the expiry service with the switch on starts
 *    a second sweep in the preview's own process, outside the per-process overlap guard. So no
 *    Nest, no `AppModule`, no service, no runner.
 * 2. **It writes nothing.** No write accessor, no transaction, no raw statement other than the
 *    session's own read-only switch.
 * 3. **It does not log.** It prints customer names; the application logger is a rotated file on the
 *    host.
 *
 * Comments are stripped before scanning, so this file's prose can name what it forbids.
 */
const DIR = join(__dirname);
const SELECTOR = join(DIR, '..', 'common', 'hierarchy', 'hierarchy-expiry.candidates.ts');
const CLAIM = join(DIR, '..', 'common', 'hierarchy', 'hierarchy-expiry.claim.ts');
const PREVIEW = join(DIR, 'clear-out-preview.ts');

function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const WRITES = [
  /\.deleteMany\b/,
  /\.updateMany\b/,
  /\.updateManyAndReturn\b/,
  /\.createMany\b/,
  /\.create\(/,
  /\.update\(/,
  /\.upsert\(/,
  /\.delete\(/,
  /\$transaction/,
];

describe('the clear-out preview cannot change anything or start the application', () => {
  it('imports nothing that boots the application or deletes', () => {
    const imports = [...code(PREVIEW).matchAll(/from '([^']+)'/g)].map((m) => m[1] as string);
    const offenders = imports.filter(
      (spec) =>
        spec.startsWith('@nestjs/') ||
        spec.includes('nestjs-pino') ||
        /app\.module|hierarchy-expiry\.(service|runner|claim)|prisma\.service|audit/.test(spec),
    );
    expect(offenders, 'the preview may import the pure selector and plain helpers only').toEqual(
      [],
    );
    const source = code(PREVIEW);
    for (const name of [
      'AppModule',
      'HierarchyExpiryService',
      'deleteExpiredScope',
      'NestFactory',
    ]) {
      expect(source, name).not.toContain(name);
    }
  });

  it('contains no write accessor, no transaction and no raw statement but its read-only switch', () => {
    const source = code(PREVIEW);
    for (const pattern of WRITES) expect(source, String(pattern)).not.toMatch(pattern);
    const raw = [...source.matchAll(/\$(?:execute|query)Raw[^`]*`([^`]*)`/g)]
      .map((m) => (m[1] as string).trim())
      .sort();
    expect(raw).toEqual([
      'SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY',
      'SHOW transaction_read_only',
    ]);
    expect(source).not.toMatch(/\$(?:execute|query)RawUnsafe/);
  });

  it('never uses the application logger', () => {
    expect(code(PREVIEW)).not.toMatch(/pino|PinoLogger|InjectPinoLogger|\bLogger\b|console\./);
  });

  it('makes its session read-only before its first query', () => {
    const source = code(PREVIEW);
    expect(source.indexOf('SET SESSION CHARACTERISTICS')).toBeGreaterThan(-1);
    expect(source.indexOf('SET SESSION CHARACTERISTICS')).toBeLessThan(
      source.indexOf('SHOW transaction_read_only'),
    );
    // One connection, or the setting could be on a connection the next query does not use.
    expect(source).toContain("'connection_limit', '1'");
  });
});

describe('the shared selector only reads', () => {
  it('has no write accessor, transaction or raw statement', () => {
    const source = code(SELECTOR);
    for (const pattern of WRITES) expect(source, String(pattern)).not.toMatch(pattern);
    expect(source).not.toMatch(/\$(?:execute|query)Raw/);
  });
});

describe('the claim writes back only what it matched on', () => {
  it('is an updateMany and nothing else that writes', () => {
    const source = code(CLAIM);
    expect(source).toMatch(/\.updateMany\(/);
    for (const pattern of WRITES.filter((p) => !p.source.startsWith('\\.updateMany'))) {
      expect(source, String(pattern)).not.toMatch(pattern);
    }
    // The data it writes is the batch id it matched on, so the row is locked and unchanged.
    expect(source).toContain('const data = { deleteBatchId: root.deleteBatchId }');
  });
});
