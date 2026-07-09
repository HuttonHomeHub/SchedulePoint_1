# syntax=docker/dockerfile:1
# -----------------------------------------------------------------------------
# Multi-stage build for the Blank App API (@repo/api).
# Built from the repository root so pnpm workspace packages resolve:
#   docker build -f apps/api/Dockerfile -t app-api .
# -----------------------------------------------------------------------------

# --- Base: pinned Node + pnpm via corepack -----------------------------------
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# --- Dependencies: install with a cached pnpm store --------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/config/package.json packages/config/
COPY packages/types/package.json packages/types/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @repo/api...

# --- Build: compile the API and generate the Prisma client -------------------
FROM deps AS build
COPY . .
RUN pnpm --filter @repo/api prisma:generate \
    && pnpm --filter @repo/api build \
    && pnpm --filter @repo/api --prod --legacy deploy /out

# --- Runtime: minimal, non-root ----------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Run as the built-in unprivileged `node` user.
USER node
COPY --chown=node:node --from=build /out/dist ./dist
COPY --chown=node:node --from=build /out/node_modules ./node_modules
COPY --chown=node:node --from=build /out/package.json ./package.json
EXPOSE 3000
# Health is served under the global /api prefix + URI versioning (/api/v1/health).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
