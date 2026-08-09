import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `apps/web/nginx.conf` is an **envsubst template** (ADR-0074 M1), and this pins the one failure it
 * can have that nothing else would notice.
 *
 * The nginx image's `/docker-entrypoint.d/20-envsubst-on-templates.sh` builds an explicit
 * `${NAME}` allow-list from the environment, filtered by `NGINX_ENVSUBST_FILTER`, and passes only
 * those to `envsubst`. Without that filter — or with a wrong one — envsubst substitutes **nginx's
 * own variables** too: `$host`, `$scheme`, `$remote_addr`, `$proxy_add_x_forwarded_for`, `$uri` all
 * become empty strings.
 *
 * **The resulting container still starts and still serves the SPA.** It forwards no Host and no
 * client IP to the API, and its SPA fallback stops resolving — a comprehensively wrong config that
 * a health check passes straight through. The CI smoke-boot asserts the same properties against a
 * really-rendered config; this runs in the unit suite, so the feedback arrives while the file is
 * being edited rather than after an image build.
 */
const template = readFileSync(resolve(process.cwd(), 'nginx.conf'), 'utf8');

/** Mirrors the entrypoint: substitute ONLY names matching `NGINX_ENVSUBST_FILTER`. */
function render(env: Record<string, string>, filter = /^CSP_/): string {
  return Object.entries(env)
    .filter(([name]) => filter.test(name))
    .reduce((out, [name, value]) => out.replaceAll(`\${${name}}`, value), template);
}

const ENV = {
  CSP_HEADER_NAME: 'Content-Security-Policy-Report-Only',
  CSP_POLICY:
    "default-src 'self'; img-src 'self' blob:; report-uri /api/v1/csp-report; report-to csp",
  // Added with the M4 report sink. Its `CSP_` prefix is load-bearing — `NGINX_ENVSUBST_FILTER` is
  // `^CSP_`, and a variable named anything else would survive substitution as a literal `${…}` and
  // fail nginx's config parse at boot. This suite caught exactly that the moment the header landed
  // without the variable being declared here, which is the coupling working rather than friction.
  CSP_REPORTING_ENDPOINTS: 'csp="/api/v1/csp-report"',
};

/** The `add_header` lines only — comments explain the policy and would confuse a naive match. */
function headerDirectives(rendered: string): string[] {
  return rendered
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('add_header'));
}

describe('nginx.conf as an envsubst template', () => {
  it('substitutes both CSP variables and leaves no placeholder behind', () => {
    const rendered = render(ENV);

    expect(rendered).toContain('add_header Content-Security-Policy-Report-Only');
    expect(rendered).toContain("img-src 'self' blob:");
    // A surviving `${…}` would reach nginx as a literal and fail the config parse at boot.
    expect(rendered).not.toContain('${');
  });

  it('reports violations to the same-origin sink, by both mechanisms', () => {
    // Both directives, because support differs by engine and neither is universal: `report-uri` is
    // deprecated and still the only thing several engines implement, `report-to` is current and
    // needs the `Reporting-Endpoints` header to name its group. A browser that understands
    // `report-to` ignores `report-uri`, so emitting both costs nothing.
    const rendered = render(ENV);

    expect(rendered).toContain('report-uri /api/v1/csp-report');
    expect(rendered).toContain('report-to csp');
    expect(rendered).toContain('add_header Reporting-Endpoints "csp="/api/v1/csp-report""');
  });

  it.each([
    ['Host', 'proxy_set_header Host $host;'],
    ['client IP', 'proxy_set_header X-Real-IP $remote_addr;'],
    ['forwarded-for chain', 'proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;'],
    ['SPA fallback', 'try_files $uri $uri/ /index.html;'],
  ])('leaves nginx’s own $s variable intact', (_label, directive) => {
    // The filtered substitution must not touch these. Each one failing is silent in a health check.
    expect(render(ENV)).toContain(directive);
  });

  it('keeps the X-Forwarded-Proto map, and forwards the mapped value (TECH_DEBT #89)', () => {
    const rendered = render(ENV);

    // `$scheme` is unconditionally `http` in this block, so forwarding it directly overwrote a
    // correct value from the edge. The map preserves what arrived and falls back only when nothing
    // did — and the fallback arm is exactly what envsubst would eat.
    expect(rendered).toMatch(/map \$http_x_forwarded_proto \$sp_forwarded_proto/);
    expect(rendered).toMatch(/''\s+\$scheme;/);
    expect(rendered).toContain('proxy_set_header X-Forwarded-Proto $sp_forwarded_proto;');
  });

  it('never denies clipboard in Permissions-Policy', () => {
    // The trap this assertion exists for: a blanket `*=()` deny reads as good hygiene and silently
    // breaks the Copy buttons in ShareLinksDialog and InviteMemberDialog, which are the entire
    // point of their dialogs (ADR-0074 §4). Asserted against the DIRECTIVE, not the file — the
    // comment above it mentions clipboard deliberately, and a naive whole-file match would pass
    // while the header denied it.
    const permissions = headerDirectives(render(ENV)).find((line) =>
      line.includes('Permissions-Policy'),
    );

    expect(permissions).toBeDefined();
    expect(permissions).not.toContain('clipboard');
    expect(permissions).toContain('camera=()');
  });

  it('sets no HSTS at the web container, deliberately', () => {
    // Not an omission: this block listens only on plain 8080 and cannot know the browser's scheme
    // (TECH_DEBT #89), and HSTS is sticky. It belongs at the edge terminator.
    const hsts = headerDirectives(render(ENV)).find((line) =>
      line.includes('Strict-Transport-Security'),
    );

    expect(hsts).toBeUndefined();
  });

  it('marks every security header `always`, so error responses carry them too', () => {
    // A 404 rendered by the SPA fallback is a document like any other. Without `always`, nginx
    // omits `add_header` on non-2xx — so the policy would be absent on exactly the responses an
    // injection attempt is most likely to reach.
    for (const directive of headerDirectives(render(ENV))) {
      if (directive.includes('Cache-Control') && directive.includes('immutable')) continue;
      expect(directive.endsWith('always;'), directive).toBe(true);
    }
  });
});
