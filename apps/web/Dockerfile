# syntax=docker/dockerfile:1
# -----------------------------------------------------------------------------
# Multi-stage build for the Blank App web client (@repo/web).
# Produces a static bundle served by nginx. Build from the repository root:
#   docker build -f apps/web/Dockerfile -t app-web .
# -----------------------------------------------------------------------------

# --- Base --------------------------------------------------------------------
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# --- Dependencies ------------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
COPY packages/interchange/package.json packages/interchange/
COPY packages/layout/package.json packages/layout/
# @repo/seed is a devDependency used by ONE hand-run bench script, not by `src`. It is here
# because `apps/web/tsconfig.json` deliberately includes `scripts/` so the benchmark cannot
# drift from the painter it measures — which makes it part of the `tsc --noEmit` the build
# runs, whether or not a byte of it reaches the bundle. Omitting it fails the image build with
# implicit-`any` errors in a file no local gate can flag, because a local checkout has it.
COPY packages/seed/package.json packages/seed/
# …and @repo/seed's own dependency, because the COPY obligation is transitive too. Without this
# manifest `pnpm install --filter @repo/web...` never installs @repo/engine-conformance's
# dependencies, and its build fails with `Set<unknown>` type errors from the types it is missing —
# beside a `node_modules missing` warning that is the only honest clue. A closure that is built has
# to be a closure that is installed.
COPY packages/engine-conformance/package.json packages/engine-conformance/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @repo/web...

# --- Build -------------------------------------------------------------------
FROM deps AS build
COPY . .
# VITE_* build args are baked into the static bundle at build time.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
# Build the shared workspace packages first so the production Vite build resolves
# their compiled output (the `development` export condition only applies to the dev
# server). @repo/web consumes @repo/types, @repo/interchange (its Zod schemas) and
# @repo/layout (the shared lane packer behind Auto-arrange, ADR-0069). Every package
# it imports has to be listed here: a local checkout keeps a `dist/` from an earlier
# build, so an omission is invisible outside this stage.
#
# **And the list is TRANSITIVE, not one level deep.** @repo/seed is here because the web
# tsconfig covers its bench script, and @repo/engine-conformance is here because
# @repo/seed imports it — building a package obliges you to its whole `dependencies`
# closure, not just to the package itself. That line was missing for one commit and the
# omission was invisible exactly as this comment predicts: `pnpm prepush` passed against
# a checkout whose `packages/engine-conformance/dist` was left over from an earlier
# build, and only a clean image build could see it. `pnpm check:build-contract` now
# walks the closure, so the next transitive edge fails locally instead of here.
RUN pnpm --filter @repo/types build \
    && pnpm --filter @repo/interchange build \
    && pnpm --filter @repo/layout build \
    && pnpm --filter @repo/engine-conformance build \
    && pnpm --filter @repo/seed build \
    && pnpm --filter @repo/web build

# --- Runtime: static files served by nginx -----------------------------------
FROM nginx:1.31-alpine AS runtime
# A TEMPLATE, not a final config: the nginx image's own
# /docker-entrypoint.d/20-envsubst-on-templates.sh renders it at container start. That is what
# makes the CSP mode an operator variable rather than a code edit — flipping report-only to
# enforce, or rolling back, is an env change instead of a release (ADR-0074 §4).
COPY apps/web/nginx.conf /etc/nginx/templates/default.conf.template

# **Essential, not tidy.** Unrestricted, envsubst would replace nginx's OWN variables — $scheme,
# $host, $remote_addr, $proxy_add_x_forwarded_for, $uri — with empty strings, silently producing a
# config that forwards no Host and no client IP and whose SPA fallback stops resolving. The filter
# limits substitution to CSP_-prefixed names.
ENV NGINX_ENVSUBST_FILTER="^CSP_"

# Report-only by default: a deployment observes before it enforces. Enforcing is a deliberate,
# separately-approved step (ADR-0074 M5) — set CSP_HEADER_NAME=Content-Security-Policy.
#
# **These defaults must state the SAME policy the compose files state, and for a while they did
# not.** The reporting directives and `CSP_REPORTING_ENDPOINTS` were added to
# `docker-compose{,.release}.yml` with the staff-console CSP sink and not here, so an operator whose
# own compose file omits the web `environment:` block — a perfectly ordinary thing to do, since the
# image carries defaults — got a policy with **no reporting at all**. The container starts, every
# page loads, and the staff console's Security panel stays permanently empty, which reads as "the
# policy is clean" and is the exact wrong conclusion. Found by reading a real operator's compose
# file; `pnpm check:nginx` now asserts the three sources agree, so this cannot drift again.
ENV CSP_HEADER_NAME="Content-Security-Policy-Report-Only"
ENV CSP_POLICY="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests; report-uri /api/v1/csp-report; report-to csp"
# Names the group `report-to` refers to. SINGLE-quoted in nginx.conf because this value carries
# double quotes of its own — see that file, and `check:nginx`, for what happens otherwise.
ENV CSP_REPORTING_ENDPOINTS="csp=\"/api/v1/csp-report\""

COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
