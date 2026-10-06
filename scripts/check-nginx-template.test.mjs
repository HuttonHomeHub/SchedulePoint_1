// @ts-check
/**
 * Fixtures for `check-nginx-template.mjs`'s security-header rule (TECH_DEBT #457) — **each case
 * names the edit that makes it red**, which is ADR-0110's standard for a gate: it is finished when
 * the defect it was written for has made it fail.
 *
 * The defect: `location /assets/`, `= /theme-boot.js` and `= /favicon.svg` each set `Cache-Control`
 * with `add_header`, and an `add_header` in a location replaces every header inherited from
 * `server`, so those responses carried no nosniff, no CORP and no CSP. The "pre-fix shape" below is
 * the real config with the three includes removed, which is exactly what it was before.
 *
 * The suite drives `runCheck(root)`, which the CLI calls, over a throwaway copy of the four files it
 * reads — not a private mirror of the rules.
 *
 * Run standalone: `node scripts/check-nginx-template.test.mjs`
 */

import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { runCheck } from './check-nginx-template.mjs';

const REPO_ROOT = join(import.meta.dirname, '..');
const FILES = [
  'apps/web/nginx.conf',
  'apps/web/nginx-security-headers.conf',
  'apps/web/Dockerfile',
  'docker-compose.yml',
  'docker-compose.release.yml',
];

/** A throwaway copy of the files the gate reads, with `edit` applied to one of them. */
function tree(edit) {
  const root = mkdtempSync(join(tmpdir(), 'check-nginx-'));
  for (const file of FILES) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    cpSync(join(REPO_ROOT, file), join(root, file));
  }
  if (edit) {
    const target = join(root, edit.file);
    writeFileSync(target, edit.apply(readFileSync(target, 'utf8')));
  }
  return root;
}

function problemsFor(edit) {
  const root = tree(edit);
  try {
    return runCheck(root).problems;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const conf = 'apps/web/nginx.conf';

// The real tree passes. Without this, every red case below could be red for an unrelated reason.
assert.deepEqual(problemsFor(undefined), [], 'the shipped config is clean');

// Red when: the three subresource locations lose their include (the pre-fix shape; the server-level
// include is kept so only the #457 rule can be what fails).
{
  let seen = 0;
  const problems = problemsFor({
    file: conf,
    apply: (text) =>
      text.replace(
        /(location [^{]+\{[^}]*?)\n\s*include [^\n]*security-headers\.conf;/g,
        (m, pre) => {
          seen += 1;
          return pre;
        },
      ),
  });
  assert.equal(seen, 3, 'the fixture removed the three location includes');
  for (const name of ['/assets/', '= /theme-boot.js', '= /favicon.svg']) {
    assert.ok(
      problems.some((p) => p.includes(`location ${name}`) && p.includes('security header')),
      `pre-fix shape: ${name} is reported`,
    );
  }
  assert.equal(problems.length, 3, 'and nothing else is');
}

// Red when: only /assets/ loses it — the rule is per location, not "somewhere in the file".
{
  const problems = problemsFor({
    file: conf,
    apply: (text) =>
      text.replace(
        /(location \/assets\/ \{[^}]*?)\n\s*include [^\n]*security-headers\.conf;/,
        '$1',
      ),
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /location \/assets\//);
}

// Red when: a NEW location sets its own add_header and does not include the set.
{
  const problems = problemsFor({
    file: conf,
    apply: (text) =>
      text.replace(
        'location /api/ {',
        'location /downloads/ {\n    add_header Cache-Control "no-store" always;\n  }\n\n  location /api/ {',
      ),
  });
  assert.ok(problems.some((p) => p.includes('location /downloads/') && p.includes('add_header')));
}

// Red when: the server level loses the include, so `/`, `/api/` and error pages carry nothing.
{
  const problems = problemsFor({
    file: conf,
    apply: (text) => text.replace(/\n  include [^\n]*security-headers\.conf;\n/, '\n'),
  });
  assert.ok(problems.some((p) => p.includes('server level')));
}

// Red when: the snippet itself drops the header that matters most for a script.
{
  const problems = problemsFor({
    file: 'apps/web/nginx-security-headers.conf',
    apply: (text) => text.replace(/^add_header X-Content-Type-Options.*\n/m, ''),
  });
  assert.ok(problems.some((p) => p.includes('X-Content-Type-Options')));
}

// Red when: a named subresource location is deleted outright (passing by absence).
{
  const problems = problemsFor({
    file: conf,
    apply: (text) => text.replace(/location = \/favicon\.svg \{[^}]*\}/, ''),
  });
  assert.ok(problems.some((p) => p.includes('no `location = /favicon.svg`')));
}

console.log('check-nginx-template.test.mjs: ok');
