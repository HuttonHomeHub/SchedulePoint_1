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
 *
 * **A second property, added for TECH_DEBT #457:** an `add_header` in a location REPLACES every
 * header inherited from `server`, so `/assets/`, `/theme-boot.js` and `/favicon.svg` served their
 * `Cache-Control` and none of the security set for as long as the file existed — measured with
 * `curl -I` and invisible to every other gate, which only ever read `/`. The set now lives in one
 * snippet that the server and every location with its own `add_header` include, and this gate
 * fails a location that has one without the other. `check-nginx-template.test.mjs` makes it red
 * against the pre-fix shape (ADR-0110).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const TEMPLATE = 'apps/web/nginx.conf';

/** The shared security header set, included by `server` and by every location that sets a header. */
const SNIPPET = 'apps/web/nginx-security-headers.conf';
const INCLUDE = 'include /etc/nginx/conf.d/snippets/security-headers.conf;';

/**
 * The headers the snippet must define. `nosniff` and `Cross-Origin-Resource-Policy` are the two that
 * matter for a subresource; the rest ride along because one set that never varies by path is one
 * nobody can get wrong.
 */
const REQUIRED_HEADERS = [
  'X-Content-Type-Options',
  'X-Frame-Options',
  'Referrer-Policy',
  '${CSP_HEADER_NAME}',
  'Reporting-Endpoints',
  'Cross-Origin-Opener-Policy',
  'Cross-Origin-Resource-Policy',
  'Permissions-Policy',
];

/** Subresource locations, named so that deleting one cannot make the gate pass by absence. */
const SUBRESOURCE_LOCATIONS = ['/assets/', '= /theme-boot.js', '= /favicon.svg'];

/**
 * Every compose file that supplies these defaults — **including the release one, which is the file
 * that actually deploys.** One template, two sets of defaults: checking only the development file
 * would leave the deployed path ungated, which is the wrong half to protect.
 */
const COMPOSE_FILES = ['docker-compose.yml', 'docker-compose.release.yml'];

/**
 * The image's own `ENV` defaults — a **third** statement of the same policy, and the one that
 * applies when an operator's compose file omits the web `environment:` block entirely.
 *
 * That is not a hypothetical: a real deployment did exactly that, which is a perfectly reasonable
 * thing to do when the image carries defaults. The reporting directives had been added to both
 * compose files with the CSP sink and **not** here, so that deployment ran a policy with no
 * reporting at all — every page loading normally, the staff console's Security panel permanently
 * empty, and an operator reading that emptiness as "the policy is clean". A silent wrong answer on
 * the one screen built to give the right one.
 */
const DOCKERFILE = 'apps/web/Dockerfile';

/**
 * Run every check against the tree at `root` and return the problems found.
 *
 * Takes the root so the fixtures can hand it a throwaway tree holding the pre-fix shape.
 */
export function runCheck(root) {
  const read = (p) => readFileSync(join(root, p), 'utf8');
  const problems = [];

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
  function substitute(text, values, compose) {
    return text.replace(/\$\{(CSP_[A-Z_]+)\}/g, (whole, name) => {
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

  /** The same defaults as `ENV NAME="value"` lines in the image. */
  function dockerfileDefaults() {
    const defaults = new Map();
    for (const line of read(DOCKERFILE).split('\n')) {
      const match = /^ENV\s+(CSP_[A-Z_]+)="(.*)"\s*$/.exec(line);
      // `\"` in a Dockerfile ENV is a literal quote in the value.
      if (match) defaults.set(match[1], (match[2] ?? '').replace(/\\"/g, '"'));
    }
    return defaults;
  }

  /**
   * The property that broke: a quoted value must not contain its own delimiter.
   *
   * Checked per `add_header`, which is where every substituted value in this file lands.
   */
  function checkQuoting(rendered, compose) {
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

  /**
   * TECH_DEBT #457: a location with its own `add_header` must include the security set, because
   * nginx replaces — it does not merge — the headers inherited from `server`.
   *
   * Location bodies in this file hold no nested braces, so a flat match is a faithful reader; a
   * nested block would make the named locations unfindable and fail loudly rather than pass.
   */
  function checkSecurityHeaders(template, snippet) {
    const snippetHeaders = new Set([...snippet.matchAll(/add_header\s+(\S+)/g)].map((m) => m[1]));
    for (const name of REQUIRED_HEADERS) {
      if (!snippetHeaders.has(name)) {
        problems.push(`${SNIPPET} does not add the security header ${name}.`);
      }
    }
    // Whole-line comments are dropped first, so a commented-out `# include …;` does not count.
    const live = template.replace(/^\s*#.*$/gm, '');
    // The server level reads the same snippet, so `/`, `/api/` and error pages carry it too.
    const outsideLocations = live.replace(/location\s+[^{]+\{[^}]*\}/g, '');
    if (!outsideLocations.includes(INCLUDE)) {
      problems.push(`${TEMPLATE} does not include the security header snippet at server level.`);
    }
    const locations = new Map(
      [...live.matchAll(/location\s+([^{]+?)\s*\{([^}]*)\}/g)].map((m) => [m[1], m[2]]),
    );
    for (const name of SUBRESOURCE_LOCATIONS) {
      if (!locations.has(name)) {
        problems.push(
          `${TEMPLATE} has no \`location ${name}\`, and ${name} is gated by name here.`,
        );
      }
    }
    for (const [name, body] of locations) {
      const setsHeader = /\badd_header\b/.test(body);
      if ((setsHeader || SUBRESOURCE_LOCATIONS.includes(name)) && !body.includes(INCLUDE)) {
        problems.push(
          `${TEMPLATE} — \`location ${name}\` ${setsHeader ? 'sets its own add_header' : 'serves a subresource'} ` +
            `and does not include the security header set.\n` +
            `    nginx replaces the headers inherited from \`server\` when a location has any add_header, so\n` +
            `    this response would carry its own header and none of nosniff, CORP, CSP… (TECH_DEBT #457).\n` +
            `    Add \`${INCLUDE}\`.`,
        );
      }
    }
  }

  const template = read(TEMPLATE);
  const snippet = read(SNIPPET);

  const sources = [
    ...COMPOSE_FILES.map((file) => ({ file, values: composeDefaults(file) })),
    { file: DOCKERFILE, values: dockerfileDefaults() },
  ];

  for (const { file, values } of sources) {
    // The include is expanded as nginx would, so the snippet's own quoting is checked too.
    const expanded = template.replaceAll(INCLUDE, snippet);
    checkQuoting(substitute(expanded, values, file), file);
  }

  checkSecurityHeaders(template, snippet);

  /**
   * **All three sources must state the same policy.**
   *
   * Which one applies depends on how an operator wrote their compose file, and they cannot be
   * expected to know that — so a difference between them is not a preference, it is one deployment
   * silently getting a policy nobody chose. The failure is invisible: the container starts and every
   * page loads.
   */
  for (const name of new Set(sources.flatMap(({ values }) => [...values.keys()]))) {
    const seen = new Map();
    for (const { file, values } of sources) {
      const value = values.get(name);
      if (value === undefined) {
        problems.push(`${file} states no default for ${name}, and its siblings do.`);
        continue;
      }
      if (!seen.has(value)) seen.set(value, []);
      seen.get(value).push(file);
    }
    if (seen.size > 1) {
      problems.push(
        `${name} differs between the files that define it — an operator gets whichever one their\n` +
          `    compose file happens to select, with no error either way:\n` +
          [...seen]
            .map(([value, files]) => `      ${files.join(', ')}:\n        ${value}`)
            .join('\n'),
      );
    }
  }

  return { problems, sources };
}

function main() {
  const { problems, sources } = runCheck(join(import.meta.dirname, '..'));
  if (problems.length > 0) {
    console.error('The nginx template does not survive substitution:\n');
    for (const p of problems) console.error(`  - ${p}\n`);
    console.error(
      'A quoting problem is a container-will-not-start failure, which CI’s smoke-boot job also\n' +
        'catches, minutes later. A DISAGREEMENT between sources is worse: nothing fails anywhere,\n' +
        'and one deployment quietly runs a policy nobody chose. A location without the security\n' +
        'set serves its files with none of nosniff, CORP or the CSP, and nothing else notices.',
    );
    process.exit(1);
  }

  console.log(
    `nginx template OK (${TEMPLATE} substitutes cleanly, ${sources.length} sources agree: ${sources
      .map((s) => s.file)
      .join(', ')}, and every location with its own add_header carries the security set).`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
