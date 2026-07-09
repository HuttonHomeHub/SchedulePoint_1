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
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @repo/web...

# --- Build -------------------------------------------------------------------
FROM deps AS build
COPY . .
# VITE_* build args are baked into the static bundle at build time.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @repo/web build

# --- Runtime: static files served by nginx -----------------------------------
FROM nginx:1.31-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
