import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

/**
 * **The screen's, never the person's** — asserted over the model, not promised in a comment
 * (browser crash reports M1-T1 step 3; spec §4.4 "Must NOT hold").
 *
 * A crash row says which screen broke, on which release, in which browser family. The moment a
 * column can name a person, an organisation, an address, a document or a log line that does, the row
 * stops being telemetry and becomes personal data under ADR-0085, with an erasure obligation the
 * table was designed not to have. So a column added here fails the build and needs a privacy
 * argument, not just a migration: editing {@link EXPECTED_FIELDS} IS that argument.
 *
 * Read from the generated DMMF rather than from `schema.prisma` as text, so a field renamed with
 * `@map` or declared across two lines cannot slip past a regex.
 */
const EXPECTED_FIELDS = [
  'id',
  'dedupeHash',
  'boundary',
  'errorName',
  'message',
  'routePattern',
  'webVersion',
  'browser',
  'browserMajor',
  'stack',
  'componentStack',
  'count',
  'firstSeenAt',
  'lastSeenAt',
] as const;

/** Stems that would make a row attributable, however they are spelled or cased. */
const FORBIDDEN = [
  /user/i,
  /org/i,
  /plan/i,
  /project/i,
  /client/i,
  /activity/i,
  /member/i,
  /email/i,
  /^ip/i,
  /address/i,
  /agent/i,
  /url/i,
  /uri/i,
  /path/i,
  /query/i,
  /correlation/i,
  /request/i,
  /session/i,
];

const model = Prisma.dmmf.datamodel.models.find((m) => m.name === 'CrashReport');
const fields = (model?.fields ?? []).map((f) => f.name);

describe('the crash_reports model holds no person', () => {
  it('exists in the generated client', () => {
    expect(model, 'run `prisma generate`').toBeDefined();
  });

  it('has exactly the reviewed field list — a new column is a privacy decision', () => {
    expect([...fields].sort()).toEqual([...EXPECTED_FIELDS].sort());
  });

  it('has no field that could identify a user, organisation, address, document or log line', () => {
    const offenders = fields.filter((name) => FORBIDDEN.some((pattern) => pattern.test(name)));
    expect(offenders).toEqual([]);
  });

  it('has no *Id other than its own primary key, and no relation at all', () => {
    expect(fields.filter((name) => /Id$/.test(name) && name !== 'id')).toEqual([]);
    expect((model?.fields ?? []).filter((f) => f.kind === 'object')).toEqual([]);
  });
});

describe('the crash-report sink is authenticated and throttled', () => {
  const controller = readFileSync(join(__dirname, 'crash-reports.controller.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

  it('is not @Public()', () => {
    expect(controller).not.toMatch(/@Public\(/);
  });

  it('carries the 10-a-minute bound on its one handler', () => {
    expect(controller.match(/@Post\(/g)).toHaveLength(1);
    expect(controller.match(/@Throttle\(/g)).toHaveLength(1);
    expect(controller).toContain('@Throttle({ default: { limit: 10, ttl: 60_000 } })');
  });
});
