#!/usr/bin/env node
/**
 * Prove `apps/web/nginx.conf` still parses once its variables are substituted.
 *
 * **Written after the template shipped a value nginx could not parse, and the web container refused
 * to start at all.** `Reporting-Endpoints`' own grammar puts the URL in double quotes
 * (`csp="/api/v1/csp-report"`), so the substituted value *contains* them — and the directive wrapped
 * it in double quotes too. nginx ended the string at the value's first `"` and read the URL as a
 * bare token: `[emerg] unexpected "/"`. Not a subtle failure; the container never served a request.
 *
 * **What makes it worth a gate is which checks could not see it.** `apps/web/e2e-csp` reads the
 * policy out of `docker-compose.yml` rather than restating it — deliberately, so the test cannot
 * drift from the deployment — but it serves that policy from a preview server. It exercises the
 * POLICY and never nginx's parse of this file. Lint, typecheck and 4,547 unit tests do not read
 * `.conf` at all. The only thing in the repository that runs nginx is CI's smoke-boot job, which is
 * a container build away from a developer's keyboard and reports minutes later, so the feedback
 * arrives after the push rather than before it. This closes that gap without needing Docker.
 *
 * **Deliberately not a full nginx parser.** It substitutes exactly what the container substitutes —
 * `NGINX_ENVSUBST_FILTER="^CSP_"`, so `CSP_`-prefixed names only, with the defaults taken from
 * `docker-compose.yml` rather than invented here — and then checks the one property that broke: a
 * quoted directive value must not contain its own delimiter. `nginx -t` in the smoke-boot job stays
 * the authority on everything else; this is the fast half that catches the class that has actually
 * bitten.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const TEMPLATE = 'apps/web/nginx.conf';

/**
 * Every compose file that supplies these defaults — **including the release one, which is the file
 * that actually deploys.** One template, two sets of defaults: checking only the development file
 * would leave the deployed path ungated, which is the wrong half to protect.
 */
const COMPOSE_FILES = ['docker-compose.yml', 'docker-compose.release.yml'];

/**
 * The `CSP_*` defaults the deployment actually uses.
 *
 * Parsed out of `docker-compose.yml` rather than duplicated, for the reason `e2e-csp` gives for
 * doing the same: a second copy of a policy is a copy that drifts, and the drift is invisible until
 * a container will not boot.
 */
function composeDefaults(compose) {
  const defaults = new Map();
  for (const line of read(compose).split('\n')) {
    // `CSP_NAME: ${CSP_NAME:-the default}` — the default is what ships when an operator sets nothing.
    const match = /^\s*(CSP_[A-Z_]+):\s*\$\{[A-Z_]+:-(.*)\}\s*$/.exec(line);
    if (match) defaults.set(match[1], match[2]);
  }
  return defaults;
}

/** Substitute exactly what the container's envsubst filter substitutes, and nothing else. */
function substitute(template, values, compose) {
  return template.replace(/\$\{(CSP_[A-Z_]+)\}/g, (whole, name) => {
    const value = values.get(name);
    if (value === undefined) {
      problems.push(
        `${TEMPLATE} references \${${name}}, and ${compose} gives it no default.\n` +
          `    An unset variable is substituted with an EMPTY STRING, not left alone — so this does ` +
          `not fail loudly, it silently emits a header with no value.`,
      );
      return '';
    }
    return value;
  });
}

const problems = [];
const template = read(TEMPLATE);

for (const compose of COMPOSE_FILES) {
  const rendered = substitute(template, composeDefaults(compose), compose);
  check(rendered, compose);
}

/**
 * The property that broke: a quoted value must not contain its own delimiter.
 *
 * Checked per `add_header`, which is where every substituted value in this file lands.
 */
function check(rendered, compose) {
  for (const [, name, quote, value] of rendered.matchAll(
    /add_header\s+(\S+)\s+(["'])(.*?)\2\s*(?:always)?\s*;/g,
  )) {
    // Both quote characters present: no choice of delimiter works, so the swap advice below would
    // send the reader round a loop. Say the harder thing instead.
    if (value.includes('"') && value.includes("'")) {
      problems.push(
        `${TEMPLATE} with ${compose} — add_header ${name}: the value contains both quote\n` +
          `    characters, so no choice of delimiter works. It needs escaping or restructuring.`,
      );
    } else if (value.includes(quote)) {
      problems.push(
        `${TEMPLATE} with ${compose} — add_header ${name}: wrapped in ${quote} and contains ${quote}.\n` +
          `    nginx ends the string at that character and reads the rest as bare tokens, which is a\n` +
          `    boot failure (\`[emerg] unexpected …\`), not a bad header. Wrap it in the other quote.\n` +
          `    Value: ${value}`,
      );
    }
  }
}

if (problems.length > 0) {
  console.error('The nginx template does not survive substitution:\n');
  for (const p of problems) console.error(`  - ${p}\n`);
  console.error(
    'This is a container-will-not-start failure. CI’s smoke-boot job catches it too, minutes later.',
  );
  process.exit(1);
}

console.log(
  `nginx template OK (${TEMPLATE} substitutes cleanly with ${COMPOSE_FILES.join(' and ')}).`,
);
