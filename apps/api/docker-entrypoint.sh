#!/bin/sh
# Runtime entrypoint for the API image: apply any pending database migrations,
# then start the server. `prisma migrate deploy` is idempotent (applies only
# unapplied migrations) and safe to run on every boot; it serialises via a
# Postgres advisory lock, so concurrent replicas won't double-apply.
set -e

echo "[entrypoint] applying database migrations..."
node_modules/.bin/prisma migrate deploy

echo "[entrypoint] starting API..."
exec node dist/main.js
